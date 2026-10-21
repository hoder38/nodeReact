/**
 * agent-router.test.js — GET /api/agent-token (HS256 token for agent-harness) and the
 * admin-only "Agent" nav entry it enables in basic-router's /getuser.
 */
import { createHmac } from 'crypto';
import { jest, describe, test, expect } from '@jest/globals';

jest.unstable_mockModule('../../../../ver.js', () => ({
  PASSWORD_SALT: 'test_salt_',
  ENV_TYPE: 'test',
  CA: '/test/ca.pem',
  CERT: '/test/cert.pem',
  PKEY: '/test/key.pem',
  SESS_SECRET: 'test-secret',
  SESS_PWD: 'test-pwd',
  AGENT_JWT_SECRET: 'test-agent-secret',
  AGENT_OWNER_ID: 'owner-1',
  AGENT_NODEREACT_USER: 'admin',
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

const { default: Express } = await import('express');
const { default: request } = await import('supertest');
const { default: AgentRouter, signAgentToken } = await import('../agent-router.js');
const { default: BasicRouter } = await import('../basic-router.js');

function buildApp() {
  const app = Express();
  app.use((req, res, next) => {
    const user = req.headers['x-test-user'];
    req.user = user ? JSON.parse(user) : undefined;
    req.isAuthenticated = () => Boolean(user);
    req.session = {};
    next();
  });
  app.use('/api/agent-token', AgentRouter);
  app.use('/api', BasicRouter);
  app.use((err, req, res, next) => {
    err.name === 'HoError' ? res.status(err.code).send(err.message.toString()) : res.status(500).send('server error occur');
  });
  return app;
}

const OWNER = { _id: 'a1', username: 'admin', perm: 1 };
const OTHER_ADMIN = { _id: 'a2', username: 'admin2', perm: 1 };
const USER = { _id: 'a3', username: 'user', perm: 0 };

const decode = part => JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());

describe('agent-router', () => {
  test('signAgentToken produces a valid HS256 JWT with harness claims', () => {
    const token = signAgentToken('s3cret', 'owner-1', 1000);
    const [h, p, sig] = token.split('.');
    expect(decode(h)).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(decode(p)).toMatchObject({ sub: 'owner-1', iss: 'nodereact', aud: 'agent-harness', iat: 1000, exp: 1600 });
    const expected = createHmac('sha256', 's3cret').update(`${h}.${p}`).digest('base64')
      .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    expect(sig).toBe(expected);
    expect(token).not.toMatch(/[=+/]/);
  });

  test('owner gets a no-store token', async () => {
    const res = await request(buildApp()).get('/api/agent-token').set('x-test-user', JSON.stringify(OWNER));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.expiresIn).toBe(600);
    expect(decode(res.body.token.split('.')[1]).sub).toBe('owner-1');
  });

  test.each([
    ['unauthenticated', null, 401],
    ['non-admin', USER, 403],
    ['admin other than AGENT_NODEREACT_USER', OTHER_ADMIN, 403],
  ])('%s is rejected', async (_, user, code) => {
    const req = request(buildApp()).get('/api/agent-token');
    const res = user ? await req.set('x-test-user', JSON.stringify(user)) : await req;
    expect(res.status).toBe(code);
  });

  test('/getuser nav includes Agent only for the owner', async () => {
    const owner = await request(buildApp()).get('/api/getuser').set('x-test-user', JSON.stringify(OWNER));
    expect(owner.body.nav.map(n => n.hash)).toEqual(['/Stock', '/Agent']);
    const other = await request(buildApp()).get('/api/getuser').set('x-test-user', JSON.stringify(OTHER_ADMIN));
    expect(other.body.nav.map(n => n.hash)).toEqual(['/Stock']);
  });
});
