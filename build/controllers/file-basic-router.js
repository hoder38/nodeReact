'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _utility = require('../util/utility');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var router = _express2.default.Router();

router.get('/testLogin', function (req, res, next) {
    (0, _utility.checkLogin)(req, res, function () {
        return res.json({ apiOK: true });
    }, 1);
});

exports.default = router;