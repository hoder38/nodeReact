/**
 * user-router.test.js — Comprehensive tests for src/back/controllers/user-router.js
 *
 * Routes (all require auth via router.use checkLogin):
 *   GET  /act/:uid?   — admin: list all users; regular: self info only
 *   PUT  /act/:uid?   — edit user (auto, kindle, desc, perm, unDay, unHit, newPwd, name)
 *   POST /act/:uid?   — add new user (admin only)
 *   PUT  /del/:uid    — delete user (admin only, cannot delete owner)
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
  ENV_TYPE: 'test', PASSWORD_SALT: 'test_salt_',
  CA: '/t', CERT: '/t', PKEY: '/t',
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
  USERDB: 'user', STORAGEDB: 'storage',
  UNACTIVE_DAY: 5, UNACTIVE_HIT: 10,
  RE_WEBURL: /^https?:\/\//, STATIC_PATH: '/p', RELEASE: 'release', DEV: 'dev',
  STOCKDB: 'stock', PASSWORDDB: 'password',
  DEFAULT_TAGS: [], STORAGE_PARENT: [], PASSWORD_PARENT: [], STOCK_PARENT: [], HANDLE_TIME: 7200,
  RELATIVE_LIMIT: 100,
  RELATIVE_UNION: 2, RELATIVE_INTER: 3, GENRE_LIST: [], GENRE_LIST_CH: [],
  BOOKMARK_LIMIT: 100, ADULTONLY_PARENT: [], GAME_LIST: [], GAME_LIST_CH: [],
  MEDIA_LIST: [], MEDIA_LIST_CH: [], DM5_ORI_LIST: [], DM5_CH_LIST: [],
  DM5_LIST: [], DM5_AREA_LIST: [], DM5_TAG_LIST: [],
  QUERY_LIMIT: 20,
}));

const mockMongo = jest.fn();
const mockObjectID = jest.fn((id) => id);
jest.unstable_mockModule('../../models/mongo-tool.js', () => ({
  default: mockMongo,
  objectID: mockObjectID,
}));

jest.unstable_mockModule('../../models/tag-tool.js', () => ({
  default: jest.fn(() => ({})),
  isDefaultTag: jest.fn(() => false),
  normalize: jest.fn((s) => s),
}));

jest.unstable_mockModule('../../util/mime.js', () => ({
  getOptionTag: jest.fn(() => []),
}));

// --- bcrypt mock ---
const mockBcryptCompare = jest.fn(() => Promise.resolve(true));
const mockBcryptHash = jest.fn(() => Promise.resolve('$2b$10$hashed'));
jest.unstable_mockModule('bcrypt', () => ({
  default: { compare: mockBcryptCompare, hash: mockBcryptHash },
}));

// --- redis-tool.js mock (for utility.js userPWCheck) ---
const mockRedis = jest.fn(() => Promise.resolve(null));
jest.unstable_mockModule('../../models/redis-tool.js', () => ({
  default: mockRedis,
}));

// =====================================================================
// IMPORTS
// =====================================================================
const { default: Express } = await import('express');
const { default: request } = await import('supertest');
const { default: UserRouter } = await import('../user-router.js');

// =====================================================================
// HELPERS
// =====================================================================
const TEST_PW = 'Test123';
const TEST_BCRYPT_HASH = '$2b$10$somebcrypthashforTesting';

const ADMIN = {
  _id: 'aabbccddeeff001122334455',
  username: 'admin', password: TEST_BCRYPT_HASH, perm: 1,
  auto: 'folder123', kindle: 'admin', unDay: 5, unHit: 10, desc: 'owner',
};
// Separate admin IDs for wrong-password tests — avoids pwCheck cache pollution
const ADMIN_POST = {
  _id: 'aabbccddeeff001122330011',
  username: 'admin', password: TEST_BCRYPT_HASH, perm: 1,
  auto: '', kindle: '', unDay: 5, unHit: 10, desc: 'owner',
};
const ADMIN_DEL = {
  _id: 'aabbccddeeff001122330022',
  username: 'admin', password: TEST_BCRYPT_HASH, perm: 1,
  auto: '', kindle: '', unDay: 5, unHit: 10, desc: 'owner',
};
const REGULAR = {
  _id: 'aabbccddeeff001122334466',
  username: 'user1', password: TEST_BCRYPT_HASH, perm: 3,
  auto: '', kindle: '', desc: 'regular user',
};
const USER2 = {
  _id: 'aabbccddeeff001122334477',
  username: 'user2', password: 'otherhash', perm: 5, desc: 'another',
};

// Mock objectID.equals (MongoDB ObjectID comparison)
function makeUser(user) {
  return {
    ...user,
    _id: {
      toString: () => user._id,
      equals: (other) => {
        const otherStr = typeof other === 'object' && other.toString ? other.toString() : other;
        return user._id === otherStr;
      },
    },
  };
}

function buildApp() {
  const app = Express();
  app.use(Express.json());
  app.use(Express.urlencoded({ extended: true }));
  app.use((req, res, next) => {
    if (req.headers['x-test-user']) {
      req.user = makeUser(JSON.parse(req.headers['x-test-user']));
      req.isAuthenticated = () => true;
    } else {
      req.isAuthenticated = () => false;
    }
    req.session = {};
    next();
  });
  app.use('/', UserRouter);
  app.use((err, req, res, next) => {
    err.name === 'HoError'
      ? res.status(err.code).send(err.message.toString())
      : res.status(500).send('server error occur');
  });
  return app;
}

const u = (user) => JSON.stringify(user);

// =====================================================================
// TESTS
// =====================================================================
describe('user-router.js', () => {
  let app;
  beforeEach(() => {
    app = buildApp();
    mockMongo.mockReset();
    mockObjectID.mockImplementation((id) => id);
    mockBcryptCompare.mockReset();
    mockBcryptCompare.mockImplementation(() => Promise.resolve(true));
    mockBcryptHash.mockReset();
    mockBcryptHash.mockImplementation(() => Promise.resolve('$2b$10$hashed'));
    mockRedis.mockReset();
    mockRedis.mockImplementation(() => Promise.resolve(null));
  });

  // ---------------------------------------------------------------
  // Auth guard
  // ---------------------------------------------------------------
  describe('Auth guard (router.use checkLogin)', () => {
    test('unauthenticated GET /act returns 401', async () => {
      const res = await request(app).get('/act');
      expect(res.status).toBe(401);
    });

    test('unauthenticated PUT /act returns 401', async () => {
      const res = await request(app).put('/act');
      expect(res.status).toBe(401);
    });

    test('unauthenticated POST /act returns 401', async () => {
      const res = await request(app).post('/act');
      expect(res.status).toBe(401);
    });

    test('unauthenticated PUT /del/abc returns 401', async () => {
      const res = await request(app).put('/del/aabbccddeeff001122334455');
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------
  // GET /act — user info
  // ---------------------------------------------------------------
  describe('GET /act — user info', () => {
    test('regular user gets self info only', async () => {
      mockMongo.mockResolvedValueOnce([REGULAR]);
      const res = await request(app).get('/act').set('x-test-user', u(REGULAR));
      expect(res.status).toBe(200);
      expect(res.body.user_info).toHaveLength(1);
      expect(res.body.user_info[0].name).toBe('user1');
      expect(res.body.user_info[0].newable).toBe(false);
    });

    test('regular user info includes formatted auto and kindle', async () => {
      mockMongo.mockResolvedValueOnce([{ ...REGULAR, auto: 'gfolder', kindle: 'mykindle' }]);
      const res = await request(app).get('/act').set('x-test-user', u(REGULAR));
      expect(res.body.user_info[0].auto).toContain('drive.google.com/drive/folders/gfolder');
      expect(res.body.user_info[0].kindle).toBe('mykindle@kindle.com');
    });

    test('regular user with empty auto/kindle gets empty strings', async () => {
      mockMongo.mockResolvedValueOnce([{ ...REGULAR, auto: '', kindle: '' }]);
      const res = await request(app).get('/act').set('x-test-user', u(REGULAR));
      expect(res.body.user_info[0].auto).toBe('');
      expect(res.body.user_info[0].kindle).toBe('');
    });

    test('regular user not found returns error', async () => {
      mockMongo.mockResolvedValueOnce([]);
      const res = await request(app).get('/act').set('x-test-user', u(REGULAR));
      // handleError without next → Promise.reject → unhandled
      expect(res.status).not.toBe(200);
    });

    test('admin user gets all users with new-user template row', async () => {
      mockMongo.mockResolvedValueOnce([ADMIN, REGULAR, USER2]);
      const res = await request(app).get('/act').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      // First item is the empty "new user" template
      expect(res.body.user_info[0].newable).toBe(true);
      expect(res.body.user_info[0].name).toBe('');
      expect(res.body.user_info[0].id).toBe(0);
      // Remaining items are actual users
      expect(res.body.user_info.length).toBe(4); // template + 3 users
    });

    test('admin list: owner user (perm=1) has unDay/unHit, not delable', async () => {
      mockMongo.mockResolvedValueOnce([ADMIN]);
      const res = await request(app).get('/act').set('x-test-user', u(ADMIN));
      const adminEntry = res.body.user_info[1]; // index 0 is template
      expect(adminEntry.unDay).toBe(5);
      expect(adminEntry.unHit).toBe(10);
      expect(adminEntry.delable).toBeUndefined();
    });

    test('admin list: non-owner user has delable=true, no unDay/unHit', async () => {
      mockMongo.mockResolvedValueOnce([ADMIN, REGULAR]);
      const res = await request(app).get('/act').set('x-test-user', u(ADMIN));
      const userEntry = res.body.user_info[2]; // template, admin, user
      expect(userEntry.delable).toBe(true);
      expect(userEntry.unDay).toBeUndefined();
    });

    test('admin list: users have editAuto=true, editKindle=true', async () => {
      mockMongo.mockResolvedValueOnce([ADMIN]);
      const res = await request(app).get('/act').set('x-test-user', u(ADMIN));
      expect(res.body.user_info[1].editAuto).toBe(true);
      expect(res.body.user_info[1].editKindle).toBe(true);
    });

    test('DB error returns 500', async () => {
      mockMongo.mockRejectedValueOnce(new Error('DB fail'));
      const res = await request(app).get('/act').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });
  });

  // ---------------------------------------------------------------
  // PUT /act/:uid — edit user
  // ---------------------------------------------------------------
  describe('PUT /act/:uid — edit user', () => {
    test('rejects invalid userPW format', async () => {
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: 'bad', kindle: 'a@kindle.com' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('passwd');
    });

    test('rejects wrong password (userPWCheck fails)', async () => {
      mockBcryptCompare.mockResolvedValueOnce(false);
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: 'Wrong1', kindle: 'a@kindle.com' });
      // userPWCheck returns false for wrong password
      expect(res.status).toBe(400);
      expect(res.text).toContain('permission denied');
    });

    test('admin edits kindle successfully', async () => {
      mockMongo.mockResolvedValueOnce({}); // update
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, kindle: 'mydevice@kindle.com' });
      expect(res.status).toBe(200);
      expect(res.body.kindle).toBe('mydevice@kindle.com');
    });

    test('rejects invalid kindle email (not @kindle.com)', async () => {
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, kindle: 'user@gmail.com' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('kindle');
    });

    test('non-admin cannot set auto (Google Drive folder)', async () => {
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(REGULAR))
        .send({ userPW: TEST_PW, auto: 'https://drive.google.com/drive/folders/abc123' });
      expect(res.status).toBe(403);
    });

    test('admin sets auto with valid folder URL', async () => {
      mockMongo.mockResolvedValueOnce({});
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, auto: 'https://drive.google.com/drive/folders/xyz789' });
      expect(res.status).toBe(200);
      expect(res.body.auto).toContain('xyz789');
    });

    test('rejects auto URL without /folders/ pattern', async () => {
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, auto: 'https://drive.google.com/drive/nofolder' });
      expect(res.status).toBe(400);
    });

    test('non-admin cannot set perm', async () => {
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(REGULAR))
        .send({ userPW: TEST_PW, perm: '5' });
      expect(res.status).toBe(403);
    });

    test('admin cannot edit own perm', async () => {
      const res = await request(app).put(`/act/${ADMIN._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, perm: '2' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('owner can not edit self perm');
    });

    test('admin changes password with matching newPwd and conPwd', async () => {
      mockMongo.mockResolvedValueOnce({});
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, newPwd: 'NewPwd1', conPwd: 'NewPwd1' });
      expect(res.status).toBe(200);
    });

    test('rejects when newPwd !== conPwd', async () => {
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, newPwd: 'NewPwd1', conPwd: 'NewPwd2' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('confirm password must equal');
    });

    test('non-admin with no uid edits self', async () => {
      mockMongo.mockResolvedValueOnce({});
      const res = await request(app).put('/act')
        .set('x-test-user', u(REGULAR))
        .send({ userPW: TEST_PW, newPwd: 'ChangP1', conPwd: 'ChangP1' });
      expect(res.status).toBe(200);
    });

    test('rejects nothing to change (empty data)', async () => {
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW });
      expect(res.status).toBe(400);
      expect(res.text).toContain('nothing to change');
    });

    test('name change checks for duplicate username', async () => {
      mockMongo.mockResolvedValueOnce([{ username: 'taken' }]); // find existing
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, name: 'taken' });
      // handleError without next → promise reject
      expect(res.status).not.toBe(200);
    });

    test('name change succeeds when name is available', async () => {
      mockMongo.mockResolvedValueOnce([]); // no duplicate
      mockMongo.mockResolvedValueOnce({}); // update
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, name: 'newname' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('newname');
    });

    test('non-admin cannot edit desc', async () => {
      const res = await request(app).put('/act')
        .set('x-test-user', u(REGULAR))
        .send({ userPW: TEST_PW, desc: 'new desc' });
      expect(res.status).toBe(403);
    });

    test('non-admin cannot edit unDay/unHit', async () => {
      const res = await request(app).put('/act')
        .set('x-test-user', u(REGULAR))
        .send({ userPW: TEST_PW, unDay: '7' });
      expect(res.status).toBe(403);
    });

    test('non-admin cannot edit unHit', async () => {
      const res = await request(app).put('/act')
        .set('x-test-user', u(REGULAR))
        .send({ userPW: TEST_PW, unHit: '10' });
      expect(res.status).toBe(403);
    });

    test('DB error on update returns 500', async () => {
      mockMongo.mockRejectedValueOnce(new Error('update fail'));
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, newPwd: 'Good123', conPwd: 'Good123' });
      expect(res.status).toBe(500);
    });

    test('edit returns {apiOK: true} when ret is empty but data is not', async () => {
      // Password-only change: data has password but ret is empty
      mockMongo.mockResolvedValueOnce({});
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, newPwd: 'Pass123', conPwd: 'Pass123' });
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
    });

    // --- Additional coverage: validation branches ---

    test('admin rejects auto with non-URL value (line 71)', async () => {
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, auto: 'plaintext' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('auto');
    });

    test('rejects kindle with non-email format (line 83)', async () => {
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, kindle: 'noatsign' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('kindle');
    });

    test('admin sets desc successfully', async () => {
      mockMongo.mockResolvedValueOnce({});
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, desc: 'new description' });
      expect(res.status).toBe(200);
      expect(res.body.desc).toBeTruthy();
    });

    test('admin rejects invalid desc value', async () => {
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, desc: "bad'desc" });
      expect(res.status).toBe(400);
      expect(res.text).toContain('desc');
    });

    test('admin sets perm on another user successfully', async () => {
      mockMongo.mockResolvedValueOnce({});
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, perm: '3' });
      expect(res.status).toBe(200);
      expect(res.body.perm).toBe(3);
    });

    test('admin rejects invalid perm value', async () => {
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, perm: 'abc' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('perm');
    });

    test('admin sets unDay successfully', async () => {
      mockMongo.mockResolvedValueOnce({});
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, unDay: '7' });
      expect(res.status).toBe(200);
      expect(res.body.unDay).toBe(7);
    });

    test('admin rejects invalid unDay', async () => {
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, unDay: 'abc' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('unactive day');
    });

    test('admin sets unHit successfully', async () => {
      mockMongo.mockResolvedValueOnce({});
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, unHit: '10' });
      expect(res.status).toBe(200);
      expect(res.body.unHit).toBe(10);
    });

    test('admin rejects invalid unHit', async () => {
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, unHit: 'abc' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('unactive hit');
    });

    test('rejects invalid newPwd format (too short)', async () => {
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, newPwd: 'x', conPwd: 'x' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('new passwd');
    });

    test('rejects invalid conPwd format', async () => {
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, newPwd: 'Pass123', conPwd: 'x' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('con passwd');
    });

    test('admin with invalid uid format in URL', async () => {
      const res = await request(app).put('/act/baduid')
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, newPwd: 'Pass123', conPwd: 'Pass123' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('uid');
    });

    test('rejects name with invalid characters', async () => {
      const res = await request(app).put(`/act/${REGULAR._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, name: '***' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('name');
    });

    test('admin changes own name → ret includes owner', async () => {
      mockMongo.mockResolvedValueOnce([]); // no duplicate
      mockMongo.mockResolvedValueOnce({}); // update
      const res = await request(app).put(`/act/${ADMIN._id}`)
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, name: 'newadmin' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('newadmin');
      expect(res.body.owner).toBe('newadmin');
    });
  });

  // ---------------------------------------------------------------
  // POST /act — add user (admin only)
  // ---------------------------------------------------------------
  describe('POST /act — add user', () => {
    test('non-admin returns 403', async () => {
      const res = await request(app).post('/act')
        .set('x-test-user', u(REGULAR))
        .send({ name: 'new', newPwd: 'Pass123', conPwd: 'Pass123', desc: 'test', perm: '3' });
      expect(res.status).toBe(403);
    });

    test('rejects wrong admin password', async () => {
      mockBcryptCompare.mockResolvedValueOnce(false);
      const res = await request(app).post('/act')
        .set('x-test-user', u(ADMIN_POST))
        .send({ userPW: 'Wrong1', name: 'new', newPwd: 'Pass12', conPwd: 'Pass12', desc: 'x', perm: '3' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('permission denied');
    });

    test('rejects invalid name', async () => {
      const res = await request(app).post('/act')
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, name: '', newPwd: 'Pass123', conPwd: 'Pass123', desc: 'x', perm: '3' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('name');
    });

    test('rejects duplicate username', async () => {
      mockMongo.mockResolvedValueOnce([{ username: 'existing' }]);
      const res = await request(app).post('/act')
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, name: 'existing', newPwd: 'Pass123', conPwd: 'Pass123', desc: 'x', perm: '3' });
      // handleError without next inside promise
      expect(res.status).not.toBe(200);
    });

    test('successful user creation returns user info', async () => {
      const newUser = { _id: 'newid123456789012345678', username: 'newuser', perm: 3, desc: 'tester' };
      mockMongo.mockResolvedValueOnce([]); // no duplicate
      mockMongo.mockResolvedValueOnce([newUser]); // insert returns array
      const res = await request(app).post('/act')
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, name: 'newuser', newPwd: 'Pass123', conPwd: 'Pass123', desc: 'tester', perm: '3' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('newuser');
      expect(res.body.newable).toBe(false);
      expect(res.body.delable).toBe(true);
      expect(res.body.editAuto).toBe(true);
    });

    test('created owner-level user (perm=1) has unDay/unHit', async () => {
      const ownerUser = { _id: 'own12345678901234567890', username: 'newadmin', perm: 1, desc: 'admin' };
      mockMongo.mockResolvedValueOnce([]);
      mockMongo.mockResolvedValueOnce([ownerUser]);
      const res = await request(app).post('/act')
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, name: 'newadmin', newPwd: 'Pass123', conPwd: 'Pass123', desc: 'admin', perm: '1' });
      expect(res.status).toBe(200);
      expect(res.body.unDay).toBe(5);
      expect(res.body.unHit).toBe(10);
      expect(res.body.delable).toBeUndefined();
    });

    test('rejects password mismatch', async () => {
      mockMongo.mockResolvedValueOnce([]); // no duplicate
      const res = await request(app).post('/act')
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, name: 'n', newPwd: 'Pass123', conPwd: 'Pass999', desc: 'x', perm: '3' });
      expect(res.status).not.toBe(200);
    });

    test('DB error returns 500', async () => {
      mockMongo.mockRejectedValueOnce(new Error('insert fail'));
      const res = await request(app).post('/act')
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, name: 'n', newPwd: 'Pass123', conPwd: 'Pass123', desc: 'x', perm: '3' });
      expect(res.status).toBe(500);
    });

    test('rejects invalid userPW format in POST', async () => {
      const res = await request(app).post('/act')
        .set('x-test-user', u(ADMIN))
        .send({ userPW: 'x', name: 'n', newPwd: 'Pass123', conPwd: 'Pass123', desc: 'test', perm: '3' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('passwd');
    });

    test('POST rejects invalid newPwd inside promise', async () => {
      mockMongo.mockResolvedValueOnce([]); // no duplicate
      const res = await request(app).post('/act')
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, name: 'validn', newPwd: 'x', conPwd: 'x', desc: 'test', perm: '3' });
      expect(res.status).not.toBe(200);
    });

    test('POST rejects invalid conPwd inside promise', async () => {
      mockMongo.mockResolvedValueOnce([]); // no duplicate
      const res = await request(app).post('/act')
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, name: 'validn', newPwd: 'Pass123', conPwd: 'x', desc: 'test', perm: '3' });
      expect(res.status).not.toBe(200);
    });

    test('POST rejects invalid desc inside promise', async () => {
      mockMongo.mockResolvedValueOnce([]); // no duplicate
      const res = await request(app).post('/act')
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, name: 'validn', newPwd: 'Pass123', conPwd: 'Pass123', desc: "bad'desc", perm: '3' });
      expect(res.status).not.toBe(200);
    });

    test('POST rejects invalid perm inside promise', async () => {
      mockMongo.mockResolvedValueOnce([]); // no duplicate
      const res = await request(app).post('/act')
        .set('x-test-user', u(ADMIN))
        .send({ userPW: TEST_PW, name: 'validn', newPwd: 'Pass123', conPwd: 'Pass123', desc: 'valid', perm: 'abc' });
      expect(res.status).not.toBe(200);
    });
  });

  // ---------------------------------------------------------------
  // PUT /del/:uid — delete user
  // ---------------------------------------------------------------
  describe('PUT /del/:uid — delete user', () => {
    test('non-admin returns 403', async () => {
      const res = await request(app).put(`/del/${USER2._id}`)
        .set('x-test-user', u(REGULAR)).send({ userPW: TEST_PW });
      expect(res.status).toBe(403);
    });

    test('rejects wrong admin password', async () => {
      mockBcryptCompare.mockResolvedValueOnce(false);
      const res = await request(app).put(`/del/${USER2._id}`)
        .set('x-test-user', u(ADMIN_DEL)).send({ userPW: 'Wrong1' });
      expect(res.status).toBe(400);
    });

    test('rejects invalid uid', async () => {
      const res = await request(app).put('/del/baduid')
        .set('x-test-user', u(ADMIN)).send({ userPW: TEST_PW });
      expect(res.status).toBe(400);
      expect(res.text).toContain('uid');
    });

    test('rejects if user not found', async () => {
      mockMongo.mockResolvedValueOnce([]); // find returns empty
      const res = await request(app).put(`/del/${USER2._id}`)
        .set('x-test-user', u(ADMIN)).send({ userPW: TEST_PW });
      expect(res.status).not.toBe(200);
    });

    test('cannot delete owner (perm=1)', async () => {
      mockMongo.mockResolvedValueOnce([ADMIN]); // found user is owner
      const res = await request(app).put(`/del/${ADMIN._id}`)
        .set('x-test-user', u(ADMIN)).send({ userPW: TEST_PW });
      expect(res.status).not.toBe(200);
    });

    test('successfully deletes non-owner user', async () => {
      mockMongo.mockResolvedValueOnce([USER2]); // find user
      mockMongo.mockResolvedValueOnce({}); // deleteMany
      const res = await request(app).put(`/del/${USER2._id}`)
        .set('x-test-user', u(ADMIN)).send({ userPW: TEST_PW });
      expect(res.status).toBe(200);
      expect(res.body.apiOK).toBe(true);
    });

    test('DB error returns 500', async () => {
      mockMongo.mockRejectedValueOnce(new Error('delete fail'));
      const res = await request(app).put(`/del/${USER2._id}`)
        .set('x-test-user', u(ADMIN)).send({ userPW: TEST_PW });
      expect(res.status).toBe(500);
    });

    test('rejects invalid userPW format in delete', async () => {
      const res = await request(app).put(`/del/${USER2._id}`)
        .set('x-test-user', u(ADMIN)).send({ userPW: 'x' });
      expect(res.status).toBe(400);
      expect(res.text).toContain('passwd');
    });
  });
});
