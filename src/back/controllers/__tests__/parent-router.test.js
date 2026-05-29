/**
 * parent-router.test.js — Comprehensive tests for src/back/controllers/parent-router.js
 *
 * 25 routes (5 collections × 5 endpoints each, all require auth):
 *   For each of STORAGE, PASSWORD, STOCK:
 *     GET  /{db}/list       — parent category list (storage has admin adultonlyParentList)
 *     GET  /{db}/taglist/:name/:sortName/:sortType/:page — tag listing
 *     GET  /{db}/query/:id/:sortName/:sortType/:single?  — parent tag query
 *     POST /{db}/add        — add parent tag
 *     DELETE /{db}/del/:id  — delete parent tag
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
  PASSWORD_SALT: 'test_salt_',
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
  USERDB: 'user', STORAGEDB: 'storage',
  UNACTIVE_DAY: 5, UNACTIVE_HIT: 10,
  RE_WEBURL: /^https?:\/\//, STATIC_PATH: '/p', RELEASE: 'release', DEV: 'dev',
  STOCKDB: 'stock', PASSWORDDB: 'password',
  DEFAULT_TAGS: [], STORAGE_PARENT: [], PASSWORD_PARENT: [], STOCK_PARENT: [], HANDLE_TIME: 7200,
  RELATIVE_LIMIT: 100,
  RELATIVE_UNION: 2, RELATIVE_INTER: 3,
  GENRE_LIST: [], GENRE_LIST_CH: [],
  BOOKMARK_LIMIT: 100, ADULTONLY_PARENT: [],
  GAME_LIST: [], GAME_LIST_CH: [],
  MEDIA_LIST: [], MEDIA_LIST_CH: [],
  DM5_ORI_LIST: [], DM5_CH_LIST: [],
  DM5_LIST: [], DM5_AREA_LIST: [], DM5_TAG_LIST: [],
  QUERY_LIMIT: 20, ADULT_LIST: [], MUSIC_LIST: [], BITFINEX: '',
}));

jest.unstable_mockModule('../../models/mongo-tool.js', () => ({
  default: jest.fn(),
  objectID: jest.fn((id) => id),
}));

// TagTool methods for parent-router
const mockParentList = jest.fn(() => []);
const mockAdultonlyParentList = jest.fn(() => []);
const mockParentQuery = jest.fn();
const mockQueryParentTag = jest.fn();
const mockAddParent = jest.fn();
const mockDelParent = jest.fn();

jest.unstable_mockModule('../../models/tag-tool.js', () => ({
  default: jest.fn(() => ({
    parentList: mockParentList,
    adultonlyParentList: mockAdultonlyParentList,
    parentQuery: mockParentQuery,
    queryParentTag: mockQueryParentTag,
    addParent: mockAddParent,
    delParent: mockDelParent,
  })),
  isDefaultTag: jest.fn(() => false),
  normalize: jest.fn((s) => s),
}));

// =====================================================================
// IMPORTS
// =====================================================================
const { default: Express } = await import('express');
const { default: request } = await import('supertest');
const { default: ParentRouter } = await import('../parent-router.js');

// =====================================================================
// HELPERS
// =====================================================================
const ADMIN = { _id: 'aabbccddeeff001122334455', username: 'admin', perm: 1 };
const CADMIN = { _id: 'aabbccddeeff001122334488', username: 'cadmin', perm: 2 };
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
  app.use('/', ParentRouter);
  app.use((err, req, res, next) => {
    err.name === 'HoError'
      ? res.status(err.code || 400).send(err.message.toString())
      : res.status(500).send('server error occur');
  });
  return app;
}

const u = (user) => JSON.stringify(user);

const sampleStorageItem = (ov = {}) => ({
  _id: 'si001', name: 'File', tags: ['video'], recycle: 0,
  adultonly: 0, first: 0, status: 3, utime: 99, count: 1, owner: ADMIN._id, ...ov,
});

// =====================================================================
// TESTS
// =====================================================================
describe('parent-router.js', () => {
  let app;
  beforeEach(() => {
    app = buildApp();
    mockParentList.mockReset();
    mockAdultonlyParentList.mockReset();
    mockParentQuery.mockReset();
    mockQueryParentTag.mockReset();
    mockAddParent.mockReset();
    mockDelParent.mockReset();
    mockParentList.mockReturnValue([]);
    mockAdultonlyParentList.mockReturnValue([]);
  });

  // ---------------------------------------------------------------
  // Auth guard
  // ---------------------------------------------------------------
  describe('Auth guard', () => {
    test('unauthenticated GET /storage/list returns 401', async () => {
      const res = await request(app).get('/storage/list');
      expect(res.status).toBe(401);
    });
    test('unauthenticated GET /password/list returns 401', async () => {
      const res = await request(app).get('/password/list');
      expect(res.status).toBe(401);
    });
    test('unauthenticated POST /storage/add returns 401', async () => {
      const res = await request(app).post('/storage/add');
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------
  // STORAGE parents
  // ---------------------------------------------------------------
  describe('STORAGE parents', () => {
    // list
    test('GET /storage/list: admin (perm≤2) gets parentList + adultonlyParentList', async () => {
      mockParentList.mockReturnValueOnce([{ name: 'video', tw: '影片' }]);
      mockAdultonlyParentList.mockReturnValueOnce([{ name: 'adult', tw: '成人' }]);
      const res = await request(app).get('/storage/list').set('x-test-user', u(CADMIN));
      expect(res.status).toBe(200);
      expect(res.body.parentList).toHaveLength(2);
      expect(res.body.parentList[0]).toEqual({ name: 'video', show: '影片' });
      expect(res.body.parentList[1]).toEqual({ name: 'adult', show: '成人' });
    });

    test('GET /storage/list: non-admin gets parentList only (no adult)', async () => {
      mockParentList.mockReturnValueOnce([{ name: 'video', tw: '影片' }]);
      // adultonlyParentList is NOT called for non-admin — don't mock it
      const res = await request(app).get('/storage/list').set('x-test-user', u(REGULAR));
      expect(res.body.parentList).toHaveLength(1);
      expect(res.body.parentList[0].name).toBe('video');
      expect(mockAdultonlyParentList).not.toHaveBeenCalled();
    });

    test('GET /storage/list: owner (perm=1) gets adult list too', async () => {
      mockParentList.mockReturnValueOnce([{ name: 'a', tw: 'A' }]);
      mockAdultonlyParentList.mockReturnValueOnce([{ name: 'x', tw: 'X' }]);
      const res = await request(app).get('/storage/list').set('x-test-user', u(ADMIN));
      expect(res.body.parentList).toHaveLength(2);
    });

    test('GET /storage/list: empty lists', async () => {
      const res = await request(app).get('/storage/list').set('x-test-user', u(ADMIN));
      expect(res.body.parentList).toEqual([]);
    });

    // taglist
    test('GET /storage/taglist returns parentQuery result', async () => {
      mockParentQuery.mockResolvedValueOnce({ items: [], total: 0 });
      const res = await request(app).get('/storage/taglist/video/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockParentQuery).toHaveBeenCalledWith('video', 'name', 'desc', 0, expect.anything());
    });

    test('GET /storage/taglist page=5 passes Number(5)', async () => {
      mockParentQuery.mockResolvedValueOnce({ items: [] });
      await request(app).get('/storage/taglist/tag/mtime/asc/5').set('x-test-user', u(ADMIN));
      expect(mockParentQuery.mock.calls[0][3]).toBe(5);
    });

    test('GET /storage/taglist invalid sortName returns 404', async () => {
      const res = await request(app).get('/storage/taglist/tag/bad/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(404);
    });

    test('GET /storage/taglist error returns 500', async () => {
      mockParentQuery.mockRejectedValueOnce(new Error('fail'));
      const res = await request(app).get('/storage/taglist/tag/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });

    // query
    test('GET /storage/query returns itemList with mediaHadle', async () => {
      mockQueryParentTag.mockResolvedValueOnce({
        items: [sampleStorageItem()], parentList: ['p'], latest: 'l',
        bookmark: 'bk', mediaHadle: 0,
      });
      const res = await request(app).get('/storage/query/pid1/name/desc').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('itemList');
      expect(res.body).toHaveProperty('bookmarkID');
    });

    test('GET /storage/query with :single param', async () => {
      mockQueryParentTag.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      await request(app).get('/storage/query/pid1/count/asc/single').set('x-test-user', u(ADMIN));
      expect(mockQueryParentTag).toHaveBeenCalledWith('pid1', 'single', 'count', 'asc', expect.anything(), expect.anything());
    });

    test('GET /storage/query without :single param', async () => {
      mockQueryParentTag.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      await request(app).get('/storage/query/pid1/name/desc').set('x-test-user', u(ADMIN));
      expect(mockQueryParentTag.mock.calls[0][1]).toBeUndefined();
    });

    test('GET /storage/query error returns 500', async () => {
      mockQueryParentTag.mockRejectedValueOnce(new Error('fail'));
      const res = await request(app).get('/storage/query/pid1/name/desc').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });

    // add
    test('POST /storage/add passes name+tag to addParent', async () => {
      mockAddParent.mockResolvedValueOnce({ apiOK: true });
      const res = await request(app).post('/storage/add')
        .set('x-test-user', u(ADMIN)).send({ name: 'NewCat', tag: 'newtag' });
      expect(res.status).toBe(200);
      expect(mockAddParent).toHaveBeenCalledWith('NewCat', 'newtag', expect.anything());
    });

    test('POST /storage/add error returns 500', async () => {
      mockAddParent.mockRejectedValueOnce(new Error('fail'));
      const res = await request(app).post('/storage/add')
        .set('x-test-user', u(ADMIN)).send({ name: 'x', tag: 'y' });
      expect(res.status).toBe(500);
    });

    // del
    test('DELETE /storage/del/:id passes id+user to delParent', async () => {
      mockDelParent.mockResolvedValueOnce({ apiOK: true });
      const res = await request(app).delete('/storage/del/pid1').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockDelParent).toHaveBeenCalledWith('pid1', expect.anything());
    });

    test('DELETE /storage/del error returns 500', async () => {
      mockDelParent.mockRejectedValueOnce(new Error('fail'));
      const res = await request(app).delete('/storage/del/pid1').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // PASSWORD parents
  // ---------------------------------------------------------------
  describe('PASSWORD parents', () => {
    test('GET /password/list: no adultonlyParentList (even for admin)', async () => {
      mockParentList.mockReturnValueOnce([{ name: 'web', tw: '網路' }]);
      const res = await request(app).get('/password/list').set('x-test-user', u(ADMIN));
      expect(res.body.parentList).toHaveLength(1);
      expect(res.body.parentList[0]).toEqual({ name: 'web', show: '網路' });
    });

    test('GET /password/taglist works', async () => {
      mockParentQuery.mockResolvedValueOnce({ items: [] });
      const res = await request(app).get('/password/taglist/tag/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
    });

    test('GET /password/query returns password items', async () => {
      mockQueryParentTag.mockResolvedValueOnce({
        items: [{ _id: 'p1', name: 'Svc', tags: [], username: 'u', url: '', email: '', utime: 1, important: 0 }],
        parentList: [], latest: null, bookmark: null,
      });
      const res = await request(app).get('/password/query/pid1/name/desc').set('x-test-user', u(ADMIN));
      expect(res.body.itemList).toHaveLength(1);
    });

    test('POST /password/add works', async () => {
      mockAddParent.mockResolvedValueOnce({ ok: 1 });
      const res = await request(app).post('/password/add')
        .set('x-test-user', u(ADMIN)).send({ name: 'n', tag: 't' });
      expect(res.status).toBe(200);
    });

    test('DELETE /password/del works', async () => {
      mockDelParent.mockResolvedValueOnce({ ok: 1 });
      const res = await request(app).delete('/password/del/p1').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------
  // STOCK parents
  // ---------------------------------------------------------------
  describe('STOCK parents', () => {
    test('GET /stock/list returns mapped parentList', async () => {
      mockParentList.mockReturnValueOnce([{ name: 'tech', tw: '科技' }]);
      const res = await request(app).get('/stock/list').set('x-test-user', u(ADMIN));
      expect(res.body.parentList[0]).toEqual({ name: 'tech', show: '科技' });
    });

    test('GET /stock/query: admin gets stock items, non-admin gets empty', async () => {
      mockQueryParentTag.mockResolvedValueOnce({
        items: [{ _id: 's1', name: 'TSMC', tags: [], per: 10, pdr: 2, pbr: 1, index: 'TW', type: 'stock', important: 0 }],
        parentList: [], latest: null, bookmark: null,
      });
      const res = await request(app).get('/stock/query/pid1/name/desc').set('x-test-user', u(REGULAR));
      expect(res.body.itemList).toEqual([]); // non-admin → getStockItem returns []
    });

    test('POST /stock/add works', async () => {
      mockAddParent.mockResolvedValueOnce({});
      const res = await request(app).post('/stock/add')
        .set('x-test-user', u(ADMIN)).send({ name: 'n', tag: 't' });
      expect(res.status).toBe(200);
    });

    test('DELETE /stock/del works', async () => {
      mockDelParent.mockResolvedValueOnce({});
      const res = await request(app).delete('/stock/del/s1').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
    });
  });

  // ---------------------------------------------------------------
  // Error paths
  // ---------------------------------------------------------------
  describe('Error paths', () => {
    // Error path coverage — exercises catch(err => handleError(err, next)) lines
    test('GET /password/query rejects → next(err) → 500', async () => {
      mockQueryParentTag.mockRejectedValueOnce(new Error('boom'));
      const res = await request(app).get('/password/query/pid1/name/desc').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });
    test('GET /stock/query rejects → next(err) → 500', async () => {
      mockQueryParentTag.mockRejectedValueOnce(new Error('boom'));
      const res = await request(app).get('/stock/query/pid1/name/desc').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });
  });
});
