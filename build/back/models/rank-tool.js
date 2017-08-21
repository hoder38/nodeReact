'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _set = require('babel-runtime/core-js/set');

var _set2 = _interopRequireDefault(_set);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _constants = require('../constants');

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

var _tagTool = require('../models/tag-tool');

var _tagTool2 = _interopRequireDefault(_tagTool);

var _utility = require('../util/utility');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var RankTagTool = (0, _tagTool2.default)(_constants.RANKDB);

exports.default = {
    getChart: function getChart(uid, user, session) {
        return (0, _mongoTool2.default)('find', _constants.RANKDB, { _id: (0, _utility.isValidString)(uid, 'uid', 'uid is not vaild') }).then(function (items) {
            if (items.length < 1) {
                (0, _utility.handleError)(new _utility.HoError('rank cannot find!!!'));
            }
            var getName = function getName() {
                return items[0].type === _constants.FITNESSDB && items[0].itemId.equals((0, _mongoTool.objectID)(_constants.FITNESS_POINT)) ? _promise2.default.resolve('point') : (0, _mongoTool2.default)('find', items[0].type, { _id: items[0].itemId }).then(function (items1) {
                    return items1.length < 1 ? 'unknown' : items1[0].name;
                });
            };
            var findData = function findData() {
                return items[0].history ? _promise2.default.resolve(items[0].history) : (0, _mongoTool2.default)('find', items[0].type + 'Count', {
                    itemId: items[0].itemId,
                    start: { $gte: items[0].start }
                }, {
                    limit: _constants.RANK_LIMIT,
                    sort: [['count', 'desc']]
                }).then(function (items1) {
                    return items1.reverse();
                });
            };
            return getName().then(function (itemName) {
                return findData().then(function (itemData) {
                    if (itemData.length < 1) {
                        (0, _utility.handleError)(new _utility.HoError('no data!!!'));
                    }
                    var data = [];
                    var labels = [];
                    var owner = _constants.RANK_LIMIT;
                    var recur = function recur(index) {
                        if (index >= itemData.length) {
                            return _promise2.default.resolve();
                        }
                        if (user._id.equals(itemData[index].owner)) {
                            owner = index;
                            labels.push(user.username);
                            data.push(itemData[index].count);
                            return recur(index + 1);
                        } else {
                            return (0, _mongoTool2.default)('find', _constants.USERDB, { _id: itemData[index].owner }).then(function (items2) {
                                labels.push(items2.length < 1 ? 'unknown' : items2[0].username);
                                data.push(itemData[index].count);
                                return recur(index + 1);
                            });
                        }
                    };
                    var getUser = function getUser() {
                        return owner === _constants.RANK_LIMIT && !items[0].history ? (0, _mongoTool2.default)('find', items[0].type + 'Count', {
                            itemId: items[0].itemId,
                            owner: user._id
                        }).then(function (items1) {
                            if (items1.length < 1) {
                                (0, _utility.handleError)(new _utility.HoError('rank cannot find user!!!'));
                            }
                            labels.push(user.username);
                            data.push(items1[0].count);
                        }) : _promise2.default.resolve();
                    };
                    RankTagTool.setLatest(items[0]._id, session).catch(function (err) {
                        return (0, _utility.handleError)(err, 'Set latest');
                    });
                    return recur(0).then(function () {
                        return getUser().then(function () {
                            return {
                                labels: labels,
                                data: data,
                                name: items[0].name,
                                itemName: itemName,
                                owner: owner
                            };
                        });
                    });
                });
            });
        });
    },
    newRow: function newRow(data) {
        if (!data['name'] || !data['item']) {
            (0, _utility.handleError)(new _utility.HoError('parameter lost!!!'));
        }
        var name = (0, _utility.isValidString)(data['name'], 'name', 'name not vaild!!!');
        var id = (0, _utility.isValidString)(data['item'], 'uid', 'item not vaild!!!');
        var date = new Date();
        var start = Number('' + date.getFullYear() + (0, _utility.completeZero)(date.getMonth() + 1, 2) + (0, _utility.completeZero)(date.getDate(), 2));
        var getItem = function getItem() {
            return id.equals((0, _mongoTool.objectID)(_constants.FITNESS_POINT)) ? _promise2.default.resolve('point') : (0, _mongoTool2.default)('find', _constants.FITNESSDB, { _id: id }).then(function (items1) {
                if (items1.length < 1) {
                    (0, _utility.handleError)(new _utility.HoError('fitness row does not exist!!!'));
                }
                return items1[0].name;
            });
        };
        return getItem().then(function (itemName) {
            return (0, _mongoTool2.default)('find', _constants.RANKDB, {
                type: _constants.FITNESSDB,
                itemId: id,
                start: start
            }).then(function (items) {
                if (items.length > 0) {
                    (0, _utility.handleError)(new _utility.HoError('double rank!!!'));
                }
                var setTag = new _set2.default();
                setTag.add((0, _tagTool.normalize)(name)).add(date.getFullYear().toString()).add(_constants.FITNESSDB).add('sport').add('運動').add((0, _tagTool.normalize)(itemName));
                var setArr = [];
                setTag.forEach(function (s) {
                    if (!(0, _tagTool.isDefaultTag)(s)) {
                        setArr.push(s);
                    }
                });
                return (0, _mongoTool2.default)('insert', _constants.RANKDB, {
                    _id: (0, _mongoTool.objectID)(),
                    name: name,
                    start: start,
                    itemId: id,
                    type: _constants.FITNESSDB,
                    utime: Math.round(new Date().getTime() / 1000),
                    tags: setArr
                }).then(function (item) {
                    console.log(item);
                    console.log('save end');
                    return (0, _mongoTool2.default)('find', _constants.RANKDB, {
                        type: item[0].type,
                        itemId: item[0].itemId
                    }, {
                        limit: 2,
                        sort: [['start', 'desc']]
                    }).then(function (items1) {
                        return items1.length < 2 ? { id: item[0]._id } : (0, _mongoTool2.default)('find', items1[1].type + 'Count', {
                            itemId: items1[1].itemId,
                            start: { $gte: items1[1].start }
                        }, {
                            limit: _constants.RANK_LIMIT,
                            sort: [['count', 'desc']]
                        }).then(function (items2) {
                            return (0, _mongoTool2.default)('update', _constants.RANKDB, { _id: items1[1]._id }, { $set: { history: items2.map(function (i) {
                                        return {
                                            owner: i.owner,
                                            count: i.count
                                        };
                                    }).reverse() } }).then(function (item1) {
                                return { id: item[0]._id };
                            });
                        });
                    });
                });
            });
        });
    },
    delRow: function delRow(uid) {
        return (0, _mongoTool2.default)('find', _constants.RANKDB, { _id: (0, _utility.isValidString)(uid, 'uid', 'uid is not vaild') }, { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                (0, _utility.handleError)(new _utility.HoError('rank row does not exist!!!'));
            }
            return (0, _mongoTool2.default)('remove', _constants.RANKDB, {
                _id: items[0]._id,
                $isolated: 1
            });
        });
    },
    getItem: function getItem() {
        return (0, _mongoTool2.default)('find', _constants.FITNESSDB, { type: 1 }).then(function (items) {
            return [{
                id: _constants.FITNESS_POINT,
                name: 'point'
            }].concat(items.map(function (i) {
                return {
                    id: i._id,
                    name: i.name
                };
            }));
        });
    }
};