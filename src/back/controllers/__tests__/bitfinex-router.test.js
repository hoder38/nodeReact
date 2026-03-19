/**
 * bitfinex-router.test.js — Comprehensive tests for src/back/controllers/bitfinex-router.js
 *
 * Routes (all require auth via router.use checkLogin):
 *   GET  /get/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\d+)/:name?/:exactly?/:index?
 *   GET  /getSingle/:sortName/:sortType/:page/:name?/:exactly?/:index?
 *   GET  /single/:sortName/:sortType/:uid/:user?
 *   GET  /parent
 *   GET  /bot             — async (BitfinexTool.getBot)
 *   PUT  /bot             — async (BitfinexTool.updateBot)
 *   GET  /bot/del/:type   — async (BitfinexTool.deleteBot)
 *   GET  /bot/close/:credit — async (BitfinexTool.closeCredit)
 *
 * Key characteristics:
 *   - /get, /getSingle, /single, /parent are SYNCHRONOUS (res.json(value) directly)
 *   - /bot, /bot/del, /bot/close are ASYNC with .then().catch(handleError(err,next))
 *   - No admin checks — every authenticated user has full access
 *   - /single route has no :name param but references req.params.name → always undefined
 *   - /bot/del uses GET (not DELETE) — destructive via GET
 *   - /bot/close passes credit as string (no Number() cast)
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// =====================================================================
// MOCK SETUP
// =====================================================================
jest.unstable_mockModule('fs', () => ({
  default: {
    readFileSync: jest.fn(() => Buffer.from('')),
    createReadStream: jest.fn(() => ({ pipe: jest.fn().mockReturnThis(), on: jest.fn() })),
    existsSync: jest.fn(() => false), readdirSync: jest.fn(() => []),
    lstatSync: jest.fn(() => ({ isDirectory: () => false })),
    unlinkSync: jest.fn(), rmdirSync: jest.fn(), readFile: jest.fn(),
    writeFile: jest.fn(), createWriteStream: jest.fn(),
    statSync: jest.fn(() => ({ size: 0 })), renameSync: jest.fn(),
    writeFileSync: jest.fn(), unlink: jest.fn(),
  },
}));

jest.unstable_mockModule('../../../../ver.js', () => ({
  ENV_TYPE: 'test', CA: '/t', CERT: '/t', PKEY: '/t',
  SESS_SECRET: 'test', SESS_PWD: 'test',
}));

jest.unstable_mockModule('../../config.js', () => ({
  NAS_PREFIX: jest.fn(() => '/s'), EXTENT_FILE_IP: jest.fn(() => 'h'),
  EXTENT_FILE_PORT: jest.fn(() => 1), EXTENT_IP: jest.fn(() => 'h'),
  EXTENT_PORT: jest.fn(() => 1), IP: jest.fn(() => '0'), PORT: jest.fn(() => 1),
  FILE_IP: jest.fn(() => '0'), FILE_PORT: jest.fn(() => 1), WS_PORT: jest.fn(() => 1),
  COM_PORT: jest.fn(() => 1), NAS_TMP: jest.fn(() => '/t'), APP_HTML: jest.fn(() => 'a'),
  DB_NAME: jest.fn(() => 'd'), DB_IP: jest.fn(() => '0'), DB_PORT: jest.fn(() => 1),
  SESS_IP: jest.fn(() => '0'), SESS_PORT: jest.fn(() => 1), HINT: jest.fn(() => false),
}));

jest.unstable_mockModule('../../constants.js', () => ({
  USERDB: 'user', VERIFYDB: 'verify', STORAGEDB: 'storage',
  UNACTIVE_DAY: 5, UNACTIVE_HIT: 10,
  RE_WEBURL: /^(url:)?(?:https?:\/\/).+/, STATIC_PATH: '/p', RELEASE: 'release', DEV: 'dev',
  STOCKDB: 'stock', PASSWORDDB: 'password', FITNESSDB: 'fitness', RANKDB: 'rank',
  BITFINEX: 'bitfinex',
  DEFAULT_TAGS: [], STORAGE_PARENT: [], PASSWORD_PARENT: [], STOCK_PARENT: [],
  FITNESS_PARENT: [], RANK_PARENT: [], HANDLE_TIME: 7200,
  BILI_TYPE: [], BILI_INDEX: [], RELATIVE_LIMIT: 100,
  RELATIVE_UNION: 2, RELATIVE_INTER: 3, GENRE_LIST: [], GENRE_LIST_CH: [],
  BOOKMARK_LIMIT: 100, ADULTONLY_PARENT: [], GAME_LIST: [], GAME_LIST_CH: [],
  MEDIA_LIST: [], MEDIA_LIST_CH: [], DM5_ORI_LIST: [], DM5_CH_LIST: [],
  DM5_LIST: [], DM5_AREA_LIST: [], DM5_TAG_LIST: [], KUBO_COUNTRY: [],
  QUERY_LIMIT: 20,
}));

jest.unstable_mockModule('../../models/mongo-tool.js', () => ({
  default: jest.fn(),
  objectID: jest.fn((id) => id),
}));

jest.unstable_mockModule('../../models/redis-tool.js', () => ({
  default: jest.fn(() => Promise.resolve(null)),
}));

// --- BitfinexTool mock ---
const mockQuery = jest.fn();
const mockParent = jest.fn();
const mockGetBot = jest.fn();
const mockUpdateBot = jest.fn();
const mockDeleteBot = jest.fn();
const mockCloseCredit = jest.fn();

jest.unstable_mockModule('../../models/bitfinex-tool.js', () => ({
  default: {
    query: mockQuery,
    parent: mockParent,
    getBot: mockGetBot,
    updateBot: mockUpdateBot,
    deleteBot: mockDeleteBot,
    closeCredit: mockCloseCredit,
  },
}));

// =====================================================================
// IMPORTS
// =====================================================================
const { default: Express } = await import('express');
const { default: request } = await import('supertest');
const { default: BitfinexRouter } = await import('../bitfinex-router.js');

// =====================================================================
// HELPERS
// =====================================================================
const USER = { _id: 'aabbccddeeff001122334455', username: 'trader1', perm: 1 };
const USER2 = { _id: 'aabbccddeeff001122334466', username: 'trader2', perm: 3 };

function buildApp() {
  const app = Express();
  app.use(Express.json());
  app.use(Express.urlencoded({ extended: true }));
  app.use((req, res, next) => {
    if (req.headers['x-test-user']) {
      req.user = JSON.parse(req.headers['x-test-user']);
      req.isAuthenticated = () => true;
    } else {
      req.isAuthenticated = () => false;
    }
    req.session = {};
    next();
  });
  app.use('/', BitfinexRouter);
  app.use((err, req, res, next) => {
    err.name === 'HoError'
      ? res.status(err.code || 400).send(err.message.toString())
      : res.status(500).send('server error occur');
  });
  return app;
}

const u = (user) => JSON.stringify(user);

const sampleQueryResult = { items: [{ id: 1, name: 'fUSD' }], total: 1, page: 0 };
const sampleBotList = [{ type: 'fUSD', rate: 0.05, amount: 500 }];

// =====================================================================
// TESTS
// =====================================================================
describe('bitfinex-router.js', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
    jest.clearAllMocks();
    mockQuery.mockReturnValue(sampleQueryResult);
    mockParent.mockReturnValue(['fUSD', 'fETH']);
    mockGetBot.mockResolvedValue(sampleBotList);
    mockUpdateBot.mockResolvedValue(sampleBotList);
    mockDeleteBot.mockResolvedValue([]);
    mockCloseCredit.mockResolvedValue();
  });

  // =================================================================
  // Auth guard (router.use checkLogin)
  // =================================================================
  describe('Auth guard', () => {
    test('unauthenticated GET /get → 401', async () => {
      const res = await request(app).get('/get/name/desc/0');
      expect(res.status).toBe(401);
    });

    test('unauthenticated GET /getSingle → 401', async () => {
      const res = await request(app).get('/getSingle/name/asc/0');
      expect(res.status).toBe(401);
    });

    test('unauthenticated GET /single → 401', async () => {
      const res = await request(app).get('/single/name/asc/42');
      expect(res.status).toBe(401);
    });

    test('unauthenticated GET /parent → 401', async () => {
      const res = await request(app).get('/parent');
      expect(res.status).toBe(401);
    });

    test('unauthenticated GET /bot → 401', async () => {
      const res = await request(app).get('/bot');
      expect(res.status).toBe(401);
    });

    test('unauthenticated PUT /bot → 401', async () => {
      const res = await request(app).put('/bot').send({ rate: 0.1 });
      expect(res.status).toBe(401);
    });

    test('unauthenticated GET /bot/del/fUSD → 401', async () => {
      const res = await request(app).get('/bot/del/fUSD');
      expect(res.status).toBe(401);
    });

    test('unauthenticated GET /bot/close/123 → 401', async () => {
      const res = await request(app).get('/bot/close/123');
      expect(res.status).toBe(401);
    });
  });

  // =================================================================
  // GET /get/:sortName/:sortType/:page/:name?/:exactly?/:index?
  // =================================================================
  describe('GET /get (paginated query)', () => {
    test('valid request with required params only', async () => {
      const res = await request(app).get('/get/name/desc/0').set('x-test-user', u(USER));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(sampleQueryResult);
      expect(mockQuery).toHaveBeenCalledWith(
        0, undefined, 'name', 'desc',
        expect.objectContaining({ _id: USER._id }),
        expect.any(Object),
      );
    });

    test('all optional params supplied', async () => {
      const res = await request(app)
        .get('/get/mtime/asc/3/bitcoin/true/5')
        .set('x-test-user', u(USER));
      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        3, 'bitcoin', 'mtime', 'asc',
        expect.objectContaining({ _id: USER._id }),
        expect.any(Object),
      );
    });

    test('page is numeric coercion via Number()', async () => {
      const res = await request(app).get('/get/count/asc/99').set('x-test-user', u(USER));
      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        99, undefined, 'count', 'asc',
        expect.anything(), expect.anything(),
      );
    });

    test('name param only (no exactly/index)', async () => {
      const res = await request(app)
        .get('/get/name/desc/0/ethereum')
        .set('x-test-user', u(USER));
      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        0, 'ethereum', 'name', 'desc',
        expect.anything(), expect.anything(),
      );
    });

    test('sortName=count works', async () => {
      const res = await request(app).get('/get/count/desc/0').set('x-test-user', u(USER));
      expect(res.status).toBe(200);
    });

    test('invalid sortName → 404', async () => {
      const res = await request(app).get('/get/invalid/desc/0').set('x-test-user', u(USER));
      expect(res.status).toBe(404);
    });

    test('invalid sortType → 404', async () => {
      const res = await request(app).get('/get/name/up/0').set('x-test-user', u(USER));
      expect(res.status).toBe(404);
    });

    test('non-numeric page → 404', async () => {
      const res = await request(app).get('/get/name/asc/abc').set('x-test-user', u(USER));
      expect(res.status).toBe(404);
    });

    test('different user gets same access (no admin check)', async () => {
      const res = await request(app).get('/get/name/asc/0').set('x-test-user', u(USER2));
      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        0, undefined, 'name', 'asc',
        expect.objectContaining({ _id: USER2._id }),
        expect.any(Object),
      );
    });
  });

  // =================================================================
  // GET /getSingle (same pattern as /get)
  // =================================================================
  describe('GET /getSingle', () => {
    test('valid request — same as /get with identical query call', async () => {
      const res = await request(app)
        .get('/getSingle/name/desc/0')
        .set('x-test-user', u(USER));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(sampleQueryResult);
      expect(mockQuery).toHaveBeenCalledWith(
        0, undefined, 'name', 'desc',
        expect.objectContaining({ _id: USER._id }),
        expect.any(Object),
      );
    });

    test('all optional params', async () => {
      const res = await request(app)
        .get('/getSingle/mtime/asc/2/btc/false/10')
        .set('x-test-user', u(USER));
      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        2, 'btc', 'mtime', 'asc',
        expect.anything(), expect.anything(),
      );
    });

    test('invalid sortName → 404', async () => {
      const res = await request(app).get('/getSingle/price/asc/0').set('x-test-user', u(USER));
      expect(res.status).toBe(404);
    });

    test('invalid sortType → 404', async () => {
      const res = await request(app).get('/getSingle/name/random/0').set('x-test-user', u(USER));
      expect(res.status).toBe(404);
    });
  });

  // =================================================================
  // GET /single/:sortName/:sortType/:uid/:user?
  // =================================================================
  describe('GET /single', () => {
    test('valid uid, no user param', async () => {
      const res = await request(app)
        .get('/single/name/asc/42')
        .set('x-test-user', u(USER));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(sampleQueryResult);
      // page=0, name=null (hardcoded), uid=Number(42)
      expect(mockQuery).toHaveBeenCalledWith(
        0, null, 'name', 'asc',
        expect.objectContaining({ _id: USER._id }),
        expect.any(Object),
        42,
      );
    });

    test('uid with user param', async () => {
      const res = await request(app)
        .get('/single/mtime/desc/7/someUser')
        .set('x-test-user', u(USER));
      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        0, null, 'mtime', 'desc',
        expect.anything(), expect.anything(),
        7,
      );
    });

    test('uid is converted via Number()', async () => {
      const res = await request(app)
        .get('/single/count/asc/999')
        .set('x-test-user', u(USER));
      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        0, null, 'count', 'asc',
        expect.anything(), expect.anything(),
        999,
      );
    });

    test('name param is always null (hardcoded in handler)', async () => {
      const res = await request(app)
        .get('/single/name/desc/1')
        .set('x-test-user', u(USER));
      expect(res.status).toBe(200);
      // Second arg to query is name, hardcoded as null in /single handler
      expect(mockQuery.mock.calls[0][1]).toBeNull();
    });

    test('invalid sortName → 404', async () => {
      const res = await request(app).get('/single/rate/asc/1').set('x-test-user', u(USER));
      expect(res.status).toBe(404);
    });

    test('invalid sortType → 404', async () => {
      const res = await request(app).get('/single/name/none/1').set('x-test-user', u(USER));
      expect(res.status).toBe(404);
    });
  });

  // =================================================================
  // GET /parent
  // =================================================================
  describe('GET /parent', () => {
    test('returns parent list synchronously', async () => {
      const res = await request(app).get('/parent').set('x-test-user', u(USER));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(['fUSD', 'fETH']);
      expect(mockParent).toHaveBeenCalledTimes(1);
    });

    test('called with no arguments', async () => {
      await request(app).get('/parent').set('x-test-user', u(USER));
      expect(mockParent).toHaveBeenCalledWith();
    });

    test('different user gets same access', async () => {
      const res = await request(app).get('/parent').set('x-test-user', u(USER2));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(['fUSD', 'fETH']);
    });

    test('returns empty array when parent returns empty', async () => {
      mockParent.mockReturnValue([]);
      const res = await request(app).get('/parent').set('x-test-user', u(USER));
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // =================================================================
  // GET /bot — BitfinexTool.getBot(user._id)
  // =================================================================
  describe('GET /bot', () => {
    test('returns bot list for authenticated user', async () => {
      const res = await request(app).get('/bot').set('x-test-user', u(USER));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(sampleBotList);
      expect(mockGetBot).toHaveBeenCalledWith(USER._id);
    });

    test('different user passes their own _id', async () => {
      const res = await request(app).get('/bot').set('x-test-user', u(USER2));
      expect(res.status).toBe(200);
      expect(mockGetBot).toHaveBeenCalledWith(USER2._id);
    });

    test('getBot rejects → error forwarded to Express', async () => {
      mockGetBot.mockRejectedValueOnce(new Error('db fail'));
      const res = await request(app).get('/bot').set('x-test-user', u(USER));
      expect(res.status).toBe(500);
    });

    test('returns empty array when no bots configured', async () => {
      mockGetBot.mockResolvedValueOnce([]);
      const res = await request(app).get('/bot').set('x-test-user', u(USER));
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // =================================================================
  // PUT /bot — BitfinexTool.updateBot(user._id, body, username)
  // =================================================================
  describe('PUT /bot', () => {
    test('updates bot with JSON body', async () => {
      const body = { type: 'fUSD', rate: 0.08, amount: 1000 };
      const res = await request(app)
        .put('/bot')
        .set('x-test-user', u(USER))
        .send(body);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(sampleBotList);
      expect(mockUpdateBot).toHaveBeenCalledWith(
        USER._id,
        expect.objectContaining({ type: 'fUSD', rate: 0.08, amount: 1000 }),
        USER.username,
      );
    });

    test('passes user._id and username correctly', async () => {
      const body = { type: 'fETH' };
      await request(app).put('/bot').set('x-test-user', u(USER2)).send(body);
      expect(mockUpdateBot).toHaveBeenCalledWith(
        USER2._id,
        expect.objectContaining({ type: 'fETH' }),
        USER2.username,
      );
    });

    test('empty body still calls updateBot', async () => {
      const res = await request(app)
        .put('/bot')
        .set('x-test-user', u(USER))
        .send({});
      expect(res.status).toBe(200);
      expect(mockUpdateBot).toHaveBeenCalled();
    });

    test('updateBot rejects → error forwarded', async () => {
      mockUpdateBot.mockRejectedValueOnce(new Error('validation fail'));
      const res = await request(app)
        .put('/bot')
        .set('x-test-user', u(USER))
        .send({ type: 'bad' });
      expect(res.status).toBe(500);
    });
  });

  // =================================================================
  // GET /bot/del/:type — BitfinexTool.deleteBot(user._id, type, username)
  // =================================================================
  describe('GET /bot/del/:type', () => {
    test('deletes bot by type', async () => {
      const res = await request(app)
        .get('/bot/del/fUSD')
        .set('x-test-user', u(USER));
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
      expect(mockDeleteBot).toHaveBeenCalledWith(USER._id, 'fUSD', USER.username);
    });

    test('passes type as string unchanged', async () => {
      await request(app).get('/bot/del/fETH').set('x-test-user', u(USER));
      expect(mockDeleteBot).toHaveBeenCalledWith(USER._id, 'fETH', USER.username);
    });

    test('different user deletes their own bot', async () => {
      await request(app).get('/bot/del/fBTC').set('x-test-user', u(USER2));
      expect(mockDeleteBot).toHaveBeenCalledWith(USER2._id, 'fBTC', USER2.username);
    });

    test('deleteBot rejects → error forwarded', async () => {
      mockDeleteBot.mockRejectedValueOnce(new Error('not found'));
      const res = await request(app)
        .get('/bot/del/fUSD')
        .set('x-test-user', u(USER));
      expect(res.status).toBe(500);
    });

    test('type with special characters', async () => {
      const res = await request(app)
        .get('/bot/del/f-USDT')
        .set('x-test-user', u(USER));
      expect(res.status).toBe(200);
      expect(mockDeleteBot).toHaveBeenCalledWith(USER._id, 'f-USDT', USER.username);
    });
  });

  // =================================================================
  // GET /bot/close/:credit — BitfinexTool.closeCredit(username, credit)
  // =================================================================
  describe('GET /bot/close/:credit', () => {
    test('closes credit and returns apiOK', async () => {
      const res = await request(app)
        .get('/bot/close/123456')
        .set('x-test-user', u(USER));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ apiOK: true });
      expect(mockCloseCredit).toHaveBeenCalledWith(USER.username, '123456');
    });

    test('credit is passed as string (no Number cast)', async () => {
      await request(app).get('/bot/close/abc').set('x-test-user', u(USER));
      expect(mockCloseCredit).toHaveBeenCalledWith(USER.username, 'abc');
    });

    test('uses username (not _id) as first arg', async () => {
      await request(app).get('/bot/close/999').set('x-test-user', u(USER2));
      expect(mockCloseCredit).toHaveBeenCalledWith(USER2.username, '999');
    });

    test('closeCredit rejects → error forwarded', async () => {
      mockCloseCredit.mockRejectedValueOnce(new Error('credit fail'));
      const res = await request(app)
        .get('/bot/close/123')
        .set('x-test-user', u(USER));
      expect(res.status).toBe(500);
    });

    test('large credit value stays as string', async () => {
      await request(app).get('/bot/close/99999999999').set('x-test-user', u(USER));
      expect(mockCloseCredit).toHaveBeenCalledWith(USER.username, '99999999999');
    });
  });

  // =================================================================
  // Route parameter validation (Express regex)
  // =================================================================
  describe('Route regex validation', () => {
    test('GET /get with invalid exactly param (not true|false) → still matches route (optional)', async () => {
      // Express optional params with regex: /get/name/asc/0/btc/maybe
      // :exactly(true|false)? — "maybe" doesn't match, so Express treats it differently
      const res = await request(app)
        .get('/get/name/asc/0/btc/maybe')
        .set('x-test-user', u(USER));
      // "maybe" doesn't match (true|false), route may not match → 404
      expect(res.status).toBe(404);
    });

    test('GET /get page=0 valid (edge case)', async () => {
      const res = await request(app).get('/get/name/asc/0').set('x-test-user', u(USER));
      expect(res.status).toBe(200);
      expect(mockQuery.mock.calls[0][0]).toBe(0);
    });

    test('GET /get large page number', async () => {
      const res = await request(app).get('/get/name/asc/9999').set('x-test-user', u(USER));
      expect(res.status).toBe(200);
      expect(mockQuery.mock.calls[0][0]).toBe(9999);
    });

    test('GET /single with non-numeric uid → NaN passed to query', async () => {
      // /single/:sortName/:sortType/:uid — uid has no regex constraint
      // Number('abc') → NaN, passed to query
      const res = await request(app)
        .get('/single/name/asc/abc')
        .set('x-test-user', u(USER));
      expect(res.status).toBe(200);
      expect(mockQuery).toHaveBeenCalledWith(
        0, null, 'name', 'asc',
        expect.anything(), expect.anything(),
        NaN,
      );
    });

    test('GET /bot/del with no type → 404', async () => {
      const res = await request(app).get('/bot/del').set('x-test-user', u(USER));
      // /bot/del without :type → no route match → falls through
      expect(res.status).toBe(404);
    });

    test('GET /bot/close with no credit → 404', async () => {
      const res = await request(app).get('/bot/close').set('x-test-user', u(USER));
      expect(res.status).toBe(404);
    });

    test('POST /bot → 404 (only GET and PUT defined)', async () => {
      const res = await request(app)
        .post('/bot')
        .set('x-test-user', u(USER))
        .send({ data: 'x' });
      // Express route() only defines GET and PUT — POST is not handled
      expect(res.status).toBe(404);
    });

    test('DELETE /bot → 404 (not defined)', async () => {
      const res = await request(app).delete('/bot').set('x-test-user', u(USER));
      expect(res.status).toBe(404);
    });
  });

  // =================================================================
  // Edge cases & return value shapes
  // =================================================================
  describe('Edge cases', () => {
    test('sync query returns null → res.json(null)', async () => {
      mockQuery.mockReturnValue(null);
      const res = await request(app).get('/get/name/asc/0').set('x-test-user', u(USER));
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });

    test('sync query returns complex object', async () => {
      const complex = { items: [], total: 0, meta: { cached: true, ts: Date.now() } };
      mockQuery.mockReturnValue(complex);
      const res = await request(app).get('/get/name/asc/0').set('x-test-user', u(USER));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(complex);
    });

    test('parent returns complex nested structure', async () => {
      mockParent.mockReturnValue({ categories: ['fUSD', 'fETH'], count: 2 });
      const res = await request(app).get('/parent').set('x-test-user', u(USER));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ categories: ['fUSD', 'fETH'], count: 2 });
    });

    test('sync query throws → unhandled (no .catch chain)', async () => {
      mockQuery.mockImplementation(() => { throw new Error('sync boom'); });
      const res = await request(app).get('/get/name/asc/0').set('x-test-user', u(USER));
      // Synchronous throw in route handler → Express catches it → 500
      expect(res.status).toBe(500);
    });

    test('parent throws → Express catches synchronous error', async () => {
      mockParent.mockImplementation(() => { throw new Error('parent boom'); });
      const res = await request(app).get('/parent').set('x-test-user', u(USER));
      expect(res.status).toBe(500);
    });

    test('session object is passed to query', async () => {
      await request(app).get('/get/name/asc/0').set('x-test-user', u(USER));
      // 6th arg is session object
      expect(mockQuery.mock.calls[0][5]).toEqual({});
    });
  });
});
