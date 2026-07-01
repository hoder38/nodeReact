import { USERDB } from '../constants.js'
import { PASSWORD_SALT } from '../../../ver.js'
import Express from 'express'
import Passport from 'passport'
import passportLocal from 'passport-local'
const { Strategy } = passportLocal;
import bcryptModule from 'bcrypt'
import Mongo, { objectID } from '../models/mongo-tool.js'
import createLogger from '../util/logger.js'
import { handleError, HoError, isValidString } from '../util/utility.js'

const router = Express.Router()
const log = createLogger('auth')

/**
 * Configure local username and password authentication.
 */
Passport.use(new Strategy(async function(username, password, done){
    log.info({ username }, 'login attempt');
    try {
        const validUsername = isValidString(username, 'name');
        if (!validUsername) {
            return handleError(new HoError('username is not valid', {code: 401}), done);
        }
        const validPassword = isValidString(password, 'passwd');
        if (!validPassword) {
            return handleError(new HoError('passwd is not valid', {code: 401}), done);
        }
        const users = await Mongo('find', USERDB, {username: validUsername}, {limit: 1});
        if (users.length < 1) {
            return handleError(new HoError('Incorrect username or password', {code: 401}), done)
        }
        const match = await bcryptModule.compare(PASSWORD_SALT + validPassword, users[0].password);
        if (!match) {
            return handleError(new HoError('Incorrect username or password', {code: 401}), done)
        }
        done(null, users[0])
    } catch (err) {
        handleError(err, done)
    }
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

/**
 * Build authentication routes.
 *
 * @param {string | null} url redirect URL returned after successful auth
 * @returns {import('express').Router}
 */
export default function(url=null) {
    router.get('/api/logout', function(req, res, next) {
        log.info('user logout');
        if (req.isAuthenticated()) {
            req.session.destroy()
        }
        res.json(url ? {
            apiOK: true,
            url,
        } : {apiOK: true})
    })
    router.post('/api/login', Passport.authenticate('local'), function(req, res, next) {
        const user = req.user;
        req.session.regenerate(function(err) {
            if (err) return handleError(err, next);
            req.logIn(user, function(err) {
                if (err) return handleError(err, next);
                log.info({ userId: req.user.username }, 'auth succeeded');
                res.json(Object.assign({
                    loginOK: true,
                    id: req.user.username,
                }, url? {url} : {}))
            })
        })
    })
    router.all('/api*', function(req, res, next) {
        return handleError(new HoError('Unknown api'), next)
    })
    return router
}