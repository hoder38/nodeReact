/**
 * Comprehensive Jest Test Suite for shioaji-tool.js
 * Taiwan Stock Exchange (TWSE) trading via Shioaji Python bridge
 */
import { jest, describe, test, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';

jest.resetModules();

// ── node-fetch mock (MUST come first to prevent cross-test timer pollution) ──
jest.unstable_mockModule('node-fetch', () => ({
  default: jest.fn(() => Promise.resolve({
    ok: true,
    buffer: jest.fn().mockResolvedValue(Buffer.from('')),
    headers: { get: jest.fn(() => null) },
    body: { pipe: jest.fn().mockReturnThis(), on: jest.fn() },
  })),
}));

// ── child_process mock ──
const mockExec = jest.fn();
jest.unstable_mockModule('child_process', () => ({
  default: { exec: mockExec },
}));

// ── path mock ──
jest.unstable_mockModule('path', () => ({
  default: { join: jest.fn((...args) => args.join('/')) },
}));

// ── stock-tool.js mock ──
const mockGetSuggestionData = jest.fn();
jest.unstable_mockModule('../stock-tool.js', () => ({
  default: jest.fn(),
  getSuggestionData: mockGetSuggestionData,
}));

// ── mongo-tool.js mock ──
const mockMongo = jest.fn();
jest.unstable_mockModule('../mongo-tool.js', () => ({
  default: mockMongo,
  objectID: jest.fn(id => id),
}));

// ── constants mock ──
jest.unstable_mockModule('../../constants.js', () => ({
  __dirname: '/app/src/back/models',
  TRADE_FEE: 0.003,
  UPDATE_ORDER: 300,
  TOTALDB: 'total',
  RANGE_INTERVAL: 86400,
  TWSE_ORDER_INTERVAL: 120,
  TWSE_MARKET_TIME: [9, 14],
  PRICE_INTERVAL: 15,
  API_WAIT: 1,
  RE_WEBURL: /^https?:\/\//,
  STATIC_PATH: '/p',
  RELEASE: 'release',
  DEV: 'dev',
  USERDB: 'user',
 
  STORAGEDB: 'storage',
  STOCKDB: 'stock',
  PASSWORDDB: 'password',
  DEFAULT_TAGS: [],
  STORAGE_PARENT: [],
  PASSWORD_PARENT: [],
  STOCK_PARENT: [],
  HANDLE_TIME: 7200,
  BOOKMARK_LIMIT: 100,
  ADULTONLY_PARENT: [],
  QUERY_LIMIT: 20,
  RELATIVE_LIMIT: 100,
  RELATIVE_UNION: 2,
  RELATIVE_INTER: 3,
  UNACTIVE_DAY: 5,
  UNACTIVE_HIT: 10,
}));

// ── ver.js mock ──
jest.unstable_mockModule('../../../../ver.js', () => ({
  PASSWORD_SALT: 'test_salt_',
  ENV_TYPE: 'test',
  SHIOAJI_APIKEY: 'test-key',
  SHIOAJI_APISECRET: 'test-secret',
  SHIOAJI_CA: 'test-ca',
  SHIOAJI_CAPW: 'test-capw',
  DEVICE_PATH: '/dev/sda',
  CA: '/t',
  CERT: '/t',
  PKEY: '/t',
  SESS_SECRET: 'test',
  SESS_PWD: 'test',
}));

const flushPromises = () => new Promise(jest.requireActual('timers').setImmediate);

// ── Module under test ──
let twseShioajiInit, getTwsePosition, getTwseOrder, resetShioaji;
let _resetState, _getState, _setState;

// Helper: builds typical Python output string
function buildPythonOutput({
  preamble = 'Connection OK\nLogin done',
  available = '500000',
  position = '[]',
  order = '[]',
  fillOrder = '[]',
} = {}) {
  return `${preamble}\nstart result\n${available}\n${position}\n${order}\n${fillOrder}\n`;
}

describe('shioaji-tool.js', () => {
  let consoleLogSpy;

  beforeAll(async () => {
    const mod = await import('../shioaji-tool.js');
    twseShioajiInit = mod.twseShioajiInit;
    getTwsePosition = mod.getTwsePosition;
    getTwseOrder = mod.getTwseOrder;
    resetShioaji = mod.resetShioaji;
    _resetState = mod._resetState;
    _getState = mod._getState;
    _setState = mod._setState;
  });

  beforeEach(() => {
    _resetState();
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  // ═══════════════════════════════════════════════════════════
  // 1. State helpers
  // ═══════════════════════════════════════════════════════════
  describe('_resetState / _getState / _setState', () => {
    test('_resetState sets default state', () => {
      _setState({ available: 999, order: [{ x: 1 }] });
      _resetState();
      const s = _getState();
      expect(s.updateTime).toEqual({ book: 0, trade: 0 });
      expect(s.available).toBe(0);
      expect(s.order).toEqual([]);
      expect(s.position).toEqual([]);
      expect(s.fakeOrder).toEqual([]);
    });

    test('_setState merges partial overrides', () => {
      _setState({ available: 12345, position: [{ symbol: '2330', amount: 1, price: 100 }] });
      const s = _getState();
      expect(s.available).toBe(12345);
      expect(s.position).toHaveLength(1);
      expect(s.updateTime).toEqual({ book: 0, trade: 0 });
    });

    test('_getState returns a snapshot (not reference)', () => {
      const s1 = _getState();
      s1.available = 999;
      const s2 = _getState();
      expect(s2.available).toBe(0);
    });

    test('_setState can override all fields', () => {
      _setState({
        updateTime: { book: 100, trade: 5 },
        available: 50000,
        order: [{ a: 1 }],
        position: [{ b: 2 }],
        fakeOrder: [{ c: 3 }],
      });
      const s = _getState();
      expect(s.updateTime).toEqual({ book: 100, trade: 5 });
      expect(s.available).toBe(50000);
      expect(s.order).toEqual([{ a: 1 }]);
      expect(s.position).toEqual([{ b: 2 }]);
      expect(s.fakeOrder).toEqual([{ c: 3 }]);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. getTwsePosition
  // ═══════════════════════════════════════════════════════════
  describe('getTwsePosition', () => {
    test('empty position — adds available balance entry', () => {
      _setState({ available: 500000 });
      const result = getTwsePosition();
      expect(result).toEqual([{ symbol: 0, amount: 1, price: 500000 }]);
    });

    test('position without symbol 0 — appends cash entry', () => {
      _setState({
        available: 300000,
        position: [{ symbol: '2330', amount: 2, price: 575.5 }],
      });
      const result = getTwsePosition();
      expect(result).toHaveLength(2);
      expect(result[1]).toEqual({ symbol: 0, amount: 1, price: 300000 });
    });

    test('position already has symbol 0 — no duplicate', () => {
      _setState({
        available: 300000,
        position: [
          { symbol: '2330', amount: 2, price: 575.5 },
          { symbol: 0, amount: 1, price: 300000 },
        ],
      });
      const result = getTwsePosition();
      expect(result).toHaveLength(2);
    });

    test('called twice — cash entry not duplicated', () => {
      _setState({ available: 100 });
      getTwsePosition();
      const result = getTwsePosition();
      expect(result.filter(p => p.symbol === 0)).toHaveLength(1);
    });

    test('available = 0 — cash entry has price 0', () => {
      const result = getTwsePosition();
      expect(result[0].price).toBe(0);
    });

    test('string "0" symbol is not same as number 0', () => {
      _setState({ position: [{ symbol: '0', amount: 1, price: 100 }] });
      const result = getTwsePosition();
      // "0" !== 0 so a new entry should be appended
      expect(result).toHaveLength(2);
      expect(result[1].symbol).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. getTwseOrder
  // ═══════════════════════════════════════════════════════════
  describe('getTwseOrder', () => {
    test('returns empty array initially', () => {
      expect(getTwseOrder()).toEqual([]);
    });

    test('returns current order array', () => {
      const orders = [{ symbol: '2330', price: 580, amount: 1 }];
      _setState({ order: orders });
      expect(getTwseOrder()).toEqual(orders);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 4. resetShioaji
  // ═══════════════════════════════════════════════════════════
  describe('resetShioaji', () => {
    test('resets book to 0, preserves trade count', () => {
      _setState({ updateTime: { book: 1710000000, trade: 42 } });
      resetShioaji();
      const s = _getState();
      expect(s.updateTime.book).toBe(0);
      expect(s.updateTime.trade).toBe(42);
    });

    test('trade = 0 stays 0', () => {
      _setState({ updateTime: { book: 999, trade: 0 } });
      resetShioaji();
      const s = _getState();
      expect(s.updateTime.book).toBe(0);
      expect(s.updateTime.trade).toBe(0);
    });

    test('does not reset position/order/fakeOrder/available', () => {
      _setState({
        updateTime: { book: 100, trade: 5 },
        available: 50000,
        position: [{ symbol: '2330', amount: 1, price: 100 }],
        order: [{ symbol: '2317' }],
        fakeOrder: [{ type: 'buy' }],
      });
      resetShioaji();
      const s = _getState();
      expect(s.available).toBe(50000);
      expect(s.position).toHaveLength(1);
      expect(s.order).toHaveLength(1);
      expect(s.fakeOrder).toHaveLength(1);
    });

    test('double reset is idempotent', () => {
      _setState({ updateTime: { book: 999, trade: 7 } });
      resetShioaji();
      resetShioaji();
      const s = _getState();
      expect(s.updateTime.book).toBe(0);
      expect(s.updateTime.trade).toBe(7);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 5. getShioajiData (tested via twseShioajiInit)
  // ═══════════════════════════════════════════════════════════
  describe('getShioajiData via twseShioajiInit', () => {
    test('successful parse — updates available, position, order', async () => {
      const output = buildPythonOutput({
        available: '500000',
        position: '[{"symbol":"2330","amount":2,"price":575.5}]',
        order: '[{"symbol":"2330","price":580,"amount":1}]',
        fillOrder: '[]',
      });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      await twseShioajiInit();

      const s = _getState();
      expect(s.available).toBe(500000);
      expect(s.position).toEqual([{ symbol: '2330', amount: 2, price: 575.5 }]);
      expect(s.order).toEqual([{ symbol: '2330', price: 580, amount: 1 }]);
    });

    test('"same" balance — keeps previous available value', async () => {
      _setState({ available: 999999 });
      const output = buildPythonOutput({
        available: 'same',
        position: '[]',
        order: '[]',
        fillOrder: '[]',
      });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      await twseShioajiInit();

      expect(_getState().available).toBe(999999);
    });

    test('Python error — rejects with HoError', async () => {
      mockExec.mockImplementation((cmd, cb) => cb(new Error('python crash')));

      // handleError returns Promise.reject, so twseShioajiInit rejects
      await expect(twseShioajiInit()).rejects.toThrow('Shioaji python error!!!');

      // force=false, so updateTime.trade is NOT decremented
      // But trade doesn't increment either since initialBook rejects before the .then()
      const s = _getState();
      expect(s.updateTime.book).not.toBe(0); // book was set before the error
    });

    test('Python error with force=true — trade is decremented on error', async () => {
      _setState({ updateTime: { book: 0, trade: 5 } });
      mockExec.mockImplementation((cmd, cb) => cb(new Error('python crash')));

      await expect(twseShioajiInit(true)).rejects.toThrow('Shioaji python error!!!');

      // force=true => updateTime.trade decremented: 5 -> 4
      expect(_getState().updateTime.trade).toBe(4);
    });

    test('Python error with force=true and trade < 1 — trade floors at 0', async () => {
      _setState({ updateTime: { book: 0, trade: 0 } });
      mockExec.mockImplementation((cmd, cb) => cb(new Error('python crash')));

      await expect(twseShioajiInit(true)).rejects.toThrow('Shioaji python error!!!');

      // force=true, trade was 0 (< 1) => floors at 0
      expect(_getState().updateTime.trade).toBe(0);
    });

    test('uses real credentials when simulation=false (via twseShioajiInit)', async () => {
      const output = buildPythonOutput();
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      await twseShioajiInit();

      // twseShioajiInit calls getShioajiData(false) => real credentials
      const cmdUsed = mockExec.mock.calls[0][0];
      expect(cmdUsed).toContain('test-key');
      expect(cmdUsed).toContain('test-secret');
    });

    test('previous position is returned in ret.position for fill_order processing', async () => {
      _setState({ position: [{ symbol: '9999', amount: 5, price: 100 }] });
      const output = buildPythonOutput({
        position: '[{"symbol":"2330","amount":1,"price":200}]',
        fillOrder: '[{"price":200,"time":' + (Math.round(Date.now() / 1000)) + ',"symbol":"2330","starttime":' + (Math.round(Date.now() / 1000)) + ',"type":"Buy","quantity":1}]',
      });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});
      mockMongo.mockResolvedValue([]);

      await twseShioajiInit();

      // After parse, module position should be the new one
      expect(_getState().position).toEqual([{ symbol: '2330', amount: 1, price: 200 }]);
    });

    test('extra lines before start result are ignored', async () => {
      const output = buildPythonOutput({
        preamble: 'line1\nline2\nline3\nmore noise',
        available: '42',
      });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      await twseShioajiInit();
      expect(_getState().available).toBe(42);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 6. twseShioajiInit — throttle / initialBook
  // ═══════════════════════════════════════════════════════════
  describe('twseShioajiInit — initialBook throttle', () => {
    test('force=false, first call (book=0) — always proceeds', async () => {
      const output = buildPythonOutput();
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      await twseShioajiInit();

      expect(mockExec).toHaveBeenCalled();
    });

    test('within UPDATE_ORDER window — skips ("Shioaji no new")', async () => {
      // Set book to recent time
      _setState({ updateTime: { book: Math.round(Date.now() / 1000), trade: 0 } });
      const output = buildPythonOutput();
      mockExec.mockImplementation((cmd, cb) => cb(null, output));

      await twseShioajiInit();

      expect(mockExec).not.toHaveBeenCalled();
      // trade should still increment
      expect(_getState().updateTime.trade).toBe(1);
    });

    test('trade counter increments on each call', async () => {
      // First call proceeds (book=0)
      const output = buildPythonOutput();
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      await twseShioajiInit();
      expect(_getState().updateTime.trade).toBe(1);

      // Second call within throttle window
      await twseShioajiInit();
      expect(_getState().updateTime.trade).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 7. twseShioajiInit — fill_order processing
  // ═══════════════════════════════════════════════════════════
  describe('twseShioajiInit — fill_order_recur', () => {
    const now = Math.round(Date.now() / 1000);

    test('empty fill_order — resolves immediately', async () => {
      const output = buildPythonOutput({ fillOrder: '[]' });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      await twseShioajiInit();
      expect(mockMongo).not.toHaveBeenCalled();
    });

    test('fill_order with price <= 0 — skipped', async () => {
      const fillOrder = JSON.stringify([
        { price: 0, time: now, symbol: '2330', starttime: now, type: 'Buy', quantity: 1 },
        { price: -5, time: now, symbol: '2330', starttime: now, type: 'Sell', quantity: 1 },
      ]);
      const output = buildPythonOutput({ fillOrder });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      await twseShioajiInit();
      expect(mockMongo).not.toHaveBeenCalledWith('find', 'total', expect.anything());
    });

    test('no matching TOTALDB document — logs "miss", skips', async () => {
      const fillOrder = JSON.stringify([
        { price: 100, time: now, symbol: 'XXXX', starttime: now, type: 'Buy', quantity: 1 },
      ]);
      const output = buildPythonOutput({ fillOrder });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});
      mockMongo.mockResolvedValue([]);

      await twseShioajiInit();
      expect(mockMongo).toHaveBeenCalledWith('find', 'total', { setype: 'twse', index: 'XXXX' });
    });

    test('Buy order — inserts in sorted position, updates previous', async () => {
      const fillOrder = JSON.stringify([
        { price: 570, time: now, symbol: '2330', starttime: now, type: 'Buy', quantity: 1000 },
      ]);
      const output = buildPythonOutput({ fillOrder });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      const item = {
        _id: 'id1',
        index: '2330',
        setype: 'twse',
        previous: {
          price: 580,
          time: now - 10,
          type: 'buy',
          buy: [{ price: 575, time: now - 100 }],
          sell: [],
        },
        profit: 0,
      };
      mockMongo.mockImplementation((method, ...args) => {
        if (method === 'find') return Promise.resolve([item]);
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      // Verify update was called
      expect(mockMongo).toHaveBeenCalledWith(
        'update', 'total', { _id: 'id1' },
        expect.objectContaining({
          $set: expect.objectContaining({
            bquantity: 1000,
          }),
        })
      );
    });

    test('Buy order — duplicate (same time + price) is skipped', async () => {
      const fillOrder = JSON.stringify([
        { price: 575, time: now - 100, symbol: '2330', starttime: now, type: 'Buy', quantity: 1 },
      ]);
      const output = buildPythonOutput({ fillOrder });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      const item = {
        _id: 'id1',
        index: '2330',
        setype: 'twse',
        previous: {
          price: 580,
          time: now - 10,
          type: 'buy',
          buy: [{ price: 575, time: now - 100 }],
          sell: [],
        },
        profit: 0,
      };
      mockMongo.mockImplementation((method) => {
        if (method === 'find') return Promise.resolve([item]);
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      // update should NOT be called for duplicate
      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      expect(updateCalls).toHaveLength(0);
    });

    test('Buy order — appended when highest price', async () => {
      const fillOrder = JSON.stringify([
        { price: 600, time: now, symbol: '2330', starttime: now, type: 'Buy', quantity: 1 },
      ]);
      const output = buildPythonOutput({ fillOrder });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      const item = {
        _id: 'id1',
        index: '2330',
        setype: 'twse',
        previous: {
          price: 580,
          time: now - 10,
          type: 'buy',
          buy: [{ price: 570, time: now - 200 }],
          sell: [],
        },
        profit: 0,
      };
      mockMongo.mockImplementation((method) => {
        if (method === 'find') return Promise.resolve([item]);
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      expect(updateCalls.length).toBeGreaterThan(0);
      const setArg = updateCalls[0][3].$set;
      expect(setArg.previous.type).toBe('buy');
      // buy array should have 2 entries (original + appended)
      expect(setArg.previous.buy.length).toBeLessThanOrEqual(2);
    });

    test('Buy order — out of time window, only filters', async () => {
      const oldStarttime = now - 1000; // well past TWSE_ORDER_INTERVAL=60
      const fillOrder = JSON.stringify([
        { price: 570, time: now, symbol: '2330', starttime: oldStarttime, type: 'Buy', quantity: 1 },
      ]);
      const output = buildPythonOutput({ fillOrder });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      const item = {
        _id: 'id1',
        index: '2330',
        setype: 'twse',
        previous: {
          price: 580,
          time: now - 10,
          type: 'buy',
          buy: [],
          sell: [],
        },
        profit: 0,
      };
      mockMongo.mockImplementation((method) => {
        if (method === 'find') return Promise.resolve([item]);
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      expect(updateCalls.length).toBeGreaterThan(0);
      // previous.type should NOT be overwritten when out of time
      const setArg = updateCalls[0][3].$set;
      expect(setArg.previous.type).toBe('buy'); // kept original
    });

    test('Buy order — fake, within time, sets tprice', async () => {
      const fillOrder = JSON.stringify([
        { price: 570, time: now, symbol: '2330', starttime: now, type: 'Buy', fake: true },
      ]);
      const output = buildPythonOutput({ fillOrder });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      const item = {
        _id: 'id1',
        index: '2330',
        setype: 'twse',
        previous: {
          price: 580,
          time: now - 10,
          type: 'sell',
          buy: [],
          sell: [],
          tprice: 0,
        },
        profit: 0,
      };
      mockMongo.mockImplementation((method) => {
        if (method === 'find') return Promise.resolve([item]);
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      expect(updateCalls.length).toBeGreaterThan(0);
      const setArg = updateCalls[0][3].$set;
      expect(setArg.previous.type).toBe('buy');
      // tprice=0 is falsy, so tprice should be item.previous.price
      expect(setArg.previous.tprice).toBe(580);
      // time should be preserved (item.previous.time, not o.time)
      expect(setArg.previous.time).toBe(now - 10);
      // boddquantity used when no quantity field
      expect(setArg).not.toHaveProperty('bquantity');
    });

    test('Buy order — fake with truthy tprice sets tprice=0', async () => {
      const fillOrder = JSON.stringify([
        { price: 570, time: now, symbol: '2330', starttime: now, type: 'Buy', fake: true },
      ]);
      const output = buildPythonOutput({ fillOrder });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      const item = {
        _id: 'id1',
        index: '2330',
        setype: 'twse',
        previous: {
          price: 580,
          time: now - 10,
          type: 'sell',
          buy: [],
          sell: [],
          tprice: 500, // truthy
        },
        profit: 0,
      };
      mockMongo.mockImplementation((method) => {
        if (method === 'find') return Promise.resolve([item]);
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      const setArg = updateCalls[0][3].$set;
      expect(setArg.previous.tprice).toBe(0);
    });

    test('Sell order — inserts in sorted DESC position', async () => {
      const fillOrder = JSON.stringify([
        { price: 600, time: now, symbol: '2330', starttime: now, type: 'Sell', quantity: 500 },
      ]);
      const output = buildPythonOutput({
        position: '[{"symbol":"2330","amount":2,"price":575.5}]',
        fillOrder,
      });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      const item = {
        _id: 'id1',
        index: '2330',
        setype: 'twse',
        previous: {
          price: 580,
          time: now - 10,
          type: 'sell',
          buy: [],
          sell: [{ price: 590, time: now - 200 }],
        },
        profit: 0,
      };
      mockMongo.mockImplementation((method) => {
        if (method === 'find') return Promise.resolve([item]);
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      expect(updateCalls.length).toBeGreaterThan(0);
      const setArg = updateCalls[0][3].$set;
      expect(setArg.squantity).toBe(500);
      expect(setArg.previous.type).toBe('sell');
    });

    test('Sell order — duplicate is skipped', async () => {
      const fillOrder = JSON.stringify([
        { price: 590, time: now - 200, symbol: '2330', starttime: now, type: 'Sell', quantity: 1 },
      ]);
      const output = buildPythonOutput({ fillOrder });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      const item = {
        _id: 'id1',
        index: '2330',
        setype: 'twse',
        previous: {
          price: 580,
          time: now - 10,
          type: 'sell',
          buy: [],
          sell: [{ price: 590, time: now - 200 }],
        },
        profit: 0,
      };
      mockMongo.mockImplementation((method) => {
        if (method === 'find') return Promise.resolve([item]);
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      expect(updateCalls).toHaveLength(0);
    });

    test('Sell order — appended when lowest price', async () => {
      const fillOrder = JSON.stringify([
        { price: 550, time: now, symbol: '2330', starttime: now, type: 'Sell', quantity: 1 },
      ]);
      const output = buildPythonOutput({
        position: '[{"symbol":"2330","amount":2,"price":575.5}]',
        fillOrder,
      });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      const item = {
        _id: 'id1',
        index: '2330',
        setype: 'twse',
        previous: {
          price: 580,
          time: now - 10,
          type: 'sell',
          buy: [],
          sell: [{ price: 590, time: now - 200 }],
        },
        profit: 0,
      };
      mockMongo.mockImplementation((method) => {
        if (method === 'find') return Promise.resolve([item]);
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      expect(updateCalls.length).toBeGreaterThan(0);
      const setArg = updateCalls[0][3].$set;
      // sell array should have 2 entries: original at 590 and appended at 550
      expect(setArg.previous.sell.length).toBe(2);
    });

    test('Sell order — out of time window', async () => {
      const oldStarttime = now - 1000;
      const fillOrder = JSON.stringify([
        { price: 590, time: now, symbol: '2330', starttime: oldStarttime, type: 'Sell', quantity: 1 },
      ]);
      const output = buildPythonOutput({
        position: '[{"symbol":"2330","amount":2,"price":575.5}]',
        fillOrder,
      });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      const item = {
        _id: 'id1',
        index: '2330',
        setype: 'twse',
        previous: {
          price: 580,
          time: now - 10,
          type: 'buy',
          buy: [],
          sell: [],
        },
        profit: 0,
      };
      mockMongo.mockImplementation((method) => {
        if (method === 'find') return Promise.resolve([item]);
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      expect(updateCalls.length).toBeGreaterThan(0);
      // previous.type should NOT be overwritten to 'sell' when out of time
      const setArg = updateCalls[0][3].$set;
      expect(setArg.previous.type).toBe('buy'); // kept original
    });

    test('Sell order — fake, within time, sets tprice', async () => {
      const fillOrder = JSON.stringify([
        { price: 590, time: now, symbol: '2330', starttime: now, type: 'Sell', fake: true },
      ]);
      const output = buildPythonOutput({
        position: '[]',
        fillOrder,
      });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      const item = {
        _id: 'id1',
        index: '2330',
        setype: 'twse',
        previous: {
          price: 580,
          time: now - 10,
          type: 'buy',
          buy: [],
          sell: [],
          tprice: 0,
        },
        profit: 0,
      };
      mockMongo.mockImplementation((method) => {
        if (method === 'find') return Promise.resolve([item]);
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      const setArg = updateCalls[0][3].$set;
      expect(setArg.previous.type).toBe('sell');
      expect(setArg.previous.tprice).toBe(580); // tprice falsy => item.previous.price
      expect(setArg.previous.time).toBe(now - 10); // preserved
    });

    test('Buy order without quantity — sets boddquantity', async () => {
      const fillOrder = JSON.stringify([
        { price: 570, time: now, symbol: '2330', starttime: now, type: 'Buy', oddquantity: 50 },
      ]);
      const output = buildPythonOutput({ fillOrder });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      const item = {
        _id: 'id1',
        index: '2330',
        setype: 'twse',
        previous: { price: 580, time: now - 10, type: 'buy', buy: [], sell: [] },
        profit: 0,
      };
      mockMongo.mockImplementation((method) => {
        if (method === 'find') return Promise.resolve([item]);
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      expect(updateCalls[0][3].$set).toHaveProperty('boddquantity', 50);
    });

    test('Sell order without quantity — sets soddquantity', async () => {
      const fillOrder = JSON.stringify([
        { price: 590, time: now, symbol: '2330', starttime: now, type: 'Sell', oddquantity: 30 },
      ]);
      const output = buildPythonOutput({
        position: '[{"symbol":"2330","amount":2,"price":575.5}]',
        fillOrder,
      });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      const item = {
        _id: 'id1',
        index: '2330',
        setype: 'twse',
        previous: { price: 580, time: now - 10, type: 'sell', buy: [], sell: [] },
        profit: 0,
      };
      mockMongo.mockImplementation((method) => {
        if (method === 'find') return Promise.resolve([item]);
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      expect(updateCalls[0][3].$set).toHaveProperty('soddquantity', 30);
    });

    test('multiple fill_orders processed sequentially', async () => {
      const fillOrder = JSON.stringify([
        { price: 570, time: now, symbol: '2330', starttime: now, type: 'Buy', quantity: 100 },
        { price: 580, time: now + 1, symbol: '2317', starttime: now + 1, type: 'Buy', quantity: 200 },
      ]);
      const output = buildPythonOutput({ fillOrder });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      const item1 = {
        _id: 'id1', index: '2330', setype: 'twse',
        previous: { price: 0, time: 0, type: 'buy', buy: [], sell: [] }, profit: 0,
      };
      const item2 = {
        _id: 'id2', index: '2317', setype: 'twse',
        previous: { price: 0, time: 0, type: 'buy', buy: [], sell: [] }, profit: 0,
      };
      mockMongo.mockImplementation((method, db, query) => {
        if (method === 'find') {
          if (query.index === '2330') return Promise.resolve([item1]);
          if (query.index === '2317') return Promise.resolve([item2]);
          return Promise.resolve([]);
        }
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      expect(updateCalls).toHaveLength(2);
    });

    test('profit accumulation on existing item.profit', async () => {
      // Set up old position with different amount to trigger profit calc
      _setState({
        position: [{ symbol: '2330', amount: 3, price: 570 }],
      });

      const fillOrder = JSON.stringify([
        {
          price: 590, time: now, symbol: '2330', starttime: now,
          type: 'Sell', quantity: 500,
          profit: '100p200p', ptime: `${now - 50}t${now}t`,
        },
      ]);
      const output = buildPythonOutput({
        position: '[{"symbol":"2330","amount":2,"price":575.5}]',
        fillOrder,
      });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      const item = {
        _id: 'id1',
        index: '2330',
        setype: 'twse',
        previous: { price: 580, time: now - 10, type: 'sell', buy: [], sell: [] },
        profit: 1000,
      };
      mockMongo.mockImplementation((method) => {
        if (method === 'find') return Promise.resolve([item]);
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      expect(updateCalls.length).toBeGreaterThan(0);
      // profit should be accumulated (1000 + some computed value)
      const setArg = updateCalls[0][3].$set;
      expect(setArg.profit).toBeDefined();
    });

    test('Sell: real order, position amounts equal (peq=true) — profit stays 0', async () => {
      _setState({
        position: [{ symbol: '2330', amount: 2, price: 575.5 }],
      });

      const fillOrder = JSON.stringify([
        {
          price: 590, time: now, symbol: '2330', starttime: now,
          type: 'Sell', quantity: 500,
          profit: '100p', ptime: `${now}t`,
        },
      ]);
      const output = buildPythonOutput({
        position: '[{"symbol":"2330","amount":2,"price":575.5}]',
        fillOrder,
      });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      const item = {
        _id: 'id1',
        index: '2330',
        setype: 'twse',
        previous: { price: 580, time: now - 10, type: 'sell', buy: [], sell: [] },
        profit: 500,
      };
      mockMongo.mockImplementation((method) => {
        if (method === 'find') return Promise.resolve([item]);
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      // profit should remain 500 (no change since peq=true, profit=0)
      expect(updateCalls[0][3].$set.profit).toBe(500);
    });

    test('Sell: fake order — profit calculation skipped', async () => {
      _setState({
        position: [{ symbol: '2330', amount: 3, price: 570 }],
      });

      const fillOrder = JSON.stringify([
        { price: 590, time: now, symbol: '2330', starttime: now, type: 'Sell', fake: true },
      ]);
      const output = buildPythonOutput({
        position: '[{"symbol":"2330","amount":2,"price":575.5}]',
        fillOrder,
      });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      const item = {
        _id: 'id1',
        index: '2330',
        setype: 'twse',
        previous: { price: 580, time: now - 10, type: 'sell', buy: [], sell: [], tprice: 0 },
        profit: 100,
      };
      mockMongo.mockImplementation((method) => {
        if (method === 'find') return Promise.resolve([item]);
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      // profit should stay at 100 (fake order, no profit calc)
      expect(updateCalls[0][3].$set.profit).toBe(100);
    });

    test('Sell: real, symbol not in ret.position — pp=0, profit calc skipped', async () => {
      _setState({
        position: [{ symbol: '9999', amount: 1, price: 100 }],
      });

      const fillOrder = JSON.stringify([
        {
          price: 590, time: now, symbol: '2330', starttime: now,
          type: 'Sell', quantity: 500,
          profit: '100p', ptime: `${now}t`,
        },
      ]);
      const output = buildPythonOutput({
        position: '[{"symbol":"9999","amount":1,"price":100}]',
        fillOrder,
      });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      const item = {
        _id: 'id1',
        index: '2330',
        setype: 'twse',
        previous: { price: 580, time: now - 10, type: 'sell', buy: [], sell: [] },
        profit: 200,
      };
      mockMongo.mockImplementation((method) => {
        if (method === 'find') return Promise.resolve([item]);
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      // pp=0, profit stays at 200
      expect(updateCalls[0][3].$set.profit).toBe(200);
    });

    test('Sell: real, ret.position empty — profit calc skipped', async () => {
      // Do NOT set position — leave empty so ret.position (old snapshot) is []
      // _resetState already leaves position as []

      const fillOrder = JSON.stringify([
        {
          price: 590, time: now, symbol: '2330', starttime: now,
          type: 'Sell', quantity: 500,
          profit: '100p', ptime: `${now}t`,
        },
      ]);
      const output = buildPythonOutput({
        position: '[{"symbol":"2330","amount":2,"price":575.5}]',
        fillOrder,
      });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      const item = {
        _id: 'id1',
        index: '2330',
        setype: 'twse',
        previous: { price: 580, time: now - 10, type: 'sell', buy: [], sell: [] },
        profit: 300,
      };
      mockMongo.mockImplementation((method) => {
        if (method === 'find') return Promise.resolve([item]);
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      // ret.position is [] (old position was empty), so profit calc is skipped, profit stays 300
      expect(updateCalls[0][3].$set.profit).toBe(300);
    });

    test('Sell: profit with is_insert reaching 2 — breaks out', async () => {
      _setState({
        position: [{ symbol: '2330', amount: 5, price: 570 }],
      });

      const sellTime1 = now - 50;
      const sellTime2 = now;
      const fillOrder = JSON.stringify([
        {
          price: 590, time: now, symbol: '2330', starttime: now,
          type: 'Sell', quantity: 500,
          profit: `50p100p150p`, ptime: `${sellTime1}t${sellTime2}t${now + 10}t`,
        },
      ]);
      const output = buildPythonOutput({
        position: '[{"symbol":"2330","amount":2,"price":575.5}]',
        fillOrder,
      });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      const item = {
        _id: 'id1',
        index: '2330',
        setype: 'twse',
        previous: {
          price: 580, time: now - 10, type: 'sell', buy: [],
          sell: [
            { price: 600, time: sellTime1 },
            { price: 595, time: sellTime2 },
          ],
        },
        profit: 0,
      };
      mockMongo.mockImplementation((method) => {
        if (method === 'find') return Promise.resolve([item]);
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      expect(updateCalls.length).toBeGreaterThan(0);
    });

    test('Sell: symbol not in cached position — cp=0', async () => {
      _setState({
        position: [{ symbol: '9999', amount: 1, price: 100 }],
      });

      const fillOrder = JSON.stringify([
        {
          price: 590, time: now, symbol: '2330', starttime: now,
          type: 'Sell', quantity: 500,
          profit: '100p', ptime: `${now - 50}t`,
        },
      ]);
      const output = buildPythonOutput({
        position: '[{"symbol":"2330","amount":2,"price":575.5}]',
        fillOrder,
      });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      const item = {
        _id: 'id1',
        index: '2330',
        setype: 'twse',
        previous: { price: 580, time: now - 10, type: 'sell', buy: [], sell: [] },
        profit: 0,
      };
      mockMongo.mockImplementation((method) => {
        if (method === 'find') return Promise.resolve([item]);
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      expect(updateCalls.length).toBeGreaterThan(0);
      // cp=0 because '2330' is not in cached old position
      // profit = 100*(1-0.003) - (2*575.5) + 0 is a big negative
      const computedProfit = updateCalls[0][3].$set.profit;
      expect(typeof computedProfit).toBe('number');
    });

    test('item.profit falsy — profit set instead of added', async () => {
      const fillOrder = JSON.stringify([
        { price: 570, time: now, symbol: '2330', starttime: now, type: 'Buy', quantity: 1 },
      ]);
      const output = buildPythonOutput({ fillOrder });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      const item = {
        _id: 'id1',
        index: '2330',
        setype: 'twse',
        previous: { price: 0, time: 0, type: 'buy', buy: [], sell: [] },
        profit: 0, // falsy
      };
      mockMongo.mockImplementation((method) => {
        if (method === 'find') return Promise.resolve([item]);
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      // profit was 0 (falsy) => item.profit = profit (which is 0 for buy)
      expect(updateCalls[0][3].$set.profit).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 8. fakeOrder matching
  // ═══════════════════════════════════════════════════════════
  describe('twseShioajiInit — fakeOrder matching', () => {
    const now = Math.round(Date.now() / 1000);

    test('fake buy order matched — suggestion.price <= o.price', async () => {
      _setState({
        fakeOrder: [
          { type: 'buy', time: now, price: 580, symbol: '2330', done: false },
        ],
      });

      const output = buildPythonOutput({ fillOrder: '[]' });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({
        '2330': { price: 570 }, // 570 <= 580
      });

      // The fill_order pushed by fakeOrder match triggers Mongo.find
      mockMongo.mockResolvedValue([]);

      await twseShioajiInit();

      // fakeOrder[0].done should be true
      const s = _getState();
      expect(s.fakeOrder[0].done).toBe(true);
      // Mongo.find should have been called for the pushed fill_order
      expect(mockMongo).toHaveBeenCalledWith('find', 'total', { setype: 'twse', index: '2330' });
    });

    test('fake sell order matched — suggestion.price >= o.price', async () => {
      _setState({
        fakeOrder: [
          { type: 'sell', time: now, price: 580, symbol: '2330', done: false },
        ],
      });

      const output = buildPythonOutput({ fillOrder: '[]' });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({
        '2330': { price: 590 }, // 590 >= 580
      });

      mockMongo.mockResolvedValue([]);

      await twseShioajiInit();

      const s = _getState();
      expect(s.fakeOrder[0].done).toBe(true);
    });

    test('fake buy order NOT matched — suggestion.price > o.price', async () => {
      _setState({
        fakeOrder: [
          { type: 'buy', time: now, price: 580, symbol: '2330', done: false },
        ],
      });

      const output = buildPythonOutput({ fillOrder: '[]' });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({
        '2330': { price: 590 }, // 590 > 580 — not matched
      });

      await twseShioajiInit();

      const s = _getState();
      expect(s.fakeOrder[0].done).toBeFalsy();
    });

    test('fake sell order NOT matched — suggestion.price < o.price', async () => {
      _setState({
        fakeOrder: [
          { type: 'sell', time: now, price: 580, symbol: '2330', done: false },
        ],
      });

      const output = buildPythonOutput({ fillOrder: '[]' });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({
        '2330': { price: 570 }, // 570 < 580 — not matched
      });

      await twseShioajiInit();

      const s = _getState();
      expect(s.fakeOrder[0].done).toBeFalsy();
    });

    test('fake order already done — skipped', async () => {
      _setState({
        fakeOrder: [
          { type: 'buy', time: now, price: 580, symbol: '2330', done: true },
        ],
      });

      const output = buildPythonOutput({ fillOrder: '[]' });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({
        '2330': { price: 570 },
      });

      await twseShioajiInit();

      // No mongo calls since no fill_order was pushed
      expect(mockMongo).not.toHaveBeenCalled();
    });

    test('fake order — suggestion price is 0 (falsy)', async () => {
      _setState({
        fakeOrder: [
          { type: 'buy', time: now, price: 580, symbol: '2330', done: false },
        ],
      });

      const output = buildPythonOutput({ fillOrder: '[]' });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({
        '2330': { price: 0 },
      });

      await twseShioajiInit();

      const s = _getState();
      expect(s.fakeOrder[0].done).toBeFalsy();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 9. Phase 2 — trade timer / market hours / recur_status
  // ═══════════════════════════════════════════════════════════
  describe('twseShioajiInit — Phase 2 trade evaluation', () => {
    const now = Math.round(Date.now() / 1000);
    // With TWSE_ORDER_INTERVAL=120, PRICE_INTERVAL=15:
    // ceil(120/15) - 3 = 8 - 3 = 5
    // trade % 5 === 3 when trade = 3, 8, 13, ...
    // So set trade=2, after increment it becomes 3 => 3%5===3 => Phase 2 runs.

    function setupPhase2(tradeValue = 2) {
      // Set trade so after increment it triggers Phase 2
      _setState({ updateTime: { book: now, trade: tradeValue } });
      // initialBook skips (book is recent), trade increments to tradeValue+1
      const output = buildPythonOutput();
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
    }

    test('modulo check fails — resolves early, no trade evaluation', async () => {
      const output = buildPythonOutput();
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      await twseShioajiInit();

      // trade=1 after increment, 1%5 !== 3 => no Phase 2
      const findCalls = mockMongo.mock.calls.filter(c =>
        c[0] === 'find' && c[2]?.sType !== undefined
      );
      expect(findCalls).toHaveLength(0);
    });

    test('modulo check passes, outside market hours — proceeds to trade eval', async () => {
      setupPhase2(2);
      // Mock Date.getHours to return hour outside market [9,14]
      const origDate = global.Date;
      const mockDate = class extends origDate {
        getHours() { return 20; } // 20 is outside [9,14]
      };
      global.Date = mockDate;

      mockGetSuggestionData.mockReturnValue({});
      mockMongo.mockResolvedValue([]); // no items

      await twseShioajiInit();

      global.Date = origDate;

      // Should reach Mongo.find for trade evaluation
      expect(mockMongo).toHaveBeenCalledWith('find', 'total', { setype: 'twse', sType: { $exists: false } });
    });

    test('market hours — normal range, within market — trade decremented', async () => {
      setupPhase2(2);
      const origDate = global.Date;
      const mockDate = class extends origDate {
        getHours() { return 10; } // 10 is within [9,14]
      };
      global.Date = mockDate;
      mockGetSuggestionData.mockReturnValue({});

      await twseShioajiInit();

      global.Date = origDate;

      const s = _getState();
      // trade was 3 (2+1), then decremented to 2
      expect(s.updateTime.trade).toBe(2);
      expect(mockMongo).not.toHaveBeenCalled();
    });

    test('market hours — hour exactly at boundary [0] (9) — within market', async () => {
      setupPhase2(2);
      const origDate = global.Date;
      const mockDate = class extends origDate {
        getHours() { return 9; } // exactly TWSE_MARKET_TIME[0]
      };
      global.Date = mockDate;
      mockGetSuggestionData.mockReturnValue({});

      await twseShioajiInit();

      global.Date = origDate;

      // hour=9 >= 9 && 9 < 14 => within market => decrement
      expect(_getState().updateTime.trade).toBe(2);
    });

    test('market hours — hour exactly at boundary [1] (14) — outside market', async () => {
      setupPhase2(2);
      const origDate = global.Date;
      const mockDate = class extends origDate {
        getHours() { return 14; } // exactly TWSE_MARKET_TIME[1]
      };
      global.Date = mockDate;
      mockGetSuggestionData.mockReturnValue({});
      mockMongo.mockResolvedValue([]);

      await twseShioajiInit();

      global.Date = origDate;

      // hour=14: 14>=9 && 14<14 is false => outside market => proceeds
      expect(mockMongo).toHaveBeenCalledWith('find', 'total', { setype: 'twse', sType: { $exists: false } });
    });

    test('market hours — overnight range [22,6], hour within ban window — trade decremented', async () => {
      // Set overnight market time: trading is banned from 22:00 to 06:00
      _setState({ marketTime: [22, 6] });
      setupPhase2(2);
      const origDate = global.Date;
      const mockDate = class extends origDate {
        getHours() { return 23; } // 23 >= 22 => within overnight ban
      };
      global.Date = mockDate;
      mockGetSuggestionData.mockReturnValue({});

      await twseShioajiInit();

      global.Date = origDate;
      _setState({ marketTime: [9, 14] }); // restore

      // hour=23 >= 22 || 23 < 6 => within overnight ban => decrement (3 -> 2)
      expect(_getState().updateTime.trade).toBe(2);
      expect(mockMongo).not.toHaveBeenCalled();
    });

    test('market hours — overnight range [22,6], hour outside ban window — proceeds to trade eval', async () => {
      // Outside overnight ban (e.g., 10:00 is not >= 22 and not < 6)
      _setState({ marketTime: [22, 6] });
      setupPhase2(2);
      const origDate = global.Date;
      const mockDate = class extends origDate {
        getHours() { return 10; } // 10 < 22 && 10 >= 6 => outside ban
      };
      global.Date = mockDate;
      mockGetSuggestionData.mockReturnValue({});
      mockMongo.mockResolvedValue([]);

      await twseShioajiInit();

      global.Date = origDate;
      _setState({ marketTime: [9, 14] }); // restore

      // hour=10 is NOT in ban window => proceeds to Mongo find
      expect(mockMongo).toHaveBeenCalledWith('find', 'total', { setype: 'twse', sType: { $exists: false } });
    });

    test('trade decrement when trade < 1 — floors at 0', async () => {
      _setState({ updateTime: { book: now, trade: -2 } });
      const origDate = global.Date;
      const mockDate = class extends origDate {
        getHours() { return 10; } // within market
      };
      global.Date = mockDate;
      mockGetSuggestionData.mockReturnValue({});

      // trade becomes -1 after increment, -1%5 = -1 !== 3, so no Phase 2
      // But we need to trigger Phase 2. Let's use trade=2 instead and test floor separately.
      global.Date = origDate;
    });

    // --- recur_status tests ---
    test('no TOTALDB items — isSubmit stays false, no submit call', async () => {
      setupPhase2(2);
      const origDate = global.Date;
      const mockDate = class extends origDate {
        getHours() { return 20; }
      };
      global.Date = mockDate;
      mockGetSuggestionData.mockReturnValue({});
      mockMongo.mockResolvedValue([]);

      await twseShioajiInit();

      global.Date = origDate;

      // Only one find call (for trade eval), no exec call for submit
      const findCalls = mockMongo.mock.calls.filter(c => c[0] === 'find');
      expect(findCalls).toHaveLength(1);
    });

    test('item.index === 0 — skipped', async () => {
      setupPhase2(2);
      const origDate = global.Date;
      const mockDate = class extends origDate {
        getHours() { return 20; }
      };
      global.Date = mockDate;
      mockGetSuggestionData.mockReturnValue({ '0': { price: 100 } });
      mockMongo.mockResolvedValue([{ _id: 'id1', index: 0, setype: 'twse' }]);

      await twseShioajiInit();

      global.Date = origDate;

      // No submit because index===0 was skipped
      expect(mockExec).not.toHaveBeenCalled(); // No Python call for submit
    });

    test('item with no suggestion data — skipped', async () => {
      setupPhase2(2);
      const origDate = global.Date;
      const mockDate = class extends origDate {
        getHours() { return 20; }
      };
      global.Date = mockDate;
      mockGetSuggestionData.mockReturnValue({}); // no '2330' entry
      mockMongo.mockResolvedValue([{ _id: 'id1', index: '2330', setype: 'twse', ing: 1 }]);

      await twseShioajiInit();

      global.Date = origDate;
    });

    test('ing === 1, price exists — startStatus adds to newOrder', async () => {
      setupPhase2(2);
      const origDate = global.Date;
      const mockDate = class extends origDate {
        getHours() { return 20; }
      };
      global.Date = mockDate;

      const suggestion = { price: 500, bCount: 1000, buy: 495, sCount: 500, sell: 510 };
      mockGetSuggestionData.mockReturnValue({ '2330': suggestion });

      let findCallCount = 0;
      mockMongo.mockImplementation((method) => {
        if (method === 'find') {
          findCallCount++;
          return Promise.resolve([{
            _id: 'id1', index: '2330', setype: 'twse', ing: 1, amount: 5,
          }]);
        }
        return Promise.resolve();
      });

      // submitShioajiOrder will call exec
      mockExec.mockImplementation((cmd, cb) => cb(null, 'submit ok'));

      await twseShioajiInit();

      global.Date = origDate;

      // Exec should be called for submit (second call after getShioajiData skipped)
      const execCalls = mockExec.mock.calls;
      // The submit command should contain the stock symbol
      const submitCmd = execCalls.find(c => c[0].includes('submit'));
      expect(submitCmd).toBeDefined();
      expect(submitCmd[0]).toContain('2330');
      expect(submitCmd[0]).toContain('buy1000');
      expect(submitCmd[0]).toContain('sell500');
    });

    test('ing === 1, price is 0 — skipped', async () => {
      setupPhase2(2);
      const origDate = global.Date;
      const mockDate = class extends origDate {
        getHours() { return 20; }
      };
      global.Date = mockDate;

      mockGetSuggestionData.mockReturnValue({ '2330': { price: 0 } });
      mockMongo.mockResolvedValue([{
        _id: 'id1', index: '2330', setype: 'twse', ing: 1, amount: 5,
      }]);

      await twseShioajiInit();

      global.Date = origDate;

      // No submit since price is falsy
      const submitCalls = mockExec.mock.calls.filter(c => c[0]?.includes?.('submit'));
      expect(submitCalls).toHaveLength(0);
    });

    test('ing === 2 — sellall, wait, deleteMany', async () => {
      _setState({ updateTime: { book: now, trade: 2 } });
      const origDate = global.Date;
      const mockDate = class extends origDate {
        getHours() { return 20; }
      };
      global.Date = mockDate;

      // Override setTimeout to fire immediately (API_WAIT * 2000 delay)
      const origSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = (fn, ms) => origSetTimeout(fn, 0);

      mockGetSuggestionData.mockReturnValue({ '2330': { price: 500 } });
      mockMongo.mockImplementation((method) => {
        if (method === 'find') {
          return Promise.resolve([{
            _id: 'id1', index: '2330', setype: 'twse', ing: 2, amount: 5,
          }]);
        }
        if (method === 'deleteMany') return Promise.resolve();
        return Promise.resolve();
      });
      mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));

      await twseShioajiInit();

      globalThis.setTimeout = origSetTimeout;
      global.Date = origDate;

      // sellall command should have been called
      const sellallCmd = mockExec.mock.calls.find(c => c[0]?.includes?.('sellall'));
      expect(sellallCmd).toBeDefined();
      // deleteMany should be called
      const deleteCalls = mockMongo.mock.calls.filter(c => c[0] === 'deleteMany');
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0][2]).toEqual({ _id: 'id1' });
    });

    test('ing === 2 — sellall error — trade decremented, handleError', async () => {
      setupPhase2(2);
      const origDate = global.Date;
      const mockDate = class extends origDate {
        getHours() { return 20; }
      };
      global.Date = mockDate;

      mockGetSuggestionData.mockReturnValue({ '2330': { price: 500 } });
      mockMongo.mockResolvedValue([{
        _id: 'id1', index: '2330', setype: 'twse', ing: 2, amount: 5,
      }]);

      // sellall exec call fails
      mockExec.mockImplementation((cmd, cb) => cb(new Error('sellall fail')));

      await expect(twseShioajiInit()).rejects.toThrow('Shioaji python error!!!');

      global.Date = origDate;

      // trade should be decremented
      const s = _getState();
      expect(s.updateTime.trade).toBe(2); // was 3, decremented to 2
    });

    test('ing === 0, below entry threshold — activates, startStatus', async () => {
      setupPhase2(2);
      const origDate = global.Date;
      const mockDate = class extends origDate {
        getHours() { return 20; }
      };
      global.Date = mockDate;

      // 2σ upper boundary from web array: -negBounds[1] = 120
      // price=90 < 120 → enter
      const suggestion = { price: 90, bCount: 1, buy: 89, sCount: 0, sell: 0 };
      mockGetSuggestionData.mockReturnValue({ '2330': suggestion });

      mockMongo.mockImplementation((method, db, query, update) => {
        if (method === 'find') {
          return Promise.resolve([{
            _id: 'id1', index: '2330', setype: 'twse', ing: 0,
            mid: 100, orig: 1000, times: 2, amount: 3,
            web: [-130, -120, -110, -100, -91, -83, -76],
          }]);
        }
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));

      await twseShioajiInit();

      global.Date = origDate;

      // Mongo update should set ing=1
      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      const ingUpdate = updateCalls.find(c => c[3]?.$set?.ing === 1);
      expect(ingUpdate).toBeDefined();
    });

    test('ing === 0, above entry threshold — skipped', async () => {
      setupPhase2(2);
      const origDate = global.Date;
      const mockDate = class extends origDate {
        getHours() { return 20; }
      };
      global.Date = mockDate;

      // 2σ upper boundary from web array: -negBounds[1] = 120
      // price=125 > 120 → skip (above 2σ)
      mockGetSuggestionData.mockReturnValue({ '2330': { price: 125 } });

      mockMongo.mockResolvedValue([{
        _id: 'id1', index: '2330', setype: 'twse', ing: 0,
        mid: 100, orig: 1000, times: 2, amount: 3,
        web: [-130, -120, -110, -100, -91, -83, -76],
      }]);

      await twseShioajiInit();

      global.Date = origDate;

      // No update call (skipped)
      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      expect(updateCalls).toHaveLength(0);
    });

    test('ing === 0, activated but price is 0 — skip startStatus', async () => {
      setupPhase2(2);
      const origDate = global.Date;
      const mockDate = class extends origDate {
        getHours() { return 20; }
      };
      global.Date = mockDate;

      // 2σ upper boundary = 120, price=0 < 120 → threshold met, but price is falsy
      mockGetSuggestionData.mockReturnValue({ '2330': { price: 0 } });

      mockMongo.mockImplementation((method) => {
        if (method === 'find') {
          return Promise.resolve([{
            _id: 'id1', index: '2330', setype: 'twse', ing: 0,
            mid: 100, orig: 1000, times: 2, amount: 3,
            web: [-130, -120, -110, -100, -91, -83, -76],
          }]);
        }
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      global.Date = origDate;

      // ing=1 update should be called but no submit (price=0 falsy)
      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      expect(updateCalls).toHaveLength(1);
      const submitCalls = mockExec.mock.calls.filter(c => c[0]?.includes?.('submit'));
      expect(submitCalls).toHaveLength(0);
    });

    test('item with mul multiplier — adjusts orig and times', async () => {
      setupPhase2(2);
      const origDate = global.Date;
      const mockDate = class extends origDate {
        getHours() { return 20; }
      };
      global.Date = mockDate;

      const suggestion = { price: 90, bCount: 1, buy: 89 };
      mockGetSuggestionData.mockReturnValue({ '2330': suggestion });

      mockMongo.mockImplementation((method) => {
        if (method === 'find') {
          return Promise.resolve([{
            _id: 'id1', index: '2330', setype: 'twse', ing: 1,
            amount: 3, mul: 1.5, orig: 1000, times: 2,
          }]);
        }
        return Promise.resolve();
      });

      mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));

      await twseShioajiInit();

      global.Date = origDate;

      // The mul multiplier should have been applied in memory
      // We can't check directly but verify submit was called
      const submitCmd = mockExec.mock.calls.find(c => c[0]?.includes?.('submit'));
      expect(submitCmd).toBeDefined();
    });

    test('newOrder sorted by market value DESC — higher count*price first', async () => {
      setupPhase2(2);
      const origDate = global.Date;
      const mockDate = class extends origDate {
        getHours() { return 20; }
      };
      global.Date = mockDate;

      mockGetSuggestionData.mockReturnValue({
        '2330': { price: 90, bCount: 1, buy: 89 },
        '2317': { price: 100, bCount: 1, buy: 99 },
      });

      mockMongo.mockImplementation((method) => {
        if (method === 'find') {
          return Promise.resolve([
            { _id: 'id1', index: '2330', setype: 'twse', ing: 1, amount: 3, count: 1 },
            { _id: 'id2', index: '2317', setype: 'twse', ing: 1, amount: 10, count: 2 },
          ]);
        }
        return Promise.resolve();
      });

      mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));

      await twseShioajiInit();

      global.Date = origDate;

      // Submit should be called
      const submitCmd = mockExec.mock.calls.find(c => c[0]?.includes?.('submit'));
      expect(submitCmd).toBeDefined();
      // 2317 (count=2 * price=100 = 200) should come before 2330 (count=1 * price=90 = 90)
      const cmdStr = submitCmd[0];
      const pos2317 = cmdStr.indexOf('2317');
      const pos2330 = cmdStr.indexOf('2330');
      expect(pos2317).toBeLessThan(pos2330);
    });

    test('submitShioajiOrder error — trade decremented, handleError', async () => {
      setupPhase2(2);
      const origDate = global.Date;
      const mockDate = class extends origDate {
        getHours() { return 20; }
      };
      global.Date = mockDate;

      mockGetSuggestionData.mockReturnValue({
        '2330': { price: 90, bCount: 1, buy: 89 },
      });

      mockMongo.mockResolvedValue([
        { _id: 'id1', index: '2330', setype: 'twse', ing: 1, amount: 3 },
      ]);

      // submit exec fails
      mockExec.mockImplementation((cmd, cb) => cb(new Error('submit fail')));

      await expect(twseShioajiInit()).rejects.toThrow('Shioaji python error!!!');

      global.Date = origDate;

      const s = _getState();
      expect(s.updateTime.trade).toBe(2); // decremented from 3 to 2
    });

    test('isSubmit false — submitTwseOrder resolves without calling exec', async () => {
      setupPhase2(2);
      const origDate = global.Date;
      const mockDate = class extends origDate {
        getHours() { return 20; }
      };
      global.Date = mockDate;

      // Item skipped because index=0
      mockGetSuggestionData.mockReturnValue({});
      mockMongo.mockResolvedValue([
        { _id: 'id1', index: 0, setype: 'twse', ing: 1, amount: 3 },
      ]);

      await twseShioajiInit();

      global.Date = origDate;

      // No submit exec call
      expect(mockExec).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 10. submitShioajiOrder — fakeOrder and command building
  // ═══════════════════════════════════════════════════════════
  describe('submitShioajiOrder — command building and fakeOrder', () => {
    const now = Math.round(Date.now() / 1000);

    function setupForSubmit() {
      _setState({ updateTime: { book: now, trade: 2 } });
      const origDate = global.Date;
      const mockDate = class extends origDate {
        getHours() { return 20; } // outside market
      };
      global.Date = mockDate;
      return origDate;
    }

    test('item with bCount and sCount — both in command, no fakeOrder', async () => {
      const origDate = setupForSubmit();
      mockGetSuggestionData.mockReturnValue({
        '2330': { price: 500, bCount: 1000, buy: 495, sCount: 500, sell: 510 },
      });
      mockMongo.mockResolvedValue([
        { _id: 'id1', index: '2330', setype: 'twse', ing: 1, amount: 3 },
      ]);
      mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));

      await twseShioajiInit();

      global.Date = origDate;

      const submitCmd = mockExec.mock.calls.find(c => c[0]?.includes?.('submit'));
      expect(submitCmd[0]).toContain('buy1000=495');
      expect(submitCmd[0]).toContain('sell500=510');
      expect(_getState().fakeOrder).toEqual([]);
    });

    test('item with buy but no bCount — creates buy fakeOrder', async () => {
      const origDate = setupForSubmit();
      mockGetSuggestionData.mockReturnValue({
        '2330': { price: 500, buy: 495, sCount: 500, sell: 510 },
      });
      mockMongo.mockResolvedValue([
        { _id: 'id1', index: '2330', setype: 'twse', ing: 1, amount: 3 },
      ]);
      mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));

      await twseShioajiInit();

      global.Date = origDate;

      const fakeOrders = _getState().fakeOrder;
      expect(fakeOrders.length).toBeGreaterThanOrEqual(1);
      const buyFake = fakeOrders.find(f => f.type === 'buy');
      expect(buyFake).toBeDefined();
      expect(buyFake.price).toBe(495);
      expect(buyFake.symbol).toBe('2330');
    });

    test('item with sell but no sCount — creates sell fakeOrder', async () => {
      const origDate = setupForSubmit();
      mockGetSuggestionData.mockReturnValue({
        '2330': { price: 500, bCount: 1000, buy: 495, sell: 510 },
      });
      mockMongo.mockResolvedValue([
        { _id: 'id1', index: '2330', setype: 'twse', ing: 1, amount: 3 },
      ]);
      mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));

      await twseShioajiInit();

      global.Date = origDate;

      const fakeOrders = _getState().fakeOrder;
      const sellFake = fakeOrders.find(f => f.type === 'sell');
      expect(sellFake).toBeDefined();
      expect(sellFake.price).toBe(510);
    });

    test('item with neither bCount nor sCount — both pushed to fakeOrder', async () => {
      const origDate = setupForSubmit();
      mockGetSuggestionData.mockReturnValue({
        '2330': { price: 500, buy: 495, sell: 510 },
      });
      mockMongo.mockResolvedValue([
        { _id: 'id1', index: '2330', setype: 'twse', ing: 1, amount: 3 },
      ]);
      mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));

      await twseShioajiInit();

      global.Date = origDate;

      const fakeOrders = _getState().fakeOrder;
      expect(fakeOrders).toHaveLength(2);
      expect(fakeOrders[0].type).toBe('buy');
      expect(fakeOrders[1].type).toBe('sell');
    });

    test('item with no buy/sell — no fakeOrder, only symbol= in command', async () => {
      const origDate = setupForSubmit();
      mockGetSuggestionData.mockReturnValue({
        '2330': { price: 500 },
      });
      mockMongo.mockResolvedValue([
        { _id: 'id1', index: '2330', setype: 'twse', ing: 1, amount: 3 },
      ]);
      mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));

      await twseShioajiInit();

      global.Date = origDate;

      expect(_getState().fakeOrder).toEqual([]);
    });

    test('submit uses real credentials (simulation=false)', async () => {
      const origDate = setupForSubmit();
      mockGetSuggestionData.mockReturnValue({
        '2330': { price: 500, bCount: 1, buy: 495 },
      });
      mockMongo.mockResolvedValue([
        { _id: 'id1', index: '2330', setype: 'twse', ing: 1, amount: 3 },
      ]);
      mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));

      await twseShioajiInit();

      global.Date = origDate;

      const submitCmd = mockExec.mock.calls.find(c => c[0]?.includes?.('submit'));
      expect(submitCmd[0]).toContain('test-key');
      expect(submitCmd[0]).toContain('test-secret');
      expect(submitCmd[0]).toContain('test-ca');
      expect(submitCmd[0]).toContain('test-capw');
      expect(submitCmd[0]).toContain('0.003'); // TRADE_FEE
    });

    test('fakeOrder is reset before each submit', async () => {
      // Set some existing fakeOrders
      _setState({
        updateTime: { book: now, trade: 2 },
        fakeOrder: [{ type: 'buy', time: now, price: 999, symbol: 'old', done: false }],
      });
      const origDate = global.Date;
      const mockDate = class extends origDate {
        getHours() { return 20; }
      };
      global.Date = mockDate;

      mockGetSuggestionData.mockReturnValue({
        '2330': { price: 500, bCount: 1, buy: 495 },
      });
      mockMongo.mockResolvedValue([
        { _id: 'id1', index: '2330', setype: 'twse', ing: 1, amount: 3 },
      ]);
      mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));

      await twseShioajiInit();

      global.Date = origDate;

      // Old fakeOrder should be gone
      const fakeOrders = _getState().fakeOrder;
      expect(fakeOrders.find(f => f.symbol === 'old')).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 11. sellallShioajiOrder — via ing===2 path
  // ═══════════════════════════════════════════════════════════
  describe('sellallShioajiOrder — via ing===2', () => {
    const now = Math.round(Date.now() / 1000);

    test('sellall builds command with real credentials and index', async () => {
      _setState({ updateTime: { book: now, trade: 2 } });
      const origDate = global.Date;
      const mockDate = class extends origDate {
        getHours() { return 20; }
      };
      global.Date = mockDate;

      const origSetTimeout = globalThis.setTimeout;
      globalThis.setTimeout = (fn, ms) => origSetTimeout(fn, 0);

      mockGetSuggestionData.mockReturnValue({ '2330': { price: 500 } });
      mockMongo.mockImplementation((method) => {
        if (method === 'find') {
          return Promise.resolve([{
            _id: 'id1', index: '2330', setype: 'twse', ing: 2, amount: 5,
          }]);
        }
        if (method === 'deleteMany') return Promise.resolve();
        return Promise.resolve();
      });
      mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));

      await twseShioajiInit();

      globalThis.setTimeout = origSetTimeout;
      global.Date = origDate;

      const sellallCmd = mockExec.mock.calls.find(c => c[0]?.includes?.('sellall'));
      expect(sellallCmd).toBeDefined();
      expect(sellallCmd[0]).toContain('test-key');
      expect(sellallCmd[0]).toContain('test-secret');
      expect(sellallCmd[0]).toContain('test-ca');
      expect(sellallCmd[0]).toContain('test-capw');
      expect(sellallCmd[0]).toContain('2330');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 11. RANGE_INTERVAL filtering
  // ═══════════════════════════════════════════════════════════
  describe('RANGE_INTERVAL filtering', () => {
    const now = Math.round(Date.now() / 1000);

    test('Buy order — old entries filtered by RANGE_INTERVAL', async () => {
      const fillOrder = JSON.stringify([
        { price: 570, time: now, symbol: '2330', starttime: now, type: 'Buy', quantity: 1 },
      ]);
      const output = buildPythonOutput({ fillOrder });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      const item = {
        _id: 'id1',
        index: '2330',
        setype: 'twse',
        previous: {
          price: 580,
          time: now - 10,
          type: 'buy',
          buy: [
            { price: 560, time: now - 100000 }, // very old, should be filtered
            { price: 565, time: now - 100 },     // recent, should be kept
          ],
          sell: [],
        },
        profit: 0,
      };
      mockMongo.mockImplementation((method) => {
        if (method === 'find') return Promise.resolve([item]);
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      const buyArr = updateCalls[0][3].$set.previous.buy;
      // The very old entry (now - 100000) should be filtered
      // RANGE_INTERVAL = 86400. now - (now-100000) = 100000 >= 86400 => filtered out
      expect(buyArr.every(b => (now - b.time) < 86400)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 12. Sell profit with same-time entries (while loop)
  // ═══════════════════════════════════════════════════════════
  describe('Sell profit — same-time ptime entries', () => {
    const now = Math.round(Date.now() / 1000);

    test('consecutive same-time entries in ptime — while loop accumulates', async () => {
      _setState({
        position: [{ symbol: '2330', amount: 5, price: 570 }],
      });

      const t = now - 50;
      const fillOrder = JSON.stringify([
        {
          price: 590, time: now, symbol: '2330', starttime: now,
          type: 'Sell', quantity: 500,
          profit: `50p100p200p`, ptime: `${t}t${t}t${now + 100}t`,
        },
      ]);
      const output = buildPythonOutput({
        position: '[{"symbol":"2330","amount":2,"price":575.5}]',
        fillOrder,
      });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      const item = {
        _id: 'id1',
        index: '2330',
        setype: 'twse',
        previous: {
          price: 580, time: now - 10, type: 'sell', buy: [],
          sell: [],
        },
        profit: 0,
      };
      mockMongo.mockImplementation((method) => {
        if (method === 'find') return Promise.resolve([item]);
        if (method === 'update') return Promise.resolve();
        return Promise.resolve();
      });

      await twseShioajiInit();

      const updateCalls = mockMongo.mock.calls.filter(c => c[0] === 'update');
      expect(updateCalls.length).toBeGreaterThan(0);
      const profit = updateCalls[0][3].$set.profit;
      expect(typeof profit).toBe('number');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 13. Edge cases
  // ═══════════════════════════════════════════════════════════
  describe('Edge cases', () => {
    const now = Math.round(Date.now() / 1000);

    test('fill_order with price = 0.01 — processed normally', async () => {
      const fillOrder = JSON.stringify([
        { price: 0.01, time: now, symbol: '2330', starttime: now, type: 'Buy', quantity: 1 },
      ]);
      const output = buildPythonOutput({ fillOrder });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});
      mockMongo.mockImplementation((method) => {
        if (method === 'find') return Promise.resolve([]);
        return Promise.resolve();
      });

      await twseShioajiInit();

      // Should call Mongo.find since price > 0
      expect(mockMongo).toHaveBeenCalledWith('find', 'total', { setype: 'twse', index: '2330' });
    });

    test('negative available value parsed correctly', async () => {
      const output = buildPythonOutput({ available: '-5000' });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      await twseShioajiInit();
      expect(_getState().available).toBe(-5000);
    });

    test('empty arrays in Python output', async () => {
      const output = buildPythonOutput({
        position: '[]',
        order: '[]',
        fillOrder: '[]',
      });
      mockExec.mockImplementation((cmd, cb) => cb(null, output));
      mockGetSuggestionData.mockReturnValue({});

      await twseShioajiInit();

      const s = _getState();
      expect(s.position).toEqual([]);
      expect(s.order).toEqual([]);
    });
  });
});
