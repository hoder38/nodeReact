/**
 * playlist-router.test.js — Comprehensive tests for src/back/controllers/playlist-router.js
 *
 * 4 routes (all require auth via router.use checkLogin):
 *   PUT    /join                                — join split archive parts (RAR/7z/ZIP)
 *   POST   /copy/:uid/:index(\d+)              — copy playlist item to standalone file
 *   GET    /all/download/:uid                   — queue download of all pending items
 *   GET    /check/:uid/:index(\d+|v)/:size(\d+) — check download progress
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// =====================================================================
// MOCK SETUP
// =====================================================================

// --- fs ---
const mockExistsSync = jest.fn(() => false);
const mockUnlink = jest.fn((_p, cb) => cb(null));
const mockStatSync = jest.fn(() => ({ size: 1000, isFile: () => true }));

function makeStreamMock() {
  let closeCb = null;
  let errorCb = null;
  const s = {
    on: jest.fn(function (evt, cb) {
      if (evt === 'close') closeCb = cb;
      if (evt === 'error') errorCb = cb;
      return s;
    }),
    pipe: jest.fn(function () {
      if (closeCb) Promise.resolve().then(() => closeCb());
      return s;
    }),
    _triggerError: (err) => { if (errorCb) errorCb(err); },
  };
  return s;
}

const mockCreateReadStream = jest.fn(() => makeStreamMock());
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
    createReadStream: mockCreateReadStream,
    createWriteStream: mockCreateWriteStream,
    readFileSync: jest.fn(() => Buffer.from('')),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    renameSync: jest.fn(),
    readdirSync: jest.fn(() => []),
    lstatSync: jest.fn(() => ({ isDirectory: () => false })),
    unlinkSync: jest.fn(),
    rmdirSync: jest.fn(),
    writeFileSync: jest.fn(),
  },
}));

// --- child_process (for cat command in join) ---
const mockExec = jest.fn((cmd, cb) => cb(null, 'ok'));
jest.unstable_mockModule('child_process', () => ({
  default: { exec: mockExec },
}));

// --- ver.js ---
jest.unstable_mockModule('../../../../ver.js', () => ({
  PASSWORD_SALT: 'test_salt_',
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
  USERDB: 'user', STORAGEDB: 'storage',
  STATIC_PATH: '/static', NOISE_TIME: 7200,
  UNACTIVE_DAY: 5, UNACTIVE_HIT: 10,
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
jest.unstable_mockModule('../../models/redis-tool.js', () => ({
  default: jest.fn(() => Promise.resolve(null)),
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
}));

// --- api-tool-playlist.js ---
const mockPlaylistApi = jest.fn(() => Promise.resolve());
jest.unstable_mockModule('../../models/api-tool-playlist.js', () => ({
  default: mockPlaylistApi,
}));

// --- sendWs.js ---
const mockSendWs = jest.fn();
jest.unstable_mockModule('../../util/sendWs.js', () => ({
  default: mockSendWs,
}));

// --- mime.js ---
const mockExtType = jest.fn(() => ({ type: 'video', fileIndex: 0 }));
const mockIsVideo = jest.fn(() => false);
const mockSupplyTag = jest.fn((_s, o) => o);
const mockAddPost = jest.fn((name, p) => name + p);
jest.unstable_mockModule('../../util/mime.js', () => ({
  extType: mockExtType,
  isVideo: mockIsVideo,
  supplyTag: mockSupplyTag,
  addPost: mockAddPost,
  isImage: jest.fn(() => false),
  isMusic: jest.fn(() => false),
  isDoc: jest.fn(() => false),
  isZipbook: jest.fn(() => false),
  isTorrent: jest.fn(() => false),
  isSub: jest.fn(() => false),
  isCSV: jest.fn(() => false),
  getOptionTag: jest.fn(() => []),
  extTag: jest.fn(() => ({ def: [], opt: [] })),
  isZip: jest.fn(() => false),
}));

// --- api-tool-google.js ---
jest.unstable_mockModule('../../models/api-tool-google.js', () => ({
  default: jest.fn(),
  googleBackup: jest.fn(() => Promise.resolve()),
}));

// --- mkdirp ---
const mockMkdirp = jest.fn(() => Promise.resolve());
jest.unstable_mockModule('mkdirp', () => ({
  default: mockMkdirp,
}));

// =====================================================================
// IMPORTS (after mocks)
// =====================================================================
const { default: Express } = await import('express');
const { default: request } = await import('supertest');
const { default: PlaylistRouter } = await import('../playlist-router.js');

// =====================================================================
// HELPERS
// =====================================================================
const VALID_UID = 'aabbccddeeff001122334455';
const VALID_UID2 = 'aabbccddeeff001122334466';
const VALID_UID3 = 'aabbccddeeff001122334477';
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
    req.session = {};
    next();
  });
  app.use('/', PlaylistRouter);
  app.use((err, _req, res, _next) => {
    err.name === 'HoError'
      ? res.status(err.code || 400).send(err.message.toString())
      : res.status(500).send('server error occur');
  });
  return app;
}

const u = (user) => JSON.stringify(user);

const makeItem = (ov = {}) => ({
  _id: 'item0001', name: 'archive.part01.rar', tags: ['video', 'torrent'],
  recycle: 0, adultonly: 0, first: 0, status: 9, utime: 99999, count: 5,
  owner: ADMIN._id, thumb: null, magnet: null, mega: null, pwd: null,
  playList: ['dir/video.mp4', 'dir/video2.mp4'],
  size: 1000,
  ...ov,
});

// =====================================================================
// TESTS
// =====================================================================
describe('playlist-router.js', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
    jest.clearAllMocks();
    // Defaults
    mockMongo.mockResolvedValue([]);
    mockSetLatest.mockReturnValue(Promise.resolve());
    mockGetRelativeTag.mockReturnValue(Promise.resolve([]));
    mockExistsSync.mockReturnValue(false);
    mockUnlink.mockImplementation((_p, cb) => cb(null));
    mockStatSync.mockReturnValue({ size: 1000, isFile: () => true });
    mockIsDefaultTag.mockReturnValue(false);
    mockSupplyTag.mockImplementation((_s, o) => o);
    mockAddPost.mockImplementation((name, p) => name + p);
    mockHandleMediaUpload.mockResolvedValue();
    mockPlaylistApi.mockResolvedValue();
    mockCreateReadStream.mockImplementation(() => makeStreamMock());
    mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));
    mockExtType.mockReturnValue({ type: 'video', fileIndex: 0 });
  });

  // ---------------------------------------------------------------
  // Auth guard
  // ---------------------------------------------------------------
  describe('Auth guard', () => {
    test('unauthenticated PUT /join returns 401', async () => {
      const res = await request(app).put('/join').send({ uids: [] });
      expect(res.status).toBe(401);
    });

    test('unauthenticated POST /copy returns 401', async () => {
      const res = await request(app).post(`/copy/${VALID_UID}/0`);
      expect(res.status).toBe(401);
    });

    test('unauthenticated GET /all/download returns 401', async () => {
      const res = await request(app).get(`/all/download/${VALID_UID}`);
      expect(res.status).toBe(401);
    });

    test('unauthenticated GET /check returns 401', async () => {
      const res = await request(app).get(`/check/${VALID_UID}/0/0`);
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------
  // PUT /join — join split archive parts
  // ---------------------------------------------------------------
  describe('PUT /join', () => {
    test('fewer than 2 valid UIDs returns 400', async () => {
      const res = await request(app)
        .put('/join')
        .set('x-test-user', u(ADMIN))
        .send({ uids: [VALID_UID] });
      expect(res.status).toBe(400);
    });

    test('all invalid UIDs returns 400', async () => {
      const res = await request(app)
        .put('/join')
        .set('x-test-user', u(ADMIN))
        .send({ uids: ['bad', 'also-bad'] });
      expect(res.status).toBe(400);
    });

    test('fewer than 2 items found in DB returns error', async () => {
      mockMongo
        .mockResolvedValueOnce([makeItem()]) // only 1 found
        .mockResolvedValueOnce([]);           // 2nd not found
      const res = await request(app)
        .put('/join')
        .set('x-test-user', u(ADMIN))
        .send({ uids: [VALID_UID, VALID_UID2] });
      // handleError without next → doesn't send response via Express error handler
      // This is a known bug pattern — request may hang or return 500
      expect([400, 500]).toContain(res.status);
    });

    test('no first-part file in set returns error', async () => {
      mockMongo
        .mockResolvedValueOnce([makeItem({ _id: VALID_UID, name: 'archive.part02.rar' })])
        .mockResolvedValueOnce([makeItem({ _id: VALID_UID2, name: 'archive.part03.rar' })]);
      const res = await request(app)
        .put('/join')
        .set('x-test-user', u(ADMIN))
        .send({ uids: [VALID_UID, VALID_UID2] });
      expect([400, 500]).toContain(res.status);
    });

    test('successful RAR join (2 parts) copies and processes', async () => {
      mockMongo
        .mockResolvedValueOnce([makeItem({ _id: VALID_UID, name: 'archive.part01.rar', owner: ADMIN._id })])
        .mockResolvedValueOnce([makeItem({ _id: VALID_UID2, name: 'archive.part02.rar', owner: ADMIN._id })]);
      mockHandleMediaUpload.mockResolvedValueOnce();

      const res = await request(app)
        .put('/join')
        .set('x-test-user', u(ADMIN))
        .send({ uids: [VALID_UID, VALID_UID2] });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: VALID_UID, name: 'archive.part01.rar' });
      expect(mockCreateReadStream).toHaveBeenCalled();
      expect(mockCreateWriteStream).toHaveBeenCalled();
      expect(mockHandleMediaUpload).toHaveBeenCalled();
    });

    test('successful 7z join uses cat command', async () => {
      mockMongo
        .mockResolvedValueOnce([makeItem({ _id: VALID_UID, name: 'data.7z.001', owner: ADMIN._id })])
        .mockResolvedValueOnce([makeItem({ _id: VALID_UID2, name: 'data.7z.002', owner: ADMIN._id })]);
      mockHandleMediaUpload.mockResolvedValueOnce();

      const res = await request(app)
        .put('/join')
        .set('x-test-user', u(ADMIN))
        .send({ uids: [VALID_UID, VALID_UID2] });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: VALID_UID, name: 'data.7z.001' });
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('cat'), expect.any(Function));
    });

    test('successful ZIP join uses cat command', async () => {
      mockMongo
        .mockResolvedValueOnce([makeItem({ _id: VALID_UID, name: 'data.zip.001', owner: ADMIN._id })])
        .mockResolvedValueOnce([makeItem({ _id: VALID_UID2, name: 'data.zip.002', owner: ADMIN._id })]);
      mockHandleMediaUpload.mockResolvedValueOnce();

      const res = await request(app)
        .put('/join')
        .set('x-test-user', u(ADMIN))
        .send({ uids: [VALID_UID, VALID_UID2] });
      expect(res.status).toBe(200);
      expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('cat'), expect.any(Function));
    });

    test('case-insensitive extension matching (Part01.RAR)', async () => {
      mockMongo
        .mockResolvedValueOnce([makeItem({ _id: VALID_UID, name: 'Archive.Part01.RAR', owner: ADMIN._id })])
        .mockResolvedValueOnce([makeItem({ _id: VALID_UID2, name: 'Archive.Part02.RAR', owner: ADMIN._id })]);
      mockHandleMediaUpload.mockResolvedValueOnce();

      const res = await request(app)
        .put('/join')
        .set('x-test-user', u(ADMIN))
        .send({ uids: [VALID_UID, VALID_UID2] });
      expect(res.status).toBe(200);
    });

    test('7z join with existing concat file deletes it first', async () => {
      mockExistsSync.mockReturnValue(true); // _c file exists
      mockMongo
        .mockResolvedValueOnce([makeItem({ _id: VALID_UID, name: 'data.7z.001', owner: ADMIN._id })])
        .mockResolvedValueOnce([makeItem({ _id: VALID_UID2, name: 'data.7z.002', owner: ADMIN._id })]);
      mockHandleMediaUpload.mockResolvedValueOnce();

      const res = await request(app)
        .put('/join')
        .set('x-test-user', u(ADMIN))
        .send({ uids: [VALID_UID, VALID_UID2] });
      expect(res.status).toBe(200);
      expect(mockUnlink).toHaveBeenCalled();
    });

    test('exec failure returns 500', async () => {
      mockMongo
        .mockResolvedValueOnce([makeItem({ _id: VALID_UID, name: 'data.7z.001', owner: ADMIN._id })])
        .mockResolvedValueOnce([makeItem({ _id: VALID_UID2, name: 'data.7z.002', owner: ADMIN._id })]);
      mockExec.mockImplementation((cmd, cb) => cb(new Error('exec fail'), ''));

      const res = await request(app)
        .put('/join')
        .set('x-test-user', u(ADMIN))
        .send({ uids: [VALID_UID, VALID_UID2] });
      expect(res.status).toBe(500);
    });

    test('mixed base names produces fewer than 2 ordered items', async () => {
      mockMongo
        .mockResolvedValueOnce([makeItem({ _id: VALID_UID, name: 'a.part01.rar', owner: ADMIN._id })])
        .mockResolvedValueOnce([makeItem({ _id: VALID_UID2, name: 'b.part02.rar', owner: ADMIN._id })]);

      const res = await request(app)
        .put('/join')
        .set('x-test-user', u(ADMIN))
        .send({ uids: [VALID_UID, VALID_UID2] });
      expect([400, 500]).toContain(res.status);
    });

    test('RAR join with 3 parts copies all', async () => {
      mockMongo
        .mockResolvedValueOnce([makeItem({ _id: VALID_UID, name: 'arc.part01.rar', owner: ADMIN._id })])
        .mockResolvedValueOnce([makeItem({ _id: VALID_UID2, name: 'arc.part02.rar', owner: ADMIN._id })])
        .mockResolvedValueOnce([makeItem({ _id: VALID_UID3, name: 'arc.part03.rar', owner: ADMIN._id })]);
      mockHandleMediaUpload.mockResolvedValueOnce();

      const res = await request(app)
        .put('/join')
        .set('x-test-user', u(ADMIN))
        .send({ uids: [VALID_UID, VALID_UID2, VALID_UID3] });
      expect(res.status).toBe(200);
      // Two copy operations (parts 2 and 3)
      expect(mockCreateReadStream.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ---------------------------------------------------------------
  // POST /copy/:uid/:index — copy playlist item to standalone file
  // ---------------------------------------------------------------
  describe('POST /copy/:uid/:index', () => {
    test('invalid UID returns 400', async () => {
      const res = await request(app)
        .post('/copy/bad/0')
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('item not found returns error', async () => {
      mockMongo.mockResolvedValueOnce([]);
      const res = await request(app)
        .post(`/copy/${VALID_UID}/0`)
        .set('x-test-user', u(ADMIN));
      expect([400, 500]).toContain(res.status);
    });

    test('item with wrong status returns error', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ status: 3 })]);
      const res = await request(app)
        .post(`/copy/${VALID_UID}/0`)
        .set('x-test-user', u(ADMIN));
      expect([400, 500]).toContain(res.status);
    });

    test('index out of bounds returns error', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ playList: ['file.mp4'] })]);
      const res = await request(app)
        .post(`/copy/${VALID_UID}/5`)
        .set('x-test-user', u(ADMIN));
      expect([400, 500]).toContain(res.status);
    });

    test('_complete file missing returns error', async () => {
      mockMongo.mockResolvedValueOnce([makeItem()]);
      mockExistsSync.mockReturnValue(false);
      const res = await request(app)
        .post(`/copy/${VALID_UID}/0`)
        .set('x-test-user', u(ADMIN));
      expect([400, 500]).toContain(res.status);
    });

    test('successful copy creates new file entry with tags', async () => {
      // _complete exists
      mockExistsSync.mockImplementation((p) =>
        typeof p === 'string' && p.includes('_complete') ? true : false
      );
      mockMongo
        .mockResolvedValueOnce([makeItem({ tags: ['video', 'anime', 'playlist'] })])
        .mockResolvedValueOnce([{ _id: NEW_OID, name: 'video.mp4', adultonly: 0, first: 1 }]); // insert
      mockHandleTag.mockResolvedValueOnce([
        { type: 'video', fileIndex: 0 },
        { def: ['media'], opt: ['hd'] },
        { name: 'video.mp4', status: 0, untag: 1, first: 1, adultonly: 0 },
      ]);
      mockGetRelativeTag.mockResolvedValueOnce([]);
      mockHandleMediaUpload.mockResolvedValueOnce();

      const res = await request(app)
        .post(`/copy/${VALID_UID}/0`)
        .set('x-test-user', u(ADMIN))
        .send({ path: ['extra-tag'] });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id', NEW_OID);
      expect(res.body).toHaveProperty('name');
      expect(res.body).toHaveProperty('select');
      expect(res.body).toHaveProperty('option');
      expect(res.body).toHaveProperty('other');
      expect(mockSendWs).toHaveBeenCalledWith(expect.objectContaining({ type: 'file' }), 0);
    });

    test('parent tags exclude zip/playlist keywords', async () => {
      mockExistsSync.mockImplementation((p) =>
        typeof p === 'string' && p.includes('_complete') ? true : false
      );
      mockMongo
        .mockResolvedValueOnce([makeItem({ tags: ['video', '壓縮檔', 'zip', '播放列表', 'playlist', 'anime'] })])
        .mockResolvedValueOnce([{ _id: NEW_OID, name: 'video.mp4', adultonly: 0, first: 1 }]);
      mockHandleTag.mockResolvedValueOnce([
        { type: 'video', fileIndex: 0 },
        { def: [], opt: [] },
        { name: 'video.mp4', status: 0, untag: 1, first: 1, adultonly: 0 },
      ]);
      mockGetRelativeTag.mockResolvedValueOnce([]);
      mockHandleMediaUpload.mockResolvedValueOnce();

      const res = await request(app)
        .post(`/copy/${VALID_UID}/0`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      // 'anime' and 'video' should be in select, but not the excluded keywords
      const allTags = [...res.body.select, ...res.body.option];
      expect(allTags).not.toContain('壓縮檔');
      expect(allTags).not.toContain('播放列表');
    });

    test('content admin with adultonly parent sets adultonly on copy', async () => {
      mockExistsSync.mockImplementation((p) =>
        typeof p === 'string' && p.includes('_complete') ? true : false
      );
      mockMongo
        .mockResolvedValueOnce([makeItem({ adultonly: 1 })])
        .mockResolvedValueOnce([{ _id: NEW_OID, name: 'video.mp4', adultonly: 1, first: 1 }]);
      mockHandleTag.mockResolvedValueOnce([
        { type: 'video', fileIndex: 0 },
        { def: [], opt: [] },
        { name: 'video.mp4', status: 0, untag: 1, first: 1, adultonly: 1 },
      ]);
      mockGetRelativeTag.mockResolvedValueOnce([]);
      mockHandleMediaUpload.mockResolvedValueOnce();

      const res = await request(app)
        .post(`/copy/${VALID_UID}/0`)
        .set('x-test-user', u(CADMIN));
      expect(res.status).toBe(200);
      // handleTag should be called with adultonly: 1
      expect(mockHandleTag).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ adultonly: 1 }),
        expect.any(String), '', 0,
      );
    });

    test('non-admin user ignores parent adultonly', async () => {
      mockExistsSync.mockImplementation((p) =>
        typeof p === 'string' && p.includes('_complete') ? true : false
      );
      mockMongo
        .mockResolvedValueOnce([makeItem({ adultonly: 1 })])
        .mockResolvedValueOnce([{ _id: NEW_OID, name: 'video.mp4', adultonly: 0, first: 1 }]);
      mockHandleTag.mockResolvedValueOnce([
        { type: 'video', fileIndex: 0 },
        { def: [], opt: [] },
        { name: 'video.mp4', status: 0, untag: 1, first: 1, adultonly: 0 },
      ]);
      mockGetRelativeTag.mockResolvedValueOnce([]);
      mockHandleMediaUpload.mockResolvedValueOnce();

      const res = await request(app)
        .post(`/copy/${VALID_UID}/0`)
        .set('x-test-user', u(REGULAR));
      expect(res.status).toBe(200);
      expect(mockHandleTag).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ adultonly: 0 }),
        expect.any(String), '', 0,
      );
    });

    test('name collision with default tag appends suffix', async () => {
      mockExistsSync.mockImplementation((p) =>
        typeof p === 'string' && p.includes('_complete') ? true : false
      );
      mockIsDefaultTag.mockReturnValueOnce({ index: 1 }); // first call for name check
      mockIsDefaultTag.mockReturnValue(false); // subsequent
      mockMongo
        .mockResolvedValueOnce([makeItem({ playList: ['dir/default-name.mp4'] })])
        .mockResolvedValueOnce([{ _id: NEW_OID, name: 'default-name.mp41', adultonly: 0, first: 1 }]);
      mockHandleTag.mockResolvedValueOnce([
        { type: 'video', fileIndex: 0 },
        { def: [], opt: [] },
        { name: 'default-name.mp41', status: 0, untag: 1, first: 1, adultonly: 0 },
      ]);
      mockGetRelativeTag.mockResolvedValueOnce([]);
      mockHandleMediaUpload.mockResolvedValueOnce();

      const res = await request(app)
        .post(`/copy/${VALID_UID}/0`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockAddPost).toHaveBeenCalled();
    });

    test('relative tags limited to 5', async () => {
      mockExistsSync.mockImplementation((p) =>
        typeof p === 'string' && p.includes('_complete') ? true : false
      );
      mockMongo
        .mockResolvedValueOnce([makeItem()])
        .mockResolvedValueOnce([{ _id: NEW_OID, name: 'video.mp4', adultonly: 0, first: 1 }]);
      mockHandleTag.mockResolvedValueOnce([
        { type: 'video', fileIndex: 0 },
        { def: [], opt: [] },
        { name: 'video.mp4', status: 0, untag: 1, first: 1, adultonly: 0 },
      ]);
      mockGetRelativeTag.mockResolvedValueOnce(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7']);
      mockHandleMediaUpload.mockResolvedValueOnce();

      const res = await request(app)
        .post(`/copy/${VALID_UID}/0`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      // 5 relative tags + '18+' (admin with adultonly=0) = 6 max in option
      const relativeInOption = res.body.option.filter(t => t.startsWith('r'));
      expect(relativeInOption.length).toBeLessThanOrEqual(5);
    });

    test('handleMediaUpload failure → handleMediaError sends 500', async () => {
      mockExistsSync.mockImplementation((p) =>
        typeof p === 'string' && p.includes('_complete') ? true : false
      );
      mockMongo
        .mockResolvedValueOnce([makeItem()])
        .mockResolvedValueOnce([{ _id: NEW_OID, name: 'video.mp4', adultonly: 0, first: 1 }]);
      mockHandleTag.mockResolvedValueOnce([
        { type: 'video', fileIndex: 0 },
        { def: [], opt: [] },
        { name: 'video.mp4', status: 0, untag: 1, first: 1, adultonly: 0 },
      ]);
      mockGetRelativeTag.mockResolvedValueOnce([]);
      mockHandleMediaUpload.mockRejectedValueOnce(new Error('transcode fail'));

      const res = await request(app)
        .post(`/copy/${VALID_UID}/0`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('media processing failed');
      expect(mockHandleMediaError).toHaveBeenCalled();
      expect(mockErrorMedia).toHaveBeenCalled();
    });

    test('destination directory created if not exists', async () => {
      mockExistsSync.mockImplementation((p) => {
        if (typeof p === 'string' && p.includes('_complete')) return true;
        return false; // folder doesn't exist
      });
      mockMongo
        .mockResolvedValueOnce([makeItem()])
        .mockResolvedValueOnce([{ _id: NEW_OID, name: 'video.mp4', adultonly: 0, first: 1 }]);
      mockHandleTag.mockResolvedValueOnce([
        { type: 'video', fileIndex: 0 },
        { def: [], opt: [] },
        { name: 'video.mp4', status: 0, untag: 1, first: 1, adultonly: 0 },
      ]);
      mockGetRelativeTag.mockResolvedValueOnce([]);
      mockHandleMediaUpload.mockResolvedValueOnce();

      const res = await request(app)
        .post(`/copy/${VALID_UID}/0`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockMkdirp).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // GET /all/download/:uid — queue all pending downloads
  // ---------------------------------------------------------------
  describe('GET /all/download/:uid', () => {
    test('invalid UID returns 400', async () => {
      const res = await request(app)
        .get('/all/download/bad')
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('item not found returns error', async () => {
      mockMongo.mockResolvedValueOnce([]);
      const res = await request(app)
        .get(`/all/download/${VALID_UID}`)
        .set('x-test-user', u(ADMIN));
      expect([400, 500]).toContain(res.status);
    });

    test('all items complete returns {complete: true}', async () => {
      mockExistsSync.mockImplementation((p) =>
        typeof p === 'string' && p.includes('_complete') ? true : false
      );
      mockMongo.mockResolvedValueOnce([makeItem({ playList: ['f1', 'f2'] })]);

      const res = await request(app)
        .get(`/all/download/${VALID_UID}`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ complete: true });
    });

    test('all items errored returns {complete: true}', async () => {
      mockExistsSync.mockImplementation((p) =>
        typeof p === 'string' && p.includes('_error') ? true : false
      );
      mockMongo.mockResolvedValueOnce([makeItem({ playList: ['f1', 'f2'] })]);

      const res = await request(app)
        .get(`/all/download/${VALID_UID}`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ complete: true });
    });

    test('pending items queued with magnet torrent', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({
        magnet: encodeURIComponent('magnet:?xt=test'),
        playList: ['f1', 'f2'],
      })]);
      mockPlaylistApi.mockResolvedValue();

      const res = await request(app)
        .get(`/all/download/${VALID_UID}`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ complete: false });
      expect(mockPlaylistApi).toHaveBeenCalledWith('torrent add', expect.anything(), expect.any(String), expect.any(String), expect.any(String), expect.any(String), 1);
    });

    test('pending items queued with zip playlist', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({
        playList: ['f1', 'f2'],
        pwd: 'secret',
      })]);
      mockPlaylistApi.mockResolvedValue();

      const res = await request(app)
        .get(`/all/download/${VALID_UID}`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ complete: false });
      expect(mockPlaylistApi).toHaveBeenCalledWith('zip add', expect.anything(), expect.any(String), expect.any(String), expect.any(String), expect.any(String), 'secret');
    });

    test('mix of complete/error/pending queues only pending', async () => {
      mockExistsSync.mockImplementation((p) => {
        if (typeof p === 'string') {
          if (p.endsWith('/0_complete')) return true;   // item 0: complete
          if (p.endsWith('/1_error')) return true;       // item 1: errored
        }
        return false; // item 2: pending
      });
      mockMongo.mockResolvedValueOnce([makeItem({
        playList: ['f0', 'f1', 'f2'],
        magnet: encodeURIComponent('magnet:?xt=test'),
      })]);

      const res = await request(app)
        .get(`/all/download/${VALID_UID}`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ complete: false });
      // Only 1 item queued (index 2)
      expect(mockPlaylistApi).toHaveBeenCalledTimes(1);
    });

    test('first queue item uses pType=1, subsequent use pType=2', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({
        playList: ['f0', 'f1', 'f2'],
        magnet: encodeURIComponent('magnet:?xt=test'),
      })]);

      const res = await request(app)
        .get(`/all/download/${VALID_UID}`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      // First call should have pType=1, second pType=2
      const calls = mockPlaylistApi.mock.calls;
      expect(calls[0][6]).toBe(1);
      if (calls.length > 1) {
        expect(calls[1][6]).toBe(2);
      }
    });

    test('PlaylistApi failure returns error', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({
        playList: ['f1'],
        magnet: encodeURIComponent('magnet:?xt=test'),
      })]);
      mockPlaylistApi.mockRejectedValueOnce(new Error('api fail'));

      const res = await request(app)
        .get(`/all/download/${VALID_UID}`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // GET /check/:uid/:index/:size — check download progress
  // ---------------------------------------------------------------
  describe('GET /check/:uid/:index/:size', () => {
    test('invalid UID returns 400', async () => {
      const res = await request(app)
        .get('/check/bad/0/0')
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
    });

    test('item not found returns error', async () => {
      mockMongo.mockResolvedValueOnce([]);
      const res = await request(app)
        .get(`/check/${VALID_UID}/0/0`)
        .set('x-test-user', u(ADMIN));
      expect([400, 500]).toContain(res.status);
    });

    test('error file exists returns error', async () => {
      mockMongo.mockResolvedValueOnce([makeItem()]);
      mockExistsSync.mockImplementation((p) =>
        typeof p === 'string' && p.includes('_error') ? true : false
      );
      const res = await request(app)
        .get(`/check/${VALID_UID}/0/0`)
        .set('x-test-user', u(ADMIN));
      expect([400, 500]).toContain(res.status);
    });

    test('download complete returns newBuffer=true, complete=true', async () => {
      mockMongo.mockResolvedValueOnce([makeItem()]);
      mockExistsSync.mockImplementation((p) =>
        typeof p === 'string' && p.includes('_complete') ? true : false
      );
      mockStatSync.mockReturnValue({ size: 5000 });

      const res = await request(app)
        .get(`/check/${VALID_UID}/0/0`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ newBuffer: true, complete: true, ret_size: 5000 });
      // No PlaylistApi call for complete files
      expect(mockPlaylistApi).not.toHaveBeenCalled();
    });

    test('download in progress with enough new data returns newBuffer=true', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ magnet: encodeURIComponent('magnet:?xt=test') })]);
      const TEN_MB = 10 * 1024 * 1024;
      mockExistsSync.mockImplementation((p) => {
        if (typeof p === 'string') {
          if (p.includes('_complete') || p.includes('_error')) return false;
          // Buffer file exists (no suffix)
          if (/\/\d+$/.test(p)) return true;
        }
        return false;
      });
      mockStatSync.mockReturnValue({ size: TEN_MB + 100 + 1 });

      const res = await request(app)
        .get(`/check/${VALID_UID}/0/100`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.newBuffer).toBe(true);
      expect(res.body.complete).toBe(false);
      expect(mockPlaylistApi).toHaveBeenCalled();
    });

    test('download in progress with insufficient new data returns newBuffer=false', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ magnet: encodeURIComponent('magnet:?xt=test') })]);
      const TEN_MB = 10 * 1024 * 1024;
      mockExistsSync.mockImplementation((p) => {
        if (typeof p === 'string') {
          if (p.includes('_complete') || p.includes('_error')) return false;
          if (/\/\d+$/.test(p)) return true;
        }
        return false;
      });
      mockStatSync.mockReturnValue({ size: TEN_MB + 100 }); // exactly at threshold

      const res = await request(app)
        .get(`/check/${VALID_UID}/0/100`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.newBuffer).toBe(false);
      expect(res.body.complete).toBe(false);
    });

    test('download not started returns {start: true} and triggers download', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ magnet: encodeURIComponent('magnet:?xt=test') })]);

      const res = await request(app)
        .get(`/check/${VALID_UID}/0/0`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ start: true });
      expect(mockPlaylistApi).toHaveBeenCalledWith('torrent add', expect.anything(), expect.any(String), 0, expect.any(String), expect.any(String));
    });

    test('zip-based playlist uses PlaylistApi zip add', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ pwd: 'pass123' })]);

      const res = await request(app)
        .get(`/check/${VALID_UID}/0/0`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockPlaylistApi).toHaveBeenCalledWith('zip add', expect.anything(), 0, expect.any(String), expect.any(String), expect.any(String), 'pass123');
    });

    test('index=v finds first video in playlist', async () => {
      mockIsVideo.mockImplementation((name) => name === 'dir/video.mp4');
      mockMongo.mockResolvedValueOnce([makeItem({
        playList: ['dir/doc.pdf', 'dir/video.mp4'],
        magnet: encodeURIComponent('magnet:?xt=test'),
      })]);

      const res = await request(app)
        .get(`/check/${VALID_UID}/v/0`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ start: true });
      // Should use index 1 (the video)
      expect(mockPlaylistApi).toHaveBeenCalledWith('torrent add', expect.anything(), expect.any(String), 1, expect.any(String), expect.any(String));
    });

    test('index=v with no video defaults to 0', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({
        playList: ['dir/doc.pdf', 'dir/image.png'],
        magnet: encodeURIComponent('magnet:?xt=test'),
      })]);

      const res = await request(app)
        .get(`/check/${VALID_UID}/v/0`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      // Uses default index 0
      expect(mockPlaylistApi).toHaveBeenCalledWith('torrent add', expect.anything(), expect.any(String), 0, expect.any(String), expect.any(String));
    });

    test('numeric index used directly', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ magnet: encodeURIComponent('magnet:?xt=test') })]);

      const res = await request(app)
        .get(`/check/${VALID_UID}/1/500`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(mockPlaylistApi).toHaveBeenCalledWith('torrent add', expect.anything(), expect.any(String), 1, expect.any(String), expect.any(String));
    });

    test('10MB threshold boundary (exactly at) is newBuffer=false', async () => {
      const TEN_MB = 10 * 1024 * 1024;
      mockMongo.mockResolvedValueOnce([makeItem({ magnet: encodeURIComponent('magnet:?xt=test') })]);
      mockExistsSync.mockImplementation((p) => {
        if (typeof p === 'string') {
          if (p.includes('_complete') || p.includes('_error')) return false;
          if (/\/\d+$/.test(p)) return true;
        }
        return false;
      });
      mockStatSync.mockReturnValue({ size: 500 + TEN_MB }); // exactly at threshold

      const res = await request(app)
        .get(`/check/${VALID_UID}/0/500`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.newBuffer).toBe(false);
    });

    test('10MB threshold boundary +1 byte is newBuffer=true', async () => {
      const TEN_MB = 10 * 1024 * 1024;
      mockMongo.mockResolvedValueOnce([makeItem({ magnet: encodeURIComponent('magnet:?xt=test') })]);
      mockExistsSync.mockImplementation((p) => {
        if (typeof p === 'string') {
          if (p.includes('_complete') || p.includes('_error')) return false;
          if (/\/\d+$/.test(p)) return true;
        }
        return false;
      });
      mockStatSync.mockReturnValue({ size: 500 + TEN_MB + 1 });

      const res = await request(app)
        .get(`/check/${VALID_UID}/0/500`)
        .set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.newBuffer).toBe(true);
    });
  });
});
