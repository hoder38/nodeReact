'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _entries = require('babel-runtime/core-js/object/entries');

var _entries2 = _interopRequireDefault(_entries);

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _toConsumableArray2 = require('babel-runtime/helpers/toConsumableArray');

var _toConsumableArray3 = _interopRequireDefault(_toConsumableArray2);

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

exports.default = function (name) {
    for (var _len = arguments.length, args = Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
        args[_key - 1] = arguments[_key];
    }

    console.log(name);
    console.log(args);
    switch (name) {
        case 'stop':
            return stopApi();
        case 'url':
            return download.apply(undefined, [false].concat(args));
        case 'download':
            if (api_ing >= (0, _config.API_LIMIT)(_ver.ENV_TYPE)) {
                console.log('reach limit ' + api_ing + ' ' + api_pool.length);
                expire(name, args).catch(function (err) {
                    return (0, _utility.handleError)(err, 'Api');
                });
            } else {
                api_ing++;
                console.log('go ' + api_ing + ' ' + api_pool.length);
                download.apply(undefined, args).catch(function (err) {
                    return handle_err(err, args[0]);
                }).then(function (rest) {
                    return get(rest);
                }).catch(function (err) {
                    return (0, _utility.handleError)(err, 'Api');
                });
            }
            return new _promise2.default(function (resolve, reject) {
                return setTimeout(function () {
                    return resolve();
                }, 500);
            });
        default:
            return (0, _utility.handleError)(new _utility.HoError('unknown api'));
    }
};

var _ver = require('../../../ver');

var _config = require('../config');

var _constants = require('../constants');

var _nodeFetch = require('node-fetch');

var _nodeFetch2 = _interopRequireDefault(_nodeFetch);

var _querystring = require('querystring');

var _fs = require('fs');

var _path = require('path');

var _url = require('url');

var _utf = require('utf8');

var _utf2 = _interopRequireDefault(_utf);

var _utility = require('../util/utility');

var _sendWs = require('../util/sendWs');

var _sendWs2 = _interopRequireDefault(_sendWs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var api_ing = 0;
var api_pool = [];
var api_duration = 0;
var api_lock = false;

var setLock = function setLock() {
    console.log(api_lock);
    return api_lock ? new _promise2.default(function (resolve, reject) {
        return setTimeout(function () {
            return resolve(setLock());
        }, 500);
    }) : _promise2.default.resolve(api_lock = true);
};

function get() {
    var rest = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : null;

    api_duration = 0;
    if (api_ing > 0) {
        api_ing--;
    }
    console.log('get ' + api_ing + ' ' + api_pool.length);
    if (rest && typeof rest === 'function') {
        rest().catch(function (err) {
            return (0, _utility.handleError)(err, 'Api rest');
        });
    }
    if (api_pool.length > 0) {
        var _ret = function () {
            var fun = api_pool.splice(0, 1)[0];
            if (fun) {
                switch (fun.name) {
                    case 'download':
                        return {
                            v: download.apply(undefined, (0, _toConsumableArray3.default)(fun.args)).catch(function (err) {
                                return handle_err(err, fun.args[0]);
                            }).then(function (rest) {
                                return get(rest);
                            })
                        };
                    default:
                        return {
                            v: (0, _utility.handleError)(new _utility.HoError('unknown api')).catch(function (err) {
                                return (0, _utility.handleError)(err, 'Api');
                            }).then(function (rest) {
                                return get(rest);
                            })
                        };
                }
            }
        }();

        if ((typeof _ret === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret)) === "object") return _ret.v;
    }
    console.log('empty ' + api_ing + ' ' + api_pool.length);
    return _promise2.default.resolve();
}

function handle_err(err, user) {
    (0, _utility.handleError)(err, 'Api');
    (0, _sendWs2.default)({
        type: user.username,
        data: 'Api fail: ' + err.message
    }, 0);
}

function expire(name, args) {
    console.log('expire ' + api_ing + ' ' + api_pool.length);
    return setLock().then(function (go) {
        if (!go) {
            return _promise2.default.resolve();
        }
        api_pool.push({
            name: name,
            args: args
        });
        var now = new Date().getTime() / 1000;
        if (!api_duration) {
            api_duration = now;
        } else if (now - api_duration > _constants.API_EXPIRE) {
            api_duration = 0;
            if (api_pool.length > 0) {
                var fun = api_pool.splice(0, 1)[0];
                if (fun) {
                    api_lock = false;
                    switch (fun.name) {
                        case 'download':
                            return download.apply(undefined, (0, _toConsumableArray3.default)(fun.args)).catch(function (err) {
                                return handle_err(err, args[0]);
                            }).then(function (rest) {
                                return get(rest);
                            });
                        default:
                            return (0, _utility.handleError)(new _utility.HoError('unknown api')).catch(function (err) {
                                return (0, _utility.handleError)(err, 'Api');
                            }).then(function (rest) {
                                return get(rest);
                            });
                    }
                }
            }
        }
        api_lock = false;
        console.log('empty ' + api_ing + ' ' + api_pool.length);
        return _promise2.default.resolve();
    });
}

function stopApi() {
    api_ing = 0;
    return _promise2.default.resolve();
}

function download(user, url) {
    var _ref = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {},
        _ref$filePath = _ref.filePath,
        filePath = _ref$filePath === undefined ? null : _ref$filePath,
        _ref$is_check = _ref.is_check,
        is_check = _ref$is_check === undefined ? true : _ref$is_check,
        _ref$referer = _ref.referer,
        referer = _ref$referer === undefined ? null : _ref$referer,
        _ref$is_json = _ref.is_json,
        is_json = _ref$is_json === undefined ? false : _ref$is_json,
        _ref$post = _ref.post,
        post = _ref$post === undefined ? null : _ref$post,
        _ref$not_utf = _ref.not_utf8,
        not_utf8 = _ref$not_utf === undefined ? false : _ref$not_utf,
        _ref$cookie = _ref.cookie,
        cookie = _ref$cookie === undefined ? null : _ref$cookie,
        _ref$fake_ip = _ref.fake_ip,
        fake_ip = _ref$fake_ip === undefined ? null : _ref$fake_ip,
        _ref$rest = _ref.rest,
        rest = _ref$rest === undefined ? null : _ref$rest,
        _ref$errHandle = _ref.errHandle,
        errHandle = _ref$errHandle === undefined ? null : _ref$errHandle,
        _ref$is_dm = _ref.is_dm5,
        is_dm5 = _ref$is_dm === undefined ? false : _ref$is_dm;

    var qspost = null;
    if (post) {
        not_utf8 ? (0, _entries2.default)(post).forEach(function (f) {
            return qspost = qspost ? qspost + '&' + f[0] + '=' + (0, _utility.big5Encode)(f[1]) : f[0] + '=' + (0, _utility.big5Encode)(f[1]);
        }) : qspost = (0, _querystring.stringify)(post);
    }
    var temp = filePath + '_t';
    var checkTmp = function checkTmp() {
        return (0, _fs.existsSync)(temp) ? new _promise2.default(function (resolve, reject) {
            return (0, _fs.unlink)(temp, function (err) {
                return err ? reject(err) : resolve();
            });
        }) : _promise2.default.resolve();
    };
    var index = 0;
    var proc = function proc() {
        return (0, _nodeFetch2.default)(_utf2.default.encode(url), (0, _assign2.default)({ headers: (0, _assign2.default)(referer ? { 'Referer': referer } : {}, user ? {} : { 'User-Agent': 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36' }, cookie ? { Cookie: cookie } : {}, qspost ? {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': qspost.length
            } : {}, fake_ip ? {
                'X-Forwarded-For': fake_ip,
                'Client-IP': fake_ip
            } : {}, is_dm5 ? { 'Accept-Language': 'en-US,en;q=0.9' } : {}) }, post ? {
            method: 'POST',
            body: qspost
        } : {})).then(function (res) {
            if (user) {
                if (!filePath) {
                    return (0, _utility.handleError)(new _utility.HoError('file path empty!'), errHandle);
                }
                return checkTmp().then(function () {
                    return new _promise2.default(function (resolve, reject) {
                        var dest = (0, _fs.createWriteStream)(temp);
                        res.body.pipe(dest);
                        dest.on('finish', function () {
                            return resolve();
                        });
                        dest.on('error', function (err) {
                            return reject(err);
                        });
                    }).then(function () {
                        if (is_check && (!res.headers['content-length'] || Number(res.headers['content-length']) !== (0, _fs.statSync)(filePath)['size'])) {
                            return (0, _utility.handleError)(new _utility.HoError('incomplete download'), errHandle);
                        }
                        (0, _fs.renameSync)(temp, filePath);
                        if (rest) {
                            var _ret2 = function () {
                                var filename = res.headers['content-disposition'] ? res.headers['content-disposition'].match(/^attachment; filename=[\'\"]?(.*?)[\'\"]?$/) : res.headers['_headers']['content-disposition'] ? res.headers['_headers']['content-disposition'][0].match(/^attachment; filename=[\'\"]?(.*?)[\'\"]?$/) : null;
                                var pathname = (0, _url.parse)(url).pathname;
                                return {
                                    v: function v() {
                                        return new _promise2.default(function (resolve, reject) {
                                            return setTimeout(function () {
                                                return resolve();
                                            }, 0);
                                        }).then(function () {
                                            return rest([pathname, filename ? filename[1] : (0, _path.basename)(pathname)]);
                                        }).catch(function (err) {
                                            return errHandle(err);
                                        });
                                    }
                                };
                            }();

                            if ((typeof _ret2 === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret2)) === "object") return _ret2.v;
                        }
                    });
                });
            } else if (is_json) {
                return res.json();
            } else {
                return filePath ? checkTmp().then(function () {
                    return new _promise2.default(function (resolve, reject) {
                        var dest = (0, _fs.createWriteStream)(temp);
                        res.body.pipe(dest);
                        dest.on('finish', function () {
                            return resolve();
                        });
                    });
                }).then(function () {
                    return (0, _fs.renameSync)(temp, filePath);
                }) : res.text();
            }
        }).catch(function (err) {
            if (err.code === 'HPE_INVALID_CONSTANT') {
                return (0, _utility.handleError)(err);
            }
            console.log(index);
            (0, _utility.handleError)(err, 'Fetch');
            if (++index > _constants.MAX_RETRY) {
                console.log(url);
                return (0, _utility.handleError)(new _utility.HoError('timeout'), errHandle);
            }
            return new _promise2.default(function (resolve, reject) {
                return setTimeout(function () {
                    return resolve(proc());
                }, index * 1000);
            });
        });
    };
    return proc();
}