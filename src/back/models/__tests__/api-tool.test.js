/**
 * api-tool.test.js — Comprehensive tests for src/back/models/api-tool.js
 *
 * ESM mocking pattern: jest.unstable_mockModule() BEFORE dynamic import().
 *
 * Run: docker exec -w /app -e NODE_OPTIONS=--experimental-vm-modules reactnode-server \
 *        npx jest src/back/models/__tests__/api-tool.test.js --no-cache --forceExit --verbose
 */
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';

// ─── Mock state variables ───────────────────────────────────────────
let mockApiLimit, mockEnvType, mockApiExpire, mockMaxRetry;
let mockFetch, mockFsExistsSync, mockFsUnlink, mockFsStatSync, mockFsRenameSync, mockFsCreateWriteStream;
let mockHandleError, mockHoError, mockBig5Encode, mockBufferToString;
let mockSendWs, mockQStringify, mockUtf8Encode, mockPathBasename, mockUrlParse;
let consoleSpy;

// ─── Setup mocks BEFORE importing the module under test ─────────────

// Mock ver.js
mockEnvType = 'test';
jest.unstable_mockModule('../../../../ver.js', () => ({
    ENV_TYPE: mockEnvType,
}));

// Mock config.js
mockApiLimit = jest.fn(() => 10);
jest.unstable_mockModule('../../config.js', () => ({
    API_LIMIT: mockApiLimit,
}));

// Mock constants.js
mockApiExpire = 86400;
mockMaxRetry = 0;  // Default 0 to prevent retry timers leaking past test completion.
                   // Tests that need retry behaviour bump this + jest.resetModules().
jest.unstable_mockModule('../../constants.js', () => ({
    API_EXPIRE: mockApiExpire,
    MAX_RETRY: mockMaxRetry,
}));

// Mock node-fetch — use a wrapper so Fetch() ALWAYS returns a Promise,
// even after jest.clearAllMocks() resets mockFetch to return undefined.
// This prevents dangling retry timers (api-tool.js line 178) from crashing
// with "Cannot read property 'then' of undefined" in later test files.
const safeFetchResponse = () => ({
    buffer: jest.fn().mockResolvedValue(Buffer.from('')),
    headers: { get: jest.fn(() => null) },
    body: { pipe: jest.fn().mockReturnThis(), on: jest.fn() },
});
mockFetch = jest.fn(() => Promise.resolve(safeFetchResponse()));
const fetchWrapper = (...args) => {
    try {
        const result = mockFetch(...args);
        if (result && typeof result.then === 'function') return result;
        return Promise.resolve(safeFetchResponse());
    } catch (e) {
        return Promise.resolve(safeFetchResponse());
    }
};
jest.unstable_mockModule('node-fetch', () => ({
    default: fetchWrapper,
}));

// Mock querystring
mockQStringify = jest.fn(obj => {
    return Object.entries(obj).map(([k, v]) => `${k}=${v}`).join('&');
});
jest.unstable_mockModule('querystring', () => ({
    default: { stringify: mockQStringify },
}));

// Mock fs
mockFsExistsSync = jest.fn();
mockFsUnlink = jest.fn();
mockFsStatSync = jest.fn();
mockFsRenameSync = jest.fn();
mockFsCreateWriteStream = jest.fn();

jest.unstable_mockModule('fs', () => ({
    default: {
        existsSync: (...a) => mockFsExistsSync(...a),
        unlink: (...a) => mockFsUnlink(...a),
        statSync: (...a) => mockFsStatSync(...a),
        renameSync: (...a) => mockFsRenameSync(...a),
        createWriteStream: (...a) => mockFsCreateWriteStream(...a),
    },
}));

// Mock path
mockPathBasename = jest.fn(p => {
    const parts = p.split('/');
    return parts[parts.length - 1] || '';
});
jest.unstable_mockModule('path', () => ({
    default: { basename: mockPathBasename },
}));

// Mock url
mockUrlParse = jest.fn(u => {
    try {
        const url = new URL(u);
        return { pathname: url.pathname };
    } catch {
        return { pathname: '/' };
    }
});
jest.unstable_mockModule('url', () => ({
    default: { parse: mockUrlParse },
}));

// Mock utf8
mockUtf8Encode = jest.fn(s => s);
jest.unstable_mockModule('utf8', () => ({
    default: { encode: mockUtf8Encode },
}));

// Mock utility.js
mockHandleError = jest.fn((err, context) => Promise.reject(err));
mockHoError = class HoError extends Error {
    constructor(message) {
        super(message);
        this.name = 'HoError';
    }
};
mockBig5Encode = jest.fn(str => `big5(${str})`);
mockBufferToString = jest.fn(buf => buf.toString());

jest.unstable_mockModule('../../util/utility.js', () => ({
    handleError: mockHandleError,
    HoError: mockHoError,
    big5Encode: mockBig5Encode,
    bufferToString: mockBufferToString,
    isEmptyObject: (obj) => obj && Object.keys(obj).length === 0 && obj.constructor === Object,
}));

// Mock sendWs.js
mockSendWs = jest.fn();
jest.unstable_mockModule('../../util/sendWs.js', () => ({
    default: mockSendWs,
}));

// ─── Dynamic import of the module under test ────────────────────────
let Api, _resetState, _getState, _setState;

describe('api-tool.js', () => {
    beforeEach(async () => {
        consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.clearAllMocks();
        // Restore safe default after clearAllMocks (which resets to jest.fn → undefined)
        mockFetch.mockImplementation(() => Promise.resolve(safeFetchResponse()));

        // Import once or re-use cached module; use _resetState for clean state
        if (!Api) {
            const mod = await import('../api-tool.js');
            Api = mod.default;
            _resetState = mod._resetState;
            _getState = mod._getState;
            _setState = mod._setState;
        }
        _resetState();

        // Set default mock behaviors
        mockApiLimit.mockReturnValue(10);
        mockFsExistsSync.mockReturnValue(false);
        mockFsUnlink.mockImplementation((path, cb) => cb(null));
        mockFsStatSync.mockReturnValue({ size: 1024 });
        mockFsRenameSync.mockImplementation(() => {});
    });

    afterEach(() => {
        consoleSpy.mockRestore();
        _resetState();
        // Restore safe Fetch default so lingering retry timers from download()
        // won't crash — they reference the same mockFetch variable
        mockFetch.mockImplementation(() => Promise.resolve(safeFetchResponse()));
    });

    // ═══════════════════════════════════════════════════════════════════
    // Default Export (Dispatcher) Tests
    // ═══════════════════════════════════════════════════════════════════

    describe('Default Export (Dispatcher)', () => {
        test('should handle "stop" command and call stopApi()', async () => {
            const result = await Api('stop');
            expect(result).toBeUndefined();
        });

        test('should handle "url" command and call download with user=false', async () => {
            const mockBody = Buffer.from('test response');
            mockFetch.mockResolvedValue({
                buffer: jest.fn().mockResolvedValue(mockBody),
                headers: { get: jest.fn() },
            });

            const result = await Api('url', 'https://example.com');
            expect(mockFetch).toHaveBeenCalledWith(
                'https://example.com',
                expect.objectContaining({ cache: 'no-store' })
            );
        });

        test('should handle unknown command and return error', async () => {
            await expect(Api('invalid_command')).rejects.toThrow();
            expect(mockHandleError).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'unknown api' })
            );
        });

        test('should handle undefined command name', async () => {
            await expect(Api()).rejects.toThrow();
            expect(mockHandleError).toHaveBeenCalled();
        });

        test('should handle null command name', async () => {
            await expect(Api(null)).rejects.toThrow();
            expect(mockHandleError).toHaveBeenCalled();
        });

        test('should handle empty string command name', async () => {
            await expect(Api('')).rejects.toThrow();
            expect(mockHandleError).toHaveBeenCalled();
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // download() Function Tests
    // ═══════════════════════════════════════════════════════════════════

    describe('download() - POST Body Processing', () => {
        test('should handle GET request when post is null', async () => {
            const mockBody = Buffer.from('test');
            mockFetch.mockResolvedValue({
                buffer: jest.fn().mockResolvedValue(mockBody),
                headers: { get: jest.fn() },
            });

            await Api('url', 'https://example.com');
            
            expect(mockFetch).toHaveBeenCalledWith(
                'https://example.com',
                expect.objectContaining({
                    cache: 'no-store',
                })
            );
            // Should not have POST method
            expect(mockFetch.mock.calls[0][1]).not.toHaveProperty('method');
        });

        test('should handle POST request with standard encoding (not_utf8=false)', async () => {
            const mockBody = Buffer.from('test');
            mockFetch.mockResolvedValue({
                buffer: jest.fn().mockResolvedValue(mockBody),
                headers: { get: jest.fn() },
            });

            await Api('url', 'https://example.com', {
                post: { key1: 'value1', key2: 'value2' },
                not_utf8: false,
            });

            expect(mockQStringify).toHaveBeenCalledWith({ key1: 'value1', key2: 'value2' });
            expect(mockFetch.mock.calls[0][1]).toMatchObject({
                method: 'POST',
                body: expect.any(String),
            });
        });

        test('should handle POST request with Big5 encoding (not_utf8=true)', async () => {
            const mockBody = Buffer.from('test');
            mockFetch.mockResolvedValue({
                buffer: jest.fn().mockResolvedValue(mockBody),
                headers: { get: jest.fn() },
            });

            await Api('url', 'https://example.com', {
                post: { query: '中文' },
                not_utf8: true,
            });

            expect(mockBig5Encode).toHaveBeenCalledWith('中文');
            expect(mockFetch).toHaveBeenCalled();
        });
    });

    describe('download() - Header Assembly', () => {
        test('should include Referer header when provided', async () => {
            const mockBody = Buffer.from('test');
            mockFetch.mockResolvedValue({
                buffer: jest.fn().mockResolvedValue(mockBody),
                headers: { get: jest.fn() },
            });

            await Api('url', 'https://example.com', {
                referer: 'https://referer.com',
            });

            expect(mockFetch.mock.calls[0][1].headers).toMatchObject({
                'Referer': 'https://referer.com',
            });
        });

        test('should use default Chrome User-Agent when user=false and agent=false', async () => {
            const mockBody = Buffer.from('test');
            mockFetch.mockResolvedValue({
                buffer: jest.fn().mockResolvedValue(mockBody),
                headers: { get: jest.fn() },
            });

            await Api('url', 'https://example.com');

            expect(mockFetch.mock.calls[0][1].headers).toHaveProperty('User-Agent');
            expect(mockFetch.mock.calls[0][1].headers['User-Agent']).toContain('Chrome');
        });

        test('should include Cookie header when provided', async () => {
            const mockBody = Buffer.from('test');
            mockFetch.mockResolvedValue({
                buffer: jest.fn().mockResolvedValue(mockBody),
                headers: { get: jest.fn() },
            });

            await Api('url', 'https://example.com', {
                cookie: 'sessionid=abc123',
            });

            expect(mockFetch.mock.calls[0][1].headers).toMatchObject({
                'Cookie': 'sessionid=abc123',
            });
        });

        test('should include Content-Type and Content-Length for POST', async () => {
            const mockBody = Buffer.from('test');
            mockFetch.mockResolvedValue({
                buffer: jest.fn().mockResolvedValue(mockBody),
                headers: { get: jest.fn() },
            });

            mockQStringify.mockReturnValue('key=value');

            await Api('url', 'https://example.com', {
                post: { key: 'value' },
            });

            expect(mockFetch.mock.calls[0][1].headers).toMatchObject({
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': 9,
            });
        });

        test('should include X-Forwarded-For and Client-IP when fake_ip provided', async () => {
            const mockBody = Buffer.from('test');
            mockFetch.mockResolvedValue({
                buffer: jest.fn().mockResolvedValue(mockBody),
                headers: { get: jest.fn() },
            });

            await Api('url', 'https://example.com', {
                fake_ip: '192.168.1.100',
            });

            expect(mockFetch.mock.calls[0][1].headers).toMatchObject({
                'X-Forwarded-For': '192.168.1.100',
                'Client-IP': '192.168.1.100',
            });
        });

        test('should include Accept-Language header when is_dm5=true', async () => {
            const mockBody = Buffer.from('test');
            mockFetch.mockResolvedValue({
                buffer: jest.fn().mockResolvedValue(mockBody),
                headers: { get: jest.fn() },
            });

            await Api('url', 'https://example.com', {
                is_dm5: true,
            });

            expect(mockFetch.mock.calls[0][1].headers).toMatchObject({
                'Accept-Language': 'en-US,en;q=0.9',
            });
        });

        test('should include timeout option when timeout > 0', async () => {
            const mockBody = Buffer.from('test');
            mockFetch.mockResolvedValue({
                buffer: jest.fn().mockResolvedValue(mockBody),
                headers: { get: jest.fn() },
            });

            await Api('url', 'https://example.com', {
                timeout: 5000,
            });

            expect(mockFetch.mock.calls[0][1]).toHaveProperty('timeout', 5000);
        });

        test('should not include timeout option when timeout is 0', async () => {
            const mockBody = Buffer.from('test');
            mockFetch.mockResolvedValue({
                buffer: jest.fn().mockResolvedValue(mockBody),
                headers: { get: jest.fn() },
            });

            await Api('url', 'https://example.com', {
                timeout: 0,
            });

            expect(mockFetch.mock.calls[0][1]).not.toHaveProperty('timeout');
        });
    });

    describe('download() - Response Handling (url mode)', () => {
        test('should parse JSON when is_json=true', async () => {
            const mockJson = { data: 'test' };
            mockFetch.mockResolvedValue({
                json: jest.fn().mockResolvedValue(mockJson),
                headers: { get: jest.fn() },
            });

            const result = await Api('url', 'https://api.example.com/data', {
                is_json: true,
            });

            expect(result).toEqual(mockJson);
        });

        test('should return buffer as string when filePath is null and is_json=false', async () => {
            const mockBody = Buffer.from('test response');
            mockBufferToString.mockReturnValue('test response');
            
            mockFetch.mockResolvedValue({
                buffer: jest.fn().mockResolvedValue(mockBody),
                headers: { get: jest.fn() },
            });

            const result = await Api('url', 'https://example.com');

            expect(mockBufferToString).toHaveBeenCalledWith(mockBody);
            expect(result).toBe('test response');
        });
    });

    describe('download() - Retry Logic', () => {
        test('should not retry on HPE_INVALID_CONSTANT error', async () => {
            const error = new Error('Parse error');
            error.code = 'HPE_INVALID_CONSTANT';
            
            mockFetch.mockRejectedValue(error);

            try {
                await Api('url', 'https://example.com');
            } catch (e) {
                // Expected to reject
            }
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(mockHandleError).toHaveBeenCalledWith(error);
        });
    });

    describe('download() - Edge Cases', () => {
        test('should encode non-ASCII URL with utf8.encode', async () => {
            const mockBody = Buffer.from('test');
            mockFetch.mockResolvedValue({
                buffer: jest.fn().mockResolvedValue(mockBody),
                headers: { get: jest.fn() },
            });

            await Api('url', 'https://example.com/文件.txt');

            expect(mockUtf8Encode).toHaveBeenCalledWith('https://example.com/文件.txt');
        });

        test('should handle empty POST body (isEmptyObject skips stringify)', async () => {
            const mockBody = Buffer.from('test');
            mockFetch.mockResolvedValue({
                buffer: jest.fn().mockResolvedValue(mockBody),
                headers: { get: jest.fn() },
            });

            await Api('url', 'https://example.com', {
                post: {},
            });

            // isEmptyObject({}) returns true, so post is skipped entirely
            expect(mockQStringify).not.toHaveBeenCalled();
            // No POST headers or method should be set
            const callOpts = mockFetch.mock.calls[0][1];
            expect(callOpts.method).toBeUndefined();
            expect(callOpts.headers['Content-Type']).toBeUndefined();
            expect(callOpts.headers['Content-Length']).toBeUndefined();
        });

        test('should still stringify non-empty POST body', async () => {
            const mockBody = Buffer.from('test');
            mockFetch.mockResolvedValue({
                buffer: jest.fn().mockResolvedValue(mockBody),
                headers: { get: jest.fn() },
            });

            mockQStringify.mockReturnValue('key=value');

            await Api('url', 'https://example.com', {
                post: { key: 'value' },
            });

            expect(mockQStringify).toHaveBeenCalledWith({ key: 'value' });
            const callOpts = mockFetch.mock.calls[0][1];
            expect(callOpts.method).toBe('POST');
            expect(callOpts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
        });

        test('should handle URL with various pathnames', async () => {
            const mockBody = Buffer.from('test');
            mockFetch.mockResolvedValue({
                buffer: jest.fn().mockResolvedValue(mockBody),
                headers: { get: jest.fn() },
            });

            await Api('url', 'https://example.com/path/to/file');

            // Just verify the URL was encoded
            expect(mockUtf8Encode).toHaveBeenCalledWith('https://example.com/path/to/file');
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // Integration Tests
    // ═══════════════════════════════════════════════════════════════════

    describe('Integration Tests', () => {
        test('should handle stop command and reset api_ing', async () => {
            const result = await Api('stop');
            expect(result).toBeUndefined();
        });

        test('should handle multiple url fetches', async () => {
            const mockBody1 = Buffer.from('response1');
            const mockBody2 = Buffer.from('response2');
            
            mockFetch
                .mockResolvedValueOnce({
                    buffer: jest.fn().mockResolvedValue(mockBody1),
                    headers: { get: jest.fn() },
                })
                .mockResolvedValueOnce({
                    buffer: jest.fn().mockResolvedValue(mockBody2),
                    headers: { get: jest.fn() },
                });

            const result1 = await Api('url', 'https://example.com/1');
            const result2 = await Api('url', 'https://example.com/2');

            expect(mockFetch).toHaveBeenCalledTimes(2);
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // Additional Branch Coverage Tests
    // ═══════════════════════════════════════════════════════════════════

    describe('download command dispatch', () => {
        test('should dispatch download and resolve after delay', async () => {
            const emitter = new EventEmitter();
            mockFsCreateWriteStream.mockReturnValue(emitter);
            mockFsStatSync.mockReturnValue({ size: 1024 });

            mockFetch.mockResolvedValue({
                body: { pipe: jest.fn(() => { process.nextTick(() => emitter.emit('finish')); }) },
                headers: { get: jest.fn(name => name === 'content-length' ? '1024' : null) },
            });

            const user = { username: 'testuser' };
            const result = await Api('download', user, 'https://example.com/file.zip', { filePath: '/downloads/file.zip' });
            expect(result).toBeUndefined();

            await new Promise(resolve => setTimeout(resolve, 100));
            expect(mockFetch).toHaveBeenCalled();
        });
    });

    describe('Retry logic (MAX_RETRY)', () => {
        test('should throw timeout error after exceeding MAX_RETRY', async () => {
            const origMaxRetry = mockMaxRetry;
            mockMaxRetry = 0;
            jest.resetModules();
            const mod = await import('../api-tool.js');
            const TestApi = mod.default;

            mockFetch.mockRejectedValue(new Error('network error'));
            mockHandleError.mockImplementation((err, ctx) => {
                if (typeof ctx === 'string') return;
                return Promise.reject(err);
            });

            let caughtError;
            try {
                await TestApi('url', 'https://example.com');
            } catch (e) {
                caughtError = e;
            }

            expect(caughtError).toBeDefined();
            expect(caughtError.message).toBe('timeout');
            expect(mockHandleError).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'timeout' }),
                null
            );

            mockMaxRetry = origMaxRetry;
        });
    });

    describe('File download (user=true with filePath)', () => {
        test('should pipe response body to temp file and rename', async () => {
            const emitter = new EventEmitter();
            mockFsCreateWriteStream.mockReturnValue(emitter);
            mockFsStatSync.mockReturnValue({ size: 1024 });

            const pipeFn = jest.fn(() => { process.nextTick(() => emitter.emit('finish')); });
            mockFetch.mockResolvedValue({
                body: { pipe: pipeFn },
                headers: { get: jest.fn(name => name === 'content-length' ? '1024' : null) },
            });

            const user = { username: 'testuser' };
            await Api('download', user, 'https://example.com/file.zip', { filePath: '/downloads/file.zip' });
            await new Promise(resolve => setTimeout(resolve, 200));

            expect(mockFsCreateWriteStream).toHaveBeenCalledWith('/downloads/file.zip_t');
            expect(pipeFn).toHaveBeenCalledWith(emitter);
            expect(mockFsRenameSync).toHaveBeenCalledWith('/downloads/file.zip_t', '/downloads/file.zip');
        });

        test('should reject with incomplete download on content-length mismatch', async () => {
            const emitter = new EventEmitter();
            mockFsCreateWriteStream.mockReturnValue(emitter);
            mockFsStatSync.mockReturnValue({ size: 512 });

            mockFetch.mockResolvedValue({
                body: { pipe: jest.fn(() => { process.nextTick(() => emitter.emit('finish')); }) },
                headers: { get: jest.fn(name => name === 'content-length' ? '1024' : null) },
            });

            const user = { username: 'testuser' };
            await Api('download', user, 'https://example.com/file.zip', { filePath: '/downloads/file.zip', is_check: true });
            await new Promise(resolve => setTimeout(resolve, 200));

            expect(mockHandleError).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'incomplete download' }),
                null
            );
        });

        test('should error when user is truthy but filePath is null', async () => {
            mockFetch.mockResolvedValue({
                body: { pipe: jest.fn() },
                headers: { get: jest.fn() },
            });

            const user = { username: 'testuser' };
            await Api('download', user, 'https://example.com/file.zip', { filePath: null });
            await new Promise(resolve => setTimeout(resolve, 200));

            expect(mockHandleError).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'file path empty!' }),
                null
            );
        });
    });

    describe('rest callback after download', () => {
        test('should invoke rest callback with pathname and filename', async () => {
            const emitter = new EventEmitter();
            mockFsCreateWriteStream.mockReturnValue(emitter);
            mockFsStatSync.mockReturnValue({ size: 1024 });

            const restCallback = jest.fn().mockResolvedValue(undefined);

            mockFetch.mockResolvedValue({
                body: { pipe: jest.fn(() => { process.nextTick(() => emitter.emit('finish')); }) },
                headers: { get: jest.fn(name => {
                    if (name === 'content-length') return '1024';
                    return null;
                }) },
            });

            mockUrlParse.mockReturnValue({ pathname: '/file.zip' });
            mockPathBasename.mockReturnValue('file.zip');

            const user = { username: 'testuser' };
            await Api('download', user, 'https://example.com/file.zip', {
                filePath: '/downloads/file.zip',
                is_check: false,
                rest: restCallback,
            });
            await new Promise(resolve => setTimeout(resolve, 300));

            expect(restCallback).toHaveBeenCalledWith(['/file.zip', 'file.zip']);
        });
    });

    describe('handle_err (sendWs)', () => {
        test('should call sendWs with username when download errors', async () => {
            const error = new Error('parse error');
            error.code = 'HPE_INVALID_CONSTANT';
            mockFetch.mockRejectedValue(error);
            mockHandleError.mockImplementation((err, ctx) => {
                if (typeof ctx === 'string') return;
                return Promise.reject(err);
            });

            const user = { username: 'testuser' };
            await Api('download', user, 'https://example.com/file.zip', { filePath: '/downloads/file.zip' });
            await new Promise(resolve => setTimeout(resolve, 200));

            expect(mockSendWs).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'testuser',
                    data: expect.stringContaining('Api fail'),
                }),
                0
            );
        });
    });

    describe('checkTmp cleanup', () => {
        test('should unlink temp file when it already exists', async () => {
            const emitter = new EventEmitter();
            mockFsCreateWriteStream.mockReturnValue(emitter);
            mockFsStatSync.mockReturnValue({ size: 1024 });
            mockFsExistsSync.mockReturnValue(true);
            mockFsUnlink.mockImplementation((path, cb) => cb(null));

            mockFetch.mockResolvedValue({
                body: { pipe: jest.fn(() => { process.nextTick(() => emitter.emit('finish')); }) },
                headers: { get: jest.fn(name => name === 'content-length' ? '1024' : null) },
            });

            const user = { username: 'testuser' };
            await Api('download', user, 'https://example.com/file.zip', { filePath: '/downloads/file.zip' });
            await new Promise(resolve => setTimeout(resolve, 200));

            expect(mockFsExistsSync).toHaveBeenCalledWith('/downloads/file.zip_t');
            expect(mockFsUnlink).toHaveBeenCalledWith('/downloads/file.zip_t', expect.any(Function));
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // _resetState / _getState / _setState (Test Helpers)
    // ═══════════════════════════════════════════════════════════════════

    describe('Test helpers (_resetState, _getState, _setState)', () => {
        test('_getState should return initial state after _resetState', () => {
            const state = _getState();
            expect(state).toEqual({
                api_ing: 0,
                api_pool: [],
                api_duration: 0,
                api_lock: false,
            });
        });

        test('_setState should override specific fields', () => {
            _setState({ api_ing: 5, api_lock: true });
            const state = _getState();
            expect(state.api_ing).toBe(5);
            expect(state.api_lock).toBe(true);
            expect(state.api_pool).toEqual([]);
            expect(state.api_duration).toBe(0);
        });

        test('_setState should set api_pool', () => {
            const pool = [{ name: 'download', args: ['arg1'] }];
            _setState({ api_pool: pool });
            expect(_getState().api_pool).toEqual(pool);
        });

        test('_resetState should clear all state', () => {
            _setState({ api_ing: 99, api_pool: [{ name: 'x', args: [] }], api_duration: 12345, api_lock: true });
            _resetState();
            expect(_getState()).toEqual({
                api_ing: 0,
                api_pool: [],
                api_duration: 0,
                api_lock: false,
            });
        });
    });

    // ═══════════════════════════════════════════════════════════════════
    // Queue / Pool Management Tests (get, expire, setLock)
    // ═══════════════════════════════════════════════════════════════════

    describe('Queue management (download at/over limit)', () => {
        test('should queue download when api_ing >= API_LIMIT', async () => {
            mockApiLimit.mockReturnValue(2);
            _setState({ api_ing: 2 });

            const user = { username: 'testuser' };
            const result = await Api('download', user, 'https://example.com/file.zip', { filePath: '/downloads/file.zip' });

            // Dispatcher returns after 500ms delay
            expect(result).toBeUndefined();
            // api_ing should NOT increase (queued, not started)
            const state = _getState();
            expect(state.api_ing).toBe(2);
            // Item should be in pool
            expect(state.api_pool.length).toBe(1);
            expect(state.api_pool[0].name).toBe('download');
        });

        test('should start download immediately when api_ing < API_LIMIT', async () => {
            mockApiLimit.mockReturnValue(10);
            _setState({ api_ing: 0 });

            const emitter = new EventEmitter();
            mockFsCreateWriteStream.mockReturnValue(emitter);
            mockFetch.mockResolvedValue({
                body: { pipe: jest.fn(() => { process.nextTick(() => emitter.emit('finish')); }) },
                headers: { get: jest.fn(name => name === 'content-length' ? '1024' : null) },
            });

            const user = { username: 'testuser' };
            await Api('download', user, 'https://example.com/file.zip', { filePath: '/downloads/file.zip' });
            await new Promise(resolve => setTimeout(resolve, 200));

            // api_ing was incremented then decremented after completion
            expect(mockFetch).toHaveBeenCalled();
        });

        test('should fill all slots then queue remaining', async () => {
            mockApiLimit.mockReturnValue(2);

            const emitter = new EventEmitter();
            mockFsCreateWriteStream.mockReturnValue(emitter);
            mockFetch.mockImplementation(() => Promise.resolve({
                body: { pipe: jest.fn(() => { /* don't emit finish — keep in-flight */ }) },
                headers: { get: jest.fn(() => null) },
            }));

            const user = { username: 'testuser' };
            // First 2 should start immediately
            await Api('download', user, 'https://example.com/1', { filePath: '/downloads/1' });
            await Api('download', user, 'https://example.com/2', { filePath: '/downloads/2' });
            await new Promise(resolve => setTimeout(resolve, 100));

            const stateAfter2 = _getState();
            expect(stateAfter2.api_ing).toBe(2);

            // 3rd should be queued
            await Api('download', user, 'https://example.com/3', { filePath: '/downloads/3' });
            await new Promise(resolve => setTimeout(resolve, 100));

            const stateAfter3 = _getState();
            expect(stateAfter3.api_pool.length).toBe(1);
        });

        test('boundary: last slot taken (api_ing === API_LIMIT - 1)', async () => {
            mockApiLimit.mockReturnValue(3);
            _setState({ api_ing: 2 });

            const emitter = new EventEmitter();
            mockFsCreateWriteStream.mockReturnValue(emitter);
            mockFetch.mockImplementation(() => Promise.resolve({
                body: { pipe: jest.fn() },
                headers: { get: jest.fn(() => null) },
            }));

            const user = { username: 'testuser' };
            await Api('download', user, 'https://example.com/f', { filePath: '/downloads/f' });
            await new Promise(resolve => setTimeout(resolve, 100));

            // Should have started (not queued) — api_ing was 2, limit is 3
            expect(_getState().api_ing).toBe(3);
            expect(_getState().api_pool.length).toBe(0);
        });
    });

    describe('get() — pool draining', () => {
        test('should decrement api_ing when > 0 after download completes', async () => {
            _setState({ api_ing: 3 });

            const emitter = new EventEmitter();
            mockFsCreateWriteStream.mockReturnValue(emitter);
            mockFetch.mockResolvedValue({
                body: { pipe: jest.fn(() => { process.nextTick(() => emitter.emit('finish')); }) },
                headers: { get: jest.fn(name => name === 'content-length' ? '1024' : null) },
            });

            const user = { username: 'testuser' };
            await Api('download', user, 'https://example.com/file.zip', { filePath: '/downloads/file.zip' });
            await new Promise(resolve => setTimeout(resolve, 300));

            // api_ing: started at 3, incremented to 4, download completes → get() decrements to 3
            expect(_getState().api_ing).toBe(3);
        });

        test('should not underflow api_ing below 0', async () => {
            _setState({ api_ing: 0 });
            // Call stop which calls stopApi() — sets api_ing = 0
            await Api('stop');
            expect(_getState().api_ing).toBe(0);
        });

        test('should drain queued items from pool after download completes', async () => {
            mockApiLimit.mockReturnValue(10);
            // Pre-set: 1 item in pool waiting to be drained, api_ing under limit
            const user = { username: 'testuser' };
            _setState({
                api_ing: 0,
                api_pool: [{
                    name: 'download',
                    args: [user, 'https://example.com/queued', { filePath: '/downloads/queued' }],
                }],
            });

            expect(_getState().api_pool.length).toBe(1);

            const emitter = new EventEmitter();
            mockFsCreateWriteStream.mockReturnValue(emitter);
            mockFetch.mockResolvedValue({
                body: { pipe: jest.fn(() => { process.nextTick(() => emitter.emit('finish')); }) },
                headers: { get: jest.fn(name => name === 'content-length' ? '1024' : null) },
            });

            // Start a download (under limit, so starts immediately). When it completes,
            // get() runs, finds the queued item, and drains it.
            await Api('download', user, 'https://example.com/current', { filePath: '/downloads/current' });
            await new Promise(resolve => setTimeout(resolve, 800));

            // Pool should have been drained
            expect(_getState().api_pool.length).toBe(0);
            // Fetch called for both the current download and the drained one
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        test('should call rest callback when provided after download', async () => {
            const emitter = new EventEmitter();
            mockFsCreateWriteStream.mockReturnValue(emitter);
            mockFsStatSync.mockReturnValue({ size: 1024 });
            const restCallback = jest.fn().mockResolvedValue(undefined);

            mockFetch.mockResolvedValue({
                body: { pipe: jest.fn(() => { process.nextTick(() => emitter.emit('finish')); }) },
                headers: { get: jest.fn(name => {
                    if (name === 'content-length') return '1024';
                    return null;
                }) },
            });

            mockUrlParse.mockReturnValue({ pathname: '/file.zip' });
            mockPathBasename.mockReturnValue('file.zip');

            const user = { username: 'testuser' };
            await Api('download', user, 'https://example.com/file.zip', {
                filePath: '/downloads/file.zip',
                is_check: false,
                rest: restCallback,
            });
            await new Promise(resolve => setTimeout(resolve, 600));

            expect(restCallback).toHaveBeenCalledWith(['/file.zip', 'file.zip']);
        });

        test('should handle rest callback that throws', async () => {
            const emitter = new EventEmitter();
            mockFsCreateWriteStream.mockReturnValue(emitter);
            mockFsStatSync.mockReturnValue({ size: 1024 });
            const failRest = jest.fn().mockRejectedValue(new Error('rest failed'));

            mockFetch.mockResolvedValue({
                body: { pipe: jest.fn(() => { process.nextTick(() => emitter.emit('finish')); }) },
                headers: { get: jest.fn(name => {
                    if (name === 'content-length') return '1024';
                    return null;
                }) },
            });
            mockUrlParse.mockReturnValue({ pathname: '/file.zip' });
            mockPathBasename.mockReturnValue('file.zip');

            const errHandle = jest.fn();
            const user = { username: 'testuser' };
            await Api('download', user, 'https://example.com/file.zip', {
                filePath: '/downloads/file.zip',
                is_check: false,
                rest: failRest,
                errHandle,
            });
            await new Promise(resolve => setTimeout(resolve, 600));

            expect(failRest).toHaveBeenCalled();
            // Error should be caught by errHandle in rest's .catch()
            expect(errHandle).toHaveBeenCalledWith(expect.objectContaining({ message: 'rest failed' }));
        });

        test('should handle pool item with unknown name during drain', async () => {
            _setState({
                api_ing: 1,
                api_pool: [{ name: 'unknown_action', args: [{ username: 'test' }] }],
            });

            const emitter = new EventEmitter();
            mockFsCreateWriteStream.mockReturnValue(emitter);
            mockFetch.mockResolvedValue({
                body: { pipe: jest.fn(() => { process.nextTick(() => emitter.emit('finish')); }) },
                headers: { get: jest.fn(name => name === 'content-length' ? '1024' : null) },
            });

            const user = { username: 'testuser' };
            await Api('download', user, 'https://example.com/file.zip', { filePath: '/downloads/file.zip' });
            await new Promise(resolve => setTimeout(resolve, 600));

            // handleError should have been called with 'unknown api' for the drained item
            expect(mockHandleError).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'unknown api' })
            );
        });
    });

    describe('expire() — overflow queuing with expiration', () => {
        test('should set api_duration on first queue', async () => {
            mockApiLimit.mockReturnValue(1);
            _setState({ api_ing: 1, api_duration: 0 });

            const user = { username: 'testuser' };
            await Api('download', user, 'https://example.com/f', { filePath: '/downloads/f' });
            await new Promise(resolve => setTimeout(resolve, 200));

            const state = _getState();
            expect(state.api_duration).toBeGreaterThan(0);
            expect(state.api_pool.length).toBe(1);
        });

        test('should not reset api_duration when within API_EXPIRE window', async () => {
            mockApiLimit.mockReturnValue(1);
            const now = Math.round(Date.now() / 1000);
            _setState({ api_ing: 1, api_duration: now - 100 }); // 100 seconds ago (within 86400)

            const user = { username: 'testuser' };
            await Api('download', user, 'https://example.com/f', { filePath: '/downloads/f' });
            await new Promise(resolve => setTimeout(resolve, 200));

            const state = _getState();
            // api_duration should stay as original (not reset)
            expect(state.api_duration).toBe(now - 100);
        });

        test('should force-drain oldest item when API_EXPIRE exceeded', async () => {
            mockApiLimit.mockReturnValue(1);
            const now = Math.round(Date.now() / 1000);
            // Set duration to well past the 86400s expiry
            _setState({
                api_ing: 1,
                api_duration: now - 100000,
                api_pool: [],
            });

            const emitter = new EventEmitter();
            mockFsCreateWriteStream.mockReturnValue(emitter);
            mockFetch.mockResolvedValue({
                body: { pipe: jest.fn(() => { process.nextTick(() => emitter.emit('finish')); }) },
                headers: { get: jest.fn(name => name === 'content-length' ? '1024' : null) },
            });

            const user = { username: 'testuser' };
            // This queues a download AND triggers expiration check
            await Api('download', user, 'https://example.com/expired', { filePath: '/downloads/expired' });
            await new Promise(resolve => setTimeout(resolve, 600));

            // After expire drains, api_duration should be reset to 0
            expect(_getState().api_duration).toBe(0);
            // The drained item should have triggered a download
            expect(mockFetch).toHaveBeenCalled();
        });

        test('should release lock after queuing', async () => {
            mockApiLimit.mockReturnValue(1);
            _setState({ api_ing: 1 });

            const user = { username: 'testuser' };
            await Api('download', user, 'https://example.com/f', { filePath: '/downloads/f' });
            await new Promise(resolve => setTimeout(resolve, 200));

            expect(_getState().api_lock).toBe(false);
        });

        test('API_EXPIRE boundary: should NOT trigger drain when within window', async () => {
            mockApiLimit.mockReturnValue(1);
            const now = Math.round(Date.now() / 1000);
            // Set duration to well within the window (only 100 seconds ago, far from 86400)
            _setState({
                api_ing: 1,
                api_duration: now - 100,
            });

            const user = { username: 'testuser' };
            await Api('download', user, 'https://example.com/f', { filePath: '/downloads/f' });
            await new Promise(resolve => setTimeout(resolve, 200));

            const state = _getState();
            // Item queued but NOT drained (within window)
            expect(state.api_pool.length).toBe(1);
            // api_duration should remain unchanged
            expect(state.api_duration).toBe(now - 100);
        });
    });

    describe('setLock() — mutex behavior', () => {
        test('should acquire lock immediately when not held', async () => {
            _setState({ api_lock: false });
            mockApiLimit.mockReturnValue(1);
            _setState({ api_ing: 1 });

            const user = { username: 'testuser' };
            await Api('download', user, 'https://example.com/f', { filePath: '/downloads/f' });
            await new Promise(resolve => setTimeout(resolve, 200));

            // expire() should have acquired and released the lock
            expect(_getState().api_pool.length).toBe(1);
        });

        test('should wait and retry when lock is held', async () => {
            mockApiLimit.mockReturnValue(1);
            _setState({ api_ing: 1, api_lock: true });

            const user = { username: 'testuser' };
            // This will call expire() which calls setLock() — lock is held, so it polls
            Api('download', user, 'https://example.com/f', { filePath: '/downloads/f' });

            // Wait a bit then release the lock
            await new Promise(resolve => setTimeout(resolve, 100));
            _setState({ api_lock: false });

            // Wait for setLock retry (500ms polling)
            await new Promise(resolve => setTimeout(resolve, 700));

            // Should have eventually acquired lock and queued the item
            expect(_getState().api_pool.length).toBe(1);
        });
    });

    describe('stopApi() — state interaction', () => {
        test('should reset api_ing to 0 regardless of current value', async () => {
            _setState({ api_ing: 5 });
            await Api('stop');
            expect(_getState().api_ing).toBe(0);
        });

        test('should not affect api_pool or api_lock', async () => {
            _setState({
                api_ing: 3,
                api_pool: [{ name: 'download', args: [] }],
                api_lock: true,
                api_duration: 12345,
            });
            await Api('stop');

            const state = _getState();
            expect(state.api_ing).toBe(0);
            expect(state.api_pool.length).toBe(1); // pool untouched
            expect(state.api_lock).toBe(true); // lock untouched
            expect(state.api_duration).toBe(12345); // duration untouched
        });
    });

    describe('download() — additional branch coverage', () => {
        test('should use custom agent header when agent is provided', async () => {
            const mockBody = Buffer.from('test');
            mockFetch.mockResolvedValue({
                buffer: jest.fn().mockResolvedValue(mockBody),
                headers: { get: jest.fn() },
            });

            const customAgent = { 'User-Agent': 'CustomBot/1.0' };
            await Api('url', 'https://example.com', { agent: customAgent });

            expect(mockFetch.mock.calls[0][1].headers).toMatchObject(customAgent);
            // Should NOT have default Chrome UA
            expect(mockFetch.mock.calls[0][1].headers['User-Agent']).toBe('CustomBot/1.0');
        });

        test('should not set User-Agent when user is truthy', async () => {
            const emitter = new EventEmitter();
            mockFsCreateWriteStream.mockReturnValue(emitter);
            mockFetch.mockResolvedValue({
                body: { pipe: jest.fn(() => { process.nextTick(() => emitter.emit('finish')); }) },
                headers: { get: jest.fn(name => name === 'content-length' ? '1024' : null) },
            });

            const user = { username: 'testuser' };
            await Api('download', user, 'https://example.com/f', { filePath: '/downloads/f' });
            await new Promise(resolve => setTimeout(resolve, 200));

            // User truthy → no User-Agent header (empty obj merged for UA slot)
            expect(mockFetch.mock.calls[0][1].headers['User-Agent']).toBeUndefined();
        });

        test('should write file to disk in url mode when filePath is set (no integrity check)', async () => {
            const emitter = new EventEmitter();
            mockFsCreateWriteStream.mockReturnValue(emitter);

            mockFetch.mockResolvedValue({
                body: { pipe: jest.fn(() => { process.nextTick(() => emitter.emit('finish')); }) },
                headers: { get: jest.fn() },
            });

            // user=false, filePath set → pipe to file without integrity check
            await Api('url', 'https://example.com/data.bin', { filePath: '/downloads/data.bin' });

            expect(mockFsCreateWriteStream).toHaveBeenCalledWith('/downloads/data.bin_t');
            expect(mockFsRenameSync).toHaveBeenCalledWith('/downloads/data.bin_t', '/downloads/data.bin');
        });

        test('should skip integrity check when is_check=false', async () => {
            const emitter = new EventEmitter();
            mockFsCreateWriteStream.mockReturnValue(emitter);
            // Content-length mismatch, but is_check=false so no error
            mockFsStatSync.mockReturnValue({ size: 512 });

            mockFetch.mockResolvedValue({
                body: { pipe: jest.fn(() => { process.nextTick(() => emitter.emit('finish')); }) },
                headers: { get: jest.fn(name => name === 'content-length' ? '1024' : null) },
            });

            const user = { username: 'testuser' };
            await Api('download', user, 'https://example.com/file.zip', {
                filePath: '/downloads/file.zip',
                is_check: false,
            });
            await new Promise(resolve => setTimeout(resolve, 200));

            // No 'incomplete download' error despite size mismatch
            expect(mockHandleError).not.toHaveBeenCalledWith(
                expect.objectContaining({ message: 'incomplete download' }),
                expect.anything()
            );
        });

        test('should extract filename from content-disposition with quotes', async () => {
            const emitter = new EventEmitter();
            mockFsCreateWriteStream.mockReturnValue(emitter);
            mockFsStatSync.mockReturnValue({ size: 1024 });
            const restCallback = jest.fn().mockResolvedValue(undefined);

            mockFetch.mockResolvedValue({
                body: { pipe: jest.fn(() => { process.nextTick(() => emitter.emit('finish')); }) },
                headers: { get: jest.fn(name => {
                    if (name === 'content-length') return '1024';
                    if (name === 'content-disposition') return 'attachment; filename="report.pdf"';
                    if (name === '_headers') return null;
                    return null;
                }) },
            });
            mockUrlParse.mockReturnValue({ pathname: '/download/file' });

            const user = { username: 'testuser' };
            await Api('download', user, 'https://example.com/download/file', {
                filePath: '/downloads/file',
                is_check: false,
                rest: restCallback,
            });
            await new Promise(resolve => setTimeout(resolve, 600));

            expect(restCallback).toHaveBeenCalledWith(['/download/file', 'report.pdf']);
        });

        test('should extract filename from _headers content-disposition fallback', async () => {
            const emitter = new EventEmitter();
            mockFsCreateWriteStream.mockReturnValue(emitter);
            mockFsStatSync.mockReturnValue({ size: 1024 });
            const restCallback = jest.fn().mockResolvedValue(undefined);

            mockFetch.mockResolvedValue({
                body: { pipe: jest.fn(() => { process.nextTick(() => emitter.emit('finish')); }) },
                headers: { get: jest.fn(name => {
                    if (name === 'content-length') return '1024';
                    if (name === 'content-disposition') return null;
                    if (name === '_headers') return { 'content-disposition': ['attachment; filename="legacy.txt"'] };
                    return null;
                }) },
            });
            mockUrlParse.mockReturnValue({ pathname: '/legacy-path' });

            const user = { username: 'testuser' };
            await Api('download', user, 'https://example.com/legacy-path', {
                filePath: '/downloads/legacy',
                is_check: false,
                rest: restCallback,
            });
            await new Promise(resolve => setTimeout(resolve, 600));

            expect(restCallback).toHaveBeenCalledWith(['/legacy-path', 'legacy.txt']);
        });

        test('should handle file pipe error', async () => {
            const emitter = new EventEmitter();
            mockFsCreateWriteStream.mockReturnValue(emitter);

            mockFetch.mockResolvedValue({
                body: { pipe: jest.fn(() => { process.nextTick(() => emitter.emit('error', new Error('disk full'))); }) },
                headers: { get: jest.fn() },
            });

            const user = { username: 'testuser' };
            await Api('download', user, 'https://example.com/file.zip', { filePath: '/downloads/file.zip' });
            await new Promise(resolve => setTimeout(resolve, 300));

            // Pipe error should propagate through the retry logic
            // handleError should have been called (either 'Fetch' or via sendWs)
            expect(mockHandleError).toHaveBeenCalled();
        });

        test('should handle POST with multiple Big5-encoded key-values', async () => {
            const mockBody = Buffer.from('test');
            mockFetch.mockResolvedValue({
                buffer: jest.fn().mockResolvedValue(mockBody),
                headers: { get: jest.fn() },
            });

            await Api('url', 'https://example.com', {
                post: { key1: '值1', key2: '值2', key3: '值3' },
                not_utf8: true,
            });

            expect(mockBig5Encode).toHaveBeenCalledTimes(3);
            expect(mockBig5Encode).toHaveBeenCalledWith('值1');
            expect(mockBig5Encode).toHaveBeenCalledWith('值2');
            expect(mockBig5Encode).toHaveBeenCalledWith('值3');
            // Verify qspost format: key1=big5(值1)&key2=big5(值2)&key3=big5(值3)
            const body = mockFetch.mock.calls[0][1].body;
            expect(body).toContain('&');
            expect(body.split('&').length).toBe(3);
        });

        test('should handle download with no content-length header (incomplete download)', async () => {
            const emitter = new EventEmitter();
            mockFsCreateWriteStream.mockReturnValue(emitter);
            mockFsStatSync.mockReturnValue({ size: 100 });

            mockFetch.mockResolvedValue({
                body: { pipe: jest.fn(() => { process.nextTick(() => emitter.emit('finish')); }) },
                headers: { get: jest.fn(() => null) }, // no content-length
            });

            const user = { username: 'testuser' };
            await Api('download', user, 'https://example.com/file.zip', {
                filePath: '/downloads/file.zip',
                is_check: true,
            });
            await new Promise(resolve => setTimeout(resolve, 300));

            // No content-length → treated as mismatch
            expect(mockHandleError).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'incomplete download' }),
                null
            );
        });
    });
});
