/**
 * password-router.test.js — Comprehensive tests for src/back/controllers/password-router.js
 *
 * Routes (all require auth via router.use checkLogin):
 *   GET  /get/:sortName/:sortType/:page/:name?/:exactly?/:index?  — paginated password query
 *   GET  /getSingle/...  — single query with resetArray on page=0+name
 *   GET  /reset/:sortName/:sortType — reset tag search
 *   GET  /single/:uid — single password item
 *   POST /getOptionTag — relative tag suggestions
 *   PUT  /addTag/:tag — add tag to multiple items (recursive + WebSocket)
 *   PUT  /delTag/:tag — delete tag from multiple items (recursive + WebSocket)
 *   POST /newRow — create new password entry
 *   PUT  /editRow/:uid — edit password entry
 *   PUT  /delRow/:uid — delete password entry
 *   PUT  /getPW/:uid/:type? — retrieve decrypted password
 *   GET  /generate/:type — generate random password
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// =====================================================================
// MOCK SETUP — must be before any await import()
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
  RE_WEBURL: /^https?:\/\//, STATIC_PATH: '/p', RELEASE: 'release', DEV: 'dev',
  STOCKDB: 'stock', PASSWORDDB: 'password', FITNESSDB: 'fitness', RANKDB: 'rank',
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

// Build controllable mock methods for PasswordTagTool
const mockTagQuery = jest.fn();
const mockSingleQuery = jest.fn();
const mockResetQuery = jest.fn();
const mockGetRelativeTag = jest.fn();
const mockAddTag = jest.fn();
const mockDelTag = jest.fn();
const mockResetArray = jest.fn();
const mockSearchTags = jest.fn(() => ({ resetArray: mockResetArray }));

jest.unstable_mockModule('../../models/tag-tool.js', () => ({
  default: jest.fn(() => ({
    tagQuery: mockTagQuery,
    singleQuery: mockSingleQuery,
    resetQuery: mockResetQuery,
    getRelativeTag: mockGetRelativeTag,
    addTag: mockAddTag,
    delTag: mockDelTag,
    searchTags: mockSearchTags,
  })),
  isDefaultTag: jest.fn(() => false),
  normalize: jest.fn((s) => s),
}));

const mockNewRow = jest.fn();
const mockEditRow = jest.fn();
const mockDelRow = jest.fn();
const mockGetPassword = jest.fn();
const mockGeneratePW = jest.fn();

jest.unstable_mockModule('../../models/password-tool.js', () => ({
  default: {
    newRow: mockNewRow,
    editRow: mockEditRow,
    delRow: mockDelRow,
    getPassword: mockGetPassword,
    generatePW: mockGeneratePW,
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
const { default: PasswordRouter } = await import('../password-router.js');

// =====================================================================
// HELPERS
// =====================================================================
const ADMIN = { _id: 'aabbccddeeff001122334455', username: 'admin', perm: 1 };
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
  app.use('/', PasswordRouter);
  app.use((err, req, res, next) => {
    err.name === 'HoError'
      ? res.status(err.code || 400).send(err.message.toString())
      : res.status(500).send('server error occur');
  });
  return app;
}

const u = (user) => JSON.stringify(user);

const sampleItem = (overrides = {}) => ({
  _id: 'pw001', name: 'MyService', tags: ['web'], username: 'admin',
  url: 'https://example.com', email: 'a@b.c', utime: 12345, important: 0,
  ...overrides,
});

// =====================================================================
// TESTS
// =====================================================================
describe('password-router.js', () => {
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

    test('unauthenticated POST /newRow returns 401', async () => {
      const res = await request(app).post('/newRow');
      expect(res.status).toBe(401);
    });

    test('unauthenticated GET /verify returns 401', async () => {
      const res = await request(app).get('/generate/1');
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------
  // GET /get — paginated password query
  // ---------------------------------------------------------------
  describe('GET /get/:sortName/:sortType/:page — password query', () => {
    test('basic query returns itemList, parentList, latest, bookmarkID', async () => {
      const items = [sampleItem()];
      mockTagQuery.mockResolvedValueOnce({
        items, parentList: ['web'], latest: 'pw001', bookmark: 'bk123',
      });
      const res = await request(app).get('/get/name/desc/0')
        .set('x-test-user', u(REGULAR));
      expect(res.status).toBe(200);
      expect(res.body.itemList).toHaveLength(1);
      expect(res.body.itemList[0].name).toBe('MyService');
      expect(res.body.parentList).toEqual(['web']);
      expect(res.body.latest).toBe('pw001');
      expect(res.body.bookmarkID).toBe('bk123');
    });

    test('passes sortName, sortType, page correctly', async () => {
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null });
      await request(app).get('/get/mtime/asc/3')
        .set('x-test-user', u(REGULAR));
      expect(mockTagQuery).toHaveBeenCalledWith(3, undefined, false, NaN, 'mtime', 'asc', expect.anything(), expect.anything());
    });

    test('passes name, exactly, index params', async () => {
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null });
      await request(app).get('/get/name/desc/0/myTag/true/2')
        .set('x-test-user', u(REGULAR));
      expect(mockTagQuery).toHaveBeenCalledWith(0, 'myTag', true, 2, 'name', 'desc', expect.anything(), expect.anything());
    });

    test('important item has "important" pushed to tags', async () => {
      mockTagQuery.mockResolvedValueOnce({
        items: [sampleItem({ important: 1, tags: ['web'] })],
        parentList: [], latest: null, bookmark: null,
      });
      const res = await request(app).get('/get/name/desc/0')
        .set('x-test-user', u(REGULAR));
      expect(res.body.itemList[0].tags).toContain('important');
      expect(res.body.itemList[0].important).toBe(true);
    });

    test('non-important item has important=false', async () => {
      mockTagQuery.mockResolvedValueOnce({
        items: [sampleItem({ important: 0 })],
        parentList: [], latest: null, bookmark: null,
      });
      const res = await request(app).get('/get/name/desc/0')
        .set('x-test-user', u(REGULAR));
      expect(res.body.itemList[0].important).toBe(false);
    });

    test('invalid sortName returns 404 (param regex mismatch)', async () => {
      const res = await request(app).get('/get/invalid/desc/0')
        .set('x-test-user', u(REGULAR));
      expect(res.status).toBe(404);
    });

    test('invalid sortType returns 404', async () => {
      const res = await request(app).get('/get/name/invalid/0')
        .set('x-test-user', u(REGULAR));
      expect(res.status).toBe(404);
    });

    test('tagQuery error returns 500', async () => {
      mockTagQuery.mockRejectedValueOnce(new Error('DB error'));
      const res = await request(app).get('/get/name/desc/0')
        .set('x-test-user', u(REGULAR));
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // GET /getSingle — single query with resetArray branch
  // ---------------------------------------------------------------
  describe('GET /getSingle — single query with reset', () => {
    test('page=0 with name calls resetArray then tagQuery', async () => {
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null });
      const res = await request(app).get('/getSingle/name/desc/0/searchTag')
        .set('x-test-user', u(REGULAR));
      expect(res.status).toBe(200);
      expect(mockSearchTags).toHaveBeenCalled();
      expect(mockResetArray).toHaveBeenCalled();
    });

    test('page=0 without name does NOT call resetArray', async () => {
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null });
      await request(app).get('/getSingle/name/desc/0')
        .set('x-test-user', u(REGULAR));
      expect(mockResetArray).not.toHaveBeenCalled();
    });

    test('page>0 with name does NOT call resetArray', async () => {
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null });
      await request(app).get('/getSingle/name/desc/2/searchTag')
        .set('x-test-user', u(REGULAR));
      expect(mockResetArray).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // GET /reset — reset tag search
  // ---------------------------------------------------------------
  describe('GET /reset/:sortName/:sortType', () => {
    test('returns itemList and parentList', async () => {
      mockResetQuery.mockResolvedValueOnce({ items: [sampleItem()], parentList: ['all'] });
      const res = await request(app).get('/reset/name/desc')
        .set('x-test-user', u(REGULAR));
      expect(res.status).toBe(200);
      expect(res.body.itemList).toHaveLength(1);
      expect(res.body.parentList).toEqual(['all']);
    });

    test('count sortName works', async () => {
      mockResetQuery.mockResolvedValueOnce({ items: [], parentList: [] });
      await request(app).get('/reset/count/asc')
        .set('x-test-user', u(REGULAR));
      expect(mockResetQuery).toHaveBeenCalledWith('count', 'asc', expect.anything(), expect.anything());
    });

    test('error returns 500', async () => {
      mockResetQuery.mockRejectedValueOnce(new Error('reset fail'));
      const res = await request(app).get('/reset/name/desc')
        .set('x-test-user', u(REGULAR));
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // GET /single/:uid
  // ---------------------------------------------------------------
  describe('GET /single/:uid', () => {
    test('returns item when found', async () => {
      mockSingleQuery.mockResolvedValueOnce({ empty: false, item: sampleItem() });
      const res = await request(app).get('/single/pw001')
        .set('x-test-user', u(REGULAR));
      expect(res.status).toBe(200);
      expect(res.body.item).toHaveLength(1);
      expect(res.body.item[0].name).toBe('MyService');
    });

    test('returns empty object when not found', async () => {
      mockSingleQuery.mockResolvedValueOnce({ empty: true });
      const res = await request(app).get('/single/pw999')
        .set('x-test-user', u(REGULAR));
      expect(res.status).toBe(200);
      expect(res.body.empty).toBe(true);
    });

    test('error returns 500', async () => {
      mockSingleQuery.mockRejectedValueOnce(new Error('single fail'));
      const res = await request(app).get('/single/pw001')
        .set('x-test-user', u(REGULAR));
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // POST /getOptionTag — relative tag suggestions
  // ---------------------------------------------------------------
  describe('POST /getOptionTag', () => {
    test('returns up to 5 relative tags', async () => {
      mockGetRelativeTag.mockResolvedValueOnce(['t1', 't2', 't3', 't4', 't5', 't6', 't7']);
      const res = await request(app).post('/getOptionTag')
        .set('x-test-user', u(REGULAR))
        .send({ tags: ['web'] });
      expect(res.status).toBe(200);
      expect(res.body.relative).toHaveLength(5);
      expect(res.body.relative).toEqual(['t1', 't2', 't3', 't4', 't5']);
    });

    test('returns fewer than 5 if available less', async () => {
      mockGetRelativeTag.mockResolvedValueOnce(['t1', 't2']);
      const res = await request(app).post('/getOptionTag')
        .set('x-test-user', u(REGULAR))
        .send({ tags: ['web'] });
      expect(res.body.relative).toEqual(['t1', 't2']);
    });

    test('empty tags array returns empty relative', async () => {
      const res = await request(app).post('/getOptionTag')
        .set('x-test-user', u(REGULAR))
        .send({ tags: [] });
      expect(res.status).toBe(200);
      expect(res.body.relative).toEqual([]);
      expect(mockGetRelativeTag).not.toHaveBeenCalled();
    });

    test('getRelativeTag error returns 500', async () => {
      mockGetRelativeTag.mockRejectedValueOnce(new Error('tag err'));
      const res = await request(app).post('/getOptionTag')
        .set('x-test-user', u(REGULAR))
        .send({ tags: ['web'] });
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // PUT /addTag/:tag — add tag to multiple items
  // ---------------------------------------------------------------
  describe('PUT /addTag/:tag', () => {
    test('adds tag to single uid, sends WebSocket', async () => {
      mockAddTag.mockResolvedValueOnce({ id: 'pw001' });
      const res = await request(app).put('/addTag/newtag')
        .set('x-test-user', u(REGULAR))
        .send({ uids: ['pw001'] });
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
      expect(mockAddTag).toHaveBeenCalledWith('pw001', 'newtag', expect.anything(), false);
      expect(mockSendWs).toHaveBeenCalledWith({ type: 'password', data: 'pw001' });
    });

    test('adds tag to multiple uids recursively', async () => {
      mockAddTag.mockResolvedValueOnce({ id: 'pw001' });
      mockAddTag.mockResolvedValueOnce({ id: 'pw002' });
      mockAddTag.mockResolvedValueOnce({ id: 'pw003' });
      const res = await request(app).put('/addTag/tag1')
        .set('x-test-user', u(REGULAR))
        .send({ uids: ['pw001', 'pw002', 'pw003'] });
      expect(res.status).toBe(200);
      expect(mockAddTag).toHaveBeenCalledTimes(3);
      expect(mockSendWs).toHaveBeenCalledTimes(3);
    }, 10000);

    test('no WebSocket sent when result.id is falsy', async () => {
      mockAddTag.mockResolvedValueOnce({});
      const res = await request(app).put('/addTag/tag1')
        .set('x-test-user', u(REGULAR))
        .send({ uids: ['pw001'] });
      expect(res.status).toBe(200);
      expect(mockSendWs).not.toHaveBeenCalled();
    });

    test('empty uids array returns OK immediately', async () => {
      const res = await request(app).put('/addTag/tag1')
        .set('x-test-user', u(REGULAR))
        .send({ uids: [] });
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
      expect(mockAddTag).not.toHaveBeenCalled();
    });

    test('addTag error returns 500', async () => {
      mockAddTag.mockRejectedValueOnce(new Error('addTag fail'));
      const res = await request(app).put('/addTag/tag1')
        .set('x-test-user', u(REGULAR))
        .send({ uids: ['pw001'] });
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // PUT /delTag/:tag — delete tag from multiple items
  // ---------------------------------------------------------------
  describe('PUT /delTag/:tag', () => {
    test('deletes tag from single uid, sends WebSocket', async () => {
      mockDelTag.mockResolvedValueOnce({ id: 'pw001' });
      const res = await request(app).put('/delTag/oldtag')
        .set('x-test-user', u(REGULAR))
        .send({ uids: ['pw001'] });
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
      expect(mockDelTag).toHaveBeenCalledWith('pw001', 'oldtag', expect.anything(), false);
      expect(mockSendWs).toHaveBeenCalledWith({ type: 'password', data: 'pw001' });
    });

    test('deletes tag from multiple uids recursively', async () => {
      mockDelTag.mockResolvedValueOnce({ id: 'pw001' });
      mockDelTag.mockResolvedValueOnce({ id: 'pw002' });
      const res = await request(app).put('/delTag/tag2')
        .set('x-test-user', u(REGULAR))
        .send({ uids: ['pw001', 'pw002'] });
      expect(res.status).toBe(200);
      expect(mockDelTag).toHaveBeenCalledTimes(2);
    }, 10000);

    test('empty uids returns OK', async () => {
      const res = await request(app).put('/delTag/tag1')
        .set('x-test-user', u(REGULAR))
        .send({ uids: [] });
      expect(res.status).toBe(200);
      expect(mockDelTag).not.toHaveBeenCalled();
    });

    test('delTag error returns 500', async () => {
      mockDelTag.mockRejectedValueOnce(new Error('delTag fail'));
      const res = await request(app).put('/delTag/tag1')
        .set('x-test-user', u(REGULAR))
        .send({ uids: ['pw001'] });
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // POST /newRow — create new password entry
  // ---------------------------------------------------------------
  describe('POST /newRow', () => {
    test('creates entry, sends WebSocket, returns id', async () => {
      mockNewRow.mockResolvedValueOnce({ id: 'newpw001' });
      const res = await request(app).post('/newRow')
        .set('x-test-user', u(REGULAR))
        .send({ name: 'Test', username: 'u', password: 'p' });
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('newpw001');
      expect(mockSendWs).toHaveBeenCalledWith({ type: 'password', data: 'newpw001' });
    });

    test('passes body and user to newRow', async () => {
      mockNewRow.mockResolvedValueOnce({ id: 'x' });
      const body = { name: 'Svc', username: 'admin', url: 'https://x.com' };
      await request(app).post('/newRow')
        .set('x-test-user', u(ADMIN))
        .send(body);
      expect(mockNewRow.mock.calls[0][0]).toMatchObject(body);
    });

    test('newRow error returns 500', async () => {
      mockNewRow.mockRejectedValueOnce(new Error('newRow fail'));
      const res = await request(app).post('/newRow')
        .set('x-test-user', u(REGULAR))
        .send({ name: 'Test' });
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // PUT /editRow/:uid — edit password entry
  // ---------------------------------------------------------------
  describe('PUT /editRow/:uid', () => {
    test('edits entry, sends WebSocket, returns apiOK', async () => {
      mockEditRow.mockResolvedValueOnce({});
      const res = await request(app).put('/editRow/pw001')
        .set('x-test-user', u(REGULAR))
        .send({ name: 'Updated' });
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
      expect(mockSendWs).toHaveBeenCalledWith({ type: 'password', data: 'pw001' });
    });

    test('passes uid, body, user, session', async () => {
      mockEditRow.mockResolvedValueOnce({});
      await request(app).put('/editRow/pw999')
        .set('x-test-user', u(ADMIN))
        .send({ name: 'Changed' });
      expect(mockEditRow).toHaveBeenCalledWith('pw999', expect.objectContaining({ name: 'Changed' }), expect.anything(), expect.anything());
    });

    test('editRow error returns 500', async () => {
      mockEditRow.mockRejectedValueOnce(new Error('editRow fail'));
      const res = await request(app).put('/editRow/pw001')
        .set('x-test-user', u(REGULAR))
        .send({ name: 'X' });
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // PUT /delRow/:uid — delete password entry
  // ---------------------------------------------------------------
  describe('PUT /delRow/:uid', () => {
    test('deletes entry, sends WebSocket, returns apiOK', async () => {
      mockDelRow.mockResolvedValueOnce({});
      const res = await request(app).put('/delRow/pw001')
        .set('x-test-user', u(REGULAR))
        .send({ userPW: 'Pass123' });
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
      expect(mockSendWs).toHaveBeenCalledWith({ type: 'password', data: 'pw001' });
    });

    test('passes uid, userPW, user to delRow', async () => {
      mockDelRow.mockResolvedValueOnce({});
      await request(app).put('/delRow/pw555')
        .set('x-test-user', u(ADMIN))
        .send({ userPW: 'MyPass1' });
      expect(mockDelRow).toHaveBeenCalledWith('pw555', 'MyPass1', expect.anything());
    });

    test('delRow error returns 500', async () => {
      mockDelRow.mockRejectedValueOnce(new Error('delRow fail'));
      const res = await request(app).put('/delRow/pw001')
        .set('x-test-user', u(REGULAR))
        .send({ userPW: 'x' });
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // PUT /getPW/:uid/:type? — retrieve decrypted password
  // ---------------------------------------------------------------
  describe('PUT /getPW/:uid/:type?', () => {
    test('returns decrypted password', async () => {
      mockGetPassword.mockResolvedValueOnce({ password: 'secret123' });
      const res = await request(app).put('/getPW/pw001')
        .set('x-test-user', u(REGULAR))
        .send({ userPW: 'Pass123' });
      expect(res.status).toBe(200);
      expect(res.body.password).toBe('secret123');
    });

    test('passes optional type parameter', async () => {
      mockGetPassword.mockResolvedValueOnce({ password: 'x' });
      await request(app).put('/getPW/pw001/2')
        .set('x-test-user', u(REGULAR))
        .send({ userPW: 'Pass123' });
      expect(mockGetPassword).toHaveBeenCalledWith('pw001', 'Pass123', expect.anything(), expect.anything(), '2');
    });

    test('without type parameter, type is undefined', async () => {
      mockGetPassword.mockResolvedValueOnce({ password: 'x' });
      await request(app).put('/getPW/pw001')
        .set('x-test-user', u(REGULAR))
        .send({ userPW: 'Pass123' });
      expect(mockGetPassword).toHaveBeenCalledWith('pw001', 'Pass123', expect.anything(), expect.anything(), undefined);
    });

    test('getPassword error returns 500', async () => {
      mockGetPassword.mockRejectedValueOnce(new Error('getPW fail'));
      const res = await request(app).put('/getPW/pw001')
        .set('x-test-user', u(REGULAR))
        .send({ userPW: 'x' });
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // GET /generate/:type — generate random password
  // ---------------------------------------------------------------
  describe('GET /generate/:type', () => {
    test('returns generated password for type 0', async () => {
      mockGeneratePW.mockReturnValueOnce('abc123XYZ!');
      const res = await request(app).get('/generate/0')
        .set('x-test-user', u(REGULAR));
      expect(res.status).toBe(200);
      expect(res.body.password).toBe('abc123XYZ!');
      expect(mockGeneratePW).toHaveBeenCalledWith(0);
    });

    test('type 1 works', async () => {
      mockGeneratePW.mockReturnValueOnce('pq92Mk!@');
      const res = await request(app).get('/generate/1')
        .set('x-test-user', u(REGULAR));
      expect(res.body.password).toBe('pq92Mk!@');
      expect(mockGeneratePW).toHaveBeenCalledWith(1);
    });

    test('invalid type (multi-digit) returns 404', async () => {
      const res = await request(app).get('/generate/12')
        .set('x-test-user', u(REGULAR));
      expect(res.status).toBe(404);
    });

    test('invalid type (letter) returns 404', async () => {
      const res = await request(app).get('/generate/abc')
        .set('x-test-user', u(REGULAR));
      expect(res.status).toBe(404);
    });
  });
});
