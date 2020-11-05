'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.resetTD = exports.getUssePosition = exports.usseTDInit = exports.usseSubStock = exports.getToken = exports.generateAuthUrl = undefined;

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _keys = require('babel-runtime/core-js/object/keys');

var _keys2 = _interopRequireDefault(_keys);

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _ver = require('../../../ver');

var _constants = require('../constants');

var _nodeFetch = require('node-fetch');

var _nodeFetch2 = _interopRequireDefault(_nodeFetch);

var _querystring = require('querystring');

var _utility = require('../util/utility');

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

var _sendWs = require('../util/sendWs');

var _sendWs2 = _interopRequireDefault(_sendWs);

var _ws = require('ws');

var _ws2 = _interopRequireDefault(_ws);

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

//let ussePrice = [];
var eventEmitter = new _events2.default.EventEmitter();
var tokens = {};
var userPrincipalsResponse = null;
var usseWs = null;
var requestid = 0;
var emitter = [];
var updateTime = { book: 0, trade: 0 };
var available = 0;
var order = [];
var position = [];

var generateAuthUrl = exports.generateAuthUrl = function generateAuthUrl() {
    return _constants.TD_AUTH_URL + 'response_type=code&redirect_uri=' + _ver.GOOGLE_REDIRECT + '&client_id=' + _ver.TDAMERITRADE_KEY + '%40AMER.OAUTHAP';
};

var getToken = exports.getToken = function getToken(code) {
    var qspost = code ? (0, _querystring.stringify)({
        grant_type: 'authorization_code',
        refresh_token: '',
        access_type: 'offline',
        code: decodeURIComponent(code),
        client_id: _ver.TDAMERITRADE_KEY,
        redirect_uri: _ver.GOOGLE_REDIRECT
    }) : tokens && tokens.expiry_date < Date.now() / 1000 + 30 ? (0, _querystring.stringify)({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        access_type: '',
        code: '',
        client_id: _ver.TDAMERITRADE_KEY,
        redirect_uri: ''
    }) : null;

    return qspost ? (0, _nodeFetch2.default)(_constants.TD_TOKEN_URL, {
        method: 'POST',
        body: qspost,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': qspost.length
        }
    }).then(function (res) {
        return res.json();
    }).then(function (token) {
        if (token.error) {
            return (0, _utility.handleError)(new _utility.HoError(token.error));
        }
        if (token['expires_in']) {
            token['expiry_date'] = Math.floor(Date.now() / 1000) + token['expires_in'];
        }
        if (token['refresh_token_expires_in']) {
            token['refresh_token_expiry_date'] = Math.floor(Date.now() / 1000) + token['refresh_token_expires_in'];
        } else {
            if (tokens && tokens.refresh_token_expiry_date < Date.now() / 1000 + 604800) {
                (0, _sendWs2.default)('TD AMERITRADE: Please refresh token in 7days', 0, 0, true);
            }
        }
        console.log(token);
        return (0, _mongoTool2.default)('find', 'accessToken', { api: 'tdameritrade' }).then(function (items) {
            if (items.length > 0) {
                return (0, _mongoTool2.default)('update', 'accessToken', { api: 'tdameritrade' }, { $set: token }).then(function (item) {
                    console.log(item);
                    (0, _assign2.default)(tokens, token);
                });
            } else {
                return (0, _mongoTool2.default)('insert', 'accessToken', (0, _assign2.default)({ api: 'tdameritrade' }, token)).then(function (item) {
                    console.log(item);
                    tokens = item[0];
                });
            }
        });
    }) : _promise2.default.resolve();
};

var checkOauth = function checkOauth() {
    return !tokens.access_token || !tokens.expiry_date ? (0, _mongoTool2.default)('find', 'accessToken', { api: 'tdameritrade' }, { limit: 1 }).then(function (token) {
        if (token.length === 0) {
            return (0, _utility.handleError)(new _utility.HoError('can not find token'));
        }
        console.log('td first');
        tokens = token[0];
        console.log(tokens);
    }).then(function () {
        return getToken();
    }) : getToken();
};

var usseAuth = function usseAuth(fn) {
    if (!usseWs || !userPrincipalsResponse) {
        return (0, _utility.handleError)(new _utility.HoError('TD cannot be authed!!!'));
    }
    eventEmitter.once('LOGIN', function (data) {
        switch (data.code) {
            case 0:
                console.log("TD auth's done");
                fn();
                break;
            case 3:
            default:
                usseWs.close();
                return (0, _utility.handleError)(new _utility.HoError('TD LOGIN FAIL: ' + data.msg));
        }
    });
    usseWs.send((0, _stringify2.default)({
        "requests": [{
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
        }]
    }));
};

var usseLogout = function usseLogout() {
    if (!usseWs || !userPrincipalsResponse) {
        console.log('TD has already shut down!!!');
        return true;
        //return handleError(new HoError('TD cannot be logouted!!!'));
    }
    eventEmitter.once('LOGOUT', function (data) {
        switch (data.code) {
            case 0:
                console.log("TD auth's done logout");
                usseWs.close();
                break;
            default:
                console.log('TD LOGOUT FAIL: ' + data.msg);
                usseWs.close();
                //return handleError(new HoError(`TD LOGOUT FAIL: ${data.msg}`));
                break;
        }
    });
    usseWs.send((0, _stringify2.default)({
        "requests": [{
            "service": "ADMIN",
            "requestid": (requestid++).toString(),
            "command": "LOGOUT",
            "account": userPrincipalsResponse.accounts[0].accountId,
            "source": userPrincipalsResponse.streamerInfo.appId,
            "parameters": {}
        }]
    }));
};

var usseSubAccount = function usseSubAccount() {
    var sub = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : true;

    if (!usseWs || !userPrincipalsResponse) {
        return (0, _utility.handleError)(new _utility.HoError('TD cannot be subscript!!!'));
    }
    usseWs.send((0, _stringify2.default)({
        "requests": [{
            "service": "ACCT_ACTIVITY",
            "requestid": (requestid++).toString(),
            "command": "SUBS",
            "account": userPrincipalsResponse.accounts[0].accountId,
            "source": userPrincipalsResponse.streamerInfo.appId,
            "parameters": {
                "keys": userPrincipalsResponse.streamerSubscriptionKeys.keys[0].key,
                "fields": "0,1,2,3"
            }
        }]
    }));
};

var usseOnAccount = function usseOnAccount(fn) {
    eventEmitter.on('ACCOUNT', function (data) {
        if (data.hasOwnProperty('code')) {
            switch (data.code) {
                case 0:
                    console.log(data.msg);
                    break;
                default:
                    return (0, _utility.handleError)(new _utility.HoError('TD subscript account FAIL: ' + data.msg));
            }
        } else {
            fn(data);
        }
    });
};

var usseSubStock = exports.usseSubStock = function usseSubStock(symbol) {
    var sub = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;

    if (!usseWs || !userPrincipalsResponse) {
        return (0, _utility.handleError)(new _utility.HoError('TD cannot be subscript!!!'));
    }
    usseWs.send((0, _stringify2.default)({
        "requests": [{
            "service": "CHART_EQUITY",
            "requestid": (requestid++).toString(),
            "command": sub ? "SUBS" : 'ADD',
            "account": userPrincipalsResponse.accounts[0].accountId,
            "source": userPrincipalsResponse.streamerInfo.appId,
            "parameters": {
                "keys": symbol.join(',').toUpperCase(),
                "fields": "0,1,2,3,4,5,6,7,8"
            }
        }]
    }));
};

var usseOnStock = function usseOnStock(fn) {
    eventEmitter.on('STOCK', function (data) {
        if (data.hasOwnProperty('code')) {
            switch (data.code) {
                case 0:
                    console.log(data.msg);
                    break;
                default:
                    return (0, _utility.handleError)(new _utility.HoError('TD subscript ' + symbol.join(',').toUpperCase() + ' FAIL: ' + data.msg));
            }
        } else {
            fn(data);
        }
    });
};

var usseHandler = function usseHandler(res) {
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
};

var usseTDInit = exports.usseTDInit = function usseTDInit() {
    return checkOauth().then(function () {
        var initWs = function initWs() {
            if (!usseWs || !userPrincipalsResponse) {
                return (0, _nodeFetch2.default)('https://api.tdameritrade.com/v1/userprincipals?fields=streamerSubscriptionKeys,streamerConnectionInfo,preferences,surrogateIds', { headers: { Authorization: 'Bearer ' + tokens.access_token } }).then(function (res) {
                    return res.json();
                }).then(function (result) {
                    //console.log(result);
                    userPrincipalsResponse = result;
                    var tokenTimeStampAsDateObj = new Date(userPrincipalsResponse.streamerInfo.tokenTimestamp);
                    var tokenTimeStampAsMs = tokenTimeStampAsDateObj.getTime();
                    var credentials = {
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
                    };
                    userPrincipalsResponse.credentials = (0, _keys2.default)(credentials).map(function (key) {
                        return encodeURIComponent(key) + '=' + encodeURIComponent(credentials[key]);
                    }).join('&');

                    usseWs = new _ws2.default('wss://' + userPrincipalsResponse.streamerInfo.streamerSocketUrl + '/ws', { perMessageDeflate: false });
                    usseWs.on('open', function () {
                        //auth
                        console.log('TD usse ticker open');
                        usseAuth(function () {
                            /*Mongo('find', TOTALDB, {setype: 'usse'}).then(item => {
                                if (item.length > 0) {
                                    usseSubStock(item.map(v => v.index));
                                }
                            });*/
                            usseSubAccount();
                        });
                    });
                    usseWs.on('message', function (data) {
                        data = JSON.parse(data);
                        var res = data.response || data.notify || data.data ? (data.response || data.notify || data.data)[0] : null;
                        if (!res) {
                            console.log(data);
                        }
                        usseHandler(res);
                    });
                    usseWs.on('error', function (err) {
                        var msg = err.message || err.msg ? err.message || err.msg : '';
                        if (!msg) {
                            console.log(err);
                        }
                        (0, _sendWs2.default)('TD Ameritrade Ws Error: ' + msg, 0, 0, true);
                        (0, _utility.handleError)(err, 'TD Ameritrade Ws Error');
                    });
                    usseWs.on('close', function () {
                        userPrincipalsResponse = null;
                        usseWs = null;
                        console.log('TD usse ticker close');
                    });
                    usseOnAccount(function (data) {
                        console.log(data);
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
                return _promise2.default.resolve();
            }
        };
        var initialBook = function initialBook() {
            if (!usseWs || !userPrincipalsResponse) {
                return (0, _utility.handleError)(new _utility.HoError('TD cannot be inital book!!!'));
            }
            var now = Math.round(new Date().getTime() / 1000);
            if (now - updateTime['book'] > _constants.UPDATE_BOOK) {
                return (0, _nodeFetch2.default)('https://api.tdameritrade.com/v1/accounts/' + userPrincipalsResponse.accounts[0].accountId + '?fields=positions,orders', { headers: { Authorization: 'Bearer ' + tokens.access_token } }).then(function (res) {
                    return res.json();
                }).then(function (result) {
                    console.log(result);
                    //init book
                    if (result['securitiesAccount']['projectedBalances']) {
                        available = result['securitiesAccount']['projectedBalances']['cashAvailableForWithdrawal'];
                    }
                    if (result['securitiesAccount']['positions']) {
                        position = result['securitiesAccount']['positions'].map(function (p) {
                            return {
                                symbol: p.instrument.symbol,
                                amount: p.longQuantity,
                                price: p.averagePrice
                            };
                        });
                    }
                    if (result['securitiesAccount']['orderStrategies']) {
                        order = result['securitiesAccount']['orderStrategies'];
                    }
                });
            } else {
                console.log('TD no new');
                return _promise2.default.resolve();
            }
        };
        return initWs().then(function () {
            return initialBook();
        }).then(function () {
            updateTime['trade']++;
            console.log('td ' + updateTime['trade']);
            if (updateTime['trade'] % Math.ceil(_constants.USSE_ORDER_INTERVAL / _constants.PRICE_INTERVAL) !== Math.floor(1200 / /*PRICE_INTERVAL*/1200)) {
                return _promise2.default.resolve();
            }
            return (0, _mongoTool2.default)('find', _constants.TOTALDB, { setype: 'usse', sType: { $exists: false } }).then(function (items) {
                var newOrder = [];
                var ussePrice = {};
                var recur_status = function recur_status(index) {
                    if (index >= items.length) {
                        return _promise2.default.resolve();
                    } else {
                        var _ret = function () {
                            var item = items[index];
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
                            var cancelOrder = function cancelOrder(rest) {};
                            var startStatus = function startStatus() {};
                            if (item.ing === 2) {
                                var sellAll = function sellAll() {};
                                return {
                                    v: cancelOrder(sellAll)
                                };
                            } else if (item.ing === 1) {
                                if (ussePrice[item.index].lastPrice) {
                                    return {
                                        v: startStatus()
                                    };
                                } else {
                                    return {
                                        v: recur_status(index + 1)
                                    };
                                }
                            } else {
                                if ((ussePrice[item.index].lastPrice - item.mid) / item.mid * 100 < _constants.USSE_ENTER_MID) {
                                    return {
                                        v: (0, _mongoTool2.default)('update', _constants.TOTALDB, { _id: item._id }, { $set: { ing: 1 } }).then(function (result) {
                                            if (ussePrice[item.index].lastPrice) {
                                                return startStatus();
                                            } else {
                                                return recur_status(index + 1);
                                            }
                                        })
                                    };
                                } else {
                                    console.log('enter_mid');
                                    console.log((ussePrice[item.index].lastPrice - item.mid) / item.mid * 100);
                                    return {
                                        v: recur_status(index + 1)
                                    };
                                }
                            }
                        }();

                        if ((typeof _ret === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret)) === "object") return _ret.v;
                    }
                };
            });
        });
    });
};

//export const getUssePrice = () => ussePrice;
var getUssePosition = exports.getUssePosition = function getUssePosition() {
    return position;
};

var resetTD = exports.resetTD = function resetTD() {
    var update = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

    console.log('TD reset');
    if (update) {
        var trade_count = updateTime['trade'];
        updateTime = {};
        updateTime['book'] = 0;
        updateTime['trade'] = trade_count;
    } else {
        usseLogout();
    }
};