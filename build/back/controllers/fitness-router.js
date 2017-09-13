'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

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

var _fitnessTool = require('../models/fitness-tool.js');

var _fitnessTool2 = _interopRequireDefault(_fitnessTool);

var _utility = require('../util/utility');

var _sendWs = require('../util/sendWs');

var _sendWs2 = _interopRequireDefault(_sendWs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var router = _express2.default.Router();
var FitnessTagTool = (0, _tagTool2.default)(_constants.FITNESSDB);

router.use(function (req, res, next) {
    (0, _utility.checkLogin)(req, res, next);
});

router.get('/get/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function (req, res, next) {
    console.log('fitness');
    FitnessTagTool.tagQuery(Number(req.params.page), req.params.name, req.params.exactly === 'true' ? true : false, Number(req.params.index), req.params.sortName, req.params.sortType, req.user, req.session).then(function (result) {
        return res.json({
            itemList: (0, _utility.getFitnessItem)(req.user, result.items),
            parentList: result.parentList,
            latest: result.latest,
            bookmarkID: result.bookmark
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/getSingle/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function (req, res, next) {
    console.log('fitness get single');
    var page = Number(req.params.page);
    if (page === 0 && req.params.name) {
        FitnessTagTool.searchTags(req.session).resetArray();
    }
    FitnessTagTool.tagQuery(page, req.params.name, req.params.exactly === 'true' ? true : false, Number(req.params.index), req.params.sortName, req.params.sortType, req.user, req.session).then(function (result) {
        return res.json({
            itemList: (0, _utility.getFitnessItem)(req.user, result.items),
            parentList: result.parentList,
            latest: result.latest,
            bookmarkID: result.bookmark
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/reset/:sortName(name|mtime|count)/:sortType(desc|asc)', function (req, res, next) {
    console.log('fitness reset');
    FitnessTagTool.resetQuery(req.params.sortName, req.params.sortType, req.user, req.session).then(function (result) {
        return res.json({
            itemList: (0, _utility.getFitnessItem)(req.user, result.items),
            parentList: result.parentList
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/single/:uid', function (req, res, next) {
    console.log('fitness single');
    FitnessTagTool.singleQuery(req.params.uid, req.user, req.session).then(function (result) {
        return result.empty ? res.json(result) : res.json({ item: (0, _utility.getFitnessItem)(req.user, [result.item]) });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.post('/getOptionTag', function (req, res, next) {
    console.log('fitness option tag');
    var optionList = new _set2.default();
    req.body.tags.length > 0 ? FitnessTagTool.getRelativeTag(req.body.tags, req.user, [].concat((0, _toConsumableArray3.default)(optionList))).then(function (relative) {
        var reli = relative.length < 5 ? relative.length : 5;
        for (var i = 0; i < reli; i++) {
            optionList.add(relative[i]);
        }
        res.json({ relative: [].concat((0, _toConsumableArray3.default)(optionList)) });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    }) : res.json({ relative: [].concat((0, _toConsumableArray3.default)(optionList)) });
});

router.put('/addTag/:tag', function (req, res, next) {
    console.log('fitness addTag');
    var recur = function recur(index) {
        return index >= req.body.uids.length ? _promise2.default.resolve(res.json({ apiOK: true })) : FitnessTagTool.addTag(req.body.uids[index], req.params.tag, req.user, false).then(function (result) {
            if (result.id) {
                (0, _sendWs2.default)({
                    type: 'fitness',
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
    console.log('fitness delTag');
    var recur = function recur(index) {
        return index >= req.body.uids.length ? _promise2.default.resolve(res.json({ apiOK: true })) : FitnessTagTool.delTag(req.body.uids[index], req.params.tag, req.user, false).then(function (result) {
            if (result.id) {
                (0, _sendWs2.default)({
                    type: 'fitness',
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

router.post('/newRow', function (req, res, next) {
    console.log('new fitness');
    if (!(0, _utility.checkAdmin)(1, req.user)) {
        (0, _utility.handleError)(new _utility.HoError('permission denied'), next);
    }
    _fitnessTool2.default.newRow(req.body).then(function (result) {
        (0, _sendWs2.default)({
            type: 'fitness',
            data: result.id
        });
        res.json({ id: result.id });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.put('/editRow/:uid', function (req, res, next) {
    console.log('edit fitness');
    if (!(0, _utility.checkAdmin)(1, req.user)) {
        (0, _utility.handleError)(new _utility.HoError('permission denied'), next);
    }
    _fitnessTool2.default.editRow(req.params.uid, req.body, req.session).then(function () {
        (0, _sendWs2.default)({
            type: 'fitness',
            data: req.params.uid
        });
        res.json({ apiOK: true });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.delete('/delRow/:uid', function (req, res, next) {
    console.log('del fitness');
    if (!(0, _utility.checkAdmin)(1, req.user)) {
        (0, _utility.handleError)(new _utility.HoError('permission denied'), next);
    }
    _fitnessTool2.default.delRow(req.params.uid).then(function () {
        (0, _sendWs2.default)({
            type: 'fitness',
            data: req.params.uid
        });
        res.json({ apiOK: true });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/getPoint', function (req, res, next) {
    console.log('get fitness point');
    _fitnessTool2.default.getPoint(req.user).then(function (result) {
        return res.json({ point: result });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.put('/exchange/:uid', function (req, res, next) {
    console.log('exchange fitness');
    _fitnessTool2.default.exchange(req.params.uid, req.user, req.body.exchange, req.session).then(function (result) {
        (0, _sendWs2.default)({
            type: 'fitness',
            data: req.params.uid
        });
        res.json({ point: result });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/getStat/:index?/:uid?', function (req, res, next) {
    console.log('get fitness statistic');
    _fitnessTool2.default.getStat(req.user._id, req.params.index, req.params.uid).then(function (result) {
        res.json(result ? result : { apiOK: true });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/reset', function (req, res, next) {
    console.log('reset fitness');
    _fitnessTool2.default.resetDate(req.user._id).then(function (result) {
        return res.json({ apiOK: true });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

exports.default = router;