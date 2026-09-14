import { USERDB, QRLOGIN } from '../constants.js'
import { ENV_TYPE } from '../../../ver.js'
import { EXTENT_FILE_IP, EXTENT_IP, EXTENT_PORT, WS_PORT } from '../config.js'
import Express from 'express'
import QRCode from 'qrcode'
import Mongo, { objectID } from '../models/mongo-tool.js'
import { createToken, getToken, approveToken, rejectToken, consumeToken, isValidSerial } from '../models/qrlogin-tool.js'
import sendWs from '../util/sendWs.js'
import createLogger from '../util/logger.js'
import { checkLogin, handleError, HoError } from '../util/utility.js'

const log = createLogger('qrlogin-router')

const qrPage = serial => `https://${EXTENT_IP(ENV_TYPE)}:${EXTENT_PORT(ENV_TYPE)}/qrcode/${serial}`

/**
 * Build QR code login routes.
 *
 * The desktop browser asks for a code, the QR image points a phone at
 * /qrcode/<serial>. Once the already authenticated phone approves it, a
 * websocket message wakes the desktop up, which then redeems the code for a
 * real session.
 *
 * @param {string | null} url redirect URL returned after successful auth
 * @returns {import('express').Router}
 */
export default function(url=null) {
    const router = Express.Router()
    router.post('/api/qrlogin/create', function(req, res, next) {
        createToken().then(token => QRCode.toDataURL(qrPage(token.serial), {
            margin: 2,
            width: 320,
            errorCorrectionLevel: 'M',
        }).then(qr => res.json({
            serial: token.serial,
            secret: token.secret,
            expire: token.expire,
            page: qrPage(token.serial),
            qr,
            ws_url: `wss://${EXTENT_FILE_IP(ENV_TYPE)}:${WS_PORT(ENV_TYPE)}/f`,
        }))).catch(err => handleError(err, next))
    })
    router.get('/api/qrlogin/status/:serial', function(req, res, next) {
        const serial = isValidSerial(req.params.serial)
        if (!serial) {
            return handleError(new HoError('qrcode serial is not valid'), next)
        }
        getToken(serial).then(record => res.json({
            serial,
            status: record ? record.status : 'expired',
        })).catch(err => handleError(err, next))
    })
    router.post('/api/qrlogin/approve', function(req, res, next) {
        checkLogin(req, res, () => {
            log.info({ userId: req.user.username }, 'qrcode approve')
            approveToken(req.body.serial, req.user._id).then(record => {
                // The serial is public: never put the secret on the wire.
                sendWs({
                    type: QRLOGIN,
                    data: record.serial || req.body.serial,
                    status: 'approved',
                }, false, false)
                res.json({apiOK: true})
            }).catch(err => handleError(err, next))
        })
    })
    router.post('/api/qrlogin/reject', function(req, res, next) {
        checkLogin(req, res, () => rejectToken(req.body.serial).then(() => res.json({apiOK: true})).catch(err => handleError(err, next)))
    })
    router.post('/api/login/qr', function(req, res, next) {
        consumeToken(req.body.serial, req.body.secret).then(record => Mongo('find', USERDB, {_id: objectID(record.uid)}, {limit: 1}).then(users => {
            if (users.length < 1) {
                return handleError(new HoError('Incorrect username or password', {code: 401}), next)
            }
            const user = users[0]
            req.session.regenerate(function(err) {
                if (err) return handleError(err, next);
                req.logIn(user, function(err) {
                    if (err) return handleError(err, next);
                    log.info({ userId: req.user.username }, 'qrcode auth succeeded')
                    res.json(Object.assign({
                        loginOK: true,
                        id: req.user.username,
                    }, url ? {url} : {}))
                })
            })
        })).catch(err => handleError(err, next))
    })
    return router
}
