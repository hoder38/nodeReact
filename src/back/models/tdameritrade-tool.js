import { TDAMERITRADE_KEY, GOOGLE_REDIRECT, TDAMERITRADE_SECRET } from '../../../ver.js'
import { TD_AUTH_URL, TD_TOKEN_URL, TOTALDB, USSE_ORDER_INTERVAL, UPDATE_BOOK, PRICE_INTERVAL, USSE_ENTER_MID, UPDATE_ORDER, USSE_MARKET_TIME, RANGE_INTERVAL, USSE_FEE, API_WAIT } from '../constants.js'
import Fetch from 'node-fetch'
import { stringify as QStringify } from 'querystring'
import { handleError, HoError } from '../util/utility.js'
import Mongo from '../models/mongo-tool.js'
import { getSuggestionData } from '../models/stock-tool.js'
import sendWs from '../util/sendWs.js'

let tokens = {};
let encryptedId = null;
let updateTime = {book: 0, trade: 0};
let available = {tradable: 0, cash: 0};
let order = [];
let position = [];
let fakeOrder = [];

//export const generateAuthUrl = () => `${TD_AUTH_URL}response_type=code&redirect_uri=${GOOGLE_REDIRECT}&client_id=${TDAMERITRADE_KEY}%40AMER.OAUTHAP`;
export const generateAuthUrl = () => `${TD_AUTH_URL}redirect_uri=${GOOGLE_REDIRECT}&client_id=${TDAMERITRADE_KEY}`;

export const getToken = code => {
    if (code) {
        const codeM = code.match(/code\=([^&]*)/);
        if (codeM) {
            code = codeM[1];
        }
        console.log(code);
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
        console.log(token);
        return Mongo('find', 'accessToken', {api: 'tdameritrade'}).then(items => {
            if (items.length > 0) {
                return Mongo('update', 'accessToken', {api: 'tdameritrade'}, {$set: token}).then(item => {
                    console.log(item);
                    Object.assign(tokens, token);
                });
            } else {
                return Mongo('insert', 'accessToken', Object.assign({api: 'tdameritrade'}, token)).then(item => {
                    console.log(item);
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
    console.log('td first');
    tokens = token[0];
    console.log(tokens);
}).then(() => getToken()) : getToken();

const cancelTDOrder = id => {
    if (!encryptedId) {
        return handleError(new HoError('TD cannot cancel order!!!'));
    }
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
    if (!encryptedId) {
        return handleError(new HoError('TD cannot cancel order!!!'));
    }
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
    console.log(Math.abs(count));
    return checkOauth().then(() => Fetch(`https://api.schwabapi.com/trader/v1/accounts/${encryptedId}/orders`, {headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
    }, method: 'POST', body: qspost,}).then(res => {
        if (!res.ok) {
            updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
            console.log(id);
            console.log(price);
            return res.json().then(err => handleError(new HoError(err.message)))
        }
    })).catch(err => {
        updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
        return Promise.reject(err);
    });
}

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
        if (!encryptedId) {
            return handleError(new HoError('TD cannot be inital book!!!'));
        }
        const now = Math.round(new Date().getTime() / 1000);
        if (force || (now - updateTime['book']) > UPDATE_ORDER) {
            updateTime['book'] = now;
            console.log(updateTime['book']);
            return Fetch(`https://api.schwabapi.com/trader/v1/accounts/${encryptedId}?fields=positions`, {headers: {Authorization: `Bearer ${tokens.access_token}`}}).then(res => res.json()).then(result => {
                //console.log(result);
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
                console.log('fakeOrder td');
                console.log(fakeOrder);
                fakeOrder.forEach(o => {
                    if (!o.done && o.type === 'buy' && usseSuggestion[o.symbol].price && usseSuggestion[o.symbol].price <= o.price) {
                        o.done = true;
                        console.log('fake order close');
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
                    } else if (!o.done && o.type === 'sell' && usseSuggestion[o.symbol].price && usseSuggestion[o.symbol].price >= o.price) {
                        o.done = true;
                        console.log('fake order close');
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
                    console.log(result.length);
                    const order_recur = index => {
                        if (index >= result.length) {
                            return Promise.resolve();
                        } else {
                            const o = result[index];
                            //console.log(o);
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
                                    console.log(o);
                                    console.log(o.orderActivityCollection[0].executionLegs[0]);
                                    const symbol = (o.orderLegCollection[0].instrument.symbol === 'BRK/B' || o.orderLegCollection[0].instrument.symbol === 'BRK.B') ? 'BRK-B' : o.orderLegCollection[0].instrument.symbol;
                                    let profit = 0;
                                    const type = o.orderLegCollection[0].instruction;
                                    let time = 0;
                                    //const time = Math.round(new Date(o.orderActivityCollection[0].executionLegs[0].time).getTime() / 1000);
                                    //const price = o.orderActivityCollection[0].executionLegs[0].price;
                                    let this_profit = [];
                                    let price = 0;
                                    o.orderActivityCollection.forEach(oac => oac.executionLegs.forEach(oace => {
                                        time = Math.round(new Date(oace.time).getTime() / 1000);
                                        price = oace.price;
                                        this_profit.push({
                                            time,
                                            price,
                                            profit: oace.quantity * oace.price,
                                        });
                                    }));
                                    console.log(symbol);
                                    console.log(type);
                                    console.log(time);
                                    console.log(price);
                                    console.log(this_profit);
                                    if (price <= 0) {
                                        return order_recur(index + 1);
                                    }
                                    return Mongo('find', TOTALDB, {setype: 'usse', index: symbol}).then(items => {
                                        if (items.length < 1) {
                                            console.log(`miss ${symbol}`);
                                            return order_recur(index + 1);
                                        }
                                        const item = items[0];
                                        if (type === 'BUY') {
                                            let is_insert = false;
                                            for (let k = 0; k < item.previous.buy.length; k++) {
                                                if (item.previous.buy[k].price === price && item.previous.buy[k].time === time) {
                                                    return order_recur(index + 1);
                                                } else if (price < item.previous.buy[k].price) {
                                                    item.previous.buy.splice(k, 0, {price, time});
                                                    is_insert = true;
                                                    break;
                                                }
                                            }
                                            if (!is_insert) {
                                                item.previous.buy.push({price, time});
                                            }
                                            if ((new Date(o.enteredTime).getTime() / 1000 + USSE_ORDER_INTERVAL) >= Math.round(new Date().getTime() / 1000)) {
                                                item.previous = {
                                                    price,
                                                    time,
                                                    type: 'buy',
                                                    buy: item.previous.buy.filter(v => (time - v.time < RANGE_INTERVAL) ? true : false),
                                                    sell: item.previous.sell,
                                                }
                                            } else {
                                                item.previous.buy = item.previous.buy.filter(v => (time - v.time < RANGE_INTERVAL) ? true : false);
                                            }
                                        } else {
                                            let is_insert = false;
                                            for (let k = 0; k < item.previous.sell.length; k++) {
                                                if (item.previous.sell[k].price === price && item.previous.sell[k].time === time) {
                                                    return order_recur(index + 1);
                                                } else if (price > item.previous.sell[k].price) {
                                                    item.previous.sell.splice(k, 0, {price, time});
                                                    is_insert = true;
                                                    break;
                                                }
                                            }
                                            if (!is_insert) {
                                                item.previous.sell.push({price, time});
                                            }
                                            if ((new Date(o.enteredTime).getTime() / 1000 + USSE_ORDER_INTERVAL) >= Math.round(new Date().getTime() / 1000)) {
                                                item.previous = {
                                                    price,
                                                    time,
                                                    type: 'sell',
                                                    sell: item.previous.sell.filter(v => (time - v.time < RANGE_INTERVAL) ? true : false),
                                                    buy: item.previous.buy,
                                                }
                                            } else {
                                                item.previous.sell = item.previous.sell.filter(v => (time - v.time < RANGE_INTERVAL) ? true : false);
                                            }
                                            //calculate profit
                                            console.log(lastP);
                                            console.log(position);
                                            if (lastP.length > 0) {
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
                                                    for (let i = 0; i < position.length; i++) {
                                                        if (position[i].symbol === item.index) {
                                                            if (pa === position[i].amount) {
                                                                peq = true;
                                                            }
                                                            cp = position[i].amount * position[i].price;
                                                            break;
                                                        }
                                                    }
                                                    console.log(pp);
                                                    console.log(cp);
                                                    if (!peq) {
                                                        is_insert = 0;
                                                        for (let i = this_profit.length - 1; i >= 0; i--) {
                                                            for (let k = 0; k < item.previous.sell.length; k++) {
                                                                if (item.previous.sell[k].price === this_profit[i].price && item.previous.sell[k].time === this_profit[i].time) {
                                                                    is_insert++;
                                                                    break;
                                                                }
                                                            }
                                                            if (is_insert < 2) {
                                                                profit = profit + this_profit[i].profit * (1 - USSE_FEE)
                                                            } else {
                                                                break;
                                                            }
                                                        }
                                                        profit = profit - pp + cp;
                                                    }
                                                    console.log(profit);
                                                }
                                            }
                                        }
                                        item.profit = item.profit ? item.profit + profit : profit;
                                        return Mongo('update', TOTALDB, {_id: item._id}, {$set: {previous: item.previous, profit: item.profit}}).then(() => order_recur(index + 1));
                                    });
                                } else {
                                    return order_recur(index + 1);
                                }
                            } else if (o.fake || (o.orderActivityCollection && (o.orderActivityCollection[0].executionType === 'FILL' || o.orderActivityCollection[0].executionType === 'PARTIALFILL' || o.orderActivityCollection[0].executionType === 'PARTIAL FILL'))) {
                                console.log(o);
                                if (!o.fake) {
                                    console.log(o.orderActivityCollection[0].executionLegs[0]);
                                }
                                const symbol = o.fake ? o.symbol : (o.orderLegCollection[0].instrument.symbol === 'BRK/B' || o.orderLegCollection[0].instrument.symbol === 'BRK.B') ? 'BRK-B' : o.orderLegCollection[0].instrument.symbol;
                                let profit = 0;
                                const type = o.fake ? o.type : o.orderLegCollection[0].instruction;
                                let time = o.fake ? o.time : 0;
                                //const time = Math.round(new Date(o.orderActivityCollection[0].executionLegs[0].time).getTime() / 1000);
                                //const price = o.orderActivityCollection[0].executionLegs[0].price;
                                let this_profit = [];
                                let price =  o.fake ? o.price : 0;
                                if (!o.fake) {
                                    o.orderActivityCollection.forEach(oac => oac.executionLegs.forEach(oace => {
                                        time = Math.round(new Date(oace.time).getTime() / 1000);
                                        price = oace.price;
                                        this_profit.push({
                                            time,
                                            price,
                                            profit: oace.quantity * oace.price,
                                        });
                                    }));
                                }
                                console.log(symbol);
                                console.log(type);
                                console.log(time);
                                console.log(price);
                                console.log(this_profit);
                                if (price <= 0) {
                                    return order_recur(index + 1);
                                }
                                return Mongo('find', TOTALDB, {setype: 'usse', index: symbol}).then(items => {
                                    if (items.length < 1) {
                                        console.log(`miss ${symbol}`);
                                        return order_recur(index + 1);
                                    }
                                    const item = items[0];
                                    if (type === 'BUY') {
                                        let is_insert = false;
                                        for (let k = 0; k < item.previous.buy.length; k++) {
                                            if (item.previous.buy[k].price === price && item.previous.buy[k].time === time) {
                                                console.log('t order duplicate');
                                                return order_recur(index + 1);
                                            } else if (price < item.previous.buy[k].price) {
                                                item.previous.buy.splice(k, 0, {price, time});
                                                is_insert = true;
                                                break;
                                            }
                                        }
                                        if (!is_insert) {
                                            item.previous.buy.push({price, time});
                                        }
                                        if ((new Date(o.enteredTime).getTime() / 1000 + USSE_ORDER_INTERVAL) >= Math.round(new Date().getTime() / 1000)) {
                                            if (o.fake) {
                                                item.previous = {
                                                    price,
                                                    tprice: item.previous.tprice ? 0 : item.previous.price,
                                                    time,
                                                    type: 'buy',
                                                    buy: item.previous.buy.filter(v => (time - v.time < RANGE_INTERVAL) ? true : false),
                                                    sell: item.previous.sell,
                                                }
                                            } else {
                                                item.previous = {
                                                    price,
                                                    time,
                                                    type: 'buy',
                                                    buy: item.previous.buy.filter(v => (time - v.time < RANGE_INTERVAL) ? true : false),
                                                    sell: item.previous.sell,
                                                }
                                            }
                                        } else {
                                            console.log('t out of time');
                                            console.log(new Date(o.enteredTime).getTime() / 1000);
                                            console.log(new Date(o.enteredTime).getTime() / 1000 + USSE_ORDER_INTERVAL + USSE_ORDER_INTERVAL);
                                            console.log(Math.round(new Date().getTime() / 1000));
                                            item.previous.buy = item.previous.buy.filter(v => (time - v.time < RANGE_INTERVAL) ? true : false);
                                        }
                                    } else {
                                        let is_insert = false;
                                        for (let k = 0; k < item.previous.sell.length; k++) {
                                            if (item.previous.sell[k].price === price && item.previous.sell[k].time === time) {
                                                console.log('t order duplicate');
                                                return order_recur(index + 1);
                                            } else if (price > item.previous.sell[k].price) {
                                                item.previous.sell.splice(k, 0, {price, time});
                                                is_insert = true;
                                                break;
                                            }
                                        }
                                        if (!is_insert) {
                                            item.previous.sell.push({price, time});
                                        }
                                        if ((new Date(o.enteredTime).getTime() / 1000 + USSE_ORDER_INTERVAL) >= Math.round(new Date().getTime() / 1000)) {
                                            if (o.fake) {
                                                item.previous = {
                                                    price,
                                                    tprice: item.previous.tprice ? 0 : item.previous.price,
                                                    time,
                                                    type: 'sell',
                                                    sell: item.previous.sell.filter(v => (time - v.time < RANGE_INTERVAL) ? true : false),
                                                    buy: item.previous.buy,
                                                }
                                            } else {
                                                item.previous = {
                                                    price,
                                                    time,
                                                    type: 'sell',
                                                    sell: item.previous.sell.filter(v => (time - v.time < RANGE_INTERVAL) ? true : false),
                                                    buy: item.previous.buy,
                                                }
                                            }
                                        } else {
                                            console.log('t out of time');
                                            console.log(new Date(o.enteredTime).getTime() / 1000);
                                            console.log(new Date(o.enteredTime).getTime() / 1000 + USSE_ORDER_INTERVAL + USSE_ORDER_INTERVAL);
                                            console.log(Math.round(new Date().getTime() / 1000));
                                            item.previous.sell = item.previous.sell.filter(v => (time - v.time < RANGE_INTERVAL) ? true : false);
                                        }
                                        //calculate profit
                                        console.log(lastP);
                                        console.log(position);
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
                                                for (let i = 0; i < position.length; i++) {
                                                    if (position[i].symbol === item.index) {
                                                        if (pa === position[i].amount) {
                                                            peq = true;
                                                        }
                                                        cp = position[i].amount * position[i].price;
                                                        break;
                                                    }
                                                }
                                                console.log(pp);
                                                console.log(cp);
                                                if (!peq) {
                                                    is_insert = 0;
                                                    for (let i = this_profit.length - 1; i >= 0; i--) {
                                                        for (let k = 0; k < item.previous.sell.length; k++) {
                                                            if (item.previous.sell[k].price === this_profit[i].price && item.previous.sell[k].time === this_profit[i].time) {
                                                                is_insert++;
                                                                break;
                                                            }
                                                        }
                                                        if (is_insert < 2) {
                                                            profit = profit + this_profit[i].profit * (1 - USSE_FEE)
                                                        } else {
                                                            break;
                                                        }
                                                    }
                                                    profit = profit - pp + cp;
                                                }
                                                console.log(profit);
                                            }
                                        }
                                    }
                                    item.profit = item.profit ? item.profit + profit : profit;
                                    console.log(item.previous);
                                    return Mongo('update', TOTALDB, {_id: item._id}, {$set: {previous: item.previous, profit: item.profit}}).then(() => order_recur(index + 1));
                                });
                            } else {
                                return order_recur(index + 1);
                            }
                        }
                    }
                    return order_recur(0);
                });
            });
        } else {
            console.log('TD no new');
            return Promise.resolve();
        }
    }
    return initWs().then(() => initialBook()).then(() => {
        updateTime['trade']++;
        console.log(`td ${updateTime['trade']}`);
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
            console.log(usseSuggestion);
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
                    console.log(item);
                    const cancelOrder = rest => initialBook(true).then(() => {
                        const real_id = order.filter(v => (v.symbol === item.index));
                        const real_delete = index => {
                            if (index >= real_id.length) {
                                return rest ? rest() : Promise.resolve();
                            }
                            return real_id[index].partial ? real_delete(index + 1) : cancelTDOrder(real_id[index].id).catch(err => {
                                console.log(order);
                                sendWs(`${real_id[index].id} TD cancelOrder Error: ${err.message||err.msg}`, 0, 0, true);
                                handleError(err, `${real_id[index].id} TDcancelOrder Error`);
                            }).then(() => new Promise((resolve, reject) => setTimeout(() => resolve(), API_WAIT * 2000)).then(() => real_delete(index + 1)));
                        }
                        return real_delete(0);
                    });
                    const startStatus = () => cancelOrder().then(() => {
                        if (usseSuggestion[item.index]) {
                            let is_insert = false;
                            for (let i = 0; i < newOrder.length; i++) {
                                if (item.amount > newOrder[i].item.amount) {
                                    newOrder.splice(i, 0, {item, suggestion: usseSuggestion[item.index]});
                                    is_insert = true;
                                    break;
                                }
                            }
                            if (!is_insert) {
                                newOrder.push({item, suggestion: usseSuggestion[item.index]});
                            }
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
                        if ((price - item.mid) / item.mid * 100 < USSE_ENTER_MID) {
                            return Mongo('update', TOTALDB, {_id: item._id}, {$set : {ing: 1}}).then(result => {
                                if (price) {
                                    return startStatus();
                                } else {
                                    return recur_status(index + 1);
                                }
                            });
                        } else {
                            console.log('enter_mid');
                            console.log((price - item.mid) / item.mid * 100);
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
                            console.log(available);
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
                                console.log(`buy ${item.index} ${suggestion.bCount} ${suggestion.buy}`);
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
                        console.log(`sell ${item.index} ${suggestion.sCount} ${suggestion.sell}`);
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
                for (let i = 0; i < newOrder.length; i++) {
                    console.log(`${newOrder[i].item.index} ${newOrder[i].item.amount}`);
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
    console.log('TD reset');
    const trade_count = updateTime['trade'];
    updateTime = {};
    updateTime['book'] = 0;
    updateTime['trade'] = trade_count;
}
