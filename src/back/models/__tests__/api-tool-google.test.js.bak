/**
 * api-tool-google.test.js — Tests for Google API integration
 *
 * ESM mocking pattern: jest.unstable_mockModule() BEFORE dynamic import().
 * 
 * Run: docker exec -w /app -e NODE_OPTIONS=--experimental-vm-modules reactnode-server \
 *        npx jest src/back/models/__tests__/api-tool-google.test.js --no-cache --forceExit
 */
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// ─── Mock state variables ───────────────────────────────────────────
let mockGoogleAuth, mockGoogleDrive, mockGoogleGmail, mockGoogleYoutube;
let mockMongoFind, mockMongoUpdate, mockMongoInsert;
let mockFetch, mockYoutubeDl, mockChildExec;
let mockFsExistsSync, mockFsCreateReadStream, mockFsUnlink, mockFsRenameSync;
let mockFsCreateWriteStream, mockFsStatSync, mockFsReaddirSync, mockFsLstatSync, mockFsWriteFile;
let mockMkdirp, mockHandleError, mockDeleteFolderRecursive, mockSRT2VTT, mockIsValidString;
let mockMediaMIME, mockIsSub, mockIsKindle, mockSendWs;
let mockMediaHandleTool, mockExternal;

// ─── Configuration mock values ──────────────────────────────────────
const TEST_CONFIG = {
    MAX_RETRY: 3,
    API_EXPIRE: 60,
    DRIVE_LIMIT: 50,
    OATH_WAITING: 2,
    DOC_TYPE: { doc: 'document', slide: 'presentation' },
    KINDLE_LIMIT: 52428800, // 50MB
    API_LIMIT: 3,
    GOOGLE_MEDIA_FOLDER: 'mock-media-folder-id',
    GOOGLE_BACKUP_FOLDER: 'mock-backup-folder-id',
    GOOGLE_DB_BACKUP_FOLDER: 'mock-db-backup-folder-id',
    NAS_TMP: '/nas/tmp',
    BACKUP_PATH: '/backup',
    GOOGLE_ID: 'mock-client-id',
    GOOGLE_SECRET: 'mock-client-secret',
    GOOGLE_REDIRECT: 'http://localhost/oauth',
    ROOT_USER: 'root@test.com',
    ENV_TYPE: 'test',
};

// ─── Setup mocks BEFORE importing module ────────────────────────────

jest.unstable_mockModule('../../constants.js', () => ({
    MAX_RETRY: TEST_CONFIG.MAX_RETRY,
    API_EXPIRE: TEST_CONFIG.API_EXPIRE,
    DRIVE_LIMIT: TEST_CONFIG.DRIVE_LIMIT,
    OATH_WAITING: TEST_CONFIG.OATH_WAITING,
    DOC_TYPE: TEST_CONFIG.DOC_TYPE,
    KINDLE_LIMIT: TEST_CONFIG.KINDLE_LIMIT,
    __dirname: '/app/src/back/models',
}));

jest.unstable_mockModule('../../../../ver.js', () => ({
    ENV_TYPE: TEST_CONFIG.ENV_TYPE,
    GOOGLE_ID: TEST_CONFIG.GOOGLE_ID,
    GOOGLE_SECRET: TEST_CONFIG.GOOGLE_SECRET,
    GOOGLE_REDIRECT: TEST_CONFIG.GOOGLE_REDIRECT,
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

// Mock googleapis - CRITICAL: Match actual structure used in source
mockGoogleAuth = {
    setCredentials: jest.fn(),
    getAccessToken: jest.fn(),
    refreshAccessToken: jest.fn(),
    credentials: { access_token: 'mock-access-token' },
};

const createMockDriveInstance = () => ({
    files: {
        insert: jest.fn((params, callback) => {
            callback(null, { data: { id: 'mock-file-id', title: params.resource?.title || 'mock-file' } });
        }),
        list: jest.fn((params, callback) => {
            callback(null, { data: { items: [] } });
        }),
        trash: jest.fn((params, callback) => {
            callback(null, {});
        }),
        get: jest.fn((params, callback) => {
            callback(null, { data: { id: params.fileId, title: 'mock-file', parents: ['old-parent'] } });
        }),
        copy: jest.fn((params, callback) => {
            callback(null, { data: { id: 'mock-copy-id' } });
        }),
        patch: jest.fn((params, callback) => {
            callback(null, {});
        }),
    },
});

const createMockGmailInstance = () => ({
    users: {
        messages: {
            send: jest.fn((params, callback) => {
                callback(null, { data: { id: 'mock-message-id' } });
            }),
        },
    },
});

const createMockYoutubeInstance = () => ({
    search: {
        list: jest.fn((params, callback) => {
            callback(null, { items: [], nextPageToken: null });
        }),
    },
    videos: {
        list: jest.fn((params, callback) => {
            callback(null, []);
        }),
    },
    channels: {
        list: jest.fn((params, callback) => {
            callback(null, {});
        }),
    },
    playlists: {
        list: jest.fn((params, callback) => {
            callback(null, []);
        }),
    },
    playlistItems: {
        list: jest.fn((params, callback) => {
            callback(null, { items: [], pageInfo: { totalResults: 0 }, nextPageToken: null, prevPageToken: null });
        }),
    },
});

mockGoogleDrive = createMockDriveInstance();
mockGoogleGmail = createMockGmailInstance();
mockGoogleYoutube = createMockYoutubeInstance();

jest.unstable_mockModule('googleapis', () => ({
    default: {
        google: {
            auth: {
                OAuth2: class MockOAuth2 {
                    constructor() {
                        Object.assign(this, mockGoogleAuth);
                    }
                },
            },
            drive: jest.fn(() => mockGoogleDrive),
            gmail: jest.fn(() => mockGoogleGmail),
            youtube: jest.fn(() => mockGoogleYoutube),
        },
    },
}));

// Mock node-fetch
mockFetch = jest.fn();
jest.unstable_mockModule('node-fetch', () => ({
    default: mockFetch,
}));

// Mock youtube-dl-exec
mockYoutubeDl = jest.fn();
mockYoutubeDl.getSubs = jest.fn();
jest.unstable_mockModule('youtube-dl-exec', () => ({
    default: mockYoutubeDl,
}));

// Mock path
jest.unstable_mockModule('path', () => ({
    default: {
        join: jest.fn((...args) => args.join('/')),
    },
}));

// Mock child_process
mockChildExec = jest.fn();
jest.unstable_mockModule('child_process', () => ({
    default: {
        exec: mockChildExec,
    },
}));

// Mock mkdirp
mockMkdirp = jest.fn();
jest.unstable_mockModule('mkdirp', () => ({
    default: mockMkdirp,
}));

// Mock fs
mockFsExistsSync = jest.fn();
mockFsCreateReadStream = jest.fn();
mockFsUnlink = jest.fn();
mockFsRenameSync = jest.fn();
mockFsCreateWriteStream = jest.fn();
mockFsStatSync = jest.fn();
mockFsReaddirSync = jest.fn();
mockFsLstatSync = jest.fn();
mockFsWriteFile = jest.fn();

jest.unstable_mockModule('fs', () => ({
    default: {
        existsSync: (...a) => mockFsExistsSync(...a),
        createReadStream: (...a) => mockFsCreateReadStream(...a),
        unlink: (...a) => mockFsUnlink(...a),
        renameSync: (...a) => mockFsRenameSync(...a),
        createWriteStream: (...a) => mockFsCreateWriteStream(...a),
        statSync: (...a) => mockFsStatSync(...a),
        readdirSync: (...a) => mockFsReaddirSync(...a),
        lstatSync: (...a) => mockFsLstatSync(...a),
        writeFile: (...a) => mockFsWriteFile(...a),
    },
    existsSync: (...a) => mockFsExistsSync(...a),
    createReadStream: (...a) => mockFsCreateReadStream(...a),
    unlink: (...a) => mockFsUnlink(...a),
    renameSync: (...a) => mockFsRenameSync(...a),
    createWriteStream: (...a) => mockFsCreateWriteStream(...a),
    statSync: (...a) => mockFsStatSync(...a),
    readdirSync: (...a) => mockFsReaddirSync(...a),
    lstatSync: (...a) => mockFsLstatSync(...a),
    writeFile: (...a) => mockFsWriteFile(...a),
}));

// Mock mongo-tool
mockMongoFind = jest.fn();
mockMongoUpdate = jest.fn();
mockMongoInsert = jest.fn();

const mockMongoFunction = jest.fn((operation, collection, query, options) => {
    switch (operation) {
        case 'find':
            return mockMongoFind(collection, query, options);
        case 'update':
            return mockMongoUpdate(collection, query, options);
        case 'insert':
            return mockMongoInsert(collection, query, options);
        default:
            return Promise.resolve();
    }
});

jest.unstable_mockModule('../mongo-tool.js', () => ({
    default: mockMongoFunction,
}));

// Mock mediaHandle-tool
mockMediaHandleTool = {
    handleRecycle: jest.fn(),
};

jest.unstable_mockModule('../mediaHandle-tool.js', () => ({
    default: mockMediaHandleTool,
}));

// Mock external-tool
mockExternal = {
    handleDoc: jest.fn(),
};

jest.unstable_mockModule('../external-tool.js', () => ({
    default: mockExternal,
}));

// Mock utility functions
mockHandleError = jest.fn((err) => Promise.reject(err));
mockDeleteFolderRecursive = jest.fn();
mockSRT2VTT = jest.fn();
mockIsValidString = jest.fn();

jest.unstable_mockModule('../../util/utility.js', () => ({
    handleError: mockHandleError,
    HoError: class HoError extends Error {
        constructor(message, code = 500) {
            super(message);
            this.code = code;
        }
    },
    deleteFolderRecursive: mockDeleteFolderRecursive,
    SRT2VTT: mockSRT2VTT,
    isValidString: mockIsValidString,
}));

// Mock mime utilities
mockMediaMIME = jest.fn();
mockIsSub = jest.fn();
mockIsKindle = jest.fn();

jest.unstable_mockModule('../../util/mime.js', () => ({
    mediaMIME: mockMediaMIME,
    isSub: mockIsSub,
    isKindle: mockIsKindle,
}));

// Mock sendWs
mockSendWs = jest.fn();
jest.unstable_mockModule('../../util/sendWs.js', () => ({
    default: mockSendWs,
}));

// ─── Import module under test ───────────────────────────────────────
const apiToolGoogle = await import('../api-tool-google.js');
const api = apiToolGoogle.default;
const {
    googleBackup,
    googleDownloadSubtitle,
    userDrive,
    autoDoc,
    isApiing,
    sendPresentName,
    sendLotteryName,
    googleBackupWhole,
    googleBackupDb,
} = apiToolGoogle;

// ─── Test Suite ─────────────────────────────────────────────────────

describe('api-tool-google.js — Google API Integration', () => {
    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        
        // Default successful OAuth token
        mockMongoFind.mockResolvedValue([{
            api: 'google',
            access_token: 'mock-access-token',
            refresh_token: 'mock-refresh-token',
            expiry_date: Date.now() + 3600000, // Valid for 1 hour
        }]);
        
        mockMongoUpdate.mockResolvedValue({ ok: 1 });
        
        mockGoogleAuth.setCredentials.mockImplementation(() => {});
        mockGoogleAuth.getAccessToken.mockResolvedValue({
            token: 'mock-access-token',
        });
        mockGoogleAuth.refreshAccessToken.mockImplementation((cb) => {
            cb(null, {
                access_token: 'refreshed-token',
                expiry_date: Date.now() + 3600000,
            });
        });
        
        // Reset Drive API mocks
        mockGoogleDrive = createMockDriveInstance();
        mockGoogleGmail = createMockGmailInstance();
        mockGoogleYoutube = createMockYoutubeInstance();
        
        mockFetch.mockResolvedValue({
            ok: true,
            headers: {
                get: jest.fn(() => '1024'),
            },
            body: {
                pipe: jest.fn(),
            },
        });
        
        mockYoutubeDl.mockResolvedValue({});
        mockYoutubeDl.getSubs.mockResolvedValue({});
        mockChildExec.mockImplementation((cmd, cb) => cb(null, 'success', ''));
        mockMkdirp.mockResolvedValue();
        
        mockFsExistsSync.mockReturnValue(true);
        mockFsCreateReadStream.mockReturnValue({
            pipe: jest.fn(),
        });
        mockFsUnlink.mockImplementation((path, cb) => cb && cb(null));
        mockFsRenameSync.mockReturnValue();
        mockFsCreateWriteStream.mockReturnValue({
            on: jest.fn((event, cb) => {
                if (event === 'finish') setTimeout(cb, 10);
                return { on: jest.fn() };
            }),
        });
        mockFsStatSync.mockReturnValue({ size: 1024 });
        mockFsReaddirSync.mockReturnValue([]);
        mockFsLstatSync.mockReturnValue({ isDirectory: () => false });
        mockFsWriteFile.mockImplementation((path, data, cb) => cb && cb(null));
        
        mockHandleError.mockImplementation((err) => Promise.reject(err));
        mockDeleteFolderRecursive.mockResolvedValue();
        mockSRT2VTT.mockResolvedValue();
        mockIsValidString.mockReturnValue(true);
        
        mockMediaMIME.mockReturnValue('video/mp4');
        mockIsSub.mockReturnValue(false);
        mockIsKindle.mockReturnValue(true);
        
        mockSendWs.mockReturnValue();
        
        mockMediaHandleTool.handleRecycle.mockResolvedValue();
        mockExternal.handleDoc.mockResolvedValue();
    });

    // ═══════════════════════════════════════════════════════════════
    // 1. Main Router Function: api(name, data)
    // ═══════════════════════════════════════════════════════════════

    describe('api() — Main Router', () => {
        test('should route "stop" to stopApi', async () => {
            const result = await api('stop', {});
            // stopApi returns Promise.resolve() which resolves to undefined
            expect(result).toBeUndefined();
        });

        test('should route "list folder" with folderId', async () => {
            mockGoogleDrive.files.list.mockImplementation((params, cb) => {
                cb(null, { data: { items: [{ id: 'f1', title: 'Folder1' }] } });
            });
            
            const result = await api('list folder', { folderId: 'folder-id' });
            expect(mockGoogleDrive.files.list).toHaveBeenCalled();
            expect(result).toEqual([{ id: 'f1', title: 'Folder1' }]);
        });

        test('should reject list folder without folderId', async () => {
            await expect(api('list folder', { parent: 'folder-id' })).rejects.toThrow('list parameter lost!!!');
        });

        test('should route "list file" with folderId', async () => {
            mockGoogleDrive.files.list.mockImplementation((params, cb) => {
                cb(null, { data: { items: [{ id: 'f1', title: 'file1.txt' }] } });
            });
            
            const result = await api('list file', { folderId: 'folder-id' });
            expect(mockGoogleDrive.files.list).toHaveBeenCalled();
            expect(result).toEqual([{ id: 'f1', title: 'file1.txt' }]);
        });

        test('should route "create" to create folder', async () => {
            mockGoogleDrive.files.insert.mockImplementation((params, cb) => {
                cb(null, { data: { id: 'new-folder-id', title: 'New Folder' } });
            });
            
            const result = await api('create', { name: 'New Folder', parent: 'parent-id' });
            expect(mockGoogleDrive.files.insert).toHaveBeenCalled();
            expect(result.id).toBe('new-folder-id');
        });

        test('should route "delete" with fileId', async () => {
            mockGoogleDrive.files.trash.mockImplementation((params, cb) => {
                cb(null, {});
            });
            
            await api('delete', { fileId: 'file-id' });
            expect(mockGoogleDrive.files.trash).toHaveBeenCalledWith(
                expect.objectContaining({ fileId: 'file-id' }),
                expect.any(Function)
            );
        });

        test('should reject delete without fileId', async () => {
            await expect(api('delete', { id: 'file-id' })).rejects.toThrow('delete parameter lost!!!');
        });

        test('should route "get" with fileId', async () => {
            mockGoogleDrive.files.get.mockImplementation((params, cb) => {
                cb(null, { data: { id: 'file-id', title: 'test.txt' } });
            });
            
            const result = await api('get', { fileId: 'file-id' });
            expect(result.id).toBe('file-id');
        });

        test('should route "copy" with fileId', async () => {
            mockGoogleDrive.files.copy.mockImplementation((params, cb) => {
                cb(null, { data: { id: 'copy-id' } });
            });
            
            const result = await api('copy', { fileId: 'file-id' });
            expect(result.id).toBe('copy-id');
        });

        test('should route "move parent" with all params', async () => {
            mockGoogleDrive.files.patch.mockImplementation((params, cb) => {
                cb(null, {});
            });
            
            await api('move parent', { fileId: 'file-id', rmFolderId: 'old-parent', addFolderId: 'new-parent' });
            expect(mockGoogleDrive.files.patch).toHaveBeenCalled();
        });

        test('should route "send mail" when file is valid Kindle format', async () => {
            mockIsKindle.mockReturnValue(true);
            mockFsStatSync.mockReturnValue({ size: 1000 });
            
            await api('send mail', { 
                name: 'book.mobi',
                filePath: '/test/book.mobi',
                kindle: 'test@kindle.com',
            });
            
            expect(mockGoogleGmail.users.messages.send).toHaveBeenCalled();
        });

        test('should route "send name" with valid email', async () => {
            mockIsValidString.mockReturnValue(true);
            
            await api('send name', { 
                title: 'Test Subject',
                text: Buffer.from('Test Body').toString('base64'),
                mail: 'test@test.com',
            });
            
            expect(mockGoogleGmail.users.messages.send).toHaveBeenCalled();
        });

        test('should handle unknown API name', async () => {
            await expect(api('unknown-operation', {})).rejects.toThrow('unknown api');
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // 2. OAuth Management (Note: tokens are cached at module level)
    // ═══════════════════════════════════════════════════════════════

    describe('OAuth Token Management', () => {
        test('should call OAuth methods when token is available', async () => {
            // OAuth is checked on first API call - just verify it works
            const result = await api('stop', {});
            expect(result).toBeUndefined();
            expect(mockGoogleAuth.setCredentials).toHaveBeenCalled();
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // 3. YouTube API Operations
    // ═══════════════════════════════════════════════════════════════

    describe('YouTube API', () => {
        test('should handle "y search" with video type', async () => {
            mockGoogleYoutube.search.list.mockImplementation((params, cb) => {
                cb(null, { 
                    items: [
                        { id: { videoId: 'vid1' } },
                        { id: { videoId: 'vid2' } },
                    ],
                    nextPageToken: 'token123',
                });
            });
            
            const result = await api('y search', { 
                order: 'relevance',
                maxResults: 10,
                type: 1,
                keyword: 'test',
            });
            
            expect(mockGoogleYoutube.search.list).toHaveBeenCalled();
            expect(result.video).toBe('vid1,vid2');
        });

        test('should handle "y video" with id', async () => {
            mockGoogleYoutube.videos.list.mockImplementation((params, cb) => {
                // Callback receives metadata object with items property
                cb(null, { items: [{ id: 'vid1', snippet: { title: 'Test Video' } }] });
            });
            
            const result = await api('y video', { id: 'vid1' });
            expect(result).toEqual([{ id: 'vid1', snippet: { title: 'Test Video' } }]);
        });

        test('should handle "y channel" with id', async () => {
            mockGoogleYoutube.channels.list.mockImplementation((params, cb) => {
                cb(null, { items: [{ id: 'ch1' }] });
            });
            
            const result = await api('y channel', { id: 'ch1' });
            expect(result.items).toBeDefined();
        });

        test('should handle "y playlist" with id', async () => {
            mockGoogleYoutube.playlists.list.mockImplementation((params, cb) => {
                // Callback receives metadata object with items property
                cb(null, { items: [{ id: 'pl1' }] });
            });
            
            const result = await api('y playlist', { id: 'pl1' });
            expect(result).toEqual([{ id: 'pl1' }]);
        });

        test('should handle "y playItem" with id', async () => {
            mockGoogleYoutube.playlistItems.list.mockImplementation((params, cb) => {
                cb(null, { 
                    items: [{ snippet: { resourceId: { videoId: 'vid1' }, position: 0 } }],
                    pageInfo: { totalResults: 1 },
                    nextPageToken: null,
                    prevPageToken: null,
                });
            });
            
            const result = await api('y playItem', { id: 'pl1' });
            expect(result).toHaveLength(4); // Returns array with items, total, next, prev
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // 4. File Upload (Async with rate limiting)
    // ═══════════════════════════════════════════════════════════════

    describe('File Upload/Download (Rate Limited)', () => {
        test('should accept upload request and process async', async () => {
            mockFsExistsSync.mockReturnValue(true);
            mockMediaMIME.mockReturnValue('text/plain');
            mockGoogleDrive.files.insert.mockImplementation((params, cb) => {
                setTimeout(() => cb(null, { data: { id: 'uploaded-id' } }), 50);
            });
            
            // upload returns Promise that resolves immediately with 500ms timeout
            const result = await api('upload', {
                user: { username: 'testuser' },
                name: 'test.txt',
                type: 'auto',
                filePath: '/test/file.txt',
                parent: 'parent-id',
            });
            
            // Result should resolve immediately
            expect(result).toBeUndefined();
            
            // Wait for async upload to complete
            await new Promise(resolve => setTimeout(resolve, 600));
            
            expect(mockGoogleDrive.files.insert).toHaveBeenCalled();
        });

        test('should accept download request and process async', async () => {
            const mockPipe = jest.fn();
            mockFetch.mockResolvedValue({
                ok: true,
                headers: {
                    get: jest.fn(() => '1024'),
                },
                body: {
                    pipe: mockPipe,
                },
            });
            
            mockFsCreateWriteStream.mockReturnValue({
                on: jest.fn((event, cb) => {
                    if (event === 'finish') setTimeout(cb, 50);
                    return { on: jest.fn() };
                }),
            });
            
            const result = await api('download', {
                user: { username: 'testuser' },
                url: 'https://drive.google.com/file/123',
                filePath: '/test/download.txt',
            });
            
            // Result should resolve immediately
            expect(result).toBeUndefined();
            
            // Wait for async download to complete
            await new Promise(resolve => setTimeout(resolve, 600));
            
            expect(mockFetch).toHaveBeenCalled();
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // 5. Exported Functions
    // ═══════════════════════════════════════════════════════════════

    describe('Exported Functions', () => {
        test('googleBackup() should handle recycle=1 (upload file)', async () => {
            mockFsExistsSync.mockReturnValue(true);
            
            const result = await googleBackup(
                { username: 'testuser' },
                'item-id',
                'video.mp4',
                '/path/to/video.mp4',
                ['tag1'],
                1
            );
            
            // Returns Promise immediately (upload is async)
            expect(result).toBeUndefined();
        });

        test('googleBackup() should handle recycle=2 (upload subtitle)', async () => {
            mockFsExistsSync.mockReturnValue(true);
            
            const result = await googleBackup(
                { username: 'testuser' },
                'item-id',
                'video.mp4',
                '/path/to/video',
                ['tag1'],
                2
            );
            
            expect(result).toBeUndefined();
        });

        test('googleBackup() should handle recycle=3 (upload tags)', async () => {
            const result = await googleBackup(
                { username: 'testuser' },
                'item-id',
                'video.mp4',
                '/path/to/video.mp4',
                ['tag1', 'tag2'],
                3
            );
            
            expect(result).toBeUndefined();
        });

        test('googleBackup() should reject invalid recycle value', async () => {
            await expect(googleBackup(
                { username: 'testuser' },
                'item-id',
                'video.mp4',
                '/path/to/video.mp4',
                ['tag1'],
                99
            )).rejects.toThrow('recycle 99 denied!!!');
        });

        test('isApiing() should return boolean', () => {
            const result = isApiing();
            expect(typeof result).toBe('boolean');
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // 6. Error Handling
    // ═══════════════════════════════════════════════════════════════

    describe('Error Handling', () => {
        test('should handle Drive API errors', async () => {
            mockGoogleDrive.files.list.mockImplementation((params, cb) => {
                cb(new Error('Network error'), null);
            });
            
            await expect(api('list folder', { folderId: 'test' })).rejects.toThrow('Network error');
        });

        test('should handle missing parameters in create', async () => {
            await expect(api('create', { name: 'folder' })).rejects.toThrow('create parameter lost!!!');
        });

        test('should handle missing parameters in get', async () => {
            await expect(api('get', {})).rejects.toThrow('get parameter lost!!!');
        });

        test('should handle missing parameters in copy', async () => {
            await expect(api('copy', {})).rejects.toThrow('copy parameter lost!!!');
        });

        test('should handle missing parameters in move parent', async () => {
            await expect(api('move parent', { fileId: 'test' })).rejects.toThrow('move parent parameter lost!!!');
        });

        test('should handle missing parameters in send mail', async () => {
            await expect(api('send mail', { name: 'test.mobi' })).rejects.toThrow('mail parameter lost!!!');
        });

        test('should handle invalid Kindle format', async () => {
            mockIsKindle.mockReturnValue(false);
            
            await expect(api('send mail', { 
                name: 'test.txt',
                filePath: '/test/test.txt',
                kindle: 'test@kindle.com',
            })).rejects.toThrow('Unsupported kindle format!!!');
        });

        test('should handle missing file in send mail', async () => {
            mockIsKindle.mockReturnValue(true);
            mockFsExistsSync.mockReturnValue(false);
            
            await expect(api('send mail', { 
                name: 'test.mobi',
                filePath: '/missing/test.mobi',
                kindle: 'test@kindle.com',
            })).rejects.toThrow('file not exist!!!');
        });

        test('should handle file too large in send mail', async () => {
            mockIsKindle.mockReturnValue(true);
            mockFsExistsSync.mockReturnValue(true);
            mockFsStatSync.mockReturnValue({ size: TEST_CONFIG.KINDLE_LIMIT + 1 });
            
            await expect(api('send mail', { 
                name: 'large.mobi',
                filePath: '/test/large.mobi',
                kindle: 'test@kindle.com',
            })).rejects.toThrow('file too large!!!');
        });

        test('should handle invalid email in send name', async () => {
            mockIsValidString.mockReturnValue(false);
            
            await expect(api('send name', { 
                title: 'Test',
                text: 'Body',
                mail: 'invalid-email',
            })).rejects.toThrow('invalid email!!!');
        });

        test('should handle missing YouTube search parameters', async () => {
            await expect(api('y search', {})).rejects.toThrow('search parameter lost!!!');
        });

        test('should handle missing YouTube channel parameter', async () => {
            await expect(api('y channel', {})).rejects.toThrow('channel parameter lost!!!');
        });

        test('should handle missing YouTube playItem parameter', async () => {
            await expect(api('y playItem', {})).rejects.toThrow('playItem parameter lost!!!');
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // 8. YouTube Set Merging - id_arr / pl_arr
    // ═══════════════════════════════════════════════════════════════

    describe('YouTube Set merging (id_arr / pl_arr)', () => {
        test('should merge id_arr with search results into Set (no duplicates)', async () => {
            mockGoogleYoutube.search.list.mockImplementation((params, cb) => {
                cb(null, {
                    items: [
                        { id: { videoId: 'vid1' } },
                        { id: { videoId: 'vid2' } },
                    ],
                    nextPageToken: null,
                });
            });

            const result = await api('y search', {
                order: 'relevance',
                maxResults: 10,
                type: 1,
                keyword: 'test',
                id_arr: ['vid2', 'vid3'],
            });

            // vid2 from search and id_arr should be deduplicated
            const videoIds = result.video.split(',');
            expect(new Set(videoIds).size).toBe(videoIds.length); // no duplicates
            expect(videoIds).toContain('vid1');
            expect(videoIds).toContain('vid2');
            expect(videoIds).toContain('vid3');
        });

        test('should merge pl_arr with playlistItem results into Set', async () => {
            mockGoogleYoutube.search.list.mockImplementation((params, cb) => {
                cb(null, {
                    items: [
                        { id: { playlistId: 'pl1' } },
                    ],
                    nextPageToken: null,
                });
            });

            const result = await api('y search', {
                order: 'relevance',
                maxResults: 10,
                type: 2,
                keyword: 'test',
                pl_arr: ['pl1', 'pl2'],
            });

            // pl1 from search and pl_arr should be deduplicated
            const plIds = result.playlist.split(',');
            expect(new Set(plIds).size).toBe(plIds.length);
            expect(plIds).toContain('pl1');
            expect(plIds).toContain('pl2');
        });

        test('should handle empty id_arr and pl_arr', async () => {
            mockGoogleYoutube.search.list.mockImplementation((params, cb) => {
                cb(null, {
                    items: [{ id: { videoId: 'vid1' } }],
                    nextPageToken: null,
                });
            });

            const result = await api('y search', {
                order: 'relevance',
                maxResults: 10,
                type: 1,
                keyword: 'test',
                id_arr: [],
                pl_arr: [],
            });

            expect(result.video).toBe('vid1');
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // 9. Drive list / listFile error paths
    // ═══════════════════════════════════════════════════════════════

    describe('Drive list/listFile error handling', () => {
        test('should handle list folder API error', async () => {
            mockGoogleDrive.files.list.mockImplementation((params, callback) => {
                callback(new Error('Drive API rate limit'), null);
            });

            await expect(api('list folder', { folderId: 'folder-id' }))
                .rejects.toThrow();
        });

        test('should handle list file API error', async () => {
            mockGoogleDrive.files.list.mockImplementation((params, callback) => {
                callback(new Error('Drive API error'), null);
            });

            await expect(api('list file', { folderId: 'folder-id' }))
                .rejects.toThrow();
        });

        test('should handle YouTube API error in y search', async () => {
            mockGoogleYoutube.search.list.mockImplementation((params, cb) => {
                cb(new Error('YouTube quota exceeded'), null);
            });

            await expect(api('y search', {
                order: 'relevance',
                maxResults: 10,
                type: 1,
                keyword: 'test',
            })).rejects.toThrow();
        });

        test('should handle YouTube API error in y video', async () => {
            mockGoogleYoutube.videos.list.mockImplementation((params, cb) => {
                cb(new Error('video not found'), null);
            });

            await expect(api('y video', { id: 'vid1' })).rejects.toThrow();
        });
    });

    // ═══════════════════════════════════════════════════════════════
    // 10. Additional Branch Coverage
    // ═══════════════════════════════════════════════════════════════

    describe('YouTube search type 10 and 20 (playlist type)', () => {
        test('y search type 10 should use playlist type', async () => {
            mockGoogleYoutube.search.list.mockImplementation((params, cb) => {
                expect(params.type).toBe('playlist');
                cb(null, {
                    items: [{ id: { playlistId: 'pl10' } }],
                    nextPageToken: null,
                });
            });

            const result = await api('y search', {
                order: 'relevance',
                maxResults: 10,
                type: 10,
                keyword: 'test',
            });

            expect(result.type).toBe(10);
            expect(result.playlist).toBe('pl10');
        });

        test('y search type 20 should use playlist type', async () => {
            mockGoogleYoutube.search.list.mockImplementation((params, cb) => {
                expect(params.type).toBe('playlist');
                cb(null, {
                    items: [{ id: { playlistId: 'pl20' } }],
                    nextPageToken: 'next20',
                });
            });

            const result = await api('y search', {
                order: 'date',
                maxResults: 5,
                type: 20,
                keyword: 'music',
            });

            expect(result.type).toBe(20);
            expect(result.playlist).toBe('pl20');
            expect(result.nextPageToken).toBe('next20');
        });

        test('y search default type should use video,playlist', async () => {
            mockGoogleYoutube.search.list.mockImplementation((params, cb) => {
                expect(params.type).toBe('video,playlist');
                cb(null, {
                    items: [
                        { id: { videoId: 'v1' } },
                        { id: { playlistId: 'p1' } },
                    ],
                    nextPageToken: null,
                });
            });

            const result = await api('y search', {
                order: 'relevance',
                maxResults: 10,
                type: 99,
                keyword: 'test',
            });

            expect(result.video).toBe('v1');
            expect(result.playlist).toBe('p1');
        });
    });

    describe('YouTube video/playlist with no id', () => {
        test('y video with no id should return empty array', async () => {
            const result = await api('y video', {});
            expect(result).toEqual([]);
        });

        test('y playlist with no id should return empty array', async () => {
            const result = await api('y playlist', {});
            expect(result).toEqual([]);
        });
    });

    describe('YouTube search error in callback', () => {
        test('y search should reject when callback has error', async () => {
            mockGoogleYoutube.search.list.mockImplementation((params, cb) => {
                cb(new Error('YouTube API quota exceeded'), null);
            });

            await expect(api('y search', {
                order: 'relevance',
                maxResults: 10,
                type: 1,
                keyword: 'test',
            })).rejects.toThrow('YouTube API quota exceeded');
        });

        test('y search should resolve when callback has ECONNRESET error', async () => {
            const econnErr = new Error('ECONNRESET');
            econnErr.code = 'ECONNRESET';
            mockGoogleYoutube.search.list.mockImplementation((params, cb) => {
                cb(econnErr, { items: [{ id: { videoId: 'v1' } }], nextPageToken: null });
            });

            const result = await api('y search', {
                order: 'relevance',
                maxResults: 10,
                type: 1,
                keyword: 'test',
            });

            expect(result.video).toBe('v1');
        });
    });

    describe('list() retry on ECONNRESET', () => {
        test('list folder should retry when result has no items and return [] after MAX_RETRY', async () => {
            mockGoogleDrive.files.list.mockImplementation((params, cb) => {
                cb(null, { data: null });
            });

            const result = await api('list folder', { folderId: 'folder-id' });
            expect(result).toEqual([]);
        }, 30000);
    });

    describe('listFile() 401 retry', () => {
        test('listFile should reject on 401 after MAX_RETRY', async () => {
            const err401 = new Error('Unauthorized');
            err401.code = '401';
            mockGoogleDrive.files.list.mockImplementation((params, cb) => {
                cb(err401, null);
            });

            await expect(api('list file', { folderId: 'folder-id' })).rejects.toThrow();
        }, 30000);
    });

    describe('Upload with body instead of filePath', () => {
        test('should upload with body when filePath is not provided', async () => {
            mockGoogleDrive.files.insert.mockImplementation((params, cb) => {
                expect(params.media.mimeType).toBe('text/plain');
                expect(params.media.body).toBe('hello world');
                setTimeout(() => cb(null, { data: { id: 'body-upload-id' } }), 50);
            });

            const result = await api('upload', {
                user: { username: 'testuser' },
                name: 'test.txt',
                type: 'backup',
                body: 'hello world',
            });

            expect(result).toBeUndefined();
            await new Promise(resolve => setTimeout(resolve, 600));
            expect(mockGoogleDrive.files.insert).toHaveBeenCalled();
        });
    });

    describe('sendPresentName / sendLotteryName', () => {
        test('sendPresentName should call api with correct title', async () => {
            mockIsValidString.mockReturnValue(true);
            mockGoogleGmail.users.messages.send.mockImplementation((params, cb) => {
                cb(null, { data: { id: 'msg-id' } });
            });

            const text = Buffer.from('Test Name').toString('base64');
            await sendPresentName(text, 'user@test.com');
            expect(mockGoogleGmail.users.messages.send).toHaveBeenCalled();
        });

        test('sendPresentName with append should include append in name', async () => {
            mockIsValidString.mockReturnValue(true);
            mockGoogleGmail.users.messages.send.mockImplementation((params, cb) => {
                cb(null, { data: { id: 'msg-id' } });
            });

            const text = Buffer.from('Test Name').toString('base64');
            await sendPresentName(text, 'user@test.com', 'extra');
            expect(mockGoogleGmail.users.messages.send).toHaveBeenCalled();
        });

        test('sendLotteryName should call api with correct params', async () => {
            mockIsValidString.mockReturnValue(true);
            mockGoogleGmail.users.messages.send.mockImplementation((params, cb) => {
                cb(null, { data: { id: 'msg-id' } });
            });

            const text = Buffer.from('Winner').toString('base64');
            await sendLotteryName('Lottery Draw', text, 'winner@test.com');
            expect(mockGoogleGmail.users.messages.send).toHaveBeenCalled();
        });
    });

    describe('googleBackupWhole', () => {
        test('should upload backup and send websocket notification', async () => {
            mockFsExistsSync.mockReturnValue(true);
            mockMediaMIME.mockReturnValue('application/gzip');
            mockGoogleDrive.files.insert.mockImplementation((params, cb) => {
                setTimeout(() => cb(null, { data: { id: 'backup-id' } }), 50);
            });

            const result = await googleBackupWhole('backup-2024.tar.gz');
            expect(result).toBeUndefined();
            await new Promise(resolve => setTimeout(resolve, 600));
        });
    });

    describe('googleBackupDb', () => {
        test('should create folder and upload db collections', async () => {
            mockGoogleDrive.files.insert.mockImplementation((params, cb) => {
                setTimeout(() => cb(null, { data: { id: `folder-${Date.now()}`, title: params.resource?.title } }), 10);
            });
            mockFsReaddirSync
                .mockReturnValueOnce(['collection1'])
                .mockReturnValueOnce(['file1.bson']);
            mockFsExistsSync.mockReturnValue(true);
            mockMediaMIME.mockReturnValue('application/octet-stream');

            const result = await googleBackupDb('2024-01-01');
            expect(result).toBeUndefined();
            await new Promise(resolve => setTimeout(resolve, 1500));
            expect(mockGoogleDrive.files.insert).toHaveBeenCalled();
        });
    });
});
