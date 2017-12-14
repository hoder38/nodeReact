'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _constants = require('../constants');

var _ver = require('../../../ver');

var _config = require('../config');

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _https = require('https');

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

var _utility = require('../util/utility');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var router = _express2.default.Router();

router.get('/refresh', function (req, res, next) {
    console.log('refresh');
    res.end('refresh');
});

router.get('/s', function (req, res, next) {
    console.log('short');
    (0, _mongoTool2.default)('find', _constants.STORAGEDB, { status: 7 }, {
        sort: [['utime', 'desc']],
        limit: 1
    }).then(function (items) {
        if (items.length < 1) {
            return (0, _utility.handleError)(new _utility.HoError('cannot find url'));
        }
        if (!items[0].url) {
            return (0, _utility.handleError)(new _utility.HoError('dont have url'));
        }
        var url = decodeURIComponent(items[0].url);
        res.header('Content-Type', 'text/plain');
        res.statusCode = 302;
        res.header('Location', url);
        res.end('302. Redirecting to ' + url);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/subtitle/:uid/:lang/:index(\\d+|v)/:fresh(0+)?', function (req, res, next) {
    (0, _utility.checkLogin)(req, res, function () {
        console.log('subtitle');
        var subReq = (0, _https.request)({
            host: (0, _config.EXTENT_FILE_IP)(_ver.ENV_TYPE),
            port: (0, _config.EXTENT_FILE_PORT)(_ver.ENV_TYPE),
            path: '/subtitle/' + req.params.uid + '/' + req.params.lang + '/' + req.params.index,
            method: 'GET',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': req.headers['referer'],
                'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; rv:40.0) Gecko/20100101 Firefox/40.0'
            }
        }, function (sub) {
            if (sub.statusCode === 200) {
                res.writeHead(200, { 'Content-Type': 'text/vtt' });
                sub.pipe(res);
            }
        });
        subReq.end();
    });
});

exports.default = router;