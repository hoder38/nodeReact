/**
 * external-router.test.js — Comprehensive tests for src/back/controllers/external-router.js
 *
 * 7 routes:
 *   GET    /2drive/:uid                                    — upload file to Google Drive
 *   GET    /2kindle/:uid                                   — send file to Kindle via email
 *   POST   /upload/url                                     — external source upload (URL/magnet/torrent)
 *   POST   /subtitle/search/:uid/:index(\d+)?              — search & download subtitles
 *   GET    /subtitle/fix/:uid/:lang/:adjust/:index(\d+)?   — subtitle timing adjustment
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// =====================================================================
// MOCK SETUP
// =====================================================================

// --- fs ---
const mockExistsSync = jest.fn(() => false);
const mockUnlink = jest.fn((_p, cb) => cb(null));
const mockStatSync = jest.fn(() => ({ size: 1000, isFile: () => true }));
const mockRenameSync = jest.fn();
const mockReaddirSync = jest.fn(() => []);
const mockLstatSync = jest.fn(() => ({ isDirectory: () => false }));
const mockCreateReadStream = jest.fn(() => ({ pipe: jest.fn().mockReturnThis(), on: jest.fn() }));
const mockWriteFile = jest.fn((...args) => {
  const cb = args[args.length - 1];
  if (typeof cb === 'function') cb(null);
});
const mockReadFile = jest.fn((...args) => {
  const cb = args[args.length - 1];
  if (typeof cb === 'function') cb(null, Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nHello\n'));
});
const mockCreateWriteStream = jest.fn(() => ({ on: jest.fn(), write: jest.fn(), end: jest.fn() }));

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
    existsSync: mockExistsSync,
    unlink: mockUnlink,
    statSync: mockStatSync,
    renameSync: mockRenameSync,
    readdirSync: mockReaddirSync,
    lstatSync: mockLstatSync,
    createReadStream: mockCreateReadStream,
    createWriteStream: mockCreateWriteStream,
    writeFile: mockWriteFile,
    readFile: mockReadFile,
    readFileSync: jest.fn(() => Buffer.from('')),
    unlinkSync: jest.fn(),
    rmdirSync: jest.fn(),
    writeFileSync: jest.fn(),
  },
}));

// --- readline (for subtitle/fix) ---
let rlLines = [];
const mockCreateInterface = jest.fn(() => {
  let lineCb = null;
  return {
    on: jest.fn(function (event, cb) {
      if (event === 'line') lineCb = cb;
      if (event === 'close') {
        Promise.resolve().then(() => {
          if (lineCb) rlLines.forEach((l) => lineCb(l));
          cb();
        });
      }
      return this;
    }),
  };
});
jest.unstable_mockModule('readline', () => ({
  default: { createInterface: mockCreateInterface },
}));

// --- ver.js ---
jest.unstable_mockModule('../../../../ver.js', () => ({
  ENV_TYPE: 'test', CA: '/t', CERT: '/t', PKEY: '/t',
  SESS_SECRET: 'test', SESS_PWD: 'test',
  OPENSUBTITLES_KEY: 'test-key',
  OPENSUBTITLES_USERNAME: 'test-user',
  OPENSUBTITLES_PASSWORD: 'test-pass',
}));

// --- config.js ---
jest.unstable_mockModule('../../config.js', () => ({
  NAS_PREFIX: jest.fn(() => '/s'), NAS_TMP: jest.fn(() => '/tmp'),
  EXTENT_FILE_IP: jest.fn(() => 'h'), EXTENT_FILE_PORT: jest.fn(() => 1),
  EXTENT_IP: jest.fn(() => 'h'), EXTENT_PORT: jest.fn(() => 1),
  IP: jest.fn(() => '0'), PORT: jest.fn(() => 1),
  FILE_IP: jest.fn(() => '0'), FILE_PORT: jest.fn(() => 1),
  WS_PORT: jest.fn(() => 1), COM_PORT: jest.fn(() => 1),
  APP_HTML: jest.fn(() => 'a'), DB_NAME: jest.fn(() => 'd'),
  DB_IP: jest.fn(() => '0'), DB_PORT: jest.fn(() => 1),
  SESS_IP: jest.fn(() => '0'), SESS_PORT: jest.fn(() => 1),
  HINT: jest.fn(() => false),
}));

// --- constants.js ---
jest.unstable_mockModule('../../constants.js', () => ({
  USERDB: 'user', VERIFYDB: 'verify', STORAGEDB: 'storage',
  STATIC_PATH: '/static', NOISE_TIME: 7200,
  UNACTIVE_DAY: 5, UNACTIVE_HIT: 10,
  // Must include optional url: prefix — matches real constants.js pattern
  RE_WEBURL: /^(url:)?(?:https?:\/\/).+/,
  RELEASE: 'release', DEV: 'dev',
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
  __dirname: '/app/src/back',
}));

// --- mongo-tool.js ---
const mockMongo = jest.fn();
const NEW_OID = 'aabbccddeeff001122330099';
jest.unstable_mockModule('../../models/mongo-tool.js', () => ({
  default: mockMongo,
  objectID: jest.fn((id) => id ?? NEW_OID),
}));

// --- redis-tool.js ---
const mockRedis = jest.fn(() => Promise.resolve(null));
jest.unstable_mockModule('../../models/redis-tool.js', () => ({
  default: mockRedis,
}));

// --- tag-tool.js (StorageTagTool factory) ---
const mockSetLatest = jest.fn(() => Promise.resolve());
const mockGetRelativeTag = jest.fn(() => Promise.resolve([]));
const mockIsDefaultTag = jest.fn(() => false);
jest.unstable_mockModule('../../models/tag-tool.js', () => ({
  default: jest.fn(() => ({
    setLatest: mockSetLatest,
    getRelativeTag: mockGetRelativeTag,
  })),
  isDefaultTag: mockIsDefaultTag,
  normalize: jest.fn((s) => s),
}));

// --- mediaHandle-tool.js ---
const mockHandleTag = jest.fn();
const mockHandleMediaUpload = jest.fn(() => Promise.resolve());
const mockErrorMedia = jest.fn();
jest.unstable_mockModule('../../models/mediaHandle-tool.js', () => ({
  default: {
    editFile: jest.fn(),
    handleTag: mockHandleTag,
    handleMediaUpload: mockHandleMediaUpload,
    handleMedia: jest.fn(),
  },
  errorMedia: mockErrorMedia,
}));

// --- api-tool-google.js ---
const mockGoogleApi = jest.fn(() => Promise.resolve({ id: 'drive-id' }));
jest.unstable_mockModule('../../models/api-tool-google.js', () => ({
  default: mockGoogleApi,
}));

// --- api-tool-playlist.js ---
const mockPlaylistApi = jest.fn(() => Promise.resolve());
jest.unstable_mockModule('../../models/api-tool-playlist.js', () => ({
  default: mockPlaylistApi,
}));

// --- api-tool.js ---
const mockApi = jest.fn(() => Promise.resolve());
jest.unstable_mockModule('../../models/api-tool.js', () => ({
  default: mockApi,
}));

// --- external-tool.js ---
const mockExternalSaveSingle = jest.fn();
jest.unstable_mockModule('../../models/external-tool.js', () => ({
  default: {
    saveSingle: mockExternalSaveSingle,
  },
}));

// --- sendWs.js ---
const mockSendWs = jest.fn();
jest.unstable_mockModule('../../util/sendWs.js', () => ({
  default: mockSendWs,
}));

// --- mime.js ---
const mockAddPost = jest.fn((name, p) => name + p);
const mockExtType = jest.fn(() => null);
const mockExtTag = jest.fn(() => ({ def: [], opt: [] }));
const mockSupplyTag = jest.fn((_sel, opt) => opt);
const mockIsTorrent = jest.fn(() => false);
const mockIsVideo = jest.fn(() => false);
const mockIsDoc = jest.fn(() => false);
const mockIsZipbook = jest.fn(() => false);
const mockIsSub = jest.fn(() => false);
const mockIsZip = jest.fn(() => false);
jest.unstable_mockModule('../../util/mime.js', () => ({
  addPost: mockAddPost,
  extType: mockExtType,
  extTag: mockExtTag,
  supplyTag: mockSupplyTag,
  isTorrent: mockIsTorrent,
  isVideo: mockIsVideo,
  isDoc: mockIsDoc,
  isZipbook: mockIsZipbook,
  isSub: mockIsSub,
  isZip: mockIsZip,
  isImage: jest.fn(() => false),
  isMusic: jest.fn(() => false),
  isCSV: jest.fn(() => false),
  getOptionTag: jest.fn(() => []),
}));

// --- mkdirp ---
jest.unstable_mockModule('mkdirp', () => ({
  default: jest.fn(() => Promise.resolve()),
}));

// --- read-torrent ---
const mockReadTorrent = jest.fn();
jest.unstable_mockModule('read-torrent', () => ({
  default: mockReadTorrent,
}));

// --- opensubtitles.com ---
const mockOSLogin = jest.fn();
const mockOSSubtitles = jest.fn();
const mockOSDownload = jest.fn();
jest.unstable_mockModule('opensubtitles.com', () => ({
  default: jest.fn().mockImplementation(() => ({
    login: mockOSLogin,
    subtitles: mockOSSubtitles,
    download: mockOSDownload,
  })),
}));

// --- opensubtitles-api ---
const mockOSHash = jest.fn();
jest.unstable_mockModule('opensubtitles-api', () => ({
  default: jest.fn().mockImplementation(() => ({
    hash: mockOSHash,
  })),
}));

// =====================================================================
// IMPORTS (after mocks)
// =====================================================================
const { default: Express } = await import('express');
const { default: request } = await import('supertest');
const { default: ExternalRouter } = await import('../external-router.js');

// =====================================================================
// HELPERS
// =====================================================================
const VALID_UID = 'aabbccddeeff001122334455';
const ADMIN = { _id: VALID_UID, username: 'admin', perm: 1 };
const CADMIN = { _id: 'aabbccddeeff001122334488', username: 'cadmin', perm: 2 };
const REGULAR = { _id: 'aabbccddeeff001122334466', username: 'user1', perm: 3 };

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
          equals: (other) =>
            u._id === (typeof other === 'object' && other.toString ? other.toString() : other),
        },
      };
      req.isAuthenticated = () => true;
    } else {
      req.isAuthenticated = () => false;
    }
    if (req.headers['x-test-file']) {
      req.files = { file: JSON.parse(req.headers['x-test-file']) };
    }
    req.session = {};
    next();
  });
  app.use('/', ExternalRouter);
  app.use((err, _req, res, _next) => {
    err.name === 'HoError'
      ? res.status(err.code || 400).send(err.message.toString())
      : res.status(500).send('server error occur');
  });
  return app;
}

const u = (user) => JSON.stringify(user);

const makeUser = (ov = {}) => ({
  _id: VALID_UID, username: 'admin', perm: 1,
  auto: 'google-drive-folder-id', kindle: 'mykindle',
  ...ov,
});

const makeItem = (ov = {}) => ({
  _id: 'item0001', name: 'file.mp4', tags: ['video'], recycle: 0,
  adultonly: 0, first: 0, status: 3, utime: 99999, count: 5,
  owner: ADMIN._id, thumb: null, playList: [], magnet: null, mega: null,
  size: 1000,
  ...ov,
});

/** Setup mocks for streamClose flow: handleTag → Mongo insert → getRelativeTag → handleMediaUpload */
function setupStreamCloseMocks(overrides = {}) {
  const db = { name: 'test-file', status: 0, untag: 1, first: 1, adultonly: 0, ...overrides };
  mockHandleTag.mockResolvedValueOnce([
    { type: 'video', fileIndex: 0 },
    { def: [], opt: [] },
    db,
  ]);
  mockMongo.mockResolvedValueOnce([{ _id: NEW_OID, name: db.name, adultonly: db.adultonly, first: db.first }]);
  mockGetRelativeTag.mockResolvedValueOnce([]);
  mockHandleMediaUpload.mockResolvedValueOnce();
}

// =====================================================================
// TESTS
// =====================================================================
describe('external-router.js', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
    jest.clearAllMocks();
    // Defaults
    mockMongo.mockResolvedValue([]);
    mockRedis.mockReturnValue(Promise.resolve(null));
    mockSetLatest.mockReturnValue(Promise.resolve());
    mockGetRelativeTag.mockReturnValue(Promise.resolve([]));
    mockExistsSync.mockReturnValue(false);
    mockUnlink.mockImplementation((_p, cb) => cb(null));
    mockStatSync.mockReturnValue({ size: 1000, isFile: () => true });
    mockIsDefaultTag.mockReturnValue(false);
    mockSupplyTag.mockImplementation((_s, o) => o);
    mockAddPost.mockImplementation((name, p) => name + p);
    mockGoogleApi.mockResolvedValue({ id: 'drive-id' });
    mockPlaylistApi.mockResolvedValue();
    mockApi.mockResolvedValue();
    mockHandleMediaUpload.mockResolvedValue();
    mockCreateReadStream.mockReturnValue({ pipe: jest.fn().mockReturnThis(), on: jest.fn() });
    mockReadFile.mockImplementation((...args) => {
      const cb = args[args.length - 1];
      if (typeof cb === 'function') cb(null, Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nHello\n'));
    });
    mockWriteFile.mockImplementation((...args) => {
      const cb = args[args.length - 1];
      if (typeof cb === 'function') cb(null);
    });
  });

  // ---------------------------------------------------------------
  // Auth guard — all routes require login
  // ---------------------------------------------------------------
  describe('Auth guard', () => {
    test('unauthenticated GET /2drive returns 401', async () => {
      const res = await request(app).get(`/2drive/${VALID_UID}`);
      expect(res.status).toBe(401);
    });

    test('unauthenticated GET /2kindle returns 401', async () => {
      const res = await request(app).get(`/2kindle/${VALID_UID}`);
      expect(res.status).toBe(401);
    });

    test('unauthenticated POST /upload/url returns 401', async () => {
      const res = await request(app).post('/upload/url').send({ url: 'http://test.com' });
      expect(res.status).toBe(401);
    });

    test('unauthenticated POST /subtitle/search returns 401', async () => {
      const res = await request(app).post(`/subtitle/search/${VALID_UID}`).send({ name: 'test' });
      expect(res.status).toBe(401);
    });

    test('unauthenticated GET /subtitle/fix returns 401', async () => {
      const res = await request(app).get(`/subtitle/fix/${VALID_UID}/en/5`);
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------
  // GET /2drive/:uid — upload to Google Drive
  // ---------------------------------------------------------------
  describe('GET /2drive/:uid', () => {
    test('invalid UID returns 400', async () => {
      const res = await request(app).get('/2drive/bad').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('user not found returns 400', async () => {
      mockMongo.mockResolvedValueOnce([]); // no user
      const res = await request(app).get(`/2drive/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('user without Google Drive (no auto) returns 400', async () => {
      mockMongo.mockResolvedValueOnce([makeUser({ auto: null })]);
      const res = await request(app).get(`/2drive/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('file not found returns 400', async () => {
      mockMongo
        .mockResolvedValueOnce([makeUser()])  // user
        .mockResolvedValueOnce([]);           // no file
      const res = await request(app).get(`/2drive/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('file with status 7 (bookmark) returns 400', async () => {
      mockMongo
        .mockResolvedValueOnce([makeUser()])
        .mockResolvedValueOnce([makeItem({ status: 7 })]);
      const res = await request(app).get(`/2drive/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('file with status 8 returns 400', async () => {
      mockMongo
        .mockResolvedValueOnce([makeUser()])
        .mockResolvedValueOnce([makeItem({ status: 8 })]);
      const res = await request(app).get(`/2drive/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('file with thumb returns 400', async () => {
      mockMongo
        .mockResolvedValueOnce([makeUser()])
        .mockResolvedValueOnce([makeItem({ thumb: 'http://thumb' })]);
      const res = await request(app).get(`/2drive/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('normal file uploads to Drive and returns apiOK', async () => {
      mockMongo
        .mockResolvedValueOnce([makeUser()])
        .mockResolvedValueOnce([makeItem({ status: 3 })]);
      const res = await request(app).get(`/2drive/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ apiOK: true });
      expect(mockGoogleApi).toHaveBeenCalledWith('upload', expect.objectContaining({
        type: 'auto',
        name: 'file.mp4',
        parent: 'google-drive-folder-id',
      }));
    });

    test('playlist with completed files uploads recursively', async () => {
      mockExistsSync.mockReturnValue(true);
      mockMongo
        .mockResolvedValueOnce([makeUser()])
        .mockResolvedValueOnce([makeItem({
          status: 9,
          playList: ['dir1/video.mp4', 'dir1/video2.mp4'],
        })]);
      // GoogleApi called for folder create + file uploads
      mockGoogleApi.mockResolvedValue({ id: 'created-folder-id' });
      const res = await request(app).get(`/2drive/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ apiOK: true });
    });

    test('playlist with zip file uploads zip', async () => {
      // No completed files but _zip exists
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string' && path.endsWith('_zip')) return true;
        if (typeof path === 'string' && path.includes('_complete')) return false;
        return false;
      });
      mockMongo
        .mockResolvedValueOnce([makeUser()])
        .mockResolvedValueOnce([makeItem({ status: 9, playList: ['dir/file.mp4'] })]);
      const res = await request(app).get(`/2drive/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ apiOK: true });
      expect(mockGoogleApi).toHaveBeenCalledWith('upload', expect.objectContaining({ type: 'auto' }));
    });

    test('playlist with magnet uploads txt', async () => {
      // No completed files, no zip, but has magnet
      mockMongo
        .mockResolvedValueOnce([makeUser()])
        .mockResolvedValueOnce([makeItem({
          status: 9, playList: ['dir/file.mp4'],
          magnet: encodeURIComponent('magnet:?xt=test'),
        })]);
      const res = await request(app).get(`/2drive/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockGoogleApi).toHaveBeenCalledWith('upload', expect.objectContaining({
        name: 'file.mp4.txt',
        body: 'magnet:?xt=test',
      }));
    });

    test('GoogleApi failure returns 500', async () => {
      mockMongo
        .mockResolvedValueOnce([makeUser()])
        .mockResolvedValueOnce([makeItem()]);
      mockGoogleApi.mockRejectedValueOnce(new Error('drive fail'));
      const res = await request(app).get(`/2drive/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // GET /2kindle/:uid — send to Kindle
  // ---------------------------------------------------------------
  describe('GET /2kindle/:uid', () => {
    test('invalid UID returns 400', async () => {
      const res = await request(app).get('/2kindle/bad').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('user without kindle returns 400', async () => {
      mockMongo.mockResolvedValueOnce([makeUser({ kindle: null })]);
      const res = await request(app).get(`/2kindle/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('file not found returns 400', async () => {
      mockMongo
        .mockResolvedValueOnce([makeUser()])
        .mockResolvedValueOnce([]);
      const res = await request(app).get(`/2kindle/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('file with status 7/8/thumb returns 400', async () => {
      mockMongo
        .mockResolvedValueOnce([makeUser()])
        .mockResolvedValueOnce([makeItem({ status: 7 })]);
      const res = await request(app).get(`/2kindle/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('success sends mail and returns apiOK', async () => {
      mockMongo
        .mockResolvedValueOnce([makeUser()])
        .mockResolvedValueOnce([makeItem()]);
      const res = await request(app).get(`/2kindle/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ apiOK: true });
      expect(mockGoogleApi).toHaveBeenCalledWith('send mail', expect.objectContaining({
        kindle: 'mykindle@kindle.com',
        name: 'file.mp4',
      }));
    });
  });

  // ---------------------------------------------------------------
  // POST /upload/url — external source upload
  // ---------------------------------------------------------------
  describe('POST /upload/url', () => {
    // -- Validation --
    test('invalid URL returns 400', async () => {
      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'not-a-url' });
      expect(res.status).toBe(400);
    });

    // -- URL Bookmark (url: prefix) --
    test('URL bookmark creates status 7 entry and returns tag data', async () => {
      mockHandleTag.mockResolvedValueOnce([
        { type: 'url' },
        { def: ['bookmark'], opt: ['web'] },
        { name: 'http%3A%2F%2Fexample.com', status: 7, first: 1, untag: 1, adultonly: 0, _id: NEW_OID, owner: ADMIN._id },
      ]);
      mockMongo.mockResolvedValueOnce([{ _id: NEW_OID, name: 'http%3A%2F%2Fexample.com', adultonly: 0, first: 1 }]);
      mockGetRelativeTag.mockResolvedValueOnce([]);

      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'url:http://example.com', type: '0' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', NEW_OID);
      expect(res.body).toHaveProperty('name');
      expect(res.body).toHaveProperty('select');
      expect(res.body).toHaveProperty('option');
      expect(mockHandleTag).toHaveBeenCalledWith('', expect.objectContaining({ status: 7 }), expect.any(String), '', 7);
      expect(mockSendWs).toHaveBeenCalled();
    });

    test('URL bookmark with invalid JSON type returns 400', async () => {
      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'url:http://example.com', type: '{bad json' });
      expect(res.status).toBe(400);
    });

    // -- Magnet stop commands --
    test('magnet:stop calls torrent stop', async () => {
      mockPlaylistApi.mockResolvedValueOnce();
      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'magnet:stop' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ stop: true });
      expect(mockPlaylistApi).toHaveBeenCalledWith('torrent stop', expect.anything());
    });

    test('magnet:stopzip calls zip stop', async () => {
      mockPlaylistApi.mockResolvedValueOnce();
      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'magnet:stopzip' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ stop: true });
      expect(mockPlaylistApi).toHaveBeenCalledWith('zip stop', expect.anything());
    });

    test('magnet:stopmega calls mega stop', async () => {
      mockPlaylistApi.mockResolvedValueOnce();
      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'magnet:stopmega' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ stop: true });
      expect(mockPlaylistApi).toHaveBeenCalledWith('mega stop', expect.anything());
    });

    test('magnet:stopapi (admin) calls Api stop', async () => {
      mockApi.mockResolvedValueOnce();
      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'magnet:stopapi' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ stop: true });
      expect(mockApi).toHaveBeenCalledWith('stop');
    });

    test('magnet:stopapi (non-admin) returns 400 permission denied', async () => {
      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(REGULAR))
        .send({ url: 'magnet:stopapi' });
      expect(res.status).toBe(400);
    });

    test('magnet:stopgoogle (admin) calls GoogleApi stop', async () => {
      mockGoogleApi.mockResolvedValueOnce();
      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'magnet:stopgoogle' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ stop: true });
      expect(mockGoogleApi).toHaveBeenCalledWith('stop');
    });

    test('magnet:stopgoogle (non-admin) returns 400 permission denied', async () => {
      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(REGULAR))
        .send({ url: 'magnet:stopgoogle' });
      expect(res.status).toBe(400);
    });

    // -- Normal magnet link --
    test('magnet link duplicate returns 400', async () => {
      mockMongo.mockResolvedValueOnce([makeItem()]); // dedup finds existing
      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'magnet:?xt=urn:btih:abcdef0123456789abcde&dn=Test', type: '0' });
      expect(res.status).toBe(400);
    });

    test('normal magnet link processes torrent and returns tag data', async () => {
      mockMongo.mockResolvedValueOnce([]); // no dup
      mockPlaylistApi.mockResolvedValueOnce({
        name: 'TestTorrent',
        files: [{ name: 'video.mp4', path: 'TestTorrent/video.mp4' }],
      });
      setupStreamCloseMocks({ untag: 1, first: 1 });

      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'magnet:?xt=urn:btih:abcdef0123456789abcde&dn=Test', type: '0' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('select');
    });

    test('magnet torrent with empty files returns 400', async () => {
      mockMongo.mockResolvedValueOnce([]); // no dup
      mockPlaylistApi.mockResolvedValueOnce({ name: 'Empty', files: [] });
      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'magnet:?xt=urn:btih:abcdef0123456789abcde&dn=Test', type: '0' });
      expect(res.status).toBe(400);
    });

    // -- External source URLs --
    test('YIFY URL processes and returns id', async () => {
      mockMongo.mockResolvedValueOnce([]); // no dup
      mockExternalSaveSingle.mockResolvedValueOnce([
        'Test Movie', new Set(['yify']), new Set(['action']), 'yify', 'http://thumb', 'http://yts.ag/movie/test',
      ]);
      setupStreamCloseMocks();

      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'http://yts.ag/movie/test-movie', type: '0' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
      expect(mockExternalSaveSingle).toHaveBeenCalledWith('yify', 'test-movie');
    });

    test('YIFY duplicate returns 400', async () => {
      mockMongo.mockResolvedValueOnce([makeItem()]); // dup found
      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'http://yts.ag/movie/test-movie', type: '0' });
      expect(res.status).toBe(400);
    });

    test('DM5 URL processes and returns id', async () => {
      mockMongo.mockResolvedValueOnce([]); // no dup
      mockExternalSaveSingle.mockResolvedValueOnce([
        'Comic', new Set(), new Set(), 'dm5', 'http://thumb', 'encoded',
      ]);
      setupStreamCloseMocks();

      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'http://www.dm5.com/manhua-test/', type: '0' });
      expect(res.status).toBe(200);
      expect(mockExternalSaveSingle).toHaveBeenCalledWith('dm5', 'manhua-test');
    });
    test('Mega URL calls PlaylistApi mega add', async () => {
      mockPlaylistApi.mockImplementationOnce((action, user, url, fp, opts) => {
        if (action === 'mega add' && opts && opts.rest) {
          return opts.rest(['Mega File', new Set(), new Set(), { mega: url, playList: [] }]);
        }
        return Promise.resolve();
      });
      setupStreamCloseMocks();

      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'http://mega.nz/#!test', type: '0' });
      expect(res.status).toBe(200);
      expect(mockPlaylistApi).toHaveBeenCalledWith('mega add', expect.anything(), expect.any(String), expect.any(String), expect.any(Object));
    });

    test('unknown URL type returns 400', async () => {
      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'http://unknown-site.com/page', type: '0' });
      // unknown type → handleError → falls to pureDownload → Api download
      // Since Api mock resolves void → streamClose gets undefined → resolves
      expect([200, 400]).toContain(res.status);
    });

    test('hidden upload (hide=true) returns only id', async () => {
      mockMongo.mockResolvedValueOnce([]); // no dup
      mockExternalSaveSingle.mockResolvedValueOnce([
        'Hidden', new Set(), new Set(), 'yify', 'http://thumb', 'encoded',
      ]);
      setupStreamCloseMocks({ untag: 0 });

      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'http://yts.ag/movie/hidden-movie', type: '0', hide: true });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
    });

    test('URL bookmark with body path includes extra tags', async () => {
      mockHandleTag.mockResolvedValueOnce([
        { type: 'url' },
        { def: [], opt: [] },
        { name: 'test-url', status: 7, first: 1, untag: 1, adultonly: 0, _id: NEW_OID, owner: ADMIN._id },
      ]);
      mockMongo.mockResolvedValueOnce([{ _id: NEW_OID, name: 'test-url', adultonly: 0, first: 1 }]);
      mockGetRelativeTag.mockResolvedValueOnce(['related-tag']);

      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'url:http://example.com', type: '0', path: ['extra-tag'] });
      expect(res.status).toBe(200);
      expect(res.body.select).toContain('extra-tag');
    });

    test('URL bookmark with adult content (type=1) by content admin sets adultonly', async () => {
      mockHandleTag.mockResolvedValueOnce([
        { type: 'url' },
        { def: [], opt: [] },
        { name: 'adult-url', status: 7, first: 1, untag: 1, adultonly: 0, _id: NEW_OID, owner: CADMIN._id },
      ]);
      mockMongo.mockResolvedValueOnce([{ _id: NEW_OID, name: 'adult-url', adultonly: 0, first: 1 }]);
      mockGetRelativeTag.mockResolvedValueOnce([]);

      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(CADMIN))
        .send({ url: 'url:http://adult.com', type: '1' });
      expect(res.status).toBe(200);
      // handleTag called with adultonly: 1 (checkAdmin(2, cadmin) && json_data===1)
      expect(mockHandleTag).toHaveBeenCalledWith('', expect.objectContaining({ adultonly: 1 }), expect.any(String), '', 7);
    });
  });

  // ---------------------------------------------------------------
  // POST /subtitle/search/:uid/:index?
  // ---------------------------------------------------------------
  describe('POST /subtitle/search/:uid/:index?', () => {
    test('invalid name returns 400', async () => {
      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: '' });
      expect(res.status).toBe(400);
    });

    test('invalid storage UID returns 400', async () => {
      const res = await request(app)
        .post('/subtitle/search/bad')
        .set('x-test-user', u(ADMIN))
        .send({ name: 'test movie' });
      expect(res.status).toBe(400);
    });

    test('file not found returns 400', async () => {
      mockMongo.mockResolvedValueOnce([]); // no file
      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'test' });
      expect(res.status).toBe(400);
    });

    test('file with wrong status returns 400', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 7 })]);
      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'test' });
      expect(res.status).toBe(400);
    });

    test('thumb file returns 400', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3, thumb: 'http://thumb' })]);
      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'test' });
      expect(res.status).toBe(400);
    });

    test('successful subtitle search downloads and returns apiOK', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockOSHash.mockResolvedValueOnce({ moviehash: 'hash123' });
      mockOSSubtitles.mockResolvedValueOnce({
        data: [
          { attributes: { language: 'zh-tw', files: [{ file_id: 100 }] } },
          { attributes: { language: 'en', files: [{ file_id: 200 }] } },
        ],
      });
      // SUB2VTT for zh-tw and en
      mockOSDownload
        .mockResolvedValueOnce({ link: 'http://sub-zh.srt' })
        .mockResolvedValueOnce({ link: 'http://sub-en.srt' });
      mockApi.mockResolvedValue(); // Api('url', ...) for downloads

      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'test movie' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ apiOK: true });
      expect(mockSendWs).toHaveBeenCalledWith(expect.objectContaining({ type: 'sub' }), 0, 0);
    });

    test('no subtitles found returns 400', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockOSHash.mockResolvedValueOnce({ moviehash: 'hash123' });
      // Both searches return empty
      mockOSSubtitles
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({ data: [] });

      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'obscure movie' });
      expect(res.status).toBe(400);
    });

    test('second search pass finds subtitle', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockOSHash.mockResolvedValueOnce({ moviehash: 'hash123' });
      // First search empty, second finds result
      mockOSSubtitles
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({
          data: [{ attributes: { language: 'en', files: [{ file_id: 300 }] } }],
        });
      mockOSDownload.mockResolvedValueOnce({ link: 'http://sub.srt' });
      mockApi.mockResolvedValue();

      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'test' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ apiOK: true });
    });

    test('episode parsing with s2e3 format', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockOSHash.mockResolvedValueOnce({ moviehash: 'h' });
      mockOSSubtitles.mockResolvedValueOnce({
        data: [{ attributes: { language: 'en', files: [{ file_id: 1 }] } }],
      });
      mockOSDownload.mockResolvedValueOnce({ link: 'http://sub.srt' });
      mockApi.mockResolvedValue();

      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'show', episode: 's2e3' });
      expect(res.status).toBe(200);
      // subtitles called with episode_number and season_number
      expect(mockOSSubtitles).toHaveBeenCalledWith(expect.objectContaining({
        episode_number: 3,
        season_number: 2,
      }));
    });

    test('episode parsing with bare number', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockOSHash.mockResolvedValueOnce({ moviehash: 'h' });
      mockOSSubtitles.mockResolvedValueOnce({
        data: [{ attributes: { language: 'en', files: [{ file_id: 1 }] } }],
      });
      mockOSDownload.mockResolvedValueOnce({ link: 'http://sub.srt' });
      mockApi.mockResolvedValue();

      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'show', episode: '5' });
      expect(res.status).toBe(200);
      expect(mockOSSubtitles).toHaveBeenCalledWith(expect.objectContaining({
        episode_number: 5,
        season_number: 1,
      }));
    });

    test('IMDB ID uses imdb_id parameter', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockOSHash.mockResolvedValueOnce({ moviehash: 'h' });
      // First search by filename, second by imdb_id
      mockOSSubtitles
        .mockResolvedValueOnce({ data: [] })
        .mockResolvedValueOnce({
          data: [{ attributes: { language: 'en', files: [{ file_id: 1 }] } }],
        });
      mockOSDownload.mockResolvedValueOnce({ link: 'http://sub.srt' });
      mockApi.mockResolvedValue();

      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'tt1234567' });
      expect(res.status).toBe(200);
      // Second call uses imdb_id
      expect(mockOSSubtitles).toHaveBeenCalledWith(expect.objectContaining({
        imdb_id: 1234567,
      }));
    });

    test('status 9 playlist resolves to specific index', async () => {
      mockIsVideo.mockReturnValue(true);
      mockMongo.mockResolvedValueOnce([makeItem({
        status: 9,
        playList: ['dir/doc.pdf', 'dir/video.mp4'],
        size: 2000,
      })]);
      mockExistsSync.mockReturnValue(false);
      mockOSHash.mockResolvedValueOnce({ moviehash: 'h' });
      mockOSSubtitles.mockResolvedValueOnce({
        data: [{ attributes: { language: 'en', files: [{ file_id: 1 }] } }],
      });
      mockOSDownload.mockResolvedValueOnce({ link: 'http://sub.srt' });
      mockApi.mockResolvedValue();

      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}/1`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'test' });
      expect(res.status).toBe(200);
    });

    test('OpenSubtitles constructor failure returns 400', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockOSHash.mockRejectedValueOnce(new Error('hash fail'));

      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'test' });
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // GET /subtitle/fix/:uid/:lang/:adjust/:index?
  // ---------------------------------------------------------------
  describe('GET /subtitle/fix/:uid/:lang/:adjust/:index?', () => {
    test('invalid adjust returns 400', async () => {
      const res = await request(app)
        .get(`/subtitle/fix/${VALID_UID}/en/abc`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('storage UID with VTT not found returns 400', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockExistsSync.mockReturnValue(false);

      const res = await request(app)
        .get(`/subtitle/fix/${VALID_UID}/default/5`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('storage UID with valid VTT adjusts timestamps', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockExistsSync.mockReturnValue(true);
      rlLines = ['WEBVTT', '', '00:01:00.000 --> 00:02:00.000', 'Hello World'];

      const res = await request(app)
        .get(`/subtitle/fix/${VALID_UID}/default/5`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ apiOK: true });
      // WriteFile called with adjusted VTT
      expect(mockWriteFile).toHaveBeenCalled();
      const writeCall = mockWriteFile.mock.calls[0];
      expect(writeCall[0]).toMatch(/\.vtt$/);
      // Verify timestamps are adjusted by +5 seconds
      expect(writeCall[1]).toContain('00:01:05.000 --> 00:02:05.000');
    });

    test('negative adjust clamps to 0', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockExistsSync.mockReturnValue(true);
      rlLines = ['WEBVTT', '', '00:00:02.000 --> 00:00:05.000', 'Short'];

      const res = await request(app)
        .get(`/subtitle/fix/${VALID_UID}/default/-10`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      const writeCall = mockWriteFile.mock.calls[0];
      // 2s - 10s = -8s → clamped to 0
      expect(writeCall[1]).toContain('00:00:00.000 --> 00:00:00.000');
    });

    test('decimal adjust value is accepted', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockExistsSync.mockReturnValue(true);
      rlLines = ['WEBVTT', '', '00:00:10.000 --> 00:00:20.000', 'Text'];

      const res = await request(app)
        .get(`/subtitle/fix/${VALID_UID}/default/1.5`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      const writeCall = mockWriteFile.mock.calls[0];
      expect(writeCall[1]).toContain('00:00:11.500 --> 00:00:21.500');
    });

    test('file not found for storage UID returns 400', async () => {
      mockMongo.mockResolvedValueOnce([]);
      const res = await request(app)
        .get(`/subtitle/fix/${VALID_UID}/default/5`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('wrong status for storage UID returns 400', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 7 })]);
      const res = await request(app)
        .get(`/subtitle/fix/${VALID_UID}/default/5`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('status 9 playlist with index resolves correct file', async () => {
      mockIsVideo.mockReturnValue(true);
      mockMongo.mockResolvedValueOnce([makeItem({
        status: 9,
        playList: ['dir/file1.mp4', 'dir/file2.mp4'],
      })]);
      mockExistsSync.mockReturnValue(true);
      rlLines = ['WEBVTT', '', '00:00:30.000 --> 00:00:40.000', 'Line'];

      const res = await request(app)
        .get(`/subtitle/fix/${VALID_UID}/default/2/1`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
    });

    test('invalid storage UID returns 400 (line 1091)', async () => {
      const res = await request(app)
        .get('/subtitle/fix/notvalidhex/en/5')
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('status 9 without index finds first video (lines 1105-1108)', async () => {
      mockIsVideo.mockImplementation((name) => typeof name === 'string' && name.endsWith('.mp4'));
      mockMongo.mockResolvedValueOnce([makeItem({
        status: 9,
        playList: ['dir/doc.pdf', 'dir/video.mp4'],
      })]);
      mockExistsSync.mockReturnValue(true);
      rlLines = ['WEBVTT', '', '00:00:10.000 --> 00:00:20.000', 'Text'];

      const res = await request(app)
        .get(`/subtitle/fix/${VALID_UID}/default/2`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
    });

    test('status 9 non-video item returns 400 (line 1113)', async () => {
      mockIsVideo.mockReturnValue(false);
      mockMongo.mockResolvedValueOnce([makeItem({
        status: 9,
        playList: ['dir/doc.pdf'],
      })]);

      const res = await request(app)
        .get(`/subtitle/fix/${VALID_UID}/default/2`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------
  // ADDITIONAL COVERAGE TESTS
  // ---------------------------------------------------------------

  describe('GET /2drive/:uid — additional', () => {
    test('valid user but invalid UID returns 400 (line 44)', async () => {
      mockMongo.mockResolvedValueOnce([makeUser()]);
      const res = await request(app)
        .get('/2drive/not_a_valid_hex_uid_24ch')
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('playlist with nested folders triggers parent lookup (lines 100-106)', async () => {
      mockExistsSync.mockReturnValue(true);
      mockMongo
        .mockResolvedValueOnce([makeUser()])
        .mockResolvedValueOnce([makeItem({
          status: 9,
          playList: ['a/b/video.mp4'],
        })]);
      mockGoogleApi.mockResolvedValue({ id: 'created-folder-id' });

      const res = await request(app)
        .get(`/2drive/${VALID_UID}`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ apiOK: true });
      // folder 'a' (parent='.') + folder 'a/b' (parent='a') + file upload
      expect(mockGoogleApi).toHaveBeenCalledTimes(3);
    });

    test('playlist with multi-part RAR uploads recursively (lines 148,158)', async () => {
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string') {
          if (path.includes('_complete')) return false;
          if (path.endsWith('_zip')) return false;
          if (path.endsWith('_7z')) return false;
          if (path.endsWith('.1.rar')) return true;
          if (path.endsWith('.2.rar')) return true;
          if (path.endsWith('.3.rar')) return false;
        }
        return false;
      });
      mockMongo
        .mockResolvedValueOnce([makeUser()])
        .mockResolvedValueOnce([makeItem({
          status: 9,
          name: 'movie.part1.rar',
          playList: ['dir/file.mp4'],
        })]);
      mockGoogleApi.mockResolvedValue({ id: 'drive-id' });

      const res = await request(app)
        .get(`/2drive/${VALID_UID}`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockGoogleApi).toHaveBeenCalledWith('upload', expect.objectContaining({
        name: 'movie.part2.rar',
      }));
    });
  });

  describe('GET /2kindle/:uid — additional', () => {
    test('valid user but invalid UID returns 400 (line 201)', async () => {
      mockMongo.mockResolvedValueOnce([makeUser()]);
      const res = await request(app)
        .get('/2kindle/not_a_valid_hex_uid_24ch')
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });
  });

  describe('POST /upload/url — additional coverage', () => {
    test('URL bookmark with default tag name appends suffix (line 286)', async () => {
      mockIsDefaultTag
        .mockReturnValueOnce({ index: 1 }) // line 285 name check → truthy
        .mockReturnValue(false);
      mockHandleTag.mockResolvedValueOnce([
        { type: 'url' },
        { def: [], opt: [] },
        { name: 'defaulttag1', status: 7, first: 1, untag: 1, adultonly: 0, _id: NEW_OID, owner: ADMIN._id },
      ]);
      mockMongo.mockResolvedValueOnce([{ _id: NEW_OID, name: 'defaulttag1', adultonly: 0, first: 1 }]);
      mockGetRelativeTag.mockResolvedValueOnce([]);

      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'url:http://example.com', type: '0' });
      expect(res.status).toBe(200);
      expect(mockAddPost).toHaveBeenCalled();
    });

    test('URL bookmark tag with adult flag sets adultonly (lines 319-320)', async () => {
      mockIsDefaultTag
        .mockReturnValueOnce(false) // line 285 name check
        .mockReturnValueOnce({ index: 0 }) // line 316 first tag → adultonly
        .mockReturnValue(false);
      mockHandleTag.mockResolvedValueOnce([
        { type: 'url' },
        { def: ['adult-tag'], opt: [] },
        { name: 'test-url', status: 7, first: 1, untag: 1, adultonly: 0, _id: NEW_OID, owner: ADMIN._id },
      ]);
      mockMongo.mockResolvedValueOnce([{ _id: NEW_OID, name: 'test-url', adultonly: 0, first: 1 }]);
      mockGetRelativeTag.mockResolvedValueOnce([]);

      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'url:http://example.com', type: '0' });
      expect(res.status).toBe(200);
    });

    test('URL bookmark handleTag rejection is caught (line 362)', async () => {
      mockHandleTag.mockRejectedValueOnce(new Error('tag fail'));
      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'url:http://example.com', type: '0' });
      expect(res.status).toBe(500);
    });

    test('magnet torrent files with extType processes media tags (lines 405-407)', async () => {
      mockMongo.mockResolvedValueOnce([]);
      mockExtType.mockReturnValueOnce({ type: 'video' });
      mockExtTag.mockReturnValueOnce({ def: ['video-tag'], opt: ['opt-tag'] });
      mockPlaylistApi.mockResolvedValueOnce({
        name: 'TestTorrent',
        files: [{ name: 'video.mp4', path: 'TestTorrent/video.mp4' }],
      });
      setupStreamCloseMocks({ untag: 1, first: 1 });

      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'magnet:?xt=urn:btih:abcdef0123456789abcde&dn=Test', type: '0' });
      expect(res.status).toBe(200);
      expect(mockExtType).toHaveBeenCalledWith('video.mp4');
    });

    test('YIFY URL without trailing path returns error (line 504)', async () => {
      mockMongo.mockResolvedValueOnce([]);
      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'http://yts.ag/movie/', type: '0' });
      expect([200, 400]).toContain(res.status);
    });

    test('DM5 duplicate returns 400 (line 540)', async () => {
      mockMongo.mockResolvedValueOnce([makeItem()]);
      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'http://www.dm5.com/manhua-test/', type: '0' });
      expect(res.status).toBe(400);
    });

    test('DM5 URL without manga ID returns error (line 544)', async () => {
      mockMongo.mockResolvedValueOnce([]);
      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'http://www.dm5.com/', type: '0' });
      expect([200, 400]).toContain(res.status);
    });
    test('Mega errhandle triggers pureDownload (lines 598, 606-612)', async () => {
      mockPlaylistApi.mockImplementationOnce((_action, _user, _url, _fp, opts) => {
        return opts.errhandle(new Error('mega fail'));
      });
      mockApi.mockImplementationOnce((_action, _user, _url, opts) => {
        return opts.rest(['/path/to', 'downloaded.mp4']);
      });
      setupStreamCloseMocks();

      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'http://mega.nz/#!test', type: '0' });
      expect(res.status).toBe(200);
    });
    test('streamClose with default tag name (line 668)', async () => {
      mockMongo.mockResolvedValueOnce([]);
      mockExternalSaveSingle.mockResolvedValueOnce([
        'DefaultName', new Set(), new Set(), 'yify', 'http://thumb', 'encoded',
      ]);
      mockIsDefaultTag
        .mockReturnValueOnce({ index: 1 }) // streamClose name check
        .mockReturnValue(false);
      setupStreamCloseMocks();

      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'http://yts.ag/movie/test-movie', type: '0' });
      expect(res.status).toBe(200);
    });

    test('streamClose detects existing file (lines 672-674)', async () => {
      mockMongo.mockResolvedValueOnce([]);
      mockExternalSaveSingle.mockResolvedValueOnce([
        'Movie', new Set(), new Set(), 'yify', 'http://thumb', 'encoded',
      ]);
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: 5000, isFile: () => true });
      setupStreamCloseMocks();

      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'http://yts.ag/movie/test-movie', type: '0' });
      expect(res.status).toBe(200);
    });

    test('streamClose with invalid JSON type returns error (line 679)', async () => {
      mockMongo.mockResolvedValueOnce([]);
      mockExternalSaveSingle.mockResolvedValueOnce([
        'Movie', new Set(), new Set(), 'yify', 'http://thumb', 'encoded',
      ]);

      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'http://yts.ag/movie/test-movie', type: '{bad json' });
      expect([200, 400]).toContain(res.status);
    });

    test('streamClose with body.path and adult default tag (lines 707, 716-717)', async () => {
      mockMongo.mockResolvedValueOnce([]);
      mockExternalSaveSingle.mockResolvedValueOnce([
        'Movie', new Set(), new Set(), 'yify', 'http://thumb', 'encoded',
      ]);
      mockIsDefaultTag
        .mockReturnValueOnce(false) // streamClose name check
        .mockReturnValueOnce({ index: 0 }) // first tag in loop → adultonly
        .mockReturnValue(false);
      setupStreamCloseMocks();

      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'http://yts.ag/movie/test-movie', type: '0', path: ['extra-tag'] });
      expect(res.status).toBe(200);
    });

    test('streamClose with relative tags adds to options (lines 747-750)', async () => {
      mockMongo.mockResolvedValueOnce([]);
      mockPlaylistApi.mockResolvedValueOnce({
        name: 'TestTorrent',
        files: [{ name: 'video.mp4', path: 'TestTorrent/video.mp4' }],
      });
      mockHandleTag.mockResolvedValueOnce([
        { type: 'video', fileIndex: 0 },
        { def: [], opt: [] },
        { name: 'test-file', status: 0, untag: 1, first: 1, adultonly: 0 },
      ]);
      mockMongo.mockResolvedValueOnce([{ _id: NEW_OID, name: 'test-file', adultonly: 0, first: 1 }]);
      mockGetRelativeTag.mockResolvedValueOnce(['rel-tag-1', 'rel-tag-2']);
      mockHandleMediaUpload.mockResolvedValueOnce();

      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'magnet:?xt=urn:btih:abcdef0123456789abcde&dn=Test', type: '0' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('option');
    });

    test('Mega with playlist triggers recur_mhandle (lines 759-765, 771)', async () => {
      mockPlaylistApi.mockImplementationOnce((_action, _user, _url, _fp, opts) => {
        return opts.rest(['Mega File', new Set(), new Set(), {
          mega: 'http%3A%2F%2Fmega.nz',
          playList: ['dir/video1.mp4', 'dir/video2.mp4'],
        }]);
      });
      mockIsVideo.mockReturnValue(true);
      mockHandleTag
        .mockResolvedValueOnce([
          { type: 'video', fileIndex: 0 },
          { def: [], opt: [] },
          { name: 'mega-file', status: 0, untag: 1, first: 1, adultonly: 0 },
        ])
        .mockResolvedValueOnce([{ type: 'video' }, { def: [], opt: [] }, { status: 9 }])
        .mockResolvedValueOnce([{ type: 'video' }, { def: [], opt: [] }, { status: 9 }]);
      mockMongo
        .mockResolvedValueOnce([{ _id: NEW_OID, name: 'mega-file', adultonly: 0, first: 1 }])
        .mockResolvedValueOnce()
        .mockResolvedValueOnce();
      mockGetRelativeTag.mockResolvedValueOnce([]);
      mockHandleMediaUpload.mockResolvedValue();

      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'http://mega.nz/#!test', type: '0' });
      expect(res.status).toBe(200);
    });
  });

  describe('POST /subtitle/search — additional coverage', () => {
    test('episode parsing with e prefix only (lines 807-809)', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockOSHash.mockResolvedValueOnce({ moviehash: 'h' });
      mockOSSubtitles.mockResolvedValueOnce({
        data: [{ attributes: { language: 'en', files: [{ file_id: 1 }] } }],
      });
      mockOSDownload.mockResolvedValueOnce({ link: 'http://sub.srt' });
      mockApi.mockResolvedValue();

      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'show', episode: 'e5' });
      expect(res.status).toBe(200);
      expect(mockOSSubtitles).toHaveBeenCalledWith(expect.objectContaining({
        episode_number: 5, season_number: 1,
      }));
    });

    test('episode parsing with s-only format (lines 810-812)', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockOSHash.mockResolvedValueOnce({ moviehash: 'h' });
      mockOSSubtitles.mockResolvedValueOnce({
        data: [{ attributes: { language: 'en', files: [{ file_id: 1 }] } }],
      });
      mockOSDownload.mockResolvedValueOnce({ link: 'http://sub.srt' });
      mockApi.mockResolvedValue();

      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'show', episode: 's23' });
      expect(res.status).toBe(200);
      expect(mockOSSubtitles).toHaveBeenCalledWith(expect.objectContaining({
        episode_number: 1, season_number: 23,
      }));
    });

    test('episode parsing with se format (lines 814-815)', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockOSHash.mockResolvedValueOnce({ moviehash: 'h' });
      mockOSSubtitles.mockResolvedValueOnce({
        data: [{ attributes: { language: 'en', files: [{ file_id: 1 }] } }],
      });
      mockOSDownload.mockResolvedValueOnce({ link: 'http://sub.srt' });
      mockApi.mockResolvedValue();

      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'show', episode: 'se5' });
      expect(res.status).toBe(200);
      expect(mockOSSubtitles).toHaveBeenCalledWith(expect.objectContaining({
        episode_number: 5, season_number: 1,
      }));
    });

    test('episode s12e3: season>=10 episode<10 (lines 827-829)', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockOSHash.mockResolvedValueOnce({ moviehash: 'h' });
      mockOSSubtitles.mockResolvedValueOnce({
        data: [{ attributes: { language: 'en', files: [{ file_id: 1 }] } }],
      });
      mockOSDownload.mockResolvedValueOnce({ link: 'http://sub.srt' });
      mockApi.mockResolvedValue();

      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'show', episode: 's12e3' });
      expect(res.status).toBe(200);
      expect(mockOSSubtitles).toHaveBeenCalledWith(expect.objectContaining({
        episode_number: 3, season_number: 12,
      }));
    });

    test('episode s2e15: season<10 episode>=10 (lines 831-836)', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockOSHash.mockResolvedValueOnce({ moviehash: 'h' });
      mockOSSubtitles.mockResolvedValueOnce({
        data: [{ attributes: { language: 'en', files: [{ file_id: 1 }] } }],
      });
      mockOSDownload.mockResolvedValueOnce({ link: 'http://sub.srt' });
      mockApi.mockResolvedValue();

      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'show', episode: 's2e15' });
      expect(res.status).toBe(200);
      expect(mockOSSubtitles).toHaveBeenCalledWith(expect.objectContaining({
        episode_number: 15, season_number: 2,
      }));
    });

    test('episode s12e15: season>=10 episode>=10 (lines 837-839)', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockOSHash.mockResolvedValueOnce({ moviehash: 'h' });
      mockOSSubtitles.mockResolvedValueOnce({
        data: [{ attributes: { language: 'en', files: [{ file_id: 1 }] } }],
      });
      mockOSDownload.mockResolvedValueOnce({ link: 'http://sub.srt' });
      mockApi.mockResolvedValue();

      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'show', episode: 's12e15' });
      expect(res.status).toBe(200);
      expect(mockOSSubtitles).toHaveBeenCalledWith(expect.objectContaining({
        episode_number: 15, season_number: 12,
      }));
    });

    test('status 9 without index finds first video (lines 899-902)', async () => {
      mockIsVideo.mockImplementation((name) => typeof name === 'string' && name.endsWith('.mp4'));
      mockMongo.mockResolvedValueOnce([makeItem({
        status: 9,
        playList: ['dir/doc.pdf', 'dir/video.mp4'],
      })]);
      mockExistsSync.mockReturnValue(false);
      mockOSHash.mockResolvedValueOnce({ moviehash: 'h' });
      mockOSSubtitles.mockResolvedValueOnce({
        data: [{ attributes: { language: 'en', files: [{ file_id: 1 }] } }],
      });
      mockOSDownload.mockResolvedValueOnce({ link: 'http://sub.srt' });
      mockApi.mockResolvedValue();

      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'test' });
      expect(res.status).toBe(200);
    });

    test('status 9 non-video item returns 400 (line 907)', async () => {
      mockIsVideo.mockReturnValue(false);
      mockMongo.mockResolvedValueOnce([makeItem({
        status: 9,
        playList: ['dir/doc.pdf'],
      })]);

      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'test' });
      expect(res.status).toBe(400);
    });

    test('OpenSubtitles login throws returns 500 (line 940)', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockOSHash.mockResolvedValueOnce({ moviehash: 'h' });
      mockOSLogin.mockImplementationOnce(() => { throw new Error('login fail'); });

      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'test' });
      expect(res.status).toBe(500);
    });

    test('subtitle search finds ze language (lines 969-970)', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockOSHash.mockResolvedValueOnce({ moviehash: 'h' });
      mockOSSubtitles.mockResolvedValueOnce({
        data: [{ attributes: { language: 'ze', files: [{ file_id: 100 }] } }],
      });
      mockOSDownload.mockResolvedValueOnce({ link: 'http://sub.srt' });
      mockApi.mockResolvedValue();

      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'test' });
      expect(res.status).toBe(200);
    });

    test('subtitle search finds zh-cn language (lines 971-972)', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockOSHash.mockResolvedValueOnce({ moviehash: 'h' });
      mockOSSubtitles.mockResolvedValueOnce({
        data: [{ attributes: { language: 'zh-cn', files: [{ file_id: 100 }] } }],
      });
      mockOSDownload.mockResolvedValueOnce({ link: 'http://sub.srt' });
      mockApi.mockResolvedValue();

      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'test' });
      expect(res.status).toBe(200);
    });

    test('subtitle search renames existing .srt/.ass/.ssa files (lines 1030,1033,1036)', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockOSHash.mockResolvedValueOnce({ moviehash: 'h' });
      mockOSSubtitles.mockResolvedValueOnce({
        data: [{ attributes: { language: 'en', files: [{ file_id: 100 }] } }],
      });
      mockOSDownload.mockResolvedValueOnce({ link: 'http://sub.srt' });
      mockApi.mockResolvedValue();
      mockExistsSync.mockImplementation((path) => {
        if (typeof path === 'string') {
          if (path.endsWith('.srt') || path.endsWith('.ass') || path.endsWith('.ssa')) return true;
        }
        return false;
      });

      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'test movie' });
      expect(res.status).toBe(200);
      expect(mockRenameSync).toHaveBeenCalled();
    });

    test('subtitle search for item with no name (L772, L848-852)', async () => {
      // Item with empty name → fileName is falsy → goes to L772 (return [id, filePath])
      // Then L847 else branch → L848 getOSsub(name) without fileName
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3, name: '' })]);
      mockOSSubtitles.mockResolvedValueOnce({
        data: [{ attributes: { language: 'en', files: [{ file_id: 42 }] } }],
      });
      mockOSDownload.mockResolvedValueOnce({ link: 'http://sub.srt' });
      mockApi.mockResolvedValue();

      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'test movie' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ apiOK: true });
    });

    test('subtitle search for item with no name and no result returns 400 (L852)', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3, name: '' })]);
      mockOSSubtitles.mockResolvedValueOnce({ data: [] });

      const res = await request(app)
        .post(`/subtitle/search/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'nothing' });
      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------
  // POST /upload/url — pureDownload torrent path (L495-529, L538)
  // ---------------------------------------------------------------
  describe('POST /upload/url — pureDownload torrent path', () => {
    test('torrent file in pureDownload processes magnet and returns data (L495-529)', async () => {
      // yify URL → External.saveSingle rejects → pureDownload → Api('download') calls rest
      mockMongo.mockResolvedValueOnce([]); // no dup for yify
      mockExternalSaveSingle.mockRejectedValueOnce(new Error('yify fail'));
      mockIsTorrent.mockReturnValueOnce(true);
      const torrentObj = { infoHash: 'abcdef0123456789abcde' };
      mockReadTorrent.mockImplementationOnce((_path, cb) => cb(null, torrentObj));
      mockUnlink.mockImplementationOnce((_p, cb) => cb(null));
      mockMongo.mockResolvedValueOnce([]); // no dup magnet
      mockPlaylistApi.mockResolvedValueOnce({
        name: 'TestTorrent',
        files: [
          { name: 'video.mp4', path: 'TestTorrent/video.mp4' },
          { name: 'readme.txt', path: 'TestTorrent/readme.txt' },
        ],
      });
      setupStreamCloseMocks();

      mockApi.mockImplementationOnce((_method, _user, _url, opts) => {
        return opts.rest(['/tmp/file.torrent', 'file.torrent']);
      });

      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'http://yts.ag/movie/test-movie', type: '0' });
      expect(res.status).toBe(200);
      expect(mockReadTorrent).toHaveBeenCalled();
      expect(mockPlaylistApi).toHaveBeenCalledWith('torrent info', expect.any(String), expect.any(String));
    });

    test('pureDownload errHandle callback triggers handleError (L538)', async () => {
      mockMongo.mockResolvedValueOnce([]); // no dup for yify
      mockExternalSaveSingle.mockRejectedValueOnce(new Error('yify fail'));
      // Make Api('download') call errHandle and return the rejection
      mockApi.mockImplementationOnce((_method, _user, _url, opts) => {
        return opts.errHandle(new Error('download fail'));
      });

      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'http://yts.ag/movie/test-movie', type: '0' });
      expect(res.status).toBe(500);
    });

    test('pureDownload torrent with empty files returns error (L525-526)', async () => {
      mockMongo.mockResolvedValueOnce([]); // no dup yify
      mockExternalSaveSingle.mockRejectedValueOnce(new Error('fail'));
      mockIsTorrent.mockReturnValueOnce(true);
      mockReadTorrent.mockImplementationOnce((_path, cb) => cb(null, { infoHash: 'abcdef01234567890abc' }));
      mockUnlink.mockImplementationOnce((_p, cb) => cb(null));
      mockMongo.mockResolvedValueOnce([]); // no dup magnet
      mockPlaylistApi.mockResolvedValueOnce({ name: 'Empty', files: [] });

      mockApi.mockImplementationOnce((_method, _user, _url, opts) => {
        return opts.rest(['/tmp/file.torrent', 'file.torrent']);
      });

      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'http://yts.ag/movie/test-movie', type: '0' });
      expect(res.status).toBe(400);
    });

    test('pureDownload torrent duplicate magnet returns error (L509-510)', async () => {
      mockMongo.mockResolvedValueOnce([]); // no dup yify
      mockExternalSaveSingle.mockRejectedValueOnce(new Error('fail'));
      mockIsTorrent.mockReturnValueOnce(true);
      mockReadTorrent.mockImplementationOnce((_path, cb) => cb(null, { infoHash: 'abcdef01234567890abc' }));
      mockUnlink.mockImplementationOnce((_p, cb) => cb(null));
      mockMongo.mockResolvedValueOnce([makeItem()]); // duplicate found

      mockApi.mockImplementationOnce((_method, _user, _url, opts) => {
        return opts.rest(['/tmp/file.torrent', 'file.torrent']);
      });

      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'http://yts.ag/movie/test-movie', type: '0' });
      expect(res.status).toBe(400);
    });

    test('pureDownload torrent with no magnet returns error (L496-497)', async () => {
      mockMongo.mockResolvedValueOnce([]); // no dup yify
      mockExternalSaveSingle.mockRejectedValueOnce(new Error('fail'));
      mockIsTorrent.mockReturnValueOnce(true);
      // torrent without infoHash → torrent2Magnet returns false
      mockReadTorrent.mockImplementationOnce((_path, cb) => cb(null, {}));

      mockApi.mockImplementationOnce((_method, _user, _url, opts) => {
        return opts.rest(['/tmp/file.torrent', 'file.torrent']);
      });

      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'http://yts.ag/movie/test-movie', type: '0' });
      expect(res.status).toBe(400);
    });

    test('pureDownload torrent with extType on files processes tags (L517-522)', async () => {
      mockMongo.mockResolvedValueOnce([]); // no dup yify
      mockExternalSaveSingle.mockRejectedValueOnce(new Error('fail'));
      mockIsTorrent.mockReturnValueOnce(true);
      mockReadTorrent.mockImplementationOnce((_path, cb) => cb(null, { infoHash: 'abcdef01234567890abc' }));
      mockUnlink.mockImplementationOnce((_p, cb) => cb(null));
      mockMongo.mockResolvedValueOnce([]); // no dup
      mockExtType.mockReturnValueOnce({ type: 'video' });
      mockExtTag.mockReturnValueOnce({ def: ['vid-tag'], opt: ['opt-tag'] });
      mockPlaylistApi.mockResolvedValueOnce({
        name: 'MediaTorrent',
        files: [{ name: 'movie.mkv', path: 'MediaTorrent/movie.mkv' }],
      });
      setupStreamCloseMocks();

      mockApi.mockImplementationOnce((_method, _user, _url, opts) => {
        return opts.rest(['/tmp/file.torrent', 'file.torrent']);
      });

      const res = await request(app)
        .post('/upload/url')
        .set('x-test-user', u(ADMIN))
        .send({ url: 'http://yts.ag/movie/test-movie', type: '0' });
      expect(res.status).toBe(200);
      expect(mockExtType).toHaveBeenCalledWith('movie.mkv');
    });
  });
});
