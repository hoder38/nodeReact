'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _constants = require('../constants');

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _tagTool = require('../models/tag-tool');

var _tagTool2 = _interopRequireDefault(_tagTool);

var _utility = require('../util/utility');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var router = _express2.default.Router();
var StorageTagTool = (0, _tagTool2.default)(_constants.STORAGEDB);
var PasswordTagTool = (0, _tagTool2.default)(_constants.PASSWORDDB);
var StockTagTool = (0, _tagTool2.default)(_constants.STOCKDB);

router.use(function (req, res, next) {
    (0, _utility.checkLogin)(req, res, next);
});

//storage
router.get('/' + _constants.STORAGEDB + '/list', function (req, res, next) {
    console.log('storage parent list');
    res.json({ parentList: StorageTagTool.parentList().concat((0, _utility.checkAdmin)(2, req.user) ? StorageTagTool.adultonlyParentList() : []).map(function (l) {
            return {
                name: l.name,
                show: l.tw
            };
        }) });
});

router.get('/' + _constants.STORAGEDB + '/taglist/:name/:sortName(name|mtime)/:sortType(desc|asc)/:page(\\d+)', function (req, res, next) {
    console.log('storage show taglist');
    StorageTagTool.parentQuery(req.params.name, req.params.sortName, req.params.sortType, Number(req.params.page), req.user).then(function (result) {
        return res.json(result);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/' + _constants.STORAGEDB + '/query/:id/:sortName(name|mtime|count)/:sortType(desc|asc)/:single?', function (req, res, next) {
    console.log('storage parent query');
    StorageTagTool.queryParentTag(req.params.id, req.params.single, req.params.sortName, req.params.sortType, req.user, req.session).then(function (result) {
        return res.json({
            itemList: (0, _utility.getStorageItem)(req.user, result.items, result.mediaHadle),
            parentList: result.parentList,
            latest: result.latest,
            bookmarkID: result.bookmark
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.post('/' + _constants.STORAGEDB + '/add', function (req, res, next) {
    console.log('storage parent add');
    StorageTagTool.addParent(req.body.name, req.body.tag, req.user).then(function (result) {
        return res.json(result);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.delete('/' + _constants.STORAGEDB + '/del/:id', function (req, res, next) {
    console.log('storage parent del');
    StorageTagTool.delParent(req.params.id, req.user).then(function (result) {
        return res.json(result);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

//password
router.get('/' + _constants.PASSWORDDB + '/list', function (req, res, next) {
    console.log('password parent list');
    res.json({ parentList: PasswordTagTool.parentList().map(function (l) {
            return {
                name: l.name,
                show: l.tw
            };
        }) });
});

router.get('/' + _constants.PASSWORDDB + '/taglist/:name/:sortName(name|mtime)/:sortType(desc|asc)/:page(\\d+)', function (req, res, next) {
    console.log('password show taglist');
    PasswordTagTool.parentQuery(req.params.name, req.params.sortName, req.params.sortType, Number(req.params.page), req.user).then(function (result) {
        return res.json(result);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/' + _constants.PASSWORDDB + '/query/:id/:sortName(name|mtime|count)/:sortType(desc|asc)/:single?', function (req, res, next) {
    console.log('password parent query');
    PasswordTagTool.queryParentTag(req.params.id, req.params.single, req.params.sortName, req.params.sortType, req.user, req.session).then(function (result) {
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

router.post('/' + _constants.PASSWORDDB + '/add', function (req, res, next) {
    console.log('password parent add');
    PasswordTagTool.addParent(req.body.name, req.body.tag, req.user).then(function (result) {
        return res.json(result);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.delete('/' + _constants.PASSWORDDB + '/del/:id', function (req, res, next) {
    console.log('storage parent del');
    PasswordTagTool.delParent(req.params.id, req.user).then(function (result) {
        return res.json(result);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

//stock
router.get('/' + _constants.STOCKDB + '/list', function (req, res, next) {
    console.log('stock parent list');
    res.json({ parentList: StockTagTool.parentList().map(function (l) {
            return {
                name: l.name,
                show: l.tw
            };
        }) });
});

router.get('/' + _constants.STOCKDB + '/taglist/:name/:sortName(name|mtime)/:sortType(desc|asc)/:page(\\d+)', function (req, res, next) {
    console.log('stock show taglist');
    StockTagTool.parentQuery(req.params.name, req.params.sortName, req.params.sortType, Number(req.params.page), req.user).then(function (result) {
        return res.json(result);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/' + _constants.STOCKDB + '/query/:id/:sortName(name|mtime|count)/:sortType(desc|asc)/:single?', function (req, res, next) {
    console.log('stock parent query');
    StockTagTool.queryParentTag(req.params.id, req.params.single, req.params.sortName, req.params.sortType, req.user, req.session).then(function (result) {
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

router.post('/' + _constants.STOCKDB + '/add', function (req, res, next) {
    console.log('stock parent add');
    StockTagTool.addParent(req.body.name, req.body.tag, req.user).then(function (result) {
        return res.json(result);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.delete('/' + _constants.STOCKDB + '/del/:id', function (req, res, next) {
    console.log('stock parent del');
    StockTagTool.delParent(req.params.id, req.user).then(function (result) {
        return res.json(result);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

exports.default = router;