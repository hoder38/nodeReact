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
    console.log(username);
    const name = isValidString(username, 'name')
    const pwd = isValidString(password, 'passwd')
    if (name === false) {
        handleError(new HoError('username is not vaild', 401))
    }
    if (pwd === false) {
        handleError(new HoError('passwd is not vaild', 401))
    }
    Mongo('find', USERDB, {username: name}, {limit: 1}).then(users => {
        if (users.length < 1 || createHash('md5').update(pwd).digest('hex') !== users[0].password) {
            throw new HoError('Incorrect username or password', 401)
        }
        done(null, users[0])
    }).catch(err => handleError(err, done))
}))
Passport.serializeUser(function(user, done) {
    done(null, user._id)
})
Passport.deserializeUser(function(id, done) {
    Mongo('find', USERDB, {_id: objectID(id)}, {limit: 1}).then(users => done(null,users[0])).catch(err => handleError(err, done))
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
        } : {
            apiOK: true,
        })
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