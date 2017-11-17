'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _slicedToArray2 = require('babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _defineProperty2 = require('babel-runtime/helpers/defineProperty');

var _defineProperty3 = _interopRequireDefault(_defineProperty2);

var _stringify = require('babel-runtime/core-js/json/stringify');

var _stringify2 = _interopRequireDefault(_stringify);

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _set = require('babel-runtime/core-js/set');

var _set2 = _interopRequireDefault(_set);

var _constants = require('../constants');

var _tagTool = require('../models/tag-tool');

var _tagTool2 = _interopRequireDefault(_tagTool);

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

var _redisTool = require('../models/redis-tool');

var _redisTool2 = _interopRequireDefault(_redisTool);

var _utility = require('../util/utility');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var FitnessTagTool = (0, _tagTool2.default)(_constants.FITNESSDB);

exports.default = {
    newRow: function newRow(data) {
        if (!data['price'] || !data['desc'] || !data['name']) {
            return (0, _utility.handleReject)(new _utility.HoError('parameter lost!!!'));
        }
        var name = (0, _utility.isValidString)(data['name'], 'name');
        if (!name) {
            return (0, _utility.handleReject)(new _utility.HoError('name not vaild!!!'));
        }
        var price = (0, _utility.isValidString)(data['price'], 'int');
        if (!price) {
            return (0, _utility.handleReject)(new _utility.HoError('price not vaild!!!'));
        }
        var desc = (0, _utility.isValidString)(data['desc'], 'desc');
        if (!desc) {
            return (0, _utility.handleReject)(new _utility.HoError('description not vaild!!!'));
        }
        var setTag = new _set2.default();
        setTag.add((0, _tagTool.normalize)(name)).add('sport').add('運動');
        //setTag.add(normalize(name)).add('game').add('遊戲');
        var setArr = [];
        setTag.forEach(function (s) {
            if (!(0, _tagTool.isDefaultTag)(s)) {
                setArr.push(s);
            }
        });
        return (0, _mongoTool2.default)('insert', _constants.FITNESSDB, {
            _id: (0, _mongoTool.objectID)(),
            name: name,
            price: price,
            desc: desc,
            utime: Math.round(new Date().getTime() / 1000),
            type: 1,
            use: {},
            tags: setArr
        }).then(function (item) {
            console.log(item);
            console.log('save end');
            return { id: item[0]._id };
        });
    },
    editRow: function editRow(uid, data, session) {
        var name = '';
        if (data['name']) {
            name = (0, _utility.isValidString)(data['name'], 'name');
            if (!name) {
                return (0, _utility.handleReject)(new _utility.HoError('description not vaild!!!'));
            }
        }
        var price = '';
        if (data['price']) {
            price = (0, _utility.isValidString)(data['price'], 'int');
            if (!price) {
                return (0, _utility.handleReject)(new _utility.HoError('price not vaild!!!'));
            }
        }
        var desc = '';
        if (data['desc']) {
            desc = (0, _utility.isValidString)(data['desc'], 'desc');
            if (!desc) {
                return (0, _utility.handleReject)(new _utility.HoError('description not vaild!!!'));
            }
        }
        var id = (0, _utility.isValidString)(uid, 'uid');
        if (!id) {
            return (0, _utility.handleReject)(new _utility.HoError('uid is not vaild!!!'));
        }
        return (0, _mongoTool2.default)('find', _constants.FITNESSDB, { _id: id }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                return (0, _utility.handleReject)(new _utility.HoError('fitness row does not exist!!!'));
            }
            var update_data = {};
            var setTag = new _set2.default(items[0].tags);
            if (name) {
                setTag.add((0, _tagTool.normalize)(name));
                update_data['name'] = name;
            }
            if (price) {
                update_data['price'] = price;
            }
            if (desc) {
                update_data['desc'] = desc;
            }
            var setArr = [];
            setTag.forEach(function (s) {
                if (!(0, _tagTool.isDefaultTag)(s)) {
                    setArr.push(s);
                }
            });
            update_data = (0, _assign2.default)(update_data, { tags: setArr });
            console.log(update_data);
            FitnessTagTool.setLatest(items[0]._id, session).catch(function (err) {
                return (0, _utility.handleError)(err, 'Set latest');
            });
            return (0, _mongoTool2.default)('update', _constants.FITNESSDB, { _id: items[0]._id }, { $set: update_data });
        });
    },
    delRow: function delRow(uid) {
        var id = (0, _utility.isValidString)(uid, 'uid');
        if (!id) {
            return (0, _utility.handleReject)(new _utility.HoError('uid is not vaild!!!'));
        }
        return (0, _mongoTool2.default)('find', _constants.FITNESSDB, { _id: id }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                return (0, _utility.handleReject)(new _utility.HoError('fitness row does not exist!!!'));
            }
            return (0, _mongoTool2.default)('remove', _constants.FITNESSDB, {
                _id: items[0]._id,
                $isolated: 1
            }).then(function (item) {
                return (0, _mongoTool2.default)('remove', _constants.FITNESSDB + 'Count', {
                    itemId: items[0]._id,
                    $isolated: 1
                });
            });
        });
    },
    getPoint: function getPoint(user) {
        return (0, _mongoTool2.default)('find', _constants.FITNESSDB + 'Count', {
            owner: user._id,
            itemId: (0, _mongoTool.objectID)(_constants.FITNESS_POINT)
        }).then(function (items) {
            return items.length < 1 ? 0 : items[0].count;
        });
    },
    exchange: function exchange(uid, user, _exchange, session) {
        var id = (0, _utility.isValidString)(uid, 'uid');
        if (!id) {
            return (0, _utility.handleReject)(new _utility.HoError('uid is not vaild!!!'));
        }
        var number = (0, _utility.isValidString)(_exchange, 'int');
        if (!number) {
            return (0, _utility.handleReject)(new _utility.HoError('exchange is not vaild!!!'));
        }
        var end = function end() {
            var id = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;
            var itemCount = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
            return (0, _mongoTool2.default)('find', _constants.FITNESSDB + 'Count', {
                owner: user._id,
                itemId: (0, _mongoTool.objectID)(_constants.FITNESS_POINT)
            }).then(function (items) {
                if (items.length < 1) {
                    return (0, _utility.handleReject)(new _utility.HoError('point row does not exist!!!'));
                }
                FitnessTagTool.setLatest(id, session).catch(function (err) {
                    return (0, _utility.handleError)(err, 'Set latest');
                });
                return id ? (0, _redisTool2.default)('hmget', 'chart: ' + user._id, [_constants.FITNESS_POINT, id.toString()]).then(function (item) {
                    var _Redis;

                    var date = new Date();
                    var dateStr = '' + date.getFullYear() + (0, _utility.completeZero)(date.getMonth() + 1, 2) + (0, _utility.completeZero)(date.getDate(), 2);
                    return (0, _redisTool2.default)('hmset', 'chart: ' + user._id, (_Redis = {}, (0, _defineProperty3.default)(_Redis, _constants.FITNESS_POINT, (0, _stringify2.default)((0, _assign2.default)(item[0] ? JSON.parse(item[0]) : {}, (0, _defineProperty3.default)({}, dateStr, items[0].count)))), (0, _defineProperty3.default)(_Redis, id.toString(), (0, _stringify2.default)((0, _assign2.default)(item[1] ? JSON.parse(item[1]) : {}, (0, _defineProperty3.default)({}, dateStr, itemCount)))), _Redis)).then(function () {
                        return items[0].count;
                    });
                }) : items[0].count;
            });
        };
        return (0, _mongoTool2.default)('find', _constants.FITNESSDB + 'Stat', { owner: user._id }).then(function (items2) {
            if (items2.length < 1) {
                return (0, _utility.handleReject)(new _utility.HoError('fitness stat row does not exist!!!'));
            }
            return (0, _mongoTool2.default)('find', _constants.FITNESSDB, { _id: id }).then(function (items) {
                if (items.length < 1) {
                    return (0, _utility.handleReject)(new _utility.HoError('fitness row does not exist!!!'));
                }
                switch (items[0].type) {
                    case 1:
                        return (0, _mongoTool2.default)('find', _constants.FITNESSDB + 'Count', {
                            owner: user._id,
                            itemId: id
                        }).then(function (items1) {
                            return (0, _mongoTool2.default)('update', _constants.FITNESSDB + 'Count', {
                                owner: user._id,
                                itemId: id
                            }, {
                                $inc: { count: number },
                                $set: { start: items2[0].start }
                            }, { upsert: true }).then(function (item) {
                                var addPoint = Math.floor((items1.length < 1 ? number : items1[0].count % items[0].price + number) / items[0].price);
                                var isAdd = function isAdd() {
                                    return addPoint ? (0, _mongoTool2.default)('update', _constants.FITNESSDB + 'Count', {
                                        owner: user._id,
                                        itemId: (0, _mongoTool.objectID)(_constants.FITNESS_POINT)
                                    }, {
                                        $inc: { count: addPoint },
                                        $set: { start: items2[0].start }
                                    }, { upsert: true }) : _promise2.default.resolve();
                                };
                                return isAdd().then(function () {
                                    return end(id, items1.length < 1 ? number : items1[0].count + number);
                                });
                            });
                        });
                    case 2:
                        return (0, _mongoTool2.default)('find', _constants.FITNESSDB + 'Count', {
                            owner: user._id,
                            itemId: (0, _mongoTool.objectID)(_constants.FITNESS_POINT)
                        }).then(function (items1) {
                            //以後改成多一個 remain point 原本的point不變
                            var max = Math.floor(items1[0].count / items[0].price);
                            var addCount = number < max ? number : max;
                            var isAdd = function isAdd() {
                                return addCount ? (0, _mongoTool2.default)('update', _constants.FITNESSDB + 'Count', {
                                    owner: user._id,
                                    itemId: id
                                }, {
                                    $inc: { count: addCount },
                                    $set: { start: items2[0].start }
                                }, { upsert: true }).then(function (item) {
                                    return (0, _mongoTool2.default)('update', _constants.FITNESSDB + 'Count', {
                                        owner: user._id,
                                        itemId: (0, _mongoTool.objectID)(_constants.FITNESS_POINT)
                                    }, {
                                        $inc: { count: -addCount * items[0].price },
                                        $set: { start: items2[0].start }
                                    }, { upsert: true });
                                }) : _promise2.default.resolve();
                            };
                            return isAdd().then(function () {
                                return end();
                            });
                        });
                        break;
                    default:
                        return (0, _utility.handleReject)(new _utility.HoError('fitness type unknown!!!'));
                }
            });
        });
    },
    getStat: function getStat(uid) {
        var index = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
        var typeId = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : _constants.FITNESS_POINT;

        var tId = (0, _utility.isValidString)(typeId, 'uid');
        if (!tId) {
            return (0, _utility.handleReject)(new _utility.HoError('uid is not vaild!!!'));
        }
        var cIndex = (0, _utility.isValidString)(index, 'perm');
        if (cIndex > _constants.CHART_LIMIT) {
            return (0, _utility.handleReject)(new _utility.HoError('index is not vaild!!!'));
        }
        var id = (0, _utility.isValidString)(uid, 'uid');
        if (!id) {
            return (0, _utility.handleReject)(new _utility.HoError('uid is not vaild!!!'));
        }
        var date = new Date();
        var getStart = function getStart() {
            return (0, _mongoTool2.default)('find', _constants.FITNESSDB + 'Stat', { owner: id }).then(function (items) {
                var get = function get() {
                    return items.length < 1 ? (0, _mongoTool2.default)('insert', _constants.FITNESSDB + 'Stat', {
                        owner: id,
                        start: Number('' + date.getFullYear() + (0, _utility.completeZero)(date.getMonth() + 1, 2) + (0, _utility.completeZero)(date.getDate(), 2)),
                        chart: []
                    }).then(function (item) {
                        return [item[0].start.toString(), item[0].chart];
                    }) : _promise2.default.resolve([items[0].start.toString(), items[0].chart]);
                };
                return get();
            });
        };
        var getChart = function getChart(tId, start, name) {
            return (0, _redisTool2.default)('hget', 'chart: ' + id, tId.toString()).then(function (item) {
                var date1 = date;
                var labels = [];
                var data = [];
                for (var i = 0; i < 365; i++) {
                    var day = '' + date1.getFullYear() + (0, _utility.completeZero)(date1.getMonth() + 1, 2) + (0, _utility.completeZero)(date1.getDate(), 2);
                    labels.push(day);
                    data.push(0);
                    if (day === start) {
                        break;
                    }
                    date1 = new Date(date1.setDate(date1.getDate() - 1));
                }
                labels.reverse();
                if (item) {
                    item = JSON.parse(item);
                    for (var _i in item) {
                        var _index = labels.indexOf(_i);
                        if (_index !== -1) {
                            data[_index] = item[_i];
                        }
                    }
                }
                var j = 0;
                return {
                    label: name,
                    labels: labels,
                    data: data.map(function (i) {
                        j = j > i ? j : i;
                        return j;
                    })
                };
            });
        };
        return tId.equals((0, _mongoTool.objectID)(_constants.FITNESS_POINT)) ? cIndex ? getStart().then(function (_ref) {
            var _ref2 = (0, _slicedToArray3.default)(_ref, 2),
                start = _ref2[0],
                chart = _ref2[1];

            chart[cIndex - 1] = null;
            return (0, _mongoTool2.default)('update', _constants.FITNESSDB + 'Stat', { owner: id }, { $set: { chart: chart } }).then(function (item) {
                return null;
            });
        }) : (0, _mongoTool2.default)('find', _constants.FITNESSDB, { type: 1 }).then(function (items) {
            return getStart().then(function (_ref3) {
                var _ref4 = (0, _slicedToArray3.default)(_ref3, 2),
                    start = _ref4[0],
                    chart = _ref4[1];

                var ret_chart = [];
                var recur_chart = function recur_chart(aIndex) {
                    if (aIndex >= chart.length) {
                        return {
                            start: start,
                            fitness: items.map(function (i) {
                                return {
                                    title: i.name,
                                    id: i._id
                                };
                            }),
                            chart: ret_chart
                        };
                    }
                    if (!chart[aIndex]) {
                        ret_chart.push(null);
                        return recur_chart(aIndex + 1);
                    }
                    return (0, _mongoTool2.default)('find', _constants.FITNESSDB, { _id: chart[aIndex] }).then(function (items1) {
                        if (items.length < 1) {
                            ret_chart.push(null);
                            return recur_chart(aIndex + 1);
                        }
                        return getChart(items1[0]._id, start, items1[0].name).then(function (result) {
                            ret_chart.push(result);
                            return recur_chart(aIndex + 1);
                        });
                    });
                };
                return getChart(tId, start, 'point').then(function (result) {
                    ret_chart.push(result);
                    return recur_chart(0);
                });
            });
        }) : (0, _mongoTool2.default)('find', _constants.FITNESSDB, { _id: tId }).then(function (items) {
            if (items.length < 1) {
                return (0, _utility.handleReject)(new _utility.HoError('fitness type unknown!!!'));
            }
            return getStart().then(function (_ref5) {
                var _ref6 = (0, _slicedToArray3.default)(_ref5, 2),
                    start = _ref6[0],
                    chart = _ref6[1];

                chart[cIndex - 1] = tId;
                return (0, _mongoTool2.default)('update', _constants.FITNESSDB + 'Stat', { owner: id }, { $set: { chart: chart } }).then(function (item) {
                    return getChart(tId, start, items[0].name).then(function (result) {
                        return result;
                    });
                });
            });
        });
    },
    resetDate: function resetDate(uid) {
        var id = (0, _utility.isValidString)(uid, 'uid');
        if (!id) {
            return (0, _utility.handleReject)(new _utility.HoError('uid is not vaild!!!'));
        }
        var date = new Date();
        return (0, _mongoTool2.default)('update', _constants.FITNESSDB + 'Stat', { owner: id }, { $set: {
                start: Number('' + date.getFullYear() + (0, _utility.completeZero)(date.getMonth() + 1, 2) + (0, _utility.completeZero)(date.getDate(), 2)),
                chart: []
            } }).then(function (item) {
            return (0, _mongoTool2.default)('remove', _constants.FITNESSDB + 'Count', {
                owner: id,
                $isolated: 1
            }).then(function (item1) {
                return (0, _redisTool2.default)('del', 'chart: ' + id);
            });
        });
    }
};