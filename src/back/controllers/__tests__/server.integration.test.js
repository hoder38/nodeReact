/**
 * server.integration.test.js — Backend Integration Tests
 * (§2 of FULL_STACK_TESTING_STRATEGY.md)
 *
 * Real Express + real MongoDB + real Passport + MemoryStore sessions.
 * Tests the full auth lifecycle: login, authenticated access, logout,
 * unauthenticated rejection.
 *
 * NO MOCKING of mongo-tool, ver.js, config.js, constants.js, or utility.js.
 * The only departure from server.js is:
 *   - HTTP (not HTTPS) via supertest
 *   - MemoryStore sessions (not Redis)
 *
 * Prerequisites:
 *   - MongoDB container must be running (docker-compose.dev.yml)
 *   - Run inside the file-server container:
 *       docker exec -w /app -e NODE_OPTIONS=--experimental-vm-modules \
 *         reactnode-file-server npx jest \
 *         src/back/controllers/__tests__/server.integration.test.js \
 *         --forceExit --no-cache
 */
import { jest, describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import bcryptModule from 'bcrypt';
import { PASSWORD_SALT } from '../../../../ver.js';

// =====================================================================
// 1. DYNAMIC IMPORTS — real modules, no mocks
// =====================================================================
const { default: Express } = await import('express');
const { default: bodyParser } = await import('body-parser');
const { default: session } = await import('express-session');
const { default: Passport } = await import('passport');
const { default: request } = await import('supertest');

// Real mongo-tool — triggers actual MongoDB connection
const { default: Mongo, objectID, closeDB } = await import('../../models/mongo-tool.js');

// Real routers — use cached mongo-tool, real passport strategy
const { default: LoginRouter } = await import('../login-router.js');
const { default: BasicRouter } = await import('../basic-router.js');
const { default: UserRouter } = await import('../user-router.js');
const { handleError } = await import('../../util/utility.js');

// =====================================================================
// 2. TEST CONSTANTS
// =====================================================================
const TEST_USERNAME = '__integ_test_user';
const TEST_PASSWORD = 'TestPass123';
const TEST_PASSWORD_HASH = await bcryptModule.hash(PASSWORD_SALT + TEST_PASSWORD, 10);
const TEST_USER_DOC = {
    username: TEST_USERNAME,
    password: TEST_PASSWORD_HASH,
    perm: 0,
    desc: 'integration test user',
    auto: '',
    kindle: '',
    unDay: 0,
    unHit: 0,
};

const ADMIN_USERNAME = '__integ_test_admin';
const ADMIN_PASSWORD = 'AdminPass456';
const ADMIN_PASSWORD_HASH = await bcryptModule.hash(PASSWORD_SALT + ADMIN_PASSWORD, 10);
const ADMIN_USER_DOC = {
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD_HASH,
    perm: 1,
    desc: 'integration test admin',
    auto: '',
    kindle: '',
    unDay: 0,
    unHit: 0,
};

let testUserId;
let adminUserId;

// =====================================================================
// 3. BUILD EXPRESS APP
//    Same middleware chain as server.js, but:
//      - HTTP (supertest handles transport)
//      - MemoryStore instead of Redis session store
// =====================================================================
function buildApp() {
    const app = Express();
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(bodyParser.json({ extended: true }));
    app.use(session({
        secret: 'integration-test-secret',
        resave: false,
        saveUninitialized: false,
    }));
    app.use(Passport.initialize());
    app.use(Passport.session());

    // Mount routers in the same order as server.js
    app.use('/api', BasicRouter);
    app.use('/api/user', UserRouter);
    app.use('/', LoginRouter());

    // Error handler (same as server.js L113-116)
    app.use(function(err, req, res, next) {
        handleError(err, 'Send');
        err.name === 'HoError'
            ? res.status(err.code).send(err.message.toString())
            : res.status(500).send('server error occur');
    });

    return app;
}

// =====================================================================
// 4. WAIT FOR MONGODB CONNECTION
//    mongo-tool.js connects asynchronously at import time.
//    Poll until the connection is ready before running tests.
// =====================================================================
async function waitForMongo(maxWait = 10000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
        try {
            await Mongo('count', 'user');
            return;
        } catch (e) {
            await new Promise(r => setTimeout(r, 200));
        }
    }
    throw new Error('MongoDB connection timeout — is the mongodb container running?');
}

// =====================================================================
// 5. SETUP & TEARDOWN
// =====================================================================
let app;

beforeAll(async () => {
    await waitForMongo();

    // Clean up any stale test users from a previous crashed run
    try { await Mongo('deleteMany', 'user', { username: TEST_USERNAME }); } catch (e) { /* ok */ }
    try { await Mongo('deleteMany', 'user', { username: ADMIN_USERNAME }); } catch (e) { /* ok */ }

    // Seed test users
    const inserted = await Mongo('insert', 'user', { ...TEST_USER_DOC });
    testUserId = inserted[0]._id;

    const adminInserted = await Mongo('insert', 'user', { ...ADMIN_USER_DOC });
    adminUserId = adminInserted[0]._id;

    app = buildApp();
}, 30000);

afterAll(async () => {
    try { await Mongo('deleteMany', 'user', { username: TEST_USERNAME }); } catch (e) { /* ok */ }
    try { await Mongo('deleteMany', 'user', { username: ADMIN_USERNAME }); } catch (e) { /* ok */ }
    await closeDB();
});

// =====================================================================
// 6. TESTS
// =====================================================================
describe('Server Integration — Auth Flow', () => {

    // --- Login ---

    test('POST /api/login with valid credentials → 200 + loginOK', async () => {
        const agent = request.agent(app);
        const res = await agent
            .post('/api/login')
            .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
            .expect(200);

        expect(res.body.loginOK).toBe(true);
        expect(res.body.id).toBe(TEST_USERNAME);
    });

    test('POST /api/login with wrong password → 401', async () => {
        await request(app)
            .post('/api/login')
            .send({ username: TEST_USERNAME, password: 'wrongpassword' })
            .expect(401);
    });

    test('POST /api/login with invalid username → 401', async () => {
        await request(app)
            .post('/api/login')
            .send({ username: '!!!', password: TEST_PASSWORD })
            .expect(401);
    });

    test('POST /api/login with nonexistent user → 401', async () => {
        await request(app)
            .post('/api/login')
            .send({ username: 'nonexistentxyz', password: TEST_PASSWORD })
            .expect(401);
    });

    // --- Protected routes: unauthenticated ---

    test('GET /api/testLogin without session → 401', async () => {
        await request(app)
            .get('/api/testLogin')
            .expect(401);
    });

    test('GET /api/getuser without session → 401', async () => {
        await request(app)
            .get('/api/getuser')
            .expect(401);
    });

    test('GET /api/user/act without session → 401', async () => {
        await request(app)
            .get('/api/user/act')
            .expect(401);
    });

    // --- Protected routes: authenticated ---

    test('GET /api/testLogin with valid session → 200', async () => {
        const agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
            .expect(200);

        const res = await agent.get('/api/testLogin').expect(200);
        expect(res.body.apiOK).toBe(true);
    });

    test('GET /api/getuser returns user info after login', async () => {
        const agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
            .expect(200);

        const res = await agent.get('/api/getuser').expect(200);
        expect(res.body.id).toBe(TEST_USERNAME);
        expect(res.body.level).toBeDefined();
    });

    test('GET /api/user/act returns user details after login', async () => {
        const agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
            .expect(200);

        const res = await agent.get('/api/user/act').expect(200);
        expect(res.body.user_info).toBeDefined();
        expect(res.body.user_info.length).toBeGreaterThan(0);
        expect(res.body.user_info[0].name).toBe(TEST_USERNAME);
    });

    // --- Logout ---

    test('GET /api/logout destroys session → next request is 401', async () => {
        const agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
            .expect(200);

        // Verify authenticated
        await agent.get('/api/testLogin').expect(200);

        // Logout
        const logoutRes = await agent.get('/api/logout').expect(200);
        expect(logoutRes.body.apiOK).toBe(true);

        // Session destroyed → 401
        await agent.get('/api/testLogin').expect(401);
    });

    // --- Catch-all ---

    test('Unknown API route → 400', async () => {
        await request(app)
            .get('/api/nonexistent-route-xyz')
            .expect(400);
    });

    // --- Admin vs Regular user ---

    test('Admin GET /api/user/act returns ALL users', async () => {
        const agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD })
            .expect(200);

        const res = await agent.get('/api/user/act').expect(200);
        expect(res.body.user_info).toBeDefined();
        // Admin sees the full user list (at least admin + test user)
        expect(res.body.user_info.length).toBeGreaterThanOrEqual(2);
        // Admin response has an empty-name entry (the "add new user" form row)
        const formRow = res.body.user_info.find(u => u.name === '');
        expect(formRow).toBeDefined();
    });

    test('Regular user GET /api/user/act returns only own info', async () => {
        const agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
            .expect(200);

        const res = await agent.get('/api/user/act').expect(200);
        expect(res.body.user_info).toBeDefined();
        expect(res.body.user_info.length).toBe(1);
        expect(res.body.user_info[0].name).toBe(TEST_USERNAME);
    });

    test('Admin GET /api/getuser has level=2 and nav entries', async () => {
        const agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD })
            .expect(200);

        const res = await agent.get('/api/getuser').expect(200);
        expect(res.body.id).toBe(ADMIN_USERNAME);
        expect(res.body.level).toBe(2);
        expect(res.body.isEdit).toBe(true);
        expect(res.body.nav.length).toBeGreaterThan(0);
    });

    test('Regular user GET /api/getuser has level=0 and no nav', async () => {
        const agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
            .expect(200);

        const res = await agent.get('/api/getuser').expect(200);
        expect(res.body.id).toBe(TEST_USERNAME);
        expect(res.body.level).toBe(0);
        expect(res.body.isEdit).toBe(false);
        expect(res.body.nav).toEqual([]);
    });

    // --- Session persistence ---

    test('Multiple authenticated requests share the same session', async () => {
        const agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
            .expect(200);

        // Three consecutive authenticated requests should all succeed
        await agent.get('/api/testLogin').expect(200);
        await agent.get('/api/getuser').expect(200);
        await agent.get('/api/user/act').expect(200);
    });

    // --- GET /api/getPath (tag session state) ---

    test('GET /api/getPath returns path array after login', async () => {
        const agent = request.agent(app);
        await agent
            .post('/api/login')
            .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
            .expect(200);

        const res = await agent.get('/api/getPath').expect(200);
        expect(res.body.path).toBeDefined();
        expect(Array.isArray(res.body.path)).toBe(true);
    });
});
