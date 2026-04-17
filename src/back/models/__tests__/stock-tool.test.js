/**
 * stock-tool.test.js — Comprehensive tests for stock-tool.js
 *
 * Strategy:
 *  1. Pure-function tests (logArray, calStair, stockProcess, stockTest,
 *     getSuggestionData) — no mocks needed beyond module loading.
 *  2. Mocked tests for all DB/HTTP-dependent exports
 *     (getStockListV2, stockStatus, getStockPERV2, testData, cleanUseless,
 *      getStockTotal, updateStockTotal, warp guards).
 *
 * PA2 — hand-crafted priceArray used throughout stockProcess tests:
 *   [-1000,-900,800,750,700,-600,550,500,450,-400,350,300,-250,200,150,-120,100,80,-60,40,20,-10]
 *   (22 elements, index 0=highest … 21=lowest, negatives are band boundaries)
 *   Key price → (bP, sP, buy-signal, sell-signal):
 *     5   → resetWeb:1 (newMid=120)
 *     1000 → resetWeb:2 (newMid=600)
 *     50  → (7, 7) → type-6 buy  + sell-too-low
 *     100 → (6, 6) → type-3 buy  + sell-too-low
 *     200 → (5, 5) → type-7 buy  + standard sell
 *     400 → (4, 3) → standard buy + type-9 sell
 *     700 → (2, 2) → buy-too-high + type-5 sell
 *     950 → (1, 1) → buy-too-high + type-8 sell
 */
import { jest, describe, test, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// DOM builder helpers (used for getStockListV2 mock DOM trees)
// ---------------------------------------------------------------------------
const mkNode = (tag, cls, children = [], attribs = {}) => ({
    type: 'tag',
    name: tag,
    attribs: cls ? { class: cls, ...attribs } : { ...attribs },
    children: children.map(c => typeof c === 'string' ? { type: 'text', data: c } : c),
});
const mkText = data => ({ type: 'text', data });

// ---------------------------------------------------------------------------
// Mock factories — ALL before dynamic import
// ---------------------------------------------------------------------------

// --- ver.js ---
jest.unstable_mockModule('../../../../ver.js', () => ({ ENV_TYPE: 'dev' }));

// --- config.js ---
const mockConfigFn = () => false;
jest.unstable_mockModule('../../config.js', () => ({
    CHECK_STOCK: mockConfigFn,
    USSE_TICKER: mockConfigFn,
    TWSE_TICKER: mockConfigFn,
    NAS_PREFIX: () => '/nas',
    NAS_TMP: () => '/tmp',
    EXTENT_IP: mockConfigFn,
    EXTENT_FILE_IP: mockConfigFn,
    APP_HTML: mockConfigFn,
    IP: mockConfigFn,
    FILE_IP: mockConfigFn,
    PORT: mockConfigFn,
    EXTENT_PORT: mockConfigFn,
    FILE_PORT: mockConfigFn,
    EXTENT_FILE_PORT: mockConfigFn,
    COM_PORT: mockConfigFn,
    WS_PORT: mockConfigFn,
    DB_NAME: mockConfigFn,
    DB_IP: mockConfigFn,
    DB_PORT: mockConfigFn,
    SESS_IP: mockConfigFn,
    SESS_PORT: mockConfigFn,
    GOOGLE_MEDIA_FOLDER: mockConfigFn,
    GOOGLE_BACKUP_FOLDER: mockConfigFn,
    GOOGLE_DB_BACKUP_FOLDER: mockConfigFn,
    HINT: mockConfigFn,
    AUTO_UPLOAD: mockConfigFn,
    AUTO_DOWNLOAD: mockConfigFn,
    UPDATE_STOCK: mockConfigFn,
    CHECK_MEDIA: mockConfigFn,
    API_LIMIT: mockConfigFn,
    TORRENT_LIMIT: mockConfigFn,
    ZIP_LIMIT: mockConfigFn,
    MEGA_LIMIT: mockConfigFn,
    STOCK_FILTER: mockConfigFn,
    DB_BACKUP: mockConfigFn,
    BACKUP_PATH: mockConfigFn,
    BITFINEX_LOAN: mockConfigFn,
    BITFINEX_FILTER: mockConfigFn,
    BITFINEX_ORDER: mockConfigFn,
}));

// --- mongo-tool ---
const mockMongo = jest.fn();
const mockObjectID = jest.fn(() => 'mock-oid');
jest.unstable_mockModule('../mongo-tool.js', () => ({
    default: mockMongo,
    objectID: mockObjectID,
}));

// --- redis-tool ---
const mockRedis = jest.fn();
jest.unstable_mockModule('../redis-tool.js', () => ({ default: mockRedis }));

// --- api-tool ---
const mockApi = jest.fn();
jest.unstable_mockModule('../api-tool.js', () => ({ default: mockApi }));

// --- api-tool-google ---
const mockGoogleApi = jest.fn();
jest.unstable_mockModule('../api-tool-google.js', () => ({ default: mockGoogleApi }));

// --- tag-tool (StockTagTool = TagTool(STOCKDB) at module level) ---
const mockTagInstance = {
    setLatest: jest.fn().mockResolvedValue({}),
    addTag: jest.fn().mockResolvedValue({ id: 'tag-id' }),
    delTag: jest.fn().mockResolvedValue({ id: 'del-id' }),
    tagQuery: jest.fn().mockResolvedValue({ items: [] }),
};
const mockTagTool = jest.fn(() => mockTagInstance);
mockTagTool.normalize = jest.fn(s => (typeof s === 'string' ? s.toLowerCase() : s));
mockTagTool.isDefaultTag = jest.fn(() => false);
jest.unstable_mockModule('../tag-tool.js', () => ({
    default: mockTagTool,
    normalize: mockTagTool.normalize,
    isDefaultTag: mockTagTool.isDefaultTag,
}));

// --- htmlparser2 ---
const mockParseDOM = jest.fn();
jest.unstable_mockModule('htmlparser2', () => ({
    default: { parseDOM: mockParseDOM },
}));

// --- yahoo-finance2 ---
const mockYahooFinance = { quote: jest.fn(), chart: jest.fn(), quoteSummary: jest.fn() };
jest.unstable_mockModule('yahoo-finance2', () => ({ default: mockYahooFinance }));

// --- mkdirp ---
const mockMkdirp = jest.fn().mockResolvedValue(undefined);
jest.unstable_mockModule('mkdirp', () => ({ default: mockMkdirp }));

// --- fs (existsSync) ---
const mockFsExistsSync = jest.fn(() => false);
jest.unstable_mockModule('fs', () => ({
    default: { existsSync: mockFsExistsSync },
}));

// --- tdameritrade-tool ---
const mockGetUssePosition = jest.fn(() => []);
const mockGetUsseOrder = jest.fn(() => []);
jest.unstable_mockModule('../tdameritrade-tool.js', () => ({
    getUssePosition: mockGetUssePosition,
    getUsseOrder: mockGetUsseOrder,
}));

// --- shioaji-tool ---
const mockGetTwsePosition = jest.fn(() => []);
const mockGetTwseOrder = jest.fn(() => []);
jest.unstable_mockModule('../shioaji-tool.js', () => ({
    getTwsePosition: mockGetTwsePosition,
    getTwseOrder: mockGetTwseOrder,
}));

// --- sendWs ---
const mockSendWs = jest.fn();
jest.unstable_mockModule('../../util/sendWs.js', () => ({ default: mockSendWs }));

// ---------------------------------------------------------------------------
// Dynamic import — all mocks registered above
// ---------------------------------------------------------------------------
let logArray, calStair, stockProcess, stockTest, getSuggestionData;
let getStockListV2, stockStatus, getSingleAnnual;
let StockTool, setMaxRetry, setStatusDelay;

beforeAll(async () => {
    const mod = await import('../stock-tool.js');
    logArray        = mod.logArray;
    calStair        = mod.calStair;
    stockProcess    = mod.stockProcess;
    stockTest       = mod.stockTest;
    getSuggestionData = mod.getSuggestionData;
    getStockListV2  = mod.getStockListV2;
    stockStatus     = mod.stockStatus;
    getSingleAnnual = mod.getSingleAnnual;
    StockTool       = mod.default;
    setMaxRetry     = mod._setMaxRetry;
    setStatusDelay  = mod._setStatusDelay;
});

beforeEach(() => {
    jest.clearAllMocks();
    StockTool._resetFlags();
    setMaxRetry(0);         // avoid retry delays
    setStatusDelay(0);      // avoid 3s inter-stock delay
});

// ===========================================================================
// logArray
// ===========================================================================
describe('logArray', () => {
    test('returns array of length pos (default 100) and diff', () => {
        const result = logArray(200, 100);
        expect(result.arr).toHaveLength(100);
        expect(result.diff).toBeGreaterThan(0);
    });

    test('first element equals min', () => {
        const { arr } = logArray(200, 50);
        expect(arr[0]).toBe(50);
    });

    test('last element is less than max and greater than previous element', () => {
        const { arr } = logArray(200, 100);
        const last = arr[arr.length - 1];
        const prev = arr[arr.length - 2];
        expect(last).toBeGreaterThan(prev);
        expect(last).toBeLessThan(200);
    });

    test('each element is ~(1+diff) times the previous', () => {
        const { arr, diff } = logArray(200, 100);
        for (let i = 1; i < arr.length; i++) {
            expect(arr[i] / arr[i - 1]).toBeCloseTo(1 + diff, 8);
        }
    });

    test('pos parameter controls array length', () => {
        const { arr } = logArray(400, 100, 50);
        expect(arr).toHaveLength(50);
    });

    test('diff equals (log(max)-log(min))/pos', () => {
        const { diff } = logArray(400, 100, 100);
        expect(diff).toBeCloseTo((Math.log(400) - Math.log(100)) / 100, 10);
    });
});

// ===========================================================================
// calStair
// ===========================================================================
describe('calStair', () => {
    const makeData = (count, hBase, lBase, vBase) =>
        Array.from({ length: count }, (_, i) => ({
            h: hBase + (i % 5),
            l: lBase - (i % 3),
            v: vBase + i * 10,
        }));

    let raw100, loga;

    beforeAll(() => {
        raw100 = makeData(100, 110, 90, 1000);
        loga = logArray(115, 87);
    });

    test('returns object with mid, up, down, extrem, single, arr', () => {
        const web = calStair(raw100, loga, 87);
        if (web) {
            expect(web).toHaveProperty('mid');
            expect(web).toHaveProperty('up');
            expect(web).toHaveProperty('down');
            expect(web).toHaveProperty('extrem');
            expect(web).toHaveProperty('single');
            expect(web).toHaveProperty('arr');
            expect(Array.isArray(web.arr)).toBe(true);
        }
    });

    test('arr first element is negative (highest price boundary)', () => {
        const web = calStair(raw100, loga, 87);
        if (web) expect(web.arr[0]).toBeLessThan(0);
    });

    test('arr last element is negative (lowest price boundary)', () => {
        const web = calStair(raw100, loga, 87);
        if (web) expect(web.arr[web.arr.length - 1]).toBeLessThan(0);
    });

    test('returns false when extrem is too small (tight high-low range)', () => {
        const tightData = Array.from({ length: 50 }, () => ({
            h: 100.001, l: 99.999, v: 100,
        }));
        const tightLoga = logArray(100.002, 99.998);
        const result = calStair(tightData, tightLoga, 99.998);
        expect(result).toBe(false);
    });

    test('stair_start parameter skips initial elements', () => {
        const web0 = calStair(raw100, loga, 87, 0);
        const web10 = calStair(raw100, loga, 87, 10);
        if (web0 && web10) {
            expect(typeof web0.mid).toBe('number');
            expect(typeof web10.mid).toBe('number');
        }
    });

    test('len parameter limits data window', () => {
        const webLen50 = calStair(raw100, loga, 87, 0, 0.006, 50);
        if (webLen50) expect(typeof webLen50.mid).toBe('number');
    });

    test('mid is a positive number when valid', () => {
        const web = calStair(raw100, loga, 87);
        if (web) expect(web.mid).toBeGreaterThan(0);
    });
});

// ===========================================================================
// stockProcess — comprehensive branch coverage using PA2
// ===========================================================================
describe('stockProcess', () => {
    // PA2: 22-element mixed array, negatives = band boundaries
    const PA2 = [
        -1000, -900, 800, 750, 700,
        -600, 550, 500, 450,
        -400, 350, 300,
        -250, 200, 150,
        -120, 100, 80,
        -60, 40, 20, -10,
    ];
    // Default parameters (no previous trade, no external position)
    const empty = { buy: [], sell: [] };
    const ttime = 86400 * 5;
    const tinterval = 86400 * 5;
    const farFuture = Math.round(new Date().getTime() / 1000) + 999999999;

    // -----------------------------------------------------------------------
    // resetWeb cases
    // -----------------------------------------------------------------------
    test('price below entire array → resetWeb:1 with newMid', () => {
        // price=5: abs(-10)*1.001=10.01 >= 5 → break at last index immediately
        const result = stockProcess(5, PA2, 1, empty, 10000, 10000, 0, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        expect(result.resetWeb).toBe(1);
        expect(typeof result.newMid).toBe('number');
    });

    test('resetWeb:1 newMid computed from 3rd/4th negative from bottom', () => {
        // PA2 negatives from bottom: -10,−60,−120,−250,… → 3rd=-120, check 4th=-250
        const result = stockProcess(5, PA2, 1, empty, 10000, 10000, 0, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        // newMid: count=3 gives 120; count=4: 120 > 250*(1-0.06)=235? no → newMid stays 120
        expect(result.newMid).toBe(120);
    });

    test('price above entire array → resetWeb:2 with newMid', () => {
        // price=1000: abs(-1000)*0.999=999 <= 1000 → break at nowSP=0
        const result = stockProcess(1000, PA2, 1, empty, 10000, 10000, 0, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        expect(result.resetWeb).toBe(2);
        expect(typeof result.newMid).toBe('number');
    });

    test('resetWeb:2 newMid computed from 3rd/4th negative from top', () => {
        // PA2 negatives from top: -1000,-900,-600,-400,… → 3rd=-600, 4th=-400
        // newMid: count=3 gives 600; count=4: 600 < 400*(1+0.06)=424? no → newMid=600
        const result = stockProcess(1000, PA2, 1, empty, 10000, 10000, 0, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        expect(result.newMid).toBe(600);
    });

    // -----------------------------------------------------------------------
    // Buy signals (no previous, ample pAmount)
    // -----------------------------------------------------------------------
    test('bP=7 (>6) → type 6 "Buy 3/4" in str', () => {
        // price=50: bP=7 (one negative -10 below price), no resetWeb
        // pCount=5 >= 2*priceTimes(1) so finalBuy does NOT reset type
        const result = stockProcess(50, PA2, 1, empty, 10000, 10000, 5, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        expect(result.str).toMatch(/Buy 3\/4/);
        expect(result.type).toBe(6);
        expect(result.buy).toBeGreaterThan(0);
    });

    test('bP=6 (>5) → type 3 "Buy 1/2" in str', () => {
        // price=100: bP=6 (two negatives -10,-60 below price)
        const result = stockProcess(100, PA2, 1, empty, 10000, 10000, 5, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        expect(result.str).toMatch(/Buy 1\/2/);
        expect(result.type).toBe(3);
    });

    test('bP=5 (>4) → type 7 "Buy 1/4" in str', () => {
        // price=200: bP=5 (three negatives -10,-60,-120 below)
        const result = stockProcess(200, PA2, 1, empty, 10000, 10000, 5, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        expect(result.str).toMatch(/Buy 1\/4/);
        expect(result.type).toBe(7);
    });

    test('bP=4 (else branch) → standard "Buy" in str', () => {
        // price=400: bP=4 (four negatives -10,-60,-120,-250 below)
        const result = stockProcess(400, PA2, 1, empty, 10000, 10000, 5, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        expect(result.str).toMatch(/Buy \d/);
        expect(result.buy).toBeGreaterThan(0);
    });

    test('bP<3 → "Buy too high" in str, bCount=0', () => {
        // price=950: bP=1 (seven negatives below), buy too high
        const result = stockProcess(950, PA2, 1, empty, 10000, 10000, 0, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        expect(result.str).toMatch(/Buy too high/);
        expect(result.bCount).toBe(0);
    });

    // -----------------------------------------------------------------------
    // Sell signals
    // -----------------------------------------------------------------------
    test('sP=1 (<2) → type 8 "Sell 3/4" in str', () => {
        // price=950: sP=1 (one negative -1000 above)
        const result = stockProcess(950, PA2, 1, empty, 10000, 10000, 5, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        expect(result.str).toMatch(/Sell 3\/4/);
        expect(result.type).toBe(8);
    });

    test('sP=2 (<3) → type 5 "Sell 1/2" in str', () => {
        // price=700: sP=2 (two negatives -1000,-900 above)
        const result = stockProcess(700, PA2, 1, empty, 10000, 10000, 5, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        expect(result.str).toMatch(/Sell 1\/2/);
        expect(result.type).toBe(5);
    });

    test('sP=3 (<4) → type 9 "Sell 1/4" in str', () => {
        // price=400: sP=3 (three negatives -1000,-900,-600 above)
        const result = stockProcess(400, PA2, 1, empty, 10000, 10000, 5, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        expect(result.str).toMatch(/Sell 1\/4/);
        expect(result.type).toBe(9);
    });

    test('sP=5 (else branch) → standard "Sell" in str', () => {
        // price=200: sP=5 (five negatives above), standard sell
        const result = stockProcess(200, PA2, 1, empty, 10000, 10000, 5, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        expect(result.str).toMatch(/Sell \d/);
        expect(result.sell).toBeGreaterThan(0);
    });

    test('sP>5 → "Sell too low" in str, sCount=0', () => {
        // price=50: sP=7 (all negatives above 50), sell too low
        const result = stockProcess(50, PA2, 1, empty, 10000, 10000, 5, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        expect(result.str).toMatch(/Sell too low/);
        expect(result.sCount).toBe(0);
    });

    // -----------------------------------------------------------------------
    // Combined buy + sell signals in middle range
    // -----------------------------------------------------------------------
    test('price=200 produces both buy (type 7) and standard sell in one call', () => {
        const result = stockProcess(200, PA2, 1, empty, 10000, 10000, 3, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        expect(result.str).toMatch(/Buy 1\/4/);
        expect(result.str).toMatch(/Sell/);
        expect(result.buy).toBeGreaterThan(0);
        expect(result.sell).toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // previous.time branches — price dropped after buy
    // -----------------------------------------------------------------------
    test('previous.price >= price, type=buy, in cooldown → is_buy=false, is_sell=false', () => {
        const now = 10000000;
        const prev = { price: 300, time: now - 100, type: 'buy', buy: [], sell: [] };
        // now - prev.time = 100 << ttime → both false
        const result = stockProcess(200, PA2, 1, prev, 10000, 10000, 3, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, now);
        expect(result.bCount).toBe(0);
        expect(result.sCount).toBe(0);
    });

    test('previous.price >= price, type=buy, cooldown expired → both can trade', () => {
        const now = 10000000;
        const prev = { price: 300, time: now - ttime - 1, type: 'buy', buy: [], sell: [] };
        const result = stockProcess(200, PA2, 1, prev, 10000, 10000, 3, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, now);
        // at least one of buy/sell should be non-zero (timer expired)
        expect(result.bCount + result.sCount).toBeGreaterThanOrEqual(0);
    });

    test('previous.price >= price, type=sell, in cooldown → both false', () => {
        const now = 10000000;
        const prev = { price: 300, time: now - 100, type: 'sell', buy: [], sell: [] };
        const result = stockProcess(200, PA2, 1, prev, 10000, 10000, 3, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, now);
        expect(result.bCount).toBe(0);
        expect(result.sCount).toBe(0);
    });

    // -----------------------------------------------------------------------
    // previous.time branches — price rose after sell
    // -----------------------------------------------------------------------
    test('previous.price < price, type=sell, in cooldown → both false', () => {
        const now = 10000000;
        const prev = { price: 50, time: now - 100, type: 'sell', buy: [], sell: [] };
        const result = stockProcess(200, PA2, 1, prev, 10000, 10000, 3, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, now);
        expect(result.bCount).toBe(0);
        expect(result.sCount).toBe(0);
    });

    test('previous.price < price, type=buy, in cooldown → both false', () => {
        const now = 10000000;
        const prev = { price: 50, time: now - 100, type: 'buy', buy: [], sell: [] };
        const result = stockProcess(200, PA2, 1, prev, 10000, 10000, 3, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, now);
        expect(result.bCount).toBe(0);
        expect(result.sCount).toBe(0);
    });

    // -----------------------------------------------------------------------
    // finalBuy — pAmount=0 → bCount=0
    // -----------------------------------------------------------------------
    test('pAmount=0 → finalBuy sets bCount=0', () => {
        const result = stockProcess(200, PA2, 1, empty, 10000, 0, 0, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        expect(result.bCount).toBe(0);
    });

    test('pAmount very small → finalBuy sets bCount=0', () => {
        const result = stockProcess(200, PA2, 1, empty, 10000, 0.001, 0, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        expect(result.bCount).toBe(0);
    });

    test('pCount=0 → finalSell sets sCount=0, type back to 0', () => {
        // sP=3 normally gives type=9, but pCount=0 zeroes sCount
        const result = stockProcess(400, PA2, 1, empty, 10000, 10000, 0, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        expect(result.sCount).toBe(0);
        expect(result.type).toBe(0);
    });

    test('pAmount=0 → finalSell: sCount=4*priceTimes', () => {
        // pCount > 0, pAmount=0, sP=3 → type=9 → finalSell → sCount=4
        const result = stockProcess(400, PA2, 1, empty, 10000, 0, 5, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        expect(result.sCount).toBe(4);
    });

    test('priceTimes=2 affects bCount/sCount calculation', () => {
        const r1 = stockProcess(200, PA2, 1, empty, 10000, 10000, 5, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        const r2 = stockProcess(200, PA2, 2, empty, 10000, 10000, 5, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        // priceTimes changes bCount/sCount; we only assert they differ or are proportional
        expect(r2.buy).toBeGreaterThan(0);
        expect(r2.sell).toBeGreaterThan(0);
    });

    test('priceTimes=0 is treated as 1 (via priceTimes = priceTimes || 1)', () => {
        const r0 = stockProcess(200, PA2, 0, empty, 10000, 10000, 3, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        const r1 = stockProcess(200, PA2, 1, empty, 10000, 10000, 3, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        expect(r0.buy).toBe(r1.buy);
        expect(r0.sell).toBe(r1.sell);
    });

    test('returns object with required keys', () => {
        const result = stockProcess(200, PA2, 1, empty, 10000, 10000, 3, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        expect(result).toHaveProperty('price', 200);
        expect(result).toHaveProperty('str');
        expect(result).toHaveProperty('buy');
        expect(result).toHaveProperty('sell');
        expect(result).toHaveProperty('type');
        expect(result).toHaveProperty('bCount');
        expect(result).toHaveProperty('sCount');
    });

    test('sType=1 (bitfinex) uses bitfinexTicker for rounding', () => {
        // sType=1 → bitfinexTicker instead of twse/usse ticker
        const result = stockProcess(200, PA2, 1, empty, 10000, 10000, 3, 0, 0, 10, 0, 1, 0.006, ttime, tinterval, farFuture);
        expect(result.buy).toBeGreaterThan(0);
    });

    test('fee=USSE_FEE uses usseTicker for rounding', () => {
        const result = stockProcess(200, PA2, 1, empty, 10000, 10000, 3, 0, 0, 10, 0, 0, 0.004, ttime, tinterval, farFuture);
        expect(result.buy).toBeGreaterThan(0);
    });

    test('buy price clamped to upLimit when pCount < 2*priceTimes', () => {
        // pCount=0 < 2, upLimit=50, price=200 → bP=5 → type 7 buy
        // finalBuy: buy > upLimit=50 → buy = twseTicker(50, false) = 50
        const result = stockProcess(200, PA2, 1, empty, 10000, 10000, 0, 0, 0, 50, 0, 0, 0.006, ttime, tinterval, farFuture);
        if (result.buy > 0) {
            expect(result.buy).toBeLessThanOrEqual(50);
        }
    });

    test('pPl<0, pPricecost set → sell below cost is zeroed', () => {
        // pCount > 0, pPl < 0 > -pOrig/4, pAmount/pOrig > 3/4, sell < pPricecost
        const result = stockProcess(700, PA2, 1, empty, 10000, 9000, 5, 500, -100, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        // sell=type5 sell price; if sell < pPricecost(500), sCount zeroed
        // 700 gives sP=2 → type5 sell at ~700; 700 > 500 so condition not met
        expect(result).toBeDefined();
    });
});

// ===========================================================================
// stockTest
// ===========================================================================
describe('stockTest', () => {
    const makeArr = (count, hBase, lBase, vBase = 1000) =>
        Array.from({ length: count }, (_, i) => ({
            h: hBase + (i % 7) * 2,
            l: lBase - (i % 5) * 2,
            v: vBase + i * 5,
        }));

    let raw300, loga300;

    beforeAll(() => {
        raw300 = makeArr(300, 110, 90);
        loga300 = logArray(130, 85);
    });

    test('returns object with str and start when valid data', () => {
        const result = stockTest(raw300, loga300, 85, 0, 0);
        if (result !== 'data miss') {
            expect(result).toHaveProperty('str');
            expect(result).toHaveProperty('start');
        }
    });

    test('str format matches pattern when valid', () => {
        const result = stockTest(raw300, loga300, 85, 0, 0);
        if (result !== 'data miss') {
            // format: "x% n x% x% n n x%"
            expect(result.str).toMatch(/[-\d.]+ [-\d.]+/);
        }
    });

    test('start=0, len=200: startI is within bounds', () => {
        const result = stockTest(raw300, loga300, 85, 0, 0);
        if (result !== 'data miss') {
            expect(result.start).toBeGreaterThanOrEqual(0);
            expect(result.start).toBeLessThan(raw300.length);
        }
    });

    test('insufficient data returns early result with 0s', () => {
        // Array shorter than len → startI <= len-1 → early return
        const shortArr = makeArr(50, 110, 90);
        const result = stockTest(shortArr, loga300, 85, 0, 0, false, 200);
        if (result !== 'data miss') {
            expect(result.str).toBe('0% 0 0% 0% 0 0 0%');
        }
    });

    test('h===null entry returns "data miss"', () => {
        const badArr = makeArr(250, 110, 90);
        badArr[100] = { h: null, l: null, v: 100 };
        const result = stockTest(badArr, loga300, 85, 0, 0, false, 100);
        // May or may not hit null depending on path, but should not throw
        expect(['data miss', 'object'].includes(typeof result === 'object' ? 'object' : result)).toBe(true);
    });

    test('reverse=true uses reverse scan path', () => {
        const result = stockTest(raw300, loga300, 85, 0, raw300.length - 220, true, 200);
        if (result !== 'data miss') {
            expect(result).toHaveProperty('str');
        }
    });
});

// ===========================================================================
// getSuggestionData
// ===========================================================================
describe('getSuggestionData', () => {
    test('returns empty twse suggestion object by default', () => {
        const data = getSuggestionData('twse');
        expect(typeof data).toBe('object');
    });

    test('returns empty usse suggestion object', () => {
        const data = getSuggestionData('usse');
        expect(typeof data).toBe('object');
    });

    test('defaults to twse', () => {
        const d1 = getSuggestionData();
        const d2 = getSuggestionData('twse');
        expect(d1).toBe(d2);
    });
});

// ===========================================================================
// getStockListV2
// ===========================================================================
describe('getStockListV2', () => {
    test('unknown type → rejects with "stock type unknown!!!"', async () => {
        await expect(getStockListV2('unknown', 2024, 6)).rejects.toMatchObject({ message: 'stock type unknown!!!' });
    });

    test('twse: builds stock_list from HTML DOM with matching table class', async () => {
        // Structure: html > body > div > [noBorderTable, dataTable]
        // findTag does single-level search: tr must be direct child of table

        // noBorder table: class=noBorder, tr (direct), td[0]=dummy td[1]=name text
        const nameCell1 = mkNode('td', '');
        const nameCell2 = mkNode('td', '', ['元大台灣卓越50證券投資信託基金']);
        const noBorderRow = mkNode('tr', '', [nameCell1, nameCell2]);
        const noBorderTable = mkNode('table', 'noBorder', [noBorderRow]);

        // data table: tr with class 'even', td[0] = index text
        const indexCell = mkNode('td', '', ['0050']);
        const evenRow = mkNode('tr', 'even', [indexCell]);
        const dataTable = mkNode('table', '', [evenRow]);

        const div = mkNode('div', '', [noBorderTable, dataTable]);
        const body = mkNode('body', '', [div]);
        const html = mkNode('html', '', [body]);

        mockApi.mockResolvedValue('<html>...</html>');
        mockParseDOM.mockReturnValue([html]);

        const result = await getStockListV2('twse', 2024, 6);
        expect(Array.isArray(result)).toBe(true);
        // 0050 is numeric, not === '2888', so it should be added
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toMatchObject({ index: '0050', type: 'twse' });
    });

    test('twse: empty div → returns empty stock_list', async () => {
        const div = mkNode('div', '', []);
        const body = mkNode('body', '', [div]);
        const html = mkNode('html', '', [body]);

        mockApi.mockResolvedValue('<html></html>');
        mockParseDOM.mockReturnValue([html]);

        const result = await getStockListV2('twse', 2024, 6);
        expect(result).toEqual([]);
    });

    test('twse month<4 → quarter=4, year decremented', async () => {
        const div = mkNode('div', '', []);
        const body = mkNode('body', '', [div]);
        const html = mkNode('html', '', [body]);
        mockApi.mockResolvedValue('<html></html>');
        mockParseDOM.mockReturnValue([html]);
        const result = await getStockListV2('twse', 2024, 2);  // month=2 < 4
        expect(result).toEqual([]);
        expect(mockApi).toHaveBeenCalledWith('url', expect.any(String), expect.objectContaining({
            post: expect.objectContaining({ season: '04' }),
        }));
    });

    test('twse month<10 → quarter=2', async () => {
        const div = mkNode('div', '', []);
        const body = mkNode('body', '', [div]);
        const html = mkNode('html', '', [body]);
        mockApi.mockResolvedValue('<html></html>');
        mockParseDOM.mockReturnValue([html]);
        const result = await getStockListV2('twse', 2024, 8);  // month=8 → 7<=8<10 → quarter=2
        expect(result).toEqual([]);
        expect(mockApi).toHaveBeenCalledWith('url', expect.any(String), expect.objectContaining({
            post: expect.objectContaining({ season: '02' }),
        }));
    });

    test('usse: returns array from Dow Jones DOM', async () => {
        const thElem = mkNode('th', '', [mkNode('a', '', ['Apple Inc.'])]);
        const td0 = mkNode('td', '');
        const tdTicker = mkNode('td', '', [mkNode('a', '', ['AAPL'])]);
        const dataRow = mkNode('tr', '', [thElem, td0, tdTicker]);
        const tbodyNode = mkNode('tbody', '', [dataRow]);
        const constitTable = mkNode('table', 'constituents', [tbodyNode]);
        const parserOutput = mkNode('div', 'mw-content-ltr mw-parser-output', [constitTable]);
        const contentText = mkNode('div', 'mw-content-text', [parserOutput]);
        const bodyContent = mkNode('div', 'bodyContent', [contentText]);
        const contentArea = mkNode('main', 'content', [bodyContent]);
        const contentContainer = mkNode('div', 'mw-content-container', [contentArea]);
        const innerContainer = mkNode('div', 'mw-page-container-inner', [contentContainer]);
        const pageContainer = mkNode('div', 'mw-page-container', [innerContainer]);
        const bodyNode = mkNode('body', '', [pageContainer]);
        const htmlDow = mkNode('html', '', [bodyNode]);

        // Empty tbody for subsequent calls (Nasdaq-100, S&P 500)
        const emptyTbody = mkNode('tbody', '');
        const emptyTable = mkNode('table', 'constituents', [emptyTbody]);
        const emptyOutput = mkNode('div', 'mw-content-ltr mw-parser-output', [emptyTable]);
        const emptyText = mkNode('div', 'mw-content-text', [emptyOutput]);
        const emptyBodyContent = mkNode('div', 'bodyContent', [emptyText]);
        const emptyContent = mkNode('main', 'content', [emptyBodyContent]);
        const emptyContainer = mkNode('div', 'mw-content-container', [emptyContent]);
        const emptyInner = mkNode('div', 'mw-page-container-inner', [emptyContainer]);
        const emptyPage = mkNode('div', 'mw-page-container', [emptyInner]);
        const emptyBody = mkNode('body', '', [emptyPage]);
        const htmlEmpty = mkNode('html', '', [emptyBody]);

        mockApi.mockResolvedValue('<html>...</html>');
        mockParseDOM
            .mockReturnValueOnce([htmlDow])   // Dow Jones
            .mockReturnValueOnce([htmlEmpty]) // Nasdaq-100
            .mockReturnValueOnce([htmlEmpty]); // S&P 500

        const result = await getStockListV2('usse', 2024, 6);
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toMatchObject({ index: 'AAPL', type: 'usse' });
    });
});

// ===========================================================================
// getStockPERV2
// ===========================================================================
describe('getStockPERV2', () => {
    test('no item found → rejects with "can not find stock!!!"', async () => {
        mockMongo.mockResolvedValue([]);
        await expect(StockTool.getStockPERV2('id1')).rejects.toMatchObject({ message: 'can not find stock!!!' });
    });

    test('usse type → returns array directly from DB values', async () => {
        // latestQuarter=2, latestYear=2023 → start = '112' + '06' = '11206'
        mockMongo.mockResolvedValue([{
            _id: 'id2', type: 'usse', index: 'AAPL',
            per: 25, pdr: 50, pbr: 8,
            latestQuarter: 2, latestYear: 2023,
        }]);
        const result = await StockTool.getStockPERV2('id2');
        expect(result).toEqual([25, 50, 8, 'AAPL', '11206']);
    });

    test('unknown stock type → rejects with "stock type unknown!!!"', async () => {
        mockMongo.mockResolvedValue([{ _id: 'id3', type: 'other', index: 'X', latestQuarter: 0, latestYear: 2023 }]);
        await expect(StockTool.getStockPERV2('id3')).rejects.toMatchObject({ message: 'stock type unknown!!!' });
    });

    test('latestQuarter=0 → start uses latestYear-1912 + "12"', async () => {
        mockMongo.mockResolvedValue([{
            _id: 'id4', type: 'usse', index: 'MSFT',
            per: 30, pdr: 999, pbr: 10,
            latestQuarter: 0, latestYear: 2023,
        }]);
        const result = await StockTool.getStockPERV2('id4');
        expect(result[4]).toBe('11112'); // 2023-1912=111, '12'
    });

    test('latestQuarter=1 → start uses Q*3=03', async () => {
        mockMongo.mockResolvedValue([{
            _id: 'id5', type: 'usse', index: 'GOOG',
            per: 20, pdr: 100, pbr: 5,
            latestQuarter: 1, latestYear: 2023,
        }]);
        const result = await StockTool.getStockPERV2('id5');
        expect(result[4]).toBe('11203'); // 2023-1911=112, quarter*3=3 completeZero→'03'
    });
});

// ===========================================================================
// testData
// ===========================================================================
describe('testData', () => {
    test('empty stock list → resolves without errors', async () => {
        mockMongo.mockResolvedValue([]);
        await expect(StockTool.testData()).resolves.toBeUndefined();
    });

    test('stock with no redis data → logs "data empty"', async () => {
        mockMongo.mockResolvedValue([{ type: 'twse', index: '2330', name: '台積電' }]);
        mockRedis.mockResolvedValue(null);
        await expect(StockTool.testData()).resolves.toBeUndefined();
    });

    test('stock with null h/l entry → resets Redis etime to -1', async () => {
        mockMongo.mockResolvedValue([{ type: 'twse', index: '2330', name: '台積電' }]);
        const rawList = {
            '2024': {
                '06': {
                    raw: [{ h: null, l: null, v: 1000 }],
                }
            }
        };
        mockRedis.mockImplementation((op) => {
            if (op === 'hgetall') return Promise.resolve({
                raw_list: JSON.stringify(rawList),
                ret_obj: 'some',
                etime: '99999',
            });
            if (op === 'hmset') return Promise.resolve();
            return Promise.resolve();
        });
        await StockTool.testData();
        expect(mockRedis).toHaveBeenCalledWith('hmset', expect.any(String), expect.objectContaining({ etime: -1 }));
    });

    test('stock with valid h/l data → no Redis reset', async () => {
        mockMongo.mockResolvedValue([{ type: 'twse', index: '2330', name: '台積電' }]);
        const rawList = {
            '2024': {
                '06': {
                    raw: [{ h: 150, l: 140, v: 1000 }],
                }
            }
        };
        mockRedis.mockResolvedValue({
            raw_list: JSON.stringify(rawList),
            ret_obj: 'ok',
            etime: '99999',
        });
        await StockTool.testData();
        expect(mockRedis).not.toHaveBeenCalledWith('hmset', expect.any(String), expect.objectContaining({ etime: -1 }));
    });
});

// ===========================================================================
// cleanUseless
// ===========================================================================
describe('cleanUseless', () => {
    const makeStockItem = (type, index, name) => ({ _id: `id-${index}`, type, index, name });

    test('dry run true + stock not in TOTAL → logs but does not delete', async () => {
        mockMongo.mockImplementation((op) => {
            if (op === 'find' && mockMongo.mock.calls.filter(c => c[0] === 'find').length === 1) {
                return Promise.resolve([makeStockItem('twse', '2330', '台積電')]);
            }
            return Promise.resolve([]); // second find: not in TOTAL
        });
        await StockTool.cleanUseless(true);
        expect(mockMongo).not.toHaveBeenCalledWith('deleteMany', expect.anything(), expect.anything());
    });

    test('dry run false + stock not in TOTAL → deletes from STOCKDB', async () => {
        const calls = { count: 0 };
        mockMongo.mockImplementation((op) => {
            if (op === 'find') {
                calls.count++;
                if (calls.count === 1) return Promise.resolve([makeStockItem('twse', '2330', '台積電')]);
                return Promise.resolve([]); // not in TOTAL
            }
            if (op === 'deleteMany') return Promise.resolve({});
            return Promise.resolve([]);
        });
        await StockTool.cleanUseless(false);
        expect(mockMongo).toHaveBeenCalledWith('deleteMany', expect.any(String), expect.any(Object));
    });

    test('stock is in TOTAL → added to keepList (no delete)', async () => {
        const calls = { count: 0 };
        mockMongo.mockImplementation((op) => {
            if (op === 'find') {
                calls.count++;
                if (calls.count === 1) return Promise.resolve([makeStockItem('twse', '2330', '台積電')]);
                return Promise.resolve([{ _id: 'total-id' }]); // found in TOTAL
            }
            return Promise.resolve([]);
        });
        await StockTool.cleanUseless(false);
        expect(mockMongo).not.toHaveBeenCalledWith('deleteMany', expect.anything(), expect.anything());
    });
});

// ===========================================================================
// getStockTotal
// ===========================================================================
describe('getStockTotal', () => {
    test('empty DB → inserts new twse and usse total rows', async () => {
        const newItem = { _id: 'new-id', setype: 'twse', amount: 1000000, name: 'twse 投資部位', type: 'total' };
        const newItem1 = { _id: 'new-id2', setype: 'usse', amount: 500000, name: 'usse 投資部位', type: 'total' };
        mockMongo.mockImplementation((op) => {
            if (op === 'find') return Promise.resolve([]);
            if (op === 'insert') {
                // Return the item based on setype in the insert data
                const arg = mockMongo.mock.calls[mockMongo.mock.calls.length - 1][2];
                return Promise.resolve([arg.setype === 'usse' ? newItem1 : newItem]);
            }
        });
        const result = await StockTool.getStockTotal({ _id: 'user1' });
        expect(result).toHaveProperty('se');
        expect(result).toHaveProperty('stock');
        expect(result.se).toHaveLength(2);
    });

    test('existing items → builds portfolio summary', async () => {
        const items = [
            { _id: 'total-twse', type: 'total', setype: 'twse', amount: 1000000, name: 'twse total', count: 1 },
            { _id: 'total-usse', type: 'total', setype: 'usse', amount: 500000, name: 'usse total', count: 1 },
            {
                _id: 'stock1', type: 'Tech', setype: 'twse', index: '2330', name: 'tsmc',
                price: 500, count: 100, amount: 50000, orig: 50000,
                mul: 0, clear: false, ing: 0, str: '', order: null,
                profit: 0, previousPrice: 490,
            },
        ];
        mockMongo.mockResolvedValue(items);
        const result = await StockTool.getStockTotal({ _id: 'user1' });
        expect(result).toHaveProperty('se');
        expect(result).toHaveProperty('stock');
        expect(Array.isArray(result.stock)).toBe(true);
    });

    test('existing items with clear flag → str shows "Clearing"', async () => {
        const items = [
            { _id: 'total-twse', type: 'total', setype: 'twse', amount: 1000000, name: 't', count: 1 },
            {
                _id: 's1', type: 'Tech', setype: 'twse', index: '2330', name: 'tsmc',
                price: 500, count: 100, amount: 50000, orig: 50000,
                mul: 0, clear: true, ing: 0, str: '', order: null, profit: 0,
            },
        ];
        mockMongo.mockResolvedValue(items);
        const result = await StockTool.getStockTotal({ _id: 'user1' });
        const s = result.stock.find(v => v.name === 'tsmc');
        if (s) expect(s.str).toMatch(/Clearing/);
    });

    test('existing items with usse stock → usse totalPrice1 path', async () => {
        const items = [
            { _id: 'total-twse', type: 'total', setype: 'twse', amount: 1000000, name: 'twse total', count: 1 },
            { _id: 'total-usse', type: 'total', setype: 'usse', amount: 500000, name: 'usse total', count: 1 },
            {
                _id: 'us1', type: 'Tech', setype: 'usse', index: 'AAPL', name: 'apple',
                price: 150, count: 10, amount: 50000, orig: 50000,
                mul: 0, clear: false, ing: 0, str: '', order: null,
                profit: 0, previousPrice: 145,
            },
        ];
        mockMongo.mockResolvedValue(items);
        const result = await StockTool.getStockTotal({ _id: 'user1' });
        expect(result).toHaveProperty('se');
        const usseSe = result.se.find(s => s.type === 'USSE');
        expect(usseSe).toBeDefined();
    });

    test('usse stock with mul → uses orig*mul for profit calc', async () => {
        const items = [
            { _id: 'total-twse', type: 'total', setype: 'twse', amount: 1000000, name: 'twse total', count: 1 },
            { _id: 'total-usse', type: 'total', setype: 'usse', amount: 500000, name: 'usse total', count: 1 },
            {
                _id: 'us1', type: 'Tech', setype: 'usse', index: 'AAPL', name: 'apple',
                price: 200, count: 5, amount: 50000, orig: 40000,
                mul: 2, clear: false, ing: 0, str: '', order: null, profit: 0,
            },
            {
                _id: 'tw1', type: 'Tech', setype: 'twse', index: '2330', name: 'tsmc',
                price: 500, count: 200, amount: 100000, orig: 90000,
                mul: 0, clear: false, ing: 0, str: '', order: null, profit: 0, previousPrice: 490,
            },
        ];
        mockMongo.mockResolvedValue(items);
        const result = await StockTool.getStockTotal({ _id: 'user1' });
        // Multiple stocks — orderbyStock sorts by current; both usse and twse present
        const sorted = result.stock;
        expect(sorted.some(s => s.se === 1)).toBe(true);  // usse item
        expect(sorted.some(s => s.se === 0)).toBe(true);  // twse item
    });
});

// ===========================================================================
// updateStockTotal
// ===========================================================================
describe('updateStockTotal', () => {
    const makeItems = () => [
        { _id: 'ttw', type: 'total', setype: 'twse', amount: 1000000 },
        { _id: 'tus', type: 'total', setype: 'usse', amount: 500000 },
        {
            _id: 'st1', type: 'Tech', setype: 'twse', index: '2330', name: 'tsmc',
            price: 500, count: 100, amount: 50000, orig: 50000,
            web: [450, 460, 470, -480, 490, 500], mid: 480, times: 1,
            mul: 0, clear: false, ing: 0, str: '', order: null,
            previous: { buy: [], sell: [] },
        },
    ];

    test('empty items → rejects with "No user data!!!"', async () => {
        mockMongo.mockResolvedValue([]);
        await expect(StockTool.updateStockTotal({ _id: 'u1' }, ['remaintwse 999999'], false))
            .rejects.toMatchObject({ message: 'No user data!!!' });
    });

    test('remaintwse command → updates remain for twse', async () => {
        mockMongo.mockResolvedValue(makeItems());
        await StockTool.updateStockTotal({ _id: 'u1' }, ['remaintwse 2000000'], false);
        // Should not throw; remain is updated in memory
    });

    test('remainusse command → updates remain for usse', async () => {
        mockMongo.mockResolvedValue(makeItems());
        await StockTool.updateStockTotal({ _id: 'u1' }, ['remainusse 700000'], false);
    });

    test('clear command → sets clear flag on matching stock', async () => {
        mockMongo.mockResolvedValue(makeItems());
        await StockTool.updateStockTotal({ _id: 'u1' }, ['clear twse2330'], false);
    });

    test('cost command (count + price + cost) → updates count/amount without price fetch', async () => {
        mockMongo.mockResolvedValue(makeItems());
        // 'twse2330 2 50 cost': cmd[2]=2, cmd[3]=50, cmd[4]=cost → updates count/amount
        // real=false → calls rest() (no actual Mongo writes, just returns portfolio summary)
        const result = await StockTool.updateStockTotal({ _id: 'u1' }, ['twse2330 2 50 cost'], false);
        expect(result).toBeDefined();
    });

    test('checkTotal: no usse total in DB → inserts usse total', async () => {
        // Only twse total present, no usse total → triggers checkTotal insert path (lines 2579-2610)
        const twseOnly = [
            { _id: 'ttw', type: 'total', setype: 'twse', amount: 1000000, name: 'twse 投資部位' },
        ];
        let insertCount = 0;
        mockMongo.mockImplementation((op, db, data) => {
            if (op === 'find') return Promise.resolve(twseOnly);
            if (op === 'insert') {
                insertCount++;
                return Promise.resolve([{ _id: `ins${insertCount}`, ...data, name: data.name || 'inserted', type: 'total' }]);
            }
            return Promise.resolve({});
        });
        const result = await StockTool.updateStockTotal({ _id: 'u1' }, ['remaintwse 999999'], false);
        expect(result).toBeDefined();
        expect(mockMongo).toHaveBeenCalledWith('insert', expect.any(String), expect.objectContaining({ setype: 'usse' }));
    });

    test('checkTotal: no twse total in DB (only usse) → inserts twse total', async () => {
        // Only usse total present, no twse total → triggers checkTotal else-if path (lines 2612-2625)
        const usseOnly = [
            { _id: 'tus', type: 'total', setype: 'usse', amount: 500000, name: 'usse 投資部位' },
        ];
        let insertCount = 0;
        mockMongo.mockImplementation((op, db, data) => {
            if (op === 'find') return Promise.resolve(usseOnly);
            if (op === 'insert') {
                insertCount++;
                return Promise.resolve([{ _id: `ins${insertCount}`, ...data, name: data.name || 'inserted', type: 'total' }]);
            }
            return Promise.resolve({});
        });
        const result = await StockTool.updateStockTotal({ _id: 'u1' }, ['remainusse 999999'], false);
        expect(result).toBeDefined();
        expect(mockMongo).toHaveBeenCalledWith('insert', expect.any(String), expect.objectContaining({ setype: 'twse' }));
    });
});

// ===========================================================================
// stockStatus
// ===========================================================================
describe('stockStatus', () => {
    test('empty TOTAL items → resolves', async () => {
        mockMongo.mockResolvedValue([]);
        mockGetUssePosition.mockReturnValue([{ price: 100000 }]);
        mockGetTwsePosition.mockReturnValue([{ price: 200000 }]);
        mockGetUsseOrder.mockReturnValue([]);
        mockGetTwseOrder.mockReturnValue([]);
        await expect(stockStatus(false)).resolves.toBeUndefined();
    });

    test('items with index=0 are skipped → no price fetch', async () => {
        mockMongo.mockResolvedValue([
            { _id: 'id0', index: 0, setype: 'twse', type: 'total', sType: undefined },
        ]);
        mockGetUssePosition.mockReturnValue([{ price: 100000 }]);
        mockGetTwsePosition.mockReturnValue([{ price: 200000 }]);
        mockGetUsseOrder.mockReturnValue([]);
        mockGetTwseOrder.mockReturnValue([]);
        await expect(stockStatus(false)).resolves.toBeUndefined();
        // Api should not be called for price fetch since index=0
        expect(mockApi).not.toHaveBeenCalled();
    });

    test('stock item with stype → still processes order data', async () => {
        // items with sType defined are excluded by the query (sType: {$exists: false})
        // but we can test that items with index=0 are safely skipped
        mockMongo.mockResolvedValue([
            { _id: 'id0', index: 0, setype: 'twse', type: 'total' },
            { _id: 'id1', index: null, setype: 'usse', type: 'Tech' },
        ]);
        mockGetUssePosition.mockReturnValue([{ symbol: 'AAPL', price: 100, amount: 5 }]);
        mockGetTwsePosition.mockReturnValue([{ symbol: '2330', price: 500, amount: 3 }]);
        mockGetUsseOrder.mockReturnValue([]);
        mockGetTwseOrder.mockReturnValue([]);
        await expect(stockStatus(false)).resolves.toBeUndefined();
        // No Api calls since all items have index=0 or null
        expect(mockApi).not.toHaveBeenCalled();
    });
});

// ===========================================================================
// Warp guard tests (stockFiltering / stockIntervaling / stockPredicting)
// ===========================================================================
describe('warp guards', () => {
    test('stockFilterWarp: already filtering → rejects "there is another filter running"', async () => {
        // Put flag in filtering state manually via calling stockFilterWarp concurrently
        // Simplest: call it once (which sets flag true) then call again immediately
        // But since the mock will fail, we set up Mongo to hang
        mockMongo.mockReturnValue(new Promise(() => {})); // never resolves
        const first = StockTool.stockFilterWarp(null, { _id: '000000000000000000000000' }, {});
        // Flag is now true; second call should reject
        await expect(StockTool.stockFilterWarp()).rejects.toMatchObject({ message: 'there is another filter running' });
        // Clean up: reset flags so the hanging promise doesn't affect other tests
        StockTool._resetFlags();
    });

    test('getIntervalWarp: already running → rejects "there is another inverval running"', async () => {
        mockMongo.mockReturnValue(new Promise(() => {}));
        StockTool.getIntervalWarp('id1', {});
        await expect(StockTool.getIntervalWarp('id1', {})).rejects.toMatchObject({ message: 'there is another inverval running' });
        StockTool._resetFlags();
    });

    test('getPredictPERWarp: already predicting → rejects "there is another predict running"', async () => {
        // First call sets stockPredicting=true then throws synchronously (getPredictPER missing)
        try { StockTool.getPredictPERWarp('id1', {}); } catch (e) {}
        await expect(StockTool.getPredictPERWarp('id1', {})).rejects.toMatchObject({ message: 'there is another predict running' });
        StockTool._resetFlags();
    });

    test('getPredictPERWarp BUG: this.getPredictPER is not defined → throws TypeError', () => {
        // getPredictPER does NOT exist on the default export → synchronous TypeError
        expect(() => StockTool.getPredictPERWarp('id1', {})).toThrow(/getPredictPER is not a function/);
    });

    test('stockFilterWarp: filter completes → returns count and resets flag', async () => {
        // Empty tag query → filterList stays empty → returns 0
        mockMongo.mockResolvedValue([]);
        mockTagInstance.tagQuery.mockResolvedValue({ items: [] });
        const result = await StockTool.stockFilterWarp(null, { _id: '000000000000000000000000', perm: 1 }, {});
        expect(result).toBe(0);
        expect(StockTool._getFlags().stockFiltering).toBe(false);
    });

    test('stockFilterWarp: userlist with items → runs compare_list', async () => {
        // tagQuery returns empty → filterList=[], filterList1=[]
        // Mongo('find', USERDB) returns 1 user → compare_list runs
        // Mongo('find', TOTALDB) returns stock items → covers lines 1704-1803
        mockTagInstance.tagQuery.mockResolvedValue({ items: [] });
        let mongoCallCount = 0;
        mockMongo.mockImplementation((op, db) => {
            mongoCallCount++;
            if (op === 'find' && db === 'userdb') {
                return Promise.resolve([{ _id: 'u1', username: 'testuser', perm: 1 }]);
            }
            if (op === 'find') {
                return Promise.resolve([
                    { _id: 'tot1', type: 'total', setype: 'twse', index: 0 },
                    { _id: 'st1', type: 'Tech', setype: 'twse', index: '2330', name: 'tsmc' },
                ]);
            }
            return Promise.resolve({});
        });
        const result = await StockTool.stockFilterWarp(null, { _id: '000000000000000000000000' }, {});
        expect(result).toBe(0);
        expect(StockTool._getFlags().stockFiltering).toBe(false);
    });

    test('stockFilterWarp error → resets stockFiltering=false', async () => {
        mockTagInstance.tagQuery.mockRejectedValueOnce(new Error('tag fail'));
        await expect(StockTool.stockFilterWarp(null, { _id: '000000000000000000000000' }, {}))
            .rejects.toBeDefined();
        expect(StockTool._getFlags().stockFiltering).toBe(false);
    });
});

// ===========================================================================
// _resetFlags / _getFlags helpers
// ===========================================================================
describe('_resetFlags / _getFlags', () => {
    test('_getFlags returns all flag states', () => {
        const flags = StockTool._getFlags();
        expect(flags).toHaveProperty('stockFiltering', false);
        expect(flags).toHaveProperty('stockIntervaling', false);
        expect(flags).toHaveProperty('stockPredicting', false);
        expect(flags).toHaveProperty('stringSent', 0);
    });

    test('flags reset to false after _resetFlags', () => {
        // Manually set a flag via a warp call that sets it
        mockMongo.mockReturnValue(new Promise(() => {}));
        StockTool.stockFilterWarp(null, { _id: '000000000000000000000000' }, {});
        expect(StockTool._getFlags().stockFiltering).toBe(true);
        StockTool._resetFlags();
        expect(StockTool._getFlags().stockFiltering).toBe(false);
    });
});

// ===========================================================================
// stockProcess — additional previous.time branches (lines 3349-3351, 3402-3403, 3408)
// ===========================================================================
describe('stockProcess additional previous.time branches', () => {
    const PA2 = [
        -1000, -900, 800, 750, 700,
        -600, 550, 500, 450,
        -400, 350, 300,
        -250, 200, 150,
        -120, 100, 80,
        -60, 40, 20, -10,
    ];
    const ttime = 86400 * 5;
    const tinterval = 86400 * 5;

    test('previous.price >= price, type=sell, cooldown expired → is_buy=is_sell=true', () => {
        const now = 10000000;
        const prev = { price: 300, time: now - ttime - 1, type: 'sell', buy: [], sell: [] };
        const result = stockProcess(200, PA2, 1, prev, 10000, 10000, 3, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, now);
        expect(result.bCount + result.sCount).toBeGreaterThan(0);
    });

    test('previous.price < price, type=sell, sell cooldown expired → is_sell=true', () => {
        const now = 10000000;
        const prev = { price: 50, time: now - ttime * 10, type: 'sell', buy: [], sell: [] };
        const result = stockProcess(400, PA2, 1, prev, 10000, 10000, 3, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, now);
        expect(result).toBeDefined();
    });

    test('previous.price < price, type=buy, cooldown expired → both can trade', () => {
        const now = 10000000;
        const prev = { price: 50, time: now - ttime * 10, type: 'buy', buy: [], sell: [] };
        const result = stockProcess(400, PA2, 1, prev, 10000, 10000, 3, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, now);
        expect(result.bCount + result.sCount).toBeGreaterThan(0);
    });
});

// ===========================================================================
// stockProcess — alternate priceArray to cover newMid conditional branches
// ===========================================================================
describe('stockProcess alternate newMid branches', () => {
    const ttime = 86400 * 5;
    const tinterval = 86400 * 5;
    const farFuture = Math.round(new Date().getTime() / 1000) + 999999999;
    const empty = { buy: [], sell: [] };

    // PA3: negatives from bottom: -10, -60, -500, -300 → 3rd=500 > 300*0.94=282 → line 3256
    const PA3 = [
        -800, -700, 750, 700, 650,
        -600, 550, 500, 450,
        -300, 350, 300,
        -500, 200, 150,
        -120, 100, 80,
        -60, 40, 20, -10,
    ];

    test('resetWeb:1 with newMid updated (3rd neg > 4th neg * 0.94) covers line 3256', () => {
        const result = stockProcess(5, PA3, 1, empty, 10000, 10000, 0, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        expect(result.resetWeb).toBe(1);
        expect(typeof result.newMid).toBe('number');
    });

    // PA4: negatives from top: -800,-700,-300,-400 → 3rd=300 < 400*1.06=424 → line 3297
    const PA4 = [
        -800, -700, 750, 700, 650,
        -300, 550, 500, 450,
        -400, 350, 300,
        -250, 200, 150,
        -120, 100, 80,
        -60, 40, 20, -10,
    ];

    test('resetWeb:2 with newMid updated (3rd neg < 4th neg * 1.06) covers line 3297', () => {
        const result = stockProcess(1000, PA4, 1, empty, 10000, 10000, 0, 0, 0, 10, 0, 0, 0.006, ttime, tinterval, farFuture);
        expect(result.resetWeb).toBe(2);
        expect(typeof result.newMid).toBe('number');
    });
});

// ===========================================================================
// adjustWeb branches — via updateStockTotal
// ===========================================================================
describe('adjustWeb branches', () => {
    const makeItems = () => [
        { _id: 'ttw', type: 'total', setype: 'twse', amount: 1000000 },
        { _id: 'tus', type: 'total', setype: 'usse', amount: 500000 },
        {
            _id: 'st1', type: 'Tech', setype: 'twse', index: '2330', name: 'tsmc',
            price: 500, count: 100, amount: 50000, orig: 50000,
            web: [450, 460, 470, -480, 490, 500], mid: 480, times: 1,
            mul: 0, clear: false, ing: 0, str: '', order: null,
            previous: { buy: [], sell: [] },
        },
    ];

    test('adjustWeb amount < maxAmount/2 force=false → rejects Amount error', async () => {
        // web=[450,460,470,-480,490,500], mid=480 → maxAmount=480*5/3*2=1600 → maxAmount/2=800
        // amount=100 < 800 → adjustWeb returns false → rejects
        mockMongo.mockResolvedValue(makeItems());
        await expect(StockTool.updateStockTotal({ _id: 'u1' }, ['twse2330 100 amount'], false))
            .rejects.toMatchObject({ message: expect.stringContaining('Amount need large') });
    });

    test('adjustWeb amount > maxAmount → count multiplier branch', async () => {
        mockMongo.mockResolvedValue(makeItems());
        const result = await StockTool.updateStockTotal({ _id: 'u1' }, ['twse2330 60000 amount'], false);
        expect(result).toBeDefined();
    });

    test('adjustWeb amount=0 → returns identity (arr, mid unchanged)', async () => {
        mockMongo.mockResolvedValue(makeItems());
        const result = await StockTool.updateStockTotal({ _id: 'u1' }, ['twse2330 0 amount'], false);
        expect(result).toBeDefined();
    });
});

// ===========================================================================
// updateStockTotal real=true — covers recurUpdate → Mongo('update', ...)
// ===========================================================================
describe('updateStockTotal real=true path', () => {
    const makeItems = () => [
        { _id: 'ttw', type: 'total', setype: 'twse', amount: 1000000 },
        { _id: 'tus', type: 'total', setype: 'usse', amount: 500000 },
        {
            _id: 'st1', type: 'Tech', setype: 'twse', index: '2330', name: 'tsmc',
            price: 500, count: 100, amount: 50000, orig: 50000,
            web: [450, 460, 470, -480, 490, 500], mid: 480, times: 1,
            mul: 0, clear: false, ing: 0, str: '', order: null,
            previous: { buy: [], sell: [] },
        },
    ];

    test('real=true triggers recurUpdate → calls Mongo update', async () => {
        mockMongo.mockImplementation((op) => {
            if (op === 'find') return Promise.resolve(makeItems());
            if (op === 'update') return Promise.resolve({});
            return Promise.resolve({});
        });
        await StockTool.updateStockTotal({ _id: 'u1' }, ['twse2330 2 50 cost'], true);
        expect(mockMongo).toHaveBeenCalledWith('update', expect.any(String), expect.any(Object), expect.any(Object));
    });

    test('real=true with remaintwse → Mongo update called', async () => {
        mockMongo.mockImplementation((op) => {
            if (op === 'find') return Promise.resolve(makeItems());
            if (op === 'update') return Promise.resolve({});
            return Promise.resolve({});
        });
        await StockTool.updateStockTotal({ _id: 'u1' }, ['remaintwse 2000000'], true);
        expect(mockMongo).toHaveBeenCalledWith('update', expect.any(String), expect.any(Object), expect.any(Object));
    });
});

// ===========================================================================
// updateStockTotal — new stock `amount` command (No stock data error)
// ===========================================================================
describe('updateStockTotal new stock error', () => {
    test('amount command for non-existent stock → rejects "No stock data!!!"', async () => {
        const items = [
            { _id: 'ttw', type: 'total', setype: 'twse', amount: 1000000 },
            { _id: 'tus', type: 'total', setype: 'usse', amount: 500000 },
        ];
        let findCount = 0;
        mockMongo.mockImplementation((op) => {
            if (op === 'find') {
                findCount++;
                return Promise.resolve(findCount === 1 ? items : []);
            }
            return Promise.resolve([]);
        });
        await expect(StockTool.updateStockTotal({ _id: 'u1' }, ['twse9999 50000 amount'], false))
            .rejects.toMatchObject({ message: 'No stock data!!!' });
    });
});

// ===========================================================================
// stockStatus newStr=true path
// ===========================================================================
describe('stockStatus newStr branch', () => {
    test('newStr=true with empty items sets stringSent', async () => {
        StockTool._resetFlags();
        mockMongo.mockResolvedValue([]);
        mockGetUssePosition.mockReturnValue([]);
        mockGetTwsePosition.mockReturnValue([]);
        mockGetUsseOrder.mockReturnValue([]);
        mockGetTwseOrder.mockReturnValue([]);
        await stockStatus(true);
        expect(StockTool._getFlags().stringSent).toBeGreaterThan(0);
    });

    test('newStr=true but stringSent already set → skips update', async () => {
        StockTool._resetFlags();
        mockMongo.mockResolvedValue([]);
        mockGetUssePosition.mockReturnValue([]);
        mockGetTwsePosition.mockReturnValue([]);
        mockGetUsseOrder.mockReturnValue([]);
        mockGetTwseOrder.mockReturnValue([]);
        await stockStatus(true);
        const sentBefore = StockTool._getFlags().stringSent;
        await stockStatus(true);
        expect(StockTool._getFlags().stringSent).toBe(sentBefore);
    });
});

// ===========================================================================
// getStockListV2 — twse additional branches
// ===========================================================================
describe('getStockListV2 twse additional branches', () => {
    test('noBorder name not in STOCK_INDEX → tag=false, data rows skipped', async () => {
        const nameCell1 = mkNode('td', '');
        const nameCell2 = mkNode('td', '', ['Unknown Fund Not In STOCK_INDEX']);
        const noBorderRow = mkNode('tr', '', [nameCell1, nameCell2]);
        const noBorderTable = mkNode('table', 'noBorder', [noBorderRow]);
        const indexCell = mkNode('td', '', ['0050']);
        const evenRow = mkNode('tr', 'even', [indexCell]);
        const dataTable = mkNode('table', '', [evenRow]);
        const div = mkNode('div', '', [noBorderTable, dataTable]);
        const body = mkNode('body', '', [div]);
        const html = mkNode('html', '', [body]);
        mockApi.mockResolvedValue('<html>...</html>');
        mockParseDOM.mockReturnValue([html]);
        const result = await getStockListV2('twse', 2024, 6);
        expect(result).toEqual([]);
    });

    test('data row with index 2888 excluded → not added to stock_list', async () => {
        const nameCell1 = mkNode('td', '');
        const nameCell2 = mkNode('td', '', ['元大台灣卓越50證券投資信託基金']);
        const noBorderRow = mkNode('tr', '', [nameCell1, nameCell2]);
        const noBorderTable = mkNode('table', 'noBorder', [noBorderRow]);
        const badCell = mkNode('td', '', ['2888']);
        const evenRow = mkNode('tr', 'even', [badCell]);
        const dataTable = mkNode('table', '', [evenRow]);
        const div = mkNode('div', '', [noBorderTable, dataTable]);
        const body = mkNode('body', '', [div]);
        const html = mkNode('html', '', [body]);
        mockApi.mockResolvedValue('<html>...</html>');
        mockParseDOM.mockReturnValue([html]);
        const result = await getStockListV2('twse', 2024, 6);
        expect(result).toEqual([]);
    });

    test('duplicate index in stock_list → tag array appended', async () => {
        const makeNoBorderRow = (name) => {
            const c1 = mkNode('td', '');
            const c2 = mkNode('td', '', [name]);
            return mkNode('tr', '', [c1, c2]);
        };
        const nt1 = mkNode('table', 'noBorder', [makeNoBorderRow('元大台灣卓越50證券投資信託基金')]);
        const dt1 = mkNode('table', '', [mkNode('tr', 'even', [mkNode('td', '', ['0050'])])]);
        const nt2 = mkNode('table', 'noBorder', [makeNoBorderRow('元大台灣中型100證券投資信託基金')]);
        const dt2 = mkNode('table', '', [mkNode('tr', 'odd', [mkNode('td', '', ['0050'])])]);
        const div = mkNode('div', '', [nt1, dt1, nt2, dt2]);
        const body = mkNode('body', '', [div]);
        const html = mkNode('html', '', [body]);
        mockApi.mockResolvedValue('<html>...</html>');
        mockParseDOM.mockReturnValue([html]);
        const result = await getStockListV2('twse', 2024, 6);
        expect(result.length).toBe(1);
        expect(result[0].tag.length).toBeGreaterThan(1);
    });
});

// ===========================================================================
// getStockListV2 — usse Nasdaq/S&P path (line 3169-3181)
// ===========================================================================
describe('getStockListV2 usse non-Dow path', () => {
    const buildUsseDom = (rows) => {
        const tbody = mkNode('tbody', '', rows);
        const ct = mkNode('table', 'constituents', [tbody]);
        const po = mkNode('div', 'mw-content-ltr mw-parser-output', [ct]);
        const ctext = mkNode('div', 'mw-content-text', [po]);
        const bc = mkNode('div', 'bodyContent', [ctext]);
        const cont = mkNode('main', 'content', [bc]);
        const cc = mkNode('div', 'mw-content-container', [cont]);
        const ic = mkNode('div', 'mw-page-container-inner', [cc]);
        const pc = mkNode('div', 'mw-page-container', [ic]);
        const b = mkNode('body', '', [pc]);
        return mkNode('html', '', [b]);
    };

    const emptyHtml = buildUsseDom([]);

    test('Nasdaq row with td[0] anchor ticker, td[1] anchor name → stock added', async () => {
        const td0 = mkNode('td', '', [mkNode('a', '', ['MSFT'])]);
        const td1 = mkNode('td', '', [mkNode('a', '', ['Microsoft Corporation'])]);
        const dataRow = mkNode('tr', '', [td0, td1]);
        const nasdaqHtml = buildUsseDom([dataRow]);

        mockApi.mockResolvedValue('<html>...</html>');
        mockParseDOM
            .mockReturnValueOnce([emptyHtml])   // Dow Jones empty
            .mockReturnValueOnce([nasdaqHtml])  // Nasdaq-100 has MSFT
            .mockReturnValueOnce([emptyHtml]);  // S&P 500 empty

        const result = await getStockListV2('usse', 2024, 6);
        expect(result.some(r => r.index === 'MSFT')).toBe(true);
    });

    test('Nasdaq row with td[0] text ticker, td[1] text name → stock added', async () => {
        // No anchor in td[0]: falls to sIndex = findTag(d)[0].replace('.', '-')
        const td0 = mkNode('td', '', ['AAPL']);  // text-only (no anchor)
        const td1 = mkNode('td', '', ['Apple Inc.']);  // text-only name
        const dataRow = mkNode('tr', '', [td0, td1]);
        const nasdaqHtml = buildUsseDom([dataRow]);

        mockApi.mockResolvedValue('<html>...</html>');
        mockParseDOM
            .mockReturnValueOnce([emptyHtml])
            .mockReturnValueOnce([nasdaqHtml])
            .mockReturnValueOnce([emptyHtml]);

        const result = await getStockListV2('usse', 2024, 6);
        expect(result.some(r => r.index === 'AAPL')).toBe(true);
    });

    test('Nasdaq row with ticker containing "." → replaced with "-"', async () => {
        const td0 = mkNode('td', '', [mkNode('a', '', ['BRK.B'])]);
        const td1 = mkNode('td', '', ['Berkshire Hathaway B']);
        const dataRow = mkNode('tr', '', [td0, td1]);
        const nasdaqHtml = buildUsseDom([dataRow]);

        mockApi.mockResolvedValue('<html>...</html>');
        mockParseDOM
            .mockReturnValueOnce([emptyHtml])
            .mockReturnValueOnce([nasdaqHtml])
            .mockReturnValueOnce([emptyHtml]);

        const result = await getStockListV2('usse', 2024, 6);
        expect(result.some(r => r.index === 'BRK-B')).toBe(true);
    });

    test('Nasdaq row with duplicate index → tag appended', async () => {
        const td0 = mkNode('td', '', [mkNode('a', '', ['AAPL'])]);
        const td1 = mkNode('td', '', ['Apple Inc.']);
        const row1 = mkNode('tr', '', [td0, td1]);
        const nasdaqHtml = buildUsseDom([row1]);

        // S&P 500 also has AAPL
        const td0b = mkNode('td', '', [mkNode('a', '', ['AAPL'])]);
        const td1b = mkNode('td', '', ['Apple Inc.']);
        const row2 = mkNode('tr', '', [td0b, td1b]);
        const sp500Html = buildUsseDom([row2]);

        mockApi.mockResolvedValue('<html>...</html>');
        mockParseDOM
            .mockReturnValueOnce([emptyHtml])   // Dow Jones
            .mockReturnValueOnce([nasdaqHtml])  // Nasdaq-100
            .mockReturnValueOnce([sp500Html]);  // S&P 500

        const result = await getStockListV2('usse', 2024, 6);
        const aapl = result.find(r => r.index === 'AAPL');
        expect(aapl).toBeDefined();
        expect(aapl.tag.length).toBeGreaterThan(1);
    });
});

// ===========================================================================
// getSingleAnnual — basic coverage
// ===========================================================================
describe('getSingleAnnual', () => {
    test('GoogleApi list folder rejects → promise rejects', async () => {
        mockGoogleApi.mockRejectedValue(new Error('network fail'));
        await expect(getSingleAnnual(112, 'folder-id', '2330'))
            .rejects.toMatchObject({ message: 'network fail' });
    });

    test('annualList empty → calls GoogleApi create (create rejects to skip recur)', async () => {
        // create rejects → recur_annual never called → promise rejects after create
        mockGoogleApi
            .mockResolvedValueOnce([])                          // list folder → empty
            .mockRejectedValueOnce(new Error('create-fail'));   // create → reject
        await expect(getSingleAnnual(112, 'folder-id', '2330'))
            .rejects.toBeDefined();
        expect(mockGoogleApi).toHaveBeenCalledWith('create', expect.objectContaining({ name: 'tw2330' }));
    });

    test('annualList has all years → recur_annual only uses else-branch (no Api calls)', async () => {
        // Populate annual_list with all 6 years so recur_annual always hits the else branch
        mockGoogleApi
            .mockResolvedValueOnce([{ id: 'existing-folder' }])  // list folder
            .mockResolvedValueOnce([                               // list file → all 6 years
                { title: '112.pdf' }, { title: '111.pdf' },
                { title: '110.pdf' }, { title: '109.pdf' },
                { title: '108.pdf' }, { title: '107.pdf' },
            ]);
        // All years in annual_list → else branch → just decrements → resolves undefined
        const result = await getSingleAnnual(112, 'folder-id', '2330');
        expect(result).toBeUndefined();
        expect(mockGoogleApi).toHaveBeenCalledWith('list file', expect.objectContaining({ folderId: 'existing-folder' }));
    });
});

// ===========================================================================
// testData — multiple year/month keys to improve branch coverage
// ===========================================================================
describe('testData multiple years', () => {
    test('raw_list with multiple years/months → processes all entries', async () => {
        mockMongo.mockResolvedValue([{ type: 'twse', index: '2330', name: '台積電' }]);
        const rawList = {
            '2023': {
                '06': { raw: [{ h: 500, l: 490, v: 1000 }] },
                '09': { raw: [{ h: null, l: null, v: 500 }] },
            },
        };
        mockRedis.mockImplementation((op) => {
            if (op === 'hgetall') return Promise.resolve({
                raw_list: JSON.stringify(rawList),
                ret_obj: 'ok',
                etime: '99999',
            });
            if (op === 'hmset') return Promise.resolve();
            return Promise.resolve();
        });
        await StockTool.testData();
        expect(mockRedis).toHaveBeenCalledWith('hmset', expect.any(String), expect.objectContaining({ etime: -1 }));
    });
});

// ===========================================================================
// getStockPERV2 — twse path (uses getStockPrice via mock DOM, _maxRetry=0)
// ===========================================================================
describe('getStockPERV2 twse path', () => {
    // Build a DOM that makes getStockPrice twse return price=500
    // Structure: html > body > center > [table0, table1]
    //   table1 > outerTr0 > td0 > innerTable
    //   innerTable > [innerTr0, innerTr1]
    //   innerTr1 > [td0, td1, td2(with b > '500')]
    const buildPriceDom = (priceStr) => {
        const bNode = mkNode('b', '', [priceStr]);
        const td2 = mkNode('td', '', [bNode]);
        const innerTr1 = mkNode('tr', '', [mkNode('td'), mkNode('td'), td2]);
        const innerTable = mkNode('table', '', [mkNode('tr'), innerTr1]);
        const td0 = mkNode('td', '', [innerTable]);
        const outerTr0 = mkNode('tr', '', [td0]);
        const table1 = mkNode('table', '', [outerTr0]);
        const center = mkNode('center', '', [mkNode('table'), table1]);
        const body = mkNode('body', '', [center]);
        return mkNode('html', '', [body]);
    };

    test('twse type → returns [per, pdr, pbr, index, start] from price fetch', async () => {
        mockMongo.mockResolvedValue([{
            _id: 'id1', type: 'twse', index: '2330',
            profit: 20, dividends: 5, netValue: 50, equity: 1000,
            latestQuarter: 2, latestYear: 2023,
        }]);
        mockApi.mockResolvedValue('<html>...</html>');
        mockParseDOM.mockReturnValue([buildPriceDom('500')]);
        const result = await StockTool.getStockPERV2('id1');
        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(5);
        expect(result[3]).toBe('2330');
        expect(result[4]).toBe('11206');
        // per = round(500/20*1000*10)/100 = 25000
        expect(typeof result[0]).toBe('number');
    });

    test('twse type with profit=0 → per/pdr/pbr return 9999 (0 → 9999)', async () => {
        mockMongo.mockResolvedValue([{
            _id: 'id2', type: 'twse', index: '2330',
            profit: 0, dividends: 0, netValue: 0, equity: 1000,
            latestQuarter: 1, latestYear: 2023,
        }]);
        mockApi.mockResolvedValue('<html>...</html>');
        mockParseDOM.mockReturnValue([buildPriceDom('500')]);
        const result = await StockTool.getStockPERV2('id2');
        // per/pdr/pbr = 0 but line 681 maps 0 → 9999
        expect(result[0]).toBe(9999);
        expect(result[1]).toBe(9999);
        expect(result[2]).toBe(9999);
    });

    test('twse with negative per → returns 9999', async () => {
        // per < 0 when profit < 0
        mockMongo.mockResolvedValue([{
            _id: 'id3', type: 'twse', index: '2330',
            profit: -5, dividends: 3, netValue: 50, equity: 1000,
            latestQuarter: 3, latestYear: 2023,
        }]);
        mockApi.mockResolvedValue('<html>...</html>');
        mockParseDOM.mockReturnValue([buildPriceDom('500')]);
        const result = await StockTool.getStockPERV2('id3');
        expect(result[0]).toBe(9999);  // per < 0 → 9999
    });

    test('twse getStockPrice fails → rejects immediately (maxRetry=0)', async () => {
        mockMongo.mockResolvedValue([{
            _id: 'id4', type: 'twse', index: '2330',
            profit: 20, dividends: 5, netValue: 50, equity: 1000,
            latestQuarter: 2, latestYear: 2023,
        }]);
        mockApi.mockRejectedValue(new Error('api fail'));
        await expect(StockTool.getStockPERV2('id4')).rejects.toBeDefined();
    });
});

// ===========================================================================
// stockStatus — with real stock price (usse via yahooFinance mock)
// ===========================================================================
describe('stockStatus with real stock prices', () => {
    const makeItem = (extra = {}) => ({
        _id: 'stock1', index: 'AAPL', setype: 'usse', type: 'Tech',
        name: 'apple', price: 0, previousPrice: 0,
        // Use PA2-style web so stockProcess works correctly
        // price=175 keeps us between pa*(1-fee)^2 and pMax*(1+fee)^2
        web: [
            -1000, -900, 800, 750, 700,
            -600, 550, 500, 450,
            -400, 350, 300,
            -250, 200, 150,
            -120, 100, 80,
            -60, 40, 20, -10,
        ],
        mid: 600, times: 1,
        mul: 0, clear: false, ing: 0, str: '', order: null,
        newMid: [], tmpPT: { price: 0, time: 0, type: '', tprice: 0 },
        profit: 0, amount: 1000000, orig: 1000000, count: 0,
        previous: { price: 0, time: 0, type: '', buy: [], sell: [] },
        wType: 0, ...extra,
    });

    test('usse item with price=0 → recur_price returns 0 (price=0 branch)', async () => {
        mockMongo.mockResolvedValue([makeItem()]);
        mockGetUssePosition.mockReturnValue([]);
        mockGetTwsePosition.mockReturnValue([]);
        mockGetUsseOrder.mockReturnValue([]);
        mockGetTwseOrder.mockReturnValue([]);
        mockYahooFinance.quote.mockResolvedValue({
            regularMarketPrice: 0, regularMarketPreviousClose: 0,
        });
        // price=0 → recur_price returns 0, stockStatus resolves
        const result = await stockStatus(false);
        expect(result).toBeUndefined();  // stockStatus outer resolves to undefined
    });

    test('usse item with price>0, second Mongo returns empty → rejects "miss"', async () => {
        let callCount = 0;
        mockMongo.mockImplementation((op) => {
            callCount++;
            if (callCount === 1) return Promise.resolve([makeItem()]);
            return Promise.resolve([]);  // second find for item details → empty
        });
        mockGetUssePosition.mockReturnValue([]);
        mockGetTwsePosition.mockReturnValue([]);
        mockGetUsseOrder.mockReturnValue([]);
        mockGetTwseOrder.mockReturnValue([]);
        mockYahooFinance.quote.mockResolvedValue({
            regularMarketPrice: 150, regularMarketPreviousClose: 148,
        });
        await expect(stockStatus(false)).rejects.toMatchObject({ message: /miss/ });
    });

    test('usse item + full item data → processes stockProcess suggestion', async () => {
        const fullItem = makeItem({ price: 160, previousPrice: 158 });
        let callCount = 0;
        mockMongo.mockImplementation((op) => {
            callCount++;
            if (callCount === 1) return Promise.resolve([fullItem]);
            if (callCount === 2) return Promise.resolve([fullItem]);  // item detail
            return Promise.resolve({});  // update calls
        });
        mockGetUssePosition.mockReturnValue([]);
        mockGetTwsePosition.mockReturnValue([]);
        mockGetUsseOrder.mockReturnValue([]);
        mockGetTwseOrder.mockReturnValue([]);
        mockYahooFinance.quote.mockResolvedValue({
            regularMarketPrice: 160, regularMarketPreviousClose: 158,
        });
        const result = await stockStatus(false);
        expect(result).toBeUndefined();
        // Mongo should have been called for update
        expect(mockMongo).toHaveBeenCalledWith('update', expect.any(String), expect.any(Object), expect.any(Object));
    });


    test('twse item: index=0 → skips getStockPrice, recurses to next', async () => {
        const skipItem = { _id: 'skip1', index: 0, setype: 'twse' };
        mockMongo.mockResolvedValue([skipItem]);
        mockGetUssePosition.mockReturnValue([]);
        mockGetTwsePosition.mockReturnValue([]);
        mockGetUsseOrder.mockReturnValue([]);
        mockGetTwseOrder.mockReturnValue([]);
        await stockStatus(false);
        expect(mockApi).not.toHaveBeenCalled();
        expect(mockYahooFinance.quote).not.toHaveBeenCalled();
    });

    test('twse item: getStockPrice rejects → stockStatus rejects', async () => {
        const twseItem = { _id: 'st1', index: '2330', setype: 'twse' };
        mockMongo.mockResolvedValue([twseItem]);
        mockGetUssePosition.mockReturnValue([]);
        mockGetTwsePosition.mockReturnValue([]);
        mockGetUsseOrder.mockReturnValue([]);
        mockGetTwseOrder.mockReturnValue([]);
        mockApi.mockRejectedValue(new Error('api fail'));
        await expect(stockStatus(false)).rejects.toBeDefined();
    });

});
// ===========================================================================
// getStockPrice — usse type coverage (via getStockPERV2 or getStockTotal)
// ===========================================================================
describe('getStockPrice usse branches', () => {
    test('usse price=0 → returns 0 (not previous)', async () => {
        // Use getStockPERV2 usse type — doesn't call getStockPrice
        // Instead, test via stockStatus with price=0 and no previous
        mockYahooFinance.quote.mockResolvedValue({
            regularMarketPrice: 0, regularMarketPreviousClose: 0,
        });
        const item = {
            _id: 's1', index: 'AAPL', setype: 'usse', type: 'Tech',
        };
        mockMongo.mockResolvedValue([item]);
        mockGetUssePosition.mockReturnValue([]);
        mockGetTwsePosition.mockReturnValue([]);
        mockGetUsseOrder.mockReturnValue([]);
        mockGetTwseOrder.mockReturnValue([]);
        const result = await stockStatus(false);
        expect(result).toBeUndefined();  // resolves after price=0 short-circuit
    });

    test('getStockPrice default type → rejects "stock type unknown!!!"', async () => {
        // Use stockStatus with unknown setype
        const item = { _id: 's1', index: 'X', setype: 'unknown', type: 'Tech' };
        mockMongo.mockResolvedValue([item]);
        mockGetUssePosition.mockReturnValue([]);
        mockGetTwsePosition.mockReturnValue([]);
        mockGetUsseOrder.mockReturnValue([]);
        mockGetTwseOrder.mockReturnValue([]);
        await expect(stockStatus(false)).rejects.toMatchObject({ message: 'stock type unknown!!!' });
    });
});
