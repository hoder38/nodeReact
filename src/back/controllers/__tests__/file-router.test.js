/**
 * file-router.test.js — Comprehensive tests for src/back/controllers/file-router.js
 *
 * 4 routes, all require auth (global middleware):
 *   PUT    /edit/:uid                                — edit file metadata
 *   DELETE /del/:uid/:recycle                        — delete or recycle file
 *   GET    /media/:action(act|del)/:uid/:index?      — media processing / cancel
 *   GET    /feedback                                 — retrieve untagged feedback items
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// =====================================================================
// MOCK SETUP
// =====================================================================

// --- fs ---
const mockExistsSync = jest.fn(() => false);
const mockUnlink = jest.fn((p, cb) => cb(null));
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
    readFileSync: jest.fn(() => Buffer.from('')),
    createReadStream: jest.fn(() => ({ pipe: jest.fn().mockReturnThis(), on: jest.fn() })),
    readdirSync: jest.fn(() => []),
    lstatSync: jest.fn(() => ({ isDirectory: () => false })),
    unlinkSync: jest.fn(), rmdirSync: jest.fn(),
    readFile: jest.fn(), writeFile: jest.fn(),
    createWriteStream: jest.fn(),
    statSync: jest.fn(() => ({ size: 0 })),
    renameSync: jest.fn(), writeFileSync: jest.fn(),
  },
}));

// --- ver.js ---
jest.unstable_mockModule('../../../../ver.js', () => ({
  ENV_TYPE: 'test', CA: '/t', CERT: '/t', PKEY: '/t',
  SESS_SECRET: 'test', SESS_PWD: 'test',
}));

// --- config.js ---
jest.unstable_mockModule('../../config.js', () => ({
  NAS_PREFIX: jest.fn(() => '/s'), EXTENT_FILE_IP: jest.fn(() => 'h'),
  EXTENT_FILE_PORT: jest.fn(() => 1), EXTENT_IP: jest.fn(() => 'h'),
  EXTENT_PORT: jest.fn(() => 1), IP: jest.fn(() => '0'), PORT: jest.fn(() => 1),
  FILE_IP: jest.fn(() => '0'), FILE_PORT: jest.fn(() => 1), WS_PORT: jest.fn(() => 1),
  COM_PORT: jest.fn(() => 1), NAS_TMP: jest.fn(() => '/t'), APP_HTML: jest.fn(() => 'a'),
  DB_NAME: jest.fn(() => 'd'), DB_IP: jest.fn(() => '0'), DB_PORT: jest.fn(() => 1),
  SESS_IP: jest.fn(() => '0'), SESS_PORT: jest.fn(() => 1), HINT: jest.fn(() => false),
}));

// --- constants.js ---
jest.unstable_mockModule('../../constants.js', () => ({
  USERDB: 'user', VERIFYDB: 'verify', STORAGEDB: 'storage',
  NOISE_TIME: 7200,
  UNACTIVE_DAY: 5, UNACTIVE_HIT: 10,
  RE_WEBURL: /^https?:\/\//, STATIC_PATH: '/p', RELEASE: 'release', DEV: 'dev',
  STOCKDB: 'stock', PASSWORDDB: 'password',
  DEFAULT_TAGS: [], STORAGE_PARENT: [], PASSWORD_PARENT: [], STOCK_PARENT: [], HANDLE_TIME: 7200,
  BILI_TYPE: [], BILI_INDEX: [], RELATIVE_LIMIT: 100,
  RELATIVE_UNION: 2, RELATIVE_INTER: 3,
  GENRE_LIST: [], GENRE_LIST_CH: [],
  BOOKMARK_LIMIT: 100, ADULTONLY_PARENT: [],
  GAME_LIST: [], GAME_LIST_CH: [],
  MEDIA_LIST: [], MEDIA_LIST_CH: [],
  DM5_ORI_LIST: [], DM5_CH_LIST: [],
  DM5_LIST: [], DM5_AREA_LIST: [], DM5_TAG_LIST: [], KUBO_COUNTRY: [],
  QUERY_LIMIT: 20, ADULT_LIST: [], MUSIC_LIST: [], BITFINEX: '',
}));

// --- mongo-tool.js ---
const mockMongo = jest.fn();
jest.unstable_mockModule('../../models/mongo-tool.js', () => ({
  default: mockMongo,
  objectID: jest.fn((id) => id),
}));

// --- tag-tool.js ---
const mockSetLatest = jest.fn(() => Promise.resolve());
jest.unstable_mockModule('../../models/tag-tool.js', () => ({
  default: jest.fn(() => ({
    setLatest: mockSetLatest,
  })),
  isDefaultTag: jest.fn(() => false),
  normalize: jest.fn((s) => s),
}));

// --- mediaHandle-tool.js ---
const mockEditFile = jest.fn();
const mockHandleTag = jest.fn();
const mockHandleMediaUpload = jest.fn();
const mockHandleMedia = jest.fn();
const mockErrorMedia = jest.fn(() => Promise.resolve());
const mockHandleMediaError = jest.fn((res, fileID, fileIndex) => (err) => {
  mockErrorMedia(err, fileID, fileIndex);
  if (!res.headersSent) {
    res.status(500).json({ error: 'media processing failed' });
  }
});
const mockCompleteMedia = jest.fn();
jest.unstable_mockModule('../../models/mediaHandle-tool.js', () => ({
  default: {
    editFile: mockEditFile,
    handleTag: mockHandleTag,
    handleMediaUpload: mockHandleMediaUpload,
    handleMedia: mockHandleMedia,
  },
  handleMediaError: mockHandleMediaError,
  completeMedia: mockCompleteMedia,
}));

// --- api-tool-google.js ---
const mockGoogleBackup = jest.fn(() => Promise.resolve());
jest.unstable_mockModule('../../models/api-tool-google.js', () => ({
  googleBackup: mockGoogleBackup,
}));

// --- sendWs.js ---
const mockSendWs = jest.fn();
jest.unstable_mockModule('../../util/sendWs.js', () => ({
  default: mockSendWs,
}));

// --- mime.js ---
const mockSupplyTag = jest.fn((_sel, opt) => opt);
const mockIsVideo = jest.fn(() => false);
jest.unstable_mockModule('../../util/mime.js', () => ({
  supplyTag: mockSupplyTag,
  isVideo: mockIsVideo,
  getOptionTag: jest.fn(() => []),
  isImage: jest.fn(() => false),
  isMusic: jest.fn(() => false),
  isDoc: jest.fn(() => false),
  isZipbook: jest.fn(() => false),
}));

// =====================================================================
// IMPORTS (after mocks)
// =====================================================================
const { default: Express } = await import('express');
const { default: request } = await import('supertest');
const { default: FileRouter } = await import('../file-router.js');

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
    req.session = {};
    next();
  });
  app.use('/', FileRouter);
  app.use((err, _req, res, _next) => {
    err.name === 'HoError'
      ? res.status(err.code || 400).send(err.message.toString())
      : res.status(500).send('server error occur');
  });
  return app;
}

const u = (user) => JSON.stringify(user);

const makeItem = (ov = {}) => ({
  _id: 'item0001', name: 'file.mp4', tags: ['video'], recycle: 0,
  adultonly: 0, first: 0, status: 3, utime: 99999, count: 5,
  owner: ADMIN._id, thumb: null, playList: [],
  ...ov,
});

// =====================================================================
// TESTS
// =====================================================================
describe('file-router.js', () => {
  let app;
  beforeEach(() => {
    app = buildApp();
    mockMongo.mockReset();
    mockSetLatest.mockReset();
    mockEditFile.mockReset();
    mockHandleTag.mockReset();
    mockHandleMediaUpload.mockReset();
    mockHandleMedia.mockReset();
    mockErrorMedia.mockReset();
    mockCompleteMedia.mockReset();
    mockGoogleBackup.mockReset();
    mockSendWs.mockReset();
    mockSupplyTag.mockReset();
    mockIsVideo.mockReset();
    mockExistsSync.mockReset();
    mockUnlink.mockReset();
    // sensible defaults
    mockSetLatest.mockReturnValue(Promise.resolve());
    mockGoogleBackup.mockReturnValue(Promise.resolve());
    mockSupplyTag.mockImplementation((_sel, opt) => opt);
    mockUnlink.mockImplementation((_p, cb) => cb(null));
    mockExistsSync.mockReturnValue(false);
  });

  // =================================================================
  // AUTH GUARD (global middleware)
  // =================================================================
  describe('Auth guard', () => {
    test('unauthenticated PUT /edit/:uid returns 401', async () => {
      const res = await request(app).put(`/edit/${VALID_UID}`);
      expect(res.status).toBe(401);
    });
    test('unauthenticated DELETE /del/:uid/0 returns 401', async () => {
      const res = await request(app).delete(`/del/${VALID_UID}/0`);
      expect(res.status).toBe(401);
    });
    test('unauthenticated GET /media/act/:uid returns 401', async () => {
      const res = await request(app).get(`/media/act/${VALID_UID}`);
      expect(res.status).toBe(401);
    });
    test('unauthenticated GET /feedback returns 401', async () => {
      const res = await request(app).get('/feedback');
      expect(res.status).toBe(401);
    });
  });

  // =================================================================
  // PUT /edit/:uid
  // =================================================================
  describe('PUT /edit/:uid', () => {
    const editResult = {
      id: 'eid1', adultonly: 1, select: ['t1'], option: ['t2'], other: ['t3'],
    };

    test('successful edit: returns result with adultonly=null and processed option', async () => {
      mockEditFile.mockResolvedValueOnce({ ...editResult });
      mockMongo.mockResolvedValueOnce({}); // $inc count
      mockSupplyTag.mockReturnValueOnce(['merged']);
      const res = await request(app)
        .put(`/edit/${VALID_UID}`)
        .set('x-test-user', u(ADMIN))
        .send({ name: 'newname' });
      expect(res.status).toBe(200);
      expect(res.body.adultonly).toBeNull();
      expect(res.body.option).toEqual(['merged']);
      expect(mockEditFile).toHaveBeenCalledWith(VALID_UID, 'newname', expect.anything());
    });

    test('sendWs called with file type and adultonly flag', async () => {
      mockEditFile.mockResolvedValueOnce({ ...editResult });
      mockMongo.mockResolvedValueOnce({});
      await request(app).put(`/edit/${VALID_UID}`).set('x-test-user', u(ADMIN)).send({ name: 'x' });
      expect(mockSendWs).toHaveBeenCalledWith({ type: 'file', data: 'eid1' }, 1);
    });

    test('setLatest + $inc fire-and-forget: failure does NOT affect response', async () => {
      mockEditFile.mockResolvedValueOnce({ ...editResult });
      mockSetLatest.mockRejectedValueOnce(new Error('redis down'));
      const res = await request(app).put(`/edit/${VALID_UID}`).set('x-test-user', u(ADMIN)).send({ name: 'x' });
      expect(res.status).toBe(200);
    });

    test('editFile failure returns error', async () => {
      mockEditFile.mockRejectedValueOnce(new Error('edit failed'));
      const res = await request(app).put(`/edit/${VALID_UID}`).set('x-test-user', u(ADMIN)).send({ name: 'x' });
      expect(res.status).toBe(500);
    });
  });

  // =================================================================
  // DELETE /del/:uid/:recycle
  // =================================================================
  describe('DELETE /del/:uid/:recycle', () => {
    // --- Validation ---
    test('invalid uid returns 400 "uid is not vaild"', async () => {
      const res = await request(app).delete('/del/BADUID/0').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/uid is not vaild/);
    });

    test('file not found returns 400', async () => {
      mockMongo.mockResolvedValueOnce([]); // find → empty
      const res = await request(app).delete(`/del/${VALID_UID}/0`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/file can not be fund/);
    });

    // ---------------------------------------------------------------
    // Permanent delete (recycle='1', admin)
    // ---------------------------------------------------------------
    describe('Permanent delete (recycle=1, admin)', () => {
      test('item not in recycle bin → error', async () => {
        mockMongo.mockResolvedValueOnce([makeItem({ recycle: 0 })]);
        const res = await request(app).delete(`/del/${VALID_UID}/1`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(400);
        expect(res.text).toMatch(/recycle file first/);
      });

      test('status 7 → deleteMany only (no fs ops)', async () => {
        mockMongo
          .mockResolvedValueOnce([makeItem({ recycle: 1, status: 7 })]) // find
          .mockResolvedValueOnce({}); // deleteMany
        const res = await request(app).delete(`/del/${VALID_UID}/1`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ apiOK: true });
        expect(mockSendWs).toHaveBeenCalledWith(expect.objectContaining({ type: 'file' }), 1, 1);
        expect(mockUnlink).not.toHaveBeenCalled();
      });

      test('status 8 → deleteMany only', async () => {
        mockMongo
          .mockResolvedValueOnce([makeItem({ recycle: 1, status: 8 })]) // find
          .mockResolvedValueOnce({}); // deleteMany
        const res = await request(app).delete(`/del/${VALID_UID}/1`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
      });

      test('item with thumb → deleteMany only', async () => {
        mockMongo
          .mockResolvedValueOnce([makeItem({ recycle: 1, status: 3, thumb: 'th.jpg' })]) // find
          .mockResolvedValueOnce({}); // deleteMany
        const res = await request(app).delete(`/del/${VALID_UID}/1`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
      });

      test('status 9 playlist with _zip archive → deletes folder + zip + _zip_c', async () => {
        const item = makeItem({ recycle: 1, status: 9 });
        mockMongo
          .mockResolvedValueOnce([item]) // find
          .mockResolvedValueOnce({}); // deleteMany
        // existsSync: _zip=true, _zip_c=true
        mockExistsSync.mockImplementation((p) => {
          if (p.endsWith('_zip')) return true;
          if (p.endsWith('_zip_c')) return true;
          return false;
        });
        const res = await request(app).delete(`/del/${VALID_UID}/1`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        // FsUnlink called for _zip and _zip_c
        expect(mockUnlink).toHaveBeenCalledTimes(2);
      });

      test('status 9 playlist with _7z archive → deletes 7z + _7z_c', async () => {
        mockMongo
          .mockResolvedValueOnce([makeItem({ recycle: 1, status: 9 })]) // find
          .mockResolvedValueOnce({}); // deleteMany
        mockExistsSync.mockImplementation((p) => {
          if (p.endsWith('_7z')) return true;
          if (p.endsWith('_7z_c')) return true;
          return false;
        });
        const res = await request(app).delete(`/del/${VALID_UID}/1`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        expect(mockUnlink).toHaveBeenCalledTimes(2);
      });

      test('status 9 playlist with multi-part RAR → deletes all parts', async () => {
        mockMongo
          .mockResolvedValueOnce([makeItem({ recycle: 1, status: 9 })]) // find
          .mockResolvedValueOnce({}); // deleteMany
        mockExistsSync.mockImplementation((p) => {
          if (p.endsWith('.1.rar')) return true;
          if (p.endsWith('.2.rar')) return true;
          if (p.endsWith('.3.rar')) return true;
          return false;
        });
        const res = await request(app).delete(`/del/${VALID_UID}/1`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        // .1.rar + .2.rar + .3.rar = 3 files
        expect(mockUnlink).toHaveBeenCalledTimes(3);
      });

      test('status 9 playlist with no archive → rest() directly', async () => {
        mockMongo
          .mockResolvedValueOnce([makeItem({ recycle: 1, status: 9 })]) // find
          .mockResolvedValueOnce({}); // deleteMany
        // all existsSync → false (default)
        const res = await request(app).delete(`/del/${VALID_UID}/1`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        expect(mockUnlink).not.toHaveBeenCalled();
      });

      test('regular file → deletes main file + existing sidecars + cleans folders', async () => {
        mockMongo
          .mockResolvedValueOnce([makeItem({ recycle: 1, status: 3 })]) // find
          .mockResolvedValueOnce({}); // deleteMany
        // some sidecars exist
        mockExistsSync.mockImplementation((p) => {
          if (p.endsWith('.jpg')) return true;
          if (p.endsWith('_s.jpg')) return true;
          if (p.endsWith('.srt')) return true;
          return false;
        });
        const res = await request(app).delete(`/del/${VALID_UID}/1`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        // main file + .jpg + _s.jpg + .srt = 4
        expect(mockUnlink).toHaveBeenCalledTimes(4);
      });

      test('regular file → all subtitle formats checked', async () => {
        mockMongo
          .mockResolvedValueOnce([makeItem({ recycle: 1, status: 3 })]) // find
          .mockResolvedValueOnce({}); // deleteMany
        // all sidecars exist
        mockExistsSync.mockReturnValue(true);
        const res = await request(app).delete(`/del/${VALID_UID}/1`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        // main + .jpg + _s.jpg + .srt + .srt1 + .ass + .ass1 + .ssa + .ssa1 + .vtt = 10
        expect(mockUnlink).toHaveBeenCalledTimes(10);
      });

      test('non-admin cannot perm-delete even with recycle=1', async () => {
        // recycle='1' but non-admin → falls through to soft-delete branch
        const item = makeItem({ recycle: 0, owner: REGULAR._id });
        mockMongo
          .mockResolvedValueOnce([item]) // find
          .mockResolvedValueOnce({}); // update (soft delete)
        const res = await request(app).delete(`/del/${VALID_UID}/1`).set('x-test-user', u(REGULAR));
        expect(res.status).toBe(200);
        // should hit soft-delete path (recur_backup → Mongo update recycle=1)
        expect(mockMongo).toHaveBeenCalledWith('update', 'storage', expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ recycle: 1 }) }));
      });
    });

    // ---------------------------------------------------------------
    // Soft delete (recycle)
    // ---------------------------------------------------------------
    describe('Soft delete (recycle!=1)', () => {
      test('non-admin, not owner → error', async () => {
        const item = makeItem({ owner: 'aabbccddeeff001122330000' }); // different owner
        mockMongo.mockResolvedValueOnce([item]);
        const res = await request(app).delete(`/del/${VALID_UID}/0`).set('x-test-user', u(REGULAR));
        expect(res.status).toBe(400);
        expect(res.text).toMatch(/file is not yours/);
      });

      test('non-admin, is owner → soft delete success', async () => {
        const item = makeItem({ owner: REGULAR._id });
        mockMongo
          .mockResolvedValueOnce([item]) // find
          .mockResolvedValueOnce({}); // update
        const res = await request(app).delete(`/del/${VALID_UID}/0`).set('x-test-user', u(REGULAR));
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ apiOK: true });
        expect(mockSendWs).toHaveBeenCalled();
      });

      test('admin soft delete → ownership check skipped', async () => {
        const item = makeItem({ owner: 'aabbccddeeff001122330000' }); // not admin's
        mockMongo
          .mockResolvedValueOnce([item]) // find
          .mockResolvedValueOnce({}); // update
        const res = await request(app).delete(`/del/${VALID_UID}/0`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
      });

      test('backup skip for status 7 (external ref)', async () => {
        const item = makeItem({ status: 7, owner: ADMIN._id });
        mockMongo
          .mockResolvedValueOnce([item]) // find
          .mockResolvedValueOnce({}); // update
        const res = await request(app).delete(`/del/${VALID_UID}/0`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        expect(mockGoogleBackup).not.toHaveBeenCalled();
      });

      test('backup skip for status 8', async () => {
        const item = makeItem({ status: 8, owner: ADMIN._id });
        mockMongo
          .mockResolvedValueOnce([item]) // find
          .mockResolvedValueOnce({}); // update
        await request(app).delete(`/del/${VALID_UID}/0`).set('x-test-user', u(ADMIN));
        expect(mockGoogleBackup).not.toHaveBeenCalled();
      });

      test('backup skip for items with thumb', async () => {
        const item = makeItem({ status: 3, thumb: 'th.jpg', owner: ADMIN._id });
        mockMongo
          .mockResolvedValueOnce([item]) // find
          .mockResolvedValueOnce({}); // update
        await request(app).delete(`/del/${VALID_UID}/0`).set('x-test-user', u(ADMIN));
        expect(mockGoogleBackup).not.toHaveBeenCalled();
      });

      test('backup regular file: googleBackup called up to 3 times (retry)', async () => {
        const item = makeItem({ status: 3, owner: ADMIN._id });
        mockMongo
          .mockResolvedValueOnce([item]) // find
          .mockResolvedValueOnce({}); // update
        const res = await request(app).delete(`/del/${VALID_UID}/0`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        // recur_backup(1) → googleBackup(recycle=1) → recur_backup(2) → googleBackup(recycle=2) → recur_backup(3) → googleBackup(recycle=3)
        expect(mockGoogleBackup).toHaveBeenCalledTimes(3);
        expect(mockGoogleBackup.mock.calls[0][5]).toBe(1); // recycle=1
        expect(mockGoogleBackup.mock.calls[1][5]).toBe(2); // recycle=2
        expect(mockGoogleBackup.mock.calls[2][5]).toBe(3); // recycle=3
      });

      test('backup status 9 playlist with archive: backup zip then playlist items', async () => {
        const item = makeItem({
          status: 9, owner: ADMIN._id,
          playList: ['video1.mp4', 'video2.mp4'],
        });
        mockMongo
          .mockResolvedValueOnce([item]) // find
          .mockResolvedValueOnce({}); // update
        mockExistsSync.mockImplementation((p) => {
          if (p.endsWith('_zip')) return true;
          if (p.endsWith('_complete')) return true;
          return false;
        });
        const res = await request(app).delete(`/del/${VALID_UID}/0`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        // recycle=1: googleBackup(zip) + googleBackup(item0_complete) + googleBackup(item1_complete)
        // recycle=2: googleBackup(zip) + googleBackup(item0_complete) + googleBackup(item1_complete)
        // recycle=3: googleBackup(zip) + googleBackup(item0_complete) + googleBackup(item1_complete)
        expect(mockGoogleBackup).toHaveBeenCalledTimes(9);
      });

      test('backup status 9 playlist without archive: only playlist items', async () => {
        const item = makeItem({
          status: 9, owner: ADMIN._id,
          playList: ['v1.mp4'],
        });
        mockMongo
          .mockResolvedValueOnce([item]) // find
          .mockResolvedValueOnce({}); // update
        // no archive, but _complete exists
        mockExistsSync.mockImplementation((p) => {
          if (p.endsWith('_complete')) return true;
          return false;
        });
        const res = await request(app).delete(`/del/${VALID_UID}/0`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        // 3 retries × 1 item = 3 calls
        expect(mockGoogleBackup).toHaveBeenCalledTimes(3);
        // First call should have '_complete' suffix
        expect(mockGoogleBackup.mock.calls[0][6]).toBe('_complete');
      });

      test('backup status 9 empty playlist → resolves immediately', async () => {
        const item = makeItem({ status: 9, owner: ADMIN._id, playList: [] });
        mockMongo
          .mockResolvedValueOnce([item]) // find
          .mockResolvedValueOnce({}); // update
        const res = await request(app).delete(`/del/${VALID_UID}/0`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        expect(mockGoogleBackup).not.toHaveBeenCalled();
      });

      test('backup status 9 playlist items without _complete → skipped', async () => {
        const item = makeItem({
          status: 9, owner: ADMIN._id,
          playList: ['v1.mp4'],
        });
        mockMongo
          .mockResolvedValueOnce([item]) // find
          .mockResolvedValueOnce({}); // update
        // no _complete files, no archive
        mockExistsSync.mockReturnValue(false);
        const res = await request(app).delete(`/del/${VALID_UID}/0`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        // rest2() called immediately for each item, retries run but no backup
        expect(mockGoogleBackup).not.toHaveBeenCalled();
      });

      test('soft delete sets recycle=1 and updates utime', async () => {
        const item = makeItem({ status: 3, owner: ADMIN._id });
        mockMongo
          .mockResolvedValueOnce([item]) // find
          .mockResolvedValueOnce({}); // update
        await request(app).delete(`/del/${VALID_UID}/0`).set('x-test-user', u(ADMIN));
        const updateCall = mockMongo.mock.calls.find((c) => c[0] === 'update');
        expect(updateCall).toBeTruthy();
        expect(updateCall[3].$set.recycle).toBe(1);
        expect(typeof updateCall[3].$set.utime).toBe('number');
      });

      test('sendWs on soft delete uses item adultonly', async () => {
        const item = makeItem({ status: 7, owner: ADMIN._id, adultonly: 1 });
        mockMongo
          .mockResolvedValueOnce([item]) // find
          .mockResolvedValueOnce({}); // update
        await request(app).delete(`/del/${VALID_UID}/0`).set('x-test-user', u(ADMIN));
        expect(mockSendWs).toHaveBeenCalledWith(expect.objectContaining({ type: 'file' }), 1);
      });
    });
  });

  // =================================================================
  // GET /media/:action(act|del)/:uid/:index?
  // =================================================================
  describe('GET /media/:action/:uid/:index?', () => {
    // --- Validation ---
    test('non-admin → permission denied', async () => {
      const res = await request(app).get(`/media/act/${VALID_UID}`).set('x-test-user', u(REGULAR));
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/permission denied/);
    });

    test('invalid uid → error', async () => {
      const res = await request(app).get('/media/act/BADUID').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/uid is not vaild/);
    });

    test('file not found → error', async () => {
      mockMongo.mockResolvedValueOnce([]);
      const res = await request(app).get(`/media/act/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/cannot find file/);
    });

    test('no mediaType → "not media" error', async () => {
      mockMongo.mockResolvedValueOnce([makeItem({ mediaType: null })]);
      const res = await request(app).get(`/media/act/${VALID_UID}`).set('x-test-user', u(ADMIN));
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/this file is not media/);
    });

    // ---------------------------------------------------------------
    // action=act: single media
    // ---------------------------------------------------------------
    describe('act: single media (mediaType.type exists)', () => {
      test('no key → handleMediaUpload without key', async () => {
        const mt = { type: 'video', fileIndex: 0 };
        mockMongo.mockResolvedValueOnce([makeItem({ mediaType: mt })]);
        mockHandleMediaUpload.mockResolvedValueOnce({});
        const res = await request(app).get(`/media/act/${VALID_UID}`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        expect(mockHandleMediaUpload).toHaveBeenCalledWith(mt, expect.any(String), 'item0001', expect.anything());
        expect(mockHandleMedia).not.toHaveBeenCalled();
      });

      test('has key + not complete + elapsed > NOISE_TIME → handleMediaUpload with key', async () => {
        const oldUtime = Math.floor(Date.now() / 1000) - 8000; // well past NOISE_TIME
        const mt = { type: 'video', fileIndex: 0, key: 'k1', complete: false };
        mockMongo.mockResolvedValueOnce([makeItem({ mediaType: mt, utime: oldUtime })]);
        mockHandleMediaUpload.mockResolvedValueOnce({});
        const res = await request(app).get(`/media/act/${VALID_UID}`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        expect(mockHandleMediaUpload).toHaveBeenCalledWith(mt, expect.any(String), 'item0001', expect.anything(), 'k1');
      });

      test('has key + complete → handleMedia', async () => {
        const mt = { type: 'video', fileIndex: 0, key: 'k1', complete: true };
        mockMongo.mockResolvedValueOnce([makeItem({ mediaType: mt, utime: 99 })]);
        mockHandleMedia.mockResolvedValueOnce({});
        const res = await request(app).get(`/media/act/${VALID_UID}`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        expect(mockHandleMedia).toHaveBeenCalledWith(mt, expect.any(String), 'item0001', 'k1', expect.anything());
      });

      test('has key + not complete + elapsed ≤ NOISE_TIME → handleMedia', async () => {
        const recentUtime = Math.floor(Date.now() / 1000) - 100; // within NOISE_TIME
        const mt = { type: 'video', fileIndex: 0, key: 'k1', complete: false };
        mockMongo.mockResolvedValueOnce([makeItem({ mediaType: mt, utime: recentUtime })]);
        mockHandleMedia.mockResolvedValueOnce({});
        const res = await request(app).get(`/media/act/${VALID_UID}`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        expect(mockHandleMedia).toHaveBeenCalled();
      });

      test('handler error → handleMediaError sends 500', async () => {
        const mt = { type: 'video', fileIndex: 5 };
        mockMongo.mockResolvedValueOnce([makeItem({ mediaType: mt })]);
        mockHandleMediaUpload.mockRejectedValueOnce(new Error('transcode fail'));
        const res = await request(app).get(`/media/act/${VALID_UID}`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('media processing failed');
        expect(mockHandleMediaError).toHaveBeenCalled();
        expect(mockErrorMedia).toHaveBeenCalled();
      });
    });

    // ---------------------------------------------------------------
    // action=act: playlist with index
    // ---------------------------------------------------------------
    describe('act: playlist with specific index', () => {
      const playlistMediaType = {
        0: { fileIndex: 0, key: null },
        1: { fileIndex: 1, key: 'k2', complete: true },
      };

      test('index=v finds first video', async () => {
        mockMongo.mockResolvedValueOnce([makeItem({
          mediaType: playlistMediaType,
          playList: ['doc.pdf', 'movie.mp4'],
        })]);
        mockIsVideo.mockImplementation((name) => name.endsWith('.mp4'));
        mockExistsSync.mockReturnValue(true); // _complete exists
        mockHandleMedia.mockResolvedValueOnce({});
        const res = await request(app).get(`/media/act/${VALID_UID}/v`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        // isVideo('doc.pdf')=false, isVideo('movie.mp4')=true → index becomes '1'
        expect(mockIsVideo).toHaveBeenCalledWith('doc.pdf');
        expect(mockIsVideo).toHaveBeenCalledWith('movie.mp4');
      });

      test('index=v no video found → uses original "v" which will fail', async () => {
        mockMongo.mockResolvedValueOnce([makeItem({
          mediaType: playlistMediaType,
          playList: ['doc.pdf', 'text.txt'],
        })]);
        mockIsVideo.mockReturnValue(false);
        // mediaType['v'] is undefined → will throw accessing ['fileIndex']
        const res = await request(app).get(`/media/act/${VALID_UID}/v`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(500);
      });

      test('numeric index without _complete → need complete first', async () => {
        mockMongo.mockResolvedValueOnce([makeItem({
          mediaType: { 0: { fileIndex: 0 } },
          playList: ['v.mp4'],
        })]);
        mockExistsSync.mockReturnValue(false);
        const res = await request(app).get(`/media/act/${VALID_UID}/0`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(400);
        expect(res.text).toMatch(/need complete first/);
      });

      test('numeric index with _complete but no matching fileIndex → cannot find media', async () => {
        mockMongo.mockResolvedValueOnce([makeItem({
          mediaType: { 0: { fileIndex: 5 } }, // fileIndex=5, but index=0 → Number(0) !== 5
          playList: ['v.mp4'],
        })]);
        mockExistsSync.mockReturnValue(true); // _complete exists
        const res = await request(app).get(`/media/act/${VALID_UID}/0`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(400);
        expect(res.text).toMatch(/cannot find media/);
      });

      test('valid numeric index → handler invoked', async () => {
        mockMongo.mockResolvedValueOnce([makeItem({
          mediaType: { 0: { fileIndex: 0 } },
          playList: ['v.mp4'],
        })]);
        mockExistsSync.mockReturnValue(true);
        mockHandleMediaUpload.mockResolvedValueOnce({});
        const res = await request(app).get(`/media/act/${VALID_UID}/0`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        expect(mockHandleMediaUpload).toHaveBeenCalled();
      });
    });

    // ---------------------------------------------------------------
    // action=act: playlist without index (process all completed)
    // ---------------------------------------------------------------
    describe('act: playlist no index (all completed)', () => {
      test('none completed → need complete first', async () => {
        mockMongo.mockResolvedValueOnce([makeItem({
          mediaType: { 0: { fileIndex: 0 }, 1: { fileIndex: 1 } },
          playList: ['a.mp4', 'b.mp4'],
        })]);
        mockExistsSync.mockReturnValue(false);
        const res = await request(app).get(`/media/act/${VALID_UID}`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(400);
        expect(res.text).toMatch(/need complete first/);
      });

      test('all completed → processes all in parallel', async () => {
        mockMongo.mockResolvedValueOnce([makeItem({
          mediaType: { 0: { fileIndex: 0 }, 1: { fileIndex: 1 } },
          playList: ['a.mp4', 'b.mp4'],
        })]);
        mockExistsSync.mockReturnValue(true);
        mockHandleMediaUpload.mockResolvedValue({});
        const res = await request(app).get(`/media/act/${VALID_UID}`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        expect(mockHandleMediaUpload).toHaveBeenCalledTimes(2);
      });

      test('some completed → only completed ones processed', async () => {
        mockMongo.mockResolvedValueOnce([makeItem({
          mediaType: { 0: { fileIndex: 0 }, 1: { fileIndex: 1 } },
          playList: ['a.mp4', 'b.mp4'],
        })]);
        mockExistsSync.mockImplementation((p) => p.endsWith('0_complete'));
        mockHandleMediaUpload.mockResolvedValue({});
        const res = await request(app).get(`/media/act/${VALID_UID}`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        expect(mockHandleMediaUpload).toHaveBeenCalledTimes(1);
      });

      test('individual errors → handleMediaError sends 500', async () => {
        mockMongo.mockResolvedValueOnce([makeItem({
          mediaType: { 0: { fileIndex: 0 } },
          playList: ['a.mp4'],
        })]);
        mockExistsSync.mockReturnValue(true);
        mockHandleMediaUpload.mockRejectedValueOnce(new Error('oops'));
        const res = await request(app).get(`/media/act/${VALID_UID}`).set('x-test-user', u(ADMIN));
        // Promise.all rejects, handleMediaError catches and sends 500
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('media processing failed');
        expect(mockHandleMediaError).toHaveBeenCalled();
      });
    });

    // ---------------------------------------------------------------
    // action=del: cancel media
    // ---------------------------------------------------------------
    describe('del: cancel media', () => {
      test('single media, status=1 → completeMedia with status 0', async () => {
        const mt = { type: 'video', fileIndex: 3 };
        mockMongo.mockResolvedValueOnce([makeItem({ mediaType: mt, status: 1 })]);
        mockCompleteMedia.mockResolvedValueOnce({});
        const res = await request(app).get(`/media/del/${VALID_UID}`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        expect(mockCompleteMedia).toHaveBeenCalledWith('item0001', 0, 3);
      });

      test('single media, status≠1 → completeMedia with current status', async () => {
        const mt = { type: 'video', fileIndex: 3 };
        mockMongo.mockResolvedValueOnce([makeItem({ mediaType: mt, status: 5 })]);
        mockCompleteMedia.mockResolvedValueOnce({});
        const res = await request(app).get(`/media/del/${VALID_UID}`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        expect(mockCompleteMedia).toHaveBeenCalledWith('item0001', 5, 3);
      });

      test('playlist, empty mediaType → $unset mediaType + sendWs', async () => {
        mockMongo
          .mockResolvedValueOnce([makeItem({ mediaType: {}, status: 9, adultonly: 1 })]) // find
          .mockResolvedValueOnce({}); // update $unset
        const res = await request(app).get(`/media/del/${VALID_UID}`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        expect(mockMongo).toHaveBeenCalledWith('update', 'storage',
          expect.anything(),
          expect.objectContaining({ $unset: { mediaType: '' } }),
        );
        expect(mockSendWs).toHaveBeenCalledWith(expect.objectContaining({ type: 'file' }), 1);
      });

      test('playlist, items but none complete → need complete first', async () => {
        const mt = { 0: { fileIndex: 0 }, 1: { fileIndex: 1 } };
        mockMongo.mockResolvedValueOnce([makeItem({ mediaType: mt, status: 9 })]);
        mockExistsSync.mockReturnValue(false);
        const res = await request(app).get(`/media/del/${VALID_UID}`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(400);
        expect(res.text).toMatch(/need complete first/);
      });

      test('playlist, completed items → completeMedia for each with status 0', async () => {
        const mt = { 0: { fileIndex: 0 }, 1: { fileIndex: 1 } };
        mockMongo.mockResolvedValueOnce([makeItem({ mediaType: mt, status: 9 })]);
        mockExistsSync.mockReturnValue(true);
        mockCompleteMedia.mockResolvedValue({});
        const res = await request(app).get(`/media/del/${VALID_UID}`).set('x-test-user', u(ADMIN));
        expect(res.status).toBe(200);
        expect(mockCompleteMedia).toHaveBeenCalledTimes(2);
        expect(mockCompleteMedia).toHaveBeenCalledWith('item0001', 0, 0);
        expect(mockCompleteMedia).toHaveBeenCalledWith('item0001', 0, 1);
      });
    });
  });

  // =================================================================
  // GET /feedback
  // =================================================================
  describe('GET /feedback', () => {
    const feedbackItem = (ov = {}) => ({
      _id: 'fb01', name: 'pic.jpg', tags: ['image'], untag: 1,
      owner: ADMIN._id, time: 10, height: 720, status: 3,
      first: 0, adultonly: 0, ...ov,
    });

    test('no items for user, not admin → empty feedbacks', async () => {
      mockMongo.mockResolvedValueOnce([]); // find user items → empty
      const res = await request(app).get('/feedback').set('x-test-user', u(REGULAR));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ feedbacks: [] });
    });

    test('no items for user, IS admin → fallback to all untagged items', async () => {
      mockMongo
        .mockResolvedValueOnce([]) // user's items → empty
        .mockResolvedValueOnce([]); // admin fallback → also empty
      const res = await request(app).get('/feedback').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ feedbacks: [] });
      // second Mongo find should NOT have owner filter
      expect(mockMongo.mock.calls[1][2]).toEqual({ untag: 1 });
    });

    test('user has items → processes each sequentially', async () => {
      const items = [feedbackItem({ _id: 'f1' }), feedbackItem({ _id: 'f2' })];
      mockMongo.mockResolvedValueOnce(items);
      mockHandleTag
        .mockResolvedValueOnce([null, { opt: ['sug1'] }, null])
        .mockResolvedValueOnce([null, { opt: [] }, null]);
      const res = await request(app).get('/feedback').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(200);
      expect(res.body.feedbacks).toHaveLength(2);
      expect(mockHandleTag).toHaveBeenCalledTimes(2);
    });

    test('admin response: select=tags, other=[]', async () => {
      const item = feedbackItem({ tags: ['t1', 't2'] });
      mockMongo.mockResolvedValueOnce([item]);
      mockHandleTag.mockResolvedValueOnce([null, { opt: [] }, null]);
      const res = await request(app).get('/feedback').set('x-test-user', u(ADMIN));
      const fb = res.body.feedbacks[0];
      expect(fb.select).toContain('t1');
      expect(fb.other).toEqual([]);
    });

    test('non-admin response: select=personal, other=remaining tags', async () => {
      const userId = REGULAR._id;
      const item = feedbackItem({
        tags: ['t1', 't2'],
        [userId]: { t1: 1 }, // user selected t1
      });
      mockMongo.mockResolvedValueOnce([item]);
      mockHandleTag.mockResolvedValueOnce([null, { opt: [] }, null]);
      const res = await request(app).get('/feedback').set('x-test-user', u(REGULAR));
      const fb = res.body.feedbacks[0];
      expect(fb.select).toEqual({ t1: 1 });
      expect(fb.other).not.toContain('t1'); // removed from tags
      expect(fb.other).toContain('t2');
    });

    test('first=1 → "first item" added to tags (select for admin)', async () => {
      const item = feedbackItem({ first: 1, tags: ['t1'] });
      mockMongo.mockResolvedValueOnce([item]);
      mockHandleTag.mockResolvedValueOnce([null, { opt: [] }, null]);
      const res = await request(app).get('/feedback').set('x-test-user', u(ADMIN));
      expect(res.body.feedbacks[0].select).toContain('first item');
    });

    test('first=0 → "first item" goes to option', async () => {
      const item = feedbackItem({ first: 0, tags: ['t1'] });
      mockMongo.mockResolvedValueOnce([item]);
      mockHandleTag.mockResolvedValueOnce([null, { opt: [] }, null]);
      const res = await request(app).get('/feedback').set('x-test-user', u(ADMIN));
      expect(res.body.feedbacks[0].option).toContain('first item');
    });

    test('adultonly=1 → "18+" added to tags', async () => {
      const item = feedbackItem({ adultonly: 1, tags: ['t1'] });
      mockMongo.mockResolvedValueOnce([item]);
      mockHandleTag.mockResolvedValueOnce([null, { opt: [] }, null]);
      const res = await request(app).get('/feedback').set('x-test-user', u(ADMIN));
      expect(res.body.feedbacks[0].select).toContain('18+');
    });

    test('adultonly=0, admin level ≤2 → "18+" goes to option', async () => {
      const item = feedbackItem({ adultonly: 0, tags: ['t1'] });
      mockMongo.mockResolvedValueOnce([item]);
      mockHandleTag.mockResolvedValueOnce([null, { opt: [] }, null]);
      const res = await request(app).get('/feedback').set('x-test-user', u(CADMIN));
      expect(res.body.feedbacks[0].option).toContain('18+');
    });

    test('adultonly=0, non-admin → "18+" NOT in option', async () => {
      const item = feedbackItem({ adultonly: 0, tags: ['t1'] });
      mockMongo.mockResolvedValueOnce([item]);
      mockHandleTag.mockResolvedValueOnce([null, { opt: [] }, null]);
      const res = await request(app).get('/feedback').set('x-test-user', u(REGULAR));
      expect(res.body.feedbacks[0].option).not.toContain('18+');
    });

    test('mediaTag suggestions: new tags added to option, duplicates excluded', async () => {
      const item = feedbackItem({ tags: ['existing'] });
      mockMongo.mockResolvedValueOnce([item]);
      mockHandleTag.mockResolvedValueOnce([null, { opt: ['existing', 'newone'] }, null]);
      const res = await request(app).get('/feedback').set('x-test-user', u(ADMIN));
      // 'existing' already in tags → excluded; 'newone' is new → added
      // option via supplyTag mock returns the temp_tag array
      const opt = res.body.feedbacks[0].option;
      expect(opt).toContain('newone');
      expect(opt).not.toContain('existing');
    });

    test('handleTag error propagates as 500', async () => {
      const item = feedbackItem();
      mockMongo.mockResolvedValueOnce([item]);
      mockHandleTag.mockRejectedValueOnce(new Error('tag fail'));
      const res = await request(app).get('/feedback').set('x-test-user', u(ADMIN));
      expect(res.status).toBe(500);
    });
  });
});
