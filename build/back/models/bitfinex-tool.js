'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.resetBFX = exports.setWsOffer = exports.calWeb = exports.calRate = undefined;

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _keys = require('babel-runtime/core-js/object/keys');

var _keys2 = _interopRequireDefault(_keys);

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _ver = require('../../../ver');

var _constants = require('../constants');

var _bitfinexApiNode = require('bitfinex-api-node');

var _bitfinexApiNode2 = _interopRequireDefault(_bitfinexApiNode);

var _bfxApiNodeModels = require('bfx-api-node-models');

var _stockTool = require('../models/stock-tool');

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

var _redisTool = require('../models/redis-tool');

var _redisTool2 = _interopRequireDefault(_redisTool);

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
var order_count = 0;

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
                return (0, _redisTool2.default)('hgetall', 'bitfinex: ' + _constants.SUPPORT_PRICE[index]).then(function (item) {
                    priceData[_constants.SUPPORT_PRICE[index]] = {
                        dailyChange: ticker.dailyChangePerc * 100,
                        lastPrice: ticker.lastPrice,
                        time: Math.round(new Date().getTime() / 1000),
                        str: item ? item.str : ''
                    };
                    return recurPrice(index + 1);
                });
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
                    finalRate[curType] = finalRate[curType].map(function (v) {
                        return v >= _constants.MAX_RATE ? _constants.MAX_RATE - 1 : v;
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

var calWeb = exports.calWeb = function calWeb(curArr) {
    var recurType = function recurType(index) {
        return index >= curArr.length ? _promise2.default.resolve() : _constants.SUPPORT_PAIR[_constants.FUSD_SYM].indexOf(curArr[index]) !== -1 ? singleCal(curArr[index], index).then(function () {
            return recurType(index + 1);
        }) : recurType(index + 1);
    };
    var singleCal = function singleCal(curType, index) {
        return rest.candles({ symbol: curType, timeframe: '1h', query: { limit: 3600 } }).then(function (entries) {
            var max = 0;
            var min = 0;
            var min_vol = 0;
            var raw_arr = entries.map(function (v) {
                if (!max || max < v.high) {
                    max = v.high;
                }
                if (!min || min > v.low) {
                    min = v.low;
                }
                if (!min_vol || min_vol > v.volume) {
                    min_vol = v.volume;
                }
                return {
                    h: v.high,
                    l: v.low,
                    v: v.volume
                };
            });
            console.log(max);
            console.log(min);
            console.log(min_vol);
            var loga = (0, _stockTool.logArray)(max, min);
            var web = (0, _stockTool.calStair)(raw_arr, loga, min, 0, _constants.BITFINEX_FEE, 240 * 3);
            console.log(web);
            var month = [];
            var ret_str1 = [];
            var ret_str = '';
            var best_rate = 0;
            var lastest_type = 0;
            var lastest_rate = 0;
            var resultShow = function resultShow(type) {
                var str = '';
                var testResult = [];
                var match = [];
                //let j = Math.floor((raw_arr.length - 1) / 2);
                var j = raw_arr.length - 240 * 3;
                //console.log('start');
                while (j > 239) {
                    //console.log(j);
                    var temp = (0, _stockTool.stockTest)(raw_arr, loga, min, type, j, false, 240, _constants.RANGE_BITFINEX_INTERVAL, _constants.BITFINEX_FEE, _constants.BITFINEX_INTERVAL, _constants.BITFINEX_INTERVAL, 24, 1);
                    var tempM = temp.str.match(/^(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\d+) (\d+) (\-?\d+\.?\d*)\%/);
                    if (tempM && (tempM[3] !== '0' || tempM[5] !== '0' || tempM[6] !== '0')) {
                        testResult.push(temp);
                        match.push(tempM);
                    }
                    j = temp.start + 1;
                }
                if (testResult.length > 0) {
                    var _ret = function () {
                        testResult.forEach(function (v, i) {
                            if (!month[i]) {
                                month[i] = [];
                            }
                            month[i].push(v);
                        });
                        var rate = 1;
                        var real = 1;
                        var count = 0;
                        var times = 0;
                        var stoploss = 0;
                        var maxloss = 0;
                        match.forEach(function (v, i) {
                            rate = rate * (Number(v[3]) + 100) / 100;
                            /*if ((i === match.length - 1) && (!lastest_rate || Number(v[3]) > lastest_rate)) {
                                lastest_rate = Number(v[3]);
                                lastest_type = type;
                            }*/
                            real = real * (Number(v[4]) + 100) / 100;
                            count++;
                            times += Number(v[5]);
                            stoploss += Number(v[6]);
                            if (!maxloss || maxloss > +v[7]) {
                                maxloss = +v[7];
                            }
                        });
                        str = Math.round((+priceData[curType].lastPrice - web.mid) / web.mid * 10000) / 100 + '% ' + Math.ceil(web.mid * (web.arr.length - 1) / 3 * 2);
                        rate = Math.round(rate * 10000 - 10000) / 100;
                        real = Math.round(rate * 100 - real * 10000 + 10000) / 100;
                        times = Math.round(times / count * 100) / 100;
                        str += ' ' + rate + '% ' + real + '% ' + times + ' ' + stoploss + ' ' + maxloss + '% ' + raw_arr.length + ' ' + min_vol;
                        if (!best_rate || rate > best_rate) {
                            best_rate = rate;
                            ret_str = str;
                        }
                        var temp = (0, _stockTool.stockTest)(raw_arr, loga, min, type, j, true, 240, _constants.RANGE_BITFINEX_INTERVAL, _constants.BITFINEX_FEE, _constants.BITFINEX_INTERVAL, _constants.BITFINEX_INTERVAL, 24, 1);
                        if (temp === 'data miss') {
                            return {
                                v: true
                            };
                        }
                        var tempM = temp.str.match(/^(\-?\d+\.?\d*)\% (\d+) (\-?\d+\.?\d*)\% (\-?\d+\.?\d*)\% (\d+) (\d+) (\-?\d+\.?\d*)\%/);
                        if (tempM && (tempM[3] !== '0' || tempM[5] !== '0' || tempM[6] !== '0')) {
                            if (!lastest_rate || Number(tempM[3]) > lastest_rate) {
                                lastest_rate = Number(tempM[3]);
                                lastest_type = type;
                            }
                        }
                    }();

                    if ((typeof _ret === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret)) === "object") return _ret.v;
                } else {
                    str = 'no less than mid point';
                }
                ret_str1.push(str);
            };
            for (var i = 15; i >= 0; i--) {
                resultShow(i);
            }
            month.forEach(function (v, i) {
                console.log('month' + (+i + 1));
                v.forEach(function (k) {
                    return console.log(k.str);
                });
            });
            ret_str1.forEach(function (v) {
                return console.log(v);
            });
            if (!ret_str) {
                ret_str = 'no less than mid point';
            }
            console.log(lastest_type);
            console.log('done');
            (0, _redisTool2.default)('hmset', 'bitfinex: ' + curArr[index], {
                str: ret_str
            }).catch(function (err) {
                return (0, _utility.handleError)(err, 'Redis');
            });
            var updateWeb = function updateWeb() {
                return (0, _mongoTool2.default)('find', _constants.TOTALDB, { index: curArr[index] }).then(function (item) {
                    console.log(item);
                    if (item.length < 1) {
                        return (0, _mongoTool2.default)('insert', _constants.TOTALDB, {
                            sType: 1,
                            index: curArr[index],
                            name: curArr[index].substr(1),
                            type: _constants.FUSD_SYM,
                            web: web.arr,
                            wType: lastest_type,
                            mid: web.mid
                        }).then(function (items) {
                            return console.log(items);
                        });
                    } else {
                        var _ret2 = function () {
                            var recur_update = function recur_update(i) {
                                if (i >= item.length) {
                                    return _promise2.default.resolve();
                                } else {
                                    if (!item[i].owner) {
                                        return (0, _mongoTool2.default)('update', _constants.TOTALDB, { _id: item[i]._id }, { $set: {
                                                web: web.arr,
                                                wType: lastest_type,
                                                mid: web.mid
                                            } }).then(function (items) {
                                            console.log(items);
                                            return recur_update(i + 1);
                                        });
                                    } else {
                                        var maxAmount = web.mid * (web.arr.length - 1) / 3 * 2;
                                        return (0, _mongoTool2.default)('update', _constants.TOTALDB, { _id: item[i]._id }, { $set: {
                                                web: web.arr,
                                                wType: lastest_type,
                                                mid: web.mid,
                                                times: Math.floor(item[i].orig / maxAmount * 10000) / 10000
                                            } }).then(function (items) {
                                            console.log(items);
                                            return recur_update(i + 1);
                                        });
                                    }
                                }
                            };
                            return {
                                v: recur_update(0)
                            };
                        }();

                        if ((typeof _ret2 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret2)) === "object") return _ret2.v;
                    }
                });
            };
            return updateWeb();
        });
    };
    //return recurPrice(0).then(() => recurType(0));
    return recurType(0);
};

var setWsOffer = exports.setWsOffer = function setWsOffer(id) {
    var curArr = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
    var uid = arguments[2];

    //檢查跟設定active
    curArr = curArr.filter(function (v) {
        return v.isActive && (v.riskLimit > 0 && v.waitTime > 0 && v.amountLimit > 0 || v.isTrade && v.pair) ? true : false;
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
            var msg = err.message || err.msg ? err.message || err.msg : '';
            if (!msg) {
                console.log(err);
            }
            if (!msg.includes('auth: dup')) {
                (0, _sendWs2.default)(id + ' Bitfinex Ws Error: ' + msg, 0, 0, true);
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
                        (0, _sendWs2.default)({
                            type: 'bitfinex',
                            data: (i + 1) * 100,
                            user: id
                        });
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
                var isExist = false;
                for (var _i2 = 0; _i2 < order[id][symbol].length; _i2++) {
                    if (os.id === order[id][symbol][_i2].id) {
                        order[id][symbol][_i2].time = Math.round(os.mtsCreate / 1000);
                        order[id][symbol][_i2].status = os.status;
                        isExist = true;
                        break;
                    }
                }
                if (!isExist) {
                    order[id][symbol].push({
                        id: os.id,
                        time: Math.round(os.mtsCreate / 1000),
                        amount: os.amountOrig,
                        type: os.type,
                        symbol: os.symbol,
                        price: os.price,
                        flags: os.flags
                    });
                }
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
                var is_code = false;
                if (order[id][symbol]) {
                    for (var j = 0; j < order[id][symbol].length; j++) {
                        if (order[id][symbol][j].id === os.id) {
                            if (order[id][symbol][j].code) {
                                is_code = true;
                            }
                            order[id][symbol].splice(j, 1);
                            break;
                        }
                    }
                }
                if (is_code && (os.status.includes('EXECUTED') || os.status.includes('INSUFFICIENT BALANCE'))) {
                    var _loop = function _loop(_i3) {
                        if (curArr[_i3].type === symbol && curArr[_i3].isTrade && curArr[_i3].pair) {
                            for (var _j = 0; _j < curArr[_i3].pair.length; _j++) {
                                if (curArr[_i3].pair.type === os.symbol) {
                                    console.log(os.symbol + ' order executed');
                                    return {
                                        v: (0, _mongoTool2.default)('find', _constants.TOTALDB, { owner: uid, sType: 1, type: curArr[_i3].type }).then(function (items) {
                                            console.log(items);
                                            if (items.length < 1) {
                                                (0, _sendWs2.default)(id + ' Total Updata Error: miss ' + os.symbol, 0, 0, true);
                                                (0, _utility.handleError)(new _utility.HoError('miss ' + os.symbol), id + ' Total Updata Error');
                                            } else {
                                                var _ret4 = function () {
                                                    var item = items[0];
                                                    var amount = os.amountOrig - os.amount < 0 ? (1 - _constants.BITFINEX_FEE) * (os.amountOrig - os.amount) : os.amountOrig - os.amount;
                                                    if (amount === 0) {
                                                        return {
                                                            v: false
                                                        };
                                                    }
                                                    var price = os.priceAvg;
                                                    var time = Math.round(new Date().getTime() / 1000);
                                                    var tradeType = amount > 0 ? 'buy' : 'sell';
                                                    if (tradeType === 'buy') {
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
                                                                return time - v.time < _constants.RANGE_BITFINEX_INTERVAL ? true : false;
                                                            }),
                                                            sell: item.previous.sell
                                                        };
                                                    } else if (tradeType === 'sell') {
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
                                                                return time - v.time < _constants.RANGE_BITFINEX_INTERVAL ? true : false;
                                                            }),
                                                            buy: item.previous.buy
                                                        };
                                                    }
                                                    return {
                                                        v: (0, _mongoTool2.default)('update', _constants.TOTALDB, { owner: uid, sType: 1, type: curArr[_i3].type }, { $set: {
                                                                amount: item.amount - price * amount,
                                                                count: item.count ? item.count + amount : amount > 0 ? amount : 0,
                                                                previous: item.previous
                                                            } }).catch(function (err) {
                                                            (0, _sendWs2.default)(id + ' Total Updata Error: ' + (err.message || err.msg), 0, 0, true);
                                                            (0, _utility.handleError)(err, id + ' Total Updata Error');
                                                        })
                                                    };
                                                }();

                                                if ((typeof _ret4 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret4)) === "object") return _ret4.v;
                                            }
                                        })
                                    };
                                    break;
                                }
                            }
                            return 'break';
                        }
                    };

                    _loop2: for (var _i3 = 0; _i3 < curArr.length; _i3++) {
                        var _ret3 = _loop(_i3);

                        switch (_ret3) {
                            case 'break':
                                break _loop2;

                            default:
                                if ((typeof _ret3 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret3)) === "object") return _ret3.v;
                        }
                    }
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
                            flags: v.flags,
                            code: !v.type.includes('EXCHANGE') ? true : false
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
                        var _i4 = _step2.value;

                        if (risk === _i4.risk) {
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
        if (current.riskLimit > 0 && current.waitTime > 0 && current.amountLimit > 0) {} else {
            return _promise2.default.resolve();
        }
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
                for (var _i5 = DR.length; _i5 >= 0; _i5--) {
                    if (_i5 === 0 || DRT.rate < DR[_i5 - 1].rate) {
                        DR.splice(_i5, 0, DRT);
                        break;
                    }
                }
            }
        };
        var getDR = function getDR(rate) {
            if (DR.length === 0) {
                return false;
            }
            for (var _i6 = 0; _i6 < DR.length; _i6++) {
                if (rate >= DR[_i6].rate) {
                    return DR[_i6];
                }
            }
            return false;
        };
        pushDR(current.dynamic, 30);
        pushDR(current.dynamicRate1, current.dynamicDay1);
        pushDR(current.dynamicRate2, current.dynamicDay2);
        //const DR = (current.dynamic > 0) ? current.dynamic/36500*BITFINEX_EXP : 0;
        var extremRateCheck = function extremRateCheck() {
            /*if (!current.isTrade || !current.interval || !current.amount || !current.loss_stop || !current.low_point || !current.pair || current.pair.length < 1) {
                return false;
            }*/
            if (current.isTrade && current.pair) {} else {
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
            /*if (current.isKeep) {
                if (priceData[TBTC_SYM].dailyChange < COIN_MAX || priceData[TETH_SYM].dailyChange < COIN_MAX) {
                    const dailyChange = (priceData[TBTC_SYM].dailyChange < priceData[TETH_SYM].dailyChange) ? priceData[TBTC_SYM].dailyChange : priceData[TETH_SYM].dailyChange;
                    kp = kp * (50 - ((COIN_MAX - dailyChange) / (COIN_MAX - COIN_MAX_MAX) * 50)) / 100;
                }
            }*/
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
                var orig_risk = v.risk;
                var risk = v.newAmount ? v.risk : v.risk > 1 ? v.risk - 1 : 0;
                while (checkRisk(risk, needRetain, needNew)) {
                    risk--;
                }
                if (current.isDiff && risk < 1) {
                    risk = orig_risk;
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
            for (var _i7 = 0; _i7 < newLength; _i7++) {
                var orig_risk = risk;
                while (checkRisk(risk, needRetain, needNew)) {
                    risk--;
                }
                if (current.isDiff && risk < 1) {
                    risk = orig_risk;
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
                for (var _i8 = 0; _i8 < needDelete.length; _i8++) {
                    if (Math.ceil(rate / _constants.BITFINEX_MIN) === Math.ceil(needDelete[_i8].rate / _constants.BITFINEX_MIN) && amount === needDelete[_i8].amount) {
                        return _i8;
                    }
                }
                return -1;
            };
            needNew.forEach(function (v) {
                var notDelete = checkDelete(v.rate, v.amount);
                if (notDelete !== -1) {
                    for (var _i9 = 0; _i9 < offer[id][current.type].length; _i9++) {
                        if (needDelete[notDelete].id === offer[id][current.type][_i9].id) {
                            offer[id][current.type][_i9].time = Math.round(new Date().getTime() / 1000);
                            offer[id][current.type][_i9].risk = v.risk;
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
                var _ret5 = function () {
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
                                for (var _i10 = 0; _i10 < offer[id][current.type].length; _i10++) {
                                    if (fo.id === offer[id][current.type][_i10].id) {
                                        offer[id][current.type][_i10].risk = finalNew[index].risk;
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

                if ((typeof _ret5 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret5)) === "object") return _ret5.v;
            }
        };
        return cancelOffer(0).then(function () {
            return submitOffer(0);
        });
        //return Promise.resolve();
    };

    var singleTrade = function singleTrade(current) {
        console.log('singleTrade');
        if (current.isTrade && current.pair) {} else {
            return _promise2.default.resolve();
        }
        //return Promise.resolve();
        if (current.amount > 0 && current.rate_ratio <= 1 && current.rate_ratio > 0) {
            if (extremRate[id][current.type].is_low && Math.round(new Date().getTime() / 1000) - extremRate[id][current.type].is_low <= _constants.EXTREM_DURATION && extremRate[id][current.type].is_high < extremRate[id][current.type].is_low) {
                console.log('is low');
                current.amount = current.amount + current.amount * current.rate_ratio;
            } else if (extremRate[id][current.type].is_high && Math.round(new Date().getTime() / 1000) - extremRate[id][current.type].is_high <= _constants.EXTREM_DURATION && extremRate[id][current.type].is_high > extremRate[id][current.type].is_low) {
                console.log('is high');
                current.amount = current.amount - current.amount * current.rate_ratio;
            }
        }
        var getAM = function getAM() {
            console.log(current);
            var needTrans = current.used > 0 ? current.amount - current.used : current.amount;
            //let needTrans = needAmount;
            //check need amount
            /*if (needTrans > 0) {
                if (margin[id][current.type]) {
                    needTrans = needTrans - margin[id][current.type].avail;
                }
            }*/
            var availableMargin = 0;
            if (needTrans > 1 && current.clear !== true) {
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
                                    return _promise2.default.resolve(availableMargin);
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
            } else if (needTrans < -1 || current.clear === true) {
                if (margin[id] && margin[id][current.type] && margin[id][current.type].avail > 0) {
                    availableMargin = -margin[id][current.type].avail;
                }
                if (availableMargin <= needTrans && current.clear !== true) {
                    availableMargin = needTrans;
                } else {
                    if (order[id] && order[id][current.type]) {
                        var _ret7 = function () {
                            var real_id = order[id][current.type].filter(function (v) {
                                return v.amount > 0;
                            });
                            var real_delete = function real_delete(index) {
                                if (index >= real_id.length || availableMargin <= needTrans && current.clear !== true) {
                                    return _promise2.default.resolve(availableMargin);
                                }
                                return userRest.cancelOrder(real_id[index].id).then(function () {
                                    availableMargin = availableMargin - real_id[index].amount * real_id[index].price;
                                    if (availableMargin <= needTrans && current.clear !== true) {
                                        availableMargin = needTrans;
                                    }
                                    return new _promise2.default(function (resolve, reject) {
                                        return setTimeout(function () {
                                            return resolve();
                                        }, 3000);
                                    }).then(function () {
                                        return real_delete(index + 1);
                                    });
                                });
                            };
                            return {
                                v: real_delete(0)
                            };
                        }();

                        if ((typeof _ret7 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret7)) === "object") return _ret7.v;
                    }
                }
            }
            return _promise2.default.resolve(availableMargin);
        };
        return getAM().then(function (availableMargin) {
            console.log(availableMargin);
            console.log(available[id]);
            console.log(margin[id]);
            //transform wallet
            if (availableMargin < 1 && availableMargin > -1) {
                return _promise2.default.resolve();
            } else if (availableMargin >= 1) {
                return userRest.transfer({
                    from: 'funding',
                    to: 'margin',
                    amount: availableMargin.toString(),
                    currency: current.type.substr(1)
                }).then(function () {
                    return new _promise2.default(function (resolve, reject) {
                        return setTimeout(function () {
                            return resolve();
                        }, 3000);
                    });
                }).then(function () {
                    current.used = current.used > 0 ? current.used + availableMargin : availableMargin;
                    return (0, _mongoTool2.default)('update', _constants.USERDB, { "username": id, "bitfinex.type": current.type }, { $set: { "bitfinex.$.used": current.used } });
                });
            } else {
                return userRest.transfer({
                    from: 'margin',
                    to: 'funding',
                    amount: (-availableMargin).toString(),
                    currency: current.type.substr(1)
                }).then(function () {
                    return new _promise2.default(function (resolve, reject) {
                        return setTimeout(function () {
                            return resolve();
                        }, 3000);
                    });
                }).then(function () {
                    current.used = current.used > 0 && current.used + availableMargin > 1 ? current.used + availableMargin : 0;
                    if (margin[id] && margin[id][current.type] && (margin[id][current.type].total < 1 || !margin[id][current.type].total)) {
                        current.used = 0;
                    }
                    return (0, _mongoTool2.default)('update', _constants.USERDB, { "username": id, "bitfinex.type": current.type }, { $set: { "bitfinex.$.used": current.used } });
                });
            }
        }).then(function () {
            order_count++;
            if (order_count % _constants.ORDER_INTERVAL !== 3) {
                return _promise2.default.resolve();
            }
            return (0, _mongoTool2.default)('find', _constants.TOTALDB, { owner: uid, sType: 1, type: current.type }).then(function (items) {
                var reucr_status = function reucr_status(index) {
                    if (index >= items.length) {
                        return _promise2.default.resolve();
                    } else {
                        var _ret8 = function () {
                            var item = items[index];
                            console.log(item);
                            var cancelOrder = function cancelOrder(rest) {
                                if (order[id] && order[id][current.type]) {
                                    var _ret9 = function () {
                                        var real_id = order[id][current.type].filter(function (v) {
                                            return v.symbol === item.index;
                                        });
                                        var real_delete = function real_delete(index) {
                                            if (index >= real_id.length) {
                                                return rest ? rest() : _promise2.default.resolve();
                                            }
                                            return userRest.cancelOrder(real_id[index].id).then(function () {
                                                return new _promise2.default(function (resolve, reject) {
                                                    return setTimeout(function () {
                                                        return resolve();
                                                    }, 3000);
                                                }).then(function () {
                                                    return real_delete(index + 1);
                                                });
                                            });
                                        };
                                        return {
                                            v: real_delete(0)
                                        };
                                    }();

                                    if ((typeof _ret9 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret9)) === "object") return _ret9.v;
                                } else {
                                    return rest ? rest() : _promise2.default.resolve();
                                }
                            };
                            var startStatus = function startStatus() {
                                var newArr = item.web.map(function (v) {
                                    return v * item.newMid[item.newMid.length - 1] / item.mid;
                                });
                                var checkMid = item.newMid.length > 1 ? item.newMid[item.newMid.length - 2] : item.mid;
                                while (item.newMid.length > 0 && (item.newMid[item.newMid.length - 1] > checkMid && +priceData[item.index].lastPrice < checkMid || item.newMid[item.newMid.length - 1] <= checkMid && +priceData[item.index].lastPrice > checkMid)) {
                                    item.newMid.pop();
                                    if (item.newMid.length === 0 && Math.round(new Date().getTime() / 1000) - item.tmpPT.time < _constants.RANGE_BITFINEX_INTERVAL) {
                                        item.previous.price = item.tmpPT.price;
                                        item.previous.time = item.tmpPT.time;
                                        item.previous.type = item.tmpPT.type;
                                    } else {
                                        item.previous.time = 0;
                                    }
                                    newArr = item.web.map(function (v) {
                                        return v * item.newMid[item.newMid.length - 1] / item.mid;
                                    });
                                    checkMid = item.newMid.length > 1 ? item.newMid[item.newMid.length - 2] : item.mid;
                                }
                                var item_count = 0;
                                if (position[id] && position[id][_constants.FUSD_SYM]) {
                                    position[id][_constants.FUSD_SYM].forEach(function (v) {
                                        if (v.symbol === item.index) {
                                            item_count += v.amount;
                                        }
                                    });
                                }
                                var suggestion = (0, _stockTool.stockProcess)(+priceData[item.index].lastPrice, item.newMid.length > 0 ? newArr : item.web, item.times, item.previous, item.amount, item_count, item.wType, 1, _constants.BITFINEX_INTERVAL, _constants.BITFINEX_INTERVAL);
                                while (suggestion.resetWeb) {
                                    if (item.newMid.length === 0) {
                                        item.tmpPT = {
                                            price: item.previous.price,
                                            time: item.previous.time,
                                            type: item.previous.type
                                        };
                                    }
                                    item.previous.time = 0;
                                    item.newMid.push(suggestion.newMid);
                                    newArr = item.web.map(function (v) {
                                        return v * item.newMid[item.newMid.length - 1] / item.mid;
                                    });
                                    suggestion = (0, _stockTool.stockProcess)(+priceData[item.index].lastPrice, item.newMid.length > 0 ? newArr : item.web, item.times, item.previous, item.amount, item_count, item.wType, 1, _constants.BITFINEX_INTERVAL, _constants.BITFINEX_INTERVAL);
                                }
                                console.log(suggestion);
                                var count = 0;
                                var amount = item.amount;
                                if (suggestion.type === 7) {
                                    if (amount > item.orig * 7 / 8) {
                                        var tmpAmount = amount - item.orig * 3 / 4;
                                        while (tmpAmount - suggestion.buy * item.times > 0) {
                                            amount -= suggestion.buy * item.times;
                                            tmpAmount = amount - item.orig * 3 / 4;
                                            count++;
                                        }
                                        if (count * item.times > suggestion.bCount) {
                                            suggestion.bCount = count * item.times;
                                        }
                                    }
                                } else if (suggestion.type === 3) {
                                    if (amount > item.orig * 5 / 8) {
                                        var _tmpAmount = amount - item.orig / 2;
                                        while (_tmpAmount - suggestion.buy * item.times > 0) {
                                            amount -= suggestion.buy * item.times;
                                            _tmpAmount = amount - item.orig / 2;
                                            count++;
                                        }
                                        if (count * item.times > suggestion.bCount) {
                                            suggestion.bCount = count * item.times;
                                        }
                                    }
                                } else if (suggestion.type === 6) {
                                    if (amount > item.orig * 3 / 8) {
                                        var _tmpAmount2 = amount - item.orig / 4;
                                        while (_tmpAmount2 - suggestion.buy * item.times > 0) {
                                            amount -= suggestion.buy * item.times;
                                            _tmpAmount2 = amount - item.orig / 4;
                                            count++;
                                        }
                                        if (count * item.times > suggestion.bCount) {
                                            suggestion.bCount = count * item.times;
                                        }
                                    }
                                }
                                count = 0;
                                amount = item.amount;
                                if (suggestion.type === 9) {
                                    if (amount < item.orig / 8) {
                                        var _tmpAmount3 = item.orig / 4 - amount;
                                        while (_tmpAmount3 - suggestion.sell * item.times * (1 - _constants.BITFINEX_FEE) > 0) {
                                            amount += suggestion.sell * item.times * (1 - _constants.BITFINEX_FEE);
                                            _tmpAmount3 = item.orig / 4 - amount;
                                            count++;
                                        }
                                        if (count * item.times > suggestion.sCount) {
                                            suggestion.sCount = count * item.times;
                                        }
                                    }
                                } else if (suggestion.type === 5) {
                                    if (amount < item.orig * 3 / 8) {
                                        var _tmpAmount4 = item.orig / 2 - amount;
                                        while (_tmpAmount4 - suggestion.sell * item.times * (1 - _constants.BITFINEX_FEE) > 0) {
                                            amount += suggestion.sell * item.times * (1 - _constants.BITFINEX_FEE);
                                            _tmpAmount4 = item.orig / 2 - amount;
                                            count++;
                                        }
                                        if (count * item.times > suggestion.sCount) {
                                            suggestion.sCount = count * item.times;
                                        }
                                    }
                                } else if (suggestion.type === 8) {
                                    if (amount < item.orig * 5 / 8) {
                                        var _tmpAmount5 = item.orig * 3 / 4 - amount;
                                        while (_tmpAmount5 - suggestion.sell * item.times * (1 - _constants.BITFINEX_FEE) > 0) {
                                            amount += suggestion.sell * item.times * (1 - _constants.BITFINEX_FEE);
                                            _tmpAmount5 = item.orig * 3 / 4 - amount;
                                            count++;
                                        }
                                        if (count * item.times > suggestion.sCount) {
                                            suggestion.sCount = count * item.times;
                                        }
                                    }
                                }
                                console.log(suggestion);
                                var submitBuy = function submitBuy() {
                                    if (current.clear === true || current.clear[item.index] === true) {
                                        return reucr_status(index + 1);
                                    }
                                    if (item.amount < suggestion.bCount * suggestion.buy) {
                                        suggestion.bCount = Math.floor(item.amount / suggestion.buy * 10000) / 10000;
                                    }
                                    var order_avail = margin[id] && margin[id][current.type] && margin[id][current.type].avail && margin[id][current.type].avail - 1 > 0 ? _constants.SUPPORT_LEVERAGE[item.index] ? _constants.SUPPORT_LEVERAGE[item.index] * (margin[id][current.type].avail - 1) : margin[id][current.type].avail - 1 : 0;
                                    if (order_avail < suggestion.bCount * suggestion.buy) {
                                        suggestion.bCount = Math.floor(order_avail / suggestion.buy * 10000) / 10000;
                                    }
                                    if (suggestion.bCount > 0) {
                                        var _ret10 = function () {
                                            console.log('buy ' + item.index + ' ' + suggestion.bCount + ' ' + suggestion.buy);
                                            var or1 = new _bfxApiNodeModels.Order({
                                                cid: Date.now(),
                                                type: 'LIMIT',
                                                symbol: item.index,
                                                amount: suggestion.bCount,
                                                price: suggestion.buy
                                            }, userRest);
                                            return {
                                                v: or1.submit().then(function () {
                                                    return new _promise2.default(function (resolve, reject) {
                                                        return setTimeout(function () {
                                                            return resolve();
                                                        }, 3000);
                                                    });
                                                }).then(function () {
                                                    var isExist = false;
                                                    for (var _i11 = 0; _i11 < order[id][current.type].length; _i11++) {
                                                        if (or1.id === order[id][current.type][_i11].id) {
                                                            order[id][current.type][_i11].code = true;
                                                            isExist = true;
                                                            break;
                                                        }
                                                    }
                                                    if (!isExist) {
                                                        order[id][current.type].push({
                                                            id: or1.id,
                                                            time: Math.round(new Date().getTime() / 1000),
                                                            amount: or1.amount,
                                                            type: or1.type,
                                                            symbol: or1.symbol,
                                                            price: or1.price,
                                                            flags: or1.flags,
                                                            code: true
                                                        });
                                                    }
                                                    return reucr_status(index + 1);
                                                })
                                            };
                                        }();

                                        if ((typeof _ret10 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret10)) === "object") return _ret10.v;
                                    } else {
                                        return reucr_status(index + 1);
                                    }
                                };
                                return (0, _mongoTool2.default)('update', _constants.TOTALDB, { _id: item._id }, { $set: {
                                        newMid: item.newMid,
                                        tmpPT: item.tmpPT,
                                        previous: item.previous
                                    } }).then(function (result) {
                                    console.log(result);
                                    return cancelOrder();
                                }).then(function () {
                                    if (item.count < suggestion.sCount) {
                                        suggestion.sCount = item.count;
                                    }
                                    if (item_count < suggestion.sCount) {
                                        suggestion.sCount = item_count;
                                    }
                                    if (suggestion.sCount > 0) {
                                        var _ret11 = function () {
                                            console.log('sell ' + item.index + ' ' + suggestion.sCount + ' ' + suggestion.sell);
                                            var or = new _bfxApiNodeModels.Order({
                                                cid: Date.now(),
                                                type: 'LIMIT',
                                                symbol: item.index,
                                                amount: -suggestion.sCount,
                                                price: suggestion.sell,
                                                flags: 1024
                                            }, userRest);
                                            return {
                                                v: or.submit().then(function () {
                                                    return new _promise2.default(function (resolve, reject) {
                                                        return setTimeout(function () {
                                                            return resolve();
                                                        }, 3000);
                                                    });
                                                }).then(function () {
                                                    var isExist = false;
                                                    for (var _i12 = 0; _i12 < order[id][current.type].length; _i12++) {
                                                        if (or.id === order[id][current.type][_i12].id) {
                                                            order[id][current.type][_i12].code = true;
                                                            isExist = true;
                                                            break;
                                                        }
                                                    }
                                                    if (!isExist) {
                                                        order[id][current.type].push({
                                                            id: or.id,
                                                            time: Math.round(new Date().getTime() / 1000),
                                                            amount: or.amount,
                                                            type: or.type,
                                                            symbol: or.symbol,
                                                            price: or.price,
                                                            flags: or.flags,
                                                            code: true
                                                        });
                                                    }
                                                    return submitBuy();
                                                })
                                            };
                                        }();

                                        if ((typeof _ret11 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret11)) === "object") return _ret11.v;
                                    } else {
                                        return submitBuy();
                                    }
                                });
                            };
                            if (item.ing === 2) {
                                var sellAll = function sellAll() {
                                    var item_count = 0;
                                    if (position[id] && position[id][current.type]) {
                                        position[id][current.type].forEach(function (v) {
                                            if (v.symbol === item.index) {
                                                item_count += v.amount;
                                            }
                                        });
                                    }
                                    var delTotal = function delTotal() {
                                        return (0, _mongoTool2.default)('remove', _constants.TOTALDB, { _id: item._id, $isolated: 1 }).then(function () {
                                            return reucr_status(index + 1);
                                        });
                                    };
                                    if (item_count > 0) {
                                        var _ret12 = function () {
                                            var or = new _bfxApiNodeModels.Order({
                                                cid: Date.now(),
                                                type: 'MARKET',
                                                symbol: item.index,
                                                amount: -item_count,
                                                flags: 1024
                                            }, userRest);
                                            return {
                                                v: or.submit().then(function () {
                                                    return new _promise2.default(function (resolve, reject) {
                                                        return setTimeout(function () {
                                                            return resolve();
                                                        }, 3000);
                                                    });
                                                }).then(function () {
                                                    var isExist = false;
                                                    for (var _i13 = 0; _i13 < order[id][current.type].length; _i13++) {
                                                        if (or.id === order[id][current.type][_i13].id) {
                                                            order[id][current.type][_i13].code = true;
                                                            isExist = true;
                                                            break;
                                                        }
                                                    }
                                                    if (!isExist) {
                                                        order[id][current.type].push({
                                                            id: or.id,
                                                            time: Math.round(new Date().getTime() / 1000),
                                                            amount: or.amount,
                                                            type: or.type,
                                                            symbol: or.symbol,
                                                            price: or.price,
                                                            flags: or.flags,
                                                            code: true
                                                        });
                                                    }
                                                    return delTotal();
                                                })
                                            };
                                        }();

                                        if ((typeof _ret12 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret12)) === "object") return _ret12.v;
                                    } else {
                                        return delTotal();
                                    }
                                };
                                return {
                                    v: cancelOrder(sellAll)
                                };
                            } else if (item.ing === 1) {
                                return {
                                    v: startStatus()
                                };
                            } else {
                                current.enter_mid = current.enter_mid ? current.enter_mid : 0;
                                if ((+priceData[item.index].lastPrice - item.mid) / item.mid * 100 < current.enter_mid) {
                                    return {
                                        v: (0, _mongoTool2.default)('update', _constants.TOTALDB, { _id: item._id }, { $set: { ing: 1 } }).then(function (result) {
                                            return startStatus();
                                        })
                                    };
                                } else {
                                    console.log('enter_mid');
                                    console.log((+priceData[item.index].lastPrice - item.mid) / item.mid * 100);
                                    return {
                                        v: reucr_status(index + 1)
                                    };
                                }
                            }
                        }();

                        if ((typeof _ret8 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret8)) === "object") return _ret8.v;
                    }
                };
                return reucr_status(0);
            });
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
                    rate: e.amount / e.balance
                };
            });
            (0, _sendWs2.default)({
                type: 'bitfinex',
                data: -1,
                user: id
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
        var _iteratorNormalCompletion3 = true;
        var _didIteratorError3 = false;
        var _iteratorError3 = undefined;

        try {
            for (var _iterator3 = (0, _getIterator3.default)(_constants.SUPPORT_COIN), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
                var i = _step3.value;

                if (set.type === i) {
                    isSupport = true;
                    break;
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
        if (set.hasOwnProperty('diff')) {
            data['isDiff'] = set.diff;
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
            if (set.amount) {
                var amount = (0, _utility.isValidString)(set.amount, 'zeroint');
                if (amount === false) {
                    return (0, _utility.handleError)(new _utility.HoError('Trade Amount is not valid'));
                }
                data['amount'] = amount;
            }
            if (set.enter_mid) {
                var enter_mid = Number(set.enter_mid);
                if (isNaN(enter_mid)) {
                    return (0, _utility.handleError)(new _utility.HoError('Enter Mid is not valid'));
                }
                data['enter_mid'] = enter_mid;
            }
            if (set.rate_ratio) {
                var rate_ratio = Number(set.rate_ratio);
                if (isNaN(rate_ratio)) {
                    return (0, _utility.handleError)(new _utility.HoError('Rate Ratio is not valid'));
                }
                data['rate_ratio'] = rate_ratio;
            }
            if (set.hasOwnProperty('pair')) {
                if (set.pair) {
                    var _ret13 = function () {
                        var pair = (0, _utility.isValidString)(set.pair, 'name');
                        if (pair === false) {
                            return {
                                v: (0, _utility.handleError)(new _utility.HoError('Trade Pair is not valid'))
                            };
                        }
                        var pairArr = [];
                        pair.split(',').forEach(function (v) {
                            var p = v.trim();
                            var m = p.match(/^([a-zA-Z]+)\=(\d+)$/);
                            if (m && _constants.SUPPORT_PAIR[set.type].indexOf(m[1]) !== -1) {
                                pairArr.push({
                                    type: m[1],
                                    amount: Number(m[2])
                                });
                            }
                        });
                        data['pair'] = pairArr;
                    }();

                    if ((typeof _ret13 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret13)) === "object") return _ret13.v;
                } else {
                    data['pair'] = [];
                }
            }
            if (set.hasOwnProperty('clear')) {
                if (set.clear) {
                    var _ret14 = function () {
                        var allClear = false;
                        var clear = (0, _utility.isValidString)(set.clear, 'name');
                        if (clear === false) {
                            return {
                                v: (0, _utility.handleError)(new _utility.HoError('Trade Clear is not valid'))
                            };
                        }
                        var clearArr = {};
                        clear.split(',').forEach(function (v) {
                            var c = v.trim();
                            if (c === 'ALL') {
                                allClear = true;
                            } else if (_constants.SUPPORT_PAIR[set.type].indexOf(c) !== -1) {
                                clearArr[c] = true;
                            }
                        });
                        if (allClear) {
                            data['clear'] = true;
                        } else {
                            data['clear'] = clearArr;
                        }
                    }();

                    if ((typeof _ret14 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret14)) === "object") return _ret14.v;
                } else {
                    data['clear'] = {};
                }
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
                //處理市價出單
                return (0, _mongoTool2.default)('find', _constants.TOTALDB, { owner: id, sType: 1, type: set.type }).then(function (item) {
                    console.log(item);
                    if (data['pair']) {
                        var _ret15 = function () {
                            for (var _i14 = 0; _i14 < data['pair'].length; _i14++) {
                                var exist = false;
                                for (var j = 0; j < item.length; j++) {
                                    if (item[j].index === data['pair'][_i14].type) {
                                        exist = true;
                                        break;
                                    }
                                }
                                if (!exist) {
                                    item.push(data['pair'][_i14]);
                                }
                            }
                            var recur_update = function recur_update(index) {
                                if (index >= item.length) {
                                    return returnSupport(bitfinex);
                                } else {
                                    if (item[index]._id) {
                                        for (var _i15 = 0; _i15 < data['pair'].length; _i15++) {
                                            if (item[index].index === data['pair'][_i15].type) {
                                                return (0, _mongoTool2.default)('update', _constants.TOTALDB, { _id: item[index]._id }, { $set: {
                                                        times: Math.floor(item[index].times * data['pair'][_i15].amount / item[index].orig * 10000) / 10000,
                                                        amount: item[index].amount + data['pair'][_i15].amount - item[index].orig,
                                                        orig: data['pair'][_i15].amount
                                                    } }).then(function (item) {
                                                    console.log(item);
                                                    return recur_update(index + 1);
                                                });
                                            }
                                        }
                                        return (0, _mongoTool2.default)('update', _constants.TOTALDB, { _id: item[index]._id }, { $set: { ing: 2 } }).then(function (result) {
                                            console.log(result);
                                            return recur_update(index + 1);
                                        });
                                    } else {
                                        return (0, _mongoTool2.default)('find', _constants.TOTALDB, { index: item[index].type, sType: 1 }).then(function (webitem) {
                                            if (webitem.length < 1) {
                                                return (0, _utility.handleError)(new _utility.HoError('miss ' + item[index].type + ' web'));
                                            }
                                            var maxAmount = webitem[0].mid * (webitem[0].web.length - 1) / 3 * 2;
                                            return (0, _mongoTool2.default)('insert', _constants.TOTALDB, {
                                                owner: id,
                                                index: item[index].type,
                                                name: item[index].type.substr(1),
                                                type: set.type,
                                                sType: 1,
                                                web: webitem[0].web,
                                                wType: webitem[0].wType,
                                                mid: webitem[0].mid,
                                                times: Math.floor(item[index].amount / maxAmount * 10000) / 10000,
                                                amount: item[index].amount,
                                                orig: item[index].amount,
                                                previous: { buy: [], sell: [] },
                                                newMid: [],
                                                ing: 0,
                                                count: 0
                                            }).then(function (item) {
                                                console.log(item);
                                                return recur_update(index + 1);
                                            });
                                        });
                                    }
                                }
                            };
                            return {
                                v: recur_update(0)
                            };
                        }();

                        if ((typeof _ret15 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret15)) === "object") return _ret15.v;
                    } else {
                        return returnSupport(bitfinex);
                    }
                });
            });
        });
    },
    deleteBot: function deleteBot(id, type) {
        return (0, _mongoTool2.default)('find', _constants.USERDB, { _id: id }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                return (0, _utility.handleError)(new _utility.HoError('User does not exist!!!'));
            }
            if (items[0].bitfinex) {
                var _ret16 = function () {
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

                if ((typeof _ret16 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret16)) === "object") return _ret16.v;
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
                if (margin[id] && margin[id][v]) {
                    if (uid === (i + 1) * 100) {
                        return {
                            item: [{
                                name: '\u4EA4\u6613\u9592\u7F6E ' + v.substr(1) + ' $' + Math.round(margin[id][v].avail * 100) / 100,
                                id: (i + 1) * 100,
                                tags: [v.substr(1).toLowerCase(), 'wallet', '錢包', '交易'],
                                rate: '$' + Math.round(margin[id][v].total * 100) / 100,
                                count: margin[id][v].total,
                                utime: margin[id][v].time,
                                type: 0
                            }]
                        };
                    } else {
                        itemList.push({
                            name: '\u4EA4\u6613\u9592\u7F6E ' + v.substr(1) + ' $' + Math.round(margin[id][v].avail * 100) / 100,
                            id: (i + 1) * 100,
                            tags: [v.substr(1).toLowerCase(), 'wallet', '錢包', '交易'],
                            rate: '$' + Math.round(margin[id][v].total * 100) / 100,
                            count: margin[id][v].total,
                            utime: margin[id][v].time,
                            type: 0
                        });
                    }
                }
            }
        }
        if (type === 0 || type === 2) {
            var tempList = uid === 0 ? rateList : itemList;
            for (var _i16 = 0; _i16 < _constants.SUPPORT_COIN.length; _i16++) {
                var _v = _constants.SUPPORT_COIN[_i16];
                if (coin !== 'all' && coin !== _v) {
                    continue;
                }
                if (currentRate[_v]) {
                    var rate = Math.round(currentRate[_v].rate / 10) / 100000;
                    tempList.push({
                        name: _v.substr(1) + ' Rate',
                        id: _i16,
                        tags: [_v.substr(1).toLowerCase(), 'rate', '利率'],
                        rate: rate + '%',
                        count: rate,
                        utime: currentRate[_v].time,
                        type: 1
                    });
                }
            }
            var vid = _constants.SUPPORT_COIN.length;
            for (var _i17 in priceData) {
                tempList.push({
                    name: _i17.substr(1) + ' $' + Math.floor(priceData[_i17].lastPrice * 10000) / 10000,
                    id: vid++,
                    tags: [_i17.substr(1, 4), _i17.substr(-3), 'rate', '利率'],
                    rate: Math.floor(priceData[_i17].dailyChange * 100) / 100 + '%',
                    count: priceData[_i17].dilyChange,
                    utime: priceData[_i17].time,
                    type: 1,
                    str: priceData[_i17].str
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
                        var code = !o.code ? ' 手動' : '';
                        itemList.push({
                            name: '\u4EA4\u6613\u639B\u55AE ' + o.symbol.substr(1) + ' ' + Math.floor(o.amount * 10000) / 10000 + '\u679A ' + o.type + code,
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
                        var rate = Math.round(o.rate * 10000000) / 100000;
                        itemList.push({
                            name: '\u5229\u606F\u6536\u5165 ' + v.substr(1) + ' $' + o.amount,
                            id: o.id,
                            tags: [v.substr(1).toLowerCase(), 'payment', '利息收入'],
                            rate: rate + '%',
                            count: rate,
                            utime: o.time,
                            type: 4
                        });
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
        var _iteratorNormalCompletion4 = true;
        var _didIteratorError4 = false;
        var _iteratorError4 = undefined;

        try {
            for (var _iterator4 = (0, _getIterator3.default)(bitfinex), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
                var i = _step4.value;

                if (i.type === v) {
                    if (i.pair) {
                        (function () {
                            var p = '';
                            i.pair.forEach(function (v) {
                                if (p) {
                                    p = p + ',' + v.type + '=' + v.amount;
                                } else {
                                    p = v.type + '=' + v.amount;
                                }
                            });
                            i.pair = p;
                        })();
                    } else {
                        i.pair = '';
                    }
                    if (i.clear) {
                        if (i.clear === true) {
                            i.clear = 'ALL';
                        } else {
                            i.clear = (0, _keys2.default)(i.clear).toString();
                        }
                    } else {
                        i.clear = '';
                    }
                    if (_constants.SUPPORT_PAIR[v]) {
                        i.tradable = true;
                    }
                    return i;
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

        return { type: v };
    }) : _constants.SUPPORT_COIN.map(function (v) {
        return { type: v };
    });
};