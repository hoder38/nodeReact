import { USERDB, UNACTIVE_DAY, UNACTIVE_HIT } from '../constants'
import Express from 'express'
import { createHash } from 'crypto'
import { checkAdmin, checkLogin, HoError, handleError, isValidString, userPWCheck } from '../util/utility'
import Mongo from '../models/mongo-tool'
import { isDefaultTag, normalize } from '../models/tag-tool'

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
        auto: users[0].auto ? `https://drive.google.com/open?id=${users[0].auto}&authuser=0` : '',
        editAuto: false,
    }]})).catch(err => handleError(err, next)) : Mongo('find', USERDB).then(users => res.json({user_info: [{
        name: '',
        perm: '',
        desc: '',
        editAuto: false,
        newable: true,
        id: 0,
    }, ...users.map(user => Object.assign({
        name: user.username,
        perm: user.perm,
        desc: user.desc,
        id: user._id,
        newable: false,
        editAuto: true,
        auto: user.auto ? `https://drive.google.com/open?id=${user.auto}&authuser=0` : '',
    }, user.perm === 1 ? {
        unDay: user.unDay ? user.unDay : UNACTIVE_DAY,
        unHit: user.unHit ? user.unHit : UNACTIVE_HIT,
    } : {
        delable: true,
    }))]})).catch(err => handleError(err, next))
}).put(function(req, res, next) {
    console.log('user edit');
    if (!userPWCheck(req.user, req.body.userPW ? isValidString(req.body.userPW, 'passwd', 'passwd is not valid') : '')) {
        handleError(new HoError('permission denied'))
    }
    let ret = {}
    let data = {}
    let needPerm = false
    if (req.body.auto) {
        if (!checkAdmin(1, req.user)) {
            handleError(new HoError('unknown type in edituser', {code: 403}))
        }
        isValidString(req.body.auto, 'url', 'auto is not valid')
        const autoId = req.body.auto.match(/id=([^\&]*)/)
        if (!autoId || !autoId[1]) {
            handleError(new HoError('auto is not valid'))
        }
        data['auto'] = autoId[1]
        ret['auto'] = `https://drive.google.com/open?id=${autoId[1]}&authuser=0`
        needPerm = true
    }
    if (req.body.desc === '' || req.body.desc) {
        if (!checkAdmin(1, req.user)) {
            handleError(new HoError('unknown type in edituser', {code: 403}))
        }
        data['desc'] = ret['desc'] = isValidString(req.body.desc, 'desc', 'desc is not valid')
        needPerm = true
    }
    if (req.body.perm === '' || req.body.perm) {
        if (!checkAdmin(1, req.user)) {
            handleError(new HoError('unknown type in edituser', {code: 403}))
        }
        if (req.user._id.equals(isValidString(req.params.uid, 'uid'))) {
            handleError(new HoError('owner can not edit self perm'))
        }
        data['perm'] = ret['perm'] = isValidString(req.body.perm, 'perm', 'perm is not valid')
        needPerm = true
    }
    if (req.body.unDay && req.body.unDay) {
        if (!checkAdmin(1, req.user)) {
            handleError(new HoError('unknown type in edituser', {code: 403}))
        }
        data['unDay'] = ret['unDay'] = isValidString(req.body.unDay, 'int', 'unactive day is not valid')
        needPerm = true
    }
    if (req.body.unHit && req.body.unHit) {
        if (!checkAdmin(1, req.user)) {
            handleError(new HoError('unknown type in edituser', {code: 403}))
        }
        data['unHit'] = ret['unHit'] = isValidString(req.body.unHit, 'int', 'unactive hit is not valid')
        needPerm = true
    }
    if (req.body.newPwd && req.body.conPwd) {
        const newPwd = isValidString(req.body.newPwd, 'passwd', 'new passwd is not valid')
        if (newPwd !== isValidString(req.body.conPwd, 'passwd', 'con passwd is not valid')) {
            handleError(new HoError('confirm password must equal!!!'))
        }
        data['password'] = createHash('md5').update(newPwd).digest('hex')
    }
    const id = checkAdmin(1, req.user) ? isValidString(req.params.uid, 'uid', 'uid is not valid') : needPerm ? handleError(new HoError('unknown type in edituser', {code: 403})) : req.user._id
    if (req.body.name) {
        const name = isValidString(req.body.name, 'name')
        if (name === false || isDefaultTag(normalize(name))) {
            handleError(new HoError('name is not valid'))
        }
        Mongo('find', USERDB, {username: name}, {
            username: 1,
            _id: 0,
        }, {limit: 1}).then(users => {
            if (users.length > 0) {
                console.log(users);
                util.handleError(new HoError('already has one!!!'))
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
            handleError(new HoError('nothing to change!!!'));
        }
        console.log(data);
        console.log(id);
        Mongo('update', USERDB, {_id: id}, {$set: data}).then(user => Object.getOwnPropertyNames(ret).length === 0 ? res.json({apiOK: true}) : res.json(ret)).catch(err => handleError(err, next));
    }
}).post(function(req, res, next) {
    console.log('add user');
    if (!checkAdmin(1, req.user)) {
        handleError(new HoError('unknown type in edituser', {code: 403}));
    }
    if (!userPWCheck(req.user, req.body.userPW ? isValidString(req.body.userPW, 'passwd', 'passwd is not valid') : '')) {
        handleError(new HoError('permission denied'));
    }
    const name = isValidString(req.body.name, 'name');
    if (name === false || isDefaultTag(normalize(name))) {
        handleError(new HoError('name is not valid'));
    }
    Mongo('find', USERDB, {username: name}, {
        username: 1,
        _id: 0,
    }, {limit: 1}).then(users => {
        if (users.length > 0) {
            console.log(users);
            handleError(new HoError('already has one!!!'));
        }
        const newPwd = isValidString(req.body.newPwd, 'passwd', 'new passwd is not valid');
        if (newPwd !== isValidString(req.body.conPwd, 'passwd', 'con passwd is not valid')) {
            handleError(new HoError('password must equal!!!'));
        }
        return Mongo('insert', USERDB, {
            username: name,
            desc: isValidString(req.body.desc, 'desc', 'desc is not valid'),
            perm: isValidString(req.body.perm, 'perm', 'perm is not valid'),
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
    }, user[0].perm === 1 ? {
        unDay: user[0].unDay ? user[0].unDay : UNACTIVE_DAY,
        unHit: user[0].unHit ? user[0].unHit : UNACTIVE_HIT,
    } : {delable: true}))).catch(err => handleError(err, next));
});
router.put('/del/:uid', function(req, res, next) {
    console.log('deluser');
    if (!checkAdmin(1, req.user)) {
        handleError(new HoError('unknown type in edituser', {code: 403}))
    }
    if (!userPWCheck(req.user, req.body.userPW ? isValidString(req.body.userPW, 'passwd', 'passwd is not valid') : '')) {
        handleError(new HoError('permission denied'));
    }
    const id = isValidString(req.params.uid, 'uid', 'uid is not vaild');
    Mongo('find', USERDB, {_id: id}, {limit: 1}).then(users => {
        if (users.length < 1) {
            handleError(new HoError('user does not exist!!!'));
        }
        if (checkAdmin(1, users[0])) {
            handleError(new HoError('owner cannot be deleted!!!'));
        }
        return Mongo('remove', USERDB, {
            _id: id,
            $isolated: 1,
        });
    }).then(user => res.json({apiOK: true})).catch(err => handleError(err, next));
});

export default router
