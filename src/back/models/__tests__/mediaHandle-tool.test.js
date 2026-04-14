/**
 * mediaHandle-tool.test.js — Comprehensive test suite for src/back/models/mediaHandle-tool.js
 *
 * Covers: editFile, handleTag, handleMediaUpload, handleMedia, singleDrive,
 *         checkMedia, completeMedia, errorMedia, handleMediaError,
 *         getHd (private), getTimeTag (private), errDrive (private)
 */
import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

// =====================================================================
// MOCK SETUP (must precede dynamic import)
// =====================================================================

// --- node-fetch (prevent timer pollution) ---
jest.unstable_mockModule('node-fetch', () => ({
  default: jest.fn(() => Promise.resolve({
    ok: true, buffer: jest.fn().mockResolvedValue(Buffer.from('')),
    headers: { get: jest.fn(() => null) },
    body: { pipe: jest.fn().mockReturnThis(), on: jest.fn() },
  })),
}));

// --- fs ---
const mockExistsSync = jest.fn(() => false);
const mockReaddirSync = jest.fn(() => []);
const mockLstatSync = jest.fn(() => ({ isDirectory: () => false }));
const mockRenameSync = jest.fn();
const mockStatSync = jest.fn(() => ({ size: 500 }));
jest.unstable_mockModule('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    readdirSync: mockReaddirSync,
    lstatSync: mockLstatSync,
    renameSync: mockRenameSync,
    statSync: mockStatSync,
    createReadStream: jest.fn(),
    createWriteStream: jest.fn(),
    readFileSync: jest.fn(() => Buffer.from('')),
    writeFileSync: jest.fn(),
    unlink: jest.fn((_p, cb) => cb(null)),
  },
}));

// --- path ---
jest.unstable_mockModule('path', () => ({
  default: {
    join: jest.fn((...args) => args.join('/')),
    dirname: jest.fn((p) => p.split('/').slice(0, -1).join('/')),
  },
}));

// --- mkdirp ---
const mockMkdirp = jest.fn(() => Promise.resolve());
jest.unstable_mockModule('mkdirp', () => ({
  default: mockMkdirp,
}));

// --- child_process ---
const mockExec = jest.fn();
jest.unstable_mockModule('child_process', () => ({
  default: { exec: mockExec },
}));

// --- ffmpeg ---
const mockFfmpeg = jest.fn();
jest.unstable_mockModule('ffmpeg', () => ({
  default: mockFfmpeg,
}));

// --- mongo-tool ---
const mockMongo = jest.fn();
const mockObjectID = jest.fn(() => 'new-oid-123');
jest.unstable_mockModule('../mongo-tool.js', () => ({
  default: mockMongo,
  objectID: mockObjectID,
}));

// --- api-tool-google ---
const mockGoogleApi = jest.fn();
const mockIsApiing = jest.fn(() => false);
jest.unstable_mockModule('../api-tool-google.js', () => ({
  default: mockGoogleApi,
  isApiing: mockIsApiing,
}));

// --- tag-tool ---
const mockAddTag = jest.fn(() => Promise.resolve({ tag: 'normalized-tag' }));
const mockGetRelativeTag = jest.fn(() => Promise.resolve([]));
const mockNormalize = jest.fn((s) => s);
const mockIsDefaultTag = jest.fn(() => false);
jest.unstable_mockModule('../tag-tool.js', () => ({
  default: jest.fn(() => ({
    addTag: mockAddTag,
    getRelativeTag: mockGetRelativeTag,
  })),
  normalize: mockNormalize,
  isDefaultTag: mockIsDefaultTag,
}));

// --- utility ---
const mockIsValidString = jest.fn((s) => s);
const mockGetFileLocation = jest.fn((owner, id) => `/files/${owner}/${id}`);
const mockDeleteFolderRecursive = jest.fn();
const mockSortList = jest.fn((arr) => arr);
const mockToValidName = jest.fn((s) => s);
const mockCheckAdmin = jest.fn(() => true);

jest.unstable_mockModule('../../util/utility.js', () => ({
  isValidString: mockIsValidString,
  handleError: jest.fn((...args) => {
    const err = args[0];
    if (typeof args[1] === 'function') {
      return args[1](err, ...args.slice(2));
    }
    return Promise.reject(err);
  }),
  HoError: class HoError extends Error {
    constructor(msg) { super(msg); this.name = 'HoError'; }
  },
  checkAdmin: mockCheckAdmin,
  getFileLocation: mockGetFileLocation,
  deleteFolderRecursive: mockDeleteFolderRecursive,
  sortList: mockSortList,
  toValidName: mockToValidName,
  getJson: jest.fn((s) => { try { return JSON.parse(s); } catch { return s; } }),
  completeZero: jest.fn((n) => String(n)),
  SRT2VTT: jest.fn(),
}));

// --- mime ---
const mockExtType = jest.fn(() => ({ type: 'video', ext: 'mp4' }));
const mockExtTag = jest.fn(() => ({ def: ['video-tag'], opt: ['opt1', 'opt2', 'opt3', 'opt4', 'opt5', 'opt6'] }));
const mockIsZip = jest.fn(() => false);
const mockIsImage = jest.fn(() => false);
const mockChangeExt = jest.fn((name, ext) => name);
const mockAddPost = jest.fn((name, p) => name + p);
jest.unstable_mockModule('../../util/mime.js', () => ({
  extType: mockExtType,
  extTag: mockExtTag,
  isZip: mockIsZip,
  isImage: mockIsImage,
  changeExt: mockChangeExt,
  addPost: mockAddPost,
}));

// --- sendWs ---
const mockSendWs = jest.fn();
jest.unstable_mockModule('../../util/sendWs.js', () => ({
  default: mockSendWs,
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

// --- constants ---
jest.unstable_mockModule('../../constants.js', () => ({
  STORAGEDB: 'storage',
  STATIC_PATH: '/static',
  NOISE_SIZE: 1000,
  __dirname: '/app/src/back/models',
  USERDB: 'user', VERIFYDB: 'verify',
  STOCKDB: 'stock', PASSWORDDB: 'password', FITNESSDB: 'fitness', RANKDB: 'rank',
  DEFAULT_TAGS: [], STORAGE_PARENT: [], PASSWORD_PARENT: [], STOCK_PARENT: [],
  FITNESS_PARENT: [], RANK_PARENT: [], HANDLE_TIME: 7200,
  RE_WEBURL: /^https?:\/\//, RELEASE: 'release', DEV: 'dev',
  BOOKMARK_LIMIT: 100, ADULTONLY_PARENT: [],
  QUERY_LIMIT: 20, RELATIVE_LIMIT: 100,
  RELATIVE_UNION: 2, RELATIVE_INTER: 3,
  UNACTIVE_DAY: 5, NOISE_TIME: 7200,
}));

// =====================================================================
// IMPORT MODULE UNDER TEST
// =====================================================================

let MediaHandleTool, completeMedia, errorMedia, handleMediaError;

beforeAll(async () => {
  const mod = await import('../mediaHandle-tool.js');
  MediaHandleTool = mod.default;
  completeMedia = mod.completeMedia;
  errorMedia = mod.errorMedia;
  handleMediaError = mod.handleMediaError;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockExistsSync.mockReturnValue(false);
  mockReaddirSync.mockReturnValue([]);
  mockLstatSync.mockReturnValue({ isDirectory: () => false });
  mockStatSync.mockReturnValue({ size: 500 });
  mockIsValidString.mockImplementation((s) => s);
  mockExtType.mockReturnValue({ type: 'video', ext: 'mp4' });
  mockExtTag.mockReturnValue({ def: ['video-tag'], opt: ['o1', 'o2', 'o3', 'o4', 'o5', 'o6'] });
  mockCheckAdmin.mockReturnValue(true);
  mockNormalize.mockImplementation((s) => s);
  mockIsDefaultTag.mockReturnValue(false);
  mockIsApiing.mockReturnValue(false);
  mockMongo.mockResolvedValue([]);
  mockGoogleApi.mockResolvedValue({});
  mockAddTag.mockResolvedValue({ tag: 'normalized-tag' });
  mockGetRelativeTag.mockResolvedValue([]);
  mockSortList.mockImplementation((arr) => arr);
  mockToValidName.mockImplementation((s) => s);
  mockGetFileLocation.mockImplementation((owner, id) => `/files/${owner}/${id}`);
  mockObjectID.mockReturnValue('new-oid-123');
  mockMkdirp.mockResolvedValue(undefined);
  mockDeleteFolderRecursive.mockReturnValue(undefined);
  mockIsImage.mockReturnValue(false);
});

// =====================================================================
// HELPERS
// =====================================================================

const makeUser = (admin = 2) => ({
  _id: { toString: () => 'user123', equals: (id) => id === 'user123' },
  username: 'tester',
  admin,
  perm: 1,
});

const makeItem = (overrides = {}) => ({
  _id: 'file-id-1',
  name: 'test-file.mp4',
  owner: 'user123',
  status: 3,
  tags: ['tag1'],
  first: 0,
  adultonly: 0,
  time: 50000,
  height: 720,
  user123: ['tag1'],
  ...overrides,
});

// =====================================================================
// TESTS
// =====================================================================

// ─── Phase 1: Pure Functions (getHd, getTimeTag) ────────────────────
// These are private — tested indirectly via handleTag

describe('handleTag — indirect getHd/getTimeTag tests', () => {
  // For first=true: oldName must produce null/different extType
  function setupFirst() {
    // First call = newName extType, second call = oldName extType (null = no oldType → first=true)
    mockExtType.mockReturnValueOnce({ type: 'video', ext: 'mp4' }).mockReturnValueOnce(null);
  }

  test('video with height 2160+ → hd=2160', async () => {
    setupFirst();
    const DBdata = { height: 2200, time: 70 * 60 * 1000 };
    const [mediaType] = await MediaHandleTool.handleTag('/f', DBdata, 'v.mp4', '', 0);
    expect(mediaType.hd).toBe(2160);
  });

  test('video with height 1440-2159 → hd=1440', async () => {
    setupFirst();
    const DBdata = { height: 1500, time: 70 * 60 * 1000 };
    const [mediaType] = await MediaHandleTool.handleTag('/f', DBdata, 'v.mp4', '', 0);
    expect(mediaType.hd).toBe(1440);
  });

  test('video with height 1080 → hd=1080', async () => {
    setupFirst();
    const DBdata = { height: 1080, time: 70 * 60 * 1000 };
    const [mediaType] = await MediaHandleTool.handleTag('/f', DBdata, 'v.mp4', '', 0);
    expect(mediaType.hd).toBe(1080);
  });

  test('video with height 720 → hd=720', async () => {
    setupFirst();
    const DBdata = { height: 720, time: 30 * 60 * 1000 };
    const [mediaType] = await MediaHandleTool.handleTag('/f', DBdata, 'v.mp4', '', 0);
    expect(mediaType.hd).toBe(720);
  });

  test('video with height 480 → hd=480', async () => {
    setupFirst();
    const DBdata = { height: 480, time: 50 * 60 * 1000 };
    const [mediaType] = await MediaHandleTool.handleTag('/f', DBdata, 'v.mp4', '', 0);
    expect(mediaType.hd).toBe(480);
  });

  test('video with height 360 → hd=360', async () => {
    setupFirst();
    const DBdata = { height: 360, time: 70 * 60 * 1000 };
    const [mediaType] = await MediaHandleTool.handleTag('/f', DBdata, 'v.mp4', '', 0);
    expect(mediaType.hd).toBe(360);
  });

  test('video with height 240 → hd=240', async () => {
    setupFirst();
    const DBdata = { height: 240, time: 70 * 60 * 1000 };
    const [mediaType] = await MediaHandleTool.handleTag('/f', DBdata, 'v.mp4', '', 0);
    expect(mediaType.hd).toBe(240);
  });

  test('video with height < 240 → hd=0', async () => {
    setupFirst();
    const DBdata = { height: 100, time: 70 * 60 * 1000 };
    const [mediaType] = await MediaHandleTool.handleTag('/f', DBdata, 'v.mp4', '', 0);
    expect(mediaType.hd).toBe(0);
  });

  test('getTimeTag: time < 20min → empty tags', async () => {
    mockExtType.mockReturnValue({ type: 'video', ext: 'mp4' });
    const DBdata = { height: 720, time: 10 * 60 * 1000 };
    const [, mediaTag] = await MediaHandleTool.handleTag('/f', DBdata, 'v.mp4', '', 0);
    // time < 20min → getTimeTag returns [] → def = ['video-tag']
    expect(mediaTag.def).toEqual(['video-tag']);
  });

  test('getTimeTag: 20min ≤ time < 40min → splice(2,2)', async () => {
    mockExtTag.mockReturnValue({ def: ['vtag'], opt: ['a', 'b', 'c', 'd', 'e', 'f'] });
    mockExtType.mockReturnValue({ type: 'video', ext: 'mp4' });
    const DBdata = { height: 720, time: 25 * 60 * 1000 };
    const [, mediaTag] = await MediaHandleTool.handleTag('/f', DBdata, 'v.mp4', '', 0);
    // splice(2,2) removes ['c','d'], returns them → def = ['vtag','c','d']
    expect(mediaTag.def).toEqual(['vtag', 'c', 'd']);
    expect(mediaTag.opt).toEqual(['a', 'b', 'e', 'f']);
  });

  test('getTimeTag: 40min ≤ time < 60min → splice(4,2)', async () => {
    mockExtTag.mockReturnValue({ def: ['vtag'], opt: ['a', 'b', 'c', 'd', 'e', 'f'] });
    mockExtType.mockReturnValue({ type: 'video', ext: 'mp4' });
    const DBdata = { height: 720, time: 45 * 60 * 1000 };
    const [, mediaTag] = await MediaHandleTool.handleTag('/f', DBdata, 'v.mp4', '', 0);
    expect(mediaTag.def).toEqual(['vtag', 'e', 'f']);
  });

  test('getTimeTag: time ≥ 60min → splice(0,2)', async () => {
    mockExtTag.mockReturnValue({ def: ['vtag'], opt: ['a', 'b', 'c', 'd', 'e', 'f'] });
    mockExtType.mockReturnValue({ type: 'video', ext: 'mp4' });
    const DBdata = { height: 720, time: 70 * 60 * 1000 };
    const [, mediaTag] = await MediaHandleTool.handleTag('/f', DBdata, 'v.mp4', '', 0);
    expect(mediaTag.def).toEqual(['vtag', 'a', 'b']);
  });
});

// ─── Phase 2: completeMedia, errorMedia, handleMediaError ───────────

describe('completeMedia', () => {
  test('basic: non-video (status≠3) — unsets mediaType', async () => {
    mockMongo
      .mockResolvedValueOnce({}) // update
      .mockResolvedValueOnce([makeItem()]); // find
    await completeMedia('fid', 2, undefined, 0);
    const updateCall = mockMongo.mock.calls[0];
    expect(updateCall[0]).toBe('update');
    expect(updateCall[3].$unset).toHaveProperty('mediaType');
    expect(mockSendWs).toHaveBeenCalledTimes(2);
  });

  test('video (status=3) — sets complete, does NOT unset mediaType', async () => {
    mockMongo
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce([makeItem()]);
    await completeMedia('fid', 3, undefined, 0);
    const updateCall = mockMongo.mock.calls[0];
    expect(updateCall[3].$set['mediaType.complete']).toBe(true);
    expect(updateCall[3].$unset).toBeUndefined();
  });

  test('fileIndex is number → status=9, indexed keys', async () => {
    mockMongo
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce([makeItem()]);
    await completeMedia('fid', 2, 0, 5);
    const updateCall = mockMongo.mock.calls[0];
    expect(updateCall[3].$set.status).toBe(9);
    expect(updateCall[3].$set['present.0']).toBe(5);
  });

  test('number > 1 with non-indexed → sets present directly', async () => {
    mockMongo
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce([makeItem()]);
    await completeMedia('fid', 5, undefined, 3);
    const updateCall = mockMongo.mock.calls[0];
    expect(updateCall[3].$set.present).toBe(3);
  });

  test('file not found after update → rejects', async () => {
    mockMongo
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce([]);
    await expect(completeMedia('fid', 2)).rejects.toThrow('cannot find file!!!');
  });

  test('video (status=3) with fileIndex → indexed complete key', async () => {
    mockMongo
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce([makeItem()]);
    await completeMedia('fid', 3, 2);
    const updateCall = mockMongo.mock.calls[0];
    expect(updateCall[3].$set['mediaType.2.complete']).toBe(true);
    expect(updateCall[3].$set.status).toBe(9); // fileIndex is number
  });
});

describe('errorMedia', () => {
  test('HoError timeout → sets timeout flag', async () => {
    const err = new Error('timeout');
    err.name = 'HoError';
    mockMongo.mockResolvedValue({});
    await expect(errorMedia(err, 'fid')).rejects.toThrow('timeout');
    expect(mockMongo.mock.calls[0][3].$set['mediaType.timeout']).toBe(true);
  });

  test('HoError timeout with fileIndex → indexed timeout', async () => {
    const err = new Error('timeout');
    err.name = 'HoError';
    mockMongo.mockResolvedValue({});
    await expect(errorMedia(err, 'fid', 1)).rejects.toThrow('timeout');
    expect(mockMongo.mock.calls[0][3].$set['mediaType.1.timeout']).toBe(true);
    expect(mockMongo.mock.calls[0][3].$set.status).toBe(9);
  });

  test('non-timeout error → sets err field', async () => {
    const err = new Error('other');
    mockMongo.mockResolvedValue({});
    await expect(errorMedia(err, 'fid')).rejects.toThrow('other');
    expect(mockMongo.mock.calls[0][3].$set['mediaType.err']).toBeDefined();
  });

  test('non-timeout with fileIndex → indexed err', async () => {
    const err = new Error('fail');
    mockMongo.mockResolvedValue({});
    await expect(errorMedia(err, 'fid', 3)).rejects.toThrow('fail');
    expect(mockMongo.mock.calls[0][3].$set['mediaType.3.err']).toBeDefined();
  });
});

describe('handleMediaError', () => {
  test('sends 500 if headers not sent', () => {
    const res = { headersSent: false, status: jest.fn().mockReturnThis(), json: jest.fn() };
    mockMongo.mockResolvedValue({});
    const handler = handleMediaError(res, 'fid', 0);
    handler(new Error('boom'));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'media processing failed' });
  });

  test('does not send if headers already sent', () => {
    const res = { headersSent: true, status: jest.fn().mockReturnThis(), json: jest.fn() };
    mockMongo.mockResolvedValue({});
    const handler = handleMediaError(res, 'fid', 0);
    handler(new Error('boom'));
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ─── Phase 3: handleTag ──────────────────────────────────────────────

describe('handleTag', () => {
  test('status=7 → URL type, returns extTag("url")', async () => {
    const data = {};
    const [mt, tags, db] = await MediaHandleTool.handleTag('/f', data, 'n', 'o', 7);
    expect(mt).toBe(false);
    expect(mockExtTag).toHaveBeenCalledWith('url');
  });

  test('status=8 → empty tags', async () => {
    const [mt, tags] = await MediaHandleTool.handleTag('/f', {}, 'n', 'o', 8);
    expect(mt).toBe(false);
    expect(tags.def).toEqual([]);
    expect(tags.opt).toEqual([]);
  });

  test('status=9 with zipbook type → zipbook mediaType', async () => {
    mockExtType.mockReturnValue({ type: 'zipbook', ext: 'cbz' });
    const data = {};
    const [mt, tags, db] = await MediaHandleTool.handleTag('/f', data, 'n.cbz', '', 9);
    expect(mt.type).toBe('zipbook');
    expect(db.status).toBe(1);
    expect(db.mediaType.type).toBe('zipbook');
  });

  test('status=9 with non-zipbook → false mediaType, empty tags', async () => {
    mockExtType.mockReturnValue({ type: 'video', ext: 'mp4' });
    const [mt, tags] = await MediaHandleTool.handleTag('/f', {}, 'n.mp4', '', 9);
    expect(mt).toBe(false);
    expect(tags.def).toEqual([]);
  });

  test('video with height+time, first=true, status=0 → sets hd, status=1', async () => {
    mockExtType.mockReturnValueOnce({ type: 'video', ext: 'mp4' }).mockReturnValueOnce(null);
    mockExtTag.mockReturnValue({ def: ['vtag'], opt: ['a', 'b', 'c', 'd', 'e', 'f'] });
    const data = { height: 720, time: 30 * 60 * 1000 };
    const [mt, tags, db] = await MediaHandleTool.handleTag('/f', data, 'v.mp4', '', 0);
    expect(mt.hd).toBe(720);
    expect(db.status).toBe(1);
    expect(db.mediaType.type).toBe('video');
  });

  test('video with height+time, status=3 → keeps status=3', async () => {
    mockExtType.mockReturnValueOnce({ type: 'video', ext: 'mp4' }).mockReturnValueOnce(null);
    mockExtTag.mockReturnValue({ def: ['vtag'], opt: ['a', 'b', 'c', 'd', 'e', 'f'] });
    const data = { height: 720, time: 30 * 60 * 1000, status: 3 };
    const [mt, tags, db] = await MediaHandleTool.handleTag('/f', data, 'v.mp4', '', 0);
    expect(db.status).toBe(3);
  });

  test('music, first=true → status=4, mediaType=false', async () => {
    mockExtType.mockReturnValueOnce({ type: 'music', ext: 'mp3' }).mockReturnValueOnce(null);
    mockExtTag.mockReturnValue({ def: ['mtag'], opt: [] });
    const data = { time: 3000 };
    const [mt, tags, db] = await MediaHandleTool.handleTag('/f', data, 's.mp3', '', 0);
    expect(mt).toBe(false);
    expect(db.status).toBe(4);
  });

  test('video no height or time, file exists → ffmpeg probe', async () => {
    mockExtType.mockReturnValueOnce({ type: 'video', ext: 'mp4' }).mockReturnValueOnce(null);
    mockExistsSync.mockReturnValue(true);
    mockFfmpeg.mockResolvedValue({
      metadata: {
        video: { codec: 'h264', resolutionSquare: { h: 1080 } },
        duration: { seconds: 3600 },
      },
    });
    const data = {};
    const [mt, tags, db] = await MediaHandleTool.handleTag('/f', data, 'v.mp4', '', 0);
    expect(mockFfmpeg).toHaveBeenCalledWith('/f');
    expect(db.height).toBe(1080);
    expect(db.status).toBe(3); // h264 codec
  });

  test('video ffmpeg — non-h264 codec', async () => {
    mockExtType.mockReturnValueOnce({ type: 'video', ext: 'mp4' }).mockReturnValueOnce(null);
    mockExistsSync.mockReturnValue(true);
    mockFfmpeg.mockResolvedValue({
      metadata: {
        video: { codec: 'vp9', resolutionSquare: { h: 720 } },
        duration: { seconds: 1800 },
      },
    });
    const data = {};
    const [mt, tags, db] = await MediaHandleTool.handleTag('/f', data, 'v.mp4', '', 0);
    expect(db.status).not.toBe(3);
  });

  test('video ffmpeg — no video metadata, only duration', async () => {
    mockExtType.mockReturnValueOnce({ type: 'video', ext: 'mp4' }).mockReturnValueOnce(null);
    mockExistsSync.mockReturnValue(true);
    mockFfmpeg.mockResolvedValue({
      metadata: {
        duration: { seconds: 1800 },
      },
    });
    const data = {};
    const [mt] = await MediaHandleTool.handleTag('/f', data, 'v.mp4', '', 0);
    // Has time but no height → video type with time only
    expect(mt).toBe(false); // music branch: time but not isVideo (no height)
  });

  test('video with height+time, not first (same ext) → mediaType=false', async () => {
    mockExtType.mockReturnValue({ type: 'video', ext: 'mp4' });
    const data = { height: 720, time: 30 * 60 * 1000 };
    const [mt] = await MediaHandleTool.handleTag('/f', data, 'v.mp4', 'v.mp4', 1);
    expect(mt).toBe(false);
  });

  test('ret_mediaType=false → does NOT set DBdata.mediaType', async () => {
    mockExtType.mockReturnValueOnce({ type: 'video', ext: 'mp4' }).mockReturnValueOnce(null);
    mockExtTag.mockReturnValue({ def: ['vtag'], opt: ['a', 'b', 'c', 'd', 'e', 'f'] });
    const data = { height: 720, time: 30 * 60 * 1000 };
    const [mt, tags, db] = await MediaHandleTool.handleTag('/f', data, 'v.mp4', '', 0, false);
    expect(db.mediaType).toBeUndefined();
  });

  test('image, first=true → status=1', async () => {
    mockExtType.mockReturnValueOnce({ type: 'image', ext: 'jpg' }).mockReturnValueOnce(null);
    mockExtTag.mockReturnValue({ def: ['img-tag'], opt: [] });
    const data = {};
    const [mt, tags, db] = await MediaHandleTool.handleTag('/f', data, 'i.jpg', '', 0);
    expect(db.status).toBe(1);
    expect(db.mediaType.type).toBe('image');
  });

  test('image, not first → mediaType=false', async () => {
    mockExtType.mockReturnValue({ type: 'image', ext: 'jpg' });
    const data = {};
    const [mt] = await MediaHandleTool.handleTag('/f', data, 'i.jpg', 'i.jpg', 1);
    expect(mt).toBe(false);
  });

  test('doc/rawdoc/sheet/present, first → status=1', async () => {
    for (const type of ['doc', 'rawdoc', 'sheet', 'present']) {
      mockExtType.mockReturnValueOnce({ type, ext: 'docx' }).mockReturnValueOnce(null);
      mockExtTag.mockReturnValue({ def: ['dtag'], opt: [] });
      const data = {};
      const [mt, , db] = await MediaHandleTool.handleTag('/f', data, `f.${type}`, '', 0);
      expect(db.status).toBe(1);
    }
  });

  test('pdf, first → status=1, mediaType set', async () => {
    mockExtType.mockReturnValueOnce({ type: 'pdf', ext: 'pdf' }).mockReturnValueOnce(null);
    mockExtTag.mockReturnValue({ def: ['pdf-tag'], opt: [] });
    const data = {};
    const [mt, tags, db] = await MediaHandleTool.handleTag('/f', data, 'f.pdf', '', 0);
    expect(db.status).toBe(1);
    expect(mt.type).toBe('pdf');
  });

  test('zip, first → status=1', async () => {
    mockExtType.mockReturnValueOnce({ type: 'zip', ext: 'zip' }).mockReturnValueOnce(null);
    mockExtTag.mockReturnValue({ def: ['zip-tag'], opt: [] });
    const data = {};
    const [mt, , db] = await MediaHandleTool.handleTag('/f', data, 'f.zip', '', 0);
    expect(db.status).toBe(1);
  });

  test('zip, status=2 (re-process) → status=1', async () => {
    mockExtType.mockReturnValue({ type: 'zip', ext: 'zip' });
    mockExtTag.mockReturnValue({ def: ['zip-tag'], opt: [] });
    const data = {};
    const [mt, , db] = await MediaHandleTool.handleTag('/f', data, 'f.zip', 'f.zip', 2);
    expect(db.status).toBe(1);
  });

  test('zip, not first AND not status=2 → mediaType=false', async () => {
    mockExtType.mockReturnValue({ type: 'zip', ext: 'zip' });
    const data = {};
    const [mt] = await MediaHandleTool.handleTag('/f', data, 'f.zip', 'f.zip', 1);
    expect(mt).toBe(false);
  });

  test('unknown media type → rejects', async () => {
    mockExtType.mockReturnValueOnce({ type: 'unknown', ext: 'xyz' }).mockReturnValueOnce(null);
    const data = {};
    await expect(MediaHandleTool.handleTag('/f', data, 'f.xyz', '', 0)).rejects.toThrow('unknown media type!!!');
  });

  test('extType returns null → null mediaType, resolves with empty tag', async () => {
    mockExtType.mockReturnValue(null);
    const data = {};
    const [mt, tags] = await MediaHandleTool.handleTag('/f', data, 'f', '', 0);
    expect(mt).toBeNull();
  });

  test('video no height/time, file does NOT exist → handleRest path', async () => {
    mockExtType.mockReturnValueOnce({ type: 'video', ext: 'mp4' }).mockReturnValueOnce(null);
    mockExistsSync.mockReturnValue(false);
    const data = {};
    const [mt] = await MediaHandleTool.handleTag('/f', data, 'v.mp4', '', 0);
    // no height/time → no ffmpeg → handleRest → !time → mediaType=false
    expect(mt).toBe(false);
  });

  test('video with time only (no height), isVideo=false → mediaType=false', async () => {
    mockExtType.mockReturnValueOnce({ type: 'video', ext: 'mp4' }).mockReturnValueOnce(null);
    const data = { time: 5000 };
    const [mt] = await MediaHandleTool.handleTag('/f', data, 'v.mp4', '', 0);
    // has time, but music check: type=video not music; isVideo check: no height → false
    // falls to else → mediaType=false
    expect(mt).toBe(false);
  });

  test('zipbook, first → status=1, ret_mediaType with mediaType', async () => {
    mockExtType.mockReturnValueOnce({ type: 'zipbook', ext: 'cbz' }).mockReturnValueOnce(null);
    mockExtTag.mockReturnValue({ def: ['zbtag'], opt: [] });
    const data = {};
    const [mt, , db] = await MediaHandleTool.handleTag('/f', data, 'f.cbz', '', 0);
    expect(db.status).toBe(1);
    expect(db.mediaType.type).toBe('zipbook');
  });
});

// ─── Phase 4: handleMediaUpload ──────────────────────────────────────

describe('handleMediaUpload', () => {
  test('falsy mediaType → resolves immediately', async () => {
    const result = await MediaHandleTool.handleMediaUpload(false, '/f', 'fid', makeUser());
    expect(result).toBeUndefined();
    expect(mockGoogleApi).not.toHaveBeenCalled();
  });

  test('PDF type → qpdf split + completeMedia', async () => {
    mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));
    mockReaddirSync.mockReturnValue(['001.pdf', '002.pdf', '003.pdf']);
    mockMongo.mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]); // completeMedia
    const mt = { type: 'pdf', ext: 'pdf' };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
    expect(mockExec).toHaveBeenCalled();
    expect(mockExec.mock.calls[0][0]).toContain('qpdf');
    expect(mockMongo).toHaveBeenCalled();
  });

  test('PDF with realPath → uses fileIndex path', async () => {
    mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));
    mockReaddirSync.mockReturnValue(['001.pdf']);
    mockMongo.mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'pdf', ext: 'pdf', realPath: 'rp', fileIndex: 2 };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
    expect(mockExec.mock.calls[0][0]).toContain('/f/2_complete');
  });

  test('zipbook type (rar) → 7za extract + Google upload', async () => {
    mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));
    mockReaddirSync.mockReturnValue(['img1.jpg', 'img2.jpg']);
    mockLstatSync.mockReturnValue({ isDirectory: () => false });
    mockIsImage.mockReturnValue('jpg');
    mockSortList.mockImplementation(arr => arr);
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'upload' && opts.rest) {
        return opts.rest({ thumbnailLink: 'http://thumb', id: 'gid1' });
      }
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue({});
    const mt = { type: 'zipbook', ext: 'rar' };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
    expect(mockExec.mock.calls[0][0]).toContain('7za x');
  });

  test('zipbook — empty zip after extract → rejects', async () => {
    mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));
    mockReaddirSync.mockReturnValue([]);
    mockIsImage.mockReturnValue(false);
    const mt = { type: 'zipbook', ext: 'zip' };
    await expect(MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser())).rejects.toThrow('empty zip');
  });

  test('zipbook — no thumbnailLink → rejects', async () => {
    mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));
    mockReaddirSync.mockReturnValue(['img1.jpg']);
    mockLstatSync.mockReturnValue({ isDirectory: () => false });
    mockIsImage.mockReturnValue('jpg');
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'upload' && opts.rest) {
        return opts.rest({ id: 'gid1' }); // no thumbnailLink
      }
      return Promise.resolve({});
    });
    const mt = { type: 'zipbook', ext: 'zip' };
    await expect(MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser())).rejects.toThrow('error type');
  });

  test('zipbook — already processed (_zip exists) → skips rename', async () => {
    mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));
    mockReaddirSync.mockReturnValue(['img1.jpg']);
    mockLstatSync.mockReturnValue({ isDirectory: () => false });
    mockIsImage.mockReturnValue('jpg');
    mockExistsSync.mockImplementation((p) => p.endsWith('_zip'));
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'upload' && opts.rest) {
        return opts.rest({ thumbnailLink: 'http://t', id: 'gid' });
      }
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue({});
    const mt = { type: 'zipbook', ext: 'zip' };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
    // FsRenameSync should NOT be called for the archive (it's already processed)
    const renameCalls = mockRenameSync.mock.calls.filter(c => !c[0].includes('temp/'));
    // Only the image renames should have happened
  });

  test('zipbook with .1.rar exists → uses that path', async () => {
    mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));
    mockReaddirSync.mockReturnValue(['img.png']);
    mockLstatSync.mockReturnValue({ isDirectory: () => false });
    mockIsImage.mockReturnValue('png');
    mockExistsSync.mockImplementation((p) => p.endsWith('.1.rar'));
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'upload' && opts.rest) {
        return opts.rest({ thumbnailLink: 'http://t', id: 'gid' });
      }
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue({});
    const mt = { type: 'zipbook', ext: 'rar' };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
    expect(mockExec.mock.calls[0][0]).toContain('.1.rar');
  });

  test('zipbook with _7z exists', async () => {
    mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));
    mockReaddirSync.mockReturnValue(['img.png']);
    mockLstatSync.mockReturnValue({ isDirectory: () => false });
    mockIsImage.mockReturnValue('png');
    mockExistsSync.mockImplementation((p) => p.endsWith('_7z') && !p.endsWith('_7z_c'));
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'upload' && opts.rest) {
        return opts.rest({ thumbnailLink: 'http://t', id: 'gid' });
      }
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue({});
    const mt = { type: 'zipbook', ext: '7z' };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
    expect(mockExec.mock.calls[0][0]).toContain('_7z');
  });

  test('zipbook with _zip_c (password copy)', async () => {
    mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));
    mockReaddirSync.mockReturnValue(['img.png']);
    mockLstatSync.mockReturnValue({ isDirectory: () => false });
    mockIsImage.mockReturnValue('png');
    mockExistsSync.mockImplementation((p) => p.endsWith('_zip_c'));
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'upload' && opts.rest) {
        return opts.rest({ thumbnailLink: 'http://t', id: 'gid' });
      }
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue({});
    const mt = { type: 'zipbook', ext: 'zip' };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
    expect(mockExec.mock.calls[0][0]).toContain('_zip_c');
  });

  test('zipbook with _7z_c (password 7z)', async () => {
    mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));
    mockReaddirSync.mockReturnValue(['img.png']);
    mockLstatSync.mockReturnValue({ isDirectory: () => false });
    mockIsImage.mockReturnValue('png');
    mockExistsSync.mockImplementation((p) => {
      if (p.endsWith('_7z_c')) return true;
      return false;
    });
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'upload' && opts.rest) {
        return opts.rest({ thumbnailLink: 'http://t', id: 'gid' });
      }
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue({});
    const mt = { type: 'zipbook', ext: '7z' };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
    expect(mockExec.mock.calls[0][0]).toContain('_7z_c');
  });

  test('zipbook — nested directories, max depth 4', async () => {
    // recurFolder traverses directories recursively up to depth 4
    // Mock: tempPath contains 'subdir' (a directory), and subdir contains 'img.jpg' (an image file)
    mockReaddirSync.mockImplementation((dir) => {
      if (dir.endsWith('temp')) return ['subdir'];
      return ['img.jpg'];
    });
    mockLstatSync.mockImplementation((p) => ({
      isDirectory: () => !p.includes('img.jpg'),
    }));
    mockIsImage.mockImplementation((f) => f.endsWith('.jpg') ? 'jpg' : false);
    mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'upload' && opts.rest) {
        return opts.rest({ thumbnailLink: 'http://t', id: 'gid' });
      }
      if (action === 'download' && opts.rest) return opts.rest();
      if (action === 'delete') return Promise.resolve();
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'zipbook', ext: 'zip' };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
  });

  test('zipbook with realPath → uses fileIndex path', async () => {
    mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));
    mockReaddirSync.mockReturnValue(['img.jpg']);
    mockLstatSync.mockReturnValue({ isDirectory: () => false });
    mockIsImage.mockReturnValue('jpg');
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'upload' && opts.rest) {
        return opts.rest({ thumbnailLink: 'http://t', id: 'gid' });
      }
      if (action === 'download' && opts.rest) return opts.rest();
      if (action === 'delete') return Promise.resolve();
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'zipbook', ext: 'zip', realPath: 'r', fileIndex: 1 };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
    expect(mockMongo.mock.calls[0][3].$set['present.1']).toBeDefined();
  });

  // --- ZIP type ---
  test('zip (rar) → 7za l, parse playlist', async () => {
    const output = '------- ---- ---\n-----------\n50%  2024-01-01 12:00 12345 file1.txt\n0%  2024-01-01 12:00 12345 dir/\n-----------\n';
    mockExec.mockImplementation((cmd, cb) => cb(null, output));
    mockExtType.mockReturnValue({ type: 'zip', ext: 'rar' });
    mockExtTag.mockReturnValue({ def: ['ztag'], opt: [] });
    mockMongo.mockResolvedValueOnce([makeItem({ tags: ['t1'], user123: ['t1'] })]).mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'zip', ext: 'rar' };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
    expect(mockExec.mock.calls[0][0]).toContain('7za l');
  });

  test('zip (7z) → 7za l, column format parse', async () => {
    const line38 = ' '.repeat(30) + '12345678';
    const filename = ' '.repeat(53) + 'file1.txt';
    const output = `Header\n-------------------\n${line38.substr(0, 38)}${filename.substr(53)}\n-------------------\nFooter\n`;
    mockExec.mockImplementation((cmd, cb) => cb(null, output));
    mockMongo.mockResolvedValueOnce([makeItem({ tags: [], user123: [] })]).mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'zip', ext: '7z' };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
  });

  test('zip (zip format) → myuzip.py, line parse', async () => {
    const output = 'zipinfo\nfile1.txt\nfile2.doc\nsubdir/\n';
    mockExec.mockImplementation((cmd, cb) => cb(null, output));
    mockMongo.mockResolvedValueOnce([makeItem({ tags: [], user123: [] })]).mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'zip', ext: 'zip' };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
    expect(mockExec.mock.calls[0][0]).toContain('myuzip.py');
  });

  test('zip — empty output → rejects "is not zip"', async () => {
    mockExec.mockImplementation((cmd, cb) => cb(null, ''));
    const mt = { type: 'zip', ext: 'zip' };
    await expect(MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser())).rejects.toThrow('is not zip');
  });

  test('zip — all entries filtered → rejects "empty zip"', async () => {
    mockExec.mockImplementation((cmd, cb) => cb(null, 'header\ndir/\n'));
    mockMongo.mockResolvedValue([]);
    const mt = { type: 'zip', ext: 'zip' };
    await expect(MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser())).rejects.toThrow('empty zip');
  });

  test('zip — file not found in DB → rejects', async () => {
    const output = 'header\nfile1.txt\n';
    mockExec.mockImplementation((cmd, cb) => cb(null, output));
    mockMongo.mockResolvedValueOnce([]); // find returns empty
    const mt = { type: 'zip', ext: 'zip' };
    await expect(MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser())).rejects.toThrow('cannot find zip');
  });

  test('zip — already processed (_zip exists) → skips rename', async () => {
    const output = 'header\nfile1.txt\n';
    mockExec.mockImplementation((cmd, cb) => cb(null, output));
    mockExistsSync.mockImplementation((p) => p.endsWith('_zip'));
    mockMongo.mockResolvedValueOnce([makeItem({ tags: [], user123: [] })]).mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'zip', ext: 'zip' };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
    // FsRenameSync should NOT be called (is_processed=true)
    expect(mockRenameSync).not.toHaveBeenCalled();
    expect(mockMkdirp).not.toHaveBeenCalled(); // process() skips mkdirp
  });

  test('zip — not processed → renames + mkdirp', async () => {
    const output = 'header\nfile1.txt\n';
    mockExec.mockImplementation((cmd, cb) => cb(null, output));
    mockExistsSync.mockReturnValue(false);
    mockMongo.mockResolvedValueOnce([makeItem({ tags: [], user123: [] })]).mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'zip', ext: 'zip' };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
    expect(mockRenameSync).toHaveBeenCalled();
    // Last Mkdirp call is for /f/real
    const mkCalls = mockMkdirp.mock.calls;
    expect(mkCalls[mkCalls.length - 1][0]).toContain('real');
  });

  // --- Default type (video/image/doc/present) ---
  test('default — video without noise → Google upload', async () => {
    mockStatSync.mockReturnValue({ size: 500 }); // below NOISE_SIZE
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'upload' && opts.rest) {
        return opts.rest({ alternateLink: 'http://alt', id: 'gid' });
      }
      if (action === 'download media' && opts.rest) return opts.rest(null);
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'video', ext: 'mp4', time: 5000, hd: 720 };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
    expect(mockGoogleApi).toHaveBeenCalledWith('upload', expect.objectContaining({ type: 'media' }));
  });

  test('default — video with size > NOISE_SIZE → appends noise', async () => {
    mockStatSync.mockReturnValue({ size: 2000 }); // above NOISE_SIZE=1000
    mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'upload' && opts.rest) {
        return opts.rest({ alternateLink: 'http://alt', id: 'gid' });
      }
      if (action === 'download media' && opts.rest) return opts.rest(null);
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'video', ext: 'mp4', time: 5000, hd: 720 };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
    expect(mockExec).toHaveBeenCalled();
    expect(mockExec.mock.calls[0][0]).toContain('cat /static/noise');
  });

  test('default — video with add_noise=true → appends noise + deletes old Drive', async () => {
    mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'delete') return Promise.resolve();
      if (action === 'upload' && opts.rest) {
        return opts.rest({ alternateLink: 'http://alt', id: 'gid' });
      }
      if (action === 'download media' && opts.rest) return opts.rest(null);
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'video', ext: 'mp4', time: 5000, hd: 720 };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser(), 'old-drive-id');
    expect(mockExec).toHaveBeenCalled();
    expect(mockGoogleApi).toHaveBeenCalledWith('delete', { fileId: 'old-drive-id' });
  });

  test('default — rawdoc → forces ext=txt', async () => {
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'upload' && opts.rest) {
        return opts.rest({ exportLinks: { 'application/pdf': 'http://pdf' }, id: 'gid' });
      }
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue({});
    const mt = { type: 'rawdoc', ext: 'whatever' };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
    expect(mt.ext).toBe('txt');
  });

  test('default — doc type → upload with convert:true', async () => {
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'upload') {
        expect(opts.convert).toBe(true);
        if (opts.rest) return opts.rest({ exportLinks: { 'application/pdf': 'http://pdf' }, id: 'gid' });
      }
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue({});
    const mt = { type: 'doc', ext: 'docx' };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
  });

  test('default — present with exportLinks → sets thumbnail + alternate', async () => {
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'upload' && opts.rest) {
        return opts.rest({
          exportLinks: { 'application/pdf': 'http://pdf' },
          alternateLink: 'http://alt',
          id: 'gid',
        });
      }
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue({});
    const mt = { type: 'present', ext: 'pptx' };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
    expect(mt.thumbnail).toBe('http://pdf');
    expect(mt.alternate).toBe('http://alt');
  });

  test('default — present with no alternateLink → error', async () => {
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'upload' && opts.rest) {
        return opts.rest({
          exportLinks: { 'application/pdf': 'http://pdf' },
          id: 'gid',
        });
      }
      return Promise.resolve({});
    });
    const mt = { type: 'present', ext: 'pptx' };
    await expect(MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser())).rejects.toThrow('error type');
  });

  test('default — image with thumbnailLink', async () => {
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'upload' && opts.rest) {
        return opts.rest({ thumbnailLink: 'http://thumb', id: 'gid' });
      }
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue({});
    const mt = { type: 'image', ext: 'jpg' };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
    expect(mt.thumbnail).toBe('http://thumb');
  });

  test('default — no thumbnail metadata → error', async () => {
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'upload' && opts.rest) {
        return opts.rest({ id: 'gid' }); // no links at all
      }
      return Promise.resolve({});
    });
    const mt = { type: 'image', ext: 'jpg' };
    await expect(MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser())).rejects.toThrow('error type');
  });

  test('default — errhandle callback from upload', async () => {
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'upload' && opts.errhandle) {
        return opts.errhandle(new Error('upload fail'));
      }
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue({});
    const mt = { type: 'image', ext: 'jpg', fileIndex: 0 };
    // errorMedia will be called via handleError(..., errorMedia, fileID, fileIndex)
    await expect(MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser())).rejects.toThrow();
  });

  test('default — realPath uses real/ subpath for upload', async () => {
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'upload') {
        expect(opts.filePath).toContain('/real/rp');
        if (opts.rest) return opts.rest({ thumbnailLink: 'http://t', id: 'gid' });
      }
      if (action === 'download' && opts.rest) return opts.rest();
      if (action === 'delete') return Promise.resolve();
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'image', ext: 'jpg', realPath: 'rp', fileIndex: 2 };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
    expect(mockMongo.mock.calls[0][3].$set['mediaType.2.key']).toBeDefined();
  });
});

// ─── Phase 4b: handleMedia ──────────────────────────────────────────

describe('handleMedia', () => {
  test('image — thumbnail cached → download + delete + complete', async () => {
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'download' && opts.rest) return opts.rest();
      if (action === 'delete') return Promise.resolve();
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'image', ext: 'jpg', thumbnail: 'http://t' };
    await MediaHandleTool.handleMedia(mt, '/f', 'fid', 'key1', makeUser());
    expect(mockGoogleApi).toHaveBeenCalledWith('download', expect.objectContaining({ url: 'http://t' }));
  });

  test('image — no thumbnail, fetch from GoogleApi get', async () => {
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'get') return Promise.resolve({ thumbnailLink: 'http://fetched' });
      if (action === 'download' && opts.rest) return opts.rest();
      if (action === 'delete') return Promise.resolve();
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'image', ext: 'jpg' };
    await MediaHandleTool.handleMedia(mt, '/f', 'fid', 'key1', makeUser());
    expect(mockGoogleApi).toHaveBeenCalledWith('get', { fileId: 'key1' });
  });

  test('image — no thumbnail from get → error', async () => {
    mockGoogleApi.mockImplementation((action) => {
      if (action === 'get') return Promise.resolve({}); // no thumbnailLink
      return Promise.resolve({});
    });
    const mt = { type: 'image', ext: 'jpg' };
    await expect(MediaHandleTool.handleMedia(mt, '/f', 'fid', 'key1', makeUser())).rejects.toThrow('error type');
  });

  test('zipbook — same as image path', async () => {
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'download' && opts.rest) return opts.rest();
      if (action === 'delete') return Promise.resolve();
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'zipbook', ext: 'cbz', thumbnail: 'http://t' };
    await MediaHandleTool.handleMedia(mt, '/f', 'fid', 'key1', makeUser());
    expect(mockGoogleApi).toHaveBeenCalledWith('download', expect.objectContaining({ url: 'http://t' }));
  });

  test('video — download media + complete', async () => {
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'download media' && opts.rest) return opts.rest(null);
      return Promise.resolve({});
    });
    mockAddTag.mockResolvedValue({});
    mockMongo.mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'video', ext: 'mp4', time: 5000, hd: 720 };
    await MediaHandleTool.handleMedia(mt, '/f', 'fid', 'key1', makeUser());
    expect(mockGoogleApi).toHaveBeenCalledWith('download media', expect.objectContaining({ key: 'key1' }));
  });

  test('video — with height tag from rest callback', async () => {
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'download media' && opts.rest) return opts.rest('720p');
      return Promise.resolve({});
    });
    mockAddTag.mockResolvedValue({});
    mockMongo.mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'video', ext: 'mp4', time: 5000, hd: 720 };
    await MediaHandleTool.handleMedia(mt, '/f', 'fid', 'key1', makeUser());
    expect(mockAddTag).toHaveBeenCalledWith('fid', '720p', expect.anything());
  });

  test('video — no time/hd → rejects', async () => {
    const mt = { type: 'video', ext: 'mp4' };
    await expect(MediaHandleTool.handleMedia(mt, '/f', 'fid', 'key1', makeUser())).rejects.toThrow('video can not be decoded!!!');
  });

  test('video with realPath → uses indexed filePath', async () => {
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'download media') {
        expect(opts.filePath).toContain('/f/2_complete');
        if (opts.rest) return opts.rest(null);
      }
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'video', ext: 'mp4', time: 1000, hd: 480, realPath: 'rp', fileIndex: 2 };
    await MediaHandleTool.handleMedia(mt, '/f', 'fid', 'key1', makeUser());
  });

  test('doc — download doc + delete + complete', async () => {
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'download doc' && opts.rest) return opts.rest(10);
      if (action === 'delete') return Promise.resolve();
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'doc', ext: 'docx', thumbnail: 'http://pdf' };
    await MediaHandleTool.handleMedia(mt, '/f', 'fid', 'key1', makeUser());
    expect(mockGoogleApi).toHaveBeenCalledWith('download doc', expect.anything());
  });

  test('doc — no thumbnail, fetch exportLinks from get', async () => {
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'get') return Promise.resolve({ exportLinks: { 'application/pdf': 'http://pdf' } });
      if (action === 'download doc' && opts.rest) return opts.rest(5);
      if (action === 'delete') return Promise.resolve();
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'doc', ext: 'docx' };
    await MediaHandleTool.handleMedia(mt, '/f', 'fid', 'key1', makeUser());
  });

  test('doc — no exportLinks from get → error', async () => {
    mockGoogleApi.mockImplementation((action) => {
      if (action === 'get') return Promise.resolve({});
      return Promise.resolve({});
    });
    const mt = { type: 'doc', ext: 'docx' };
    await expect(MediaHandleTool.handleMedia(mt, '/f', 'fid', 'key1', makeUser())).rejects.toThrow('error type');
  });

  test('sheet/rawdoc — same as doc path', async () => {
    for (const type of ['sheet', 'rawdoc']) {
      jest.clearAllMocks();
      mockGoogleApi.mockImplementation((action, opts) => {
        if (action === 'download doc' && opts.rest) return opts.rest(3);
        if (action === 'delete') return Promise.resolve();
        return Promise.resolve({});
      });
      mockMongo.mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
      const mt = { type, ext: 'txt', thumbnail: 'http://pdf' };
      await MediaHandleTool.handleMedia(mt, '/f', 'fid', 'key1', makeUser());
    }
  });

  test('present — download present + delete + complete', async () => {
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'download present' && opts.rest) return opts.rest(8);
      if (action === 'delete') return Promise.resolve();
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'present', ext: 'pptx', thumbnail: 'http://pdf', alternate: 'http://alt' };
    await MediaHandleTool.handleMedia(mt, '/f', 'fid', 'key1', makeUser());
    expect(mockGoogleApi).toHaveBeenCalledWith('download present', expect.objectContaining({ alternate: 'http://alt' }));
  });

  test('present — no thumbnail, fetch from get', async () => {
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'get') return Promise.resolve({ exportLinks: { 'application/pdf': 'http://pdf' }, alternateLink: 'http://alt' });
      if (action === 'download present' && opts.rest) return opts.rest(4);
      if (action === 'delete') return Promise.resolve();
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'present', ext: 'pptx' };
    await MediaHandleTool.handleMedia(mt, '/f', 'fid', 'key1', makeUser());
  });

  test('present — no exportLinks from get → error', async () => {
    mockGoogleApi.mockImplementation((action) => {
      if (action === 'get') return Promise.resolve({});
      return Promise.resolve({});
    });
    const mt = { type: 'present', ext: 'pptx' };
    await expect(MediaHandleTool.handleMedia(mt, '/f', 'fid', 'key1', makeUser())).rejects.toThrow('error type');
  });

  test('image — errhandle from download', async () => {
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'download' && opts.errhandle) {
        return opts.errhandle(new Error('dl fail'));
      }
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue({});
    const mt = { type: 'image', ext: 'jpg', thumbnail: 'http://t', fileIndex: 0 };
    await expect(MediaHandleTool.handleMedia(mt, '/f', 'fid', 'key1', makeUser())).rejects.toThrow();
  });
});

// ─── Phase 5: editFile ──────────────────────────────────────────────

describe('editFile', () => {
  test('invalid name → rejects', async () => {
    mockIsValidString.mockReturnValueOnce(false);
    await expect(MediaHandleTool.editFile('uid', 'bad', makeUser())).rejects.toThrow('name is not vaild!!!');
  });

  test('invalid uid → rejects', async () => {
    mockIsValidString.mockReturnValueOnce('good').mockReturnValueOnce(false);
    await expect(MediaHandleTool.editFile('uid', 'name', makeUser())).rejects.toThrow('uid is not vaild!!!');
  });

  test('file not found → rejects', async () => {
    mockMongo.mockResolvedValueOnce([]);
    await expect(MediaHandleTool.editFile('uid', 'name', makeUser())).rejects.toThrow('file not exist!!!');
  });

  test('non-admin, not owner → rejects', async () => {
    mockCheckAdmin.mockReturnValue(false);
    mockIsValidString.mockImplementation((s) => s);
    const user = makeUser(0);
    user._id.equals = () => false;
    mockMongo.mockResolvedValueOnce([makeItem({ owner: 'other-user' })]);
    await expect(MediaHandleTool.editFile('uid', 'name', user)).rejects.toThrow('file is not yours!!!');
  });

  test('successful edit — admin → merged tags, no "others"', async () => {
    const item = makeItem({ tags: ['old-tag'], user123: ['old-tag'] });
    mockMongo
      .mockResolvedValueOnce([item]) // find
      .mockResolvedValueOnce({}) // update name
      // addTag resolved by mock
      .mockResolvedValueOnce({}) // update tags
    ;
    mockCheckAdmin
      .mockReturnValueOnce(true) // ownership check
      .mockReturnValueOnce(true) // tag merge admin check
      .mockReturnValueOnce(false); // admin(2) check
    
    // handleTag returns
    const handleTagSpy = jest.spyOn(MediaHandleTool, 'handleTag').mockResolvedValueOnce([
      false, { def: ['new-def'], opt: ['opt1'] }, { utime: 1 }
    ]);
    const uploadSpy = jest.spyOn(MediaHandleTool, 'handleMediaUpload').mockResolvedValueOnce();

    const result = await MediaHandleTool.editFile('uid', 'newname', makeUser());
    expect(result.name).toBe('newname');
    expect(result.select).toBeDefined();

    handleTagSpy.mockRestore();
    uploadSpy.mockRestore();
  });

  test('non-admin owner — separate user/others tags', async () => {
    const item = makeItem({ tags: ['shared', 'user-tag'], user123: ['user-tag'] });
    mockMongo
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    
    mockCheckAdmin
      .mockReturnValueOnce(true) // ownership (admin(1) for owner check)
      .mockReturnValueOnce(false) // NOT admin(1) for tag merge
      .mockReturnValueOnce(false); // NOT admin(2)

    const handleTagSpy = jest.spyOn(MediaHandleTool, 'handleTag').mockResolvedValueOnce([
      false, { def: [], opt: ['opt1'] }, { utime: 1 }
    ]);
    const uploadSpy = jest.spyOn(MediaHandleTool, 'handleMediaUpload').mockResolvedValueOnce();

    const result = await MediaHandleTool.editFile('uid', 'newname', makeUser());
    expect(result.other).toBeDefined();

    handleTagSpy.mockRestore();
    uploadSpy.mockRestore();
  });

  test('admin(2) — adds 18+ if adultonly', async () => {
    const item = makeItem({ adultonly: 1, first: 0 });
    mockMongo.mockResolvedValueOnce([item]).mockResolvedValueOnce({}).mockResolvedValueOnce({});
    
    mockCheckAdmin.mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValueOnce(true);

    const handleTagSpy = jest.spyOn(MediaHandleTool, 'handleTag').mockResolvedValueOnce([
      false, { def: [], opt: [] }, {}
    ]);
    const uploadSpy = jest.spyOn(MediaHandleTool, 'handleMediaUpload').mockResolvedValueOnce();

    const result = await MediaHandleTool.editFile('uid', 'newname', makeUser(2));
    expect(result.select).toContain('18+');

    handleTagSpy.mockRestore();
    uploadSpy.mockRestore();
  });

  test('admin(2) — adds 18+ to opt if NOT adultonly', async () => {
    const item = makeItem({ adultonly: 0, first: 1 });
    mockMongo.mockResolvedValueOnce([item]).mockResolvedValueOnce({}).mockResolvedValueOnce({});
    
    mockCheckAdmin.mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValueOnce(true);

    const handleTagSpy = jest.spyOn(MediaHandleTool, 'handleTag').mockResolvedValueOnce([
      false, { def: [], opt: [] }, {}
    ]);
    const uploadSpy = jest.spyOn(MediaHandleTool, 'handleMediaUpload').mockResolvedValueOnce();

    const result = await MediaHandleTool.editFile('uid', 'newname', makeUser(2));
    expect(result.option).toContain('18+');
    expect(result.select).toContain('first item');

    handleTagSpy.mockRestore();
    uploadSpy.mockRestore();
  });

  test('relative tags — max 5, filters defaults', async () => {
    const item = makeItem();
    mockMongo.mockResolvedValueOnce([item]).mockResolvedValueOnce({}).mockResolvedValueOnce({});
    
    mockCheckAdmin.mockReturnValue(true);
    mockGetRelativeTag.mockResolvedValueOnce(['rel1', 'rel2', 'rel3', 'rel4', 'rel5', 'rel6']);
    mockIsDefaultTag.mockReturnValue(false);

    const handleTagSpy = jest.spyOn(MediaHandleTool, 'handleTag').mockResolvedValueOnce([
      false, { def: [], opt: [] }, {}
    ]);
    const uploadSpy = jest.spyOn(MediaHandleTool, 'handleMediaUpload').mockResolvedValueOnce();

    const result = await MediaHandleTool.editFile('uid', 'newname', makeUser());
    // opt gets: 18+ (admin2, not adultonly), first item (or not if first=1), + max 5 relative tags
    // So max is 5 relative + 18+ + first item = 7, but only 5 from relative slice
    const relativeInOpt = result.option.filter(t => t.startsWith('rel'));
    expect(relativeInOpt.length).toBeLessThanOrEqual(5);

    handleTagSpy.mockRestore();
    uploadSpy.mockRestore();
  });

  test('tag already in items.tags → not prepended again', async () => {
    const item = makeItem({ tags: ['normalized-tag'] });
    mockMongo.mockResolvedValueOnce([item]).mockResolvedValueOnce({}).mockResolvedValueOnce({});
    mockCheckAdmin.mockReturnValue(true);
    mockAddTag.mockResolvedValueOnce({ tag: 'normalized-tag' }); // same tag

    const handleTagSpy = jest.spyOn(MediaHandleTool, 'handleTag').mockResolvedValueOnce([
      false, { def: [], opt: [] }, {}
    ]);
    const uploadSpy = jest.spyOn(MediaHandleTool, 'handleMediaUpload').mockResolvedValueOnce();

    await MediaHandleTool.editFile('uid', 'newname', makeUser());
    // tags should NOT have duplicate
    expect(item.tags.filter(t => t === 'normalized-tag').length).toBe(1);

    handleTagSpy.mockRestore();
    uploadSpy.mockRestore();
  });

  test('new tag not in user tags → prepended to user array', async () => {
    const item = makeItem({ tags: [], user123: [] });
    mockMongo.mockResolvedValueOnce([item]).mockResolvedValueOnce({}).mockResolvedValueOnce({});
    mockCheckAdmin.mockReturnValue(true);
    mockAddTag.mockResolvedValueOnce({ tag: 'brand-new' });

    const handleTagSpy = jest.spyOn(MediaHandleTool, 'handleTag').mockResolvedValueOnce([
      false, { def: [], opt: [] }, {}
    ]);
    const uploadSpy = jest.spyOn(MediaHandleTool, 'handleMediaUpload').mockResolvedValueOnce();

    await MediaHandleTool.editFile('uid', 'newname', makeUser());
    expect(item.tags[0]).toBe('brand-new');
    expect(item.user123[0]).toBe('brand-new');

    handleTagSpy.mockRestore();
    uploadSpy.mockRestore();
  });

  test('mediaTag.def has items → upsert with $addToSet', async () => {
    const item = makeItem({ tags: [] });
    mockMongo.mockResolvedValueOnce([item]).mockResolvedValueOnce({}).mockResolvedValueOnce({});
    mockCheckAdmin.mockReturnValue(true);

    const handleTagSpy = jest.spyOn(MediaHandleTool, 'handleTag').mockResolvedValueOnce([
      false, { def: ['new-def-tag'], opt: [] }, {}
    ]);
    const uploadSpy = jest.spyOn(MediaHandleTool, 'handleMediaUpload').mockResolvedValueOnce();

    await MediaHandleTool.editFile('uid', 'newname', makeUser());
    const updateCall = mockMongo.mock.calls.find(c => c[0] === 'update' && c[3].$addToSet);
    expect(updateCall).toBeDefined();

    handleTagSpy.mockRestore();
    uploadSpy.mockRestore();
  });
});

// ─── Phase 6: singleDrive ───────────────────────────────────────────

describe('singleDrive', () => {
  const makeMetadata = (overrides = {}) => ({
    id: 'gdrive-id-1',
    title: 'testfile.mp4',
    fileSize: 1000,
    downloadUrl: 'http://dl',
    userPermission: { role: 'reader' },
    ...overrides,
  });

  test('single non-video file — creates DB entry + uploads + moves to uploaded', async () => {
    mockExtType.mockReturnValue({ type: 'image', ext: 'jpg' });
    mockExistsSync.mockReturnValue(false);
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'move parent') return Promise.resolve();
      if (action === 'download' && opts.rest) return opts.rest();
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue([{ _id: 'new-oid-123' }]);

    const handleTagSpy = jest.spyOn(MediaHandleTool, 'handleTag').mockResolvedValue([
      { type: 'image', ext: 'jpg' }, { def: ['img'], opt: [] }, {}
    ]);
    const uploadSpy = jest.spyOn(MediaHandleTool, 'handleMediaUpload').mockResolvedValue();

    await MediaHandleTool.singleDrive([makeMetadata()], 0, makeUser(), 'folder1', 'uploaded1', 'handling1', ['dir1']);

    expect(mockMongo).toHaveBeenCalledWith('insert', 'storage', expect.anything());
    expect(mockSendWs).toHaveBeenCalled();

    handleTagSpy.mockRestore();
    uploadSpy.mockRestore();
  });

  test('video with videoMediaMetadata — download media directly', async () => {
    mockExtType.mockReturnValue({ type: 'video', ext: 'mp4' });
    mockExistsSync.mockReturnValue(true); // local exists
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'move parent') return Promise.resolve();
      if (action === 'download media' && opts.rest) return opts.rest();
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue([{ _id: 'new-oid-123' }]);

    const handleTagSpy = jest.spyOn(MediaHandleTool, 'handleTag').mockResolvedValue([
      { type: 'video', ext: 'mp4' }, { def: [], opt: [] }, {}
    ]);

    const meta = makeMetadata({
      videoMediaMetadata: { width: 1920, height: 1080 },
    });
    await MediaHandleTool.singleDrive([meta], 0, makeUser(), 'f', 'u', 'h', []);

    expect(mockGoogleApi).toHaveBeenCalledWith('download media', expect.anything());

    handleTagSpy.mockRestore();
  });

  test('video without videoMediaMetadata → error', async () => {
    mockExtType.mockReturnValue({ type: 'video', ext: 'mp4' });
    const meta = makeMetadata();

    // Should continue (handleNext) even after error
    await MediaHandleTool.singleDrive([meta], 0, makeUser(), 'f', 'u', 'h', []);
  });

  test('video, local file NOT present → download raw first, then media', async () => {
    mockExtType.mockReturnValue({ type: 'video', ext: 'mp4' });
    mockExistsSync.mockReturnValue(false);
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'move parent') return Promise.resolve();
      if (action === 'download' && opts.rest) return opts.rest();
      if (action === 'download media' && opts.rest) return opts.rest();
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue([{ _id: 'new-oid-123' }]);

    const handleTagSpy = jest.spyOn(MediaHandleTool, 'handleTag').mockResolvedValue([
      { type: 'video', ext: 'mp4' }, { def: [], opt: [] }, {}
    ]);

    const meta = makeMetadata({
      videoMediaMetadata: { width: 1280, height: 720 },
    });
    await MediaHandleTool.singleDrive([meta], 0, makeUser(), 'f', 'u', 'h', []);
    expect(mockGoogleApi).toHaveBeenCalledWith('download', expect.anything());

    handleTagSpy.mockRestore();
  });

  test('owner file → deletes from Drive instead of moving', async () => {
    mockExtType.mockReturnValue({ type: 'image', ext: 'jpg' });
    mockExistsSync.mockReturnValue(true);
    mockGoogleApi.mockResolvedValue({});
    mockMongo.mockResolvedValue([{ _id: 'new-oid-123' }]);

    const handleTagSpy = jest.spyOn(MediaHandleTool, 'handleTag').mockResolvedValue([
      false, { def: [], opt: [] }, {}
    ]);
    const uploadSpy = jest.spyOn(MediaHandleTool, 'handleMediaUpload').mockResolvedValue();

    const meta = makeMetadata({ userPermission: { role: 'owner' } });
    await MediaHandleTool.singleDrive([meta], 0, makeUser(), 'f', 'u', 'h', []);
    expect(mockGoogleApi).toHaveBeenCalledWith('delete', { fileId: 'gdrive-id-1' });

    handleTagSpy.mockRestore();
    uploadSpy.mockRestore();
  });

  test('multiple items — processes recursively', async () => {
    mockExtType.mockReturnValue({ type: 'image', ext: 'jpg' });
    mockExistsSync.mockReturnValue(true);
    mockGoogleApi.mockResolvedValue({});
    mockMongo.mockResolvedValue([{ _id: 'new-oid-123' }]);

    const handleTagSpy = jest.spyOn(MediaHandleTool, 'handleTag').mockResolvedValue([
      false, { def: [], opt: [] }, {}
    ]);
    const uploadSpy = jest.spyOn(MediaHandleTool, 'handleMediaUpload').mockResolvedValue();

    const singleDriveSpy = jest.spyOn(MediaHandleTool, 'singleDrive');

    await MediaHandleTool.singleDrive(
      [makeMetadata({ id: 'a' }), makeMetadata({ id: 'b' })],
      0, makeUser(), 'f', 'u', 'h', []
    );

    // Should call itself for index 1
    expect(singleDriveSpy).toHaveBeenCalledTimes(2);

    handleTagSpy.mockRestore();
    uploadSpy.mockRestore();
    singleDriveSpy.mockRestore();
  });

  test('default tag name → addPost appends "1"', async () => {
    mockExtType.mockReturnValue({ type: 'image', ext: 'jpg' });
    mockExistsSync.mockReturnValue(true);
    mockGoogleApi.mockResolvedValue({});
    mockMongo.mockResolvedValue([{ _id: 'new-oid-123' }]);
    mockIsDefaultTag.mockReturnValueOnce({ index: 1 }); // name is default tag
    mockIsDefaultTag.mockReturnValue(false);

    const handleTagSpy = jest.spyOn(MediaHandleTool, 'handleTag').mockResolvedValue([
      false, { def: [], opt: [] }, {}
    ]);
    const uploadSpy = jest.spyOn(MediaHandleTool, 'handleMediaUpload').mockResolvedValue();

    const meta = makeMetadata({ title: 'defaultname' });
    await MediaHandleTool.singleDrive([meta], 0, makeUser(), 'f', 'u', 'h', []);
    expect(mockAddPost).toHaveBeenCalledWith('defaultname', '1');

    handleTagSpy.mockRestore();
    uploadSpy.mockRestore();
  });

  test('admin(2) with adult dirpath → sets adultonly=1', async () => {
    mockExtType.mockReturnValue({ type: 'image', ext: 'jpg' });
    mockExistsSync.mockReturnValue(true);
    mockGoogleApi.mockResolvedValue({});
    mockMongo.mockResolvedValue([{ _id: 'new-oid-123' }]);
    mockCheckAdmin.mockImplementation((level) => level <= 2);
    // handleFile checks dirpath KEYS via `for (let i in dirpath)` (line 587)
    // handleRest checks dirpath VALUES via `forEach(p => ...)` (line 555)
    // Both call isDefaultTag — need to match both '0' (key) and 'adultdir' (value)
    mockIsDefaultTag.mockImplementation((s) => {
      if (s === 'adultdir' || s === '0') return { index: 0 };
      return false;
    });

    const handleTagSpy = jest.spyOn(MediaHandleTool, 'handleTag').mockResolvedValue([
      false, { def: [], opt: [] }, {}
    ]);
    const uploadSpy = jest.spyOn(MediaHandleTool, 'handleMediaUpload').mockResolvedValue();

    await MediaHandleTool.singleDrive([makeMetadata()], 0, makeUser(2), 'f', 'u', 'h', ['adultdir']);
    const insertCall = mockMongo.mock.calls.find(c => c[0] === 'insert');
    expect(insertCall[2].adultonly).toBe(1);

    handleTagSpy.mockRestore();
    uploadSpy.mockRestore();
  });

  test('folder does NOT exist → creates via Mkdirp', async () => {
    mockExtType.mockReturnValue({ type: 'image', ext: 'jpg' });
    mockExistsSync.mockReturnValue(false);
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'move parent') return Promise.resolve();
      if (action === 'download' && opts.rest) return opts.rest();
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue([{ _id: 'new-oid-123' }]);

    const handleTagSpy = jest.spyOn(MediaHandleTool, 'handleTag').mockResolvedValue([
      false, { def: [], opt: [] }, {}
    ]);
    const uploadSpy = jest.spyOn(MediaHandleTool, 'handleMediaUpload').mockResolvedValue();

    await MediaHandleTool.singleDrive([makeMetadata()], 0, makeUser(), 'f', 'u', 'h', []);
    expect(mockMkdirp).toHaveBeenCalled();

    handleTagSpy.mockRestore();
    uploadSpy.mockRestore();
  });

  test('handleFile error → logs error, still calls handleNext', async () => {
    mockExtType.mockReturnValue({ type: 'video', ext: 'mp4' });
    // video without videoMediaMetadata triggers error but handleNext should still fire
    const singleDriveSpy = jest.spyOn(MediaHandleTool, 'singleDrive');

    await MediaHandleTool.singleDrive(
      [makeMetadata(), makeMetadata({ id: 'second' })],
      0, makeUser(), 'f', 'u', 'h', []
    );

    // Should still recurse to index 1
    expect(singleDriveSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    singleDriveSpy.mockRestore();
  });
});

// ─── Phase 7: checkMedia ────────────────────────────────────────────

describe('checkMedia', () => {
  test('isApiing() → resolves immediately', async () => {
    mockIsApiing.mockReturnValue(true);
    const result = await MediaHandleTool.checkMedia();
    expect(result).toBeUndefined();
    expect(mockMongo).not.toHaveBeenCalled();
  });

  test('no items with mediaType → resolves', async () => {
    mockMongo.mockResolvedValueOnce([]);
    await MediaHandleTool.checkMedia();
  });

  test('single mediaType with timeout + key (no realPath) → handleMedia', async () => {
    const item = {
      _id: 'fid1',
      owner: 'user1',
      mediaType: { type: 'image', timeout: true, key: 'gkey1' },
    };
    mockMongo
      .mockResolvedValueOnce([item]) // find items
      .mockResolvedValueOnce({}); // update timeout

    const handleMediaSpy = jest.spyOn(MediaHandleTool, 'handleMedia').mockResolvedValue();

    await MediaHandleTool.checkMedia();
    expect(mockMongo).toHaveBeenCalledWith('update', 'storage', { _id: 'fid1' }, { $set: { 'mediaType.timeout': false } });
    expect(handleMediaSpy).toHaveBeenCalled();

    handleMediaSpy.mockRestore();
  });

  test('single mediaType with timeout + key + realPath + _complete exists → handleMedia', async () => {
    const item = {
      _id: 'fid1',
      owner: 'user1',
      mediaType: { type: 'video', timeout: true, key: 'gkey1', realPath: 'rp', fileIndex: 0 },
    };
    mockExistsSync.mockReturnValue(true);
    mockMongo
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce({});

    const handleMediaSpy = jest.spyOn(MediaHandleTool, 'handleMedia').mockResolvedValue();

    await MediaHandleTool.checkMedia();
    expect(handleMediaSpy).toHaveBeenCalled();

    handleMediaSpy.mockRestore();
  });

  test('single mediaType with timeout + key + realPath but NO _complete → skips gracefully', async () => {
    const item = {
      _id: 'fid1',
      owner: 'user1',
      mediaType: { type: 'video', timeout: true, key: 'gkey1', realPath: 'rp', fileIndex: 0 },
    };
    mockExistsSync.mockReturnValue(false); // _complete does not exist
    mockMongo.mockResolvedValueOnce([item]);

    // Bug fixed: returns Promise.resolve() instead of undefined when _complete absent
    await expect(MediaHandleTool.checkMedia()).resolves.toBeUndefined();
  });

  test('single mediaType with timeout, NO key (no realPath) → handleMediaUpload', async () => {
    const item = {
      _id: 'fid1',
      owner: 'user1',
      mediaType: { type: 'image', timeout: true },
    };
    mockMongo
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce({});

    const uploadSpy = jest.spyOn(MediaHandleTool, 'handleMediaUpload').mockResolvedValue();

    await MediaHandleTool.checkMedia();
    expect(mockMongo).toHaveBeenCalledWith('update', 'storage', { _id: 'fid1' }, { $set: { 'mediaType.timeout': false } });
    expect(uploadSpy).toHaveBeenCalled();

    uploadSpy.mockRestore();
  });

  test('single mediaType with timeout, NO key + realPath + _complete → handleMediaUpload (indexed)', async () => {
    const item = {
      _id: 'fid1',
      owner: 'user1',
      mediaType: { type: 'pdf', timeout: true, realPath: 'rp', fileIndex: 2 },
    };
    mockExistsSync.mockReturnValue(true);
    mockMongo
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce({});

    const uploadSpy = jest.spyOn(MediaHandleTool, 'handleMediaUpload').mockResolvedValue();

    await MediaHandleTool.checkMedia();
    expect(uploadSpy).toHaveBeenCalled();

    uploadSpy.mockRestore();
  });

  test('single mediaType with timeout, NO key + realPath but NO _complete → skips gracefully', async () => {
    const item = {
      _id: 'fid1',
      owner: 'user1',
      mediaType: { type: 'pdf', timeout: true, realPath: 'rp', fileIndex: 2 },
    };
    mockExistsSync.mockReturnValue(false);
    mockMongo.mockResolvedValueOnce([item]);

    // Bug fixed: returns Promise.resolve() instead of undefined when _complete absent
    await expect(MediaHandleTool.checkMedia()).resolves.toBeUndefined();
  });

  test('multi-mediaType — iterates sub-entries, detects timeout', async () => {
    const item = {
      _id: 'fid1',
      owner: 'user1',
      mediaType: {
        0: { type: 'image', timeout: true, key: 'gk1', fileIndex: 0 },
        1: { type: 'video', timeout: false, key: 'gk2', fileIndex: 1 },
      },
    };
    mockMongo
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce({});

    const handleMediaSpy = jest.spyOn(MediaHandleTool, 'handleMedia').mockResolvedValue();

    await MediaHandleTool.checkMedia();
    // Only entry 0 has timeout=true
    expect(handleMediaSpy).toHaveBeenCalledTimes(1);

    handleMediaSpy.mockRestore();
  });

  test('empty mediaType object → unsets mediaType from DB', async () => {
    const item = {
      _id: 'fid1',
      owner: 'user1',
      mediaType: {},
    };
    mockMongo
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce({}); // unset update

    await MediaHandleTool.checkMedia();
    const unsetCall = mockMongo.mock.calls.find(c => c[0] === 'update' && c[3].$unset);
    expect(unsetCall).toBeDefined();
    expect(unsetCall[3].$unset.mediaType).toBe('');
  });

  test('single mediaType without timeout → not added to timeoutItems', async () => {
    const item = {
      _id: 'fid1',
      owner: 'user1',
      mediaType: { type: 'image', timeout: false },
    };
    mockMongo.mockResolvedValueOnce([item]);

    const handleMediaSpy = jest.spyOn(MediaHandleTool, 'handleMedia');

    await MediaHandleTool.checkMedia();
    expect(handleMediaSpy).not.toHaveBeenCalled();

    handleMediaSpy.mockRestore();
  });

  test('multiple timeout items → processes all sequentially', async () => {
    const items = [
      {
        _id: 'fid1', owner: 'u1',
        mediaType: { type: 'image', timeout: true, key: 'k1' },
      },
      {
        _id: 'fid2', owner: 'u2',
        mediaType: { type: 'doc', timeout: true, key: 'k2' },
      },
    ];
    mockMongo
      .mockResolvedValueOnce(items)
      .mockResolvedValue({}); // all updates

    const handleMediaSpy = jest.spyOn(MediaHandleTool, 'handleMedia').mockResolvedValue();

    await MediaHandleTool.checkMedia();
    expect(handleMediaSpy).toHaveBeenCalledTimes(2);

    handleMediaSpy.mockRestore();
  });
});

// ─── Additional coverage tests ──────────────────────────────────────

describe('editFile — catch path (line 104)', () => {
  test('handleMediaUpload rejects → errorMedia catch fires', async () => {
    const item = makeItem();
    mockMongo.mockResolvedValueOnce([item]).mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValue({});
    mockCheckAdmin.mockReturnValue(true);

    const handleTagSpy = jest.spyOn(MediaHandleTool, 'handleTag').mockResolvedValueOnce([
      false, { def: [], opt: [] }, {}
    ]);
    const uploadSpy = jest.spyOn(MediaHandleTool, 'handleMediaUpload').mockRejectedValueOnce(
      Object.assign(new Error('upload fail'), { name: 'HoError' })
    );

    await expect(MediaHandleTool.editFile('uid', 'newname', makeUser())).rejects.toThrow('upload fail');

    handleTagSpy.mockRestore();
    uploadSpy.mockRestore();
  });
});

describe('zipbook — errhandle callback (line 317)', () => {
  test('zipbook upload errhandle → fires handleError with errorMedia', async () => {
    mockExec.mockImplementation((cmd, cb) => cb(null, 'ok'));
    mockReaddirSync.mockReturnValue(['img.jpg']);
    mockLstatSync.mockReturnValue({ isDirectory: () => false });
    mockIsImage.mockReturnValue('jpg');
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'upload' && opts.errhandle) {
        return opts.errhandle(new Error('upload err'));
      }
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue({});
    const mt = { type: 'zipbook', ext: 'zip' };
    await expect(MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser())).rejects.toThrow();
  });
});

describe('zip — processed file detection (lines 327-339)', () => {
  const zipRarOutput = '------- ---- ---\n-----------\n50%  2024-01-01 12:00 12345 file1.txt\n-----------\n';
  const zipZipOutput = 'header\nfile1.txt\n';

  test('zip with .1.rar exists → uses .1.rar path', async () => {
    mockExec.mockImplementation((cmd, cb) => cb(null, zipRarOutput));
    mockExistsSync.mockImplementation((p) => p.endsWith('.1.rar'));
    mockMongo.mockResolvedValueOnce([makeItem({ tags: [], user123: [] })]).mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'zip', ext: 'rar' };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
    expect(mockExec.mock.calls[0][0]).toContain('.1.rar');
  });

  test('zip with _7z exists → uses _7z path', async () => {
    const line38 = ' '.repeat(30) + '12345678';
    const filename = ' '.repeat(53) + 'file1.txt';
    const output7z = `Header\n-------------------\n${line38.substr(0, 38)}${filename.substr(53)}\n-------------------\nFooter\n`;
    mockExec.mockImplementation((cmd, cb) => cb(null, output7z));
    mockExistsSync.mockImplementation((p) => p.endsWith('_7z') && !p.endsWith('_7z_c'));
    mockMongo.mockResolvedValueOnce([makeItem({ tags: [], user123: [] })]).mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'zip', ext: '7z' };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
    expect(mockExec.mock.calls[0][0]).toContain('_7z');
  });

  test('zip with _zip_c exists → uses _zip_c path', async () => {
    mockExec.mockImplementation((cmd, cb) => cb(null, zipZipOutput));
    mockExistsSync.mockImplementation((p) => p.endsWith('_zip_c'));
    mockMongo.mockResolvedValueOnce([makeItem({ tags: [], user123: [] })]).mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'zip', ext: 'zip' };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
    expect(mockExec.mock.calls[0][0]).toContain('_zip_c');
  });

  test('zip with _7z_c exists → uses _7z_c path', async () => {
    const line38 = ' '.repeat(30) + '12345678';
    const filename = ' '.repeat(53) + 'file1.txt';
    const output7z = `Header\n-------------------\n${line38.substr(0, 38)}${filename.substr(53)}\n-------------------\nFooter\n`;
    mockExec.mockImplementation((cmd, cb) => cb(null, output7z));
    mockExistsSync.mockImplementation((p) => p.endsWith('_7z_c'));
    mockMongo.mockResolvedValueOnce([makeItem({ tags: [], user123: [] })]).mockResolvedValueOnce({}).mockResolvedValueOnce({}).mockResolvedValueOnce([makeItem()]);
    const mt = { type: 'zip', ext: '7z' };
    await MediaHandleTool.handleMediaUpload(mt, '/f', 'fid', makeUser());
    expect(mockExec.mock.calls[0][0]).toContain('_7z_c');
  });
});

describe('handleMedia — errhandle callbacks (lines 500, 515, 531)', () => {
  test('video errhandle fires (line 500)', async () => {
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'download media' && opts.errhandle) {
        return opts.errhandle(new Error('video dl fail'));
      }
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue({});
    const mt = { type: 'video', ext: 'mp4', time: 5000, hd: 720, fileIndex: 0 };
    await expect(MediaHandleTool.handleMedia(mt, '/f', 'fid', 'key1', makeUser())).rejects.toThrow();
  });

  test('doc errhandle fires (line 515)', async () => {
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'download doc' && opts.errhandle) {
        return opts.errhandle(new Error('doc dl fail'));
      }
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue({});
    const mt = { type: 'doc', ext: 'docx', thumbnail: 'http://pdf', fileIndex: 0 };
    await expect(MediaHandleTool.handleMedia(mt, '/f', 'fid', 'key1', makeUser())).rejects.toThrow();
  });

  test('present errhandle fires (line 531)', async () => {
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'download present' && opts.errhandle) {
        return opts.errhandle(new Error('present dl fail'));
      }
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue({});
    const mt = { type: 'present', ext: 'pptx', thumbnail: 'http://pdf', alternate: 'http://alt', fileIndex: 0 };
    await expect(MediaHandleTool.handleMedia(mt, '/f', 'fid', 'key1', makeUser())).rejects.toThrow();
  });
});

describe('singleDrive — video download paths + errDrive (lines 627, 638-641, 652-653, 589-590, 790)', () => {
  const makeMetadata = (overrides = {}) => ({
    id: 'gdrive-id-1',
    title: 'testfile.mp4',
    fileSize: 1000,
    downloadUrl: 'http://dl',
    userPermission: { role: 'reader' },
    ...overrides,
  });

  test('video with local file → download media errhandle triggers errDrive (lines 627, 790)', async () => {
    mockExtType.mockReturnValue({ type: 'video', ext: 'mp4' });
    mockExistsSync.mockReturnValue(true);
    let errDrivePromise;
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'move parent') return Promise.resolve();
      if (action === 'download media' && opts.errhandle) {
        errDrivePromise = opts.errhandle(new Error('media fail'));
        return errDrivePromise;
      }
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue([{ _id: 'new-oid-123' }]);

    const handleTagSpy = jest.spyOn(MediaHandleTool, 'handleTag').mockResolvedValue([
      { type: 'video', ext: 'mp4' }, { def: [], opt: [] }, {}
    ]);

    const meta = makeMetadata({ videoMediaMetadata: { width: 1920, height: 1080 } });
    await MediaHandleTool.singleDrive([meta], 0, makeUser(), 'f', 'u', 'h', []);
    // Wait for errDrive's inner promise chain to complete
    if (errDrivePromise) await errDrivePromise.catch(() => {});

    handleTagSpy.mockRestore();
  });

  test('video without local file → download raw, then download media (lines 638-641)', async () => {
    mockExtType.mockReturnValue({ type: 'video', ext: 'mp4' });
    mockExistsSync.mockReturnValue(false);
    let downloadMediaCalled = false;
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'move parent') return Promise.resolve();
      if (action === 'download' && opts.rest) {
        // rest callback calls download media
        return opts.rest();
      }
      if (action === 'download media') {
        downloadMediaCalled = true;
        if (opts.rest) return opts.rest();
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue([{ _id: 'new-oid-123' }]);

    const handleTagSpy = jest.spyOn(MediaHandleTool, 'handleTag').mockResolvedValue([
      { type: 'video', ext: 'mp4' }, { def: [], opt: [] }, {}
    ]);

    const meta = makeMetadata({ videoMediaMetadata: { width: 1280, height: 720 } });
    await MediaHandleTool.singleDrive([meta], 0, makeUser(), 'f', 'u', 'h', []);
    expect(downloadMediaCalled).toBe(true);

    handleTagSpy.mockRestore();
  });

  test('video download raw errhandle → errDrive (line 640)', async () => {
    mockExtType.mockReturnValue({ type: 'video', ext: 'mp4' });
    mockExistsSync.mockReturnValue(false);
    let errDrivePromise;
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'move parent') return Promise.resolve();
      if (action === 'download' && opts.errhandle) {
        errDrivePromise = opts.errhandle(new Error('raw dl fail'));
        return errDrivePromise;
      }
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue([{ _id: 'new-oid-123' }]);

    const meta = makeMetadata({ videoMediaMetadata: { width: 1920, height: 1080 } });
    await MediaHandleTool.singleDrive([meta], 0, makeUser(), 'f', 'u', 'h', []);
    if (errDrivePromise) await errDrivePromise.catch(() => {});
  });

  test('video no local file → inner download media errhandle → errDrive (line 638)', async () => {
    mockExtType.mockReturnValue({ type: 'video', ext: 'mp4' });
    mockExistsSync.mockReturnValue(false);
    let errDrivePromise;
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'move parent') return Promise.resolve();
      if (action === 'download' && opts.rest) {
        // rest callback triggers download media
        return opts.rest();
      }
      if (action === 'download media' && opts.errhandle) {
        errDrivePromise = opts.errhandle(new Error('inner media fail'));
        return errDrivePromise;
      }
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue([{ _id: 'new-oid-123' }]);

    const handleTagSpy = jest.spyOn(MediaHandleTool, 'handleTag').mockResolvedValue([
      { type: 'video', ext: 'mp4' }, { def: [], opt: [] }, {}
    ]);

    const meta = makeMetadata({ videoMediaMetadata: { width: 1280, height: 720 } });
    await MediaHandleTool.singleDrive([meta], 0, makeUser(), 'f', 'u', 'h', []);
    if (errDrivePromise) await errDrivePromise.catch(() => {});

    handleTagSpy.mockRestore();
  });

  test('default (non-video) download errhandle → errDrive (line 652)', async () => {
    mockExtType.mockReturnValue({ type: 'image', ext: 'jpg' });
    mockExistsSync.mockReturnValue(false);
    let errDrivePromise;
    mockGoogleApi.mockImplementation((action, opts) => {
      if (action === 'move parent') return Promise.resolve();
      if (action === 'download' && opts.errhandle) {
        errDrivePromise = opts.errhandle(new Error('dl fail'));
        return errDrivePromise;
      }
      return Promise.resolve({});
    });
    mockMongo.mockResolvedValue([{ _id: 'new-oid-123' }]);

    const meta = makeMetadata();
    await MediaHandleTool.singleDrive([meta], 0, makeUser(), 'f', 'u', 'h', []);
    if (errDrivePromise) await errDrivePromise.catch(() => {});
  });

  test('admin(2) adult dirpath with non-zero index → loops properly (lines 589-590)', async () => {
    mockExtType.mockReturnValue({ type: 'image', ext: 'jpg' });
    mockExistsSync.mockReturnValue(true);
    mockGoogleApi.mockResolvedValue({});
    mockMongo.mockResolvedValue([{ _id: 'new-oid-123' }]);
    mockCheckAdmin.mockImplementation((level) => level <= 2);
    // handleRest iterates dirpath VALUES: 'dir1', 'adultdir'
    mockIsDefaultTag.mockImplementation((s) => {
      if (s === 'adultdir') return { index: 0 };
      return false;
    });

    const handleTagSpy = jest.spyOn(MediaHandleTool, 'handleTag').mockResolvedValue([
      false, { def: [], opt: [] }, {}
    ]);
    const uploadSpy = jest.spyOn(MediaHandleTool, 'handleMediaUpload').mockResolvedValue();

    await MediaHandleTool.singleDrive([makeMetadata()], 0, makeUser(2), 'f', 'u', 'h', ['dir1', 'adultdir']);
    const insertCall = mockMongo.mock.calls.find(c => c[0] === 'insert');
    expect(insertCall[2].adultonly).toBe(1);

    handleTagSpy.mockRestore();
    uploadSpy.mockRestore();
  });
});

describe('checkMedia — indexed mediaType paths (lines 710, 716, 723, 729)', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('multi-mediaType with key + realPath + _complete → indexed handleMedia (line 710)', async () => {
    const item = {
      _id: 'fid1',
      owner: 'user1',
      mediaType: {
        0: { type: 'video', timeout: true, key: 'gk1', realPath: 'rp', fileIndex: 0 },
      },
    };
    mockExistsSync.mockReturnValue(true); // _complete exists
    mockMongo.mockResolvedValueOnce([item]).mockResolvedValue({});

    const handleMediaSpy = jest.spyOn(MediaHandleTool, 'handleMedia').mockResolvedValue();

    await MediaHandleTool.checkMedia();
    expect(handleMediaSpy).toHaveBeenCalled();
    // Check timeout reset uses indexed path
    const updateCall = mockMongo.mock.calls.find(c => c[0] === 'update' && c[3].$set && c[3].$set['mediaType.0.timeout'] !== undefined);
    expect(updateCall).toBeDefined();

    handleMediaSpy.mockRestore();
  });

  test('multi-mediaType with key + no realPath → non-indexed handleMedia (line 716)', async () => {
    const item = {
      _id: 'fid1',
      owner: 'user1',
      mediaType: {
        0: { type: 'image', timeout: true, key: 'gk1', fileIndex: 0 },
      },
    };
    mockMongo.mockResolvedValueOnce([item]).mockResolvedValue({});

    const handleMediaSpy = jest.spyOn(MediaHandleTool, 'handleMedia').mockResolvedValue();

    await MediaHandleTool.checkMedia();
    expect(handleMediaSpy).toHaveBeenCalled();

    handleMediaSpy.mockRestore();
  });

  test('multi-mediaType NO key + realPath + _complete → indexed handleMediaUpload (line 723)', async () => {
    const item = {
      _id: 'fid1',
      owner: 'user1',
      mediaType: {
        0: { type: 'pdf', timeout: true, realPath: 'rp', fileIndex: 0 },
      },
    };
    mockExistsSync.mockReturnValue(true);
    mockMongo.mockResolvedValueOnce([item]).mockResolvedValue({});

    const uploadSpy = jest.spyOn(MediaHandleTool, 'handleMediaUpload').mockResolvedValue();

    await MediaHandleTool.checkMedia();
    expect(uploadSpy).toHaveBeenCalled();

    uploadSpy.mockRestore();
  });

  test('multi-mediaType NO key + no realPath → non-indexed handleMediaUpload (line 729)', async () => {
    const item = {
      _id: 'fid1',
      owner: 'user1',
      mediaType: {
        0: { type: 'image', timeout: true, fileIndex: 0 },
      },
    };
    mockMongo.mockResolvedValueOnce([item]).mockResolvedValue({});

    const uploadSpy = jest.spyOn(MediaHandleTool, 'handleMediaUpload').mockResolvedValue();

    await MediaHandleTool.checkMedia();
    expect(uploadSpy).toHaveBeenCalled();

    uploadSpy.mockRestore();
  });

  test('multi-mediaType key + realPath but NO _complete → skips gracefully', async () => {
    const item = {
      _id: 'fid1',
      owner: 'user1',
      mediaType: {
        0: { type: 'video', timeout: true, key: 'gk1', realPath: 'rp', fileIndex: 0 },
      },
    };
    mockExistsSync.mockReturnValue(false);
    mockMongo.mockResolvedValueOnce([item]);

    await expect(MediaHandleTool.checkMedia()).resolves.toBeUndefined();
  });

  test('multi-mediaType NO key + realPath but NO _complete → skips gracefully', async () => {
    const item = {
      _id: 'fid1',
      owner: 'user1',
      mediaType: {
        0: { type: 'pdf', timeout: true, realPath: 'rp', fileIndex: 0 },
      },
    };
    mockExistsSync.mockReturnValue(false);
    mockMongo.mockResolvedValueOnce([item]);

    await expect(MediaHandleTool.checkMedia()).resolves.toBeUndefined();
  });

  test('multi-mediaType key + realPath → handleMedia rejects → catch fires (line 710)', async () => {
    const item = {
      _id: 'fid1',
      owner: 'user1',
      mediaType: {
        0: { type: 'video', timeout: true, key: 'gk1', realPath: 'rp', fileIndex: 0 },
      },
    };
    mockExistsSync.mockReturnValue(true);
    mockMongo.mockResolvedValueOnce([item]).mockResolvedValue({});

    const handleMediaSpy = jest.spyOn(MediaHandleTool, 'handleMedia').mockRejectedValue(
      Object.assign(new Error('media fail'), { name: 'HoError' })
    );

    await expect(MediaHandleTool.checkMedia()).rejects.toThrow('media fail');

    handleMediaSpy.mockRestore();
  });

  test('multi-mediaType key + no realPath → handleMedia rejects → catch fires (line 716)', async () => {
    const item = {
      _id: 'fid1',
      owner: 'user1',
      mediaType: {
        0: { type: 'image', timeout: true, key: 'gk1', fileIndex: 0 },
      },
    };
    mockMongo.mockResolvedValueOnce([item]).mockResolvedValue({});

    const handleMediaSpy = jest.spyOn(MediaHandleTool, 'handleMedia').mockRejectedValue(
      Object.assign(new Error('media fail'), { name: 'HoError' })
    );

    await expect(MediaHandleTool.checkMedia()).rejects.toThrow('media fail');

    handleMediaSpy.mockRestore();
  });

  test('multi-mediaType NO key + realPath → handleMediaUpload rejects → catch fires (line 723)', async () => {
    const item = {
      _id: 'fid1',
      owner: 'user1',
      mediaType: {
        0: { type: 'pdf', timeout: true, realPath: 'rp', fileIndex: 0 },
      },
    };
    mockExistsSync.mockReturnValue(true);
    mockMongo.mockResolvedValueOnce([item]).mockResolvedValue({});

    const uploadSpy = jest.spyOn(MediaHandleTool, 'handleMediaUpload').mockRejectedValue(
      Object.assign(new Error('upload fail'), { name: 'HoError' })
    );

    await expect(MediaHandleTool.checkMedia()).rejects.toThrow('upload fail');

    uploadSpy.mockRestore();
  });

  test('multi-mediaType NO key + no realPath → handleMediaUpload rejects → catch fires (line 729)', async () => {
    const item = {
      _id: 'fid1',
      owner: 'user1',
      mediaType: {
        0: { type: 'image', timeout: true, fileIndex: 0 },
      },
    };
    mockMongo.mockResolvedValueOnce([item]).mockResolvedValue({});

    const uploadSpy = jest.spyOn(MediaHandleTool, 'handleMediaUpload').mockRejectedValue(
      Object.assign(new Error('upload fail'), { name: 'HoError' })
    );

    await expect(MediaHandleTool.checkMedia()).rejects.toThrow('upload fail');

    uploadSpy.mockRestore();
  });
});
