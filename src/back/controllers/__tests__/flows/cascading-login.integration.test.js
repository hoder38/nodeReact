/**
 * cascading-login.integration.test.js — Two-Server Cascading Auth Flow
 * (§2 of FULL_STACK_TESTING_STRATEGY.md)
 *
 * Two Express apps (main-server + file-server) sharing the same real
 * MongoDB and Passport instance but using independent MemoryStore sessions.
 *
 * Tests the cascading login flow:
 *   1. Browser logs in to main server (POST /api/login)
 *   2. Browser separately logs in to file server (POST /f/api/login)
 *   3. Each server maintains its own session
 *   4. Logging out of one does not affect the other
 *
 * Run inside the file-server container:
 *   docker exec -w /app -e NODE_OPTIONS=--experimental-vm-modules \
 *     reactnode-file-server npx jest \
 *     src/back/controllers/__tests__/flows/cascading-login.integration.test.js \
 *     --forceExit --no-cache
 */
import { jest, describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import bcryptModule from 'bcrypt';
import { PASSWORD_SALT } from '../../../../../ver.js';

// =====================================================================
// DYNAMIC IMPORTS — real modules, no mocks
// =====================================================================
const { default: Express } = await import('express');
const { default: bodyParser } = await import('body-parser');
const { default: session } = await import('express-session');
const { default: Passport } = await import('passport');
const { default: request } = await import('supertest');

const { default: Mongo, closeDB } = await import('../../../models/mongo-tool.js');

// Importing login-router.js registers the Passport strategy + serialize/deserialize
const { default: LoginRouter } = await import('../../login-router.js');
const { default: BasicRouter } = await import('../../basic-router.js');
const { default: UserRouter } = await import('../../user-router.js');
const { default: FileBasicRouter } = await import('../../file-basic-router.js');
const { handleError, HoError } = await import('../../../util/utility.js');

// =====================================================================
// TEST CONSTANTS
// =====================================================================
// file-basic-router's checkLogin(type=1) inspects user-agent; supertest
// sends none by default → TypeError → 500.  Always provide a UA.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const TEST_USERNAME = '__integ_cascade_user';
const TEST_PASSWORD = 'CascPass321';
const TEST_PASSWORD_HASH = await bcryptModule.hash(PASSWORD_SALT + TEST_PASSWORD, 10);
const TEST_USER_DOC = {
    username: TEST_USERNAME,
    password: TEST_PASSWORD_HASH,
    perm: 0,
    desc: 'cascading login test user',
    auto: '',
    kindle: '',
    unDay: 0,
    unHit: 0,
};

// =====================================================================
// BUILD APPS
// =====================================================================

/** Main server app (mirrors server.js) */
function buildMainApp() {
    const app = Express();
    app.use((req, res, next) => /\\|%5c/i.test(req.originalUrl) ? res.status(400).json({ error: 'Invalid URL' }) : next());
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(bodyParser.json({ extended: true }));
    app.use(session({
        secret: 'main-cascade-test',
        resave: false,
        saveUninitialized: false,
    }));
    app.use(Passport.initialize());
    app.use(Passport.session());

    app.use('/api', BasicRouter);
    app.use('/api/user', UserRouter);
    app.use('/', LoginRouter());

    app.use((err, req, res, next) => {
        handleError(err, 'Send');
        err.name === 'HoError'
            ? res.status(err.code).send(err.message.toString())
            : res.status(500).send('server error occur');
    });
    return app;
}

/** File server app (mirrors file-server.js, lightweight) */
function buildFileApp() {
    const app = Express();
    app.use((req, res, next) => /\\|%5c/i.test(req.originalUrl) ? res.status(400).json({ error: 'Invalid URL' }) : next());
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(bodyParser.json({ extended: true }));
    app.use(session({
        secret: 'file-cascade-test',
        resave: false,
        saveUninitialized: false,
    }));
    app.use(Passport.initialize());
    app.use(Passport.session());

    // CORS (file-server.js L93-97)
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Credentials', true);
        res.header('Access-Control-Allow-Origin', req.headers.origin);
        res.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
        res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
        req.method === 'OPTIONS' ? res.json({ apiOK: true }) : next();
    });

    app.use('/f/api', FileBasicRouter);
    // Re-use the same LoginRouter — the Passport strategy is already registered.
    // Mounting the same router at /f means /f/api/login, /f/api/logout work.
    app.use('/f', LoginRouter());

    app.all('*', (req, res, next) => handleError(new HoError('page not found', { code: 404 }), next));
    app.use((err, req, res, next) => {
        handleError(err, 'Send');
        err.name === 'HoError'
            ? res.status(err.code).send(err.message.toString())
            : res.status(500).send('server error occur');
    });
    return app;
}

// =====================================================================
// SETUP & TEARDOWN
// =====================================================================
async function waitForMongo(maxWait = 10000) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
        try { await Mongo('count', 'user'); return; }
        catch (e) { await new Promise(r => setTimeout(r, 200)); }
    }
    throw new Error('MongoDB connection timeout');
}

let mainApp, fileApp;

beforeAll(async () => {
    await waitForMongo();
    try { await Mongo('deleteMany', 'user', { username: TEST_USERNAME }); } catch (e) { /* ok */ }
    await Mongo('insert', 'user', { ...TEST_USER_DOC });
    mainApp = buildMainApp();
    fileApp = buildFileApp();
}, 30000);

afterAll(async () => {
    try { await Mongo('deleteMany', 'user', { username: TEST_USERNAME }); } catch (e) { /* ok */ }
    await closeDB();
});

// =====================================================================
// TESTS
// =====================================================================
describe('Cascading Login — Two-Server Auth Flow', () => {

    test('Login to main server → 200 + loginOK', async () => {
        const res = await request(mainApp)
            .post('/api/login')
            .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
            .expect(200);
        expect(res.body.loginOK).toBe(true);
        expect(res.body.id).toBe(TEST_USERNAME);
    });

    test('Login to file server → 200 + loginOK', async () => {
        const res = await request(fileApp)
            .post('/f/api/login')
            .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
            .expect(200);
        expect(res.body.loginOK).toBe(true);
        expect(res.body.id).toBe(TEST_USERNAME);
    });

    test('Main server session grants access to /api/testLogin', async () => {
        const agent = request.agent(mainApp);
        await agent.post('/api/login').send({ username: TEST_USERNAME, password: TEST_PASSWORD }).expect(200);
        const res = await agent.get('/api/testLogin').expect(200);
        expect(res.body.apiOK).toBe(true);
    });

    test('File server session grants access to /f/api/testLogin', async () => {
        const agent = request.agent(fileApp);
        await agent.post('/f/api/login').set('User-Agent', UA).send({ username: TEST_USERNAME, password: TEST_PASSWORD }).expect(200);
        const res = await agent.get('/f/api/testLogin').set('User-Agent', UA).expect(200);
        expect(res.body.apiOK).toBe(true);
    });

    test('Main server cookie does NOT work on file server (session isolation)', async () => {
        const mainAgent = request.agent(mainApp);
        const loginRes = await mainAgent
            .post('/api/login')
            .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
            .expect(200);

        // Extract session cookie from main server
        const cookie = loginRes.headers['set-cookie'][0];

        // Use it on file server — should be 401 (different session store)
        await request(fileApp)
            .get('/f/api/testLogin')
            .set('Cookie', cookie)
            .set('User-Agent', UA)
            .expect(401);
    });

    test('File server cookie does NOT work on main server (session isolation)', async () => {
        const fileAgent = request.agent(fileApp);
        const loginRes = await fileAgent
            .post('/f/api/login')
            .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
            .expect(200);

        const cookie = loginRes.headers['set-cookie'][0];

        await request(mainApp)
            .get('/api/testLogin')
            .set('Cookie', cookie)
            .expect(401);
    });

    test('Full cascade: login both → access both → logout main → file still works', async () => {
        const mainAgent = request.agent(mainApp);
        const fileAgent = request.agent(fileApp);

        // Step 1: Login to both servers (same credentials)
        await mainAgent.post('/api/login').send({ username: TEST_USERNAME, password: TEST_PASSWORD }).expect(200);
        await fileAgent.post('/f/api/login').set('User-Agent', UA).send({ username: TEST_USERNAME, password: TEST_PASSWORD }).expect(200);

        // Step 2: Both authenticated
        await mainAgent.get('/api/testLogin').expect(200);
        await fileAgent.get('/f/api/testLogin').set('User-Agent', UA).expect(200);

        // Step 3: Logout from main server only
        await mainAgent.get('/api/logout').expect(200);

        // Step 4: Main server session destroyed
        await mainAgent.get('/api/testLogin').expect(401);

        // Step 5: File server session still active
        const fileRes = await fileAgent.get('/f/api/testLogin').set('User-Agent', UA).expect(200);
        expect(fileRes.body.apiOK).toBe(true);
    });

    test('Logout from file server does not affect main server', async () => {
        const mainAgent = request.agent(mainApp);
        const fileAgent = request.agent(fileApp);

        await mainAgent.post('/api/login').send({ username: TEST_USERNAME, password: TEST_PASSWORD }).expect(200);
        await fileAgent.post('/f/api/login').set('User-Agent', UA).send({ username: TEST_USERNAME, password: TEST_PASSWORD }).expect(200);

        // Logout file server
        await fileAgent.get('/f/api/logout').set('User-Agent', UA).expect(200);
        await fileAgent.get('/f/api/testLogin').set('User-Agent', UA).expect(401);

        // Main server still authenticated
        const mainRes = await mainAgent.get('/api/testLogin').expect(200);
        expect(mainRes.body.apiOK).toBe(true);
    });
});
