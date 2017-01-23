import { USERDB, UNACTIVE_DAY, UNACTIVE_HIT } from '../constants'
import Express from 'express'
import { checkAdmin, checkLogin, HoError, handleError, isValidString, userPWCheck } from '../util/utility'
import Mongo from '../models/mongo-tool'

const router = Express.Router()

router.use(function(req, res, next) {
    checkLogin(req, res, next)
})

router.route('/:uid?').get(function(req, res, next) {
    console.log('user info');
    if (!checkAdmin(1, req.user)) {
        Mongo('find', USERDB, {_id: req.user._id}, {limit: 1}).then(users => {
            if (users.length < 1) {
                handleError(new HoError('Could not find user!'))
            }
            res.json({user_info: [{
                name: users[0].username,
                id: users[0]._id,
                newable: false,
                auto: users[0].auto ? `https://drive.google.com/open?id=${users[0].auto}&authuser=0` : null,
                editAuto: false,
            }]})
        }).catch(err => handleError(err, next))
    } else {
        Mongo('find', USERDB).then(users => {
            let user_info = []
            user_info.push({
                name: '',
                perm: '',
                desc: '',
                editAuto: false,
                newable: true,
                id: 0,
            })
            for (let user of users) {
                user_info.push(Object.assign({
                    name: user.username,
                    perm: user.perm,
                    desc: user.desc,
                    id: user._id,
                    newable: false,
                    editAuto: true,
                    auto: user.auto ? `https://drive.google.com/open?id=${user.auto}&authuser=0` : null,
                }, user.perm === 1 ? {
                    unDay: user.unDay ? user.unDay : UNACTIVE_DAY,
                    unHit: user.unHit ? user.unHit : UNACTIVE_HIT,
                } : {
                    delable: true,
                }))
            }
            res.json({user_info: user_info})
        }).catch(err => handleError(err, next))
    }
}).put(function(req, res, next) {
    console.log('user edit');
    const userPW = req.body.userPW ? isValidString(req.body.userPW, 'passwd') : ''
    if (userPW === false) {
        handleError(new HoError('passwd is not vaild'))
    }
    if (!userPWCheck(req.user, userPW)) {
        handleError(new HoError('permission denied'))
    }
    let ret = {}
    let data = {}
    let needPerm = false
    if (req.body.auto) {
        if (!checkAdmin(1, req.user)) {
            handleError(new HoError('unknown type in edituser', 403))
        }
        const auto = isValidString(req.body.auto, 'url')
        if (auto === false) {
            handleError(new HoError('auto is not vaild'))
        }
        const autoId = req.body.auto.match(/id=([^\&]*)/)
        if (!autoId || !autoId[1]) {
            handleError(new HoError('auto is not vaild'))
        }
        data['auto'] = autoId[1]
        ret['auto'] = `https://drive.google.com/open?id=${autoId[1]}&authuser=0`
        needPerm = true
    }
    if (req.body.desc === '' || req.body.desc) {
        if (!checkAdmin(1, req.user)) {
            handleError(new HoError('unknown type in edituser', 403))
        }
        const desc = isValidString(req.body.desc, 'desc')
        if (desc === false) {
            handleError(new HoError('desc is not vaild'))
        }
        data['desc'] = desc
        ret['desc'] = desc
        needPerm = true
    }
    if (req.body.perm === '' || req.body.perm) {
        if (!checkAdmin(1, req.user)) {
            handleError(new HoError('unknown type in edituser', 403))
        }
        const perm = isValidString(req.body.perm, 'perm')
        if (perm === false) {
            handleError(new HoError('perm is not vaild'))
        }
        if (req.user._id.equals(isValidString(req.params.uid, 'uid'))) {
            handleError(new HoError('owner can not edit self perm'))
        }
        data['perm'] = perm
        ret['perm'] = perm
        needPerm = true
    }


        /*if (req.body.unDay && req.body.unDay) {
            if (!util.checkAdmin(1, req.user)) {
                util.handleError({hoerror: 2, message: 'unknown type in edituser'}, next, res, 403);
            }
            var unDay = util.isValidString(req.body.unDay, 'int');
            if (unDay === false) {
                util.handleError({hoerror: 2, message: "unactive day is not vaild"}, next, res);
            }
            data['unDay'] = unDay;
            ret['unDay'] = unDay;
            needPerm = true;
        }
        if (req.body.unHit && req.body.unHit) {
            if (!util.checkAdmin(1, req.user)) {
                util.handleError({hoerror: 2, message: 'unknown type in edituser'}, next, res, 403);
            }
            var unHit = util.isValidString(req.body.unHit, 'int');
            if (unHit === false) {
                util.handleError({hoerror: 2, message: "unactive hit is not vaild"}, next, res);
            }
            data['unHit'] = unHit;
            ret['unHit'] = unHit;
            needPerm = true;
        }
        if (req.body.newPwd && req.body.conPwd) {
            var newPwd = util.isValidString(req.body.newPwd, 'passwd'),
                conPwd = util.isValidString(req.body.conPwd, 'passwd');
            if (newPwd === false) {
                util.handleError({hoerror: 2, message: "new passwd is not vaild"}, next, res);
            }
            if (conPwd === false) {
                util.handleError({hoerror: 2, message: "con passwd is not vaild"}, next, res);
            }
            if (newPwd !== conPwd) {
                util.handleError({hoerror: 2, message: 'confirm password must equal!!!'}, next, res);
            }
            data['password'] = crypto.createHash('md5').update(newPwd).digest('hex');
        }
        if (util.checkAdmin(1, req.user)) {
            id = util.isValidString(req.params.uid, 'uid');
            if (id === false) {
                util.handleError({hoerror: 2, message: "uid is not vaild"}, next, res);
            }
        } else {
            if (needPerm) {
                util.handleError({hoerror: 2, message: 'unknown type in edituser'}, next, res, 403);
            } else {
                id = req.user._id;
            }
        }
        if (req.body.name) {
            var name = util.isValidString(req.body.name, 'name');
            if (name === false || tagTool.isDefaultTag(tagTool.normalizeTag(name))) {
                util.handleError({hoerror: 2, message: "name is not vaild"}, next, res);
            }
            mongo.orig("find", "user", {username: name}, {username: 1, _id: 0}, {limit: 1}, function(err, users){
                if(err) {
                    util.handleError(err, next, res);
                }
                if (users.length > 0) {
                    console.log(users);
                    util.handleError({hoerror: 2, message: 'already has one!!!'}, next, res);
                }
                data['username'] = name;
                ret['name'] = name;
                if (req.user._id.equals(id)) {
                    ret.owner = name;
                }
                console.log(data);
                mongo.orig("update", "user", {_id: id}, {$set: data}, function(err,user2){
                    if(err) {
                        util.handleError(err, next, res);
                    }
                    res.json(ret);
                });
            });
        } else {
            if (Object.getOwnPropertyNames(data).length === 0) {
                util.handleError({hoerror: 2, message: 'nothing to change!!!'}, next, res);
            }
            console.log(data);
            console.log(id);
            mongo.orig("update", "user", {_id: id}, {$set: data}, function(err,user){
                if(err) {
                    util.handleError(err, next, res);
                }
                if (Object.getOwnPropertyNames(ret).length === 0) {
                    res.json({apiOK: true});
                } else {
                    res.json(ret);
                }
            });
        }*/
})
export default router
