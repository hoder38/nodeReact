import { USERDB, VERIFYDB } from '../constants.js'
import Express from 'express'
import Passport from 'passport'
import passportLocal from 'passport-local'
const { Strategy } = passportLocal;
import { createHash } from 'crypto'
import Mongo, { objectID } from '../models/mongo-tool.js'
import { handleError, HoError, isValidString } from '../util/utility.js'

const router = Express.Router()

//passport
Passport.use(new Strategy(function(username, password, done){
    console.log('login');
    const validUsername = isValidString(username, 'name');
    if (!validUsername) {
        return handleError(new HoError('username is not vaild', {code: 401}), done);
    }
    const validPassword = isValidString(password, 'passwd');
    let validVerify = false;
    if (!validPassword) {
        validVerify = isValidString(password, 'verify');
        if (!validVerify) {
            return handleError(new HoError('passwd is not vaild', {code: 401}));
        }
    }
    Mongo('find', USERDB, {username: validUsername}, {limit: 1}).then(users => {
        if (users.length < 1) {
            return handleError(new HoError('Incorrect username or password', {cdoe: 401}))
        }
        if (validPassword && createHash('md5').update(validPassword).digest('hex') !== users[0].password) {
            return handleError(new HoError('Incorrect username or password', {cdoe: 401}))
        }
        if (validVerify) {
            return Mongo('deleteMany', VERIFYDB, {utime: {$lt: Math.round(new Date().getTime() / 1000) - 185}}).then(item => Mongo('find', VERIFYDB, {uid: users[0]._id}, {limit: 1}).then(info => {
                if (info.length < 1 || validVerify !== info[0].verify) {
                    return handleError(new HoError('Incorrect username or password', {cdoe: 401}))
                }
                done(null, users[0])
            }));
        } else {
            done(null, users[0])
        }
    }).catch(err => handleError(err, done))
}))
Passport.serializeUser(function(user, done) {
    done(null, user._id)
})
Passport.deserializeUser(function(id, done) {
    Mongo('find', USERDB, {_id: objectID(id)}, {limit: 1}).then(users => done(null, {
        _id: users[0]._id,
        auto: users[0].auto,
        perm: users[0].perm,
        unDay: users[0].unDay,
        unHit: users[0].unHit,
        username: users[0].username,
        password: users[0].password,
    })).catch(err => handleError(err, done))
})

//login
export default function(url=null) {
    router.get('/api/logout', function(req, res, next) {
        console.log('logout');
        if (req.isAuthenticated()) {
            req.session.destroy()
        }
        res.json(url ? {
            apiOK: true,
            url,
        } : {apiOK: true})
    })
    router.post('/api/login', Passport.authenticate('local'), function(req, res) {
        req.logIn(req.user, function(err) {
            console.log('auth ok');
            res.json(Object.assign({
                loginOK: true,
                id: req.user.username,
            }, url? {url} : {}))
        })
    })
    router.all('/api*', function(req, res, next) {
        return handleError(new HoError('Unkonwn api'), next)
    })
    return router
}