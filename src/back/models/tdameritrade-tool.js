import { TDAMERITRADE_KEY, GOOGLE_REDIRECT, TDAMERITRADE_SECRET } from '../../../ver.js'
import { TD_AUTH_URL, TD_TOKEN_URL, TOTALDB, USSE_ORDER_INTERVAL, PRICE_INTERVAL, UPDATE_ORDER, USSE_MARKET_TIME, RANGE_INTERVAL, USSE_FEE, API_WAIT } from '../constants.js'
import Fetch from 'node-fetch'
import { stringify as QStringify } from 'querystring'
import { handleError, HoError } from '../util/utility.js'
import Mongo from '../models/mongo-tool.js'
import { getSuggestionData } from '../models/stock-tool.js'
import sendWs from '../util/sendWs.js'
import createLogger from '../util/logger.js'

const log = createLogger('tdameritrade')

let tokens = {};
let encryptedId = null;
let updateTime = {book: 0, trade: 0};
let available = {tradable: 0, cash: 0};
let order = [];
let position = [];
let fakeOrder = [];

export const generateAuthUrl = () => `${TD_AUTH_URL}redirect_uri=${GOOGLE_REDIRECT}&client_id=${TDAMERITRADE_KEY}`;

export const getToken = code => {
    if (code) {
        const codeM = code.match(/code\=([^&]*)/);
        if (codeM) {
            code = codeM[1];
        }
        log.debug({ code }, 'auth code received');
    }
    const qspost = code ? QStringify({
        grant_type: 'authorization_code',
        //refresh_token: '',
        //access_type: 'offline',
        code: decodeURIComponent(code),
        //client_id: TDAMERITRADE_KEY,
        redirect_uri: GOOGLE_REDIRECT,
    }) : (tokens && tokens.expiry_date < (Date.now() / 1000 + 590)) ? QStringify({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        //access_type: '',
        //code: '',
        //client_id: TDAMERITRADE_KEY,
        //redirect_uri: '',
    }) : null;
    const authHeader = Buffer.from(`${TDAMERITRADE_KEY}:${TDAMERITRADE_SECRET}`).toString('base64');
    return qspost ? Fetch(TD_TOKEN_URL, {
        method: 'POST',
        body: qspost,
        headers: {
            'Authorization' : `Basic ${authHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': qspost.length,
        },
    }).then(res => res.json()).then(token => {
        if (token.error) {
            return handleError(new HoError(token.error));
        }
        if (token['expires_in']) {
            token['expiry_date'] = Math.floor(Date.now() / 1000) + token['expires_in'];
        }
        if (code) {
            token['refresh_token_expiry_date'] = Math.floor(Date.now() / 1000) + 7 * 86400;
        } else {
            if (tokens && tokens.refresh_token_expiry_date < (Date.now() / 1000 + 259200)) {
                sendWs(`TD AMERITRADE: Please refresh token in 3 days`, 0, 0, true);
            }
        }
        log.debug({ token }, 'token response');
        return Mongo('find', 'accessToken', {api: 'tdameritrade'}).then(items => {
            if (items.length > 0) {
                return Mongo('update', 'accessToken', {api: 'tdameritrade'}, {$set: token}).then(() => {
                    log.debug('token updated in DB');
                    Object.assign(tokens, token);
                });
            } else {
                return Mongo('insert', 'accessToken', Object.assign({api: 'tdameritrade'}, token)).then(item => {
                    log.debug('token inserted in DB');
                    tokens = item[0];
                });
            }
        });
    }) : Promise.resolve();
}

const checkOauth = () => (!tokens.access_token || !tokens.expiry_date) ? Mongo('find', 'accessToken', {api: 'tdameritrade'}, {limit: 1}).then(token => {
    if (token.length === 0) {
        return handleError(new HoError('can not find token'));
    }
    tokens = token[0];
    log.info({ tokens }, 'loaded tokens from DB');
}).then(() => getToken()) : getToken();

const cancelTDOrder = id => {
    return checkOauth().then(() => Fetch(`https://api.schwabapi.com/trader/v1/accounts/${encryptedId}/orders/${id}`, {headers: {Authorization: `Bearer ${tokens.access_token}`}, method: 'DELETE'}).then(res => {
        if (!res.ok) {
            updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
            return res.json().then(err => handleError(new HoError(err.message)))
        }
    })).catch(err => {
        updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
        return Promise.reject(err);
    });
}

const submitTDOrder = (id, price, count) => {
    if (id === 'BRK-B') {
        id = 'BRK/B';
    }
    const qspost = JSON.stringify(Object.assign({
        duration: "GOOD_TILL_CANCEL",
        orderStrategyType: "SINGLE",
        orderLegCollection: [
            {
                "instruction": (count > 0) ? 'BUY' : 'SELL',
                "quantity": Math.abs(count),
                "instrument": {
                    "symbol": id,
                    "assetType": "EQUITY"
                }
            }
        ]
    //}, price === 'MARKET' ? {orderType: "MARKET", session: "NORMAL",} : {orderType: 'LIMIT', price, session: "SEAMLESS"}));
    }, price === 'MARKET' ? {orderType: "MARKET", session: "NORMAL",} : {orderType: 'LIMIT', price, session: "NORMAL"}));
    log.info({ quantity: Math.abs(count) }, 'submitting TD order');
    return checkOauth().then(() => Fetch(`https://api.schwabapi.com/trader/v1/accounts/${encryptedId}/orders`, {headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
    }, method: 'POST', body: qspost,}).then(res => {
        if (!res.ok) {
            updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
            log.warn({ id, price }, 'TD order submission failed');
            return res.json().then(err => handleError(new HoError(err.message)))
        }
    })).catch(err => {
        updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
        return Promise.reject(err);
    });
}

// Helper: process a filled order — updates previous ledger & calculates profit
const processFilledOrder = (o, lastP, currentPosition, order_recur, nextIndex) => {
    const symbol = o.fake ? o.symbol : (o.orderLegCollection[0].instrument.symbol === 'BRK/B' || o.orderLegCollection[0].instrument.symbol === 'BRK.B') ? 'BRK-B' : o.orderLegCollection[0].instrument.symbol;
    //let profit = 0;
    const type = o.fake ? o.type : o.orderLegCollection[0].instruction;
    let time = o.fake ? o.time : 0;
    //let fillRevenue = [];
    let price = o.fake ? o.price : 0;
    let revenue = 0;
    if (!o.fake) {
        log.debug({ order: o, firstLeg: o.orderActivityCollection[0].executionLegs[0] }, 'processing filled order');
        o.orderActivityCollection.forEach(oac => oac.executionLegs.forEach(oace => {
            time = Math.round(new Date(oace.time).getTime() / 1000);
            price = oace.price;
            revenue += oace.quantity * oace.price;
            /*fillRevenue.push({
                time,
                price,
                revenue: oace.quantity * oace.price,
            });*/
        }));
    }
    log.debug({ symbol, type, time, price, revenue }, 'fill order details');
    if (price <= 0) {
        return order_recur(nextIndex);
    }
    return Mongo('find', TOTALDB, {setype: 'usse', index: symbol}).then(items => {
        if (items.length < 1) {
            log.warn({ symbol }, 'symbol not found in TOTALDB');
            return order_recur(nextIndex);
        }
        const item = items[0];
        if (type === 'BUY') {
            let isDup = false;
            for (let k = 0; k < item.previous.buy.length; k++) {
                if (item.previous.buy[k].price === price && item.previous.buy[k].time === time) {
                    log.warn('order duplicate skipped');
                    return order_recur(nextIndex);
                } else if (price < item.previous.buy[k].price) {
                    item.previous.buy.splice(k, 0, {price, time});
                    isDup = true;
                    break;
                }
            }
            if (!isDup) {
                item.previous.buy.push({price, time});
            }
            if ((new Date(o.enteredTime).getTime() / 1000 + USSE_ORDER_INTERVAL) >= Math.round(new Date().getTime() / 1000)) {
                if (o.fake) {
                    item.previous = {
                        price,
                        tprice: item.previous.tprice ? 0 : item.previous.price,
                        time: item.previous.time,
                        type: 'buy',
                        buy: item.previous.buy.filter(v => (time - v.time < RANGE_INTERVAL) ? true : false),
                        sell: item.previous.sell,
                    }
                } else {
                    if (item.profit) {
                        item.profit -= revenue;
                    } else {
                        item.profit = -revenue;
                    }
                    item.previous = {
                        price,
                        time,
                        type: 'buy',
                        buy: item.previous.buy.filter(v => (time - v.time < RANGE_INTERVAL) ? true : false),
                        sell: item.previous.sell,
                    }
                }
            } else {
                log.warn({
                    enteredTime: new Date(o.enteredTime).getTime() / 1000,
                    deadline: new Date(o.enteredTime).getTime() / 1000 + USSE_ORDER_INTERVAL + USSE_ORDER_INTERVAL,
                    now: Math.round(new Date().getTime() / 1000),
                }, 'buy order out of time');
                item.previous.buy = item.previous.buy.filter(v => (time - v.time < RANGE_INTERVAL) ? true : false);
            }
        } else {
            let isDup = false;
            for (let k = 0; k < item.previous.sell.length; k++) {
                if (item.previous.sell[k].price === price && item.previous.sell[k].time === time) {
                    log.warn('order duplicate skipped');
                    return order_recur(nextIndex);
                } else if (price > item.previous.sell[k].price) {
                    item.previous.sell.splice(k, 0, {price, time});
                    isDup = true;
                    break;
                }
            }
            if (!isDup) {
                item.previous.sell.push({price, time});
            }
            if ((new Date(o.enteredTime).getTime() / 1000 + USSE_ORDER_INTERVAL) >= Math.round(new Date().getTime() / 1000)) {
                if (o.fake) {
                    item.previous = {
                        price,
                        tprice: item.previous.tprice ? 0 : item.previous.price,
                        time: item.previous.time,
                        type: 'sell',
                        sell: item.previous.sell.filter(v => (time - v.time < RANGE_INTERVAL) ? true : false),
                        buy: item.previous.buy,
                    }
                } else {
                    if (item.profit) {
                        item.profit += revenue * (1 - USSE_FEE);
                    } else {
                        item.profit = revenue * (1 - USSE_FEE);
                    }
                    item.previous = {
                        price,
                        time,
                        type: 'sell',
                        sell: item.previous.sell.filter(v => (time - v.time < RANGE_INTERVAL) ? true : false),
                        buy: item.previous.buy,
                        real: true,
                    }
                }
            } else {
                log.warn({
                    enteredTime: new Date(o.enteredTime).getTime() / 1000,
                    deadline: new Date(o.enteredTime).getTime() / 1000 + USSE_ORDER_INTERVAL + USSE_ORDER_INTERVAL,
                    now: Math.round(new Date().getTime() / 1000),
                }, 'sell order out of time');
                item.previous.sell = item.previous.sell.filter(v => (time - v.time < RANGE_INTERVAL) ? true : false);
            }
            // Calculate profit from position delta
            /*console.log(lastP);
            console.log(currentPosition);
            if (!o.fake && lastP.length > 0) {
                let pp = 0;
                let cp = 0;
                let pa = 0;
                let peq = false;
                for (let i = 0; i < lastP.length; i++) {
                    if (lastP[i].symbol === item.index) {
                        pa = lastP[i].amount;
                        pp = lastP[i].amount * lastP[i].price;
                        break;
                    }
                }
                if (pp !== 0) {
                    for (let i = 0; i < currentPosition.length; i++) {
                        if (currentPosition[i].symbol === item.index) {
                            if (pa === currentPosition[i].amount) {
                                peq = true;
                            }
                            cp = currentPosition[i].amount * currentPosition[i].price;
                            break;
                        }
                    }
                    console.log(pp);
                    console.log(cp);
                    if (!peq) {
                        let matchCount = 0;
                        for (let i = fillRevenue.length - 1; i >= 0; i--) {
                            for (let k = 0; k < item.previous.sell.length; k++) {
                                if (item.previous.sell[k].price === fillRevenue[i].price && item.previous.sell[k].time === fillRevenue[i].time) {
                                    matchCount++;
                                    break;
                                }
                            }
                            if (matchCount < 2) {
                                profit = profit + fillRevenue[i].revenue * (1 - USSE_FEE);
                            } else {
                                break;
                            }
                        }
                        profit = profit - pp + cp;
                    }
                    console.log(profit);
                }
            }*/
        }
        //item.profit = item.profit ? item.profit + profit : profit;
        log.debug({ previous: item.previous }, 'updated previous state');
        return Mongo('update', TOTALDB, {_id: item._id}, {$set: {previous: item.previous, profit: item.profit}}).then(() => order_recur(nextIndex));
    });
};

export const usseTDInit = () => checkOauth().then(() => {
    const initWs = () => {
        if (!encryptedId) {
            return Fetch('https://api.schwabapi.com/trader/v1/accounts/accountNumbers', {headers: {Authorization: `Bearer ${tokens.access_token}`}}).then(res => res.json()).then(result => {
                if (result['message']) {
                    return handleError(new HoError(result['message']));
                }
                if (result[0]) {
                    encryptedId = result[0].hashValue;
                } else {
                    return handleError(new HoError("No account"));
                }
            });
        } else {
            return Promise.resolve();
        }
    }
    const initialBook = (force = false) => {
        const now = Math.round(new Date().getTime() / 1000);
        if (force || (now - updateTime['book']) > UPDATE_ORDER) {
            updateTime['book'] = now;
            log.info({ bookTime: updateTime['book'] }, 'book refresh');
            return Fetch(`https://api.schwabapi.com/trader/v1/accounts/${encryptedId}?fields=positions`, {headers: {Authorization: `Bearer ${tokens.access_token}`}}).then(res => res.json()).then(result => {
                if (result['message']) {
                    if (force === true) {
                        updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
                    }
                    return handleError(new HoError(result['message']));
                }
                if (!result['securitiesAccount']) {
                    if (force === true) {
                        updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
                    }
                    return handleError(new HoError('miss securitiesAccount'));
                }
                //init book
                if (result['securitiesAccount']['projectedBalances']) {
                    available = {
                        tradable: result['securitiesAccount']['projectedBalances']['cashAvailableForWithdrawal'],
                        cash: result['securitiesAccount']['currentBalances'].totalCash,
                    }
                }
                const lastP = [...position];
                if (result['securitiesAccount']['positions']) {
                    position = result['securitiesAccount']['positions'].map(p => ({
                        symbol: p.instrument.symbol,
                        amount: p.longQuantity,
                        price: p.averagePrice,
                    }));
                } else {
                    position = [];
                }
                order = [];
                const usseSuggestion = getSuggestionData('usse');
                log.debug({ fakeOrder }, 'fakeOrder td');
                fakeOrder.forEach(o => {
                    if (!o.done && o.type === 'buy' && usseSuggestion[o.symbol] && usseSuggestion[o.symbol].price && usseSuggestion[o.symbol].price <= o.price) {
                        o.done = true;
                        log.info('fake order close');
                        if (!result['securitiesAccount']['orderStrategies']) {
                            result['securitiesAccount']['orderStrategies'] = [];
                        }
                        result['securitiesAccount']['orderStrategies'].push({
                            cancelable: false,
                            fake: true,
                            price: o.price,
                            time: o.time,
                            enteredTime: o.time,
                            symbol: o.symbol,
                            type: 'BUY',
                        });
                    } else if (!o.done && o.type === 'sell' && usseSuggestion[o.symbol] && usseSuggestion[o.symbol].price && usseSuggestion[o.symbol].price >= o.price) {
                        o.done = true;
                        log.info('fake order close');
                        if (!result['securitiesAccount']['orderStrategies']) {
                            result['securitiesAccount']['orderStrategies'] = [];
                        }
                        result['securitiesAccount']['orderStrategies'].push({
                            cancelable: false,
                            fake: true,
                            price: o.price,
                            time: o.time,
                            enteredTime: o.time,
                            symbol: o.symbol,
                            type: 'SELL',
                        });
                    }
                });
                let orderDate = new Date();
                const to = orderDate.toISOString();
                orderDate.setMonth(orderDate.getMonth() - 1);
                const from = orderDate.toISOString();
                return Fetch(`https://api.schwabapi.com/trader/v1/accounts/${encryptedId}/orders?fromEnteredTime=${from}&toEnteredTime=${to}`, {headers: {Authorization: `Bearer ${tokens.access_token}`}}).then(res => res.json()).then(result => {
                    if (result['error']) {
                        if (force === true) {
                            updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
                        }
                        return handleError(new HoError(result['error']));
                    }
                    log.debug({ count: result.length }, 'orders fetched');
                    const order_recur = index => {
                        if (index >= result.length) {
                            return Promise.resolve();
                        } else {
                            const o = result[index];
                            if (o.cancelable) {
                                order.push({
                                    id: o.orderId,
                                    time: new Date(o.enteredTime).getTime() / 1000,
                                    amount: o.orderLegCollection[0].instruction === 'BUY' ? o.quantity : -o.quantity,
                                    type: o.orderType,
                                    symbol: (o.orderLegCollection[0].instrument.symbol === 'BRK/B' || o.orderLegCollection[0].instrument.symbol === 'BRK.B') ? 'BRK-B' : o.orderLegCollection[0].instrument.symbol,
                                    price: o.price,
                                    duration: o.duration,
                                    partial: (o.orderActivityCollection && (o.orderActivityCollection[0].executionType === 'FILL' || o.orderActivityCollection[0].executionType === 'PARTIALFILL' || o.orderActivityCollection[0].executionType === 'PARTIAL FILL')) ? true : false,
                                });
                                if (o.orderActivityCollection && (o.orderActivityCollection[0].executionType === 'FILL' || o.orderActivityCollection[0].executionType === 'PARTIALFILL' || o.orderActivityCollection[0].executionType === 'PARTIAL FILL')) {
                                    return processFilledOrder(o, lastP, position, order_recur, index + 1);
                                } else {
                                    return order_recur(index + 1);
                                }
                            } else if (o.fake || (o.orderActivityCollection && (o.orderActivityCollection[0].executionType === 'FILL' || o.orderActivityCollection[0].executionType === 'PARTIALFILL' || o.orderActivityCollection[0].executionType === 'PARTIAL FILL'))) {
                                return processFilledOrder(o, lastP, position, order_recur, index + 1);
                            } else {
                                return order_recur(index + 1);
                            }
                        }
                    }
                    return order_recur(0);
                });
            });
        } else {
            log.debug('no new orders');
            return Promise.resolve();
        }
    }
    return initWs().then(() => initialBook()).then(() => {
        updateTime['trade']++;
        log.info({ tradeCount: updateTime['trade'] }, 'trade cycle tick');
        if (updateTime['trade'] % (Math.ceil(USSE_ORDER_INTERVAL / PRICE_INTERVAL) - 3) !== 3) {
            return Promise.resolve();
        } else {
            //避開交易時間
            const hour = new Date().getHours();
            if (USSE_MARKET_TIME[0] > USSE_MARKET_TIME[1]) {
                if (hour >= USSE_MARKET_TIME[0] || hour < USSE_MARKET_TIME[1]) {
                    updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
                    return Promise.resolve();
                }
            } else if (hour >= USSE_MARKET_TIME[0] && hour < USSE_MARKET_TIME[1]) {
                updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
                return Promise.resolve();
            }
        }
        return Mongo('find', TOTALDB, {setype: 'usse', sType: {$exists: false}}).then(items => {
            fakeOrder = [];
            const newOrder = [];
            const usseSuggestion = getSuggestionData('usse');
            log.debug({ usseSuggestion }, 'suggestion data');
            const recur_status = index => {
                if (index >= items.length) {
                    return Promise.resolve();
                } else {
                    const item = items[index];
                    if (item.index === 0 || !usseSuggestion[item.index]) {
                        return recur_status(index + 1);
                    }
                    //market cap multiple
                    if (item.mul) {
                        item.orig = item.orig * item.mul;
                        item.times = Math.floor(item.times * item.mul);
                    }
                    const price = usseSuggestion[item.index].price;
                    log.debug({ item }, 'evaluating stock item');
                    const cancelOrder = rest => initialBook(true).then(() => {
                        const real_id = order.filter(v => (v.symbol === item.index));
                        const real_delete = index => {
                            if (index >= real_id.length) {
                                return rest ? rest() : Promise.resolve();
                            }
                            return real_id[index].partial ? real_delete(index + 1) : cancelTDOrder(real_id[index].id).catch(err => {
                                log.warn({ order }, 'cancel order failed, current orders');
                                sendWs(`${real_id[index].id} TD cancelOrder Error: ${err.message||err.msg}`, 0, 0, true);
                                handleError(err, `${real_id[index].id} TDcancelOrder Error`);
                            }).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), API_WAIT * 2000)).then(() => real_delete(index + 1)));
                        }
                        return real_delete(0);
                    });
                    const startStatus = () => cancelOrder().then(() => {
                        if (usseSuggestion[item.index]) {
                            newOrder.push({item, suggestion: usseSuggestion[item.index]});
                        }
                        return recur_status(index + 1);
                    });
                    if (item.ing === 2) {
                        const sellAll = () => initialBook(true).then(() => {
                            const delTotal = () => Mongo('deleteMany', TOTALDB, {_id: item._id}).then(() => recur_status(index + 1));
                            item.count = 0;
                            //item.amount = item.orig;
                            for (let i = 0; i < position.length; i++) {
                                if (position[i].symbol === item.index) {
                                    item.count = position[i].amount;
                                    //item.amount = item.orig - position[i].amount * position[i].price + item.profit;
                                    break;
                                }
                            }
                            if (item.count > 0) {
                                return submitTDOrder(item.index, 'MARKET', -item.count).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), API_WAIT * 2000))).then(() => delTotal());
                            } else {
                                return delTotal();
                            }
                        });
                        return cancelOrder(sellAll);
                    } else if (item.ing === 1) {
                        if (price) {
                            return startStatus();
                        } else {
                            return recur_status(index + 1);
                        }
                    } else {
                        const negBounds = item.web.filter(v => v < 0);
                        const sigma1Up = negBounds.length >= 3 ? -negBounds[2] : item.mid * 2;
                        if (price < sigma1Up) {
                            return Mongo('update', TOTALDB, {_id: item._id}, {$set : {ing: 1}}).then(result => {
                                if (price) {
                                    return startStatus();
                                } else {
                                    return recur_status(index + 1);
                                }
                            });
                        } else {
                            log.debug({ price, sigma1Up, mid: item.mid }, 'enter_mid: price above 1σ');
                            return recur_status(index + 1);
                        }
                    }
                }
            }
            const recur_NewOrder = index => {
                if (index >= newOrder.length) {
                    return Promise.resolve();
                } else {
                    const item = newOrder[index].item;
                    const suggestion = newOrder[index].suggestion;
                    const submitBuy = () => {
                        return initialBook(true).then(() => {
                            log.debug({ available }, 'checking available balance');
                            const order_avail = (available.tradable > 300) ? available.tradable - 300 : 0;
                            if (order_avail < suggestion.bCount * suggestion.buy * 4 / 3) {
                                if (order_avail < suggestion.bCount * suggestion.buy * 2 / 3) {
                                    suggestion.bCount = 0;
                                    suggestion.buy = 0;
                                } else {
                                    suggestion.bCount = Math.floor(order_avail / suggestion.buy);
                                }
                            }
                            if (suggestion.bCount > 0 && suggestion.buy) {
                                log.info({ symbol: item.index, count: suggestion.bCount, price: suggestion.buy }, 'submitting buy order');
                                return submitTDOrder(item.index, suggestion.buy, suggestion.bCount).catch(err => {
                                        const msg = err.message || err.msg;
                                        if (msg.includes('oversold/overbought position in your account')) {
                                            //恢復update time
                                            updateTime['trade']++;
                                            sendWs(`${item.index} TD Buy Order Error: ${err.message||err.msg}`, 0, 0, true);
                                            handleError(err, `${item.index} TD Buy Order Error`);
                                        } else {
                                            return Promise.reject(err);
                                            //throw err;
                                        }
                                    }).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), API_WAIT * 2000))).then(() => recur_NewOrder(index + 1));
                            } else if (suggestion.buy) {
                                fakeOrder.push({
                                    type: 'buy',
                                    time: Math.round(new Date().getTime() / 1000),
                                    price: suggestion.buy,
                                    symbol: item.index,
                                });
                                return recur_NewOrder(index + 1);
                            } else {
                                return recur_NewOrder(index + 1);
                            }
                        });
                    }
                    if (suggestion.sCount > 0 && suggestion.sell) {
                        log.info({ symbol: item.index, count: suggestion.sCount, price: suggestion.sell }, 'submitting sell order');
                        return submitTDOrder(item.index, suggestion.sell, -suggestion.sCount).catch(err => {
                            const msg = err.message || err.msg;
                            if (msg.includes('oversold/overbought position in your account')) {
                                //恢復update time
                                updateTime['trade']++;
                                sendWs(`${item.index} TD Sell Order Error: ${err.message||err.msg}`, 0, 0, true);
                                handleError(err, `${item.index} TD Sell Order Error`);
                            } else {
                                return Promise.reject(err);
                                //throw err;
                            }
                        }).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), API_WAIT * 2000))).then(() => submitBuy());
                    } else if (suggestion.sell) {
                        fakeOrder.push({
                            type: 'sell',
                            time: Math.round(new Date().getTime() / 1000),
                            price: suggestion.sell,
                            symbol: item.index,
                        });
                        return submitBuy();
                    } else {
                        return submitBuy();
                    }
                }
            }
            return recur_status(0).then(() => {
                // §6c Conviction-weighted sort: 50% invested market value + 50% conviction (1/extrem)
                if (newOrder.length > 1) {
                    const marketVal = e => Math.abs(e.item.count || 0) * (e.suggestion.price || 0);
                    const maxMarketVal = Math.max(...newOrder.map(marketVal)) || 1;
                    const maxConviction = Math.max(...newOrder.map(e => e.item.extrem ? 1 / e.item.extrem : 0)) || 1;
                    newOrder.sort((a, b) => {
                        const aMV = marketVal(a) / maxMarketVal;
                        const bMV = marketVal(b) / maxMarketVal;
                        const aConv = (a.item.extrem ? 1 / a.item.extrem : 0) / maxConviction;
                        const bConv = (b.item.extrem ? 1 / b.item.extrem : 0) / maxConviction;
                        return (0.5 * bMV + 0.5 * bConv) - (0.5 * aMV + 0.5 * aConv);
                    });
                }
                for (let i = 0; i < newOrder.length; i++) {
                    log.debug({ symbol: newOrder[i].item.index, amount: newOrder[i].item.amount }, 'order queue item');
                }
                return recur_NewOrder(0);
            });
        });
    });
});

export const getUssePosition = () => {
    let is_exist = false;
    for (let i = 0; i < position.length; i++) {
        if (position[i].symbol === 0) {
            is_exist = true;
        } else if (position[i].symbol === 'BRK.B' || position[i].symbol === 'BRK/B') {
            position[i].symbol = 'BRK-B';
        }
    }
    if (!is_exist) {
        position.push({
            symbol: 0,
            amount: 1,
            price: available.cash,
        });
    }
    return position;
}

export const getUsseOrder = () => order;

export const resetTD = (update=false) => {
    log.info('TD state reset');
    const trade_count = updateTime['trade'];
    updateTime = {};
    updateTime['book'] = 0;
    updateTime['trade'] = trade_count;
}

export const _resetTokens = () => {
    tokens = {};
    encryptedId = null;
}
