import { USERDB, UNACTIVE_DAY, UNACTIVE_HIT, VERIFYDB } from '../constants.js'
import Express from 'express'
import crypto from 'crypto'
const { createHash } = crypto;
import { checkAdmin, checkLogin, HoError, handleError, isValidString, userPWCheck, completeZero } from '../util/utility.js'
import Mongo from '../models/mongo-tool.js'
import { isDefaultTag, normalize } from '../models/tag-tool.js'

const router = Express.Router()

router.use(function(req, res, next) {
    checkLogin(req, res, next)
})

router.route('/act/:uid?').get(function(req, res, next) {
    console.log('user info');
    !checkAdmin(1, req.user) ? Mongo('find', USERDB, {_id: req.user._id}, {limit: 1}).then(users => users.length < 1 ? handleError(new HoError('Could not find user!')) : res.json({user_info: [{
        name: users[0].username,
        id: users[0]._id,
        newable: false,
        auto: users[0].auto ? `https://drive.google.com/drive/folders/${users[0].auto}` : '',
        kindle: users[0].kindle ? `${users[0].kindle}@kindle.com` : '',
        editAuto: false,
        editKindle: true,
        verify: true,
    }]})).catch(err => handleError(err, next)) : Mongo('find', USERDB).then(users => res.json({user_info: [{
        name: '',
        perm: '',
        desc: '',
        editAuto: false,
        newable: true,
        editKindle: false,
        id: 0,
    }, ...users.map(user => Object.assign({
        name: user.username,
        perm: user.perm,
        desc: user.desc,
        id: user._id,
        newable: false,
        editAuto: true,
        editKindle: true,
        kindle: user.kindle ? `${user.kindle}@kindle.com` : '',
        auto: user.auto ? `https://drive.google.com/drive/folders/${user.auto}` : '',
    }, user.perm === 1 ? {
        unDay: user.unDay ? user.unDay : UNACTIVE_DAY,
        unHit: user.unHit ? user.unHit : UNACTIVE_HIT,
        verify: true,
    } : {
        delable: true,
    }))]})).catch(err => handleError(err, next))
}).put(function(req, res, next) {
    console.log('user edit');
    let userPW = '';
    if (req.body.userPW) {
        userPW = isValidString(req.body.userPW, 'passwd');
        if (!userPW) {
            return handleError(new HoError('passwd is not valid'), next);
        }
    }
    if (!userPWCheck(req.user, userPW)) {
        return handleError(new HoError('permission denied'), next);
    }
    let ret = {}
    let data = {}
    let needPerm = false
    if (req.body.auto) {
        if (!checkAdmin(1, req.user)) {
            return handleError(new HoError('unknown type in edituser', {code: 403}), next);
        }
        if (!isValidString(req.body.auto, 'url')) {
            return handleError(new HoError('auto is not valid'), next);
        }
        const autoId = req.body.auto.match(/\/folders\/([^\?]*)/i);
        if (!autoId || !autoId[1]) {
            return handleError(new HoError('auto is not valid'), next);
        }
        data['auto'] = autoId[1];
        ret['auto'] = `https://drive.google.com/drive/folders/${autoId[1]}`;
        needPerm = true;
    }
    if (req.body.kindle) {
        if (!isValidString(req.body.kindle, 'email')) {
            return handleError(new HoError('kindle is not valid'), next);
        }
        const kindleId = req.body.kindle.match(/^([^@]+)@kindle\.com$/i);
        if (!kindleId || !kindleId[1]) {
            return handleError(new HoError('kindle is not valid'), next);
        }

        data['kindle'] = kindleId[1].toLowerCase();
        ret['kindle'] = `${data['kindle']}@kindle.com`;
    }
    if (req.body.desc === '' || req.body.desc) {
        if (!checkAdmin(1, req.user)) {
            return handleError(new HoError('unknown type in edituser', {code: 403}), next);
        }
        const desc = isValidString(req.body.desc, 'desc');
        if (!desc) {
            return handleError(new HoError('desc is not valid'), next);
        }
        data['desc'] = ret['desc'] = desc;
        needPerm = true
    }
    if (req.body.perm === '' || req.body.perm) {
        if (!checkAdmin(1, req.user)) {
            return handleError(new HoError('unknown type in edituser', {code: 403}), next);
        }
        if (req.user._id.equals(isValidString(req.params.uid, 'uid'))) {
            return handleError(new HoError('owner can not edit self perm'), next);
        }
        const perm = isValidString(req.body.perm, 'perm');
        if (!perm) {
            return handleError(new HoError('perm is not valid'), next);
        }
        data['perm'] = ret['perm'] = perm;
        needPerm = true
    }
    if (req.body.unDay && req.body.unDay) {
        if (!checkAdmin(1, req.user)) {
            return handleError(new HoError('unknown type in edituser', {code: 403}), next);
        }
        const unDay = isValidString(req.body.unDay, 'int');
        if (!unDay) {
            return handleError(new HoError('unactive day is not valid'), next);
        }
        data['unDay'] = ret['unDay'] = unDay;
        needPerm = true
    }
    if (req.body.unHit && req.body.unHit) {
        if (!checkAdmin(1, req.user)) {
            return handleError(new HoError('unknown type in edituser', {code: 403}), next);
        }
        const unHit = isValidString(req.body.unHit, 'int');
        if (!unHit) {
            return handleError(new HoError('unactive hit is not valid'), next);
        }
        data['unHit'] = ret['unHit'] = unHit;
        needPerm = true
    }
    if (req.body.newPwd && req.body.conPwd) {
        const newPwd = isValidString(req.body.newPwd, 'passwd');
        if (!newPwd) {
            return handleError(new HoError('new passwd is not valid'), next);
        }
        const conPwd = isValidString(req.body.conPwd, 'passwd');
        if (!conPwd) {
            return handleError(new HoError('con passwd is not valid'), next);
        }
        if (newPwd !== conPwd) {
            return handleError(new HoError('confirm password must equal!!!'), next);
        }
        data['password'] = createHash('md5').update(newPwd).digest('hex')
    }
    let id = false;
    if (checkAdmin(1, req.user)) {
        id = isValidString(req.params.uid, 'uid');
        if (!id) {
            return handleError(new HoError('uid is not valid'), next);
        }
    } else {
        if (needPerm) {
            return handleError(new HoError('unknown type in edituser', {code: 403}), next);
        }
        id = req.user._id;
    }
    if (req.body.name) {
        const name = isValidString(req.body.name, 'name')
        if (name === false || isDefaultTag(normalize(name))) {
            return handleError(new HoError('name is not valid'), next);
        }
        Mongo('find', USERDB, {username: name}, {
            projection: {
                username: 1,
                _id: 0,
            },
            limit: 1,
        }).then(users => {
            if (users.length > 0) {
                console.log(users);
                return handleError(new HoError('already has one!!!'))
            }
            data['username'] = ret['name'] = name
            if (req.user._id.equals(id)) {
                ret.owner = name
            }
            console.log(data);
            return Mongo('update', USERDB, {_id: id}, {$set: data})
        }).then(user => res.json(ret)).catch(err => handleError(err, next))
    } else {
        if (Object.getOwnPropertyNames(data).length === 0) {
            return handleError(new HoError('nothing to change!!!'), next);
        }
        console.log(data);
        console.log(id);
        Mongo('update', USERDB, {_id: id}, {$set: data}).then(user => Object.getOwnPropertyNames(ret).length === 0 ? res.json({apiOK: true}) : res.json(ret)).catch(err => handleError(err, next));
    }
}).post(function(req, res, next) {
    console.log('add user');
    if (!checkAdmin(1, req.user)) {
        return handleError(new HoError('unknown type in edituser', {code: 403}), next);
    }
    let userPW = '';
    if (req.body.userPW) {
        userPW = isValidString(req.body.userPW, 'passwd');
        if (!userPW) {
            return handleError(new HoError('passwd is not valid'), next);
        }
    }
    if (!userPWCheck(req.user, userPW)) {
        return handleError(new HoError('permission denied'), next);
    }
    const name = isValidString(req.body.name, 'name');
    if (name === false || isDefaultTag(normalize(name))) {
        return handleError(new HoError('name is not valid'), next);
    }
    Mongo('find', USERDB, {username: name}, {
        projection: {
            username: 1,
            _id: 0,
        },
        limit: 1,
    }).then(users => {
        if (users.length > 0) {
            console.log(users);
            return handleError(new HoError('already has one!!!'));
        }
        const newPwd = isValidString(req.body.newPwd, 'passwd');
        if (!newPwd) {
            return handleError(new HoError('new passwd is not valid'));
        }
        const conPwd = isValidString(req.body.conPwd, 'passwd');
        if (!conPwd) {
            return handleError(new HoError('con passwd is not valid'));
        }
        if (newPwd !== conPwd) {
            return handleError(new HoError('password must equal!!!'));
        }
        const desc = isValidString(req.body.desc, 'desc');
        if (!desc) {
            return handleError(new HoError('desc is not valid'));
        }
        const perm = isValidString(req.body.perm, 'perm');
        if (!perm) {
            return handleError(new HoError('perm is not valid'));
        }
        return Mongo('insert', USERDB, {
            username: name,
            desc,
            perm,
            password: createHash('md5').update(newPwd).digest('hex'),
        });
    }).then(user => res.json(Object.assign({
        name: user[0].username,
        perm: user[0].perm,
        desc: user[0].desc,
        id: user[0]._id,
        newable: false,
        auto: '',
        editAuto: true,
        kindle: '',
        editKindle: true,
    }, user[0].perm === 1 ? {
        unDay: user[0].unDay ? user[0].unDay : UNACTIVE_DAY,
        unHit: user[0].unHit ? user[0].unHit : UNACTIVE_HIT,
    } : {delable: true}))).catch(err => handleError(err, next));
});

router.put('/del/:uid', function(req, res, next) {
    console.log('deluser');
    if (!checkAdmin(1, req.user)) {
        return handleError(new HoError('unknown type in edituser', {code: 403}), next);
    }
    let userPW = '';
    if (req.body.userPW) {
        userPW = isValidString(req.body.userPW, 'passwd');
        if (!userPW) {
            return handleError(new HoError('passwd is not valid'), next);
        }
    }
    if (!userPWCheck(req.user, userPW)) {
        return handleError(new HoError('permission denied'), next);
    }
    const id = isValidString(req.params.uid, 'uid');
    if (!id) {
        return handleError(new HoError('uid is not valid'), next);
    }
    Mongo('find', USERDB, {_id: id}, {limit: 1}).then(users => {
        if (users.length < 1) {
            return handleError(new HoError('user does not exist!!!'));
        }
        if (checkAdmin(1, users[0])) {
            return handleError(new HoError('owner cannot be deleted!!!'));
        }
        return Mongo('deleteMany', USERDB, {_id: id});
    }).then(user => res.json({apiOK: true})).catch(err => handleError(err, next));
});

router.get('/verify', function(req, res, next) {
    console.log('verify code');
    Mongo('deleteMany', VERIFYDB, {utime: {$lt: Math.round(new Date().getTime() / 1000) - 185}}).then(item => Mongo('find', VERIFYDB, {uid: req.user._id}, {limit: 1}).then(item => (item.length > 0) ? res.json({verify: item[0].verify}) : Mongo('insert', VERIFYDB, {
        verify: completeZero(Math.floor(Math.random() * 10000), 4),
        uid: req.user._id,
        utime: Math.round(new Date().getTime() / 1000),
    }).then(item => {
        console.log(item);
        res.json({verify: item[0].verify});
    }))).catch(err => handleError(err, next));
});

export default router
