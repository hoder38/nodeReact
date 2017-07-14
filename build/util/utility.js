'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.addPre = exports.findTag = exports.completeZero = exports.sortList = exports.torrent2Magnet = exports.getJson = exports.SRT2VTT = exports.deleteFolderRecursive = exports.getFileLocation = exports.getStockItem = exports.getPasswordItem = exports.getStorageItem = exports.big5Encode = exports.checkAdmin = undefined;

var _promise = require('babel-runtime/core-js/promise');

var _promise2 = _interopRequireDefault(_promise);

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _slicedToArray2 = require('babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _entries = require('babel-runtime/core-js/object/entries');

var _entries2 = _interopRequireDefault(_entries);

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _create = require('babel-runtime/core-js/object/create');

var _create2 = _interopRequireDefault(_create);

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

exports.isValidString = isValidString;
exports.toValidName = toValidName;
exports.userPWCheck = userPWCheck;
exports.HoError = HoError;
exports.handleError = handleError;
exports.showLog = showLog;
exports.checkLogin = checkLogin;
exports.selectRandom = selectRandom;

var _constants = require('../constants');

var _ver = require('../../../ver');

var _config = require('../config');

var _mongoTool = require('../models/mongo-tool');

var _mobileDetect = require('mobile-detect');

var _mobileDetect2 = _interopRequireDefault(_mobileDetect);

var _crypto = require('crypto');

var _iconvLite = require('iconv-lite');

var _path = require('path');

var _fs = require('fs');

var _nodeIcuCharsetDetector = require('node-icu-charset-detector');

var _assToVtt = require('ass-to-vtt');

var _assToVtt2 = _interopRequireDefault(_assToVtt);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var pwCheck = {};

function isValidString(str, type) {
    var msg = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;
    var code = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 400;

    if (typeof str === 'string' || typeof str === 'number') {
        typeof str === 'string' ? str = new Buffer(str, 'utf-8').toString() : str.toString();
        switch (type) {
            case 'name':
                var trim = str.trim();
                //改為 \ / : ? < > * " |  允許 ' ` &
                if (trim !== '.' && trim !== '..') {
                    if (trim.match(/^[^&\\\/\|\*\?"<>:]{1,255}$/)) {
                        if (trim.replace(/[\s　]+/g, '') !== '') {
                            return trim;
                        }
                    }
                }
                break;
            case 'desc':
                //不合法字元: \ / | * ? ' " < > ` : &
                if (str.search(/^[^\\\/\|\*\?\'"<>`:&]{0,250}$/) !== -1) {
                    return str;
                }
                break;
            case 'perm':
                if ((Number(str) || Number(str) === 0) && Number(str) < 32 && Number(str) >= 0) {
                    return Number(str);
                }
                break;
            case 'parentIndex':
                if (Number(str) && Number(str) <= 10 && Number(str) > 0) {
                    return Number(str);
                }
                break;
            case 'int':
                if (Number(str) && Number(str) > 0) {
                    return Number(str);
                }
                break;
            case 'passwd':
                if (str.match(/^[0-9a-zA-Z!@#$%]{6,20}$/)) {
                    return str;
                }
                break;
            case 'altpwd':
                if (str.match(/^[0-9a-zA-Z\._!@#$%;\u4e00-\u9fa5]{2,30}$/)) {
                    return str;
                }
                break;
            case 'url':
                if (str.match(_constants.RE_WEBURL) || str.match(/^magnet:(\?xt=urn:btih:[a-z0-9]{20,50}|stop)/i)) {
                    return encodeURIComponent(str);
                }
                break;
            case 'uid':
                if (str.match(/^[0-9a-f]{24}$/)) {
                    return (0, _mongoTool.objectID)(str);
                }
                break;
            case 'email':
                if (str.match(/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,6})+$/)) {
                    return str;
                }
                break;
        }
    } else if (type === 'uid' && (typeof str === 'undefined' ? 'undefined' : (0, _typeof3.default)(str)) === 'object') {
        str = str.toString();
        if (str.match(/^[0-9a-f]{24}$/)) {
            return (0, _mongoTool.objectID)(str);
        }
    }
    console.log('invalid string ' + type + ' ' + str);
    if (msg) {
        handleError(new HoError(msg, { code: code }));
    }
    return false;
}

function toValidName(str) {
    str = new Buffer(str, 'utf-8').toString().replace(/&#\d+;/g, ' ').trim();
    if (str.replace(/[\s　]+/g, '') === '') {
        str = 'empty';
    }
    return str.replace(/[\\\/\|\*\?"<>:]+/g, ',').slice(0, 255);
}

function userPWCheck(user, pw) {
    if (user.password === (0, _crypto.createHash)('md5').update(pw).digest('hex')) {
        pwCheck[user._id] = 1;
        setTimeout(function () {
            return pwCheck[user._id] = 0;
        }, 70000);
        return true;
    } else if (pwCheck[user._id] === 1) {
        return true;
    } else {
        return false;
    }
}

var checkAdmin = exports.checkAdmin = function checkAdmin(perm, user) {
    return user.perm > 0 && user.perm <= perm ? true : false;
};

//errorhandle
function HoError(message) {
    var _ref = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {},
        _ref$code = _ref.code,
        code = _ref$code === undefined ? 400 : _ref$code;

    this.name = 'HoError';
    this.message = message || 'Hoder Message';
    this.code = code;
    this.stack = new Error().stack;
}

HoError.prototype = (0, _create2.default)(Error.prototype);
HoError.prototype.constructor = HoError;

function showError(err, type) {
    console.log(type + ' error: ' + err.name + ' ' + err.message);
    if (err.code !== undefined) {
        console.log(err.code);
    }
    if (err.stack) {
        console.log(err.stack);
    }
}

function handleError(err) {
    var type = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

    if (err) {
        if (type) {
            if (typeof type === 'function') {
                showError(err, 'Delay');
                console.log(type);

                for (var _len = arguments.length, args = Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) {
                    args[_key - 2] = arguments[_key];
                }

                return type.apply(undefined, [err].concat(args));
            } else if (typeof type === 'string') {
                showError(err, type);
            } else {
                console.log(type);
                showError(err, 'Unknown type');
            }
        } else {
            showError(err, 'Delay');
            throw err;
        }
    }
}

//middleware
function showLog(req, next) {
    console.log(new Date().toLocaleString());
    console.log(req.url);
    for (var i in req.body) {
        if (i !== 'password' && i !== 'newPwd' && i !== 'conPwd' && i !== 'userPW') {
            console.log(i + ': ' + req.body[i]);
        }
    }
    next();
}

function checkLogin(req, res, next) {
    var type = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 0;

    if (!req.isAuthenticated()) {
        if (type) {
            if (new _mobileDetect2.default(req.headers['user-agent']).mobile() || req.headers['user-agent'].match(/Firefox/i) || req.headers['user-agent'].match(/armv7l/i)) {
                if (/^\/video\//.test(req.path) || /^\/subtitle\//.test(req.path) || /^\/torrent\//.test(req.path)) {
                    console.log("mobile or firefox");
                    next();
                } else {
                    handleError(new HoError('auth fail!!!', { code: 401 }));
                }
            } else {
                handleError(new HoError('auth fail!!!', { code: 401 }));
            }
        } else {
            handleError(new HoError('auth fail!!!', { code: 401 }));
        }
    } else {
        console.log(req.user._id);
        next();
    }
}

var big5Encode = exports.big5Encode = function big5Encode(str) {
    var rtn = '';
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
        for (var _iterator = (0, _getIterator3.default)(str), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var j = _step.value;

            if (j.match(/^[\x00-\x7F]$/)) {
                rtn += encodeURIComponent(j);
            } else {
                var buf = (0, _iconvLite.encode)(j, 'big5');
                for (var i = 0; i < buf.length; i += 2) {
                    rtn += '%' + buf[i].toString(16).toUpperCase();
                    rtn += buf[i + 1] >= 65 && buf[i + 1] <= 90 || buf[i + 1] >= 97 && buf[i + 1] <= 122 ? String.fromCharCode(buf[i + 1]) : '%' + buf[i + 1].toString(16).toUpperCase();
                }
            }
        }
    } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
    } finally {
        try {
            if (!_iteratorNormalCompletion && _iterator.return) {
                _iterator.return();
            }
        } finally {
            if (_didIteratorError) {
                throw _iteratorError;
            }
        }
    }

    return rtn;
};

function selectRandom(count_arr) {
    var select_arr = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;

    var accm_list = [];
    if (!Array.isArray(count_arr)) {
        var l = count_arr;
        count_arr = [];
        for (var i = 0; i < l; i++) {
            count_arr.push(1);
        }
    }
    select_arr ? select_arr.forEach(function (s, i) {
        return i < 1 ? accm_list.push(count_arr[s]) : accm_list.push(accm_list[i - 1] + count_arr[s]);
    }) : count_arr.forEach(function (c, i) {
        return i < 1 ? accm_list.push(c) : accm_list.push(accm_list[i - 1] + c);
    });
    var rand = Math.random() * accm_list[accm_list.length - 1];
    console.log(rand);
    for (var _i in accm_list) {
        if (accm_list[_i] >= rand) {
            return select_arr ? select_arr[Number(_i)] : Number(_i);
        }
    }
}

var getStorageItem = exports.getStorageItem = function getStorageItem(user, items, mediaHandle) {
    return items.map(function (item) {
        if (item.adultonly === 1) {
            item.tags.push('18+');
        }
        if (item.first === 1) {
            item.tags.push('first item');
        }
        var media = {};
        if (mediaHandle === 1 && !item.mediaType.type) {
            media = { media: {
                    type: '',
                    key: '',
                    err: '',
                    timeout: '',
                    complete: ''
                } };
            (0, _entries2.default)(item.mediaType).forEach(function (_ref2) {
                var _ref3 = (0, _slicedToArray3.default)(_ref2, 2),
                    i = _ref3[0],
                    v = _ref3[1];

                media['media']['type'] = '' + media['media']['type'] + i + '.' + v.type + ' ';
                if (v.key) {
                    media['media']['key'] = '' + media['media']['key'] + i + '.' + v.key + ' ';
                }
                if (v.err) {
                    media['media']['err'] = '' + media['media']['err'] + i + '.' + v.err + ' ';
                }
                if (v.timeout) {
                    media['media']['timeout'] = '' + media['media']['timeout'] + i + '.' + v.timeout + ' ';
                }
                if (v.complete) {
                    media['media']['complete'] = '' + media['media']['complete'] + i + '.' + v.complete + ' ';
                }
            });
        }
        return (0, _assign2.default)({
            name: item.name,
            id: item._id,
            tags: item.tags,
            recycle: item.recycle,
            isOwn: checkAdmin(1, user) ? true : isValidString(item.owner, 'uid') && user._id.equals(item.owner) ? true : false,
            status: item.status === 5 || item.status === 6 || item.status === 10 ? 2 : item.status,
            utime: item.utime,
            count: item.count
        }, mediaHandle === 1 ? { media: item.mediaType } : {}, media, item.present ? { present: item.present } : {}, item.url ? { url: item.url } : {}, item.thumb ? { thumb: item.thumb } : {}, item.cid ? { cid: item.cid } : {}, item.ctitle ? { ctitle: item.ctitle } : {}, item.status === 6 ? { doc: 1 } : {}, item.status === 5 ? { doc: 2 } : {}, item.status === 10 ? { doc: 3 } : {});
    });
};

var getPasswordItem = exports.getPasswordItem = function getPasswordItem(user, items) {
    return items.map(function (item) {
        if (item.important === 1) {
            item.tags.push('important');
        }
        return (0, _assign2.default)({
            name: item.name,
            id: item._id,
            tags: item.tags,
            username: item.username,
            url: item.url,
            email: item.email,
            utime: item.utime
        }, item.important === 1 ? { important: true } : { important: false });
    });
};

var getStockItem = exports.getStockItem = function getStockItem(user, items) {
    return checkAdmin(1, user) ? items.map(function (item) {
        if (item.important === 1) {
            item.tags.push('important');
        }
        return {
            name: item.name,
            id: item._id,
            tags: item.tags,
            profit: item.profitIndex,
            safety: item.safetyIndex,
            management: item.managementIndex,
            index: item.index,
            type: item.type
        };
    }) : [];
};

var getFileLocation = exports.getFileLocation = function getFileLocation(owner, uid) {
    var owner_S = owner.toString();
    var owner_md5 = (0, _crypto.createHash)('md5').update(owner_S).digest('hex');
    var uid_S = uid.toString();
    var uid_md5 = (0, _crypto.createHash)('md5').update(uid_S).digest('hex');
    return (0, _path.join)((0, _config.NAS_PREFIX)(_ver.ENV_TYPE), owner_md5.substr(0, 2), owner_S, uid_md5.substr(0, 2), uid_S);
};

var deleteFolderRecursive = exports.deleteFolderRecursive = function deleteFolderRecursive(path) {
    if ((0, _fs.existsSync)(path)) {
        (0, _fs.readdirSync)(path).forEach(function (file) {
            var curPath = path + '/' + file;
            (0, _fs.lstatSync)(curPath).isDirectory() ? deleteFolderRecursive(curPath) : (0, _fs.unlinkSync)(curPath);
        });
        (0, _fs.rmdirSync)(path);
    }
};

var SRT2VTT = exports.SRT2VTT = function SRT2VTT(filePath, ext) {
    return new _promise2.default(function (resolve, reject) {
        return (0, _fs.readFile)(filePath + '.' + ext, function (err, data) {
            return err ? reject(err) : resolve(data);
        });
    }).then(function (data) {
        return ext === 'srt' ? new _promise2.default(function (resolve, reject) {
            return (0, _fs.writeFile)(filePath + '.vtt', 'WEBVTT\n\n' + bufferToString(data).replace(/,/g, '.'), 'utf8', function (err) {
                return err ? reject(err) : resolve();
            });
        }) : new _promise2.default(function (resolve, reject) {
            return (0, _fs.writeFile)(filePath + '.sub', bufferToString(data), 'utf8', function (err) {
                return err ? reject(err) : resolve();
            });
        }).then(function () {
            return new _promise2.default(function (resolve, reject) {
                var subfs = (0, _fs.createReadStream)(filePath + '.sub');
                subfs.pipe((0, _assToVtt2.default)()).pipe((0, _fs.createWriteStream)(filePath + '.vtt'));
                subfs.on('end', function () {
                    return resolve();
                });
            });
        }).then(function () {
            return (0, _fs.unlinkSync)(filePath + '.sub');
        });
    });
};

var bufferToString = function bufferToString(buffer) {
    var charset = (0, _nodeIcuCharsetDetector.detectCharset)(buffer).toString();
    try {
        return buffer.toString(charset);
    } catch (x) {
        return (0, _iconvLite.decode)(buffer, charset);
    }
};

var getJson = exports.getJson = function getJson(raw_data) {
    var json_data = null;
    try {
        json_data = JSON.parse(raw_data);
    } catch (x) {
        console.log(raw_data);
        handleError(new HoError('json parse error'));
    }
    return json_data;
};

var torrent2Magnet = exports.torrent2Magnet = function torrent2Magnet(torInfo) {
    if (!torInfo.infoHash) {
        console.log('miss infoHash');
        return false;
    }
    var magnet = 'magnet:?xt=urn:btih:' + torInfo.infoHash + '&dn=';
    if (torInfo.announceList) {
        for (var i = 0; i < 10; i++) {
            magnet = magnet + '&tr=' + encodeURIComponent(torInfo.announceList[i]);
        }
    } else if (torInfo.announce) {
        for (var _i2 = 0; _i2 < 10; _i2++) {
            magnet = magnet + '&tr=' + encodeURIComponent(torInfo.announce[_i2]);
        }
    }
    return magnet;
};

var sortList = exports.sortList = function sortList(list) {
    var current = '';
    var current_list = [];
    var sort_list = [];
    var sortFile = function sortFile(current_list) {
        return sort_list.concat(current_list.sort(function (a, b) {
            if (!a.number) {
                return -1;
            }
            for (var i in a.number) {
                if (!b.number || !b.number[i]) {
                    return 1;
                }
                if (Number(a.number[i]) !== Number(b.number[i])) {
                    return Number(a.number[i]) - Number(b.number[i]);
                }
            }
            return -1;
        }).map(function (l) {
            return l.name;
        }));
    };
    list.forEach(function (l) {
        var split = l.match(/^(.*?)([^\/]+)$/);
        if (split[1] === current) {
            current_list.push({
                name: l,
                number: split[2].match(/\d+/g)
            });
        } else {
            //只比較前面數字
            sort_list = sortFile(current_list);
            current = split[1];
            current_list = [{
                name: l,
                number: split[2].match(/\d+/g)
            }];
        }
    });
    sort_list = sortFile(current_list);
    console.log(sort_list);
    return sort_list;
};

var completeZero = exports.completeZero = function completeZero(number, offset) {
    for (var i = 1; i < offset; i++) {
        if (number < Math.pow(10, i)) {
            for (var j = i; j < offset; j++) {
                number = '0' + number;
            }
            break;
        }
    }
    return number;
};

var findTag = exports.findTag = function findTag(node) {
    var tag = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
    var id = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;

    var ret = [];
    var item = node.children ? node.children : node;
    if (!Array.isArray(item)) {
        return ret;
    }
    var _iteratorNormalCompletion2 = true;
    var _didIteratorError2 = false;
    var _iteratorError2 = undefined;

    try {
        for (var _iterator2 = (0, _getIterator3.default)(item), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
            var c = _step2.value;

            if (tag) {
                if ((c.type === 'tag' || c.type === 'script') && c.name === tag) {
                    if (id) {
                        if (c.attribs && (c.attribs.class === id || c.attribs.id === id)) {
                            ret.push(c);
                        }
                    } else {
                        ret.push(c);
                    }
                }
            } else {
                if (c.type === 'text') {
                    var str = c.data.toString().trim();
                    if (str) {
                        ret.push(str);
                    }
                }
                if (c.type === 'comment') {
                    var _str = c.data.toString().match(/^\[CDATA\[(.*)\]\]$/)[1].trim();
                    if (_str) {
                        ret.push(_str);
                    }
                }
            }
        }
    } catch (err) {
        _didIteratorError2 = true;
        _iteratorError2 = err;
    } finally {
        try {
            if (!_iteratorNormalCompletion2 && _iterator2.return) {
                _iterator2.return();
            }
        } finally {
            if (_didIteratorError2) {
                throw _iteratorError2;
            }
        }
    }

    return ret;
};

var addPre = exports.addPre = function addPre(url, pre) {
    return url.match(/^(https|http):\/\//) ? url : url.match(/^\//) ? '' + pre + url : pre + '/' + url;
};