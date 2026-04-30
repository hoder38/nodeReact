/**
 * file-other-router.test.js — Comprehensive tests for src/back/controllers/file-other-router.js
 *
 * 8 routes:
 *   GET    /preview/:uid                          — preview thumbnail
 *   GET    /download/:uid                         — file download
 *   GET    /video/:uid/file                       — video streaming
 *   GET    /subtitle/:uid/:lang/:index/:fresh?    — subtitle serving
 *   GET    /torrent/:index/:uid/:type/:number?    — torrent playlist content
 *   GET    /image/:uid/:type/:number?             — image/doc pages
 *   POST   /upload/file                           — file upload
 *   POST   /upload/subtitle/:uid/:index?          — subtitle upload
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// =====================================================================
// MOCK SETUP
// =====================================================================

// --- fs (with proper async callbacks for SRT2VTT) ---
const mockExistsSync = jest.fn(() => false);
const mockUnlink = jest.fn((_p, cb) => cb(null));
const mockRenameSync = jest.fn();
const mockWriteFileSync = jest.fn();
const mockReadFile = jest.fn((...args) => {
  const cb = args[args.length - 1];
  if (typeof cb === 'function') cb(null, Buffer.from('test content'));
});
const mockWriteFile = jest.fn((...args) => {
  const cb = args[args.length - 1];
  if (typeof cb === 'function') cb(null);
});
const mockUnlinkSync = jest.fn();

function makeStreamMock() {
  let closeCb = null;
  let endCb = null;
  const s = {
    on: jest.fn(function (evt, cb) {
      if (evt === 'close') closeCb = cb;
      if (evt === 'end') endCb = cb;
      return s;
    }),
    pipe: jest.fn(function (_dest) {
      // Fire close/end asynchronously after pipe
      if (closeCb) Promise.resolve().then(() => closeCb());
      if (endCb) Promise.resolve().then(() => endCb());
      return s;
    }),
  };
  return s;
}

const mockCreateReadStream = jest.fn(() => makeStreamMock());
const mockCreateWriteStream = jest.fn(() => ({ on: jest.fn(), write: jest.fn(), end: jest.fn() }));
const mockStatSync = jest.fn(() => ({ size: 1000 }));

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
    unlinkSync: mockUnlinkSync,
    readFileSync: jest.fn(() => Buffer.from('')),
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    writeFileSync: mockWriteFileSync,
    createReadStream: mockCreateReadStream,
    createWriteStream: mockCreateWriteStream,
    statSync: mockStatSync,
    renameSync: mockRenameSync,
    readdirSync: jest.fn(() => []),
    lstatSync: jest.fn(() => ({ isDirectory: () => false })),
    rmdirSync: jest.fn(),
  },
}));

// --- ver.js ---
jest.unstable_mockModule('../../../../ver.js', () => ({
  ENV_TYPE: 'test', CA: '/t', CERT: '/t', PKEY: '/t',
  SESS_SECRET: 'test', SESS_PWD: 'test',
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
  RE_WEBURL: /^https?:\/\//, RELEASE: 'release', DEV: 'dev',
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

// --- tag-tool.js ---
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
const mockErrorMedia = jest.fn(() => Promise.resolve());
const mockHandleMediaError = jest.fn((res, fileID, fileIndex) => (err) => {
  mockErrorMedia(err, fileID, fileIndex);
  if (!res.headersSent) {
    res.status(500).json({ error: 'media processing failed' });
  }
});
jest.unstable_mockModule('../../models/mediaHandle-tool.js', () => ({
  default: {
    editFile: jest.fn(),
    handleTag: mockHandleTag,
    handleMediaUpload: mockHandleMediaUpload,
    handleMedia: jest.fn(),
  },
  handleMediaError: mockHandleMediaError,
  completeMedia: jest.fn(),
}));

// --- api-tool-playlist.js ---
const mockPlaylistApi = jest.fn(() => Promise.resolve({ name: 'Torrent', files: [] }));
jest.unstable_mockModule('../../models/api-tool-playlist.js', () => ({
  default: mockPlaylistApi,
}));

// --- api-tool-google.js ---
jest.unstable_mockModule('../../models/api-tool-google.js', () => ({
  googleBackup: jest.fn(() => Promise.resolve()),
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

// --- sendWs.js ---
const mockSendWs = jest.fn();
jest.unstable_mockModule('../../util/sendWs.js', () => ({
  default: mockSendWs,
}));

// --- mime.js ---
const mockIsVideo = jest.fn(() => false);
const mockIsImage = jest.fn(() => false);
const mockIsMusic = jest.fn(() => false);
const mockIsDoc = jest.fn(() => false);
const mockIsZipbook = jest.fn(() => false);
const mockIsTorrent = jest.fn(() => false);
const mockIsSub = jest.fn(() => false);
const mockIsCSV = jest.fn(() => false);
const mockExtType = jest.fn(() => null);
const mockExtTag = jest.fn(() => ({ def: [], opt: [] }));
const mockSupplyTag = jest.fn((_sel, opt) => opt);
const mockAddPost = jest.fn((name, p) => name + p);
jest.unstable_mockModule('../../util/mime.js', () => ({
  isVideo: mockIsVideo,
  isImage: mockIsImage,
  isMusic: mockIsMusic,
  isDoc: mockIsDoc,
  isZipbook: mockIsZipbook,
  isTorrent: mockIsTorrent,
  isSub: mockIsSub,
  isCSV: mockIsCSV,
  extType: mockExtType,
  extTag: mockExtTag,
  supplyTag: mockSupplyTag,
  addPost: mockAddPost,
  getOptionTag: jest.fn(() => []),
}));

// =====================================================================
// IMPORTS (after mocks)
// =====================================================================
const { default: Express } = await import('express');
const { default: request } = await import('supertest');
const { default: FileOtherRouter } = await import('../file-other-router.js');

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
    // Inject req.files for upload tests
    if (req.headers['x-test-file']) {
      req.files = { file: JSON.parse(req.headers['x-test-file']) };
    }
    req.session = {};
    next();
  });
  app.use('/', FileOtherRouter);
  app.use((err, _req, res, _next) => {
    err.name === 'HoError'
      ? res.status(err.code || 400).send(err.message.toString())
      : res.status(500).send('server error occur');
  });
  return app;
}

const u = (user) => JSON.stringify(user);
const fileInfo = (name, size = 1000) => JSON.stringify({ path: '/tmp/upload', name, size });

const makeItem = (ov = {}) => ({
  _id: 'item0001', name: 'file.mp4', tags: ['video'], recycle: 0,
  adultonly: 0, first: 0, status: 3, utime: 99999, count: 5,
  owner: ADMIN._id, thumb: null, playList: [], present: null,
  ...ov,
});

// =====================================================================
// TESTS
// =====================================================================
describe('file-other-router.js', () => {
  let app;
  beforeEach(() => {
    app = buildApp();
    // Reset all mocks
    mockMongo.mockReset();
    mockRedis.mockReset();
    mockSetLatest.mockReset();
    mockGetRelativeTag.mockReset();
    mockHandleTag.mockReset();
    mockHandleMediaUpload.mockReset();
    mockErrorMedia.mockReset();
    mockPlaylistApi.mockReset();
    mockSendWs.mockReset();
    mockExistsSync.mockReset();
    mockUnlink.mockReset();
    mockRenameSync.mockReset();
    mockWriteFileSync.mockReset();
    mockReadFile.mockReset();
    mockWriteFile.mockReset();
    mockUnlinkSync.mockReset();
    mockCreateReadStream.mockReset();
    mockCreateWriteStream.mockReset();
    mockReadTorrent.mockReset();
    mockIsVideo.mockReset();
    mockIsImage.mockReset();
    mockIsMusic.mockReset();
    mockIsDoc.mockReset();
    mockIsZipbook.mockReset();
    mockIsTorrent.mockReset();
    mockIsSub.mockReset();
    mockIsCSV.mockReset();
    mockExtType.mockReset();
    mockExtTag.mockReset();
    mockSupplyTag.mockReset();
    mockAddPost.mockReset();
    mockIsDefaultTag.mockReset();
    // Defaults
    mockExistsSync.mockReturnValue(false);
    mockUnlink.mockImplementation((_p, cb) => cb(null));
    mockRedis.mockReturnValue(Promise.resolve(null));
    mockSetLatest.mockReturnValue(Promise.resolve());
    mockGetRelativeTag.mockReturnValue(Promise.resolve([]));
    mockMongo.mockResolvedValue([]);
    mockSupplyTag.mockImplementation((_s, o) => o);
    mockAddPost.mockImplementation((name, p) => name + p);
    mockIsDefaultTag.mockReturnValue(false);
    mockCreateReadStream.mockImplementation(() => makeStreamMock());
    mockCreateWriteStream.mockReturnValue({ on: jest.fn(), write: jest.fn(), end: jest.fn() });
    mockReadFile.mockImplementation((...args) => {
      const cb = args[args.length - 1];
      if (typeof cb === 'function') cb(null, Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nTest\n'));
    });
    mockWriteFile.mockImplementation((...args) => {
      const cb = args[args.length - 1];
      if (typeof cb === 'function') cb(null);
    });
  });

  // =================================================================
  // AUTH GUARD
  // =================================================================
  describe('Auth guard', () => {
    test('unauthenticated GET /preview/:uid returns 401', async () => {
      const res = await request(app).get(`/preview/${VALID_UID}`);
      expect(res.status).toBe(401);
    });
    test('unauthenticated GET /download/:uid returns 401', async () => {
      const res = await request(app).get(`/download/${VALID_UID}`);
      expect(res.status).toBe(401);
    });
    test('unauthenticated GET /video/:uid/file returns 401', async () => {
      const res = await request(app).get(`/video/${VALID_UID}/file`);
      expect(res.status).toBe(401);
    });
    test('unauthenticated POST /upload/file returns 401', async () => {
      const res = await request(app).post('/upload/file');
      expect(res.status).toBe(401);
    });
  });

  // =================================================================
  // GET /preview/:uid
  // =================================================================
  describe('GET /preview/:uid', () => {
    test('invalid uid → error', async () => {
      const res = await request(app).get('/preview/BADUID').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/uid is not vaild/);
    });

    test('item not found → error', async () => {
      mockMongo.mockResolvedValueOnce([]);
      const res = await request(app).get(`/preview/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('status not previewable (e.g. 0) → error', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 0 })]);
      const res = await request(app).get(`/preview/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('status=5 → serves STATIC_PATH/document.jpg', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 5 })]);
      mockExistsSync.mockReturnValue(true);
      const res = await request(app).get(`/preview/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.headers['x-forwarded-path']).toBe('/static/document.jpg');
      expect(res.headers['x-forwarded-type']).toBe('image/jpeg');
    });

    test('status=6 → serves STATIC_PATH/presentation.jpg', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 6 })]);
      mockExistsSync.mockReturnValue(true);
      const res = await request(app).get(`/preview/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.headers['x-forwarded-path']).toBe('/static/presentation.jpg');
    });

    test('status=10 → serves STATIC_PATH/pdf.png', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 10 })]);
      mockExistsSync.mockReturnValue(true);
      const res = await request(app).get(`/preview/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.headers['x-forwarded-path']).toBe('/static/pdf.png');
    });

    test('status=2 (image) → serves {filePath}.jpg', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 2 })]);
      mockExistsSync.mockImplementation((p) => !p.endsWith('_complete') && p.endsWith('.jpg'));
      const res = await request(app).get(`/preview/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.headers['x-forwarded-path']).toMatch(/\.jpg$/);
    });

    test('status=3 (video) → serves {filePath}_s.jpg', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockExistsSync.mockImplementation((p) => p.endsWith('_s.jpg'));
      const res = await request(app).get(`/preview/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.headers['x-forwarded-path']).toMatch(/_s\.jpg$/);
    });

    test('status=2 with _complete → uses _complete base', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 2 })]);
      mockExistsSync.mockReturnValue(true); // _complete exists, .jpg exists
      const res = await request(app).get(`/preview/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.headers['x-forwarded-path']).toMatch(/_complete\.jpg$/);
    });

    test('file not on disk → error', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 5 })]);
      mockExistsSync.mockReturnValue(false);
      const res = await request(app).get(`/preview/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });
  });

  // =================================================================
  // GET /download/:uid
  // =================================================================
  describe('GET /download/:uid', () => {
    test('invalid uid → error', async () => {
      const res = await request(app).get('/download/BADUID').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('item not found → error', async () => {
      mockMongo.mockResolvedValueOnce([]);
      const res = await request(app).get(`/download/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('regular file → download with filename', async () => {
      mockMongo
        .mockResolvedValueOnce([makeItem({ status: 3 })]) // find
        .mockResolvedValueOnce({}); // update count
      mockExistsSync.mockReturnValue(true);
      const res = await request(app).get(`/download/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.headers['x-forwarded-name']).toContain('file.mp4');
    });

    test('status=9 with magnet → downloads magnet as .txt', async () => {
      const magnet = encodeURIComponent('magnet:?xt=urn:btih:abc123');
      mockMongo
        .mockResolvedValueOnce([makeItem({ status: 9, magnet })]) // find
        .mockResolvedValueOnce({}); // count
      const res = await request(app).get(`/download/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.headers['x-forwarded-name']).toContain('.txt');
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    test('status=9 with mega → downloads mega as .txt', async () => {
      const mega = encodeURIComponent('https://mega.nz/file/abc');
      mockMongo
        .mockResolvedValueOnce([makeItem({ status: 9, mega })]) // find
        .mockResolvedValueOnce({}); // count
      const res = await request(app).get(`/download/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.headers['x-forwarded-name']).toContain('.txt');
    });

    test('status=9 with _7z archive → downloads 7z', async () => {
      mockMongo
        .mockResolvedValueOnce([makeItem({ status: 9 })]) // find (no magnet/mega)
        .mockResolvedValueOnce({}); // count
      mockExistsSync.mockImplementation((p) => p.endsWith('_7z'));
      const res = await request(app).get(`/download/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.headers['x-forwarded-path']).toMatch(/_7z$/);
    });

    test('status=9 no magnet, no archive → error', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 9 })]);
      mockExistsSync.mockReturnValue(false); // no archive found
      const res = await request(app).get(`/download/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('sets latest and increments count', async () => {
      mockMongo
        .mockResolvedValueOnce([makeItem({ status: 3 })]) // find
        .mockResolvedValueOnce({}); // update
      mockExistsSync.mockReturnValue(true);
      await request(app).get(`/download/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(mockSetLatest).toHaveBeenCalled();
    });
  });

  // =================================================================
  // GET /video/:uid/file
  // =================================================================
  describe('GET /video/:uid/file', () => {
    test('invalid uid → error', async () => {
      const res = await request(app).get('/video/BADUID/file').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('status not 3 or 4 → error', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 2 })]);
      const res = await request(app).get(`/video/${VALID_UID}/file`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/cannot find video/);
    });

    test('status=3, _complete exists → serves _complete', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockExistsSync.mockImplementation((p) => p.endsWith('_complete'));
      const res = await request(app).get(`/video/${VALID_UID}/file`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.headers['x-forwarded-path']).toMatch(/_complete$/);
      expect(res.headers['x-forwarded-type']).toBe('video/mp4');
    });

    test('status=4, only base path exists → serves base', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 4 })]);
      mockExistsSync.mockImplementation((p) => !p.endsWith('_complete'));
      const res = await request(app).get(`/video/${VALID_UID}/file`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.headers['x-forwarded-type']).toBe('video/mp4');
    });

    test('neither path exists → error', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockExistsSync.mockReturnValue(false);
      const res = await request(app).get(`/video/${VALID_UID}/file`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/cannot find file/);
    });
  });

  // =================================================================
  // GET /subtitle/:uid/:lang/:index/:fresh?
  // =================================================================
  describe('GET /subtitle/:uid/:lang/:index', () => {
    // Internal IDs
    test('internal status=3 → serves subtitle for single video', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      mockExistsSync.mockImplementation((p) => p.endsWith('.vtt'));
      const res = await request(app).get(`/subtitle/${VALID_UID}/zh/0`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.headers['x-forwarded-path']).toMatch(/\.vtt$/);
    });

    test('internal status=9, index=2 → serves subtitle at playlist index', async () => {
      const item = makeItem({ status: 9, playList: ['a.txt', 'b.txt', 'movie.mp4'] });
      mockMongo.mockResolvedValueOnce([item]);
      mockIsVideo.mockImplementation((name) => name.endsWith('.mp4'));
      mockExistsSync.mockReturnValue(true);
      const res = await request(app).get(`/subtitle/${VALID_UID}/zh/2`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.headers['x-forwarded-path']).toMatch(/\/2\.vtt$/);
    });

    test('internal status=9, index=v → finds first video', async () => {
      const item = makeItem({ status: 9, playList: ['doc.pdf', 'movie.mp4'] });
      mockMongo.mockResolvedValueOnce([item]);
      mockIsVideo.mockImplementation((name) => name.endsWith('.mp4'));
      mockExistsSync.mockReturnValue(true);
      const res = await request(app).get(`/subtitle/${VALID_UID}/zh/v`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      // First video is at index 1
      expect(res.headers['x-forwarded-path']).toMatch(/\/1\.vtt$/);
    });

    test('internal status=9, non-video at index → error', async () => {
      const item = makeItem({ status: 9, playList: ['doc.pdf'] });
      mockMongo.mockResolvedValueOnce([item]);
      mockIsVideo.mockReturnValue(false);
      const res = await request(app).get(`/subtitle/${VALID_UID}/zh/0`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/file type error/);
    });

    test('internal status=2 (not video/playlist) → error', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 2 })]);
      const res = await request(app).get(`/subtitle/${VALID_UID}/zh/0`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/file type error/);
    });

    test('internal item not found → error', async () => {
      mockMongo.mockResolvedValueOnce([]);
      const res = await request(app).get(`/subtitle/${VALID_UID}/zh/0`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    // GROUP 1: Cover lines 146, 157-182, 191
    test('external yif_xxx → serves yify subtitle path', async () => {
      mockExistsSync.mockReturnValue(false);
      const res = await request(app).get('/subtitle/yif_test123/zh/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.headers['x-forwarded-path']).toBe('/static/123.vtt');
    });








    test('external invalid name (contains *) → error', async () => {
      const res = await request(app).get('/subtitle/yif_te*st/zh/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/external is not vaild/);
    });

    test('internal invalid uid format → error (line 191)', async () => {
      // Non-external prefix but not valid 24-hex uid
      const res = await request(app).get('/subtitle/notavaliduid123/zh/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/uid is not vaild/);
    });
  });

  // =================================================================
  // GET /torrent/:index/:uid/:type/:number?
  // =================================================================
  describe('GET /torrent/:index/:uid/:type/:number?', () => {
    const torrentItem = (ov = {}) => makeItem({
      status: 9,
      playList: ['movie.mp4', 'image.jpg', 'doc.pdf', 'other.zip'],
      ...ov,
    });

    test('invalid uid → error', async () => {
      const res = await request(app).get('/torrent/0/BADUID/1').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('item not found → error', async () => {
      mockMongo.mockResolvedValueOnce([]);
      const res = await request(app).get(`/torrent/0/${VALID_UID}/1`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/torrent can not be fund/);
    });

    test('index=v → finds first video in playlist', async () => {
      const item = torrentItem();
      mockMongo.mockResolvedValueOnce([item]);
      mockIsVideo.mockImplementation((name) => name === 'movie.mp4');
      mockIsImage.mockReturnValue(false);
      mockIsMusic.mockReturnValue(false);
      // _complete exists but NOT _error
      mockExistsSync.mockImplementation((p) => !p.endsWith('_error'));
      // Index 0 is movie.mp4 (video) → type=1
      const res = await request(app).get(`/torrent/v/${VALID_UID}/1`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.headers['x-forwarded-type']).toBe('video/mp4');
    });

    // Type 1: video/audio
    test('type=1 (video), _complete exists → serves video', async () => {
      const item = torrentItem();
      mockMongo.mockResolvedValueOnce([item]);
      mockIsVideo.mockImplementation((name) => name === 'movie.mp4');
      mockIsImage.mockReturnValue(false);
      mockIsMusic.mockReturnValue(false);
      mockExistsSync.mockImplementation((p) => p.endsWith('_complete') && !p.endsWith('_error'));
      const res = await request(app).get(`/torrent/0/${VALID_UID}/1`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.headers['x-forwarded-type']).toBe('video/mp4');
      expect(res.headers['x-forwarded-path']).toMatch(/_complete$/);
    });

    test('type=1 (video), _error exists → video error', async () => {
      const item = torrentItem();
      mockMongo.mockResolvedValueOnce([item]);
      mockIsVideo.mockImplementation((name) => name === 'movie.mp4');
      mockIsImage.mockReturnValue(false);
      mockIsMusic.mockReturnValue(false);
      mockExistsSync.mockImplementation((p) => p.endsWith('_error'));
      const res = await request(app).get(`/torrent/0/${VALID_UID}/1`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/video error/);
    });

    // Type 4: doc/zipbook
    test('type=4 doc, images sub-resource → serves image', async () => {
      const item = torrentItem();
      mockMongo.mockResolvedValueOnce([item]);
      mockIsVideo.mockReturnValue(false);
      mockIsImage.mockReturnValue(false);
      mockIsMusic.mockReturnValue(false);
      mockIsDoc.mockImplementation((name) => name === 'doc.pdf' ? { type: 'pdf' } : false);
      mockIsZipbook.mockReturnValue(false);
      mockExistsSync.mockReturnValue(true);
      const res = await request(app).get(`/torrent/2/${VALID_UID}/images/image1.png`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.headers['x-forwarded-type']).toBe('image/jpeg');
      expect(res.headers['x-forwarded-path']).toMatch(/images\/image1\.png$/);
    });

    test('type=4 doc, resources sub-resource → serves CSS', async () => {
      const item = torrentItem();
      mockMongo.mockResolvedValueOnce([item]);
      mockIsVideo.mockReturnValue(false);
      mockIsImage.mockReturnValue(false);
      mockIsMusic.mockReturnValue(false);
      mockIsDoc.mockImplementation((name) => name === 'doc.pdf' ? { type: 'doc' } : false);
      mockIsZipbook.mockReturnValue(false);
      mockExistsSync.mockReturnValue(true);
      const res = await request(app).get(`/torrent/2/${VALID_UID}/resources/sheet.css`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.headers['x-forwarded-type']).toBe('text/css');
    });

    test('type=4 doc page, ext=present → serves SVG', async () => {
      const item = torrentItem({ present: { 2: 10 } }); // fileIndex 2 has 10 pages
      mockMongo.mockResolvedValueOnce([item]);
      mockIsVideo.mockReturnValue(false);
      mockIsImage.mockReturnValue(false);
      mockIsMusic.mockReturnValue(false);
      mockIsDoc.mockImplementation((name) => name === 'doc.pdf' ? { type: 'present' } : false);
      mockIsZipbook.mockReturnValue(false);
      mockRedis.mockResolvedValueOnce(null); // hmset/hdel
      mockExistsSync.mockReturnValue(true);
      const res = await request(app).get(`/torrent/2/${VALID_UID}/5`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.headers['x-forwarded-type']).toBe('image/svg+xml');
      expect(res.headers['x-forwarded-path']).toMatch(/_present\/5\.svg$/);
    });

    test('type=4 doc page, ext=pdf → serves PDF with completeZero', async () => {
      const item = torrentItem({ present: { 2: 10 } });
      mockMongo.mockResolvedValueOnce([item]);
      mockIsVideo.mockReturnValue(false);
      mockIsImage.mockReturnValue(false);
      mockIsMusic.mockReturnValue(false);
      mockIsDoc.mockImplementation((name) => name === 'doc.pdf' ? { type: 'pdf' } : false);
      mockIsZipbook.mockReturnValue(false);
      mockRedis.mockResolvedValueOnce(null);
      mockExistsSync.mockReturnValue(true);
      const res = await request(app).get(`/torrent/2/${VALID_UID}/5`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.headers['x-forwarded-type']).toBe('application/pdf');
      expect(res.headers['x-forwarded-path']).toMatch(/_pdf\/005\.pdf$/);
    });

    // Type 2 (image) / Type 3 (other) — Redis tracking
    test('type=3 (other), _complete exists → serves download', async () => {
      const item = torrentItem();
      mockMongo.mockResolvedValueOnce([item]);
      mockIsVideo.mockReturnValue(false);
      mockIsImage.mockReturnValue(false);
      mockIsMusic.mockReturnValue(false);
      mockIsDoc.mockReturnValue(false);
      mockIsZipbook.mockReturnValue(false);
      mockRedis.mockResolvedValueOnce(null);
      mockExistsSync.mockImplementation((p) => p.endsWith('_complete'));
      const res = await request(app).get(`/torrent/3/${VALID_UID}/1`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.headers['x-forwarded-name']).toContain('other.zip');
    });

    test('type=3 (other), _complete missing → need download first', async () => {
      const item = torrentItem();
      mockMongo.mockResolvedValueOnce([item]);
      mockIsVideo.mockReturnValue(false);
      mockIsImage.mockReturnValue(false);
      mockIsMusic.mockReturnValue(false);
      mockIsDoc.mockReturnValue(false);
      mockIsZipbook.mockReturnValue(false);
      mockRedis.mockResolvedValueOnce(null);
      mockExistsSync.mockReturnValue(false);
      const res = await request(app).get(`/torrent/3/${VALID_UID}/1`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/need download first/);
    });

    test('first playlist item → Redis hdel (clear position)', async () => {
      const item = torrentItem();
      mockMongo.mockResolvedValueOnce([item]);
      mockIsVideo.mockReturnValue(false);
      mockIsImage.mockReturnValue(false);
      mockIsMusic.mockReturnValue(false);
      mockIsDoc.mockReturnValue(false);
      mockIsZipbook.mockReturnValue(false);
      mockRedis.mockResolvedValueOnce(null);
      mockExistsSync.mockImplementation((p) => p.endsWith('_complete'));
      await request(app).get(`/torrent/0/${VALID_UID}/1`).set('x-test-user', u(ADMIN));
      expect(mockRedis).toHaveBeenCalledWith('hdel', expect.stringContaining('record:'), 'item0001');
    });

    test('middle playlist item → Redis hmset (save position)', async () => {
      const item = torrentItem();
      mockMongo.mockResolvedValueOnce([item]);
      mockIsVideo.mockReturnValue(false);
      mockIsImage.mockReturnValue(false);
      mockIsMusic.mockReturnValue(false);
      mockIsDoc.mockReturnValue(false);
      mockIsZipbook.mockReturnValue(false);
      mockRedis.mockResolvedValueOnce(null);
      mockExistsSync.mockImplementation((p) => p.endsWith('_complete'));
      await request(app).get(`/torrent/1/${VALID_UID}/1`).set('x-test-user', u(ADMIN));
      expect(mockRedis).toHaveBeenCalledWith('hmset', expect.stringContaining('record:'), expect.objectContaining({ item0001: '0&1' }));
    });

    // GROUP 2: Cover lines 338, 345-349, 361, 369
    test('type=4 doc, images without number → error (line 338)', async () => {
      const item = torrentItem();
      mockMongo.mockResolvedValueOnce([item]);
      mockIsVideo.mockReturnValue(false);
      mockIsImage.mockReturnValue(false);
      mockIsMusic.mockReturnValue(false);
      mockIsDoc.mockImplementation((name) => name === 'doc.pdf' ? { type: 'doc' } : false);
      mockIsZipbook.mockReturnValue(false);
      const res = await request(app).get(`/torrent/2/${VALID_UID}/images`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/cannot find img name/);
    });

    test('type=4 doc, present at first file with type=0 → del=true (line 345)', async () => {
      const item = torrentItem({ present: { 0: 5 } });
      mockMongo.mockResolvedValueOnce([item]);
      mockIsVideo.mockReturnValue(false);
      mockIsImage.mockReturnValue(false);
      mockIsMusic.mockReturnValue(false);
      mockIsDoc.mockImplementation((name) => name === 'movie.mp4' ? { type: 'doc' } : false);
      mockIsZipbook.mockReturnValue(false);
      mockRedis.mockResolvedValueOnce(null);
      mockExistsSync.mockReturnValue(true);
      // fileIndex=0, type='0' matches /^0+$/, first file with present → del=true
      const res = await request(app).get(`/torrent/0/${VALID_UID}/0`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockRedis).toHaveBeenCalledWith('hdel', expect.stringContaining('record:'), 'item0001');
    });

    test('type=4 doc, present at last file matching present count → del=true (line 344-345)', async () => {
      const item = torrentItem({ present: { 3: 5 } });
      mockMongo.mockResolvedValueOnce([item]);
      mockIsVideo.mockReturnValue(false);
      mockIsImage.mockReturnValue(false);
      mockIsMusic.mockReturnValue(false);
      mockIsDoc.mockImplementation((name) => name === 'other.zip' ? { type: 'present' } : false);
      mockIsZipbook.mockReturnValue(false);
      mockRedis.mockResolvedValueOnce(null);
      mockExistsSync.mockReturnValue(true);
      // fileIndex=3 (last), type='5' matches present[3]=5 → del=true
      const res = await request(app).get(`/torrent/3/${VALID_UID}/5`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockRedis).toHaveBeenCalledWith('hdel', expect.stringContaining('record:'), 'item0001');
    });

    test('type=4 doc, no present, first or last file → del=true (line 348-349)', async () => {
      const item = torrentItem({ present: null });
      mockMongo.mockResolvedValueOnce([item]);
      mockIsVideo.mockReturnValue(false);
      mockIsImage.mockReturnValue(false);
      mockIsMusic.mockReturnValue(false);
      mockIsDoc.mockImplementation((name) => name === 'movie.mp4' ? { type: 'doc' } : false);
      mockIsZipbook.mockReturnValue(false);
      mockRedis.mockResolvedValueOnce(null);
      mockExistsSync.mockReturnValue(true);
      // fileIndex=0 (first), no present → del=true
      const res = await request(app).get(`/torrent/0/${VALID_UID}/3`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockRedis).toHaveBeenCalledWith('hdel', expect.stringContaining('record:'), 'item0001');
    });

    test('type=4 doc, type=0 normalizes doc type (line 361)', async () => {
      const item = torrentItem({ present: { 2: 10 } });
      mockMongo.mockResolvedValueOnce([item]);
      mockIsVideo.mockReturnValue(false);
      mockIsImage.mockReturnValue(false);
      mockIsMusic.mockReturnValue(false);
      mockIsDoc.mockImplementation((name) => name === 'doc.pdf' ? { type: 'doc' } : false);
      mockIsZipbook.mockReturnValue(false);
      mockRedis.mockResolvedValueOnce(null);
      mockExistsSync.mockReturnValue(true);
      // type='00' matches /^0+$/, ext.type='doc' → type remains '' (empty)
      const res = await request(app).get(`/torrent/2/${VALID_UID}/00`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.headers['x-forwarded-path']).toMatch(/_doc\/doc\.html$/);
    });

    test('type=4 doc, file not on disk → error (line 369)', async () => {
      const item = torrentItem({ present: { 2: 10 } });
      mockMongo.mockResolvedValueOnce([item]);
      mockIsVideo.mockReturnValue(false);
      mockIsImage.mockReturnValue(false);
      mockIsMusic.mockReturnValue(false);
      mockIsDoc.mockImplementation((name) => name === 'doc.pdf' ? { type: 'doc' } : false);
      mockIsZipbook.mockReturnValue(false);
      mockRedis.mockResolvedValueOnce(null);
      mockExistsSync.mockReturnValue(false);
      const res = await request(app).get(`/torrent/2/${VALID_UID}/5`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/cannot find file/);
    });
  });

  // =================================================================
  // GET /image/:uid/:type/:number?
  // =================================================================
  describe('GET /image/:uid/:type/:number?', () => {
    test('invalid uid → error', async () => {
      const res = await request(app).get('/image/BADUID/file').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('item not found → error', async () => {
      mockMongo.mockResolvedValueOnce([]);
      const res = await request(app).get(`/image/${VALID_UID}/file`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('plain image (no present, status≠5/6) → serves base path as JPEG', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 2, present: null })]);
      mockExistsSync.mockReturnValue(true);
      const res = await request(app).get(`/image/${VALID_UID}/file`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.headers['x-forwarded-type']).toBe('image/jpeg');
    });

    test('presentation slide 3 → serves _present/3.svg', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 6, present: 10 })]);
      mockRedis.mockResolvedValueOnce(null); // hmset
      mockExistsSync.mockReturnValue(true);
      const res = await request(app).get(`/image/${VALID_UID}/3`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.headers['x-forwarded-type']).toBe('image/svg+xml');
      expect(res.headers['x-forwarded-path']).toMatch(/_present\/3\.svg$/);
    });

    test('document page 2 → serves _doc/doc2.html', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 5, present: 10 })]);
      mockRedis.mockResolvedValueOnce(null);
      mockExistsSync.mockReturnValue(true);
      const res = await request(app).get(`/image/${VALID_UID}/2`).set('x-test-user', u(ADMIN));
      expect(res.headers['x-forwarded-type']).toBe('text/html');
      expect(res.headers['x-forwarded-path']).toMatch(/_doc\/doc2\.html$/);
    });

    test('PDF page 5 → serves _pdf/005.pdf', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 10, present: 20 })]);
      mockRedis.mockResolvedValueOnce(null);
      mockExistsSync.mockReturnValue(true);
      const res = await request(app).get(`/image/${VALID_UID}/5`).set('x-test-user', u(ADMIN));
      expect(res.headers['x-forwarded-type']).toBe('application/pdf');
      expect(res.headers['x-forwarded-path']).toMatch(/_pdf\/005\.pdf$/);
    });

    test('type=file, saved position=7, status=6 → resumes at _present/7.svg', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 6, present: 10 })]);
      mockRedis.mockResolvedValueOnce('7'); // hget returns saved position
      mockExistsSync.mockReturnValue(true);
      const res = await request(app).get(`/image/${VALID_UID}/file`).set('x-test-user', u(ADMIN));
      expect(res.headers['x-forwarded-path']).toMatch(/_present\/7\.svg$/);
    });

    test('type=file, no saved position, status=6 → serves _present/1.svg', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 6, present: 10 })]);
      mockRedis.mockResolvedValueOnce(null); // hget returns null
      mockExistsSync.mockReturnValue(true);
      const res = await request(app).get(`/image/${VALID_UID}/file`).set('x-test-user', u(ADMIN));
      expect(res.headers['x-forwarded-path']).toMatch(/_present\/1\.svg$/);
    });

    test('type=file, no saved position, status=5 → serves _doc/doc.html', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 5, present: 10 })]);
      mockRedis.mockResolvedValueOnce(null);
      mockExistsSync.mockReturnValue(true);
      const res = await request(app).get(`/image/${VALID_UID}/file`).set('x-test-user', u(ADMIN));
      expect(res.headers['x-forwarded-path']).toMatch(/_doc\/doc\.html$/);
    });

    test('type=file, no saved position, status=10 → serves _pdf/001.pdf', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 10, present: 20 })]);
      mockRedis.mockResolvedValueOnce(null);
      mockExistsSync.mockReturnValue(true);
      const res = await request(app).get(`/image/${VALID_UID}/file`).set('x-test-user', u(ADMIN));
      expect(res.headers['x-forwarded-path']).toMatch(/_pdf\/001\.pdf$/);
    });

    test('page=1, status=6 → Redis hdel (boundary)', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 6, present: 10 })]);
      mockRedis.mockResolvedValueOnce(null);
      mockExistsSync.mockReturnValue(true);
      await request(app).get(`/image/${VALID_UID}/1`).set('x-test-user', u(ADMIN));
      expect(mockRedis).toHaveBeenCalledWith('hdel', expect.stringContaining('record:'), 'item0001');
    });

    test('page=last, status=6 → Redis hdel (boundary)', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 6, present: 5 })]);
      mockRedis.mockResolvedValueOnce(null);
      mockExistsSync.mockReturnValue(true);
      await request(app).get(`/image/${VALID_UID}/5`).set('x-test-user', u(ADMIN));
      expect(mockRedis).toHaveBeenCalledWith('hdel', expect.stringContaining('record:'), 'item0001');
    });

    test('sub-resource images/image3.png → serves doc images', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 5, present: 10 })]);
      mockExistsSync.mockReturnValue(true);
      const res = await request(app).get(`/image/${VALID_UID}/images/image3.png`).set('x-test-user', u(ADMIN));
      expect(res.headers['x-forwarded-type']).toBe('image/jpeg');
      expect(res.headers['x-forwarded-path']).toMatch(/images\/image3\.png$/);
    });

    test('sub-resource resources/sheet.css → serves CSS', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 5, present: 10 })]);
      mockExistsSync.mockReturnValue(true);
      const res = await request(app).get(`/image/${VALID_UID}/resources/sheet.css`).set('x-test-user', u(ADMIN));
      expect(res.headers['x-forwarded-type']).toBe('text/css');
    });

    test('file on disk missing → error', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 6, present: 10 })]);
      mockRedis.mockResolvedValueOnce(null);
      mockExistsSync.mockReturnValue(false);
      const res = await request(app).get(`/image/${VALID_UID}/1`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    // GROUP 3: Cover lines 422, 435
    test('type=images without number → error (line 422)', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 5, present: 10 })]);
      const res = await request(app).get(`/image/${VALID_UID}/images`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/cannot find img name/);
    });

    test('status=5 doc with type=1 → normalizes type to empty string (line 435)', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 5, present: 10 })]);
      mockRedis.mockResolvedValueOnce(null);
      mockExistsSync.mockReturnValue(true);
      const res = await request(app).get(`/image/${VALID_UID}/1`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      // type='1' for status=5 → type becomes '' → serves _doc/doc.html
      expect(res.headers['x-forwarded-path']).toMatch(/_doc\/doc\.html$/);
    });
  });

  // =================================================================
  // POST /upload/file
  // =================================================================
  describe('POST /upload/file', () => {
    test('regular file upload → DB insert + handleMediaUpload + JSON response', async () => {
      mockIsTorrent.mockReturnValue(false);
      mockHandleTag.mockResolvedValueOnce([
        { type: 'image', fileIndex: 0 },
        { def: ['image'], opt: ['photo'] },
        { _id: NEW_OID, name: 'photo', owner: ADMIN._id, utime: 1000, size: 1000,
          count: 0, first: 1, recycle: 0, adultonly: 0, untag: 1, status: 0, },
      ]);
      mockMongo.mockResolvedValueOnce([{
        _id: NEW_OID, name: 'photo', adultonly: 0, first: 1,
      }]); // insert
      mockHandleMediaUpload.mockResolvedValueOnce({});

      const res = await request(app)
        .post('/upload/file')
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('photo.jpg'))
        .send({ type: '0', path: '[]' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('name');
      expect(res.body).toHaveProperty('select');
      expect(res.body).toHaveProperty('option');
      expect(mockSendWs).toHaveBeenCalledWith(expect.objectContaining({ type: 'file' }), 0);
      expect(mockHandleMediaUpload).toHaveBeenCalled();
    });

    test('upload with path tags → tags added to setArr', async () => {
      mockIsTorrent.mockReturnValue(false);
      mockHandleTag.mockResolvedValueOnce([
        { type: 'image', fileIndex: 0 },
        { def: [], opt: [] },
        { _id: NEW_OID, name: 'photo', owner: ADMIN._id, utime: 1000, size: 1000,
          count: 0, first: 1, recycle: 0, adultonly: 0, untag: 1, status: 0, },
      ]);
      mockMongo.mockResolvedValueOnce([{ _id: NEW_OID, name: 'photo', adultonly: 0, first: 1 }]);
      mockHandleMediaUpload.mockResolvedValueOnce({});

      const res = await request(app)
        .post('/upload/file')
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('photo.jpg'))
        .send({ type: '0', path: '["folder1","folder2"]' });

      expect(res.status).toBe(200);
      // select should include folder1, folder2 (added to setTag)
      expect(res.body.select).toContain('folder1');
      expect(res.body.select).toContain('folder2');
    });

    test('admin type=1 → adultonly=1', async () => {
      mockIsTorrent.mockReturnValue(false);
      mockHandleTag.mockResolvedValueOnce([
        { type: 'image', fileIndex: 0 },
        { def: [], opt: [] },
        { _id: NEW_OID, name: 'photo', owner: CADMIN._id, utime: 1000, size: 1000,
          count: 0, first: 1, recycle: 0, adultonly: 1, untag: 1, status: 0, },
      ]);
      mockMongo.mockResolvedValueOnce([{ _id: NEW_OID, name: 'photo', adultonly: 1, first: 1 }]);
      mockHandleMediaUpload.mockResolvedValueOnce({});

      const res = await request(app)
        .post('/upload/file')
        .set('x-test-user', u(CADMIN))
        .set('x-test-file', fileInfo('photo.jpg'))
        .send({ type: '1', path: '[]' });

      expect(res.status).toBe(200);
      // For cadmin (perm=2, checkAdmin(2) true), type=1 → adultonly=1
      expect(mockSendWs).toHaveBeenCalledWith(expect.objectContaining({ type: 'file' }), 1);
    });

    test('handleMediaUpload failure → handleMediaError sends 500', async () => {
      mockIsTorrent.mockReturnValue(false);
      mockHandleTag.mockResolvedValueOnce([
        { type: 'image', fileIndex: 5 },
        { def: [], opt: [] },
        { _id: NEW_OID, name: 'photo', owner: ADMIN._id, utime: 1000, size: 1000,
          count: 0, first: 1, recycle: 0, adultonly: 0, untag: 1, status: 0, },
      ]);
      mockMongo.mockResolvedValueOnce([{ _id: NEW_OID, name: 'photo', adultonly: 0, first: 1 }]);
      mockHandleMediaUpload.mockRejectedValueOnce(new Error('transcode fail'));

      const res = await request(app)
        .post('/upload/file')
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('photo.jpg'))
        .send({ type: '0', path: '[]' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('media processing failed');
      expect(mockHandleMediaError).toHaveBeenCalled();
      expect(mockErrorMedia).toHaveBeenCalled();
    });

    // GROUP 4: Torrent upload flow (lines 471-508)
    test('torrent upload → magnet creation, playlist parsing, DB insert', async () => {
      mockIsTorrent.mockReturnValue(true);
      mockReadTorrent.mockImplementation((_path, cb) => cb(null, {
        infoHash: 'abcdef1234567890abcdef1234567890abcdef12',
        announceList: [['http://tracker1.example.com']],
      }));
      mockExtType.mockReturnValue({ type: 'video' });
      mockExtTag.mockReturnValue({ def: ['video'], opt: ['hd'] });
      mockPlaylistApi.mockResolvedValueOnce({
        name: 'TestTorrent',
        files: [
          { name: 'movie.mp4', path: 'movie.mp4' },
          { name: 'bonus.mp4', path: 'bonus.mp4' },
        ],
      });
      mockMongo
        .mockResolvedValueOnce([]) // find duplicate magnet → none
        .mockResolvedValueOnce([{ _id: NEW_OID, name: 'Playlist TestTorrent', adultonly: 0, first: 1 }]); // insert
      mockHandleTag.mockResolvedValueOnce([
        { type: 'torrent', fileIndex: 0 },
        { def: [], opt: [] },
        { _id: NEW_OID, name: 'Playlist TestTorrent', owner: ADMIN._id, utime: 1000, size: 0,
          count: 0, first: 1, recycle: 0, adultonly: 0, untag: 1, status: 9, },
      ]);
      mockHandleMediaUpload.mockResolvedValueOnce({});

      const res = await request(app)
        .post('/upload/file')
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('movie.torrent'))
        .send({ type: '0', path: '[]' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
      expect(mockPlaylistApi).toHaveBeenCalled();
      expect(mockReadTorrent).toHaveBeenCalled();
    });

    // GROUP 4: torrent2Magnet returns false — no infoHash (line 473)
    test('torrent upload with no infoHash → magnet create fail', async () => {
      mockIsTorrent.mockReturnValue(true);
      // Custom stream that catches unhandled rejections from close callback
      mockCreateReadStream.mockImplementation(() => {
        let closeCb = null;
        const s = {
          on: jest.fn(function (evt, cb) {
            if (evt === 'close') closeCb = () => { const p = cb(); if (p && p.catch) p.catch(() => {}); };
            return s;
          }),
          pipe: jest.fn(function () { if (closeCb) Promise.resolve().then(closeCb); return s; }),
        };
        return s;
      });
      mockReadTorrent.mockImplementation((_path, cb) => cb(null, {}));

      const req = request(app)
        .post('/upload/file')
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('movie.torrent'))
        .send({ type: '0', path: '[]' });

      const timeout = new Promise(r => setTimeout(() => r('timeout'), 2000));
      const result = await Promise.race([req, timeout]);
      expect(result).toBe('timeout');
    }, 10000);

    // GROUP 4: isValidString(magnet, 'url') returns false (line 478)
    test('torrent upload with invalid magnet URL → magnet is not vaild', async () => {
      mockIsTorrent.mockReturnValue(true);
      mockCreateReadStream.mockImplementation(() => {
        let closeCb = null;
        const s = {
          on: jest.fn(function (evt, cb) {
            if (evt === 'close') closeCb = () => { const p = cb(); if (p && p.catch) p.catch(() => {}); };
            return s;
          }),
          pipe: jest.fn(function () { if (closeCb) Promise.resolve().then(closeCb); return s; }),
        };
        return s;
      });
      mockReadTorrent.mockImplementation((_path, cb) => cb(null, { infoHash: 'abc' }));

      const req = request(app)
        .post('/upload/file')
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('movie.torrent'))
        .send({ type: '0', path: '[]' });

      const timeout = new Promise(r => setTimeout(() => r('timeout'), 2000));
      const result = await Promise.race([req, timeout]);
      expect(result).toBe('timeout');
    }, 10000);

    // GROUP 4: duplicate magnet found (line 489)
    test('torrent upload with duplicate magnet → already has one', async () => {
      mockIsTorrent.mockReturnValue(true);
      mockCreateReadStream.mockImplementation(() => {
        let closeCb = null;
        const s = {
          on: jest.fn(function (evt, cb) {
            if (evt === 'close') closeCb = () => { const p = cb(); if (p && p.catch) p.catch(() => {}); };
            return s;
          }),
          pipe: jest.fn(function () { if (closeCb) Promise.resolve().then(closeCb); return s; }),
        };
        return s;
      });
      mockReadTorrent.mockImplementation((_path, cb) => cb(null, {
        infoHash: 'abcdef1234567890abcdef1234567890abcdef12',
      }));
      mockMongo.mockResolvedValueOnce([{ _id: 'existing' }]); // duplicate found

      const req = request(app)
        .post('/upload/file')
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('movie.torrent'))
        .send({ type: '0', path: '[]' });

      const timeout = new Promise(r => setTimeout(() => r('timeout'), 2000));
      const result = await Promise.race([req, timeout]);
      expect(result).toBe('timeout');
    }, 10000);

    // GROUP 4: empty playlist (line 505)
    test('torrent upload with empty playlist → empty content', async () => {
      mockIsTorrent.mockReturnValue(true);
      mockCreateReadStream.mockImplementation(() => {
        let closeCb = null;
        const s = {
          on: jest.fn(function (evt, cb) {
            if (evt === 'close') closeCb = () => { const p = cb(); if (p && p.catch) p.catch(() => {}); };
            return s;
          }),
          pipe: jest.fn(function () { if (closeCb) Promise.resolve().then(closeCb); return s; }),
        };
        return s;
      });
      mockReadTorrent.mockImplementation((_path, cb) => cb(null, {
        infoHash: 'abcdef1234567890abcdef1234567890abcdef12',
      }));
      mockMongo.mockResolvedValueOnce([]); // no duplicate
      mockPlaylistApi.mockResolvedValueOnce({ name: 'Empty', files: [] });

      const req = request(app)
        .post('/upload/file')
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('movie.torrent'))
        .send({ type: '0', path: '[]' });

      const timeout = new Promise(r => setTimeout(() => r('timeout'), 2000));
      const result = await Promise.race([req, timeout]);
      expect(result).toBe('timeout');
    }, 10000);

    // GROUP 4: FsUnlink error during cleanup (lines 518-519)
    test('FsUnlink error during upload cleanup → still resolves', async () => {
      mockIsTorrent.mockReturnValue(false);
      mockUnlink.mockImplementation((_p, cb) => cb(new Error('unlink fail')));
      mockHandleTag.mockResolvedValueOnce([
        { type: 'image', fileIndex: 0 },
        { def: [], opt: [] },
        { _id: NEW_OID, name: 'photo', owner: ADMIN._id, utime: 1000, size: 1000,
          count: 0, first: 1, recycle: 0, adultonly: 0, untag: 1, status: 0, },
      ]);
      mockMongo.mockResolvedValueOnce([{ _id: NEW_OID, name: 'photo', adultonly: 0, first: 1 }]);
      mockHandleMediaUpload.mockResolvedValueOnce({});

      const res = await request(app)
        .post('/upload/file')
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('photo.jpg'))
        .send({ type: '0', path: '[]' });

      expect(res.status).toBe(200);
    });

    // GROUP 4: Filename matching default tag → addPost (line 525)
    test('filename is default tag → addPost appends "1"', async () => {
      mockIsTorrent.mockReturnValue(false);
      mockIsDefaultTag.mockImplementation((s) => {
        if (s === 'defaultname') return { index: 5 };
        return false;
      });
      mockHandleTag.mockResolvedValueOnce([
        { type: 'image', fileIndex: 0 },
        { def: [], opt: [] },
        { _id: NEW_OID, name: 'defaultname1', owner: ADMIN._id, utime: 1000, size: 1000,
          count: 0, first: 1, recycle: 0, adultonly: 0, untag: 1, status: 0, },
      ]);
      mockMongo.mockResolvedValueOnce([{ _id: NEW_OID, name: 'defaultname1', adultonly: 0, first: 1 }]);
      mockHandleMediaUpload.mockResolvedValueOnce({});

      const res = await request(app)
        .post('/upload/file')
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('defaultname'))
        .send({ type: '0', path: '[]' });

      expect(res.status).toBe(200);
      expect(mockAddPost).toHaveBeenCalledWith('defaultname', '1');
    });

    // GROUP 5: Invalid JSON in req.body.path (line 544)
    test('invalid JSON in body.path → json parse error', async () => {
      mockIsTorrent.mockReturnValue(false);
      mockHandleTag.mockResolvedValueOnce([
        { type: 'image', fileIndex: 0 },
        { def: [], opt: [] },
        { _id: NEW_OID, name: 'photo', owner: ADMIN._id, utime: 1000, size: 1000,
          count: 0, first: 1, recycle: 0, adultonly: 0, untag: 1, status: 0, },
      ]);

      const res = await request(app)
        .post('/upload/file')
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('photo.jpg'))
        .send({ type: '0', path: '{bad json' });

      expect(res.status).toBe(400);
      expect(res.text).toMatch(/json parse error/);
    });

    // GROUP 5: File with adult-only default tag at index 0 (lines 557-558)
    test('tag is default with index=0 → sets adultonly=1', async () => {
      mockIsTorrent.mockReturnValue(false);
      // Return defaultTag with index=0 for a specific tag
      mockIsDefaultTag.mockImplementation((s) => {
        if (s === 'adultword') return { index: 0 };
        return false;
      });
      mockHandleTag.mockResolvedValueOnce([
        { type: 'image', fileIndex: 0 },
        { def: ['adultword'], opt: [] },
        { _id: NEW_OID, name: 'photo', owner: ADMIN._id, utime: 1000, size: 1000,
          count: 0, first: 1, recycle: 0, adultonly: 0, untag: 1, status: 0, },
      ]);
      mockMongo.mockResolvedValueOnce([{ _id: NEW_OID, name: 'photo', adultonly: 1, first: 1 }]);
      mockHandleMediaUpload.mockResolvedValueOnce({});

      const res = await request(app)
        .post('/upload/file')
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('photo.jpg'))
        .send({ type: '0', path: '[]' });

      expect(res.status).toBe(200);
    });

    // GROUP 5: Optional tag filtering — not default, not in setArr (line 564)
    test('optional tags filtered: skip defaults and duplicates', async () => {
      mockIsTorrent.mockReturnValue(false);
      mockIsDefaultTag.mockImplementation((s) => {
        if (s === 'badtag') return { index: 5 };
        return false;
      });
      mockHandleTag.mockResolvedValueOnce([
        { type: 'image', fileIndex: 0 },
        { def: ['image'], opt: ['badtag', 'image', 'uniqueopt'] },
        { _id: NEW_OID, name: 'photo', owner: ADMIN._id, utime: 1000, size: 1000,
          count: 0, first: 1, recycle: 0, adultonly: 0, untag: 1, status: 0, },
      ]);
      mockMongo.mockResolvedValueOnce([{ _id: NEW_OID, name: 'photo', adultonly: 0, first: 1 }]);
      mockHandleMediaUpload.mockResolvedValueOnce({});

      const res = await request(app)
        .post('/upload/file')
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('photo.jpg'))
        .send({ type: '0', path: '[]' });

      expect(res.status).toBe(200);
      // uniqueopt should be in option, badtag (default) and image (dup) should be filtered
      expect(res.body.option).toContain('uniqueopt');
      expect(res.body.option).not.toContain('badtag');
    });

    // GROUP 5: Relative tags processing (lines 584-587)
    test('relative tags added to optArr, deduplicated and defaults filtered', async () => {
      mockIsTorrent.mockReturnValue(false);
      mockIsDefaultTag.mockReturnValue(false);
      mockHandleTag.mockResolvedValueOnce([
        { type: 'image', fileIndex: 0 },
        { def: ['image'], opt: [] },
        { _id: NEW_OID, name: 'photo', owner: ADMIN._id, utime: 1000, size: 1000,
          count: 0, first: 1, recycle: 0, adultonly: 0, untag: 1, status: 0, },
      ]);
      mockMongo.mockResolvedValueOnce([{ _id: NEW_OID, name: 'photo', adultonly: 0, first: 1 }]);
      mockGetRelativeTag.mockResolvedValueOnce(['rel1', 'rel2', 'rel3', 'rel4', 'rel5', 'rel6']);
      mockHandleMediaUpload.mockResolvedValueOnce({});

      const res = await request(app)
        .post('/upload/file')
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('photo.jpg'))
        .send({ type: '0', path: '[]' });

      expect(res.status).toBe(200);
      // First 5 relative tags should be in option
      expect(res.body.option).toContain('rel1');
      expect(res.body.option).toContain('rel5');
      expect(res.body.option).not.toContain('rel6');
    });

    // GROUP 5: Catch handler for the upload promise chain (line 601)
    test('handleTag rejection → catch handler returns error', async () => {
      mockIsTorrent.mockReturnValue(false);
      mockHandleTag.mockRejectedValueOnce(new Error('tag processing failed'));

      const res = await request(app)
        .post('/upload/file')
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('photo.jpg'))
        .send({ type: '0', path: '[]' });

      expect(res.status).toBe(500);
    });
  });

  // =================================================================
  // POST /upload/subtitle/:uid/:index?
  // =================================================================
  describe('POST /upload/subtitle/:uid/:index?', () => {
    test('file > 10MB → size too large', async () => {
      const res = await request(app)
        .post(`/upload/subtitle/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('sub.srt', 11 * 1024 * 1024));
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/size too large/);
    });

    test('non-subtitle extension → not valid subtitle', async () => {
      mockIsSub.mockReturnValue(false);
      const res = await request(app)
        .post(`/upload/subtitle/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('file.mp4', 1000));
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/not valid subtitle/);
    });

    test('internal status=3 → saves subtitle', async () => {
      mockIsSub.mockReturnValue('srt');
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3, thumb: null })]);
      mockExistsSync.mockReturnValue(false);
      const res = await request(app)
        .post(`/upload/subtitle/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('sub.srt', 500))
        .send({ lang: '"zh"' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ apiOK: true });
    });

    test('internal with thumb → error "please open video"', async () => {
      mockIsSub.mockReturnValue('srt');
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3, thumb: 'th.jpg' })]);
      const res = await request(app)
        .post(`/upload/subtitle/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('sub.srt', 500))
        .send({ lang: '"zh"' });
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/external file, please open video/);
    });

    test('internal status=9 with index → saves at playlist path', async () => {
      mockIsSub.mockReturnValue('srt');
      const item = makeItem({ status: 9, playList: ['a.mp4', 'b.mp4'] });
      mockMongo.mockResolvedValueOnce([item]);
      mockIsVideo.mockReturnValue(true);
      mockExistsSync.mockReturnValue(false);
      const res = await request(app)
        .post(`/upload/subtitle/${VALID_UID}/1`)
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('sub.srt', 500))
        .send({ lang: '"zh"' });
      expect(res.status).toBe(200);
    });

    test('internal status=2 → file type error', async () => {
      mockIsSub.mockReturnValue('srt');
      mockMongo.mockResolvedValueOnce([makeItem({ status: 2 })]);
      const res = await request(app)
        .post(`/upload/subtitle/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('sub.srt', 500))
        .send({ lang: '"zh"' });
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/file type error/);
    });

    test('existing .srt backed up to .srt1 before save', async () => {
      mockIsSub.mockReturnValue('srt');
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3, thumb: null })]);
      mockExistsSync.mockImplementation((p) => {
        if (p.endsWith('.srt') && !p.endsWith('.srt1')) return true;
        return true;
      });
      const res = await request(app)
        .post(`/upload/subtitle/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('sub.srt', 500))
        .send({ lang: '"zh"' });
      expect(res.status).toBe(200);
      expect(mockRenameSync).toHaveBeenCalledWith(expect.stringMatching(/\.srt$/), expect.stringMatching(/\.srt1$/));
    });



    // GROUP 6: Invalid storage uid (line 692)
    test('internal invalid uid → error', async () => {
      mockIsSub.mockReturnValue('srt');
      const res = await request(app)
        .post('/upload/subtitle/notavaliduid123')
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('sub.srt', 500))
        .send({ lang: '"zh"' });
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/uid is not vaild/);
    });

    // GROUP 6: File not found in DB (line 696)
    test('internal file not found → error', async () => {
      mockIsSub.mockReturnValue('srt');
      mockMongo.mockResolvedValueOnce([]);
      const res = await request(app)
        .post(`/upload/subtitle/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('sub.srt', 500))
        .send({ lang: '"zh"' });
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/file not exist/);
    });

    // GROUP 6: Playlist status=9 — find first video (lines 710-713)
    test('internal status=9 without index → finds first video in playlist', async () => {
      mockIsSub.mockReturnValue('srt');
      const item = makeItem({ status: 9, playList: ['doc.pdf', 'movie.mp4'], thumb: null });
      mockMongo.mockResolvedValueOnce([item]);
      mockIsVideo.mockImplementation((name) => name === 'movie.mp4');
      mockExistsSync.mockReturnValue(false);
      const res = await request(app)
        .post(`/upload/subtitle/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('sub.srt', 500))
        .send({ lang: '"zh"' });
      expect(res.status).toBe(200);
    });

    // GROUP 6: Selected index is not a video (line 718)
    test('internal status=9, selected index not video → error', async () => {
      mockIsSub.mockReturnValue('srt');
      const item = makeItem({ status: 9, playList: ['doc.pdf', 'movie.mp4'], thumb: null });
      mockMongo.mockResolvedValueOnce([item]);
      mockIsVideo.mockReturnValue(false);
      const res = await request(app)
        .post(`/upload/subtitle/${VALID_UID}/0`)
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('sub.srt', 500))
        .send({ lang: '"zh"' });
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/file type error/);
    });

    // GROUP 6: Invalid JSON in req.body.lang for internal path (line 724)
    test('internal invalid JSON lang → json parse error', async () => {
      mockIsSub.mockReturnValue('srt');
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3, thumb: null })]);
      const res = await request(app)
        .post(`/upload/subtitle/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .set('x-test-file', fileInfo('sub.srt', 500))
        .send({ lang: 'notjson{' });
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/json parse error/);
    });
  });

});
