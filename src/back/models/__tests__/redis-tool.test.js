/**
 * Comprehensive Jest Test Suite for redis-tool.js
 * Testing Redis client wrapper with Promise-based API
 */
import { jest, describe, test, expect, beforeAll, beforeEach } from '@jest/globals';

// Clear any previously loaded modules to ensure fresh imports with mocks
jest.resetModules();

// Mock setup BEFORE imports (ESM requirement)
const mockExec = jest.fn();
const mockMultiObj = {};  // Will chain methods dynamically
const mockMulti = jest.fn(() => mockMultiObj);
const mockOn = jest.fn();
const mockConfig = jest.fn();

const mockClient = {
    on: mockOn,
    multi: mockMulti,
    config: mockConfig,
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    hget: jest.fn(),
    hset: jest.fn(),
    hgetall: jest.fn(),
    expire: jest.fn(),
    exists: jest.fn(),
    lpush: jest.fn(),
    lrange: jest.fn(),
    incr: jest.fn(),
    decr: jest.fn(),
    sadd: jest.fn(),
    smembers: jest.fn(),
};

const mockCreateClient = jest.fn(() => mockClient);

// Mock Redis module
jest.unstable_mockModule('redis', () => ({
    default: { createClient: mockCreateClient },
}));

// Mock dependencies
jest.unstable_mockModule('../../../../ver.js', () => ({
    ENV_TYPE: 'test',
    SESS_PWD: 'testpass123',
}));

jest.unstable_mockModule('../../config.js', () => ({
    SESS_IP: jest.fn(() => '127.0.0.1'),
    SESS_PORT: jest.fn(() => 6379),
}));

// Setup multi chaining - must be done before importing the module
['get', 'set', 'del', 'hget', 'hset', 'expire', 'incr', 'decr', 'lpush', 'exists'].forEach(cmd => {
    mockMultiObj[cmd] = jest.fn(() => mockMultiObj);
});
mockMultiObj.exec = mockExec;

describe('redis-tool.js - Module Initialization', () => {
    let redisTool;
    let SESS_IP;
    let SESS_PORT;

    beforeAll(async () => {
        const config = await import('../../config.js');
        SESS_IP = config.SESS_IP;
        SESS_PORT = config.SESS_PORT;
        
        // Import the module under test
        const module = await import('../redis-tool.js');
        redisTool = module.default;
    });

    test('should create Redis client with correct parameters', () => {
        expect(mockCreateClient).toHaveBeenCalledWith(
            6379,
            '127.0.0.1',
            { auth_pass: 'testpass123' }
        );
        expect(SESS_PORT).toHaveBeenCalledWith('test');
        expect(SESS_IP).toHaveBeenCalledWith('test');
    });

    test('should register error event handler', () => {
        const errorHandler = mockOn.mock.calls.find(call => call[0] === 'error');
        expect(errorHandler).toBeDefined();
        expect(typeof errorHandler[1]).toBe('function');
    });

    test('should register ready event handler', () => {
        const readyHandler = mockOn.mock.calls.find(call => call[0] === 'ready');
        expect(readyHandler).toBeDefined();
        expect(typeof readyHandler[1]).toBe('function');
    });

    test('should register connect event handler', () => {
        const connectHandler = mockOn.mock.calls.find(call => call[0] === 'connect');
        expect(connectHandler).toBeDefined();
        expect(typeof connectHandler[1]).toBe('function');
    });

    test('connect handler should set maxmemory config', () => {
        const connectHandler = mockOn.mock.calls.find(call => call[0] === 'connect')[1];
        
        // Clear previous calls and invoke the connect handler
        mockConfig.mockClear();
        connectHandler();
        
        expect(mockConfig).toHaveBeenCalledWith('SET', 'maxmemory', '100mb');
    });

    test('connect handler should set maxmemory-policy config', () => {
        const connectHandler = mockOn.mock.calls.find(call => call[0] === 'connect')[1];
        
        mockConfig.mockClear();
        connectHandler();
        
        expect(mockConfig).toHaveBeenCalledWith('SET', 'maxmemory-policy', 'allkeys-lru');
    });
});

describe('redis-tool.js - Single Commands', () => {
    let redisTool;

    beforeAll(async () => {
        const module = await import('../redis-tool.js');
        redisTool = module.default;
    });

    beforeEach(() => {
        // Reset all mocks before each test
        jest.clearAllMocks();
    });

    describe('GET command', () => {
        test('should call client.get and resolve with data', async () => {
            mockClient.get.mockImplementation((key, callback) => {
                callback(null, 'testValue');
            });

            const result = await redisTool('get', 'testKey');
            
            expect(mockClient.get).toHaveBeenCalledWith('testKey', expect.any(Function));
            expect(result).toBe('testValue');
        });

        test('should reject when client.get returns error', async () => {
            const testError = new Error('Redis GET failed');
            mockClient.get.mockImplementation((key, callback) => {
                callback(testError, null);
            });

            await expect(redisTool('get', 'testKey')).rejects.toThrow('Redis GET failed');
        });
    });

    describe('SET command', () => {
        test('should call client.set with key and value', async () => {
            mockClient.set.mockImplementation((key, value, callback) => {
                callback(null, 'OK');
            });

            const result = await redisTool('set', 'myKey', 'myValue');
            
            expect(mockClient.set).toHaveBeenCalledWith('myKey', 'myValue', expect.any(Function));
            expect(result).toBe('OK');
        });

        test('should handle SET with additional options', async () => {
            mockClient.set.mockImplementation((...args) => {
                const callback = args[args.length - 1];
                callback(null, 'OK');
            });

            const result = await redisTool('set', 'key', 'value', 'EX', 3600);
            
            expect(mockClient.set).toHaveBeenCalledWith('key', 'value', 'EX', 3600, expect.any(Function));
            expect(result).toBe('OK');
        });

        test('should reject on SET error', async () => {
            const testError = new Error('SET failed');
            mockClient.set.mockImplementation((key, value, callback) => {
                callback(testError, null);
            });

            await expect(redisTool('set', 'key', 'value')).rejects.toThrow('SET failed');
        });
    });

    describe('DEL command', () => {
        test('should call client.del and resolve with count', async () => {
            mockClient.del.mockImplementation((key, callback) => {
                callback(null, 1);
            });

            const result = await redisTool('del', 'keyToDelete');
            
            expect(mockClient.del).toHaveBeenCalledWith('keyToDelete', expect.any(Function));
            expect(result).toBe(1);
        });

        test('should handle multiple keys deletion', async () => {
            mockClient.del.mockImplementation((key1, key2, callback) => {
                callback(null, 2);
            });

            const result = await redisTool('del', 'key1', 'key2');
            
            expect(mockClient.del).toHaveBeenCalledWith('key1', 'key2', expect.any(Function));
            expect(result).toBe(2);
        });
    });

    describe('Hash commands', () => {
        test('HGET should retrieve hash field value', async () => {
            mockClient.hget.mockImplementation((hash, field, callback) => {
                callback(null, 'fieldValue');
            });

            const result = await redisTool('hget', 'myHash', 'field1');
            
            expect(mockClient.hget).toHaveBeenCalledWith('myHash', 'field1', expect.any(Function));
            expect(result).toBe('fieldValue');
        });

        test('HSET should set hash field value', async () => {
            mockClient.hset.mockImplementation((hash, field, value, callback) => {
                callback(null, 1);
            });

            const result = await redisTool('hset', 'myHash', 'field1', 'newValue');
            
            expect(mockClient.hset).toHaveBeenCalledWith('myHash', 'field1', 'newValue', expect.any(Function));
            expect(result).toBe(1);
        });

        test('HGETALL should retrieve all hash fields', async () => {
            const hashData = { field1: 'value1', field2: 'value2' };
            mockClient.hgetall.mockImplementation((hash, callback) => {
                callback(null, hashData);
            });

            const result = await redisTool('hgetall', 'myHash');
            
            expect(mockClient.hgetall).toHaveBeenCalledWith('myHash', expect.any(Function));
            expect(result).toEqual(hashData);
        });
    });

    describe('Other commands', () => {
        test('EXPIRE should set key expiration', async () => {
            mockClient.expire.mockImplementation((key, seconds, callback) => {
                callback(null, 1);
            });

            const result = await redisTool('expire', 'myKey', 3600);
            
            expect(mockClient.expire).toHaveBeenCalledWith('myKey', 3600, expect.any(Function));
            expect(result).toBe(1);
        });

        test('EXISTS should check key existence', async () => {
            mockClient.exists.mockImplementation((key, callback) => {
                callback(null, 1);
            });

            const result = await redisTool('exists', 'myKey');
            
            expect(mockClient.exists).toHaveBeenCalledWith('myKey', expect.any(Function));
            expect(result).toBe(1);
        });

        test('LPUSH should push to list', async () => {
            mockClient.lpush.mockImplementation((key, value, callback) => {
                callback(null, 1);
            });

            const result = await redisTool('lpush', 'myList', 'item1');
            
            expect(mockClient.lpush).toHaveBeenCalledWith('myList', 'item1', expect.any(Function));
            expect(result).toBe(1);
        });

        test('LRANGE should retrieve list range', async () => {
            mockClient.lrange.mockImplementation((key, start, stop, callback) => {
                callback(null, ['item1', 'item2']);
            });

            const result = await redisTool('lrange', 'myList', 0, -1);
            
            expect(mockClient.lrange).toHaveBeenCalledWith('myList', 0, -1, expect.any(Function));
            expect(result).toEqual(['item1', 'item2']);
        });
    });
});

describe('redis-tool.js - MULTI Commands', () => {
    let redisTool;

    beforeAll(async () => {
        const module = await import('../redis-tool.js');
        redisTool = module.default;
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should execute multi command with SET and GET', async () => {
        mockExec.mockImplementation((callback) => {
            callback(null, ['OK', 'value1']);
        });

        const commands = [
            ['set', 'key1', 'value1'],
            ['get', 'key1']
        ];

        const result = await redisTool('multi', commands);
        
        expect(mockClient.multi).toHaveBeenCalled();
        expect(mockMultiObj.set).toHaveBeenCalledWith('key1', 'value1');
        expect(mockMultiObj.get).toHaveBeenCalledWith('key1');
        expect(mockExec).toHaveBeenCalledWith(expect.any(Function));
        expect(result).toEqual(['OK', 'value1']);
    });

    test('should chain multiple operations correctly', async () => {
        mockExec.mockImplementation((callback) => {
            callback(null, ['OK', 'OK', 1, 'testValue']);
        });

        const commands = [
            ['set', 'k1', 'v1'],
            ['set', 'k2', 'v2'],
            ['del', 'k3'],
            ['get', 'k1']
        ];

        const result = await redisTool('multi', commands);
        
        expect(mockMultiObj.set).toHaveBeenCalledTimes(2);
        expect(mockMultiObj.set).toHaveBeenNthCalledWith(1, 'k1', 'v1');
        expect(mockMultiObj.set).toHaveBeenNthCalledWith(2, 'k2', 'v2');
        expect(mockMultiObj.del).toHaveBeenCalledWith('k3');
        expect(mockMultiObj.get).toHaveBeenCalledWith('k1');
        expect(result).toEqual(['OK', 'OK', 1, 'testValue']);
    });

    test('should handle hash operations in multi', async () => {
        mockExec.mockImplementation((callback) => {
            callback(null, [1, 'fieldValue']);
        });

        const commands = [
            ['hset', 'hash1', 'field1', 'value1'],
            ['hget', 'hash1', 'field1']
        ];

        const result = await redisTool('multi', commands);
        
        expect(mockMultiObj.hset).toHaveBeenCalledWith('hash1', 'field1', 'value1');
        expect(mockMultiObj.hget).toHaveBeenCalledWith('hash1', 'field1');
        expect(result).toEqual([1, 'fieldValue']);
    });

    test('should reject when multi exec returns error', async () => {
        const testError = new Error('MULTI exec failed');
        mockExec.mockImplementation((callback) => {
            callback(testError, null);
        });

        const commands = [['set', 'key', 'value']];

        await expect(redisTool('multi', commands)).rejects.toThrow('MULTI exec failed');
    });

    test('should handle empty commands array', async () => {
        mockExec.mockImplementation((callback) => {
            callback(null, []);
        });

        const result = await redisTool('multi', []);
        
        expect(mockClient.multi).toHaveBeenCalled();
        expect(mockExec).toHaveBeenCalled();
        expect(result).toEqual([]);
    });

    test('should handle single command in multi', async () => {
        mockExec.mockImplementation((callback) => {
            callback(null, ['OK']);
        });

        const commands = [['set', 'singleKey', 'singleValue']];

        const result = await redisTool('multi', commands);
        
        expect(mockMultiObj.set).toHaveBeenCalledWith('singleKey', 'singleValue');
        expect(result).toEqual(['OK']);
    });

    test('should handle commands with varying argument counts', async () => {
        mockExec.mockImplementation((callback) => {
            callback(null, ['OK', 1, 1]);
        });

        const commands = [
            ['set', 'key1', 'value1', 'EX', 3600],  // 5 args
            ['del', 'key2'],  // 2 args
            ['expire', 'key3', 60]  // 3 args
        ];

        const result = await redisTool('multi', commands);
        
        expect(mockMultiObj.set).toHaveBeenCalledWith('key1', 'value1', 'EX', 3600);
        expect(mockMultiObj.del).toHaveBeenCalledWith('key2');
        expect(mockMultiObj.expire).toHaveBeenCalledWith('key3', 60);
        expect(result).toEqual(['OK', 1, 1]);
    });
});

describe('redis-tool.js - Edge Cases and Error Handling', () => {
    let redisTool;

    beforeAll(async () => {
        const module = await import('../redis-tool.js');
        redisTool = module.default;
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should handle null/undefined data from Redis', async () => {
        mockClient.get.mockImplementation((key, callback) => {
            callback(null, null);
        });

        const result = await redisTool('get', 'nonExistentKey');
        expect(result).toBeNull();
    });

    test('should handle empty string values', async () => {
        mockClient.get.mockImplementation((key, callback) => {
            callback(null, '');
        });

        const result = await redisTool('get', 'emptyKey');
        expect(result).toBe('');
    });

    test('should handle numeric values', async () => {
        mockClient.get.mockImplementation((key, callback) => {
            callback(null, '42');
        });

        const result = await redisTool('get', 'numericKey');
        expect(result).toBe('42');
    });

    test('should propagate Redis connection errors', async () => {
        const connectionError = new Error('ECONNREFUSED');
        mockClient.set.mockImplementation((key, value, callback) => {
            callback(connectionError, null);
        });

        await expect(redisTool('set', 'key', 'value')).rejects.toThrow('ECONNREFUSED');
    });

    test('should handle timeout errors', async () => {
        const timeoutError = new Error('Command timeout');
        mockClient.get.mockImplementation((key, callback) => {
            callback(timeoutError, null);
        });

        await expect(redisTool('get', 'key')).rejects.toThrow('Command timeout');
    });

    test('should handle multi with nested array edge cases', async () => {
        mockExec.mockImplementation((callback) => {
            callback(null, ['OK']);
        });

        const commands = [['set', 'key', JSON.stringify(['nested', 'array'])]];
        
        const result = await redisTool('multi', commands);
        expect(result).toEqual(['OK']);
    });

    test('should handle commands with no additional arguments', async () => {
        mockClient.incr.mockImplementation((key, callback) => {
            callback(null, 1);
        });

        const result = await redisTool('incr', 'counter');
        expect(mockClient.incr).toHaveBeenCalledWith('counter', expect.any(Function));
        expect(result).toBe(1);
    });

    test('should handle complex hash objects in HGETALL', async () => {
        const complexHash = {
            field1: 'value1',
            field2: '{"nested": "json"}',
            field3: '123',
            field4: ''
        };
        
        mockClient.hgetall.mockImplementation((hash, callback) => {
            callback(null, complexHash);
        });

        const result = await redisTool('hgetall', 'complexHash');
        expect(result).toEqual(complexHash);
    });

    test('should handle array values in list operations', async () => {
        const listData = ['item1', 'item2', 'item3', ''];
        
        mockClient.lrange.mockImplementation((key, start, stop, callback) => {
            callback(null, listData);
        });

        const result = await redisTool('lrange', 'myList', 0, -1);
        expect(result).toEqual(listData);
    });
});

describe('redis-tool.js - Integration Scenarios', () => {
    let redisTool;

    beforeAll(async () => {
        const module = await import('../redis-tool.js');
        redisTool = module.default;
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should handle session storage pattern', async () => {
        mockExec.mockImplementation((callback) => {
            callback(null, [1, 1]);
        });

        const sessionData = JSON.stringify({ userId: '123', username: 'testuser' });
        const commands = [
            ['hset', 'session:abc', 'data', sessionData],
            ['expire', 'session:abc', 3600]
        ];

        const result = await redisTool('multi', commands);
        expect(result).toEqual([1, 1]);
    });

    test('should handle cache invalidation pattern', async () => {
        mockExec.mockImplementation((callback) => {
            callback(null, [1, 1]);
        });

        const commands = [
            ['del', 'cache:user:123'],
            ['del', 'cache:posts:123']
        ];

        const result = await redisTool('multi', commands);
        expect(result).toEqual([1, 1]);
    });

    test('should handle counter increment pattern', async () => {
        mockExec.mockImplementation((callback) => {
            callback(null, [1, 2, 1]);
        });

        const commands = [
            ['incr', 'page:views'],
            ['incr', 'page:views'],
            ['expire', 'page:views', 86400]
        ];

        const result = await redisTool('multi', commands);
        expect(result).toEqual([1, 2, 1]);
    });
});
