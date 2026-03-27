/**
 * home-router.test.js — Comprehensive tests for src/back/controllers/home-router.js
 *
 * Routes:
 *   router.use(checkLogin) — global auth guard (all routes require login)
 *   GET / — returns help messages; admin (perm≤2) gets adult_msg appended
 *
 * Covers: unauthenticated → 401, admin (perm=1) → full msg+adult, content-admin
 *   (perm=2) → full msg+adult, regular user (perm=0) → msg only, high-perm
 *   (perm>2) → msg only, response structure, msg content validation.
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
    existsSync: jest.fn(() => false),
    readdirSync: jest.fn(() => []),
    lstatSync: jest.fn(() => ({ isDirectory: () => false })),
    unlinkSync: jest.fn(), rmdirSync: jest.fn(), readFile: jest.fn(),
    writeFile: jest.fn(), createWriteStream: jest.fn(),
    statSync: jest.fn(() => ({ size: 0 })), renameSync: jest.fn(),
    writeFileSync: jest.fn(), unlink: jest.fn(),
  },
}));

jest.unstable_mockModule('../../../../ver.js', () => ({
  ENV_TYPE: 'test', CA: '/test/ca.pem', CERT: '/test/cert.pem',
  PKEY: '/test/key.pem', SESS_SECRET: 'test', SESS_PWD: 'test',
}));

jest.unstable_mockModule('../../config.js', () => ({
  NAS_PREFIX: jest.fn(() => '/test/storage'),
  EXTENT_FILE_IP: jest.fn(() => 'h'), EXTENT_FILE_PORT: jest.fn(() => 1),
  EXTENT_IP: jest.fn(() => 'h'), EXTENT_PORT: jest.fn(() => 1),
  IP: jest.fn(() => '0'), PORT: jest.fn(() => 1),
  FILE_IP: jest.fn(() => '0'), FILE_PORT: jest.fn(() => 1),
  WS_PORT: jest.fn(() => 1), COM_PORT: jest.fn(() => 1),
  NAS_TMP: jest.fn(() => '/tmp'), APP_HTML: jest.fn(() => 'a'),
  DB_NAME: jest.fn(() => 'd'), DB_IP: jest.fn(() => '0'),
  DB_PORT: jest.fn(() => 1), SESS_IP: jest.fn(() => '0'),
  SESS_PORT: jest.fn(() => 1), HINT: jest.fn(() => false),
}));

jest.unstable_mockModule('../../constants.js', () => ({
  STORAGEDB: 'storage', USERDB: 'user', VERIFYDB: 'verify',
  RE_WEBURL: /^https?:\/\//, STATIC_PATH: '/p', RELEASE: 'release', DEV: 'dev',
}));

jest.unstable_mockModule('../../models/mongo-tool.js', () => ({
  default: jest.fn(() => Promise.resolve([])),
  objectID: jest.fn((id) => id),
}));

// =====================================================================
// IMPORTS
// =====================================================================
const { default: Express } = await import('express');
const { default: request } = await import('supertest');
const { default: HomeRouter } = await import('../home-router.js');

// =====================================================================
// HELPERS
// =====================================================================
function buildApp() {
  const app = Express();
  app.use(Express.json());
  // Auth simulation
  app.use((req, res, next) => {
    if (req.headers['x-test-user']) {
      const user = JSON.parse(req.headers['x-test-user']);
      req.user = user;
      req.isAuthenticated = () => true;
    } else {
      req.isAuthenticated = () => false;
    }
    req.session = {};
    next();
  });
  app.use('/', HomeRouter);
  app.use((err, req, res, next) => {
    err.name === 'HoError'
      ? res.status(err.code).send(err.message.toString())
      : res.status(500).send('server error occur');
  });
  return app;
}

// Test users
const ADMIN = { _id: 'a1', username: 'admin', perm: 1 };
const CONTENT_ADMIN = { _id: 'a2', username: 'editor', perm: 2 };
const REGULAR = { _id: 'a3', username: 'user', perm: 0 };
const HIGH_PERM = { _id: 'a4', username: 'high', perm: 5 };

// =====================================================================
// TESTS
// =====================================================================
describe('home-router.js — Homepage API', () => {
  let app;
  beforeEach(() => { app = buildApp(); });

  // ---------------------------------------------------------------
  // Auth guard (router.use checkLogin)
  // ---------------------------------------------------------------
  describe('Authentication guard', () => {
    test('unauthenticated request returns 401', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(401);
    });

    test('unauthenticated GET / does not return msg', async () => {
      const res = await request(app).get('/');
      expect(res.body.msg).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------
  // GET / — message content
  // ---------------------------------------------------------------
  describe('GET / — help messages', () => {
    test('authenticated user gets 200 with msg array', async () => {
      const res = await request(app)
        .get('/')
        .set('x-test-user', JSON.stringify(REGULAR));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.msg)).toBe(true);
      expect(res.body.msg.length).toBeGreaterThan(0);
    });

    test('response is JSON', async () => {
      const res = await request(app)
        .get('/')
        .set('x-test-user', JSON.stringify(REGULAR));
      expect(res.headers['content-type']).toMatch(/application\/json/);
    });

    test('msg contains "hello" as first item', async () => {
      const res = await request(app)
        .get('/')
        .set('x-test-user', JSON.stringify(REGULAR));
      expect(res.body.msg[0]).toBe('hello');
    });

    test('msg contains key help strings', async () => {
      const res = await request(app)
        .get('/')
        .set('x-test-user', JSON.stringify(REGULAR));
      const msg = res.body.msg;
      const joined = msg.join(' ');
      expect(joined).toContain('yify movie');
      expect(joined).toContain('dm5 comic');
      expect(joined).toContain('kubo animation');
      expect(joined).toContain('Magnet');
      expect(joined).toContain('Torrent');
      expect(joined).toContain('Mega');
      expect(joined).toContain('YIFY');
      expect(joined).toContain('DM5');
      expect(joined).toContain('EZTV');
      expect(joined).toContain('KUBO');
    });

    test('msg contains player shortcut keys', async () => {
      const res = await request(app)
        .get('/')
        .set('x-test-user', JSON.stringify(REGULAR));
      const joined = res.body.msg.join(' ');
      expect(joined).toContain('空白鍵');
      expect(joined).toContain('全螢幕');
    });
  });

  // ---------------------------------------------------------------
  // GET / — admin vs regular (adult_msg branch)
  // ---------------------------------------------------------------
  describe('GET / — checkAdmin(2) adult message branch', () => {
    test('admin (perm=1, ≤2) gets adult messages appended', async () => {
      const res = await request(app)
        .get('/')
        .set('x-test-user', JSON.stringify(ADMIN));
      const msg = res.body.msg;
      const joined = msg.join(' ');
      expect(joined).toContain('18+');
    });

    test('content admin (perm=2, ≤2) gets adult messages appended', async () => {
      const res = await request(app)
        .get('/')
        .set('x-test-user', JSON.stringify(CONTENT_ADMIN));
      const msg = res.body.msg;
      const joined = msg.join(' ');
      expect(joined).toContain('18+');
    });

    test('regular user (perm=0) does NOT get adult messages', async () => {
      const res = await request(app)
        .get('/')
        .set('x-test-user', JSON.stringify(REGULAR));
      const msg = res.body.msg;
      const joined = msg.join(' ');
      // Regular user msg should not contain '18+指令' (from adult_msg)
      expect(joined).not.toContain('18+指令');
    });

    test('high perm user (perm=5, >2) does NOT get adult messages', async () => {
      // checkAdmin(2, user) requires perm > 0 && perm <= 2; perm=5 fails
      const res = await request(app)
        .get('/')
        .set('x-test-user', JSON.stringify(HIGH_PERM));
      const joined = res.body.msg.join(' ');
      expect(joined).not.toContain('18+指令');
    });

    test('admin msg is longer than regular msg (adult lines appended)', async () => {
      const adminRes = await request(app)
        .get('/')
        .set('x-test-user', JSON.stringify(ADMIN));
      const regularRes = await request(app)
        .get('/')
        .set('x-test-user', JSON.stringify(REGULAR));
      expect(adminRes.body.msg.length).toBeGreaterThan(regularRes.body.msg.length);
    });

    test('adult_msg section starts with empty string followed by "18+指令: "', async () => {
      const adminRes = await request(app)
        .get('/')
        .set('x-test-user', JSON.stringify(ADMIN));
      const regularRes = await request(app)
        .get('/')
        .set('x-test-user', JSON.stringify(REGULAR));
      const regularLen = regularRes.body.msg.length;
      const adultPortion = adminRes.body.msg.slice(regularLen);
      expect(adultPortion[0]).toBe('');
      expect(adultPortion[1]).toBe('18+指令: ');
    });
  });
});
