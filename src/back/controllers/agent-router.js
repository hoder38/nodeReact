import { createHmac, randomBytes } from 'crypto'
import Express from 'express'
// Namespace import: existing tests mock ver.js without these names; named imports would fail to link.
import * as Ver from '../../../ver.js'
import { checkAdmin, checkLogin, HoError, handleError } from '../util/utility.js'
import createLogger from '../util/logger.js'

// Mints short-lived HS256 tokens for agent-harness (agent-harness/ARCHITECTURE.md §4a).
// nginx proxies /api/agent/* straight to agent-api, which verifies these tokens.
export const AGENT_TOKEN_TTL = 600

const router = Express.Router()
const log = createLogger('agent-router')

// Buffer 'base64url' needs Node >= 14.18; the image runs 14.x, so convert manually.
const b64url = input => Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

export const signAgentToken = (secret, sub, now = Math.floor(Date.now() / 1000)) => {
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const payload = b64url(JSON.stringify({
        sub,
        iss: 'nodereact',
        aud: 'agent-harness',
        iat: now,
        exp: now + AGENT_TOKEN_TTL,
        jti: randomBytes(16).toString('hex'),
    }))
    const sig = b64url(createHmac('sha256', secret).update(`${header}.${payload}`).digest())
    return `${header}.${payload}.${sig}`
}

export const canUseAgent = user => Boolean(Ver.AGENT_JWT_SECRET) && checkAdmin(1, user) && (!Ver.AGENT_NODEREACT_USER || user.username === Ver.AGENT_NODEREACT_USER)

router.get('/', function(req, res, next) {
    checkLogin(req, res, () => {
        if (!Ver.AGENT_JWT_SECRET) {
            return handleError(new HoError('agent not configured', { code: 503 }), next)
        }
        if (!canUseAgent(req.user)) {
            return handleError(new HoError('permission denied', { code: 403 }), next)
        }
        log.debug({ userId: req.user.username }, 'mint agent token')
        res.set('Cache-Control', 'no-store').json({
            token: signAgentToken(Ver.AGENT_JWT_SECRET, Ver.AGENT_OWNER_ID || 'owner'),
            expiresIn: AGENT_TOKEN_TTL,
        })
    })
})

export default router
