'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _toConsumableArray2 = require('babel-runtime/helpers/toConsumableArray');

var _toConsumableArray3 = _interopRequireDefault(_toConsumableArray2);

var _toArray2 = require('babel-runtime/helpers/toArray');

var _toArray3 = _interopRequireDefault(_toArray2);

exports.default = function (functionName) {
    for (var _len = arguments.length, args = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
        args[_key - 1] = arguments[_key];
    }

    if (functionName === 'multi') {
        var _ret = function () {
            var multi = client.multi();
            args[0].forEach(function (a) {
                var _multi;

                var _a = (0, _toArray3.default)(a),
                    b = _a[0],
                    c = _a.slice(1);

                multi = (_multi = multi)[b].apply(_multi, (0, _toConsumableArray3.default)(c));
            });
            return {
                v: new _promise2.default(function (resolve, reject) {
                    return multi.exec(function (err, data) {
                        return err ? reject(err) : resolve(data);
                    });
                })
            };
        }();

        if ((typeof _ret === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret)) === "object") return _ret.v;
    } else {
        return new _promise2.default(function (resolve, reject) {
            return client[functionName].apply(client, args.concat([function (err, data) {
                return err ? reject(err) : resolve(data);
            }]));
        });
    }
};

var _ver = require('../../../ver');

var _config = require('../config');

var _redis = require('redis');

var _redis2 = _interopRequireDefault(_redis);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var client = _redis2.default.createClient((0, _config.SESS_PORT)(_ver.ENV_TYPE), (0, _config.SESS_IP)(_ver.ENV_TYPE), { auth_pass: _ver.SESS_PWD });
client.on('error', function (err) {
    return console.log('Redis error: ' + err);
});
client.on('ready', function (err) {
    return console.log('Redis ready');
});
client.on('connect', function () {
    console.log('Redis connect');
    client.config('SET', 'maxmemory', '100mb');
    client.config('SET', 'maxmemory-policy', 'allkeys-lru');
});