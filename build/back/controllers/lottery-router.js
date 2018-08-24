'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _lotteryTool = require('../models/lottery-tool');

var _lotteryTool2 = _interopRequireDefault(_lotteryTool);

var _utility = require('../util/utility');

var _sendWs = require('../util/sendWs');

var _sendWs2 = _interopRequireDefault(_sendWs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var router = _express2.default.Router();

var isSelecting = false;

router.use(function (req, res, next) {
    (0, _utility.checkLogin)(req, res, next);
});

router.get('/get', function (req, res, next) {
    console.log('lottery get');
    /*Lottery.input('/home/pi/Book1.csv', true).then(() => Lottery.inputReward('/home/pi/reward.csv', true)).then(() => {
        Lottery.select(0);
        Lottery.select(1);
        Lottery.select(2);
        Lottery.select(3);
        Lottery.select(4);
        Lottery.select(0);
        Lottery.select(5);
        Lottery.select(6);
    }).then(() => Lottery.outputCsv(true))*/;
    _lotteryTool2.default.getInit(req.user._id).then(function (data) {
        return res.json(data);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/select/:uid', function (req, res, next) {
    console.log('lottery select');
    if (isSelecting) {
        return (0, _utility.handleError)(new _utility.HoError('someone is lotterying!!!'), next);
    }
    isSelecting = true;
    _lotteryTool2.default.select(req.params.uid, req.user._id).then(function (data) {
        isSelecting = false;
        (0, _sendWs2.default)({
            type: 'select',
            data: data
        }, false, false, 'win');
        res.json({ apiOK: true });
    }).catch(function (err) {
        isSelecting = false;
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/single/:uid', function (req, res, next) {
    console.log('lottery single');
    _lotteryTool2.default.getData(req.params.uid).then(function (data) {
        return res.json({ item: data });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/userlist', function (req, res, next) {
    console.log('lottery userlist');
    _lotteryTool2.default.getData().then(function (data) {
        return res.json(data);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

exports.default = router;