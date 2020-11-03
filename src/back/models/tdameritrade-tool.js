import { TDAMERITRADE_KEY, GOOGLE_REDIRECT } from '../../../ver'
import { TD_AUTH_URL, TD_TOKEN_URL, TOTALDB } from '../constants'
import Fetch from 'node-fetch'
import { stringify as QStringify } from 'querystring'
import { handleError, HoError } from '../util/utility'
import Mongo from '../models/mongo-tool'
import sendWs from '../util/sendWs'
import Ws from 'ws'
import Event from 'events'

let eventEmitter = new Event.EventEmitter();
let tokens = {};
let userPrincipalsResponse = null;
let usseWs = null;
let requestid = 0;
let emitter = [];
let ussePrice = {};

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
        return handleError(new HoError('TD cannot be logouted!!!'));
    }
    eventEmitter.once('LOGOUT', data => {
        switch(data.code) {
            case 0:
            console.log("TD auth's done logout");
            usseWs.close();
            break;
            default:
            usseWs.close();
            return handleError(new HoError(`TD LOGOUT FAIL: ${data.msg}`));
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

export const usseTDTicker = () => checkOauth().then(() => Fetch('https://api.tdameritrade.com/v1/userprincipals?fields=streamerSubscriptionKeys,streamerConnectionInfo,preferences,surrogateIds', {headers: {Authorization: `Bearer ${tokens.access_token}`}})).then(res => res.json()).then(result => {
    console.log(result);
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

    return Fetch(`https://api.tdameritrade.com/v1/accounts/${userPrincipalsResponse.accounts[0].accountId}?fields=positions,orders`, {headers: {Authorization: `Bearer ${tokens.access_token}`}}).then(res => res.json()).then(result => {
        console.log(result);
        usseWs = new Ws(`wss://${userPrincipalsResponse.streamerInfo.streamerSocketUrl}/ws`, {perMessageDeflate: false});

        usseWs.on('open', () => {
            //auth
            console.log('TD usse ticker open');
            usseAuth(() => {
                Mongo('find', TOTALDB, {setype: 'usse'}).then(item => {
                    if (item.length > 0) {
                        usseSubStock(item.map(v => v.index));
                    }
                    //usseSubAccount();
                    //usseLogout();
                });
            });
        });
        usseWs.on('message', data => {
            data = JSON.parse(data);
            const res = (data.response || data.notify || data.data) ? (data.response || data.notify || data.data)[0] : null;
            if (!res) {
                console.log(data);
            }
            if (res.service === 'ADMIN' && res.command === 'LOGIN') {
                return eventEmitter.emit('LOGIN', res.content);
            }
            if (res.service === 'ADMIN' && res.command === 'LOGOUT') {
                return eventEmitter.emit('LOGOUT', res.content);
            }
            /*if (res.service === 'CHART_EQUITY') {
                return eventEmitter.emit('STOCK', res.content);
            }*/
            if (res.service === 'ACCT_ACTIVITY') {
                return eventEmitter.emit('ACCOUNT', res.content);
            }
            if (res.heartbeat) {
                return true;
            }
            console.log(res);
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
            console.log('TD usse ticker close');
        });

        usseOnStock(data => {
            console.log(data);
            ussePrice = data.map(p => {
                const ret = {};
                ret[p['key']] = {
                    p: p[4],
                    t: p[7] / 1000,
                };
                return ret;
            })
        });

        usseOnAccount(data => {
            console.log(data);
        });
    });
});

export const getUssePrice = () => ussePrice;