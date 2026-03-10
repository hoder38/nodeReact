import { jest } from '@jest/globals';
import Express from 'express';
import request from 'supertest';

// 1. Exhaustive Mocks
jest.unstable_mockModule('../util/utility.js', () => ({
    checkLogin: jest.fn((req, res, next) => {
        if (req.headers.unauthorized) {
            return res.status(401).json({ error: 'auth fail!!!' });
        }
        next();
    }),
    // Mock checkAdmin to match basic-router.js logic:
    // level: checkAdmin(1, req.user) ? 2 : checkAdmin(2, req.user) ? 1 : 0
    checkAdmin: jest.fn((perm, user) => {
        if (user.perm === 1) return true; // Super Admin passes all
        if (user.perm === 2 && perm === 2) return true; // Standard Admin passes level 2 check
        return false;
    }),
    handleError: jest.fn((err, next) => next(err)),
}));

const mockTagToolInstance = {
    searchTags: jest.fn(() => ({
        getArray: () => ({ cur: ['mock', 'path'] })
    })),
};

jest.unstable_mockModule('../models/tag-tool.js', () => ({
    default: jest.fn(() => mockTagToolInstance)
}));

jest.unstable_mockModule('../config.js', () => ({
    EXTENT_FILE_IP: () => 'test-ip',
    EXTENT_FILE_PORT: () => '8080',
    EXTENT_IP: () => 'test-ip',
    WS_PORT: () => '8081',
}));

jest.unstable_mockModule('../constants.js', () => ({
    STORAGEDB: 'storage',
}));

jest.unstable_mockModule('../../../ver.js', () => ({
    ENV_TYPE: 'dev',
}));

// 2. Import modules
const { default: basicRouter } = await import('./basic-router.js');
const { checkAdmin } = await import('../util/utility.js');

describe('Basic Router - Comprehensive Suite', () => {
    let app;
    const mockSuperAdmin = { username: 'admin1', perm: 1 };
    const mockStandardAdmin = { username: 'admin2', perm: 2 };
    const mockRegularUser = { username: 'user1', perm: 0 };

    const setupApp = (user, unauthorized = false) => {
        const testApp = Express();
        testApp.use(Express.json());
        testApp.use((req, res, next) => {
            if (unauthorized) {
                req.headers.unauthorized = 'true';
                req.isAuthenticated = () => false;
            } else {
                req.isAuthenticated = () => true;
            }
            req.user = user;
            req.session = {};
            next();
        });
        testApp.use('/', basicRouter);
        // Error handler to match checkLogin behavior
        testApp.use((err, req, res, next) => {
            if (err.code === 401) return res.status(401).json({ error: err.message });
            res.status(500).json({ error: err.message });
        });
        return testApp;
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /getuser - Logical Branches', () => {
        it('Branch: Super Admin (perm 1)', async () => {
            const res = await request(setupApp(mockSuperAdmin)).get('/getuser');

            expect(res.status).toBe(200);
            expect(res.body.id).toBe('admin1');
            expect(res.body.level).toBe(2);
            expect(res.body.isEdit).toBe(true);
            expect(res.body.nav).toEqual([{
                title: "Stock",
                hash: "/Stock",
                css: "glyphicon glyphicon-signal",
                key: 3
            }]);
            expect(res.body.ws_url).toBe('wss://test-ip:8081/f');
            expect(res.body.main_url).toBe('https://test-ip:8080/f');
        });

        it('Branch: Standard Admin (perm 2)', async () => {
            const res = await request(setupApp(mockStandardAdmin)).get('/getuser');

            expect(res.status).toBe(200);
            expect(res.body.id).toBe('admin2');
            expect(res.body.level).toBe(1);
            expect(res.body.isEdit).toBe(false);
            expect(res.body.nav).toEqual([]);
        });

        it('Branch: Regular User', async () => {
            const res = await request(setupApp(mockRegularUser)).get('/getuser');

            expect(res.status).toBe(200);
            expect(res.body.id).toBe('user1');
            expect(res.body.level).toBe(0);
            expect(res.body.isEdit).toBe(false);
            expect(res.body.nav).toEqual([]);
        });
    });

    describe('GET /testLogin', () => {
        it('Branch: Authenticated', async () => {
            const res = await request(setupApp(mockRegularUser)).get('/testLogin');
            expect(res.status).toBe(200);
            expect(res.body.apiOK).toBe(true);
        });

        it('Unauthenticated Scenario', async () => {
            const res = await request(setupApp(null, true)).get('/testLogin');
            expect(res.status).toBe(401);
            expect(res.body.error).toBe('auth fail!!!');
        });
    });

    describe('GET /getPath', () => {
        it('Branch: Path Exists', async () => {
            const res = await request(setupApp(mockRegularUser)).get('/getPath');
            expect(res.status).toBe(200);
            expect(res.body.path).toEqual(['mock', 'path']);
            expect(mockTagToolInstance.searchTags).toHaveBeenCalled();
        });

        it('Branch: Empty Path', async () => {
            mockTagToolInstance.searchTags.mockReturnValueOnce({
                getArray: () => ({ cur: [] })
            });
            const res = await request(setupApp(mockRegularUser)).get('/getPath');
            expect(res.status).toBe(200);
            expect(res.body.path).toEqual([]);
        });

        it('Unauthenticated Scenario', async () => {
            const res = await request(setupApp(null, true)).get('/getPath');
            expect(res.status).toBe(401);
        });
    });

    describe('Edge Cases', () => {
        it('Malformed User Object (Missing Username)', async () => {
            const res = await request(setupApp({ perm: 1 })).get('/getuser');
            expect(res.status).toBe(200);
            expect(res.body.id).toBeUndefined();
        });
    });
});
