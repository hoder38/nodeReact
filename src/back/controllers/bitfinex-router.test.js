import { jest } from '@jest/globals';
import Express from 'express';
import request from 'supertest';

// 1. Setup Mocks
const mockBitfinexTool = {
    query: jest.fn(),
    parent: jest.fn(),
    getBot: jest.fn(),
    updateBot: jest.fn(),
    deleteBot: jest.fn(),
    closeCredit: jest.fn(),
};

jest.unstable_mockModule('../models/bitfinex-tool.js', () => ({
    default: mockBitfinexTool,
}));

jest.unstable_mockModule('../util/utility.js', () => ({
    checkLogin: jest.fn((req, res, next) => {
        if (req.headers.unauthorized) {
            return res.status(401).json({ error: 'auth fail!!!' });
        }
        next();
    }),
    handleError: jest.fn((err, next) => {
        if (typeof next === 'function') {
            next(err);
        } else {
            res.status(500).json({ error: err.message || err });
        }
    }),
}));

// 2. Import modules
const { default: bitfinexRouter } = await import('./bitfinex-router.js');

describe('Bitfinex Router - Comprehensive Suite', () => {
    let app;
    const mockUser = { _id: 'user_id_123', username: 'testuser' };

    const setupApp = (user, unauthorized = false) => {
        const testApp = Express();
        testApp.use(Express.json());
        testApp.use((req, res, next) => {
            if (unauthorized) req.headers.unauthorized = 'true';
            req.user = user;
            req.session = {};
            next();
        });
        testApp.use('/', bitfinexRouter);
        // Error handler
        testApp.use((err, req, res, next) => {
            res.status(500).json({ error: err.message || 'Internal Server Error' });
        });
        return testApp;
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Authentication Guard', () => {
        it('should block unauthenticated access (TC-BFX-AUTH)', async () => {
            const res = await request(setupApp(null, true)).get('/parent');
            expect(res.status).toBe(401);
        });
    });

    describe('Query Routes (/get, /getSingle, /single)', () => {
        const queryResult = { total: 1, data: [{ symbol: 'fUSD' }] };

        it('GET /get/:sortName/:sortType/:page - standard query', async () => {
            mockBitfinexTool.query.mockReturnValue(queryResult);
            const res = await request(setupApp(mockUser)).get('/get/name/asc/1/fUSD/true/0');
            
            expect(res.status).toBe(200);
            expect(res.body).toEqual(queryResult);
            expect(mockBitfinexTool.query).toHaveBeenCalledWith(1, 'fUSD', 'name', 'asc', mockUser, expect.anything());
        });

        it('GET /getSingle/:sortName/:sortType/:page - single query style', async () => {
            mockBitfinexTool.query.mockReturnValue(queryResult);
            const res = await request(setupApp(mockUser)).get('/getSingle/mtime/desc/0');
            
            expect(res.status).toBe(200);
            expect(mockBitfinexTool.query).toHaveBeenCalledWith(0, undefined, 'mtime', 'desc', mockUser, expect.anything());
        });

        it('GET /single/:sortName/:sortType/:uid - specific item query', async () => {
            mockBitfinexTool.query.mockReturnValue(queryResult);
            const res = await request(setupApp(mockUser)).get('/single/count/asc/999');
            
            expect(res.status).toBe(200);
            expect(mockBitfinexTool.query).toHaveBeenCalledWith(0, undefined, 'count', 'asc', mockUser, expect.anything(), 999);
        });
    });

    describe('Parent Configuration (/parent)', () => {
        it('GET /parent - should return parent list', async () => {
            const parents = [{ name: 'usd', show: 'USD' }];
            mockBitfinexTool.parent.mockReturnValue(parents);
            
            const res = await request(setupApp(mockUser)).get('/parent');
            expect(res.status).toBe(200);
            expect(res.body).toEqual(parents);
        });
    });

    describe('Bot Management (/bot)', () => {
        const botConfig = [{ type: 'fUSD', isActive: true }];

        it('GET /bot - should return user bot settings', async () => {
            mockBitfinexTool.getBot.mockResolvedValue(botConfig);
            
            const res = await request(setupApp(mockUser)).get('/bot');
            expect(res.status).toBe(200);
            expect(res.body).toEqual(botConfig);
            expect(mockBitfinexTool.getBot).toHaveBeenCalledWith(mockUser._id);
        });

        it('PUT /bot - should update user bot settings', async () => {
            const newConfig = { type: 'fUSD', amount: 1000 };
            mockBitfinexTool.updateBot.mockResolvedValue([newConfig]);
            
            const res = await request(setupApp(mockUser))
                .put('/bot')
                .send(newConfig);
                
            expect(res.status).toBe(200);
            expect(res.body).toEqual([newConfig]);
            expect(mockBitfinexTool.updateBot).toHaveBeenCalledWith(mockUser._id, newConfig, mockUser.username);
        });

        it('GET /bot/del/:type - should delete bot', async () => {
            mockBitfinexTool.deleteBot.mockResolvedValue([]);
            
            const res = await request(setupApp(mockUser)).get('/bot/del/fUSD');
            expect(res.status).toBe(200);
            expect(mockBitfinexTool.deleteBot).toHaveBeenCalledWith(mockUser._id, 'fUSD', mockUser.username);
        });
    });

    describe('Credit Operations (/bot/close/:credit)', () => {
        it('GET /bot/close/:credit - should close active credit', async () => {
            mockBitfinexTool.closeCredit.mockResolvedValue();
            
            const res = await request(setupApp(mockUser)).get('/bot/close/credit_id_123');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ apiOK: true });
            expect(mockBitfinexTool.closeCredit).toHaveBeenCalledWith(mockUser.username, 'credit_id_123');
        });

        it('should handle errors in closeCredit', async () => {
            mockBitfinexTool.closeCredit.mockRejectedValue(new Error('Bitfinex API Error'));
            
            const res = await request(setupApp(mockUser)).get('/bot/close/fail_id');
            expect(res.status).toBe(500);
            expect(res.body.error).toBe('Bitfinex API Error');
        });
    });
});
