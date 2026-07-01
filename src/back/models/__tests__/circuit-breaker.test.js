import { jest } from '@jest/globals'

let mockSendWs;
jest.unstable_mockModule('../../util/sendWs.js', () => {
    mockSendWs = jest.fn();
    return { default: mockSendWs };
});
jest.unstable_mockModule('../../util/utility.js', () => ({
    handleError: (err) => Promise.reject(err),
    HoError: class HoError extends Error {
        constructor(msg) { super(msg); this.name = 'HoError'; }
    },
}));

const { circuitBreaker, _resetBreakers, _getBreakerState } = await import('../../models/circuit-breaker.js');

describe('circuit-breaker', () => {
    beforeEach(() => {
        _resetBreakers();
        mockSendWs.mockClear();
    });

    it('passes through on success (CLOSED state)', async () => {
        const result = await circuitBreaker('test', () => Promise.resolve('ok'));
        expect(result).toBe('ok');
        expect(_getBreakerState('test').failureCount).toBe(0);
    });

    it('increments failure count on error', async () => {
        await expect(circuitBreaker('test', () => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
        expect(_getBreakerState('test').failureCount).toBe(1);
        expect(_getBreakerState('test').state).toBe('CLOSED');
    });

    it('opens circuit after threshold failures and sends discord msg', async () => {
        for (let i = 0; i < 3; i++) {
            await expect(circuitBreaker('test', () => Promise.reject(new Error('down')))).rejects.toThrow('down');
        }
        const state = _getBreakerState('test');
        expect(state.state).toBe('OPEN');
        expect(state.failureCount).toBe(3);
        expect(mockSendWs).toHaveBeenCalledWith(
            expect.stringContaining('Circuit Breaker OPEN for [test]'),
            false, false, true
        );
    });

    it('fails fast when circuit is OPEN', async () => {
        for (let i = 0; i < 3; i++) {
            await expect(circuitBreaker('test', () => Promise.reject(new Error('down')))).rejects.toThrow();
        }
        const fn = jest.fn(() => Promise.resolve('should not call'));
        await expect(circuitBreaker('test', fn)).rejects.toThrow('circuit breaker is OPEN');
        expect(fn).not.toHaveBeenCalled();
    });

    it('transitions to HALF_OPEN after resetTimeout', async () => {
        for (let i = 0; i < 3; i++) {
            await expect(circuitBreaker('test', () => Promise.reject(new Error('down')))).rejects.toThrow();
        }
        // Simulate time passing
        const state = _getBreakerState('test');
        const breakers = (await import('../../models/circuit-breaker.js'))._getBreakerState;
        // Hack lastFailureTime to simulate timeout
        const internalState = _getBreakerState('test');
        // We need to modify internal state - re-import won't help, use the actual map
        // Instead, use a short resetTimeout
        _resetBreakers();
        for (let i = 0; i < 3; i++) {
            await expect(circuitBreaker('test2', () => Promise.reject(new Error('down')), { failureThreshold: 3, resetTimeout: 1 })).rejects.toThrow();
        }
        await new Promise(r => setTimeout(r, 5));
        const result = await circuitBreaker('test2', () => Promise.resolve('recovered'), { resetTimeout: 1 });
        expect(result).toBe('recovered');
        expect(_getBreakerState('test2').state).toBe('CLOSED');
    });

    it('sends recovery notification when service recovers from HALF_OPEN', async () => {
        for (let i = 0; i < 3; i++) {
            await expect(circuitBreaker('svc', () => Promise.reject(new Error('down')), { failureThreshold: 3, resetTimeout: 1 })).rejects.toThrow();
        }
        mockSendWs.mockClear();
        await new Promise(r => setTimeout(r, 5));
        await circuitBreaker('svc', () => Promise.resolve('ok'), { resetTimeout: 1 });
        expect(mockSendWs).toHaveBeenCalledWith(
            expect.stringContaining('Circuit Breaker CLOSED for [svc]'),
            false, false, true
        );
    });
});
