'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _getOwnPropertyNames = require('babel-runtime/core-js/object/get-own-property-names');

var _getOwnPropertyNames2 = _interopRequireDefault(_getOwnPropertyNames);

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _assign = require('babel-runtime/core-js/object/assign');

var _assign2 = _interopRequireDefault(_assign);

var _toConsumableArray2 = require('babel-runtime/helpers/toConsumableArray');

var _toConsumableArray3 = _interopRequireDefault(_toConsumableArray2);

var _constants = require('../constants');

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _crypto = require('crypto');

var _utility = require('../util/utility');

var _mongoTool = require('../models/mongo-tool');

var _mongoTool2 = _interopRequireDefault(_mongoTool);

var _tagTool = require('../models/tag-tool');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var router = _express2.default.Router();

router.use(function (req, res, next) {
    (0, _utility.checkLogin)(req, res, next);
});

router.route('/act/:uid?').get(function (req, res, next) {
    console.log('user info');
    !(0, _utility.checkAdmin)(1, req.user) ? (0, _mongoTool2.default)('find', _constants.USERDB, { _id: req.user._id }, { limit: 1 }).then(function (users) {
        return users.length < 1 ? (0, _utility.handleError)(new _utility.HoError('Could not find user!')) : res.json({ user_info: [{
                name: users[0].username,
                id: users[0]._id,
                newable: false,
                auto: users[0].auto ? 'https://drive.google.com/open?id=' + users[0].auto + '&authuser=0' : '',
                kindle: users[0].kindle ? users[0].kindle + '@kindle.com' : '',
                editAuto: false,
                editKindle: true,
                verify: true
            }] });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    }) : (0, _mongoTool2.default)('find', _constants.USERDB).then(function (users) {
        return res.json({ user_info: [{
                name: '',
                perm: '',
                desc: '',
                editAuto: false,
                newable: true,
                editKindle: false,
                id: 0
            }].concat((0, _toConsumableArray3.default)(users.map(function (user) {
                return (0, _assign2.default)({
                    name: user.username,
                    perm: user.perm,
                    desc: user.desc,
                    id: user._id,
                    newable: false,
                    editAuto: true,
                    editKindle: true,
                    kindle: user.kindle ? user.kindle + '@kindle.com' : '',
                    auto: user.auto ? 'https://drive.google.com/open?id=' + user.auto + '&authuser=0' : ''
                }, user.perm === 1 ? {
                    unDay: user.unDay ? user.unDay : _constants.UNACTIVE_DAY,
                    unHit: user.unHit ? user.unHit : _constants.UNACTIVE_HIT,
                    verify: true
                } : {
                    delable: true
                });
            }))) });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
}).put(function (req, res, next) {
    console.log('user edit');
    var userPW = '';
    if (req.body.userPW) {
        userPW = (0, _utility.isValidString)(req.body.userPW, 'passwd');
        if (!userPW) {
            return (0, _utility.handleError)(new _utility.HoError('passwd is not valid'), next);
        }
    }
    if (!(0, _utility.userPWCheck)(req.user, userPW)) {
        return (0, _utility.handleError)(new _utility.HoError('permission denied'), next);
    }
    var ret = {};
    var data = {};
    var needPerm = false;
    if (req.body.auto) {
        if (!(0, _utility.checkAdmin)(1, req.user)) {
            return (0, _utility.handleError)(new _utility.HoError('unknown type in edituser', { code: 403 }), next);
        }
        if (!(0, _utility.isValidString)(req.body.auto, 'url')) {
            return (0, _utility.handleError)(new _utility.HoError('auto is not valid'), next);
        }
        var autoId = req.body.auto.match(/id=([^\&]*)/i);
        if (!autoId || !autoId[1]) {
            return (0, _utility.handleError)(new _utility.HoError('auto is not valid'), next);
        }
        data['auto'] = autoId[1];
        ret['auto'] = 'https://drive.google.com/open?id=' + autoId[1] + '&authuser=0';
        needPerm = true;
    }
    if (req.body.kindle) {
        if (!(0, _utility.isValidString)(req.body.kindle, 'email')) {
            return (0, _utility.handleError)(new _utility.HoError('kindle is not valid'), next);
        }
        var kindleId = req.body.kindle.match(/^([^@]+)@kindle\.com$/i);
        if (!kindleId || !kindleId[1]) {
            return (0, _utility.handleError)(new _utility.HoError('kindle is not valid'), next);
        }

        data['kindle'] = kindleId[1].toLowerCase();
        ret['kindle'] = data['kindle'] + '@kindle.com';
    }
    if (req.body.desc === '' || req.body.desc) {
        if (!(0, _utility.checkAdmin)(1, req.user)) {
            return (0, _utility.handleError)(new _utility.HoError('unknown type in edituser', { code: 403 }), next);
        }
        var desc = (0, _utility.isValidString)(req.body.desc, 'desc');
        if (!desc) {
            return (0, _utility.handleError)(new _utility.HoError('desc is not valid'), next);
        }
        data['desc'] = ret['desc'] = desc;
        needPerm = true;
    }
    if (req.body.perm === '' || req.body.perm) {
        if (!(0, _utility.checkAdmin)(1, req.user)) {
            return (0, _utility.handleError)(new _utility.HoError('unknown type in edituser', { code: 403 }), next);
        }
        if (req.user._id.equals((0, _utility.isValidString)(req.params.uid, 'uid'))) {
            return (0, _utility.handleError)(new _utility.HoError('owner can not edit self perm'), next);
        }
        var perm = (0, _utility.isValidString)(req.body.perm, 'perm');
        if (!perm) {
            return (0, _utility.handleError)(new _utility.HoError('perm is not valid'), next);
        }
        data['perm'] = ret['perm'] = perm;
        needPerm = true;
    }
    if (req.body.unDay && req.body.unDay) {
        if (!(0, _utility.checkAdmin)(1, req.user)) {
            return (0, _utility.handleError)(new _utility.HoError('unknown type in edituser', { code: 403 }), next);
        }
        var unDay = (0, _utility.isValidString)(req.body.unDay, 'int');
        if (!unDay) {
            return (0, _utility.handleError)(new _utility.HoError('unactive day is not valid'), next);
        }
        data['unDay'] = ret['unDay'] = unDay;
        needPerm = true;
    }
    if (req.body.unHit && req.body.unHit) {
        if (!(0, _utility.checkAdmin)(1, req.user)) {
            return (0, _utility.handleError)(new _utility.HoError('unknown type in edituser', { code: 403 }), next);
        }
        var unHit = (0, _utility.isValidString)(req.body.unHit, 'int');
        if (!unHit) {
            return (0, _utility.handleError)(new _utility.HoError('unactive hit is not valid'), next);
        }
        data['unHit'] = ret['unHit'] = unHit;
        needPerm = true;
    }
    if (req.body.newPwd && req.body.conPwd) {
        var newPwd = (0, _utility.isValidString)(req.body.newPwd, 'passwd');
        if (!newPwd) {
            return (0, _utility.handleError)(new _utility.HoError('new passwd is not valid'), next);
        }
        var conPwd = (0, _utility.isValidString)(req.body.conPwd, 'passwd');
        if (!conPwd) {
            return (0, _utility.handleError)(new _utility.HoError('con passwd is not valid'), next);
        }
        if (newPwd !== conPwd) {
            return (0, _utility.handleError)(new _utility.HoError('confirm password must equal!!!'), next);
        }
        data['password'] = (0, _crypto.createHash)('md5').update(newPwd).digest('hex');
    }
    var id = false;
    if ((0, _utility.checkAdmin)(1, req.user)) {
        id = (0, _utility.isValidString)(req.params.uid, 'uid');
        if (!id) {
            return (0, _utility.handleError)(new _utility.HoError('uid is not valid'), next);
        }
    } else {
        if (needPerm) {
            return (0, _utility.handleError)(new _utility.HoError('unknown type in edituser', { code: 403 }), next);
        }
        id = req.user._id;
    }
    if (req.body.name) {
        var _ret = function () {
            var name = (0, _utility.isValidString)(req.body.name, 'name');
            if (name === false || (0, _tagTool.isDefaultTag)((0, _tagTool.normalize)(name))) {
                return {
                    v: (0, _utility.handleError)(new _utility.HoError('name is not valid'), next)
                };
            }
            (0, _mongoTool2.default)('find', _constants.USERDB, { username: name }, {
                username: 1,
                _id: 0
            }, { limit: 1 }).then(function (users) {
                if (users.length > 0) {
                    console.log(users);
                    return (0, _utility.handleError)(new _utility.HoError('already has one!!!'));
                }
                data['username'] = ret['name'] = name;
                if (req.user._id.equals(id)) {
                    ret.owner = name;
                }
                console.log(data);
                return (0, _mongoTool2.default)('update', _constants.USERDB, { _id: id }, { $set: data });
            }).then(function (user) {
                return res.json(ret);
            }).catch(function (err) {
                return (0, _utility.handleError)(err, next);
            });
        }();

        if ((typeof _ret === 'undefined' ? 'undefined' : (0, _typeof3.default)(_ret)) === "object") return _ret.v;
    } else {
        if ((0, _getOwnPropertyNames2.default)(data).length === 0) {
            return (0, _utility.handleError)(new _utility.HoError('nothing to change!!!'), next);
        }
        console.log(data);
        console.log(id);
        (0, _mongoTool2.default)('update', _constants.USERDB, { _id: id }, { $set: data }).then(function (user) {
            return (0, _getOwnPropertyNames2.default)(ret).length === 0 ? res.json({ apiOK: true }) : res.json(ret);
        }).catch(function (err) {
            return (0, _utility.handleError)(err, next);
        });
    }
}).post(function (req, res, next) {
    console.log('add user');
    if (!(0, _utility.checkAdmin)(1, req.user)) {
        return (0, _utility.handleError)(new _utility.HoError('unknown type in edituser', { code: 403 }), next);
    }
    var userPW = '';
    if (req.body.userPW) {
        userPW = (0, _utility.isValidString)(req.body.userPW, 'passwd');
        if (!userPW) {
            return (0, _utility.handleError)(new _utility.HoError('passwd is not valid'), next);
        }
    }
    if (!(0, _utility.userPWCheck)(req.user, userPW)) {
        return (0, _utility.handleError)(new _utility.HoError('permission denied'), next);
    }
    var name = (0, _utility.isValidString)(req.body.name, 'name');
    if (name === false || (0, _tagTool.isDefaultTag)((0, _tagTool.normalize)(name))) {
        return (0, _utility.handleError)(new _utility.HoError('name is not valid'), next);
    }
    (0, _mongoTool2.default)('find', _constants.USERDB, { username: name }, {
        username: 1,
        _id: 0
    }, { limit: 1 }).then(function (users) {
        if (users.length > 0) {
            console.log(users);
            return (0, _utility.handleError)(new _utility.HoError('already has one!!!'));
        }
        var newPwd = (0, _utility.isValidString)(req.body.newPwd, 'passwd');
        if (!newPwd) {
            return (0, _utility.handleError)(new _utility.HoError('new passwd is not valid'));
        }
        var conPwd = (0, _utility.isValidString)(req.body.conPwd, 'passwd');
        if (!conPwd) {
            return (0, _utility.handleError)(new _utility.HoError('con passwd is not valid'));
        }
        if (newPwd !== conPwd) {
            return (0, _utility.handleError)(new _utility.HoError('password must equal!!!'));
        }
        var desc = (0, _utility.isValidString)(req.body.desc, 'desc');
        if (!desc) {
            return (0, _utility.handleError)(new _utility.HoError('desc is not valid'));
        }
        var perm = (0, _utility.isValidString)(req.body.perm, 'perm');
        if (!perm) {
            return (0, _utility.handleError)(new _utility.HoError('perm is not valid'));
        }
        return (0, _mongoTool2.default)('insert', _constants.USERDB, {
            username: name,
            desc: desc,
            perm: perm,
            password: (0, _crypto.createHash)('md5').update(newPwd).digest('hex')
        });
    }).then(function (user) {
        return res.json((0, _assign2.default)({
            name: user[0].username,
            perm: user[0].perm,
            desc: user[0].desc,
            id: user[0]._id,
            newable: false,
            auto: '',
            editAuto: true,
            kindle: '',
            editKindle: true
        }, user[0].perm === 1 ? {
            unDay: user[0].unDay ? user[0].unDay : _constants.UNACTIVE_DAY,
            unHit: user[0].unHit ? user[0].unHit : _constants.UNACTIVE_HIT
        } : { delable: true }));
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.put('/del/:uid', function (req, res, next) {
    console.log('deluser');
    if (!(0, _utility.checkAdmin)(1, req.user)) {
        return (0, _utility.handleError)(new _utility.HoError('unknown type in edituser', { code: 403 }), next);
    }
    var userPW = '';
    if (req.body.userPW) {
        userPW = (0, _utility.isValidString)(req.body.userPW, 'passwd');
        if (!userPW) {
            return (0, _utility.handleError)(new _utility.HoError('passwd is not valid'), next);
        }
    }
    if (!(0, _utility.userPWCheck)(req.user, userPW)) {
        return (0, _utility.handleError)(new _utility.HoError('permission denied'), next);
    }
    var id = (0, _utility.isValidString)(req.params.uid, 'uid');
    if (!id) {
        return (0, _utility.handleError)(new _utility.HoError('uid is not valid'), next);
    }
    (0, _mongoTool2.default)('find', _constants.USERDB, { _id: id }, { limit: 1 }).then(function (users) {
        if (users.length < 1) {
            return (0, _utility.handleError)(new _utility.HoError('user does not exist!!!'));
        }
        if ((0, _utility.checkAdmin)(1, users[0])) {
            return (0, _utility.handleError)(new _utility.HoError('owner cannot be deleted!!!'));
        }
        return (0, _mongoTool2.default)('remove', _constants.USERDB, {
            _id: id,
            $isolated: 1
        });
    }).then(function (user) {
        return res.json({ apiOK: true });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

router.get('/verify', function (req, res, next) {
    console.log('verify code');
    (0, _mongoTool2.default)('remove', _constants.VERIFYDB, {
        utime: { $lt: Math.round(new Date().getTime() / 1000) - 185 },
        $isolated: 1
    }).then(function (item) {
        return (0, _mongoTool2.default)('find', _constants.VERIFYDB, { uid: req.user._id }, { limit: 1 }).then(function (item) {
            return item.length > 0 ? res.json({ verify: item[0].verify }) : (0, _mongoTool2.default)('insert', _constants.VERIFYDB, {
                verify: (0, _utility.completeZero)(Math.floor(Math.random() * 10000), 4),
                uid: req.user._id,
                utime: Math.round(new Date().getTime() / 1000)
            }).then(function (item) {
                console.log(item);
                res.json({ verify: item[0].verify });
            });
        });
    }).catch(function (err) {
        return (0, _utility.handleError)(err, next);
    });
});

exports.default = router;