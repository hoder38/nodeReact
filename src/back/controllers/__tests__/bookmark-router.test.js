/**
 * bookmark-router.test.js — Comprehensive tests for src/back/controllers/bookmark-router.js
 *
 * 22 routes across 5 collection types (all require auth):
 *   STORAGE (6): getList, get, add (+ newBookmarkItem), del, set, subscript
 *   PASSWORD/STOCK (4 each): getList, get, add, del
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
  BILI_TYPE: [], BILI_INDEX: [], RELATIVE_LIMIT: 100,
  RELATIVE_UNION: 2, RELATIVE_INTER: 3,
  GENRE_LIST: [], GENRE_LIST_CH: ['動作', '冒險'],
  BOOKMARK_LIMIT: 100, ADULTONLY_PARENT: [],
  GAME_LIST: [], GAME_LIST_CH: [],
  MEDIA_LIST: [], MEDIA_LIST_CH: [],
  DM5_ORI_LIST: [], DM5_CH_LIST: [],
  DM5_LIST: [], DM5_AREA_LIST: [], DM5_TAG_LIST: [], KUBO_COUNTRY: [],
  QUERY_LIMIT: 20, ADULT_LIST: [], MUSIC_LIST: [], BITFINEX: '',
}));

const mockMongo = jest.fn();
const mockObjectID = jest.fn(() => 'newObjId');
jest.unstable_mockModule('../../models/mongo-tool.js', () => ({
  default: mockMongo,
  objectID: mockObjectID,
}));

// Each TagTool() call returns one of these — bookmark-router creates 5
const mockGetBookmarkList = jest.fn();
const mockGetBookmark = jest.fn();
const mockAddBookmark = jest.fn();
const mockDelBookmark = jest.fn();
const mockSetLatest = jest.fn();
const mockSetBookmark = jest.fn();
const mockGetRelativeTag = jest.fn();
const mockGetArray = jest.fn(() => ({ cur: ['tag1'], exactly: [true] }));
const mockSearchTags = jest.fn(() => ({ getArray: mockGetArray }));

jest.unstable_mockModule('../../models/tag-tool.js', () => ({
  default: jest.fn(() => ({
    getBookmarkList: mockGetBookmarkList,
    getBookmark: mockGetBookmark,
    addBookmark: mockAddBookmark,
    delBookmark: mockDelBookmark,
    setLatest: mockSetLatest,
    setBookmark: mockSetBookmark,
    getRelativeTag: mockGetRelativeTag,
    searchTags: mockSearchTags,
  })),
  isDefaultTag: jest.fn(() => false),
  normalize: jest.fn((s) => s),
}));

jest.unstable_mockModule('../../models/api-tool-google.js', () => ({
  default: jest.fn(),
}));

const mockSendWs = jest.fn();
jest.unstable_mockModule('../../util/sendWs.js', () => ({
  default: mockSendWs,
}));

jest.unstable_mockModule('../../util/mime.js', () => ({
  getOptionTag: jest.fn(() => []),
  addPost: jest.fn((s, p) => `${s}${p}`),
  isImage: jest.fn(() => false),
  isMusic: jest.fn(() => false),
  isVideo: jest.fn(() => false),
  isDoc: jest.fn(() => false),
  isZipbook: jest.fn(() => false),
}));

// =====================================================================
// IMPORTS
// =====================================================================
const { default: Express } = await import('express');
const { default: request } = await import('supertest');
const { default: BookmarkRouter } = await import('../bookmark-router.js');

// =====================================================================
// HELPERS
// =====================================================================
const ADMIN = { _id: 'aabbccddeeff001122334455', username: 'admin', perm: 1 };
const CADMIN = { _id: 'aabbccddeeff001122334488', username: 'cadmin', perm: 2 };
const REGULAR = { _id: 'aabbccddeeff001122334466', username: 'user1', perm: 3 };
const VALID_UID = 'aabbccddeeff001122334477';

function buildApp() {
  const app = Express();
  app.use(Express.json());
  app.use(Express.urlencoded({ extended: true }));
  app.use((req, res, next) => {
    if (req.headers['x-test-user']) {
      const u = JSON.parse(req.headers['x-test-user']);
      req.user = {
        ...u,
        _id: {
          toString: () => u._id,
          equals: (other) => u._id === (typeof other === 'object' && other.toString ? other.toString() : other),
        },
      };
      req.isAuthenticated = () => true;
    } else {
      req.isAuthenticated = () => false;
    }
    req.session = {};
    next();
  });
  app.use('/', BookmarkRouter);
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
const samplePasswordItem = (ov = {}) => ({
  _id: 'pw001', name: 'Svc', tags: ['web'], username: 'u', url: '', email: '',
  utime: 99, important: 0, ...ov,
});
const sampleStockItem = (ov = {}) => ({
  _id: 'sk001', name: 'TSMC', tags: ['tech'], per: 15, pdr: 3, pbr: 2,
  index: 'TWSE', type: 'stock', important: 0, ...ov,
});

// =====================================================================
// TESTS
// =====================================================================
describe('bookmark-router.js', () => {
  let app;
  beforeEach(() => {
    app = buildApp();
    jest.clearAllMocks();
    // Default for searchTags().getArray()
    mockGetArray.mockReturnValue({ cur: ['tag1'], exactly: [true] });
  });

  // ---------------------------------------------------------------
  // Auth guard
  // ---------------------------------------------------------------
  describe('Auth guard', () => {
    test('unauthenticated GET /storage/getList returns 401', async () => {
      const res = await request(app).get('/storage/getList/name/desc/0');
      expect(res.status).toBe(401);
    });
    test('unauthenticated POST /storage/add returns 401', async () => {
      const res = await request(app).post('/storage/add');
      expect(res.status).toBe(401);
    });
    test('unauthenticated GET /password/getList returns 401', async () => {
      const res = await request(app).get('/password/getList/name/desc/0');
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------
  // STORAGE bookmark routes
  // ---------------------------------------------------------------
  describe('STORAGE bookmarks', () => {
    // getList
    test('GET /storage/getList/name/desc/0 returns bookmarkList', async () => {
      mockGetBookmarkList.mockResolvedValueOnce({ bookmarkList: [{ id: 'b1', name: 'BM1' }] });
      const res = await request(app).get('/storage/getList/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.bookmarkList).toHaveLength(1);
    });

    test('GET /storage/getList/mtime/asc works', async () => {
      mockGetBookmarkList.mockResolvedValueOnce({ bookmarkList: [] });
      const res = await request(app).get('/storage/getList/mtime/asc').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
    });

    test('GET /storage/getList with page=5 returns 404 (page constrained to 0)', async () => {
      const res = await request(app).get('/storage/getList/name/desc/5').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(404);
    });

    test('GET /storage/getList with invalid sortName returns 404', async () => {
      const res = await request(app).get('/storage/getList/bad/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(404);
    });

    test('getBookmarkList error returns 500', async () => {
      mockGetBookmarkList.mockRejectedValueOnce(new Error('fail'));
      const res = await request(app).get('/storage/getList/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });

    // get
    test('GET /storage/get/:id returns itemList with mediaHadle', async () => {
      mockGetBookmark.mockResolvedValueOnce({
        items: [sampleStorageItem()], parentList: ['a'], latest: 'x',
        bookmark: 'bk', mediaHadle: 0,
      });
      const res = await request(app).get('/storage/get/bk1/name/desc').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('itemList');
      expect(res.body).toHaveProperty('parentList');
      expect(res.body).toHaveProperty('latest');
      expect(res.body).toHaveProperty('bookmarkID');
    });

    test('GET /storage/get with count sortName works', async () => {
      mockGetBookmark.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/storage/get/b1/count/asc').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
    });

    test('getBookmark error returns 500', async () => {
      mockGetBookmark.mockRejectedValueOnce(new Error('fail'));
      const res = await request(app).get('/storage/get/b1/name/desc').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });

    // add (complex — triggers newBookmarkItem)
    test('POST /storage/add with invalid name returns 400', async () => {
      const res = await request(app).post('/storage/add')
        .set('x-test-user', u(ADMIN)).send({ name: '' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('name is not vaild');
    });

    test('POST /storage/add with empty parent list returns 400', async () => {
      mockAddBookmark.mockResolvedValueOnce({ apiOK: true });
      mockGetArray.mockReturnValue({ cur: [], exactly: [] });
      const res = await request(app).post('/storage/add')
        .set('x-test-user', u(ADMIN)).send({ name: 'TestBM' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('empty parent list');
    });

    test('POST /storage/add: duplicate bookmark (count>0) returns result without bid', async () => {
      mockAddBookmark.mockResolvedValueOnce({ apiOK: true });
      mockGetArray.mockReturnValue({ cur: ['tag1'], exactly: [true] });
      mockMongo.mockResolvedValueOnce(1); // count > 0 → duplicate
      const res = await request(app).post('/storage/add')
        .set('x-test-user', u(ADMIN)).send({ name: 'TestBM' });
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
      expect(res.body.bid).toBeUndefined();
    });

    test('POST /storage/add: new bookmark creates item, sends WS, returns bid', async () => {
      mockAddBookmark.mockResolvedValueOnce({ apiOK: true });
      mockGetArray.mockReturnValue({ cur: ['tag1'], exactly: [true] });
      mockMongo.mockResolvedValueOnce(0); // count = 0 → new
      mockGetRelativeTag.mockResolvedValueOnce(['rel1']); // getChannel relative tags
      mockMongo.mockResolvedValueOnce([{ _id: 'newBid', adultonly: 0, first: 1 }]); // insert
      mockGetRelativeTag.mockResolvedValueOnce(['opt1']); // option relative tags
      const res = await request(app).post('/storage/add')
        .set('x-test-user', u(ADMIN)).send({ name: 'MyBookmark' });
      expect(res.status).toBe(200);
      expect(res.body.bid).toBe('newBid');
      expect(res.body.bname).toContain('Bookmark');
      expect(res.body.select).toBeDefined();
      expect(res.body.option).toBeDefined();
      expect(mockSendWs).toHaveBeenCalledWith({ type: 'file', data: 'newBid' }, 0);
    });

    test('POST /storage/add error returns 500', async () => {
      mockAddBookmark.mockRejectedValueOnce(new Error('fail'));
      const res = await request(app).post('/storage/add')
        .set('x-test-user', u(ADMIN)).send({ name: 'x' });
      expect(res.status).toBe(500);
    });

    // del
    test('DELETE /storage/del/:id returns id', async () => {
      mockDelBookmark.mockResolvedValueOnce({ id: 'bk1' });
      const res = await request(app).delete('/storage/del/bk1').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('bk1');
    });

    test('delBookmark error returns 500', async () => {
      mockDelBookmark.mockRejectedValueOnce(new Error('fail'));
      const res = await request(app).delete('/storage/del/bk1').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });

    // set
    test('GET /storage/set with invalid uid returns 400', async () => {
      const res = await request(app).get('/storage/set/bad/name/desc').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toContain('bookmark is not vaild');
    });

    test('GET /storage/set: item not found returns error', async () => {
      mockMongo.mockResolvedValueOnce([]);
      const res = await request(app).get(`/storage/set/${VALID_UID}/name/desc`).set('x-test-user', u(ADMIN));
      expect(res.status).not.toBe(200);
    });

    test('GET /storage/set: item without btag returns error', async () => {
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, status: 8, btag: null, bexactly: [true] }]);
      const res = await request(app).get(`/storage/set/${VALID_UID}/name/desc`).set('x-test-user', u(ADMIN));
      expect(res.status).not.toBe(200);
    });

    test('GET /storage/set: valid bookmark sets latest, increments count, returns items', async () => {
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, status: 8, btag: ['t1'], bexactly: [true] }]);
      mockSetLatest.mockResolvedValueOnce({});
      mockMongo.mockResolvedValueOnce({}); // update count
      mockSetBookmark.mockResolvedValueOnce({
        items: [sampleStorageItem()], parentList: ['p'], latest: 'l', mediaHadle: 0,
      });
      const res = await request(app).get(`/storage/set/${VALID_UID}/name/desc`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('itemList');
      expect(res.body).toHaveProperty('parentList');
      expect(res.body).toHaveProperty('latest');
    });

    test('GET /storage/set DB error returns 500', async () => {
      mockMongo.mockRejectedValueOnce(new Error('fail'));
      const res = await request(app).get(`/storage/set/${VALID_UID}/name/desc`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });

    // subscript
    test('POST /storage/subscript with empty path returns 400', async () => {
      const res = await request(app).post(`/storage/subscript/${VALID_UID}`)
        .set('x-test-user', u(ADMIN)).send({ path: [], exactly: [true], name: 'Sub' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('empty parent list');
    });

    test('POST /storage/subscript with empty exactly returns 400', async () => {
      const res = await request(app).post(`/storage/subscript/${VALID_UID}`)
        .set('x-test-user', u(ADMIN)).send({ path: ['t'], exactly: [], name: 'Sub' });
      expect(res.status).toBe(400);
    });

    test('POST /storage/subscript with invalid name returns 400', async () => {
      const res = await request(app).post(`/storage/subscript/${VALID_UID}`)
        .set('x-test-user', u(ADMIN)).send({ path: ['t'], exactly: [true], name: '' });
      expect(res.status).toBe(400);
    });

    test('POST /storage/subscript with invalid uid returns 400', async () => {
      const res = await request(app).post('/storage/subscript/bad')
        .set('x-test-user', u(ADMIN)).send({ path: ['t'], exactly: [true], name: 'Sub' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('uid is not vaild');
    });

    test('POST /storage/subscript with external id (kub_) validates as name', async () => {
      mockAddBookmark.mockResolvedValueOnce({ apiOK: true });
      mockMongo.mockResolvedValueOnce(1); // duplicate → skip newBookmarkItem creation
      mockSetLatest.mockResolvedValueOnce({});
      mockMongo.mockResolvedValueOnce({}); // count update
      const res = await request(app).post('/storage/subscript/kub_abc123')
        .set('x-test-user', u(ADMIN)).send({ path: ['tag1'], exactly: [true], name: 'KuboSub' });
      expect(res.status).toBe(200);
    });

    test('POST /storage/subscript with invalid path element returns 400', async () => {
      const res = await request(app).post(`/storage/subscript/${VALID_UID}`)
        .set('x-test-user', u(ADMIN)).send({ path: ['valid', 'a*b'], exactly: [true, false], name: 'Sub' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('path name is not vaild');
    });

    test('POST /storage/subscript success returns merged result', async () => {
      mockAddBookmark.mockResolvedValueOnce({ apiOK: true });
      mockMongo.mockResolvedValueOnce(0); // count=0 → new bookmark
      mockGetRelativeTag.mockResolvedValueOnce([]); // getChannel
      mockMongo.mockResolvedValueOnce([{ _id: 'subBid', adultonly: 0, first: 1 }]); // insert
      mockGetRelativeTag.mockResolvedValueOnce([]); // option
      mockSetLatest.mockResolvedValueOnce({});
      mockMongo.mockResolvedValueOnce({}); // count update
      const res = await request(app).post(`/storage/subscript/${VALID_UID}`)
        .set('x-test-user', u(ADMIN)).send({ path: ['tag1'], exactly: [true], name: 'MySub' });
      expect(res.status).toBe(200);
      expect(res.body.bid).toBe('subBid');
    });

    test('subscript error returns 500', async () => {
      mockAddBookmark.mockRejectedValueOnce(new Error('fail'));
      const res = await request(app).post(`/storage/subscript/${VALID_UID}`)
        .set('x-test-user', u(ADMIN)).send({ path: ['t'], exactly: [true], name: 'Sub' });
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // PASSWORD bookmarks (4 endpoints)
  // ---------------------------------------------------------------
  describe('PASSWORD bookmarks', () => {
    test('GET /password/getList returns bookmarkList', async () => {
      mockGetBookmarkList.mockResolvedValueOnce({ bookmarkList: [] });
      const res = await request(app).get('/password/getList/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.bookmarkList).toEqual([]);
    });

    test('GET /password/get returns itemList (password items)', async () => {
      mockGetBookmark.mockResolvedValueOnce({
        items: [samplePasswordItem()], parentList: ['w'], latest: 'l', bookmark: 'b',
      });
      const res = await request(app).get('/password/get/b1/name/desc').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.itemList[0].name).toBe('Svc');
      expect(res.body.bookmarkID).toBe('b');
    });

    test('POST /password/add with valid name returns result', async () => {
      mockAddBookmark.mockResolvedValueOnce({ apiOK: true });
      const res = await request(app).post('/password/add')
        .set('x-test-user', u(ADMIN)).send({ name: 'PwBM' });
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
    });

    test('POST /password/add with invalid name returns 400', async () => {
      const res = await request(app).post('/password/add')
        .set('x-test-user', u(ADMIN)).send({ name: '' });
      expect(res.status).toBe(400);
    });

    test('DELETE /password/del returns id', async () => {
      mockDelBookmark.mockResolvedValueOnce({ id: 'pb1' });
      const res = await request(app).delete('/password/del/pb1').set('x-test-user', u(ADMIN));
      expect(res.body.id).toBe('pb1');
    });
  });

  // ---------------------------------------------------------------
  // STOCK bookmarks
  // ---------------------------------------------------------------
  describe('STOCK bookmarks', () => {
    test('GET /stock/getList returns bookmarkList', async () => {
      mockGetBookmarkList.mockResolvedValueOnce({ bookmarkList: ['s1'] });
      const res = await request(app).get('/stock/getList/mtime/asc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
    });

    test('GET /stock/get returns itemList (stock items, admin only)', async () => {
      mockGetBookmark.mockResolvedValueOnce({
        items: [sampleStockItem()], parentList: [], latest: null, bookmark: null,
      });
      const res = await request(app).get('/stock/get/b1/name/desc').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.itemList).toHaveLength(1);
    });

    test('GET /stock/get for non-admin returns empty itemList', async () => {
      mockGetBookmark.mockResolvedValueOnce({
        items: [sampleStockItem()], parentList: [], latest: null, bookmark: null,
      });
      const res = await request(app).get('/stock/get/b1/name/desc').set('x-test-user', u(REGULAR));
      expect(res.body.itemList).toEqual([]);
    });

    test('POST /stock/add with valid name works', async () => {
      mockAddBookmark.mockResolvedValueOnce({ ok: 1 });
      const res = await request(app).post('/stock/add')
        .set('x-test-user', u(ADMIN)).send({ name: 'StBM' });
      expect(res.status).toBe(200);
    });

    test('DELETE /stock/del works', async () => {
      mockDelBookmark.mockResolvedValueOnce({ id: 'sb1' });
      const res = await request(app).delete('/stock/del/sb1').set('x-test-user', u(ADMIN));
      expect(res.body.id).toBe('sb1');
    });
  });

  // ---------------------------------------------------------------
});
