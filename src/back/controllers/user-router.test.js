import { jest } from '@jest/globals';
import Express from 'express';
import request from 'supertest';
import { USERDB } from '../constants.js';

// Mock dependencies before importing the router
jest.unstable_mockModule('../util/utility.js', () => ({
    checkLogin: jest.fn((req, res, next) => next()),
    checkAdmin: jest.fn(() => false),
    userPWCheck: jest.fn(() => true),
    isValidString: jest.fn((str) => str),
    handleError: jest.fn((err, next) => {
        // This improved mock will call Express's next with an error,
        // which supertest can then properly assert as a 500.
        if (typeof next === 'function') {
            next(err);
        }
    }),
    HoError: class HoError extends Error {},
    completeZero: jest.fn((num) => String(num).padStart(4, '0')),
}));

jest.unstable_mockModule('../models/mongo-tool.js', () => ({
    default: jest.fn(),
}));

jest.unstable_mockModule('../models/tag-tool.js', () => ({
    isDefaultTag: jest.fn(() => false),
    normalize: jest.fn((str) => str),
}));

const { default: userRouter } = await import('./user-router.js');
const { default: Mongo } = await import('../models/mongo-tool.js');
const { checkAdmin, userPWCheck, handleError } = await import('../util/utility.js');

describe('User Router', () => {
    let app;
    const mockUser = { _id: 'userId', perm: 2, username: 'testuser' };
    const mockAdmin = { _id: 'adminId', perm: 1, username: 'admin' };

    beforeEach(() => {
        jest.clearAllMocks();
        app = Express();
        app.use(Express.json());
        app.use((req, res, next) => {
            req.user = mockUser; // Default to non-admin user
            next();
        });
        app.use(userRouter);
        // Add a final error handler for Express to catch errors passed via next()
        app.use((err, req, res, next) => {
            res.status(500).json({ error: err.message });
        });
    });

    describe('GET /act/ (Get User Info)', () => {
        it("should return only the current user's info for a non-admin", async () => {
            Mongo.mockResolvedValueOnce([{ _id: 'userId', username: 'testuser', auto: 'folderId', kindle: 'kindleId' }]);
            const res = await request(app).get('/act/');
            expect(res.status).toBe(200);
            expect(res.body.user_info[0].name).toBe('testuser');
        });

        it('should return all users for an admin', async () => {
            // Re-setup app for this specific test case
            app = Express();
            app.use(Express.json());
            app.use((req, res, next) => {
                req.user = mockAdmin;
                next();
            });
            app.use(userRouter);
            
            checkAdmin.mockReturnValue(true);
            const allUsers = [ { _id: 'userId1', username: 'user1', perm: 2 } ];
            Mongo.mockResolvedValueOnce(allUsers);
            const res = await request(app).get('/act/');
            expect(res.status).toBe(200);
            expect(res.body.user_info).toHaveLength(2); // 1 from db + 1 template
        });
    });

    describe('POST /act/ (Create User)', () => {
        it('should fail if user is not an admin', async () => {
            checkAdmin.mockReturnValue(false);
            await request(app).post('/act/').send({ name: 'new' }).expect(500);
        });

        it('should create a user if user is an admin and data is valid', async () => {
            checkAdmin.mockReturnValue(true);
            Mongo.mockResolvedValueOnce([]); // No existing user
            const newUser = { _id: 'newId', username: 'newUser', perm: 2, desc: 'desc' };
            Mongo.mockResolvedValueOnce([newUser]); // Return created user
            const res = await request(app).post('/act/').send({ name: 'newUser', newPwd: 'password', conPwd: 'password', desc: 'desc', perm: 2 });
            expect(res.status).toBe(200);
            expect(res.body.name).toBe('newUser');
        });

         it('should fail if username already exists', async () => {
            checkAdmin.mockReturnValue(true);
            Mongo.mockResolvedValueOnce([{ username: 'existing' }]);
            await request(app).post('/act/').send({ name: 'existing', newPwd: 'a', conPwd: 'a', desc: 'a', perm: 2 }).expect(500);
        });
    });

    describe('PUT /del/:uid (Delete User)', () => {
        it('should fail if user is not an admin', async () => {
            checkAdmin.mockReturnValue(false);
            await request(app).put('/del/someId').expect(500);
        });

        it('should fail if trying to delete an admin/owner', async () => {
            checkAdmin.mockReturnValue(true);
            handleError.mockImplementation((err, next) => next(err)); // Ensure error is passed
            Mongo.mockResolvedValueOnce([{ _id: 'anotherAdminId', perm: 1 }]);
            await request(app).put('/del/anotherAdminId').send({ userPW: 'adminPass' }).expect(500);
        });
        
        it('should delete a user if conditions are met', async () => {
            checkAdmin.mockReturnValue(true);
            userPWCheck.mockReturnValue(true);

            const testApp = Express();
            testApp.use(Express.json());
            testApp.use((req, res, next) => {
                req.user = mockAdmin;
                next();
            });
            testApp.use(userRouter);

            Mongo.mockResolvedValueOnce([{ _id: 'deleteId', perm: 2 }]);
            Mongo.mockResolvedValueOnce({ n: 1 });
            
            const res = await request(testApp).put('/del/deleteId').send({ userPW: 'adminPass' });
            
            expect(res.status).toBe(200);
            expect(res.body.apiOK).toBe(true);
        });
    });
});
