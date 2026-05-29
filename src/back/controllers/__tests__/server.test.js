/**
 * server.test.js — Comprehensive tests for src/back/controllers/server.js
 *
 * Covers: SSL/TLS config, HTTPS server creation, middleware ordering,
 * route mounting, error handler, session config, process-level settings.
 *
 * Strategy: Mock all I/O (fs, https, Redis, MongoDB, routers, WebSocket)
 * but use REAL Express + body-parser + passport for middleware integration.
 * The Express app is captured from the mocked https.createServer call.
 */
import { jest, describe, test, expect, beforeAll } from '@jest/globals';

// =====================================================================
// 1. MOCK SETUP — all mocks MUST be registered before dynamic import()
// =====================================================================

// --- fs: avoid reading real SSL cert files ---
const mockReadFileSync = jest.fn(() => Buffer.from('mock-cert-data'));
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
    readFileSync: mockReadFileSync,
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

// --- https: capture Express app, prevent real listening ---
let capturedCredentials = null;
let capturedApp = null;
const mockListen = jest.fn();
jest.unstable_mockModule('https', () => ({
  default: {
    Agent: jest.fn(),
    createServer: jest.fn((creds, app) => {
      capturedCredentials = creds;
      capturedApp = app;
      return { listen: mockListen, on: jest.fn() };
    }),
  },
}));

// --- ver.js: test environment variables ---
jest.unstable_mockModule('../../../../ver.js', () => ({
  PASSWORD_SALT: 'test_salt_',
  ENV_TYPE: 'test',
  CA: '/test/ca.pem',
  CERT: '/test/cert.pem',
  PKEY: '/test/key.pem',
  SESS_SECRET: 'test-session-secret',
  SESS_PWD: 'test-redis-password',
}));

// --- config.js: test config values ---
jest.unstable_mockModule('../../config.js', () => ({
  EXTENT_FILE_IP: jest.fn(() => 'test-file-host'),
  EXTENT_FILE_PORT: jest.fn(() => 9084),
  EXTENT_IP: jest.fn(() => 'test-host'),
  EXTENT_PORT: jest.fn(() => 9082),
  IP: jest.fn(() => '127.0.0.1'),
  PORT: jest.fn(() => 3000),
  APP_HTML: jest.fn(() => 'app.html'),
  NAS_PREFIX: jest.fn(() => '/test/storage'),
  NAS_TMP: jest.fn(() => '/test/tmp'),
  FILE_IP: jest.fn(() => '127.0.0.1'),
  FILE_PORT: jest.fn(() => 3001),
  EXTENT_FILE_IP: jest.fn(() => 'test-file-host'),
  EXTENT_FILE_PORT: jest.fn(() => 9084),
  DB_NAME: jest.fn(() => 'testdb'),
  DB_IP: jest.fn(() => '127.0.0.1'),
  DB_PORT: jest.fn(() => 27017),
  SESS_IP: jest.fn(() => '127.0.0.1'),
  SESS_PORT: jest.fn(() => 6379),
  COM_PORT: jest.fn(() => 8083),
  WS_PORT: jest.fn(() => 8080),
  HINT: jest.fn(() => false),
  AUTO_UPLOAD: jest.fn(() => false),
  UPDATE_STOCK: jest.fn(() => false),
  CHECK_MEDIA: jest.fn(() => false),
  STOCK_FILTER: jest.fn(() => false),
  DB_BACKUP: jest.fn(() => false),
  CHECK_STOCK: jest.fn(() => false),
  BITFINEX_LOAN: jest.fn(() => false),
  BITFINEX_FILTER: jest.fn(() => false),
  BITFINEX_ORDER: jest.fn(() => false),
  USSE_TICKER: jest.fn(() => false),
  TWSE_TICKER: jest.fn(() => false),
  GOOGLE_MEDIA_FOLDER: jest.fn(() => ''),
  GOOGLE_BACKUP_FOLDER: jest.fn(() => ''),
  GOOGLE_DB_BACKUP_FOLDER: jest.fn(() => ''),
  BACKUP_PATH: jest.fn(() => '/test/backup'),
  API_LIMIT: jest.fn(() => 10),
  TORRENT_LIMIT: jest.fn(() => 5),
  ZIP_LIMIT: jest.fn(() => 1),
  MEGA_LIMIT: jest.fn(() => 1),
}));

// --- constants.js: minimal constants needed by utility.js ---
jest.unstable_mockModule('../../constants.js', () => ({
  STATIC_PATH: '/test/public',
  __dirname: '/test/src/back',
  RELEASE: 'release',
  DEV: 'dev',
  USERDB: 'user',
  STORAGEDB: 'storage',
 
  STOCKDB: 'stock',
  PASSWORDDB: 'password',
  TOTALDB: 'total',
  RE_WEBURL: /^https?:\/\//,
  QUERY_LIMIT: 20,
  MAX_RETRY: 10,
  HANDLE_TIME: 7200,
  NOISE_TIME: 172800,
  NOISE_SIZE: 104857600,
  RELATIVE_LIMIT: 100,
  RELATIVE_UNION: 2,
  RELATIVE_INTER: 3,
  BOOKMARK_LIMIT: 100,
  DRIVE_LIMIT: 100,
  BACKUP_LIMIT: 1000,
  TORRENT_CONNECT: 100,
  TORRENT_UPLOAD: 5,
  CACHE_EXPIRE: 86400,
  OATH_WAITING: 60,
  TORRENT_DURATION: 172800,
  ZIP_DURATION: 21600,
  MEGA_DURATION: 86400,
  DRIVE_INTERVAL: 3600,
  DOC_INTERVAL: 3600,
  MEDIA_INTERVAL: 7200,
  EXTERNAL_INTERVAL: 604800,
  STOCK_INTERVAL: 172800,
  BACKUP_INTERVAL: 86400,
  PRICE_INTERVAL: 600,
  RATE_INTERVAL: 90,
  ORDER_INTERVAL: 21600,
  USSE_ORDER_INTERVAL: 86400,
  TWSE_ORDER_INTERVAL: 86400,
  STOCK_FILTER_LIMIT: 100,
  ALGORITHM: 'aes-256-gcm',
  ALGORITHM_LEGACY: 'aes-256-ctr',
  KINDLE_LIMIT: 52428800,
  UNACTIVE_DAY: 5,
  UNACTIVE_HIT: 10,
}));

// --- session-tool.js: MemoryStore config (avoid Redis) ---
const mockSessionStore = jest.fn(() => ({
  config: {
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false,
  },
}));
jest.unstable_mockModule('../../models/session-tool.js', () => ({
  default: mockSessionStore,
}));

// --- mongo-tool.js: avoid MongoDB connection ---
jest.unstable_mockModule('../../models/mongo-tool.js', () => ({
  default: jest.fn(() => Promise.resolve([])),
  objectID: jest.fn((id) => id),
}));

// --- sendWs.js: avoid WebSocket/TCP setup ---
const mockWsInit = jest.fn();
jest.unstable_mockModule('../../util/sendWs.js', () => ({
  init: mockWsInit,
  mainInit: jest.fn(),
  default: jest.fn(),
}));

// --- Routers: mock all to isolate server wiring ---
// LoginRouter is a factory function: export default function(url) { return router }
let mockLoginRouterInstance = null;
const mockLoginRouterFn = jest.fn((url) => {
  mockLoginRouterInstance = jest.fn((req, res, next) => next());
  return mockLoginRouterInstance;
});
jest.unstable_mockModule('../login-router.js', () => ({
  default: mockLoginRouterFn,
}));

const mockBasicRouter = jest.fn((req, res, next) => next());
jest.unstable_mockModule('../basic-router.js', () => ({ default: mockBasicRouter }));

const mockHomeRouter = jest.fn((req, res, next) => next());
jest.unstable_mockModule('../home-router.js', () => ({ default: mockHomeRouter }));

const mockUserRouter = jest.fn((req, res, next) => next());
jest.unstable_mockModule('../user-router.js', () => ({ default: mockUserRouter }));

const mockStorageRouter = jest.fn((req, res, next) => next());
jest.unstable_mockModule('../storage-router.js', () => ({ default: mockStorageRouter }));

const mockPasswordRouter = jest.fn((req, res, next) => next());
jest.unstable_mockModule('../password-router.js', () => ({ default: mockPasswordRouter }));

const mockStockRouter = jest.fn((req, res, next) => next());
jest.unstable_mockModule('../stock-router.js', () => ({ default: mockStockRouter }));

const mockBookmarkRouter = jest.fn((req, res, next) => next());
jest.unstable_mockModule('../bookmark-router.js', () => ({ default: mockBookmarkRouter }));

const mockParentRouter = jest.fn((req, res, next) => next());
jest.unstable_mockModule('../parent-router.js', () => ({ default: mockParentRouter }));

// OtherRouter: supports triggering errors via x-test-error header
const mockOtherRouter = jest.fn((req, res, next) => {
  if (req.headers['x-test-error'] === 'generic') {
    return next(new Error('test generic error'));
  }
  if (req.headers['x-test-error'] === 'hoerror') {
    const err = new Error('test ho error');
    err.name = 'HoError';
    err.code = 403;
    return next(err);
  }
  next();
});
jest.unstable_mockModule('../other-router.js', () => ({ default: mockOtherRouter }));

// =====================================================================
// 2. DYNAMIC IMPORTS (after all mocks are set up)
// =====================================================================
const { default: request } = await import('supertest');

const initialListenerCount = process.listenerCount('uncaughtException');

// Import server.js — triggers all side effects (app creation, middleware, listen)
await import('../server.js');

// =====================================================================
// 3. TEST SUITES
// =====================================================================
describe('server.js — Main API Server', () => {
  // ---------------------------------------------------------------
  // SSL/TLS Configuration
  // ---------------------------------------------------------------
  describe('SSL/TLS Configuration', () => {
    test('reads certificate file from CERT path', () => {
      expect(mockReadFileSync).toHaveBeenCalledWith('/test/cert.pem');
    });

    test('reads CA chain file from CA path', () => {
      expect(mockReadFileSync).toHaveBeenCalledWith('/test/ca.pem');
    });

    test('reads private key file from PKEY path', () => {
      expect(mockReadFileSync).toHaveBeenCalledWith('/test/key.pem');
    });

    test('credentials contain cert, ca, and key as Buffers', () => {
      expect(capturedCredentials).toBeDefined();
      expect(capturedCredentials.cert).toEqual(Buffer.from('mock-cert-data'));
      expect(capturedCredentials.ca).toEqual(Buffer.from('mock-cert-data'));
      expect(capturedCredentials.key).toEqual(Buffer.from('mock-cert-data'));
    });

    test('cipher suite contains all 16 required entries', () => {
      const ciphers = capturedCredentials.ciphers.split(':');
      expect(ciphers).toEqual([
        'ECDHE-RSA-AES256-SHA384',
        'DHE-RSA-AES256-SHA384',
        'ECDHE-RSA-AES256-SHA256',
        'DHE-RSA-AES256-SHA256',
        'ECDHE-RSA-AES128-SHA256',
        'DHE-RSA-AES128-SHA256',
        'HIGH',
        '!aNULL',
        '!eNULL',
        '!EXPORT',
        '!DES',
        '!RC4',
        '!MD5',
        '!PSK',
        '!SRP',
        '!CAMELLIA',
      ]);
    });

    test('cipher suite starts with strong ECDHE ciphers', () => {
      const ciphers = capturedCredentials.ciphers.split(':');
      expect(ciphers[0]).toBe('ECDHE-RSA-AES256-SHA384');
      expect(ciphers[1]).toBe('DHE-RSA-AES256-SHA384');
    });

    test('cipher suite ends with !CAMELLIA exclusion', () => {
      expect(capturedCredentials.ciphers.endsWith('!CAMELLIA')).toBe(true);
    });

    test('honorCipherOrder is enabled', () => {
      expect(capturedCredentials.honorCipherOrder).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // Server Initialization
  // ---------------------------------------------------------------
  describe('Server Initialization', () => {
    test('creates HTTPS server with credentials and Express app', () => {
      expect(capturedCredentials).toBeDefined();
      expect(capturedApp).toBeDefined();
      expect(typeof capturedApp).toBe('function');
    });

    test('initializes WebSocket via WsInit()', () => {
      expect(mockWsInit).toHaveBeenCalledTimes(1);
    });

    test('server listens on PORT(ENV_TYPE) and IP(ENV_TYPE)', () => {
      expect(mockListen).toHaveBeenCalledTimes(1);
      expect(mockListen).toHaveBeenCalledWith(3000, '127.0.0.1');
    });

    test('sets NODE_TLS_REJECT_UNAUTHORIZED to "0"', () => {
      expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe('0');
    });

    test('registers uncaughtException handler on process', () => {
      expect(process.listenerCount('uncaughtException')).toBe(
        initialListenerCount + 1
      );
    });

    test('uncaughtException handler is a function', () => {
      const listeners = process.listeners('uncaughtException');
      const serverHandler = listeners[listeners.length - 1];
      expect(typeof serverHandler).toBe('function');
    });
  });

  // ---------------------------------------------------------------
  // Session Configuration
  // ---------------------------------------------------------------
  describe('Session Configuration', () => {
    test('SessionStore factory is called with ExpressSession', () => {
      expect(mockSessionStore).toHaveBeenCalledTimes(1);
      expect(typeof mockSessionStore.mock.calls[0][0]).toBe('function');
    });
  });

  // ---------------------------------------------------------------
  // Middleware Stack Order
  // ---------------------------------------------------------------
  describe('Middleware Stack', () => {
    test('Express app has a router with middleware stack', () => {
      expect(capturedApp._router).toBeDefined();
      expect(capturedApp._router.stack.length).toBeGreaterThan(0);
    });

    test('middleware is mounted in correct order: backslash guard → bodyParser → session → passport → showLog → routes', () => {
      const stack = capturedApp._router.stack;
      const names = stack.map((l) => l.name);

      const urlencodedIdx = names.indexOf('urlencodedParser');
      const jsonIdx = names.indexOf('jsonParser');
      const sessionIdx = names.indexOf('session');
      const passportInitIdx = names.indexOf('initialize');
      const passportSessionIdx = names.indexOf('authenticate');
      // showLog wrapper is anonymous; first router marks end of middleware
      const firstRouterIdx = stack.findIndex(
        (l) => l.handle === mockBasicRouter
      );

      // Backslash guard is an anonymous middleware before bodyParser
      // It's the first anonymous layer before urlencodedParser
      const backslashGuardIdx = stack.findIndex(
        (l, idx) => idx < urlencodedIdx && l.name !== 'query' && l.name !== 'expressInit'
      );
      expect(backslashGuardIdx).toBeGreaterThan(-1);
      expect(backslashGuardIdx).toBeLessThan(urlencodedIdx);

      expect(urlencodedIdx).toBeGreaterThan(-1);
      expect(jsonIdx).toBeGreaterThan(urlencodedIdx);
      expect(sessionIdx).toBeGreaterThan(jsonIdx);
      expect(passportInitIdx).toBeGreaterThan(sessionIdx);
      expect(passportSessionIdx).toBeGreaterThan(passportInitIdx);
      expect(firstRouterIdx).toBeGreaterThan(passportSessionIdx);
    });

    test('showLog middleware is between passport.session and first router', () => {
      const stack = capturedApp._router.stack;
      const passportSessionIdx = stack.findIndex(
        (l) => l.name === 'authenticate'
      );
      const firstRouterIdx = stack.findIndex(
        (l) => l.handle === mockBasicRouter
      );
      // There should be at least one anonymous middleware (showLog) between them
      const middlewareBetween = stack.slice(
        passportSessionIdx + 1,
        firstRouterIdx
      );
      expect(middlewareBetween.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---------------------------------------------------------------
  // Route Mounting
  // ---------------------------------------------------------------
  describe('Route Mounting', () => {
    const findLayerByHandle = (handle) =>
      capturedApp._router.stack.find((l) => l.handle === handle);

    test('BasicRouter is mounted at /api', () => {
      const layer = findLayerByHandle(mockBasicRouter);
      expect(layer).toBeDefined();
      expect(layer.regexp.test('/api')).toBe(true);
      expect(layer.regexp.test('/api/')).toBe(true);
      expect(layer.regexp.test('/api/anything')).toBe(true);
    });

    test('HomeRouter is mounted at /api/homepage', () => {
      const layer = findLayerByHandle(mockHomeRouter);
      expect(layer).toBeDefined();
      expect(layer.regexp.test('/api/homepage')).toBe(true);
    });

    test('UserRouter is mounted at /api/user', () => {
      const layer = findLayerByHandle(mockUserRouter);
      expect(layer).toBeDefined();
      expect(layer.regexp.test('/api/user')).toBe(true);
    });

    test('StorageRouter is mounted at /api/storage', () => {
      const layer = findLayerByHandle(mockStorageRouter);
      expect(layer).toBeDefined();
      expect(layer.regexp.test('/api/storage')).toBe(true);
    });

    test('PasswordRouter is mounted at /api/password', () => {
      const layer = findLayerByHandle(mockPasswordRouter);
      expect(layer).toBeDefined();
      expect(layer.regexp.test('/api/password')).toBe(true);
    });

    test('StockRouter is mounted at /api/stock', () => {
      const layer = findLayerByHandle(mockStockRouter);
      expect(layer).toBeDefined();
      expect(layer.regexp.test('/api/stock')).toBe(true);
    });

    test('BookmarkRouter is mounted at /api/bookmark', () => {
      const layer = findLayerByHandle(mockBookmarkRouter);
      expect(layer).toBeDefined();
      expect(layer.regexp.test('/api/bookmark')).toBe(true);
    });

    test('ParentRouter is mounted at /api/parent', () => {
      const layer = findLayerByHandle(mockParentRouter);
      expect(layer).toBeDefined();
      expect(layer.regexp.test('/api/parent')).toBe(true);
    });

    test('OtherRouter is mounted at /', () => {
      const layer = findLayerByHandle(mockOtherRouter);
      expect(layer).toBeDefined();
      expect(layer.regexp.test('/')).toBe(true);
    });

    test('LoginRouter factory called with correct file-server URL', () => {
      expect(mockLoginRouterFn).toHaveBeenCalledWith(
        'https://test-file-host:9084/f'
      );
    });

    test('LoginRouter instance is mounted at /', () => {
      const layer = findLayerByHandle(mockLoginRouterInstance);
      expect(layer).toBeDefined();
      expect(layer.regexp.test('/')).toBe(true);
    });

    test('routes are mounted in correct order', () => {
      const stack = capturedApp._router.stack;
      const getIdx = (handle) => stack.findIndex((l) => l.handle === handle);

      const order = [
        getIdx(mockBasicRouter),
        getIdx(mockHomeRouter),
        getIdx(mockUserRouter),
        getIdx(mockStorageRouter),
        getIdx(mockPasswordRouter),
        getIdx(mockStockRouter),
        getIdx(mockBookmarkRouter),
        getIdx(mockParentRouter),
        getIdx(mockOtherRouter),
        getIdx(mockLoginRouterInstance),
      ];

      for (let i = 1; i < order.length; i++) {
        expect(order[i]).toBeGreaterThan(order[i - 1]);
      }
    });

    test('error handler is the last layer in the stack', () => {
      const stack = capturedApp._router.stack;
      const lastLayer = stack[stack.length - 1];
      // Express error handlers have 4 parameters
      expect(lastLayer.handle.length).toBe(4);
    });
  });

  // ---------------------------------------------------------------
  // Error Handler (tested via supertest)
  // ---------------------------------------------------------------
  describe('Error Handler', () => {
    test('returns HoError status code and message', async () => {
      const res = await request(capturedApp)
        .get('/trigger')
        .set('x-test-error', 'hoerror');
      expect(res.status).toBe(403);
      expect(res.text).toBe('test ho error');
    });

    test('returns 500 and "server error occur" for generic errors', async () => {
      const res = await request(capturedApp)
        .get('/trigger')
        .set('x-test-error', 'generic');
      expect(res.status).toBe(500);
      expect(res.text).toBe('server error occur');
    });

    test('HoError response body is the message string', async () => {
      const res = await request(capturedApp)
        .get('/trigger')
        .set('x-test-error', 'hoerror');
      expect(typeof res.text).toBe('string');
      expect(res.text).not.toBe('server error occur');
    });

    test('generic error does not leak internal error details', async () => {
      const res = await request(capturedApp)
        .get('/trigger')
        .set('x-test-error', 'generic');
      expect(res.text).not.toContain('test generic error');
      expect(res.text).toBe('server error occur');
    });
  });

  // ---------------------------------------------------------------
  // Request Processing (integration via supertest)
  // ---------------------------------------------------------------
  describe('Request Processing', () => {
    test('GET /api passes through middleware chain', async () => {
      const res = await request(capturedApp).get('/api/test');
      // Request passes through all mock routers (which call next())
      expect(res.status).toBeDefined();
      expect(mockBasicRouter).toHaveBeenCalled();
    });

    test('request without errors passes through all middleware', async () => {
      mockOtherRouter.mockClear();
      const res = await request(capturedApp).get('/some-path');
      expect(mockOtherRouter).toHaveBeenCalled();
    });

    test('body-parser processes urlencoded body', async () => {
      const res = await request(capturedApp)
        .post('/api/test')
        .send('name=test&value=123')
        .set('Content-Type', 'application/x-www-form-urlencoded');
      // Should not crash — body-parser handles it
      expect(res.status).toBeDefined();
    });

    test('body-parser processes JSON body', async () => {
      const res = await request(capturedApp)
        .post('/api/test')
        .send({ name: 'test', value: 123 })
        .set('Content-Type', 'application/json');
      expect(res.status).toBeDefined();
    });

    test('backslash in URL returns 400 with error message', async () => {
      const res = await request(capturedApp).get('/api/test%5Cpath');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid URL' });
    });

    test('normal URL without backslash passes through', async () => {
      const res = await request(capturedApp).get('/api/normal-path');
      expect(res.status).not.toBe(400);
    });
  });
});
