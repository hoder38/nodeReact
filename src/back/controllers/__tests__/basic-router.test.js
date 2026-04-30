/**
 * basic-router.test.js — Comprehensive tests for:
 *   - src/back/controllers/basic-router.js   (main server: /api)
 *   - src/back/controllers/file-basic-router.js (file server: /f/api)
 *
 * basic-router.js routes:
 *   GET /getuser  → returns user info, ws_url, level, isEdit, nav, main_url
 *   GET /testLogin → login check (type=0)
 *   GET /getPath  → returns current tag search path from session
 *
 * file-basic-router.js routes:
 *   GET /testLogin → login check (type=1, allows mobile/Firefox for media paths)
 *
 * Covers: all permission levels, checkLogin/checkAdmin branches, tag session,
 *   unauthenticated access, mobile UA bypass logic.
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// =====================================================================
// 1. MOCK SETUP
// =====================================================================

// --- fs ---
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
    existsSync: jest.fn(() => false),
    readdirSync: jest.fn(() => []),
    lstatSync: jest.fn(() => ({ isDirectory: () => false })),
    unlinkSync: jest.fn(),
    rmdirSync: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    createWriteStream: jest.fn(),
    statSync: jest.fn(() => ({ size: 0 })),
    renameSync: jest.fn(),
    writeFileSync: jest.fn(),
    unlink: jest.fn(),
  },
}));

// --- ver.js ---
jest.unstable_mockModule('../../../../ver.js', () => ({
  ENV_TYPE: 'test',
  CA: '/test/ca.pem',
  CERT: '/test/cert.pem',
  PKEY: '/test/key.pem',
  SESS_SECRET: 'test-secret',
  SESS_PWD: 'test-pwd',
}));

// --- config.js ---
jest.unstable_mockModule('../../config.js', () => ({
  EXTENT_FILE_IP: jest.fn(() => 'test-file-host'),
  EXTENT_FILE_PORT: jest.fn(() => 9084),
  WS_PORT: jest.fn(() => 8080),
  EXTENT_IP: jest.fn(() => 'test-host'),
  EXTENT_PORT: jest.fn(() => 9082),
  NAS_PREFIX: jest.fn(() => '/test/storage'),
  NAS_TMP: jest.fn(() => '/test/tmp'),
  IP: jest.fn(() => '127.0.0.1'),
  PORT: jest.fn(() => 3000),
  FILE_IP: jest.fn(() => '127.0.0.1'),
  FILE_PORT: jest.fn(() => 3001),
  COM_PORT: jest.fn(() => 8083),
  APP_HTML: jest.fn(() => 'app.html'),
  DB_NAME: jest.fn(() => 'testdb'),
  DB_IP: jest.fn(() => '127.0.0.1'),
  DB_PORT: jest.fn(() => 27017),
  SESS_IP: jest.fn(() => '127.0.0.1'),
  SESS_PORT: jest.fn(() => 6379),
  HINT: jest.fn(() => false),
}));

// --- constants.js ---
jest.unstable_mockModule('../../constants.js', () => ({
  STORAGEDB: 'storage',
  STOCKDB: 'stock',
  PASSWORDDB: 'password',
  USERDB: 'user',
  VERIFYDB: 'verify',
  STATIC_PATH: '/test/public',
  RE_WEBURL: /^https?:\/\//,
  QUERY_LIMIT: 20,
  RELEASE: 'release',
  DEV: 'dev',
  // tag-tool needs many constants; provide minimal set
  DEFAULT_TAGS: [],
  STORAGE_PARENT: [],
  PASSWORD_PARENT: [],
  STOCK_PARENT: [],
  HANDLE_TIME: 7200,
  UNACTIVE_DAY: 5,
  UNACTIVE_HIT: 10,


  RELATIVE_LIMIT: 100,
  RELATIVE_UNION: 2,
  RELATIVE_INTER: 3,
  GENRE_LIST: [],
  GENRE_LIST_CH: [],
  BOOKMARK_LIMIT: 100,
  ADULTONLY_PARENT: [],
  GAME_LIST: [],
  GAME_LIST_CH: [],
  MEDIA_LIST: [],
  MEDIA_LIST_CH: [],
  DM5_ORI_LIST: [],
  DM5_CH_LIST: [],
  DM5_LIST: [],
  DM5_AREA_LIST: [],
  DM5_TAG_LIST: [],

}));

// --- mongo-tool.js ---
jest.unstable_mockModule('../../models/mongo-tool.js', () => ({
  default: jest.fn(() => Promise.resolve([])),
  objectID: jest.fn((id) => id),
}));

// --- tag-tool.js: mock the TagTool factory ---
const mockGetArray = jest.fn(() => ({ cur: ['tag1', 'tag2'] }));
const mockSearchTags = jest.fn(() => ({ getArray: mockGetArray }));
jest.unstable_mockModule('../../models/tag-tool.js', () => ({
  default: jest.fn(() => ({ searchTags: mockSearchTags })),
  isDefaultTag: jest.fn(() => false),
  normalize: jest.fn((s) => s),
}));

// --- mime.js (needed by tag-tool) ---
jest.unstable_mockModule('../../util/mime.js', () => ({
  getOptionTag: jest.fn(() => []),
}));

// =====================================================================
// 2. DYNAMIC IMPORTS
// =====================================================================
const { default: Express } = await import('express');
const { default: request } = await import('supertest');
const { default: BasicRouter } = await import('../basic-router.js');
const { default: FileBasicRouter } = await import('../file-basic-router.js');
const { checkLogin } = await import('../../util/utility.js');

// =====================================================================
// 3. HELPERS: Build test apps with simulated auth
// =====================================================================

// Common auth simulation middleware
function authMiddleware(req, res, next) {
  if (req.headers['x-test-user']) {
    const user = JSON.parse(req.headers['x-test-user']);
    req.user = user;
    req.isAuthenticated = () => true;
  } else {
    req.isAuthenticated = () => false;
  }
  // Simulate session
  if (!req.session) req.session = {};
  next();
}

function buildBasicApp() {
  const app = Express();
  app.use(Express.json());
  app.use(authMiddleware);
  app.use('/', BasicRouter);
  app.use((err, req, res, next) => {
    err.name === 'HoError'
      ? res.status(err.code).send(err.message.toString())
      : res.status(500).send('server error occur');
  });
  return app;
}

function buildFileBasicApp() {
  const app = Express();
  app.use(Express.json());
  app.use(authMiddleware);
  app.use('/', FileBasicRouter);
  app.use((err, req, res, next) => {
    err.name === 'HoError'
      ? res.status(err.code).send(err.message.toString())
      : res.status(500).send('server error occur');
  });
  return app;
}

// =====================================================================
// 4. TEST DATA
// =====================================================================
const ADMIN_USER = { _id: 'aabbccddeeff001122334455', username: 'admin', perm: 1, auto: false };
const CONTENT_ADMIN = { _id: 'aabbccddeeff001122334456', username: 'editor', perm: 2, auto: false };
const REGULAR_USER = { _id: 'aabbccddeeff001122334457', username: 'user', perm: 0, auto: false };
const HIGH_PERM_USER = { _id: 'aabbccddeeff001122334458', username: 'highperm', perm: 5, auto: false };

// =====================================================================
// 5. TEST SUITES
// =====================================================================

// =================================================================
// basic-router.js
// =================================================================
describe('basic-router.js — Main Server API Basics', () => {
  let app;
  beforeEach(() => {
    app = buildBasicApp();
    mockSearchTags.mockClear();
    mockGetArray.mockClear();
  });

  // ---------------------------------------------------------------
  // GET /getuser
  // ---------------------------------------------------------------
  describe('GET /getuser', () => {
    // --- Authentication ---
    test('unauthenticated request returns 401', async () => {
      const res = await request(app).get('/getuser');
      expect(res.status).toBe(401);
    });

    // --- Admin user (perm=1) ---
    test('admin user (perm=1) gets level=2, isEdit=true, nav with Stock', async () => {
      const res = await request(app)
        .get('/getuser')
        .set('x-test-user', JSON.stringify(ADMIN_USER));
      expect(res.status).toBe(200);
      expect(res.body.id).toBe('admin');
      expect(res.body.level).toBe(2);
      expect(res.body.isEdit).toBe(true);
      expect(res.body.nav).toEqual([
        { title: 'Stock', hash: '/Stock', css: 'glyphicon glyphicon-signal', key: 3 },
      ]);
    });

    test('admin user gets correct ws_url', async () => {
      const res = await request(app)
        .get('/getuser')
        .set('x-test-user', JSON.stringify(ADMIN_USER));
      expect(res.body.ws_url).toBe('wss://test-file-host:8080/f');
    });

    test('admin user gets correct main_url', async () => {
      const res = await request(app)
        .get('/getuser')
        .set('x-test-user', JSON.stringify(ADMIN_USER));
      expect(res.body.main_url).toBe('https://test-file-host:9084/f');
    });

    // --- Content admin user (perm=2) ---
    test('content admin (perm=2) gets level=1, isEdit=false, empty nav', async () => {
      const res = await request(app)
        .get('/getuser')
        .set('x-test-user', JSON.stringify(CONTENT_ADMIN));
      expect(res.body.level).toBe(1);
      expect(res.body.isEdit).toBe(false);
      expect(res.body.nav).toEqual([]);
    });

    // --- Regular user (perm=0) ---
    test('regular user (perm=0) gets level=0, isEdit=false, empty nav', async () => {
      const res = await request(app)
        .get('/getuser')
        .set('x-test-user', JSON.stringify(REGULAR_USER));
      expect(res.body.level).toBe(0);
      expect(res.body.isEdit).toBe(false);
      expect(res.body.nav).toEqual([]);
    });

    test('regular user still gets id and urls', async () => {
      const res = await request(app)
        .get('/getuser')
        .set('x-test-user', JSON.stringify(REGULAR_USER));
      expect(res.body.id).toBe('user');
      expect(res.body.ws_url).toBeDefined();
      expect(res.body.main_url).toBeDefined();
    });

    // --- High perm user (perm=5, exceeds both admin thresholds) ---
    test('high perm user (perm=5) gets level=0 (checkAdmin fails for perm > threshold)', async () => {
      // checkAdmin(n, user) returns true when user.perm > 0 && user.perm <= n
      // For perm=5: checkAdmin(1, user) → false (5 > 1), checkAdmin(2, user) → false (5 > 2)
      const res = await request(app)
        .get('/getuser')
        .set('x-test-user', JSON.stringify(HIGH_PERM_USER));
      expect(res.body.level).toBe(0);
      expect(res.body.isEdit).toBe(false);
      expect(res.body.nav).toEqual([]);
    });

    // --- Response structure ---
    test('response has all required fields', async () => {
      const res = await request(app)
        .get('/getuser')
        .set('x-test-user', JSON.stringify(ADMIN_USER));
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('ws_url');
      expect(res.body).toHaveProperty('level');
      expect(res.body).toHaveProperty('isEdit');
      expect(res.body).toHaveProperty('nav');
      expect(res.body).toHaveProperty('main_url');
    });
  });

  // ---------------------------------------------------------------
  // GET /testLogin
  // ---------------------------------------------------------------
  describe('GET /testLogin', () => {
    test('authenticated request returns {apiOK: true}', async () => {
      const res = await request(app)
        .get('/testLogin')
        .set('x-test-user', JSON.stringify(REGULAR_USER));
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
    });

    test('unauthenticated request returns 401', async () => {
      const res = await request(app).get('/testLogin');
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------
  // GET /getPath
  // ---------------------------------------------------------------
  describe('GET /getPath', () => {
    test('authenticated request returns tag search path from session', async () => {
      const res = await request(app)
        .get('/getPath')
        .set('x-test-user', JSON.stringify(ADMIN_USER));
      expect(res.status).toBe(200);
      expect(res.body.path).toEqual(['tag1', 'tag2']);
      expect(mockSearchTags).toHaveBeenCalled();
    });

    test('unauthenticated request returns 401', async () => {
      const res = await request(app).get('/getPath');
      expect(res.status).toBe(401);
    });

    test('getPath calls searchTags with request session', async () => {
      await request(app)
        .get('/getPath')
        .set('x-test-user', JSON.stringify(ADMIN_USER));
      expect(mockSearchTags).toHaveBeenCalledTimes(1);
      // searchTags is called with req.session (an object)
      expect(typeof mockSearchTags.mock.calls[0][0]).toBe('object');
    });

    test('getPath result comes from TagTool chain: searchTags().getArray().cur', async () => {
      mockGetArray.mockReturnValueOnce({ cur: ['path1'] });
      const res = await request(app)
        .get('/getPath')
        .set('x-test-user', JSON.stringify(ADMIN_USER));
      expect(res.body.path).toEqual(['path1']);
    });
  });
});

// =================================================================
// file-basic-router.js
// =================================================================
describe('file-basic-router.js — File Server API Basics', () => {
  let app;
  beforeEach(() => {
    app = buildFileBasicApp();
  });

  // ---------------------------------------------------------------
  // GET /testLogin (type=1: mobile/Firefox bypass logic)
  // ---------------------------------------------------------------
  describe('GET /testLogin (type=1)', () => {
    test('authenticated request returns {apiOK: true}', async () => {
      const res = await request(app)
        .get('/testLogin')
        .set('x-test-user', JSON.stringify(REGULAR_USER));
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
    });

    test('unauthenticated desktop Chrome request returns 401', async () => {
      const res = await request(app)
        .get('/testLogin')
        .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/91.0');
      expect(res.status).toBe(401);
    });

    // Note: checkLogin type=1 allows mobile/Firefox for specific /f/video|subtitle|torrent paths
    // But /testLogin path itself is NOT one of those exempted paths, so mobile still gets 401
    test('unauthenticated mobile request to /testLogin returns 401 (path not exempted)', async () => {
      const res = await request(app)
        .get('/testLogin')
        .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0) Mobile');
      expect(res.status).toBe(401);
    });

    test('unauthenticated Firefox request to /testLogin returns 401 (path not exempted)', async () => {
      const res = await request(app)
        .get('/testLogin')
        .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; rv:89.0) Gecko/20100101 Firefox/89.0');
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------
  // checkLogin type=1: mobile/Firefox bypass for media paths
  // (testing via a custom app that mounts routes at /f/... paths)
  // ---------------------------------------------------------------
  describe('checkLogin type=1 — mobile/Firefox media path bypass', () => {
    // checkLogin checks req.path against /^\/f\/video\//, /^\/f\/subtitle\//, /^\/f\/torrent\//
    // For req.path to include the /f/ prefix, routes must be at app root (not mounted under /f)
    function buildMediaApp() {
      const mediaApp = Express();
      mediaApp.use(Express.json());
      mediaApp.use(authMiddleware);

      // Mount routes at app level so req.path retains /f/ prefix
      mediaApp.get('/f/video/test', (req, res, next) => {
        checkLogin(req, res, () => res.json({ apiOK: true }), 1);
      });
      mediaApp.get('/f/subtitle/test', (req, res, next) => {
        checkLogin(req, res, () => res.json({ apiOK: true }), 1);
      });
      mediaApp.get('/f/torrent/test', (req, res, next) => {
        checkLogin(req, res, () => res.json({ apiOK: true }), 1);
      });
      mediaApp.get('/f/other/test', (req, res, next) => {
        checkLogin(req, res, () => res.json({ apiOK: true }), 1);
      });
      mediaApp.use((err, req, res, next) => {
        err.name === 'HoError'
          ? res.status(err.code).send(err.message.toString())
          : res.status(500).send('server error occur');
      });
      return mediaApp;
    }

    let mediaApp;
    beforeEach(() => {
      mediaApp = buildMediaApp();
    });

    test('mobile user on /f/video/ path is allowed through (bypass)', async () => {
      const res = await request(mediaApp)
        .get('/f/video/test')
        .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0) AppleWebKit/605 Mobile/15E148');
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
    });

    test('Firefox user on /f/subtitle/ path is allowed through (bypass)', async () => {
      const res = await request(mediaApp)
        .get('/f/subtitle/test')
        .set('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0');
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
    });

    test('mobile user on /f/torrent/ path is allowed through (bypass)', async () => {
      const res = await request(mediaApp)
        .get('/f/torrent/test')
        .set('User-Agent', 'Mozilla/5.0 (Linux; Android 11) Mobile');
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
    });

    test('mobile user on non-media path (/f/other/) returns 401', async () => {
      const res = await request(mediaApp)
        .get('/f/other/test')
        .set('User-Agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0) Mobile');
      expect(res.status).toBe(401);
    });

    test('desktop Chrome on /f/video/ path returns 401 (not mobile/Firefox)', async () => {
      const res = await request(mediaApp)
        .get('/f/video/test')
        .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/91.0');
      expect(res.status).toBe(401);
    });

    test('armv7l user-agent on /f/video/ path is allowed through', async () => {
      const res = await request(mediaApp)
        .get('/f/video/test')
        .set('User-Agent', 'Mozilla/5.0 (Linux armv7l) something');
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
    });

    test('authenticated desktop user on any path succeeds', async () => {
      const res = await request(mediaApp)
        .get('/f/other/test')
        .set('x-test-user', JSON.stringify(REGULAR_USER))
        .set('User-Agent', 'Mozilla/5.0 Chrome/91.0');
      expect(res.status).toBe(200);
    });
  });
});
