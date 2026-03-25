/**
 * Test Suite for session-tool.js
 * Testing session configuration with Redis store
 */

import { jest } from '@jest/globals';

// Clear any previously loaded modules to ensure fresh imports with mocks
jest.resetModules();

// Mock setup - must be synchronous and before imports
const mockOn = jest.fn();
const mockRedisClient = { on: mockOn };
const mockCreateClient = jest.fn(() => mockRedisClient);

// Mock RedisStore constructor
const MockRedisStore = jest.fn(function(opts) {
    this.client = opts.client;
});

// Mock ConnectRedis factory
const mockConnectRedis = jest.fn(() => MockRedisStore);

// Mock redis module
jest.unstable_mockModule('redis', () => ({
    default: { createClient: mockCreateClient },
}));

// Mock connect-redis module
jest.unstable_mockModule('connect-redis', () => ({
    default: mockConnectRedis,
}));

// Mock ver.js module
jest.unstable_mockModule('../../../../ver.js', () => ({
    ENV_TYPE: 'test',
    SESS_SECRET: 'test-secret',
    SESS_PWD: 'testpass',
}));

// Mock config.js module - must create mocks before using in module mock
const mockSESS_IP = jest.fn(() => '127.0.0.1');
const mockSESS_PORT = jest.fn(() => 6379);
jest.unstable_mockModule('../../config.js', () => ({
    SESS_IP: mockSESS_IP,
    SESS_PORT: mockSESS_PORT,
}));

describe('session-tool', () => {
    let sessionTool;
    let SESS_IP;
    let SESS_PORT;

    beforeAll(async () => {
        // Import config to get the actual mocked functions
        const config = await import('../../config.js');
        SESS_IP = config.SESS_IP;
        SESS_PORT = config.SESS_PORT;
        
        // Import the module under test
        const module = await import('../session-tool.js');
        sessionTool = module.default;
    });

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
    });

    describe('Default export function', () => {
        test('should return an object with config property', () => {
            const mockExpress = { session: jest.fn() };
            const result = sessionTool(mockExpress);

            expect(result).toHaveProperty('config');
            expect(typeof result.config).toBe('object');
        });

        test('should set config.secret to SESS_SECRET', () => {
            const mockExpress = { session: jest.fn() };
            const result = sessionTool(mockExpress);

            expect(result.config.secret).toBe('test-secret');
        });

        test('should set config.cookie.maxAge to 3 days in milliseconds (259200000)', () => {
            const mockExpress = { session: jest.fn() };
            const result = sessionTool(mockExpress);

            const expectedMaxAge = 86400 * 1000 * 3; // 259200000
            expect(result.config.cookie.maxAge).toBe(259200000);
            expect(result.config.cookie.maxAge).toBe(expectedMaxAge);
        });

        test('should set config.cookie.secure to true', () => {
            const mockExpress = { session: jest.fn() };
            const result = sessionTool(mockExpress);

            expect(result.config.cookie.secure).toBe(true);
        });

        test('should set config.resave to false', () => {
            const mockExpress = { session: jest.fn() };
            const result = sessionTool(mockExpress);

            expect(result.config.resave).toBe(false);
        });

        test('should set config.saveUninitialized to false', () => {
            const mockExpress = { session: jest.fn() };
            const result = sessionTool(mockExpress);

            expect(result.config.saveUninitialized).toBe(false);
        });

        test('should set config.store to an instance of RedisStore', () => {
            const mockExpress = { session: jest.fn() };
            const result = sessionTool(mockExpress);

            expect(result.config.store).toBeInstanceOf(MockRedisStore);
        });

        test('should return config with all required properties', () => {
            const mockExpress = { session: jest.fn() };
            const result = sessionTool(mockExpress);

            expect(result.config).toEqual({
                secret: 'test-secret',
                cookie: {
                    maxAge: 259200000,
                    secure: true,
                },
                store: expect.any(MockRedisStore),
                resave: false,
                saveUninitialized: false,
            });
        });
    });

    describe('ConnectRedis initialization', () => {
        test('should call ConnectRedis with the express argument', () => {
            const mockExpress = { session: jest.fn() };
            sessionTool(mockExpress);

            expect(mockConnectRedis).toHaveBeenCalledWith(mockExpress);
            expect(mockConnectRedis).toHaveBeenCalledTimes(1);
        });

        test('should call SESS_IP with ENV_TYPE', () => {
            const mockExpress = { session: jest.fn() };
            sessionTool(mockExpress);

            expect(SESS_IP).toHaveBeenCalledWith('test');
        });

        test('should call SESS_PORT with ENV_TYPE', () => {
            const mockExpress = { session: jest.fn() };
            sessionTool(mockExpress);

            expect(SESS_PORT).toHaveBeenCalledWith('test');
        });

        test('should call Redis.createClient with correct port, ip, and auth_pass', () => {
            const mockExpress = { session: jest.fn() };
            sessionTool(mockExpress);

            expect(mockCreateClient).toHaveBeenCalledWith(6379, '127.0.0.1', {
                auth_pass: 'testpass',
            });
        });

        test('should create RedisStore with client option', () => {
            const mockExpress = { session: jest.fn() };
            sessionTool(mockExpress);

            expect(MockRedisStore).toHaveBeenCalledWith({
                client: mockRedisClient,
            });
        });

        test('should pass Redis client to RedisStore', () => {
            const mockExpress = { session: jest.fn() };
            const result = sessionTool(mockExpress);

            expect(result.config.store.client).toBe(mockRedisClient);
        });
    });

    describe('Multiple calls behavior', () => {
        test('should create a new Redis client on each call', () => {
            const mockExpress1 = { session: jest.fn() };
            const mockExpress2 = { session: jest.fn() };

            sessionTool(mockExpress1);
            sessionTool(mockExpress2);

            expect(mockCreateClient).toHaveBeenCalledTimes(2);
        });

        test('should create a new RedisStore on each call', () => {
            const mockExpress1 = { session: jest.fn() };
            const mockExpress2 = { session: jest.fn() };

            sessionTool(mockExpress1);
            sessionTool(mockExpress2);

            expect(MockRedisStore).toHaveBeenCalledTimes(2);
        });

        test('should not cache results between calls', () => {
            const mockExpress1 = { session: jest.fn() };
            const mockExpress2 = { session: jest.fn() };

            const result1 = sessionTool(mockExpress1);
            const result2 = sessionTool(mockExpress2);

            expect(result1).not.toBe(result2);
            expect(result1.config.store).not.toBe(result2.config.store);
        });
    });

    describe('Edge cases', () => {
        test('should handle null express argument', () => {
            const result = sessionTool(null);

            expect(mockConnectRedis).toHaveBeenCalledWith(null);
            expect(result).toHaveProperty('config');
        });

        test('should handle undefined express argument', () => {
            const result = sessionTool(undefined);

            expect(mockConnectRedis).toHaveBeenCalledWith(undefined);
            expect(result).toHaveProperty('config');
        });

        test('should correctly calculate cookie maxAge as 3 days', () => {
            const mockExpress = { session: jest.fn() };
            const result = sessionTool(mockExpress);

            const threeDaysInMs = 3 * 24 * 60 * 60 * 1000;
            expect(result.config.cookie.maxAge).toBe(threeDaysInMs);
        });

        test('should use consistent maxAge calculation', () => {
            const mockExpress = { session: jest.fn() };
            const result = sessionTool(mockExpress);

            // Verify the calculation: 86400 seconds/day * 1000 ms/second * 3 days
            expect(result.config.cookie.maxAge).toBe(86400 * 1000 * 3);
        });

        test('should maintain cookie.secure as boolean true', () => {
            const mockExpress = { session: jest.fn() };
            const result = sessionTool(mockExpress);

            expect(result.config.cookie.secure).toBe(true);
            expect(typeof result.config.cookie.secure).toBe('boolean');
        });
    });

    describe('Integration tests', () => {
        test('should create a complete valid session configuration', () => {
            const mockExpress = { session: jest.fn() };
            const result = sessionTool(mockExpress);

            // Verify all components are properly wired
            expect(mockConnectRedis).toHaveBeenCalledWith(mockExpress);
            expect(mockCreateClient).toHaveBeenCalled();
            expect(MockRedisStore).toHaveBeenCalledWith({ client: mockRedisClient });
            
            // Verify configuration structure
            expect(result.config).toMatchObject({
                secret: expect.any(String),
                cookie: {
                    maxAge: expect.any(Number),
                    secure: expect.any(Boolean),
                },
                resave: expect.any(Boolean),
                saveUninitialized: expect.any(Boolean),
            });
        });

        test('should use environment-specific configuration', () => {
            const mockExpress = { session: jest.fn() };
            sessionTool(mockExpress);

            // Verify ENV_TYPE is passed to configuration functions
            expect(SESS_IP).toHaveBeenCalledWith('test');
            expect(SESS_PORT).toHaveBeenCalledWith('test');
        });

        test('should create Redis client with authentication', () => {
            const mockExpress = { session: jest.fn() };
            sessionTool(mockExpress);

            const callArgs = mockCreateClient.mock.calls[0];
            expect(callArgs[2]).toHaveProperty('auth_pass', 'testpass');
        });
    });
});
