import { TDAMERITRADE_KEY, GOOGLE_REDIRECT } from '../../../ver'
import { TD_AUTH_URL, TD_TOKEN_URL, TOTALDB, USSE_ORDER_INTERVAL, UPDATE_BOOK, PRICE_INTERVAL, USSE_ENTER_MID, UPDATE_ORDER } from '../constants'
import Fetch from 'node-fetch'
import { stringify as QStringify } from 'querystring'
import { handleError, HoError } from '../util/utility'
import Mongo from '../models/mongo-tool'
import { getSuggestionData } from '../models/stock-tool'
import sendWs from '../util/sendWs'
import Ws from 'ws'
import Event from 'events'

//let ussePrice = [];
let eventEmitter = new Event.EventEmitter();
let tokens = {};
let userPrincipalsResponse = null;
let usseWs = null;
let requestid = 0;
let emitter = [];
let updateTime = {book: 0, trade: 0};
let available = 0;
let order = [];
let position = [];

export const generateAuthUrl = () => `${TD_AUTH_URL}response_type=code&redirect_uri=${GOOGLE_REDIRECT}&client_id=${TDAMERITRADE_KEY}%40AMER.OAUTHAP`;

export const getToken = code => {
    const qspost = code ? QStringify({
        grant_type: 'authorization_code',
        refresh_token: '',
        access_type: 'offline',
        code: decodeURIComponent(code),
        client_id: TDAMERITRADE_KEY,
        redirect_uri: GOOGLE_REDIRECT,
    }) : (tokens && tokens.expiry_date < (Date.now() / 1000 + 30)) ? QStringify({
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
                sendWs(`TD AMERITRADE: Please refresh token in 7days`, 0, 0, true);
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
                    console.log(data);
                    if (data) {
                        data.forEach(d => {
                            console.log(d[1]);
                            console.log(d[2]);
                            console.log(d[3]);
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
    const initialBook = () => {
        if (!usseWs || !userPrincipalsResponse) {
            return handleError(new HoError('TD cannot be inital book!!!'));
        }
        const now = Math.round(new Date().getTime() / 1000);
        if ((now - updateTime['book']) > UPDATE_BOOK) {
            updateTime['book'] = now;
            console.log(updateTime['book']);
            return Fetch(`https://api.tdameritrade.com/v1/accounts/${userPrincipalsResponse.accounts[0].accountId}?fields=positions,orders`, {headers: {Authorization: `Bearer ${tokens.access_token}`}}).then(res => res.json()).then(result => {
                console.log(result);
                //init book
                if (result['securitiesAccount']['projectedBalances']) {
                    available = result['securitiesAccount']['projectedBalances']['cashAvailableForWithdrawal'];
                }
                if (result['securitiesAccount']['positions']) {
                    position = result['securitiesAccount']['positions'].map(p => ({
                        symbol: p.instrument.symbol,
                        amount: p.longQuantity,
                        price: p.averagePrice,
                        //market: p.marketValue,
                    }));
                }
                if (result['securitiesAccount']['orderStrategies']) {
                    order = result['securitiesAccount']['orderStrategies'];
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
        if (updateTime['trade'] % Math.ceil(USSE_ORDER_INTERVAL / PRICE_INTERVAL) !== Math.floor(1200 / /*PRICE_INTERVAL*/1200)) {
            return Promise.resolve();
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
                    /*item.count = 0;
                    item.amount = item.orig;
                    for (let i = 0; i < position.length; i++) {
                        if (position[i].symbol === item.index) {
                            item.count = position[i].amount;
                            item.amount = item.amount - position[i].amount * position[i].price;
                            break;
                        }
                    }*/
                    console.log(item);
                    const cancelOrder = rest => {
                        //sync first
                        return rest ? rest() : Promise.resolve();
                    }
                    const startStatus = () => cancelOrder().then(() => {
                        if (usseSuggestion[item.index]) {
                            let is_insert = false;
                            for (let i = 0; i < newOrder.length; i++) {
                                if (item.orig > newOrder[i].item.orig) {
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
                        const sellAll = () => {
                            const delTotal = () => Mongo('remove', TOTALDB, {_id: item._id, $isolated: 1}).then(() => recur_status(index + 1));
                            return delTotal();
                        }
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
                console.log(newOrder);
                return Promise.resolve();
            }
            return recur_status(0).then(() => recur_NewOrder(0));
        });
    });
});

//export const getUssePrice = () => ussePrice;
export const getUssePosition = () => {
    //sync first
    return position;
}

export const resetTD = (update=false) => {
    console.log('TD reset');
    if (update) {
        const trade_count = updateTime['trade'];
        updateTime = {};
        updateTime['book'] = 0;
        updateTime['trade'] = trade_count;
    } else {
        usseLogout();
    }
}