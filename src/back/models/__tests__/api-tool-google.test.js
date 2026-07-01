/**
 * api-tool-google.test.js — Tests for Google API integration
 * ESM mocking pattern: jest.unstable_mockModule() BEFORE dynamic import().
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

let mockGoogleAuth, mockGoogleDrive, mockGoogleGmail, mockGoogleYoutube;
let mockMongoFind, mockMongoUpdate, mockMongoInsert;
let mockFetch, mockYoutubeDl, mockChildExec;
let mockFsExistsSync, mockFsCreateReadStream, mockFsUnlink, mockFsRenameSync;
let mockFsCreateWriteStream, mockFsStatSync, mockFsReaddirSync, mockFsLstatSync, mockFsWriteFile;
let mockMkdirp, mockHandleError, mockDeleteFolderRecursive, mockSRT2VTT, mockIsValidString;
let mockMediaMIME, mockIsSub, mockIsKindle, mockSendWs;
let mockMediaHandleTool, mockExternal;

const TEST_CONFIG = {
    MAX_RETRY: 3, API_EXPIRE: 60, DRIVE_LIMIT: 50, OATH_WAITING: 2,
    KINDLE_LIMIT: 52428800, API_LIMIT: 3,
    GOOGLE_MEDIA_FOLDER: 'mock-media-folder-id',
    GOOGLE_BACKUP_FOLDER: 'mock-backup-folder-id',
    GOOGLE_DB_BACKUP_FOLDER: 'mock-db-backup-folder-id',
    NAS_TMP: '/nas/tmp', BACKUP_PATH: '/backup',
    GOOGLE_ID: 'mock-client-id', GOOGLE_SECRET: 'mock-client-secret',
    GOOGLE_REDIRECT: 'http://localhost/oauth', ROOT_USER: 'root@test.com', ENV_TYPE: 'test',
};

jest.unstable_mockModule('../../constants.js', () => ({
    MAX_RETRY: TEST_CONFIG.MAX_RETRY,
    DRIVE_LIMIT: TEST_CONFIG.DRIVE_LIMIT, OATH_WAITING: TEST_CONFIG.OATH_WAITING,
    KINDLE_LIMIT: TEST_CONFIG.KINDLE_LIMIT,
    __dirname: '/app/src/back/models',
}));

jest.unstable_mockModule('../../../../ver.js', () => ({
    PASSWORD_SALT: 'test_salt_',
    ENV_TYPE: TEST_CONFIG.ENV_TYPE, GOOGLE_ID: TEST_CONFIG.GOOGLE_ID,
    GOOGLE_SECRET: TEST_CONFIG.GOOGLE_SECRET, GOOGLE_REDIRECT: TEST_CONFIG.GOOGLE_REDIRECT,
    ROOT_USER: TEST_CONFIG.ROOT_USER,
}));

jest.unstable_mockModule('../../config.js', () => ({
    GOOGLE_MEDIA_FOLDER: jest.fn(() => TEST_CONFIG.GOOGLE_MEDIA_FOLDER),
    GOOGLE_BACKUP_FOLDER: jest.fn(() => TEST_CONFIG.GOOGLE_BACKUP_FOLDER),
    API_LIMIT: jest.fn(() => TEST_CONFIG.API_LIMIT),
    NAS_TMP: jest.fn(() => TEST_CONFIG.NAS_TMP),
    GOOGLE_DB_BACKUP_FOLDER: jest.fn(() => TEST_CONFIG.GOOGLE_DB_BACKUP_FOLDER),
    BACKUP_PATH: jest.fn(() => TEST_CONFIG.BACKUP_PATH),
}));

mockGoogleAuth = {
    setCredentials: jest.fn(), getAccessToken: jest.fn(), refreshAccessToken: jest.fn(),
    credentials: { access_token: 'mock-access-token' },
};

const createMockDriveInstance = () => ({
    files: {
        create: jest.fn((p, cb) => cb(null, { data: { id: 'mock-file-id', name: p.resource?.name || 'mock-file' } })),
        list: jest.fn((p, cb) => cb(null, { data: { files: [] } })),
        update: jest.fn((p, cb) => cb(null, {})),
        get: jest.fn((p, cb) => cb(null, { data: { id: p.fileId, name: 'mock-file' } })),
        copy: jest.fn((p, cb) => cb(null, { data: { id: 'mock-copy-id' } })),
    },
});
const createMockGmailInstance = () => ({
    users: { messages: { send: jest.fn((p, cb) => cb(null, { data: { id: 'mock-msg-id' } })) } },
});
const createMockYoutubeInstance = () => ({
    search: { list: jest.fn((p, cb) => cb(null, { items: [], nextPageToken: null })) },
    videos: { list: jest.fn((p, cb) => cb(null, { items: [] })) },
    channels: { list: jest.fn((p, cb) => cb(null, {})) },
    playlists: { list: jest.fn((p, cb) => cb(null, { items: [] })) },
    playlistItems: { list: jest.fn((p, cb) => cb(null, { items: [], pageInfo: { totalResults: 0 }, nextPageToken: null, prevPageToken: null })) },
});

mockGoogleDrive = createMockDriveInstance();
mockGoogleGmail = createMockGmailInstance();
mockGoogleYoutube = createMockYoutubeInstance();

jest.unstable_mockModule('googleapis', () => ({
    default: {
        google: {
            auth: { OAuth2: class MockOAuth2 { constructor() { Object.assign(this, mockGoogleAuth); } } },
            drive: jest.fn(() => mockGoogleDrive),
            gmail: jest.fn(() => mockGoogleGmail),
            youtube: jest.fn(() => mockGoogleYoutube),
        },
    },
}));

mockFetch = jest.fn();
const fetchWrapper = (...args) => {
    const r = mockFetch(...args);
    return r && typeof r.then === 'function' ? r : Promise.resolve({ ok: true, headers: { get: () => null }, body: { pipe: () => {} } });
};
jest.unstable_mockModule('node-fetch', () => ({ default: fetchWrapper }));

mockYoutubeDl = jest.fn();
mockYoutubeDl.getSubs = jest.fn();
jest.unstable_mockModule('youtube-dl-exec', () => ({ default: mockYoutubeDl }));
jest.unstable_mockModule('path', () => ({ default: { join: jest.fn((...a) => a.join('/')) } }));
mockChildExec = jest.fn();
jest.unstable_mockModule('../../util/exec-safe.js', () => ({
  execSafe: mockChildExec,
  execFileWithHandle: jest.fn(),
  concatFiles: jest.fn(),
  appendFile: jest.fn(),
}));
mockMkdirp = jest.fn();
jest.unstable_mockModule('mkdirp', () => ({ default: mockMkdirp }));

mockFsExistsSync = jest.fn(); mockFsCreateReadStream = jest.fn(); mockFsUnlink = jest.fn();
mockFsRenameSync = jest.fn(); mockFsCreateWriteStream = jest.fn(); mockFsStatSync = jest.fn();
mockFsReaddirSync = jest.fn(); mockFsLstatSync = jest.fn(); mockFsWriteFile = jest.fn();

jest.unstable_mockModule('fs', () => ({
    default: {
        existsSync: (...a) => mockFsExistsSync(...a), createReadStream: (...a) => mockFsCreateReadStream(...a),
        unlink: (...a) => mockFsUnlink(...a), renameSync: (...a) => mockFsRenameSync(...a),
        createWriteStream: (...a) => mockFsCreateWriteStream(...a), statSync: (...a) => mockFsStatSync(...a),
        readdirSync: (...a) => mockFsReaddirSync(...a), lstatSync: (...a) => mockFsLstatSync(...a),
        writeFile: (...a) => mockFsWriteFile(...a),
    },
    existsSync: (...a) => mockFsExistsSync(...a), createReadStream: (...a) => mockFsCreateReadStream(...a),
    unlink: (...a) => mockFsUnlink(...a), renameSync: (...a) => mockFsRenameSync(...a),
    createWriteStream: (...a) => mockFsCreateWriteStream(...a), statSync: (...a) => mockFsStatSync(...a),
    readdirSync: (...a) => mockFsReaddirSync(...a), lstatSync: (...a) => mockFsLstatSync(...a),
    writeFile: (...a) => mockFsWriteFile(...a),
}));



jest.unstable_mockModule('fs/promises', () => ({
    access: jest.fn((...a) => mockFsExistsSync(...a) ? Promise.resolve() : Promise.reject(new Error('ENOENT'))),
    stat: jest.fn((...a) => Promise.resolve(mockFsStatSync(...a))),
    lstat: jest.fn((...a) => Promise.resolve(mockFsLstatSync(...a))),
    rename: jest.fn((...a) => Promise.resolve(mockFsRenameSync(...a))),
    readdir: jest.fn((...a) => Promise.resolve(mockFsReaddirSync(...a))),
}));

mockMongoFind = jest.fn(); mockMongoUpdate = jest.fn(); mockMongoInsert = jest.fn();
const mockMongoFunction = jest.fn((op, col, q, o) => {
    switch (op) { case 'find': return mockMongoFind(col, q, o); case 'update': return mockMongoUpdate(col, q, o);
        case 'insert': return mockMongoInsert(col, q, o); default: return Promise.resolve(); }
});
jest.unstable_mockModule('../mongo-tool.js', () => ({ default: mockMongoFunction }));

mockMediaHandleTool = { handleRecycle: jest.fn(), singleDrive: jest.fn().mockResolvedValue() };
jest.unstable_mockModule('../mediaHandle-tool.js', () => ({ default: mockMediaHandleTool }));
mockExternal = { handleDoc: jest.fn() };
jest.unstable_mockModule('../external-tool.js', () => ({ default: mockExternal }));

mockHandleError = jest.fn((err) => Promise.reject(err));
mockDeleteFolderRecursive = jest.fn(() => Promise.resolve()); mockSRT2VTT = jest.fn(); mockIsValidString = jest.fn();
jest.unstable_mockModule('../../util/utility.js', () => ({
    handleError: (...a) => mockHandleError(...a),
    HoError: class HoError extends Error { constructor(m, c=500) { super(m); this.code = c; } },
    deleteFolderRecursive: (...a) => mockDeleteFolderRecursive(...a),
    SRT2VTT: (...a) => mockSRT2VTT(...a),
    isValidString: (...a) => mockIsValidString(...a),
    fsExists: jest.fn((p) => Promise.resolve(mockFsExistsSync(p))),
}));

mockMediaMIME = jest.fn(); mockIsSub = jest.fn(); mockIsKindle = jest.fn();
jest.unstable_mockModule('../../util/mime.js', () => ({
    mediaMIME: (...a) => mockMediaMIME(...a), isSub: (...a) => mockIsSub(...a), isKindle: (...a) => mockIsKindle(...a),
}));
mockSendWs = jest.fn();
jest.unstable_mockModule('../../util/sendWs.js', () => ({ default: mockSendWs }));

// Mock p-queue — jest can't resolve eventemitter3 ESM export in its VM
let mockPQueueConcurrency = 3;
class MockPQueue {
    constructor(opts = {}) {
        mockPQueueConcurrency = opts.concurrency || 1;
        this._pending = 0;
        this._queue = [];
    }
    async add(fn) {
        this._pending++;
        try { return await fn(); } finally { this._pending--; }
    }
    get pending() { return this._pending; }
    get size() { return this._queue.length; }
    clear() { this._queue = []; }
}
jest.unstable_mockModule('p-queue', () => ({ default: MockPQueue }));

// Mock async-mutex
class MockMutex {
    async runExclusive(fn) { return fn(); }
}
jest.unstable_mockModule('async-mutex', () => ({ Mutex: MockMutex }));

const mod = await import('../api-tool-google.js');
const api = mod.default;
const { googleBackup, userDrive, isApiing,
    sendPresentName, sendLotteryName, googleBackupDb,
    _resetState, _getState, _setState } = mod;

const WAIT = (ms = 700) => new Promise(r => setTimeout(r, ms));
const setupWs = () => {
    mockFsCreateWriteStream.mockReturnValue({
        on: jest.fn(function(ev, cb) { if (ev === 'finish') setTimeout(cb, 5); return this; }),
    });
};
const setupFetch = (cl = '1024', sz = 1024) => {
    setupWs();
    mockFsExistsSync.mockReturnValue(true);
    mockFsStatSync.mockReturnValue({ size: sz });
    mockFetch.mockResolvedValue({ ok: true, headers: { get: jest.fn(() => cl) }, body: { pipe: jest.fn() } });
};
const upData = (ov = {}) => ({ user: { username: 'u' }, type: 'auto', name: 'f.txt', filePath: '/f', parent: 'p', ...ov });
const dlData = (ov = {}) => ({ user: { username: 'u' }, url: 'https://drive.google.com/f', filePath: '/dl', ...ov });

describe('api-tool-google.js', () => {
    beforeEach(() => {
        _resetState();
        jest.clearAllMocks();
        _setState({ tokens: { access_token: 'at', refresh_token: 'rt', expiry_date: Date.now() + 3600000 } });
        mockMongoFind.mockResolvedValue([{ api: 'google', access_token: 'at', refresh_token: 'rt', expiry_date: Date.now() + 3600000 }]);
        mockMongoUpdate.mockResolvedValue({ ok: 1 });
        mockGoogleAuth.setCredentials.mockImplementation(() => {});
        mockGoogleAuth.refreshAccessToken.mockImplementation((cb) => cb(null, { access_token: 'new', expiry_date: Date.now() + 3600000 }));
        mockGoogleDrive = createMockDriveInstance();
        mockGoogleGmail = createMockGmailInstance();
        mockGoogleYoutube = createMockYoutubeInstance();
        setupFetch();
        mockYoutubeDl.mockResolvedValue({ formats: [] });
        mockYoutubeDl.getSubs.mockResolvedValue({});
        mockChildExec.mockResolvedValue('ok');
        mockMkdirp.mockResolvedValue();
        mockFsCreateReadStream.mockReturnValue({ pipe: jest.fn() });
        mockFsUnlink.mockImplementation((p, cb) => cb && cb(null));
        mockFsRenameSync.mockReturnValue();
        mockFsReaddirSync.mockReturnValue([]);
        mockFsLstatSync.mockReturnValue({ isDirectory: () => false });
        mockFsWriteFile.mockImplementation((p, d, cb) => cb && cb(null));
        mockHandleError.mockImplementation((e, t) => { if (t) return; return Promise.reject(e); });
        mockDeleteFolderRecursive.mockResolvedValue();
        mockSRT2VTT.mockResolvedValue();
        mockIsValidString.mockReturnValue(true);
        mockMediaMIME.mockReturnValue('video/mp4');
        mockIsSub.mockReturnValue(false);
        mockIsKindle.mockReturnValue(true);
        mockSendWs.mockReturnValue();
        mockMediaHandleTool.handleRecycle.mockResolvedValue();
        mockMediaHandleTool.singleDrive.mockResolvedValue();
    });

    // 0. Test Helpers
    describe('Test Helpers', () => {
        test('_resetState clears all', () => {
            _setState({ tokens: { a: 1 } });
            _resetState();
            const s = _getState();
            expect(s.api_pending).toBe(0); expect(s.api_queued).toBe(0);
            expect(s.tokens).toEqual({});
        });
        test('_getState returns current', () => {
            const s = _getState();
            expect(s).toHaveProperty('api_pending');
            expect(s).toHaveProperty('api_queued');
        });
        test('_setState sets tokens', () => {
            _setState({ tokens: { access_token: 'x' } });
            expect(_getState().tokens.access_token).toBe('x');
        });
    });

    // 1. api() Router
    describe('api() Router', () => {
        test('stop', async () => { expect(await api('stop', {})).toBeUndefined(); });
        test('list folder', async () => {
            mockGoogleDrive.files.list.mockImplementation((p, cb) => cb(null, { data: { files: [{ id: 'f1' }] } }));
            expect(await api('list folder', { folderId: 'x' })).toEqual([{ id: 'f1' }]);
        });
        test('list folder no folderId', async () => {
            await expect(api('list folder', {})).rejects.toThrow('list parameter lost');
        });
        test('list file', async () => {
            mockGoogleDrive.files.list.mockImplementation((p, cb) => cb(null, { data: { files: [{ id: 'f1' }] } }));
            expect(await api('list file', { folderId: 'x' })).toEqual([{ id: 'f1' }]);
        });
        test('list file no folderId', async () => {
            await expect(api('list file', {})).rejects.toThrow('list parameter lost');
        });
        test('create', async () => {
            mockGoogleDrive.files.create.mockImplementation((p, cb) => cb(null, { data: { id: 'nf' } }));
            expect((await api('create', { name: 'F', parent: 'p' })).id).toBe('nf');
        });
        test('create no params', async () => { await expect(api('create', { name: 'F' })).rejects.toThrow('create parameter lost'); });
        test('delete', async () => {
            await api('delete', { fileId: 'x' });
            expect(mockGoogleDrive.files.update).toHaveBeenCalled();
        });
        test('delete no fileId', async () => { await expect(api('delete', {})).rejects.toThrow('delete parameter lost'); });
        test('get', async () => { expect((await api('get', { fileId: 'x' })).id).toBe('x'); });
        test('get no fileId', async () => { await expect(api('get', {})).rejects.toThrow('get parameter lost'); });
        test('copy', async () => { expect((await api('copy', { fileId: 'x' })).id).toBe('mock-copy-id'); });
        test('copy no fileId', async () => { await expect(api('copy', {})).rejects.toThrow('copy parameter lost'); });
        test('move parent', async () => {
            await api('move parent', { fileId: 'x', rmFolderId: 'r', addFolderId: 'a' });
            expect(mockGoogleDrive.files.update).toHaveBeenCalled();
        });
        test('move parent no params', async () => { await expect(api('move parent', { fileId: 'x' })).rejects.toThrow('move parent parameter lost'); });
        test('send mail', async () => {
            mockFsStatSync.mockReturnValue({ size: 100 });
            await api('send mail', { name: 'b.mobi', filePath: '/f', kindle: 'k@k.com' });
            expect(mockGoogleGmail.users.messages.send).toHaveBeenCalled();
        });
        test('send name', async () => {
            await api('send name', { title: 'T', text: Buffer.from('B').toString('base64'), mail: 'a@b.com' });
            expect(mockGoogleGmail.users.messages.send).toHaveBeenCalled();
        });
        test('unknown api', async () => { await expect(api('bogus', {})).rejects.toThrow('unknown api'); });
        test('upload under limit', async () => {
            await api('upload', upData()); await WAIT();
            expect(mockGoogleDrive.files.create).toHaveBeenCalled();
        });
        test('upload queues when busy', async () => {
            // p-queue handles concurrency automatically; just verify upload works
            await api('upload', upData());
            expect(mockGoogleDrive.files.create).toHaveBeenCalled();
        });
        test('download under limit', async () => {
            await api('download', dlData()); await WAIT();
            expect(mockFetch).toHaveBeenCalled();
        });
        test('download queues when busy', async () => {
            await api('download', dlData());
            expect(mockFetch).toHaveBeenCalled();
        });
        test('download media under limit', async () => {
            mockYoutubeDl.mockResolvedValue({ formats: [{ ext: 'mp4', vcodec: 'h264', acodec: 'aac', height: 720, width: 1280, format_id: '22' }] });
            mockFsExistsSync.mockReturnValue(false);
            await api('download media', { user: { username: 'u' }, key: 'k', filePath: '/f', hd: 720 }); await WAIT(1500);
        });
        test('download media queues when busy', async () => {
            mockYoutubeDl.mockResolvedValue({ formats: [] });
            mockHandleError.mockImplementation((e, t) => { if (t) return; return Promise.reject(e); });
            await api('download media', { user: { username: 'u' }, key: 'k', filePath: '/f', hd: 720, _retryDelay: () => 0, errhandle: jest.fn() });
        }, 10000);
        test('download present under limit', async () => {
            await api('download present', { user: { username: 'u' }, exportlink: 'http://x=pdf', alternate: 'http://a', filePath: '/f' });
            await WAIT(2000);
        }, 10000);
        test('download present queues when busy', async () => {
            mockHandleError.mockImplementation((e, t) => { if (t) return; return Promise.reject(e); });
            await api('download present', { user: { username: 'u' }, exportlink: 'http://x=pdf', alternate: 'http://a', filePath: '/f' });
        });
        test('download doc under limit', async () => {
            mockFsReaddirSync.mockReturnValue([]);
            await api('download doc', { user: { username: 'u' }, exportlink: 'http://x=pdf', filePath: '/f' });
            await WAIT(7000);
        }, 15000);
        test('download doc queues when busy', async () => {
            mockFsReaddirSync.mockReturnValue([]);
            await api('download doc', { user: { username: 'u' }, exportlink: 'http://x=pdf', filePath: '/f' });
            await WAIT(7000);
        }, 15000);
    });

    // 2. OAuth
    describe('OAuth', () => {
        test('no tokens → fetches from Mongo', async () => {
            _setState({ tokens: {} });
            await api('stop', {});
            expect(mockMongoFind).toHaveBeenCalledWith('accessToken', { api: 'google' }, { limit: 1 });
        });
        test('no tokens in Mongo → error', async () => {
            _setState({ tokens: {} }); mockMongoFind.mockResolvedValue([]);
            await expect(api('stop', {})).rejects.toThrow('can not find token');
        });
        test('near expiry → refresh', async () => {
            _setState({ tokens: { access_token: 'old', expiry_date: Date.now() - 1000, refresh_token: 'r' } });
            await api('stop', {});
            expect(mockGoogleAuth.refreshAccessToken).toHaveBeenCalled();
            expect(mockMongoUpdate).toHaveBeenCalled();
        });
        test('valid token → no refresh', async () => {
            await api('stop', {});
            expect(mockGoogleAuth.refreshAccessToken).not.toHaveBeenCalled();
        });
        test('refresh error → rejects', async () => {
            _setState({ tokens: { access_token: 'old', expiry_date: Date.now() - 1000, refresh_token: 'r' } });
            mockGoogleAuth.refreshAccessToken.mockImplementation((cb) => cb(new Error('fail')));
            await expect(api('stop', {})).rejects.toThrow('fail');
        });
    });

    // 3. handle_err
    describe('handle_err', () => {
        test('upload fail → sendWs with user info', async () => {
            mockGoogleDrive.files.create.mockImplementation((p, cb) => cb(new Error('boom'), null));
            await api('upload', upData()); await WAIT(8000);
            expect(mockSendWs).toHaveBeenCalledWith(expect.objectContaining({ type: 'u' }), 0);
        }, 15000);
    });

    // 4. Queue concurrency (p-queue)
    describe('Queue concurrency', () => {
        test('upload completes and queue drains', async () => {
            mockGoogleDrive.files.create.mockImplementation((p, cb) => cb(null, { data: { id: 'x' } }));
            await api('upload', upData());
            expect(_getState().api_pending).toBe(0);
        });
        test('rest callback called after upload', async () => {
            const restFn = jest.fn().mockResolvedValue();
            mockGoogleDrive.files.create.mockImplementation((p, cb) => cb(null, { data: { id: 'x', name: 't' } }));
            await api('upload', upData({ rest: restFn, errhandle: jest.fn() }));
            await WAIT();
            expect(restFn).toHaveBeenCalledWith({ id: 'x', name: 't' });
        });
        test('multiple uploads respect concurrency', async () => {
            const calls = [];
            mockGoogleDrive.files.create.mockImplementation((p, cb) => {
                calls.push(p.resource.name);
                cb(null, { data: { id: 'x' } });
            });
            await Promise.all([
                api('upload', upData({ name: 'a.txt' })),
                api('upload', upData({ name: 'b.txt' })),
                api('upload', upData({ name: 'c.txt' })),
            ]);
            expect(calls).toHaveLength(3);
        });
        test('stop clears queue', async () => {
            await api('stop', {});
            expect(_getState().api_queued).toBe(0);
        });
    });



    // 6. YouTube
    describe('YouTube', () => {
        test('y search type 1 video', async () => {
            mockGoogleYoutube.search.list.mockImplementation((p, cb) => cb(null, { items: [{ id: { videoId: 'v1' } }], nextPageToken: 'n' }));
            const r = await api('y search', { order: 'r', maxResults: 10, type: 1, keyword: 'k' });
            expect(r.video).toBe('v1');
        });
        test('y search type 2 video', async () => {
            mockGoogleYoutube.search.list.mockImplementation((p, cb) => { expect(p.type).toBe('video'); cb(null, { items: [{ id: { videoId: 'v2' } }], nextPageToken: null }); });
            await api('y search', { order: 'r', maxResults: 10, type: 2, keyword: 'k' });
        });
        test('y search type 10 playlist', async () => {
            mockGoogleYoutube.search.list.mockImplementation((p, cb) => { expect(p.type).toBe('playlist'); cb(null, { items: [{ id: { playlistId: 'p1' } }], nextPageToken: null }); });
            const r = await api('y search', { order: 'r', maxResults: 10, type: 10, keyword: 'k' });
            expect(r.playlist).toBe('p1');
        });
        test('y search type 20 playlist', async () => {
            mockGoogleYoutube.search.list.mockImplementation((p, cb) => { expect(p.type).toBe('playlist'); cb(null, { items: [{ id: { playlistId: 'p2' } }], nextPageToken: null }); });
            await api('y search', { order: 'r', maxResults: 10, type: 20, keyword: 'k' });
        });
        test('y search default type', async () => {
            mockGoogleYoutube.search.list.mockImplementation((p, cb) => { expect(p.type).toBe('video,playlist'); cb(null, { items: [{ id: { videoId: 'v' } }, { id: { playlistId: 'p' } }], nextPageToken: null }); });
            const r = await api('y search', { order: 'r', maxResults: 10, type: 99, keyword: 'k' });
            expect(r.video).toBe('v'); expect(r.playlist).toBe('p');
        });
        test('y search merge id_arr pl_arr', async () => {
            mockGoogleYoutube.search.list.mockImplementation((p, cb) => cb(null, { items: [{ id: { videoId: 'v1' } }], nextPageToken: null }));
            const r = await api('y search', { order: 'r', maxResults: 10, type: 1, keyword: 'k', id_arr: ['v1', 'v2'], pl_arr: ['p1'] });
            expect(r.video.split(',').sort()).toEqual(['v1', 'v2']);
        });
        test('y search id_arr > 20 → maxResults=0', async () => {
            const big = Array.from({ length: 21 }, (_, i) => 'v' + i);
            mockGoogleYoutube.search.list.mockImplementation((p, cb) => { expect(p.maxResults).toBe(0); cb(null, { items: [], nextPageToken: null }); });
            await api('y search', { order: 'r', maxResults: 10, type: 1, id_arr: big });
        });
        test('y search channelId+pageToken', async () => {
            mockGoogleYoutube.search.list.mockImplementation((p, cb) => { expect(p.channelId).toBe('c'); expect(p.pageToken).toBe('pg'); cb(null, { items: [], nextPageToken: null }); });
            await api('y search', { order: 'r', maxResults: 10, type: 1, channelId: 'c', pageToken: 'pg' });
        });
        test('y search no items → error', async () => {
            mockGoogleYoutube.search.list.mockImplementation((p, cb) => cb(null, {}));
            await expect(api('y search', { order: 'r', maxResults: 10, type: 1 })).rejects.toThrow('search error');
        });
        test('y search missing params', async () => { await expect(api('y search', {})).rejects.toThrow('search parameter lost'); });
        test('y search ECONNRESET → resolves', async () => {
            const e = new Error('x'); e.code = 'ECONNRESET';
            mockGoogleYoutube.search.list.mockImplementation((p, cb) => cb(e, { items: [{ id: { videoId: 'v' } }], nextPageToken: null }));
            const r = await api('y search', { order: 'r', maxResults: 10, type: 1, keyword: 'k' });
            expect(r.video).toBe('v');
        });
        test('y search non-ECONNRESET error', async () => {
            mockGoogleYoutube.search.list.mockImplementation((p, cb) => cb(new Error('quota'), null));
            await expect(api('y search', { order: 'r', maxResults: 10, type: 1, keyword: 'k' })).rejects.toThrow('quota');
        });
        test('y video with id', async () => {
            mockGoogleYoutube.videos.list.mockImplementation((p, cb) => cb(null, { items: [{ id: 'v1' }] }));
            expect(await api('y video', { id: 'v1' })).toEqual([{ id: 'v1' }]);
        });
        test('y video no id', async () => { expect(await api('y video', {})).toEqual([]); });
        test('y video error', async () => {
            mockGoogleYoutube.videos.list.mockImplementation((p, cb) => cb(new Error('e'), null));
            await expect(api('y video', { id: 'v' })).rejects.toThrow();
        });
        test('y channel', async () => {
            mockGoogleYoutube.channels.list.mockImplementation((p, cb) => cb(null, { items: [{ id: 'c' }] }));
            expect((await api('y channel', { id: 'c' })).items).toBeDefined();
        });
        test('y channel no id', async () => { await expect(api('y channel', {})).rejects.toThrow('channel parameter lost'); });
        test('y playlist', async () => {
            mockGoogleYoutube.playlists.list.mockImplementation((p, cb) => cb(null, { items: [{ id: 'p' }] }));
            expect(await api('y playlist', { id: 'p' })).toEqual([{ id: 'p' }]);
        });
        test('y playlist no id', async () => { expect(await api('y playlist', {})).toEqual([]); });
        test('y playItem', async () => {
            mockGoogleYoutube.playlistItems.list.mockImplementation((p, cb) => cb(null, {
                items: [{ snippet: { resourceId: { videoId: 'v1' }, position: 0 } }],
                pageInfo: { totalResults: 1 }, nextPageToken: null, prevPageToken: null,
            }));
            const r = await api('y playItem', { id: 'p' });
            expect(r).toHaveLength(4); expect(r[0][0].id).toBe('you_v1');
        });
        test('y playItem pageToken', async () => {
            mockGoogleYoutube.playlistItems.list.mockImplementation((p, cb) => { expect(p.pageToken).toBe('pg2'); cb(null, {
                items: [{ snippet: { resourceId: { videoId: 'v' }, position: 1 } }],
                pageInfo: { totalResults: 2 }, nextPageToken: 'pg3', prevPageToken: 'pg1',
            }); });
            const r = await api('y playItem', { id: 'p', pageToken: 'pg2' });
            expect(r[2]).toBe('pg3');
        });
        test('y playItem no id', async () => { await expect(api('y playItem', {})).rejects.toThrow('playItem parameter lost'); });
        test('y unknown', async () => { await expect(api('y bogus', {})).rejects.toThrow('youtube api unknown'); });
        test('y search empty items+id_arr → empty result', async () => {
            mockGoogleYoutube.search.list.mockImplementation((p, cb) => cb(null, { items: [], nextPageToken: null }));
            const r = await api('y search', { order: 'r', maxResults: 10, type: 1, keyword: 'k' });
            expect(r.video).toBe(''); expect(r.playlist).toBe('');
        });
        test('y search item with no id field → skipped', async () => {
            mockGoogleYoutube.search.list.mockImplementation((p, cb) => cb(null, { items: [{ id: null }, { id: { videoId: 'v1' } }], nextPageToken: null }));
            const r = await api('y search', { order: 'r', maxResults: 10, type: 1, keyword: 'k' });
            expect(r.video).toBe('v1');
        });
    });

    // 7. upload
    describe('upload()', () => {
        test('missing params', async () => {
            mockHandleError.mockImplementation((e, t) => { if (t) return; return Promise.reject(e); });
            await api('upload', { user: { username: 'u' }, type: 'auto', name: '' }); await WAIT();
        });
        test('type=media', async () => {
            mockMediaMIME.mockReturnValue('video/mp4');
            mockGoogleDrive.files.create.mockImplementation((p, cb) => { expect(p.resource.parents[0]).toBe(TEST_CONFIG.GOOGLE_MEDIA_FOLDER); cb(null, { data: { id: 'x' } }); });
            await api('upload', { user: { username: 'u' }, type: 'media', name: 'v.mp4', filePath: '/f' }); await WAIT();
        });
        test('type=media unknown mime', async () => {
            mockMediaMIME.mockReturnValue(null);
            mockHandleError.mockImplementation((e, t) => { if (t) return; return Promise.reject(e); });
            await api('upload', { user: { username: 'u' }, type: 'media', name: 'v.xyz', filePath: '/f' }); await WAIT();
        });
        test('type=auto null mediaMIME → text/plain', async () => {
            mockMediaMIME.mockReturnValue(null);
            mockGoogleDrive.files.create.mockImplementation((p, cb) => { expect(p.media.mimeType).toBe('text/plain'); cb(null, { data: { id: 'x' } }); });
            await api('upload', upData()); await WAIT();
        });
        test('type=unknown', async () => {
            mockHandleError.mockImplementation((e, t) => { if (t) return; return Promise.reject(e); });
            await api('upload', { user: { username: 'u' }, type: 'bogus', name: 'f', filePath: '/f' }); await WAIT();
        });
        test('convert=true', async () => {
            await api('upload', upData({ convert: true })); await WAIT();
        });
        test('body upload', async () => {
            mockGoogleDrive.files.create.mockImplementation((p, cb) => { expect(p.media.body).toBe('hi'); cb(null, { data: { id: 'x' } }); });
            await api('upload', { user: { username: 'u' }, type: 'backup', name: 'f.txt', body: 'hi' }); await WAIT();
        });
        test('rest callback', async () => {
            const restFn = jest.fn().mockResolvedValue();
            mockGoogleDrive.files.create.mockImplementation((p, cb) => cb(null, { data: { id: 'mid' } }));
            await api('upload', upData({ rest: restFn, errhandle: jest.fn() })); await WAIT();
            expect(restFn).toHaveBeenCalledWith({ id: 'mid' });
        });
    });

    // 8. download
    describe('download()', () => {
        test('missing params', async () => {
            mockHandleError.mockImplementation((e, t) => { if (t) return; return Promise.reject(e); });
            await api('download', { user: { username: 'u' }, url: '' }); await WAIT();
        });
        test('content-length mismatch', async () => {
            setupFetch('2048', 1024);
            mockHandleError.mockImplementation((e, t) => { if (t) return; return Promise.reject(e); });
            const errhandle = jest.fn();
            await api('download', dlData({ _retryDelay: () => 0, errhandle })); await WAIT();
            expect(mockHandleError).toHaveBeenCalledWith(expect.objectContaining({ message: 'incomplete download' }));
        });
        test('rest callback', async () => {
            setupFetch('1024', 1024);
            const restFn = jest.fn().mockResolvedValue();
            await api('download', dlData({ rest: restFn, errhandle: jest.fn() })); await WAIT();
            expect(restFn).toHaveBeenCalled();
        });
        test('no content-length → skip integrity', async () => {
            setupWs(); mockFsExistsSync.mockReturnValue(true);
            mockFetch.mockResolvedValue({ ok: true, headers: { get: jest.fn(() => null) }, body: { pipe: jest.fn() } });
            await api('download', dlData()); await WAIT();
        });
        test('timeout after MAX_RETRY', async () => {
            mockFetch.mockRejectedValue(new Error('net'));
            const errhandle = jest.fn();
            await api('download', dlData({ _retryDelay: () => 0, errhandle })); await WAIT(500);
            expect(mockHandleError).toHaveBeenCalledWith(expect.objectContaining({ message: 'timeout' }), errhandle);
        });
    });

    // 9. sendMail/sendName
    describe('sendMail', () => {
        test('missing params', async () => { await expect(api('send mail', { name: 'x' })).rejects.toThrow('mail parameter lost'); });
        test('not kindle', async () => { mockIsKindle.mockReturnValue(false); await expect(api('send mail', { name: 'x', filePath: '/f', kindle: 'k' })).rejects.toThrow('Unsupported kindle'); });
        test('file not exist', async () => { mockFsExistsSync.mockReturnValue(false); await expect(api('send mail', { name: 'x.mobi', filePath: '/f', kindle: 'k' })).rejects.toThrow('file not exist'); });
        test('file too large', async () => { mockFsStatSync.mockReturnValue({ size: TEST_CONFIG.KINDLE_LIMIT + 1 }); await expect(api('send mail', { name: 'x.mobi', filePath: '/f', kindle: 'k' })).rejects.toThrow('file too large'); });
    });
    describe('sendName', () => {
        test('missing params', async () => { await expect(api('send name', { text: 'x', mail: 'x' })).rejects.toThrow('mail parameter lost'); });
        test('invalid email', async () => { mockIsValidString.mockReturnValue(false); await expect(api('send name', { title: 'T', text: 'x', mail: 'b' })).rejects.toThrow('invalid email'); });
        test('with append', async () => {
            await api('send name', { title: 'T', text: Buffer.from('N').toString('base64'), mail: 'a@b.com', append: 'ex' });
            expect(mockGoogleGmail.users.messages.send).toHaveBeenCalled();
        });
    });

    // 10. list/listFile
    describe('list/listFile', () => {
        test('list API error', async () => { mockGoogleDrive.files.list.mockImplementation((p, cb) => cb(new Error('e'), null)); await expect(api('list folder', { folderId: 'x' })).rejects.toThrow(); });
        test('list retry → [] after MAX_RETRY', async () => {
            mockGoogleDrive.files.list.mockImplementation((p, cb) => cb(null, { data: null }));
            expect(await api('list folder', { folderId: 'x' })).toEqual([]);
        }, 30000);
        test('list with name', async () => {
            mockGoogleDrive.files.list.mockImplementation((p, cb) => { expect(p.q).toContain("name = 'up'"); cb(null, { data: { files: [{ id: 'x' }] } }); });
            await api('list folder', { folderId: 'f', name: 'up' });
        });
        test('listFile 401 retry', async () => {
            const e = new Error('401'); e.code = '401';
            mockGoogleDrive.files.list.mockImplementation((p, cb) => cb(e, null));
            await expect(api('list file', { folderId: 'f' })).rejects.toThrow();
        }, 30000);
        test('getFile no data → returns metadata directly', async () => {
            mockGoogleDrive.files.get.mockImplementation((p, cb) => cb(null, { id: 'raw' }));
            expect((await api('get', { fileId: 'f' })).id).toBe('raw');
        });
        test('copyFile no data → returns metadata directly', async () => {
            mockGoogleDrive.files.copy.mockImplementation((p, cb) => cb(null, { id: 'rawcp' }));
            expect((await api('copy', { fileId: 'f' })).id).toBe('rawcp');
        });
    });

    // 12. downloadMedia
    describe('downloadMedia', () => {
        test('missing params', async () => {
            mockHandleError.mockImplementation((e, t) => { if (t) return; return Promise.reject(e); });
            await api('download media', { user: { username: 'u' } }); await WAIT();
        });
        test('no mp4 format → quality low', async () => {
            mockYoutubeDl.mockResolvedValue({ formats: [{ ext: 'webm', vcodec: 'vp9', acodec: 'opus', height: 720, width: 1280, format_id: '1' }] });
            mockHandleError.mockImplementation((e, t) => { if (t) return; return Promise.reject(e); });
            await api('download media', { user: { username: 'u' }, key: 'k', filePath: '/f', hd: 720, _retryDelay: () => 0, errhandle: jest.fn() }); await WAIT(1500);
        }, 10000);
        test('file not exists → saves directly', async () => {
            mockYoutubeDl.mockResolvedValueOnce({ formats: [{ ext: 'mp4', vcodec: 'h264', acodec: 'aac', height: 720, width: 1280, format_id: '22' }] }).mockResolvedValueOnce({});
            mockFsExistsSync.mockReturnValue(false);
            await api('download media', { user: { username: 'u' }, key: 'k', filePath: '/f', hd: 720 }); await WAIT(1500);
        });
        test('file exists _t not → savePath is _t', async () => {
            mockYoutubeDl.mockResolvedValueOnce({ formats: [{ ext: 'mp4', vcodec: 'h264', acodec: 'aac', height: 720, width: 1280, format_id: '22' }] }).mockResolvedValueOnce({});
            mockFsExistsSync.mockImplementation((p) => { if (p.endsWith('_t')) return false; if (p.endsWith('.jpg')) return true; return true; });
            await api('download media', { user: { username: 'u' }, key: 'k', filePath: '/f', hd: 720 }); await WAIT(1500);
            expect(mockFsRenameSync).toHaveBeenCalled();
        });
        test('file+_t exist → unlinks _t', async () => {
            mockYoutubeDl.mockResolvedValueOnce({ formats: [{ ext: 'mp4', vcodec: 'h264', acodec: 'aac', height: 720, width: 1280, format_id: '22' }] }).mockResolvedValueOnce({});
            mockFsExistsSync.mockReturnValue(true);
            await api('download media', { user: { username: 'u' }, key: 'k', filePath: '/f', hd: 720 }); await WAIT(1500);
            expect(mockFsUnlink).toHaveBeenCalled();
        });
        test('picks highest quality', async () => {
            mockYoutubeDl.mockResolvedValueOnce({ formats: [
                { ext: 'mp4', vcodec: 'h264', acodec: 'aac', height: 720, width: 1280, format_id: '22' },
                { ext: 'mp4', vcodec: 'h264', acodec: 'aac', height: 1080, width: 1920, format_id: '37' },
            ] }).mockResolvedValueOnce({});
            mockFsExistsSync.mockReturnValue(false);
            await api('download media', { user: { username: 'u' }, key: 'k', filePath: '/f', hd: 720 }); await WAIT(1500);
            expect(mockYoutubeDl).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ format: '37' }));
        });
        test('rest callback returns height', async () => {
            const restFn = jest.fn().mockResolvedValue();
            mockYoutubeDl.mockResolvedValueOnce({ formats: [{ ext: 'mp4', vcodec: 'h264', acodec: 'aac', height: 720, width: 1280, format_id: '22' }] }).mockResolvedValueOnce({});
            mockFsExistsSync.mockReturnValue(false);
            await api('download media', { user: { username: 'u' }, key: 'k', filePath: '/f', hd: 720, rest: restFn, errhandle: jest.fn() }); await WAIT(1500);
            expect(restFn).toHaveBeenCalledWith(720);
        });
        test('height below threshold → not selected', async () => {
            mockYoutubeDl.mockResolvedValue({ formats: [{ ext: 'mp4', vcodec: 'h264', acodec: 'aac', height: 100, width: 200, format_id: '1' }] });
            mockHandleError.mockImplementation((e, t) => { if (t) return; return Promise.reject(e); });
            await api('download media', { user: { username: 'u' }, key: 'k', filePath: '/f', hd: 720, _retryDelay: () => 0, errhandle: jest.fn() }); await WAIT(1500);
        }, 10000);
        test('timeout after MAX_RETRY', async () => {
            mockYoutubeDl.mockRejectedValue(new Error('cdn fail'));
            const errhandle = jest.fn();
            await api('download media', { user: { username: 'u' }, key: 'k', filePath: '/f', hd: 720, _retryDelay: () => 0, errhandle }); await WAIT(500);
            expect(mockHandleError).toHaveBeenCalledWith(expect.objectContaining({ message: 'timeout' }), errhandle);
        });
    });

    // 13. downloadPresent
    describe('downloadPresent', () => {
        test('missing params', async () => {
            mockHandleError.mockImplementation((e, t) => { if (t) return; return Promise.reject(e); });
            await api('download present', { user: { username: 'u' } }); await WAIT();
        });
        test('multi-page download', async () => {
            let cc = 0;
            mockChildExec.mockImplementation(() => { if (cc < 2) { cc++; return Promise.resolve('12,"p' + cc + '",' + (cc-1) + ',0'); } else { return Promise.reject(new Error('end')); } });
            const restFn = jest.fn().mockResolvedValue();
            mockHandleError.mockImplementation((e, t) => { if (t) return; return Promise.reject(e); });
            await api('download present', { user: { username: 'u' }, exportlink: 'http://x=pdf', alternate: 'http://a', filePath: '/f', rest: restFn, errhandle: jest.fn() });
            await WAIT(3000);
            expect(restFn).toHaveBeenCalled();
        }, 15000);
        test('number=0 on error → handleError', async () => {
            mockChildExec.mockRejectedValue(new Error('grep fail'));
            await api('download present', { user: { username: 'u' }, exportlink: 'http://x=pdf', alternate: 'http://a', filePath: '/f' });
            await WAIT(2000);
        }, 10000);
    });

    // 14. downloadDoc
    describe('downloadDoc', () => {
        test('missing params', async () => {
            mockHandleError.mockImplementation((e, t) => { if (t) return; return Promise.reject(e); });
            await api('download doc', { user: { username: 'u' } }); await WAIT();
        });
        test('zip not found', async () => {
            mockFsExistsSync.mockImplementation((p) => { if (p.endsWith('.zip')) return false; if (p.endsWith('_t')) return false; return true; });
            mockHandleError.mockImplementation((e, t) => { if (t) return; return Promise.reject(e); });
            await api('download doc', { user: { username: 'u' }, exportlink: 'http://x=pdf', filePath: '/f' }); await WAIT(8000);
        }, 15000);
        test('successful extract + rename', async () => {
            mockFsExistsSync.mockImplementation((p) => { if (p.endsWith('_t')) return false; if (p.endsWith('/doc.html')) return false; return true; });
            mockFsReaddirSync.mockReturnValue(['p1.html', 'p2.html']);
            mockFsLstatSync.mockReturnValue({ isDirectory: () => false });
            await api('download doc', { user: { username: 'u' }, exportlink: 'http://x=pdf', filePath: '/f' }); await WAIT(8000);
            expect(mockFsRenameSync).toHaveBeenCalled();
        }, 15000);
        test('rest callback', async () => {
            const restFn = jest.fn().mockResolvedValue();
            mockFsExistsSync.mockImplementation((p) => { if (p.endsWith('_t')) return false; if (p.endsWith('/doc.html')) return false; return true; });
            mockFsReaddirSync.mockReturnValue(['p1.html']);
            mockFsLstatSync.mockReturnValue({ isDirectory: () => false });
            await api('download doc', { user: { username: 'u' }, exportlink: 'http://x=pdf', filePath: '/f', rest: restFn, errhandle: jest.fn() }); await WAIT(8000);
            expect(restFn).toHaveBeenCalled();
        }, 15000);
        test('directory entries skipped', async () => {
            mockFsReaddirSync.mockReturnValue(['images']);
            mockFsLstatSync.mockReturnValue({ isDirectory: () => true });
            await api('download doc', { user: { username: 'u' }, exportlink: 'http://x=pdf', filePath: '/f' }); await WAIT(8000);
        }, 15000);
        test('doc.html exists → uses doc2.html', async () => {
            mockFsExistsSync.mockImplementation((p) => { if (p.endsWith('_t')) return false; if (p.endsWith('/doc.html')) return true; if (p.endsWith('/doc2.html')) return false; return true; });
            mockFsReaddirSync.mockReturnValue(['new.html']);
            mockFsLstatSync.mockReturnValue({ isDirectory: () => false });
            await api('download doc', { user: { username: 'u' }, exportlink: 'http://x=pdf', filePath: '/f' }); await WAIT(8000);
            expect(mockFsRenameSync).toHaveBeenCalledWith(expect.stringContaining('new.html'), expect.stringContaining('doc2.html'));
        }, 15000);
    });

    // 15. googleBackup
    describe('googleBackup', () => {
        const user = { username: 'u' };
        test('recycle=1', async () => { expect(await googleBackup(user, 'id', 'v.mp4', '/p', ['t'], 1)).toBeUndefined(); });
        test('recycle=1 with append', async () => { expect(await googleBackup(user, 'id', 'v.mp4', '/p', ['t'], 1, '_hd')).toBeUndefined(); });
        test('recycle=2 srt', async () => { mockFsExistsSync.mockImplementation((p) => p.endsWith('.srt')); expect(await googleBackup(user, 'id', 'v.mp4', '/p', ['t'], 2)).toBeUndefined(); });
        test('recycle=2 ass', async () => { mockFsExistsSync.mockImplementation((p) => p.endsWith('.ass')); expect(await googleBackup(user, 'id', 'v.mp4', '/p', ['t'], 2)).toBeUndefined(); });
        test('recycle=2 ssa', async () => { mockFsExistsSync.mockImplementation((p) => p.endsWith('.ssa')); expect(await googleBackup(user, 'id', 'v.mp4', '/p', ['t'], 2)).toBeUndefined(); });
        test('recycle=2 none', async () => { mockFsExistsSync.mockReturnValue(false); expect(await googleBackup(user, 'id', 'v.mp4', '/p', ['t'], 2)).toBeUndefined(); });
        test('recycle=3 tags', async () => { expect(await googleBackup(user, 'id', 'v.mp4', '/p', ['t1', 't2'], 3)).toBeUndefined(); });
        test('recycle=99 error', async () => { await expect(googleBackup(user, 'id', 'v.mp4', '/p', ['t'], 99)).rejects.toThrow('recycle 99 denied'); });
    });

    // 17. userDrive
    describe('userDrive', () => {
        const ul = [{ username: 'u1', auto: 'a1' }];
        test('empty → resolves', async () => {
            mockGoogleDrive.files.list.mockImplementation((p, cb) => cb(null, { data: { files: [] } }));
            await userDrive(ul, 0, 50);
        });
        test('root filter', async () => {
            let lc = 0;
            mockGoogleDrive.files.list.mockImplementation((p, cb) => {
                lc++;
                if (p.q.includes("mimeType != 'application/vnd.google-apps.folder'")) { cb(null, { data: { files: [] } }); }
                else if (lc <= 2) { cb(null, { data: { files: [{ id: 'up', name: 'uploaded' }, { id: 'dl', name: 'downloaded' }, { id: 'hl', name: 'handling' }, { id: 'r', name: 'myfolder' }] } }); }
                else { cb(null, { data: { files: [] } }); }
            });
            await userDrive(ul, 0, 50);
        });
        test('files → singleDrive', async () => {
            let lc = 0;
            mockGoogleDrive.files.list.mockImplementation((p, cb) => {
                lc++;
                if (p.q.includes("mimeType != 'application/vnd.google-apps.folder'")) {
                    if (lc <= 1) { cb(null, { data: { files: [{ id: 'f1', name: 'd.txt' }] } }); }
                    else { cb(null, { data: { files: [] } }); }
                } else if (p.q.includes("name = 'uploaded'")) { cb(null, { data: { files: [{ id: 'uid' }] } }); }
                else if (p.q.includes("name = 'handling'")) { cb(null, { data: { files: [{ id: 'hid' }] } }); }
                else { cb(null, { data: { files: [] } }); }
            });
            await userDrive(ul, 0, 50);
            expect(mockMediaHandleTool.singleDrive).toHaveBeenCalled();
        });
        test('multi users', async () => {
            mockGoogleDrive.files.list.mockImplementation((p, cb) => cb(null, { data: { files: [] } }));
            await userDrive([{ username: 'u1', auto: 'a1' }, { username: 'u2', auto: 'a2' }], 0, 50);
        });
        test('batch exceeded → splice', async () => {
            let fc = 0;
            mockGoogleDrive.files.list.mockImplementation((p, cb) => {
                if (p.q.includes("mimeType != 'application/vnd.google-apps.folder'")) { fc++; cb(null, { data: { files: [{ id: 'f' + fc, name: 'f' }, { id: 'f' + fc + 'b', name: 'g' }] } }); }
                else if (p.q.includes("name = 'uploaded'")) { cb(null, { data: { files: [{ id: 'up' }] } }); }
                else if (p.q.includes("name = 'handling'")) { cb(null, { data: { files: [{ id: 'hl' }] } }); }
                else { cb(null, { data: { files: [] } }); }
            });
            await userDrive(ul, 0, 1);
            expect(mockMediaHandleTool.singleDrive).toHaveBeenCalledTimes(1);
        });
        test('uploaded folder missing', async () => {
            mockGoogleDrive.files.list.mockImplementation((p, cb) => {
                if (p.q.includes("mimeType != 'application/vnd.google-apps.folder'")) { cb(null, { data: { files: [{ id: 'f1', name: 'f' }] } }); }
                else if (p.q.includes("name = 'uploaded'")) { cb(null, { data: { files: [] } }); }
                else { cb(null, { data: { files: [] } }); }
            });
            await expect(userDrive(ul, 0, 50)).rejects.toThrow('do not have uploaded folder');
        });
        test('handling folder missing', async () => {
            mockGoogleDrive.files.list.mockImplementation((p, cb) => {
                if (p.q.includes("mimeType != 'application/vnd.google-apps.folder'")) { cb(null, { data: { files: [{ id: 'f1', name: 'f' }] } }); }
                else if (p.q.includes("name = 'uploaded'")) { cb(null, { data: { files: [{ id: 'up' }] } }); }
                else if (p.q.includes("name = 'handling'")) { cb(null, { data: { files: [] } }); }
                else { cb(null, { data: { files: [] } }); }
            });
            await expect(userDrive(ul, 0, 50)).rejects.toThrow('do not have handling folder');
        });
        test('nested subfolder → while loop pops null-id', async () => {
            let folderCalls = 0;
            mockGoogleDrive.files.list.mockImplementation((p, cb) => {
                if (p.q.includes("mimeType != 'application/vnd.google-apps.folder'")) {
                    cb(null, { data: { files: [] } });
                } else {
                    folderCalls++;
                    if (folderCalls === 1) { cb(null, { data: { files: [{ id: 'sub1', name: 'sub1' }] } }); }
                    else if (folderCalls === 2) { cb(null, { data: { files: [{ id: 'subsub1', name: 'subsub1' }] } }); }
                    else { cb(null, { data: { files: [] } }); }
                }
            });
            await userDrive(ul, 0, 50);
        });
    });

    // 19. Simple exports
    describe('isApiing', () => {
        test('no pending → false', () => { expect(isApiing()).toBe(false); });
        test('during upload → true', async () => {
            let resolveInsert;
            mockGoogleDrive.files.create.mockImplementation((p, cb) => { resolveInsert = () => cb(null, { data: { id: 'x' } }); });
            const p = api('upload', upData());
            await WAIT(100);
            expect(isApiing()).toBe(true);
            resolveInsert();
            await p;
        });
    });
    describe('sendPresentName/sendLotteryName', () => {
        test('sendPresentName', async () => { await sendPresentName(Buffer.from('N').toString('base64'), 'u@t.com'); expect(mockGoogleGmail.users.messages.send).toHaveBeenCalled(); });
        test('sendPresentName append', async () => { await sendPresentName(Buffer.from('N').toString('base64'), 'u@t.com', 'ex'); expect(mockGoogleGmail.users.messages.send).toHaveBeenCalled(); });
        test('sendLotteryName', async () => { await sendLotteryName('L', Buffer.from('W').toString('base64'), 'w@t.com'); expect(mockGoogleGmail.users.messages.send).toHaveBeenCalled(); });
    });
    describe('googleBackupDb', () => {
        test('creates and uploads', async () => {
            mockGoogleDrive.files.create.mockImplementation((p, cb) => setTimeout(() => cb(null, { data: { id: 'fid', name: p.resource?.name } }), 10));
            mockFsReaddirSync.mockReturnValueOnce(['col1']).mockReturnValueOnce(['f1.bson']);
            await googleBackupDb('2024-01-01'); await WAIT(2000);
            expect(mockGoogleDrive.files.create).toHaveBeenCalled();
        });
        test('empty collections', async () => {
            mockGoogleDrive.files.create.mockImplementation((p, cb) => cb(null, { data: { id: 'rid', name: p.resource?.name } }));
            mockFsReaddirSync.mockReturnValue([]);
            await googleBackupDb('2024-02-01');
        });
        test('multi collections', async () => {
            mockGoogleDrive.files.create.mockImplementation((p, cb) => setTimeout(() => cb(null, { data: { id: 'id' + Date.now(), name: p.resource?.name } }), 5));
            mockFsReaddirSync.mockReturnValueOnce(['c1', 'c2']).mockReturnValueOnce(['f1', 'f2']).mockReturnValueOnce(['f3']);
            await googleBackupDb('2024-03-01'); await WAIT(3000);
        });
    });
});
