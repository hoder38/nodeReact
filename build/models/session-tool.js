'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

exports.default = function (express) {
    var redisStore = (0, _connectRedis2.default)(express);
    return {
        config: {
            secret: _ver.SESS_SECRET,
            cookie: {
                maxAge: 86400 * 1000 * 3,
                secure: true
            },
            store: new redisStore({
                host: (0, _config.SESS_IP)(_ver.ENV_TYPE),
                port: (0, _config.SESS_PORT)(_ver.ENV_TYPE),
                pass: _ver.SESS_PWD
            }),
            resave: false,
            saveUninitialized: false
        }
    };
};

var _ver = require('../ver');

var _config = require('../config');

var _connectRedis = require('connect-redis');

var _connectRedis2 = _interopRequireDefault(_connectRedis);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }