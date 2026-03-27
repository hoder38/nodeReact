/**
 * mongo-tool.test.js — Comprehensive tests for src/back/models/mongo-tool.js
 *
 * ESM mocking pattern: jest.unstable_mockModule() BEFORE dynamic import().
 * 
 * CRITICAL: Module has side effects — MongoClient.connect() runs on import.
 * All mocks must be set up before importing mongo-tool.js.
 *
 * Run: docker exec -w /app -e NODE_OPTIONS=--experimental-vm-modules reactnode-server \
 *        npx jest src/back/models/__tests__/mongo-tool.test.js --no-cache --forceExit
 */
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Clear any previously loaded modules to ensure fresh imports with mocks
jest.resetModules();

// ─── Mock state variables ───────────────────────────────────────────────────

let mockToArray;
let mockFind;
let mockInsertOne;
let mockUpdateOne;
let mockCountDocuments;
let mockDeleteMany;
let mockCollectionObj;
let mockCollectionFn;
let mockDb;
let mockClient;
let connectCallback;
let mockConnect;
let mockObjectIdConstructor;
let mockHandleError;
let mockHoError;
let mockCreateHash;

// ─── Setup mocks BEFORE importing the module under test ─────────────────────

// Mock ver.js
// --- node-fetch (prevents test pollution from api-tool.js retry logic) ---
jest.unstable_mockModule('node-fetch', () => ({
  default: jest.fn(() => Promise.resolve({
    ok: true,
    buffer: jest.fn().mockResolvedValue(Buffer.from('')),
    headers: { get: jest.fn(() => null) },
    body: { pipe: jest.fn().mockReturnThis(), on: jest.fn() },
  })),
}));

jest.unstable_mockModule('../../../../ver.js', () => ({
    ENV_TYPE: 'test',
    DB_USERNAME: 'testuser',
    DB_PWD: 'testpass',
    ROOT_USER: { username: 'root', role: 'admin' },
    DEFAULT_PASS: 'defaultpass123',
}));

// Mock config.js
jest.unstable_mockModule('../../config.js', () => ({
    DB_IP: jest.fn((env) => 'localhost'),
    DB_PORT: jest.fn((env) => '27017'),
    DB_NAME: jest.fn((env) => 'testdb'),
}));

// Mock utility.js
mockHandleError = jest.fn();
mockHoError = class HoError extends Error {
    constructor(message) {
        super(message);
        this.name = 'HoError';
    }
};
jest.unstable_mockModule('../../util/utility.js', () => ({
    handleError: mockHandleError,
    HoError: mockHoError,
}));

// Mock crypto
mockCreateHash = jest.fn(() => ({
    update: jest.fn(() => ({
        digest: jest.fn(() => 'hashedpassword'),
    })),
}));
jest.unstable_mockModule('crypto', () => ({
    default: {
        createHash: mockCreateHash,
    },
}));

// Mock mongodb — CRITICAL for intercepting module-level side effects
mockToArray = jest.fn();
mockFind = jest.fn(() => ({ toArray: mockToArray }));
mockInsertOne = jest.fn();
mockUpdateOne = jest.fn();
mockCountDocuments = jest.fn();
mockDeleteMany = jest.fn();
mockCollectionObj = {
    find: mockFind,
    insertOne: mockInsertOne,
    updateOne: mockUpdateOne,
    countDocuments: mockCountDocuments,
    deleteMany: mockDeleteMany,
};
mockCollectionFn = jest.fn((name, cb) => {
    cb(null, mockCollectionObj);
});
mockDb = jest.fn(() => ({
    collection: mockCollectionFn,
}));
mockClient = {
    db: mockDb,
};

mockConnect = jest.fn((uri, opts, cb) => {
    connectCallback = cb;
});

mockObjectIdConstructor = jest.fn((id) => {
    if (id === undefined) {
        return { _id: 'generated-id-' + Math.random() };
    }
    return { _id: id };
});

jest.unstable_mockModule('mongodb', () => ({
    default: {
        MongoClient: {
            connect: mockConnect,
        },
        ObjectId: mockObjectIdConstructor,
    },
}));

// ─── Import the module under test ───────────────────────────────────────────

const mongoToolModule = await import('../mongo-tool.js');
const mongoTool = mongoToolModule.default;
const { objectID } = mongoToolModule;

// ─── Helper: Reset all mocks ────────────────────────────────────────────────

function resetAllMocks() {
    mockToArray.mockReset();
    mockFind.mockReset().mockReturnValue({ toArray: mockToArray });
    mockInsertOne.mockReset();
    mockUpdateOne.mockReset();
    mockCountDocuments.mockReset();
    mockDeleteMany.mockReset();
    mockCollectionFn.mockReset().mockImplementation((name, cb) => {
        cb(null, mockCollectionObj);
    });
    mockDb.mockReset().mockReturnValue({ collection: mockCollectionFn });
    mockHandleError.mockReset();
    mockCreateHash.mockReset().mockReturnValue({
        update: jest.fn(() => ({
            digest: jest.fn(() => 'hashedpassword'),
        })),
    });
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('mongo-tool.js', () => {
    beforeEach(() => {
        resetAllMocks();
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ███ CONNECTION INITIALIZATION TESTS ███
    // ═══════════════════════════════════════════════════════════════════════

    describe('Connection Initialization (module-level side effects)', () => {
        test('should call MongoClient.connect with correct URI and options on import', () => {
            expect(mockConnect).toHaveBeenCalledWith(
                'mongodb://testuser:testpass@localhost:27017/testdb?authSource=admin',
                {
                    poolSize: 10,
                    useUnifiedTopology: true,
                },
                expect.any(Function)
            );
        });

        test('first connect succeeds → sets mongo, seeds root user if count=0', () => {
            // Simulate successful connection
            mockCountDocuments.mockImplementation((cb) => {
                cb(null, 0); // count = 0, should seed user
            });
            mockInsertOne.mockImplementation((doc, cb) => {
                cb(null, { ops: [{ _id: '123', ...doc }] });
            });

            connectCallback(null, mockClient);

            expect(mockDb).toHaveBeenCalledWith('testdb');
            expect(mockCollectionFn).toHaveBeenCalledWith('user', expect.any(Function));
            expect(mockCountDocuments).toHaveBeenCalled();
            expect(mockInsertOne).toHaveBeenCalledWith(
                expect.objectContaining({
                    username: 'root',
                    role: 'admin',
                    password: 'hashedpassword',
                }),
                expect.any(Function)
            );
        });

        test('first connect succeeds → does not seed user if count>0', () => {
            mockCountDocuments.mockImplementation((cb) => {
                cb(null, 5); // count = 5, should NOT seed user
            });

            connectCallback(null, mockClient);

            expect(mockInsertOne).not.toHaveBeenCalled();
        });

        test('first connect fails → retries without authSource', () => {
            const firstError = new Error('Auth failed');
            
            // Trigger the first callback with error
            connectCallback(firstError, null);

            // Verify retry was called (second connect)
            expect(mockConnect).toHaveBeenCalledTimes(2);
            expect(mockConnect).toHaveBeenNthCalledWith(
                2,
                'mongodb://testuser:testpass@localhost:27017/testdb',
                {
                    poolSize: 10,
                    useUnifiedTopology: true,
                },
                expect.any(Function)
            );
        });

        test('retry succeeds → sets mongo and seeds user', () => {
            const firstError = new Error('Auth failed');
            
            mockCountDocuments.mockImplementation((cb) => {
                cb(null, 0);
            });
            mockInsertOne.mockImplementation((doc, cb) => {
                cb(null, { ops: [{ _id: '456', ...doc }] });
            });

            // Trigger first failure
            connectCallback(firstError, null);
            
            // Get the retry callback (second connect call)
            const retryCallback = mockConnect.mock.calls[1][2];
            
            // Trigger retry success
            retryCallback(null, mockClient);

            expect(mockDb).toHaveBeenCalledWith('testdb');
            expect(mockInsertOne).toHaveBeenCalled();
        });

        test('both connect attempts fail → calls handleError', () => {
            const firstError = new Error('Auth failed');
            const secondError = new Error('Connection refused');

            // Trigger first failure
            connectCallback(firstError, null);
            
            // Get retry callback and trigger second failure
            const retryCallback = mockConnect.mock.calls[1][2];
            retryCallback(secondError, null);

            expect(mockHandleError).toHaveBeenCalledWith(secondError, 'DB connect');
        });

        test('first connect succeeds but client is null → calls handleError', () => {
            connectCallback(null, null);

            expect(mockHandleError).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'No client connected' }),
                'DB connect'
            );
        });

        test('first connect succeeds but db is null → calls handleError', () => {
            const badClient = {
                db: jest.fn(() => null),
            };

            connectCallback(null, badClient);

            expect(mockHandleError).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'No db connected' }),
                'DB connect'
            );
        });

        test('collection retrieval error during seeding → calls handleError', () => {
            mockCollectionFn.mockImplementation((name, cb) => {
                cb(new Error('Collection error'), null);
            });

            connectCallback(null, mockClient);

            expect(mockHandleError).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Collection error' }),
                'DB connect'
            );
        });

        test('countDocuments error during seeding → calls handleError', () => {
            mockCountDocuments.mockImplementation((cb) => {
                cb(new Error('Count error'), null);
            });

            connectCallback(null, mockClient);

            expect(mockHandleError).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Count error' }),
                'DB connect'
            );
        });

        test('insertOne error during seeding → calls handleError', () => {
            mockCountDocuments.mockImplementation((cb) => {
                cb(null, 0); // Trigger insert
            });
            mockInsertOne.mockImplementation((doc, cb) => {
                cb(new Error('Insert error'), null);
            });

            connectCallback(null, mockClient);

            expect(mockHandleError).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Insert error' }),
                'DB connect'
            );
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ███ objectID EXPORT TESTS ███
    // ═══════════════════════════════════════════════════════════════════════

    describe('objectID export', () => {
        test('called with no args → returns new ObjectId', () => {
            const result = objectID();
            expect(mockObjectIdConstructor).toHaveBeenCalledWith();
            expect(result).toHaveProperty('_id');
        });

        test('called with null → returns new ObjectId', () => {
            const result = objectID(null);
            expect(mockObjectIdConstructor).toHaveBeenCalledWith();
            expect(result).toHaveProperty('_id');
        });

        test('called with id string → wraps in ObjectId', () => {
            const result = objectID('507f1f77bcf86cd799439011');
            expect(mockObjectIdConstructor).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
            expect(result._id).toBe('507f1f77bcf86cd799439011');
        });

        test('called with id object → wraps in ObjectId', () => {
            const existingId = { _id: 'existing' };
            const result = objectID(existingId);
            expect(mockObjectIdConstructor).toHaveBeenCalledWith(existingId);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ███ DEFAULT EXPORT - CRUD DISPATCHER TESTS ███
    // ═══════════════════════════════════════════════════════════════════════

    describe('Default export - CRUD dispatcher', () => {
        beforeEach(() => {
            // Simulate successful connection before each test
            mockCountDocuments.mockImplementation((cb) => cb(null, 1));
            connectCallback(null, mockClient);
            resetAllMocks(); // Reset after connection
        });

        // ─── Function name mapping ──────────────────────────────────────────

        describe('Function name mapping', () => {
            test('"insert" maps to "insertOne" and resolves with data.ops', async () => {
                mockInsertOne.mockImplementation((doc, cb) => {
                    cb(null, { ops: [{ _id: '1', name: 'test' }] });
                });

                const result = await mongoTool('insert', 'users', { name: 'test' });

                expect(mockInsertOne).toHaveBeenCalledWith(
                    { name: 'test' },
                    expect.any(Function)
                );
                expect(result).toEqual([{ _id: '1', name: 'test' }]);
            });

            test('"count" maps to "countDocuments" and resolves with raw count', async () => {
                mockCountDocuments.mockImplementation((query, cb) => {
                    cb(null, 42);
                });

                const result = await mongoTool('count', 'users', { active: true });

                expect(mockCountDocuments).toHaveBeenCalledWith(
                    { active: true },
                    expect.any(Function)
                );
                expect(result).toBe(42);
            });

            test('"update" maps to "updateOne" and resolves with data.result.n', async () => {
                mockUpdateOne.mockImplementation((query, update, cb) => {
                    cb(null, { result: { n: 1 } });
                });

                const result = await mongoTool('update', 'users', { _id: '1' }, { $set: { name: 'updated' } });

                expect(mockUpdateOne).toHaveBeenCalledWith(
                    { _id: '1' },
                    { $set: { name: 'updated' } },
                    expect.any(Function)
                );
                expect(result).toBe(1);
            });

            test('"find" uses .toArray() and resolves with array data', async () => {
                mockToArray.mockImplementation((cb) => {
                    cb(null, [{ _id: '1', name: 'Alice' }, { _id: '2', name: 'Bob' }]);
                });

                const result = await mongoTool('find', 'users', { active: true });

                expect(mockFind).toHaveBeenCalledWith({ active: true });
                expect(mockToArray).toHaveBeenCalledWith(expect.any(Function));
                expect(result).toEqual([{ _id: '1', name: 'Alice' }, { _id: '2', name: 'Bob' }]);
            });

            test('"deleteMany" passes through and resolves with data.result.n', async () => {
                mockDeleteMany.mockImplementation((query, cb) => {
                    cb(null, { result: { n: 3 } });
                });

                const result = await mongoTool('deleteMany', 'users', { inactive: true });

                expect(mockDeleteMany).toHaveBeenCalledWith(
                    { inactive: true },
                    expect.any(Function)
                );
                expect(result).toBe(3);
            });
        });

        // ─── Collection caching behavior ────────────────────────────────────

        describe('Collection caching behavior', () => {
            test('first call to a collection creates and caches it', async () => {
                mockInsertOne.mockImplementation((doc, cb) => {
                    cb(null, { ops: [doc] });
                });

                await mongoTool('insert', 'products', { name: 'Widget' });

                expect(mockCollectionFn).toHaveBeenCalledWith('products', expect.any(Function));
                expect(mockCollectionFn).toHaveBeenCalledTimes(1);
            });

            test('second call to same collection uses cache', async () => {
                // With collections fixed from [] to {}, the cache works correctly
                // 'name in collections' now finds string keys in object
                
                mockInsertOne.mockImplementation((doc, cb) => {
                    cb(null, { ops: [doc] });
                });

                // First call — creates and caches collection
                await mongoTool('insert', 'users', { name: 'Alice' });
                const firstCallCount = mockCollectionFn.mock.calls.length;

                // Second call to SAME collection — should hit cache
                await mongoTool('insert', 'users', { name: 'Bob' });
                const secondCallCount = mockCollectionFn.mock.calls.length;

                // Cache hit: mongo.collection() NOT called again
                expect(secondCallCount).toBe(firstCallCount);
            });
        });

        // ─── Error handling ─────────────────────────────────────────────────

        describe('Error handling', () => {
            test('error from collection callback → rejects', async () => {
                mockCollectionFn.mockImplementation((name, cb) => {
                    cb(new Error('Collection not found'), null);
                });

                await expect(mongoTool('find', 'nonexistent', {}))
                    .rejects
                    .toThrow('Collection not found');
            });

            test('error from find toArray → rejects', async () => {
                mockToArray.mockImplementation((cb) => {
                    cb(new Error('Cursor error'), null);
                });

                await expect(mongoTool('find', 'users', {}))
                    .rejects
                    .toThrow('Cursor error');
            });

            test('error from insertOne callback → rejects', async () => {
                mockInsertOne.mockImplementation((doc, cb) => {
                    cb(new Error('Duplicate key'), null);
                });

                await expect(mongoTool('insert', 'users', { _id: '1' }))
                    .rejects
                    .toThrow('Duplicate key');
            });

            test('error from countDocuments callback → rejects', async () => {
                mockCountDocuments.mockImplementation((query, cb) => {
                    cb(new Error('Query error'), null);
                });

                await expect(mongoTool('count', 'users', {}))
                    .rejects
                    .toThrow('Query error');
            });

            test('error from updateOne callback → rejects', async () => {
                mockUpdateOne.mockImplementation((query, update, cb) => {
                    cb(new Error('Update failed'), null);
                });

                await expect(mongoTool('update', 'users', { _id: '1' }, { $set: { name: 'x' } }))
                    .rejects
                    .toThrow('Update failed');
            });

            test('error from deleteMany callback → rejects', async () => {
                mockDeleteMany.mockImplementation((query, cb) => {
                    cb(new Error('Delete failed'), null);
                });

                await expect(mongoTool('deleteMany', 'users', {}))
                    .rejects
                    .toThrow('Delete failed');
            });
        });

        // ─── Edge cases ─────────────────────────────────────────────────────

        describe('Edge cases', () => {
            test('empty query object', async () => {
                mockToArray.mockImplementation((cb) => {
                    cb(null, []);
                });

                const result = await mongoTool('find', 'users', {});

                expect(mockFind).toHaveBeenCalledWith({});
                expect(result).toEqual([]);
            });

            test('multiple arguments passed to operation', async () => {
                mockUpdateOne.mockImplementation((q, u, o, cb) => {
                    cb(null, { result: { n: 1 } });
                });

                const result = await mongoTool('update', 'users', 
                    { _id: '1' }, 
                    { $set: { status: 'active' } },
                    { upsert: true }
                );

                expect(mockUpdateOne).toHaveBeenCalledWith(
                    { _id: '1' },
                    { $set: { status: 'active' } },
                    { upsert: true },
                    expect.any(Function)
                );
                expect(result).toBe(1);
            });

            test('updateOne resolves with 0 when no document matched', async () => {
                mockUpdateOne.mockImplementation((query, update, cb) => {
                    cb(null, { result: { n: 0 } });
                });

                const result = await mongoTool('update', 'users', { _id: 'nonexistent' }, { $set: { x: 1 } });

                expect(result).toBe(0);
            });

            test('deleteMany resolves with count of deleted documents', async () => {
                mockDeleteMany.mockImplementation((query, cb) => {
                    cb(null, { result: { n: 7 } });
                });

                const result = await mongoTool('deleteMany', 'logs', { old: true });

                expect(result).toBe(7);
            });
        });

        // ─── Different operations on same collection ────────────────────────

        describe('Different operations on same collection', () => {
            test('insert followed by find on same collection', async () => {
                mockInsertOne.mockImplementation((doc, cb) => {
                    cb(null, { ops: [{ _id: 'new', ...doc }] });
                });
                mockToArray.mockImplementation((cb) => {
                    cb(null, [{ _id: 'new', name: 'test' }]);
                });

                await mongoTool('insert', 'items', { name: 'test' });
                const result = await mongoTool('find', 'items', {});

                expect(result).toEqual([{ _id: 'new', name: 'test' }]);
            });

            test('count followed by update on same collection', async () => {
                mockCountDocuments.mockImplementation((query, cb) => {
                    cb(null, 10);
                });
                mockUpdateOne.mockImplementation((query, update, cb) => {
                    cb(null, { result: { n: 1 } });
                });

                const count = await mongoTool('count', 'items', {});
                const updated = await mongoTool('update', 'items', { _id: '1' }, { $set: { x: 1 } });

                expect(count).toBe(10);
                expect(updated).toBe(1);
            });
        });

        // ─── Function name variations ───────────────────────────────────────

        describe('Function name variations', () => {
            test('unmapped function names pass through unchanged', async () => {
                const mockCustomOp = jest.fn((arg, cb) => {
                    cb(null, { result: { n: 5 } });
                });
                mockCollectionObj.customOp = mockCustomOp;

                const result = await mongoTool('customOp', 'users', { test: true });

                expect(mockCustomOp).toHaveBeenCalledWith(
                    { test: true },
                    expect.any(Function)
                );
                expect(result).toBe(5);
            });
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // ███ INTEGRATION SCENARIOS ███
    // ═══════════════════════════════════════════════════════════════════════

    describe('Integration scenarios', () => {
        beforeEach(() => {
            mockCountDocuments.mockImplementation((cb) => cb(null, 1));
            connectCallback(null, mockClient);
            resetAllMocks();
        });

        test('full CRUD workflow on a collection', async () => {
            // Insert
            mockInsertOne.mockImplementation((doc, cb) => {
                cb(null, { ops: [{ _id: 'abc', ...doc }] });
            });
            const inserted = await mongoTool('insert', 'posts', { title: 'Hello' });
            expect(inserted).toEqual([{ _id: 'abc', title: 'Hello' }]);

            // Find
            mockToArray.mockImplementation((cb) => {
                cb(null, [{ _id: 'abc', title: 'Hello' }]);
            });
            const found = await mongoTool('find', 'posts', {});
            expect(found).toEqual([{ _id: 'abc', title: 'Hello' }]);

            // Update
            mockUpdateOne.mockImplementation((q, u, cb) => {
                cb(null, { result: { n: 1 } });
            });
            const updated = await mongoTool('update', 'posts', { _id: 'abc' }, { $set: { title: 'Updated' } });
            expect(updated).toBe(1);

            // Count
            mockCountDocuments.mockImplementation((q, cb) => {
                cb(null, 1);
            });
            const count = await mongoTool('count', 'posts', {});
            expect(count).toBe(1);

            // Delete
            mockDeleteMany.mockImplementation((q, cb) => {
                cb(null, { result: { n: 1 } });
            });
            const deleted = await mongoTool('deleteMany', 'posts', { _id: 'abc' });
            expect(deleted).toBe(1);
        });
    });
});
