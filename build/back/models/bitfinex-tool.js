'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.setWsOffer = exports.calRate = undefined;

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

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

var bfx = new _bitfinexApiNode2.default({ apiKey: _ver.BITFINEX_KEY, apiSecret: _ver.BITFINEX_SECRET });
var rest = bfx.rest(2, { transform: true });
var userWs = {};
var userOk = {};

var finalRate = {};
var maxRange = {};
var currentRate = {};

var btcDailyChange = 0;
var ethDailyChange = 0;

var available = {};
var offer = {};

//let credit = {};
//legder

//wallet history
//credit history
//5m candle x

var calRate = exports.calRate = function calRate(curArr) {
    return rest.ticker(_constants.TBTC_SYM).then(function (btcTicker) {
        return rest.ticker(_constants.TETH_SYM).then(function (ethTicker) {
            btcDailyChange = btcTicker.dailyChangePerc * 100;
            ethDailyChange = ethTicker.dailyChangePerc * 100;
            //console.log(btcDailyChange);
            //console.log(ethDailyChange);
            if (btcDailyChange < _constants.COIN_MAX || ethDailyChange < _constants.COIN_MAX) {
                (0, _sendWs2.default)('Bitfinex Daily Change: ' + btcDailyChange + ' ' + ethDailyChange, 0, 0, true);
            }
            var singleCal = function singleCal(curType) {
                return rest.ticker(curType).then(function (curTicker) {
                    return rest.orderBook(curType, 'P0', 100).then(function (orderBooks) {
                        currentRate[curType] = curTicker.lastPrice * _constants.BITFINEX_EXP;
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
                            var calOBRate = function calOBRate(hl, orderBooks) {
                                var vol = 0;
                                var i = 0;
                                var rate = [];
                                var j = 0;
                                orderBooks.forEach(function (v) {
                                    if (v[3] > 0) {
                                        vol = vol + v[3];
                                        if (i < hl.length && vol > hl[i].vol) {
                                            rate.push(v[0] * _constants.BITFINEX_EXP);
                                            i++;
                                        } else if (j === 0) {
                                            rate.push(v[0] * _constants.BITFINEX_EXP);
                                        } else if (j === 99) {
                                            rate.push(v[0] * _constants.BITFINEX_EXP);
                                        }
                                        j++;
                                    }
                                });
                                rate.reverse();
                                while (rate.length < 11) {
                                    rate.push(rate[rate.length - 1]);
                                }
                                return rate;
                            };
                            var calTenthRate = function calTenthRate(hl, weight) {
                                var rate = [hl[9].low];
                                var i = 0;
                                var j = 0;
                                weight.forEach(function (v, k) {
                                    if (weight[k]) {
                                        i = i + weight[k];
                                        while (i > hl[9].vol / 100 * _constants.DISTRIBUTION[j] && j < 9) {
                                            rate.push(k * 100);
                                            j++;
                                        }
                                    }
                                });
                                rate.push(hl[9].high);
                                return rate.reverse();
                            };
                            var OBRate = calOBRate(hl, orderBooks);
                            var tenthRate = calTenthRate(hl, weight);
                            maxRange[curType] = tenthRate[1] - tenthRate[9];
                            finalRate[curType] = tenthRate.map(function (v, k) {
                                return v > OBRate[k] ? v - 1 : OBRate[k] - 1;
                            });
                            console.log(curType + ' RATE: ' + finalRate[curType]);
                            //console.log(OBRate);
                            //console.log(tenthRate);
                            //console.log(currentRate[curType]);
                            //console.log(maxRange[curType]);
                        });
                    });
                });
            };
            var recurType = function recurType(index) {
                return index >= curArr.length ? _promise2.default.resolve() : _constants.SUPPORT_COIN.indexOf(curArr[index]) !== -1 ? singleCal(curArr[index]).then(function () {
                    return recurType(index + 1);
                }) : recurType(index + 1);
            };
            return recurType(0);
        });
    });
};

var setWsOffer = exports.setWsOffer = function setWsOffer(id) {
    var curArr = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];

    //檢查跟設定active
    curArr = curArr.filter(function (v) {
        return v.isActive && v.riskLimit > 0 && v.waitTime > 0 && v.amountLimit > 0 ? true : false;
    });
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
        userWs[id] = userBfx.ws(2, { transform: true });
        userWs[id].on('error', function (err) {
            (0, _sendWs2.default)(id + ' Bitfinex Ws Error: ' + (err.message || err.msg), 0, 0, true);
            (0, _utility.handleError)(err, 'Bitfinex Ws Error');
        });
        userWs[id].on('open', function () {
            return userWs[id].auth();
        });
        userWs[id].once('auth', function () {
            console.log(id + ' authenticated');
            userOk[id] = true;
        });
        userWs[id].onWalletUpdate({}, function (wallet) {
            _constants.SUPPORT_COIN.forEach(function (t) {
                if (wallet.type === 'funding' && wallet.currency === t.substr(1)) {
                    available[t] = wallet.balanceAvailable;
                    console.log('available');
                    console.log(available);
                }
            });
        });
        _constants.SUPPORT_COIN.forEach(function (t) {
            /*userRest.ledgers({ccy: curArr[i].type.substr(1), category: 28}).then(entries => {
                console.log(`${curArr[i].type} ledgers`);
                console.log(entries.length);
            }).catch(err => {
                sendWs(`Bitfinex ${curArr[i].type} Ws Error: ${err.message||err.msg}`, 0, 0, true);
                handleError(err, `Bitfinex ${curArr[i].type} Ledger Error`);
            });*/
            userWs[id].onFundingOfferSnapshot({ symbol: t }, function (fos) {
                console.log(t + ' offer');
                var risk = _constants.RISK_MAX;
                var temp = [];
                fos.forEach(function (v) {
                    if (v.symbol === t) {
                        temp.push({
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
                offer[t] = temp;
                console.log(offer[t].length);
            });
            userWs[id].onFundingOfferUpdate({ symbol: t }, function (fo) {
                console.log(t + ' offer update');
                for (var j = 0; j < offer[t].length; j++) {
                    if (offer[t][j].id === fo.id) {
                        offer[t][j].id = fo.id;
                        //offer[t][j].time = fo.mtsCreate;
                        offer[t][j].amount = fo.amount;
                        offer[t][j].rate = fo.rate;
                        offer[t][j].period = fo.period;
                        offer[t][j].status = fo.status;
                        break;
                    }
                }
                console.log(offer[t].length);
            });
            userWs[id].onFundingOfferNew({ symbol: t }, function (fo) {
                console.log(t + ' offer new');
                if (!offer[t]) {
                    offer[t] = [];
                }
                offer[t].push({
                    id: fo.id,
                    time: Math.round(fo.mtsCreate / 1000),
                    amount: fo.amount,
                    rate: fo.rate,
                    period: fo.period,
                    status: fo.status
                });
                console.log(offer[t].length);
            });
            userWs[id].onFundingOfferClose({ symbol: t }, function (fo) {
                console.log(t + ' offer close');
                for (var j = 0; j < offer[t].length; j++) {
                    if (offer[t][j].id === fo.id) {
                        offer[t].splice(j, 1);
                        break;
                    }
                }
                console.log(offer[t].length);
            });
            /*userWs[id].onFundingCreditSnapshot({ symbol: curArr[i].type }, fcs => {
                console.log(`${curArr[i].type} credit`);
                credit[curArr[i].type] = fcs.map(v => ({
                    id: v.id,
                    time: Math.round(v.mtsOpening / 1000),
                    amount: v.amount,
                    rate: v.rate,
                    period: v.period,
                    pair: v.positionPair,
                    status: v.status,
                }));
                console.log(credit[curArr[i].type].length);
            });
            userWs[id].onFundingCreditUpdate({ symbol: curArr[i].type }, fc => {
                console.log(`${curArr[i].type} credit update`);
                for (let j = 0; j < credit[curArr[i].type].length; j++) {
                    if (credit[curArr[i].type][j].id === fc.id) {
                        credit[curArr[i].type][j].id = fc.id;
                        credit[curArr[i].type][j].time = Math.round(fc.mtsOpening / 1000);
                        credit[curArr[i].type][j].amount = fc.amount;
                        credit[curArr[i].type][j].rate = fc.rate;
                        credit[curArr[i].type][j].period = fc.period;
                        credit[curArr[i].type][j].pair = fc.positionPair;
                        credit[curArr[i].type][j].status = fc.status;
                        break;
                    }
                }
                console.log(credit[curArr[i].type].length);
            });
            userWs[id].onFundingCreditNew({ symbol: curArr[i].type }, fc => {
                console.log(`${curArr[i].type} credit new`);
                credit[curArr[i].type].push({
                    id: fc.id,
                    time: Math.round(fc.mtsOpening / 1000),
                    amount: fc.amount,
                    rate: fc.rate,
                    period: fc.period,
                    pair: fc.positionPair,
                    status: fc.status,
                });
                console.log(credit[curArr[i].type].length);
            });
            userWs[id].onFundingCreditClose({ symbol: curArr[i].type }, fc => {
                console.log(`${curArr[i].type} credit close`);
                for (let j = 0; j < credit[curArr[i].type].length; j++) {
                    if (credit[curArr[i].type][j].id === fc.id) {
                        credit[curArr[i].type].splice(j, 1);
                        break;
                    }
                }
                console.log(credit[curArr[i].type].length);
            });*/
        });
        userWs[id].open();
    } else if (!userWs[id].isOpen()) {
        console.log('reconnect ws');
        userWs[id].reconnect();
    }

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
                        var _i = _step2.value;

                        if (risk === _i.risk) {
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
        var MR = current.miniRate > 0 ? current.miniRate / 36500 * _constants.BITFINEX_EXP : 0;
        // adjust offer & history
        var adjustOffer = function adjustOffer() {
            console.log(id + ' ' + current.type);
            if (offer[current.type]) {
                //console.log(offer[current.type]);
                //produce retain delete
                offer[current.type].forEach(function (v) {
                    if (v.rate - currentRate[current.type] > maxRange[current.type]) {
                        needDelete.push({ risk: v.risk, amount: v.amount, rate: v.rate * _constants.BITFINEX_EXP, id: v.id });
                    } else if (Math.round(new Date().getTime() / 1000) - v.time >= current.waitTime * 60) {
                        needDelete.push({ risk: v.risk, amount: v.amount, rate: v.rate * _constants.BITFINEX_EXP, id: v.id });
                    } else {
                        needRetain.push({ risk: v.risk, rate: v.rate * _constants.BITFINEX_EXP });
                    }
                });
            }
            needDelete.forEach(function (v) {
                var risk = v.risk > 1 ? v.risk - 1 : 0;
                while (checkRisk(risk, needRetain, needNew)) {
                    risk--;
                }
                needNew.push({
                    risk: risk,
                    amount: v.amount,
                    rate: current.miniRate > 0 && finalRate[current.type][10 - risk] < MR ? MR : finalRate[current.type][10 - risk]
                });
            });
            //console.log('needdelete');
            //console.log(needDelete);
        };
        //keep cash
        var calKeepCash = function calKeepCash(avail) {
            var kp = avail ? avail : 0;
            if (current.isKeep) {
                if (btcDailyChange < _constants.COIN_MAX || ethDailyChange < _constants.COIN_MAX) {
                    var dailyChange = btcDailyChange < ethDailyChange ? btcDailyChange : ethDailyChange;
                    kp = kp * (50 - (_constants.COIN_MAX - dailyChange) / (_constants.COIN_MAX - _constants.COIN_MAX_MAX) * 50) / 100;
                }
            }
            return current.keepAmount ? kp - current.keepAmount : kp;
        };
        //produce new
        var newOffer = function newOffer(risk) {
            var keep_available = calKeepCash(available[current.type]);
            //console.log('keep available');
            //console.log(keep_available);
            if (risk > _constants.RISK_MAX) {
                risk = _constants.RISK_MAX;
            }
            var newLength = _constants.OFFER_MAX - needRetain.length - needNew.length;
            for (var _i2 = 0; _i2 < newLength; _i2++) {
                while (checkRisk(risk, needRetain, needNew)) {
                    risk--;
                }
                if (finalRate[current.type].length <= 0 || keep_available < current.amountLimit * 0.2 || keep_available < 50) {
                    break;
                }
                var amount = current.amountLimit;
                if (keep_available < current.amountLimit * 1.2) {
                    amount = keep_available;
                }
                needNew.push({
                    risk: risk,
                    amount: amount,
                    rate: current.miniRate > 0 && finalRate[current.type][10 - risk] < MR ? MR : finalRate[current.type][10 - risk]
                });
                keep_available = keep_available - amount;
                risk = risk < 1 ? 0 : risk - 1;
            }
            //console.log('needNew');
            //console.log(needNew);
        };
        //merge new & delete
        var mergeOffer = function mergeOffer() {
            var checkDelete = function checkDelete(rate, amount) {
                for (var _i3 = 0; _i3 < needDelete.length; _i3++) {
                    if (Math.ceil(rate / _constants.BITFINEX_MIN) === Math.ceil(needDelete[_i3].rate / _constants.BITFINEX_MIN) && amount === needDelete[_i3].amount) {
                        return _i3;
                    }
                }
                return -1;
            };
            needNew.forEach(function (v) {
                var notDelete = checkDelete(v.rate, v.amount);
                if (notDelete !== -1) {
                    for (var _i4 = 0; _i4 < offer[current.type].length; _i4++) {
                        if (needDelete[notDelete].id === offer[current.type][_i4].id) {
                            offer[current.type][_i4].time = Math.round(new Date().getTime() / 1000);
                            offer[current.type][_i4].risk = v.risk;
                            break;
                        }
                    }
                    needDelete.splice(notDelete, 1);
                } else {
                    finalNew.push(v);
                }
            });
            //console.log('retain');
            //console.log(needRetain);
            console.log('delete');
            console.log(needDelete);
            console.log('final');
            console.log(finalNew);
        };
        adjustOffer();
        newOffer(current.riskLimit);
        mergeOffer();
        var DR = current.dynamic > 0 ? current.dynamic / 36500 * _constants.BITFINEX_EXP : 0;
        var cancelOffer = function cancelOffer(index) {
            return index >= needDelete.length ? _promise2.default.resolve() : userRest.cancelFundingOffer(needDelete[index].id).then(function () {
                return new _promise2.default(function (resolve, reject) {
                    return setTimeout(function () {
                        return resolve();
                    }, 1000);
                }).then(function () {
                    return cancelOffer(index + 1);
                });
            });
        };
        var submitOffer = function submitOffer(index) {
            if (index >= finalNew.length) {
                return _promise2.default.resolve();
            } else {
                var _ret = function () {
                    var fo = new _bfxApiNodeModels.FundingOffer({
                        symbol: current.type,
                        amount: finalNew[index].amount,
                        rate: finalNew[index].rate / _constants.BITFINEX_EXP,
                        period: current.dynamic > 0 && finalNew[index].rate > DR ? 30 : 2,
                        type: 'LIMIT'
                    }, userRest);
                    return {
                        v: fo.submit().then(function () {
                            return new _promise2.default(function (resolve, reject) {
                                return setTimeout(function () {
                                    return resolve();
                                }, 1000);
                            }).then(function () {
                                for (var _i5 = 0; _i5 < offer[current.type].length; _i5++) {
                                    if (fo.id === offer[current.type][_i5].id) {
                                        offer[current.type][_i5].risk = finalNew[index].risk;
                                        console.log('Offer ' + offer[current.type][_i5].id + ' ' + offer[current.type][_i5].risk);
                                        break;
                                    }
                                }
                                return submitOffer(index + 1);
                            });
                        })
                    };
                }();

                if ((typeof _ret === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret)) === "object") return _ret.v;
            }
        };
        return cancelOffer(0).then(function () {
            return submitOffer(0);
        });
    };

    var recurLoan = function recurLoan(index) {
        return index >= curArr.length ? _promise2.default.resolve() : curArr[index] && _constants.SUPPORT_COIN.indexOf(curArr[index].type) !== -1 ? singleLoan(curArr[index]).then(function () {
            return recurLoan(index + 1);
        }) : recurLoan(index + 1);
    };
    return recurLoan(0);
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
            data['amountLimit'] = amountLimit > 50 ? amountLimit : 50;
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
                return (0, _utility.handleError)(new _utility.HoError('API secret is not valid'));
            }
            data['keepAmount'] = keepAmount;
        }
        if (set.hasOwnProperty('keep')) {
            data['isKeep'] = set.keep;
        }
        if (set.hasOwnProperty('active')) {
            data['isActive'] = set.active;
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
                var _ret2 = function () {
                    var bitfinex = items[0].bitfinex.filter(function (v) {
                        return v.type === type ? false : true;
                    });
                    console.log(bitfinex);
                    return {
                        v: (0, _mongoTool2.default)('update', _constants.USERDB, { _id: id }, { $set: { bitfinex: bitfinex } }).then(function (user) {
                            console.log(user);
                            return returnSupport(bitfinex);
                        })
                    };
                }();

                if ((typeof _ret2 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret2)) === "object") return _ret2.v;
            } else {
                return returnSupport();
            }
        });
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