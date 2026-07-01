import { handleError, HoError } from '../util/utility.js'
import sendWs from '../util/sendWs.js'

const STATES = { CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' };

const breakers = new Map();

const DEFAULT_OPTIONS = {
    failureThreshold: 3,
    resetTimeout: 300000, // 5 minutes
    halfOpenMaxAttempts: 1,
};

function getBreaker(name) {
    if (!breakers.has(name)) {
        breakers.set(name, {
            state: STATES.CLOSED,
            failureCount: 0,
            lastFailureTime: null,
            halfOpenAttempts: 0,
        });
    }
    return breakers.get(name);
}

function notifyDiscord(name, error) {
    const msg = `⚠️ Circuit Breaker OPEN for [${name}]: ${error.message || error}`;
    sendWs(msg, false, false, true);
}

function notifyRecovery(name) {
    const msg = `✅ Circuit Breaker CLOSED for [${name}]: Service recovered`;
    sendWs(msg, false, false, true);
}

export function circuitBreaker(name, fn, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const breaker = getBreaker(name);

    if (breaker.state === STATES.OPEN) {
        if (Date.now() - breaker.lastFailureTime >= opts.resetTimeout) {
            breaker.state = STATES.HALF_OPEN;
            breaker.halfOpenAttempts = 0;
        } else {
            return handleError(new HoError(`[${name}] circuit breaker is OPEN, failing fast`));
        }
    }

    if (breaker.state === STATES.HALF_OPEN) {
        breaker.halfOpenAttempts++;
        if (breaker.halfOpenAttempts > opts.halfOpenMaxAttempts) {
            breaker.state = STATES.OPEN;
            breaker.lastFailureTime = Date.now();
            return handleError(new HoError(`[${name}] circuit breaker is OPEN, failing fast`));
        }
    }

    return fn().then(result => {
        if (breaker.state === STATES.HALF_OPEN) {
            notifyRecovery(name);
        }
        breaker.state = STATES.CLOSED;
        breaker.failureCount = 0;
        breaker.halfOpenAttempts = 0;
        return result;
    }).catch(err => {
        breaker.failureCount++;
        breaker.lastFailureTime = Date.now();
        if (breaker.failureCount >= opts.failureThreshold) {
            breaker.state = STATES.OPEN;
            notifyDiscord(name, err);
        }
        return handleError(err);
    });
}

// For testing
export function _resetBreakers() {
    breakers.clear();
}

export function _getBreakerState(name) {
    return breakers.has(name) ? { ...breakers.get(name) } : null;
}
