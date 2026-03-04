import { jest } from '@jest/globals';

// Define mocks before importing the modules that use them
jest.unstable_mockModule('../models/mongo-tool.js', () => ({
    default: jest.fn(),
    objectID: (id) => id,
}));

jest.unstable_mockModule('../util/utility.js', () => ({
    handleError: jest.fn((err, next) => {
        if (typeof next === 'function') {
            next(err);
        } else if (next && typeof next.status === 'function') {
            next.status(500).json({ error: err.message || err });
        }
    }),
    isValidString: jest.fn(),
    HoError: class HoError extends Error {
        constructor(message, options) {
            super(message);
            this.options = options;
        }
    },
}));

// We'll define a variable that we can update to change the mock implementation
let currentAuthenticateMock = (req, res, next) => next();

jest.unstable_mockModule('passport', () => {
    const passportMock = {
        use: jest.fn(),
        serializeUser: jest.fn(),
        deserializeUser: jest.fn(),
        authenticate: jest.fn(() => (req, res, next) => {
            currentAuthenticateMock(req, res, next);
        }),
        initialize: jest.fn(() => (req, res, next) => next()),
        session: jest.fn(() => (req, res, next) => next()),
    };
    return { default: passportMock };
});

// Now import the modules
const { default: Mongo } = await import('../models/mongo-tool.js');
const { default: Passport } = await import('passport');
const { handleError, isValidString } = await import('../util/utility.js');
const { default: loginRouterFactory } = await import('./login-router.js');
const { default: Express } = await import('express');
const { default: request } = await import('supertest');

describe('Login Router', () => {
    let app;
    let strategyCallback;

    beforeAll(() => {
        // This will trigger Passport.use once, which is fine for capturing strategyCallback
        loginRouterFactory();
        if (Passport.use.mock.calls.length > 0) {
             strategyCallback = Passport.use.mock.calls[0][0]._verify;
        }
    });

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset currentAuthenticateMock to default
        currentAuthenticateMock = (req, res, next) => next();
        
        app = Express();
        app.use(Express.json());
        
        app.use((req, res, next) => {
            req.isAuthenticated = jest.fn(() => true);
            req.session = { destroy: jest.fn() };
            req.logIn = jest.fn((user, cb) => {
                req.user = user;
                cb(null);
            });
            next();
        });

        app.use(loginRouterFactory());
    });

    describe('Passport Strategy', () => {
        it('should fail if username is invalid', async () => {
            isValidString.mockReturnValueOnce(false);
            const done = jest.fn();
            await strategyCallback('invalid', 'password', done);
            expect(handleError).toHaveBeenCalled();
        });

        it('should fail if password is invalid', async () => {
            isValidString.mockImplementation((str, type) => {
                if (type === 'name') return 'user';
                return false;
            });
            await strategyCallback('user', 'invalid', jest.fn());
            expect(handleError).toHaveBeenCalled();
        });

        it('should fail if user not found', async () => {
            isValidString.mockImplementation((str, type) => str);
            Mongo.mockResolvedValueOnce([]);
            await strategyCallback('user', 'password', jest.fn());
            expect(handleError).toHaveBeenCalled();
        });

        it('should fail if password incorrect', async () => {
            isValidString.mockImplementation((str, type) => str);
            const mockUser = { username: 'user', password: 'wrong_hash' };
            Mongo.mockResolvedValueOnce([mockUser]);
            await strategyCallback('user', 'password', jest.fn());
            expect(handleError).toHaveBeenCalled();
        });

        it('should succeed with correct username and password', async () => {
            isValidString.mockImplementation((str, type) => str);
            const mockUser = { username: 'user', password: '5f4dcc3b5aa765d61d8327deb882cf99' };
            Mongo.mockResolvedValueOnce([mockUser]);
            const done = jest.fn();
            await strategyCallback('user', 'password', done);
            expect(done).toHaveBeenCalledWith(null, mockUser);
        });
    });

    describe('Endpoints', () => {
        it('GET /api/logout should return apiOK', async () => {
            const res = await request(app).get('/api/logout');
            expect(res.status).toBe(200);
            expect(res.body.apiOK).toBe(true);
        });

        it('POST /api/login should return loginOK', async () => {
            const mockUser = { username: 'user' };
            
            // Update the authenticate mock for this test
            currentAuthenticateMock = (req, res, next) => {
                req.user = mockUser;
                next();
            };

            const res = await request(app).post('/api/login');
            expect(res.status).toBe(200);
            expect(res.body.loginOK).toBe(true);
            expect(res.body.id).toBe('user');
        });
    });
});
