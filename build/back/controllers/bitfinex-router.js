'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _bitfinexTool = require('../models/bitfinex-tool.js');

var _bitfinexTool2 = _interopRequireDefault(_bitfinexTool);

var _utility = require('../util/utility');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var router = _express2.default.Router();

router.use(function (req, res, next) {
    (0, _utility.checkLogin)(req, res, next);
});

router.get('/get/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function (req, res, next) {
    console.log('bitfinex');
    res.json(_bitfinexTool2.default.query(Number(req.params.page), req.params.name, req.params.sortName, req.params.sortType, req.user, req.session));
});

router.get('/getSingle/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?', function (req, res, next) {
    console.log('bitfinex get single');
    res.json(_bitfinexTool2.default.query(Number(req.params.page), req.params.name, req.params.sortName, req.params.sortType, req.user, req.session));
});

router.get('/single/:sortName(name|mtime|count)/:sortType(desc|asc)/:uid/:user?', function (req, res, next) {
    console.log('BitfinexTool single');
    res.json(_bitfinexTool2.default.query(0, req.params.name, req.params.sortName, req.params.sortType, req.user, req.session, Number(req.params.uid)));
});

router.get('/parent', function (req, res, next) {
    console.log('bitfinex parent');
    res.json(_bitfinexTool2.default.parent());
});

router.route('/bot').get(function (req, res, next) {
    console.log('get bot');
    _bitfinexTool2.default.getBot(req.user._id).then(function (list) {
        return res.json(list);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
}).put(function (req, res, next) {
    console.log('update bot');
    console.log(req.body);
    _bitfinexTool2.default.updateBot(req.user._id, req.body).then(function (list) {
        return res.json(list);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/bot/del/:type', function (req, res, next) {
    console.log('del bot');
    _bitfinexTool2.default.deleteBot(req.user._id, req.params.type).then(function (list) {
        return res.json(list);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/bot/close/:credit', function (req, res, next) {
    console.log('close credit');
    _bitfinexTool2.default.closeCredit(req.user._id, req.params.credit).then(function () {
        return res.json({ apiOK: true });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

exports.default = router;