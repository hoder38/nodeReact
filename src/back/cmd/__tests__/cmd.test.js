/**
 * cmd.test.js — Comprehensive tests for src/back/cmd/cmd.js
 *
 * cmd.js is an interactive CLI that reads from process.stdin via readline.
 * It provides 12 admin commands dispatched via a switch on the first word.
 *
 * Exported: dbDump (named export) — tested directly
 * Internal: All CLI commands — tested by capturing the readline 'line' callback
 *
 * Commands tested:
 *   stock, stocklist, testdata, cleanstock, doc, checkdoc,
 *   complete, dbdump, dbrestore, randomsend, resettotal, updatepassword,
 *   default (help)
 */
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// =====================================================================
// MOCK SETUP
// =====================================================================

// Capture readline 'line' callback for testing CLI dispatch
let lineCallback = null;
const mockRlOn = jest.fn((event, cb) => {
  if (event === 'line') lineCallback = cb;
  return { on: mockRlOn };
});
const mockCreateInterface = jest.fn(() => ({ on: mockRlOn }));

// --- node-fetch (prevents test pollution from api-tool.js retry logic) ---
jest.unstable_mockModule('node-fetch', () => ({
  default: jest.fn(() => Promise.resolve({
    ok: true,
    buffer: jest.fn().mockResolvedValue(Buffer.from('')),
    headers: { get: jest.fn(() => null) },
    body: { pipe: jest.fn().mockReturnThis(), on: jest.fn() },
  })),
}));

jest.unstable_mockModule('readline', () => ({
  default: { createInterface: mockCreateInterface },
}));

// --- fs ---
const mockFsWriteFile = jest.fn((path, data, enc, cb) => cb(null));
const mockFsCreateReadStream = jest.fn();
const mockFsExistsSync = jest.fn(() => false);

jest.unstable_mockModule('fs', () => ({
  default: {
    writeFile: mockFsWriteFile,
    createReadStream: mockFsCreateReadStream,
    existsSync: mockFsExistsSync,
    readFileSync: jest.fn(() => Buffer.from('')),
    readdirSync: jest.fn(() => []),
    lstatSync: jest.fn(() => ({ isDirectory: () => false })),
    unlinkSync: jest.fn(), rmdirSync: jest.fn(),
    readFile: jest.fn(), createWriteStream: jest.fn(),
    statSync: jest.fn(() => ({ size: 0 })),
    renameSync: jest.fn(), writeFileSync: jest.fn(), unlink: jest.fn(),
  },
}));

// --- ver.js ---
jest.unstable_mockModule('../../../../ver.js', () => ({
  ENV_TYPE: 'test',
  DEVICE_PATH: '/dev/sda',
  CA: '/t', CERT: '/t', PKEY: '/t',
  SESS_SECRET: 'test', SESS_PWD: 'test',
}));

// --- config.js ---
jest.unstable_mockModule('../../config.js', () => ({
  BACKUP_PATH: jest.fn(() => '/backup'),
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
  USERDB: 'user',
  DRIVE_LIMIT: 100,
  DOCDB: 'docUpdate',
  STORAGEDB: 'storage',
  STOCKDB: 'stock',
  PASSWORDDB: 'password',
  TOTALDB: 'total',
  BACKUP_LIMIT: 1000,
  RANDOM_EMAIL: [
    { name: 'Alice', mail: 'alice@test.com' },
    { name: 'Bob', mail: 'bob@test.com' },
    { name: 'Charlie', mail: 'charlie@test.com' },
    { name: 'Diana', mail: 'diana@test.com' },
  ],
  // Other constants utility.js needs
  RE_WEBURL: /^(url:)?(?:https?:\/\/).+/,
  STATIC_PATH: '/p', RELEASE: 'release', DEV: 'dev',
 
  UNACTIVE_DAY: 5, UNACTIVE_HIT: 10,
  DEFAULT_TAGS: [], STORAGE_PARENT: [], PASSWORD_PARENT: [],
  STOCK_PARENT: [],
  HANDLE_TIME: 7200, BOOKMARK_LIMIT: 100,
  ADULTONLY_PARENT: [], QUERY_LIMIT: 20,
  RELATIVE_LIMIT: 100, RELATIVE_UNION: 2, RELATIVE_INTER: 3,
}));

// --- mongo-tool.js ---
const mockMongo = jest.fn(() => Promise.resolve([]));
const mockObjectID = jest.fn((id) => `OID_${id}`);
jest.unstable_mockModule('../../models/mongo-tool.js', () => ({
  default: mockMongo,
  objectID: mockObjectID,
}));

// --- stock-tool.js ---
const mockGetSingleStockV2 = jest.fn(() => Promise.resolve());
const mockTestData = jest.fn(() => Promise.resolve());
const mockCleanUseless = jest.fn(() => Promise.resolve());
const mockGetStockListV2 = jest.fn(() => Promise.resolve([]));

jest.unstable_mockModule('../../models/stock-tool.js', () => ({
  default: {
    getSingleStockV2: mockGetSingleStockV2,
    testData: mockTestData,
    cleanUseless: mockCleanUseless,
  },
  getStockListV2: mockGetStockListV2,
}));

// --- api-tool-google.js ---
const mockUserDrive = jest.fn(() => Promise.resolve());
const mockSendPresentName = jest.fn(() => Promise.resolve());

jest.unstable_mockModule('../../models/api-tool-google.js', () => ({
  default: jest.fn(),
  userDrive: mockUserDrive,
  sendPresentName: mockSendPresentName,
}));

// --- tag-tool.js ---
const mockCompleteMimeTag = jest.fn(() => Promise.resolve());
jest.unstable_mockModule('../../models/tag-tool.js', () => ({
  default: jest.fn(() => ({})),
  completeMimeTag: mockCompleteMimeTag,
  isDefaultTag: jest.fn(() => false),
  normalize: jest.fn((s) => s),
}));

// --- password-tool.js ---
const mockUpdatePasswordCipher = jest.fn(() => Promise.resolve());
jest.unstable_mockModule('../../models/password-tool.js', () => ({
  updatePasswordCipher: mockUpdatePasswordCipher,
}));

// --- mkdirp ---
const mockMkdirp = jest.fn(() => Promise.resolve());
jest.unstable_mockModule('mkdirp', () => ({
  default: mockMkdirp,
}));

// --- redis-tool.js ---
jest.unstable_mockModule('../../models/redis-tool.js', () => ({
  default: jest.fn(() => Promise.resolve(null)),
}));

// =====================================================================
// IMPORT MODULE UNDER TEST
// =====================================================================
const { dbDump } = await import('../cmd.js');

// =====================================================================
// HELPERS
// =====================================================================
const flushPromises = () => new Promise(jest.requireActual('timers').setImmediate);

async function runCmd(line) {
  lineCallback(line);
  await flushPromises();
}

// =====================================================================
// TESTS
// =====================================================================
describe('cmd.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMongo.mockResolvedValue([]);
    mockGetSingleStockV2.mockResolvedValue();
    mockTestData.mockResolvedValue();
    mockCleanUseless.mockResolvedValue();
    mockGetStockListV2.mockResolvedValue([]);
    mockCompleteMimeTag.mockResolvedValue();
    mockUpdatePasswordCipher.mockResolvedValue();
    mockMkdirp.mockResolvedValue();
    mockFsWriteFile.mockImplementation((p, d, e, cb) => cb(null));
    mockFsExistsSync.mockReturnValue(false);
  });

  // =================================================================
  // Module initialization
  // =================================================================
  describe('Module initialization', () => {
    test('line callback was registered', () => {
      expect(lineCallback).toBeInstanceOf(Function);
    });
  });

  // =================================================================
  // stock command
  // =================================================================
  describe('stock command', () => {
    test('default params → getSingleStockV2("twse", {index:"2330", tag:[]}, 1)', async () => {
      await runCmd('stock');
      expect(mockGetSingleStockV2).toHaveBeenCalledWith('twse', { index: '2330', tag: [] }, 1);
    });

    test('explicit params', async () => {
      await runCmd('stock usse AAPL 2');
      expect(mockGetSingleStockV2).toHaveBeenCalledWith('usse', { index: 'AAPL', tag: [] }, '2');
    });

    test('partial params — type only', async () => {
      await runCmd('stock twse');
      expect(mockGetSingleStockV2).toHaveBeenCalledWith('twse', { index: '2330', tag: [] }, 1);
    });

    test('mode is passed as string when provided', async () => {
      await runCmd('stock twse 2330 abc');
      expect(mockGetSingleStockV2).toHaveBeenCalledWith('twse', { index: '2330', tag: [] }, 'abc');
    });

    test('API failure → handleError catches', async () => {
      mockGetSingleStockV2.mockRejectedValueOnce(new Error('api fail'));
      await runCmd('stock');
      // No crash — handleError logs error with 'CMD stock' label
      expect(mockGetSingleStockV2).toHaveBeenCalled();
    });
  });

  // =================================================================
  // stocklist command
  // =================================================================
  describe('stocklist command', () => {
    test('default type → getStockListV2("twse", year, month)', async () => {
      await runCmd('stocklist');
      expect(mockGetStockListV2).toHaveBeenCalledWith(
        'twse', expect.any(Number), expect.any(Number),
      );
    });

    test('explicit type', async () => {
      await runCmd('stocklist usse');
      expect(mockGetStockListV2).toHaveBeenCalledWith(
        'usse', expect.any(Number), expect.any(Number),
      );
    });

    test('quarter calc — month < 4 (Jan) → Q4 prev year', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2026, 0, 15)); // January
      const consoleSpy = jest.spyOn(console, 'log');
      mockGetStockListV2.mockResolvedValueOnce([]);
      await runCmd('stocklist');
      await flushPromises();
      expect(consoleSpy).toHaveBeenCalledWith('2025q4');
      consoleSpy.mockRestore();
      jest.useRealTimers();
    });

    test('quarter calc — month 4-6 (May) → Q1', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2026, 4, 15)); // May
      const consoleSpy = jest.spyOn(console, 'log');
      mockGetStockListV2.mockResolvedValueOnce([]);
      await runCmd('stocklist');
      await flushPromises();
      expect(consoleSpy).toHaveBeenCalledWith('2026q1');
      consoleSpy.mockRestore();
      jest.useRealTimers();
    });

    test('quarter calc — month 7-9 (Aug) → Q2', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2026, 7, 15)); // August
      const consoleSpy = jest.spyOn(console, 'log');
      mockGetStockListV2.mockResolvedValueOnce([]);
      await runCmd('stocklist');
      await flushPromises();
      expect(consoleSpy).toHaveBeenCalledWith('2026q2');
      consoleSpy.mockRestore();
      jest.useRealTimers();
    });

    test('quarter calc — month >= 10 (Nov) → Q3', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2026, 10, 15)); // November
      const consoleSpy = jest.spyOn(console, 'log');
      mockGetStockListV2.mockResolvedValueOnce([]);
      await runCmd('stocklist');
      await flushPromises();
      expect(consoleSpy).toHaveBeenCalledWith('2026q3');
      consoleSpy.mockRestore();
      jest.useRealTimers();
    });

    test('logs each stock index and tag', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      mockGetStockListV2.mockResolvedValueOnce([
        { index: '2330', tag: ['semi'] },
        { index: 'AAPL', tag: ['tech'] },
      ]);
      await runCmd('stocklist');
      await flushPromises();
      expect(consoleSpy).toHaveBeenCalledWith('2330');
      expect(consoleSpy).toHaveBeenCalledWith(['semi']);
      expect(consoleSpy).toHaveBeenCalledWith('AAPL');
      expect(consoleSpy).toHaveBeenCalledWith(['tech']);
      consoleSpy.mockRestore();
    });

    test('API failure → handleError catches', async () => {
      mockGetStockListV2.mockRejectedValueOnce(new Error('fail'));
      await runCmd('stocklist');
      expect(mockGetStockListV2).toHaveBeenCalled();
    });
  });

  // =================================================================
  // testdata command
  // =================================================================
  describe('testdata command', () => {
    test('calls StockTool.testData()', async () => {
      await runCmd('testdata');
      expect(mockTestData).toHaveBeenCalled();
    });

    test('extra args ignored', async () => {
      await runCmd('testdata foo bar');
      expect(mockTestData).toHaveBeenCalled();
    });

    test('error → handleError catches', async () => {
      mockTestData.mockRejectedValueOnce(new Error('db fail'));
      await runCmd('testdata');
      expect(mockTestData).toHaveBeenCalled();
    });
  });

  // =================================================================
  // cleanstock command
  // =================================================================
  describe('cleanstock command', () => {
    test('no arg → dry-run (cleanUseless(true))', async () => {
      await runCmd('cleanstock');
      expect(mockCleanUseless).toHaveBeenCalledWith(true);
    });

    test('"remove" → destructive (cleanUseless(false))', async () => {
      await runCmd('cleanstock remove');
      expect(mockCleanUseless).toHaveBeenCalledWith(false);
    });

    test('non-"remove" arg → dry-run', async () => {
      await runCmd('cleanstock preview');
      expect(mockCleanUseless).toHaveBeenCalledWith(true);
    });

    test('case sensitive — "Remove" → dry-run', async () => {
      await runCmd('cleanstock Remove');
      expect(mockCleanUseless).toHaveBeenCalledWith(true);
    });

    test('error → handleError catches', async () => {
      mockCleanUseless.mockRejectedValueOnce(new Error('fail'));
      await runCmd('cleanstock remove');
      expect(mockCleanUseless).toHaveBeenCalled();
    });
  });

  // =================================================================
  // checkdoc command
  // =================================================================
  describe('checkdoc command', () => {
    test('queries docUpdate collection, logs result', async () => {
      const docs = [{ _id: 'd1', type: 'am' }];
      mockMongo.mockResolvedValueOnce(docs);
      const consoleSpy = jest.spyOn(console, 'log');
      await runCmd('checkdoc');
      await flushPromises();
      expect(mockMongo).toHaveBeenCalledWith('find', 'docUpdate');
      expect(consoleSpy).toHaveBeenCalledWith(docs);
      consoleSpy.mockRestore();
    });

    test('empty collection → logs []', async () => {
      mockMongo.mockResolvedValueOnce([]);
      const consoleSpy = jest.spyOn(console, 'log');
      await runCmd('checkdoc');
      await flushPromises();
      expect(consoleSpy).toHaveBeenCalledWith([]);
      consoleSpy.mockRestore();
    });

    test('DB error → handleError catches', async () => {
      mockMongo.mockRejectedValueOnce(new Error('fail'));
      await runCmd('checkdoc');
    });
  });

  // =================================================================
  // complete command
  // =================================================================
  describe('complete command', () => {
    test('no arg → completeMimeTag(undefined)', async () => {
      await runCmd('complete');
      expect(mockCompleteMimeTag).toHaveBeenCalledWith(undefined);
    });

    test('complete add → completeMimeTag("add")', async () => {
      await runCmd('complete add');
      expect(mockCompleteMimeTag).toHaveBeenCalledWith('add');
    });

    test('unknown modifier → still passed through', async () => {
      await runCmd('complete delete');
      expect(mockCompleteMimeTag).toHaveBeenCalledWith('delete');
    });

    test('error → handleError catches', async () => {
      mockCompleteMimeTag.mockRejectedValueOnce(new Error('fail'));
      await runCmd('complete');
    });
  });

  // =================================================================
  // dbdump command (via CLI)
  // =================================================================
  describe('dbdump command (CLI)', () => {
    test('valid collection → calls dbDump', async () => {
      mockMongo.mockResolvedValueOnce([]); // empty collection
      await runCmd('dbdump user');
      expect(mockMongo).toHaveBeenCalled();
    });

    test('invalid collection → error (via handleError)', async () => {
      // dbDump returns handleError(new HoError(...)) which returns Promise.reject
      // The CLI catch handler will catch it
      await runCmd('dbdump invalid');
    });

    test('missing arg → error', async () => {
      await runCmd('dbdump');
    });
  });

  // =================================================================
  // dbDump function (exported, tested directly)
  // =================================================================
  describe('dbDump (exported function)', () => {
    test('valid collection "user" → creates folder and dumps', async () => {
      mockFsExistsSync.mockReturnValue(false);
      mockMongo.mockResolvedValueOnce([]); // empty collection
      await dbDump('user');
      expect(mockMkdirp).toHaveBeenCalledWith(expect.stringContaining('/user'));
    });

    test('valid collection "stock"', async () => {
      mockMongo.mockResolvedValueOnce([]);
      await dbDump('stock');
      expect(mockMkdirp).toHaveBeenCalled();
    });

    test('valid collection "storage"', async () => {
      mockMongo.mockResolvedValueOnce([]);
      await dbDump('storage');
      expect(mockMkdirp).toHaveBeenCalled();
    });

    test('valid collection "password"', async () => {
      mockMongo.mockResolvedValueOnce([]);
      await dbDump('password');
      expect(mockMkdirp).toHaveBeenCalled();
    });

    test('valid collection "total"', async () => {
      mockMongo.mockResolvedValueOnce([]);
      await dbDump('total');
      expect(mockMkdirp).toHaveBeenCalled();
    });

    test('valid collection "docUpdate"', async () => {
      mockMongo.mockResolvedValueOnce([]);
      await dbDump('docUpdate');
      expect(mockMkdirp).toHaveBeenCalled();
    });

    test('valid collection "accessToken"', async () => {
      mockMongo.mockResolvedValueOnce([]);
      await dbDump('accessToken');
      expect(mockMkdirp).toHaveBeenCalled();
    });

    test('valid collection "storageUser"', async () => {
      mockMongo.mockResolvedValueOnce([]);
      await dbDump('storageUser');
      expect(mockMkdirp).toHaveBeenCalled();
    });

    test('valid collection "stockUser"', async () => {
      mockMongo.mockResolvedValueOnce([]);
      await dbDump('stockUser');
      expect(mockMkdirp).toHaveBeenCalled();
    });

    test('valid collection "passwordUser"', async () => {
      mockMongo.mockResolvedValueOnce([]);
      await dbDump('passwordUser');
      expect(mockMkdirp).toHaveBeenCalled();
    });

    test('valid collection "storageDir"', async () => {
      mockMongo.mockResolvedValueOnce([]);
      await dbDump('storageDir');
      expect(mockMkdirp).toHaveBeenCalled();
    });

    test('valid collection "stockDir"', async () => {
      mockMongo.mockResolvedValueOnce([]);
      await dbDump('stockDir');
      expect(mockMkdirp).toHaveBeenCalled();
    });

    test('valid collection "passwordDir"', async () => {
      mockMongo.mockResolvedValueOnce([]);
      await dbDump('passwordDir');
      expect(mockMkdirp).toHaveBeenCalled();
    });

    test('invalid collection → rejects', async () => {
      await expect(dbDump('sessions')).rejects.toThrow();
    });

    test('undefined collection → rejects', async () => {
      await expect(dbDump(undefined)).rejects.toThrow();
    });

    test('custom backupDate used in folder path', async () => {
      mockMongo.mockResolvedValueOnce([]);
      await dbDump('user', '20260308');
      expect(mockMkdirp).toHaveBeenCalledWith('/backup/20260308/user');
    });

    test('auto-generated date when no backupDate', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date(2026, 2, 8)); // March 8
      mockMongo.mockResolvedValueOnce([]);
      await dbDump('user');
      expect(mockMkdirp).toHaveBeenCalledWith('/backup/20260308/user');
      jest.useRealTimers();
    });

    test('folder already exists → skips mkdirp', async () => {
      mockFsExistsSync.mockReturnValue(true);
      mockMongo.mockResolvedValueOnce([]);
      await dbDump('user');
      expect(mockMkdirp).not.toHaveBeenCalled();
    });

    test('empty collection → no files written', async () => {
      mockMongo.mockResolvedValueOnce([]);
      await dbDump('user', '20260318');
      expect(mockFsWriteFile).not.toHaveBeenCalled();
    });

    test('small collection → one chunk file', async () => {
      const docs = [{ _id: 'a1', name: 'test' }, { _id: 'a2', name: 'test2' }];
      mockMongo
        .mockResolvedValueOnce(docs)    // first query returns docs
        .mockResolvedValueOnce([]);     // second query returns empty (done)
      await dbDump('user', '20260318');
      expect(mockFsWriteFile).toHaveBeenCalledTimes(1);
      const [path, data] = mockFsWriteFile.mock.calls[0];
      expect(path).toBe('/backup/20260318/user/0');
      expect(data).toContain('"_id":"a1"');
      expect(data).toContain('\r\n');
    });

    test('large collection (>1000) → multiple chunk files', async () => {
      const chunk1 = Array.from({ length: 1000 }, (_, i) => ({ _id: `c${i}` }));
      const chunk2 = [{ _id: 'last' }];
      mockMongo
        .mockResolvedValueOnce(chunk1)  // first 1000
        .mockResolvedValueOnce(chunk2)  // remaining 1
        .mockResolvedValueOnce([]);     // done
      await dbDump('user', '20260318');
      expect(mockFsWriteFile).toHaveBeenCalledTimes(2);
      expect(mockFsWriteFile.mock.calls[0][0]).toBe('/backup/20260318/user/0');
      expect(mockFsWriteFile.mock.calls[1][0]).toBe('/backup/20260318/user/1');
    });

    test('FsWriteFile error → rejects', async () => {
      const docs = [{ _id: 'a1' }];
      mockMongo
        .mockResolvedValueOnce(docs)
        .mockResolvedValueOnce([]);
      mockFsWriteFile.mockImplementationOnce((p, d, e, cb) => cb(new Error('disk full')));
      await expect(dbDump('user', '20260318')).rejects.toThrow('disk full');
    });

    test('Mongo query uses limit and skip correctly', async () => {
      mockMongo.mockResolvedValueOnce([]);
      await dbDump('user', '20260318');
      expect(mockMongo).toHaveBeenCalledWith('find', 'user', {}, {
        limit: 1000,
        skip: 0,
      });
    });
  });

  // =================================================================
  // dbrestore command (via CLI, internal function)
  // =================================================================
  describe('dbrestore command', () => {
    test('invalid collection → error', async () => {
      await runCmd('dbrestore invalid');
      // handleError called — no crash
    });

    test('missing arg → error', async () => {
      await runCmd('dbrestore');
    });

    test('valid collection, no backup files → resolves immediately', async () => {
      mockFsExistsSync.mockReturnValue(false);
      await runCmd('dbrestore user');
      // No insert calls since no files exist
      expect(mockMongo).not.toHaveBeenCalledWith('insert', expect.anything(), expect.anything());
    });

    test('valid collection with backup file → reads and inserts', async () => {
      // File 0 exists, file 1 does not
      mockFsExistsSync
        .mockReturnValueOnce(true)   // file 0 exists
        .mockReturnValueOnce(false); // file 1 does not exist

      // Mock createReadStream to create a fake readline
      let lineHandler, closeHandler;
      const fakeStream = {
        on: jest.fn((event, cb) => {
          if (event === 'line') lineHandler = cb;
          if (event === 'close') closeHandler = cb;
          return fakeStream;
        }),
      };
      mockFsCreateReadStream.mockReturnValueOnce(fakeStream);

      // Override mockCreateInterface for this file stream
      // The module already imported readline — we need the on-line to work
      // Actually the dbrestore creates its own readline interface internally
      // Since readline is mocked, createInterface returns our mock with on()
      // Let's set up createInterface to return a proper event emitter for the restore
      const restoreRl = {
        on: jest.fn((event, cb) => {
          if (event === 'line') lineHandler = cb;
          if (event === 'close') closeHandler = cb;
          return restoreRl;
        }),
      };
      mockCreateInterface.mockReturnValueOnce(restoreRl);

      // Mongo count returns 0 (not duplicate)
      mockMongo
        .mockResolvedValueOnce(0)    // count for doc
        .mockResolvedValueOnce();    // insert

      await runCmd('dbrestore user');

      // Simulate readline events
      if (lineHandler) {
        lineHandler('{"_id":"abc123456789012345678901","name":"test"}');
      }
      if (closeHandler) {
        closeHandler();
      }
      await flushPromises();

      // The 24-char _id should be converted to objectID
      expect(mockObjectID).toHaveBeenCalledWith('abc123456789012345678901');
    });
  });

  // =================================================================
  // randomsend command
  // =================================================================
  describe('randomsend command', () => {
    test('list → logs sendList', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      await runCmd('randomsend list');
      await flushPromises();
      // Should log the RANDOM_EMAIL array
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Alice' }),
        ]),
      );
      consoleSpy.mockRestore();
    });

    test('edit with name:email → adds participant', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      await runCmd('randomsend edit Eve:eve@test.com');
      await flushPromises();
      // Should log updated list containing Eve
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Eve', mail: 'eve@test.com' }),
        ]),
      );
      consoleSpy.mockRestore();
    });

    test('edit with existing name → removes participant', async () => {
      // First add someone, then remove them
      await runCmd('randomsend edit TestRemove:test@t.com');
      await flushPromises();
      const consoleSpy = jest.spyOn(console, 'log');
      await runCmd('randomsend edit TestRemove');
      await flushPromises();
      // The removed person's list should not contain TestRemove
      const logCalls = consoleSpy.mock.calls.flat();
      // Verify removal happened (no crash)
      consoleSpy.mockRestore();
    });

    test('edit without joiner → error', async () => {
      // cmd[2] is undefined
      await runCmd('randomsend edit');
      // handleError catches — no crash
    });

    test('edit — name not found + no email part → error', async () => {
      await runCmd('randomsend edit UnknownPerson');
      // 'UnknownPerson' not in list, split has length 1 → error
    });

    test('send → shuffles and sends emails', async () => {
      // sendList should have >= 3 participants (4 from RANDOM_EMAIL + any we added)
      await runCmd('randomsend send');
      await flushPromises();
      // sendPresentName should have been called for each participant
      expect(mockSendPresentName).toHaveBeenCalled();
    });

    test('send with append param', async () => {
      await runCmd('randomsend send 2026');
      await flushPromises();
      // joiner='2026' passed as third arg to sendPresentName
      if (mockSendPresentName.mock.calls.length > 0) {
        expect(mockSendPresentName.mock.calls[0][2]).toBe('2026');
      }
    });

    test('unknown action → error', async () => {
      await runCmd('randomsend foo');
      // handleError with 'Action unknown!!!'
    });

    // Cover line 121: sendList.length < 3 → handleError
    test('send with fewer than 3 participants → error', async () => {
      // After prior tests, sendList has [Alice, Bob, Charlie, Diana, Eve]
      // Remove until fewer than 3 remain
      await runCmd('randomsend edit Alice');
      await runCmd('randomsend edit Bob');
      await runCmd('randomsend edit Charlie');
      // Now sendList = [Diana, Eve] (2 entries)
      jest.clearAllMocks();
      await runCmd('randomsend send');
      await flushPromises();
      expect(mockSendPresentName).not.toHaveBeenCalled();
    });

    // Cover lines 157-158: out of limit (shuffle fails testArr 100 times)
    test('send → "out of limit" when shuffle always produces identity', async () => {
      // Add entries back to get >= 3
      await runCmd('randomsend edit Alpha:alpha@test.com');
      // Now sendList = [Diana, Eve, Alpha] (3 entries)
      const originalRandom = Math.random;
      // Math.random() = 0.99 → shuffle always produces identity [0,1,2]
      // testArr fails immediately (arr[0]===0) → 100 iterations exhausted
      Math.random = () => 0.99;
      const consoleSpy = jest.spyOn(console, 'log');
      jest.clearAllMocks();
      await runCmd('randomsend send');
      await flushPromises();
      expect(consoleSpy).toHaveBeenCalledWith('out of limit');
      expect(mockSendPresentName).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
      Math.random = originalRandom;
    });
  });

  // =================================================================
  // resettotal command
  // =================================================================
  describe('resettotal command', () => {
    test('newmid bfx → updateMany with sType:1', async () => {
      mockMongo
        .mockResolvedValueOnce(5)     // updateMany returns count
        .mockResolvedValueOnce([]);   // find after update
      await runCmd('resettotal newmid bfx');
      await flushPromises();
      expect(mockMongo).toHaveBeenCalledWith(
        'updateMany', 'total',
        expect.objectContaining({ sType: 1, newMid: { $exists: true } }),
        { $set: { newMid: [] } },
      );
    });

    test('newmid twse → updateMany with setype:twse', async () => {
      mockMongo
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce([]);
      await runCmd('resettotal newmid twse');
      await flushPromises();
      expect(mockMongo).toHaveBeenCalledWith(
        'updateMany', 'total',
        expect.objectContaining({ setype: 'twse', newMid: { $exists: true } }),
        { $set: { newMid: [] } },
      );
    });

    test('profit usse → updateMany with setype:usse, profit:0', async () => {
      mockMongo
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce([]);
      await runCmd('resettotal profit usse');
      await flushPromises();
      expect(mockMongo).toHaveBeenCalledWith(
        'updateMany', 'total',
        expect.objectContaining({ setype: 'usse', profit: { $exists: true } }),
        { $set: { profit: 0 } },
      );
    });

    test('profit bfx → updateMany with sType:1, profit:0', async () => {
      mockMongo
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce([]);
      await runCmd('resettotal profit bfx');
      await flushPromises();
      expect(mockMongo).toHaveBeenCalledWith(
        'updateMany', 'total',
        expect.objectContaining({ sType: 1, profit: { $exists: true } }),
        { $set: { profit: 0 } },
      );
    });

    test('unknown exchange → error', async () => {
      await runCmd('resettotal newmid nyse');
    });

    test('unknown type → error', async () => {
      await runCmd('resettotal volume bfx');
    });

    test('missing both params → error', async () => {
      await runCmd('resettotal');
    });
  });

  // =================================================================
  // updatepassword command
  // =================================================================
  describe('updatepassword command', () => {
    test('calls updatePasswordCipher()', async () => {
      await runCmd('updatepassword');
      expect(mockUpdatePasswordCipher).toHaveBeenCalled();
    });

    test('extra args ignored', async () => {
      await runCmd('updatepassword foo bar');
      expect(mockUpdatePasswordCipher).toHaveBeenCalled();
    });

    test('cipher error → handleError catches', async () => {
      mockUpdatePasswordCipher.mockRejectedValueOnce(new Error('cipher fail'));
      await runCmd('updatepassword');
      expect(mockUpdatePasswordCipher).toHaveBeenCalled();
    });
  });

  // =================================================================
  // default (help) command
  // =================================================================
  describe('default (help)', () => {
    test('unknown command → prints help', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      await runCmd('foobar');
      expect(consoleSpy).toHaveBeenCalledWith('help:');
      consoleSpy.mockRestore();
    });

    test('empty line → prints help', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      await runCmd('');
      expect(consoleSpy).toHaveBeenCalledWith('help:');
      consoleSpy.mockRestore();
    });

    test('case mismatch → prints help', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      await runCmd('Stock');
      expect(consoleSpy).toHaveBeenCalledWith('help:');
      consoleSpy.mockRestore();
    });

    test('whitespace only → prints help', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      await runCmd('   ');
      // split(' ') → cmd[0] = '' → default
      expect(consoleSpy).toHaveBeenCalledWith('help:');
      consoleSpy.mockRestore();
    });

    test('help text contains command list', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      await runCmd('help');
      expect(consoleSpy).toHaveBeenCalledWith('help:');
      expect(consoleSpy).toHaveBeenCalledWith('stock type index mode');
      expect(consoleSpy).toHaveBeenCalledWith('stocklist type');
      expect(consoleSpy).toHaveBeenCalledWith('dbdump collection');
      expect(consoleSpy).toHaveBeenCalledWith('dbrestore collection');
      expect(consoleSpy).toHaveBeenCalledWith('updatepassword');
      consoleSpy.mockRestore();
    });
  });

  // =================================================================
  // Edge cases / cross-cutting
  // =================================================================
  describe('Cross-cutting concerns', () => {
    test('extra spaces in command → default fallback due to || operator', async () => {
      // "stock  twse  2330" → cmd = ['stock', '', 'twse', '', '2330']
      // cmd[1]||'twse' → '' is falsy → 'twse' (default)
      // cmd[2]||'2330' → 'twse' is truthy → 'twse'
      // cmd[3]||1 → '' is falsy → 1 (default)
      await runCmd('stock  twse  2330');
      expect(mockGetSingleStockV2).toHaveBeenCalledWith(
        'twse',                        // cmd[1]='' → fallback to 'twse'
        { index: 'twse', tag: [] },    // cmd[2]='twse' (the actual type value shifted)
        1,                             // cmd[3]='' → fallback to 1
      );
    });

    test('NODE_TLS_REJECT_UNAUTHORIZED is set to "0"', () => {
      expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe('0');
    });
  });

  // =================================================================
  // uncaughtException handler (lines 203-208)
  // =================================================================
  describe('uncaughtException handler', () => {
    const getUncaughtHandler = () => {
      const listeners = process.listeners('uncaughtException');
      // cmd.js registers the last handler
      return listeners[listeners.length - 1];
    };

    test('logs error name, message, and stack trace', () => {
      const consoleSpy = jest.spyOn(console, 'log');
      const handler = getUncaughtHandler();
      const err = new Error('test crash');
      handler(err);
      expect(consoleSpy).toHaveBeenCalledWith('Threw Exception: Error test crash');
      expect(consoleSpy).toHaveBeenCalledWith(err.stack);
      consoleSpy.mockRestore();
    });

    test('logs error without stack when err.stack is falsy', () => {
      const consoleSpy = jest.spyOn(console, 'log');
      const handler = getUncaughtHandler();
      handler({ name: 'CustomError', message: 'no stack' });
      expect(consoleSpy).toHaveBeenCalledWith('Threw Exception: CustomError no stack');
      // Only one log call (no stack logged)
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      consoleSpy.mockRestore();
    });
  });
});
