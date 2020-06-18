'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.resetBFX = exports.setWsOffer = exports.calRate = undefined;

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _keys = require('babel-runtime/core-js/object/keys');

var _keys2 = _interopRequireDefault(_keys);

var _slicedToArray2 = require('babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _ver = require('../../../ver');

var _constants = require('../constants');

var _bitfinexApiNode = require('bitfinex-api-node');

var _bitfinexApiNode2 = _interopRequireDefault(_bitfinexApiNode);

var _bfxApiNodeModels = require('bfx-api-node-models');

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

var _utility = require('../util/utility');

var _sendWs = require('../util/sendWs');

var _sendWs2 = _interopRequireDefault(_sendWs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

//system
var bfx = new _bitfinexApiNode2.default({ apiKey: _ver.BITFINEX_KEY, apiSecret: _ver.BITFINEX_SECRET });
var rest = bfx.rest(2, { transform: true });
var finalRate = {};
var maxRange = {};
var currentRate = {};
var priceData = {};

//user
var userWs = {};
var userOk = {};
var updateTime = {};
var extremRate = {};

var available = {};
var margin = {};

var offer = {};
var order = {};

var credit = {};
var ledger = {};
var position = {};

//wallet history
//credit history
//5m candle x

var calRate = exports.calRate = function calRate(curArr) {
    var recurPrice = function recurPrice(index) {
        if (index >= _constants.SUPPORT_PRICE.length) {
            if (priceData[_constants.TBTC_SYM].dailyChange < _constants.COIN_MAX || priceData[_constants.TETH_SYM].dailyChange < _constants.COIN_MAX) {
                (0, _sendWs2.default)('Bitfinex Daily Change: ' + priceData[_constants.TBTC_SYM].dailyChange + ' ' + priceData[_constants.TETH_SYM].dailyChange, 0, 0, true);
            }
            return _promise2.default.resolve();
        } else {
            return rest.ticker(_constants.SUPPORT_PRICE[index]).then(function (ticker) {
                priceData[_constants.SUPPORT_PRICE[index]] = {
                    dailyChange: ticker.dailyChangePerc * 100,
                    lastPrice: ticker.lastPrice,
                    time: Math.round(new Date().getTime() / 1000)
                };
                return recurPrice(index + 1);
            });
        }
    };
    var singleCal = function singleCal(curType, index) {
        return rest.ticker(curType).then(function (curTicker) {
            return rest.orderBook(curType, 'P0', 100).then(function (orderBooks) {
                currentRate[curType] = {
                    rate: curTicker.lastPrice * _constants.BITFINEX_EXP,
                    time: Math.round(new Date().getTime() / 1000)
                };
                var hl = [];
                var weight = [];
                return rest.candles({ symbol: curType, timeframe: '1m', period: 'p2', query: { limit: 1440 } }).then(function (entries) {
                    var calHL = function calHL(start, end) {
                        var startHigh = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : -1;
                        var startLow = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : -1;
                        var vol = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : 0;

                        for (var i = start; i < end; i++) {
                            if (!entries[i]) {
                                break;
                            }
                            var high = entries[i]['high'] * _constants.BITFINEX_EXP;
                            var low = entries[i]['low'] * _constants.BITFINEX_EXP;
                            var wi = Math.floor(high / _constants.BITFINEX_MIN);
                            weight[wi] = weight[wi] ? weight[wi] + entries[i].volume : entries[i].volume;
                            //console.log(high);
                            //console.log(low);
                            if (high > startHigh) {
                                startHigh = high;
                            }
                            if (startLow < 0 || low < startLow) {
                                startLow = low;
                            }
                            vol = vol + entries[i].volume;
                        }
                        return {
                            high: startHigh,
                            low: startLow,
                            vol: vol
                        };
                    };
                    hl.push(calHL(0, 5));
                    hl.push(calHL(5, 10, hl[0].high, hl[0].low, hl[0].vol));
                    hl.push(calHL(10, 20, hl[1].high, hl[1].low, hl[1].vol));
                    hl.push(calHL(20, 40, hl[2].high, hl[2].low, hl[2].vol));
                    hl.push(calHL(40, 80, hl[3].high, hl[3].low, hl[3].vol));
                    hl.push(calHL(80, 160, hl[4].high, hl[4].low, hl[4].vol));
                    hl.push(calHL(160, 320, hl[5].high, hl[5].low, hl[5].vol));
                    hl.push(calHL(320, 640, hl[6].high, hl[6].low, hl[6].vol));
                    hl.push(calHL(640, 1280, hl[7].high, hl[7].low, hl[7].vol));
                    hl.push(calHL(1280, 2560, hl[8].high, hl[8].low, hl[8].vol));
                    var calOBRate = function calOBRate(orderBooks) {
                        var volsum = 0;
                        var vol = 0;
                        var j = 0;
                        var rate = [];
                        orderBooks.forEach(function (v) {
                            if (v[3] > 0) {
                                volsum = volsum + v[3];
                            }
                        });
                        orderBooks.forEach(function (v) {
                            if (v[3] > 0) {
                                if (rate.length === 0) {
                                    rate.push(v[0] * _constants.BITFINEX_EXP);
                                }
                                if (rate.length > 9) {
                                    rate[10] = v[0] * _constants.BITFINEX_EXP;
                                } else {
                                    vol = vol + v[3];
                                    while (vol >= volsum / 100 * _constants.DISTRIBUTION[j] && j < 9) {
                                        rate.push(v[0] * _constants.BITFINEX_EXP);
                                        j++;
                                    }
                                }
                            }
                        });
                        return rate.reverse();
                    };
                    var calTenthRate = function calTenthRate(hl, weight) {
                        var rate = [hl[9].low];
                        var i = 0;
                        var j = 0;
                        weight.forEach(function (v, k) {
                            if (weight[k]) {
                                i = i + weight[k];
                                while (i >= hl[9].vol / 100 * _constants.DISTRIBUTION[j] && j < 9) {
                                    rate.push(k * 100);
                                    j++;
                                }
                            }
                        });
                        rate.push(hl[9].high);
                        return rate.reverse();
                    };
                    var OBRate = calOBRate(orderBooks);
                    var tenthRate = calTenthRate(hl, weight);
                    maxRange[curType] = tenthRate[1] - tenthRate[9];
                    finalRate[curType] = tenthRate.map(function (v, k) {
                        return v > OBRate[k] || !OBRate[k] ? v - 1 : OBRate[k] - 1;
                    });
                    console.log(curType + ' RATE: ' + finalRate[curType]);
                    console.log(OBRate);
                    console.log(tenthRate);
                    //console.log(currentRate[curType]);
                    //console.log(maxRange[curType]);
                });
            });
        });
    };
    var recurType = function recurType(index) {
        return index >= curArr.length ? _promise2.default.resolve((0, _sendWs2.default)({
            type: 'bitfinex',
            data: 0
        })) : _constants.SUPPORT_COIN.indexOf(curArr[index]) !== -1 ? singleCal(curArr[index], index).then(function () {
            return recurType(index + 1);
        }) : recurType(index + 1);
    };
    return recurPrice(0).then(function () {
        return recurType(0);
    });
};

var setWsOffer = exports.setWsOffer = function setWsOffer(id) {
    var curArr = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];

    //檢查跟設定active
    curArr = curArr.filter(function (v) {
        return v.isActive && v.riskLimit > 0 && v.waitTime > 0 && v.amountLimit > 0 ? true : false;
    });
    if (curArr.length < 1) {
        return _promise2.default.resolve();
    }
    var userKey = null;
    var userSecret = null;
    for (var i = 0; i < curArr.length; i++) {
        if (curArr[i].key && curArr[i].secret) {
            userKey = curArr[i].key;
            userSecret = curArr[i].secret;
            break;
        }
    }
    if (!userKey || !userSecret) {
        return (0, _utility.handleError)(new _utility.HoError('Api key or secret Missing'));
    }
    var userBfx = new _bitfinexApiNode2.default({ apiKey: userKey, apiSecret: userSecret });
    var userRest = userBfx.rest(2, { transform: true });
    var cancelOrder = function cancelOrder(symbol, index, amount, time, type, is_close) {
        if (!order[id][symbol] || index >= order[id][symbol].length || is_close) {
            return _promise2.default.resolve();
        } else {
            console.log(amount);
            console.log(time);
            console.log(type);
            console.log(order[id][symbol][index]);
            console.log(is_close);
            if (order[id][symbol][index].amount === amount && Math.abs(order[id][symbol][index].time - time) < 60 && (type !== 'LIMIT' && order[id][symbol][index].type == 'LIMIT' || type === 'LIMIT' && order[id][symbol][index].type !== 'LIMIT') && !is_close) {
                return userRest.cancelOrder(order[id][symbol][index].id).then(function () {
                    return new _promise2.default(function (resolve, reject) {
                        return setTimeout(function () {
                            return resolve();
                        }, 3000);
                    }).then(function () {
                        return cancelOrder(symbol, index + 1, amount, time, type, true);
                    });
                }).catch(function (err) {
                    (0, _sendWs2.default)(id + ' Bitfinex Close Order Error: ' + (err.message || err.msg), 0, 0, true);
                    (0, _utility.handleError)(err, id + ' Bitfinex Close Order Error');
                });
            } else {
                return cancelOrder(symbol, index + 1, amount, time, type, is_close);
            }
        }
    };
    if (!userWs[id] || !userOk[id]) {
        console.log('initial ws');
        if (!updateTime[id]) {
            updateTime[id] = {};
            updateTime[id]['book'] = 0;
            updateTime[id]['offer'] = 0;
            updateTime[id]['credit'] = 0;
            updateTime[id]['position'] = 0;
            updateTime[id]['order'] = 0;
        }
        if (!available[id]) {
            available[id] = {};
        }
        if (!margin[id]) {
            margin[id] = {};
        }
        if (!offer[id]) {
            offer[id] = {};
        }
        if (!order[id]) {
            order[id] = {};
        }
        if (!credit[id]) {
            credit[id] = {};
        }
        if (!ledger[id]) {
            ledger[id] = {};
        }
        if (!position[id]) {
            position[id] = {};
        }
        if (!extremRate[id]) {
            extremRate[id] = {};
        }
        userWs[id] = userBfx.ws(2, { transform: true });
        userWs[id].on('error', function (err) {
            if (!(err.message || err.msg).includes('auth: dup')) {
                (0, _sendWs2.default)(id + ' Bitfinex Ws Error: ' + (err.message || err.msg), 0, 0, true);
                (0, _utility.handleError)(err, id + ' Bitfinex Ws Error');
            }
        });
        userWs[id].on('open', function () {
            return userWs[id].auth();
        });
        userWs[id].once('auth', function () {
            console.log(id + ' authenticated');
            userOk[id] = true;
        });
        userWs[id].onWalletUpdate({}, function (wallet) {
            _constants.SUPPORT_COIN.forEach(function (t, i) {
                if (wallet.currency === t.substr(1)) {
                    if (wallet.type === 'funding') {
                        available[id][t] = {
                            avail: wallet.balanceAvailable,
                            time: Math.round(new Date().getTime() / 1000),
                            total: wallet.balance
                        };
                        (0, _sendWs2.default)({
                            type: 'bitfinex',
                            data: (i + 1) * 10000,
                            user: id
                        });
                    } else if (wallet.type === 'margin') {
                        margin[id][t] = {
                            avail: wallet.balanceAvailable,
                            time: Math.round(new Date().getTime() / 1000),
                            total: wallet.balance
                        };
                    }
                }
            });
        });
        userWs[id].onFundingOfferUpdate({}, function (fo) {
            if (_constants.SUPPORT_COIN.indexOf(fo.symbol) !== -1) {
                if (!offer[id][fo.symbol]) {
                    offer[id][fo.symbol] = [];
                }
                for (var j = 0; j < offer[id][fo.symbol].length; j++) {
                    if (offer[id][fo.symbol][j].id === fo.id) {
                        //offer[id][fo.symbol][j].time = fo.mtsCreate;
                        offer[id][fo.symbol][j].amount = fo.amount;
                        offer[id][fo.symbol][j].rate = fo.rate;
                        offer[id][fo.symbol][j].period = fo.period;
                        offer[id][fo.symbol][j].status = fo.status;
                        break;
                    }
                }
                var now = Math.round(new Date().getTime() / 1000);
                if (now - updateTime[id]['offer'] > _constants.UPDATE_ORDER) {
                    updateTime[id]['offer'] = now;
                    (0, _sendWs2.default)({
                        type: 'bitfinex',
                        data: -1,
                        user: id
                    });
                }
            }
        });
        userWs[id].onFundingOfferNew({}, function (fo) {
            if (_constants.SUPPORT_COIN.indexOf(fo.symbol) !== -1) {
                console.log(fo.symbol + ' ' + id + ' offer new');
                if (!offer[id][fo.symbol]) {
                    offer[id][fo.symbol] = [];
                }
                var isExist = false;
                for (var _i = 0; _i < offer[id][fo.symbol].length; _i++) {
                    if (fo.id === offer[id][fo.symbol][_i].id) {
                        offer[id][fo.symbol][_i].time = Math.round(fo.mtsCreate / 1000);
                        offer[id][fo.symbol][_i].status = fo.status;
                        isExist = true;
                        break;
                    }
                }
                if (!isExist) {
                    offer[id][fo.symbol].push({
                        id: fo.id,
                        time: Math.round(fo.mtsCreate / 1000),
                        amount: fo.amount,
                        rate: fo.rate,
                        period: fo.period,
                        status: fo.status
                    });
                }
                (0, _sendWs2.default)({
                    type: 'bitfinex',
                    data: -1,
                    user: id
                });
            }
        });
        userWs[id].onFundingOfferClose({}, function (fo) {
            if (_constants.SUPPORT_COIN.indexOf(fo.symbol) !== -1) {
                console.log(fo.symbol + ' ' + id + ' offer close');
                if (offer[id][fo.symbol]) {
                    for (var j = 0; j < offer[id][fo.symbol].length; j++) {
                        if (offer[id][fo.symbol][j].id === fo.id) {
                            offer[id][fo.symbol].splice(j, 1);
                            break;
                        }
                    }
                }
            }
        });
        userWs[id].onFundingCreditUpdate({}, function (fc) {
            if (_constants.SUPPORT_COIN.indexOf(fc.symbol) !== -1) {
                if (!credit[id][fc.symbol]) {
                    credit[id][fc.symbol] = [];
                }
                for (var j = 0; j < credit[id][fc.symbol].length; j++) {
                    if (credit[id][fc.symbol][j].id === fc.id) {
                        credit[id][fc.symbol][j].time = Math.round(fc.mtsOpening / 1000);
                        credit[id][fc.symbol][j].amount = fc.amount;
                        credit[id][fc.symbol][j].rate = fc.rate;
                        credit[id][fc.symbol][j].period = fc.period;
                        credit[id][fc.symbol][j].pair = fc.positionPair;
                        credit[id][fc.symbol][j].status = fc.status;
                        credit[id][fc.symbol][j].side = fc.side;
                        break;
                    }
                }
                var now = Math.round(new Date().getTime() / 1000);
                if (now - updateTime[id]['credit'] > _constants.UPDATE_ORDER) {
                    updateTime[id]['credit'] = now;
                    (0, _sendWs2.default)({
                        type: 'bitfinex',
                        data: -1,
                        user: id
                    });
                }
            }
        });
        userWs[id].onFundingCreditNew({}, function (fc) {
            if (_constants.SUPPORT_COIN.indexOf(fc.symbol) !== -1) {
                if (!credit[id][fc.symbol]) {
                    credit[id][fc.symbol] = [];
                }
                credit[id][fc.symbol].push({
                    id: fc.id,
                    time: Math.round(fc.mtsOpening / 1000),
                    amount: fc.amount,
                    rate: fc.rate,
                    period: fc.period,
                    pair: fc.positionPair,
                    status: fc.status,
                    side: fc.side
                });
                (0, _sendWs2.default)({
                    type: 'bitfinex',
                    data: -1,
                    user: id
                });
            }
        });
        userWs[id].onFundingCreditClose({}, function (fc) {
            if (_constants.SUPPORT_COIN.indexOf(fc.symbol) !== -1) {
                if (credit[id][fc.symbol]) {
                    for (var j = 0; j < credit[id][fc.symbol].length; j++) {
                        if (credit[id][fc.symbol][j].id === fc.id) {
                            credit[id][fc.symbol].splice(j, 1);
                            break;
                        }
                    }
                }
                (0, _sendWs2.default)({
                    type: 'bitfinex',
                    data: -1,
                    user: id
                });
            }
        });
        userWs[id].onPositionUpdate({}, function (fc) {
            var symbol = 'f' + fc.symbol.substr(-3);
            if (_constants.SUPPORT_COIN.indexOf(symbol) !== -1) {
                if (!position[id][symbol]) {
                    position[id][symbol] = [];
                }
                for (var j = 0; j < position[id][symbol].length; j++) {
                    if (position[id][symbol][j].id === fc.id) {
                        //position[id][symbol][j].time = Math.round(fc.mtsCreate / 1000);
                        position[id][symbol][j].amount = fc.amount;
                        position[id][symbol][j].symbol = fc.symbol;
                        position[id][symbol][j].price = Math.round(fc.basePrice * 1000) / 1000;
                        position[id][symbol][j].lp = Math.round(fc.liquidationPrice * 1000) / 1000;
                        position[id][symbol][j].pl = fc.pl;
                        break;
                    }
                }
                var now = Math.round(new Date().getTime() / 1000);
                if (now - updateTime[id]['position'] > _constants.UPDATE_ORDER) {
                    updateTime[id]['position'] = now;
                    (0, _sendWs2.default)({
                        type: 'bitfinex',
                        data: -1,
                        user: id
                    });
                }
            }
        });
        userWs[id].onPositionNew({}, function (fc) {
            var symbol = 'f' + fc.symbol.substr(-3);
            if (_constants.SUPPORT_COIN.indexOf(symbol) !== -1) {
                if (!position[id][symbol]) {
                    position[id][symbol] = [];
                }
                position[id][symbol].push({
                    id: fc.id,
                    time: Math.round(fc.mtsCreate / 1000),
                    amount: fc.amount,
                    symbol: fc.symbol,
                    price: Math.round(fc.basePrice * 1000) / 1000,
                    lp: Math.round(fc.liquidationPrice * 1000) / 1000,
                    pl: fc.pl
                });
                (0, _sendWs2.default)({
                    type: 'bitfinex',
                    data: -1,
                    user: id
                });
            }
        });
        userWs[id].onPositionClose({}, function (fc) {
            var symbol = 'f' + fc.symbol.substr(-3);
            if (_constants.SUPPORT_COIN.indexOf(symbol) !== -1) {
                if (position[id][symbol]) {
                    for (var j = 0; j < position[id][symbol].length; j++) {
                        if (position[id][symbol][j].id === fc.id) {
                            position[id][symbol].splice(j, 1);
                            break;
                        }
                    }
                }
                (0, _sendWs2.default)({
                    type: 'bitfinex',
                    data: -1,
                    user: id
                });
            }
        });
        userWs[id].onOrderUpdate({}, function (os) {
            var symbol = 'f' + os.symbol.substr(-3);
            if (_constants.SUPPORT_COIN.indexOf(symbol) !== -1) {
                if (!order[id][symbol]) {
                    order[id][symbol] = [];
                }
                for (var j = 0; j < order[id][symbol].length; j++) {
                    if (order[id][symbol][j].id === os.id) {
                        order[id][symbol][j].time = Math.round(os.mtsCreate / 1000);
                        order[id][symbol][j].amount = os.amountOrig;
                        order[id][symbol][j].type = os.type;
                        order[id][symbol][j].symbol = os.symbol;
                        order[id][symbol][j].price = os.price;
                        order[id][symbol][j].trailing = os.priceTrailing;
                        order[id][symbol][j].flags = os.flags;
                        break;
                    }
                }
                var now = Math.round(new Date().getTime() / 1000);
                if (now - updateTime[id]['order'] > _constants.UPDATE_ORDER) {
                    updateTime[id]['order'] = now;
                    (0, _sendWs2.default)({
                        type: 'bitfinex',
                        data: -1,
                        user: id
                    });
                }
            }
        });
        userWs[id].onOrderNew({}, function (os) {
            var symbol = 'f' + os.symbol.substr(-3);
            if (_constants.SUPPORT_COIN.indexOf(symbol) !== -1) {
                console.log(symbol + ' ' + id + ' order new');
                console.log(os);
                if (!order[id][symbol]) {
                    order[id][symbol] = [];
                }
                order[id][symbol].push({
                    id: os.id,
                    time: Math.round(os.mtsCreate / 1000),
                    amount: os.amountOrig,
                    type: os.type,
                    symbol: os.symbol,
                    price: os.price,
                    trailing: os.priceTrailing,
                    flags: os.flags
                });
                (0, _sendWs2.default)({
                    type: 'bitfinex',
                    data: -1,
                    user: id
                });
            }
        });
        userWs[id].onOrderClose({}, function (os) {
            var symbol = 'f' + os.symbol.substr(-3);
            if (_constants.SUPPORT_COIN.indexOf(symbol) !== -1) {
                console.log(symbol + ' ' + id + ' order close');
                console.log(os);
                if (order[id][symbol]) {
                    for (var j = 0; j < order[id][symbol].length; j++) {
                        if (order[id][symbol][j].id === os.id) {
                            order[id][symbol].splice(j, 1);
                            break;
                        }
                    }
                }

                var _loop = function _loop(_i2) {
                    if (curArr[_i2].type === symbol && curArr[_i2].isTrade && curArr[_i2].interval && curArr[_i2].amount && curArr[_i2].low_point && curArr[_i2].loss_stop && curArr[_i2].pair && curArr[_i2].pair.length > 0) {
                        console.log(curArr[_i2]);
                        if (os.amountOrig > 0) {
                            if (os.status.includes('EXECUTED') || os.status.includes('INSUFFICIENT BALANCE')) {
                                //set oco trail priceTrailing
                                if (curArr[_i2].gain_stop) {
                                    var or = new _bfxApiNodeModels.Order({
                                        cid: Date.now(),
                                        type: 'LIMIT',
                                        symbol: os.symbol,
                                        amount: -os.amountOrig / 2 * 1.005,
                                        price: os.price * (101 + curArr[_i2].gain_stop) / 100,
                                        priceAuxLimit: os.price * (100 - curArr[_i2].loss_stop) / 100,
                                        flags: 17408
                                    }, userRest);
                                    or.submit().then(function () {
                                        return new _promise2.default(function (resolve, reject) {
                                            return setTimeout(function () {
                                                return resolve();
                                            }, 3000);
                                        });
                                    }).then(function () {
                                        var or1 = new _bfxApiNodeModels.Order({
                                            cid: Date.now(),
                                            type: 'LIMIT',
                                            symbol: os.symbol,
                                            amount: -os.amountOrig / 2 * 1.005,
                                            price: os.price * (101 + curArr[_i2].gain_stop * 2) / 100,
                                            priceAuxLimit: os.price * (100 - curArr[_i2].loss_stop) / 100,
                                            flags: 17408
                                        }, userRest);
                                        return or1.submit();
                                    }).catch(function (err) {
                                        (0, _sendWs2.default)(id + ' Bitfinex Order Error: ' + (err.message || err.msg), 0, 0, true);
                                        (0, _utility.handleError)(err, id + ' Bitfinex Order Error');
                                    });
                                } else {
                                    var _or = new _bfxApiNodeModels.Order({
                                        cid: Date.now(),
                                        type: 'STOP',
                                        symbol: os.symbol,
                                        amount: -os.amountOrig / 2 * 1.005,
                                        price: os.price * (100 - curArr[_i2].loss_stop) / 100,
                                        flags: 1024
                                    }, userRest);
                                    _or.submit().then(function () {
                                        return new _promise2.default(function (resolve, reject) {
                                            return setTimeout(function () {
                                                return resolve();
                                            }, 3000);
                                        });
                                    }).then(function () {
                                        var or1 = new _bfxApiNodeModels.Order({
                                            cid: Date.now(),
                                            type: 'STOP',
                                            symbol: os.symbol,
                                            amount: -os.amountOrig / 2 * 1.005,
                                            price: os.price * (100 - curArr[_i2].loss_stop) / 100,
                                            flags: 17408
                                        }, userRest);
                                        return or1.submit();
                                    }).catch(function (err) {
                                        (0, _sendWs2.default)(id + ' Bitfinex Order Error: ' + (err.message || err.msg), 0, 0, true);
                                        (0, _utility.handleError)(err, id + ' Bitfinex Order Error');
                                    });
                                }
                            }
                        } else if (os.status.includes('EXECUTED') || os.status.includes('INSUFFICIENT BALANCE')) {
                            cancelOrder(symbol, 0, os.amountOrig, Math.round(os.mtsCreate / 1000), os.type, false);
                        } else if (os.status.includes('CANCELED') && os.type === 'STOP') {
                            cancelOrder(symbol, 0, os.amountOrig, Math.round(os.mtsCreate / 1000), os.type, false);
                        }
                        return 'break';
                    }
                };

                for (var _i2 = 0; _i2 < curArr.length; _i2++) {
                    var _ret = _loop(_i2);

                    if (_ret === 'break') break;
                }
            }
        });
        userWs[id].open();
    } else if (!userWs[id].isOpen()) {
        console.log('reconnect ws');
        userWs[id].reconnect();
    }

    var initialBook = function initialBook() {
        var now = Math.round(new Date().getTime() / 1000);
        if (now - updateTime[id]['book'] > _constants.UPDATE_BOOK) {
            updateTime[id]['book'] = now;
            console.log(updateTime[id]['book']);
            return userRest.wallets().then(function (wallet) {
                wallet.forEach(function (w) {
                    var symbol = 'f' + w.currency;
                    if (_constants.SUPPORT_COIN.indexOf(symbol) !== -1) {
                        if (w.type === 'funding') {
                            available[id][symbol] = {
                                avail: w.balanceAvailable,
                                time: Math.round(new Date().getTime() / 1000),
                                total: w.balance
                            };
                        } else if (w.type === 'margin') {
                            margin[id][symbol] = {
                                avail: w.balanceAvailable,
                                time: Math.round(new Date().getTime() / 1000),
                                total: w.balance
                            };
                        }
                    }
                });
            }).then(function () {
                return userRest.fundingOffers('');
            }).then(function (fos) {
                var risk = _constants.RISK_MAX;
                var temp = {};
                fos.forEach(function (v) {
                    if (_constants.SUPPORT_COIN.indexOf(v.symbol) !== -1) {
                        if (!temp[v.symbol]) {
                            temp[v.symbol] = [];
                        }
                        temp[v.symbol].push({
                            id: v.id,
                            time: Math.round(v.mtsCreate / 1000),
                            amount: v.amount,
                            rate: v.rate,
                            period: v.period,
                            status: v.status,
                            risk: risk > 0 ? risk-- : 0
                        });
                    }
                });
                offer[id] = temp;
            }).then(function () {
                return userRest.fundingCredits('');
            }).then(function (fcs) {
                var temp = {};
                fcs.forEach(function (v) {
                    if (_constants.SUPPORT_COIN.indexOf(v.symbol) !== -1) {
                        if (!temp[v.symbol]) {
                            temp[v.symbol] = [];
                        }
                        temp[v.symbol].push({
                            id: v.id,
                            time: Math.round(v.mtsOpening / 1000),
                            amount: v.amount,
                            rate: v.rate,
                            period: v.period,
                            status: v.status,
                            pair: v.positionPair,
                            side: v.side
                        });
                    }
                });
                credit[id] = temp;
            }).then(function () {
                return userRest.activeOrders();
            }).then(function (os) {
                var temp = {};
                os.forEach(function (v) {
                    var symbol = 'f' + v.symbol.substr(-3);
                    if (_constants.SUPPORT_COIN.indexOf(symbol) !== -1) {
                        if (!temp[symbol]) {
                            temp[symbol] = [];
                        }
                        temp[symbol].push({
                            id: v.id,
                            time: Math.round(v.mtsCreate / 1000),
                            amount: v.amountOrig,
                            symbol: v.symbol,
                            type: v.type,
                            price: v.price,
                            trailing: v.priceTrailing,
                            flags: v.flags
                        });
                    }
                });
                order[id] = temp;
            }).then(function () {
                return userRest.positions();
            }).then(function (ps) {
                var temp = {};
                ps.forEach(function (v) {
                    var symbol = 'f' + v.symbol.substr(-3);
                    if (_constants.SUPPORT_COIN.indexOf(symbol) !== -1) {
                        if (!temp[symbol]) {
                            temp[symbol] = [];
                        }
                        temp[symbol].push({
                            id: v.id,
                            time: Math.round(v.mtsCreate / 1000),
                            price: Math.round(v.basePrice * 1000) / 1000,
                            lp: Math.round(v.liquidationPrice * 1000) / 1000,
                            amount: v.amount,
                            symbol: v.symbol,
                            pl: v.pl
                        });
                    }
                });
                position[id] = temp;
                (0, _sendWs2.default)({
                    type: 'bitfinex',
                    data: -1,
                    user: id
                });
            });
        } else {
            console.log('no new');
            return _promise2.default.resolve();
        }
    };

    var checkRisk = function checkRisk(risk) {
        for (var _len = arguments.length, arr = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
            arr[_key - 1] = arguments[_key];
        }

        if (risk < 1) {
            return false;
        }
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
            for (var _iterator = (0, _getIterator3.default)(arr), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                var j = _step.value;
                var _iteratorNormalCompletion2 = true;
                var _didIteratorError2 = false;
                var _iteratorError2 = undefined;

                try {
                    for (var _iterator2 = (0, _getIterator3.default)(j), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                        var _i3 = _step2.value;

                        if (risk === _i3.risk) {
                            return true;
                        }
                    }
                } catch (err) {
                    _didIteratorError2 = true;
                    _iteratorError2 = err;
                } finally {
                    try {
                        if (!_iteratorNormalCompletion2 && _iterator2.return) {
                            _iterator2.return();
                        }
                    } finally {
                        if (_didIteratorError2) {
                            throw _iteratorError2;
                        }
                    }
                }
            }
        } catch (err) {
            _didIteratorError = true;
            _iteratorError = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion && _iterator.return) {
                    _iterator.return();
                }
            } finally {
                if (_didIteratorError) {
                    throw _iteratorError;
                }
            }
        }

        return false;
    };

    var singleLoan = function singleLoan(current) {
        var needNew = [];
        var needRetain = [];
        var finalNew = [];
        var needDelete = [];
        console.log(currentRate[current.type].rate);
        var MR = current.miniRate > 0 ? current.miniRate / 100 * _constants.BITFINEX_EXP : 0;
        console.log(MR);
        var DR = [];
        var pushDR = function pushDR(rate, day) {
            if (rate > 0 && day >= 2 && day <= 30) {
                var DRT = {
                    rate: rate / 100 * _constants.BITFINEX_EXP,
                    day: day,
                    speed: (58 - day) / 56
                };
                for (var _i4 = DR.length; _i4 >= 0; _i4--) {
                    if (_i4 === 0 || DRT.rate < DR[_i4 - 1].rate) {
                        DR.splice(_i4, 0, DRT);
                        break;
                    }
                }
            }
        };
        var getDR = function getDR(rate) {
            if (DR.length === 0) {
                return false;
            }
            for (var _i5 = 0; _i5 < DR.length; _i5++) {
                if (rate >= DR[_i5].rate) {
                    return DR[_i5];
                }
            }
            return false;
        };
        pushDR(current.dynamic, 30);
        pushDR(current.dynamicRate1, current.dynamicDay1);
        pushDR(current.dynamicRate2, current.dynamicDay2);
        //const DR = (current.dynamic > 0) ? current.dynamic/36500*BITFINEX_EXP : 0;
        var extremRateCheck = function extremRateCheck() {
            if (!current.isTrade || !current.interval || !current.amount || !current.loss_stop || !current.low_point || !current.pair || current.pair.length < 1) {
                return false;
            }
            if (DR.length > 0 && currentRate[current.type].rate > DR[0].rate) {
                if (!extremRate[id][current.type]) {
                    extremRate[id][current.type] = {
                        high: 1,
                        low: 0,
                        is_low: 0,
                        is_high: 0
                    };
                } else {
                    extremRate[id][current.type].high++;
                    extremRate[id][current.type].low = extremRate[id][current.type].low < 2 ? 0 : extremRate[id][current.type].low - 1;
                    if (extremRate[id][current.type].high >= _constants.EXTREM_RATE_NUMBER) {
                        (0, _sendWs2.default)(id + ' ' + current.type.substr(1) + ' rate too high!!!', 0, 0, true);
                        extremRate[id][current.type].is_high = Math.round(new Date().getTime() / 1000);
                        extremRate[id][current.type].high = 0;
                    }
                }
            } else if (MR > 0 && currentRate[current.type].rate < MR) {
                if (!extremRate[id][current.type]) {
                    extremRate[id][current.type] = {
                        high: 0,
                        low: 1,
                        is_low: 0,
                        is_high: 0
                    };
                } else {
                    extremRate[id][current.type].high = extremRate[id][current.type].high < 2 ? 0 : extremRate[id][current.type].high - 1;
                    extremRate[id][current.type].low++;
                    if (extremRate[id][current.type].low >= _constants.EXTREM_RATE_NUMBER) {
                        (0, _sendWs2.default)(id + ' ' + current.type.substr(1) + ' rate too low!!!', 0, 0, true);
                        extremRate[id][current.type].is_low = Math.round(new Date().getTime() / 1000);
                        extremRate[id][current.type].low = 0;
                    }
                }
            } else {
                if (!extremRate[id][current.type]) {
                    extremRate[id][current.type] = {
                        high: 0,
                        low: 0,
                        is_low: 0,
                        is_high: 0
                    };
                } else {
                    extremRate[id][current.type].high = extremRate[id][current.type].high < 2 ? 0 : extremRate[id][current.type].high - 1;
                    extremRate[id][current.type].low = extremRate[id][current.type].low < 2 ? 0 : extremRate[id][current.type].low - 1;
                }
            }
        };
        // adjust offer & history
        //keep cash
        var calKeepCash = function calKeepCash(avail) {
            var kp = avail ? avail[current.type] ? avail[current.type].avail : 0 : 0;
            if (current.isKeep) {
                if (priceData[_constants.TBTC_SYM].dailyChange < _constants.COIN_MAX || priceData[_constants.TETH_SYM].dailyChange < _constants.COIN_MAX) {
                    var dailyChange = priceData[_constants.TBTC_SYM].dailyChange < priceData[_constants.TETH_SYM].dailyChange ? priceData[_constants.TBTC_SYM].dailyChange : priceData[_constants.TETH_SYM].dailyChange;
                    kp = kp * (50 - (_constants.COIN_MAX - dailyChange) / (_constants.COIN_MAX - _constants.COIN_MAX_MAX) * 50) / 100;
                }
            }
            if (current.keepAmountRate1 > 0 && current.keepAmountMoney1 > 0 && currentRate[current.type].rate < current.keepAmountRate1 / 100 * _constants.BITFINEX_EXP) {
                return kp - current.keepAmountMoney1;
            } else {
                return current.keepAmount ? kp - current.keepAmount : kp;
            }
        };
        var keep_available = calKeepCash(available[id]);
        console.log(keep_available);
        var adjustOffer = function adjustOffer() {
            console.log(id + ' ' + current.type);
            if (offer[id][current.type]) {
                //console.log(offer[current.type]);
                //produce retain delete
                offer[id][current.type].forEach(function (v) {
                    if (v.risk === undefined) {
                        console.log('manual');
                        return false;
                    }
                    if (keep_available > 1 && v.amount < current.amountLimit) {
                        console.log(keep_available);
                        console.log(v.amount);
                        var sum = keep_available + v.amount;
                        var newAmount = 0;
                        if (sum <= current.amountLimit * 1.2) {
                            keep_available = 0;
                            newAmount = sum;
                        } else {
                            keep_available = sum - current.amountLimit;
                            newAmount = current.amountLimit;
                        }
                        console.log(keep_available);
                        console.log(newAmount);
                        needDelete.push({ risk: v.risk, amount: v.amount, rate: v.rate * _constants.BITFINEX_EXP, id: v.id, newAmount: newAmount });
                    } else if (v.rate - currentRate[current.type].rate > maxRange[current.type]) {
                        needDelete.push({ risk: v.risk, amount: v.amount, rate: v.rate * _constants.BITFINEX_EXP, id: v.id });
                    } else {
                        var DRT = getDR(v.rate * _constants.BITFINEX_EXP);
                        console.log(DRT);
                        var waitTime = DRT === false ? current.waitTime : DRT.speed * current.waitTime;
                        if (Math.round(new Date().getTime() / 1000) - v.time >= waitTime * 60) {
                            needDelete.push({ risk: v.risk, amount: v.amount, rate: v.rate * _constants.BITFINEX_EXP, id: v.id });
                        } else {
                            needRetain.push({ risk: v.risk, rate: v.rate * _constants.BITFINEX_EXP });
                        }
                    }
                });
            }
            needDelete.forEach(function (v) {
                var risk = v.newAmount ? v.risk : v.risk > 1 ? v.risk - 1 : 0;
                while (checkRisk(risk, needRetain, needNew)) {
                    risk--;
                }
                needNew.push({
                    risk: risk,
                    amount: v.newAmount ? v.newAmount : v.amount,
                    rate: MR > 0 && finalRate[current.type][10 - risk] < MR ? MR : finalRate[current.type][10 - risk]
                });
            });
            //console.log('needdelete');
            //console.log(needDelete);
        };
        //produce new
        var newOffer = function newOffer(risk) {
            //console.log('keep available');
            //console.log(keep_available);
            if (risk > _constants.RISK_MAX) {
                risk = _constants.RISK_MAX;
            }
            var newLength = _constants.OFFER_MAX - needRetain.length - needNew.length;
            for (var _i6 = 0; _i6 < newLength; _i6++) {
                while (checkRisk(risk, needRetain, needNew)) {
                    risk--;
                }
                var miniOffer = _constants.MINIMAL_OFFER;
                if (priceData['t' + current.type.substr(1) + 'USD']) {
                    miniOffer = _constants.MINIMAL_OFFER / priceData['t' + current.type.substr(1) + 'USD'].lastPrice;
                }
                if (finalRate[current.type].length <= 0 || keep_available < miniOffer) {
                    break;
                }
                if (risk < 0) {
                    break;
                }
                var amount = current.amountLimit;
                if (keep_available <= current.amountLimit * 1.2) {
                    amount = keep_available;
                }
                needNew.push({
                    risk: risk,
                    amount: amount,
                    rate: MR > 0 && finalRate[current.type][10 - risk] < MR ? MR : finalRate[current.type][10 - risk]
                });
                keep_available = keep_available - amount;
                //risk = risk < 1 ? 0 : risk-1;
                risk--;
            }
            //console.log('needNew');
            //console.log(needNew);
        };
        //merge new & delete
        var mergeOffer = function mergeOffer() {
            var checkDelete = function checkDelete(rate, amount) {
                for (var _i7 = 0; _i7 < needDelete.length; _i7++) {
                    if (Math.ceil(rate / _constants.BITFINEX_MIN) === Math.ceil(needDelete[_i7].rate / _constants.BITFINEX_MIN) && amount === needDelete[_i7].amount) {
                        return _i7;
                    }
                }
                return -1;
            };
            needNew.forEach(function (v) {
                var notDelete = checkDelete(v.rate, v.amount);
                if (notDelete !== -1) {
                    for (var _i8 = 0; _i8 < offer[id][current.type].length; _i8++) {
                        if (needDelete[notDelete].id === offer[id][current.type][_i8].id) {
                            offer[id][current.type][_i8].time = Math.round(new Date().getTime() / 1000);
                            offer[id][current.type][_i8].risk = v.risk;
                            break;
                        }
                    }
                    needDelete.splice(notDelete, 1);
                } else {
                    finalNew.push(v);
                }
            });
            console.log('retain');
            console.log(needRetain);
            console.log('delete');
            console.log(needDelete);
            console.log('final');
            console.log(finalNew);
        };
        extremRateCheck();
        adjustOffer();
        newOffer(current.riskLimit);
        mergeOffer();
        var cancelOffer = function cancelOffer(index) {
            return index >= needDelete.length ? _promise2.default.resolve() : userRest.cancelFundingOffer(needDelete[index].id).then(function () {
                return new _promise2.default(function (resolve, reject) {
                    return setTimeout(function () {
                        return resolve();
                    }, 3000);
                }).then(function () {
                    return cancelOffer(index + 1);
                });
            });
        };
        var submitOffer = function submitOffer(index) {
            if (index >= finalNew.length) {
                if (finalNew.length + needDelete.length > 0) {
                    (0, _sendWs2.default)({
                        type: 'bitfinex',
                        data: -1,
                        user: id
                    });
                }
                return _promise2.default.resolve();
            } else {
                var _ret2 = function () {
                    var DRT = getDR(finalNew[index].rate);
                    console.log(DRT);
                    var fo = new _bfxApiNodeModels.FundingOffer({
                        symbol: current.type,
                        amount: finalNew[index].amount,
                        rate: finalNew[index].rate / _constants.BITFINEX_EXP,
                        period: DRT === false ? 2 : DRT.day,
                        type: 'LIMIT'
                    }, userRest);
                    console.log(finalNew[index].amount);
                    console.log(keep_available);
                    console.log(available[id]);
                    return {
                        v: fo.submit().then(function () {
                            return new _promise2.default(function (resolve, reject) {
                                return setTimeout(function () {
                                    return resolve();
                                }, 3000);
                            }).then(function () {
                                var isExist = false;
                                for (var _i9 = 0; _i9 < offer[id][current.type].length; _i9++) {
                                    if (fo.id === offer[id][current.type][_i9].id) {
                                        offer[id][current.type][_i9].risk = finalNew[index].risk;
                                        //console.log(`Offer ${offer[id][current.type][i].id} ${offer[id][current.type][i].risk}`);
                                        isExist = true;
                                        break;
                                    }
                                }
                                if (!isExist) {
                                    offer[id][current.type].push({
                                        id: fo.id,
                                        time: Math.round(new Date().getTime() / 1000),
                                        amount: fo.amount,
                                        rate: fo.rate,
                                        period: fo.period,
                                        risk: finalNew[index].risk
                                    });
                                }
                                return submitOffer(index + 1);
                            });
                        })
                    };
                }();

                if ((typeof _ret2 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret2)) === "object") return _ret2.v;
            }
        };
        return cancelOffer(0).then(function () {
            return submitOffer(0);
        });
    };

    var singleTrade = function singleTrade(current) {
        if (!current.isTrade || !current.interval || !current.amount || !current.loss_stop || !current.low_point || !current.pair || current.pair.length < 1) {
            return _promise2.default.resolve();
        }
        console.log(current);
        //set stop
        if (!extremRate[id][current.type].is_low || Math.round(new Date().getTime() / 1000) - extremRate[id][current.type].is_low > _constants.EXTREM_DURATION || extremRate[id][current.type].is_high > extremRate[id][current.type].is_low) {
            var _ret3 = function () {
                var is_high = false;
                if (extremRate[id][current.type].is_high && Math.round(new Date().getTime() / 1000) - extremRate[id][current.type].is_high <= _constants.EXTREM_DURATION) {
                    is_high = true;
                }
                console.log('is_high');
                console.log(is_high);
                var gain_stage = [];
                var getStage = function getStage(os) {
                    var _iteratorNormalCompletion3 = true;
                    var _didIteratorError3 = false;
                    var _iteratorError3 = undefined;

                    try {
                        for (var _iterator3 = (0, _getIterator3.default)(gain_stage), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                            var _i10 = _step3.value;

                            if (_i10.amount === os.amount && Math.abs(os.time - _i10.time) < 60) {
                                return 1;
                            }
                        }
                    } catch (err) {
                        _didIteratorError3 = true;
                        _iteratorError3 = err;
                    } finally {
                        try {
                            if (!_iteratorNormalCompletion3 && _iterator3.return) {
                                _iterator3.return();
                            }
                        } finally {
                            if (_didIteratorError3) {
                                throw _iteratorError3;
                            }
                        }
                    }

                    return 2;
                };
                var transMargin = function transMargin() {
                    console.log(margin[id]);
                    if ((!order[id][current.type] || order[id][current.type].length < 1) && margin[id][current.type] && margin[id][current.type].avail > 1) {
                        return userRest.transfer({
                            from: 'margin',
                            to: 'funding',
                            amount: margin[id][current.type].avail.toString(),
                            currency: current.type.substr(1)
                        });
                    } else {
                        return _promise2.default.resolve();
                    }
                };
                var processing = [];
                var checkOrder = function checkOrder(index) {
                    if (!order[id][current.type] || index >= order[id][current.type].length) {
                        return _promise2.default.resolve();
                    } else {
                        if (order[id][current.type][index].amount > 0) {
                            processing.push({
                                type: 1,
                                os: order[id][current.type][index]
                            });
                            return checkOrder(index + 1);
                        } else if (order[id][current.type][index].type === 'STOP') {
                            processing.push({
                                type: 2,
                                os: order[id][current.type][index]
                            });
                            return checkOrder(index + 1);
                        } else {
                            if (order[id][current.type][index].type === 'TRAILING STOP' && is_high) {
                                processing.push({
                                    type: 3,
                                    os: order[id][current.type][index]
                                });
                                return checkOrder(index + 1);
                            } else {
                                return checkOrder(index + 1);
                            }
                        }
                    }
                };
                var processOrder = function processOrder(index) {
                    console.log(processing);
                    if (index >= processing.length) {
                        return _promise2.default.resolve();
                    } else {
                        var last_price = processing[index].os.price * 100 / (100.01 - current.loss_stop);
                        if (_constants.SUPPORT_PRICE.indexOf(processing[index].os.symbol) !== -1) {
                            last_price = priceData[processing[index].os.symbol].lastPrice;
                        }

                        var _ret4 = function () {
                            switch (processing[index].type) {
                                case 1:
                                    var amount = processing[index].os.amount * processing[index].os.price / current.leverage;
                                    return {
                                        v: userRest.cancelOrder(processing[index].os.id).then(function () {
                                            current.used = current.used > amount ? current.used - amount : 0;
                                            console.log(current.used);
                                            return (0, _mongoTool2.default)('update', _constants.USERDB, { "username": id, "bitfinex.type": current.type }, { $set: { "bitfinex.$.used": current.used } }).then(function () {
                                                return new _promise2.default(function (resolve, reject) {
                                                    return setTimeout(function () {
                                                        return resolve();
                                                    }, 3000);
                                                }).then(function () {
                                                    return processOrder(index + 1);
                                                });
                                            });
                                        })
                                    };
                                case 2:
                                    //close & new trail & new limit
                                    console.log(last_price * current.loss_stop / 100);
                                    console.log(last_price * current.loss_stop / 100 / 2);
                                    var trail = last_price * current.loss_stop / 100 / (is_high ? 2 : 1);
                                    console.log(trail);
                                    var limit = current.gain_stop ? last_price * (101 + getStage(processing[index].os) * current.gain_stop) / 100 : 0;
                                    if (last_price - trail < processing[index].os.price) {
                                        return {
                                            v: processOrder(index + 1)
                                        };
                                    } else {
                                        var _ret5 = function () {
                                            var pre_os = {
                                                amount: processing[index].os.amount,
                                                time: processing[index].os.time
                                            };
                                            return {
                                                v: {
                                                    v: userRest.cancelOrder(processing[index].os.id).then(function () {
                                                        return new _promise2.default(function (resolve, reject) {
                                                            return setTimeout(function () {
                                                                return resolve();
                                                            }, 3000);
                                                        });
                                                    }).then(function () {
                                                        var or = new _bfxApiNodeModels.Order({
                                                            cid: Date.now(),
                                                            type: 'TRAILING STOP',
                                                            symbol: processing[index].os.symbol,
                                                            amount: pre_os.amount,
                                                            priceTrailing: trail,
                                                            flags: 1024
                                                        }, userRest);
                                                        return or.submit().then(function () {
                                                            gain_stage.push(pre_os);
                                                            return new _promise2.default(function (resolve, reject) {
                                                                return setTimeout(function () {
                                                                    return resolve();
                                                                }, 3000);
                                                            });
                                                        });
                                                    }).then(function () {
                                                        if (is_high || !current.gain_stop) {
                                                            return _promise2.default.resolve();
                                                        } else {
                                                            var or1 = new _bfxApiNodeModels.Order({
                                                                cid: Date.now(),
                                                                type: 'LIMIT',
                                                                symbol: processing[index].os.symbol,
                                                                amount: pre_os.amount,
                                                                price: limit,
                                                                flags: 1024
                                                            }, userRest);
                                                            return or1.submit().then(function () {
                                                                return new _promise2.default(function (resolve, reject) {
                                                                    return setTimeout(function () {
                                                                        return resolve();
                                                                    }, 3000);
                                                                });
                                                            });
                                                        }
                                                    }).then(function () {
                                                        return processOrder(index + 1);
                                                    })
                                                }
                                            };
                                        }();

                                        if ((typeof _ret5 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret5)) === "object") return _ret5.v;
                                    }
                                case 3:
                                    //update
                                    var trail2 = last_price * current.loss_stop / 200;
                                    if (trail2 * 1.5 > processing[index].os.trailing || last_price - trail2 < processing[index].os.price) {
                                        return {
                                            v: processOrder(index + 1)
                                        };
                                    } else {
                                        return {
                                            v: cancelOrder(current.type, 0, processing[index].os.amount, processing[index].os.time, processing[index].os.type, false).then(function () {
                                                return userRest.updateOrder({
                                                    id: processing[index].os.id,
                                                    price_trailing: trail2.toString()
                                                }).then(function (os) {
                                                    console.log(os);
                                                    return new _promise2.default(function (resolve, reject) {
                                                        return setTimeout(function () {
                                                            return resolve();
                                                        }, 3000);
                                                    });
                                                }).then(function () {
                                                    return processOrder(index + 1);
                                                });
                                            })
                                        };
                                    }
                                default:
                                    return {
                                        v: processOrder(index + 1)
                                    };
                            }
                        }();

                        if ((typeof _ret4 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret4)) === "object") return _ret4.v;
                    }
                };
                return {
                    v: transMargin().then(function () {
                        return checkOrder(0);
                    }).then(function () {
                        return processOrder(0);
                    })
                };
            }();

            if ((typeof _ret3 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret3)) === "object") return _ret3.v;
        }
        var checkExpire = function checkExpire() {
            if (Math.round(new Date().getTime() / 1000) - current.last_trade > current.interval) {
                current.used = 0;
                return (0, _mongoTool2.default)('update', _constants.USERDB, { "username": id, "bitfinex.type": current.type }, { $set: { "bitfinex.$.used": current.used } });
            } else {
                return _promise2.default.resolve();
            }
        };
        var getAM = function getAM() {
            console.log(current);
            var needAmount = current.used > 0 ? current.used > current.amount ? 0 : current.amount - current.used : current.amount;
            var needTrans = needAmount;
            //check need amount
            if (margin[id][current.type]) {
                needTrans = needTrans - margin[id][current.type].avail;
            }
            var availableMargin = 0;
            if (needTrans > 1) {
                if (available[id] && available[id][current.type] && available[id][current.type].avail > 0) {
                    availableMargin = available[id][current.type].avail;
                }
                if (availableMargin >= needTrans) {
                    availableMargin = needTrans;
                } else {
                    //close offer
                    if (offer[id] && offer[id][current.type]) {
                        var _ret6 = function () {
                            var cancelOffer = function cancelOffer(index) {
                                if (index >= offer[id][current.type].length || availableMargin >= needTrans) {
                                    return _promise2.default.resolve([availableMargin, needAmount]);
                                } else {
                                    if (offer[id][current.type][index].risk === undefined) {
                                        return cancelOffer(index + 1);
                                    }
                                    availableMargin = availableMargin + offer[id][current.type][index].amount;
                                    if (availableMargin >= needTrans) {
                                        availableMargin = needTrans;
                                    }
                                    return userRest.cancelFundingOffer(offer[id][current.type][index].id).then(function () {
                                        return new _promise2.default(function (resolve, reject) {
                                            return setTimeout(function () {
                                                return resolve();
                                            }, 3000);
                                        }).then(function () {
                                            return cancelOffer(index + 1);
                                        });
                                    });
                                }
                            };
                            return {
                                v: cancelOffer(0)
                            };
                        }();

                        if ((typeof _ret6 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret6)) === "object") return _ret6.v;
                    }
                }
            }
            return _promise2.default.resolve([availableMargin, needAmount]);
        };
        return checkExpire().then(function () {
            return getAM();
        }).then(function (_ref) {
            var _ref2 = (0, _slicedToArray3.default)(_ref, 2),
                availableMargin = _ref2[0],
                needAmount = _ref2[1];

            console.log(availableMargin);
            console.log(needAmount);
            console.log(available[id]);
            //transform wallet
            if (availableMargin < 1) {
                return _promise2.default.resolve(needAmount);
            } else {
                return userRest.transfer({
                    from: 'funding',
                    to: 'margin',
                    amount: availableMargin.toString(),
                    currency: current.type.substr(1)
                }).then(function () {
                    return new _promise2.default(function (resolve, reject) {
                        return setTimeout(function () {
                            return resolve(needAmount);
                        }, 3000);
                    });
                });
            }
        }).then(function (needAmount) {
            if (!margin[id][current.type] || margin[id][current.type].avail < 1) {
                return _promise2.default.resolve();
            }
            console.log(margin[id][current.type].avail);
            //order
            var marginOrderAmount = margin[id][current.type].avail > needAmount ? needAmount : margin[id][current.type].avail;
            if (marginOrderAmount >= 10) {
                var _ret7 = function () {
                    var getLowpoint = function getLowpoint() {
                        var index = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
                        var final_low_point = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
                        var final_last_price = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 1;
                        var symbol = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : '';

                        if (index >= current.pair.length) {
                            return _promise2.default.resolve([final_low_point, symbol]);
                        } else {
                            if (_constants.SUPPORT_PAIR[current.type] && _constants.SUPPORT_PAIR[current.type].indexOf(current.pair[index]) !== -1) {
                                return userRest.candles({ symbol: current.pair[index], timeframe: '30m', query: { limit: 120 } }).then(function (entries) {
                                    var low_point = 0;
                                    var range = entries.length > current.low_point / 30 ? current.low_point / 30 : entries.length;
                                    for (var _i11 = 0; _i11 < range; _i11++) {
                                        if (!low_point || entries[_i11].low < low_point) {
                                            low_point = entries[_i11].low;
                                        }
                                    }
                                    var last_price = 1;
                                    if (_constants.SUPPORT_PRICE.indexOf(current.pair[index]) !== -1) {
                                        last_price = priceData[current.pair[index]].lastPrice;
                                    }
                                    low_point = low_point * 1.005 < last_price ? low_point * 1.005 : last_price;
                                    console.log(low_point);
                                    console.log(last_price);
                                    return final_low_point === 0 || final_last_price / final_low_point > last_price / low_point ? getLowpoint(index + 1, low_point, last_price, current.pair[index]) : getLowpoint(index + 1, final_low_point, final_last_price, symbol);
                                });
                            } else {
                                return getLowpoint(index + 1, final_low_point, final_last_price, symbol);
                            }
                        }
                    };
                    return {
                        v: getLowpoint(0).then(function (_ref3) {
                            var _ref4 = (0, _slicedToArray3.default)(_ref3, 2),
                                low_point = _ref4[0],
                                symbol = _ref4[1];

                            console.log(low_point);
                            if (low_point <= 0) {
                                return _promise2.default.resolve();
                            }
                            var orderAmount = current.leverage ? marginOrderAmount * current.leverage * 0.985 / low_point : marginOrderAmount * 0.985 / low_point;
                            console.log(orderAmount);
                            var or = new _bfxApiNodeModels.Order({
                                cid: Date.now(),
                                type: 'LIMIT',
                                symbol: symbol,
                                amount: orderAmount,
                                price: low_point,
                                flags: 0,
                                lev: current.leverage ? current.leverage : 1
                            }, userRest);
                            return or.submit().then(function () {
                                current.used = current.used ? current.used + marginOrderAmount : marginOrderAmount;
                                current.last_trade = Math.round(new Date().getTime() / 1000);
                                return (0, _mongoTool2.default)('update', _constants.USERDB, { "username": id, "bitfinex.type": current.type }, { $set: { "bitfinex.$.used": current.used, "bitfinex.$.last_trade": current.last_trade } }).then(function () {
                                    return new _promise2.default(function (resolve, reject) {
                                        return setTimeout(function () {
                                            return resolve();
                                        }, 3000);
                                    });
                                });
                            });
                        })
                    };
                }();

                if ((typeof _ret7 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret7)) === "object") return _ret7.v;
            }
        });
    };
    var getLegder = function getLegder(current) {
        if (ledger[id][current.type] && ledger[id][current.type].length > 0) {
            var now = new Date();
            now.setHours(0);
            now.setMinutes(0);
            now.setSeconds(0);
            if (ledger[id][current.type][0].time * 1000 >= now.getTime()) {
                return _promise2.default.resolve();
            } else {
                now.setHours(9);
                now.setMinutes(30);
                if (new Date().getTime() < now.getTime()) {
                    return _promise2.default.resolve();
                }
            }
        }
        return userRest.ledgers({ ccy: current.type.substr(1), category: 28 }).then(function (entries) {
            console.log(current.type + ' ledger');
            ledger[id][current.type] = entries.map(function (e) {
                return {
                    id: e.id,
                    time: Math.round(e.mts / 1000),
                    amount: Math.round(e.amount * 100) / 100,
                    rate: e.amount / e.balance,
                    type: 0
                };
            });
        }).then(function () {
            return userRest.ledgers({ ccy: current.type.substr(1), category: 51 }).then(function (entries) {
                var previous = null;
                var pamount = 0;
                var pbalance = 0;
                entries.forEach(function (e) {
                    if (e.wallet === 'funding') {
                        if (!previous) {
                            previous = {
                                id: e.id,
                                time: Math.round(e.mts / 1000),
                                amount: e.amount,
                                type: 1
                            };
                            pamount = e.amount;
                            pbalance = e.balance;
                        } else if (pamount < 0 && e.amount > 0) {
                            previous.rate = previous.amount / pbalance;
                            previous.amount = Math.round(previous.amount * 100) / 100;
                            ledger[id][current.type].push(previous);
                            previous = {
                                id: e.id,
                                time: Math.round(e.mts / 1000),
                                amount: e.amount,
                                type: 1
                            };
                            pamount = e.amount;
                            pbalance = e.balance;
                        } else {
                            previous = {
                                id: e.id,
                                time: Math.round(e.mts / 1000),
                                amount: previous.amount + e.amount,
                                type: 1
                            };
                            pamount = e.amount;
                            pbalance = e.balance;
                        }
                    }
                });
                if (previous) {
                    previous.rate = previous.amount / pbalance;
                    previous.amount = Math.round(previous.amount * 100) / 100;
                    ledger[id][current.type].push(previous);
                }
                (0, _sendWs2.default)({
                    type: 'bitfinex',
                    data: -1,
                    user: id
                });
            });
        });
    };
    var recurLoan = function recurLoan(index) {
        return index >= curArr.length ? _promise2.default.resolve() : curArr[index] && _constants.SUPPORT_COIN.indexOf(curArr[index].type) !== -1 ? getLegder(curArr[index]).then(function () {
            return singleLoan(curArr[index]).then(function () {
                return singleTrade(curArr[index]).then(function () {
                    return recurLoan(index + 1);
                });
            });
        }) : recurLoan(index + 1);
    };
    return initialBook().then(function () {
        return recurLoan(0);
    });
};

var resetBFX = exports.resetBFX = function resetBFX() {
    var update = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : false;

    console.log('BFX reset');
    var closeWs = function closeWs(index) {
        if (index >= (0, _keys2.default)(userWs).length) {
            userWs = {};
            userOk = {};
            return _promise2.default.resolve();
        } else {
            userWs[(0, _keys2.default)(userWs)[index]].close();
            return closeWs(index + 1);
        }
    };
    if (update) {
        for (var i in updateTime) {
            updateTime[i] = {};
            updateTime[i]['book'] = 0;
            updateTime[i]['offer'] = 0;
            updateTime[i]['credit'] = 0;
            updateTime[i]['position'] = 0;
            updateTime[i]['order'] = 0;
        }
    } else {
        return closeWs(0);
    }
};

exports.default = {
    getBot: function getBot(id) {
        return (0, _mongoTool2.default)('find', _constants.USERDB, { _id: id }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                return (0, _utility.handleError)(new _utility.HoError('User does not exist!!!'));
            }
            return returnSupport(items[0].bitfinex);
        });
    },
    updateBot: function updateBot(id, set) {
        var isSupport = false;
        var _iteratorNormalCompletion4 = true;
        var _didIteratorError4 = false;
        var _iteratorError4 = undefined;

        try {
            for (var _iterator4 = (0, _getIterator3.default)(_constants.SUPPORT_COIN), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                var i = _step4.value;

                if (set.type === i) {
                    isSupport = true;
                    break;
                }
            }
        } catch (err) {
            _didIteratorError4 = true;
            _iteratorError4 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion4 && _iterator4.return) {
                    _iterator4.return();
                }
            } finally {
                if (_didIteratorError4) {
                    throw _iteratorError4;
                }
            }
        }

        if (!isSupport) {
            return (0, _utility.handleError)(new _utility.HoError(set.type + ' is not support!!!'));
        }
        var data = {};
        if (set.key) {
            var key = (0, _utility.isValidString)(set.key, 'name');
            if (!key) {
                return (0, _utility.handleError)(new _utility.HoError('API Key is not valid'));
            }
            data['key'] = key;
        }
        if (set.secret) {
            var secret = (0, _utility.isValidString)(set.secret, 'name');
            if (!secret) {
                return (0, _utility.handleError)(new _utility.HoError('API Secret is not valid'));
            }
            data['secret'] = secret;
        }
        if (set.amountLimit) {
            var amountLimit = (0, _utility.isValidString)(set.amountLimit, 'int');
            if (!amountLimit) {
                return (0, _utility.handleError)(new _utility.HoError('Amount Limit is not valid'));
            }
            //data['amountLimit'] = amountLimit > MINIMAL_OFFER ? amountLimit : MINIMAL_OFFER;
            data['amountLimit'] = amountLimit;
        }
        if (set.riskLimit) {
            var riskLimit = (0, _utility.isValidString)(set.riskLimit, 'int');
            if (!riskLimit) {
                return (0, _utility.handleError)(new _utility.HoError('Risk is not valid'));
            }
            data['riskLimit'] = riskLimit > 10 ? 10 : riskLimit < 1 ? 1 : parseInt(riskLimit);
        }
        if (set.waitTime) {
            var waitTime = (0, _utility.isValidString)(set.waitTime, 'int');
            if (!waitTime) {
                return (0, _utility.handleError)(new _utility.HoError('Time Intervel is not valid'));
            }
            data['waitTime'] = waitTime;
        }
        if (set.miniRate) {
            var miniRate = (0, _utility.isValidString)(set.miniRate, 'zeroint');
            if (miniRate === false) {
                return (0, _utility.handleError)(new _utility.HoError('Mini Rate is not valid'));
            }
            data['miniRate'] = miniRate;
        }
        if (set.dynamic) {
            var dynamic = (0, _utility.isValidString)(set.dynamic, 'zeroint');
            if (dynamic === false) {
                return (0, _utility.handleError)(new _utility.HoError('Dynamic Rate is not valid'));
            }
            data['dynamic'] = dynamic;
        }
        if (set.keepAmount) {
            var keepAmount = (0, _utility.isValidString)(set.keepAmount, 'zeroint');
            if (keepAmount === false) {
                return (0, _utility.handleError)(new _utility.HoError('Keep Amount is not valid'));
            }
            data['keepAmount'] = keepAmount;
        }
        if (set.hasOwnProperty('keep')) {
            data['isKeep'] = set.keep;
        }
        if (set.hasOwnProperty('active')) {
            data['isActive'] = set.active;
        }
        if (set.keepAmountRate1) {
            var keepAmountRate1 = (0, _utility.isValidString)(set.keepAmountRate1, 'zeroint');
            if (keepAmountRate1 === false) {
                return (0, _utility.handleError)(new _utility.HoError('Keep Amount 1 is not valid'));
            }
            if (keepAmountRate1 > 0 && set.keepAmountMoney1) {
                var keepAmountMoney1 = (0, _utility.isValidString)(set.keepAmountMoney1, 'zeroint');
                if (keepAmountMoney1 === false) {
                    return (0, _utility.handleError)(new _utility.HoError('Keep Amount 1 is not valid'));
                }
                data['keepAmountRate1'] = keepAmountRate1;
                data['keepAmountMoney1'] = keepAmountMoney1;
            }
        }
        if (set.dynamicRate1) {
            var dynamicRate1 = (0, _utility.isValidString)(set.dynamicRate1, 'zeroint');
            if (dynamicRate1 === false) {
                return (0, _utility.handleError)(new _utility.HoError('Dynamic Rate 1 is not valid'));
            }
            if (dynamicRate1 > 0 && set.dynamicDay1) {
                var dynamicDay1 = (0, _utility.isValidString)(set.dynamicDay1, 'zeroint');
                if (dynamicDay1 === false || dynamicDay1 < 2 || dynamicDay1 > 30) {
                    return (0, _utility.handleError)(new _utility.HoError('Dynamic Rate 1 is not valid'));
                }
                data['dynamicRate1'] = dynamicRate1;
                data['dynamicDay1'] = Math.floor(dynamicDay1);
            }
        }
        if (set.dynamicRate2) {
            var dynamicRate2 = (0, _utility.isValidString)(set.dynamicRate2, 'zeroint');
            if (dynamicRate2 === false) {
                return (0, _utility.handleError)(new _utility.HoError('Dynamic Rate 2 is not valid'));
            }
            if (dynamicRate2 > 0 && set.dynamicDay2) {
                var dynamicDay2 = (0, _utility.isValidString)(set.dynamicDay2, 'zeroint');
                if (dynamicDay2 === false || dynamicDay2 < 2 || dynamicDay2 > 30) {
                    return (0, _utility.handleError)(new _utility.HoError('Dynamic Rate 2 is not valid'));
                }
                data['dynamicRate2'] = dynamicRate2;
                data['dynamicDay2'] = Math.floor(dynamicDay2);
            }
        }
        if (_constants.SUPPORT_PAIR[set.type]) {
            if (set.hasOwnProperty('trade')) {
                data['isTrade'] = set.trade;
            }
            if (set.low_point) {
                var low_point = (0, _utility.isValidString)(set.low_point, 'int');
                if (low_point === false) {
                    return (0, _utility.handleError)(new _utility.HoError('Low Point is not valid'));
                }
                data['low_point'] = low_point;
            }
            if (set.amount) {
                var amount = (0, _utility.isValidString)(set.amount, 'int');
                if (amount === false) {
                    return (0, _utility.handleError)(new _utility.HoError('Trade Amount is not valid'));
                }
                data['amount'] = amount;
            }
            if (set.interval) {
                var interval = (0, _utility.isValidString)(set.interval, 'int');
                if (interval === false) {
                    return (0, _utility.handleError)(new _utility.HoError('Trade Interval is not valid'));
                }
                data['interval'] = interval;
            }
            if (set.loss_stop) {
                var loss_stop = (0, _utility.isValidString)(set.loss_stop, 'int');
                if (loss_stop === false) {
                    return (0, _utility.handleError)(new _utility.HoError('Loss Stop is not valid'));
                }
                data['loss_stop'] = loss_stop;
            }
            if (set.gain_stop) {
                var gain_stop = (0, _utility.isValidString)(set.gain_stop, 'zeroint');
                if (gain_stop === false) {
                    return (0, _utility.handleError)(new _utility.HoError('Gain Stop is not valid'));
                }
                data['gain_stop'] = gain_stop;
            }
            if (set.leverage) {
                var leverage = (0, _utility.isValidString)(set.leverage, 'zeroint');
                if (leverage === false) {
                    return (0, _utility.handleError)(new _utility.HoError('Leverage is not valid'));
                }
                data['leverage'] = leverage;
            }
            if (set.pair) {
                var _ret8 = function () {
                    var pair = (0, _utility.isValidString)(set.pair, 'name');
                    if (pair === false) {
                        return {
                            v: (0, _utility.handleError)(new _utility.HoError('Trade Pair is not valid'))
                        };
                    }
                    var pairArr = [];
                    pair.split(',').forEach(function (v) {
                        var p = v.trim();
                        if (_constants.SUPPORT_PAIR[set.type].indexOf(p) !== -1) {
                            pairArr.push(p);
                        }
                    });
                    if (pairArr.length > 0) {
                        data['pair'] = pairArr;
                    }
                }();

                if ((typeof _ret8 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret8)) === "object") return _ret8.v;
            }
        }
        data['type'] = set.type;
        return (0, _mongoTool2.default)('find', _constants.USERDB, { _id: id }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                return (0, _utility.handleError)(new _utility.HoError('User does not exist!!!'));
            }
            var bitfinex = [];
            if (!items[0].bitfinex) {
                bitfinex = [data];
            } else {
                var isExist = false;
                for (var i = 0; i < items[0].bitfinex.length; i++) {
                    if (items[0].bitfinex[i].type === data.type) {
                        items[0].bitfinex[i] = (0, _assign2.default)({}, items[0].bitfinex[i], data);
                        isExist = true;
                        break;
                    }
                }
                if (!isExist) {
                    items[0].bitfinex.push(data);
                }
                bitfinex = items[0].bitfinex;
            }
            return (0, _mongoTool2.default)('update', _constants.USERDB, { _id: id }, { $set: { bitfinex: bitfinex } }).then(function (user) {
                console.log(user);
                return returnSupport(bitfinex);
            });
        });
    },
    deleteBot: function deleteBot(id, type) {
        return (0, _mongoTool2.default)('find', _constants.USERDB, { _id: id }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                return (0, _utility.handleError)(new _utility.HoError('User does not exist!!!'));
            }
            if (items[0].bitfinex) {
                var _ret9 = function () {
                    var bitfinex = items[0].bitfinex.filter(function (v) {
                        return v.type === type ? false : true;
                    });
                    //console.log(bitfinex);
                    return {
                        v: (0, _mongoTool2.default)('update', _constants.USERDB, { _id: id }, { $set: { bitfinex: bitfinex } }).then(function (user) {
                            console.log(user);
                            return returnSupport(bitfinex);
                        })
                    };
                }();

                if ((typeof _ret9 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret9)) === "object") return _ret9.v;
            } else {
                return returnSupport();
            }
        });
    },
    query: function query(page, name, sortName, sortType, user, session) {
        var uid = arguments.length > 6 && arguments[6] !== undefined ? arguments[6] : -1;

        var id = user.username;
        if (name) {
            name = (0, _utility.isValidString)(name, 'name');
            if (!name) {
                return (0, _utility.handleError)(new _utility.HoError('tag name is not valid'));
            }
        }
        page = (0, _utility.isValidString)(page, 'zeroint');
        if (page === false) {
            return (0, _utility.handleError)(new _utility.HoError('page is not valid'));
        }
        var itemList = [];
        var rateList = [];
        if (!session['bitfinex']) {
            session['bitfinex'] = 'all';
        }
        if (name) {
            session['bitfinex'] = name;
        }
        var type = 0;
        var coin = 'all';
        var sess = session['bitfinex'];
        switch (sess) {
            case 'usd':
            case 'USD':
                coin = _constants.FUSD_SYM;
                break;
            case 'ust':
            case 'UST':
                coin = _constants.FUSDT_SYM;
                break;
            case 'eth':
            case 'ETH':
                coin = _constants.FETH_SYM;
                break;
            case 'btc':
            case 'BTC':
                coin = _constants.FBTC_SYM;
                break;
            case 'omg':
            case 'OMG':
                coin = _constants.FOMG_SYM;
                break;
            case 'wallet':
            case '錢包':
                type = 1;
                break;
            case 'rate':
            case '利率':
                type = 2;
                break;
            case 'offer':
            case '掛單':
                type = 3;
                break;
            case 'credit':
            case '放款':
                type = 4;
                break;
            case 'payment':
            case '利息收入':
                type = 5;
                break;
        }
        if (type === 0 || type === 1) {
            for (var i = 0; i < _constants.SUPPORT_COIN.length; i++) {
                var v = _constants.SUPPORT_COIN[i];
                if (coin !== 'all' && coin !== v) {
                    continue;
                }
                if (available[id] && available[id][v]) {
                    if (uid === (i + 1) * 10000) {
                        return {
                            item: [{
                                name: '\u9592\u7F6E ' + v.substr(1) + ' $' + Math.round(available[id][v].avail * 100) / 100,
                                id: (i + 1) * 10000,
                                tags: [v.substr(1).toLowerCase(), 'wallet', '錢包'],
                                rate: '$' + Math.round(available[id][v].total * 100) / 100,
                                count: available[id][v].total,
                                utime: available[id][v].time,
                                type: 0
                            }]
                        };
                    } else {
                        itemList.push({
                            name: '\u9592\u7F6E ' + v.substr(1) + ' $' + Math.round(available[id][v].avail * 100) / 100,
                            id: (i + 1) * 10000,
                            tags: [v.substr(1).toLowerCase(), 'wallet', '錢包'],
                            rate: '$' + Math.round(available[id][v].total * 100) / 100,
                            count: available[id][v].total,
                            utime: available[id][v].time,
                            type: 0
                        });
                    }
                }
            }
        }
        if (type === 0 || type === 2) {
            var tempList = uid === 0 ? rateList : itemList;
            for (var _i12 = 0; _i12 < _constants.SUPPORT_COIN.length; _i12++) {
                var _v = _constants.SUPPORT_COIN[_i12];
                if (coin !== 'all' && coin !== _v) {
                    continue;
                }
                if (currentRate[_v]) {
                    var rate = Math.round(currentRate[_v].rate / 10) / 100000;
                    tempList.push({
                        name: _v.substr(1) + ' Rate',
                        id: _i12,
                        tags: [_v.substr(1).toLowerCase(), 'rate', '利率'],
                        rate: rate + '%',
                        count: rate,
                        utime: currentRate[_v].time,
                        type: 1
                    });
                }
            }
            var vid = _constants.SUPPORT_COIN.length;
            for (var _i13 in priceData) {
                tempList.push({
                    name: _i13.substr(1) + ' $' + Math.floor(priceData[_i13].lastPrice * 10000) / 10000,
                    id: vid++,
                    tags: [_i13.substr(1, 4), _i13.substr(-3), 'rate', '利率'],
                    rate: Math.floor(priceData[_i13].dailyChange * 100) / 100 + '%',
                    count: priceData[_i13].dilyChange,
                    utime: priceData[_i13].time,
                    type: 1
                });
            }
        }
        if (uid === 0) {
            return { item: rateList };
        } else if (uid > 0) {
            return { empty: true };
        }
        if (type === 0 || type === 3) {
            _constants.SUPPORT_COIN.forEach(function (v, i) {
                if (coin !== 'all' && coin !== v) {
                    return false;
                }
                if (order[id] && order[id][v]) {
                    order[id][v].forEach(function (o) {
                        itemList.push({
                            name: '\u4EA4\u6613\u639B\u55AE ' + o.symbol.substr(1) + ' ' + Math.floor(o.amount * 10000) / 10000 + '\u679A ' + o.type,
                            id: o.id,
                            tags: [v.substr(1).toLowerCase(), 'order', '交易掛單'],
                            rate: '$' + o.price,
                            count: o.price,
                            utime: o.time,
                            boost: o.amount < 0 ? true : false,
                            type: 2
                        });
                    });
                }
                if (offer[id] && offer[id][v]) {
                    offer[id][v].forEach(function (o) {
                        var rate = Math.round(o.rate * 10000000) / 100000;
                        var risk = o.risk === undefined ? '手動' : 'risk ' + o.risk;
                        itemList.push({
                            name: '\u639B\u55AE ' + v.substr(1) + ' $' + Math.floor(o.amount * 100) / 100 + ' ' + o.period + '\u5929\u671F ' + risk,
                            id: o.id,
                            tags: [v.substr(1).toLowerCase(), 'offer', '掛單'],
                            rate: rate + '%',
                            boost: o.period === 30 ? true : false,
                            count: rate,
                            utime: o.time,
                            type: 2
                        });
                    });
                }
            });
        }
        if (type === 0 || type === 4) {
            _constants.SUPPORT_COIN.forEach(function (v, i) {
                if (coin !== 'all' && coin !== v) {
                    return false;
                }
                if (position[id] && position[id][v]) {
                    position[id][v].forEach(function (o) {
                        console.log(o);
                        var rate = Math.round(o.pl * 1000) / 1000;
                        itemList.push({
                            name: '\u90E8\u4F4D ' + o.symbol.substr(1) + ' ' + Math.floor(o.amount * 10000) / 10000 + '\u679A ' + o.price + ' / ' + o.lp,
                            id: o.id,
                            tags: [v.substr(1).toLowerCase(), 'position', '部位'],
                            rate: '$' + rate,
                            count: rate,
                            utime: o.time,
                            type: 3,
                            boost: o.pl < 0 ? true : false
                        });
                    });
                }
                if (credit[id] && credit[id][v]) {
                    credit[id][v].forEach(function (o) {
                        var rate = Math.round(o.rate * 10000000) / 100000;
                        itemList.push({
                            name: (o.side === 1 ? '放款' : '借款') + ' ' + v.substr(1) + ' $' + Math.floor(o.amount * 100) / 100 + ' ' + o.period + '\u5929\u671F ' + o.pair,
                            id: o.id,
                            tags: [v.substr(1).toLowerCase(), 'credit', '放款'],
                            rate: rate + '%',
                            count: rate,
                            boost: o.period === 30 ? true : false,
                            utime: o.time + o.period * 86400,
                            type: 3
                        });
                    });
                }
            });
        }
        if (type === 0 || type === 5) {
            _constants.SUPPORT_COIN.forEach(function (v, i) {
                if (coin !== 'all' && coin !== v) {
                    return false;
                }
                if (ledger[id] && ledger[id][v]) {
                    ledger[id][v].forEach(function (o) {
                        switch (o.type) {
                            case 0:
                                var _rate = Math.round(o.rate * 10000000) / 100000;
                                itemList.push({
                                    name: '\u5229\u606F\u6536\u5165 ' + v.substr(1) + ' $' + o.amount,
                                    id: o.id,
                                    tags: [v.substr(1).toLowerCase(), 'payment', '利息收入'],
                                    rate: _rate + '%',
                                    count: _rate,
                                    utime: o.time,
                                    type: 4
                                });
                                break;
                            case 1:
                                var rate1 = Math.round(o.rate * 10000000) / 100000;
                                itemList.push({
                                    name: '\u4EA4\u6613\u6536\u5165 ' + v.substr(1) + ' $' + o.amount,
                                    id: o.id,
                                    tags: [v.substr(1).toLowerCase(), 'profit', '交易收入'],
                                    rate: rate1 + '%',
                                    count: rate1,
                                    utime: o.time,
                                    type: 4,
                                    boost: o.rate < 0 ? true : false
                                });
                                break;
                        }
                    });
                }
            });
        }
        if (sortName === 'name' && sortType === 'desc') {
            itemList.reverse();
        } else if (sortName === 'mtime' && sortType === 'asc') {
            itemList.sort(function (a, b) {
                return a.count - b.count;
            });
        } else if (sortName === 'mtime' && sortType === 'desc') {
            itemList.sort(function (a, b) {
                return b.count - a.count;
            });
        } else if (sortName === 'count' && sortType === 'asc') {
            itemList.sort(function (a, b) {
                return a.utime - b.utime;
            });
        } else if (sortName === 'count' && sortType === 'desc') {
            itemList.sort(function (a, b) {
                return b.utime - a.utime;
            });
        }
        return {
            itemList: itemList,
            parentList: {
                cur: [],
                his: [],
                exactly: [],
                bookmark: ''
            }
        };
    },
    parent: function parent() {
        return _constants.BITNIFEX_PARENT;
    }
};


var returnSupport = function returnSupport(bitfinex) {
    return bitfinex ? _constants.SUPPORT_COIN.map(function (v) {
        var _iteratorNormalCompletion5 = true;
        var _didIteratorError5 = false;
        var _iteratorError5 = undefined;

        try {
            for (var _iterator5 = (0, _getIterator3.default)(bitfinex), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
                var i = _step5.value;

                if (i.type === v) {
                    if (i.pair) {
                        i.pair = i.pair.toString();
                    }
                    if (_constants.SUPPORT_PAIR[v]) {
                        i.tradable = true;
                    }
                    return i;
                }
            }
        } catch (err) {
            _didIteratorError5 = true;
            _iteratorError5 = err;
        } finally {
            try {
                if (!_iteratorNormalCompletion5 && _iterator5.return) {
                    _iterator5.return();
                }
            } finally {
                if (_didIteratorError5) {
                    throw _iteratorError5;
                }
            }
        }

        return { type: v };
    }) : _constants.SUPPORT_COIN.map(function (v) {
        return { type: v };
    });
};