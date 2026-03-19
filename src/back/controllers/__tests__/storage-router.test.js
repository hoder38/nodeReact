/**
 * storage-router.test.js — Comprehensive tests for src/back/controllers/storage-router.js
 *
 * 18 active routes (all require auth via router.use checkLogin):
 *   GET  /reset/:sortName/:sortType
 *   GET  /get/:sortName/:sortType/:page/:name?/:exactly?/:index?
 *   GET  /getSingle/...  (resetArray on page=0+name)
 *   GET  /getRandom/:sortName/:sortType/:page  (weighted random via Redis)
 *   GET  /single/:uid
 *   GET  /external/get/:sortName/:pageToken?
 *   POST /getOptionTag  (pre-seeded, admin 18+, contextual genre lists)
 *   PUT  /addTag/:tag   (recursive + sendWs with adultonly)
 *   PUT  /delTag/:tag
 *   PUT  /sendTag/:uid
 *   PUT  /addTagUrl     (parse external URLs, double-recursive tag apply)
 *   PUT  /recover/:uid  (admin only, recycled items)
 *   POST /media/saveParent/:sortName/:sortType
 *   GET  /media/setTime/:id/:type/:obj?/:pageToken?/:back?
 *   GET  /media/record/:id/:time/:pId?
 *   GET  /media/more/:type/:page/:back?
 *   GET  /torrent/query/:id
 *   PUT  /zipPassword/:uid
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
  RE_WEBURL: /^https?:\/\//, STATIC_PATH: '/p', RELEASE: 'release', DEV: 'dev',
  STOCKDB: 'stock', PASSWORDDB: 'password', FITNESSDB: 'fitness', RANKDB: 'rank',
  DEFAULT_TAGS: [], STORAGE_PARENT: [], PASSWORD_PARENT: [], STOCK_PARENT: [],
  FITNESS_PARENT: [], RANK_PARENT: [], HANDLE_TIME: 7200,
  BILI_TYPE: [], BILI_INDEX: [], RELATIVE_LIMIT: 100,
  RELATIVE_UNION: 2, RELATIVE_INTER: 3,
  GENRE_LIST: [], GENRE_LIST_CH: ['動作', '冒險'],
  BOOKMARK_LIMIT: 100,
  ADULTONLY_PARENT: [],
  GAME_LIST: [], GAME_LIST_CH: ['休閒', '冒險'],
  MEDIA_LIST: [], MEDIA_LIST_CH: [],
  DM5_ORI_LIST: [], DM5_CH_LIST: [],
  DM5_LIST: [], DM5_AREA_LIST: [], DM5_TAG_LIST: [], KUBO_COUNTRY: [],
  QUERY_LIMIT: 20,
  ADULT_LIST: ['ol', '中出'],
  MUSIC_LIST: ['blues', 'classical'],
}));

const mockMongo = jest.fn();
const mockObjectID = jest.fn((id) => id);
jest.unstable_mockModule('../../models/mongo-tool.js', () => ({
  default: mockMongo,
  objectID: mockObjectID,
}));

const mockRedis = jest.fn();
jest.unstable_mockModule('../../models/redis-tool.js', () => ({
  default: mockRedis,
}));

// StorageTagTool mock methods
const mockTagQuery = jest.fn();
const mockSingleQuery = jest.fn();
const mockResetQuery = jest.fn();
const mockGetRelativeTag = jest.fn();
const mockAddTag = jest.fn();
const mockDelTag = jest.fn();
const mockResetArray = jest.fn();
const mockSetArray = jest.fn();
const mockGetArray = jest.fn(() => ({ cur: ['test'] }));
const mockSaveArray = jest.fn();
const mockSearchTags = jest.fn(() => ({
  resetArray: mockResetArray,
  setArray: mockSetArray,
  getArray: mockGetArray,
  saveArray: mockSaveArray,
}));
const mockSetLatest = jest.fn();
const mockSendTag = jest.fn();
const mockSaveSql = jest.fn();
const mockGetKuboQuery = jest.fn(() => 'kubo_query');
const mockGetYifyQuery = jest.fn(() => 'yify_query');
const mockGetMadQuery = jest.fn(() => 'mad_query');

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
    sendTag: mockSendTag,
    saveSql: mockSaveSql,
    getKuboQuery: mockGetKuboQuery,
    getYifyQuery: mockGetYifyQuery,
    getMadQuery: mockGetMadQuery,
  })),
  isDefaultTag: jest.fn(() => false),
  normalize: jest.fn((s) => s),
}));

const mockGetSingleList = jest.fn();
const mockParseTagUrl = jest.fn();
const mockGetSingleId = jest.fn();
jest.unstable_mockModule('../../models/external-tool.js', () => ({
  default: {
    getSingleList: mockGetSingleList,
    parseTagUrl: mockParseTagUrl,
    getSingleId: mockGetSingleId,
  },
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
const { default: StorageRouter } = await import('../storage-router.js');

// =====================================================================
// HELPERS
// =====================================================================
const ADMIN = { _id: 'aabbccddeeff001122334455', username: 'admin', perm: 1 };
const CONTENT_ADMIN = { _id: 'aabbccddeeff001122334488', username: 'cadmin', perm: 2 };
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
  app.use('/', StorageRouter);
  app.use((err, req, res, next) => {
    err.name === 'HoError'
      ? res.status(err.code || 400).send(err.message.toString())
      : res.status(500).send('server error occur');
  });
  return app;
}

const u = (user) => JSON.stringify(user);

const sampleStorageItem = (overrides = {}) => ({
  _id: 'si001', name: 'MyFile.mp4', tags: ['video'], recycle: 0,
  adultonly: 0, first: 0, status: 3, utime: 99999, count: 5,
  owner: ADMIN._id,
  ...overrides,
});

// =====================================================================
// TESTS
// =====================================================================
describe('storage-router.js', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // Auth guard
  // ---------------------------------------------------------------
  describe('Auth guard', () => {
    test('unauthenticated GET /reset returns 401', async () => {
      const res = await request(app).get('/reset/name/desc');
      expect(res.status).toBe(401);
    });

    test('unauthenticated GET /get returns 401', async () => {
      const res = await request(app).get('/get/name/desc/0');
      expect(res.status).toBe(401);
    });

    test('unauthenticated POST /getOptionTag returns 401', async () => {
      const res = await request(app).post('/getOptionTag');
      expect(res.status).toBe(401);
    });

    test('unauthenticated PUT /recover returns 401', async () => {
      const res = await request(app).put(`/recover/${VALID_UID}`);
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------
  // GET /reset
  // ---------------------------------------------------------------
  describe('GET /reset/:sortName/:sortType', () => {
    test('returns itemList and parentList', async () => {
      mockResetQuery.mockResolvedValueOnce({ items: [sampleStorageItem()], parentList: ['all'] });
      const res = await request(app).get('/reset/name/desc').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.itemList).toHaveLength(1);
      expect(res.body.parentList).toEqual(['all']);
      expect(res.body).not.toHaveProperty('latest');
    });

    test('invalid sortName returns 404', async () => {
      const res = await request(app).get('/reset/invalid/desc').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(404);
    });

    test('error returns 500', async () => {
      mockResetQuery.mockRejectedValueOnce(new Error('fail'));
      const res = await request(app).get('/reset/name/desc').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // GET /get — paginated tag-based search
  // ---------------------------------------------------------------
  describe('GET /get/:sortName/:sortType/:page', () => {
    test('returns itemList, parentList, latest, bookmarkID with mediaHadle', async () => {
      mockTagQuery.mockResolvedValueOnce({
        items: [sampleStorageItem()], parentList: ['v'], latest: 'si001',
        bookmark: 'bk1', mediaHadle: 0,
      });
      const res = await request(app).get('/get/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('itemList');
      expect(res.body).toHaveProperty('parentList');
      expect(res.body).toHaveProperty('latest');
      expect(res.body).toHaveProperty('bookmarkID');
    });

    test('passes all params correctly to tagQuery', async () => {
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      await request(app).get('/get/mtime/asc/3/myTag/true/2').set('x-test-user', u(ADMIN));
      expect(mockTagQuery).toHaveBeenCalledWith(3, 'myTag', true, 2, 'mtime', 'asc', expect.anything(), expect.anything());
    });

    test('non-numeric page returns 404', async () => {
      const res = await request(app).get('/get/name/desc/abc').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(404);
    });

    test('adultonly item gets 18+ tag pushed', async () => {
      mockTagQuery.mockResolvedValueOnce({
        items: [sampleStorageItem({ adultonly: 1, tags: ['video'] })],
        parentList: [], latest: null, bookmark: null, mediaHadle: 0,
      });
      const res = await request(app).get('/get/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.body.itemList[0].tags).toContain('18+');
    });

    test('first=1 item gets "first item" tag pushed', async () => {
      mockTagQuery.mockResolvedValueOnce({
        items: [sampleStorageItem({ first: 1, tags: ['video'] })],
        parentList: [], latest: null, bookmark: null, mediaHadle: 0,
      });
      const res = await request(app).get('/get/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.body.itemList[0].tags).toContain('first item');
    });

    test('status 5,6,10 mapped to 2 in getStorageItem', async () => {
      mockTagQuery.mockResolvedValueOnce({
        items: [
          sampleStorageItem({ _id: 'a', status: 5, tags: [] }),
          sampleStorageItem({ _id: 'b', status: 6, tags: [] }),
          sampleStorageItem({ _id: 'c', status: 10, tags: [] }),
        ],
        parentList: [], latest: null, bookmark: null, mediaHadle: 0,
      });
      const res = await request(app).get('/get/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.body.itemList.every(i => i.status === 2)).toBe(true);
    });

    test('tagQuery error returns 500', async () => {
      mockTagQuery.mockRejectedValueOnce(new Error('fail'));
      const res = await request(app).get('/get/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // GET /getSingle — resetArray branch
  // ---------------------------------------------------------------
  describe('GET /getSingle', () => {
    test('page=0 with name calls resetArray', async () => {
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      await request(app).get('/getSingle/name/desc/0/tag').set('x-test-user', u(ADMIN));
      expect(mockSearchTags).toHaveBeenCalled();
      expect(mockResetArray).toHaveBeenCalled();
    });

    test('page=0 without name does NOT call resetArray', async () => {
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      await request(app).get('/getSingle/name/desc/0').set('x-test-user', u(ADMIN));
      expect(mockResetArray).not.toHaveBeenCalled();
    });

    test('page>0 with name does NOT call resetArray', async () => {
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      await request(app).get('/getSingle/name/desc/2/tag').set('x-test-user', u(ADMIN));
      expect(mockResetArray).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // GET /getRandom — weighted random selection
  // ---------------------------------------------------------------
  describe('GET /getRandom/:sortName/:sortType/:page', () => {
    test('calls Redis hgetall, selectRandom, then tagQuery', async () => {
      mockRedis.mockResolvedValueOnce({}); // hgetall
      mockTagQuery.mockResolvedValueOnce({
        items: [sampleStorageItem()], parentList: [], latest: null, bookmark: null, mediaHadle: 0,
      });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockRedis).toHaveBeenCalledWith('hgetall', expect.stringContaining('tag:'));
      expect(mockSearchTags).toHaveBeenCalled();
      expect(mockSetArray).toHaveBeenCalled();
      expect(mockTagQuery).toHaveBeenCalled();
    });

    test('Redis null result still works (empty tag history)', async () => {
      mockRedis.mockResolvedValueOnce(null);
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
    });

    test('invalid sortName returns 404', async () => {
      const res = await request(app).get('/getRandom/invalid/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(404);
    });

    test('Redis error returns 500', async () => {
      mockRedis.mockRejectedValueOnce(new Error('redis fail'));
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // GET /single/:uid
  // ---------------------------------------------------------------
  describe('GET /single/:uid', () => {
    test('found item returned via getStorageItem[0] (single unwrapped)', async () => {
      mockSingleQuery.mockResolvedValueOnce({ empty: false, item: sampleStorageItem(), mediaHadle: 0 });
      const res = await request(app).get('/single/si001').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.item).toBeDefined();
      expect(res.body.item.name).toBe('MyFile.mp4');
    });

    test('empty result returns as-is', async () => {
      mockSingleQuery.mockResolvedValueOnce({ empty: true });
      const res = await request(app).get('/single/x').set('x-test-user', u(ADMIN));
      expect(res.body.empty).toBe(true);
    });

    test('error returns 500', async () => {
      mockSingleQuery.mockRejectedValueOnce(new Error('fail'));
      const res = await request(app).get('/single/x').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // GET /external/get — kubo, yify, dm5
  // ---------------------------------------------------------------
  describe('GET /external/get/:sortName/:pageToken?', () => {
    test('fetches kubo, yify, dm5 lists and returns combined itemList', async () => {
      mockGetSingleList
        .mockResolvedValueOnce([{ name: 'K1', id: '1', tags: ['a'], date: '2023-01-01', thumb: 't', count: 10 }]) // kubo
        .mockResolvedValueOnce([{ name: 'Y1', id: '2', tags: ['b'], date: '2023-02-01', thumb: 'u', rating: 8 }]) // yify
        .mockResolvedValueOnce([{ name: 'D1', id: '3', tags: ['c'], thumb: 'v' }]); // dm5
      const res = await request(app).get('/external/get/name').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.itemList).toHaveLength(3);
      expect(res.body.itemList[0].id).toBe('kub_1');
      expect(res.body.itemList[1].id).toBe('yif_2');
      expect(res.body.itemList[2].id).toBe('mad_3');
      expect(res.body.pageToken).toBe('2'); // index(1) + 1
    });

    test('with pageToken, extracts index and token', async () => {
      mockGetSingleList.mockResolvedValue([]);
      const res = await request(app).get('/external/get/name/3nextToken').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.pageToken).toBe('4'); // parsed index 3 + 1
    });

    test('external items have noDb=true and "first item" tag', async () => {
      mockGetSingleList
        .mockResolvedValueOnce([{ name: 'K', id: '1', tags: [], date: '2023-01-01', thumb: '', count: 0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      const res = await request(app).get('/external/get/name').set('x-test-user', u(ADMIN));
      expect(res.body.itemList[0].noDb).toBe(true);
      expect(res.body.itemList[0].tags).toContain('first item');
    });

    test('dm5 query with post property calls getSingleList with 3 args', async () => {
      mockGetMadQuery.mockReturnValueOnce({ url: 'dm5url', post: 'postdata' });
      mockGetSingleList.mockResolvedValue([]);
      await request(app).get('/external/get/name').set('x-test-user', u(ADMIN));
      // Third call (dm5) should have 3 args
      const dm5Call = mockGetSingleList.mock.calls[2];
      expect(dm5Call[0]).toBe('dm5');
      expect(dm5Call[1]).toBe('dm5url');
      expect(dm5Call[2]).toBe('postdata');
    });

    test('getSingleList error returns 500', async () => {
      mockGetSingleList.mockRejectedValueOnce(new Error('fail'));
      const res = await request(app).get('/external/get/name').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // POST /getOptionTag — contextual tag suggestions
  // ---------------------------------------------------------------
  describe('POST /getOptionTag', () => {
    test('admin (perm≤2): empty tags returns ["first item", "18+", ...GENRE_LIST_CH]', async () => {
      const res = await request(app).post('/getOptionTag')
        .set('x-test-user', u(CONTENT_ADMIN)).send({ tags: [] });
      expect(res.status).toBe(200);
      expect(res.body.relative[0]).toBe('first item');
      expect(res.body.relative[1]).toBe('18+');
      expect(res.body.relative).toContain('動作');
    });

    test('non-admin: empty tags returns ["first item", ...GENRE_LIST_CH] without 18+', async () => {
      const res = await request(app).post('/getOptionTag')
        .set('x-test-user', u(REGULAR)).send({ tags: [] });
      expect(res.body.relative[0]).toBe('first item');
      expect(res.body.relative).not.toContain('18+');
    });

    test('tags with "18+" appends ADULT_LIST', async () => {
      mockGetRelativeTag.mockResolvedValueOnce(['r1']);
      const res = await request(app).post('/getOptionTag')
        .set('x-test-user', u(ADMIN)).send({ tags: ['18+'] });
      expect(res.body.relative).toContain('ol');
      expect(res.body.relative).toContain('中出');
    });

    test('tags with "game" appends GAME_LIST_CH', async () => {
      mockGetRelativeTag.mockResolvedValueOnce([]);
      const res = await request(app).post('/getOptionTag')
        .set('x-test-user', u(ADMIN)).send({ tags: ['game'] });
      expect(res.body.relative).toContain('休閒');
    });

    test('tags with "遊戲" also appends GAME_LIST_CH', async () => {
      mockGetRelativeTag.mockResolvedValueOnce([]);
      const res = await request(app).post('/getOptionTag')
        .set('x-test-user', u(ADMIN)).send({ tags: ['遊戲'] });
      expect(res.body.relative).toContain('休閒');
    });

    test('tags with "audio" appends MUSIC_LIST', async () => {
      mockGetRelativeTag.mockResolvedValueOnce([]);
      const res = await request(app).post('/getOptionTag')
        .set('x-test-user', u(ADMIN)).send({ tags: ['audio'] });
      expect(res.body.relative).toContain('blues');
    });

    test('tags with "音頻" also appends MUSIC_LIST', async () => {
      mockGetRelativeTag.mockResolvedValueOnce([]);
      const res = await request(app).post('/getOptionTag')
        .set('x-test-user', u(ADMIN)).send({ tags: ['音頻'] });
      expect(res.body.relative).toContain('classical');
    });

    test('generic tags appends GENRE_LIST_CH', async () => {
      mockGetRelativeTag.mockResolvedValueOnce([]);
      const res = await request(app).post('/getOptionTag')
        .set('x-test-user', u(ADMIN)).send({ tags: ['action'] });
      expect(res.body.relative).toContain('動作');
    });

    test('caps at 5 relative tags', async () => {
      mockGetRelativeTag.mockResolvedValueOnce(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7']);
      const res = await request(app).post('/getOptionTag')
        .set('x-test-user', u(ADMIN)).send({ tags: ['x'] });
      // first item + 18+ (admin) + 5 relative + genre items
      const relativeOnly = res.body.relative.filter(r => r.startsWith('r'));
      expect(relativeOnly).toHaveLength(5);
    });

    test('getRelativeTag error returns 500', async () => {
      mockGetRelativeTag.mockRejectedValueOnce(new Error('fail'));
      const res = await request(app).post('/getOptionTag')
        .set('x-test-user', u(ADMIN)).send({ tags: ['x'] });
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // PUT /addTag/:tag — recursive with adultonly WS
  // ---------------------------------------------------------------
  describe('PUT /addTag/:tag', () => {
    test('single uid: adds tag, sends WS with adultonly, returns apiOK', async () => {
      mockAddTag.mockResolvedValueOnce({ id: 'si001', adultonly: 1 });
      const res = await request(app).put('/addTag/newtag')
        .set('x-test-user', u(ADMIN)).send({ uids: ['si001'] });
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
      expect(mockSendWs).toHaveBeenCalledWith({ type: 'file', data: 'si001' }, 1);
    });

    test('multiple uids processed recursively', async () => {
      mockAddTag.mockResolvedValueOnce({ id: 'a' }).mockResolvedValueOnce({ id: 'b' });
      const res = await request(app).put('/addTag/t')
        .set('x-test-user', u(ADMIN)).send({ uids: ['a', 'b'] });
      expect(res.status).toBe(200);
      expect(mockAddTag).toHaveBeenCalledTimes(2);
      expect(mockSendWs).toHaveBeenCalledTimes(2);
    }, 10000);

    test('no WS when result.id is falsy', async () => {
      mockAddTag.mockResolvedValueOnce({});
      const res = await request(app).put('/addTag/t')
        .set('x-test-user', u(ADMIN)).send({ uids: ['a'] });
      expect(res.status).toBe(200);
      expect(mockSendWs).not.toHaveBeenCalled();
    });

    test('empty uids returns OK immediately', async () => {
      const res = await request(app).put('/addTag/t')
        .set('x-test-user', u(ADMIN)).send({ uids: [] });
      expect(res.body.apiOK).toBe(true);
      expect(mockAddTag).not.toHaveBeenCalled();
    });

    test('error returns 500', async () => {
      mockAddTag.mockRejectedValueOnce(new Error('fail'));
      const res = await request(app).put('/addTag/t')
        .set('x-test-user', u(ADMIN)).send({ uids: ['a'] });
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // PUT /delTag/:tag
  // ---------------------------------------------------------------
  describe('PUT /delTag/:tag', () => {
    test('single uid: delTag + WS with adultonly', async () => {
      mockDelTag.mockResolvedValueOnce({ id: 'si001', adultonly: 0 });
      const res = await request(app).put('/delTag/old')
        .set('x-test-user', u(ADMIN)).send({ uids: ['si001'] });
      expect(res.status).toBe(200);
      expect(mockSendWs).toHaveBeenCalledWith({ type: 'file', data: 'si001' }, 0);
    });

    test('empty uids returns OK', async () => {
      const res = await request(app).put('/delTag/t')
        .set('x-test-user', u(ADMIN)).send({ uids: [] });
      expect(res.body.apiOK).toBe(true);
    });

    test('error returns 500', async () => {
      mockDelTag.mockRejectedValueOnce(new Error('fail'));
      const res = await request(app).put('/delTag/t')
        .set('x-test-user', u(ADMIN)).send({ uids: ['a'] });
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // PUT /sendTag/:uid
  // ---------------------------------------------------------------
  describe('PUT /sendTag/:uid', () => {
    test('updates name+tags, sends WS, returns result', async () => {
      mockSendTag.mockResolvedValueOnce({ id: 'si001', adultonly: 0, name: 'NewName' });
      const res = await request(app).put('/sendTag/si001')
        .set('x-test-user', u(ADMIN)).send({ name: 'NewName', tags: ['a', 'b'] });
      expect(res.status).toBe(200);
      expect(mockSendTag).toHaveBeenCalledWith('si001', 'NewName', ['a', 'b'], expect.anything());
      expect(mockSendWs).toHaveBeenCalledWith({ type: 'file', data: 'si001' }, 0);
      expect(res.body.name).toBe('NewName');
    });

    test('error returns 500', async () => {
      mockSendTag.mockRejectedValueOnce(new Error('fail'));
      const res = await request(app).put('/sendTag/si001')
        .set('x-test-user', u(ADMIN)).send({ name: 'x', tags: [] });
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // PUT /addTagUrl — parse external URL + apply tags
  // ---------------------------------------------------------------
  describe('PUT /addTagUrl', () => {
    test('invalid URL returns 400', async () => {
      const res = await request(app).put('/addTagUrl')
        .set('x-test-user', u(ADMIN)).send({ url: 'not-a-url' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('invalid tag url');
    });

    test('unsupported domain returns 400', async () => {
      const res = await request(app).put('/addTagUrl')
        .set('x-test-user', u(ADMIN)).send({ url: 'https://example.com/page' });
      expect(res.status).toBe(400);
    });

    test('preview mode (no uids) returns parsed tags', async () => {
      mockParseTagUrl.mockResolvedValueOnce(['action', 'drama']);
      const res = await request(app).put('/addTagUrl')
        .set('x-test-user', u(ADMIN)).send({ url: 'https://www.imdb.com/title/tt1234567/' });
      expect(res.status).toBe(200);
      expect(res.body.tags).toEqual(['action', 'drama']);
    });

    test('with uids: applies tags to each uid then returns apiOK', async () => {
      mockParseTagUrl.mockResolvedValueOnce(['tag1', 'tag2']);
      mockAddTag.mockResolvedValue({ adultonly: 0 }); // called for each tag+uid
      const res = await request(app).put('/addTagUrl')
        .set('x-test-user', u(ADMIN)).send({
          url: 'https://store.steampowered.com/app/123/',
          uids: ['uid1'],
        });
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
      expect(mockAddTag).toHaveBeenCalledTimes(2); // 2 tags × 1 uid
      expect(mockSendWs).toHaveBeenCalledWith({ type: 'file', data: 'uid1' }, 0);
    }, 10000);

    test('Steam URL detected', async () => {
      mockParseTagUrl.mockResolvedValueOnce([]);
      await request(app).put('/addTagUrl')
        .set('x-test-user', u(ADMIN)).send({ url: 'https://store.steampowered.com/app/730/' });
      expect(mockParseTagUrl).toHaveBeenCalledWith('steam', 'https://store.steampowered.com/app/730/');
    });

    test('IMDB URL detected', async () => {
      mockParseTagUrl.mockResolvedValueOnce([]);
      await request(app).put('/addTagUrl')
        .set('x-test-user', u(ADMIN)).send({ url: 'https://www.imdb.com/title/tt0111161/' });
      expect(mockParseTagUrl).toHaveBeenCalledWith('imdb', expect.anything());
    });

    test('Allmusic URL detected', async () => {
      mockParseTagUrl.mockResolvedValueOnce([]);
      await request(app).put('/addTagUrl')
        .set('x-test-user', u(ADMIN)).send({ url: 'https://www.allmusic.com/artist' });
      expect(mockParseTagUrl).toHaveBeenCalledWith('allmusic', expect.anything());
    });

    test('Marvel wiki URL detected', async () => {
      mockParseTagUrl.mockResolvedValueOnce([]);
      await request(app).put('/addTagUrl')
        .set('x-test-user', u(ADMIN)).send({ url: 'https://marvel.wikia.com/wiki/Spider-Man' });
      expect(mockParseTagUrl).toHaveBeenCalledWith('marvel', expect.anything());
    });

    test('DC wiki URL detected', async () => {
      mockParseTagUrl.mockResolvedValueOnce([]);
      await request(app).put('/addTagUrl')
        .set('x-test-user', u(ADMIN)).send({ url: 'https://dc.wikia.com/wiki/Batman' });
      expect(mockParseTagUrl).toHaveBeenCalledWith('dc', expect.anything());
    });

    test('TVDB URL detected', async () => {
      mockParseTagUrl.mockResolvedValueOnce([]);
      await request(app).put('/addTagUrl')
        .set('x-test-user', u(ADMIN)).send({ url: 'https://thetvdb.com/series/friends' });
      expect(mockParseTagUrl).toHaveBeenCalledWith('tvdb', expect.anything());
    });

    test('parseTagUrl error returns 500', async () => {
      mockParseTagUrl.mockRejectedValueOnce(new Error('parse fail'));
      const res = await request(app).put('/addTagUrl')
        .set('x-test-user', u(ADMIN)).send({ url: 'https://www.imdb.com/title/tt0000001/' });
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // PUT /recover/:uid — admin only
  // ---------------------------------------------------------------
  describe('PUT /recover/:uid', () => {
    test('non-admin returns 400 (permission denied)', async () => {
      const res = await request(app).put(`/recover/${VALID_UID}`).set('x-test-user', u(REGULAR));
      expect(res.status).toBe(400);
      expect(res.text).toContain('permission denied');
    });

    test('invalid uid returns 400', async () => {
      const res = await request(app).put('/recover/bad').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('item not found returns error', async () => {
      mockMongo.mockResolvedValueOnce([]);
      const res = await request(app).put(`/recover/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toContain('can not be found');
    });

    test('item not recycled (recycle !== 1) returns error', async () => {
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, recycle: 0 }]);
      const res = await request(app).put(`/recover/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toContain('recycle file first');
    });

    test('successful recovery: sets recycle=0, sends WS, returns apiOK', async () => {
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, recycle: 1, adultonly: 0 }]);
      mockMongo.mockResolvedValueOnce({}); // update
      const res = await request(app).put(`/recover/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
      expect(mockSendWs).toHaveBeenCalledWith({ type: 'file', data: VALID_UID }, 0);
    });

    test('DB error returns 500', async () => {
      mockMongo.mockRejectedValueOnce(new Error('fail'));
      const res = await request(app).put(`/recover/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // POST /media/saveParent
  // ---------------------------------------------------------------
  describe('POST /media/saveParent/:sortName/:sortType', () => {
    test('valid name calls saveArray and returns apiOK', async () => {
      const res = await request(app).post('/media/saveParent/name/desc')
        .set('x-test-user', u(ADMIN)).send({ name: 'MyPlaylist' });
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
      expect(mockSaveArray).toHaveBeenCalledWith('MyPlaylist', 'name', 'desc');
    });

    test('invalid name returns 400', async () => {
      const res = await request(app).post('/media/saveParent/name/desc')
        .set('x-test-user', u(ADMIN)).send({ name: '' });
      expect(res.status).toBe(400);
    });

    test('invalid sortName returns 404', async () => {
      const res = await request(app).post('/media/saveParent/bad/desc')
        .set('x-test-user', u(ADMIN)).send({ name: 'x' });
      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------
  // GET /media/record/:id/:time/:pId?
  // ---------------------------------------------------------------
  describe('GET /media/record/:id/:time/:pId?', () => {
    test('valid uid + non-zero time: Redis hmset', async () => {
      mockRedis.mockResolvedValueOnce('OK');
      const res = await request(app).get(`/media/record/${VALID_UID}/120`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
      expect(mockRedis).toHaveBeenCalledWith('hmset', expect.stringContaining('record:'), expect.objectContaining({ [VALID_UID]: '120' }));
    });

    test('time=0: Redis hdel to clear record', async () => {
      mockRedis.mockResolvedValueOnce(1);
      const res = await request(app).get(`/media/record/${VALID_UID}/0`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockRedis).toHaveBeenCalledWith('hdel', expect.stringContaining('record:'), VALID_UID);
    });

    test('external id (kub_ prefix) validated as name', async () => {
      mockRedis.mockResolvedValueOnce('OK');
      const res = await request(app).get('/media/record/kub_12345/50').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
    });

    test('invalid time format returns 400', async () => {
      const res = await request(app).get(`/media/record/${VALID_UID}/abc`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('time with decimal (float) accepted', async () => {
      mockRedis.mockResolvedValueOnce('OK');
      const res = await request(app).get(`/media/record/${VALID_UID}/30.5`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
    });

    test('time with ampersand format accepted', async () => {
      mockRedis.mockResolvedValueOnce('OK');
      const res = await request(app).get(`/media/record/${VALID_UID}/120&5`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
    });

    test('invalid uid returns 400', async () => {
      const res = await request(app).get('/media/record/bad/50').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('Redis error returns 500', async () => {
      mockRedis.mockRejectedValueOnce(new Error('fail'));
      const res = await request(app).get(`/media/record/${VALID_UID}/50`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // GET /media/more/:type/:page/:back?
  // ---------------------------------------------------------------
  describe('GET /media/more/:type/:page/:back?', () => {
    test('type=2 (image): sets $or for status 2,5,6,10', async () => {
      mockSaveSql.mockReturnValueOnce({ nosql: {}, options: {}, select: {}, parentList: [] });
      mockMongo.mockResolvedValueOnce([sampleStorageItem()]);
      const res = await request(app).get('/media/more/2/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockMongo.mock.calls[0][2].$or).toEqual([
        { status: 2 }, { status: 5 }, { status: 6 }, { status: 10 },
      ]);
    });

    test('type=3 (video): sets status=3', async () => {
      mockSaveSql.mockReturnValueOnce({ nosql: {}, options: {}, select: {}, parentList: [] });
      mockMongo.mockResolvedValueOnce([]);
      await request(app).get('/media/more/3/0').set('x-test-user', u(ADMIN));
      expect(mockMongo.mock.calls[0][2].status).toBe(3);
    });

    test('type=4 (music): sets status=4', async () => {
      mockSaveSql.mockReturnValueOnce({ nosql: {}, options: {}, select: {}, parentList: [] });
      mockMongo.mockResolvedValueOnce([]);
      await request(app).get('/media/more/4/0').set('x-test-user', u(ADMIN));
      expect(mockMongo.mock.calls[0][2].status).toBe(4);
    });

    test('type=0 (unsupported) returns 400 "unknown type"', async () => {
      const res = await request(app).get('/media/more/0/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toContain('unknown type');
    });

    test('type=1 returns 400', async () => {
      const res = await request(app).get('/media/more/1/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('saveSql returns null → 400 "query error"', async () => {
      mockSaveSql.mockReturnValueOnce(null);
      const res = await request(app).get('/media/more/2/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toContain('query error');
    });

    test('saveSql returns {empty: true} → empty itemList', async () => {
      mockSaveSql.mockReturnValueOnce({ empty: true });
      const res = await request(app).get('/media/more/2/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.itemList).toEqual([]);
    });

    test('with back parameter', async () => {
      mockSaveSql.mockReturnValueOnce({ nosql: {}, options: {}, select: {}, parentList: [] });
      mockMongo.mockResolvedValueOnce([]);
      await request(app).get('/media/more/3/1/back').set('x-test-user', u(ADMIN));
      expect(mockSaveSql).toHaveBeenCalledWith(1, 'video', 'back', expect.anything(), expect.anything());
    });

    test('non-numeric type returns 404', async () => {
      const res = await request(app).get('/media/more/abc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------
  // GET /torrent/query/:id
  // ---------------------------------------------------------------
  describe('GET /torrent/query/:id', () => {
    test('invalid uid returns 400', async () => {
      const res = await request(app).get('/torrent/query/bad').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('item not found returns error', async () => {
      mockMongo.mockResolvedValueOnce([]);
      const res = await request(app).get(`/torrent/query/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('item not status=9 returns error', async () => {
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, status: 3, playList: [] }]);
      const res = await request(app).get(`/torrent/query/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toContain('playlist can not be found');
    });

    test('valid torrent: returns playlist with typed items', async () => {
      mockMongo.mockResolvedValueOnce([{
        _id: { toString: () => VALID_UID },
        status: 9,
        tags: ['video'],
        playList: ['movie.mp4', 'cover.jpg', 'readme.txt'],
        present: null,
      }]);
      mockRedis.mockResolvedValueOnce(null); // hget record (no existing record)
      mockSetLatest.mockResolvedValueOnce({});
      mockMongo.mockResolvedValueOnce({}); // update count (inside setLatest chain)
      const res = await request(app).get(`/torrent/query/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
      expect(res.body.list).toHaveLength(3);
      res.body.list.forEach(item => {
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('type');
        expect(item).toHaveProperty('doc');
      });
    });

    test('with existing record, returns time', async () => {
      mockMongo.mockResolvedValueOnce([{
        _id: { toString: () => VALID_UID },
        status: 9, tags: [], playList: ['a.mp4'],
      }]);
      // torrent/query calls Redis('hget') directly (no setTag/multi)
      mockRedis.mockResolvedValueOnce('42'); // hget record
      mockSetLatest.mockResolvedValueOnce({});
      mockMongo.mockResolvedValueOnce({}); // update count (inside setLatest chain)
      const res = await request(app).get(`/torrent/query/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.body.time).toBe('42');
    });

    test('DB error returns 500', async () => {
      mockMongo.mockRejectedValueOnce(new Error('fail'));
      const res = await request(app).get(`/torrent/query/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // PUT /zipPassword/:uid
  // ---------------------------------------------------------------
  describe('PUT /zipPassword/:uid', () => {
    test('invalid uid returns 400', async () => {
      const res = await request(app).put('/zipPassword/bad')
        .set('x-test-user', u(ADMIN)).send({ pwd: 'MyPass1' });
      expect(res.status).toBe(400);
    });

    test('invalid password returns 400', async () => {
      const res = await request(app).put(`/zipPassword/${VALID_UID}`)
        .set('x-test-user', u(ADMIN)).send({ pwd: '' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('password is not vaild');
    });

    test('zip not found (no status=9) returns 400', async () => {
      mockMongo.mockResolvedValueOnce([]);
      const res = await request(app).put(`/zipPassword/${VALID_UID}`)
        .set('x-test-user', u(ADMIN)).send({ pwd: 'Pass123' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('zip can not be found');
    });

    test('valid: updates password, returns apiOK', async () => {
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, status: 9 }]);
      mockMongo.mockResolvedValueOnce({});
      const res = await request(app).put(`/zipPassword/${VALID_UID}`)
        .set('x-test-user', u(ADMIN)).send({ pwd: 'SecretP1' });
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
    });

    test('DB error returns 500', async () => {
      mockMongo.mockRejectedValueOnce(new Error('fail'));
      const res = await request(app).put(`/zipPassword/${VALID_UID}`)
        .set('x-test-user', u(ADMIN)).send({ pwd: 'Pass123' });
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // GET /media/setTime — complex media playback
  // ---------------------------------------------------------------
  describe('GET /media/setTime/:id/:type/:obj?/:pageToken?/:back?', () => {
    test('valid uid + type=url returns {apiOK: true} (no record)', async () => {
      mockSetLatest.mockResolvedValueOnce({});
      mockMongo.mockResolvedValueOnce({}); // update count
      const res = await request(app).get(`/media/setTime/${VALID_UID}/url`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
    });

    test('valid uid + type=video: calls setTag and returns time if record exists', async () => {
      // setTag: Mongo('find') → Redis('multi') → Redis('hget')
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, tags: [] }]); // setTag Mongo find
      mockRedis.mockResolvedValueOnce([]); // setTag Redis multi
      mockRedis.mockResolvedValueOnce('30.5'); // setTag Redis hget (record)
      // fire-and-forget: setLatest + Mongo update
      mockSetLatest.mockResolvedValueOnce({});
      mockMongo.mockResolvedValueOnce({}); // update count
      const res = await request(app).get(`/media/setTime/${VALID_UID}/video`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.time).toBe('30.5');
    });

    test('valid uid + type=video: no record returns {apiOK: true}', async () => {
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, tags: [] }]); // setTag Mongo find
      mockRedis.mockResolvedValueOnce([]); // setTag Redis multi
      mockRedis.mockResolvedValueOnce(null); // setTag Redis hget (no record)
      mockSetLatest.mockResolvedValueOnce({});
      mockMongo.mockResolvedValueOnce({});
      const res = await request(app).get(`/media/setTime/${VALID_UID}/video`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
    });

    test('type=music: no time returned even if record exists', async () => {
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, tags: [] }]);
      mockRedis.mockResolvedValueOnce([]);
      mockRedis.mockResolvedValueOnce('60');
      mockSetLatest.mockResolvedValueOnce({});
      mockMongo.mockResolvedValueOnce({});
      const res = await request(app).get(`/media/setTime/${VALID_UID}/music`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
      expect(res.body.time).toBeUndefined();
    });

    test('external id (kub_ prefix): sets playlist=3, calls getSingleId', async () => {
      // kub_ prefix → validated as 'name', playlist=3
      // setTag(id): Mongo find → Redis multi → Redis hget
      mockMongo.mockResolvedValueOnce([{ _id: 'kub_abc', tags: [] }]); // setTag Mongo find
      mockRedis.mockResolvedValueOnce([]); // setTag Redis multi
      mockRedis.mockResolvedValueOnce(null); // setTag Redis hget (no record → recordTime=1)
      // External.getSingleId for kubo playlist
      mockGetSingleId.mockResolvedValueOnce([{ id: null, name: 'Episode 1' }, false, 5]);
      // fire-and-forget
      mockSetLatest.mockResolvedValueOnce({});
      mockMongo.mockResolvedValueOnce({}); // update count
      const res = await request(app).get('/media/setTime/kub_abc/video').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockGetSingleId).toHaveBeenCalledWith('kubo', expect.stringContaining('99kubo'), 1);
      expect(res.body.playlist).toBeDefined();
      expect(res.body.playlist.total).toBe(5);
    });

    test('invalid id returns 400', async () => {
      // Short ID that doesn't match external prefix and fails uid validation
      const res = await request(app).get('/media/setTime/bad/video').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('invalid type returns 400', async () => {
      // name validation on type — empty strings or special chars fail
      const res = await request(app).get(`/media/setTime/${VALID_UID}/a*b`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('setLatest error does NOT block response (fire-and-forget)', async () => {
      mockSetLatest.mockRejectedValueOnce(new Error('setLatest fail'));
      mockMongo.mockResolvedValueOnce({}); // update count (won't be reached)
      const res = await request(app).get(`/media/setTime/${VALID_UID}/url`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
    });

    test('DB error returns 500', async () => {
      mockMongo.mockRejectedValueOnce(new Error('fail'));
      mockRedis.mockResolvedValueOnce([]);
      mockRedis.mockResolvedValueOnce(null);
      const res = await request(app).get(`/media/setTime/${VALID_UID}/video`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });
  });
});
