/**
 * file-server.test.js — Comprehensive tests for src/back/controllers/file-server.js
 *
 * Covers: SSL/TLS config, HTTPS server creation, middleware ordering,
 * CORS handling, ConnectMultiparty config, background job invocation,
 * route mounting, 404 catch-all, error handler, WebSocket init, process config.
 *
 * Strategy: Mock all I/O but use REAL Express + body-parser + passport
 * for middleware integration. Capture the Express app from mocked https.createServer.
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

// --- https: capture Express app + credentials, prevent real listening ---
let capturedCredentials = null;
let capturedApp = null;
let capturedServer = null;
const mockListen = jest.fn();
jest.unstable_mockModule('https', () => ({
  default: {
    Agent: jest.fn(),
    createServer: jest.fn((creds, app) => {
      capturedCredentials = creds;
      capturedApp = app;
      capturedServer = { listen: mockListen, on: jest.fn() };
      return capturedServer;
    }),
  },
}));

// --- ver.js ---
jest.unstable_mockModule('../../../../ver.js', () => ({
  PASSWORD_SALT: 'test_salt_',
  ENV_TYPE: 'test',
  CA: '/test/ca.pem',
  CERT: '/test/cert.pem',
  PKEY: '/test/key.pem',
  SESS_SECRET: 'test-session-secret',
  SESS_PWD: 'test-redis-password',
  DB_USERNAME: 'testuser',
  DB_PWD: 'testpwd',
}));

// --- config.js ---
jest.unstable_mockModule('../../config.js', () => ({
  NAS_TMP: jest.fn(() => '/test/tmp'),
  EXTENT_FILE_IP: jest.fn(() => 'test-file-host'),
  EXTENT_FILE_PORT: jest.fn(() => 9084),
  FILE_IP: jest.fn(() => '127.0.0.1'),
  FILE_PORT: jest.fn(() => 3001),
  NAS_PREFIX: jest.fn(() => '/test/storage'),
  EXTENT_IP: jest.fn(() => 'test-host'),
  EXTENT_PORT: jest.fn(() => 9082),
  IP: jest.fn(() => '127.0.0.1'),
  PORT: jest.fn(() => 3000),
  APP_HTML: jest.fn(() => 'app.html'),
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

// --- constants.js ---
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

// --- mongo-tool.js: avoid MongoDB ---
jest.unstable_mockModule('../../models/mongo-tool.js', () => ({
  default: jest.fn(() => Promise.resolve([])),
  objectID: jest.fn((id) => id),
}));

// --- sendWs.js: capture mainInit call, avoid WebSocket/TCP ---
const mockMainInit = jest.fn();
jest.unstable_mockModule('../../util/sendWs.js', () => ({
  init: jest.fn(),
  mainInit: mockMainInit,
  default: jest.fn(),
}));

// --- connect-multiparty: mock file upload middleware ---
const mockMultipartyMiddleware = jest.fn((req, res, next) => next());
const mockMultiparty = jest.fn(() => mockMultipartyMiddleware);
jest.unstable_mockModule('connect-multiparty', () => ({
  default: mockMultiparty,
}));

// --- Background jobs: mock all 12 job functions ---
const mockAutoUpload = jest.fn();
const mockCheckMedia = jest.fn();
const mockUpdateStock = jest.fn();
const mockUpdateStockList = jest.fn();
const mockFilterStock = jest.fn();
const mockDbBackup = jest.fn();
const mockCheckStock = jest.fn();
const mockRateCalculator = jest.fn();
const mockSetUserOffer = jest.fn();
const mockFilterBitfinex = jest.fn();
const mockUsseInit = jest.fn();
const mockTwseInit = jest.fn();
jest.unstable_mockModule('../../cmd/background.js', () => ({
  autoUpload: mockAutoUpload,
  checkMedia: mockCheckMedia,
  updateStock: mockUpdateStock,
  updateStockList: mockUpdateStockList,
  filterStock: mockFilterStock,
  dbBackup: mockDbBackup,
  checkStock: mockCheckStock,
  rateCalculator: mockRateCalculator,
  setUserOffer: mockSetUserOffer,
  filterBitfinex: mockFilterBitfinex,
  usseInit: mockUsseInit,
  twseInit: mockTwseInit,
}));

// --- Routers ---
let mockLoginRouterInstance = null;
const mockLoginRouterFn = jest.fn(() => {
  mockLoginRouterInstance = jest.fn((req, res, next) => next());
  return mockLoginRouterInstance;
});
jest.unstable_mockModule('../login-router.js', () => ({
  default: mockLoginRouterFn,
}));

const mockFileBasicRouter = jest.fn((req, res, next) => next());
jest.unstable_mockModule('../file-basic-router.js', () => ({
  default: mockFileBasicRouter,
}));

// file-other-router: supports triggering errors via header for error handler testing
const mockFileOtherRouter = jest.fn((req, res, next) => {
  if (req.headers['x-test-error'] === 'generic') {
    return next(new Error('test generic error'));
  }
  next();
});
jest.unstable_mockModule('../file-other-router.js', () => ({
  default: mockFileOtherRouter,
}));

const mockFileRouter = jest.fn((req, res, next) => next());
jest.unstable_mockModule('../file-router.js', () => ({
  default: mockFileRouter,
}));

const mockExternalRouter = jest.fn((req, res, next) => next());
jest.unstable_mockModule('../external-router.js', () => ({
  default: mockExternalRouter,
}));

const mockPlaylistRouter = jest.fn((req, res, next) => next());
jest.unstable_mockModule('../playlist-router.js', () => ({
  default: mockPlaylistRouter,
}));

const mockBitfinexRouter = jest.fn((req, res, next) => next());
jest.unstable_mockModule('../bitfinex-router.js', () => ({
  default: mockBitfinexRouter,
}));

// =====================================================================
// 2. DYNAMIC IMPORTS
// =====================================================================
const { default: request } = await import('supertest');

const initialListenerCount = process.listenerCount('uncaughtException');

// Import file-server.js — triggers all side effects
await import('../file-server.js');

// =====================================================================
// 3. TEST SUITES
// =====================================================================
describe('file-server.js — File/Media Server', () => {
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

    test('honorCipherOrder is enabled', () => {
      expect(capturedCredentials.honorCipherOrder).toBe(true);
    });
  });

  // ---------------------------------------------------------------
  // Server Initialization
  // ---------------------------------------------------------------
  describe('Server Initialization', () => {
    test('creates HTTPS server with credentials and Express app', () => {
      expect(capturedApp).toBeDefined();
      expect(typeof capturedApp).toBe('function');
      expect(capturedCredentials).toBeDefined();
    });

    test('calls mainInit with the HTTPS server object for WebSocket', () => {
      expect(mockMainInit).toHaveBeenCalledTimes(1);
      expect(mockMainInit).toHaveBeenCalledWith(capturedServer);
    });

    test('server listens on FILE_PORT and FILE_IP', () => {
      expect(mockListen).toHaveBeenCalledTimes(1);
      expect(mockListen).toHaveBeenCalledWith(3001, '127.0.0.1');
    });

    test('sets NODE_TLS_REJECT_UNAUTHORIZED to "0"', () => {
      expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe('0');
    });

    test('registers uncaughtException handler on process', () => {
      expect(process.listenerCount('uncaughtException')).toBeGreaterThanOrEqual(
        initialListenerCount + 1
      );
    });
  });

  // ---------------------------------------------------------------
  // Background Jobs (all 13 must be called exactly once)
  // ---------------------------------------------------------------
  describe('Background Jobs', () => {
    test('autoUpload() is called once at startup', () => {
      expect(mockAutoUpload).toHaveBeenCalledTimes(1);
    });

    test('checkMedia() is called once at startup', () => {
      expect(mockCheckMedia).toHaveBeenCalledTimes(1);
    });

    test('updateStock() is called once at startup', () => {
      expect(mockUpdateStock).toHaveBeenCalledTimes(1);
    });

    test('updateStockList() is called once at startup', () => {
      expect(mockUpdateStockList).toHaveBeenCalledTimes(1);
    });

    test('filterStock() is called once at startup', () => {
      expect(mockFilterStock).toHaveBeenCalledTimes(1);
    });

    test('dbBackup() is called once at startup', () => {
      expect(mockDbBackup).toHaveBeenCalledTimes(1);
    });

    test('checkStock() is called once at startup', () => {
      expect(mockCheckStock).toHaveBeenCalledTimes(1);
    });

    test('rateCalculator() is called once at startup', () => {
      expect(mockRateCalculator).toHaveBeenCalledTimes(1);
    });

    test('setUserOffer() is called once at startup', () => {
      expect(mockSetUserOffer).toHaveBeenCalledTimes(1);
    });

    test('filterBitfinex() is called once at startup', () => {
      expect(mockFilterBitfinex).toHaveBeenCalledTimes(1);
    });

    test('usseInit() is called once at startup', () => {
      expect(mockUsseInit).toHaveBeenCalledTimes(1);
    });

    test('twseInit() is called once at startup', () => {
      expect(mockTwseInit).toHaveBeenCalledTimes(1);
    });

    test('all 12 background jobs are invoked (no more, no less)', () => {
      const allJobs = [
        mockAutoUpload, mockCheckMedia,
        mockUpdateStock, mockUpdateStockList, mockFilterStock,
        mockDbBackup, mockCheckStock, mockRateCalculator,
        mockSetUserOffer, mockFilterBitfinex, mockUsseInit, mockTwseInit,
      ];
      expect(allJobs.length).toBe(12);
      allJobs.forEach((job) => {
        expect(job).toHaveBeenCalledTimes(1);
      });
    });

    test('background jobs are called with no arguments', () => {
      const allJobs = [
        mockAutoUpload, mockCheckMedia,
        mockUpdateStock, mockUpdateStockList, mockFilterStock,
        mockDbBackup, mockCheckStock, mockRateCalculator,
        mockSetUserOffer, mockFilterBitfinex, mockUsseInit, mockTwseInit,
      ];
      allJobs.forEach((job) => {
        expect(job).toHaveBeenCalledWith();
      });
    });
  });

  // ---------------------------------------------------------------
  // Session & Multiparty Configuration
  // ---------------------------------------------------------------
  describe('Session & Upload Configuration', () => {
    test('SessionStore factory is called with ExpressSession', () => {
      expect(mockSessionStore).toHaveBeenCalledTimes(1);
      expect(typeof mockSessionStore.mock.calls[0][0]).toBe('function');
    });

    test('ConnectMultiparty is configured with NAS_TMP uploadDir', () => {
      expect(mockMultiparty).toHaveBeenCalledTimes(1);
      expect(mockMultiparty).toHaveBeenCalledWith({ uploadDir: '/test/tmp' });
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

    test('middleware order: backslash guard → bodyParser → session → multiparty → passport → CORS → showLog → routes', () => {
      const stack = capturedApp._router.stack;
      const names = stack.map((l) => l.name);

      const urlencodedIdx = names.indexOf('urlencodedParser');
      const jsonIdx = names.indexOf('jsonParser');
      const sessionIdx = names.indexOf('session');
      const multipartyIdx = stack.findIndex(
        (l) => l.handle === mockMultipartyMiddleware
      );
      const passportInitIdx = names.indexOf('initialize');
      const passportSessionIdx = names.indexOf('authenticate');
      // First router marks end of middleware block
      const firstRouterIdx = stack.findIndex(
        (l) => l.handle === mockFileBasicRouter
      );

      // Backslash guard is an anonymous middleware before bodyParser
      const backslashGuardIdx = stack.findIndex(
        (l, idx) => idx < urlencodedIdx && l.name !== 'query' && l.name !== 'expressInit'
      );
      expect(backslashGuardIdx).toBeGreaterThan(-1);
      expect(backslashGuardIdx).toBeLessThan(urlencodedIdx);

      expect(urlencodedIdx).toBeGreaterThan(-1);
      expect(jsonIdx).toBeGreaterThan(urlencodedIdx);
      expect(sessionIdx).toBeGreaterThan(jsonIdx);
      expect(multipartyIdx).toBeGreaterThan(sessionIdx);
      expect(passportInitIdx).toBeGreaterThan(multipartyIdx);
      expect(passportSessionIdx).toBeGreaterThan(passportInitIdx);
      // CORS and showLog are anonymous, between passport and first router
      expect(firstRouterIdx).toBeGreaterThan(passportSessionIdx);
    });

    test('ConnectMultiparty middleware is in the stack', () => {
      const layer = capturedApp._router.stack.find(
        (l) => l.handle === mockMultipartyMiddleware
      );
      expect(layer).toBeDefined();
    });

    test('there are at least 2 anonymous middleware between passport.session and first router (CORS + showLog)', () => {
      const stack = capturedApp._router.stack;
      const passportSessionIdx = stack.findIndex(
        (l) => l.name === 'authenticate'
      );
      const firstRouterIdx = stack.findIndex(
        (l) => l.handle === mockFileBasicRouter
      );
      const middlewareBetween = stack.slice(
        passportSessionIdx + 1,
        firstRouterIdx
      );
      expect(middlewareBetween.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ---------------------------------------------------------------
  // CORS Middleware (tested via supertest)
  // ---------------------------------------------------------------
  describe('CORS Middleware', () => {
    test('OPTIONS request returns {apiOK: true} with 200 status', async () => {
      const res = await request(capturedApp)
        .options('/f/api/test')
        .set('Origin', 'https://example.com');
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
    });

    test('OPTIONS response has Access-Control-Allow-Credentials: true', async () => {
      const res = await request(capturedApp)
        .options('/f/api/test')
        .set('Origin', 'https://example.com');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    test('OPTIONS response reflects request Origin in Allow-Origin', async () => {
      const res = await request(capturedApp)
        .options('/f/api/test')
        .set('Origin', 'https://my-custom-origin.com');
      expect(res.headers['access-control-allow-origin']).toBe(
        'https://my-custom-origin.com'
      );
    });

    test('OPTIONS response has correct Allow-Headers', async () => {
      const res = await request(capturedApp)
        .options('/f/api/test')
        .set('Origin', 'https://example.com');
      expect(res.headers['access-control-allow-headers']).toBe(
        'Content-Type, Accept'
      );
    });

    test('OPTIONS response has correct Allow-Methods', async () => {
      const res = await request(capturedApp)
        .options('/f/api/test')
        .set('Origin', 'https://example.com');
      expect(res.headers['access-control-allow-methods']).toBe(
        'GET,PUT,POST,DELETE'
      );
    });

    test('non-OPTIONS request also gets CORS headers', async () => {
      const res = await request(capturedApp)
        .get('/f/api/test')
        .set('Origin', 'https://example.com');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-allow-origin']).toBe(
        'https://example.com'
      );
    });

    test('non-OPTIONS request passes through to next middleware', async () => {
      mockFileBasicRouter.mockClear();
      await request(capturedApp)
        .get('/f/api/test')
        .set('Origin', 'https://example.com');
      expect(mockFileBasicRouter).toHaveBeenCalled();
    });

    test('CORS reflects different origins correctly', async () => {
      const origins = [
        'https://anomopi.com',
        'https://localhost:3000',
        'http://192.168.1.1:8080',
      ];
      for (const origin of origins) {
        const res = await request(capturedApp)
          .options('/f/test')
          .set('Origin', origin);
        expect(res.headers['access-control-allow-origin']).toBe(origin);
      }
    });
  });

  // ---------------------------------------------------------------
  // Route Mounting
  // ---------------------------------------------------------------
  describe('Route Mounting', () => {
    const findLayerByHandle = (handle) =>
      capturedApp._router.stack.find((l) => l.handle === handle);

    test('FileBasicRouter is mounted at /f/api', () => {
      const layer = findLayerByHandle(mockFileBasicRouter);
      expect(layer).toBeDefined();
      expect(layer.regexp.test('/f/api')).toBe(true);
      expect(layer.regexp.test('/f/api/')).toBe(true);
    });

    test('PlaylistRouter is mounted at /f/api/torrent', () => {
      const layer = findLayerByHandle(mockPlaylistRouter);
      expect(layer).toBeDefined();
      expect(layer.regexp.test('/f/api/torrent')).toBe(true);
    });

    test('ExternalRouter is mounted at /f/api/external', () => {
      const layer = findLayerByHandle(mockExternalRouter);
      expect(layer).toBeDefined();
      expect(layer.regexp.test('/f/api/external')).toBe(true);
    });

    test('FileRouter is mounted at /f/api/file', () => {
      const layer = findLayerByHandle(mockFileRouter);
      expect(layer).toBeDefined();
      expect(layer.regexp.test('/f/api/file')).toBe(true);
    });

    test('BitfinexRouter is mounted at /f/api/bitfinex', () => {
      const layer = findLayerByHandle(mockBitfinexRouter);
      expect(layer).toBeDefined();
      expect(layer.regexp.test('/f/api/bitfinex')).toBe(true);
    });

    test('FileOtherRouter is mounted at /f', () => {
      const layer = findLayerByHandle(mockFileOtherRouter);
      expect(layer).toBeDefined();
      expect(layer.regexp.test('/f')).toBe(true);
    });

    test('LoginRouter factory called without URL argument', () => {
      expect(mockLoginRouterFn).toHaveBeenCalledTimes(1);
      expect(mockLoginRouterFn).toHaveBeenCalledWith();
    });

    test('LoginRouter instance is mounted at /f', () => {
      const layer = findLayerByHandle(mockLoginRouterInstance);
      expect(layer).toBeDefined();
      expect(layer.regexp.test('/f')).toBe(true);
    });

    test('routes are mounted in correct order', () => {
      const stack = capturedApp._router.stack;
      const getIdx = (handle) => stack.findIndex((l) => l.handle === handle);

      const order = [
        getIdx(mockFileBasicRouter),     // /f/api
        getIdx(mockPlaylistRouter),      // /f/api/torrent
        getIdx(mockExternalRouter),      // /f/api/external
        getIdx(mockFileRouter),          // /f/api/file
        getIdx(mockBitfinexRouter),      // /f/api/bitfinex
        getIdx(mockFileOtherRouter),     // /f
        getIdx(mockLoginRouterInstance), // /f
      ];

      for (let i = 1; i < order.length; i++) {
        expect(order[i]).toBeGreaterThan(order[i - 1]);
      }
    });
  });

  // ---------------------------------------------------------------
  // 404 Catch-All Handler
  // ---------------------------------------------------------------
  describe('404 Catch-All Handler', () => {
    test('unmatched route returns 404 status', async () => {
      const res = await request(capturedApp).get('/nonexistent-path');
      expect(res.status).toBe(404);
    });

    test('unmatched route returns "page not found" message', async () => {
      const res = await request(capturedApp).get('/nonexistent-path');
      expect(res.text).toBe('page not found');
    });

    test('unmatched POST returns 404', async () => {
      const res = await request(capturedApp).post('/nonexistent');
      expect(res.status).toBe(404);
    });

    test('unmatched PUT returns 404', async () => {
      const res = await request(capturedApp).put('/nonexistent');
      expect(res.status).toBe(404);
    });

    test('unmatched DELETE returns 404', async () => {
      const res = await request(capturedApp).delete('/nonexistent');
      expect(res.status).toBe(404);
    });

    test('catch-all is positioned after all routers', () => {
      const stack = capturedApp._router.stack;
      const loginIdx = stack.findIndex(
        (l) => l.handle === mockLoginRouterInstance
      );
      // After LoginRouter, the remaining layers are catch-all and error handler
      // The catch-all uses app.all('*') which may be a route or a Layer
      const layersAfterLogin = stack.slice(loginIdx + 1);
      // Should have at least 2 layers: catch-all + error handler
      expect(layersAfterLogin.length).toBeGreaterThanOrEqual(2);
      // The error handler (last layer) has 4 params
      const errorHandler = layersAfterLogin[layersAfterLogin.length - 1];
      expect(errorHandler.handle.length).toBe(4);
    });
  });

  // ---------------------------------------------------------------
  // Error Handler
  // ---------------------------------------------------------------
  describe('Error Handler', () => {
    test('returns HoError status code and message (via 404 catch-all)', async () => {
      const res = await request(capturedApp).get('/trigger-404');
      expect(res.status).toBe(404);
      expect(res.text).toBe('page not found');
    });

    test('returns 500 and "server error occur" for generic errors', async () => {
      const res = await request(capturedApp)
        .get('/f/some-path')
        .set('x-test-error', 'generic');
      expect(res.status).toBe(500);
      expect(res.text).toBe('server error occur');
    });

    test('generic error does not leak internal details', async () => {
      const res = await request(capturedApp)
        .get('/f/some-path')
        .set('x-test-error', 'generic');
      expect(res.text).not.toContain('test generic error');
      expect(res.text).toBe('server error occur');
    });

    test('error handler is the last layer in the stack', () => {
      const stack = capturedApp._router.stack;
      const lastLayer = stack[stack.length - 1];
      // Express error handlers have 4 parameters (err, req, res, next)
      expect(lastLayer.handle.length).toBe(4);
    });

    test('error handler differentiates HoError from generic Error', async () => {
      // HoError → custom status + message
      const hoRes = await request(capturedApp).get('/will-404');
      expect(hoRes.status).toBe(404);

      // Generic → 500
      const genRes = await request(capturedApp)
        .get('/f/test')
        .set('x-test-error', 'generic');
      expect(genRes.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // Request Processing (integration)
  // ---------------------------------------------------------------
  describe('Request Processing', () => {
    test('GET /f/api passes through middleware to FileBasicRouter', async () => {
      mockFileBasicRouter.mockClear();
      await request(capturedApp).get('/f/api/test');
      expect(mockFileBasicRouter).toHaveBeenCalled();
    });

    test('GET /f/api/torrent reaches PlaylistRouter', async () => {
      mockPlaylistRouter.mockClear();
      await request(capturedApp).get('/f/api/torrent/test');
      expect(mockPlaylistRouter).toHaveBeenCalled();
    });

    test('GET /f/api/external reaches ExternalRouter', async () => {
      mockExternalRouter.mockClear();
      await request(capturedApp).get('/f/api/external/test');
      expect(mockExternalRouter).toHaveBeenCalled();
    });

    test('GET /f/api/file reaches FileRouter', async () => {
      mockFileRouter.mockClear();
      await request(capturedApp).get('/f/api/file/test');
      expect(mockFileRouter).toHaveBeenCalled();
    });

    test('GET /f/api/bitfinex reaches BitfinexRouter', async () => {
      mockBitfinexRouter.mockClear();
      await request(capturedApp).get('/f/api/bitfinex/test');
      expect(mockBitfinexRouter).toHaveBeenCalled();
    });

    test('body-parser processes urlencoded body', async () => {
      const res = await request(capturedApp)
        .post('/f/api/test')
        .send('name=test')
        .set('Content-Type', 'application/x-www-form-urlencoded');
      expect(res.status).toBeDefined();
    });

    test('body-parser processes JSON body', async () => {
      const res = await request(capturedApp)
        .post('/f/api/test')
        .send({ name: 'test' })
        .set('Content-Type', 'application/json');
      expect(res.status).toBeDefined();
    });

    test('backslash in URL returns 400 with error message', async () => {
      const res = await request(capturedApp).get('/f/api/test%5Cpath');
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid URL' });
    });

    test('normal URL without backslash passes through', async () => {
      const res = await request(capturedApp).get('/f/api/normal-path');
      expect(res.status).not.toBe(400);
    });
  });
});
