/**
 * stock-router.test.js — Comprehensive tests for src/back/controllers/stock-router.js
 *
 * Active routes (all require auth via router.use checkLogin):
 *   GET  /get/:sortName/:sortType/:page/:name?/:exactly?/:index?  — paginated stock query
 *   GET  /getSingle/...  — single query with resetArray on page=0+name
 *   GET  /reset/:sortName/:sortType — reset tag search
 *   GET  /single/:uid — single stock item
 *   POST /getOptionTag — relative tag suggestions (pre-seeded with 'important')
 *   PUT  /addTag/:tag — add tag to multiple items (recursive + WebSocket)
 *   PUT  /delTag/:tag — delete tag from multiple items (recursive + WebSocket)
 *   GET  /querySimple/:uid — simplified stock data (validates uid)
 *   GET  /getPER/:uid — PER data + setLatest side effect
 *   GET  /getInterval/:uid — interval analysis data
 *   GET  /getTotal — portfolio total
 *   PUT  /updateTotal/:real? — update portfolio total
 *
 * Key difference from password-router:
 *   - getStockItem returns [] for non-admin (perm > 1) — checkAdmin(1, user) gate
 *   - getOptionTag pre-seeds with 'important' (password does not)
 *   - getPER calls StockTagTool.setLatest as fire-and-forget side effect
 *   - querySimple/getPER/getInterval validate uid via isValidString
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// =====================================================================
// MOCK SETUP
// =====================================================================

// --- node-fetch (prevents test pollution from api-tool.js retry logic) ---
jest.unstable_mockModule('node-fetch', () => ({
  default: jest.fn(() => Promise.resolve({
    ok: true,
    buffer: jest.fn().mockResolvedValue(Buffer.from('')),
    headers: { get: jest.fn(() => null) },
    body: { pipe: jest.fn().mockReturnThis(), on: jest.fn() },
  })),
}));

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
  RE_WEBURL: /^https?:\/\//, STATIC_PATH: '/p', RELEASE: 'release', DEV: 'dev',
  STOCKDB: 'stock', PASSWORDDB: 'password',
  DEFAULT_TAGS: [], STORAGE_PARENT: [], PASSWORD_PARENT: [], STOCK_PARENT: [], HANDLE_TIME: 7200,
  RELATIVE_LIMIT: 100,
  RELATIVE_UNION: 2, RELATIVE_INTER: 3, GENRE_LIST: [], GENRE_LIST_CH: [],
  BOOKMARK_LIMIT: 100, ADULTONLY_PARENT: [], GAME_LIST: [], GAME_LIST_CH: [],
  MEDIA_LIST: [], MEDIA_LIST_CH: [], DM5_ORI_LIST: [], DM5_CH_LIST: [],
  DM5_LIST: [], DM5_AREA_LIST: [], DM5_TAG_LIST: [],
  QUERY_LIMIT: 20,
}));

jest.unstable_mockModule('../../models/mongo-tool.js', () => ({
  default: jest.fn(),
  objectID: jest.fn((id) => id),
}));

// StockTagTool mock methods
const mockTagQuery = jest.fn();
const mockSingleQuery = jest.fn();
const mockResetQuery = jest.fn();
const mockGetRelativeTag = jest.fn();
const mockAddTag = jest.fn();
const mockDelTag = jest.fn();
const mockResetArray = jest.fn();
const mockSearchTags = jest.fn(() => ({ resetArray: mockResetArray }));
const mockSetLatest = jest.fn();

jest.unstable_mockModule('../../models/tag-tool.js', () => ({
  default: jest.fn(() => ({
    tagQuery: mockTagQuery,
    singleQuery: mockSingleQuery,
    resetQuery: mockResetQuery,
    getRelativeTag: mockGetRelativeTag,
    addTag: mockAddTag,
    delTag: mockDelTag,
    searchTags: mockSearchTags,
    setLatest: mockSetLatest,
  })),
  isDefaultTag: jest.fn(() => false),
  normalize: jest.fn((s) => s),
}));

// StockTool mock methods
const mockGetSingleStockV2 = jest.fn();
const mockGetStockPERV2 = jest.fn();
const mockGetIntervalWarp = jest.fn();
const mockGetStockTotal = jest.fn();
const mockUpdateStockTotal = jest.fn();

jest.unstable_mockModule('../../models/stock-tool.js', () => ({
  default: {
    getSingleStockV2: mockGetSingleStockV2,
    getStockPERV2: mockGetStockPERV2,
    getIntervalWarp: mockGetIntervalWarp,
    getStockTotal: mockGetStockTotal,
    updateStockTotal: mockUpdateStockTotal,
  },
}));

const mockSendWs = jest.fn();
jest.unstable_mockModule('../../util/sendWs.js', () => ({
  default: mockSendWs,
}));

// =====================================================================
// IMPORTS
// =====================================================================
const { default: Express } = await import('express');
const { default: request } = await import('supertest');
const { default: StockRouter } = await import('../stock-router.js');

// =====================================================================
// HELPERS
// =====================================================================
// Admin (perm=1): getStockItem returns mapped items
const ADMIN = { _id: 'aabbccddeeff001122334455', username: 'admin', perm: 1 };
// Regular user (perm=3): getStockItem returns [] (checkAdmin(1, user) → false)
const REGULAR = { _id: 'aabbccddeeff001122334466', username: 'user1', perm: 3 };

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
  app.use('/', StockRouter);
  app.use((err, req, res, next) => {
    err.name === 'HoError'
      ? res.status(err.code || 400).send(err.message.toString())
      : res.status(500).send('server error occur');
  });
  return app;
}

const u = (user) => JSON.stringify(user);

// Valid 24-char hex ObjectID for isValidString('uid')
const VALID_UID = 'aabbccddeeff001122334488';

const sampleStockItem = (overrides = {}) => ({
  _id: 'st001', name: 'TSMC', tags: ['tech'], per: 15.2, pdr: 3.1,
  pbr: 2.5, index: 'TWSE', type: 'stock', important: 0, utime: 99999,
  ...overrides,
});

// =====================================================================
// TESTS
// =====================================================================
describe('stock-router.js', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // Auth guard
  // ---------------------------------------------------------------
  describe('Auth guard (router.use checkLogin)', () => {
    test('unauthenticated GET /get returns 401', async () => {
      const res = await request(app).get('/get/name/desc/0');
      expect(res.status).toBe(401);
    });

    test('unauthenticated POST /getOptionTag returns 401', async () => {
      const res = await request(app).post('/getOptionTag');
      expect(res.status).toBe(401);
    });

    test('unauthenticated GET /getTotal returns 401', async () => {
      const res = await request(app).get('/getTotal');
      expect(res.status).toBe(401);
    });

    test('unauthenticated PUT /updateTotal returns 401', async () => {
      const res = await request(app).put('/updateTotal');
      expect(res.status).toBe(401);
    });

    test('unauthenticated GET /querySimple/:uid returns 401', async () => {
      const res = await request(app).get(`/querySimple/${VALID_UID}`);
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------
  // GET /get — paginated stock query
  // ---------------------------------------------------------------
  describe('GET /get/:sortName/:sortType/:page — stock query', () => {
    test('admin gets transformed itemList with all fields', async () => {
      const items = [sampleStockItem()];
      mockTagQuery.mockResolvedValueOnce({
        items, parentList: ['tech'], latest: 'st001', bookmark: 'bk1',
      });
      const res = await request(app).get('/get/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.itemList).toHaveLength(1);
      expect(res.body.itemList[0]).toEqual(expect.objectContaining({
        name: 'TSMC', id: 'st001', profit: 15.2, safety: 3.1,
        management: 2.5, index: 'TWSE', type: 'stock',
      }));
      expect(res.body.parentList).toEqual(['tech']);
      expect(res.body.latest).toBe('st001');
      expect(res.body.bookmarkID).toBe('bk1');
    });

    test('non-admin gets empty itemList (getStockItem returns [])', async () => {
      mockTagQuery.mockResolvedValueOnce({
        items: [sampleStockItem()], parentList: ['tech'], latest: 'st001', bookmark: 'bk1',
      });
      const res = await request(app).get('/get/name/desc/0').set('x-test-user', u(REGULAR));
      expect(res.status).toBe(200);
      expect(res.body.itemList).toEqual([]);
    });

    test('important item (important=1) gets "important" tag pushed', async () => {
      mockTagQuery.mockResolvedValueOnce({
        items: [sampleStockItem({ important: 1, tags: ['tech'] })],
        parentList: [], latest: null, bookmark: null,
      });
      const res = await request(app).get('/get/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.body.itemList[0].tags).toContain('important');
    });

    test('passes sortName=mtime, sortType=asc, page=5 correctly', async () => {
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null });
      await request(app).get('/get/mtime/asc/5').set('x-test-user', u(ADMIN));
      expect(mockTagQuery).toHaveBeenCalledWith(
        5, undefined, false, NaN, 'mtime', 'asc', expect.anything(), expect.anything()
      );
    });

    test('passes name, exactly=true, index params', async () => {
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null });
      await request(app).get('/get/count/desc/0/myTag/true/3').set('x-test-user', u(ADMIN));
      expect(mockTagQuery).toHaveBeenCalledWith(
        0, 'myTag', true, 3, 'count', 'desc', expect.anything(), expect.anything()
      );
    });

    test('exactly=false when param is "false"', async () => {
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null });
      await request(app).get('/get/name/desc/0/tag/false/0').set('x-test-user', u(ADMIN));
      expect(mockTagQuery.mock.calls[0][2]).toBe(false);
    });

    test('invalid sortName returns 404', async () => {
      const res = await request(app).get('/get/invalid/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(404);
    });

    test('invalid sortType returns 404', async () => {
      const res = await request(app).get('/get/name/invalid/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(404);
    });

    test('non-numeric page returns 404', async () => {
      const res = await request(app).get('/get/name/desc/abc').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(404);
    });

    test('tagQuery error returns 500', async () => {
      mockTagQuery.mockRejectedValueOnce(new Error('DB fail'));
      const res = await request(app).get('/get/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });

    test('empty items returns empty itemList', async () => {
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null });
      const res = await request(app).get('/get/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.body.itemList).toEqual([]);
    });
  });

  // ---------------------------------------------------------------
  // GET /getSingle — single query with resetArray branch
  // ---------------------------------------------------------------
  describe('GET /getSingle — single query with reset', () => {
    test('page=0 with name calls resetArray then tagQuery', async () => {
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null });
      const res = await request(app).get('/getSingle/name/desc/0/searchTag').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockSearchTags).toHaveBeenCalled();
      expect(mockResetArray).toHaveBeenCalled();
    });

    test('page=0 without name does NOT call resetArray', async () => {
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null });
      await request(app).get('/getSingle/name/desc/0').set('x-test-user', u(ADMIN));
      expect(mockResetArray).not.toHaveBeenCalled();
    });

    test('page>0 with name does NOT call resetArray', async () => {
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null });
      await request(app).get('/getSingle/name/desc/2/tag').set('x-test-user', u(ADMIN));
      expect(mockResetArray).not.toHaveBeenCalled();
    });

    test('returns same response shape as /get', async () => {
      mockTagQuery.mockResolvedValueOnce({
        items: [sampleStockItem()], parentList: ['a'], latest: 'x', bookmark: 'b',
      });
      const res = await request(app).get('/getSingle/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.body).toHaveProperty('itemList');
      expect(res.body).toHaveProperty('parentList');
      expect(res.body).toHaveProperty('latest');
      expect(res.body).toHaveProperty('bookmarkID');
    });
  });

  // ---------------------------------------------------------------
  // GET /reset — reset tag search
  // ---------------------------------------------------------------
  describe('GET /reset/:sortName/:sortType', () => {
    test('returns itemList and parentList (no latest/bookmarkID)', async () => {
      mockResetQuery.mockResolvedValueOnce({ items: [sampleStockItem()], parentList: ['all'] });
      const res = await request(app).get('/reset/name/desc').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.itemList).toHaveLength(1);
      expect(res.body.parentList).toEqual(['all']);
      expect(res.body).not.toHaveProperty('latest');
      expect(res.body).not.toHaveProperty('bookmarkID');
    });

    test('count/asc sort combination works', async () => {
      mockResetQuery.mockResolvedValueOnce({ items: [], parentList: [] });
      await request(app).get('/reset/count/asc').set('x-test-user', u(ADMIN));
      expect(mockResetQuery).toHaveBeenCalledWith('count', 'asc', expect.anything(), expect.anything());
    });

    test('error returns 500', async () => {
      mockResetQuery.mockRejectedValueOnce(new Error('reset fail'));
      const res = await request(app).get('/reset/name/desc').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });

    test('non-admin gets empty itemList', async () => {
      mockResetQuery.mockResolvedValueOnce({ items: [sampleStockItem()], parentList: [] });
      const res = await request(app).get('/reset/name/desc').set('x-test-user', u(REGULAR));
      expect(res.body.itemList).toEqual([]);
    });
  });

  // ---------------------------------------------------------------
  // GET /single/:uid
  // ---------------------------------------------------------------
  describe('GET /single/:uid', () => {
    test('admin: found item returned wrapped in array via getStockItem', async () => {
      mockSingleQuery.mockResolvedValueOnce({ empty: false, item: sampleStockItem() });
      const res = await request(app).get('/single/st001').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.item).toHaveLength(1);
      expect(res.body.item[0].name).toBe('TSMC');
      expect(res.body.item[0].profit).toBe(15.2);
    });

    test('empty result returns as-is', async () => {
      mockSingleQuery.mockResolvedValueOnce({ empty: true });
      const res = await request(app).get('/single/st999').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.empty).toBe(true);
    });

    test('non-admin: found item returns empty array (getStockItem gate)', async () => {
      mockSingleQuery.mockResolvedValueOnce({ empty: false, item: sampleStockItem() });
      const res = await request(app).get('/single/st001').set('x-test-user', u(REGULAR));
      expect(res.body.item).toEqual([]);
    });

    test('no uid validation — special chars pass through', async () => {
      mockSingleQuery.mockResolvedValueOnce({ empty: true });
      const res = await request(app).get('/single/special-chars_123').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockSingleQuery).toHaveBeenCalledWith('special-chars_123', expect.anything(), expect.anything());
    });

    test('error returns 500', async () => {
      mockSingleQuery.mockRejectedValueOnce(new Error('single fail'));
      const res = await request(app).get('/single/st001').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // POST /getOptionTag — pre-seeded with 'important'
  // ---------------------------------------------------------------
  describe('POST /getOptionTag', () => {
    test('empty tags returns ["important"] without calling getRelativeTag', async () => {
      const res = await request(app).post('/getOptionTag')
        .set('x-test-user', u(ADMIN)).send({ tags: [] });
      expect(res.status).toBe(200);
      expect(res.body.relative).toEqual(['important']);
      expect(mockGetRelativeTag).not.toHaveBeenCalled();
    });

    test('passes ["important"] as third arg (pre_arr) to getRelativeTag', async () => {
      mockGetRelativeTag.mockResolvedValueOnce(['t1']);
      await request(app).post('/getOptionTag')
        .set('x-test-user', u(ADMIN)).send({ tags: ['tech'] });
      expect(mockGetRelativeTag).toHaveBeenCalledWith(['tech'], expect.anything(), ['important']);
    });

    test('caps at 5 relative tags plus the pre-seeded "important"', async () => {
      mockGetRelativeTag.mockResolvedValueOnce(['t1', 't2', 't3', 't4', 't5', 't6', 't7']);
      const res = await request(app).post('/getOptionTag')
        .set('x-test-user', u(ADMIN)).send({ tags: ['x'] });
      expect(res.body.relative).toHaveLength(6); // 'important' + 5
      expect(res.body.relative[0]).toBe('important');
    });

    test('fewer than 5 relative tags returns all of them', async () => {
      mockGetRelativeTag.mockResolvedValueOnce(['t1', 't2']);
      const res = await request(app).post('/getOptionTag')
        .set('x-test-user', u(ADMIN)).send({ tags: ['x'] });
      expect(res.body.relative).toEqual(['important', 't1', 't2']);
    });

    test('duplicate "important" in relatives is deduplicated by Set', async () => {
      mockGetRelativeTag.mockResolvedValueOnce(['important', 't1', 't2']);
      const res = await request(app).post('/getOptionTag')
        .set('x-test-user', u(ADMIN)).send({ tags: ['x'] });
      const importantCount = res.body.relative.filter(r => r === 'important').length;
      expect(importantCount).toBe(1);
    });

    test('getRelativeTag error returns 500', async () => {
      mockGetRelativeTag.mockRejectedValueOnce(new Error('tag err'));
      const res = await request(app).post('/getOptionTag')
        .set('x-test-user', u(ADMIN)).send({ tags: ['x'] });
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // PUT /addTag/:tag — add tag to multiple items
  // ---------------------------------------------------------------
  describe('PUT /addTag/:tag', () => {
    test('single uid: addTag called, WebSocket sent, returns apiOK', async () => {
      mockAddTag.mockResolvedValueOnce({ id: 'st001' });
      const res = await request(app).put('/addTag/newtag')
        .set('x-test-user', u(ADMIN)).send({ uids: ['st001'] });
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
      expect(mockAddTag).toHaveBeenCalledWith('st001', 'newtag', expect.anything(), false);
      expect(mockSendWs).toHaveBeenCalledWith({ type: 'stock', data: 'st001' });
    });

    test('multiple uids processed recursively', async () => {
      mockAddTag.mockResolvedValueOnce({ id: 'st001' });
      mockAddTag.mockResolvedValueOnce({ id: 'st002' });
      mockAddTag.mockResolvedValueOnce({ id: 'st003' });
      const res = await request(app).put('/addTag/t')
        .set('x-test-user', u(ADMIN)).send({ uids: ['st001', 'st002', 'st003'] });
      expect(res.status).toBe(200);
      expect(mockAddTag).toHaveBeenCalledTimes(3);
      expect(mockSendWs).toHaveBeenCalledTimes(3);
    }, 10000);

    test('no WebSocket when result.id is falsy', async () => {
      mockAddTag.mockResolvedValueOnce({});
      const res = await request(app).put('/addTag/t')
        .set('x-test-user', u(ADMIN)).send({ uids: ['st001'] });
      expect(res.status).toBe(200);
      expect(mockSendWs).not.toHaveBeenCalled();
    });

    test('empty uids returns OK immediately', async () => {
      const res = await request(app).put('/addTag/t')
        .set('x-test-user', u(ADMIN)).send({ uids: [] });
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
      expect(mockAddTag).not.toHaveBeenCalled();
    });

    test('addTag error returns 500', async () => {
      mockAddTag.mockRejectedValueOnce(new Error('addTag fail'));
      const res = await request(app).put('/addTag/t')
        .set('x-test-user', u(ADMIN)).send({ uids: ['st001'] });
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // PUT /delTag/:tag — delete tag from multiple items
  // ---------------------------------------------------------------
  describe('PUT /delTag/:tag', () => {
    test('single uid: delTag called, WebSocket sent, returns apiOK', async () => {
      mockDelTag.mockResolvedValueOnce({ id: 'st001' });
      const res = await request(app).put('/delTag/oldtag')
        .set('x-test-user', u(ADMIN)).send({ uids: ['st001'] });
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
      expect(mockDelTag).toHaveBeenCalledWith('st001', 'oldtag', expect.anything(), false);
      expect(mockSendWs).toHaveBeenCalledWith({ type: 'stock', data: 'st001' });
    });

    test('multiple uids processed recursively', async () => {
      mockDelTag.mockResolvedValueOnce({ id: 'a' });
      mockDelTag.mockResolvedValueOnce({ id: 'b' });
      const res = await request(app).put('/delTag/t')
        .set('x-test-user', u(ADMIN)).send({ uids: ['a', 'b'] });
      expect(res.status).toBe(200);
      expect(mockDelTag).toHaveBeenCalledTimes(2);
    }, 10000);

    test('empty uids returns OK', async () => {
      const res = await request(app).put('/delTag/t')
        .set('x-test-user', u(ADMIN)).send({ uids: [] });
      expect(res.status).toBe(200);
      expect(mockDelTag).not.toHaveBeenCalled();
    });

    test('delTag error returns 500', async () => {
      mockDelTag.mockRejectedValueOnce(new Error('delTag fail'));
      const res = await request(app).put('/delTag/t')
        .set('x-test-user', u(ADMIN)).send({ uids: ['st001'] });
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // GET /querySimple/:uid — validates uid via isValidString
  // ---------------------------------------------------------------
  describe('GET /querySimple/:uid', () => {
    test('valid uid returns StockTool result directly', async () => {
      mockGetSingleStockV2.mockResolvedValueOnce({ name: 'TSMC', price: 650 });
      const res = await request(app).get(`/querySimple/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ name: 'TSMC', price: 650 });
      expect(mockGetSingleStockV2).toHaveBeenCalledWith(VALID_UID, expect.anything());
    });

    test('invalid uid returns 400 with typo error message', async () => {
      const res = await request(app).get('/querySimple/baduid').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toContain('uid is not vaild');
    });

    test('getSingleStockV2 error returns 500', async () => {
      mockGetSingleStockV2.mockRejectedValueOnce(new Error('stock fail'));
      const res = await request(app).get(`/querySimple/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // GET /getPER/:uid — PER data + setLatest fire-and-forget
  // ---------------------------------------------------------------
  describe('GET /getPER/:uid', () => {
    test('returns formatted PER string from 5-element array', async () => {
      mockGetStockPERV2.mockResolvedValueOnce(['12.5', '3.2', '1.8', 'TWSE:2330', '2023-01-01']);
      mockSetLatest.mockResolvedValueOnce({});
      const res = await request(app).get(`/getPER/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.per).toBe('TWSE:2330: 12.5 3.2 1.8 2023-01-01');
    });

    test('calls getStockPERV2 with only id (no session)', async () => {
      mockGetStockPERV2.mockResolvedValueOnce(['a', 'b', 'c', 'idx', 'start']);
      mockSetLatest.mockResolvedValueOnce({});
      await request(app).get(`/getPER/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(mockGetStockPERV2).toHaveBeenCalledWith(VALID_UID);
    });

    test('setLatest is called as side effect with id and session', async () => {
      mockGetStockPERV2.mockResolvedValueOnce(['a', 'b', 'c', 'idx', 's']);
      mockSetLatest.mockResolvedValueOnce({});
      await request(app).get(`/getPER/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(mockSetLatest).toHaveBeenCalledWith(VALID_UID, expect.anything());
    });

    test('setLatest failure does NOT prevent PER response (fire-and-forget)', async () => {
      mockGetStockPERV2.mockResolvedValueOnce(['a', 'b', 'c', 'idx', 's']);
      mockSetLatest.mockRejectedValueOnce(new Error('setLatest fail'));
      const res = await request(app).get(`/getPER/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.per).toBeDefined();
    });

    test('invalid uid returns 400', async () => {
      const res = await request(app).get('/getPER/baduid').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toContain('uid is not vaild');
    });

    test('getStockPERV2 error returns 500', async () => {
      mockGetStockPERV2.mockRejectedValueOnce(new Error('PER fail'));
      const res = await request(app).get(`/getPER/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });

    test('undefined elements in result produce "undefined" in string', async () => {
      mockGetStockPERV2.mockResolvedValueOnce([undefined, null, '', 'idx', 'start']);
      mockSetLatest.mockResolvedValueOnce({});
      const res = await request(app).get(`/getPER/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.body.per).toContain('idx:');
    });
  });

  // ---------------------------------------------------------------
  // GET /getInterval/:uid — interval analysis
  // ---------------------------------------------------------------
  describe('GET /getInterval/:uid', () => {
    test('returns formatted interval string from 2-element array', async () => {
      mockGetIntervalWarp.mockResolvedValueOnce(['75%', 'TWSE:2330']);
      const res = await request(app).get(`/getInterval/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.interval).toBe('TWSE:2330: 75%');
    });

    test('passes id AND session to getIntervalWarp', async () => {
      mockGetIntervalWarp.mockResolvedValueOnce(['x', 'y']);
      await request(app).get(`/getInterval/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(mockGetIntervalWarp).toHaveBeenCalledWith(VALID_UID, expect.anything());
    });

    test('invalid uid returns 400', async () => {
      const res = await request(app).get('/getInterval/bad').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('getIntervalWarp error returns 500', async () => {
      mockGetIntervalWarp.mockRejectedValueOnce(new Error('interval fail'));
      const res = await request(app).get(`/getInterval/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });

    test('no setLatest side effect (unlike getPER)', async () => {
      mockGetIntervalWarp.mockResolvedValueOnce(['x', 'y']);
      await request(app).get(`/getInterval/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(mockSetLatest).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // GET /getTotal — portfolio total
  // ---------------------------------------------------------------
  describe('GET /getTotal', () => {
    test('returns StockTool result directly', async () => {
      mockGetStockTotal.mockResolvedValueOnce({ total: 1000000, profit: 5.2 });
      const res = await request(app).get('/getTotal').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ total: 1000000, profit: 5.2 });
    });

    test('passes only user to getStockTotal (no session, no body)', async () => {
      mockGetStockTotal.mockResolvedValueOnce({});
      await request(app).get('/getTotal').set('x-test-user', u(ADMIN));
      expect(mockGetStockTotal).toHaveBeenCalledWith(expect.objectContaining({ username: 'admin' }));
    });

    test('getStockTotal error returns 500', async () => {
      mockGetStockTotal.mockRejectedValueOnce(new Error('total fail'));
      const res = await request(app).get('/getTotal').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // PUT /updateTotal/:real? — update portfolio total
  // ---------------------------------------------------------------
  describe('PUT /updateTotal/:real?', () => {
    test('real=1 passes true as third arg', async () => {
      mockUpdateStockTotal.mockResolvedValueOnce({ updated: true });
      const res = await request(app).put('/updateTotal/1')
        .set('x-test-user', u(ADMIN)).send({ info: { stocks: ['TSMC'] } });
      expect(res.status).toBe(200);
      expect(mockUpdateStockTotal).toHaveBeenCalledWith(
        expect.anything(), { stocks: ['TSMC'] }, true
      );
    });

    test('real=0 passes false as third arg', async () => {
      mockUpdateStockTotal.mockResolvedValueOnce({});
      await request(app).put('/updateTotal/0')
        .set('x-test-user', u(ADMIN)).send({ info: {} });
      expect(mockUpdateStockTotal.mock.calls[0][2]).toBe(false);
    });

    test('real omitted passes false (undefined !== "1")', async () => {
      mockUpdateStockTotal.mockResolvedValueOnce({});
      await request(app).put('/updateTotal')
        .set('x-test-user', u(ADMIN)).send({ info: {} });
      expect(mockUpdateStockTotal.mock.calls[0][2]).toBe(false);
    });

    test('invalid real value (e.g., "2") returns 404 (regex mismatch)', async () => {
      const res = await request(app).put('/updateTotal/2')
        .set('x-test-user', u(ADMIN)).send({ info: {} });
      expect(res.status).toBe(404);
    });

    test('invalid real value "true" returns 404', async () => {
      const res = await request(app).put('/updateTotal/true')
        .set('x-test-user', u(ADMIN)).send({ info: {} });
      expect(res.status).toBe(404);
    });

    test('body.info passed directly to updateStockTotal', async () => {
      const info = { portfolio: [{ id: 1, shares: 100 }] };
      mockUpdateStockTotal.mockResolvedValueOnce({ ok: 1 });
      await request(app).put('/updateTotal/1')
        .set('x-test-user', u(ADMIN)).send({ info });
      expect(mockUpdateStockTotal.mock.calls[0][1]).toEqual(info);
    });

    test('updateStockTotal error returns 500', async () => {
      mockUpdateStockTotal.mockRejectedValueOnce(new Error('update fail'));
      const res = await request(app).put('/updateTotal/1')
        .set('x-test-user', u(ADMIN)).send({ info: {} });
      expect(res.status).toBe(500);
    });

    test('returns result as-is from StockTool', async () => {
      mockUpdateStockTotal.mockResolvedValueOnce({ updated: true, count: 5 });
      const res = await request(app).put('/updateTotal/1')
        .set('x-test-user', u(ADMIN)).send({ info: {} });
      expect(res.body).toEqual({ updated: true, count: 5 });
    });
  });
});
