import { TDAMERITRADE_KEY, GOOGLE_REDIRECT } from '../../../ver.js'
import { TD_AUTH_URL, TD_TOKEN_URL, TOTALDB, USSE_ORDER_INTERVAL, UPDATE_BOOK, PRICE_INTERVAL, USSE_ENTER_MID, UPDATE_ORDER, USSE_MARKET_TIME, RANGE_INTERVAL, USSE_FEE, API_WAIT } from '../constants.js'
import Fetch from 'node-fetch'
import { stringify as QStringify } from 'querystring'
import { handleError, HoError } from '../util/utility.js'
import Mongo from '../models/mongo-tool.js'
import { getSuggestionData } from '../models/stock-tool.js'
import sendWs from '../util/sendWs.js'
import Ws from 'ws'
import Event from 'events'
import Xml2js from 'xml2js'

const Xmlparser = new Xml2js.Parser();

let eventEmitter = new Event.EventEmitter();
let tokens = {};
let userPrincipalsResponse = null;
let usseWs = null;
let requestid = 0;
let emitter = [];
let updateTime = {book: 0, trade: 0};
let available = {tradable: 0, cash: 0};
let order = [];
let position = [];
let processedOrder = [];

export const generateAuthUrl = () => `${TD_AUTH_URL}response_type=code&redirect_uri=${GOOGLE_REDIRECT}&client_id=${TDAMERITRADE_KEY}%40AMER.OAUTHAP`;

export const getToken = code => {
    const qspost = code ? QStringify({
        grant_type: 'authorization_code',
        refresh_token: '',
        access_type: 'offline',
        code: decodeURIComponent(code),
        client_id: TDAMERITRADE_KEY,
        redirect_uri: GOOGLE_REDIRECT,
    }) : (tokens && tokens.expiry_date < (Date.now() / 1000 + 590)) ? QStringify({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        access_type: '',
        code: '',
        client_id: TDAMERITRADE_KEY,
        redirect_uri: '',
    }) : null;

    return qspost ? Fetch(TD_TOKEN_URL, {
        method: 'POST',
        body: qspost,
        headers: {
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
        if (token['refresh_token_expires_in']) {
            token['refresh_token_expiry_date'] = Math.floor(Date.now() / 1000) + token['refresh_token_expires_in'];
        } else {
            if (tokens && tokens.refresh_token_expiry_date < (Date.now() / 1000 + 604800)) {
                sendWs(`TD AMERITRADE: Please refresh token in 7 days`, 0, 0, true);
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

const usseAuth = fn => {
    if (!usseWs || !userPrincipalsResponse) {
        return handleError(new HoError('TD cannot be authed!!!'));
    }
    eventEmitter.once('LOGIN', data => {
        switch(data.code) {
            case 0:
            console.log("TD auth's done");
            fn();
            break;
            case 3:
            default:
            usseWs.close();
            return handleError(new HoError(`TD LOGIN FAIL: ${data.msg}`));
        }
    });
    usseWs.send(JSON.stringify({
        "requests": [
            {
                "service": "ADMIN",
                "command": "LOGIN",
                "requestid": (requestid++).toString(),
                "account": userPrincipalsResponse.accounts[0].accountId,
                "source": userPrincipalsResponse.streamerInfo.appId,
                "parameters": {
                    "credential": userPrincipalsResponse.credentials,
                    "token": userPrincipalsResponse.streamerInfo.token,
                    "version": "1.0"
                }
            }
        ]
    }));
}

const usseLogout = () => {
    if (!usseWs || !userPrincipalsResponse) {
        console.log('TD has already shut down!!!');
        return true;
        //return handleError(new HoError('TD cannot be logouted!!!'));
    }
    eventEmitter.once('LOGOUT', data => {
        switch(data.code) {
            case 0:
            console.log("TD auth's done logout");
            usseWs.close();
            break;
            default:
            console.log(`TD LOGOUT FAIL: ${data.msg}`);
            usseWs.close();
            //return handleError(new HoError(`TD LOGOUT FAIL: ${data.msg}`));
            break;
        }
    });
    usseWs.send(JSON.stringify({
        "requests": [
            {
                "service": "ADMIN",
                "requestid": (requestid++).toString(),
                "command": "LOGOUT",
                "account": userPrincipalsResponse.accounts[0].accountId,
                "source": userPrincipalsResponse.streamerInfo.appId,
                "parameters": {}
            }
        ]
    }));
}

const usseSubAccount = (sub = true) => {
    if (!usseWs || !userPrincipalsResponse) {
        return handleError(new HoError('TD cannot be subscript!!!'));
    }
    usseWs.send(JSON.stringify({
        "requests": [
            {
                "service": "ACCT_ACTIVITY",
                "requestid": (requestid++).toString(),
                "command": "SUBS",
                "account": userPrincipalsResponse.accounts[0].accountId,
                "source": userPrincipalsResponse.streamerInfo.appId,
                "parameters": {
                    "keys": userPrincipalsResponse.streamerSubscriptionKeys.keys[0].key,
                    "fields": "0,1,2,3"
                }
            }
        ]
    }));
}

const usseOnAccount = fn => {
    eventEmitter.on('ACCOUNT', data => {
        if (data.hasOwnProperty('code')) {
            switch(data.code) {
                case 0:
                console.log(data.msg);
                break;
                default:
                return handleError(new HoError(`TD subscript account FAIL: ${data.msg}`));
            }
        } else {
            fn(data);
        }
    });
}

export const usseSubStock = (symbol, sub = true) => {
    if (!usseWs || !userPrincipalsResponse) {
        return handleError(new HoError('TD cannot be subscript!!!'));
    }
    usseWs.send(JSON.stringify({
        "requests": [
            {
                "service": "CHART_EQUITY",
                "requestid": (requestid++).toString(),
                "command": sub ? "SUBS" : 'ADD',
                "account": userPrincipalsResponse.accounts[0].accountId,
                "source": userPrincipalsResponse.streamerInfo.appId,
                "parameters": {
                    "keys": symbol.join(',').toUpperCase(),
                    "fields": "0,1,2,3,4,5,6,7,8"
                },
            },
            /*{
                "service": "CHART_FUTURES",
                "requestid": (requestid++).toString(),
                "command": "SUBS",
                "account": userPrincipalsResponse.accounts[0].accountId,
                "source": userPrincipalsResponse.streamerInfo.appId,
                "parameters": {
                    "keys": "/ES",
                    "fields": "0,1,2,3,4,5,6,7"
                }
            }*/
        ]
    }));
}

const usseOnStock = fn => {
    eventEmitter.on('STOCK', data => {
        if (data.hasOwnProperty('code')) {
            switch(data.code) {
                case 0:
                console.log(data.msg);
                break;
                default:
                return handleError(new HoError(`TD subscript ${symbol.join(',').toUpperCase()} FAIL: ${data.msg}`));
            }
        } else {
            fn(data);
        }
    });
}

const usseHandler = res => {
    if (res.service === 'ADMIN' && res.command === 'LOGIN') {
        return eventEmitter.emit('LOGIN', res.content);
    }
    if (res.service === 'ADMIN' && res.command === 'LOGOUT') {
        return eventEmitter.emit('LOGOUT', res.content);
    }
    if (res.service === 'CHART_EQUITY') {
        return eventEmitter.emit('STOCK', res.content);
    }
    if (res.service === 'ACCT_ACTIVITY') {
        return eventEmitter.emit('ACCOUNT', res.content);
    }
    if (res.heartbeat) {
        return true;
    }
    console.log(res);
}

const cancelTDOrder = id => {
    if (!usseWs || !userPrincipalsResponse) {
        return handleError(new HoError('TD cannot cancel order!!!'));
    }
    return checkOauth().then(() => Fetch(`https://api.tdameritrade.com/v1/accounts/${userPrincipalsResponse.accounts[0].accountId}/orders/${id}`, {headers: {Authorization: `Bearer ${tokens.access_token}`}, method: 'DELETE'}).then(res => {
        if (!res.ok) {
            updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
            return res.json().then(err => handleError(new HoError(err.error)))
        }
    })).catch(err => {
        updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
        return Promise.reject(err);
    });
}

const submitTDOrder = (id, price, count) => {
    if (!usseWs || !userPrincipalsResponse) {
        return handleError(new HoError('TD cannot cancel order!!!'));
    }
    const qspost = JSON.stringify(Object.assign({
        session: "SEAMLESS",
        duration: "GOOD_TILL_CANCEL",
        orderStrategyType: "SINGLE",
        orderLegCollection: [
            {
                "instruction": (count > 0) ? "Buy" : 'SELL',
                "quantity": Math.abs(count),
                "instrument": {
                    "symbol": id,
                    "assetType": "EQUITY"
                }
            }
        ]
    }, price === 'MARKET' ? {orderType: "MARKET"} : {orderType: 'LIMIT', price: price}));
    console.log(Math.abs(count));
    return checkOauth().then(() => Fetch(`https://api.tdameritrade.com/v1/accounts/${userPrincipalsResponse.accounts[0].accountId}/orders`, {headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
    }, method: 'POST', body: qspost,}).then(res => {
        if (!res.ok) {
            updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
            return res.json().then(err => handleError(new HoError(err.error)))
        }
    })).catch(err => {
        updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
        return Promise.reject(err);
    });
}

export const usseTDInit = () => checkOauth().then(() => {
    const initWs = () => {
        if (!usseWs || !userPrincipalsResponse) {
            return Fetch('https://api.tdameritrade.com/v1/userprincipals?fields=streamerSubscriptionKeys,streamerConnectionInfo,preferences,surrogateIds', {headers: {Authorization: `Bearer ${tokens.access_token}`}}).then(res => res.json()).then(result => {
                //console.log(result);
                userPrincipalsResponse = result;
                const tokenTimeStampAsDateObj = new Date(userPrincipalsResponse.streamerInfo.tokenTimestamp);
                const tokenTimeStampAsMs = tokenTimeStampAsDateObj.getTime()
                const credentials = {
                    "userid": userPrincipalsResponse.accounts[0].accountId,
                    "token": userPrincipalsResponse.streamerInfo.token,
                    "company": userPrincipalsResponse.accounts[0].company,
                    "segment": userPrincipalsResponse.accounts[0].segment,
                    "cddomain": userPrincipalsResponse.accounts[0].accountCdDomainId,
                    "usergroup": userPrincipalsResponse.streamerInfo.userGroup,
                    "accesslevel": userPrincipalsResponse.streamerInfo.accessLevel,
                    "authorized": "Y",
                    "timestamp": tokenTimeStampAsMs,
                    "appid": userPrincipalsResponse.streamerInfo.appId,
                    "acl": userPrincipalsResponse.streamerInfo.acl
                }
                userPrincipalsResponse.credentials = Object.keys(credentials).map(key => `${encodeURIComponent(key)}=${encodeURIComponent(credentials[key])}`).join('&');

                usseWs = new Ws(`wss://${userPrincipalsResponse.streamerInfo.streamerSocketUrl}/ws`, {perMessageDeflate: false});
                usseWs.on('open', () => {
                    //auth
                    console.log('TD usse ticker open');
                    usseAuth(() => {
                        /*Mongo('find', TOTALDB, {setype: 'usse'}).then(item => {
                            if (item.length > 0) {
                                usseSubStock(item.map(v => v.index));
                            }
                        });*/
                        usseSubAccount();
                    });
                });
                usseWs.on('message', data => {
                    data = JSON.parse(data);
                    const res = (data.response || data.notify || data.data) ? (data.response || data.notify || data.data)[0] : null;
                    if (!res) {
                        console.log(data);
                    }
                    usseHandler(res);
                });
                usseWs.on('error', err => {
                    const msg = (err.message || err.msg) ? (err.message || err.msg) : '';
                    if (!msg) {
                        console.log(err);
                    }
                    sendWs(`TD Ameritrade Ws Error: ${msg}`, 0, 0, true);
                    handleError(err, `TD Ameritrade Ws Error`);
                });
                usseWs.on('close', () => {
                    userPrincipalsResponse = null;
                    usseWs = null;
                    console.log('TD usse ticker close');
                });
                usseOnAccount(data => {
                    if (data) {
                        data.forEach(d => {
                            console.log(d[2]);
                            console.log(d[3]);
                            if (d[2] === 'SUBSCRIBED') {
                            } else if (d[2] === 'ERROR') {
                                resetTD();
                            } else {
                                initialBook()/*.then(() => new Promise((resolve, reject) => Xmlparser.parseString(d[3], (err, result) => err ? reject(err) : resolve(result)))).then(result => {
                                    //const xmlMsg = result.OrderFillMessage || result.OrderPartialFillMessage;
                                    const xmlMsg = result.OrderFillMessage;
                                    if (xmlMsg && xmlMsg.ExecutionInformation) {
                                        console.log(xmlMsg.Order[0].Security[0].Symbol[0]);
                                        return Mongo('find', TOTALDB, {setype: 'usse', index: xmlMsg.Order[0].Security[0].Symbol[0]}).then(items => {
                                            if (items.length > 0) {
                                                const item = items[0];
                                                //const time = Math.round(new Date().getTime() / 1000);
                                                const time = Math.round(new Date(xmlMsg.ExecutionInformation[0].Timestamp[0]).getTime() / 1000);
                                                const price = xmlMsg.ExecutionInformation[0].ExecutionPrice[0];
                                                let profit = 0;
                                                if (xmlMsg.ExecutionInformation[0].Type[0] === 'Bought') {
                                                    let is_insert = false;
                                                    for (let k = 0; k < item.previous.buy.length; k++) {
                                                        if (price < item.previous.buy[k].price) {
                                                            item.previous.buy.splice(k, 0, {price, time});
                                                            is_insert = true;
                                                            break;
                                                        }
                                                    }
                                                    if (!is_insert) {
                                                        item.previous.buy.push({price, time});
                                                    }
                                                    item.previous = {
                                                        price,
                                                        time,
                                                        type: 'buy',
                                                        buy: item.previous.buy.filter(v => (time - v.time < RANGE_INTERVAL) ? true : false),
                                                        sell: item.previous.sell,
                                                    }
                                                } else if (xmlMsg.ExecutionInformation[0].Type[0] === 'sold') {
                                                    console.log(position);
                                                    const sellcount = xmlMsg.ExecutionInformation[0].Quantity[0];
                                                    for (let i = 0; i < position.length; i++) {
                                                        if (position[i].symbol === item.index) {
                                                            if (sellcount >= position[i].amount) {
                                                                console.log('td position close');
                                                                profit = price * sellcount * (1 - USSE_FEE) - position[i].amount * position[i].price;
                                                            }
                                                            break;
                                                        }
                                                    }
                                                    let is_insert = false;
                                                    for (let k = 0; k < item.previous.sell.length; k++) {
                                                        if (price > item.previous.sell[k].price) {
                                                            item.previous.sell.splice(k, 0, {price, time});
                                                            is_insert = true;
                                                            break;
                                                        }
                                                    }
                                                    if (!is_insert) {
                                                        item.previous.sell.push({price, time});
                                                    }
                                                    item.previous = {
                                                        price,
                                                        time,
                                                        type: 'sell',
                                                        sell: item.previous.sell.filter(v => (time - v.time < RANGE_INTERVAL) ? true : false),
                                                        buy: item.previous.buy,
                                                    }
                                                }
                                                item.profit = item.profit ? item.profit + profit : profit;
                                                return Mongo('update', TOTALDB, {_id: item._id}, {$set: {previous: item.previous, profit: item.profit}});
                                            }
                                        });
                                    }
                                }).catch(err => {
                                    sendWs(`TD Ameritrade XML Error: ${err.code} ${err.message}`, 0, 0, true);
                                    handleError(err, `TD Ameritrade XML Error`);
                                });*/
                            }
                        })
                    }
                });
                /*usseOnStock(data => {
                    console.log(data);
                    ussePrice = data.map(p => {
                        const ret = {};
                        ret[p['key']] = {
                            p: p[4],
                            t: p[7] / 1000,
                        };
                        return ret;
                    })
                });*/
            });
        } else {
            return Promise.resolve();
        }
    }
    const initialBook = (force = false) => {
        if (!usseWs || !userPrincipalsResponse) {
            return handleError(new HoError('TD cannot be inital book!!!'));
        }
        const now = Math.round(new Date().getTime() / 1000);
        if (force || (now - updateTime['book']) > UPDATE_ORDER) {
            updateTime['book'] = now;
            console.log(updateTime['book']);
            return Fetch(`https://api.tdameritrade.com/v1/accounts/${userPrincipalsResponse.accounts[0].accountId}?fields=positions,orders`, {headers: {Authorization: `Bearer ${tokens.access_token}`}}).then(res => res.json()).then(result => {
                console.log(result);
                if (result['error']) {
                    if (force === true) {
                        updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
                    }
                    return handleError(new HoError(result['error']));
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
                if (result['securitiesAccount']['orderStrategies']) {
                    const order_recur = index => {
                        if (index >= result['securitiesAccount']['orderStrategies'].length) {
                            return Promise.resolve();
                        } else {
                            const o = result['securitiesAccount']['orderStrategies'][index];
                            //console.log(o);
                            if (o.cancelable) {
                                order.push({
                                    id: o.orderId,
                                    time: new Date(o.enteredTime).getTime() / 1000,
                                    amount: o.orderLegCollection[0].instruction === 'BUY' ? o.quantity : -o.quantity,
                                    type: o.orderType,
                                    symbol: o.orderLegCollection[0].instrument.symbol,
                                    price: o.price,
                                    duration: o.duration,
                                });
                                return order_recur(index + 1);
                            } else if (o.orderActivityCollection && processedOrder.indexOf(o.orderId) === -1 && (o.orderActivityCollection[0].executionType === 'FILL'/* || o.orderActivityCollection[0].executionType === 'PARTIALFILL' || o.orderActivityCollection[0].executionType === 'PARTIAL FILL'*/)) {
                                console.log(o);
                                console.log(o.orderActivityCollection[0].executionLegs[0]);
                                processedOrder.push(o.orderId);
                                const symbol = o.orderLegCollection[0].instrument.symbol;
                                let profit = 0;
                                const type = o.orderLegCollection[0].instruction;
                                let time = 0;
                                //const time = Math.round(new Date(o.orderActivityCollection[0].executionLegs[0].time).getTime() / 1000);
                                //const price = o.orderActivityCollection[0].executionLegs[0].price;
                                let this_profit = 0;
                                let price = 0;
                                o.orderActivityCollection.forEach(oac => oac.executionLegs.forEach(oace => {
                                    time = Math.round(new Date(oace.time).getTime() / 1000);
                                    this_profit = this_profit + oace.quantity * oace.price;
                                    price = oace.price;
                                }));
                                console.log(symbol);
                                console.log(type);
                                console.log(time);
                                console.log(price);
                                console.log(this_profit);
                                if (this_profit <= 0) {
                                    return order_recur(index + 1);
                                }
                                return Mongo('find', TOTALDB, {setype: 'usse', index: symbol}).then(items => {
                                    if (items.length < 1) {
                                        console.log(`miss ${symbol}`);
                                        return order_recur(index + 1);
                                    }
                                    const item = items[0];
                                    if (type === 'BUY') {
                                        if (item.previous.buy[0] && item.previous.buy[0].time === time && item.previous.buy[0].price === price) {
                                            return order_recur(index + 1);
                                        }
                                        let is_insert = false;
                                        for (let k = 0; k < item.previous.buy.length; k++) {
                                            if (price < item.previous.buy[k].price) {
                                                item.previous.buy.splice(k, 0, {price, time});
                                                is_insert = true;
                                                break;
                                            }
                                        }
                                        if (!is_insert) {
                                            item.previous.buy.push({price, time});
                                        }
                                        item.previous = {
                                            price,
                                            time,
                                            type: 'buy',
                                            buy: item.previous.buy.filter(v => (time - v.time < RANGE_INTERVAL) ? true : false),
                                            sell: item.previous.sell,
                                        }
                                    } else {
                                        if (item.previous.sell[0] && item.previous.sell[0].time === time && item.previous.sell[0].price === price) {
                                            return order_recur(index + 1);
                                        }
                                        let is_insert = false;
                                        for (let k = 0; k < item.previous.sell.length; k++) {
                                            if (price > item.previous.sell[k].price) {
                                                item.previous.sell.splice(k, 0, {price, time});
                                                is_insert = true;
                                                break;
                                            }
                                        }
                                        if (!is_insert) {
                                            item.previous.sell.push({price, time});
                                        }
                                        item.previous = {
                                            price,
                                            time,
                                            type: 'sell',
                                            sell: item.previous.sell.filter(v => (time - v.time < RANGE_INTERVAL) ? true : false),
                                            buy: item.previous.buy,
                                        }
                                        //calculate profit
                                        console.log(lastP);
                                        console.log(position);
                                        if (lastP.length > 0) {
                                            let pp = 0;
                                            let cp = 0;
                                            for (let i = 0; i < lastP.length; i++) {
                                                if (lastP[i].symbol === item.index) {
                                                    pp = lastP[i].amount * lastP[i].price;
                                                    break;
                                                }
                                            }
                                            if (pp !== 0) {
                                                for (let i = 0; i < position.length; i++) {
                                                    if (position[i].symbol === item.index) {
                                                        cp = position[i].amount * position[i].price;
                                                        break;
                                                    }
                                                }
                                                console.log(pp);
                                                console.log(cp);
                                                profit = this_profit * (1 - USSE_FEE) - pp + cp;
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
                        }
                    }
                    return order_recur(0);
                }
            });
        } else {
            console.log('TD no new');
            return Promise.resolve();
        }
    }
    return initWs().then(() => initialBook()).then(() => {
        updateTime['trade']++;
        console.log(`td ${updateTime['trade']}`);
        if (updateTime['trade'] % Math.ceil(USSE_ORDER_INTERVAL / PRICE_INTERVAL) !== Math.floor(1800 / PRICE_INTERVAL)) {
            return Promise.resolve();
        } else {
            //避開交易時間
            const hour = new Date().getHours();
            if (USSE_MARKET_TIME[0] > USSE_MARKET_TIME[1]) {
                if (hour > USSE_MARKET_TIME[0] || hour < USSE_MARKET_TIME[1]) {
                    updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
                    return Promise.resolve();
                }
            } else if (hour > USSE_MARKET_TIME[0] && hour < USSE_MARKET_TIME[1]) {
                updateTime['trade'] = updateTime['trade'] < 1 ? 0 : updateTime['trade'] - 1;
                return Promise.resolve();
            }
        }
        return Mongo('find', TOTALDB, {setype: 'usse', sType: {$exists: false}}).then(items => {
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
                    const price = usseSuggestion[item.index].price;
                    console.log(item);
                    const cancelOrder = rest => initialBook(true).then(() => {
                        const real_id = order.filter(v => (v.symbol === item.index));
                        const real_delete = index => {
                            if (index >= real_id.length) {
                                return rest ? rest() : Promise.resolve();
                            }
                            return cancelTDOrder(real_id[index].id).catch(err => {
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
                                if ((item.orig - item.amount) > (newOrder[i].item.orig - newOrder[i].item.amount)) {
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
                            item.amount = item.orig;
                            for (let i = 0; i < position.length; i++) {
                                if (position[i].symbol === item.index) {
                                    item.count = position[i].amount;
                                    item.amount = item.orig - position[i].amount * position[i].price;
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
                            const order_avail = (available.tradable > 1) ? available.tradable - 1 : 0;
                            if (order_avail < suggestion.bCount * suggestion.buy) {
                                suggestion.bCount = Math.floor(order_avail / suggestion.buy);
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
                    } else {
                        return submitBuy();
                    }
                }
            }
            return recur_status(0).then(() => recur_NewOrder(0));
        });
    });
});

export const getUssePosition = () => {
    let is_exist = false;
    for (let i = 0; i < position.length; i++) {
        if (position[i].symbol === 0) {
            is_exist = true;
            break;
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
    if (!update) {
        usseLogout();
    }
}