'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.resetTD = exports.getUsseOrder = exports.getUssePosition = exports.usseTDInit = exports.usseSubStock = exports.getToken = exports.generateAuthUrl = undefined;

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

var _stockTool = require('../models/stock-tool');

var _sendWs = require('../util/sendWs');

var _sendWs2 = _interopRequireDefault(_sendWs);

var _ws = require('ws');

var _ws2 = _interopRequireDefault(_ws);

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

var _xml2js = require('xml2js');

var _xml2js2 = _interopRequireDefault(_xml2js);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var Xmlparser = new _xml2js2.default.Parser();

var eventEmitter = new _events2.default.EventEmitter();
var tokens = {};
var userPrincipalsResponse = null;
var usseWs = null;
var requestid = 0;
var emitter = [];
var updateTime = { book: 0, trade: 0 };
var available = { tradable: 0, cash: 0 };
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
    }) : tokens && tokens.expiry_date < Date.now() / 1000 + 590 ? (0, _querystring.stringify)({
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

var cancelTDOrder = function cancelTDOrder(id) {
    if (!usseWs || !userPrincipalsResponse) {
        return (0, _utility.handleError)(new _utility.HoError('TD cannot cancel order!!!'));
    }
    return checkOauth().then(function () {
        return (0, _nodeFetch2.default)('https://api.tdameritrade.com/v1/accounts/' + userPrincipalsResponse.accounts[0].accountId + '/orders/' + id, { headers: { Authorization: 'Bearer ' + tokens.access_token }, method: 'DELETE' }).then(function (res) {
            if (!res.ok) {
                return res.json().then(function (err) {
                    return (0, _utility.handleError)(new _utility.HoError(err.error));
                });
            }
        });
    });
};

var submitTDOrder = function submitTDOrder(id, price, count) {
    if (!usseWs || !userPrincipalsResponse) {
        return (0, _utility.handleError)(new _utility.HoError('TD cannot cancel order!!!'));
    }
    var qspost = (0, _stringify2.default)((0, _assign2.default)({
        session: "SEAMLESS",
        duration: "GOOD_TILL_CANCEL",
        orderStrategyType: "SINGLE",
        orderLegCollection: [{
            "instruction": count > 0 ? "Buy" : 'SELL',
            "quantity": Math.abs(count),
            "instrument": {
                "symbol": id,
                "assetType": "EQUITY"
            }
        }]
    }, price === 'MARKET' ? { orderType: "MARKET" } : { orderType: 'LIMIT', price: price }));
    return checkOauth().then(function () {
        return (0, _nodeFetch2.default)('https://api.tdameritrade.com/v1/accounts/' + userPrincipalsResponse.accounts[0].accountId + '/orders', { headers: {
                Authorization: 'Bearer ' + tokens.access_token,
                'Content-Type': 'application/json'
            }, method: 'POST', body: qspost }).then(function (res) {
            if (!res.ok) {
                return res.json().then(function (err) {
                    return (0, _utility.handleError)(new _utility.HoError(err.error));
                });
            }
        });
    });
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
                        if (data) {
                            data.forEach(function (d) {
                                console.log(d[2]);
                                console.log(d[3]);
                                if (d[2] === 'SUBSCRIBED') {} else if (d[2] === 'ERROR') {
                                    resetTD();
                                } else {
                                    initialBook().then(function () {
                                        return new _promise2.default(function (resolve, reject) {
                                            return Xmlparser.parseString(d[3], function (err, result) {
                                                return err ? reject(err) : resolve(result);
                                            });
                                        });
                                    }).then(function (result) {
                                        //const xmlMsg = result.OrderFillMessage || result.OrderPartialFillMessage;
                                        var xmlMsg = result.OrderFillMessage;
                                        if (xmlMsg && xmlMsg.ExecutionInformation) {
                                            console.log(xmlMsg.Order[0].Security[0].Symbol[0]);
                                            return (0, _mongoTool2.default)('find', _constants.TOTALDB, { setype: 'usse', index: xmlMsg.Order[0].Security[0].Symbol[0] }).then(function (items) {
                                                if (items.length > 0) {
                                                    var _ret = function () {
                                                        var item = items[0];
                                                        var time = Math.round(new Date().getTime() / 1000);
                                                        var price = xmlMsg.ExecutionInformation[0].ExecutionPrice[0];
                                                        if (xmlMsg.ExecutionInformation[0].Type[0] === 'Bought') {
                                                            var is_insert = false;
                                                            for (var k = 0; k < item.previous.buy.length; k++) {
                                                                if (price < item.previous.buy[k].price) {
                                                                    item.previous.buy.splice(k, 0, { price: price, time: time });
                                                                    is_insert = true;
                                                                    break;
                                                                }
                                                            }
                                                            if (!is_insert) {
                                                                item.previous.buy.push({ price: price, time: time });
                                                            }
                                                            item.previous = {
                                                                price: price,
                                                                time: time,
                                                                type: 'buy',
                                                                buy: item.previous.buy.filter(function (v) {
                                                                    return time - v.time < _constants.RANGE_INTERVAL ? true : false;
                                                                }),
                                                                sell: item.previous.sell
                                                            };
                                                        } else if (xmlMsg.ExecutionInformation[0].Type[0] === 'sold') {
                                                            var _is_insert = false;
                                                            for (var _k = 0; _k < item.previous.sell.length; _k++) {
                                                                if (price > item.previous.sell[_k].price) {
                                                                    item.previous.sell.splice(_k, 0, { price: price, time: time });
                                                                    _is_insert = true;
                                                                    break;
                                                                }
                                                            }
                                                            if (!_is_insert) {
                                                                item.previous.sell.push({ price: price, time: time });
                                                            }
                                                            item.previous = {
                                                                price: price,
                                                                time: time,
                                                                type: 'sell',
                                                                sell: item.previous.sell.filter(function (v) {
                                                                    return time - v.time < _constants.RANGE_INTERVAL ? true : false;
                                                                }),
                                                                buy: item.previous.buy
                                                            };
                                                        }
                                                        return {
                                                            v: (0, _mongoTool2.default)('update', _constants.TOTALDB, { _id: item._id }, { $set: { previous: item.previous } })
                                                        };
                                                    }();

                                                    if ((typeof _ret === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret)) === "object") return _ret.v;
                                                }
                                            });
                                        }
                                    }).catch(function (err) {
                                        (0, _sendWs2.default)('TD Ameritrade XML Error: ' + err.code + ' ' + err.message, 0, 0, true);
                                        (0, _utility.handleError)(err, 'TD Ameritrade XML Error');
                                    });
                                }
                            });
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
                return _promise2.default.resolve();
            }
        };
        var initialBook = function initialBook() {
            var force = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

            if (!usseWs || !userPrincipalsResponse) {
                return (0, _utility.handleError)(new _utility.HoError('TD cannot be inital book!!!'));
            }
            var now = Math.round(new Date().getTime() / 1000);
            if (force || now - updateTime['book'] > _constants.UPDATE_ORDER) {
                updateTime['book'] = now;
                console.log(updateTime['book']);
                return (0, _nodeFetch2.default)('https://api.tdameritrade.com/v1/accounts/' + userPrincipalsResponse.accounts[0].accountId + '?fields=positions,orders', { headers: { Authorization: 'Bearer ' + tokens.access_token } }).then(function (res) {
                    return res.json();
                }).then(function (result) {
                    console.log(result);
                    if (result['error']) {
                        return (0, _utility.handleError)(new _utility.HoError(result['error']));
                    }
                    //init book
                    if (result['securitiesAccount']['projectedBalances']) {
                        available = {
                            tradable: result['securitiesAccount']['projectedBalances']['cashAvailableForWithdrawal'],
                            cash: result['securitiesAccount']['currentBalances'].totalCash
                        };
                    }
                    if (result['securitiesAccount']['positions']) {
                        position = result['securitiesAccount']['positions'].map(function (p) {
                            return {
                                symbol: p.instrument.symbol,
                                amount: p.longQuantity,
                                price: p.averagePrice
                            };
                        });
                    } else {
                        position = [];
                    }
                    order = [];
                    if (result['securitiesAccount']['orderStrategies']) {
                        result['securitiesAccount']['orderStrategies'].forEach(function (o) {
                            //console.log(o);
                            if (o.cancelable) {
                                order.push({
                                    id: o.orderId,
                                    time: new Date(o.enteredTime).getTime() / 1000,
                                    amount: o.orderLegCollection[0].instruction === 'BUY' ? o.quantity : -o.quantity,
                                    type: o.orderType,
                                    symbol: o.orderLegCollection[0].instrument.symbol,
                                    price: o.price,
                                    duration: o.duration
                                });
                            }
                        });
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
            if (updateTime['trade'] % Math.ceil(_constants.USSE_ORDER_INTERVAL / _constants.PRICE_INTERVAL) !== Math.floor(1800 / _constants.PRICE_INTERVAL)) {
                return _promise2.default.resolve();
            } else {
                //避開交易時間
                var hour = new Date().getHours();
                if (_constants.USSE_MATKET_TIME[0] > _constants.USSE_MATKET_TIME[1]) {
                    if (hour > _constants.USSE_MATKET_TIME[0] || hour < _constants.USSE_MATKET_TIME[1]) {
                        updateTime['trade']--;
                        return _promise2.default.resolve();
                    }
                } else if (hour > _constants.USSE_MATKET_TIME[0] && hour < _constants.USSE_MATKET_TIME[1]) {
                    updateTime['trade']--;
                    return _promise2.default.resolve();
                }
            }
            return (0, _mongoTool2.default)('find', _constants.TOTALDB, { setype: 'usse', sType: { $exists: false } }).then(function (items) {
                var newOrder = [];
                var usseSuggestion = (0, _stockTool.getSuggestionData)('usse');
                console.log(usseSuggestion);
                var recur_status = function recur_status(index) {
                    if (index >= items.length) {
                        return _promise2.default.resolve();
                    } else {
                        var _ret2 = function () {
                            var item = items[index];
                            if (item.index === 0 || !usseSuggestion[item.index]) {
                                return {
                                    v: recur_status(index + 1)
                                };
                            }
                            var price = usseSuggestion[item.index].price;
                            console.log(item);
                            var cancelOrder = function cancelOrder(rest) {
                                return initialBook(true).then(function () {
                                    var real_id = order.filter(function (v) {
                                        return v.symbol === item.index;
                                    });
                                    var real_delete = function real_delete(index) {
                                        if (index >= real_id.length) {
                                            return rest ? rest() : _promise2.default.resolve();
                                        }
                                        return cancelTDOrder(real_id[index].id).catch(function (err) {
                                            console.log(order);
                                            (0, _sendWs2.default)(real_id[index].id + ' TD cancelOrder Error: ' + (err.message || err.msg), 0, 0, true);
                                            (0, _utility.handleError)(err, real_id[index].id + ' TDcancelOrder Error');
                                        }).then(function () {
                                            return new _promise2.default(function (resolve, reject) {
                                                return setTimeout(function () {
                                                    return resolve();
                                                }, 5000);
                                            }).then(function () {
                                                return real_delete(index + 1);
                                            });
                                        });
                                    };
                                    return real_delete(0);
                                });
                            };
                            var startStatus = function startStatus() {
                                return cancelOrder().then(function () {
                                    if (usseSuggestion[item.index]) {
                                        var is_insert = false;
                                        for (var i = 0; i < newOrder.length; i++) {
                                            if (item.orig > newOrder[i].item.orig) {
                                                newOrder.splice(i, 0, { item: item, suggestion: usseSuggestion[item.index] });
                                                is_insert = true;
                                                break;
                                            }
                                        }
                                        if (!is_insert) {
                                            newOrder.push({ item: item, suggestion: usseSuggestion[item.index] });
                                        }
                                    }
                                    return recur_status(index + 1);
                                });
                            };
                            if (item.ing === 2) {
                                var sellAll = function sellAll() {
                                    return initialBook(true).then(function () {
                                        var delTotal = function delTotal() {
                                            return (0, _mongoTool2.default)('remove', _constants.TOTALDB, { _id: item._id, $isolated: 1 }).then(function () {
                                                return recur_status(index + 1);
                                            });
                                        };
                                        item.count = 0;
                                        item.amount = item.orig;
                                        for (var i = 0; i < position.length; i++) {
                                            if (position[i].symbol === item.index) {
                                                item.count = position[i].amount;
                                                item.amount = item.orig - position[i].amount * position[i].price;
                                                break;
                                            }
                                        }
                                        if (item.count > 0) {
                                            return submitTDOrder(item.index, 'MARKET', -item.count).then(function () {
                                                return new _promise2.default(function (resolve, reject) {
                                                    return setTimeout(function () {
                                                        return resolve();
                                                    }, 3000);
                                                });
                                            }).then(function () {
                                                return delTotal();
                                            });
                                        } else {
                                            return delTotal();
                                        }
                                    });
                                };
                                return {
                                    v: cancelOrder(sellAll)
                                };
                            } else if (item.ing === 1) {
                                if (price) {
                                    return {
                                        v: startStatus()
                                    };
                                } else {
                                    return {
                                        v: recur_status(index + 1)
                                    };
                                }
                            } else {
                                if ((price - item.mid) / item.mid * 100 < _constants.USSE_ENTER_MID) {
                                    return {
                                        v: (0, _mongoTool2.default)('update', _constants.TOTALDB, { _id: item._id }, { $set: { ing: 1 } }).then(function (result) {
                                            if (price) {
                                                return startStatus();
                                            } else {
                                                return recur_status(index + 1);
                                            }
                                        })
                                    };
                                } else {
                                    console.log('enter_mid');
                                    console.log((price - item.mid) / item.mid * 100);
                                    return {
                                        v: recur_status(index + 1)
                                    };
                                }
                            }
                        }();

                        if ((typeof _ret2 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret2)) === "object") return _ret2.v;
                    }
                };
                var recur_NewOrder = function recur_NewOrder(index) {
                    if (index >= newOrder.length) {
                        return _promise2.default.resolve();
                    } else {
                        var _ret3 = function () {
                            var item = newOrder[index].item;
                            var suggestion = newOrder[index].suggestion;
                            var submitBuy = function submitBuy() {
                                return initialBook(true).then(function () {
                                    console.log(available);
                                    var order_avail = available.tradable > 1 ? available.tradable - 1 : 0;
                                    if (order_avail < suggestion.bCount * suggestion.buy) {
                                        suggestion.bCount = Math.floor(order_avail / suggestion.buy * 10000) / 10000;
                                    }
                                    if (suggestion.bCount > 0 && suggestion.buy) {
                                        console.log('buy ' + item.index + ' ' + suggestion.bCount + ' ' + suggestion.buy);
                                        return submitTDOrder(item.index, suggestion.buy, suggestion.bCount).then(function () {
                                            return new _promise2.default(function (resolve, reject) {
                                                return setTimeout(function () {
                                                    return resolve();
                                                }, 3000);
                                            });
                                        }).then(function () {
                                            return recur_NewOrder(index + 1);
                                        });
                                    } else {
                                        return recur_NewOrder(index + 1);
                                    }
                                });
                            };
                            if (suggestion.sCount > 0 && suggestion.sell) {
                                console.log('sell ' + item.index + ' ' + suggestion.sCount + ' ' + suggestion.sell);
                                return {
                                    v: submitTDOrder(item.index, suggestion.sell, -suggestion.sCount).then(function () {
                                        return new _promise2.default(function (resolve, reject) {
                                            return setTimeout(function () {
                                                return resolve();
                                            }, 3000);
                                        });
                                    }).then(function () {
                                        return submitBuy();
                                    })
                                };
                            } else {
                                return {
                                    v: submitBuy()
                                };
                            }
                        }();

                        if ((typeof _ret3 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret3)) === "object") return _ret3.v;
                    }
                };
                return recur_status(0).then(function () {
                    return recur_NewOrder(0);
                });
            });
        });
    });
};

var getUssePosition = exports.getUssePosition = function getUssePosition() {
    position.push({
        symbol: 0,
        amount: 1,
        price: available.cash
    });
    return position;
};

var getUsseOrder = exports.getUsseOrder = function getUsseOrder() {
    return order;
};

var resetTD = exports.resetTD = function resetTD() {
    var update = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

    console.log('TD reset');
    //if (update) {
    //const trade_count = updateTime['trade'];
    updateTime = {};
    updateTime['book'] = 0;
    updateTime['trade'] = 0;
    if (!update) {
        usseLogout();
    }
};