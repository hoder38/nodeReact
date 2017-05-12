import { USERDB } from '../constants'
import Express from 'express'
import Passport from 'passport'
import { Strategy } from 'passport-local'
import { createHash } from 'crypto'
import Mongo, { objectID } from '../models/mongo-tool'
import { handleError, HoError, isValidString } from '../util/utility'

const router = Express.Router()

//passport
Passport.use(new Strategy(function(username, password, done){
    console.log('login');
    Mongo('find', USERDB, {username: isValidString(username, 'name', 'username is not vaild', 401)}, {limit: 1}).then(users => {
        if (users.length < 1 || createHash('md5').update(isValidString(password, 'passwd', 'passwd is not vaild', 401)).digest('hex') !== users[0].password) {
            handleError(new HoError('Incorrect username or password', {cdoe: 401}))
        }
        done(null, users[0])
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
            url: url,
        } : {apiOK: true})
    })
    router.post('/api/login', Passport.authenticate('local'), function(req, res) {
        req.logIn(req.user, function(err) {
            console.log('auth ok');
            res.json(Object.assign({
                loginOK: true,
                id: req.user.username,
            }, url? {url: url} : {}))
        })
    })
    router.all('/api*', function(req, res, next) {
        handleError(new HoError('Unkonwn api'))
    })
    return router
}