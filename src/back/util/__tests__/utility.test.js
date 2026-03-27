/**
 * utility.test.js — Comprehensive tests for src/back/util/utility.js
 *
 * ESM mocking pattern: jest.unstable_mockModule() BEFORE dynamic import().
 * Real modules used: crypto, path, iconv-lite.
 *
 * Run: docker exec -w /app -e NODE_OPTIONS=--experimental-vm-modules reactnode-server \
 *        npx jest src/back/util/__tests__/utility.test.js --no-cache --verbose
 */
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// ─── fs mock state ───────────────────────────────────────────────────
let mockExistsSync, mockReaddirSync, mockLstatSync, mockUnlinkSync,
    mockRmdirSync, mockReadFile, mockWriteFile,
    mockCreateReadStream, mockCreateWriteStream;

// ─── MobileDetect mock state ────────────────────────────────────────
let mockMobileFn;

// ─── jschardet mock state ───────────────────────────────────────────
let mockDetectFn;

// ─── ass-to-vtt mock state ──────────────────────────────────────────
let mockAss2vttFn;

// ─── objectID mock ──────────────────────────────────────────────────
let mockObjectID;

// ─── NAS_PREFIX mock ────────────────────────────────────────────────
let mockNasPrefix;

// ─── Setup mocks BEFORE importing the module under test ─────────────

jest.unstable_mockModule('../../constants.js', () => ({
    RE_WEBURL: /^(url:)?(?:(?:https?|ftp):\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})))(?::\d{2,5})?(?:\/\S*)?$/i,
}));

jest.unstable_mockModule('../../../../ver.js', () => ({
    ENV_TYPE: 'test',
}));

mockNasPrefix = jest.fn(() => '/nas');
jest.unstable_mockModule('../../config.js', () => ({
    NAS_PREFIX: mockNasPrefix,
    default: {},
}));

mockObjectID = jest.fn(id => id);
jest.unstable_mockModule('../../models/mongo-tool.js', () => ({
    default: jest.fn(),
    objectID: mockObjectID,
}));

mockMobileFn = jest.fn(() => null);
jest.unstable_mockModule('mobile-detect', () => ({
    default: class MobileDetect {
        constructor() {}
        mobile() { return mockMobileFn(); }
    },
}));

mockExistsSync = jest.fn();
mockReaddirSync = jest.fn();
mockLstatSync = jest.fn();
mockUnlinkSync = jest.fn();
mockRmdirSync = jest.fn();
mockReadFile = jest.fn();
mockWriteFile = jest.fn();
mockCreateReadStream = jest.fn();
mockCreateWriteStream = jest.fn();

jest.unstable_mockModule('fs', () => ({
    default: {
        existsSync: (...a) => mockExistsSync(...a),
        readdirSync: (...a) => mockReaddirSync(...a),
        lstatSync: (...a) => mockLstatSync(...a),
        unlinkSync: (...a) => mockUnlinkSync(...a),
        rmdirSync: (...a) => mockRmdirSync(...a),
        readFile: (...a) => mockReadFile(...a),
        writeFile: (...a) => mockWriteFile(...a),
        createReadStream: (...a) => mockCreateReadStream(...a),
        createWriteStream: (...a) => mockCreateWriteStream(...a),
    },
    existsSync: (...a) => mockExistsSync(...a),
    readdirSync: (...a) => mockReaddirSync(...a),
    lstatSync: (...a) => mockLstatSync(...a),
    unlinkSync: (...a) => mockUnlinkSync(...a),
    rmdirSync: (...a) => mockRmdirSync(...a),
    readFile: (...a) => mockReadFile(...a),
    writeFile: (...a) => mockWriteFile(...a),
    createReadStream: (...a) => mockCreateReadStream(...a),
    createWriteStream: (...a) => mockCreateWriteStream(...a),
}));

mockDetectFn = jest.fn();
jest.unstable_mockModule('jschardet', () => ({
    default: { detect: (...a) => mockDetectFn(...a) },
}));

mockAss2vttFn = jest.fn();
jest.unstable_mockModule('ass-to-vtt', () => ({
    default: (...a) => mockAss2vttFn(...a),
}));

// ─── Dynamic import of the module under test ────────────────────────
let isValidString, toValidName, userPWCheck, checkAdmin, HoError,
    handleError, showLog, checkLogin, big5Encode, selectRandom,
    getStorageItem, getPasswordItem, getStockItem, getFitnessItem,
    getRankItem, getFileLocation, deleteFolderRecursive, SRT2VTT,
    bufferToString, getJson, torrent2Magnet, sortList, completeZero,
    findTag, convertTimestampToDate, addPre, isEmptyObject;

let consoleSpy;
let cryptoModule;

beforeEach(async () => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.clearAllMocks();

    const mod = await import('../utility.js');
    isValidString = mod.isValidString;
    toValidName = mod.toValidName;
    userPWCheck = mod.userPWCheck;
    checkAdmin = mod.checkAdmin;
    HoError = mod.HoError;
    handleError = mod.handleError;
    showLog = mod.showLog;
    checkLogin = mod.checkLogin;
    big5Encode = mod.big5Encode;
    selectRandom = mod.selectRandom;
    getStorageItem = mod.getStorageItem;
    getPasswordItem = mod.getPasswordItem;
    getStockItem = mod.getStockItem;
    getFitnessItem = mod.getFitnessItem;
    getRankItem = mod.getRankItem;
    getFileLocation = mod.getFileLocation;
    deleteFolderRecursive = mod.deleteFolderRecursive;
    SRT2VTT = mod.SRT2VTT;
    bufferToString = mod.bufferToString;
    getJson = mod.getJson;
    torrent2Magnet = mod.torrent2Magnet;
    sortList = mod.sortList;
    completeZero = mod.completeZero;
    findTag = mod.findTag;
    convertTimestampToDate = mod.convertTimestampToDate;
    addPre = mod.addPre;
    isEmptyObject = mod.isEmptyObject;

    cryptoModule = await import('crypto');
});

afterEach(() => {
    consoleSpy.mockRestore();
    jest.restoreAllMocks();
});

// =====================================================================
// isValidString
// =====================================================================
describe('isValidString', () => {
    // ── name ──
    describe('type=name', () => {
        test('valid name returns trimmed string', () => {
            expect(isValidString('  hello  ', 'name')).toBe('hello');
        });
        test('rejects "."', () => {
            expect(isValidString('.', 'name')).toBe(false);
        });
        test('rejects ".."', () => {
            expect(isValidString('..', 'name')).toBe(false);
        });
        test('rejects illegal chars (backslash)', () => {
            expect(isValidString('a\\b', 'name')).toBe(false);
        });
        test('rejects illegal chars (pipe)', () => {
            expect(isValidString('a|b', 'name')).toBe(false);
        });
        test('rejects whitespace-only', () => {
            expect(isValidString('   ', 'name')).toBe(false);
        });
        test('rejects full-width whitespace-only', () => {
            expect(isValidString('\u3000', 'name')).toBe(false);
        });
        test('allows hyphens and underscores', () => {
            expect(isValidString('my-file_v2', 'name')).toBe('my-file_v2');
        });
        test('rejects strings longer than 500 chars', () => {
            expect(isValidString('a'.repeat(501), 'name')).toBe(false);
        });
        test('accepts 500-char string', () => {
            expect(isValidString('a'.repeat(500), 'name')).toBe('a'.repeat(500));
        });
        test('number input converted to string', () => {
            expect(isValidString(123, 'name')).toBe('123');
        });
    });

    // ── desc ──
    describe('type=desc', () => {
        test('valid desc returns string', () => {
            expect(isValidString('hello world', 'desc')).toBe('hello world');
        });
        test('encodes [[...]] content', () => {
            expect(isValidString('see [[foo bar]]', 'desc')).toBe('see [[foo%20bar]]');
        });
        test('rejects backslash', () => {
            expect(isValidString('a\\b', 'desc')).toBe(false);
        });
        test('allows empty string', () => {
            expect(isValidString('', 'desc')).toBe('');
        });
        test('rejects ampersand', () => {
            expect(isValidString('a&b', 'desc')).toBe(false);
        });
    });

    // ── perm ──
    describe('type=perm', () => {
        test('0 is valid', () => {
            expect(isValidString('0', 'perm')).toBe(0);
        });
        test('31 is valid', () => {
            expect(isValidString('31', 'perm')).toBe(31);
        });
        test('32 is invalid', () => {
            expect(isValidString('32', 'perm')).toBe(false);
        });
        test('negative is invalid', () => {
            expect(isValidString('-1', 'perm')).toBe(false);
        });
        test('number input works', () => {
            expect(isValidString(5, 'perm')).toBe(5);
        });
    });

    // ── parentIndex ──
    describe('type=parentIndex', () => {
        test('1 is valid', () => {
            expect(isValidString('1', 'parentIndex')).toBe(1);
        });
        test('10 is valid', () => {
            expect(isValidString('10', 'parentIndex')).toBe(10);
        });
        test('0 is invalid (Number("0") is falsy)', () => {
            expect(isValidString('0', 'parentIndex')).toBe(false);
        });
        test('11 is invalid', () => {
            expect(isValidString('11', 'parentIndex')).toBe(false);
        });
    });

    // ── int ──
    describe('type=int', () => {
        test('positive number', () => {
            expect(isValidString('42', 'int')).toBe(42);
        });
        test('zero is invalid (falsy)', () => {
            expect(isValidString('0', 'int')).toBe(false);
        });
        test('negative is invalid', () => {
            expect(isValidString('-5', 'int')).toBe(false);
        });
        test('non-numeric is invalid', () => {
            expect(isValidString('abc', 'int')).toBe(false);
        });
    });

    // ── zeroint ──
    describe('type=zeroint', () => {
        test('zero is valid', () => {
            expect(isValidString('0', 'zeroint')).toBe(0);
        });
        test('positive is valid', () => {
            expect(isValidString('7', 'zeroint')).toBe(7);
        });
        test('negative is invalid', () => {
            expect(isValidString('-1', 'zeroint')).toBe(false);
        });
    });

    // ── passwd ──
    describe('type=passwd', () => {
        test('valid 6-char password', () => {
            expect(isValidString('abc123', 'passwd')).toBe('abc123');
        });
        test('valid 20-char password', () => {
            expect(isValidString('a'.repeat(20), 'passwd')).toBe('a'.repeat(20));
        });
        test('too short (5 chars)', () => {
            expect(isValidString('ab12!', 'passwd')).toBe(false);
        });
        test('too long (21 chars)', () => {
            expect(isValidString('a'.repeat(21), 'passwd')).toBe(false);
        });
        test('special chars !@#$%', () => {
            expect(isValidString('Pa$$w0', 'passwd')).toBe('Pa$$w0');
        });
        test('invalid chars', () => {
            expect(isValidString('abc^12', 'passwd')).toBe(false);
        });
    });

    // ── verify ──
    describe('type=verify', () => {
        test('4-digit code', () => {
            expect(isValidString('1234', 'verify')).toBe('1234');
        });
        test('3 digits invalid', () => {
            expect(isValidString('123', 'verify')).toBe(false);
        });
        test('5 digits invalid', () => {
            expect(isValidString('12345', 'verify')).toBe(false);
        });
        test('letters invalid', () => {
            expect(isValidString('abcd', 'verify')).toBe(false);
        });
    });

    // ── altpwd ──
    describe('type=altpwd', () => {
        test('valid alphanumeric 2-char', () => {
            expect(isValidString('ab', 'altpwd')).toBe('ab');
        });
        test('valid with Chinese chars', () => {
            expect(isValidString('密码test', 'altpwd')).toBe('密码test');
        });
        test('valid with dots and underscores', () => {
            expect(isValidString('a.b_c', 'altpwd')).toBe('a.b_c');
        });
        test('too short (1 char)', () => {
            expect(isValidString('a', 'altpwd')).toBe(false);
        });
        test('too long (31 chars)', () => {
            expect(isValidString('a'.repeat(31), 'altpwd')).toBe(false);
        });
    });

    // ── url ──
    describe('type=url', () => {
        test('valid http url', () => {
            const result = isValidString('https://example.com/path', 'url');
            expect(result).toBe(encodeURIComponent('https://example.com/path'));
        });
        test('valid magnet link', () => {
            const magnet = 'magnet:?xt=urn:btih:abcdef1234567890abcdef1234567890abcdef12';
            expect(isValidString(magnet, 'url')).toBe(encodeURIComponent(magnet));
        });
        test('invalid url', () => {
            expect(isValidString('not-a-url', 'url')).toBe(false);
        });
    });

    // ── uid ──
    describe('type=uid', () => {
        test('valid 24-hex string', () => {
            const id = 'abcdef1234567890abcdef12';
            isValidString(id, 'uid');
            expect(mockObjectID).toHaveBeenCalledWith(id);
        });
        test('invalid uid (too short)', () => {
            expect(isValidString('abc123', 'uid')).toBe(false);
        });
        test('object uid with valid toString', () => {
            const obj = { toString: () => 'abcdef1234567890abcdef12' };
            isValidString(obj, 'uid');
            expect(mockObjectID).toHaveBeenCalledWith('abcdef1234567890abcdef12');
        });
        test('object uid with invalid toString', () => {
            const obj = { toString: () => 'short' };
            expect(isValidString(obj, 'uid')).toBe(false);
        });
    });

    // ── email ──
    describe('type=email', () => {
        test('valid email', () => {
            expect(isValidString('user@example.com', 'email')).toBe('user@example.com');
        });
        test('valid email with subdomain', () => {
            expect(isValidString('a@b.c.co', 'email')).toBe('a@b.c.co');
        });
        test('invalid email (no @)', () => {
            expect(isValidString('userexample.com', 'email')).toBe(false);
        });
        test('invalid email (no TLD)', () => {
            expect(isValidString('user@example', 'email')).toBe(false);
        });
    });

    // ── unknown type (fallthrough) ──
    describe('unknown type', () => {
        test('returns false', () => {
            expect(isValidString('hello', 'unknown')).toBe(false);
        });
    });

    // ── non-string, non-number, non-object input ──
    describe('non-string non-number input', () => {
        test('boolean returns false', () => {
            expect(isValidString(true, 'name')).toBe(false);
        });
        test('null returns false', () => {
            expect(isValidString(null, 'name')).toBe(false);
        });
        test('undefined returns false', () => {
            expect(isValidString(undefined, 'name')).toBe(false);
        });
    });
});

// =====================================================================
// toValidName
// =====================================================================
describe('toValidName', () => {
    test('replaces HTML entities with space', () => {
        expect(toValidName('hello&#123;world')).toBe('hello world');
    });
    test('replaces illegal chars with comma', () => {
        expect(toValidName('a|b*c?d')).toBe('a,b,c,d');
    });
    test('whitespace-only becomes "empty"', () => {
        expect(toValidName('   ')).toBe('empty');
    });
    test('full-width whitespace-only becomes "empty"', () => {
        expect(toValidName('\u3000')).toBe('empty');
    });
    test('truncates at 255 chars', () => {
        const long = 'a'.repeat(300);
        expect(toValidName(long).length).toBe(255);
    });
    test('trims leading/trailing whitespace', () => {
        expect(toValidName('  hello  ')).toBe('hello');
    });
});

// =====================================================================
// userPWCheck
// =====================================================================
describe('userPWCheck', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    test('correct password returns true', () => {
        const hash = cryptoModule.createHash('md5').update('secret').digest('hex');
        const user = { _id: 'u1', password: hash };
        expect(userPWCheck(user, 'secret')).toBe(true);
    });

    test('wrong password without cache returns false', () => {
        const user = { _id: 'u2', password: 'wronghash' };
        expect(userPWCheck(user, 'bad')).toBe(false);
    });

    test('wrong password with cache returns true', () => {
        const hash = cryptoModule.createHash('md5').update('secret').digest('hex');
        const user = { _id: 'u3', password: hash };
        userPWCheck(user, 'secret');
        expect(userPWCheck(user, 'wrong')).toBe(true);
    });

    test('cache expires after 70 seconds', () => {
        const hash = cryptoModule.createHash('md5').update('secret').digest('hex');
        const user = { _id: 'u4', password: hash };
        userPWCheck(user, 'secret');
        jest.advanceTimersByTime(70001);
        expect(userPWCheck(user, 'wrong')).toBe(false);
    });
});

// =====================================================================
// checkAdmin
// =====================================================================
describe('checkAdmin', () => {
    test('user.perm=1 with perm=1 → true', () => {
        expect(checkAdmin(1, { perm: 1 })).toBe(true);
    });
    test('user.perm=0 → false', () => {
        expect(checkAdmin(1, { perm: 0 })).toBe(false);
    });
    test('user.perm > perm → false', () => {
        expect(checkAdmin(1, { perm: 2 })).toBe(false);
    });
    test('negative perm → false', () => {
        expect(checkAdmin(1, { perm: -1 })).toBe(false);
    });
    test('user.perm=5 with perm=10 → true', () => {
        expect(checkAdmin(10, { perm: 5 })).toBe(true);
    });
});

// =====================================================================
// HoError
// =====================================================================
describe('HoError', () => {
    test('creates error with message and default code', () => {
        const err = new HoError('test error');
        expect(err.message).toBe('test error');
        expect(err.code).toBe(400);
        expect(err.name).toBe('HoError');
    });
    test('creates error with custom code', () => {
        const err = new HoError('not found', { code: 404 });
        expect(err.code).toBe(404);
    });
    test('default message is "Hoder Message"', () => {
        const err = new HoError();
        expect(err.message).toBe('Hoder Message');
    });
    test('is instanceof Error', () => {
        const err = new HoError('test');
        expect(err instanceof Error).toBe(true);
    });
    test('has stack trace', () => {
        const err = new HoError('test');
        expect(err.stack).toBeDefined();
    });
});

// =====================================================================
// handleError
// =====================================================================
describe('handleError', () => {
    test('type=null returns Promise.reject', async () => {
        const err = new HoError('fail');
        await expect(handleError(err)).rejects.toBe(err);
    });

    test('type=function calls function with err and args', () => {
        const err = new HoError('fail');
        const fn = jest.fn((e, a, b) => `${e.message}-${a}-${b}`);
        const result = handleError(err, fn, 'x', 'y');
        expect(fn).toHaveBeenCalledWith(err, 'x', 'y');
        expect(result).toBe('fail-x-y');
    });

    test('type=string logs and returns undefined', () => {
        const err = new HoError('fail');
        const result = handleError(err, 'MyModule');
        expect(result).toBeUndefined();
    });

    test('type=other (number) logs Unknown type', () => {
        const err = new HoError('fail');
        handleError(err, 42);
        expect(consoleSpy).toHaveBeenCalledWith(42);
    });
});

// =====================================================================
// showLog
// =====================================================================
describe('showLog', () => {
    test('logs url and non-sensitive body fields, calls next', () => {
        const next = jest.fn();
        const req = {
            url: '/api/test',
            body: {
                name: 'John',
                password: 'secret',
                newPwd: 'new',
                conPwd: 'con',
                userPW: 'pw',
                data: 'value',
            },
        };
        showLog(req, next);
        expect(next).toHaveBeenCalled();
        const logged = consoleSpy.mock.calls.map(c => c[0]);
        expect(logged).toContain('/api/test');
        expect(logged).toContain('name: John');
        expect(logged).toContain('data: value');
        expect(logged.some(l => typeof l === 'string' && l.includes('password'))).toBe(false);
        expect(logged.some(l => typeof l === 'string' && l.includes('newPwd'))).toBe(false);
        expect(logged.some(l => typeof l === 'string' && l.includes('conPwd'))).toBe(false);
        expect(logged.some(l => typeof l === 'string' && l.includes('userPW'))).toBe(false);
    });
});

// =====================================================================
// checkLogin
// =====================================================================
describe('checkLogin', () => {
    test('authenticated user → calls next', () => {
        const next = jest.fn();
        const req = {
            isAuthenticated: () => true,
            user: { _id: 'uid123' },
        };
        checkLogin(req, {}, next);
        expect(next).toHaveBeenCalled();
    });

    test('not authenticated, type=0 → throws HoError 401', () => {
        const next = jest.fn();
        const req = {
            isAuthenticated: () => false,
            headers: { 'user-agent': 'Chrome' },
        };
        expect(() => checkLogin(req, {}, next, 0)).toThrow();
        expect(next).not.toHaveBeenCalled();
    });

    test('not authenticated, type=1, mobile + /f/video/ → calls next', () => {
        mockMobileFn.mockReturnValue('iPhone');
        const next = jest.fn();
        const req = {
            isAuthenticated: () => false,
            headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' },
            path: '/f/video/abc',
        };
        checkLogin(req, {}, next, 1);
        expect(next).toHaveBeenCalled();
        mockMobileFn.mockReturnValue(null);
    });

    test('not authenticated, type=1, mobile + /f/subtitle/ → calls next', () => {
        mockMobileFn.mockReturnValue('Android');
        const next = jest.fn();
        const req = {
            isAuthenticated: () => false,
            headers: { 'user-agent': 'Android' },
            path: '/f/subtitle/abc',
        };
        checkLogin(req, {}, next, 1);
        expect(next).toHaveBeenCalled();
        mockMobileFn.mockReturnValue(null);
    });

    test('not authenticated, type=1, mobile + /f/torrent/ → calls next', () => {
        mockMobileFn.mockReturnValue('Android');
        const next = jest.fn();
        const req = {
            isAuthenticated: () => false,
            headers: { 'user-agent': 'Android' },
            path: '/f/torrent/abc',
        };
        checkLogin(req, {}, next, 1);
        expect(next).toHaveBeenCalled();
        mockMobileFn.mockReturnValue(null);
    });

    test('not authenticated, type=1, mobile + other path → throws', () => {
        mockMobileFn.mockReturnValue('iPhone');
        const next = jest.fn();
        const req = {
            isAuthenticated: () => false,
            headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' },
            path: '/other',
        };
        expect(() => checkLogin(req, {}, next, 1)).toThrow();
        mockMobileFn.mockReturnValue(null);
    });

    test('not authenticated, type=1, Firefox UA + /f/video/ → calls next', () => {
        mockMobileFn.mockReturnValue(null);
        const next = jest.fn();
        const req = {
            isAuthenticated: () => false,
            headers: { 'user-agent': 'Mozilla/5.0 Firefox/100' },
            path: '/f/video/abc',
        };
        checkLogin(req, {}, next, 1);
        expect(next).toHaveBeenCalled();
    });

    test('not authenticated, type=1, armv7l UA + /f/video/ → calls next', () => {
        mockMobileFn.mockReturnValue(null);
        const next = jest.fn();
        const req = {
            isAuthenticated: () => false,
            headers: { 'user-agent': 'Linux armv7l' },
            path: '/f/video/abc',
        };
        checkLogin(req, {}, next, 1);
        expect(next).toHaveBeenCalled();
    });

    test('not authenticated, type=1, desktop + no special UA → throws', () => {
        mockMobileFn.mockReturnValue(null);
        const next = jest.fn();
        const req = {
            isAuthenticated: () => false,
            headers: { 'user-agent': 'Chrome/100' },
            path: '/f/video/abc',
        };
        expect(() => checkLogin(req, {}, next, 1)).toThrow();
    });
});

// =====================================================================
// big5Encode
// =====================================================================
describe('big5Encode', () => {
    test('ASCII chars are URI-encoded', () => {
        expect(big5Encode('abc')).toBe('abc');
    });
    test('space is encoded', () => {
        expect(big5Encode(' ')).toBe('%20');
    });
    test('Chinese characters produce Big5 encoding', () => {
        const result = big5Encode('中');
        expect(result).toMatch(/^(%[0-9A-F]{2}){2}$/i);
    });
    test('mixed ASCII and Chinese', () => {
        const result = big5Encode('a中');
        expect(result.startsWith('a')).toBe(true);
        expect(result.length).toBeGreaterThan(1);
    });
});

// =====================================================================
// selectRandom
// =====================================================================
describe('selectRandom', () => {
    test('array input returns valid index', () => {
        const result = selectRandom([1, 1, 1]);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThan(3);
    });

    test('number input creates uniform weights', () => {
        const result = selectRandom(5);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThan(5);
    });

    test('with select_arr returns element from it', () => {
        const result = selectRandom([1, 1, 1], [0, 1, 2]);
        expect([0, 1, 2]).toContain(result);
    });

    test('single-element always returns index 0', () => {
        expect(selectRandom([5])).toBe(0);
    });
});

// =====================================================================
// getStorageItem
// =====================================================================
describe('getStorageItem', () => {
    const adminUser = { perm: 1, _id: { equals: () => false } };

    test('basic item mapping', () => {
        const items = [{
            name: 'test', _id: 'id1', tags: [], recycle: 0,
            owner: 'ownerid', status: 1, utime: 100, count: 5,
            adultonly: 0, first: 0, mediaType: {},
        }];
        const result = getStorageItem(adminUser, items, 0);
        expect(result[0].name).toBe('test');
        expect(result[0].id).toBe('id1');
        expect(result[0].status).toBe(1);
    });

    test('adultonly=1 adds 18+ tag', () => {
        const items = [{
            name: 'a', _id: 'id2', tags: ['t1'], recycle: 0,
            owner: 'o', status: 1, utime: 0, count: 0,
            adultonly: 1, first: 0, mediaType: {},
        }];
        const result = getStorageItem(adminUser, items, 0);
        expect(result[0].tags).toContain('18+');
    });

    test('first=1 adds "first item" tag', () => {
        const items = [{
            name: 'a', _id: 'id3', tags: [], recycle: 0,
            owner: 'o', status: 1, utime: 0, count: 0,
            adultonly: 0, first: 1, mediaType: {},
        }];
        const result = getStorageItem(adminUser, items, 0);
        expect(result[0].tags).toContain('first item');
    });

    test('status 5 → doc:2, status mapped to 2', () => {
        const items = [{
            name: 'a', _id: 'id4', tags: [], recycle: 0,
            owner: 'o', status: 5, utime: 0, count: 0,
            adultonly: 0, first: 0, mediaType: {},
        }];
        const result = getStorageItem(adminUser, items, 0);
        expect(result[0].status).toBe(2);
        expect(result[0].doc).toBe(2);
    });

    test('status 6 → doc:1', () => {
        const items = [{
            name: 'a', _id: 'id5', tags: [], recycle: 0,
            owner: 'o', status: 6, utime: 0, count: 0,
            adultonly: 0, first: 0, mediaType: {},
        }];
        const result = getStorageItem(adminUser, items, 0);
        expect(result[0].doc).toBe(1);
    });

    test('status 10 → doc:3', () => {
        const items = [{
            name: 'a', _id: 'id6', tags: [], recycle: 0,
            owner: 'o', status: 10, utime: 0, count: 0,
            adultonly: 0, first: 0, mediaType: {},
        }];
        const result = getStorageItem(adminUser, items, 0);
        expect(result[0].doc).toBe(3);
    });

    test('optional fields: present, url, thumb, cid, ctitle', () => {
        const items = [{
            name: 'a', _id: 'id7', tags: [], recycle: 0,
            owner: 'o', status: 1, utime: 0, count: 0,
            adultonly: 0, first: 0, mediaType: {},
            present: 'pres', url: 'http://x', thumb: 'th', cid: 'c1', ctitle: 'ct',
        }];
        const result = getStorageItem(adminUser, items, 0);
        expect(result[0].present).toBe('pres');
        expect(result[0].url).toBe('http://x');
        expect(result[0].thumb).toBe('th');
        expect(result[0].cid).toBe('c1');
        expect(result[0].ctitle).toBe('ct');
    });

    test('mediaHandle=1 with mediaType.type truthy', () => {
        const items = [{
            name: 'a', _id: 'id8', tags: [], recycle: 0,
            owner: 'o', status: 1, utime: 0, count: 0,
            adultonly: 0, first: 0,
            mediaType: { type: 'video', complete: 100, timeout: 0 },
        }];
        const result = getStorageItem(adminUser, items, 1);
        expect(result[0].media).toBeDefined();
    });

    test('mediaHandle=1 with mediaType without type (multi-entry)', () => {
        const items = [{
            name: 'a', _id: 'id9', tags: [], recycle: 0,
            owner: 'o', status: 1, utime: 0, count: 0,
            adultonly: 0, first: 0,
            mediaType: {
                '0': { type: 'video', key: 'k1', err: 'e1', timeout: 't1', complete: 'c1' },
            },
        }];
        const result = getStorageItem(adminUser, items, 1);
        expect(result[0].media).toBeDefined();
    });

    test('isOwn true when admin', () => {
        const items = [{
            name: 'a', _id: 'id10', tags: [], recycle: 0,
            owner: 'o', status: 1, utime: 0, count: 0,
            adultonly: 0, first: 0, mediaType: {},
        }];
        const result = getStorageItem(adminUser, items, 0);
        expect(result[0].isOwn).toBe(true);
    });

    test('isOwn for non-admin owner match', () => {
        const ownerId = 'abcdef1234567890abcdef12';
        mockObjectID.mockReturnValueOnce(ownerId);
        const nonAdmin = { perm: 5, _id: { equals: (id) => id === ownerId } };
        const items = [{
            name: 'a', _id: 'id11', tags: [], recycle: 0,
            owner: ownerId, status: 1, utime: 0, count: 0,
            adultonly: 0, first: 0, mediaType: {},
        }];
        const result = getStorageItem(nonAdmin, items, 0);
        expect(result[0].isOwn).toBe(true);
    });

    test('mediaHandle=1 multi-entry with missing optional fields', () => {
        const items = [{
            name: 'a', _id: 'id12', tags: [], recycle: 0,
            owner: 'o', status: 1, utime: 0, count: 0,
            adultonly: 0, first: 0,
            mediaType: {
                '0': { type: 'audio' },
            },
        }];
        const result = getStorageItem(adminUser, items, 1);
        expect(result[0].media).toBeDefined();
    });
});

// =====================================================================
// getPasswordItem
// =====================================================================
describe('getPasswordItem', () => {
    test('maps basic fields', () => {
        const items = [{
            name: 'Gmail', _id: 'p1', tags: ['email'], username: 'user',
            url: 'https://gmail.com', email: 'u@g.com', utime: 100, important: 0,
        }];
        const result = getPasswordItem({}, items);
        expect(result[0].name).toBe('Gmail');
        expect(result[0].important).toBe(false);
    });

    test('important=1 adds tag and sets important:true', () => {
        const items = [{
            name: 'Bank', _id: 'p2', tags: [], username: 'u',
            url: 'https://bank.com', email: 'u@b.com', utime: 0, important: 1,
        }];
        const result = getPasswordItem({}, items);
        expect(result[0].tags).toContain('important');
        expect(result[0].important).toBe(true);
    });
});

// =====================================================================
// getStockItem
// =====================================================================
describe('getStockItem', () => {
    test('admin user gets mapped items', () => {
        const items = [{
            name: 'TSMC', _id: 's1', tags: ['tech'], per: 10, pdr: 5, pbr: 3,
            index: 1, type: 'stock', important: 0,
        }];
        const result = getStockItem({ perm: 1 }, items);
        expect(result[0].profit).toBe(10);
        expect(result[0].safety).toBe(5);
    });

    test('important=1 adds tag', () => {
        const items = [{
            name: 'AAPL', _id: 's2', tags: [], per: 0, pdr: 0, pbr: 0,
            index: 0, type: 'stock', important: 1,
        }];
        const result = getStockItem({ perm: 1 }, items);
        expect(result[0].tags).toContain('important');
    });

    test('non-admin returns empty array', () => {
        expect(getStockItem({ perm: 0 }, [{ name: 'x' }])).toEqual([]);
    });

    test('perm > check returns empty array', () => {
        expect(getStockItem({ perm: 5 }, [{ name: 'x' }])).toEqual([]);
    });
});

// =====================================================================
// getFitnessItem
// =====================================================================
describe('getFitnessItem', () => {
    test('maps fields', () => {
        const items = [{
            name: 'Push-up', _id: 'f1', tags: ['chest'],
            price: 0, count: 20, desc: 'desc', type: 'exercise',
        }];
        const result = getFitnessItem({}, items);
        expect(result[0].name).toBe('Push-up');
        expect(result[0].count).toBe(20);
    });
});

// =====================================================================
// getRankItem
// =====================================================================
describe('getRankItem', () => {
    test('maps fields', () => {
        const items = [{
            name: 'Rank1', _id: 'r1', tags: [], start: 100, type: 'rank',
        }];
        const result = getRankItem({}, items);
        expect(result[0].start).toBe(100);
    });
});

// =====================================================================
// getFileLocation
// =====================================================================
describe('getFileLocation', () => {
    test('deterministic path generation', () => {
        const result = getFileLocation('owner1', 'uid1');
        expect(result).toMatch(/^\/nas\//);
        expect(result).toContain('owner1');
        expect(result).toContain('uid1');
    });

    test('same input produces same output', () => {
        const a = getFileLocation('o', 'u');
        const b = getFileLocation('o', 'u');
        expect(a).toBe(b);
    });

    test('NAS_PREFIX is called with ENV_TYPE', () => {
        getFileLocation('o', 'u');
        expect(mockNasPrefix).toHaveBeenCalledWith('test');
    });
});

// =====================================================================
// deleteFolderRecursive
// =====================================================================
describe('deleteFolderRecursive', () => {
    test('deletes files and directories recursively', () => {
        mockExistsSync.mockReturnValue(true);
        mockReaddirSync
            .mockReturnValueOnce(['file1', 'subdir'])
            .mockReturnValueOnce([]);
        mockLstatSync
            .mockReturnValueOnce({ isDirectory: () => false })
            .mockReturnValueOnce({ isDirectory: () => true });

        deleteFolderRecursive('/tmp/test');

        expect(mockUnlinkSync).toHaveBeenCalledWith('/tmp/test/file1');
        expect(mockRmdirSync).toHaveBeenCalledWith('/tmp/test/subdir');
        expect(mockRmdirSync).toHaveBeenCalledWith('/tmp/test');
    });

    test('does nothing if path does not exist', () => {
        mockExistsSync.mockReturnValue(false);
        deleteFolderRecursive('/nonexistent');
        expect(mockReaddirSync).not.toHaveBeenCalled();
    });
});

// =====================================================================
// SRT2VTT
// =====================================================================
describe('SRT2VTT', () => {
    test('srt conversion writes .vtt file', async () => {
        const srtContent = Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nHello');
        mockDetectFn.mockReturnValue({ encoding: 'utf-8' });
        mockReadFile.mockImplementation((path, cb) => cb(null, srtContent));
        mockWriteFile.mockImplementation((path, data, enc, cb) => cb(null));

        await SRT2VTT('/path/file', 'srt');

        expect(mockReadFile).toHaveBeenCalledWith('/path/file.srt', expect.any(Function));
        expect(mockWriteFile).toHaveBeenCalledWith(
            '/path/file.vtt',
            expect.stringContaining('WEBVTT'),
            'utf8',
            expect.any(Function),
        );
    });

    test('srt conversion replaces commas with dots', async () => {
        const srtContent = Buffer.from('00:00:01,500');
        mockDetectFn.mockReturnValue({ encoding: 'utf-8' });
        mockReadFile.mockImplementation((path, cb) => cb(null, srtContent));
        mockWriteFile.mockImplementation((path, data, enc, cb) => cb(null));

        await SRT2VTT('/path/file', 'srt');

        const writtenData = mockWriteFile.mock.calls[0][1];
        expect(writtenData).toContain('00:00:01.500');
        expect(writtenData).not.toContain(',');
    });

    test('readFile error rejects', async () => {
        mockReadFile.mockImplementation((path, cb) => cb(new Error('read fail')));
        await expect(SRT2VTT('/path/file', 'srt')).rejects.toThrow('read fail');
    });

    test('ass conversion pipes through ass2vtt', async () => {
        const assContent = Buffer.from('[Script Info]\nTitle: Test');
        mockDetectFn.mockReturnValue({ encoding: 'utf-8' });
        mockReadFile.mockImplementation((path, cb) => cb(null, assContent));
        mockWriteFile.mockImplementation((path, data, enc, cb) => cb(null));

        const mockPipe = jest.fn().mockReturnValue({ pipe: jest.fn() });
        const mockOn = jest.fn().mockImplementation((event, cb) => {
            if (event === 'end') cb();
        });
        mockCreateReadStream.mockReturnValue({ pipe: mockPipe, on: mockOn });
        mockAss2vttFn.mockReturnValue('transform-stream');
        mockCreateWriteStream.mockReturnValue('write-stream');
        mockUnlinkSync.mockImplementation(() => {});

        await SRT2VTT('/path/file', 'ass');

        expect(mockWriteFile).toHaveBeenCalledWith(
            '/path/file.sub',
            expect.any(String),
            'utf8',
            expect.any(Function),
        );
    });
});

// =====================================================================
// bufferToString
// =====================================================================
describe('bufferToString', () => {
    test('detected charset → toString', () => {
        mockDetectFn.mockReturnValue({ encoding: 'utf-8' });
        const buf = Buffer.from('hello');
        expect(bufferToString(buf)).toBe('hello');
    });

    test('null charset → "Unknown Charset"', () => {
        mockDetectFn.mockReturnValue(null);
        expect(bufferToString(Buffer.from('x'))).toBe('Unknown Charset');
    });

    test('big5 flag forces big5 decoding', () => {
        mockDetectFn.mockReturnValue({ encoding: 'ascii' });
        const buf = Buffer.from('hello');
        const result = bufferToString(buf, true);
        expect(typeof result).toBe('string');
    });

    test('toString failure falls back to iconv-lite', () => {
        mockDetectFn.mockReturnValue({ encoding: 'windows-874' });
        const buf = Buffer.from('hello');
        const result = bufferToString(buf);
        expect(typeof result).toBe('string');
    });
});

// =====================================================================
// getJson
// =====================================================================
describe('getJson', () => {
    test('valid JSON returns parsed object', () => {
        expect(getJson('{"a":1}')).toEqual({ a: 1 });
    });
    test('invalid JSON returns false', () => {
        expect(getJson('not json')).toBe(false);
    });
    test('valid JSON array', () => {
        expect(getJson('[1,2,3]')).toEqual([1, 2, 3]);
    });
});

// =====================================================================
// torrent2Magnet
// =====================================================================
describe('torrent2Magnet', () => {
    test('infoHash only', () => {
        const result = torrent2Magnet({ infoHash: 'abc123' });
        expect(result).toBe('magnet:?xt=urn:btih:abc123');
    });

    test('with announceList', () => {
        const result = torrent2Magnet({
            infoHash: 'abc',
            announceList: ['http://tracker1.com', 'http://tracker2.com'],
        });
        expect(result).toContain('&tr=');
        expect(result).toContain(encodeURIComponent('http://tracker1.com'));
    });

    test('with announce (fallback)', () => {
        const result = torrent2Magnet({
            infoHash: 'abc',
            announce: ['http://t1.com'],
        });
        expect(result).toContain('&tr=');
    });

    test('missing infoHash returns false', () => {
        expect(torrent2Magnet({})).toBe(false);
    });

    test('announceList capped at 10', () => {
        const trackers = Array.from({ length: 15 }, (_, i) => `http://t${i}.com`);
        const result = torrent2Magnet({ infoHash: 'abc', announceList: trackers });
        const trCount = (result.match(/&tr=/g) || []).length;
        expect(trCount).toBe(10);
    });

    test('announce capped at 10', () => {
        const trackers = Array.from({ length: 15 }, (_, i) => `http://t${i}.com`);
        const result = torrent2Magnet({ infoHash: 'abc', announce: trackers });
        const trCount = (result.match(/&tr=/g) || []).length;
        expect(trCount).toBe(10);
    });
});

// =====================================================================
// sortList
// =====================================================================
describe('sortList', () => {
    test('sorts numerically within same directory', () => {
        const list = ['dir/file10.txt', 'dir/file2.txt', 'dir/file1.txt'];
        const result = sortList(list);
        expect(result).toEqual(['dir/file1.txt', 'dir/file2.txt', 'dir/file10.txt']);
    });

    test('multiple directory groups', () => {
        const list = ['a/2.txt', 'a/1.txt', 'b/3.txt', 'b/1.txt'];
        const result = sortList(list);
        expect(result).toEqual(['a/1.txt', 'a/2.txt', 'b/1.txt', 'b/3.txt']);
    });

    test('files without numbers', () => {
        const list = ['dir/abc.txt', 'dir/xyz.txt'];
        const result = sortList(list);
        expect(result.length).toBe(2);
    });

    test('a has digits but b has none (b.number is null → return 1)', () => {
        // nonum.txt has number=null; 1.txt has number=['1']
        // InsertionSort pivot=1.txt vs sorted=[nonum.txt] → compare(1, nonum): !b.number → true → return 1
        const list = ['dir/nonum.txt', 'dir/1.txt'];
        const result = sortList(list);
        expect(result).toEqual(['dir/nonum.txt', 'dir/1.txt']);
    });

    test('a has more number segments than b (ascending input order hits b.number[i] undefined)', () => {
        // Ascending input order: pivot elements have MORE segments than already-sorted ones
        // InsertionSort: sorted=[1.txt], insert 1-2.txt: compare(1-2, 1) → i=1: !b.number[1] → return 1
        const list = ['dir/1.txt', 'dir/1-2.txt', 'dir/1-2-3.txt'];
        const result = sortList(list);
        expect(result).toEqual(['dir/1.txt', 'dir/1-2.txt', 'dir/1-2-3.txt']);
    });

    test('all number segments equal (return -1 fallthrough)', () => {
        // Two files with identical number segments → falls through loop → return -1
        const list = ['dir/file1a.txt', 'dir/file1b.txt'];
        const result = sortList(list);
        // Both have number=['1'], all segments equal → return -1 → stable order
        expect(result.length).toBe(2);
        expect(result).toContain('dir/file1a.txt');
        expect(result).toContain('dir/file1b.txt');
    });
});

// =====================================================================
// completeZero
// =====================================================================
describe('completeZero', () => {
    test('(5, 3) → "005"', () => {
        expect(completeZero(5, 3)).toBe('005');
    });
    test('(42, 3) → "042"', () => {
        expect(completeZero(42, 3)).toBe('042');
    });
    test('(100, 3) → "100"', () => {
        expect(completeZero(100, 3)).toBe('100');
    });
    test('(7, 1) → "7"', () => {
        expect(completeZero(7, 1)).toBe('7');
    });
    test('(0, 3) → "000"', () => {
        expect(completeZero(0, 3)).toBe('000');
    });
});

// =====================================================================
// findTag
// =====================================================================
describe('findTag', () => {
    test('finds tag by name', () => {
        const node = { children: [
            { type: 'tag', name: 'div', attribs: {} },
            { type: 'tag', name: 'span', attribs: {} },
        ]};
        expect(findTag(node, 'div')).toHaveLength(1);
    });

    test('finds tag with matching id attribute', () => {
        const node = { children: [
            { type: 'tag', name: 'div', attribs: { class: 'main' } },
        ]};
        expect(findTag(node, 'div', 'main')).toHaveLength(1);
    });

    test('id mismatch returns empty', () => {
        const node = { children: [
            { type: 'tag', name: 'div', attribs: { class: 'other' } },
        ]};
        expect(findTag(node, 'div', 'main')).toHaveLength(0);
    });

    test('no tag → extracts text nodes', () => {
        const node = { children: [
            { type: 'text', data: '  hello  ' },
            { type: 'text', data: '   ' },
        ]};
        expect(findTag(node)).toEqual(['hello']);
    });

    test('extracts CDATA comments', () => {
        const node = { children: [
            { type: 'comment', data: '[CDATA[some content]]' },
        ]};
        expect(findTag(node)).toEqual(['some content']);
    });

    test('extracts HTML comments', () => {
        const node = { children: [
            { type: 'comment', data: '<!--inner comment-->' },
        ]};
        expect(findTag(node)).toEqual(['inner comment']);
    });

    test('regular comment text', () => {
        const node = { children: [
            { type: 'comment', data: ' just a comment ' },
        ]};
        expect(findTag(node)).toEqual(['just a comment']);
    });

    test('empty comment ignored', () => {
        const node = { children: [
            { type: 'comment', data: '   ' },
        ]};
        expect(findTag(node)).toEqual([]);
    });

    test('non-array input returns empty', () => {
        expect(findTag({ notAnArray: true })).toEqual([]);
    });

    test('array input (no children wrapper)', () => {
        const items = [
            { type: 'tag', name: 'p', attribs: {} },
        ];
        expect(findTag(items, 'p')).toHaveLength(1);
    });

    test('script type matches', () => {
        const node = { children: [
            { type: 'script', name: 'script', attribs: {} },
        ]};
        expect(findTag(node, 'script')).toHaveLength(1);
    });

    test('tag with no attribs and id search returns empty', () => {
        const node = { children: [
            { type: 'tag', name: 'div' },
        ]};
        expect(findTag(node, 'div', 'myid')).toHaveLength(0);
    });
});

// =====================================================================
// convertTimestampToDate
// =====================================================================
describe('convertTimestampToDate', () => {
    test('known timestamp', () => {
        // 2023-01-15 UTC
        const result = convertTimestampToDate(1673740800);
        expect(result.year).toBe(2023);
        expect(result.month).toBe('01');
        expect(result.day).toBe('15');
    });

    test('epoch 0', () => {
        const result = convertTimestampToDate(0);
        expect(result.year).toBe(1970);
        expect(result.month).toBe('01');
        expect(result.day).toBe('01');
    });

    test('leading zeros for single-digit month/day', () => {
        // 2023-03-05 UTC
        const ts = new Date(Date.UTC(2023, 2, 5)).getTime() / 1000;
        const result = convertTimestampToDate(ts);
        expect(result.month).toBe('03');
        expect(result.day).toBe('05');
    });
});

// =====================================================================
// addPre
// =====================================================================
describe('addPre', () => {
    test('absolute https URL returned as-is', () => {
        expect(addPre('https://example.com', 'http://base')).toBe('https://example.com');
    });
    test('absolute http URL returned as-is', () => {
        expect(addPre('http://example.com', 'http://base')).toBe('http://example.com');
    });
    test('root-relative URL → prepend pre', () => {
        expect(addPre('/path/to', 'http://base')).toBe('http://base/path/to');
    });
    test('relative URL → prepend pre/', () => {
        expect(addPre('path/to', 'http://base')).toBe('http://base/path/to');
    });
});

// =====================================================================
// isEmptyObject
// =====================================================================
describe('isEmptyObject', () => {
    test('empty object returns true', () => {
        expect(isEmptyObject({})).toBe(true);
    });
    test('non-empty object returns false', () => {
        expect(isEmptyObject({ a: 1 })).toBe(false);
    });
    test('null returns falsy', () => {
        expect(isEmptyObject(null)).toBeFalsy();
    });
    test('undefined returns falsy', () => {
        expect(isEmptyObject(undefined)).toBeFalsy();
    });
    test('array returns false (wrong constructor)', () => {
        expect(isEmptyObject([])).toBe(false);
    });
    test('string returns falsy', () => {
        expect(isEmptyObject('')).toBeFalsy();
    });
    test('number returns falsy', () => {
        expect(isEmptyObject(0)).toBeFalsy();
    });
    test('object with inherited properties returns true (only own keys)', () => {
        const proto = { inherited: true };
        const obj = Object.create(proto);
        expect(isEmptyObject(obj)).toBe(true);
    });
});
