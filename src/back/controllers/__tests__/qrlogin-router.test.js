/**
 * qrlogin-router.test.js — tests for src/back/controllers/qrlogin-router.js
 *
 * Covers:
 *   POST /api/qrlogin/create   → serial + secret + qr image + ws url
 *   GET  /api/qrlogin/status   → pending / approved / expired, invalid serial
 *   POST /api/qrlogin/approve  → auth required, websocket notify without the secret
 *   POST /api/qrlogin/reject   → auth required
 *   POST /api/login/qr         → session regenerate + logIn, wrong secret, unknown user
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// QR image encoding runs an order of magnitude slower inside the jest ESM VM
// than in a plain node process, so the default 5s budget is not enough.
jest.setTimeout(30000);

jest.unstable_mockModule('node-fetch', () => ({
  default: jest.fn(() => Promise.resolve({ ok: true })),
}));

jest.unstable_mockModule('fs', () => ({
  default: {
    readFileSync: jest.fn(() => Buffer.from('')),
    createReadStream: jest.fn(() => ({ pipe: jest.fn().mockReturnThis(), on: jest.fn() })),
    createWriteStream: jest.fn(),
    existsSync: jest.fn(() => false),
  },
}));

jest.unstable_mockModule('../../../../ver.js', () => ({
  ENV_TYPE: 'test',
  PASSWORD_SALT: 'test_salt_',
  SESS_PWD: 'test-pwd',
  SESS_SECRET: 'test-secret',
  DB_USERNAME: 'test-user',
  DB_PWD: 'test-pwd',
  ROOT_USER: 'root',
  DEFAULT_PASS: 'test-pass',
  PASSWORD_PRIVATE_KEY: 'test-key',
  CA: '/test/ca.pem',
  CERT: '/test/cert.pem',
  PKEY: '/test/key.pem',
}));

jest.unstable_mockModule('../../config.js', () => ({
  NAS_PREFIX: jest.fn(() => '/test/storage'),
  EXTENT_IP: jest.fn(() => 'test-host'),
  EXTENT_PORT: jest.fn(() => 9080),
  EXTENT_FILE_IP: jest.fn(() => 'test-file-host'),
  EXTENT_FILE_PORT: jest.fn(() => 9084),
  WS_PORT: jest.fn(() => 9080),
  COM_PORT: jest.fn(() => 8083),
  FILE_IP: jest.fn(() => '127.0.0.1'),
  DB_NAME: jest.fn(() => 'testdb'),
  DB_IP: jest.fn(() => '127.0.0.1'),
  DB_PORT: jest.fn(() => 27017),
  SESS_IP: jest.fn(() => '127.0.0.1'),
  SESS_PORT: jest.fn(() => 6379),
}));

const mockMongo = jest.fn();
const mockObjectID = jest.fn(id => id);
jest.unstable_mockModule('../../models/mongo-tool.js', () => ({
  default: mockMongo,
  objectID: mockObjectID,
}));

const mockSendWs = jest.fn();
jest.unstable_mockModule('../../util/sendWs.js', () => ({
  default: mockSendWs,
  init: jest.fn(),
  mainInit: jest.fn(),
}));

// In-memory redis so the real qrlogin-tool logic is exercised end to end.
let store = new Map();
const mockRedis = jest.fn((fn, ...args) => {
  switch (fn) {
    case 'multi':
      args[0].forEach(cmd => mockRedis(...cmd));
      return Promise.resolve([]);
    case 'set':
      store.set(args[0], { value: args[1], ttl: store.has(args[0]) ? store.get(args[0]).ttl : -1 });
      return Promise.resolve('OK');
    case 'expire':
      if (store.has(args[0])) store.get(args[0]).ttl = args[1];
      return Promise.resolve(1);
    case 'get':
      return Promise.resolve(store.has(args[0]) ? store.get(args[0]).value : null);
    case 'ttl':
      return Promise.resolve(store.has(args[0]) ? store.get(args[0]).ttl : -2);
    case 'del':
      store.delete(args[0]);
      return Promise.resolve(1);
    default:
      return Promise.resolve(null);
  }
});
jest.unstable_mockModule('../../models/redis-tool.js', () => ({ default: mockRedis }));

const { default: Express } = await import('express');
const { default: request } = await import('supertest');
const { default: QrLoginRouter } = await import('../qrlogin-router.js');

const TEST_USER = { _id: 'user-id-1', username: 'tester', perm: 1 };

function buildApp(url = null) {
  const app = Express();
  app.use(Express.json());
  app.use(Express.urlencoded({ extended: true }));
  app.use((req, res, next) => {
    req.logInCalls = [];
    if (req.headers['x-test-user']) {
      const user = JSON.parse(req.headers['x-test-user']);
      req.user = user;
      req.isAuthenticated = () => true;
    } else {
      req.isAuthenticated = () => false;
    }
    req.session = { regenerate: cb => cb(null), destroy: jest.fn(), save: cb => cb(null) };
    req.logIn = function(user, options, done) {
      if (typeof options === 'function') { done = options; }
      req.user = user;
      req.isAuthenticated = () => true;
      if (done) done(null);
    };
    req.login = req.logIn;
    next();
  });
  app.use('/', QrLoginRouter(url));
  app.use((err, req, res, next) => {
    err.name === 'HoError'
      ? res.status(err.code).send(err.message.toString())
      : res.status(500).send('server error occur');
  });
  return app;
}

const createCode = app => request(app).post('/api/qrlogin/create').send({}).expect(200).then(res => res.body);

const approveCode = (app, serial) => request(app)
  .post('/api/qrlogin/approve')
  .set('x-test-user', JSON.stringify(TEST_USER))
  .send({ serial })
  .expect(200);

beforeEach(() => {
  store = new Map();
  mockMongo.mockReset();
  mockSendWs.mockReset();
  mockObjectID.mockClear();
});

describe('POST /api/qrlogin/create', () => {
  test('returns a serial, secret, qr image, page url and ws url', async () => {
    const app = buildApp();
    const body = await createCode(app);
    expect(body.serial).toMatch(/^[0-9a-f]{64}$/);
    expect(body.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(body.serial).not.toBe(body.secret);
    expect(body.qr.startsWith('data:image/png;base64,')).toBe(true);
    expect(body.page).toBe(`https://test-host:9080/qrcode/${body.serial}`);
    expect(body.ws_url).toBe('wss://test-file-host:9080/f');
    expect(body.expire).toBe(180);
  });

  test('does not require a session', async () => {
    await request(buildApp()).post('/api/qrlogin/create').send({}).expect(200);
  });
});

describe('GET /api/qrlogin/status/:serial', () => {
  test('reports pending then approved', async () => {
    const app = buildApp();
    const body = await createCode(app);
    let res = await request(app).get(`/api/qrlogin/status/${body.serial}`).expect(200);
    expect(res.body).toEqual({ serial: body.serial, status: 'pending' });
    await approveCode(app, body.serial);
    res = await request(app).get(`/api/qrlogin/status/${body.serial}`).expect(200);
    expect(res.body.status).toBe('approved');
  });

  test('reports expired for an unknown serial', async () => {
    const res = await request(buildApp()).get(`/api/qrlogin/status/${'a'.repeat(64)}`).expect(200);
    expect(res.body.status).toBe('expired');
  });

  test('rejects a malformed serial', async () => {
    await request(buildApp()).get('/api/qrlogin/status/not-a-serial').expect(400);
  });
});

describe('POST /api/qrlogin/approve', () => {
  test('requires an authenticated session', async () => {
    const app = buildApp();
    const body = await createCode(app);
    await request(app).post('/api/qrlogin/approve').send({ serial: body.serial }).expect(401);
    expect(mockSendWs).not.toHaveBeenCalled();
  });

  test('notifies over websocket with the serial only, never the secret', async () => {
    const app = buildApp();
    const body = await createCode(app);
    await approveCode(app, body.serial);
    expect(mockSendWs).toHaveBeenCalledTimes(1);
    const [payload, adultonly, auth] = mockSendWs.mock.calls[0];
    expect(payload).toEqual({ type: 'qrlogin', data: body.serial, status: 'approved' });
    expect(JSON.stringify(payload)).not.toContain(body.secret);
    expect(adultonly).toBe(false);
    expect(auth).toBe(false);
  });

  test('fails for an expired code', async () => {
    await request(buildApp())
      .post('/api/qrlogin/approve')
      .set('x-test-user', JSON.stringify(TEST_USER))
      .send({ serial: 'b'.repeat(64) })
      .expect(404);
  });
});

describe('POST /api/qrlogin/reject', () => {
  test('requires an authenticated session', async () => {
    const app = buildApp();
    const body = await createCode(app);
    await request(app).post('/api/qrlogin/reject').send({ serial: body.serial }).expect(401);
  });

  test('drops the code so it can no longer be approved', async () => {
    const app = buildApp();
    const body = await createCode(app);
    await request(app)
      .post('/api/qrlogin/reject')
      .set('x-test-user', JSON.stringify(TEST_USER))
      .send({ serial: body.serial })
      .expect(200);
    const res = await request(app).get(`/api/qrlogin/status/${body.serial}`).expect(200);
    expect(res.body.status).toBe('expired');
  });
});

describe('POST /api/login/qr', () => {
  test('logs in the approving user and returns the file server url', async () => {
    const app = buildApp('https://test-file-host:9084/f');
    const body = await createCode(app);
    await approveCode(app, body.serial);
    mockMongo.mockResolvedValue([TEST_USER]);

    const res = await request(app).post('/api/login/qr').send({ serial: body.serial, secret: body.secret }).expect(200);
    expect(res.body).toEqual({ loginOK: true, id: 'tester', url: 'https://test-file-host:9084/f' });
    expect(mockMongo).toHaveBeenCalledWith('find', 'user', { _id: 'user-id-1' }, { limit: 1 });
  });

  test('omits url when the router is mounted without one', async () => {
    const app = buildApp();
    const body = await createCode(app);
    await approveCode(app, body.serial);
    mockMongo.mockResolvedValue([TEST_USER]);

    const res = await request(app).post('/api/login/qr').send({ serial: body.serial, secret: body.secret }).expect(200);
    expect(res.body).toEqual({ loginOK: true, id: 'tester' });
  });

  test('can be redeemed twice (main server + file server) then no more', async () => {
    const app = buildApp();
    const body = await createCode(app);
    await approveCode(app, body.serial);
    mockMongo.mockResolvedValue([TEST_USER]);

    await request(app).post('/api/login/qr').send({ serial: body.serial, secret: body.secret }).expect(200);
    await request(app).post('/api/login/qr').send({ serial: body.serial, secret: body.secret }).expect(200);
    await request(app).post('/api/login/qr').send({ serial: body.serial, secret: body.secret }).expect(401);
  });

  test('refuses a stolen serial without the secret', async () => {
    const app = buildApp();
    const body = await createCode(app);
    await approveCode(app, body.serial);
    mockMongo.mockResolvedValue([TEST_USER]);

    await request(app).post('/api/login/qr').send({ serial: body.serial, secret: 'f'.repeat(64) }).expect(401);
    await request(app).post('/api/login/qr').send({ serial: body.serial }).expect(401);
    expect(mockMongo).not.toHaveBeenCalled();
  });

  test('refuses a code that was never approved', async () => {
    const app = buildApp();
    const body = await createCode(app);
    await request(app).post('/api/login/qr').send({ serial: body.serial, secret: body.secret }).expect(401);
  });

  test('refuses when the approving user no longer exists', async () => {
    const app = buildApp();
    const body = await createCode(app);
    await approveCode(app, body.serial);
    mockMongo.mockResolvedValue([]);

    await request(app).post('/api/login/qr').send({ serial: body.serial, secret: body.secret }).expect(401);
  });
});
