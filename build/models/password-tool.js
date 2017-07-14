'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _set = require('babel-runtime/core-js/set');

var _set2 = _interopRequireDefault(_set);

var _ver = require('../ver');

var _constants = require('../constants');

var _tagTool = require('../models/tag-tool');

var _tagTool2 = _interopRequireDefault(_tagTool);

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

var _utility = require('../util/utility');

var _crypto = require('crypto');

var _passwordGenerator = require('password-generator');

var _passwordGenerator2 = _interopRequireDefault(_passwordGenerator);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var PasswordTagTool = (0, _tagTool2.default)(_constants.PASSWORDDB);

exports.default = {
    newRow: function newRow(data, user) {
        if (!data['username'] || !data['password'] || !data['conpassword'] || !data['name']) {
            (0, _utility.handleError)(new _utility.HoError('parameter lost!!!'));
        }
        var name = (0, _utility.isValidString)(data['name'], 'name', 'name not vaild!!!');
        var username = (0, _utility.isValidString)(data['username'], 'name', 'username not vaild!!!');
        var password = (0, _utility.isValidString)(data['password'], 'altpwd', 'password not vaild!!!');
        var conpassword = (0, _utility.isValidString)(data['conpassword'], 'altpwd', 'password not vaild!!!');
        if (password !== conpassword) {
            (0, _utility.handleError)(new _utility.HoError('password not equal!!!'));
        }
        var url = data['url'] ? (0, _utility.isValidString)(data['url'], 'url', 'url not vaild!!!') : '';
        var email = data['email'] ? (0, _utility.isValidString)(data['email'], 'email', 'email not vaild!!!') : '';
        var crypted_password = encrypt(password);
        var important = data['important'] ? 1 : 0;
        if (important !== 0) {
            if (!(0, _utility.userPWCheck)(user, data['userPW'] ? (0, _utility.isValidString)(data['userPW'], 'passwd', 'passwd is not valid') : '')) {
                (0, _utility.handleError)(new _utility.HoError('permission denied'));
            }
        }
        var setTag = new _set2.default();
        setTag.add((0, _tagTool.normalize)(name)).add((0, _tagTool.normalize)(username));
        if (email) {
            setTag.add((0, _tagTool.normalize)(email));
        }
        if (url) {
            setTag.add((0, _tagTool.normalize)(url));
        }
        var setArr = [];
        setTag.forEach(function (s) {
            if (!(0, _tagTool.isDefaultTag)(s)) {
                setArr.push(s);
            }
        });
        return (0, _mongoTool2.default)('insert', _constants.PASSWORDDB, {
            _id: (0, _mongoTool.objectID)(),
            name: name,
            username: username,
            password: crypted_password,
            prePassword: crypted_password,
            owner: user._id,
            utime: Math.round(new Date().getTime() / 1000),
            url: url,
            email: email,
            tags: setArr,
            important: important
        }).then(function (item) {
            console.log(item);
            console.log('save end');
            return { id: item[0]._id };
        });
    },
    editRow: function editRow(uid, data, user, session) {
        var password = data['password'] ? (0, _utility.isValidString)(data['password'], 'altpwd', 'password not vaild!!!') : '';
        var conpassword = data['password'] ? (0, _utility.isValidString)(data['conpassword'], 'altpwd', 'password not vaild!!!') : '';
        if (password !== conpassword) {
            (0, _utility.handleError)(new _utility.HoError('password not equal!!!'));
        }
        var name = data['name'] ? (0, _utility.isValidString)(data['name'], 'name', 'name not vaild!!!') : '';
        var username = data['username'] ? (0, _utility.isValidString)(data['username'], 'name', 'username not vaild!!!') : '';
        var url = data['url'] ? (0, _utility.isValidString)(data['url'], 'url', 'url not vaild!!!') : '';
        var email = data['email'] ? (0, _utility.isValidString)(data['email'], 'email', 'email not vaild!!!') : '';
        return (0, _mongoTool2.default)('find', _constants.PASSWORDDB, {
            _id: (0, _utility.isValidString)(uid, 'uid', 'uid is not vaild'),
            owner: user._id
        }, { limit: 1 }).then(function (pws) {
            if (pws.length < 1) {
                (0, _utility.handleError)(new _utility.HoError('password row does not exist!!!'));
            }
            var update_data = (0, _assign2.default)(data.hasOwnProperty('important') ? { important: data['important'] ? 1 : 0 } : {});
            if (pws[0].important !== 0 || data.hasOwnProperty('important') && pws[0].important !== update_data['important']) {
                if (!(0, _utility.userPWCheck)(user, data['userPW'] ? (0, _utility.isValidString)(data['userPW'], 'passwd', 'passwd is not valid') : '')) {
                    (0, _utility.handleError)(new _utility.HoError('permission denied'));
                }
            }
            var setTag = new _set2.default(pws[0].tags);
            if (name) {
                setTag.add((0, _tagTool.normalize)(name));
                update_data['name'] = name;
            }
            if (username) {
                setTag.add((0, _tagTool.normalize)(username));
                update_data['username'] = username;
            }
            if (email) {
                setTag.add((0, _tagTool.normalize)(email));
                update_data['email'] = email;
            }
            if (url) {
                setTag.add((0, _tagTool.normalize)(url));
                update_data['url'] = url;
            }
            var setArr = [];
            setTag.forEach(function (s) {
                if (!(0, _tagTool.isDefaultTag)(s)) {
                    setArr.push(s);
                }
            });
            update_data = (0, _assign2.default)(update_data, { tags: setArr }, password ? {
                password: encrypt(password),
                prePassword: pws[0].password,
                utime: Math.round(new Date().getTime() / 1000)
            } : {});
            console.log(update_data);
            PasswordTagTool.setLatest(pws[0]._id, session).catch(function (err) {
                return (0, _utility.handleError)(err, 'Set latest');
            });
            return (0, _mongoTool2.default)('update', _constants.PASSWORDDB, {
                _id: pws[0]._id,
                owner: user._id
            }, { $set: update_data });
        });
    },
    delRow: function delRow(uid, userPW, user) {
        return (0, _mongoTool2.default)('find', _constants.PASSWORDDB, {
            _id: (0, _utility.isValidString)(uid, 'uid', 'uid is not vaild'),
            owner: user._id
        }, { limit: 1 }).then(function (pws) {
            if (pws.length < 1) {
                (0, _utility.handleError)(new _utility.HoError('password row does not exist!!!'));
            }
            if (pws[0].important !== 0) {
                if (!(0, _utility.userPWCheck)(user, userPW ? (0, _utility.isValidString)(userPW, 'passwd', 'passwd is not valid') : '')) {
                    (0, _utility.handleError)(new _utility.HoError('permission denied'));
                }
            }
            return (0, _mongoTool2.default)('remove', _constants.PASSWORDDB, {
                _id: pws[0]._id,
                owner: user._id,
                $isolated: 1
            });
        });
    },
    getPassword: function getPassword(uid, userPW, user, session) {
        var type = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : null;

        var id = (0, _utility.isValidString)(uid, 'uid', 'uid is not vaild');
        return (0, _mongoTool2.default)('find', _constants.PASSWORDDB, { _id: (0, _utility.isValidString)(uid, 'uid', 'uid is not vaild'), owner: user._id }, (0, _assign2.default)({
            _id: 0,
            important: 1
        }, type === 'pre' ? { prePassword: 1 } : { password: 1 }), { limit: 1 }).then(function (items) {
            if (items.length < 1) {
                (0, _utility.handleError)(new _utility.HoError('can not find password object!!!'));
            }
            if (items[0].important !== 0) {
                if (!(0, _utility.userPWCheck)(user, userPW ? (0, _utility.isValidString)(userPW, 'passwd', 'passwd is not valid') : '')) {
                    (0, _utility.handleError)(new _utility.HoError('permission denied'));
                }
            }
            PasswordTagTool.setLatest(id, session).catch(function (err) {
                return (0, _utility.handleError)(err, 'Set latest');
            });
            return { password: type === 'pre' ? decrypt(items[0].prePassword) : decrypt(items[0].password) };
        });
    },
    generatePW: function generatePW(type) {
        return type === 3 ? (0, _passwordGenerator2.default)(12, false, /[0-9]/) : type === 2 ? (0, _passwordGenerator2.default)(12, false, /[0-9a-zA-Z]/) : (0, _passwordGenerator2.default)(12, false, /[0-9a-zA-Z!@#$%]/);
    }
};


function encrypt(text) {
    var cipher = (0, _crypto.createCipher)(_constants.ALGORITHM, _ver.PASSWORD_PRIVATE_KEY);
    var crypted = cipher.update('' + text + _ver.PASSWORD_SALT, 'utf8', 'hex');
    crypted += cipher.final('hex');
    return crypted;
}

function decrypt(text) {
    var decipher = (0, _crypto.createDecipher)(_constants.ALGORITHM, _ver.PASSWORD_PRIVATE_KEY);
    var dec = decipher.update(text, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec.substr(0, dec.length - 4);
}