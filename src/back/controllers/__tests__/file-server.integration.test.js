/**
 * file-server.integration.test.js — File-Server Backend Integration Tests
 * (§2 of FULL_STACK_TESTING_STRATEGY.md)
 *
 * Real Express file-server app with real MongoDB + Passport + MemoryStore.
 * Tests the file-server auth lifecycle, CORS middleware, and error handling.
 *
 * Skips heavy routers (FileRouter, ExternalRouter, PlaylistRouter, BitfinexRouter)
 * and background jobs / WS / TCP init.  Only the lightweight routers:
 *   - file-basic-router.js  (/f/api/testLogin with checkLogin type=1)
 *   - login-router.js       (/f/api/login, /f/api/logout)
 *
 * Run inside the file-server container:
 *   docker exec -w /app -e NODE_OPTIONS=--experimental-vm-modules \
 *     reactnode-file-server npx jest \
 *     src/back/controllers/__tests__/file-server.integration.test.js \
 *     --forceExit --no-cache
 */
import { jest, describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { createHash } from 'crypto';

// =====================================================================
// DYNAMIC IMPORTS — real modules, no mocks
// =====================================================================
const { default: Express } = await import('express');
const { default: bodyParser } = await import('body-parser');
const { default: session } = await import('express-session');
const { default: Passport } = await import('passport');
const { default: request } = await import('supertest');

const { default: Mongo } = await import('../../models/mongo-tool.js');
const { default: LoginRouter } = await import('../login-router.js');
const { default: FileBasicRouter } = await import('../file-basic-router.js');
const { handleError, HoError } = await import('../../util/utility.js');

// =====================================================================
// TEST CONSTANTS
// =====================================================================
const TEST_USERNAME = '__integ_fs_user';
const TEST_PASSWORD = 'FsPass789';
const TEST_PASSWORD_HASH = createHash('md5').update(TEST_PASSWORD).digest('hex');
const TEST_USER_DOC = {
    username: TEST_USERNAME,
    password: TEST_PASSWORD_HASH,
    perm: 0,
    desc: 'file-server integration test',
    auto: '',
    kindle: '',
    unDay: 0,
    unHit: 0,
};

// =====================================================================
// BUILD FILE-SERVER EXPRESS APP
// Same middleware chain as file-server.js, minus:
//   - HTTPS, Redis sessions, connect-multiparty, WS/TCP, background jobs
// =====================================================================
function buildFileApp() {
    const app = Express();

    // URL backslash rejection (file-server.js L84)
    app.use((req, res, next) =>
        /\\|%5c/i.test(req.originalUrl)
            ? res.status(400).json({ error: 'Invalid URL' })
            : next()
    );

    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(bodyParser.json({ extended: true }));
    app.use(session({
        secret: 'file-server-integ-test',
        resave: false,
        saveUninitialized: false,
    }));
    app.use(Passport.initialize());
    app.use(Passport.session());

    // CORS middleware (file-server.js L93-97)
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Credentials', true);
        res.header('Access-Control-Allow-Origin', req.headers.origin);
        res.header('Access-Control-Allow-Headers', 'Content-Type, Accept');
        res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
        req.method === 'OPTIONS' ? res.json({ apiOK: true }) : next();
    });

    app.use('/f/api', FileBasicRouter);
    app.use('/f', LoginRouter());

    // 404 catch-all (file-server.js L118-120)
    app.all('*', (req, res, next) => {
        return handleError(new HoError('page not found', { code: 404 }), next);
    });

    // Error handler (file-server.js L123-126)
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

let app;

beforeAll(async () => {
    await waitForMongo();
    try { await Mongo('deleteMany', 'user', { username: TEST_USERNAME }); } catch (e) { /* ok */ }
    await Mongo('insert', 'user', { ...TEST_USER_DOC });
    app = buildFileApp();
}, 30000);

afterAll(async () => {
    try { await Mongo('deleteMany', 'user', { username: TEST_USERNAME }); } catch (e) { /* ok */ }
});

// =====================================================================
// HELPERS
// =====================================================================
// file-basic-router's testLogin uses checkLogin(type=1) which inspects
// req.headers['user-agent'].  Supertest sends no UA by default, so we
// must always supply one to avoid a TypeError → 500.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

// =====================================================================
// TESTS
// =====================================================================
describe('File-Server Integration — Auth & Middleware', () => {

    // --- Login ---

    test('POST /f/api/login with valid credentials → 200 + loginOK', async () => {
        const agent = request.agent(app);
        const res = await agent
            .post('/f/api/login')
            .set('User-Agent', UA)
            .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
            .expect(200);
        expect(res.body.loginOK).toBe(true);
        expect(res.body.id).toBe(TEST_USERNAME);
    });

    test('POST /f/api/login with wrong password → 401', async () => {
        await request(app)
            .post('/f/api/login')
            .set('User-Agent', UA)
            .send({ username: TEST_USERNAME, password: 'wrongpassword' })
            .expect(401);
    });

    test('POST /f/api/login with nonexistent user → 401', async () => {
        await request(app)
            .post('/f/api/login')
            .set('User-Agent', UA)
            .send({ username: 'nouser999xyz', password: TEST_PASSWORD })
            .expect(401);
    });

    // --- testLogin (checkLogin type=1) ---

    test('GET /f/api/testLogin without session → 401', async () => {
        await request(app)
            .get('/f/api/testLogin')
            .set('User-Agent', UA)
            .expect(401);
    });

    test('GET /f/api/testLogin with valid session → 200', async () => {
        const agent = request.agent(app);
        await agent
            .post('/f/api/login')
            .set('User-Agent', UA)
            .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
            .expect(200);
        const res = await agent.get('/f/api/testLogin').set('User-Agent', UA).expect(200);
        expect(res.body.apiOK).toBe(true);
    });

    // --- Logout ---

    test('GET /f/api/logout destroys session → next request is 401', async () => {
        const agent = request.agent(app);
        await agent
            .post('/f/api/login')
            .set('User-Agent', UA)
            .send({ username: TEST_USERNAME, password: TEST_PASSWORD })
            .expect(200);
        await agent.get('/f/api/testLogin').set('User-Agent', UA).expect(200);

        const logoutRes = await agent.get('/f/api/logout').set('User-Agent', UA).expect(200);
        expect(logoutRes.body.apiOK).toBe(true);

        await agent.get('/f/api/testLogin').set('User-Agent', UA).expect(401);
    });

    // --- CORS middleware ---

    test('OPTIONS request returns CORS headers + {apiOK: true}', async () => {
        const res = await request(app)
            .options('/f/api/testLogin')
            .set('Origin', 'https://example.com')
            .expect(200);
        expect(res.body.apiOK).toBe(true);
        expect(res.headers['access-control-allow-credentials']).toBe('true');
        expect(res.headers['access-control-allow-origin']).toBe('https://example.com');
        expect(res.headers['access-control-allow-methods']).toBe('GET,PUT,POST,DELETE');
        expect(res.headers['access-control-allow-headers']).toBe('Content-Type, Accept');
    });

    test('Non-OPTIONS request also has CORS headers', async () => {
        const res = await request(app)
            .get('/f/api/testLogin')
            .set('Origin', 'https://mysite.com');
        expect(res.headers['access-control-allow-credentials']).toBe('true');
        expect(res.headers['access-control-allow-origin']).toBe('https://mysite.com');
    });

    // --- 404 catch-all ---

    test('GET /f/unknown-path → 404', async () => {
        await request(app)
            .get('/f/unknown-path-xyz')
            .expect(404);
    });

    test('GET /random-path → 404', async () => {
        await request(app)
            .get('/random-path-outside-f')
            .expect(404);
    });

    // --- URL backslash rejection ---

    test('URL with encoded backslash → 400', async () => {
        const res = await request(app)
            .get('/f/api/test%5cLogin')
            .expect(400);
        expect(res.body.error).toBe('Invalid URL');
    });
});
