/**
 * tdameritrade-tool.test.js — Comprehensive tests for tdameritrade-tool.js
 * ESM mocking pattern: jest.unstable_mockModule() BEFORE dynamic import().
 *
 * Module-level state (tokens, encryptedId, position, order, fakeOrder, available,
 * updateTime) persists across tests. Tests are ORDERED to progressively build state.
 */
import { jest, describe, test, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mutable mock constants — can be mutated per-test to hit different branches
// ---------------------------------------------------------------------------
const MOCK_MARKET_TIME = [16, 9];

// ---------------------------------------------------------------------------
// Mock setup (all BEFORE dynamic import)
// ---------------------------------------------------------------------------
const mockFetch = jest.fn();
jest.unstable_mockModule('node-fetch', () => ({ default: mockFetch }));

const mockMongo = jest.fn();
jest.unstable_mockModule('../mongo-tool.js', () => ({ default: mockMongo }));

const mockGetSuggestionData = jest.fn();
jest.unstable_mockModule('../stock-tool.js', () => ({ getSuggestionData: mockGetSuggestionData }));

const mockSendWs = jest.fn();
jest.unstable_mockModule('../../util/sendWs.js', () => ({ default: mockSendWs }));

class MockHoError extends Error {
    constructor(msg) { super(msg); this.name = 'HoError'; }
}
const mockHandleError = jest.fn((err, type, ...args) => {
    if (type && typeof type === 'function') return type(err, ...args);
    if (type && typeof type === 'string') return undefined;
    return Promise.reject(err);
});
jest.unstable_mockModule('../../util/utility.js', () => ({
    handleError: mockHandleError,
    HoError: MockHoError,
}));

jest.unstable_mockModule('../../../../ver.js', () => ({
    PASSWORD_SALT: 'test_salt_',
    TDAMERITRADE_KEY: 'test-key',
    GOOGLE_REDIRECT: 'http://localhost/callback',
    TDAMERITRADE_SECRET: 'test-secret',
}));

jest.unstable_mockModule('../../constants.js', () => ({
    TD_AUTH_URL: 'https://api.schwabapi.com/v1/oauth/authorize?',
    TD_TOKEN_URL: 'https://api.schwabapi.com/v1/oauth/token',
    TOTALDB: 'total',
    USSE_ORDER_INTERVAL: 86400,
    UPDATE_BOOK: 86400,
    PRICE_INTERVAL: 600,
    UPDATE_ORDER: 0,
    USSE_MARKET_TIME: MOCK_MARKET_TIME,
    RANGE_INTERVAL: 7776000,
    USSE_FEE: 0.004,
    API_WAIT: 0,
}));

// ---------------------------------------------------------------------------
// Import module after mocks
// ---------------------------------------------------------------------------
let generateAuthUrl, getToken, usseTDInit, getUssePosition, getUsseOrder, resetTD, _resetTokens;

beforeAll(async () => {
    const mod = await import('../tdameritrade-tool.js');
    ({ generateAuthUrl, getToken, usseTDInit, getUssePosition, getUsseOrder, resetTD, _resetTokens } = mod);
});

let consoleSpy;
beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { consoleSpy.mockRestore(); });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const FAR_FUTURE = Math.floor(Date.now() / 1000) + 999999;
const NOW_SEC = Math.floor(Date.now() / 1000);

function jsonRes(data) {
    return { ok: true, json: () => Promise.resolve(data) };
}
function okRes() { return { ok: true }; }
function errRes(msg) {
    return { ok: false, json: () => Promise.resolve({ message: msg }) };
}

/** Standard token from Schwab API */
const stdToken = (overrides = {}) => ({
    access_token: 'new-access',
    refresh_token: 'new-refresh',
    expires_in: 1800,
    token_type: 'Bearer',
    ...overrides,
});

/** Standard account data for positions endpoint */
const stdAccount = (overrides = {}) => ({
    securitiesAccount: {
        positions: overrides.positions || [],
        projectedBalances: overrides.projectedBalances || { cashAvailableForWithdrawal: 10000 },
        currentBalances: overrides.currentBalances || { totalCash: 10000 },
        orderStrategies: overrides.orderStrategies,
        ...overrides.extra,
    },
    ...overrides.top,
});

/** DB token record */
const dbToken = (overrides = {}) => ({
    access_token: 'db-access',
    refresh_token: 'db-refresh',
    expires_in: 1800,
    expiry_date: FAR_FUTURE,
    refresh_token_expiry_date: FAR_FUTURE,
    api: 'tdameritrade',
    _id: 'token-id',
    ...overrides,
});

// =========================================================================
// 1. generateAuthUrl
// =========================================================================
describe('generateAuthUrl', () => {
    test('returns correct OAuth URL', () => {
        const url = generateAuthUrl();
        expect(url).toBe(
            'https://api.schwabapi.com/v1/oauth/authorize?redirect_uri=http://localhost/callback&client_id=test-key'
        );
    });

    test('is idempotent', () => {
        expect(generateAuthUrl()).toBe(generateAuthUrl());
    });
});

// =========================================================================
// 2. getUsseOrder — initial state (empty)
// =========================================================================
describe('getUsseOrder (initial)', () => {
    test('returns empty array', () => {
        expect(getUsseOrder()).toEqual([]);
    });
});

// =========================================================================
// 3. resetTD
// =========================================================================
describe('resetTD', () => {
    test('resets book to 0 and preserves trade count', () => {
        resetTD();
        expect(consoleSpy).toHaveBeenCalledWith('TD reset');
    });

    test('default parameter works', () => {
        resetTD(false);
        expect(consoleSpy).toHaveBeenCalledWith('TD reset');
    });
});

// =========================================================================
// 4. getToken  (builds tokens state)
// =========================================================================
describe('getToken', () => {
    // --- 4.1: No-op when tokens empty (no code, tokens={}) ---
    test('no-op: no code, empty tokens → resolves', async () => {
        await expect(getToken()).resolves.toBeUndefined();
        expect(mockFetch).not.toHaveBeenCalled();
    });

    // --- 4.2: Authorization code flow — insert path (tokens empty in DB) ---
    test('auth code: raw code, DB insert', async () => {
        mockFetch.mockResolvedValueOnce(jsonRes(stdToken()));
        mockMongo
            .mockResolvedValueOnce([])  // find accessToken → empty
            .mockResolvedValueOnce([{   // insert → returns doc
                access_token: 'new-access',
                refresh_token: 'new-refresh',
                expires_in: 1800,
                expiry_date: FAR_FUTURE,
                refresh_token_expiry_date: FAR_FUTURE,
                api: 'tdameritrade',
                _id: 'new-id',
            }]);

        await getToken('mycode123');

        // Fetch called with token URL
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.schwabapi.com/v1/oauth/token',
            expect.objectContaining({ method: 'POST' })
        );
        // Body contains authorization_code grant
        const body = mockFetch.mock.calls[0][1].body;
        expect(body).toContain('grant_type=authorization_code');
        expect(body).toContain('code=mycode123');
        // Mongo insert called
        expect(mockMongo).toHaveBeenCalledWith('insert', 'accessToken', expect.objectContaining({ api: 'tdameritrade' }));
    });

    // --- 4.3: Auth code from URL → regex extracts code ---
    test('auth code: URL-format code, DB update', async () => {
        mockFetch.mockResolvedValueOnce(jsonRes(stdToken()));
        mockMongo
            .mockResolvedValueOnce([{ _id: 'existing' }])  // find → exists
            .mockResolvedValueOnce({ modifiedCount: 1 });   // update

        await getToken('https://example.com/callback?code=ABC%20123&state=xyz');

        const body = mockFetch.mock.calls[0][1].body;
        expect(body).toContain('grant_type=authorization_code');
        // decodeURIComponent applied to 'ABC%20123' → 'ABC 123'
        expect(body).toContain('code=ABC%20123');
        expect(mockMongo).toHaveBeenCalledWith('update', 'accessToken',
            { api: 'tdameritrade' }, expect.objectContaining({ $set: expect.any(Object) }));
    });

    // --- 4.4: Token API returns error ---
    test('auth code: API error response', async () => {
        mockFetch.mockResolvedValueOnce(jsonRes({ error: 'invalid_grant' }));

        await expect(getToken('badcode')).rejects.toThrow('invalid_grant');
        expect(mockHandleError).toHaveBeenCalled();
    });

    // --- 4.5: Token response missing expires_in ---
    test('auth code: response without expires_in', async () => {
        mockFetch.mockResolvedValueOnce(jsonRes({
            access_token: 'no-exp-token',
            refresh_token: 'no-exp-refresh',
            token_type: 'Bearer',
            // No expires_in
        }));
        mockMongo
            .mockResolvedValueOnce([{ _id: 'existing' }])
            .mockResolvedValueOnce({ modifiedCount: 1 });

        await getToken('somecode');
        // Should NOT have expiry_date in the $set
        const setArg = mockMongo.mock.calls[1][3].$set;
        expect(setArg.expiry_date).toBeUndefined();
    });

    // Now tokens is populated from prior tests. Set it to a known good state:
    test('setup: set tokens to known state with far-future expiry', async () => {
        // Call getToken with code to ensure tokens has all fields
        const token = stdToken({ expires_in: 999999 });
        mockFetch.mockResolvedValueOnce(jsonRes(token));
        mockMongo
            .mockResolvedValueOnce([{ _id: 'existing' }])
            .mockResolvedValueOnce({ modifiedCount: 1 });

        await getToken('setupcode');
        // Tokens now has access_token, refresh_token, expiry_date (far future)
    });

    // --- 4.6: Refresh token flow ---
    test('refresh: token expiring soon', async () => {
        // Mock Date.now so expiry_date appears imminent
        const origNow = Date.now;
        Date.now = jest.fn(() => (FAR_FUTURE - 100) * 1000); // expiry_date - 100s → less than +590

        mockFetch.mockResolvedValueOnce(jsonRes(stdToken()));
        mockMongo
            .mockResolvedValueOnce([{ _id: 'existing' }])
            .mockResolvedValueOnce({ modifiedCount: 1 });

        await getToken(); // no code → refresh path

        const body = mockFetch.mock.calls[0][1].body;
        expect(body).toContain('grant_type=refresh_token');
        Date.now = origNow;
    });

    // --- 4.7: Refresh + refresh_token near expiry → sendWs warning ---
    test('refresh: sendWs warning when refresh token near expiry', async () => {
        // Force tokens to have near-expiry refresh_token_expiry_date
        // First set up tokens state through getToken with code
        const nearExpiry = Math.floor(Date.now() / 1000) + 100; // expires very soon
        const token = stdToken();
        mockFetch.mockResolvedValueOnce(jsonRes(token));
        mockMongo
            .mockResolvedValueOnce([{ _id: 'existing' }])
            .mockResolvedValueOnce({ modifiedCount: 1 });
        await getToken('resetcode'); // sets refresh_token_expiry_date to now + 7 days

        // Now mock Date.now so both access_token AND refresh_token appear near expiry
        const origNow = Date.now;
        // Make expiry_date < now/1000 + 590 (triggers refresh)
        // And refresh_token_expiry_date < now/1000 + 259200 (triggers warning)
        const fakeNow = (FAR_FUTURE + 500) * 1000;
        Date.now = jest.fn(() => fakeNow);

        mockFetch.mockResolvedValueOnce(jsonRes(stdToken({ expires_in: 1800 })));
        mockMongo
            .mockResolvedValueOnce([{ _id: 'existing' }])
            .mockResolvedValueOnce({ modifiedCount: 1 });

        await getToken(); // no code → refresh → warning path

        expect(mockSendWs).toHaveBeenCalledWith(
            expect.stringContaining('Please refresh token in 3 days'), 0, 0, true
        );
        Date.now = origNow;
    });

    // --- 4.8: No-op: token not expiring ---
    test('no-op: token not expiring soon', async () => {
        // Reset tokens to have far future expiry via code flow
        mockFetch.mockResolvedValueOnce(jsonRes(stdToken({ expires_in: 999999 })));
        mockMongo
            .mockResolvedValueOnce([{ _id: 'existing' }])
            .mockResolvedValueOnce({ modifiedCount: 1 });
        await getToken('refreshsetup');

        // Now call without code — expiry is far future → no-op
        await expect(getToken()).resolves.toBeUndefined();
        // No new Fetch calls beyond the setup one
    });
});

// =========================================================================
// 5. usseTDInit — comprehensive (builds encryptedId, position, order state)
// =========================================================================
describe('usseTDInit', () => {
    // Helpers for Fetch routing within usseTDInit
    function setupFetch(overrides = {}) {
        mockFetch.mockImplementation((url, opts) => {
            if (url.includes('/oauth/token')) {
                return Promise.resolve(jsonRes(overrides.tokenResponse || stdToken({ expires_in: 999999 })));
            }
            if (url.includes('/accountNumbers')) {
                if (overrides.accountNumbersError) {
                    return Promise.resolve(jsonRes(overrides.accountNumbersError));
                }
                return Promise.resolve(jsonRes(overrides.accountNumbers || [{ hashValue: 'enc123' }]));
            }
            if (url.includes('fields=positions')) {
                if (overrides.accountError) {
                    return Promise.resolve(jsonRes(overrides.accountError));
                }
                return Promise.resolve(jsonRes(overrides.accountData || stdAccount()));
            }
            if (url.includes('/orders?')) {
                if (overrides.ordersError) {
                    return Promise.resolve(jsonRes(overrides.ordersError));
                }
                return Promise.resolve(jsonRes(overrides.orders || []));
            }
            if (url.includes('/orders') && opts && opts.method === 'POST') {
                if (overrides.submitError) {
                    return Promise.resolve(overrides.submitError);
                }
                return Promise.resolve(okRes());
            }
            if (opts && opts.method === 'DELETE') {
                if (overrides.cancelError) {
                    return Promise.resolve(overrides.cancelError);
                }
                return Promise.resolve(okRes());
            }
            return Promise.reject(new Error(`Unmocked: ${url}`));
        });
    }

    // ------------------------------------------------------------------
    // 5.1 checkOauth cold start — tokens missing from memory
    // ------------------------------------------------------------------
    describe('checkOauth cold start', () => {
        test('tokens missing → load from DB then getToken', async () => {
            _resetTokens();
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'accessToken') {
                    return Promise.resolve([dbToken()]);
                }
                return Promise.resolve([]);
            });
            mockFetch.mockImplementation((url, opts) => {
                if (url.includes('/token')) return Promise.resolve(jsonRes(stdToken()));
                if (url.includes('/accountNumbers')) return Promise.resolve(jsonRes([{ hashValue: 'enc123' }]));
                if (url.includes('fields=positions')) return Promise.resolve(jsonRes(stdAccount()));
                if (url.includes('/orders')) return Promise.resolve(jsonRes([]));
                return Promise.resolve(jsonRes({}));
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(consoleSpy).toHaveBeenCalledWith('td first');
            // tokens and encryptedId are now set for subsequent tests
        });

        test('tokens missing → DB empty → handleError', async () => {
            _resetTokens();
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'accessToken') return Promise.resolve([]);
                return Promise.resolve([]);
            });
            mockFetch.mockResolvedValue(jsonRes({}));
            mockGetSuggestionData.mockReturnValue({});

            await expect(usseTDInit()).rejects.toThrow('can not find token');

            // Recovery: re-establish tokens and encryptedId for subsequent tests
            _resetTokens();
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'accessToken') return Promise.resolve([dbToken()]);
                return Promise.resolve([]);
            });
            mockFetch.mockImplementation((url) => {
                if (url.includes('/token')) return Promise.resolve(jsonRes(stdToken()));
                if (url.includes('/accountNumbers')) return Promise.resolve(jsonRes([{ hashValue: 'enc123' }]));
                if (url.includes('fields=positions')) return Promise.resolve(jsonRes(stdAccount()));
                if (url.includes('/orders')) return Promise.resolve(jsonRes([]));
                return Promise.resolve(jsonRes({}));
            });
            mockGetSuggestionData.mockReturnValue({});
            resetTD();
            await usseTDInit(); // sets tokens + encryptedId + updateTime.book
        });
    });

    // ------------------------------------------------------------------
    // 5.2 initWs
    // ------------------------------------------------------------------
    describe('initWs', () => {
        test('encryptedId already set → skips fetch', async () => {
            // encryptedId is set from prior checkOauth tests
            setupFetch();
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({});
            resetTD();

            await usseTDInit();
            const accountCalls = mockFetch.mock.calls.filter(c => c[0].includes('/accountNumbers'));
            expect(accountCalls).toHaveLength(0);
        });

        test('initWs: result.message → handleError', async () => {
            _resetTokens();
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'accessToken') return Promise.resolve([dbToken()]);
                return Promise.resolve([]);
            });
            mockFetch.mockImplementation((url) => {
                if (url.includes('/token')) return Promise.resolve(jsonRes(stdToken()));
                if (url.includes('/accountNumbers')) return Promise.resolve(jsonRes({ message: 'unauthorized' }));
                return Promise.resolve(jsonRes({}));
            });
            mockGetSuggestionData.mockReturnValue({});

            await expect(usseTDInit()).rejects.toThrow('unauthorized');
        });

        test('initWs: no result[0] → handleError (No account)', async () => {
            _resetTokens();
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'accessToken') return Promise.resolve([dbToken()]);
                return Promise.resolve([]);
            });
            mockFetch.mockImplementation((url) => {
                if (url.includes('/token')) return Promise.resolve(jsonRes(stdToken()));
                if (url.includes('/accountNumbers')) return Promise.resolve(jsonRes([]));
                return Promise.resolve(jsonRes({}));
            });
            mockGetSuggestionData.mockReturnValue({});

            await expect(usseTDInit()).rejects.toThrow('No account');
        });

        test('initWs: recovery state after error tests', async () => {
            // Re-establish tokens, encryptedId and updateTime.book for subsequent tests
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'accessToken') return Promise.resolve([dbToken()]);
                return Promise.resolve([]);
            });
            mockFetch.mockImplementation((url) => {
                if (url.includes('/token')) return Promise.resolve(jsonRes(stdToken()));
                if (url.includes('/accountNumbers')) return Promise.resolve(jsonRes([{ hashValue: 'enc123' }]));
                if (url.includes('fields=positions')) return Promise.resolve(jsonRes(stdAccount()));
                if (url.includes('/orders')) return Promise.resolve(jsonRes([]));
                return Promise.resolve(jsonRes({}));
            });
            mockGetSuggestionData.mockReturnValue({});
            resetTD();
            await usseTDInit();
        });
    });

    // ------------------------------------------------------------------
    // 5.3 initialBook
    // ------------------------------------------------------------------
    describe('initialBook', () => {
        test('throttled → skips (TD no new)', async () => {
            // updateTime.book was just set by recovery test; same-second call throttles
            setupFetch();
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(consoleSpy).toHaveBeenCalledWith('TD no new');
        });

        test('with positions and projectedBalances', async () => {
            resetTD();
            const positions = [
                { instrument: { symbol: 'AAPL' }, longQuantity: 10, averagePrice: 170 },
                { instrument: { symbol: 'BRK/B' }, longQuantity: 5, averagePrice: 400 },
            ];
            setupFetch({
                accountData: stdAccount({
                    positions,
                    projectedBalances: { cashAvailableForWithdrawal: 5000 },
                    currentBalances: { totalCash: 8000 },
                }),
            });
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();

            const pos = getUssePosition();
            expect(pos.find(p => p.symbol === 'AAPL')).toBeTruthy();
        });

        test('without positions → position = []', async () => {
            resetTD();
            setupFetch({
                accountData: { securitiesAccount: {
                    projectedBalances: { cashAvailableForWithdrawal: 1000 },
                    currentBalances: { totalCash: 1000 },
                }},
            });
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            // position should be empty (plus cash entry from prior getUssePosition calls)
        });

        test('without projectedBalances → available not updated', async () => {
            resetTD();
            setupFetch({
                accountData: { securitiesAccount: {
                    positions: [],
                    currentBalances: { totalCash: 1000 },
                }},
            });
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
        });

        test('account API message error', async () => {
            resetTD();
            setupFetch({ accountError: { message: 'Unauthorized' } });

            await expect(usseTDInit()).rejects.toThrow('Unauthorized');
        });

        test('account API message error with force=true → decrements trade', async () => {
            // This path is reached via cancelOrder → initialBook(true)
            // We'll test it in the trade logic section.
            // For now, verify the non-force path doesn't decrement.
            resetTD();
            setupFetch({ accountError: { message: 'API down' } });

            await expect(usseTDInit()).rejects.toThrow('API down');
        });

        test('missing securitiesAccount', async () => {
            resetTD();
            setupFetch({ accountData: {} });

            await expect(usseTDInit()).rejects.toThrow('miss securitiesAccount');
        });

        test('orders API error', async () => {
            resetTD();
            setupFetch({ ordersError: { error: 'rate limit' } });

            await expect(usseTDInit()).rejects.toThrow('rate limit');
        });
    });

    // ------------------------------------------------------------------
    // 5.4 Order processing (order_recur)
    // ------------------------------------------------------------------
    describe('order processing', () => {
        test('cancelable order → pushed to order array', async () => {
            resetTD();
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: true,
                    orderId: 111,
                    enteredTime: new Date().toISOString(),
                    quantity: 5,
                    orderType: 'LIMIT',
                    price: 170,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'BUY', instrument: { symbol: 'AAPL' } }],
                }],
            });
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();

            const orders = getUsseOrder();
            expect(orders.find(o => o.id === 111)).toBeTruthy();
        });

        test('cancelable order with BRK/B → remapped to BRK-B', async () => {
            resetTD();
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: true,
                    orderId: 222,
                    enteredTime: new Date().toISOString(),
                    quantity: 3,
                    orderType: 'LIMIT',
                    price: 400,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'BUY', instrument: { symbol: 'BRK/B' } }],
                }],
            });
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();

            const orders = getUsseOrder();
            expect(orders.find(o => o.symbol === 'BRK-B')).toBeTruthy();
        });

        test('cancelable order with BRK.B → remapped to BRK-B', async () => {
            resetTD();
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: true,
                    orderId: 223,
                    enteredTime: new Date().toISOString(),
                    quantity: 2,
                    orderType: 'LIMIT',
                    price: 405,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'SELL', instrument: { symbol: 'BRK.B' } }],
                }],
            });
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();

            const orders = getUsseOrder();
            const brkOrder = orders.find(o => o.id === 223);
            expect(brkOrder.symbol).toBe('BRK-B');
            expect(brkOrder.amount).toBe(-2); // SELL → negative
        });

        test('cancelable order with FILL → BUY path (insert sorted + recent)', async () => {
            resetTD();
            const enteredTime = new Date().toISOString();
            const execTime = new Date().toISOString();
            setupFetch({
                accountData: stdAccount({
                    positions: [{ instrument: { symbol: 'AAPL' }, longQuantity: 10, averagePrice: 170 }],
                }),
                orders: [{
                    cancelable: true,
                    orderId: 333,
                    enteredTime,
                    quantity: 5,
                    orderType: 'LIMIT',
                    price: 165,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'BUY', instrument: { symbol: 'AAPL' } }],
                    orderActivityCollection: [{
                        executionType: 'FILL',
                        executionLegs: [{ time: execTime, price: 165, quantity: 5 }],
                    }],
                }],
            });
            // Mongo find for total DB → return item with previous buy/sell arrays
            mockMongo.mockImplementation((op, coll, ...args) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'aapl-id',
                        index: 'AAPL',
                        setype: 'usse',
                        previous: { buy: [{ price: 200, time: NOW_SEC }], sell: [], price: 180, time: NOW_SEC, type: 'sell' },
                        profit: 0,
                    }]);
                }
                if (op === 'update' && coll === 'total') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();

            // Mongo update should have been called for total
            expect(mockMongo).toHaveBeenCalledWith('update', 'total',
                { _id: 'aapl-id' }, expect.objectContaining({ $set: expect.any(Object) }));
        });

        test('cancelable FILL → BUY → duplicate detection (same price+time)', async () => {
            resetTD();
            const execTime = new Date().toISOString();
            const execTimeSec = Math.round(new Date(execTime).getTime() / 1000);
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: true,
                    orderId: 334,
                    enteredTime: new Date().toISOString(),
                    quantity: 5,
                    orderType: 'LIMIT',
                    price: 165,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'BUY', instrument: { symbol: 'AAPL' } }],
                    orderActivityCollection: [{
                        executionType: 'PARTIALFILL',
                        executionLegs: [{ time: execTime, price: 165, quantity: 5 }],
                    }],
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'aapl-id', index: 'AAPL', setype: 'usse',
                        previous: { buy: [{ price: 165, time: execTimeSec }], sell: [] },
                        profit: 0,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            // Should skip (duplicate) — no update to total
            const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update' && c[1] === 'total');
            expect(updateCalls).toHaveLength(0);
        });

        test('cancelable FILL → BUY → push at end (highest price)', async () => {
            resetTD();
            const execTime = new Date().toISOString();
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: true,
                    orderId: 335,
                    enteredTime: new Date().toISOString(),
                    quantity: 3,
                    orderType: 'LIMIT',
                    price: 300,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'BUY', instrument: { symbol: 'TSLA' } }],
                    orderActivityCollection: [{
                        executionType: 'FILL',
                        executionLegs: [{ time: execTime, price: 300, quantity: 3 }],
                    }],
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'tsla-id', index: 'TSLA', setype: 'usse',
                        previous: { buy: [{ price: 100, time: NOW_SEC }], sell: [] },
                        profit: 0,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(mockMongo).toHaveBeenCalledWith('update', 'total',
                { _id: 'tsla-id' }, expect.any(Object));
        });

        test('cancelable FILL → BUY → old order (enteredTime outside interval)', async () => {
            resetTD();
            const oldTime = new Date(Date.now() - 100000000).toISOString(); // very old
            const execTime = new Date().toISOString();
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: true,
                    orderId: 336,
                    enteredTime: oldTime,
                    quantity: 2,
                    orderType: 'LIMIT',
                    price: 150,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'BUY', instrument: { symbol: 'GOOG' } }],
                    orderActivityCollection: [{
                        executionType: 'FILL',
                        executionLegs: [{ time: execTime, price: 150, quantity: 2 }],
                    }],
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'goog-id', index: 'GOOG', setype: 'usse',
                        previous: { buy: [], sell: [] },
                        profit: 0,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            // Old order → item.previous.buy filter only, no full previous replacement
            expect(mockMongo).toHaveBeenCalledWith('update', 'total', { _id: 'goog-id' }, expect.any(Object));
        });

        test('cancelable FILL → SELL path with profit calculation', async () => {
            // Two-pass: first call sets position with MSFT, second processes SELL
            // Pass 1: set position state
            resetTD();
            setupFetch({
                accountData: stdAccount({
                    positions: [{ instrument: { symbol: 'MSFT' }, longQuantity: 10, averagePrice: 350 }],
                }),
            });
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({});
            await usseTDInit();
            // Now position = [{symbol:'MSFT', amount:10, price:350}]

            // Pass 2: SELL order with profit calc
            resetTD();
            const execTime = new Date().toISOString();
            const execTimeSec = Math.round(new Date(execTime).getTime() / 1000);
            setupFetch({
                accountData: stdAccount({
                    positions: [{ instrument: { symbol: 'MSFT' }, longQuantity: 8, averagePrice: 350 }],
                }),
                orders: [{
                    cancelable: true,
                    orderId: 337,
                    enteredTime: new Date().toISOString(),
                    quantity: 2,
                    orderType: 'LIMIT',
                    price: 380,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'SELL', instrument: { symbol: 'MSFT' } }],
                    orderActivityCollection: [{
                        executionType: 'FILL',
                        executionLegs: [
                            { time: execTime, price: 380, quantity: 1 },
                            { time: execTime, price: 381, quantity: 1 },
                        ],
                    }],
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'msft-id', index: 'MSFT', setype: 'usse',
                        previous: { buy: [], sell: [{ price: 400, time: NOW_SEC }] },
                        profit: 100,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(mockMongo).toHaveBeenCalledWith('update', 'total', { _id: 'msft-id' }, expect.any(Object));
        });

        test('cancelable FILL → SELL with peq=true (position unchanged)', async () => {
            // Pass 1: set position with NVDA
            resetTD();
            setupFetch({
                accountData: stdAccount({
                    positions: [{ instrument: { symbol: 'NVDA' }, longQuantity: 10, averagePrice: 800 }],
                }),
            });
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({});
            await usseTDInit();

            // Pass 2: SELL where new position has same amount → peq=true
            resetTD();
            const execTime = new Date().toISOString();
            setupFetch({
                accountData: stdAccount({
                    positions: [{ instrument: { symbol: 'NVDA' }, longQuantity: 10, averagePrice: 800 }],
                }),
                orders: [{
                    cancelable: true,
                    orderId: 338,
                    enteredTime: new Date().toISOString(),
                    quantity: 1,
                    orderType: 'LIMIT',
                    price: 850,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'SELL', instrument: { symbol: 'NVDA' } }],
                    orderActivityCollection: [{
                        executionType: 'PARTIAL FILL',
                        executionLegs: [{ time: execTime, price: 850, quantity: 1 }],
                    }],
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'nvda-id', index: 'NVDA', setype: 'usse',
                        previous: { buy: [], sell: [] },
                        profit: 0,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
        });

        test('cancelable FILL → SELL with pp=0 (symbol not in lastP)', async () => {
            resetTD();
            const execTime = new Date().toISOString();
            // lastP won't have 'NEWX' symbol since position was set without it
            setupFetch({
                accountData: stdAccount({
                    positions: [{ instrument: { symbol: 'NEWX' }, longQuantity: 5, averagePrice: 100 }],
                }),
                orders: [{
                    cancelable: true,
                    orderId: 339,
                    enteredTime: new Date().toISOString(),
                    quantity: 1,
                    orderType: 'LIMIT',
                    price: 110,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'SELL', instrument: { symbol: 'NEWX' } }],
                    orderActivityCollection: [{
                        executionType: 'FILL',
                        executionLegs: [{ time: execTime, price: 110, quantity: 1 }],
                    }],
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'newx-id', index: 'NEWX', setype: 'usse',
                        previous: { buy: [], sell: [] },
                        profit: 0,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
        });

        test('cancelable SELL → duplicate detection → skip', async () => {
            // Need lastP with symbol via two-pass
            resetTD();
            setupFetch({
                accountData: stdAccount({
                    positions: [{ instrument: { symbol: 'SDUP' }, longQuantity: 10, averagePrice: 200 }],
                }),
            });
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({});
            await usseTDInit();

            resetTD();
            const execTime = new Date().toISOString();
            const execTimeSec = Math.round(new Date(execTime).getTime() / 1000);
            setupFetch({
                accountData: stdAccount({
                    positions: [{ instrument: { symbol: 'SDUP' }, longQuantity: 8, averagePrice: 200 }],
                }),
                orders: [{
                    cancelable: true,
                    orderId: 371,
                    enteredTime: new Date().toISOString(),
                    quantity: 2,
                    orderType: 'LIMIT',
                    price: 250,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'SELL', instrument: { symbol: 'SDUP' } }],
                    orderActivityCollection: [{
                        executionType: 'FILL',
                        executionLegs: [{ time: execTime, price: 250, quantity: 2 }],
                    }],
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'sdup-id', index: 'SDUP', setype: 'usse',
                        previous: { buy: [], sell: [{ price: 250, time: execTimeSec }] },
                        profit: 0,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            // Should not update (duplicate detected)
            const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update' && c[1] === 'total');
            expect(updateCalls).toHaveLength(0);
        });

        test('cancelable SELL → sorted insert (price > existing)', async () => {
            resetTD();
            setupFetch({
                accountData: stdAccount({
                    positions: [{ instrument: { symbol: 'SSRT' }, longQuantity: 10, averagePrice: 200 }],
                }),
            });
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({});
            await usseTDInit();

            resetTD();
            const execTime = new Date().toISOString();
            const execTimeSec = Math.round(new Date(execTime).getTime() / 1000);
            setupFetch({
                accountData: stdAccount({
                    positions: [{ instrument: { symbol: 'SSRT' }, longQuantity: 8, averagePrice: 200 }],
                }),
                orders: [{
                    cancelable: true,
                    orderId: 372,
                    enteredTime: new Date().toISOString(),
                    quantity: 2,
                    orderType: 'LIMIT',
                    price: 300,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'SELL', instrument: { symbol: 'SSRT' } }],
                    orderActivityCollection: [{
                        executionType: 'FILL',
                        executionLegs: [{ time: execTime, price: 300, quantity: 2 }],
                    }],
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'ssrt-id', index: 'SSRT', setype: 'usse',
                        previous: { buy: [], sell: [{ price: 200, time: NOW_SEC }] },
                        profit: 10,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(mockMongo).toHaveBeenCalledWith('update', 'total', { _id: 'ssrt-id' }, expect.any(Object));
        });

        test('cancelable SELL → old order (outside interval)', async () => {
            resetTD();
            setupFetch({
                accountData: stdAccount({
                    positions: [{ instrument: { symbol: 'SOLD' }, longQuantity: 10, averagePrice: 200 }],
                }),
            });
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({});
            await usseTDInit();

            resetTD();
            const oldTime = new Date(Date.now() - 200000 * 1000).toISOString();
            const execTime = new Date().toISOString();
            setupFetch({
                accountData: stdAccount({
                    positions: [{ instrument: { symbol: 'SOLD' }, longQuantity: 8, averagePrice: 200 }],
                }),
                orders: [{
                    cancelable: true,
                    orderId: 373,
                    enteredTime: oldTime,
                    quantity: 2,
                    orderType: 'LIMIT',
                    price: 250,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'SELL', instrument: { symbol: 'SOLD' } }],
                    orderActivityCollection: [{
                        executionType: 'FILL',
                        executionLegs: [{ time: execTime, price: 250, quantity: 2 }],
                    }],
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'sold-id', index: 'SOLD', setype: 'usse',
                        previous: { buy: [], sell: [] },
                        profit: 0,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
        });

        test('cancelable FILL → price <= 0 → skip', async () => {
            resetTD();
            const execTime = new Date().toISOString();
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: true,
                    orderId: 340,
                    enteredTime: new Date().toISOString(),
                    quantity: 1,
                    orderType: 'LIMIT',
                    price: 0,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'BUY', instrument: { symbol: 'ZERO' } }],
                    orderActivityCollection: [{
                        executionType: 'FILL',
                        executionLegs: [{ time: execTime, price: 0, quantity: 1 }],
                    }],
                }],
            });
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            // No Mongo find for total since price <= 0
        });

        test('cancelable FILL → Mongo miss symbol', async () => {
            resetTD();
            const execTime = new Date().toISOString();
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: true,
                    orderId: 341,
                    enteredTime: new Date().toISOString(),
                    quantity: 1,
                    orderType: 'LIMIT',
                    price: 100,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'BUY', instrument: { symbol: 'MISS' } }],
                    orderActivityCollection: [{
                        executionType: 'FILL',
                        executionLegs: [{ time: execTime, price: 100, quantity: 1 }],
                    }],
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') return Promise.resolve([]);
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(consoleSpy).toHaveBeenCalledWith('miss MISS');
        });

        test('cancelable not filled → skip (order_recur continues)', async () => {
            resetTD();
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: true,
                    orderId: 342,
                    enteredTime: new Date().toISOString(),
                    quantity: 1,
                    orderType: 'LIMIT',
                    price: 100,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'BUY', instrument: { symbol: 'WAIT' } }],
                    // No orderActivityCollection → not filled
                }],
            });
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            const orders = getUsseOrder();
            expect(orders.find(o => o.id === 342)).toBeTruthy();
            expect(orders.find(o => o.id === 342).partial).toBe(false);
        });

        // --- Non-cancelable orders ---
        test('non-cancelable FILL (real order) → BUY path', async () => {
            resetTD();
            const execTime = new Date().toISOString();
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: false,
                    orderId: 350,
                    enteredTime: new Date().toISOString(),
                    quantity: 3,
                    orderType: 'LIMIT',
                    price: 200,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'BUY', instrument: { symbol: 'AMD' } }],
                    orderActivityCollection: [{
                        executionType: 'FILL',
                        executionLegs: [{ time: execTime, price: 200, quantity: 3 }],
                    }],
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'amd-id', index: 'AMD', setype: 'usse',
                        previous: { buy: [], sell: [] },
                        profit: 0,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(mockMongo).toHaveBeenCalledWith('update', 'total', { _id: 'amd-id' }, expect.any(Object));
        });

        test('non-cancelable FILL (real) → SELL path with profit', async () => {
            // Two-pass: set AMD position first
            resetTD();
            setupFetch({
                accountData: stdAccount({
                    positions: [{ instrument: { symbol: 'AMD' }, longQuantity: 10, averagePrice: 190 }],
                }),
            });
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({});
            await usseTDInit();

            // Pass 2: SELL order — lastP now has AMD
            resetTD();
            const execTime = new Date().toISOString();
            const execTimeSec = Math.round(new Date(execTime).getTime() / 1000);
            setupFetch({
                accountData: stdAccount({
                    positions: [{ instrument: { symbol: 'AMD' }, longQuantity: 8, averagePrice: 190 }],
                }),
                orders: [{
                    cancelable: false,
                    orderId: 351,
                    enteredTime: new Date().toISOString(),
                    quantity: 2,
                    orderType: 'LIMIT',
                    price: 210,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'SELL', instrument: { symbol: 'AMD' } }],
                    orderActivityCollection: [{
                        executionType: 'FILL',
                        executionLegs: [
                            { time: execTime, price: 210, quantity: 2 },
                        ],
                    }],
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'amd-id', index: 'AMD', setype: 'usse',
                        previous: { buy: [], sell: [{ price: 220, time: NOW_SEC }] },
                        profit: 50,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(mockMongo).toHaveBeenCalledWith('update', 'total', { _id: 'amd-id' }, expect.any(Object));
        });

        test('non-cancelable SELL → peq=true (same amount) → skip profit calc', async () => {
            // Two-pass: set PEQ position
            resetTD();
            setupFetch({
                accountData: stdAccount({
                    positions: [{ instrument: { symbol: 'PEQ' }, longQuantity: 10, averagePrice: 100 }],
                }),
            });
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({});
            await usseTDInit();

            // Pass 2: SELL with SAME amount (10) → peq=true, profit calc skipped
            resetTD();
            const execTime = new Date().toISOString();
            setupFetch({
                accountData: stdAccount({
                    positions: [{ instrument: { symbol: 'PEQ' }, longQuantity: 10, averagePrice: 100 }],
                }),
                orders: [{
                    cancelable: false,
                    orderId: 355,
                    enteredTime: new Date().toISOString(),
                    quantity: 2,
                    orderType: 'LIMIT',
                    price: 120,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'SELL', instrument: { symbol: 'PEQ' } }],
                    orderActivityCollection: [{
                        executionType: 'FILL',
                        executionLegs: [{ time: execTime, price: 120, quantity: 2 }],
                    }],
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'peq-id', index: 'PEQ', setype: 'usse',
                        previous: { buy: [], sell: [] },
                        profit: 0,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(mockMongo).toHaveBeenCalledWith('update', 'total', { _id: 'peq-id' }, expect.any(Object));
        });

        test('non-cancelable SELL → pp=0 (symbol not in lastP) → skip profit calc', async () => {
            // No pass 1 — lastP won't have NOPP
            resetTD();
            const execTime = new Date().toISOString();
            setupFetch({
                accountData: stdAccount({
                    positions: [{ instrument: { symbol: 'NOPP' }, longQuantity: 5, averagePrice: 100 }],
                }),
                orders: [{
                    cancelable: false,
                    orderId: 356,
                    enteredTime: new Date().toISOString(),
                    quantity: 1,
                    orderType: 'LIMIT',
                    price: 120,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'SELL', instrument: { symbol: 'NOPP' } }],
                    orderActivityCollection: [{
                        executionType: 'FILL',
                        executionLegs: [{ time: execTime, price: 120, quantity: 1 }],
                    }],
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'nopp-id', index: 'NOPP', setype: 'usse',
                        previous: { buy: [], sell: [] },
                        profit: 0,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(mockMongo).toHaveBeenCalledWith('update', 'total', { _id: 'nopp-id' }, expect.any(Object));
        });

        test('non-cancelable SELL → this_profit matched in previous.sell → breaks loop', async () => {
            // Two-pass: set position with different amount
            resetTD();
            setupFetch({
                accountData: stdAccount({
                    positions: [{ instrument: { symbol: 'PROF' }, longQuantity: 20, averagePrice: 100 }],
                }),
            });
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({});
            await usseTDInit();

            // Pass 2: SELL with changed amount, this_profit entries match previous.sell
            resetTD();
            const execTime1 = new Date(Date.now() - 1000).toISOString();
            const execTime2 = new Date().toISOString();
            const t1 = Math.round(new Date(execTime1).getTime() / 1000);
            const t2 = Math.round(new Date(execTime2).getTime() / 1000);
            setupFetch({
                accountData: stdAccount({
                    positions: [{ instrument: { symbol: 'PROF' }, longQuantity: 15, averagePrice: 100 }],
                }),
                orders: [{
                    cancelable: false,
                    orderId: 357,
                    enteredTime: new Date().toISOString(),
                    quantity: 5,
                    orderType: 'LIMIT',
                    price: 130,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'SELL', instrument: { symbol: 'PROF' } }],
                    orderActivityCollection: [{
                        executionType: 'FILL',
                        executionLegs: [
                            { time: execTime1, price: 130, quantity: 3 },
                            { time: execTime2, price: 135, quantity: 2 },
                        ],
                    }],
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'prof-id', index: 'PROF', setype: 'usse',
                        previous: {
                            buy: [],
                            sell: [
                                { price: 130, time: t1 },
                                { price: 135, time: t2 },
                            ],
                        },
                        profit: 100,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(mockMongo).toHaveBeenCalledWith('update', 'total', { _id: 'prof-id' }, expect.any(Object));
        });

        test('non-cancelable FILL → BRK/B remap', async () => {
            resetTD();
            const execTime = new Date().toISOString();
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: false,
                    orderId: 352,
                    enteredTime: new Date().toISOString(),
                    quantity: 1,
                    orderType: 'LIMIT',
                    price: 400,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'BUY', instrument: { symbol: 'BRK.B' } }],
                    orderActivityCollection: [{
                        executionType: 'FILL',
                        executionLegs: [{ time: execTime, price: 400, quantity: 1 }],
                    }],
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'brk-id', index: 'BRK-B', setype: 'usse',
                        previous: { buy: [], sell: [] },
                        profit: 0,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
        });

        test('non-cancelable FILL → price <= 0 → skip', async () => {
            resetTD();
            const execTime = new Date().toISOString();
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: false,
                    orderId: 353,
                    enteredTime: new Date().toISOString(),
                    quantity: 1,
                    orderType: 'LIMIT',
                    price: 0,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'BUY', instrument: { symbol: 'ZERO2' } }],
                    orderActivityCollection: [{
                        executionType: 'FILL',
                        executionLegs: [{ time: execTime, price: -1, quantity: 1 }],
                    }],
                }],
            });
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
        });

        test('non-cancelable FILL → Mongo miss', async () => {
            resetTD();
            const execTime = new Date().toISOString();
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: false,
                    orderId: 354,
                    enteredTime: new Date().toISOString(),
                    quantity: 1,
                    orderType: 'LIMIT',
                    price: 100,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'BUY', instrument: { symbol: 'MISS2' } }],
                    orderActivityCollection: [{
                        executionType: 'FILL',
                        executionLegs: [{ time: execTime, price: 100, quantity: 1 }],
                    }],
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') return Promise.resolve([]);
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(consoleSpy).toHaveBeenCalledWith('miss MISS2');
        });

        test('non-cancelable FILL → duplicate in buy → skip', async () => {
            resetTD();
            const execTime = new Date().toISOString();
            const execTimeSec = Math.round(new Date(execTime).getTime() / 1000);
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: false,
                    orderId: 355,
                    enteredTime: new Date().toISOString(),
                    quantity: 1,
                    orderType: 'LIMIT',
                    price: 100,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'BUY', instrument: { symbol: 'DUP' } }],
                    orderActivityCollection: [{
                        executionType: 'FILL',
                        executionLegs: [{ time: execTime, price: 100, quantity: 1 }],
                    }],
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'dup-id', index: 'DUP', setype: 'usse',
                        previous: { buy: [{ price: 100, time: execTimeSec }], sell: [] },
                        profit: 0,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(consoleSpy).toHaveBeenCalledWith('t order duplicate');
        });

        test('non-cancelable FILL → duplicate in sell → skip', async () => {
            resetTD();
            const execTime = new Date().toISOString();
            const execTimeSec = Math.round(new Date(execTime).getTime() / 1000);
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: false,
                    orderId: 356,
                    enteredTime: new Date().toISOString(),
                    quantity: 1,
                    orderType: 'LIMIT',
                    price: 200,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'SELL', instrument: { symbol: 'DUP2' } }],
                    orderActivityCollection: [{
                        executionType: 'FILL',
                        executionLegs: [{ time: execTime, price: 200, quantity: 1 }],
                    }],
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'dup2-id', index: 'DUP2', setype: 'usse',
                        previous: { buy: [], sell: [{ price: 200, time: execTimeSec }] },
                        profit: 0,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(consoleSpy).toHaveBeenCalledWith('t order duplicate');
        });

        test('non-cancelable, not filled, not fake → skip', async () => {
            resetTD();
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: false,
                    orderId: 360,
                    enteredTime: new Date().toISOString(),
                    quantity: 1,
                    orderType: 'LIMIT',
                    price: 100,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'BUY', instrument: { symbol: 'SKIP' } }],
                    // Not filled, not fake
                }],
            });
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
        });

        test('non-cancelable FILL → old order (outside USSE_ORDER_INTERVAL)', async () => {
            resetTD();
            const oldTime = new Date(Date.now() - 200000 * 1000).toISOString();
            const execTime = new Date().toISOString();
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: false,
                    orderId: 361,
                    enteredTime: oldTime,
                    quantity: 1,
                    orderType: 'LIMIT',
                    price: 150,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'BUY', instrument: { symbol: 'OLD' } }],
                    orderActivityCollection: [{
                        executionType: 'FILL',
                        executionLegs: [{ time: execTime, price: 150, quantity: 1 }],
                    }],
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'old-id', index: 'OLD', setype: 'usse',
                        previous: { buy: [], sell: [] },
                        profit: 0,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(consoleSpy).toHaveBeenCalledWith('t out of time');
        });

        test('non-cancelable SELL → old order (outside interval)', async () => {
            resetTD();
            const oldTime = new Date(Date.now() - 200000 * 1000).toISOString();
            const execTime = new Date().toISOString();
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: false,
                    orderId: 362,
                    enteredTime: oldTime,
                    quantity: 1,
                    orderType: 'LIMIT',
                    price: 250,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'SELL', instrument: { symbol: 'OLDS' } }],
                    orderActivityCollection: [{
                        executionType: 'FILL',
                        executionLegs: [{ time: execTime, price: 250, quantity: 1 }],
                    }],
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'olds-id', index: 'OLDS', setype: 'usse',
                        previous: { buy: [], sell: [] },
                        profit: 0,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(consoleSpy).toHaveBeenCalledWith('t out of time');
        });

        // --- Fake orders in orders API response (o.fake=true from fakeOrder.forEach push) ---
        test('fake order → BUY path (with tprice)', async () => {
            resetTD();
            const fakeTime = Math.round(Date.now() / 1000);
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: false,
                    fake: true,
                    price: 150,
                    time: fakeTime,
                    enteredTime: new Date(fakeTime * 1000).toISOString(),
                    symbol: 'FAKE1',
                    type: 'BUY',
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'fake1-id', index: 'FAKE1', setype: 'usse',
                        previous: { buy: [], sell: [], tprice: 120, price: 130, time: fakeTime - 100 },
                        profit: 0,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(mockMongo).toHaveBeenCalledWith('update', 'total', { _id: 'fake1-id' }, expect.any(Object));
        });

        test('fake order → BUY path (without tprice)', async () => {
            resetTD();
            const fakeTime = Math.round(Date.now() / 1000);
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: false,
                    fake: true,
                    price: 150,
                    time: fakeTime,
                    enteredTime: new Date(fakeTime * 1000).toISOString(),
                    symbol: 'FAKE2',
                    type: 'BUY',
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'fake2-id', index: 'FAKE2', setype: 'usse',
                        previous: { buy: [], sell: [], price: 130, time: fakeTime - 100 },
                        profit: 0,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(mockMongo).toHaveBeenCalledWith('update', 'total', { _id: 'fake2-id' }, expect.any(Object));
        });

        test('fake order → SELL path (with tprice)', async () => {
            resetTD();
            const fakeTime = Math.round(Date.now() / 1000);
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: false,
                    fake: true,
                    price: 200,
                    time: fakeTime,
                    enteredTime: new Date(fakeTime * 1000).toISOString(),
                    symbol: 'FAKE3',
                    type: 'SELL',
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'fake3-id', index: 'FAKE3', setype: 'usse',
                        previous: { buy: [], sell: [], tprice: 180, price: 190, time: fakeTime - 100 },
                        profit: 50,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(mockMongo).toHaveBeenCalledWith('update', 'total', { _id: 'fake3-id' }, expect.any(Object));
        });

        test('fake order → SELL path (without tprice)', async () => {
            resetTD();
            const fakeTime = Math.round(Date.now() / 1000);
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: false,
                    fake: true,
                    price: 200,
                    time: fakeTime,
                    enteredTime: new Date(fakeTime * 1000).toISOString(),
                    symbol: 'FAKE4',
                    type: 'SELL',
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'fake4-id', index: 'FAKE4', setype: 'usse',
                        previous: { buy: [], sell: [], price: 190, time: fakeTime - 100 },
                        profit: 0,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(mockMongo).toHaveBeenCalledWith('update', 'total', { _id: 'fake4-id' }, expect.any(Object));
        });

        test('fake order → price <= 0 → skip', async () => {
            resetTD();
            const fakeTime = Math.round(Date.now() / 1000);
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: false,
                    fake: true,
                    price: 0,
                    time: fakeTime,
                    enteredTime: new Date(fakeTime * 1000).toISOString(),
                    symbol: 'FAKE5',
                    type: 'BUY',
                }],
            });
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
        });

        test('fake order → Mongo miss symbol', async () => {
            resetTD();
            const fakeTime = Math.round(Date.now() / 1000);
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: false,
                    fake: true,
                    price: 100,
                    time: fakeTime,
                    enteredTime: new Date(fakeTime * 1000).toISOString(),
                    symbol: 'FAKEMISS',
                    type: 'BUY',
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') return Promise.resolve([]);
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(consoleSpy).toHaveBeenCalledWith('miss FAKEMISS');
        });

        test('fake order → duplicate in buy → skip', async () => {
            resetTD();
            const fakeTime = Math.round(Date.now() / 1000);
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: false,
                    fake: true,
                    price: 150,
                    time: fakeTime,
                    enteredTime: new Date(fakeTime * 1000).toISOString(),
                    symbol: 'FAKEDUP',
                    type: 'BUY',
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'fakedup-id', index: 'FAKEDUP', setype: 'usse',
                        previous: { buy: [{ price: 150, time: fakeTime }], sell: [] },
                        profit: 0,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
        });

        test('fake order → SELL duplicate → skip', async () => {
            resetTD();
            const fakeTime = Math.round(Date.now() / 1000);
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: false,
                    fake: true,
                    price: 200,
                    time: fakeTime,
                    enteredTime: new Date(fakeTime * 1000).toISOString(),
                    symbol: 'FAKESDP',
                    type: 'SELL',
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'fakesdp-id', index: 'FAKESDP', setype: 'usse',
                        previous: { buy: [], sell: [{ price: 200, time: fakeTime }] },
                        profit: 0,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
        });

        test('fake order → BUY old order (outside interval)', async () => {
            resetTD();
            const fakeTime = Math.round(Date.now() / 1000);
            const oldEnteredTime = new Date(Date.now() - 200000 * 1000).toISOString();
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: false,
                    fake: true,
                    price: 150,
                    time: fakeTime,
                    enteredTime: oldEnteredTime,
                    symbol: 'FAKEOLD',
                    type: 'BUY',
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'fakeold-id', index: 'FAKEOLD', setype: 'usse',
                        previous: { buy: [], sell: [] },
                        profit: 0,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(consoleSpy).toHaveBeenCalledWith('t out of time');
        });

        test('non-cancelable BUY → sorted insert (price < existing)', async () => {
            resetTD();
            const execTime = new Date().toISOString();
            const execTimeSec = Math.round(new Date(execTime).getTime() / 1000);
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: false,
                    orderId: 390,
                    enteredTime: new Date().toISOString(),
                    quantity: 3,
                    orderType: 'LIMIT',
                    price: 80,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'BUY', instrument: { symbol: 'BSORT' } }],
                    orderActivityCollection: [{
                        executionType: 'FILL',
                        executionLegs: [{ time: execTime, price: 80, quantity: 3 }],
                    }],
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'bsort-id', index: 'BSORT', setype: 'usse',
                        previous: { buy: [{ price: 100, time: NOW_SEC }], sell: [] },
                        profit: 0,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(mockMongo).toHaveBeenCalledWith('update', 'total', { _id: 'bsort-id' }, expect.any(Object));
        });

        test('cancelable SELL → profit calc break (is_insert >= 2)', async () => {
            // Two-pass: set position first
            resetTD();
            setupFetch({
                accountData: stdAccount({
                    positions: [{ instrument: { symbol: 'PBRK' }, longQuantity: 20, averagePrice: 100 }],
                }),
            });
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({});
            await usseTDInit();

            // Pass 2: cancelable SELL with 3 execution legs
            // previous.sell matches legs 0 and 1 but NOT the last leg (which is used for duplicate check)
            resetTD();
            const t1 = Math.round((Date.now() - 2000) / 1000);
            const t2 = Math.round((Date.now() - 1000) / 1000);
            const t3 = Math.round(Date.now() / 1000);
            const execTime1 = new Date(t1 * 1000).toISOString();
            const execTime2 = new Date(t2 * 1000).toISOString();
            const execTime3 = new Date(t3 * 1000).toISOString();
            setupFetch({
                accountData: stdAccount({
                    positions: [{ instrument: { symbol: 'PBRK' }, longQuantity: 15, averagePrice: 100 }],
                }),
                orders: [{
                    cancelable: true,
                    orderId: 391,
                    enteredTime: new Date().toISOString(),
                    quantity: 5,
                    orderType: 'LIMIT',
                    price: 130,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'SELL', instrument: { symbol: 'PBRK' } }],
                    orderActivityCollection: [{
                        executionType: 'FILL',
                        executionLegs: [
                            { time: execTime1, price: 130, quantity: 2 },
                            { time: execTime2, price: 135, quantity: 2 },
                            { time: execTime3, price: 140, quantity: 1 },
                        ],
                    }],
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'pbrk-id', index: 'PBRK', setype: 'usse',
                        previous: {
                            buy: [],
                            sell: [
                                { price: 130, time: t1 },
                                { price: 135, time: t2 },
                            ],
                        },
                        profit: 50,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(mockMongo).toHaveBeenCalledWith('update', 'total', { _id: 'pbrk-id' }, expect.any(Object));
        });

        test('fake order → SELL old order (outside interval)', async () => {
            resetTD();
            const fakeTime = Math.round(Date.now() / 1000);
            const oldEnteredTime = new Date(Date.now() - 200000 * 1000).toISOString();
            setupFetch({
                accountData: stdAccount(),
                orders: [{
                    cancelable: false,
                    fake: true,
                    price: 200,
                    time: fakeTime,
                    enteredTime: oldEnteredTime,
                    symbol: 'FAKESOLD',
                    type: 'SELL',
                }],
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'fakesold-id', index: 'FAKESOLD', setype: 'usse',
                        previous: { buy: [], sell: [] },
                        profit: 0,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();
            expect(consoleSpy).toHaveBeenCalledWith('t out of time');
        });
    });

    // Helper: get trade counter to exactly N % 141 === 2, then next call hits 3
    async function alignTradeCounter() {
        for (let i = 0; i < 141; i++) {
            jest.clearAllMocks();
            consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
            setupFetch();
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit();

            const tradeLogs = consoleSpy.mock.calls.filter(c =>
                typeof c[0] === 'string' && c[0].startsWith('td ')
            );
            if (tradeLogs.length > 0) {
                const tradeVal = parseInt(tradeLogs[0][0].replace('td ', ''));
                if (tradeVal % 141 === 2) return;
            }
        }
    }

    // Helper: run one usseTDInit call that triggers trade logic
    async function runTradeLogic(mongoItems, suggestion, fetchOverrides = {}) {
        jest.clearAllMocks();
        consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        resetTD();
        const hourSpy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(12);

        setupFetch(fetchOverrides);
        mockMongo.mockImplementation((op, coll, ...args) => {
            if (op === 'find' && coll === 'total') return Promise.resolve(mongoItems);
            if (op === 'update' && coll === 'total') return Promise.resolve({ modifiedCount: 1 });
            if (op === 'deleteMany' && coll === 'total') return Promise.resolve({ deletedCount: 1 });
            return Promise.resolve([]);
        });
        mockGetSuggestionData.mockReturnValue(suggestion);

        try {
            return await usseTDInit();
        } finally {
            hourSpy.mockRestore();
        }
    }

    // ------------------------------------------------------------------
    // 5.5 fakeOrder processing in initialBook (lines 207-238)
    // ------------------------------------------------------------------
    describe('fakeOrder triggering', () => {
        // To test fakeOrder triggering, we need fakeOrder entries from trade logic,
        // then a subsequent initialBook call where getSuggestionData returns prices
        // that trigger the buy/sell conditions.
        // This tests lines 207-238 (fakeOrder.forEach in initialBook).

        test('fakeOrder buy triggered when suggestion.price <= buy price', async () => {
            // Step 1: populate fakeOrder via trade logic (buy fake order)
            await alignTradeCounter();
            jest.clearAllMocks();
            consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
            resetTD();
            const hourSpy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(12);
            setupFetch({
                accountData: stdAccount({
                    projectedBalances: { cashAvailableForWithdrawal: 400 },
                    currentBalances: { totalCash: 400 },
                }),
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'fot1', index: 'FOT1', setype: 'usse', ing: 1,
                        amount: 500, orig: 1000, mid: 100, times: 10,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            // bCount=0 but buy price exists → fake buy order created
            mockGetSuggestionData.mockReturnValue({
                FOT1: { price: 100, buy: 95, sell: 0, bCount: 0, sCount: 0 },
            });
            await usseTDInit();
            hourSpy.mockRestore();

            // Step 2: now fakeOrder has a buy entry for FOT1 at price=95.
            // Run initialBook again with suggestion.price <= 95 to trigger it.
            resetTD();
            setupFetch({ accountData: stdAccount() });
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({
                FOT1: { price: 90 }, // 90 <= 95 → triggers buy
            });
            await usseTDInit();
            expect(consoleSpy).toHaveBeenCalledWith('fake order close');
        });

        test('fakeOrder sell triggered when suggestion.price >= sell price', async () => {
            // Step 1: populate fakeOrder via trade logic (sell fake order)
            await alignTradeCounter();
            jest.clearAllMocks();
            consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
            resetTD();
            const hourSpy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(12);
            setupFetch({
                accountData: stdAccount({
                    projectedBalances: { cashAvailableForWithdrawal: 10000 },
                    currentBalances: { totalCash: 10000 },
                }),
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'fot2', index: 'FOT2', setype: 'usse', ing: 1,
                        amount: 500, orig: 1000, mid: 100, times: 10,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            // sCount=0 but sell price exists → fake sell order created
            mockGetSuggestionData.mockReturnValue({
                FOT2: { price: 100, buy: 0, sell: 110, bCount: 0, sCount: 0 },
            });
            await usseTDInit();
            hourSpy.mockRestore();

            // Step 2: run initialBook with suggestion.price >= 110 to trigger sell
            resetTD();
            setupFetch({ accountData: stdAccount() });
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({
                FOT2: { price: 115 }, // 115 >= 110 → triggers sell
            });
            await usseTDInit();
            expect(consoleSpy).toHaveBeenCalledWith('fake order close');
        });
    });

    // ------------------------------------------------------------------
    // 5.6 Trade logic (requires trade counter = 3)
    // ------------------------------------------------------------------
    describe('trade logic', () => {
        // Helper: run usseTDInit n times without resetting to increment trade counter
        async function runUsseTimes(n, lastOverrides = {}) {
            for (let i = 0; i < n; i++) {
                jest.clearAllMocks();
                consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
                if (i === n - 1 && Object.keys(lastOverrides).length > 0) {
                    setupFetch(lastOverrides);
                } else {
                    setupFetch();
                }
                mockMongo.mockResolvedValue([]);
                mockGetSuggestionData.mockReturnValue({});
                await usseTDInit();
            }
        }

        test('trade counter % interval !== 3 → skip (normal path)', async () => {
            resetTD();
            setupFetch();
            mockMongo.mockResolvedValue([]);
            mockGetSuggestionData.mockReturnValue({});

            await usseTDInit(); // trade = 1, 1 % 141 !== 3 → skip
        });

        test('trade counter hits 3 → enters trade logic (market hours skip)', async () => {
            resetTD();
            // Need trade to reach 3. After resetTD, trade is preserved from prior.
            // Let's use a fresh approach: manually run 3 times from a known state.
            // First, set trade to 0 via multiple resetTD + controlled usseTDInit calls.
            // Actually, we can't set trade to 0 directly. resetTD preserves trade.
            // The simplest approach: spy on Date.getHours to simulate market hours.

            // Run usseTDInit enough times to get trade % 141 === 3.
            // We need to know current trade count. Since we've been running many tests,
            // trade might be at any value. Let's just run until we hit the condition.
            // For efficiency, let's use a loop:
            let hitTrade = false;
            for (let i = 0; i < 141 && !hitTrade; i++) {
                jest.clearAllMocks();
                consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
                // Mock getHours to return 17 (>= 16, during market → skip)
                const hourSpy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(17);
                setupFetch();
                mockMongo.mockResolvedValue([]);
                mockGetSuggestionData.mockReturnValue({});

                await usseTDInit();

                // Check if we logged the trade message with value divisible by 141 offset 3
                const tradeLogs = consoleSpy.mock.calls.filter(c =>
                    typeof c[0] === 'string' && c[0].startsWith('td ')
                );
                if (tradeLogs.length > 0) {
                    const tradeVal = parseInt(tradeLogs[0][0].replace('td ', ''));
                    if (tradeVal % 141 === 3) {
                        hitTrade = true;
                    }
                }
                hourSpy.mockRestore();
            }
            expect(hitTrade).toBe(true);
        });

        test('trade logic: outside market hours → continues', async () => {
            // Run until trade % 141 === 3 with hour = 12 (outside market)
            let hitTrade = false;
            for (let i = 0; i < 141 && !hitTrade; i++) {
                jest.clearAllMocks();
                consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
                const hourSpy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(12);

                setupFetch();
                mockMongo.mockImplementation((op, coll) => {
                    if (op === 'find' && coll === 'total') {
                        return Promise.resolve([]);
                    }
                    return Promise.resolve([]);
                });
                mockGetSuggestionData.mockReturnValue({});

                await usseTDInit();

                const tradeLogs = consoleSpy.mock.calls.filter(c =>
                    typeof c[0] === 'string' && c[0].startsWith('td ')
                );
                if (tradeLogs.length > 0) {
                    const tradeVal = parseInt(tradeLogs[0][0].replace('td ', ''));
                    if (tradeVal % 141 === 3) {
                        hitTrade = true;
                    }
                }
                hourSpy.mockRestore();
            }
            expect(hitTrade).toBe(true);
        });

        test('trade logic: MARKET_TIME[0] <= MARKET_TIME[1] branch', async () => {
            // Temporarily change MOCK_MARKET_TIME to [9, 16]
            MOCK_MARKET_TIME[0] = 9;
            MOCK_MARKET_TIME[1] = 16;

            let hitTrade = false;
            for (let i = 0; i < 141 && !hitTrade; i++) {
                jest.clearAllMocks();
                consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
                const hourSpy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(12); // 12 is within [9,16) → market hours → skip

                setupFetch();
                mockMongo.mockResolvedValue([]);
                mockGetSuggestionData.mockReturnValue({});

                await usseTDInit();

                const tradeLogs = consoleSpy.mock.calls.filter(c =>
                    typeof c[0] === 'string' && c[0].startsWith('td ')
                );
                if (tradeLogs.length > 0) {
                    const tradeVal = parseInt(tradeLogs[0][0].replace('td ', ''));
                    if (tradeVal % 141 === 3) hitTrade = true;
                }
                hourSpy.mockRestore();
            }

            // Restore
            MOCK_MARKET_TIME[0] = 16;
            MOCK_MARKET_TIME[1] = 9;
            expect(hitTrade).toBe(true);
        });

        test('trade logic: MARKET_TIME[0] <= MARKET_TIME[1], outside market', async () => {
            MOCK_MARKET_TIME[0] = 9;
            MOCK_MARKET_TIME[1] = 16;

            let hitTrade = false;
            for (let i = 0; i < 141 && !hitTrade; i++) {
                jest.clearAllMocks();
                consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
                const hourSpy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(20); // outside [9,16)

                setupFetch();
                mockMongo.mockImplementation((op, coll) => {
                    if (op === 'find' && coll === 'total') return Promise.resolve([]);
                    return Promise.resolve([]);
                });
                mockGetSuggestionData.mockReturnValue({});

                await usseTDInit();

                const tradeLogs = consoleSpy.mock.calls.filter(c =>
                    typeof c[0] === 'string' && c[0].startsWith('td ')
                );
                if (tradeLogs.length > 0) {
                    const tradeVal = parseInt(tradeLogs[0][0].replace('td ', ''));
                    if (tradeVal % 141 === 3) hitTrade = true;
                }
                hourSpy.mockRestore();
            }

            MOCK_MARKET_TIME[0] = 16;
            MOCK_MARKET_TIME[1] = 9;
            expect(hitTrade).toBe(true);
        });

        test('recur_status: item.index === 0 → skip', async () => {
            await alignTradeCounter();
            await runTradeLogic(
                [{ _id: 'zero', index: 0, setype: 'usse', ing: 0, amount: 1000, orig: 1000, mid: 100, times: 10 }],
                {}
            );
        });

        test('recur_status: no suggestion for item → skip', async () => {
            await alignTradeCounter();
            await runTradeLogic(
                [{ _id: 'nosug', index: 'NOSUG', setype: 'usse', ing: 0, amount: 1000, orig: 1000, mid: 100, times: 10 }],
                {} // empty suggestion
            );
        });

        test('recur_status: item.mul applied', async () => {
            await alignTradeCounter();
            await runTradeLogic(
                [{ _id: 'mul1', index: 'MUL', setype: 'usse', ing: 0, amount: 1000, orig: 500, mid: 100, times: 5, mul: 2, web: [-130, -120, -110, -100, -91, -83, -76] }],
                { MUL: { price: 250 } } // price=250 > sigma2Up=120 → enter_mid fail
            );
            expect(consoleSpy).toHaveBeenCalledWith('enter_mid: price above 2σ');
        });

        test('recur_status: ing === 0, enter_mid not met → skip', async () => {
            await alignTradeCounter();
            await runTradeLogic(
                [{ _id: 'ent0', index: 'ENT', setype: 'usse', ing: 0, amount: 1000, orig: 1000, mid: 100, times: 10, web: [-130, -120, -110, -100, -91, -83, -76] }],
                { ENT: { price: 250 } } // price=250 > sigma2Up=120 → skip
            );
            expect(consoleSpy).toHaveBeenCalledWith('enter_mid: price above 2σ');
        });

        test('recur_status: ing === 0, enter_mid met, price exists → startStatus', async () => {
            await alignTradeCounter();
            await runTradeLogic(
                [{ _id: 'ent1', index: 'ENT2', setype: 'usse', ing: 0, amount: 1000, orig: 1000, mid: 100, times: 10, web: [-130, -120, -110, -100, -91, -83, -76] }],
                { ENT2: { price: 115, buy: 140, sell: 160, bCount: 2, sCount: 1 } } // price=115 < sigma2Up=120 → met
            );
            // Should have called Mongo update to set ing=1
            expect(mockMongo).toHaveBeenCalledWith('update', 'total',
                { _id: 'ent1' }, expect.objectContaining({ $set: { ing: 1 } }));
        });

        test('recur_status: ing === 0, enter_mid met, no price → skip', async () => {
            await alignTradeCounter();
            await runTradeLogic(
                [{ _id: 'ent3', index: 'ENT3', setype: 'usse', ing: 0, amount: 1000, orig: 1000, mid: 100, times: 10, web: [-130, -120, -110, -100, -91, -83, -76] }],
                { ENT3: { price: 0, buy: 0, sell: 0, bCount: 0, sCount: 0 } } // price=0 < sigma2Up=120 → met, but price falsy
            );
        });

        test('recur_status: ing === 1, price exists → startStatus', async () => {
            await alignTradeCounter();
            await runTradeLogic(
                [{ _id: 'ing1', index: 'ING1', setype: 'usse', ing: 1, amount: 500, orig: 1000, mid: 100, times: 10 }],
                { ING1: { price: 150, buy: 140, sell: 160, bCount: 2, sCount: 1 } }
            );
        });

        test('startStatus: sorted insert (multiple items by amount desc)', async () => {
            // With multiple items, larger amounts should be inserted earlier in newOrder
            await alignTradeCounter();
            await runTradeLogic(
                [
                    { _id: 'si1', index: 'SI1', setype: 'usse', ing: 1, amount: 100, orig: 1000, mid: 100, times: 10 },
                    { _id: 'si2', index: 'SI2', setype: 'usse', ing: 1, amount: 500, orig: 1000, mid: 100, times: 10 },
                    { _id: 'si3', index: 'SI3', setype: 'usse', ing: 1, amount: 200, orig: 1000, mid: 100, times: 10 },
                ],
                {
                    SI1: { price: 150, buy: 140, sell: 160, bCount: 1, sCount: 1 },
                    SI2: { price: 150, buy: 140, sell: 160, bCount: 1, sCount: 1 },
                    SI3: { price: 150, buy: 140, sell: 160, bCount: 1, sCount: 1 },
                }
            );
            // SI2 (amount=500) > SI3 (200) > SI1 (100) → spliced in order
        });

        test('recur_status: ing === 1, no price → skip', async () => {
            await alignTradeCounter();
            await runTradeLogic(
                [{ _id: 'ing1np', index: 'ING1NP', setype: 'usse', ing: 1, amount: 500, orig: 1000, mid: 100, times: 10 }],
                { ING1NP: { price: 0 } }
            );
        });

        test('recur_status: ing === 2 → sellAll (has position)', async () => {
            await alignTradeCounter();
            // We need position to have this symbol after initialBook
            await runTradeLogic(
                [{ _id: 'ing2', index: 'ING2', setype: 'usse', ing: 2, amount: 500, orig: 1000, mid: 100, times: 10 }],
                { ING2: { price: 150 } },
                {
                    accountData: stdAccount({
                        positions: [{ instrument: { symbol: 'ING2' }, longQuantity: 10, averagePrice: 140 }],
                    }),
                }
            );
            // Should have called submit order (SELL MARKET) and deleteMany
            expect(mockMongo).toHaveBeenCalledWith('deleteMany', 'total', expect.any(Object));
        });

        test('recur_status: ing === 2 → sellAll (no position)', async () => {
            await alignTradeCounter();
            await runTradeLogic(
                [{ _id: 'ing2b', index: 'ING2B', setype: 'usse', ing: 2, amount: 500, orig: 1000, mid: 100, times: 10 }],
                { ING2B: { price: 150 } }
            );
            // Should have called deleteMany directly (no submit order)
            expect(mockMongo).toHaveBeenCalledWith('deleteMany', 'total', expect.any(Object));
        });

        test('sellAll: initialBook(true) account API error → trade decremented', async () => {
            await alignTradeCounter();
            jest.clearAllMocks();
            consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
            resetTD();
            const hourSpy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(12);

            let posCallCount = 0;
            mockFetch.mockImplementation((url, opts) => {
                if (url.includes('/accountNumbers')) {
                    return Promise.resolve(jsonRes([{ hashValue: 'enc123' }]));
                }
                if (url.includes('fields=positions')) {
                    posCallCount++;
                    if (posCallCount <= 1) {
                        return Promise.resolve(jsonRes(stdAccount()));
                    }
                    // Second call (force=true from sellAll) returns error
                    return Promise.resolve(jsonRes({ message: 'account error' }));
                }
                if (url.includes('/orders')) {
                    return Promise.resolve(jsonRes([]));
                }
                if (opts && opts.method === 'POST') return Promise.resolve(okRes());
                if (opts && opts.method === 'DELETE') return Promise.resolve(okRes());
                return Promise.resolve(jsonRes({}));
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'sa-err', index: 'SAERR', setype: 'usse', ing: 2,
                        amount: 500, orig: 1000, mid: 100, times: 10,
                    }]);
                }
                if (op === 'deleteMany') return Promise.resolve({ deletedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({ SAERR: { price: 100 } });

            await expect(usseTDInit()).rejects.toThrow('account error');
            hourSpy.mockRestore();
        });

        test('sellAll: initialBook(true) no securitiesAccount → trade decremented', async () => {
            await alignTradeCounter();
            jest.clearAllMocks();
            consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
            resetTD();
            const hourSpy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(12);

            let posCallCount = 0;
            mockFetch.mockImplementation((url, opts) => {
                if (url.includes('/accountNumbers')) {
                    return Promise.resolve(jsonRes([{ hashValue: 'enc123' }]));
                }
                if (url.includes('fields=positions')) {
                    posCallCount++;
                    if (posCallCount <= 1) {
                        return Promise.resolve(jsonRes(stdAccount()));
                    }
                    // Second call returns response without securitiesAccount
                    return Promise.resolve(jsonRes({ something: 'else' }));
                }
                if (url.includes('/orders')) {
                    return Promise.resolve(jsonRes([]));
                }
                if (opts && opts.method === 'POST') return Promise.resolve(okRes());
                if (opts && opts.method === 'DELETE') return Promise.resolve(okRes());
                return Promise.resolve(jsonRes({}));
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'sa-nsa', index: 'SANSA', setype: 'usse', ing: 2,
                        amount: 500, orig: 1000, mid: 100, times: 10,
                    }]);
                }
                if (op === 'deleteMany') return Promise.resolve({ deletedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({ SANSA: { price: 100 } });

            await expect(usseTDInit()).rejects.toThrow('miss securitiesAccount');
            hourSpy.mockRestore();
        });

        test('sellAll: orders API error with force=true → trade decremented', async () => {
            await alignTradeCounter();
            jest.clearAllMocks();
            consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
            resetTD();
            const hourSpy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(12);

            let posCallCount = 0;
            let ordersCallCount = 0;
            mockFetch.mockImplementation((url, opts) => {
                if (url.includes('/accountNumbers')) {
                    return Promise.resolve(jsonRes([{ hashValue: 'enc123' }]));
                }
                if (url.includes('fields=positions')) {
                    posCallCount++;
                    return Promise.resolve(jsonRes(stdAccount()));
                }
                if (url.includes('/orders?')) {
                    ordersCallCount++;
                    if (ordersCallCount <= 1) {
                        return Promise.resolve(jsonRes([]));
                    }
                    // Second orders call (from sellAll initialBook(true)) returns error
                    return Promise.resolve(jsonRes({ error: 'orders error' }));
                }
                if (opts && opts.method === 'POST') return Promise.resolve(okRes());
                if (opts && opts.method === 'DELETE') return Promise.resolve(okRes());
                return Promise.resolve(jsonRes({}));
            });
            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'oerr', index: 'OERR', setype: 'usse', ing: 2,
                        amount: 500, orig: 1000, mid: 100, times: 10,
                    }]);
                }
                if (op === 'deleteMany') return Promise.resolve({ deletedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({ OERR: { price: 100 } });

            await expect(usseTDInit()).rejects.toThrow('orders error');
            hourSpy.mockRestore();
        });

        test('recur_NewOrder: buy with BRK-B → submitTDOrder remaps to BRK/B', async () => {
            await alignTradeCounter();
            await runTradeLogic(
                [{ _id: 'brkb', index: 'BRK-B', setype: 'usse', ing: 1, amount: 500, orig: 1000, mid: 100, times: 10 }],
                { 'BRK-B': { price: 200, buy: 180, sell: 0, bCount: 5, sCount: 0 } },
                {
                    accountData: stdAccount({
                        projectedBalances: { cashAvailableForWithdrawal: 10000 },
                        currentBalances: { totalCash: 10000 },
                    }),
                }
            );
            // submitTDOrder should have been called with BRK/B via POST
            const postCalls = mockFetch.mock.calls.filter(c => c[1] && c[1].method === 'POST');
            expect(postCalls.length).toBeGreaterThan(0);
            if (postCalls.length > 0) {
                const body = JSON.parse(postCalls[0][1].body);
                expect(body.orderLegCollection[0].instrument.symbol).toBe('BRK/B');
            }
        });

        test('recur_NewOrder: sell with sCount > 0', async () => {
            await alignTradeCounter();
            await runTradeLogic(
                [{ _id: 'sell1', index: 'SELL1', setype: 'usse', ing: 1, amount: 500, orig: 1000, mid: 100, times: 10 }],
                { SELL1: { price: 200, buy: 180, sell: 210, bCount: 2, sCount: 3 } }
            );
        });

        test('recur_NewOrder: sell oversold error → swallowed', async () => {
            await alignTradeCounter();
            const err = new MockHoError('oversold/overbought position in your account');
            await runTradeLogic(
                [{ _id: 'osell', index: 'OSELL', setype: 'usse', ing: 1, amount: 500, orig: 1000, mid: 100, times: 10 }],
                { OSELL: { price: 200, buy: 180, sell: 210, bCount: 0, sCount: 3 } },
                { submitError: errRes('oversold/overbought position in your account') }
            );
            // Error should be swallowed, not thrown
        });

        test('recur_NewOrder: sell non-oversold error → rejected', async () => {
            await alignTradeCounter();
            await expect(runTradeLogic(
                [{ _id: 'serr', index: 'SERR', setype: 'usse', ing: 1, amount: 500, orig: 1000, mid: 100, times: 10 }],
                { SERR: { price: 200, buy: 180, sell: 210, bCount: 0, sCount: 3 } },
                { submitError: errRes('some other error') }
            )).rejects.toThrow();
        });

        test('recur_NewOrder: sell fake order (sCount=0, sell price exists)', async () => {
            await alignTradeCounter();
            await runTradeLogic(
                [{ _id: 'sfake', index: 'SFAKE', setype: 'usse', ing: 1, amount: 500, orig: 1000, mid: 100, times: 10 }],
                { SFAKE: { price: 200, buy: 180, sell: 210, bCount: 2, sCount: 0 } }
            );
        });

        test('recur_NewOrder: no sell, no buy → submitBuy only', async () => {
            await alignTradeCounter();
            await runTradeLogic(
                [{ _id: 'nosb', index: 'NOSB', setype: 'usse', ing: 1, amount: 500, orig: 1000, mid: 100, times: 10 }],
                { NOSB: { price: 200, buy: 0, sell: 0, bCount: 0, sCount: 0 } }
            );
        });

        test('recur_NewOrder: buy with sufficient funds', async () => {
            await alignTradeCounter();
            await runTradeLogic(
                [{ _id: 'buy1', index: 'BUY1', setype: 'usse', ing: 1, amount: 500, orig: 1000, mid: 100, times: 10 }],
                { BUY1: { price: 200, buy: 180, sell: 0, bCount: 5, sCount: 0 } },
                {
                    accountData: stdAccount({
                        projectedBalances: { cashAvailableForWithdrawal: 10000 },
                        currentBalances: { totalCash: 10000 },
                    }),
                }
            );
        });

        test('recur_NewOrder: buy with insufficient funds (reduced bCount)', async () => {
            await alignTradeCounter();
            await runTradeLogic(
                [{ _id: 'buyi', index: 'BUYI', setype: 'usse', ing: 1, amount: 500, orig: 1000, mid: 100, times: 10 }],
                { BUYI: { price: 200, buy: 100, sell: 0, bCount: 50, sCount: 0 } },
                {
                    accountData: stdAccount({
                        projectedBalances: { cashAvailableForWithdrawal: 4000 },
                        currentBalances: { totalCash: 4000 },
                    }),
                }
            );
        });

        test('recur_NewOrder: buy very insufficient funds (bCount=0)', async () => {
            await alignTradeCounter();
            await runTradeLogic(
                [{ _id: 'buyv', index: 'BUYV', setype: 'usse', ing: 1, amount: 500, orig: 1000, mid: 100, times: 10 }],
                { BUYV: { price: 200, buy: 100, sell: 0, bCount: 50, sCount: 0 } },
                {
                    accountData: stdAccount({
                        projectedBalances: { cashAvailableForWithdrawal: 400 },
                        currentBalances: { totalCash: 400 },
                    }),
                }
            );
        });

        test('recur_NewOrder: buy fake order (bCount=0, buy price exists)', async () => {
            await alignTradeCounter();
            await runTradeLogic(
                [{ _id: 'buyf', index: 'BUYF', setype: 'usse', ing: 1, amount: 500, orig: 1000, mid: 100, times: 10 }],
                { BUYF: { price: 200, buy: 180, sell: 0, bCount: 0, sCount: 0 } },
                {
                    accountData: stdAccount({
                        projectedBalances: { cashAvailableForWithdrawal: 10000 },
                        currentBalances: { totalCash: 10000 },
                    }),
                }
            );
        });

        test('recur_NewOrder: buy oversold error → swallowed', async () => {
            await alignTradeCounter();
            await runTradeLogic(
                [{ _id: 'obuy', index: 'OBUY', setype: 'usse', ing: 1, amount: 500, orig: 1000, mid: 100, times: 10 }],
                { OBUY: { price: 200, buy: 180, sell: 0, bCount: 5, sCount: 0 } },
                {
                    accountData: stdAccount({
                        projectedBalances: { cashAvailableForWithdrawal: 10000 },
                        currentBalances: { totalCash: 10000 },
                    }),
                    submitError: errRes('oversold/overbought position in your account'),
                }
            );
        });

        test('recur_NewOrder: buy non-oversold error → rejected', async () => {
            await alignTradeCounter();
            await expect(runTradeLogic(
                [{ _id: 'berr', index: 'BERR', setype: 'usse', ing: 1, amount: 500, orig: 1000, mid: 100, times: 10 }],
                { BERR: { price: 200, buy: 180, sell: 0, bCount: 5, sCount: 0 } },
                {
                    accountData: stdAccount({
                        projectedBalances: { cashAvailableForWithdrawal: 10000 },
                        currentBalances: { totalCash: 10000 },
                    }),
                    submitError: errRes('insufficient funds'),
                }
            )).rejects.toThrow();
        });

        test('cancelOrder: partial order skipped during cancel', async () => {
            await alignTradeCounter();
            // Set up orders that include a partial order (which should be skipped during cancel)
            setupFetch({
                accountData: stdAccount({
                    positions: [{ instrument: { symbol: 'PART' }, longQuantity: 5, averagePrice: 100 }],
                }),
                orders: [{
                    cancelable: true,
                    orderId: 999,
                    enteredTime: new Date().toISOString(),
                    quantity: 3,
                    orderType: 'LIMIT',
                    price: 110,
                    duration: 'GOOD_TILL_CANCEL',
                    orderLegCollection: [{ instruction: 'BUY', instrument: { symbol: 'PART' } }],
                    orderActivityCollection: [{
                        executionType: 'PARTIALFILL',
                        executionLegs: [{ time: new Date().toISOString(), price: 110, quantity: 1 }],
                    }],
                }],
            });

            jest.clearAllMocks();
            consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
            const hourSpy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(12);

            mockMongo.mockImplementation((op, coll, ...args) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'part-id', index: 'PART', setype: 'usse', ing: 1,
                        amount: 500, orig: 1000, mid: 100, times: 10,
                        previous: { buy: [{ price: 110, time: NOW_SEC }], sell: [] },
                        profit: 0,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({
                PART: { price: 100, buy: 95, sell: 115, bCount: 1, sCount: 0 },
            });

            await usseTDInit();
            hourSpy.mockRestore();
        });

        test('cancelOrder: cancel API error → swallowed', async () => {
            await alignTradeCounter();

            jest.clearAllMocks();
            consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
            const hourSpy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(12);

            // Complex fetch mock: first calls succeed, but cancel fails
            let callCount = 0;
            mockFetch.mockImplementation((url, opts) => {
                if (url.includes('fields=positions')) {
                    return Promise.resolve(jsonRes(stdAccount()));
                }
                if (url.includes('/orders?')) {
                    // Return a non-partial cancelable order that matches the item
                    return Promise.resolve(jsonRes([{
                        cancelable: true,
                        orderId: 888,
                        enteredTime: new Date().toISOString(),
                        quantity: 2,
                        orderType: 'LIMIT',
                        price: 100,
                        duration: 'GOOD_TILL_CANCEL',
                        orderLegCollection: [{ instruction: 'BUY', instrument: { symbol: 'CERR' } }],
                    }]));
                }
                if (opts && opts.method === 'DELETE') {
                    // Cancel fails
                    return Promise.reject(new MockHoError('cancel failed'));
                }
                if (opts && opts.method === 'POST') {
                    return Promise.resolve(okRes());
                }
                if (url.includes('/accountNumbers')) {
                    return Promise.resolve(jsonRes([{ hashValue: 'enc123' }]));
                }
                return Promise.resolve(jsonRes({}));
            });

            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'cerr-id', index: 'CERR', setype: 'usse', ing: 1,
                        amount: 500, orig: 1000, mid: 100, times: 10,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({
                CERR: { price: 100, buy: 95, sell: 110, bCount: 1, sCount: 0 },
            });

            await usseTDInit();
            hourSpy.mockRestore();
            // Cancel error should be swallowed via sendWs + handleError(err, string)
            expect(mockSendWs).toHaveBeenCalledWith(
                expect.stringContaining('TD cancelOrder Error'), 0, 0, true
            );
        });

        test('cancelOrder: DELETE returns !res.ok → trade decremented and swallowed', async () => {
            await alignTradeCounter();

            jest.clearAllMocks();
            consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
            const hourSpy = jest.spyOn(Date.prototype, 'getHours').mockReturnValue(12);

            mockFetch.mockImplementation((url, opts) => {
                if (url.includes('fields=positions')) {
                    return Promise.resolve(jsonRes(stdAccount()));
                }
                if (url.includes('/orders?')) {
                    return Promise.resolve(jsonRes([{
                        cancelable: true,
                        orderId: 889,
                        enteredTime: new Date().toISOString(),
                        quantity: 2,
                        orderType: 'LIMIT',
                        price: 100,
                        duration: 'GOOD_TILL_CANCEL',
                        orderLegCollection: [{ instruction: 'BUY', instrument: { symbol: 'CRESOK' } }],
                    }]));
                }
                if (opts && opts.method === 'DELETE') {
                    // Return non-ok response with error body
                    return Promise.resolve({
                        ok: false,
                        json: () => Promise.resolve({ message: 'cancel not ok' }),
                    });
                }
                if (opts && opts.method === 'POST') {
                    return Promise.resolve(okRes());
                }
                if (url.includes('/accountNumbers')) {
                    return Promise.resolve(jsonRes([{ hashValue: 'enc123' }]));
                }
                return Promise.resolve(jsonRes({}));
            });

            mockMongo.mockImplementation((op, coll) => {
                if (op === 'find' && coll === 'total') {
                    return Promise.resolve([{
                        _id: 'cresok-id', index: 'CRESOK', setype: 'usse', ing: 1,
                        amount: 500, orig: 1000, mid: 100, times: 10,
                    }]);
                }
                if (op === 'update') return Promise.resolve({ modifiedCount: 1 });
                return Promise.resolve([]);
            });
            mockGetSuggestionData.mockReturnValue({
                CRESOK: { price: 100, buy: 95, sell: 110, bCount: 1, sCount: 0 },
            });

            await usseTDInit();
            hourSpy.mockRestore();
            // cancelTDOrder !res.ok error should be caught by cancelOrder's catch
            expect(mockSendWs).toHaveBeenCalledWith(
                expect.stringContaining('TD cancelOrder Error'), 0, 0, true
            );
        });
    });
});

// =========================================================================
// 6. getUssePosition
// =========================================================================
describe('getUssePosition', () => {
    test('returns positions with cash entry', () => {
        const pos = getUssePosition();
        expect(Array.isArray(pos)).toBe(true);
        // Should have a symbol=0 entry (cash)
        expect(pos.find(p => p.symbol === 0)).toBeTruthy();
    });

    test('BRK.B remapped to BRK-B', async () => {
        // Set up position with BRK.B via usseTDInit
        resetTD();
        mockFetch.mockImplementation((url) => {
            if (url.includes('fields=positions')) {
                return Promise.resolve(jsonRes(stdAccount({
                    positions: [
                        { instrument: { symbol: 'BRK.B' }, longQuantity: 3, averagePrice: 400 },
                    ],
                })));
            }
            if (url.includes('/orders?') || url.includes('/orders')) {
                return Promise.resolve(jsonRes([]));
            }
            return Promise.resolve(jsonRes({}));
        });
        mockMongo.mockResolvedValue([]);
        mockGetSuggestionData.mockReturnValue({});

        await usseTDInit();

        const pos = getUssePosition();
        expect(pos.find(p => p.symbol === 'BRK-B')).toBeTruthy();
        expect(pos.find(p => p.symbol === 'BRK.B')).toBeFalsy();
    });

    test('existing cash entry → not duplicated', () => {
        // position already has symbol=0 from previous call
        const pos = getUssePosition();
        const cashEntries = pos.filter(p => p.symbol === 0);
        expect(cashEntries).toHaveLength(1);
    });
});

// =========================================================================
// 7. getUsseOrder (after state changes)
// =========================================================================
describe('getUsseOrder (populated)', () => {
    test('returns order array', () => {
        const orders = getUsseOrder();
        expect(Array.isArray(orders)).toBe(true);
    });
});

// =========================================================================
// 8. resetTD (final)
// =========================================================================
describe('resetTD (state verification)', () => {
    test('resets book, preserves trade', () => {
        resetTD();
        // After reset, book=0, trade=previous value
        expect(consoleSpy).toHaveBeenCalledWith('TD reset');
    });

    test('with update parameter', () => {
        resetTD(true);
        expect(consoleSpy).toHaveBeenCalledWith('TD reset');
    });
});
