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

var _rankTool = require('../models/rank-tool.js');

var _rankTool2 = _interopRequireDefault(_rankTool);

var _utility = require('../util/utility');

var _sendWs = require('../util/sendWs');

var _sendWs2 = _interopRequireDefault(_sendWs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var router = _express2.default.Router();
var RankTagTool = (0, _tagTool2.default)(_constants.RANKDB);

router.use(function (req, res, next) {
    (0, _utility.checkLogin)(req, res, next);
});

router.get('/get/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function (req, res, next) {
    console.log('rank');
    RankTagTool.tagQuery(Number(req.params.page), req.params.name, req.params.exactly === 'true' ? true : false, Number(req.params.index), req.params.sortName, req.params.sortType, req.user, req.session).then(function (result) {
        return res.json({
            itemList: (0, _utility.getRankItem)(req.user, result.items),
            parentList: result.parentList,
            latest: result.latest,
            bookmarkID: result.bookmark
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/getSingle/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function (req, res, next) {
    console.log('rank get single');
    var page = Number(req.params.page);
    if (page === 0 && req.params.name) {
        RankTagTool.searchTags(req.session).resetArray();
    }
    RankTagTool.tagQuery(page, req.params.name, req.params.exactly === 'true' ? true : false, Number(req.params.index), req.params.sortName, req.params.sortType, req.user, req.session).then(function (result) {
        return res.json({
            itemList: (0, _utility.getRankItem)(req.user, result.items),
            parentList: result.parentList,
            latest: result.latest,
            bookmarkID: result.bookmark
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/reset/:sortName(name|mtime|count)/:sortType(desc|asc)', function (req, res, next) {
    console.log('rank reset');
    RankTagTool.resetQuery(req.params.sortName, req.params.sortType, req.user, req.session).then(function (result) {
        return res.json({
            itemList: (0, _utility.getRankItem)(req.user, result.items),
            parentList: result.parentList
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/single/:uid', function (req, res, next) {
    console.log('rank single');
    RankTagTool.singleQuery(req.params.uid, req.user, req.session).then(function (result) {
        return result.empty ? res.json(result) : res.json({ item: (0, _utility.getRankItem)(req.user, [result.item]) });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.post('/getOptionTag', function (req, res, next) {
    console.log('rank option tag');
    var optionList = new _set2.default();
    req.body.tags.length > 0 ? RankTagTool.getRelativeTag(req.body.tags, req.user, [].concat((0, _toConsumableArray3.default)(optionList))).then(function (relative) {
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
    console.log('rank addTag');
    var recur = function recur(index) {
        return index >= req.body.uids.length ? _promise2.default.resolve(res.json({ apiOK: true })) : RankTagTool.addTag(req.body.uids[index], req.params.tag, req.user, false).then(function (result) {
            if (result.id) {
                (0, _sendWs2.default)({
                    type: 'rank',
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
    console.log('rank delTag');
    var recur = function recur(index) {
        return index >= req.body.uids.length ? _promise2.default.resolve(res.json({ apiOK: true })) : RankTagTool.delTag(req.body.uids[index], req.params.tag, req.user, false).then(function (result) {
            if (result.id) {
                (0, _sendWs2.default)({
                    type: 'rank',
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
    console.log('new rank');
    if (!(0, _utility.checkAdmin)(1, req.user)) {
        return (0, _utility.handleError)(new HoError('permission denied'), next);
    }
    _rankTool2.default.newRow(req.body).then(function (result) {
        (0, _sendWs2.default)({
            type: 'rank',
            data: result.id
        });
        res.json({ id: result.id });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.delete('/delRow/:uid', function (req, res, next) {
    console.log('del rank');
    if (!(0, _utility.checkAdmin)(1, req.user)) {
        return (0, _utility.handleError)(new HoError('permission denied'), next);
    }
    _rankTool2.default.delRow(req.params.uid).then(function () {
        (0, _sendWs2.default)({
            type: 'rank',
            data: req.params.uid
        });
        res.json({ apiOK: true });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/getChart/:uid', function (req, res, next) {
    console.log('get rank chart');
    _rankTool2.default.getChart(req.params.uid, req.user, req.session).then(function (result) {
        return res.json(result);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/getItem', function (req, res, next) {
    console.log('get rank item');
    _rankTool2.default.getItem().then(function (result) {
        return res.json({ item: result });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

exports.default = router;