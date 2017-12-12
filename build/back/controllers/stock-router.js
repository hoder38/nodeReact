'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _slicedToArray2 = require('babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _toConsumableArray2 = require('babel-runtime/helpers/toConsumableArray');

var _toConsumableArray3 = _interopRequireDefault(_toConsumableArray2);

var _set = require('babel-runtime/core-js/set');

var _set2 = _interopRequireDefault(_set);

var _constants = require('../constants');

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _tagTool = require('../models/tag-tool');

var _tagTool2 = _interopRequireDefault(_tagTool);

var _stockTool = require('../models/stock-tool.js');

var _stockTool2 = _interopRequireDefault(_stockTool);

var _utility = require('../util/utility');

var _sendWs = require('../util/sendWs');

var _sendWs2 = _interopRequireDefault(_sendWs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var router = _express2.default.Router();
var StockTagTool = (0, _tagTool2.default)(_constants.STOCKDB);
var stockFiltering = false;
var stockIntervaling = false;

router.get('/get/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function (req, res, next) {
    console.log('stock');
    StockTagTool.tagQuery(Number(req.params.page), req.params.name, req.params.exactly === 'true' ? true : false, Number(req.params.index), req.params.sortName, req.params.sortType, req.user, req.session).then(function (result) {
        return res.json({
            itemList: (0, _utility.getStockItem)(req.user, result.items),
            parentList: result.parentList,
            latest: result.latest,
            bookmarkID: result.bookmark
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/getSingle/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function (req, res, next) {
    console.log('stock get single');
    var page = Number(req.params.page);
    if (page === 0 && req.params.name) {
        StockTagTool.searchTags(req.session).resetArray();
    }
    StockTagTool.tagQuery(page, req.params.name, req.params.exactly === 'true' ? true : false, Number(req.params.index), req.params.sortName, req.params.sortType, req.user, req.session).then(function (result) {
        return res.json({
            itemList: (0, _utility.getStockItem)(req.user, result.items),
            parentList: result.parentList,
            latest: result.latest,
            bookmarkID: result.bookmark
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/reset/:sortName(name|mtime|count)/:sortType(desc|asc)', function (req, res, next) {
    console.log('stock reset');
    StockTagTool.resetQuery(req.params.sortName, req.params.sortType, req.user, req.session).then(function (result) {
        return res.json({
            itemList: (0, _utility.getStockItem)(req.user, result.items),
            parentList: result.parentList
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.post('/getOptionTag', function (req, res, next) {
    console.log('stock option tag');
    var optionList = new _set2.default(['important']);
    req.body.tags.length > 0 ? StockTagTool.getRelativeTag(req.body.tags, req.user, [].concat((0, _toConsumableArray3.default)(optionList))).then(function (relative) {
        var reli = relative.length < 5 ? relative.length : 5;
        for (var i = 0; i < reli; i++) {
            optionList.add(relative[i]);
        }
        res.json({ relative: [].concat((0, _toConsumableArray3.default)(optionList)) });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    }) : res.json({ relative: [].concat((0, _toConsumableArray3.default)(optionList)) });
});

router.get('/single/:uid', function (req, res, next) {
    console.log('stock single');
    StockTagTool.singleQuery(req.params.uid, req.user, req.session).then(function (result) {
        return result.empty ? res.json(result) : res.json({ item: (0, _utility.getStockItem)(req.user, [result.item]) });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.put('/addTag/:tag', function (req, res, next) {
    console.log('stock addTag');
    var recur = function recur(index) {
        return index >= req.body.uids.length ? _promise2.default.resolve(res.json({ apiOK: true })) : StockTagTool.addTag(req.body.uids[index], req.params.tag, req.user, false).then(function (result) {
            if (result.id) {
                (0, _sendWs2.default)({
                    type: 'stock',
                    data: result.id
                });
            }
            return new _promise2.default(function (resolve) {
                return setTimeout(function () {
                    return resolve(recur(index + 1));
                }, 500);
            });
        });
    };
    recur(0).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.put('/delTag/:tag', function (req, res, next) {
    console.log('stock delTag');
    var recur = function recur(index) {
        return index >= req.body.uids.length ? _promise2.default.resolve(res.json({ apiOK: true })) : StockTagTool.delTag(req.body.uids[index], req.params.tag, req.user, false).then(function (result) {
            if (result.id) {
                (0, _sendWs2.default)({
                    type: 'stock',
                    data: result.id
                });
            }
            return new _promise2.default(function (resolve) {
                return setTimeout(function () {
                    return resolve(recur(index + 1));
                }, 500);
            });
        });
    };
    recur(0).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/querySimple/:uid', function (req, res, next) {
    console.log('stock query simple');
    var id = (0, _utility.isValidString)(req.params.uid, 'uid');
    if (!id) {
        (0, _utility.handleError)(new _utility.HoError('uid is not vaild'), next);
    }
    _stockTool2.default.getSingleStock(id, req.session).then(function (result) {
        return res.json(result);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/getPER/:uid', function (req, res, next) {
    console.log('stock get per');
    var id = (0, _utility.isValidString)(req.params.uid, 'uid');
    if (!id) {
        (0, _utility.handleError)(new _utility.HoError('uid is not vaild'), next);
    }
    _stockTool2.default.getStockPER(id).then(function (_ref) {
        var _ref2 = (0, _slicedToArray3.default)(_ref, 3),
            result = _ref2[0],
            index = _ref2[1],
            start = _ref2[2];

        return _stockTool2.default.getStockYield(id).then(function (result_1) {
            StockTagTool.setLatest(id, req.session).catch(function (err) {
                return (0, _utility.handleError)(err, 'Set latest');
            });
            res.json({ per: index + ': ' + result + ' ' + result_1 + ' ' + start });
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/getPredictPER/:uid', function (req, res, next) {
    console.log('stock get predict');
    var id = (0, _utility.isValidString)(req.params.uid, 'uid');
    if (!id) {
        (0, _utility.handleError)(new _utility.HoError('uid is not vaild'), next);
    }
    _stockTool2.default.getPredictPER(id, req.session).then(function (_ref3) {
        var _ref4 = (0, _slicedToArray3.default)(_ref3, 2),
            result = _ref4[0],
            index = _ref4[1];

        return res.json({ per: index + ': ' + result });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/getPoint/:uid/:price?', function (req, res, next) {
    console.log('stock get point');
    var id = (0, _utility.isValidString)(req.params.uid, 'uid', 'uid is not vaild');
    if (!id) {
        (0, _utility.handleError)(new _utility.HoError('uid is not vaild'), next);
    }
    _stockTool2.default.getStockPoint(id, req.params.price ? !req.params.price.match(/\d+(\.\d+)?/) ? (0, _utility.handleError)(new _utility.HoError('price is not vaild'), next) : Number(req.params.price) : 0, req.session).then(function (point) {
        return res.json({ point: point });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/getInterval/:uid', function (req, res, next) {
    console.log('stock get interval');
    var id = (0, _utility.isValidString)(req.params.uid, 'uid');
    if (!id) {
        return (0, _utility.handleReject)(new _utility.HoError('uid is not vaild'), next);
    }
    if (stockIntervaling) {
        //handleError(new HoError('there is another inverval running'), next);
        return (0, _utility.handleReject)(new _utility.HoError('there is another inverval running'), function () {
            return (0, _utility.handleReject)(new _utility.HoError('test'), function () {
                return (0, _utility.handleReject)(new _utility.HoError('test123'), next);
            });
        });
    }
    console.log(123);
    stockIntervaling = true;
    _stockTool2.default.getInterval(id, req.session).then(function (_ref5) {
        var _ref6 = (0, _slicedToArray3.default)(_ref5, 2),
            result = _ref6[0],
            index = _ref6[1];

        console.log(456);
        stockIntervaling = false;
        res.json({ interval: index + ': ' + result });
    }).catch(function (err) {
        console.log(789);
        stockIntervaling = false;
        return (0, _utility.handleReject)(err, next);
    });
});

router.put('/filter/:tag/:sortName(name|mtime|count)/:sortType(desc|asc)', function (req, res, next) {
    console.log('stock filter');
    var name = (0, _utility.isValidString)(req.params.tag, 'name');
    if (!name) {
        (0, _utility.handleError)(new _utility.HoError('name is not vaild'), next);
    }
    var per = false;
    if (req.body.per) {
        per = req.body.per.match(/^([<>])(\d+)$/);
        if (!per) {
            (0, _utility.handleError)(new _utility.HoError('per is not vaild'), next);
        }
        per[2] = Number(per[2]);
    }
    var yieldNumber = false;
    if (req.body.yield) {
        yieldNumber = req.body.yield.match(/^([<>])(\d+)$/);
        if (!yieldNumber) {
            (0, _utility.handleError)(new _utility.HoError('yield is not vaild'), next);
        }
        yieldNumber[2] = Number(yieldNumber[2]);
    }
    var pp = false;
    if (req.body.p) {
        pp = req.body.p.match(/^([<>])(\d+)$/);
        if (!pp) {
            (0, _utility.handleError)(new _utility.HoError('p is not vaild'), next);
        }
        pp[2] = Number(pp[2]);
    }
    var ss = false;
    if (req.body.s) {
        ss = req.body.s.match(/^([<>])(\-?\d+)$/);
        if (!ss) {
            (0, _utility.handleError)(new _utility.HoError('s is not vaild'), next);
        }
        ss[2] = Number(ss[2]);
    }
    var mm = false;
    if (req.body.m) {
        mm = req.body.m.match(/^([<>])(\d+\.?\d*)$/);
        if (!mm) {
            (0, _utility.handleError)(new _utility.HoError('m is not vaild'), next);
        }
        mm[2] = Number(mm[2]);
    }
    if (stockFiltering) {
        (0, _utility.handleError)(new _utility.HoError('there is another filter running'), next);
    }
    stockFiltering = true;
    var first = true;
    var last = false;
    var queried = 0;
    var filterNum = 0;
    var recur_query = function recur_query() {
        return StockTagTool.tagQuery(queried, '', false, 0, req.params.sortName, req.params.sortType, req.user, req.session, _constants.STOCK_FILTER_LIMIT).then(function (result) {
            console.log(queried);
            if (first) {
                res.json({ apiOK: true });
            }
            if (result.items.length < _constants.STOCK_FILTER_LIMIT) {
                last = true;
            }
            queried += result.items.length;
            first = false;
            if (result.items.length < 1) {
                stockFiltering = false;
                return (0, _sendWs2.default)({
                    type: req.user.username,
                    data: 'Filter ' + name + ': ' + filterNum
                }, 0);
            }
            var first_stage = [];
            result.items.forEach(function (i) {
                var is_name = i.tags.includes(name) ? true : false;
                var pok = pp ? pp[1] === '>' && i.profitIndex > pp[2] || pp[1] === '<' && i.profitIndex < pp[2] ? true : false : true;
                var sok = ss ? ss[1] === '>' && i.safetyIndex > ss[2] || ss[1] === '<' && i.safetyIndex < ss[2] ? true : false : true;
                var mok = mm ? mm[1] === '>' && i.managementIndex > mm[2] || mm[1] === '<' && i.managementIndex < mm[2] ? true : false : true;
                if (is_name) {
                    filterNum++;
                } else if (!is_name && pok && sok && mok) {
                    first_stage.push(i);
                }
            });
            if (first_stage.length < 1) {
                stockFiltering = false;
                return (0, _sendWs2.default)({ type: req.user.username,
                    data: 'Filter ' + name + ': ' + filterNum
                }, 0);
            }
            var recur_per = function recur_per(index) {
                var nextFilter = function nextFilter() {
                    index++;
                    if (index < first_stage.length) {
                        return recur_per(index);
                    }
                    if (!last) {
                        return recur_query();
                    }
                    stockFiltering = false;
                    return (0, _sendWs2.default)({
                        type: req.user.username,
                        data: 'Filter ' + name + ': ' + filterNum
                    }, 0);
                };
                var addFilter = function addFilter() {
                    return StockTagTool.addTag(first_stage[index]._id, name, req.user).then(function (add_result) {
                        filterNum++;
                        (0, _sendWs2.default)({
                            type: 'stock',
                            data: add_result.id
                        }, 0, 1);
                        if (filterNum >= _constants.STOCK_FILTER_LIMIT) {
                            stockFiltering = false;
                            return (0, _sendWs2.default)({
                                type: req.user.username,
                                data: 'Filter ' + name + ': ' + filterNum
                            }, 0);
                        }
                        return nextFilter();
                    });
                };
                if (per) {
                    return _stockTool2.default.getStockPER(first_stage[index]._id).then(function (_ref7) {
                        var _ref8 = (0, _slicedToArray3.default)(_ref7, 1),
                            stockPer = _ref8[0];

                        if (per && stockPer > 0 && (per[1] === '>' && stockPer > per[2] * 2 / 3 || per[1] === '<' && stockPer < per[2] * 4 / 3)) {
                            console.log(stockPer);
                            console.log(first_stage[index].name);
                            if (yieldNumber) {
                                return _stockTool2.default.getStockYield(first_stage[index]._id).then(function (stockYield) {
                                    if (yieldNumber && stockYield > 0 && (yieldNumber[1] === '>' && stockYield > yieldNumber[2] * 2 / 3 || yieldNumber[1] === '<' && stockYield < yieldNumber[2] * 4 / 3)) {
                                        console.log(stockYield);
                                        return addFilter();
                                    } else {
                                        return nextFilter();
                                    }
                                });
                            } else {
                                return addFilter();
                            }
                        } else {
                            return nextFilter();
                        }
                    });
                } else if (yieldNumber) {
                    return _stockTool2.default.getStockYield(first_stage[index]._id).then(function (stockYield) {
                        if (yieldNumber && stockYield > 0 && (yieldNumber[1] === '>' && stockYield > yieldNumber[2] * 2 / 3 || yieldNumber[1] === '<' && stockYield < yieldNumber[2] * 4 / 3)) {
                            console.log(stockYield);
                            console.log(first_stage[index].name);
                            return addFilter();
                        } else {
                            return nextFilter();
                        }
                    });
                } else {
                    return addFilter();
                }
            };
            return recur_per(0);
        });
    };
    return recur_query().catch(function (err) {
        stockFiltering = false;
        (0, _sendWs2.default)({
            type: req.user.username,
            data: 'Filter fail: ' + err.message
        }, 0);
        (0, _utility.handleError)(err, next);
    });
});

router.use(function (req, res, next) {
    (0, _utility.checkLogin)(req, res, next);
});

exports.default = router;