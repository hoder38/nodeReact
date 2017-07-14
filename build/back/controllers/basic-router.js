'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _constants = require('../constants');

var _ver = require('../../../ver');

var _config = require('../config');

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _tagTool = require('../models/tag-tool');

var _tagTool2 = _interopRequireDefault(_tagTool);

var _utility = require('../util/utility');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var router = _express2.default.Router();
var StorageTagTool = (0, _tagTool2.default)(_constants.STORAGEDB);

router.route('/getuser').get(function (req, res, next) {
    (0, _utility.checkLogin)(req, res, function () {
        console.log('get basic');
        res.json({
            id: req.user.username,
            ws_url: 'wss://' + (0, _config.EXTENT_IP)(_ver.ENV_TYPE) + ':' + (0, _config.WS_PORT)(_ver.ENV_TYPE),
            level: (0, _utility.checkAdmin)(1, req.user) ? 2 : (0, _utility.checkAdmin)(2, req.user) ? 1 : 0,
            isEdit: (0, _utility.checkAdmin)(1, req.user) ? true : false,
            nav: (0, _utility.checkAdmin)(1, req.user) ? [{
                title: "Stock",
                hash: "/Stock",
                css: "glyphicon glyphicon-signal",
                key: 3
            }] : [],
            main_url: 'https://' + (0, _config.EXTENT_FILE_IP)(_ver.ENV_TYPE) + ':' + (0, _config.EXTENT_FILE_PORT)(_ver.ENV_TYPE)
        });
    });
});

router.get('/testLogin', function (req, res, next) {
    (0, _utility.checkLogin)(req, res, function () {
        return res.json({ apiOK: true });
    });
});

router.get('/getPath', function (req, res, next) {
    (0, _utility.checkLogin)(req, res, function () {
        return res.json({ path: StorageTagTool.searchTags(req.session).getArray().cur });
    });
});

exports.default = router;