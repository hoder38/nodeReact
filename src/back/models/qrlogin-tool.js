import cryptoModule from 'crypto'
import Redis from './redis-tool.js'
import createLogger from '../util/logger.js'
import { handleError, HoError } from '../util/utility.js'

const { createHash, randomBytes, timingSafeEqual } = cryptoModule
const log = createLogger('qrlogin')

export const QR_PREFIX = 'qrlogin:'
// A pending code stays scannable for 3 minutes, an approved one must be
// redeemed within 1 minute.
export const PENDING_TTL = 180
export const APPROVED_TTL = 60
export const MAX_ATTEMPT = 3
// The browser redeems the code twice: once on the main server, once on the file server.
export const CONSUME_TOTAL = 2

const redisKey = serial => `${QR_PREFIX}${serial}`

export const hashSecret = secret => createHash('sha256').update(String(secret)).digest('hex')

const randomToken = () => randomBytes(32).toString('hex')

/**
 * The serial travels inside the QR URL so it is public, the secret never
 * leaves the browser that created the code.
 */
export const isValidSerial = serial => (typeof serial === 'string' && /^[0-9a-f]{64}$/.test(serial)) ? serial : false

const safeCompare = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
        return false
    }
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

const saveToken = (serial, record, ttl) => Redis('multi', [
    ['set', redisKey(serial), JSON.stringify(record)],
    ['expire', redisKey(serial), ttl],
])

export function createToken() {
    const serial = randomToken()
    const secret = randomToken()
    return saveToken(serial, {
        status: 'pending',
        hash: hashSecret(secret),
        used: 0,
        attempt: 0,
        ctime: Date.now(),
    }, PENDING_TTL).then(() => {
        log.info({ serial }, 'qrcode created')
        return { serial, secret, expire: PENDING_TTL }
    }).catch(err => handleError(err))
}

export function getToken(serial) {
    const validSerial = isValidSerial(serial)
    if (!validSerial) {
        return handleError(new HoError('qrcode serial is not valid'))
    }
    return Redis('get', redisKey(validSerial)).then(data => {
        if (!data) {
            return null
        }
        try {
            return JSON.parse(data)
        } catch (e) {
            return null
        }
    }).catch(err => handleError(err))
}

export function approveToken(serial, uid) {
    const validSerial = isValidSerial(serial)
    if (!validSerial) {
        return handleError(new HoError('qrcode serial is not valid'))
    }
    return getToken(validSerial).then(record => {
        if (!record) {
            return handleError(new HoError('qrcode is expired', {code: 404}))
        }
        if (record.status !== 'pending') {
            return handleError(new HoError('qrcode is already used'))
        }
        const approved = Object.assign({}, record, {
            serial: validSerial,
            status: 'approved',
            uid: String(uid),
            atime: Date.now(),
        })
        return saveToken(validSerial, approved, APPROVED_TTL).then(() => {
            log.info({ serial: validSerial }, 'qrcode approved')
            return approved
        })
    }).catch(err => handleError(err))
}

export function rejectToken(serial) {
    const validSerial = isValidSerial(serial)
    if (!validSerial) {
        return handleError(new HoError('qrcode serial is not valid'))
    }
    return Redis('del', redisKey(validSerial)).then(() => {
        log.info({ serial: validSerial }, 'qrcode rejected')
        return true
    }).catch(err => handleError(err))
}

/**
 * Redeem an approved code. The secret proves the caller is the browser that
 * requested the code, so a stolen serial alone is useless.
 */
export function consumeToken(serial, secret) {
    const validSerial = isValidSerial(serial)
    if (!validSerial) {
        return handleError(new HoError('qrcode serial is not valid', {code: 401}))
    }
    return getToken(validSerial).then(record => {
        if (!record) {
            return handleError(new HoError('qrcode is expired', {code: 401}))
        }
        if (record.status !== 'approved') {
            return handleError(new HoError('qrcode is not approved', {code: 401}))
        }
        if (!safeCompare(record.hash, hashSecret(secret))) {
            const attempt = (record.attempt || 0) + 1
            log.warn({ serial: validSerial, attempt }, 'qrcode secret mismatch')
            if (attempt >= MAX_ATTEMPT) {
                return Redis('del', redisKey(validSerial)).then(() => handleError(new HoError('qrcode is not valid', {code: 401})))
            }
            return Redis('ttl', redisKey(validSerial)).then(ttl => saveToken(validSerial, Object.assign({}, record, {attempt}), ttl > 0 ? ttl : APPROVED_TTL))
            .then(() => handleError(new HoError('qrcode is not valid', {code: 401})))
        }
        const used = (record.used || 0) + 1
        const consumed = Object.assign({}, record, {used})
        if (used >= CONSUME_TOTAL) {
            return Redis('del', redisKey(validSerial)).then(() => {
                log.info({ serial: validSerial }, 'qrcode consumed')
                return consumed
            })
        }
        return Redis('ttl', redisKey(validSerial)).then(ttl => saveToken(validSerial, consumed, ttl > 0 ? ttl : APPROVED_TTL)).then(() => consumed)
    }).catch(err => handleError(err))
}

export default {
    createToken,
    getToken,
    approveToken,
    rejectToken,
    consumeToken,
}
