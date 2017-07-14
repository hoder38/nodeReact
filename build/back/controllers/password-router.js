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

var _passwordTool = require('../models/password-tool.js');

var _passwordTool2 = _interopRequireDefault(_passwordTool);

var _utility = require('../util/utility');

var _sendWs = require('../util/sendWs');

var _sendWs2 = _interopRequireDefault(_sendWs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var router = _express2.default.Router();
var PasswordTagTool = (0, _tagTool2.default)(_constants.PASSWORDDB);

router.use(function (req, res, next) {
    (0, _utility.checkLogin)(req, res, next);
});

router.get('/get/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function (req, res, next) {
    console.log('password');
    PasswordTagTool.tagQuery(Number(req.params.page), req.params.name, req.params.exactly === 'true' ? true : false, Number(req.params.index), req.params.sortName, req.params.sortType, req.user, req.session).then(function (result) {
        return res.json({
            itemList: (0, _utility.getPasswordItem)(req.user, result.items),
            parentList: result.parentList,
            latest: result.latest,
            bookmarkID: result.bookmark
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/getSingle/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function (req, res, next) {
    console.log('password get single');
    var page = Number(req.params.page);
    if (page === 0 && req.params.name) {
        PasswordTagTool.searchTags(req.session).resetArray();
    }
    PasswordTagTool.tagQuery(page, req.params.name, req.params.exactly === 'true' ? true : false, Number(req.params.index), req.params.sortName, req.params.sortType, req.user, req.session).then(function (result) {
        return res.json({
            itemList: (0, _utility.getPasswordItem)(req.user, result.items),
            parentList: result.parentList,
            latest: result.latest,
            bookmarkID: result.bookmark
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/reset/:sortName(name|mtime|count)/:sortType(desc|asc)', function (req, res, next) {
    console.log('password reset');
    PasswordTagTool.resetQuery(req.params.sortName, req.params.sortType, req.user, req.session).then(function (result) {
        return res.json({
            itemList: (0, _utility.getPasswordItem)(req.user, result.items),
            parentList: result.parentList
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/single/:uid', function (req, res, next) {
    console.log('password single');
    PasswordTagTool.singleQuery(req.params.uid, req.user, req.session).then(function (result) {
        return result.empty ? res.json(result) : res.json({ item: (0, _utility.getPasswordItem)(req.user, [result.item]) });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.post('/getOptionTag', function (req, res, next) {
    console.log('password option tag');
    var optionList = new _set2.default();
    req.body.tags.length > 0 ? PasswordTagTool.getRelativeTag(req.body.tags, req.user, [].concat((0, _toConsumableArray3.default)(optionList))).then(function (relative) {
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
    console.log('password addTag');
    _promise2.default.all(req.body.uids.map(function (u) {
        return PasswordTagTool.addTag(u, req.params.tag, req.user, false);
    })).then(function (result) {
        result.forEach(function (r) {
            if (r.id) {
                (0, _sendWs2.default)({
                    type: 'password',
                    data: r.id
                });
            }
        });
        res.json({ apiOK: true });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.put('/delTag/:tag', function (req, res, next) {
    console.log('password delTag');
    _promise2.default.all(req.body.uids.map(function (u) {
        return PasswordTagTool.delTag(u, req.params.tag, req.user, false);
    })).then(function (result) {
        result.forEach(function (r) {
            if (r.id) {
                (0, _sendWs2.default)({
                    type: 'password',
                    data: r.id
                });
            }
        });
        res.json({ apiOK: true });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.post('/newRow', function (req, res, next) {
    console.log('new password');
    _passwordTool2.default.newRow(req.body, req.user).then(function (result) {
        (0, _sendWs2.default)({
            type: 'password',
            data: result.id
        });
        res.json({ id: result.id });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.put('/editRow/:uid', function (req, res, next) {
    console.log('edit password');
    _passwordTool2.default.editRow(req.params.uid, req.body, req.user, req.session).then(function () {
        (0, _sendWs2.default)({
            type: 'password',
            data: req.params.uid
        });
        res.json({ apiOK: true });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.put('/delRow/:uid', function (req, res, next) {
    console.log('del password');
    _passwordTool2.default.delRow(req.params.uid, req.body.userPW, req.user).then(function () {
        (0, _sendWs2.default)({
            type: 'password',
            data: req.params.uid
        });
        res.json({ apiOK: true });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.put('/getPW/:uid/:type?', function (req, res, next) {
    console.log('get password');
    _passwordTool2.default.getPassword(req.params.uid, req.body.userPW, req.user, req.session, req.params.type).then(function (result) {
        return res.json({ password: result.password });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/generate/:type(\\d)', function (req, res, next) {
    console.log('generate password');
    res.json({ password: _passwordTool2.default.generatePW(Number(req.params.type)) });
});

exports.default = router;