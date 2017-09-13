'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

exports.default = function () {
    var url = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;

    router.get('/api/logout', function (req, res, next) {
        console.log('logout');
        if (req.isAuthenticated()) {
            req.session.destroy();
        }
        res.json(url ? {
            apiOK: true,
            url: url
        } : { apiOK: true });
    });
    router.post('/api/login', _passport2.default.authenticate('local'), function (req, res) {
        req.logIn(req.user, function (err) {
            console.log('auth ok');
            res.json((0, _assign2.default)({
                loginOK: true,
                id: req.user.username
            }, url ? { url: url } : {}));
        });
    });
    router.all('/api*', function (req, res, next) {
        (0, _utility.handleError)(new _utility.HoError('Unkonwn api'));
    });
    return router;
};

var _constants = require('../constants');

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _passport = require('passport');

var _passport2 = _interopRequireDefault(_passport);

var _passportLocal = require('passport-local');

var _crypto = require('crypto');

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

var _utility = require('../util/utility');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var router = _express2.default.Router();

//passport
_passport2.default.use(new _passportLocal.Strategy(function (username, password, done) {
    console.log('login');
    var validUsername = (0, _utility.isValidString)(username, 'name');
    if (!validUsername) {
        (0, _utility.handleError)(new _utility.HoError('username is not vaild', { code: 401 }), done);
    }
    (0, _mongoTool2.default)('find', _constants.USERDB, { username: validUsername }, { limit: 1 }).then(function (users) {
        var validPassword = (0, _utility.isValidString)(password, 'passwd');
        if (!validPassword) {
            return (0, _utility.handleReject)(new _utility.HoError('passwd is not vaild', { code: 401 }));
        }
        if (users.length < 1 || (0, _crypto.createHash)('md5').update(validPassword).digest('hex') !== users[0].password) {
            return (0, _utility.handleReject)(new _utility.HoError('Incorrect username or password', { cdoe: 401 }));
        }
        done(null, users[0]);
    }).catch(function (err) {
        return (0, _utility.handleError)(err, done);
    });
}));
_passport2.default.serializeUser(function (user, done) {
    done(null, user._id);
});
_passport2.default.deserializeUser(function (id, done) {
    (0, _mongoTool2.default)('find', _constants.USERDB, { _id: (0, _mongoTool.objectID)(id) }, { limit: 1 }).then(function (users) {
        return done(null, {
            _id: users[0]._id,
            auto: users[0].auto,
            perm: users[0].perm,
            unDay: users[0].unDay,
            unHit: users[0].unHit,
            username: users[0].username,
            password: users[0].password
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, done);
    });
});

//login