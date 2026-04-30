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
  RELATIVE_UNION: 2, RELATIVE_INTER: 3,
  GENRE_LIST: [], GENRE_LIST_CH: ['動作', '冒險'],
  BOOKMARK_LIMIT: 100,
  ADULTONLY_PARENT: [],
  GAME_LIST: [], GAME_LIST_CH: ['休閒', '冒險'],
  MEDIA_LIST: [], MEDIA_LIST_CH: [],
  DM5_ORI_LIST: [], DM5_CH_LIST: [],
  DM5_LIST: [], DM5_AREA_LIST: [], DM5_TAG_LIST: [],
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

// Full OPTION_TAG matching real structure: [...MEDIA_LIST_CH, ...GENRE_LIST_CH, ...GAME_LIST_CH, ...MUSIC_LIST, ...ADULT_LIST]
const FULL_OPTION_TAG = [
  '圖片', '相片', '漫畫', '圖片集', '影片', '電影', '動畫', '電視劇',   // 0-7
  '音頻', '歌曲', '音樂', '有聲書', '文件', '書籍', '小說',             // 8-14
  '簡報', '試算表', '程式碼', '網頁', '網址', '論壇', '維基',           // 15-21
  '壓縮檔', '播放列表',                                                  // 22-23
  'g24', 'g25', 'g26', 'g27', 'g28', 'g29', 'g30', 'g31',              // 24-31
  'g32', 'g33', 'g34', 'g35', 'g36', 'g37', 'g38', 'g39',              // 32-39
  'g40', 'g41', 'g42', 'g43',                                            // 40-43
  'ga44', 'ga45', 'ga46', 'ga47', 'ga48', 'ga49', 'ga50',               // 44-50
  'm51', 'm52', 'm53', 'm54', 'm55', 'm56', 'm57', 'm58', 'm59',       // 51-59
  'm60', 'm61', 'm62', 'm63', 'm64', 'm65', 'm66', 'm67', 'm68',       // 60-68
  'm69', 'm70', 'm71',                                                    // 69-71
  'a72', 'a73',                                                            // 72-73
];

const mockIsDoc = jest.fn(() => false);
const mockIsImage = jest.fn(() => false);
const mockIsMusic = jest.fn(() => false);
const mockIsVideo = jest.fn(() => false);
const mockIsZipbook = jest.fn(() => false);
jest.unstable_mockModule('../../util/mime.js', () => ({
  getOptionTag: jest.fn(() => FULL_OPTION_TAG),
  isImage: mockIsImage,
  isMusic: mockIsMusic,
  isVideo: mockIsVideo,
  isDoc: mockIsDoc,
  isZipbook: mockIsZipbook,
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

    test('tagQuery error returns 500', async () => {
      mockTagQuery.mockRejectedValueOnce(new Error('fail'));
      const res = await request(app).get('/getSingle/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
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

    // --- Branch coverage for selectRandom choose values ---
    // N=74 (FULL_OPTION_TAG length). All Redis hgetall returns {} → weights all 1.
    // selectRandom(count) return choose=X: Math.random = (X+0.5)/N
    // selectRandom(count, arr) return arr[idx]: Math.random = (idx+0.5)/arr.length
    // selectRandom([w1,w2,...]) return idx: compute accm_list, Math.random = (accm[idx]-0.5)/sum
    const N = 74;

    test('choose=0: push 2 random tags (lines 72-74)', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(0.5 / N)        // choose=0
        .mockReturnValueOnce(0.5 / 2)        // [1,2] → 1
        .mockReturnValueOnce(0.5 / 20);      // genre → 24
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=1: pic type (lines 77-78)', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(1.5 / N)        // choose=1
        .mockReturnValueOnce(0.5 / 20);      // genre → 24
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=3: pic book (lines 81-83)', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(3.5 / N)        // choose=3
        .mockReturnValueOnce(0.5 / 2)        // [1,2] → 1
        .mockReturnValueOnce(0.5 / 20);      // genre → 24
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=4: video (lines 86-87) + 電影 post-processing (lines 165-167)', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(4.5 / N)        // choose=4
        .mockReturnValueOnce(0.5 / 3)        // [5,6,7] → 5 (電影)
        .mockReturnValueOnce(0.5 / 20)       // genre → 24
        .mockReturnValueOnce(0.5 / 14);      // selectRandom([11,1,1,1]) → 0 (not yify)
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=4 + 電影 + yify movie (lines 168-170)', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(4.5 / N)        // choose=4
        .mockReturnValueOnce(0.5 / 3)        // [5,6,7] → 5 (電影)
        .mockReturnValueOnce(0.5 / 20)       // genre → 24
        .mockReturnValueOnce(13.5 / 14);     // selectRandom([11,1,1,1]) → 3 (yify)
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockSetArray).toHaveBeenCalledWith('', expect.arrayContaining(['yify movie', 'no local']), expect.any(Array));
      spy.mockRestore();
    });

    test('choose=4 + 動畫 post-processing (lines 175-176)', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(4.5 / N)        // choose=4
        .mockReturnValueOnce(1.5 / 3)        // [5,6,7] → 6 (動畫)
        .mockReturnValueOnce(0.5 / 20)       // genre
        .mockReturnValueOnce(0.5 / 11);      // selectRandom([9,1,1]) → 0
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=4 + 電視劇 post-processing (lines 181-182)', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(4.5 / N)        // choose=4
        .mockReturnValueOnce(2.5 / 3)        // [5,6,7] → 7 (電視劇)
        .mockReturnValueOnce(0.5 / 20)       // genre
        .mockReturnValueOnce(0.5);           // selectRandom([10]) → 0
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=6 mtype=6: video type+cate (lines 90-92,96)', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(6.5 / N)        // choose=6
        .mockReturnValueOnce(1.5 / 3)        // [5,6,7] → 6 (mtype=6)
        .mockReturnValueOnce(0.5 / 20)       // genre
        .mockReturnValueOnce(0.5 / 11);      // post-proc: 動畫 → selectRandom([9,1,1])
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=6 mtype!=6: video type+cate else (lines 93-94)', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(6.5 / N)        // choose=6
        .mockReturnValueOnce(0.5 / 3)        // [5,6,7] → 5 (mtype=5)
        .mockReturnValueOnce(0.5 / 14);      // post-proc: 電影 → selectRandom([11,1,1,1]) → 0
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=5: video type (lines 99-100)', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(5.5 / N)        // choose=5
        .mockReturnValueOnce(0.5 / 20)       // genre
        .mockReturnValueOnce(0.5 / 14);      // post-proc: 電影 → selectRandom([11,1,1,1]) → 0
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=8: audio (lines 103-104) + 音頻 post-processing (line 195)', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(8.5 / N)        // choose=8
        .mockReturnValueOnce(0.5 / 3)        // [9,10,11] → 9
        .mockReturnValueOnce(0.5 / 21)       // music_genre → 51
        .mockReturnValueOnce(0.5);           // post-proc: 音頻 → selectRandom([6]) → 0
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=10 mtype=4: audio type+video cate (lines 107-110,114)', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(10.5 / N)       // choose=10
        .mockReturnValueOnce(0.5 / 2)        // [4,8] → 4 (mtype=4)
        .mockReturnValueOnce(0.5 / 3)        // [5,6,7] → 5
        .mockReturnValueOnce(0.5 / 20)       // genre
        .mockReturnValueOnce(0.5 / 14);      // post-proc: 電影 → selectRandom([11,1,1,1])
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=10 mtype=8: audio type+music (lines 111-112)', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(10.5 / N)       // choose=10
        .mockReturnValueOnce(1.5 / 2)        // [4,8] → 8 (mtype=8)
        .mockReturnValueOnce(0.5 / 21)       // music_genre → 51
        .mockReturnValueOnce(0.5);           // post-proc: 音頻 → selectRandom([6])
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=9: audio type (lines 117-118)', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(9.5 / N)        // choose=9
        .mockReturnValueOnce(0.5 / 21)       // music_genre → 51
        .mockReturnValueOnce(0.5);           // post-proc: 音頻 → selectRandom([6])
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=12: doc (lines 121-122)', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(12.5 / N)       // choose=12
        .mockReturnValueOnce(0.5 / 4)        // [13,14,17,18] → 13
        .mockReturnValueOnce(0.5 / 20);      // genre
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=13: doc type (lines 125-126)', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(13.5 / N)       // choose=13
        .mockReturnValueOnce(0.5 / 20);      // genre
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=15: pre no-op', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(15.5 / N);      // choose=15
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=16: sheet no-op', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(16.5 / N);      // choose=16
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=19: url (line 133)', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(19.5 / N)       // choose=19
        .mockReturnValueOnce(0.5 / 2);       // [20,21] → 20
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=20: url type (line 136)', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(20.5 / N);      // choose=20
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=22: zip (line 139)', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(22.5 / N);      // choose=22
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=23: zip type (line 142)', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(23.5 / N);      // choose=23
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=24 mtype>23: game genre (lines 145-147)', async () => {
      // game_genre = [0,4,12,24,25,42,44,45,46,47,48,49,50] (13 elements)
      // To return 24 (index 3): (3+0.5)/13
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(24.5 / N)       // choose=24
        .mockReturnValueOnce(3.5 / 13);      // game_genre → 24 (mtype>23)
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=24 mtype=0: game with pic type (lines 148-150)', async () => {
      // game_genre index 0 → mtype=0 → OPTION_TAG[2]='漫畫'
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(24.5 / N)       // choose=24
        .mockReturnValueOnce(0.5 / 13);      // game_genre → 0 (mtype=0)
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=24 mtype=4: game with video type (line 149 mtype===4 branch)', async () => {
      // game_genre index 1 → mtype=4
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(24.5 / N)       // choose=24
        .mockReturnValueOnce(1.5 / 13)       // game_genre → 4 (mtype=4)
        .mockReturnValueOnce(0.5 / 3)        // [5,6,7] → 5
        .mockReturnValueOnce(0.5 / 14);      // post-proc: selectRandom([11,1,1,1])
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=24 mtype=12: game with doc type (line 149 else branch)', async () => {
      // game_genre index 2 → mtype=12
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(24.5 / N)       // choose=24
        .mockReturnValueOnce(2.5 / 13)       // game_genre → 12 (mtype=12)
        .mockReturnValueOnce(0.5 / 2);       // [13,14] → 13
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=26: genre tags (lines 153-155)', async () => {
      // choose=26 → choose>23 && choose<44, mtype from [0,4,12]
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(26.5 / N)       // choose=26
        .mockReturnValueOnce(1.5 / 3)        // [0,4,12] → 4 (mtype=4)
        .mockReturnValueOnce(0.5 / 3)        // [5,6,7] → 5
        .mockReturnValueOnce(0.5 / 14);      // post-proc: 電影
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=44: game (line 157)', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(44.5 / N);      // choose=44
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=51: audio music (lines 159-160)', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(51.5 / N)       // choose=51
        .mockReturnValueOnce(0.5 / 3)        // [9,10,11] → 9
        .mockReturnValueOnce(0.5);           // post-proc: 音頻 → selectRandom([6])
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=72: else branch / 18+ (line 162)', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(72.5 / N);      // choose=72
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('choose=0 + 漫畫 + dm5 comic (lines 189-192)', async () => {
      // choose=0, second sr returns 2 → OPTION_TAG[2]='漫畫'
      // post-proc: 圖片+漫畫 → selectRandom([4,1])→1 (dm5)
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(0.5 / N)        // choose=0
        .mockReturnValueOnce(1.5 / 2)        // [1,2] → 2 (漫畫)
        .mockReturnValueOnce(0.5 / 20)       // genre → 24
        .mockReturnValueOnce(4.5 / 5)        // selectRandom([4,1]) → 1 (dm5)
        .mockReturnValueOnce(0.5 / 11);      // selectRandom(count,[24,25,27,...]) → 24
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockSetArray).toHaveBeenCalledWith('', expect.arrayContaining(['dm5 comic', 'no local']), expect.any(Array));
      spy.mockRestore();
    });

    test('choose=0 + 漫畫 + mtype=0 (line 190 not dm5)', async () => {
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(0.5 / N)        // choose=0
        .mockReturnValueOnce(1.5 / 2)        // [1,2] → 2 (漫畫)
        .mockReturnValueOnce(0.5 / 20)       // genre → 24
        .mockReturnValueOnce(0.5 / 5);       // selectRandom([4,1]) → 0 (not dm5)
      mockRedis.mockResolvedValueOnce({});
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
    });

    test('Redis hgetall with matching tags builds count_list (lines 56-63)', async () => {
      // Return items where key matches an OPTION_TAG element
      mockRedis.mockResolvedValueOnce({ '圖片': '3', '影片': '2' });
      const spy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(15.5 / N);      // choose=15 (no-op)
      mockTagQuery.mockResolvedValueOnce({ items: [], parentList: [], latest: null, bookmark: null, mediaHadle: 0 });
      const res = await request(app).get('/getRandom/name/desc/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      spy.mockRestore();
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
  // GET /external/get — yify, dm5
  // ---------------------------------------------------------------
  describe('GET /external/get/:sortName/:pageToken?', () => {
    test('fetches yify, dm5 lists and returns combined itemList', async () => {
      mockGetMadQuery.mockReturnValueOnce('mad_query'); // not an object
      mockGetSingleList
        .mockResolvedValueOnce([{ name: 'Y1', id: '2', tags: ['b'], date: '2023-02-01', thumb: 'u', rating: 8 }]) // yify
        .mockResolvedValueOnce([{ name: 'D1', id: '3', tags: ['c'], thumb: 'v' }]); // dm5
      const res = await request(app).get('/external/get/name').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.itemList).toHaveLength(2);
      expect(res.body.itemList[0].id).toBe('yif_2');
      expect(res.body.itemList[1].id).toBe('mad_3');
      expect(res.body.pageToken).toBe('2');
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
        .mockResolvedValueOnce([]);
      const res = await request(app).get('/external/get/name').set('x-test-user', u(ADMIN));
      expect(res.body.itemList[0].noDb).toBe(true);
      expect(res.body.itemList[0].tags).toContain('first item');
    });

    test('dm5 query with post property calls getSingleList with 3 args', async () => {
      mockGetMadQuery.mockReturnValueOnce({ url: 'dm5url', post: 'postdata' });
      mockGetSingleList.mockResolvedValue([]);
      await request(app).get('/external/get/name').set('x-test-user', u(ADMIN));
      const dm5Call = mockGetSingleList.mock.calls[1];
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

    test('external id (you_ prefix) validated as name', async () => {
      mockRedis.mockResolvedValueOnce('OK');
      const res = await request(app).get('/media/record/you_12345/50').set('x-test-user', u(ADMIN));
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

    test('Mongo error in type=2 query returns 500 (line 651)', async () => {
      mockSaveSql.mockReturnValueOnce({ nosql: {}, options: {}, select: {}, parentList: ['p1'] });
      mockMongo.mockRejectedValueOnce(new Error('mongo fail'));
      const res = await request(app).get('/media/more/2/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });

    test('type=2 returns parentList from saveSql (line 650)', async () => {
      mockSaveSql.mockReturnValueOnce({ nosql: {}, options: {}, select: {}, parentList: ['parent1'] });
      mockMongo.mockResolvedValueOnce([sampleStorageItem()]);
      const res = await request(app).get('/media/more/2/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.parentList).toEqual(['parent1']);
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

    test('isDoc truthy: sets type=2 and doc value (lines 674-675)', async () => {
      mockIsDoc.mockReturnValueOnce(false)            // movie.mp4 → false
        .mockReturnValueOnce({ type: 'present' })     // slides.pptx → present → doc=1
        .mockReturnValueOnce({ type: 'pdf' })         // doc.pdf → pdf → doc=3
        .mockReturnValueOnce({ type: 'word' });       // doc.docx → other → doc=2
      mockMongo.mockResolvedValueOnce([{
        _id: { toString: () => VALID_UID },
        status: 9,
        tags: [],
        playList: ['movie.mp4', 'slides.pptx', 'doc.pdf', 'doc.docx'],
        present: [null, 'pdata', null, null],
      }]);
      mockRedis.mockResolvedValueOnce(null);
      mockSetLatest.mockResolvedValueOnce({});
      mockMongo.mockResolvedValueOnce({});
      const res = await request(app).get(`/torrent/query/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.list[1].type).toBe(2);
      expect(res.body.list[1].doc).toBe(1);
      expect(res.body.list[1].present).toBe('pdata');
      expect(res.body.list[2].type).toBe(2);
      expect(res.body.list[2].doc).toBe(3);
      expect(res.body.list[3].doc).toBe(2);
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

    // --- Additional setTime branch coverage ---
    // Nested describe to reset mock return-value queues left by prior tests
    // (jest.clearAllMocks does NOT clear mockReturnValueOnce queues)
    describe('playlist branches', () => {
      beforeEach(() => {
        mockMongo.mockReset();
        mockRedis.mockReset();
        mockGetSingleId.mockReset();
        mockSetLatest.mockReset();
        mockSetLatest.mockResolvedValue({});
        mockSaveSql.mockReset();
        mockIsDoc.mockReset();
        mockIsDoc.mockReturnValue(false);
      });

    test('yif_ prefix: playlist=4, yify URL (lines 471-473, 577-579)', async () => {
      mockMongo.mockResolvedValueOnce([{ _id: 'yif_12345', tags: [] }]);
      mockRedis.mockResolvedValueOnce([]);
      mockRedis.mockResolvedValueOnce(null);
      mockGetSingleId.mockResolvedValueOnce([{ id: null, name: 'Movie1' }, false, 3]);
      mockSetLatest.mockResolvedValueOnce({});
      mockMongo.mockResolvedValueOnce({});
      const res = await request(app).get('/media/setTime/yif_12345/video').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockGetSingleId).toHaveBeenCalledWith('yify', expect.stringContaining('yts.ag'), 1);
      expect(res.body.playlist).toBeDefined();
      expect(res.body.playlist.total).toBe(3);
    });

    test('mad_ prefix: playlist=5, dm5 URL', async () => {
      mockMongo.mockResolvedValueOnce([{ _id: 'mad_ch12345', tags: [] }]);
      mockRedis.mockResolvedValueOnce([]);
      mockRedis.mockResolvedValueOnce(null);
      mockGetSingleId.mockResolvedValueOnce([{ id: null, name: 'Ch1' }, false, 10]);
      mockSetLatest.mockResolvedValueOnce({});
      mockMongo.mockResolvedValueOnce({});
      const res = await request(app).get('/media/setTime/mad_ch12345/video').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
    });







    test('external prefix with invalid name returns 400 (line 483)', async () => {
      // A name matching the prefix regex but failing isValidString 'name' validation
      // The 'name' regex rejects: \ / | * ? " < > :
      const res = await request(app).get('/media/setTime/yif_bad*name/video').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toContain('youtube is not vaild');
    });

    test('uid with obj=external: playlist=2, obj=null (lines 492-494, 565-569)', async () => {
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, tags: [] }]);
      mockRedis.mockResolvedValueOnce([]);
      mockRedis.mockResolvedValueOnce(null);
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, owner: 'yify', url: 'http%3A%2F%2Fexample.com' }]);
      mockGetSingleId.mockResolvedValueOnce([{ id: null, name: 'Ep1' }, false, 5, null, null, null, null, false]);
      const res = await request(app).get(`/media/setTime/${VALID_UID}/video/external`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.playlist).toBeDefined();
      expect(res.body.playlist.total).toBe(5);
      expect(mockGetSingleId).toHaveBeenCalledWith('yify', 'http://example.com', 1, null, undefined);
    });

    test('uid with obj=number: playlist=2, first() stores record (lines 505-513)', async () => {
      mockRedis.mockResolvedValueOnce('OK');
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, tags: [] }]);
      mockRedis.mockResolvedValueOnce([]);
      mockRedis.mockResolvedValueOnce(null);
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, owner: 'yify', url: 'http%3A%2F%2Fexample.com' }]);
      mockGetSingleId.mockResolvedValueOnce([{ id: null, name: 'Ep1' }, false, 1, null, null, null, null, false]);
      const res = await request(app).get(`/media/setTime/${VALID_UID}/video/42`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockRedis).toHaveBeenCalledWith('hmset', expect.stringContaining('record:'), expect.objectContaining({ [VALID_UID]: '42' }));
    });

    test('uid with obj=number + pageToken: stores obj>>pageToken (line 513)', async () => {
      mockRedis.mockResolvedValueOnce('OK');
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, tags: [] }]);
      mockRedis.mockResolvedValueOnce([]);
      mockRedis.mockResolvedValueOnce(null);
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, owner: 'yify', url: 'http%3A%2F%2Fexample.com' }]);
      mockGetSingleId.mockResolvedValueOnce([{ id: null }, false, 1, null, null, null, null, false]);
      const res = await request(app).get(`/media/setTime/${VALID_UID}/video/42/mytoken`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockRedis).toHaveBeenCalledWith('hmset', expect.stringContaining('record:'), expect.objectContaining({ [VALID_UID]: '42>>mytoken' }));
    });

    test('OPTION_TAG matching tag triggers hincrby (lines 522-523)', async () => {
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, tags: ['影片', '電影', 'other'] }]);
      mockRedis.mockResolvedValueOnce([]);
      mockRedis.mockResolvedValueOnce(null);
      const res = await request(app).get(`/media/setTime/${VALID_UID}/video`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockRedis).toHaveBeenCalledWith('multi', expect.arrayContaining([
        ['hincrby', expect.stringContaining('tag:'), '影片', 1],
        ['hincrby', expect.stringContaining('tag:'), '電影', 1],
      ]));
    });

    test('record with >> separator parses recordTime and rPageToken (lines 535-536)', async () => {
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, tags: [] }]);
      mockRedis.mockResolvedValueOnce([]);
      mockRedis.mockResolvedValueOnce('55>>nextpage');
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, owner: 'yify', url: 'http%3A%2F%2Fexample.com' }]);
      mockGetSingleId.mockResolvedValueOnce([{ id: null }, false, 1, null, null, null, null, false]);
      const res = await request(app).get(`/media/setTime/${VALID_UID}/video/external`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockGetSingleId).toHaveBeenCalledWith('yify', expect.any(String), '55', 'nextpage', undefined);
    });

    test('playlist=2 external not found returns error (line 567)', async () => {
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, tags: [] }]);
      mockRedis.mockResolvedValueOnce([]);
      mockRedis.mockResolvedValueOnce(null);
      mockMongo.mockResolvedValueOnce([]);
      const res = await request(app).get(`/media/setTime/${VALID_UID}/video/external`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toContain('cannot find external');
    });

    test('empty playlist (total < 1) returns error (line 543)', async () => {
      mockMongo.mockResolvedValueOnce([{ _id: 'yif_empty', tags: [] }]);
      mockRedis.mockResolvedValueOnce([]);
      mockRedis.mockResolvedValueOnce(null);
      mockGetSingleId.mockResolvedValueOnce([{ id: null }, false, 0]);
      const res = await request(app).get('/media/setTime/yif_empty/video').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toContain('playlist is empty');
    });

    test('ret_rest with obj.id calls setTag again (line 546)', async () => {
      mockMongo.mockResolvedValueOnce([{ _id: 'yif_abc', tags: [] }]);
      mockRedis.mockResolvedValueOnce([]);
      mockRedis.mockResolvedValueOnce(null);
      mockGetSingleId.mockResolvedValueOnce([
        { id: VALID_UID, name: 'Ep1' }, false, 5,
      ]);
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, tags: [] }]);
      mockRedis.mockResolvedValueOnce([]);
      mockRedis.mockResolvedValueOnce('10');
      const res = await request(app).get('/media/setTime/yif_abc/video').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.playlist.obj.id).toBe(VALID_UID);
      expect(res.body.time).toBe('10');
    });

    test('ret_rest with is_new=true stores record via Redis hmset (line 545)', async () => {
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, tags: [] }]);
      mockRedis.mockResolvedValueOnce([]);
      mockRedis.mockResolvedValueOnce(null);
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, owner: 'yify', url: 'http%3A%2F%2Fexample.com' }]);
      mockGetSingleId.mockResolvedValueOnce([
        { id: VALID_UID, name: 'Ep1' }, false, 5,
        ['item1', 'item2'], 'pageN', 'pageP', 'tok123', true,
      ]);
      // new_rest(true): Redis hmset
      mockRedis.mockResolvedValueOnce('OK');
      // setTag(obj.id)
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, tags: [] }]);
      mockRedis.mockResolvedValueOnce([]);
      mockRedis.mockResolvedValueOnce(null);
      const res = await request(app).get(`/media/setTime/${VALID_UID}/video/external`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.playlist.obj_arr).toEqual(['item1', 'item2']);
      expect(res.body.playlist.pageN).toBe('pageN');
      expect(res.body.playlist.pageP).toBe('pageP');
      expect(res.body.playlist.pageToken).toBe('tok123');
    });

    test('first() with invalid obj format returns error (line 506)', async () => {
      // yif_ prefix: playlist=3. obj='badobj' doesn't match digit pattern
      const res = await request(app).get('/media/setTime/yif_abc/video/badobj').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toContain('external is not vaild');
    });

    test('first() with obj passing digit regex but failing name validation (line 510)', async () => {
      // 501-char digit string passes /^\d+$/ but fails isValidString 'name' (>500 chars)
      const longDigit = '1'.repeat(501);
      const res = await request(app).get(`/media/setTime/yif_abc/video/${longDigit}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toContain('external is not vaild');
    });

    test('playlist=2 with back parameter (line 569)', async () => {
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, tags: [] }]);
      mockRedis.mockResolvedValueOnce([]);
      mockRedis.mockResolvedValueOnce(null);
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, owner: 'yify', url: 'http%3A%2F%2Fexample.com' }]);
      mockGetSingleId.mockResolvedValueOnce([{ id: null }, true, 5, null, null, null, null, false]);
      const res = await request(app).get(`/media/setTime/${VALID_UID}/video/external/tok/back`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockGetSingleId).toHaveBeenCalledWith('yify', expect.any(String), 1, null, 'back');
    });

    test('type=music with playlist: no time in response (line 555)', async () => {
      mockMongo.mockResolvedValueOnce([{ _id: 'yif_mus', tags: [] }]);
      mockRedis.mockResolvedValueOnce([]);
      mockRedis.mockResolvedValueOnce(null);
      mockGetSingleId.mockResolvedValueOnce([
        { id: VALID_UID, name: 'Song1' }, false, 3,
      ]);
      mockMongo.mockResolvedValueOnce([{ _id: VALID_UID, tags: [] }]);
      mockRedis.mockResolvedValueOnce([]);
      mockRedis.mockResolvedValueOnce('99');
      const res = await request(app).get('/media/setTime/yif_mus/music').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.time).toBeUndefined();
    });
    }); // end nested describe('playlist branches')
  });
});
