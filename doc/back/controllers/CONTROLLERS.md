# ANoMoPi — Backend Controllers: Comprehensive QA Testing Documentation

> **Scope**: `src/back/controllers/*` (21 files, 5,442 lines)
> **Reference**: `doc/OUTLINE.md` §3 (Backend Architecture), §7 (Authentication), §11 (QA Testing Scope)
> **Standard**: Jest 27 + Supertest · Node.js 14 · ESM
> **Generated**: 2026-03-18

---

## Table of Contents

| Section | Module(s) | Lines | Endpoints |
|---------|-----------|-------|-----------|
| [1. Server Entry Points](#section-1) | `server.js`, `file-server.js` | 262 | — (setup) |
| [2. Authentication](#section-2) | `login-router.js` | 85 | 3 |
| [3. Core Utility Routers](#section-3) | `basic-router.js`, `home-router.js`, `file-basic-router.js`, `other-router.js` | 137 | 8 |
| [4. User Management](#section-4) | `user-router.js` | 310 | 5 |
| [5. Password Manager](#section-5) | `password-router.js` | 134 | 11 |
| [6. Stock Tracker](#section-6) | `stock-router.js` | 247 | 12 |
| [7. File Storage Browser](#section-7) | `storage-router.js` | 711 | 18 |
| [8. Bookmarks & Tag Categories](#section-8) | `bookmark-router.js`, `parent-router.js` | 545 | 30 |
| [9. File Operations](#section-9) | `file-router.js` | 343 | 4 |
| [10. File Server Utilities](#section-10) | `file-other-router.js` | 753 | 10+ |
| [11. External Sources & Subtitles](#section-11) | `external-router.js` | 1,188 | 15+ |
| [12. Playlist & Torrent](#section-12) | `playlist-router.js` | 340 | 5+ |
| [13. Feature Routers](#section-13) | `bitfinex-router.js` | 50 | 8 |

---

# Section 1: Server Entry Points (server.js & file-server.js)

> **Source paths**:
> - `src/back/controllers/server.js` — Main API server
> - `src/back/controllers/file-server.js` — File/media server + WebSocket + background jobs

---

## 1.1 `server.js` — Main API Server

### 1.1.1 Purpose

`server.js` is the primary HTTPS entry point for the application's API surface. It serves all non-file-related API routes (user management, stock, passwords, bookmarks, etc.) and the login/logout flow. It binds to `IP(ENV_TYPE)` / `PORT(ENV_TYPE)` and delegates real-time communication to a WebSocket layer initialised at startup via `WsInit()`.

### 1.1.2 Logic Flow

#### Import & Configuration Phase

1. Read SSL certificate files synchronously (`CERT`, `CA`, `PKEY`) via `fs.readFileSync`.
2. Build `credentials` object with cert chain, CA bundle, private key, a hardened cipher suite string, and `honorCipherOrder: true`.
3. Create an Express app and wrap it in `https.createServer(credentials, app)`.

#### Initialisation Phase

4. Call `WsInit()` (from `../util/sendWs.js`) — sets up inter-process WebSocket communication.

#### Middleware Stack (order-sensitive)

| # | Middleware | Purpose |
|---|-----------|---------|
| 1 | `body-parser urlencoded({ extended: true })` | Parse URL-encoded form bodies |
| 2 | `body-parser json({ extended: true })` | Parse JSON request bodies |
| 3 | `express-session(SessionStore(ExpressSession).config)` | Redis-backed session with 3-day secure cookie |
| 4 | `Passport.initialize()` | Bootstrap Passport on each request |
| 5 | `Passport.session()` | Deserialise user from session |
| 6 | Custom `showLog(req, next)` | Request logger / diagnostics |

#### Route Mounting Order

| # | Path | Router | Notes |
|---|------|--------|-------|
| 1 | `/api` | `BasicRouter` | `getuser`, `testLogin`, `getPath` |
| 2 | `/api/homepage` | `HomeRouter` | Help / instructions |
| 3 | `/api/user` | `UserRouter` | User CRUD, 2FA verification |
| 4 | `/api/storage` | `StorageRouter` | File listing, metadata, tags |
| 5 | `/api/password` | `PasswordRouter` | Password manager CRUD |
| 6 | `/api/stock` | `StockRouter` | Stock data, P/E, portfolio |
| 7 | `/api/bookmark` | `BookmarkRouter` | Bookmark CRUD |
| 8 | `/api/parent` | `ParentRouter` | Tag category management |
| 9 | `/` | `OtherRouter` | `/refresh`, `/privacy`, `/s` |
| 10 | `/` | `LoginRouter(fileServerUrl)` | `POST /api/login`, `GET /api/logout` — receives file-server origin for cascading login |

#### Error Handling

```
app.use(function(err, req, res, next) {
    handleError(err, 'Send');
    err.name === 'HoError'
        ? res.status(err.code).send(err.message.toString())
        : res.status(500).send('server error occur');
});
```

- **`HoError`** (custom application error): responds with `err.code` (e.g. 400, 403, 404) and the error message.
- **Any other `Error`**: responds with HTTP 500 and the generic string `'server error occur'`.

#### Process-Level Configuration

- `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` — allows outgoing HTTPS to non-verified TLS endpoints.
- `process.on('uncaughtException', ...)` — catches fatal errors and routes them through `handleError` with label `'Threw exception'`.

#### Server Start

- `server.listen(PORT(ENV_TYPE), IP(ENV_TYPE))` — binds the HTTPS server.

### 1.1.3 Invocation & Authentication

- **Session initialisation**: `SessionStore(ExpressSession)` creates a `connect-redis` store instance and returns a config object containing secret, cookie settings (3-day maxAge, `secure: true`, `httpOnly`), and the Redis store reference.
- **Passport setup**: `Passport.initialize()` + `Passport.session()` are applied globally; the local strategy itself is configured inside `login-router.js`.
- **`LoginRouter` receives** the file-server origin URL (`https://<EXTENT_FILE_IP>:<EXTENT_FILE_PORT>/f`) so that after main-server login succeeds, it can cascade a login request to the file server to synchronise the session.

### 1.1.4 Returns & Side Effects

| Item | Detail |
|------|--------|
| WebSocket init | `WsInit()` called once at module level before middleware |
| SSL server | `https.createServer` binds a TLS listener |
| Console output | Two `console.log` calls announcing startup and URL |
| `NODE_TLS_REJECT_UNAUTHORIZED` | Set to `'0'` globally (side effect on all outgoing TLS) |

### 1.1.5 Snapshot Testing Data

**Credentials config shape:**

```js
{
    cert: Buffer,      // contents of CERT file
    ca: Buffer,        // contents of CA file
    key: Buffer,       // contents of PKEY file
    ciphers: "ECDHE-RSA-AES256-SHA384:DHE-RSA-AES256-SHA384:...:!CAMELLIA",
    honorCipherOrder: true
}
```

**Example middleware chain (ordered array):**

```
[
  "bodyParserUrlencoded",
  "bodyParserJson",
  "expressSession",
  "passportInitialize",
  "passportSession",
  "showLog"
]
```

---

## 1.2 `file-server.js` — File/Media Server

### 1.2.1 Purpose

`file-server.js` is the HTTPS entry point for all file/media operations, external integrations (torrents, subtitles, crypto trading), and the WebSocket broadcast hub. It additionally bootstraps **13 background jobs** at startup. It binds to `FILE_IP(ENV_TYPE)` / `FILE_PORT(ENV_TYPE)`.

### 1.2.2 Logic Flow

#### Import & Configuration Phase

1. Read SSL certificate files synchronously (`CERT`, `CA`, `PKEY`) — identical to `server.js`.
2. Build `credentials` object (identical cipher suite and structure).
3. Create Express app + `https.createServer(credentials, app)`.

#### Initialisation Phase

4. `mainInit(server)` — initialises WebSocket server, attaching to the HTTPS server instance (not the Express app) for WSS support.
5. **13 background jobs** are invoked sequentially at module load:

| # | Function | Domain |
|---|----------|--------|
| 1 | `autoUpload()` | Automatic file upload processing |
| 2 | `checkMedia()` | Media integrity / health check |
| 3 | `autoDownload()` | Automatic download queue processing |
| 4 | `updateStock()` | Stock data refresh |
| 5 | `updateStockList()` | Stock list / universe updates |
| 6 | `filterStock()` | Stock screening / filtering |
| 7 | `dbBackup()` | Database backup routine |
| 8 | `checkStock()` | Stock alert / threshold checks |
| 9 | `rateCalculator()` | Rate / interest calculation |
| 10 | `setUserOffer()` | User offer / deal computation |
| 11 | `filterBitfinex()` | Crypto exchange data filtering |
| 12 | `usseInit()` | US stock exchange SSE stream init |
| 13 | `twseInit()` | Taiwan stock exchange stream init |

> **Commented-out job**: `updateExternal()` is imported but not called.

#### Middleware Stack (order-sensitive)

| # | Middleware | Purpose |
|---|-----------|---------|
| 1 | `body-parser urlencoded({ extended: true })` | Parse URL-encoded form bodies |
| 2 | `body-parser json({ extended: true })` | Parse JSON request bodies |
| 3 | `express-session(SessionStore(ExpressSession).config)` | Redis-backed session |
| 4 | `ConnectMultiparty({ uploadDir: NAS_TMP(ENV_TYPE) })` | Multipart file upload, temp dir set to NAS |
| 5 | `Passport.initialize()` | Bootstrap Passport |
| 6 | `Passport.session()` | Deserialise user from session |
| 7 | **CORS handler** (custom inline) | Sets `Access-Control-Allow-*` headers |
| 8 | Custom `showLog(req, next)` | Request logger |

**CORS handler detail (middleware #7):**

```
res.header('Access-Control-Allow-Credentials', true)
res.header('Access-Control-Allow-Origin', req.headers.origin)       // dynamic origin reflection
res.header('Access-Control-Allow-Headers', 'Content-Type, Accept')
res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE')
req.method === 'OPTIONS' ? res.json({apiOK: true}) : next()         // preflight short-circuit
```

#### Route Mounting Order

| # | Path | Router | Notes |
|---|------|--------|-------|
| 1 | `/f/api` | `BasicRouter` (`file-basic-router`) | `testLogin` with mobile/Firefox exceptions |
| 2 | `/f/api/torrent` | `PlaylistRouter` | Torrent/playlist management, archive merge |
| 3 | `/f/api/external` | `ExternalRouter` | External media, subtitle retrieval |
| 4 | `/f/api/file` | `FileRouter` | File edit, delete, media processing |
| 5 | `/f/api/bitfinex` | `BitfinexRouter` | Crypto trading data, bot management |
| 6 | `/f` | `OtherRouter` (`file-other-router`) | Preview, download, subtitle serving |
| 7 | `/f` | `LoginRouter()` | Login/logout (no cascading URL arg) |

#### Catch-All Route

```js
app.all('*', function(req, res, next) {
    return handleError(new HoError('page not found', {code: 404}), next);
});
```

Any request not matching a mounted route returns a `HoError` with HTTP 404.

#### Error Handling

Identical to `server.js`:
- `HoError` → `res.status(err.code).send(err.message.toString())`
- Generic `Error` → `res.status(500).send('server error occur')`

#### Process-Level Configuration

- `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'`
- `process.on('uncaughtException', ...)` — same pattern as `server.js`.

#### Server Start

- `server.listen(FILE_PORT(ENV_TYPE), FILE_IP(ENV_TYPE))`

### 1.2.3 Invocation & Authentication

- Session store setup is identical to `server.js` (same `SessionStore` factory).
- Passport initialisation is identical; however `LoginRouter()` is called **without** arguments (no cascading login — this *is* the file server).
- CORS middleware is applied **before** route matching, enabling cross-origin requests from the main server's frontend.

### 1.2.4 Returns & Side Effects

| Item | Detail |
|------|--------|
| WebSocket init | `mainInit(server)` — full WSS hub attached to HTTPS server |
| 13 background jobs | All fire-and-forget at module load (see table in §1.2.2) |
| `ConnectMultiparty` temp dir | Writes uploaded file chunks to `NAS_TMP(ENV_TYPE)` |
| SSL server | `https.createServer` binds TLS listener on file-server port |
| Console output | Startup banner with URL |
| `NODE_TLS_REJECT_UNAUTHORIZED` | Set to `'0'` globally |

### 1.2.5 Snapshot Testing Data

**Credentials config shape** — identical to `server.js` (see §1.1.5).

**Example middleware chain (ordered array):**

```
[
  "bodyParserUrlencoded",
  "bodyParserJson",
  "expressSession",
  "connectMultiparty",
  "passportInitialize",
  "passportSession",
  "corsHandler",
  "showLog"
]
```

**CORS preflight response shape:**

```json
{ "apiOK": true }
```

**ConnectMultiparty config shape:**

```js
{ uploadDir: NAS_TMP(ENV_TYPE) }  // e.g. "/mnt/nas/tmp"
```

---

## 1.3 Comprehensive Test Scenarios

### 1.3.1 Middleware Ordering Tests

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| MW-01 | body-parser registered before session (server.js) | Express app from `server.js` | Inspect `app._router.stack` | `urlencoded` and `json` layers appear before `expressSession` layer |
| MW-02 | Session registered before Passport (server.js) | Express app from `server.js` | Inspect middleware stack order | `expressSession` layer index < `passportInitialize` index |
| MW-03 | Passport.initialize before Passport.session (server.js) | Express app | Inspect stack | `passportInitialize` index < `passportSession` index |
| MW-04 | body-parser before session (file-server.js) | Express app from `file-server.js` | Inspect stack | `urlencoded`/`json` before `expressSession` |
| MW-05 | ConnectMultiparty after session, before Passport (file-server) | Express app | Inspect stack | `connectMultiparty` index > `expressSession` and < `passportInitialize` |
| MW-06 | CORS handler after Passport.session (file-server) | Express app | Inspect stack | CORS middleware index > `passportSession` index |
| MW-07 | showLog is last in pre-route middleware (both servers) | Either Express app | Inspect stack | `showLog` layer is the last non-route middleware |

### 1.3.2 SSL Certificate Loading

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| SSL-01 | Valid cert/ca/key files | `CERT`, `CA`, `PKEY` point to valid PEM files | Module loads | `credentials` object contains Buffer values for `cert`, `ca`, `key` |
| SSL-02 | Missing CERT file | `CERT` path does not exist | Module loads | `fs.readFileSync` throws `ENOENT`; process crashes at import time |
| SSL-03 | Missing CA file | `CA` path does not exist | Module loads | `fs.readFileSync` throws `ENOENT` |
| SSL-04 | Missing PKEY file | `PKEY` path does not exist | Module loads | `fs.readFileSync` throws `ENOENT` |
| SSL-05 | Cipher suite string correctness | Module loaded | Read `credentials.ciphers` | String equals 15 cipher/exclusion tokens joined by `:`, ending with `!CAMELLIA` |
| SSL-06 | honorCipherOrder flag | Module loaded | Read `credentials.honorCipherOrder` | Value is `true` |

### 1.3.3 Route Mounting Verification

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| RT-01 | BasicRouter at `/api` (server.js) | server.js loaded | Inspect `app._router.stack` for route layers | Layer with `regexp` matching `/api` references `BasicRouter` |
| RT-02 | HomeRouter at `/api/homepage` | server.js loaded | Inspect stack | Mounted at `/api/homepage` |
| RT-03 | UserRouter at `/api/user` | server.js loaded | Inspect stack | Mounted at `/api/user` |
| RT-04 | StorageRouter at `/api/storage` | server.js loaded | Inspect stack | Mounted at `/api/storage` |
| RT-05 | PasswordRouter at `/api/password` | server.js loaded | Inspect stack | Mounted at `/api/password` |
| RT-06 | StockRouter at `/api/stock` | server.js loaded | Inspect stack | Mounted at `/api/stock` |
| RT-07 | BookmarkRouter at `/api/bookmark` | server.js loaded | Inspect stack | Mounted at `/api/bookmark` |
| RT-08 | ParentRouter at `/api/parent` | server.js loaded | Inspect stack | Mounted at `/api/parent` |
| RT-09 | OtherRouter at `/` (server.js) | server.js loaded | Inspect stack | Mounted at `/` |
| RT-10 | LoginRouter at `/` (server.js) | server.js loaded | Inspect stack | Mounted at `/`, receives file-server URL string arg |
| RT-11 | BasicRouter at `/f/api` (file-server) | file-server.js loaded | Inspect stack | `file-basic-router` mounted at `/f/api` |
| RT-12 | PlaylistRouter at `/f/api/torrent` | file-server.js loaded | Inspect stack | Mounted at `/f/api/torrent` |
| RT-13 | ExternalRouter at `/f/api/external` | file-server.js loaded | Inspect stack | Mounted at `/f/api/external` |
| RT-14 | FileRouter at `/f/api/file` | file-server.js loaded | Inspect stack | Mounted at `/f/api/file` |
| RT-15 | BitfinexRouter at `/f/api/bitfinex` | file-server.js loaded | Inspect stack | Mounted at `/f/api/bitfinex` |
| RT-16 | OtherRouter at `/f` (file-server) | file-server.js loaded | Inspect stack | `file-other-router` at `/f` |
| RT-17 | LoginRouter at `/f` (file-server) | file-server.js loaded | Inspect stack | `LoginRouter()` called with zero arguments, mounted at `/f` |
| RT-18 | Catch-all 404 (file-server only) | file-server.js loaded | `GET /nonexistent` | Response status 404, body `'page not found'` |

### 1.3.4 Error Handler Behaviour

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| EH-01 | HoError with code 400 | Error middleware receives `HoError` with `code: 400`, `message: 'bad input'` | Error handler executes | `res.status(400).send('bad input')` called |
| EH-02 | HoError with code 403 | `HoError` with `code: 403`, `message: 'forbidden'` | Error handler executes | `res.status(403).send('forbidden')` |
| EH-03 | HoError with code 404 | `HoError` with `code: 404`, `message: 'page not found'` | Error handler executes | `res.status(404).send('page not found')` |
| EH-04 | Generic Error (TypeError) | A `TypeError` reaches error handler | Error handler executes | `res.status(500).send('server error occur')` |
| EH-05 | Generic Error (ReferenceError) | A `ReferenceError` reaches handler | Error handler executes | `res.status(500).send('server error occur')` |
| EH-06 | handleError called with 'Send' label | Any error reaches handler | Error handler executes | `handleError(err, 'Send')` is called before response is sent |
| EH-07 | Error handler identical in both servers | Both `server.js` and `file-server.js` | Compare error handler logic | Behaviour is functionally identical |

### 1.3.5 CORS Headers (file-server.js Only)

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| CORS-01 | OPTIONS preflight request | `req.method === 'OPTIONS'`, `req.headers.origin = 'https://example.com'` | CORS middleware executes | Response JSON `{apiOK: true}`, `next()` is NOT called |
| CORS-02 | Non-OPTIONS request passes through | `req.method === 'GET'`, `req.headers.origin = 'https://example.com'` | CORS middleware executes | `next()` is called, response not sent |
| CORS-03 | Allow-Origin mirrors request origin | Any request with `origin: 'https://foo.bar'` | CORS middleware executes | `Access-Control-Allow-Origin` header equals `'https://foo.bar'` |
| CORS-04 | Allow-Credentials header set | Any request | CORS middleware executes | `Access-Control-Allow-Credentials` header is `true` |
| CORS-05 | Allow-Headers includes Content-Type and Accept | Any request | CORS middleware executes | `Access-Control-Allow-Headers` equals `'Content-Type, Accept'` |
| CORS-06 | Allow-Methods set correctly | Any request | CORS middleware executes | `Access-Control-Allow-Methods` equals `'GET,PUT,POST,DELETE'` |
| CORS-07 | No CORS middleware in server.js | Main server Express app | Inspect middleware stack | No CORS-related layer exists |

### 1.3.6 Background Job Initialisation (file-server.js)

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| BG-01 | All 13 background jobs called | file-server.js module loads | Spy on each imported function | `autoUpload`, `checkMedia`, `autoDownload`, `updateStock`, `updateStockList`, `filterStock`, `dbBackup`, `checkStock`, `rateCalculator`, `setUserOffer`, `filterBitfinex`, `usseInit`, `twseInit` each called exactly once |
| BG-02 | `updateExternal` is NOT called | file-server.js module loads | Spy on `updateExternal` | Not invoked (import exists but call is commented out) |
| BG-03 | Jobs called after server creation | file-server.js module loads | Observe call order | `HttpsCreateServer` returns before any background job runs |
| BG-04 | Jobs called before middleware setup | file-server.js module loads | Observe call order | All 13 jobs invoked before `app.use(BodyParser...)` |
| BG-05 | `mainInit(server)` called with HTTPS server | file-server.js module loads | Spy on `mainInit` | Called once with the return value of `HttpsCreateServer` |
| BG-06 | Job invocation count is exactly 13 | file-server.js module loads | Count all background function calls | Total is 13 (not 14 — `updateExternal` excluded) |

### 1.3.7 `process.on('uncaughtException')` Behaviour

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| UE-01 | Uncaught exception routed to handleError (server.js) | `process.on('uncaughtException')` registered | An uncaught exception fires | `handleError(err, 'Threw exception')` is called |
| UE-02 | Uncaught exception routed to handleError (file-server.js) | Same as above for file-server | An uncaught exception fires | `handleError(err, 'Threw exception')` is called |
| UE-03 | Handler does not re-throw | Uncaught exception fires | `handleError` completes | Process does not exit (no re-throw in handler) |
| UE-04 | NODE_TLS_REJECT_UNAUTHORIZED set | Either server module loaded | Check `process.env` | `process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0'` |

### 1.3.8 ConnectMultiparty Upload Dir Configuration (file-server.js)

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| MP-01 | uploadDir set to NAS_TMP | file-server.js loaded | Inspect `ConnectMultiparty` call args | `{ uploadDir: NAS_TMP(ENV_TYPE) }` passed |
| MP-02 | NAS_TMP resolves per environment | `ENV_TYPE = 'production'` | `NAS_TMP(ENV_TYPE)` evaluated | Returns production NAS temp path |
| MP-03 | NAS_TMP resolves for dev environment | `ENV_TYPE = 'development'` | `NAS_TMP(ENV_TYPE)` evaluated | Returns development NAS temp path |
| MP-04 | No ConnectMultiparty in server.js | Main server Express app | Inspect middleware stack | `ConnectMultiparty` is not present |
| MP-05 | Multipart middleware position | file-server.js loaded | Inspect stack ordering | `ConnectMultiparty` appears after `expressSession` and before `Passport.initialize()` |
| MP-06 | Upload dir exists on filesystem | Server starts | `NAS_TMP` path checked | Directory exists and is writable |

---

## 1.4 Key Differences Between server.js and file-server.js

| Aspect | server.js (Main) | file-server.js (File) |
|--------|----------------|-----------------------|
| WebSocket init | `WsInit()` — lightweight, TCP-based | `mainInit(server)` — full WSS hub on HTTPS server |
| Background jobs | None | 13 jobs at startup |
| CORS middleware | Not present | Inline handler with dynamic origin reflection |
| File upload support | Not present | `ConnectMultiparty` with `NAS_TMP` upload dir |
| Catch-all route | Commented out (was `app.get('*')`) | Active `app.all('*')` → 404 HoError |
| LoginRouter args | Receives file-server URL for cascading login | Called with no arguments |
| Route prefix | `/api/*` | `/f/api/*` and `/f/*` |
| Bind config | `IP` / `PORT` | `FILE_IP` / `FILE_PORT` |
# Section 2: login-router.js (Authentication)

**Source**: `src/back/controllers/login-router.js`

---

## 1. Purpose

This module implements the Passport.js **local strategy** for user authentication. It handles:

- **Login** (`POST /api/login`): Validates credentials (password or 4-digit verify code), authenticates via Passport, creates a session.
- **Logout** (`GET /api/logout`): Destroys the session if authenticated.
- **Session serialization/deserialization**: Stores `user._id` in the session; reconstitutes a user-info object on each request.
- **Catch-all** (`ALL /api*`): Returns an error for any unmatched `/api*` route.

The module exports a **factory function** that accepts an optional `url` parameter (used for cascading login to the file server) and returns an Express Router instance.

### Dependencies

| Import | Source | Role |
|--------|--------|------|
| `USERDB`, `VERIFYDB` | `../constants.js` | MongoDB collection name constants |
| `Express` | `express` | Router creation |
| `Passport` | `passport` | Authentication framework |
| `Strategy` | `passport-local` | Local (username/password) strategy |
| `createHash` | `crypto` | MD5 hashing for password comparison |
| `Mongo`, `objectID` | `../models/mongo-tool.js` | MongoDB query helper and ObjectId constructor |
| `handleError`, `HoError`, `isValidString` | `../util/utility.js` | Error handling and input validation |

---

## 2. Logic Flow

### 2.1 `Passport.use(new Strategy(...))`

The local strategy callback receives `(username, password, done)` from Passport and executes the following:

```
username ──► isValidString(username, 'name')
             │
             ├── FAIL → HoError('username is not vaild', {code: 401}) via handleError(err, done)
             │
             └── OK (validUsername) ──► isValidString(password, 'passwd')
                                        │
                                        ├── FAIL → isValidString(password, 'verify')
                                        │          │
                                        │          ├── FAIL → HoError('passwd is not vaild', {code: 401})
                                        │          │          (NOTE: done is NOT passed to handleError here)
                                        │          │
                                        │          └── OK (validVerify = true) ──► [continue to DB lookup]
                                        │
                                        └── OK (validPassword) ──► [continue to DB lookup]

DB Lookup: Mongo('find', USERDB, {username: validUsername}, {limit: 1})
           │
           ├── users.length < 1 → HoError('Incorrect username or password', {cdoe: 401})
           │                       (NOTE: typo 'cdoe' in original; done NOT passed)
           │
           ├── validPassword path:
           │   MD5(validPassword) !== users[0].password → HoError (mismatch)
           │   MD5(validPassword) === users[0].password → done(null, users[0])
           │
           └── validVerify path:
               1. Mongo('deleteMany', VERIFYDB, {utime < now - 185s})  ← purge expired codes
               2. Mongo('find', VERIFYDB, {uid: users[0]._id}, {limit: 1})
                  │
                  ├── info.length < 1 OR validVerify !== info[0].verify → HoError
                  │
                  └── Match → done(null, users[0])

.catch(err) → handleError(err, done)
```

### 2.2 `Passport.serializeUser`

```js
done(null, user._id)
```

Stores only `user._id` (MongoDB ObjectId) into the session (Redis-backed).

### 2.3 `Passport.deserializeUser`

```js
Mongo('find', USERDB, {_id: objectID(id)}, {limit: 1})
```

Reconstitutes a **subset** of the user document:

| Field | Description |
|-------|-------------|
| `_id` | MongoDB ObjectId |
| `auto` | Auto-login / automation flag |
| `perm` | Permission level (0=standard, 1=admin, 2=content admin, up to 32 bitwise) |
| `unDay` | Usage day counter |
| `unHit` | Usage hit counter |
| `username` | Login username |
| `password` | MD5-hashed password |

On error, falls through to `handleError(err, done)`.

### 2.4 `POST /api/login`

```
Request ──► Passport.authenticate('local')
            │
            ├── FAIL → Passport returns 401 (default behavior)
            │
            └── OK ──► req.logIn(req.user, callback)
                        │
                        └── res.json({
                              loginOK: true,
                              id: req.user.username,
                              url: <optional, only if factory url param provided>
                            })
```

- `Passport.authenticate('local')` is Express middleware; on failure it sends 401 automatically.
- `req.logIn()` explicitly serializes the user into the session.
- If the factory was called with a `url` (cascading login), the response includes `{url}` so the client can POST to the file server next.

### 2.5 `GET /api/logout`

```
Request ──► req.isAuthenticated()
            │
            ├── true  → req.session.destroy()
            │
            └── false → (no-op, no error)

Always responds: res.json({apiOK: true, url?: <if factory url provided>})
```

- Logout always succeeds (200) regardless of authentication state.
- Session destruction removes the session from Redis.

### 2.6 `ALL /api*` (Catch-All)

```
Any unmatched /api* request → handleError(new HoError('Unkonwn api'), next)
```

Note: The error message contains the original typo `'Unkonwn api'`.

### 2.7 `export default function(url=null)`

Factory pattern:

```js
export default function(url=null) {
    // registers routes on shared `router`
    // returns router
}
```

- Called once during server startup.
- When `url` is provided (e.g., file-server login URL), login and logout responses include `{url}` for cascading authentication.
- When `url` is `null` (default), responses omit the `url` field.

---

## 3. Invocation & Authentication

| Endpoint | Method | Auth Required | Description |
|----------|--------|---------------|-------------|
| `/api/login` | POST | **None** (this IS the auth endpoint) | Accepts `{username, password}` form fields via Passport local strategy |
| `/api/logout` | GET | **Session-based** (checked but not enforced) | Destroys session if authenticated; always returns 200 |
| `/api*` | ALL | N/A | Catch-all for unknown API routes; always returns error |

**Request format** for login: Passport local strategy expects `username` and `password` fields in the request body (form-encoded or JSON, depending on body-parser configuration).

---

## 4. Returns & Side Effects

### Response Shapes

**POST /api/login** (success):
```json
{
  "loginOK": true,
  "id": "<username>",
  "url": "<optional redirect URL>"
}
```

**GET /api/logout**:
```json
{
  "apiOK": true,
  "url": "<optional redirect URL>"
}
```

**ALL /api*** (catch-all error):
Error passed to Express `next()` via `handleError`.

### Side Effects

| Side Effect | Detail |
|-------------|--------|
| **Session creation** | `req.logIn()` serializes user to Redis-backed session store |
| **Session cookie** | Express-session sets a secure HTTPS-only cookie (3-day expiry per OUTLINE §7.3) |
| **Session destruction** | `req.session.destroy()` removes session from Redis on logout |
| **Verify code cleanup** | `Mongo('deleteMany', VERIFYDB, {utime < now - 185s})` purges expired verification codes during verify-code login |
| **Console logging** | `console.log('login')`, `console.log('logout')`, `console.log('auth ok')` |

---

## 5. Snapshot Testing Data

### Login Request Shape

```json
{
  "username": "<string validated as 'name'>",
  "password": "<string validated as 'passwd' or 'verify'>"
}
```

### Login Success Response (with url)

```json
{
  "loginOK": true,
  "id": "testuser",
  "url": "https://file-server/f/api/login"
}
```

### Login Success Response (without url)

```json
{
  "loginOK": true,
  "id": "testuser"
}
```

### Logout Response (with url)

```json
{
  "apiOK": true,
  "url": "https://file-server/f/api/login"
}
```

### Logout Response (without url)

```json
{
  "apiOK": true
}
```

### Deserialized User Object Shape

```json
{
  "_id": "<ObjectId>",
  "auto": "<value>",
  "perm": "<number>",
  "unDay": "<value>",
  "unHit": "<value>",
  "username": "<string>",
  "password": "<MD5 hash string>"
}
```

---

## 6. Comprehensive Test Scenarios

### 6.1 Passport Local Strategy — Credential Validation

| # | Scenario | Input | Expected Behavior | Key Assertion |
|---|----------|-------|-------------------|---------------|
| 1 | **Valid login with password (happy path)** | Valid username + valid password (MD5 matches) | `done(null, users[0])` called | User object passed to done; no error |
| 2 | **Valid login with 4-digit verify code** | Valid username + valid verify code (matches DB, not expired) | Expired codes purged → verify found → `done(null, users[0])` | Verify code lookup occurs after deleteMany cleanup |
| 3 | **Invalid username** | Username fails `isValidString(username, 'name')` | `handleError(HoError('username is not vaild', {code:401}), done)` | Strategy aborts early; no DB query made |
| 4 | **Invalid password AND invalid verify** | Password fails `isValidString(password, 'passwd')` AND fails `isValidString(password, 'verify')` | `handleError(HoError('passwd is not vaild', {code:401}))` | Note: `done` is NOT passed to handleError (potential bug — error may not propagate to Passport) |
| 5 | **Username not found in DB** | Valid credentials but `users.length < 1` | `handleError(HoError('Incorrect username or password', {cdoe:401}))` | Note: typo `cdoe`; `done` NOT passed to handleError |
| 6 | **Wrong password (MD5 mismatch)** | Valid username + valid password format but MD5 hash ≠ stored hash | `handleError(HoError('Incorrect username or password', {cdoe:401}))` | MD5 comparison: `createHash('md5').update(validPassword).digest('hex')` |
| 7 | **Expired verify code (all codes expired)** | Valid verify code input; all VERIFYDB entries have `utime < now - 185s` | deleteMany removes all → find returns empty → `handleError(...)` | `info.length < 1` triggers error |
| 8 | **Wrong verify code (code exists but doesn't match)** | Valid verify code format; DB has entry for user but `validVerify !== info[0].verify` | `handleError(HoError('Incorrect username or password', {cdoe:401}))` | Condition: `info.length < 1 OR validVerify !== info[0].verify` |
| 9 | **Verify code found but for different user** | Verify code in DB but `uid` doesn't match `users[0]._id` | find returns empty for that uid → `info.length < 1` → error | Query filters by `{uid: users[0]._id}` |
| 10 | **Mongo error in login flow (catch block)** | Any Mongo operation throws | `.catch(err => handleError(err, done))` | Error propagated to Passport via `done` |

### 6.2 Session Serialization

| # | Scenario | Input | Expected Behavior | Key Assertion |
|---|----------|-------|-------------------|---------------|
| 11 | **serializeUser stores correct _id** | User object with `_id` field | `done(null, user._id)` | Only `_id` stored in session (not full user object) |
| 12 | **deserializeUser with valid ObjectId** | Valid MongoDB ObjectId string | Queries USERDB → returns 7-field user subset | Returns `{_id, auto, perm, unDay, unHit, username, password}` |
| 13 | **deserializeUser with invalid ObjectId** | Invalid/malformed id string | `objectID(id)` throws → `.catch(err => handleError(err, done))` | Error passed to `done` via handleError |
| 14 | **deserializeUser — user not found** | Valid ObjectId but no matching document | `users[0]` access throws (undefined) → catch block | TypeError propagated through handleError |

### 6.3 POST /api/login Route

| # | Scenario | Input | Expected Behavior | Key Assertion |
|---|----------|-------|-------------------|---------------|
| 15 | **Login with url parameter (cascading login)** | Factory called with `url='https://file-server/f/api/login'` | Response includes `{loginOK: true, id, url}` | `Object.assign` adds `url` property |
| 16 | **Login without url parameter** | Factory called with `url=null` (default) | Response is `{loginOK: true, id}` — no `url` field | Ternary `url ? {url} : {}` yields empty object |
| 17 | **Login authentication failure** | Passport.authenticate('local') fails | Passport sends 401 response (default) | `req.logIn` callback never reached |
| 18 | **Login — req.logIn callback** | Successful authentication | `req.logIn(req.user, cb)` invoked; `console.log('auth ok')` | Session serialized via serializeUser |

### 6.4 GET /api/logout Route

| # | Scenario | Input | Expected Behavior | Key Assertion |
|---|----------|-------|-------------------|---------------|
| 19 | **Logout when authenticated** | `req.isAuthenticated()` returns true | `req.session.destroy()` called → `{apiOK: true}` | Session removed from Redis |
| 20 | **Logout when not authenticated** | `req.isAuthenticated()` returns false | No session destruction → `{apiOK: true}` | Always returns 200; no error thrown |
| 21 | **Logout with url parameter** | Factory called with url | Response: `{apiOK: true, url}` | url included via ternary |
| 22 | **Logout without url parameter** | Factory called without url | Response: `{apiOK: true}` | No url property in response |

### 6.5 Catch-All Route & Factory

| # | Scenario | Input | Expected Behavior | Key Assertion |
|---|----------|-------|-------------------|---------------|
| 23 | **Catch-all /api* route returns error** | Any unmatched request to `/api/anything` | `handleError(new HoError('Unkonwn api'), next)` | Error passed to Express error handler via `next` |
| 24 | **Factory returns router** | `loginRouter()` or `loginRouter(url)` | Returns Express.Router instance with 3 routes registered | Router has GET /api/logout, POST /api/login, ALL /api* |

### 6.6 Edge Cases & Observations

| # | Observation | Detail | Test Implication |
|---|-------------|--------|------------------|
| 25 | **Missing `done` in some error paths** | Lines 24, 29, 32, 37: `handleError` called without `done` callback | Passport may hang or throw; test that error surfaces correctly |
| 26 | **Typo `cdoe` in error options** | `{cdoe: 401}` instead of `{code: 401}` on lines 29, 32, 37 | HoError may not set HTTP 401; test actual status code returned |
| 27 | **Typo in error message** | `'username is not vaild'`, `'passwd is not vaild'`, `'Unkonwn api'` | Assert exact misspelled strings in tests |
| 28 | **Shared router instance** | `const router = Express.Router()` at module level; factory adds routes each call | If factory called multiple times, routes are duplicated on same router |
| 29 | **verify code cleanup is global** | `deleteMany` purges ALL expired codes, not just for the current user | Side effect: other users' expired codes are also cleaned up |
| 30 | **No error handling in req.logIn callback** | `err` parameter in `req.logIn` callback is ignored (line 74) | If serialization fails, error is silently swallowed |
# Section 3: Core Utility Routers

> **Scope**: `src/back/controllers/basic-router.js`, `home-router.js`, `file-basic-router.js`, `other-router.js`
>
> **Key shared dependencies**:
> - `checkLogin(req, res, next, type=0)` — If `req.isAuthenticated()` is false and `type=0` (default), throws `HoError('auth fail!!!', {code: 401})`. When `type=1`, mobile/Firefox/armv7l user-agents are permitted through **only** for paths matching `/f/video/*`, `/f/subtitle/*`, or `/f/torrent/*`; all other unauthenticated requests still fail with 401.
> - `checkAdmin(perm, user)` — Returns `true` when `user.perm > 0 && user.perm <= perm`. Lower perm number = higher privilege. `perm=1` is superadmin; `perm=2` includes moderators.
> - `HoError(message, {code})` — Custom error constructor (extends `Error`). Default code is 400.
> - `handleError(err, type)` — When `type` is `null`/omitted returns `Promise.reject(err)`; when `type` is a function, invokes it with `err`; when `type` is a string, logs with label.
> - `STORAGEDB` — The string constant `'storage'`, referencing the MongoDB `storage` collection.

---

## 3.1 basic-router.js

**Mount point**: `/api` (Express sub-router)
**Imports**: `STORAGEDB`, `ENV_TYPE`, `EXTENT_FILE_IP`, `EXTENT_FILE_PORT`, `EXTENT_IP`, `WS_PORT`, `Express`, `TagTool`, `checkAdmin`, `checkLogin`

A `StorageTagTool` instance is created at module scope via `TagTool(STORAGEDB)`, binding all tag operations to the `storage` collection.

---

### 3.1.1 GET /api/getuser

| Attribute | Detail |
|---|---|
| **Purpose** | Return the authenticated user's profile, permission level, dynamic navigation items, and connection URLs for the WebSocket and file server. |
| **Auth** | `checkLogin` (standard, `type=0`). Unauthenticated → 401. |
| **Handler flow** | 1. `checkLogin` validates session. 2. Logs `'get basic'`. 3. Computes `level` and `isEdit` from `checkAdmin`. 4. Builds conditional `nav` array. 5. Responds with JSON. |

**Response body** (`Content-Type: application/json`):

| Field | Type | Value / Logic |
|---|---|---|
| `id` | `string` | `req.user.username` |
| `ws_url` | `string` | Template: `wss://${EXTENT_FILE_IP(ENV_TYPE)}:${WS_PORT(ENV_TYPE)}/f` |
| `level` | `number` | See level calculation below |
| `isEdit` | `boolean` | `true` if `checkAdmin(1, req.user)` is truthy, else `false` |
| `nav` | `array` | Conditional — see nav logic below |
| `main_url` | `string` | Template: `https://${EXTENT_FILE_IP(ENV_TYPE)}:${EXTENT_FILE_PORT(ENV_TYPE)}/f` |

**Level calculation logic** (evaluated left-to-right, short-circuit):

```
if   checkAdmin(1, user) → level = 2   // superadmin (perm === 1)
elif checkAdmin(2, user) → level = 1   // moderator  (perm === 2)
else                     → level = 0   // regular user (perm === 0 or perm > 2)
```

Note: The mapping is **inverted** relative to the raw `perm` value — `perm=1` (highest DB privilege) maps to `level=2` (highest client level).

**Nav array conditional**:

- When `checkAdmin(1, req.user)` is `true` (superadmin only):
  ```json
  [{ "title": "Stock", "hash": "/Stock", "css": "glyphicon glyphicon-signal", "key": 3 }]
  ```
- Otherwise: empty array `[]`

Only superadmins receive the Stock navigation link. Moderators (`perm=2`) and regular users get an empty `nav`.

**Side effects**: `console.log('get basic')` on every successful call.

#### Test Scenarios

| # | Scenario | Precondition | Expected Outcome |
|---|---|---|---|
| 1 | Unauthenticated request | No session / not logged in | 401 `HoError('auth fail!!!')` |
| 2 | Authenticated superadmin (`perm=1`) | Valid session, `user.perm=1` | `level=2`, `isEdit=true`, `nav` contains Stock object |
| 3 | Authenticated moderator (`perm=2`) | Valid session, `user.perm=2` | `level=1`, `isEdit=false`, `nav=[]` |
| 4 | Authenticated regular user (`perm=0`) | Valid session, `user.perm=0` | `level=0`, `isEdit=false`, `nav=[]` |
| 5 | Authenticated user with high perm (`perm=5`) | Valid session, `user.perm=5` | `level=0`, `isEdit=false`, `nav=[]` (perm > 2 fails both checks) |
| 6 | Verify `ws_url` format | Any authenticated user | Starts with `wss://`, ends with `/f`, contains correct IP/port for `ENV_TYPE` |
| 7 | Verify `main_url` format | Any authenticated user | Starts with `https://`, ends with `/f`, contains correct IP/port for `ENV_TYPE` |
| 8 | Verify `id` matches username | Any authenticated user | `response.id === req.user.username` |

---

### 3.1.2 GET /api/testLogin

| Attribute | Detail |
|---|---|
| **Purpose** | Lightweight health-check endpoint to verify the user's session is still valid. |
| **Auth** | `checkLogin` (standard, `type=0`). Unauthenticated → 401. |
| **Handler flow** | 1. `checkLogin` validates session. 2. Responds with JSON. |

**Response body**: `{ "apiOK": true }`

**Side effects**: None (no console logging in handler).

#### Test Scenarios

| # | Scenario | Precondition | Expected Outcome |
|---|---|---|---|
| 1 | Unauthenticated request | No session | 401 error |
| 2 | Authenticated request | Valid session | `{ apiOK: true }` with 200 |
| 3 | Expired session | Session cookie present but expired/invalidated | 401 error |

---

### 3.1.3 GET /api/getPath

| Attribute | Detail |
|---|---|
| **Purpose** | Return the current tag navigation breadcrumb path for the user's session against the `storage` collection. |
| **Auth** | `checkLogin` (standard, `type=0`). Unauthenticated → 401. |
| **Handler flow** | 1. `checkLogin` validates session. 2. Calls `StorageTagTool.searchTags(req.session)` to retrieve or initialise the session's tag state for the `storage` collection. 3. Calls `.getArray()` (no arguments — uses defaults `value=null, exactly=false, index=0`). 4. Returns the `.cur` property — an array of tag strings from index 0 to the current navigation position. |

**Response body**: `{ "path": ["tag1", "tag2", ...] }` — Array of strings (may be empty).

**How `searchTags` works**:
- If `req.session['storage']` does not exist, it is initialised with `{ tags: [], exactly: [], index: 0, bookmark: '', markIndex: 0, save: {} }`.
- `.getArray().cur` returns `session['storage'].tags.slice(0, session['storage'].index)` — the "active" portion of the tag breadcrumb.

**Side effects**: May initialise `req.session['storage']` if it does not already exist (session mutation).

#### Test Scenarios

| # | Scenario | Precondition | Expected Outcome |
|---|---|---|---|
| 1 | Unauthenticated request | No session | 401 error |
| 2 | Fresh session (no prior tag navigation) | Authenticated, no `session.storage` | `{ path: [] }` |
| 3 | Session with active tags | Authenticated, `session.storage.tags = ['a','b','c'], index=2` | `{ path: ['a','b'] }` |
| 4 | Session with index=0 | Authenticated, tags exist but `index=0` | `{ path: [] }` (slice from 0 to 0) |
| 5 | Session with full index | Authenticated, `index === tags.length` | `{ path: <all tags> }` |

---

## 3.2 home-router.js

**Mount point**: Typically mounted at `/` or a home-level path.
**Imports**: `Express`, `checkAdmin`, `checkLogin`

### Middleware

```javascript
router.use(function(req, res, next) { checkLogin(req, res, next) })
```

All routes in this router are guarded by `checkLogin` at the middleware level (`type=0`). Any unauthenticated request to any route under this router receives a 401 before reaching any handler.

---

### 3.2.1 GET /

| Attribute | Detail |
|---|---|
| **Purpose** | Return a help/instruction message array describing available commands, search syntax, player shortcuts, and upload support. Admins receive additional adult-content instructions. |
| **Auth** | `checkLogin` via router-level middleware. Unauthenticated → 401. |
| **Handler flow** | 1. Logs `'api homepage'`. 2. Builds `msg` array (main help text). 3. Builds `adult_msg` array (adult-content instructions). 4. If `checkAdmin(2, req.user)` is `true` (superadmin or moderator), concatenates `[...msg, ...adult_msg]`. Otherwise returns `msg` only. 5. Responds with JSON `{ msg }`. |

**Response body**: `{ "msg": [ ...strings ] }`

**Message structure** (summarised by category):

| Section | Content |
|---|---|
| Greeting | `"hello"` |
| Archive/book instructions | Explanation of `.book`, `.cbr`, `.cbz` file handling for reading compressed archives as books |
| Search commands | `>50` (search by ID), `all item`, `all external`, `no local` |
| External search integrations | `yify movie` (with genre filters), `dm5 comic` (with genre filters) |
| Bookmark instructions | Explanation of bookmark objects created when saving bookmarks |
| Search behaviour notes | Default shows only first-item files; commands not counted in single-item search |
| Player shortcuts | Space (play/pause), `c`/`7` (subtitles), `f`/`8` (fullscreen), `<`/`4` (rewind 5s), `>`/`5` (forward 5s), `1` (rewind 1%), `2` (forward 1%), Up/Down (volume), play modes (loop, reverse, single, random for music) |
| Subtitle calibration | Fix current subtitle, use `<>`/`45` to shift ±0.5s |
| Upload support | Magnet, Torrent, Mega, YIFY, DM5 |
| **Adult section** (admin only) | `"18+指令: "`, `"18+: 顯示十八禁的檔案"` |

Several entries are **commented out** in source and not included in output: (none currently).

Some entries are empty strings `""` used as visual separators. One entry is a bare `,` (trailing comma producing `undefined`/sparse entry).

**Admin check**: `checkAdmin(2, req.user)` — true for `perm=1` (superadmin) OR `perm=2` (moderator). Both see adult instructions.

**Side effects**: `console.log('api homepage')` on every call.

#### Test Scenarios

| # | Scenario | Precondition | Expected Outcome |
|---|---|---|---|
| 1 | Unauthenticated request | No session | 401 error (middleware blocks) |
| 2 | Authenticated regular user (`perm=0`) | Valid session, `user.perm=0` | `msg` array without adult section; final element should not be from `adult_msg` |
| 3 | Authenticated moderator (`perm=2`) | Valid session, `user.perm=2` | `msg` array includes `adult_msg` appended at end |
| 4 | Authenticated superadmin (`perm=1`) | Valid session, `user.perm=1` | `msg` array includes `adult_msg` appended at end |
| 5 | User with `perm=3` | Valid session, `user.perm=3` | `msg` without adult section (perm 3 > 2, fails `checkAdmin(2)`) |
| 6 | Verify msg contains "hello" | Any authenticated user | First element is `"hello"` |
| 7 | Verify adult_msg content | Admin user | Array contains `"18+指令: "` and `"18+: 顯示十八禁的檔案"` |
| 8 | Verify msg array length | Regular vs admin | Admin array length = regular length + `adult_msg.length` (4 elements) |
| 9 | Sparse array entry | Any authenticated user | Verify handling of the bare `,` trailing comma (produces `null`/`undefined` element in JSON serialisation) |

---

## 3.3 file-basic-router.js

**Mount point**: `/f/api` (file-server sub-router)
**Imports**: `Express`, `checkLogin`

---

### 3.3.1 GET /f/api/testLogin

| Attribute | Detail |
|---|---|
| **Purpose** | Session validity check for the file server, with relaxed authentication allowing mobile and Firefox clients through for specific file-serving paths. |
| **Auth** | `checkLogin` with `type=1` (relaxed mode). |
| **Handler flow** | 1. `checkLogin(req, res, callback, 1)` is invoked. 2. If authenticated → callback fires → responds `{ apiOK: true }`. 3. If NOT authenticated and `type=1`: checks user-agent for mobile (via `MobileDetect`), Firefox, or armv7l. If detected AND path matches `/f/video/*`, `/f/subtitle/*`, or `/f/torrent/*` → `next()` is called (request proceeds). Otherwise → 401. |

**What `type=1` means**:

The fourth parameter of `checkLogin` controls the authentication strictness:

| `type` value | Behaviour when unauthenticated |
|---|---|
| `0` (default) | Always rejects with 401 `HoError('auth fail!!!')` |
| `1` (truthy) | Checks `User-Agent` for mobile device (via `MobileDetect` library), Firefox browser, or armv7l architecture. If matched **and** the request path is one of `/f/video/*`, `/f/subtitle/*`, `/f/torrent/*`, the request is allowed through without authentication. All other paths still reject with 401. |

This enables media playback on mobile browsers and Firefox which may not properly forward session cookies when loading `<video>` / `<audio>` source URLs or subtitle tracks.

**Important**: For the `/f/api/testLogin` endpoint specifically, the path is `/testLogin` (relative to the router mount), which does **not** match any of the allowed passthrough patterns (`/f/video/*`, `/f/subtitle/*`, `/f/torrent/*`). Therefore, unauthenticated mobile/Firefox requests to this endpoint will still receive a 401. The `type=1` parameter on this specific route effectively behaves the same as `type=0` because the path condition is never satisfied. The `type=1` may be set here for consistency with other routes on the same file-server router, or as a forward-compatibility measure.

**Response body**: `{ "apiOK": true }`

**Side effects**: None.

#### Test Scenarios

| # | Scenario | Precondition | Expected Outcome |
|---|---|---|---|
| 1 | Unauthenticated, desktop browser | No session, desktop UA | 401 error |
| 2 | Unauthenticated, mobile browser | No session, mobile UA | 401 error (path `/testLogin` doesn't match allowed patterns) |
| 3 | Unauthenticated, Firefox browser | No session, Firefox UA | 401 error (same path reason) |
| 4 | Unauthenticated, armv7l UA | No session, armv7l UA string | 401 error (same path reason) |
| 5 | Authenticated request | Valid session | `{ apiOK: true }` with 200 |
| 6 | Expired/invalid session | Stale session cookie | 401 error |
| 7 | Contrast with file-serving route | Unauthenticated mobile hitting `/f/video/xyz` on a route with `type=1` | Allowed through (demonstrates where `type=1` matters) |

---

## 3.4 other-router.js

**Mount point**: Root level (e.g., `/`)
**Imports**: `STORAGEDB`, `ENV_TYPE`, `EXTENT_FILE_IP`, `EXTENT_FILE_PORT`, `Express`, `httpsModule`, `Mongo`, `handleError`, `HoError`, `checkLogin`

This router contains **public endpoints** (no authentication) and a short-URL redirect service.

A commented-out `/subtitle/:uid/:lang/:index/:fresh?` route exists in source (lines 50-71) but is inactive and not documented here.

---

### 3.4.1 GET /refresh

| Attribute | Detail |
|---|---|
| **Purpose** | Simple public endpoint that returns the text `'refresh'`. Likely used as a keep-alive, cache-bust, or health-check target. |
| **Auth** | **None**. Fully public. |
| **Handler flow** | 1. Logs `'refresh'`. 2. `res.end('refresh')`. |

**Response**: Plain text `refresh` (no explicit `Content-Type` header set; Express defaults to `text/html`).

**Side effects**: `console.log('refresh')`.

#### Test Scenarios

| # | Scenario | Precondition | Expected Outcome |
|---|---|---|---|
| 1 | Unauthenticated request | None | 200, body = `'refresh'` |
| 2 | Authenticated request | Valid session | 200, body = `'refresh'` (auth is irrelevant) |
| 3 | Various HTTP methods | POST, PUT, DELETE | Should not match (only GET registered); Express returns 404 or method-not-allowed depending on mount configuration |

---

### 3.4.2 GET /privacy

| Attribute | Detail |
|---|---|
| **Purpose** | Public privacy policy endpoint. Returns the text `'privacy'`. May serve as a placeholder or redirect target for app store / OAuth compliance. |
| **Auth** | **None**. Fully public. |
| **Handler flow** | 1. Logs `'privacy'`. 2. `res.end('privacy')`. |

**Response**: Plain text `privacy`.

**Side effects**: `console.log('privacy')`.

#### Test Scenarios

| # | Scenario | Precondition | Expected Outcome |
|---|---|---|---|
| 1 | Unauthenticated request | None | 200, body = `'privacy'` |
| 2 | Authenticated request | Valid session | 200, body = `'privacy'` |
| 3 | HEAD request | None | 200, empty body, correct content-length |

---

### 3.4.3 GET /homepage

| Attribute | Detail |
|---|---|
| **Purpose** | Public homepage endpoint. Returns the text `'homepage'`. |
| **Auth** | **None**. Fully public. |
| **Handler flow** | 1. Logs `'utility'` (note: log message says "utility", not "homepage"). 2. `res.end('homepage')`. |

**Response**: Plain text `homepage`.

**Side effects**: `console.log('utility')` — the log message does not match the route name.

#### Test Scenarios

| # | Scenario | Precondition | Expected Outcome |
|---|---|---|---|
| 1 | Unauthenticated request | None | 200, body = `'homepage'` |
| 2 | Verify console log | Observe server output | Logs `'utility'` (not `'homepage'`) |
| 3 | Authenticated request | Valid session | 200, body = `'homepage'` |

---

### 3.4.4 GET /s

| Attribute | Detail |
|---|---|
| **Purpose** | Short URL redirect service. Queries the MongoDB `storage` collection for the most recently updated document with `status=7`, then issues a 302 redirect to that document's `url` field. |
| **Auth** | **None**. Fully public. |
| **Handler flow** | 1. Logs `'short'`. 2. Calls `Mongo('find', STORAGEDB, {status: 7}, {sort: [['utime', 'desc']], limit: 1})`. 3. Evaluates the result (see decision tree below). |

**Decision tree**:

```
Mongo('find', 'storage', {status:7}, {sort:[['utime','desc']], limit:1})
  │
  ├─ Promise resolves with items[]
  │   ├─ items.length < 1
  │   │   └─ handleError(new HoError('cannot find url'))
  │   │       → Returns Promise.reject (type=null)
  │   │       → Error code: 400 (HoError default)
  │   │
  │   ├─ items[0].url is falsy (empty string, null, undefined)
  │   │   └─ handleError(new HoError('dont have url'))
  │   │       → Returns Promise.reject (type=null)
  │   │       → Error code: 400 (HoError default)
  │   │
  │   └─ items[0].url is truthy
  │       ├─ url = decodeURIComponent(items[0].url)
  │       ├─ res.header('Content-Type', 'text/plain')
  │       ├─ res.statusCode = 302
  │       ├─ res.header('Location', url)
  │       └─ res.end('302. Redirecting to ${url}')
  │
  └─ Promise rejects (MongoDB error)
      └─ .catch(err => handleError(err, next))
          → Passes error to Express error-handling middleware via next(err)
```

**Response on success** (302):

| Header | Value |
|---|---|
| `Content-Type` | `text/plain` |
| `Location` | Decoded URL from `items[0].url` |
| Status code | `302` |
| Body | `302. Redirecting to <url>` |

**Error responses**:

| Condition | Error message | HoError code | handleError behaviour |
|---|---|---|---|
| No documents with `status=7` | `'cannot find url'` | 400 | `Promise.reject` (no `next` passed; unhandled rejection or caught by framework) |
| Document found but `url` field is falsy | `'dont have url'` | 400 | `Promise.reject` (same) |
| MongoDB query failure | Original error | varies | Passed to `next` via `handleError(err, next)` → Express error middleware |

**Important note on error handling**: In the "no items found" and "no url" branches, `handleError` is called with only the error argument (no `next` callback). This means it returns `Promise.reject(err)` — but this rejected promise is **not caught** by the `.catch()` (it's returned inside `.then()`). This could result in an **unhandled promise rejection** rather than a proper HTTP error response being sent to the client. The `.catch()` only handles errors thrown/rejected by the `Mongo()` call itself. The `return handleError(...)` returns a rejected promise within the `.then()`, which **is** caught by the `.catch()` handler because rejected promises returned from `.then()` propagate to the next `.catch()`. So the error ultimately reaches `handleError(err, next)`, which calls `next(err)` to pass it to Express error middleware.

**Query details**:
- Collection: `storage` (via `STORAGEDB` constant)
- Filter: `{ status: 7 }` — status 7 represents short-URL entries
- Sort: `utime` descending (most recently updated first)
- Limit: 1 (only the latest matching document)
- The `url` field is URI-decoded via `decodeURIComponent()` before being used in the `Location` header

**Side effects**: `console.log('short')`.

#### Test Scenarios

| # | Scenario | Precondition | Expected Outcome |
|---|---|---|---|
| 1 | Valid short URL exists | `storage` collection has document with `status=7` and valid `url` field | 302 redirect; `Location` header = decoded URL; body = `'302. Redirecting to <url>'` |
| 2 | Multiple status=7 documents | Several documents with `status=7`, different `utime` values | Redirects to the URL of the document with the **most recent** `utime` |
| 3 | No status=7 documents | `storage` collection empty or no `status=7` entries | `HoError('cannot find url')` with code 400, passed to Express error handler |
| 4 | Document exists but `url` is empty string | `status=7` doc with `url: ''` | `HoError('dont have url')` with code 400 |
| 5 | Document exists but `url` is null/undefined | `status=7` doc with no `url` field | `HoError('dont have url')` with code 400 |
| 6 | URL contains encoded characters | `url` field = `'https%3A%2F%2Fexample.com%2Fpath'` | `decodeURIComponent` decodes it; `Location` header = `'https://example.com/path'` |
| 7 | URL contains double-encoded characters | `url` field = `'https%253A%252F%252F...'` | Only single decode applied; `Location` = `'https%3A%2F%2F...'` (still encoded) |
| 8 | `decodeURIComponent` throws (malformed URI) | `url` field = `'%E0%A4%A'` (incomplete escape) | Unhandled `URIError` — caught by `.catch()` → `handleError(err, next)` → Express error middleware |
| 9 | MongoDB connection failure | DB down or unreachable | `.catch()` fires → `handleError(err, next)` → Express error middleware handles |
| 10 | Unauthenticated request | No session | 302 redirect (no auth required) |
| 11 | Concurrent requests | Two simultaneous requests | Both get same result (idempotent read query) |
| 12 | Verify `Content-Type` header | Valid redirect | Header is `text/plain` (explicitly set) |
| 13 | `status=7` doc with truthy non-string `url` | `url` field is a number or object | `decodeURIComponent` coerces to string; may produce unexpected redirect target |

---

## Cross-Router Summary

| Route | Method | Auth | Admin Gate | Response Type |
|---|---|---|---|---|
| `/api/getuser` | GET | `checkLogin` | Level computed, nav conditional on `checkAdmin(1)` | JSON |
| `/api/testLogin` | GET | `checkLogin` | None | JSON |
| `/api/getPath` | GET | `checkLogin` | None | JSON |
| `/` (home) | GET | `checkLogin` (middleware) | `checkAdmin(2)` gates adult content | JSON |
| `/f/api/testLogin` | GET | `checkLogin(type=1)` | None | JSON |
| `/refresh` | GET | None | None | Plain text |
| `/privacy` | GET | None | None | Plain text |
| `/homepage` | GET | None | None | Plain text |
| `/s` | GET | None | None | 302 Redirect / Error |
# Section 4: user-router.js (User Management)

**File:** `src/back/controllers/user-router.js` (310 lines)

**Router base path:** Mounted under `/api/user` (all routes prefixed accordingly)

**Global middleware:** `checkLogin(req, res, next)` — every route requires an authenticated session (`req.isAuthenticated()`). Unauthenticated requests receive a **401** error.

**Key dependencies:**

| Import | Purpose |
|--------|---------|
| `USERDB` (`'user'`) | MongoDB collection for user documents |
| `VERIFYDB` (`'verify'`) | MongoDB collection for verification codes |
| `UNACTIVE_DAY` (`5`) | Default inactive-day threshold |
| `UNACTIVE_HIT` (`10`) | Default inactive-hit threshold |
| `checkAdmin(perm, user)` | Returns `true` if `0 < user.perm <= perm` |
| `userPWCheck(user, pw)` | Validates MD5(pw) against `user.password`; caches success for 70 s |
| `isValidString(str, type)` | Validates/coerces string by type; returns value or `false` |
| `completeZero(number, offset)` | Left-pads number with zeros to `offset` digits |
| `isDefaultTag(tag)` | Returns truthy object if tag is reserved/default; `false` otherwise |
| `normalize(tag)` | Lowercases, full-width→ASCII, Chinese numerals→Arabic |

---

## GET /api/user/act/:uid?

**Purpose:** Retrieve user info list.

**Auth:** Login required. Behaviour diverges by admin status.

### Non-Admin Branch (`checkAdmin(1, req.user)` is `false`)

1. Queries `USERDB` for the logged-in user by `req.user._id` (limit 1).
2. If no user found → error `'Could not find user!'` (400).
3. Returns JSON:

| Field | Value |
|-------|-------|
| `name` | `users[0].username` |
| `id` | `users[0]._id` |
| `newable` | `false` |
| `auto` | `https://drive.google.com/drive/folders/{auto}` or `''` |
| `kindle` | `{kindle}@kindle.com` or `''` |
| `editAuto` | `false` |
| `editKindle` | `true` |
| `verify` | `true` |

Response shape: `{ user_info: [ <single user object> ] }`

### Admin Branch (`checkAdmin(1, req.user)` is `true`, i.e. `user.perm === 1`)

1. Queries `USERDB` for **all** users (no filter).
2. Returns JSON `{ user_info: [ newRow, ...userRows ] }`:

**First element (create-new-user form row):**

| Field | Value |
|-------|-------|
| `name` | `''` |
| `perm` | `''` |
| `desc` | `''` |
| `editAuto` | `false` |
| `newable` | `true` |
| `editKindle` | `false` |
| `id` | `0` |

**Each subsequent user row (base fields):**

| Field | Value |
|-------|-------|
| `name` | `user.username` |
| `perm` | `user.perm` |
| `desc` | `user.desc` |
| `id` | `user._id` |
| `newable` | `false` |
| `editAuto` | `true` |
| `editKindle` | `true` |
| `kindle` | `{kindle}@kindle.com` or `''` |
| `auto` | full Google Drive URL or `''` |

**Conditional fields per user (perm-based branching):**

| Condition | Extra fields |
|-----------|-------------|
| `user.perm === 1` | `unDay` (from DB or default `UNACTIVE_DAY`=5), `unHit` (from DB or default `UNACTIVE_HIT`=10), `verify: true` |
| `user.perm !== 1` | `delable: true` |

### Error Handling

| Condition | Error | Code |
|-----------|-------|------|
| Non-admin user not found in DB | `'Could not find user!'` | 400 |
| DB/promise error | Passed to `next` via `handleError` | 400 |

### Test Scenarios

| # | Scenario | Preconditions | Expected Result |
|---|----------|---------------|-----------------|
| 1 | Non-admin, user exists with auto+kindle set | Regular user, DB has auto & kindle fields | 200; single-element array with full Google Drive URL, kindle@kindle.com, editAuto=false |
| 2 | Non-admin, user exists, auto+kindle empty | Regular user, no auto/kindle in DB | 200; auto='', kindle='', editKindle=true |
| 3 | Non-admin, user not found in DB | `req.user._id` not in USERDB | Error: 'Could not find user!' |
| 4 | Admin, no users in DB | Admin user, empty USERDB | 200; user_info has only the new-row form element |
| 5 | Admin, mix of perm=1 and perm≠1 users | DB has owner (perm=1) + regular users | 200; perm=1 users get unDay/unHit/verify; others get delable:true |
| 6 | Admin, perm=1 user has custom unDay/unHit | DB user.unDay=10, user.unHit=20 | Returns those values instead of defaults |
| 7 | Admin, perm=1 user has no unDay/unHit | DB user has no unDay/unHit fields | Returns UNACTIVE_DAY=5, UNACTIVE_HIT=10 |
| 8 | Unauthenticated request | No session | 401 (from checkLogin middleware) |

---

## PUT /api/user/act/:uid?

**Purpose:** Edit user fields. Complex multi-field endpoint supporting partial updates.

**Auth:** Login required. `userPW` field is validated via `userPWCheck`.

### Authentication Flow (lines 53–62)

1. If `req.body.userPW` is present → validate with `isValidString(userPW, 'passwd')`. Invalid → error `'passwd is not valid'` (400).
2. `userPWCheck(req.user, userPW)` must return `true` (either password matches or cached within 70 s). Failure → error `'permission denied'` (400).

### Field Processing (evaluated sequentially; multiple fields can be set in one request)

A `needPerm` flag tracks whether any admin-only field was touched. `data` accumulates DB `$set` fields; `ret` accumulates response fields.

#### Field: `auto` (lines 66–80)

| Step | Detail |
|------|--------|
| Guard | `checkAdmin(1, req.user)` required → 403 if non-admin |
| Validation | `isValidString(req.body.auto, 'url')` → error if invalid |
| Extraction | Regex `/\/folders\/([^\?]*)/i` extracts folder ID |
| Failure | No match → error `'auto is not valid'` (400) |
| DB write | `data.auto` = extracted folder ID |
| Response | `ret.auto` = full `https://drive.google.com/drive/folders/{id}` URL |
| Side effect | Sets `needPerm = true` |

#### Field: `kindle` (lines 81–92)

| Step | Detail |
|------|--------|
| Guard | None (any logged-in user can edit) |
| Validation | `isValidString(req.body.kindle, 'email')` → error if invalid |
| Extraction | Regex `/^([^@]+)@kindle\.com$/i` extracts prefix |
| Failure | No match → error `'kindle is not valid'` (400) |
| DB write | `data.kindle` = lowercased prefix |
| Response | `ret.kindle` = `{prefix}@kindle.com` |

#### Field: `desc` (lines 93–103)

| Step | Detail |
|------|--------|
| Guard | `checkAdmin(1, req.user)` required → 403 if non-admin |
| Trigger | `req.body.desc === '' || req.body.desc` (processes even empty string) |
| Validation | `isValidString(req.body.desc, 'desc')` — up to 500 chars, no `\ / | * ? ' " < > : &` |
| Failure | Invalid → error `'desc is not valid'` (400) |
| DB write | `data.desc = ret.desc = desc` |
| Side effect | Sets `needPerm = true` |

#### Field: `perm` (lines 104–117)

| Step | Detail |
|------|--------|
| Guard | `checkAdmin(1, req.user)` required → 403 if non-admin |
| Trigger | `req.body.perm === '' || req.body.perm` (processes even empty string) |
| Self-edit check | `req.user._id.equals(isValidString(req.params.uid, 'uid'))` → error `'owner can not edit self perm'` if editing own record |
| Validation | `isValidString(req.body.perm, 'perm')` — must be `0 ≤ Number(str) < 32` |
| Failure | Invalid → error `'perm is not valid'` (400) |
| DB write | `data.perm = ret.perm = perm` |
| Side effect | Sets `needPerm = true` |

#### Field: `unDay` (lines 118–128)

| Step | Detail |
|------|--------|
| Guard | `checkAdmin(1, req.user)` required → 403 if non-admin |
| Trigger | `req.body.unDay` (truthy check; note: code duplicates the condition `req.body.unDay && req.body.unDay`) |
| Validation | `isValidString(req.body.unDay, 'int')` — must be `Number(str) > 0` |
| Failure | Invalid → error `'unactive day is not valid'` (400) |
| DB write | `data.unDay = ret.unDay = unDay` |
| Side effect | Sets `needPerm = true` |

#### Field: `unHit` (lines 129–139)

| Step | Detail |
|------|--------|
| Guard | `checkAdmin(1, req.user)` required → 403 if non-admin |
| Trigger | `req.body.unHit` (truthy; same duplicate condition pattern) |
| Validation | `isValidString(req.body.unHit, 'int')` — must be `Number(str) > 0` |
| Failure | Invalid → error `'unactive hit is not valid'` (400) |
| DB write | `data.unHit = ret.unHit = unHit` |
| Side effect | Sets `needPerm = true` |

#### Fields: `newPwd` + `conPwd` (lines 140–153)

| Step | Detail |
|------|--------|
| Trigger | Both `req.body.newPwd` AND `req.body.conPwd` must be truthy |
| Validation | Each validated with `isValidString(val, 'passwd')` — 6–20 chars, alphanumeric + `!@#$%` |
| Match check | `newPwd !== conPwd` → error `'confirm password must equal!!!'` (400) |
| DB write | `data.password = MD5(newPwd)` |
| Note | Does NOT set `needPerm`; any user can change their own password |

### Target User Resolution (lines 154–165)

| Condition | Behaviour |
|-----------|-----------|
| Admin | `id = isValidString(req.params.uid, 'uid')` — must be valid 24-hex ObjectId. Invalid → error `'uid is not valid'` |
| Non-admin + `needPerm` is `true` | Error `'unknown type in edituser'` (403) — non-admin tried to set admin-only fields |
| Non-admin + `needPerm` is `false` | `id = req.user._id` (edits own record) |

#### Field: `name` (lines 166–196) — processed last, triggers async DB lookup

| Step | Detail |
|------|--------|
| Validation | `isValidString(req.body.name, 'name')` — 1–500 chars, no special chars, not `.` or `..` |
| Default tag check | `isDefaultTag(normalize(name))` → if truthy, error `'name is not valid'` (400) |
| Uniqueness | `Mongo('find', USERDB, {username: name})` — if exists → error `'already has one!!!'` (400) |
| DB write | `data.username = name`, then `Mongo('update', USERDB, {_id: id}, {$set: data})` |
| Owner flag | If `req.user._id.equals(id)` (editing self) → `ret.owner = name` added to response |
| Response | Returns `ret` object |

#### No `name` field — fallback path (lines 189–196)

| Condition | Behaviour |
|-----------|-----------|
| `data` is empty (no fields set) | Error `'nothing to change!!!'` (400) |
| `data` has fields, `ret` is empty | `Mongo('update', ...)` then responds `{ apiOK: true }` |
| `data` has fields, `ret` has fields | `Mongo('update', ...)` then responds with `ret` object |

### Side Effects (DB Writes)

- `Mongo('update', USERDB, {_id: id}, {$set: data})` — updates any combination of: `auto`, `kindle`, `desc`, `perm`, `unDay`, `unHit`, `password`, `username`.

### Error Summary

| Error Message | Code | Trigger |
|---------------|------|---------|
| `'passwd is not valid'` | 400 | `userPW` fails passwd validation |
| `'permission denied'` | 400 | `userPWCheck` fails |
| `'unknown type in edituser'` | 403 | Non-admin sets auto/desc/perm/unDay/unHit, or non-admin with needPerm=true |
| `'auto is not valid'` | 400 | URL validation or /folders/ regex fails |
| `'kindle is not valid'` | 400 | Email validation or @kindle.com regex fails |
| `'desc is not valid'` | 400 | desc validation fails |
| `'owner can not edit self perm'` | 400 | Admin tries to change own perm |
| `'perm is not valid'` | 400 | perm validation fails |
| `'unactive day is not valid'` | 400 | unDay int validation fails |
| `'unactive hit is not valid'` | 400 | unHit int validation fails |
| `'new passwd is not valid'` | 400 | newPwd validation fails |
| `'con passwd is not valid'` | 400 | conPwd validation fails |
| `'confirm password must equal!!!'` | 400 | newPwd ≠ conPwd |
| `'uid is not valid'` | 400 | Admin, uid param invalid |
| `'name is not valid'` | 400 | Name validation fails or is a default tag |
| `'already has one!!!'` | 400 | Username already exists |
| `'nothing to change!!!'` | 400 | No fields provided (and no name) |

### Test Scenarios

| # | Scenario | Preconditions | Expected Result |
|---|----------|---------------|-----------------|
| 1 | Missing/invalid userPW | `req.body.userPW` is non-empty but < 6 chars | 400: 'passwd is not valid' |
| 2 | userPWCheck fails (wrong password, no cache) | Incorrect password, no cached session | 400: 'permission denied' |
| 3 | userPWCheck succeeds via cache | Wrong password but within 70 s of prior success | 200: proceeds normally |
| 4 | Non-admin sets `auto` | Regular user, body has `auto` | 403: 'unknown type in edituser' |
| 5 | Admin sets valid `auto` | Admin, URL with /folders/{id} | 200: ret.auto = full URL |
| 6 | Admin sets `auto` without /folders/ | Admin, URL missing folders path | 400: 'auto is not valid' |
| 7 | Admin sets `auto` with invalid URL format | Admin, body.auto fails 'url' validation | 400: 'auto is not valid' |
| 8 | Any user sets valid `kindle` | body.kindle = 'user@kindle.com' | 200: ret.kindle = lowered |
| 9 | `kindle` not @kindle.com | body.kindle = 'user@gmail.com' | 400: 'kindle is not valid' |
| 10 | `kindle` fails email validation | body.kindle has invalid chars | 400: 'kindle is not valid' |
| 11 | Non-admin sets `desc` | Regular user | 403: 'unknown type in edituser' |
| 12 | Admin sets valid `desc` | Admin, valid desc string | 200: ret.desc = desc |
| 13 | Admin sets empty string `desc` | Admin, body.desc = '' | Trigger fires (`desc === ''`); depends on isValidString('', 'desc') return |
| 14 | Admin sets `desc` with forbidden chars | Admin, desc contains `<` or `>` | 400: 'desc is not valid' |
| 15 | Non-admin sets `perm` | Regular user | 403: 'unknown type in edituser' |
| 16 | Admin edits own `perm` | Admin, uid = own _id | 400: 'owner can not edit self perm' |
| 17 | Admin sets valid `perm` on other user | Admin, perm=2, uid ≠ own | 200: ret.perm = 2 |
| 18 | Admin sets `perm` ≥ 32 | Admin, perm=32 | 400: 'perm is not valid' |
| 19 | Admin sets `unDay` with valid int | Admin, unDay=10 | 200: ret.unDay = 10 |
| 20 | Admin sets `unDay` ≤ 0 | Admin, unDay=0 | Not triggered (falsy); field ignored |
| 21 | Admin sets `unHit` with valid int | Admin, unHit=20 | 200: ret.unHit = 20 |
| 22 | Non-admin sets `unDay` | Regular user | 403: 'unknown type in edituser' |
| 23 | Valid password change | newPwd=conPwd, both 6–20 chars | 200: data.password = MD5 hash |
| 24 | Password mismatch | newPwd ≠ conPwd | 400: 'confirm password must equal!!!' |
| 25 | newPwd invalid (too short) | newPwd = 'abc' | 400: 'new passwd is not valid' |
| 26 | conPwd invalid | conPwd has forbidden chars | 400: 'con passwd is not valid' |
| 27 | Only newPwd provided (no conPwd) | body.newPwd set, body.conPwd missing | Password block skipped entirely |
| 28 | Admin with invalid uid param | Admin, uid = 'xyz' | 400: 'uid is not valid' |
| 29 | Non-admin with needPerm fields | Regular user sends desc + kindle | 403 at needPerm guard |
| 30 | Valid name change, unique | name = 'NewName', not in DB | 200: ret.name = 'NewName', DB updated |
| 31 | Name is a default tag | name normalizes to a reserved tag | 400: 'name is not valid' |
| 32 | Name already exists in DB | Another user has that username | 400: 'already has one!!!' |
| 33 | Name change on self (admin) | Admin edits own record with new name | 200: ret.owner = name included |
| 34 | Name change on other user (admin) | Admin edits another user's name | 200: no ret.owner field |
| 35 | No fields provided, no name | body is empty (except userPW) | 400: 'nothing to change!!!' |
| 36 | Non-name fields only, ret is empty | e.g. password-only change | 200: `{ apiOK: true }` |
| 37 | Multiple fields at once | Admin sets auto + desc + perm + name | 200: all reflected in ret; single $set update |
| 38 | Unauthenticated request | No session | 401 (middleware) |

---

## POST /api/user/act

**Purpose:** Create a new user.

**Auth:** Login required. Admin only (`checkAdmin(1, req.user)`). `userPW` validated via `userPWCheck`.

### Flow

1. **Admin check** (line 199): Non-admin → error `'unknown type in edituser'` (403).
2. **userPW validation** (lines 202–211): Same as PUT — validate passwd format, then `userPWCheck`. Failures → 400.
3. **Name validation** (lines 212–215):
   - `isValidString(req.body.name, 'name')` — must return truthy.
   - `isDefaultTag(normalize(name))` — must be falsy.
   - Either failure → error `'name is not valid'` (400).
4. **Uniqueness check** (lines 216–226): Query `USERDB` for `{username: name}`. If found → error `'already has one!!!'` (400).
5. **Password validation** (lines 227–237):
   - `isValidString(req.body.newPwd, 'passwd')` → error `'new passwd is not valid'` if false.
   - `isValidString(req.body.conPwd, 'passwd')` → error `'con passwd is not valid'` if false.
   - `newPwd !== conPwd` → error `'password must equal!!!'`.
6. **Desc validation** (lines 238–241): `isValidString(req.body.desc, 'desc')` → error `'desc is not valid'` if false.
7. **Perm validation** (lines 242–245): `isValidString(req.body.perm, 'perm')` → error `'perm is not valid'` if false.
8. **Insert** (lines 246–251):
   ```
   Mongo('insert', USERDB, { username, desc, perm, password: MD5(newPwd) })
   ```

### Response

Returns the new user object:

| Field | Value |
|-------|-------|
| `name` | `user[0].username` |
| `perm` | `user[0].perm` |
| `desc` | `user[0].desc` |
| `id` | `user[0]._id` |
| `newable` | `false` |
| `auto` | `''` |
| `editAuto` | `true` |
| `kindle` | `''` |
| `editKindle` | `true` |

**Conditional fields (perm-based):**

| Condition | Extra fields |
|-----------|-------------|
| `user[0].perm === 1` | `unDay` (from DB or default 5), `unHit` (from DB or default 10) |
| `user[0].perm !== 1` | `delable: true` |

### Side Effects

- Inserts one document into `USERDB` collection with fields: `username`, `desc`, `perm`, `password` (MD5 hash).

### Error Summary

| Error Message | Code | Trigger |
|---------------|------|---------|
| `'unknown type in edituser'` | 403 | Non-admin caller |
| `'passwd is not valid'` | 400 | Invalid userPW format |
| `'permission denied'` | 400 | userPWCheck fails |
| `'name is not valid'` | 400 | Name validation fails or is default tag |
| `'already has one!!!'` | 400 | Duplicate username |
| `'new passwd is not valid'` | 400 | newPwd validation fails |
| `'con passwd is not valid'` | 400 | conPwd validation fails |
| `'password must equal!!!'` | 400 | Passwords don't match |
| `'desc is not valid'` | 400 | desc validation fails |
| `'perm is not valid'` | 400 | perm validation fails |

### Test Scenarios

| # | Scenario | Preconditions | Expected Result |
|---|----------|---------------|-----------------|
| 1 | Non-admin attempts create | Regular user | 403: 'unknown type in edituser' |
| 2 | Admin, invalid userPW format | userPW < 6 chars | 400: 'passwd is not valid' |
| 3 | Admin, wrong password (no cache) | Incorrect password | 400: 'permission denied' |
| 4 | Admin, password cached (within 70 s) | Recent successful auth | Proceeds past PW check |
| 5 | Invalid name format | Name with forbidden chars | 400: 'name is not valid' |
| 6 | Name is a default tag | Name normalizes to reserved tag | 400: 'name is not valid' |
| 7 | Duplicate username | Username already in DB | 400: 'already has one!!!' |
| 8 | Invalid newPwd format | newPwd too short or bad chars | 400: 'new passwd is not valid' |
| 9 | Invalid conPwd format | conPwd invalid | 400: 'con passwd is not valid' |
| 10 | Password mismatch | newPwd ≠ conPwd | 400: 'password must equal!!!' |
| 11 | Invalid desc | desc has forbidden chars | 400: 'desc is not valid' |
| 12 | Invalid perm | perm ≥ 32 or negative | 400: 'perm is not valid' |
| 13 | Successful create, perm=1 | All valid, perm=1 | 200: response includes unDay=5, unHit=10, no delable |
| 14 | Successful create, perm=2 | All valid, perm=2 | 200: response includes delable:true, no unDay/unHit |
| 15 | Successful create, perm=0 | All valid, perm=0 | isValidString('0','perm') returns 0 which is falsy → 400: 'perm is not valid' |
| 16 | Unauthenticated | No session | 401 (middleware) |

---

## PUT /api/user/del/:uid

**Purpose:** Delete a user.

**Auth:** Login required. Admin only. `userPW` validated via `userPWCheck`.

### Flow

1. **Admin check** (line 270): Non-admin → error `'unknown type in edituser'` (403).
2. **userPW validation** (lines 273–281): Validate format, then `userPWCheck`. Failures → 400.
3. **UID validation** (lines 283–286): `isValidString(req.params.uid, 'uid')` — must be valid 24-hex ObjectId. Invalid → error `'uid is not valid'` (400).
4. **Find user** (line 287): `Mongo('find', USERDB, {_id: id}, {limit: 1})`. Not found → error `'user does not exist!!!'` (400).
5. **Owner protection** (line 291): `checkAdmin(1, users[0])` — if the target user has `perm === 1` (is owner) → error `'owner cannot be deleted!!!'` (400).
6. **Delete** (line 294): `Mongo('deleteMany', USERDB, {_id: id})`.

### Response

```json
{ "apiOK": true }
```

### Side Effects

- Deletes document(s) from `USERDB` matching `{_id: id}` via `deleteMany`.

### Error Summary

| Error Message | Code | Trigger |
|---------------|------|---------|
| `'unknown type in edituser'` | 403 | Non-admin caller |
| `'passwd is not valid'` | 400 | Invalid userPW format |
| `'permission denied'` | 400 | userPWCheck fails |
| `'uid is not valid'` | 400 | Invalid uid parameter |
| `'user does not exist!!!'` | 400 | User not found in DB |
| `'owner cannot be deleted!!!'` | 400 | Target user has perm=1 |

### Test Scenarios

| # | Scenario | Preconditions | Expected Result |
|---|----------|---------------|-----------------|
| 1 | Non-admin attempts delete | Regular user | 403: 'unknown type in edituser' |
| 2 | Admin, invalid userPW | Bad format | 400: 'passwd is not valid' |
| 3 | Admin, wrong password | No cache | 400: 'permission denied' |
| 4 | Admin, invalid uid param | uid = 'abc' | 400: 'uid is not valid' |
| 5 | Admin, user not found | Valid uid but no matching doc | 400: 'user does not exist!!!' |
| 6 | Admin, target is owner (perm=1) | Target user.perm = 1 | 400: 'owner cannot be deleted!!!' |
| 7 | Admin, target is regular user | Target user.perm > 1 or perm = 0 | 200: `{ apiOK: true }`, user deleted |
| 8 | Admin, cached password (within 70 s) | Recent auth success | Proceeds past PW check |
| 9 | Unauthenticated | No session | 401 (middleware) |

---

## GET /api/user/verify

**Purpose:** Get or generate a 4-digit verification code for the current user.

**Auth:** Login required. No admin requirement — available to all authenticated users.

### Flow

1. **Cleanup expired codes** (line 300):
   ```
   Mongo('deleteMany', VERIFYDB, { utime: { $lt: Math.round(Date.now() / 1000) - 185 } })
   ```
   Deletes all verification codes older than **185 seconds** (~3 minutes 5 seconds).

2. **Find existing code** (line 300): `Mongo('find', VERIFYDB, {uid: req.user._id}, {limit: 1})`
   - If found → responds with `{ verify: item[0].verify }`.

3. **Generate new code** (lines 300–306): If no existing code found:
   ```javascript
   Mongo('insert', VERIFYDB, {
       verify: completeZero(Math.floor(Math.random() * 10000), 4),
       uid: req.user._id,
       utime: Math.round(new Date().getTime() / 1000),
   })
   ```
   - Code: `completeZero(Math.floor(Math.random() * 10000), 4)` — random integer 0–9999, left-padded to 4 digits (e.g., `'0042'`, `'7391'`).
   - Stored with `uid` (current user ID) and `utime` (current Unix timestamp in seconds).

### Response

```json
{ "verify": "0042" }
```

The `verify` value is a 4-character zero-padded string representing a number from `"0000"` to `"9999"`.

### Side Effects

- **Deletes** expired verification codes (utime older than 185 s) from `VERIFYDB`.
- **Inserts** a new verification document into `VERIFYDB` if none exists for the user.

### Error Handling

| Condition | Error | Code |
|-----------|-------|------|
| DB/promise error | Passed to `next` via `handleError` | 400 |

### Test Scenarios

| # | Scenario | Preconditions | Expected Result |
|---|----------|---------------|-----------------|
| 1 | No existing code, no expired codes | VERIFYDB empty for user | Expired cleanup is no-op; new code generated & inserted; 200 with 4-digit code |
| 2 | Existing valid code for user | VERIFYDB has code with utime < 185 s ago | Returns existing code, no insert |
| 3 | Expired code exists for user | VERIFYDB has code with utime > 185 s ago | Expired code deleted, new code generated |
| 4 | Expired codes from other users | VERIFYDB has old codes from different uids | All expired codes deleted regardless of uid |
| 5 | Code generation produces 0 | `Math.random() * 10000` → 0 | `completeZero(0, 4)` → `'0000'` |
| 6 | Code generation produces 9999 | `Math.random() * 10000` → 9999.x | `completeZero(9999, 4)` → `'9999'` |
| 7 | Code generation produces small number | `Math.random() * 10000` → 7 | `completeZero(7, 4)` → `'0007'` |
| 8 | Multiple rapid calls (same user) | First call generates code; second call within 185 s | Second call returns same code (existing found) |
| 9 | Unauthenticated | No session | 401 (middleware) |
| 10 | DB error during deleteMany | DB connection issue | Error passed to next handler |
# Section 5: password-router.js (Password Manager)

## Overview

Express router handling all password-manager CRUD operations, tag management, password retrieval/generation, and real-time WebSocket notifications. Mounted under the `/password` prefix. Uses `PASSWORDDB` constant to instantiate a dedicated `TagTool` instance (`PasswordTagTool`) and imports `PasswordTool` for row-level and cryptographic operations.

**Imports:**
- `PASSWORDDB` — database identifier constant
- `Express` — router factory
- `TagTool` — tag-based query/mutation builder (instantiated as `PasswordTagTool` with `PASSWORDDB`)
- `PasswordTool` — row CRUD, password encryption/decryption, generation
- `checkLogin` — session authentication guard
- `handleError` — unified error-to-next propagator
- `getPasswordItem` — transforms raw DB items into client-safe password item objects
- `sendWs` — broadcasts WebSocket messages to connected clients

---

## Middleware

### `router.use(checkLogin)`

- **Applied to:** Every route in the router (lines 11-13).
- **Behavior:** Calls `checkLogin(req, res, next)`. If the user is not authenticated, the request is rejected before reaching any handler.
- **Dependency:** Expects `req.user` and `req.session` to be populated by upstream session middleware.

#### Test Scenarios

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 1 | Request with no session/cookie | `checkLogin` rejects; no handler executes |
| 2 | Request with expired session | `checkLogin` rejects |
| 3 | Request with valid session | `next()` called; handler executes |
| 4 | `req.user` is populated after checkLogin passes | Downstream handlers have access to `req.user` |
| 5 | `req.session` is populated after checkLogin passes | Downstream handlers have access to `req.session` |

---

## Endpoints

---

### GET `/password/get/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\d+)/:name?/:exactly(true|false)?/:index(\d+)?`

**Purpose:** Paginated, sorted, optionally filtered list of password items.

**Route Parameters:**

| Param | Constraint | Required | Description |
|-------|-----------|----------|-------------|
| `sortName` | `name \| mtime \| count` | Yes | Field to sort by |
| `sortType` | `desc \| asc` | Yes | Sort direction |
| `page` | `\d+` (digits) | Yes | Page number (cast to `Number`) |
| `name` | any string | No | Tag/search name filter |
| `exactly` | `true \| false` | No | Exact-match flag (parsed to boolean; defaults to `false` when absent) |
| `index` | `\d+` (digits) | No | Numeric index (cast to `Number`; `NaN` when absent) |

**Logic (lines 15-23):**
1. Logs `'password'` to console.
2. Calls `PasswordTagTool.tagQuery(page, name, exactly, index, sortName, sortType, user, session)`.
3. On success, responds with JSON:
   ```json
   {
     "itemList": "<getPasswordItem(user, result.items)>",
     "parentList": "<result.parentList>",
     "latest": "<result.latest>",
     "bookmarkID": "<result.bookmark>"
   }
   ```
4. On failure, calls `handleError(err, next)`.

**Key detail:** The `exactly` param is coerced via strict `=== 'true'` comparison, so any value other than the literal string `"true"` (including `undefined` when omitted) yields `false`.

**Key detail:** When `index` is omitted, `Number(undefined)` produces `NaN`, which is passed through to `tagQuery`.

#### Test Scenarios

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 1 | Unauthenticated request | Blocked by `checkLogin` |
| 2 | Valid params: `sortName=name`, `sortType=asc`, `page=0` | Returns JSON with `itemList`, `parentList`, `latest`, `bookmarkID` |
| 3 | Invalid `sortName` (e.g., `"invalid"`) | Express route regex does not match → 404 |
| 4 | Invalid `sortType` (e.g., `"random"`) | Express route regex does not match → 404 |
| 5 | Non-numeric `page` (e.g., `"abc"`) | Express route regex does not match → 404 |
| 6 | `page=0` (first page) | `tagQuery` called with `0` |
| 7 | Large `page` value beyond data range | `tagQuery` returns empty items; `getPasswordItem` returns empty array |
| 8 | `name` omitted | `req.params.name` is `undefined`; passed as-is to `tagQuery` |
| 9 | `name` provided (e.g., `"myTag"`) | `tagQuery` filters by name |
| 10 | `exactly=true` | `tagQuery` receives `true` for exact matching |
| 11 | `exactly=false` | `tagQuery` receives `false` |
| 12 | `exactly` omitted | Evaluates to `false` (undefined !== 'true') |
| 13 | `index` provided (e.g., `5`) | Passed as `Number(5)` to `tagQuery` |
| 14 | `index` omitted | `Number(undefined)` → `NaN` passed to `tagQuery` |
| 15 | `tagQuery` rejects with error | `handleError` called; error forwarded to Express error handler |
| 16 | `getPasswordItem` returns transformed items | `itemList` contains processed password items (e.g., sensitive fields masked) |
| 17 | `result.items` is empty array | `getPasswordItem` returns empty array; `itemList` is `[]` |
| 18 | `result.bookmark` is null/undefined | `bookmarkID` is null/undefined in response |

---

### GET `/password/getSingle/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\d+)/:name?/:exactly(true|false)?/:index(\d+)?`

**Purpose:** Single-item query with optional search-state reset. Same parameter signature as `/get`.

**Logic (lines 25-37):**
1. Logs `'password get single'`.
2. Parses `page` to `Number`.
3. **Reset condition:** If `page === 0` AND `req.params.name` is truthy, calls `PasswordTagTool.searchTags(session).resetArray()` to clear the accumulated search-tag state before querying.
4. Calls `PasswordTagTool.tagQuery(...)` with identical arguments to `/get`.
5. Returns same JSON shape as `/get`.

**Key detail:** The reset only fires on the combination of `page === 0` AND a non-empty `name`. Navigating to page 0 without a name does NOT reset.

#### Test Scenarios

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 1 | `page=0`, `name` provided | `resetArray()` called before `tagQuery` |
| 2 | `page=0`, `name` omitted | `resetArray()` NOT called (name is falsy) |
| 3 | `page=1`, `name` provided | `resetArray()` NOT called (page ≠ 0) |
| 4 | `page=0`, `name=""` (empty string) | `resetArray()` NOT called (empty string is falsy) |
| 5 | `page=0`, `name="validTag"` | `resetArray()` called, then `tagQuery` executes with fresh state |
| 6 | After reset, tagQuery returns fresh results | Response reflects new query without stale accumulated tags |
| 7 | `tagQuery` rejects | `handleError` called |
| 8 | `resetArray()` throws | Unhandled (no try/catch around sync call) — potential crash risk |
| 9 | Same response shape as `/get` | Verify `itemList`, `parentList`, `latest`, `bookmarkID` present |
| 10 | All sort/page/name/exactly/index edge cases from `/get` apply identically | Same behavior |

---

### GET `/password/reset/:sortName(name|mtime|count)/:sortType(desc|asc)`

**Purpose:** Reset the tag-query accumulator and return fresh base results.

**Route Parameters:**

| Param | Constraint | Required |
|-------|-----------|----------|
| `sortName` | `name \| mtime \| count` | Yes |
| `sortType` | `desc \| asc` | Yes |

**Logic (lines 39-45):**
1. Logs `'password reset'`.
2. Calls `PasswordTagTool.resetQuery(sortName, sortType, user, session)`.
3. Returns JSON:
   ```json
   {
     "itemList": "<getPasswordItem(user, result.items)>",
     "parentList": "<result.parentList>"
   }
   ```
4. **Note:** Response does NOT include `latest` or `bookmarkID` (unlike `/get`).

#### Test Scenarios

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 1 | Valid `sortName=mtime`, `sortType=desc` | `resetQuery` called; JSON with `itemList` and `parentList` returned |
| 2 | Invalid `sortName` | 404 — route not matched |
| 3 | Invalid `sortType` | 404 — route not matched |
| 4 | `resetQuery` rejects | `handleError` called |
| 5 | `result.items` is empty | `itemList` is `[]` |
| 6 | Response shape has no `latest` or `bookmarkID` | Verify these keys are absent |
| 7 | Session state is cleared after reset | Subsequent `/get` call starts from clean state |

---

### GET `/password/single/:uid`

**Purpose:** Fetch a single password entry by UID.

**Route Parameters:**

| Param | Required | Description |
|-------|----------|-------------|
| `uid` | Yes | Unique identifier of the password entry |

**Logic (lines 47-50):**
1. Logs `'password single'`.
2. Calls `PasswordTagTool.singleQuery(uid, user, session)`.
3. **Conditional response:**
   - If `result.empty` is truthy → returns `result` as-is (e.g., `{ empty: true }`).
   - Otherwise → wraps in `{ item: getPasswordItem(user, [result.item]) }` (note: wraps single item in array).

**Key detail:** `getPasswordItem` always receives an array; for single-item queries the result's `.item` is wrapped in `[result.item]`.

#### Test Scenarios

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 1 | Valid `uid` that exists | Returns `{ item: [...] }` with processed password item |
| 2 | Valid `uid` that does not exist | `result.empty` is truthy; returns raw result (e.g., `{ empty: true }`) |
| 3 | Malformed `uid` | Depends on `singleQuery` behavior; may reject or return empty |
| 4 | `singleQuery` rejects | `handleError` called |
| 5 | `getPasswordItem` wraps single item in array | Verify `item` value is an array of length 1 |
| 6 | `result.empty` is `false` (falsy) but item exists | Takes the else branch; wraps item |
| 7 | `result.empty` is `0` or `""` | Falsy — takes else branch |

---

### POST `/password/getOptionTag`

**Purpose:** Given a set of tags, return up to 5 related/suggested tags.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tags` | Array | Yes | Current tag selection |

**Logic (lines 52-62):**
1. Logs `'password option tag'`.
2. Creates empty `Set` → `optionList`.
3. **Branch:**
   - `tags.length > 0`: Calls `PasswordTagTool.getRelativeTag(tags, user, [...optionList])` (passes empty array since Set is new).
     - Takes `min(relative.length, 5)` items from result.
     - Adds each to `optionList` Set (deduplication).
     - Returns `{ relative: [...optionList] }`.
   - `tags.length === 0` (or empty): Returns `{ relative: [] }` immediately.

**Key detail:** The `optionList` Set is always empty when passed to `getRelativeTag` (it's created fresh and never pre-populated). The Set-based deduplication is only effective if `getRelativeTag` returns duplicates.

**Key detail:** Cap is `min(relative.length, 5)` — so 0–5 items are added.

#### Test Scenarios

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 1 | `tags` is non-empty array `["tag1"]` | `getRelativeTag` called; up to 5 relatives returned |
| 2 | `tags` is empty array `[]` | Returns `{ relative: [] }` immediately; `getRelativeTag` NOT called |
| 3 | `getRelativeTag` returns exactly 5 items | All 5 added to response |
| 4 | `getRelativeTag` returns more than 5 items | Only first 5 included |
| 5 | `getRelativeTag` returns fewer than 5 (e.g., 2) | Only those 2 included |
| 6 | `getRelativeTag` returns 0 items | `relative` is `[]` |
| 7 | `getRelativeTag` returns duplicates | Set deduplicates; response may have fewer than 5 |
| 8 | `tags` is `undefined` / missing from body | `req.body.tags.length` throws TypeError — unhandled |
| 9 | `tags` is not an array (e.g., string) | `.length > 0` may still be truthy; `getRelativeTag` receives non-array — undefined behavior |
| 10 | `getRelativeTag` rejects | `handleError` called |

---

### PUT `/password/addTag/:tag`

**Purpose:** Add a tag to one or more password entries, processing sequentially with a 500ms delay between each.

**Route Parameters:**

| Param | Required | Description |
|-------|----------|-------------|
| `tag` | Yes | Tag name to add |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `uids` | Array\<string\> | Yes | Array of entry UIDs to receive the tag |

**Logic (lines 64-76):**
1. Logs `'password addTag'`.
2. Defines recursive function `recur(index)`:
   - **Base case:** `index >= uids.length` → resolves with `res.json({ apiOK: true })`.
   - **Recursive case:** Calls `PasswordTagTool.addTag(uids[index], tag, user, false)`.
     - If `result.id` is truthy → `sendWs({ type: 'password', data: result.id })`.
     - Waits 500ms via `setTimeout`, then recurses with `index + 1`.
3. Kicks off with `recur(0)`.
4. `.catch(err => handleError(err, next))` on the entire chain.

**Key detail:** The 4th argument to `addTag` is hardcoded `false`.

**Key detail:** WebSocket notification is per-item, only when `result.id` exists.

**Key detail:** The 500ms delay is per-item to avoid overwhelming the database. Total time ≈ `uids.length × 500ms`.

#### Test Scenarios

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 1 | `uids` is empty array `[]` | `index(0) >= 0` is true immediately; returns `{ apiOK: true }` with no DB calls |
| 2 | `uids` has 1 element | `addTag` called once; 500ms delay; then resolves `{ apiOK: true }` |
| 3 | `uids` has many elements (e.g., 10) | `addTag` called 10 times sequentially, each 500ms apart (~5s total) |
| 4 | `result.id` is truthy for all items | `sendWs` called once per item |
| 5 | `result.id` is falsy for some items | `sendWs` skipped for those items; recursion continues |
| 6 | `result.id` is falsy for all items | No `sendWs` calls; still returns `{ apiOK: true }` |
| 7 | `addTag` rejects on first item | `handleError` called; remaining items NOT processed |
| 8 | `addTag` rejects on middle item (e.g., 3rd of 5) | First 2 processed; error caught; items 4-5 NOT processed |
| 9 | `uids` is `undefined` | `req.body.uids.length` throws TypeError — unhandled in recur definition, caught by `.catch` |
| 10 | `tag` param contains special characters | Passed directly to `addTag`; behavior depends on model validation |
| 11 | Concurrent requests with overlapping `uids` | Race condition possible; 500ms delay mitigates but does not prevent |
| 12 | Very large `uids` array (e.g., 1000) | ~500s execution; HTTP timeout likely before completion |
| 13 | `sendWs` throws | Unhandled within the `.then`; would propagate to `.catch` on chain |
| 14 | Verify 500ms delay is enforced between iterations | Each `addTag` call starts ~500ms after the previous one completes |

---

### PUT `/password/delTag/:tag`

**Purpose:** Remove a tag from one or more password entries. Identical recursive pattern to `addTag`.

**Route Parameters / Request Body:** Same as `addTag`.

**Logic (lines 78-90):**
- Identical structure to `addTag` but calls `PasswordTagTool.delTag(uids[index], tag, user, false)`.
- Same 500ms delay, same `sendWs` conditional, same `{ apiOK: true }` response.

#### Test Scenarios

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 1 | All scenarios from `addTag` apply | Same behavior, substituting `delTag` for `addTag` |
| 2 | `uids` is empty | Immediate `{ apiOK: true }` |
| 3 | 1 uid | Single `delTag` call + optional `sendWs` |
| 4 | Many uids | Sequential processing with 500ms delay each |
| 5 | Tag does not exist on an entry | `delTag` behavior (may return no `result.id`); no `sendWs` for that item |
| 6 | `delTag` rejects mid-sequence | Remaining items not processed; `handleError` called |
| 7 | Deleting last tag on an entry | `delTag` result determines if `sendWs` fires |

---

### POST `/password/newRow`

**Purpose:** Create a new password entry.

**Request Body:** Full password entry object (structure defined by `PasswordTool.newRow`).

**Logic (lines 92-101):**
1. Logs `'new password'`.
2. Calls `PasswordTool.newRow(req.body, req.user)`.
3. On success:
   - `sendWs({ type: 'password', data: result.id })` — notifies all connected clients.
   - Responds `{ id: result.id }`.
4. On failure: `handleError`.

#### Test Scenarios

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 1 | Valid body with all required fields | New row created; `sendWs` called; `{ id: "<new_id>" }` returned |
| 2 | Empty body `{}` | `newRow` behavior — likely rejects; `handleError` called |
| 3 | Body with missing required fields | `newRow` rejects |
| 4 | `newRow` resolves with `result.id` | `sendWs` always called (no conditional check on `result.id`) |
| 5 | `sendWs` is called before `res.json` | WebSocket notification may reach clients before HTTP response |
| 6 | Duplicate entry (if uniqueness enforced) | `newRow` rejects |
| 7 | `req.user` is used for ownership/encryption context | Verify user association on created row |

---

### PUT `/password/editRow/:uid`

**Purpose:** Update an existing password entry.

**Route Parameters:**

| Param | Required | Description |
|-------|----------|-------------|
| `uid` | Yes | UID of the entry to edit |

**Request Body:** Fields to update.

**Logic (lines 103-112):**
1. Logs `'edit password'`.
2. Calls `PasswordTool.editRow(uid, body, user, session)`.
3. On success:
   - `sendWs({ type: 'password', data: uid })`.
   - Responds `{ apiOK: true }`.
4. On failure: `handleError`.

**Key detail:** `editRow` receives `req.session` (unlike `newRow` which does not).

#### Test Scenarios

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 1 | Valid `uid` and body | Entry updated; `sendWs` called; `{ apiOK: true }` |
| 2 | Non-existent `uid` | `editRow` behavior — may reject or no-op |
| 3 | Empty body | `editRow` behavior — may no-op or reject |
| 4 | Body with fields that shouldn't be editable | Depends on `editRow` validation |
| 5 | `sendWs` data is the `uid` param (not a result field) | Always sends the request param uid |
| 6 | `editRow` rejects | `handleError` called |

---

### PUT `/password/delRow/:uid`

**Purpose:** Delete a password entry (requires user password verification).

**Route Parameters:**

| Param | Required | Description |
|-------|----------|-------------|
| `uid` | Yes | UID of the entry to delete |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userPW` | string | Yes | User's password for verification |

**Logic (lines 114-123):**
1. Logs `'del password'`.
2. Calls `PasswordTool.delRow(uid, body.userPW, user)`.
3. On success:
   - `sendWs({ type: 'password', data: uid })`.
   - Responds `{ apiOK: true }`.
4. On failure: `handleError`.

**Key detail:** `delRow` does NOT receive `req.session` (unlike `editRow`).

**Key detail:** Requires `body.userPW` for password verification before deletion — security gate.

#### Test Scenarios

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 1 | Valid `uid` and correct `userPW` | Entry deleted; `sendWs` called; `{ apiOK: true }` |
| 2 | Valid `uid` but wrong `userPW` | `delRow` rejects (auth failure) |
| 3 | Valid `uid` but `userPW` missing/undefined | `delRow` receives `undefined`; likely rejects |
| 4 | Non-existent `uid` | `delRow` behavior — may reject or no-op |
| 5 | `sendWs` fired after deletion | WebSocket notifies clients to remove the entry |
| 6 | `delRow` rejects | `handleError` called |

---

### PUT `/password/getPW/:uid/:type?`

**Purpose:** Decrypt and retrieve the actual password for an entry (requires user password verification).

**Route Parameters:**

| Param | Constraint | Required | Description |
|-------|-----------|----------|-------------|
| `uid` | any | Yes | UID of the password entry |
| `type` | any | No | Optional type/category identifier |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userPW` | string | Yes | User's password for decryption authorization |

**Logic (lines 125-128):**
1. Logs `'get password'`.
2. Calls `PasswordTool.getPassword(uid, body.userPW, user, session, type)`.
3. Returns `{ password: result.password }` — the decrypted password.
4. On failure: `handleError`.

**Key detail:** This is a PUT (not GET) because it requires a request body containing `userPW`.

**Key detail:** `type` is optional — passed as `undefined` when omitted.

**Key detail:** This endpoint exposes the raw decrypted password. Security depends entirely on `checkLogin` + `userPW` verification inside `getPassword`.

#### Test Scenarios

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 1 | Valid `uid`, correct `userPW`, no `type` | Returns `{ password: "<decrypted>" }` |
| 2 | Valid `uid`, correct `userPW`, with `type` | `getPassword` uses type for context; returns decrypted password |
| 3 | Wrong `userPW` | `getPassword` rejects (decryption/auth failure) |
| 4 | Missing `userPW` in body | `getPassword` receives `undefined`; rejects |
| 5 | Non-existent `uid` | `getPassword` rejects |
| 6 | `result.password` is empty string | Returns `{ password: "" }` |
| 7 | `getPassword` rejects | `handleError` called |
| 8 | Session is used in decryption | `req.session` passed; verify session-based validation |

---

### GET `/password/generate/:type(\d)`

**Purpose:** Generate a random password of the specified type.

**Route Parameters:**

| Param | Constraint | Required | Description |
|-------|-----------|----------|-------------|
| `type` | `\d` (single digit 0-9) | Yes | Password generation algorithm/complexity type |

**Logic (lines 130-133):**
1. Logs `'generate password'`.
2. Calls `PasswordTool.generatePW(Number(req.params.type))` **synchronously**.
3. Returns `{ password: "<generated>" }`.

**Key detail:** This is the only endpoint that calls a synchronous function (no `.then`/`.catch`). If `generatePW` throws, Express default error handling catches it (no explicit `handleError`).

**Key detail:** `type` is constrained to a single digit (`\d` = one character, 0-9).

#### Test Scenarios

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 1 | `type=0` | `generatePW(0)` called; returns generated password |
| 2 | `type=1` | `generatePW(1)` called; different algorithm/complexity |
| 3 | `type=9` | `generatePW(9)` — maximum single digit |
| 4 | `type=10` (two digits) | Route regex `\d` matches only single digit → 404 |
| 5 | `type=a` (non-digit) | Route regex does not match → 404 |
| 6 | `generatePW` throws synchronously | No explicit `handleError`; Express default error handler catches |
| 7 | Generated password contains special characters | Verify JSON serialization handles them |
| 8 | No authentication-bypass risk | `checkLogin` still applies to this read-only generation endpoint |
| 9 | No `userPW` required | Generation does not access stored passwords; only produces new ones |

---

## Cross-Cutting Concerns

### WebSocket Notifications (`sendWs`)

All mutating operations (`addTag`, `delTag`, `newRow`, `editRow`, `delRow`) call `sendWs` with `{ type: 'password', data: <id> }`. This enables real-time UI updates across connected clients.

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 1 | `sendWs` called with correct payload shape | `{ type: 'password', data: '<uid_or_id>' }` |
| 2 | `sendWs` throws | Error propagates to `.catch` on the promise chain (except in `addTag`/`delTag` where it's inside `.then`) |
| 3 | No WebSocket clients connected | `sendWs` executes without error (fire-and-forget) |
| 4 | Multiple mutations in rapid succession | Each sends independent WebSocket message |

### Error Handling (`handleError`)

All async endpoints use `.catch(err => handleError(err, next))` to forward errors to Express error middleware.

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 1 | Model layer throws | Error caught and forwarded via `next(err)` |
| 2 | Unexpected error type (non-Error object) | `handleError` should handle any thrown value |
| 3 | `generate` endpoint (sync) has no explicit `handleError` | Relies on Express default error handling for sync throws |

### `getPasswordItem` Transformation

Used by `/get`, `/getSingle`, `/reset`, and `/single` to transform raw items before returning.

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 1 | Called with `req.user` and items array | Returns processed items appropriate for the user |
| 2 | Empty items array | Returns empty array |
| 3 | Single item wrapped in array (in `/single`) | Returns array of length 1 |

### Recursive Loop Pattern (`addTag` / `delTag`)

Both endpoints share an identical recursive-with-delay pattern.

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 1 | 0 uids | Immediate resolution; no DB calls |
| 2 | 1 uid | One DB call + one 500ms wait |
| 3 | N uids | N DB calls, each followed by 500ms delay (total ~N×500ms + DB time) |
| 4 | Error on item K of N | Items 0..K-1 already processed (committed); items K+1..N-1 skipped |
| 5 | Partial failure leaves data inconsistent | No rollback mechanism; earlier items retain the tag change |
| 6 | HTTP client timeout before completion | Server-side recursion continues to completion (fire-and-forget after timeout) |
| 7 | `res.json` called in base case after all items | Single response sent at the very end |

---

## Summary of Routes

| Method | Path | Auth | Body | WebSocket | Response Shape |
|--------|------|------|------|-----------|---------------|
| GET | `/get/:sortName/:sortType/:page/:name?/:exactly?/:index?` | ✅ | — | — | `{ itemList, parentList, latest, bookmarkID }` |
| GET | `/getSingle/:sortName/:sortType/:page/:name?/:exactly?/:index?` | ✅ | — | — | `{ itemList, parentList, latest, bookmarkID }` |
| GET | `/reset/:sortName/:sortType` | ✅ | — | — | `{ itemList, parentList }` |
| GET | `/single/:uid` | ✅ | — | — | `{ item }` or `{ empty }` |
| POST | `/getOptionTag` | ✅ | `{ tags }` | — | `{ relative }` |
| PUT | `/addTag/:tag` | ✅ | `{ uids }` | ✅ per item | `{ apiOK: true }` |
| PUT | `/delTag/:tag` | ✅ | `{ uids }` | ✅ per item | `{ apiOK: true }` |
| POST | `/newRow` | ✅ | entry data | ✅ | `{ id }` |
| PUT | `/editRow/:uid` | ✅ | update data | ✅ | `{ apiOK: true }` |
| PUT | `/delRow/:uid` | ✅ | `{ userPW }` | ✅ | `{ apiOK: true }` |
| PUT | `/getPW/:uid/:type?` | ✅ | `{ userPW }` | — | `{ password }` |
| GET | `/generate/:type` | ✅ | — | — | `{ password }` |
# Section 6: stock-router.js (Stock Tracker)

## Overview

**File:** `src/back/controllers/stock-router.js` (248 lines)
**Router mount:** `/stock` (Express.Router)
**Database constant:** `STOCKDB`
**Tag tool instance:** `StockTagTool = TagTool(STOCKDB)` — instantiated at module scope (line 9)
**Dependencies:** `TagTool`, `StockTool`, `checkLogin`, `handleError`, `getStockItem`, `isValidString`, `HoError`, `sendWs`

### Architectural Note: checkLogin Placement

`checkLogin` middleware is mounted **at the very end of the file** (line 244–246), after all route definitions. In Express, middleware is evaluated in registration order, which means **none of the routes above it are protected by `checkLogin`**. All endpoints in this router execute without authentication enforcement from this middleware. This is an unusual and potentially intentional pattern — either the parent router applies authentication before mounting this sub-router, or these endpoints are intentionally unprotected. This is a critical area for security review.

---

## Standard Tag-Based Endpoints

These endpoints mirror the tag-management pattern used in the password router, using `StockTagTool` (a `TagTool` instance backed by `STOCKDB`).

---

### GET `/stock/get/:sortName/:sortType/:page/:name?/:exactly?/:index?`

**Line:** 11–19
**Purpose:** Paginated tag-based query of stock items.

**Route Parameters:**
| Param | Constraint | Type |
|-------|-----------|------|
| `sortName` | `name\|mtime\|count` | string (enum) |
| `sortType` | `desc\|asc` | string (enum) |
| `page` | `\\d+` | integer (cast via `Number()`) |
| `name` | optional | string |
| `exactly` | `true\|false` | string → boolean (`=== 'true'`) |
| `index` | `\\d+` | integer (cast via `Number()`) |

**Flow:**
1. Calls `StockTagTool.tagQuery(page, name, exactly, index, sortName, sortType, user, session)`
2. Transforms `result.items` through `getStockItem(user, items)`
3. Returns JSON: `{ itemList, parentList, latest, bookmarkID }`

**Response Shape:**
```json
{
  "itemList": [...],
  "parentList": [...],
  "latest": ...,
  "bookmarkID": ...
}
```

**Test Scenarios:**
- Verify all three `sortName` values (`name`, `mtime`, `count`) produce valid sorted results
- Verify both `sortType` values (`desc`, `asc`) reverse ordering correctly
- Confirm `page` is properly cast to Number — string "0" vs numeric 0
- Test with `name` omitted — should pass `undefined` to tagQuery
- Test `exactly=true` produces exact match vs `exactly=false` for partial match
- Test with `index` omitted — `Number(undefined)` yields `NaN`, verify downstream handling
- Verify `getStockItem` transforms items correctly for the given user
- Test when tagQuery resolves to an empty `items` array — expect `itemList: []`
- Confirm `latest` and `bookmarkID` (mapped from `result.bookmark`) are returned as-is
- Test with invalid `sortName` (e.g., `price`) — Express should return 404 (no route match)
- Test with non-numeric `page` — Express regex `\\d+` should reject, returning 404

---

### GET `/stock/getSingle/:sortName/:sortType/:page/:name?/:exactly?/:index?`

**Line:** 21–33
**Purpose:** Single-item tag query with conditional array reset when starting a new search (page 0 + name present).

**Route Parameters:** Same as `/get/...` above.

**Flow:**
1. Casts `page` to Number
2. **Conditional reset:** If `page === 0` AND `name` is truthy, calls `StockTagTool.searchTags(session).resetArray()` — clears the accumulated search state before beginning a new search
3. Calls `StockTagTool.tagQuery(...)` with identical parameters as `/get/...`
4. Returns same JSON shape: `{ itemList, parentList, latest, bookmarkID }`

**Key Difference from `/get`:** The `resetArray()` call on page 0 with a name — this ensures a fresh search context when the user initiates a new single-item lookup.

**Test Scenarios:**
- Test page=0 with name present — verify `resetArray()` is called before tagQuery
- Test page=0 without name — verify `resetArray()` is NOT called (name is falsy)
- Test page=1 with name present — verify `resetArray()` is NOT called (page !== 0)
- Test page=0 with name="" (empty string) — `req.params.name` for empty optional route params is `undefined`, not empty string; verify behavior
- Verify that after resetArray, the tagQuery starts from clean state
- Test rapid successive calls: page=0 with name, then page=1 — verify pagination works after reset
- Verify the response shape matches `/get` exactly

---

### GET `/stock/reset/:sortName/:sortType`

**Line:** 35–41
**Purpose:** Resets the tag query state and returns initial results.

**Route Parameters:**
| Param | Constraint |
|-------|-----------|
| `sortName` | `name\|mtime\|count` |
| `sortType` | `desc\|asc` |

**Flow:**
1. Calls `StockTagTool.resetQuery(sortName, sortType, user, session)`
2. Transforms items through `getStockItem(user, items)`
3. Returns JSON: `{ itemList, parentList }`

**Response Shape:**
```json
{
  "itemList": [...],
  "parentList": [...]
}
```

**Note:** Unlike `/get` and `/getSingle`, this response does **not** include `latest` or `bookmarkID`.

**Test Scenarios:**
- Verify response shape — only `itemList` and `parentList`, no `latest` or `bookmarkID`
- Test each sortName/sortType combination (6 total)
- Verify reset clears any prior search/filter state
- Test calling reset after a complex tag query — confirm state is clean
- Confirm `getStockItem` is applied to result items
- Test when resetQuery returns empty items — expect `itemList: []`

---

### GET `/stock/single/:uid`

**Line:** 55–58
**Purpose:** Retrieve a single stock item by UID.

**Route Parameters:**
| Param | Constraint |
|-------|-----------|
| `uid` | any string (no regex constraint) |

**Flow:**
1. Calls `StockTagTool.singleQuery(uid, user, session)`
2. If `result.empty` is truthy → returns the result object as-is (includes the `empty` flag)
3. If not empty → wraps `result.item` through `getStockItem(user, [item])` and returns `{ item: [...] }`

**Response Shapes:**
```json
// Empty result:
{ "empty": true, ... }

// Found result:
{ "item": [transformedItem] }
```

**Test Scenarios:**
- Test with valid UID — verify item is returned wrapped in array via `getStockItem`
- Test with non-existent UID — verify `result.empty` is truthy and returned as-is
- Note: Unlike `/querySimple`, `/getPER`, `/getInterval`, this does NOT use `isValidString` to validate the uid — any string is passed directly to `singleQuery`
- Test with special characters in UID — no validation means these pass through
- Verify the response wraps single item in array: `getStockItem(user, [result.item])` — the response `item` field is an array, not a single object
- Test when singleQuery rejects — error is forwarded via `handleError`

---

### POST `/stock/getOptionTag`

**Line:** 43–53
**Purpose:** Retrieves tag suggestions for autocomplete/option lists, pre-seeded with `'important'`.

**Request Body:**
```json
{
  "tags": ["tag1", "tag2"]
}
```

**Flow:**
1. Creates a `Set` pre-seeded with `'important'` — this tag is **always** present in results
2. If `req.body.tags.length > 0`:
   - Calls `StockTagTool.getRelativeTag(tags, user, [...optionList])` (passes current optionList as array)
   - Takes up to first 5 relative tags (`relative.length < 5 ? relative.length : 5`)
   - Adds each to the Set (deduplication via Set)
   - Returns `{ relative: [...optionList] }`
3. If `tags` is empty array:
   - Returns `{ relative: ['important'] }` immediately (no async call)

**Response Shape:**
```json
{
  "relative": ["important", "tag1", "tag2", ...]
}
```

**Test Scenarios:**
- **Pre-seed verification:** Confirm `'important'` is always the first element in results regardless of input
- Test with empty tags array (`[]`) — returns `{ relative: ['important'] }` synchronously
- Test with tags present — verify getRelativeTag is called with `['important']` as third arg
- Test when getRelativeTag returns fewer than 5 results (e.g., 2) — only those 2 are added
- Test when getRelativeTag returns exactly 5 results — all 5 are added
- Test when getRelativeTag returns more than 5 results (e.g., 10) — only first 5 are added
- Test when getRelativeTag returns `'important'` as one of its results — Set deduplication prevents duplicate; total count should not exceed 6 (1 seed + 5 relative)
- Test with missing `req.body.tags` — would throw on `.length` access; verify error handling
- Test with `req.body.tags` as non-array — `.length > 0` may still be truthy for strings; verify behavior
- Verify the cap logic: `reli = relative.length < 5 ? relative.length : 5` — this is `Math.min(relative.length, 5)` equivalent

---

### PUT `/stock/addTag/:tag`

**Line:** 60–72
**Purpose:** Adds a tag to one or more stock items, recursively processing each UID with a 500ms delay, sending WebSocket notifications.

**Route Parameters:**
| Param | Constraint |
|-------|-----------|
| `tag` | any string (no regex constraint) |

**Request Body:**
```json
{
  "uids": ["uid1", "uid2", "uid3"]
}
```

**Flow:**
1. Defines a recursive function `recur(index)`:
   - Base case: `index >= req.body.uids.length` → resolves with `res.json({apiOK: true})`
   - Recursive case: Calls `StockTagTool.addTag(uid, tag, user, false)`
     - If `result.id` exists → sends WebSocket message `{ type: 'stock', data: result.id }`
     - Waits 500ms via `setTimeout` in a Promise wrapper
     - Recurses to `index + 1`
2. Starts recursion at index 0
3. Catches errors at the chain level

**WebSocket Message:**
```json
{
  "type": "stock",
  "data": "<result.id>"
}
```

**Test Scenarios:**
- Test with single UID — one addTag call, one potential WS message, response `{apiOK: true}`
- Test with multiple UIDs — verify sequential processing with ~500ms gaps
- Test with empty `uids` array — `0 >= 0` is true, immediately returns `{apiOK: true}`
- Verify the 4th argument to `addTag` is always `false`
- Test when `result.id` is falsy (undefined/null/empty) — no WS message sent for that item
- Test when `result.id` is truthy — verify sendWs called with `type: 'stock'`
- Verify 500ms delay between each item — this is rate-limiting to avoid overwhelming the database
- Test error in middle of batch (e.g., UID 2 of 5 fails) — verify error propagation and that response hasn't already been sent
- Note: `res.json()` is called inside the Promise chain base case — if an error occurs after partial processing, `res.json` may not have been called yet, allowing error middleware to respond
- Test with missing `req.body.uids` — would throw on `.length`; verify error handling
- Verify tag param accepts special characters, spaces, etc. (no validation constraint)

---

### PUT `/stock/delTag/:tag`

**Line:** 74–86
**Purpose:** Deletes a tag from one or more stock items. Identical pattern to `addTag`.

**Flow:** Same recursive pattern as `/addTag/:tag` with `StockTagTool.delTag` instead of `addTag`.

**Test Scenarios:**
- All scenarios from `addTag` apply identically
- Verify `delTag` is called instead of `addTag`
- Test deleting a tag that doesn't exist on the item — verify behavior (depends on TagTool implementation)
- Test deleting the last tag from an item — verify item state after removal
- Verify same 500ms delay and `type: 'stock'` WebSocket pattern

---

## Stock-Specific Endpoints

These endpoints use `StockTool` directly for stock-specific financial data operations. All uid-accepting endpoints in this section validate with `isValidString(uid, 'uid')`.

---

### GET `/stock/querySimple/:uid`

**Line:** 88–95
**Purpose:** Retrieves simplified stock data for a single stock by UID.

**Route Parameters:**
| Param | Constraint |
|-------|-----------|
| `uid` | any string |

**Flow:**
1. Validates UID: `isValidString(req.params.uid, 'uid')` — returns sanitized `id` or falsy
2. If invalid → `handleError(new HoError('uid is not vaild'), next)` and returns
3. If valid → calls `StockTool.getSingleStockV2(id, session)`
4. Returns the result directly as JSON

**Note:** The error message contains a typo: `'uid is not vaild'` (should be "valid"). This typo is consistent across all uid-validating endpoints in this file.

**Test Scenarios:**
- Test with valid UID format — verify getSingleStockV2 is called with sanitized id
- Test with invalid UID (whatever `isValidString` rejects) — verify 'uid is not vaild' error
- Test with empty string UID — Express may not match route at all (`:uid` requires at least one char)
- Verify `session` is passed to getSingleStockV2
- Test when getSingleStockV2 rejects — error forwarded to next middleware
- Test response structure — result is returned as-is from StockTool, no transformation via getStockItem
- Contrast with `/single/:uid` which does NOT validate uid and DOES use getStockItem

---

### GET `/stock/getPER/:uid`

**Line:** 97–107
**Purpose:** Retrieves Price-to-Earnings Ratio (PER) data for a stock and updates the "latest" marker.

**Route Parameters:**
| Param | Constraint |
|-------|-----------|
| `uid` | any string |

**Flow:**
1. Validates UID via `isValidString`
2. Calls `StockTool.getStockPERV2(id)` — note: NO `session` passed (unlike querySimple and getInterval)
3. Destructures result as `[result, result2, result3, index, start]` — a 5-element array
4. **Side effect:** Calls `StockTagTool.setLatest(id, session)` — errors are caught and logged with `handleError(err, 'Set latest')` (string as second arg, not `next` — logged but not forwarded to client)
5. Returns formatted string: `{ per: "${index}: ${result} ${result2} ${result3} ${start}" }`

**Response Shape:**
```json
{
  "per": "index_value: result1 result2 result3 start_value"
}
```

**Test Scenarios:**
- Test with valid UID — verify the 5-element destructuring from getStockPERV2
- Test with invalid UID — verify validation error
- Verify `getStockPERV2(id)` receives only `id` (no session) — this differs from other StockTool calls
- Verify the formatted string composition: `${index}: ${result} ${result2} ${result3} ${start}`
- **setLatest fire-and-forget:** Verify that `setLatest` errors do NOT prevent the PER response from being sent — the error handler uses string `'Set latest'` instead of `next`
- Test when `setLatest` fails — client still receives PER data; error is only logged
- Test when `getStockPERV2` rejects — error forwarded to client via `next`
- Test response when any of the 5 destructured values is undefined/null — verify string interpolation behavior (would produce "undefined" in string)
- Verify setLatest marks this stock as recently viewed for the session

---

### GET `/stock/getInterval/:uid`

**Line:** 134–141
**Purpose:** Retrieves interval analysis data for a stock.

**Route Parameters:**
| Param | Constraint |
|-------|-----------|
| `uid` | any string |

**Flow:**
1. Validates UID via `isValidString`
2. Calls `StockTool.getIntervalWarp(id, session)` — note: receives `session` (unlike getPER)
3. Destructures result as `[result, index]` — a 2-element array
4. Returns formatted string: `{ interval: "${index}: ${result}" }`

**Response Shape:**
```json
{
  "interval": "index_value: result_value"
}
```

**Test Scenarios:**
- Test with valid UID — verify correct formatted interval string
- Test with invalid UID — verify validation error
- Verify `getIntervalWarp` receives `(id, session)` — session IS passed here
- Test when getIntervalWarp rejects — error forwarded to client
- Test destructuring: if getIntervalWarp returns array with fewer than 2 elements, `index` would be `undefined`
- Compare response format with getPER — interval uses 2-element, PER uses 5-element destructuring
- Verify no setLatest side effect (unlike getPER)

---

### GET `/stock/getTotal`

**Line:** 234–237
**Purpose:** Retrieves total stock portfolio/tracking summary for the logged-in user.

**No Route Parameters.**

**Flow:**
1. Calls `StockTool.getStockTotal(user)`
2. Returns result directly as JSON

**Test Scenarios:**
- Test with valid user — verify result is returned as-is
- Test when getStockTotal rejects — error forwarded to next
- Verify only `user` is passed (no session, no body data)
- Test response structure — entirely dependent on StockTool implementation
- Compare with updateTotal — getTotal is read-only, updateTotal modifies

---

### PUT `/stock/updateTotal/:real(1|0)?`

**Line:** 239–242
**Purpose:** Updates stock portfolio/tracking total with optional "real" mode flag.

**Route Parameters:**
| Param | Constraint | Notes |
|-------|-----------|-------|
| `real` | `1\|0` (optional) | Regex-constrained; the `?` makes the entire segment optional |

**Request Body:**
```json
{
  "info": { ... }
}
```

**Flow:**
1. Calls `StockTool.updateStockTotal(user, body.info, real === '1' ? true : false)`
   - When `real` is `'1'` → third argument is `true`
   - When `real` is `'0'` → third argument is `false`
   - When `real` is `undefined` (omitted) → `undefined === '1'` is `false`, so third argument is `false`
2. Returns result directly as JSON

**Test Scenarios:**
- Test with `real=1` — verify third arg to updateStockTotal is `true`
- Test with `real=0` — verify third arg is `false`
- Test with `real` omitted (just `/stock/updateTotal`) — verify third arg is `false` (undefined !== '1')
- Test with invalid `real` value (e.g., `2`, `true`) — Express regex `(1|0)` rejects, returns 404
- Verify `body.info` is passed directly — no validation or transformation
- Test with missing `body.info` — `undefined` passed to updateStockTotal; verify handling
- Test when updateStockTotal rejects — error forwarded to next
- Verify this is a PUT (not POST) — idempotency expectations

---

## checkLogin Middleware (Line 244–246)

```javascript
router.use(function(req, res, next) {
    checkLogin(req, res, next);
});
```

**Critical Placement Note:**

This middleware is registered **after** all route handlers. In Express, `router.use()` middleware only applies to routes registered after it, or to requests that don't match any prior route. This means:

1. **All routes defined above are NOT protected by this checkLogin** — they execute their handlers directly when matched.
2. This middleware will only execute for requests to the `/stock` prefix that **don't match any defined route** (acting as a catch-all).
3. If authentication is required for these endpoints, it must be enforced at a higher level (e.g., the parent app mounting this router).

**Test Scenarios:**
- Verify that hitting a defined route (e.g., `/stock/getTotal`) does NOT trigger checkLogin
- Verify that hitting an undefined sub-route (e.g., `/stock/nonexistent`) DOES trigger checkLogin
- Test whether parent app applies authentication middleware before this router
- Security review: Confirm all stock endpoints are intentionally accessible or protected elsewhere
- Compare with other routers (e.g., password-router) to verify if this pattern is consistent or anomalous

---

## Commented-Out Endpoints (Lines 109–232)

These endpoints are disabled but remain in the codebase. Documented for awareness and potential future re-enablement.

---

### GET `/stock/getPredictPER/:uid` (COMMENTED OUT)

**Lines:** 109–116

**Purpose:** Was intended to retrieve predicted PER values for a stock.

**Flow (if enabled):**
1. Validates UID via `isValidString`
2. Calls `StockTool.getPredictPERWarp(id, session)` — note: receives session (unlike active getPER)
3. Destructures as `[result, index]` (2-element, like getInterval)
4. Returns `{ per: "${index}: ${result}" }`

**Test Scenarios (if re-enabled):**
- Verify `getPredictPERWarp` exists on StockTool and accepts `(id, session)`
- Compare response format with active `getPER` — predict version is simpler (2-element vs 5-element)
- Note: predict version does NOT call `setLatest` (unlike active getPER)
- Verify predict version passes `session` (active getPER does not)

---

### GET `/stock/getPoint/:uid/:price?` (COMMENTED OUT)

**Lines:** 118–132

**Purpose:** Was intended to calculate stock price points.

**Flow (if enabled):**
1. Validates UID via `isValidString` — note: passes 3 args `(uid, 'uid', 'uid is not vaild')` unlike other endpoints which pass 2
2. Validates optional `price` param against regex `/\d+(\.\d+)?/` — supports integer and decimal
3. Defaults `price` to `0` if not provided
4. Calls `StockTool.getStockPoint(id, price, session)`
5. Returns `{ point }`

**Test Scenarios (if re-enabled):**
- Test with price as integer (e.g., `100`) — should match regex
- Test with price as decimal (e.g., `99.5`) — should match regex
- Test with no price — defaults to `0`
- Test with invalid price (e.g., `abc`) — regex validation should fail
- Note: regex `/\d+(\.\d+)?/` does not anchor with `^$` — would match partial strings like `abc123`; potential bug
- Compare `isValidString` call signature (3 args) with other endpoints (2 args)

---

### PUT `/stock/filter/:tag/:sortName/:sortType` (COMMENTED OUT)

**Lines:** 143–232

**Purpose:** Was intended to provide complex multi-criteria stock filtering with WebSocket progress reporting.

**Route Parameters:**
| Param | Constraint |
|-------|-----------|
| `tag` | any string (validated as 'name' via `isValidString`) |
| `sortName` | `name\|mtime\|count` |
| `sortType` | `desc\|asc` |

**Request Body Fields (all optional):**
| Field | Regex Validation | Accepts Decimal |
|-------|-----------------|-----------------|
| `per` | `/^([<>])(\d+)$/` | No (integers only) |
| `pdr` | `/^([<>])(\d+)$/` | No |
| `pbr` | `/^([<>])(\d+\.?\d*)$/` | **Yes** (decimal allowed) |
| `pre` | `/^([<>])(\d+)$/` | No |
| `interval` | `/^([<>])(\d+)$/` | No |
| `vol` | `/^([<>])(\d+)$/` | No |
| `close` | `/^([<>])(\d+)$/` | No |

**Flow (if enabled):**
1. Validates `tag` param as a name string
2. For each body field: validates against its regex, extracts operator (`<` or `>`) and numeric value
3. **Responds immediately** with `{ apiOK: true }` before starting the filter
4. Calls `StockTool.stockFilterWarp(...)` asynchronously after response
5. On completion → sends WebSocket to user: `{ type: username, data: "Filter name: number" }`
6. On failure → sends WebSocket: `{ type: username, data: "Filter fail: error" }` and logs error

**Architectural Pattern:** Response-before-completion with WebSocket notification. The client receives `apiOK` immediately and then a WS message when filtering finishes (or fails).

**Test Scenarios (if re-enabled):**
- Test each filter field with valid `<` and `>` operators: `<10`, `>50`
- Test `pbr` with decimal: `>1.5` should be accepted; other fields reject decimals
- Test filter fields with invalid format: `=10`, `<abc`, `10>` — should fail validation
- Test with no filter fields — all default to `false`; verify stockFilterWarp handles all-false criteria
- Verify response is sent BEFORE filter completes (`res.json({apiOK: true})` on line 205)
- Verify success WS message includes the filter name and result count
- Verify failure WS message includes error description
- Note: WS messages use `type: req.user.username` (user-targeted) vs addTag/delTag which use `type: 'stock'` (broadcast)
- Note: `usse` is passed as empty object `{}` — only `twse` (Taiwan Stock Exchange) filters are supported
- Verify tag is validated as 'name' type: `isValidString(req.params.tag, 'name')`

---

## Cross-Cutting Concerns

### UID Validation Inconsistency

| Endpoint | UID Validated? | Method |
|----------|---------------|--------|
| `/single/:uid` | **No** | Passed raw to `singleQuery` |
| `/querySimple/:uid` | **Yes** | `isValidString(uid, 'uid')` |
| `/getPER/:uid` | **Yes** | `isValidString(uid, 'uid')` |
| `/getInterval/:uid` | **Yes** | `isValidString(uid, 'uid')` |

The `/single/:uid` endpoint (tag-based) does not validate the UID, while all StockTool-based endpoints do. This inconsistency may be intentional (TagTool handles its own validation) or a gap.

### Session Passing Inconsistency

| Endpoint | Session Passed? |
|----------|----------------|
| `getSingleStockV2` | Yes |
| `getStockPERV2` | **No** |
| `getIntervalWarp` | Yes |
| `getStockTotal` | No (only user) |
| `updateStockTotal` | No (only user + body) |

`getStockPERV2` notably does not receive the session object, unlike the other stock query endpoints. It calls `setLatest` separately with the session.

### Error Message Typo

All uid validation errors use `'uid is not vaild'` (misspelling of "valid"). This is consistent within the file but should be noted for any error message testing or user-facing error displays.

### WebSocket Message Types

| Source Endpoint | WS `type` | Target |
|----------------|-----------|--------|
| `addTag` | `'stock'` | All clients (broadcast) |
| `delTag` | `'stock'` | All clients (broadcast) |
| `filter` (commented) | `req.user.username` | Specific user |

Active endpoints use broadcast-style `'stock'` type. The commented filter endpoint used user-targeted messaging.

### 500ms Recursive Delay Pattern

Both `addTag` and `delTag` use the same recursive pattern with 500ms delay between operations. This acts as rate-limiting to prevent database/API overload when batch-tagging. The pattern processes items sequentially (not in parallel), so a batch of N items takes at least N × 500ms.
# Section 7: storage-router.js (File Storage Browser)

## Overview

The largest feature router in the application (711 lines). Manages a file storage browser with tag-based search, weighted random discovery, external media integrations (yify, dm5), playback tracking, and torrent playlist support. All endpoints require authentication via `checkLogin` middleware applied at the router level.

**Imports & Initialisation:**
- Database: `STORAGEDB` = `'storage'`
- Tag lists: `ADULT_LIST` (23 adult tags), `GENRE_LIST_CH` (22 genre tags), `GAME_LIST_CH` (10 game tags), `MUSIC_LIST` (21 music genre tags)
- `OPTION_TAG` = `getOptionTag()` — a concatenation of `MEDIA_LIST_CH` (24 items, indices 0–23) + `GENRE_LIST_CH` (indices 24–45) + `GAME_LIST_CH` (indices 46–55 — wait, need exact) — the combined array of all tag categories used for weighted random selection
- `StorageTagTool` = `TagTool(STORAGEDB)` — tag query engine bound to storage collection

**OPTION_TAG Index Map (combined array):**

| Index Range | Source Array    | Content (examples)                                    |
|-------------|-----------------|-------------------------------------------------------|
| 0–23        | MEDIA_LIST_CH   | 0=圖片, 1=相片, 2=漫畫, 3=圖片集, 4=影片, 5=電影, 6=動畫, 7=電視劇, 8=音頻, 9=歌曲, 10=音樂, 11=有聲書, 12=文件, 13=書籍, 14=小說, 15=簡報, 16=試算表, 17=程式碼, 18=網頁, 19=網址, 20=論壇, 21=維基, 22=壓縮檔, 23=播放列表 |
| 24–45       | GENRE_LIST_CH   | 24=動作, 25=冒險, 26=動畫, 27=傳記, 28=喜劇, 29=犯罪, 30=記錄, 31=劇情, 32=家庭, 33=奇幻, 34=黑色電影, 35=歷史, 36=恐怖, 37=音樂, 38=音樂劇, 39=神祕, 40=浪漫, 41=科幻, 42=運動, 43=驚悚, 44=戰爭, 45=西部 |
| 46–55       | GAME_LIST_CH    | 46=休閒, 47=冒險, 48=動作, 49=大型多人連線, 50=模擬, 51=獨立, 52=競速, 53=策略, 54=角色扮演, 55=運動 |
| 56–76       | MUSIC_LIST      | 56=avant-garde, 57=blues, 58=children's, 59=classical, …, 76=vocal |
| 77–99       | ADULT_LIST      | 77=ol, 78=中出, 79=同人誌, …, 99=魔物 |

> Note: Code references like `choose === 0` through `choose > 72` map to indices into this combined OPTION_TAG array.

---

## Endpoint 1: GET `/storage/reset/:sortName/:sortType`

**Route pattern:** `/reset/:sortName(name|mtime|count)/:sortType(desc|asc)`

**Purpose:** Reset the tag query session and return initial unfiltered storage items.

**Parameters:**

| Parameter  | Location | Validation              | Description              |
|------------|----------|-------------------------|--------------------------|
| sortName   | path     | enum: name, mtime, count | Sort field               |
| sortType   | path     | enum: desc, asc          | Sort direction           |

**Flow:**
1. Calls `StorageTagTool.resetQuery(sortName, sortType, user, session)`
2. Transforms `result.items` via `getStorageItem(user, items)`
3. Returns `{ itemList, parentList }`

**Response:**
```json
{
  "itemList": [ /* transformed storage items */ ],
  "parentList": [ /* parent tag breadcrumbs */ ]
}
```

**Error paths:**
- `resetQuery` rejects → `handleError(err, next)` → Express error middleware

**Test Scenarios:**

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Valid reset name/desc | GET /storage/reset/name/desc | 200, itemList + parentList |
| 2 | Valid reset mtime/asc | GET /storage/reset/mtime/asc | 200, itemList + parentList |
| 3 | Valid reset count/desc | GET /storage/reset/count/desc | 200, itemList + parentList |
| 4 | Invalid sortName | GET /storage/reset/invalid/desc | 404 (route not matched) |
| 5 | Invalid sortType | GET /storage/reset/name/xyz | 404 (route not matched) |
| 6 | Unauthenticated | No session | checkLogin blocks → redirect/401 |
| 7 | DB error during resetQuery | DB failure | handleError → 500 |

---

## Endpoint 2: GET `/storage/get/:sortName/:sortType/:page/:name?/:exactly?/:index?`

**Route pattern:** `/get/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?`

**Purpose:** Paginated tag-based search of storage items. The primary search endpoint.

**Parameters:**

| Parameter | Location | Validation            | Required | Description                       |
|-----------|----------|-----------------------|----------|-----------------------------------|
| sortName  | path     | enum: name,mtime,count | yes      | Sort field                        |
| sortType  | path     | enum: desc, asc       | yes      | Sort direction                    |
| page      | path     | digits (\\d+)         | yes      | Page number (0-based)             |
| name      | path     | optional string       | no       | Tag search term                   |
| exactly   | path     | 'true' or 'false'     | no       | Exact match flag                  |
| index     | path     | digits (\\d+)         | no       | Index offset (cast to Number)     |

**Flow:**
1. Calls `StorageTagTool.tagQuery(page, name, exactly===true, index, sortName, sortType, user, session)`
2. Transforms items via `getStorageItem(user, result.items, result.mediaHadle)`
3. Returns full response with `itemList`, `parentList`, `latest`, `bookmarkID`

**Response:**
```json
{
  "itemList": [ /* storage items with mediaHadle applied */ ],
  "parentList": [ /* breadcrumb tags */ ],
  "latest": /* latest item info */,
  "bookmarkID": /* bookmark reference */
}
```

**Key difference from reset:** Includes `mediaHadle` transformation, `latest`, and `bookmarkID` fields.

**Error paths:**
- `tagQuery` promise rejection → `handleError(err, next)`

**Test Scenarios:**

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Basic page 0 search | GET /storage/get/name/desc/0 | 200, first page results |
| 2 | Named tag search | GET /storage/get/name/desc/0/action | 200, filtered results |
| 3 | Exact match true | GET /storage/get/name/desc/0/tag/true | 200, exact matches only |
| 4 | Exact match false | GET /storage/get/name/desc/0/tag/false | 200, partial matches |
| 5 | With index offset | GET /storage/get/name/desc/0/tag/true/5 | 200, results from index 5 |
| 6 | Page 2 pagination | GET /storage/get/name/asc/2 | 200, third page |
| 7 | Non-numeric page | GET /storage/get/name/desc/abc | 404 (route not matched) |
| 8 | mediaHadle applied | Valid query with media | itemList includes handle transforms |
| 9 | DB error | Mongo failure | handleError → 500 |

---

## Endpoint 3: GET `/storage/getSingle/:sortName/:sortType/:page/:name?/:exactly?/:index?`

**Route pattern:** `/getSingle/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)/:name?/:exactly(true|false)?/:index(\\d+)?`

**Purpose:** Similar to `/get` but with a special reset behavior: if `page === 0` AND `name` is provided, the session search array is reset before querying.

**Parameters:** Same as `/get`.

**Flow:**
1. If `page === 0 && name` exists → `StorageTagTool.searchTags(session).resetArray()`
2. Then proceeds identically to `/get` → `tagQuery` → `getStorageItem` → response

**Key difference from `/get`:** The conditional `resetArray()` call on page 0 with a name clears previous search state, making this suitable for starting a fresh single-item search context.

**Response:** Same structure as `/get`.

**Test Scenarios:**

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Page 0 with name → resets | GET /storage/getSingle/name/desc/0/mytag | 200, search array reset, fresh results |
| 2 | Page 0 without name → no reset | GET /storage/getSingle/name/desc/0 | 200, no resetArray called |
| 3 | Page > 0 with name → no reset | GET /storage/getSingle/name/desc/1/mytag | 200, no resetArray called |
| 4 | Page > 0 without name | GET /storage/getSingle/name/desc/2 | 200, normal pagination |
| 5 | Exact flag handling | Both true/false | Same as /get behavior |

---

## Endpoint 4: GET `/storage/getRandom/:sortName/:sortType/:page`

**Route pattern:** `/getRandom/:sortName(name|mtime|count)/:sortType(desc|asc)/:page(\\d+)`

**Purpose:** Weighted random content discovery. Uses per-user tag interaction history stored in Redis to bias selection toward preferred content types.

**Parameters:**

| Parameter | Location | Validation              | Required | Description         |
|-----------|----------|-------------------------|----------|---------------------|
| sortName  | path     | enum: name,mtime,count  | yes      | Sort field          |
| sortType  | path     | enum: desc, asc         | yes      | Sort direction      |
| page      | path     | digits (\\d+)           | yes      | Page number         |

### Algorithm Deep-Dive

#### Phase 1: Weight Collection
1. `Redis('hgetall', 'tag: {userId}')` → retrieves all tag interaction counts for user
2. Maps each OPTION_TAG entry to a weight: `base(1) + stored_count` for matching tags
3. Produces `count_list` array parallel to OPTION_TAG

#### Phase 2: Weighted Random Selection (`selectRandom`)
- `selectRandom(count)` → builds cumulative sum array, picks random value in range `[0, total_weight)`, returns first index whose cumulative sum ≥ random value
- Higher interaction count → higher weight → more likely to be selected
- `selectRandom(count, subset_array)` → restricts selection to specific OPTION_TAG indices

#### Phase 3: Giant Switch on `choose` Value

The `choose` value (an index into OPTION_TAG) determines which content category was selected, then builds a `random_tag` array of search terms:

| choose value | Media Category | random_tag construction |
|--------------|---------------|------------------------|
| 0 (圖片) | Picture (generic) | `[圖片, random_sub_pic_type(1,2), random_genre(24-43)]` |
| 1–2 (相片/漫畫) | Pic subtypes | `[圖片, chosen_type, random_genre]` — prepends 圖片 |
| 3 (圖片集) | Picture book | `[圖片, 圖片集, random_sub_pic(1,2), random_genre]` |
| 4 (影片) | Video (generic) | `[影片, random_video_type(5,6,7), random_genre]` |
| 5,7 (電影/電視劇) | Video subtypes | `[影片, chosen_type, random_genre]` — prepends 影片 |
| 6 (動畫) | Animation | Special: if sub-select=6(動畫), add genre; if 5 or 7, prepend that + 影片 |
| 8 (音頻) | Audio (generic) | `[音頻, random_audio_type(9,10,11), random_music_genre(51-71)]` |
| 9,11 (歌曲/有聲書) | Audio subtypes | `[音頻, chosen_type, random_music_genre]` |
| 10 (音樂) | Music | Special: may switch to video(4) or audio(8) parent; if video → add video subtype + genre; if audio → add music_genre |
| 12 (文件) | Document (generic) | `[文件, random_doc_type(13,14,17,18), random_genre]` |
| 13–14, 17–18 | Doc subtypes | `[文件, chosen_type, random_genre]` |
| 15 (簡報) | Presentation | Just `[簡報]` — no additional tags |
| 16 (試算表) | Spreadsheet | Just `[試算表]` — no additional tags |
| 19 (網址) | URL | `[網址, random_url_type(20,21)]` |
| 20–21 (論壇/維基) | URL subtypes | `[網址, chosen_type]` |
| 22 (壓縮檔) | ZIP | `[壓縮檔, 播放列表]` |
| 23 (播放列表) | Playlist | `[壓縮檔, 播放列表]` — reversed |
| 24, 25, 40 (動作/冒險/浪漫 genre) | Genre with game crossover | Uses `game_genre` indices; if result > 23 → prepends '遊戲'; else maps to media type |
| 24–43 (other genres) | General genre | Selects random media type (0=pic,4=video,12=doc), adds appropriate subtype |
| 44–50 (game categories) | Game genres | Prepends '遊戲' |
| 51–71 (music genres) | Music genres | `[音頻, random_audio_subtype(9,10,11), chosen_genre]` |
| ≥72 (adult tags) | Adult content | Prepends '18+' |

**Named constant arrays used in switch:**
- `genre` = indices `[24–43]` (GENRE_LIST_CH positions)
- `music_genre` = indices `[51–71]` (MUSIC_LIST positions)
- `game_genre` = indices `[0, 4, 12, 24, 25, 42, 44, 45, 46, 47, 48, 49, 50]` (mixed media+game)

#### Phase 4: Post-Processing / External Source Substitution

After the switch, additional probabilistic overrides may replace the random_tag:

| Condition | Probability | Override |
|-----------|-------------|---------|
| random_tag[0]==='影片' && [1]==='電影' | ~1/14 (selectRandom([11,1,1,1]), index 3) | `['yify movie', 'no local', last_genre]` |
| random_tag[0]==='影片' && [1]==='動畫' | ~1/11 (selectRandom([9,1,1]), index 1 or 2) | Reserved for future use |
| random_tag[0]==='影片' && [1]==='電視劇' | selectRandom([10]) → always 0 | No override (only one weight) |
| random_tag[0]==='圖片' && comic tag present | ~1/5 (selectRandom([4,1])) | `['dm5 comic', 'no local', random_comic_genre]` — dm5 comic genre drawn from subset [24,25,27,28,32,34,35,37,38,39,40] |
| random_tag[0]==='音頻' | selectRandom([6]) → always 0 | No override (single weight) |

#### Phase 5: Execute Query
1. `StorageTagTool.searchTags(session).setArray('', random_tags, [true, true, ...])` — sets session search state
2. `StorageTagTool.tagQuery(0, null, null, null, sortName, sortType, user, session)` — execute search at page 0
3. Response: `{ itemList, parentList, latest, bookmarkID }` (same shape as `/get`)

**Test Scenarios:**

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | New user, no Redis history | GET /storage/getRandom/name/desc/0 | 200, all weights=1, uniform random |
| 2 | User with heavy '影片' usage | High video weight in Redis | Higher probability of video tags |
| 3 | choose=0 (圖片) | Random selects index 0 | random_tag=[圖片, pic_sub, genre] |
| 4 | choose=4 (影片) | Random selects index 4 | random_tag=[影片, video_sub, genre] |
| 5 | choose=15 (簡報) | Random selects index 15 | random_tag=[簡報] only |
| 6 | choose=16 (試算表) | Random selects index 16 | random_tag=[試算表] only |
| 7 | choose≥72 (adult) | Random selects adult index | random_tag prepends '18+' |
| 8 | Video→yify override | 電影 selected, prob triggers | random_tag=['yify movie','no local', genre] |
| 9 | Picture→dm5 override | 漫畫 selected, prob triggers | random_tag=['dm5 comic','no local', genre] |
| 10 | Redis hgetall fails | Redis error | handleError → 500 |
| 11 | tagQuery fails after random | DB error | handleError → 500 |
| 12 | Edge case: reserved media type | Reserved index selected | Expected behavior for future media types |

---

## Endpoint 5: GET `/storage/single/:uid`

**Route pattern:** `/single/:uid`

**Purpose:** Fetch a single storage item by UID.

**Parameters:**

| Parameter | Location | Validation | Required | Description |
|-----------|----------|------------|----------|-------------|
| uid       | path     | string     | yes      | Item unique ID |

**Flow:**
1. `StorageTagTool.singleQuery(uid, user, session)`
2. If `result.empty` → return the result as-is (empty response)
3. Else → transform single item via `getStorageItem(user, [result.item], result.mediaHadle)[0]` and return `{ item }`

**Response (non-empty):**
```json
{ "item": { /* single transformed storage item */ } }
```

**Response (empty):**
```json
{ "empty": true, /* ...other fields from result */ }
```

**Test Scenarios:**

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Valid existing UID | GET /storage/single/validId | 200, `{ item: {...} }` |
| 2 | Non-existent UID | GET /storage/single/unknownId | 200, `{ empty: true }` |
| 3 | UID with media handle | Multimedia item | item includes mediaHadle transformations |
| 4 | singleQuery fails | DB error | handleError → 500 |

---

## Endpoint 6: GET `/storage/external/get/:sortName/:pageToken?`

**Route pattern:** `/external/get/:sortName(name|mtime|count)/:pageToken?`

**Purpose:** Fetch items from external sources (yify, dm5) based on the current session search tags.

**Parameters:**

| Parameter  | Location | Validation          | Required | Description                   |
|------------|----------|---------------------|----------|-------------------------------|
| sortName   | path     | enum: name,mtime,count | yes   | Sort field                    |
| pageToken  | path     | optional string     | no       | Format: `{digits}{token}` — page index + continuation token |

**Flow:**
1. Reads current search state: `StorageTagTool.searchTags(session).getArray()`
2. Parses `pageToken` → `index` (leading digits, default 1) and `pageToken` (trailing non-digits or false)
3. Sequentially queries 2 external sources:
   - **Yify:** `External.getSingleList('yify', ...)` → items with `id: 'yif_{id}'`, status=3, count=rating
   - **DM5:** `External.getSingleList('dm5', query)` — query may include POST body if `query.post` exists → items with `id: 'mad_{id}'`, status=2, count=0, utime=0
4. All external items get `tags: [...item.tags, 'first item']`, `recycle: 0`, `isOwn: false`, `noDb: true`
5. Returns `{ itemList, pageToken: '{index+1}' }`

**External Item Shape:**
```json
{
  "name": "...", "id": "prefix_id", "tags": ["...", "first item"],
  "recycle": 0, "isOwn": false, "utime": timestamp,
  "thumb": "...", "noDb": true, "status": 2|3, "count": number
}
```

**Test Scenarios:**

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | First page, no pageToken | GET /storage/external/get/name | 200, combined results, pageToken="2" |
| 2 | With pageToken "2abc" | GET /storage/external/get/name/2abc | index=2, token="abc" |
| 4 | Yify returns items | Yify API success | Items prefixed `yif_`, count=rating |
| 5 | DM5 with POST query | dm5 query has `.post` | POST request to dm5 |
| 6 | DM5 without POST | dm5 query is string | GET request to dm5 |
| 7 | One external source fails | e.g., yify timeout | handleError → 500 (sequential chain breaks) |
| 8 | Empty results from all sources | No matches | 200, `{ itemList: [], pageToken: "2" }` |

---

## Endpoint 7: POST `/storage/getOptionTag`

**Route pattern:** `/getOptionTag`

**Purpose:** Get the list of available tags for the tag picker UI, contextually based on current tags and user admin level.

**Request Body:**
```json
{ "tags": ["tag1", "tag2"] }
```

**Flow:**

1. **Initial set based on admin level:**
   - `checkAdmin(2, user)` → true: `optionList = Set(['first item', '18+'])`
   - Non-admin (level < 2): `optionList = Set(['first item'])`

2. **If `tags.length > 0`:**
   - `StorageTagTool.getRelativeTag(tags, user, [...optionList])` → up to 5 related tags added
   - Then **tag-based list append** (one branch wins):

   | Condition | Appended List |
   |-----------|---------------|
   | tags includes '18+' | `ADULT_LIST` (23 adult tags) |
   | tags includes 'game' OR '遊戲' | `GAME_LIST_CH` (10 game tags) |
   | tags includes 'audio' OR '音頻' | `MUSIC_LIST` (21 music genres) |
   | else (default) | `GENRE_LIST_CH` (22 genre tags) |

   - Returns `{ relative: [...optionList] }` (Set ensures uniqueness)

3. **If `tags.length === 0`:**
   - Skips `getRelativeTag` entirely
   - Returns `{ relative: [...optionList, ...GENRE_LIST_CH] }` directly

**Priority order for tag-based list:** 18+ > game/遊戲 > audio/音頻 > default(genre). First match wins; only one list is appended.

**Response:**
```json
{ "relative": ["first item", "18+", "related1", ..., "genre1", ...] }
```

**Test Scenarios:**

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Admin level 2+, empty tags | `{ tags: [] }` | `['first item', '18+', ...GENRE_LIST_CH]` |
| 2 | Non-admin, empty tags | `{ tags: [] }` | `['first item', ...GENRE_LIST_CH]` |
| 3 | Tags with '18+' | `{ tags: ['18+'] }` | Initial + up to 5 relative + ADULT_LIST |
| 4 | Tags with 'game' | `{ tags: ['game'] }` | Initial + up to 5 relative + GAME_LIST_CH |
| 5 | Tags with '遊戲' | `{ tags: ['遊戲'] }` | Initial + up to 5 relative + GAME_LIST_CH |
| 6 | Tags with 'audio' | `{ tags: ['audio'] }` | Initial + up to 5 relative + MUSIC_LIST |
| 7 | Tags with '音頻' | `{ tags: ['音頻'] }` | Initial + up to 5 relative + MUSIC_LIST |
| 8 | Tags with other values | `{ tags: ['action'] }` | Initial + up to 5 relative + GENRE_LIST_CH |
| 9 | Both '18+' and 'game' in tags | `{ tags: ['18+', 'game'] }` | 18+ wins (checked first) → ADULT_LIST |
| 10 | Relative returns < 5 items | 2 related tags found | Only 2 relative tags added |
| 11 | Relative returns ≥ 5 items | 10 related tags | Exactly 5 relative tags added |
| 12 | getRelativeTag fails | DB error | handleError → 500 |
| 13 | Duplicate tags in relative | Overlap with initial set | Set deduplicates |

---

## Endpoint 8: PUT `/storage/addTag/:tag`

**Route pattern:** `/addTag/:tag`

**Purpose:** Add a tag to one or more storage items. Processes UIDs recursively with 500ms delay between each.

**Parameters:**

| Parameter | Location | Validation | Required | Description |
|-----------|----------|------------|----------|-------------|
| tag       | path     | string     | yes      | Tag to add  |

**Request Body:**
```json
{ "uids": ["uid1", "uid2", "uid3"] }
```

**Flow:**
1. Recursive function `recur(index)`:
   - Base case: `index >= uids.length` → `res.json({ apiOK: true })`
   - Recursive: `StorageTagTool.addTag(uids[index], tag, user, false)`
   - If result has `.id` → `sendWs({ type: 'file', data: result.id }, result.adultonly)` (WebSocket broadcast)
   - 500ms `setTimeout` before next iteration
2. Starts with `recur(0)`

**WebSocket notification:** Sent with `type: 'file'` and the `adultonly` flag from the result. Non-adult users won't see adult item updates.

**Response:**
```json
{ "apiOK": true }
```

**Error paths:**
- `addTag` fails for any UID → promise chain rejects → `handleError(err, next)`
- If result has no `.id`, no WebSocket sent but processing continues

**Test Scenarios:**

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Single UID | `{ uids: ['id1'] }`, tag='action' | 200, tag added, WS sent |
| 2 | Multiple UIDs | `{ uids: ['id1','id2','id3'] }` | All tagged with 500ms delays |
| 3 | Empty UIDs array | `{ uids: [] }` | Immediate `{ apiOK: true }` |
| 4 | addTag returns no id | Result without `.id` | No WS sent, continues to next |
| 5 | addTag returns adultonly=true | Adult item | WS sent with adultonly=true |
| 6 | Middle UID fails | 2nd of 3 fails | handleError, remaining skipped |
| 7 | Invalid UID | Non-existent UID | addTag error → handleError |

---

## Endpoint 9: PUT `/storage/delTag/:tag`

**Route pattern:** `/delTag/:tag`

**Purpose:** Delete a tag from one or more storage items. Same recursive pattern as `addTag`.

**Parameters & Body:** Identical to `addTag`.

**Flow:** Same as `addTag` but calls `StorageTagTool.delTag(uids[index], tag, user, false)`.

**Response:** `{ apiOK: true }`

**Test Scenarios:**

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Single UID | `{ uids: ['id1'] }`, tag='action' | 200, tag removed, WS sent |
| 2 | Multiple UIDs | `{ uids: ['id1','id2','id3'] }` | All processed with 500ms delays |
| 3 | Empty UIDs | `{ uids: [] }` | Immediate `{ apiOK: true }` |
| 4 | delTag returns no id | No `.id` in result | No WS sent, continues |
| 5 | Tag doesn't exist on item | Item lacks the tag | Depends on delTag behavior |
| 6 | Middle UID fails | 2nd fails | handleError, rest skipped |

---

## Endpoint 10: PUT `/storage/sendTag/:uid`

**Route pattern:** `/sendTag/:uid`

**Purpose:** Update (replace) the name and tags of a storage item.

**Parameters:**

| Parameter | Location | Validation | Required | Description |
|-----------|----------|------------|----------|-------------|
| uid       | path     | string     | yes      | Item UID    |

**Request Body:**
```json
{ "name": "New Name", "tags": ["tag1", "tag2"] }
```

**Flow:**
1. `StorageTagTool.sendTag(uid, body.name, body.tags, user)`
2. `sendWs({ type: 'file', data: result.id }, result.adultonly)` — always sends WS (no conditional)
3. Returns the full result object

**Response:** The `sendTag` result object (includes `id`, `adultonly`, and other fields).

**Test Scenarios:**

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Valid update | uid + name + tags | 200, result returned, WS sent |
| 2 | Empty tags array | `{ name: "x", tags: [] }` | Clears all tags |
| 3 | Adult tag added | Tags include adult content | WS with adultonly=true |
| 4 | Invalid UID | Non-existent UID | handleError → 500 |
| 5 | sendTag fails | DB error | handleError → 500 |

---

## Endpoint 11: PUT `/storage/addTagUrl`

**Route pattern:** `/addTagUrl`

**Purpose:** Parse tags from a supported external URL and add them to one or more storage items. Supports 6 domains.

**Request Body:**
```json
{ "url": "https://www.imdb.com/title/tt1234567/", "uids": ["uid1", "uid2"] }
```
Or without `uids` to just preview parsed tags:
```json
{ "url": "https://store.steampowered.com/app/12345/" }
```

**Flow:**

1. **URL Validation:** `isValidString(body.url, 'url')` — if invalid → `HoError('invalid tag url')`

2. **Domain Detection & Tag Parsing:**

   | URL Pattern | Source | Parser |
   |-------------|--------|--------|
   | `store.steampowered.com/app/` | steam | `External.parseTagUrl('steam', url)` |
   | `www.imdb.com/title/` | imdb | `External.parseTagUrl('imdb', url)` |
   | `www.allmusic.com/` | allmusic | `External.parseTagUrl('allmusic', url)` |
   | `marvel.wikia.com/wiki/` | marvel | `External.parseTagUrl('marvel', url)` |
   | `dc.wikia.com/wiki/` | dc | `External.parseTagUrl('dc', url)` |
   | `thetvdb.com/` | tvdb | `External.parseTagUrl('tvdb', url)` |
   | Any other URL | rejected | `HoError('invalid tag url')` |

   All URL patterns accept both `http` and `https` prefixes.

3. **Tag Application (if `uids` provided):**
   - Double-recursive: outer loop over `uids`, inner loop over `taglist`
   - For each UID: iterates through all parsed tags, calling `StorageTagTool.addTag(uid, tag, user, false)` with 500ms delay
   - After all tags added to a UID, sends single `sendWs({ type: 'file', data: uid }, adultonly)` — uses the `adultonly` from the **last** addTag result
   - Returns `{ apiOK: true }` after all UIDs processed

4. **Tag Preview (no `uids`):**
   - Returns `{ tags: taglist }` — the parsed tags without applying them

**Response with UIDs:** `{ apiOK: true }`
**Response without UIDs:** `{ tags: ["parsed", "tag", "list"] }`

**Test Scenarios:**

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Steam URL with UIDs | steam URL + uids | Tags parsed from Steam, applied to all UIDs |
| 2 | IMDB URL with UIDs | imdb URL + uids | Tags parsed from IMDB, applied |
| 3 | Allmusic URL | allmusic URL + uids | Music tags applied |
| 4 | Marvel wiki URL | marvel URL + uids | Marvel tags applied |
| 5 | DC wiki URL | dc URL + uids | DC tags applied |
| 6 | TVDB URL | tvdb URL + uids | TV tags applied |
| 7 | Preview mode (no UIDs) | URL only, no uids field | `{ tags: [...] }` returned |
| 8 | Invalid URL format | `isValidString` fails | `HoError('invalid tag url')` |
| 9 | Unsupported domain | `https://example.com` | `HoError('invalid tag url')` |
| 10 | HTTP vs HTTPS | Both protocols | Both accepted (regex allows either) |
| 11 | Multiple UIDs | 3 UIDs, 5 tags each | 15 addTag calls total, 500ms each |
| 12 | parseTagUrl fails | External service error | handleError → 500 |
| 13 | addTag fails mid-process | 3rd tag of 2nd UID fails | handleError, remaining skipped |
| 14 | adultonly propagation | Adult tags parsed | WS sent with adultonly from last tag result per UID |

---

## Endpoint 12: PUT `/storage/recover/:uid`

**Route pattern:** `/recover/:uid`

**Purpose:** Recover a recycled (soft-deleted) storage item. Admin-only endpoint.

**Parameters:**

| Parameter | Location | Validation | Required | Description |
|-----------|----------|------------|----------|-------------|
| uid       | path     | validated as 'uid' | yes | Item to recover |

**Flow:**

1. **Admin check:** `checkAdmin(1, user)` — if not admin level 1+ → logs `user` (⚠️ references undefined `user` variable, should be `req.user`) → `HoError('permission denied')`
2. **UID validation:** `isValidString(uid, 'uid')` → if invalid → `HoError('uid is not vaild')`
3. **Find item:** `Mongo('find', STORAGEDB, {_id: id}, {limit: 1})`
4. **Validation checks:**
   - `items.length === 0` → `HoError('file can not be fund!!!')` — ⚠️ missing `next` parameter in handleError
   - `items[0].recycle !== 1` → `HoError('recycle file first!!!')` — ⚠️ missing `next` parameter
5. **Recover:** `Mongo('update', STORAGEDB, {_id: id}, {$set: {recycle: 0}})`
6. **Notify:** `sendWs({ type: 'file', data: items[0]._id }, items[0].adultonly)`
7. Returns `{ apiOK: true }`

**⚠️ Potential Bugs Noted:**
- Line 423: `console.log(user)` references `user` instead of `req.user` — would throw ReferenceError before the handleError
- Lines 432, 435: `handleError(new HoError(...))` called without `next` parameter — may not propagate to Express error handler correctly

**Test Scenarios:**

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Admin recovers recycled item | Admin user, valid UID, recycle=1 | 200, recycle set to 0, WS sent |
| 2 | Non-admin user | Regular user | `HoError('permission denied')` (but ReferenceError on `user` first) |
| 3 | Invalid UID format | Bad UID string | `HoError('uid is not vaild')` |
| 4 | UID not found in DB | Non-existent UID | `HoError('file can not be fund!!!')` |
| 5 | Item not recycled (recycle=0) | Active item | `HoError('recycle file first!!!')` |
| 6 | Item with recycle=2 | Different recycle state | `HoError('recycle file first!!!')` (only recycle===1 passes) |
| 7 | Adult item recovery | adultonly=true item | WS sent with adultonly=true |
| 8 | DB update fails | Mongo error | handleError → 500 |

---

## Endpoint 13: POST `/storage/media/saveParent/:sortName/:sortType`

**Route pattern:** `/media/saveParent/:sortName(name|mtime|count)/:sortType(desc|asc)`

**Purpose:** Save the current search context (session array) with a name for later reference during media browsing.

**Parameters:**

| Parameter | Location | Validation | Required | Description |
|-----------|----------|------------|----------|-------------|
| sortName  | path     | enum: name,mtime,count | yes | Sort field |
| sortType  | path     | enum: desc, asc | yes | Sort direction |

**Request Body:**
```json
{ "name": "My search context" }
```

**Flow:**
1. Validate `body.name` via `isValidString(body.name, 'name')` → if invalid → `HoError('name is not vaild')`
2. `StorageTagTool.searchTags(session).saveArray(name, sortName, sortType)` — persists to session
3. Returns `{ apiOK: true }`

**Response:** `{ apiOK: true }`

**Test Scenarios:**

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Valid save | name + sortName + sortType | 200, session array saved |
| 2 | Invalid name | Empty or special chars | `HoError('name is not vaild')` |
| 3 | All sort combos | 3×2 = 6 combinations | All work |
| 4 | Overwrite existing save | Same name again | Depends on saveArray implementation |

---

## Endpoint 14: GET `/storage/media/setTime/:id/:type/:obj?/:pageToken?/:back?`

**Route pattern:** `/media/setTime/:id/:type/:obj?/:pageToken?/:back(back)?`

**Purpose:** The most complex endpoint. Handles media time tracking, playlist resolution across multiple external sources, and tag counting for the recommendation engine.

**Parameters:**

| Parameter  | Location | Validation                  | Required | Description                           |
|------------|----------|-----------------------------|----------|---------------------------------------|
| id         | path     | uid or name (prefix-dependent) | yes   | Media item ID (may have external prefix) |
| type       | path     | validated as 'name'         | yes      | Media type: 'url', 'music', 'video', etc. |
| obj        | path     | optional, pattern-matched   | no       | Playlist position / external reference |
| pageToken  | path     | optional, validated as 'name' | no    | Pagination token for playlist         |
| back       | path     | literal 'back' or absent    | no       | Navigate backwards in playlist        |

### Phase 1: ID Parsing & Playlist Type Detection

| ID Prefix | Playlist Type | Source    | playlistId     |
|-----------|--------------|-----------|----------------|
| `yif_`    | 4            | Yify      | after prefix   |
| `mad_`    | 5            | DM5       | after prefix   |
| No prefix | 0 (or 2)    | Internal  | N/A            |

**Internal ID with playlist detection:**
- If `obj` matches pattern `^(external|\d+(\.\d+)?)$` → playlist=2
- If `obj === 'external'` → obj set to null
- Otherwise → playlist=0 (no playlist)

**Validation after parsing:**
- External IDs: validated as 'name' → `HoError('external is not vaild')` if invalid
- Internal IDs: validated as 'uid' → `HoError('file is not vaild')` if invalid
- type: validated as 'name' → `HoError('type is not vaild')` if invalid

### Phase 2: `first()` — Record Playlist Position in Redis

Executes only if `playlist > 0 && obj` exists:
- Validates obj matches `^\d+(\.\d+)?$` — must be numeric, `HoError('external is not vaild')` otherwise
- Validates obj as 'name' string
- Optionally validates `pageToken` as 'name'
- Stores in Redis: `hmset record:{userId} {id: pageToken ? '{obj}>>{pageToken}' : obj}`
- The `>>` separator encodes both position and page token in one Redis field

If no playlist or no obj → `Promise.resolve()` (no-op).

### Phase 3: `setTag(id)` — Tag Counting for Recommendations

1. `Mongo('find', STORAGEDB, {_id: id}, {limit: 1})`
2. For each tag on the item that exists in `OPTION_TAG`: `Redis hincrby tag:{userId} {tag} 1`
3. Executes as Redis multi command
4. Then retrieves: `Redis hget record:{userId} {id}` — returns saved playback position

### Phase 4: `getRecord()` — Build Response

- **If type === 'url':** Returns `{ apiOK: true }` immediately (no record tracking for URLs)
- **Otherwise:** Calls `setTag(id)`, then:

**Parse stored record:**
- If record contains `>>`: split into `recordTime` (before) and `rPageToken` (after)
- If no `>>`: entire value is `recordTime`
- If no record: `recordTime = 1`, `rPageToken = null`

**Playlist resolution based on type:**

| Playlist | Source | Resolution Method |
|----------|--------|------------------|
| 0 (none) | Internal | If record exists AND type !== 'music': `{ time: record }`; else `{ apiOK: true }` |
| 2 | Internal external | `Mongo find` item → `External.getSingleId(owner, url, recordTime, rPageToken, back)` |
| 4 | Yify | `External.getSingleId('yify', yify_api_url, recordTime)` |
| 5 | DM5 | `External.getSingleId('dm5', dm5_url, recordTime)` |

**Playlist URL construction:**
- Yify: `https://yts.ag/api/v2/movie_details.json?movie_id={playlistId}`
- DM5: `http://www.dm5.com/{playlistId}/`

**`ret_rest` helper — Build playlist response:**
- Validates `total >= 1` → else `HoError('playlist is empty')`
- If `is_new` flag: saves new position to Redis
- If `obj.id` exists: calls `setTag(obj.id)` for the playlist item too
- Response shape:

```json
{
  "time": "saved_position",  // only if record exists AND type !== 'music'
  "playlist": {
    "obj": { /* current playlist item */ },
    "end": true|false,
    "total": number,
    "obj_arr": [ /* items array, if applicable */ ],
    "pageN": "next_page",
    "pageP": "prev_page", 
    "pageToken": "token"
  }
}
```

For playlist types 4–5 (external), `obj_arr`/`pageN`/`pageP`/`pageToken` are NOT included (only obj, end, total).

### Phase 5: Side Effects (fire-and-forget)

After response is sent:
- `StorageTagTool.setLatest(id, session, type === 'url' ? false : type)` — updates session latest
- `Mongo('update', STORAGEDB, {_id: id}, {$inc: {count: 1}})` — increments play count
- Errors caught separately: `handleError(err, 'Set latest')` — logged but don't affect response

**Test Scenarios:**

| 1 | Internal file, no playlist | `/setTime/validUid/video` | `{ time: savedPos }` or `{ apiOK: true }` |
| 2 | Internal file, type=music | `/setTime/validUid/music` | `{ apiOK: true }` (no time for music) |
| 3 | Internal file, type=url | `/setTime/validUid/url` | `{ apiOK: true }` (immediate, no setTag) |
| 4 | Internal with obj (playlist=2) | `/setTime/uid/video/1.5` | Redis record set, playlist resolved |
| 5 | Internal with obj='external' | `/setTime/uid/video/external` | obj→null, playlist=2 |
| 6 | Yify external (yif_) | `/setTime/yif_456/video` | playlist=4, yify API resolved |
| 7 | DM5 external (mad_) | `/setTime/mad_abc/video` | playlist=5, dm5 URL resolved |
| 8 | With pageToken | `/setTime/uid/video/1.5/token123` | Redis stores `1.5>>token123` |
| 9 | With back flag | `/setTime/uid/video/1.5/token/back` | Backwards navigation in playlist |
| 10 | Existing record with >> | Previous `obj>>token` stored | Parsed into recordTime + rPageToken |
| 11 | Existing record without >> | Simple position stored | All as recordTime, rPageToken=null |
| 12 | No existing record | First time access | recordTime=1, rPageToken=null |
| 13 | Invalid external ID | `yif_!!!` fails validation | `HoError('file is not vaild')` |
| 14 | Invalid internal UID | Bad UID format | `HoError('file is not vaild')` |
| 15 | Invalid type | Type fails isValidString | `HoError('type is not vaild')` |
| 16 | obj fails numeric pattern | `/setTime/uid/video/abc` | playlist=0 (pattern doesn't match) |
| 17 | playlist=2, obj fails validation | Invalid obj in numeric check | `HoError('external is not vaild')` |
| 18 | Empty playlist (total < 1) | External returns 0 items | `HoError('playlist is empty')` |
| 19 | Tag counting side effect | Item has OPTION_TAG tags | Redis hincrby for each matching tag |
| 20 | Play count increment | Any successful access | count +1 in Mongo (fire-and-forget) |
| 24 | setLatest failure | Redis/Mongo error | Logged but response already sent |

---

## Endpoint 15: GET `/storage/media/record/:id/:time/:pId?`

**Route pattern:** `/media/record/:id/:time/:pId?`

**Purpose:** Save or delete a playback position record in Redis for resume-playback support.

**Parameters:**

| Parameter | Location | Validation | Required | Description |
|-----------|----------|------------|----------|-------------|
| id        | path     | uid or name (prefix-dependent) | yes | Media item ID |
| time      | path     | regex: `^\d+(&\d+\|\.\d+)?$` | yes | Timestamp (0 = delete) |
| pId       | path     | unused in code | no | Playlist ID (parameter accepted but not used) |

**Flow:**

1. **Time validation:** Must match `^\d+(&\d+|\.\d+)?$`
   - Accepts: `0`, `123`, `123.45`, `123&45`
   - Rejects: negative, non-numeric, other formats
   - Invalid → `HoError('timestamp is not vaild')`

2. **ID validation:** Checks for external prefixes:
   - Matches any of: `you_`, `dym_`, `bil_`, `mad_`, `yuk_`, `ope_`, `lin_`, `iqi_`, `bbl_`, `kud_`, `kyu_`, `kdy_`, `kub_`, `kur_` → validated as 'name'
   - No prefix → validated as 'uid'
   - Invalid → `HoError('file is not vaild')`

3. **Redis operation:**
   - `time === '0'` → `Redis('hdel', 'record:{userId}', id)` — **delete** the record
   - `time !== '0'` → `Redis('hmset', 'record:{userId}', {[id]: time})` — **save** the position

4. Returns `{ apiOK: true }`

**Note:** `pId` parameter is declared in the route but never referenced in the handler body.

**Test Scenarios:**

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Save position for internal file | `/record/validUid/123.45` | Redis hmset, `{ apiOK: true }` |
| 2 | Save position for external | `/record/kub_abc/500` | Redis hmset with name validation |
| 3 | Delete record (time=0) | `/record/validUid/0` | Redis hdel, `{ apiOK: true }` |
| 4 | Time with ampersand | `/record/uid/123&45` | Valid, Redis hmset |
| 5 | Time with decimal | `/record/uid/99.5` | Valid, Redis hmset |
| 6 | Invalid time format | `/record/uid/abc` | `HoError('timestamp is not vaild')` |
| 7 | Negative time | `/record/uid/-5` | `HoError('timestamp is not vaild')` |
| 8 | Invalid UID | `/record/!!!!/100` | `HoError('file is not vaild')` |
| 9 | All external prefixes | Each of 14 prefixes | Validated as 'name', Redis hmset |
| 10 | With pId parameter | `/record/uid/100/playlistId` | pId ignored, same behavior |
| 11 | Redis error | Redis failure | handleError → 500 |

---

## Endpoint 16: GET `/storage/media/more/:type/:page/:back?`

**Route pattern:** `/media/more/:type(\\d+)/:page(\\d+)/:back(back)?`

**Purpose:** Load additional media items by type (image, video, music) for infinite-scroll or pagination in the media player view.

**Parameters:**

| Parameter | Location | Validation | Required | Description |
|-----------|----------|------------|----------|-------------|
| type      | path     | digits     | yes      | 2=image, 3=video, 4=music |
| page      | path     | digits     | yes      | Page number |
| back      | path     | literal 'back' | no   | Backwards pagination |

**Flow:**

1. **Type mapping:**

   | type | saveName | DB Query Filter |
   |------|----------|----------------|
   | 2    | 'image'  | `$or: [{status:2}, {status:5}, {status:6}, {status:10}]` (multiple image statuses) |
   | 3    | 'video'  | `status: 3` |
   | 4    | 'music'  | `status: 4` |
   | other | —       | `HoError('unknown type')` |

2. **Build SQL:** `StorageTagTool.saveSql(page, saveName, back, user, session)`
   - If returns falsy → `HoError('query error')`
   - If `sql.empty` → `{ itemList: [] }`

3. **Execute query:** `Mongo('find', STORAGEDB, sql.nosql, {projection: sql.select, ...sql.options})`

4. Returns `{ itemList, parentList }`

**Image type special handling:** Uses `$or` with 4 status values (2, 5, 6, 10) rather than a single status match, indicating images can have multiple storage statuses.

**Test Scenarios:**

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Load images page 0 | `/more/2/0` | 200, image items (status 2,5,6,10) |
| 2 | Load videos page 1 | `/more/3/1` | 200, video items (status 3) |
| 3 | Load music page 0 | `/more/4/0` | 200, music items (status 4) |
| 4 | Invalid type (1) | `/more/1/0` | `HoError('unknown type')` |
| 5 | Invalid type (5) | `/more/5/0` | `HoError('unknown type')` |
| 6 | Back pagination | `/more/2/3/back` | Previous page of images |
| 7 | saveSql returns null | Bad session state | `HoError('query error')` |
| 8 | saveSql returns empty | No matching saved query | `{ itemList: [] }` |
| 9 | Non-numeric type | `/more/abc/0` | 404 (route regex fails) |
| 10 | Large page number | `/more/3/999` | 200, likely empty results |
| 11 | DB error | Mongo failure | handleError → 500 |

---

## Endpoint 17: GET `/storage/torrent/query/:id`

**Route pattern:** `/torrent/query/:id`

**Purpose:** Query the contents of a torrent/ZIP archive playlist, returning each file with its detected type for the media player.

**Parameters:**

| Parameter | Location | Validation | Required | Description |
|-----------|----------|------------|----------|-------------|
| id        | path     | validated as 'uid' | yes | Torrent/archive item UID |

**Flow:**

1. **Validate ID:** `isValidString(id, 'uid')` → `HoError('file is not vaild')` if invalid
2. **Find item:** `Mongo('find', STORAGEDB, {_id: id}, {limit: 1})`
3. **Validate:** `items.length < 1 || items[0].status !== 9` → `HoError('playlist can not be fund!!!')` (status 9 = torrent/archive)
4. **Get playback record:** `Redis('hget', 'record:{userId}', id)`
5. **Side effects (fire-and-forget):**
   - `StorageTagTool.setLatest(id, session)` — no type parameter
   - `Mongo update {$inc: {count: 1}}` — increment access count
6. **Build response:** Map `items[0].playList` to typed entries:

**Type detection per file:**

| Detection Function | Detected Type | doc Value |
|-------------------|---------------|-----------|
| `isDoc(file)` returns truthy | type=2 | present→1, pdf→3, else→2 |
| `isImage(file)` or `isZipbook(file)` | type=2 | 0 |
| `isVideo(file)` | type=3 | 0 |
| `isMusic(file)` | type=4 | 0 |
| None match | type=1 (unknown/other) | 0 |

**Note on detection priority:** `isDoc` is checked first. If it returns truthy, the file is type=2 regardless of other checks. Then `isImage` and `isZipbook` (OR'd together) → type=2. Then `isVideo` → type=3. Then `isMusic` → type=4. Default → type=1.

**Present field:** If `items[0].present` array exists and has an entry at index `i`, it's included as `present` in the output.

**Response:**
```json
{
  "id": "item_id",
  "list": [
    { "name": "file1.mp4", "type": 3, "doc": 0 },
    { "name": "file2.pdf", "type": 2, "doc": 3, "present": "..." },
    { "name": "file3.jpg", "type": 2, "doc": 0 }
  ],
  "time": "saved_position"  // only if Redis record exists
}
```

**Test Scenarios:**

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Valid torrent with mixed files | `/torrent/query/validId` | 200, typed file list |
| 2 | Invalid UID | Bad format | `HoError('file is not vaild')` |
| 3 | Item not found | Non-existent UID | `HoError('playlist can not be fund!!!')` |
| 4 | Item not status 9 | Regular file (status=2) | `HoError('playlist can not be fund!!!')` |
| 5 | Video file in playlist | `.mp4` file | type=3, doc=0 |
| 6 | Image file in playlist | `.jpg` file | type=2, doc=0 |
| 7 | Music file in playlist | `.mp3` file | type=4, doc=0 |
| 8 | PDF document | `.pdf` file | type=2, doc=3 |
| 9 | Presentation file | `.pptx` file | type=2, doc=1 |
| 10 | Other document | `.docx` file | type=2, doc=2 |
| 11 | Zipbook file | Matched by isZipbook | type=2, doc=0 |
| 12 | Unknown file type | `.xyz` file | type=1, doc=0 |
| 13 | With saved record | Redis has position | Response includes `time` field |
| 14 | Without saved record | No Redis record | No `time` field in response |
| 15 | File with present data | `items[0].present[i]` exists | Includes `present` in entry |
| 16 | File without present data | No present array | No `present` field |
| 17 | Empty playList | No files in archive | `{ id, list: [] }` |
| 18 | Count increment | Any successful query | count +1 (fire-and-forget) |
| 19 | setLatest failure | Redis error | Logged, response already sent |

---

## Endpoint 18: PUT `/storage/zipPassword/:uid`

**Route pattern:** `/zipPassword/:uid`

**Purpose:** Set the extraction password for a ZIP/archive file (status=9).

**Parameters:**

| Parameter | Location | Validation | Required | Description |
|-----------|----------|------------|----------|-------------|
| uid       | path     | validated as 'uid' | yes | Archive item UID |

**Request Body:**
```json
{ "pwd": "archive_password" }
```

**Flow:**

1. **Validate UID:** `isValidString(uid, 'uid')` → `HoError('file is not vaild')` if invalid
2. **Validate password:** `isValidString(body.pwd, 'altpwd')` → `HoError('password is not vaild')` if invalid
3. **Find archive:** `Mongo('find', STORAGEDB, {_id: id, status: 9}, {limit: 1})`
   - `items.length < 1` → `HoError('zip can not be fund!!!')` — ⚠️ missing `next` in handleError
4. **Update password:** `Mongo('update', STORAGEDB, {_id: id, status: 9}, {$set: {pwd}})`
5. Returns `{ apiOk: true }` — ⚠️ Note: lowercase 'k' in `apiOk` vs `apiOK` used everywhere else

**⚠️ Inconsistency:** Response uses `apiOk` (lowercase k) while all other endpoints use `apiOK` (uppercase K). This could cause client-side issues if checking for `apiOK`.

**Test Scenarios:**

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Valid password set | Valid UID + pwd | 200, `{ apiOk: true }` |
| 2 | Invalid UID | Bad format | `HoError('file is not vaild')` |
| 3 | Invalid password | Fails 'altpwd' validation | `HoError('password is not vaild')` |
| 4 | Item not found | Non-existent UID | `HoError('zip can not be fund!!!')` |
| 5 | Item not status 9 | Regular file | `HoError('zip can not be fund!!!')` |
| 6 | Update password (overwrite) | Already has pwd | $set overwrites existing |
| 7 | DB error | Mongo failure | handleError → 500 |
| 8 | Response key check | Client expects apiOK | ⚠️ Gets `apiOk` (case mismatch) |

---

## Cross-Cutting Concerns

### Authentication
All endpoints protected by `checkLogin` middleware at router level (line 16–18). Unauthenticated requests are blocked before reaching any handler.

### WebSocket Notifications
Endpoints that modify data broadcast via `sendWs({ type: 'file', data: id }, adultonly)`:
- `addTag` — per item after tag addition
- `delTag` — per item after tag removal
- `sendTag` — after name/tags update
- `addTagUrl` — after all tags added per UID
- `recover` — after recovery

The `adultonly` flag controls WebSocket channel routing so non-adult users don't receive adult content updates.

### Redis Data Structures

| Key Pattern | Type | Purpose |
|-------------|------|---------|
| `tag: {userId}` | Hash | Per-user tag interaction weights (hincrby per access) |
| `record: {userId}` | Hash | Per-user playback position records |

**Record value format:** `{position}` or `{position}>>{pageToken}` for paginated playlists.

### Session State
- `searchTags(session)` manages per-session search arrays (set/get/reset/save)
- `setLatest(id, session, type)` tracks last accessed item in session
- `saveSql(page, name, back, user, session)` builds queries from saved session state

### Error Handling Pattern
All endpoints follow: `.catch(err => handleError(err, next))` except:
- `recover` lines 432, 435: `handleError` called without `next` (potential bug)
- `zipPassword` line 703: `handleError` called without `next` (potential bug)
- `setTime` line 506, 542: `handleError` called without `next` (potential bug)

### Noted Potential Issues Summary

| Location | Issue | Severity |
|----------|-------|----------|
| Line 423 | `console.log(user)` — `user` undefined, should be `req.user` | High — ReferenceError |
| Lines 432, 435, 506, 542, 663, 703 | `handleError()` without `next` param | Medium — errors may not propagate |
| Line 708 | `apiOk` vs `apiOK` inconsistency | Low — client may not detect success |
# Section 8: bookmark-router.js & parent-router.js (Bookmarks & Tag Categories)

Both routers follow the same multi-collection pattern, instantiating a dedicated `TagTool` per collection type — `STORAGEDB`, `PASSWORDDB`, `STOCKDB` — then exposing CRUD endpoints for each. All routes are protected by the `checkLogin` middleware applied at the router level.

---

## 8.1 bookmark-router.js

**File:** `src/back/controllers/bookmark-router.js` (359 lines)

### 8.1.1 Architecture Overview

| Concern | Detail |
|---|---|
| Auth gate | `router.use(checkLogin)` — every route requires an authenticated session |
| TagTool instances | `StorageTagTool`, `PasswordTagTool`, `StockTagTool` — each wraps the corresponding DB constant |
| Imports | `crypto.createHash` (MD5), `TagTool` + `isDefaultTag` + `normalize`, `Mongo` + `objectID`, `sendWs`, `addPost`, `checkAdmin`, `isValidString`, per-type `getXxxItem` helpers |

### 8.1.2 STORAGE Bookmarks (Most Complex)

Storage has 6 endpoints and a private helper function `newBookmarkItem`.

#### Routes

| # | Method | Route Pattern | Handler Summary |
|---|--------|---------------|-----------------|
| 1 | GET | `/{STORAGEDB}/getList/:sortName(name\|mtime)/:sortType(desc\|asc)/:page(0)?` | Calls `StorageTagTool.getBookmarkList(sortName, sortType, user)`. Returns `{ bookmarkList }`. The `:page` param is constrained to literal `0` or absent. |
| 2 | GET | `/{STORAGEDB}/get/:id/:sortName(name\|mtime\|count)/:sortType(desc\|asc)` | Calls `StorageTagTool.getBookmark(id, sortName, sortType, user, session)`. Transforms `result.items` through `getStorageItem(user, items, mediaHadle)`. Returns `{ itemList, parentList, latest, bookmarkID }`. |
| 3 | POST | `/{STORAGEDB}/add` | Validates `req.body.name` via `isValidString(name, 'name')`. Calls `StorageTagTool.addBookmark(name, user, session)`. Reads `parentList.cur` / `parentList.exactly` from `searchTags(session).getArray()`. If `cur` is empty → error. Calls `newBookmarkItem(...)`. Merges result: `{ ...addBookmarkResult, bid?, bname?, other:[]?, select?, option? }`. |
| 4 | DELETE | `/{STORAGEDB}/del/:id` | Calls `StorageTagTool.delBookmark(id)`. Returns `{ id }`. |
| 5 | GET | `/{STORAGEDB}/set/:id/:sortName(name\|mtime\|count)/:sortType(desc\|asc)` | Validates `:id` as `uid`. Finds the item in `STORAGEDB` with `{ _id: id, status: 8 }`. Verifies `btag` and `bexactly` exist on the found item. Calls `StorageTagTool.setLatest(id, session)`, then `Mongo('update', ..., { $inc: { count: 1 } })`, then `StorageTagTool.setBookmark(btag, bexactly, sortName, sortType, user, session)`. Returns `{ itemList, parentList, latest }`. |
| 6 | POST | `/{STORAGEDB}/subscript/:id` | Validates `req.body.path` (non-empty array), `req.body.exactly` (non-empty array), `req.body.name`. Validates `:id` — if it matches the external-ID pattern `/^(yif\|mad)_(.*)$/` it is validated as `'name'`, otherwise as `'uid'`. Validates each element in `path` array. Maps `exactly` to booleans. Calls `addBookmark(name, user, session, bpath, bexactly)` then `newBookmarkItem(...)`. Also fire-and-forget calls `setLatest(id)` and `$inc count` on the external ID. Returns same merged shape as `/add`. |

#### `newBookmarkItem(name, user, session, bpath, bexactly)` — Private Helper

This function creates a new bookmark item document in STORAGEDB. Step-by-step flow:

1. **MD5 Hash Calculation** — Builds a composite string from `bpath` + `bexactly`: each element becomes `"tag/1"` (exact) or `"tag/0"` (non-exact), joined by `/`. Hashes with MD5 → `bookmark_md5`.
2. **Duplicate Check** — `Mongo('count', STORAGEDB, { bmd5: bookmark_md5 })`. If `count > 0`, returns `[null, null, null, null]` (skip, no duplicate created).
3. **Default Tag Collision** — If the normalized name matches a default tag, appends a `'1'` suffix via `addPost(name, '1')`.
4. **Document Construction** — Initialises a document with:
   - `_id`: new `objectID()`
   - `owner`: `user._id`
   - `utime`: Unix timestamp (seconds)
   - `bmd5`, `btag`, `bexactly`: the hash and original path/exactness arrays
   - `size: 0`, `count: 0`, `first: 1`, `recycle: 0`, `adultonly: 0`, `untag: 1`
   - **`status: 8`** — marks this as a bookmark item
5. **Tag Assembly** — Builds a `Set` with seed tags `['bookmark', '書籤']`, then adds:
   - Normalized bookmark name
   - Normalized username
   - Each normalized `bpath` element (unless it is a default tag)
   - Genre tags from `searchTags(session).getArray().cur` (the current parent tags)
6. **Adultonly Detection** — During tag iteration, if any tag is a default tag with `index === 0`, sets `data.adultonly = 1`. This applies to both `bpath` tags and parent tags.
7. **Channel Detection** — If a `bpath` tag is a default tag with `index === 30` and sub-type `'ch'`, extracts a channel ID (integration path exists; currently falls through to the regular bookmark path).
8. **Relative Tag Enrichment** — Calls `StorageTagTool.getRelativeTag(bpath, user, [], bexactly)` to find related tags. Adds them to the set. Names the document `"000 Bookmark {name}"` (the `000` prefix forces sort-to-top).
9. **Final Tag Filtering** — Iterates the accumulated `Set`, filters out default tags (except for detecting `adultonly` one more time). Stores as `data.tags` and `data[user._id]`.
10. **Insert** — `Mongo('insert', STORAGEDB, data)`.
11. **WebSocket Notification** — `sendWs({ type: 'file', data: item._id }, item.adultonly)`.
12. **Option Building** — Builds `opt` array from `GENRE_LIST_CH` excluding already-selected tags. Fetches up to 5 more relative tags. If `checkAdmin(2, user)`, adds `'18+'` to selected or options based on `adultonly`. Adds `'first item'` to selected or options based on `first` field.
13. **Return** — `[item._id, bname, selectedTagsArray, optionTagsArray]`.

### 8.1.3 PASSWORD / STOCK Bookmarks

Each follows an identical 4-endpoint pattern (no `set` or `subscript` endpoints, no `newBookmarkItem` helper):

| Method | Route Pattern | Handler |
|--------|---------------|---------|
| GET | `/{DB}/getList/:sortName(name\|mtime)/:sortType(desc\|asc)/:page(0)?` | `XxxTagTool.getBookmarkList(sortName, sortType, user)` → `{ bookmarkList }` |
| GET | `/{DB}/get/:id/:sortName(name\|mtime\|count)/:sortType(desc\|asc)` | `XxxTagTool.getBookmark(id, sortName, sortType, user, session)` → transforms items through `getXxxItem(user, items)` (no `mediaHadle` param unlike storage). Returns `{ itemList, parentList, latest, bookmarkID }` |
| POST | `/{DB}/add` | Validates `req.body.name` as `'name'`. Calls `XxxTagTool.addBookmark(name, user, session)` → returns result directly |
| DELETE | `/{DB}/del/:id` | `XxxTagTool.delBookmark(id)` → `{ id }` |

**Key difference from storage:** The `add` route does NOT call `newBookmarkItem` — no in-DB bookmark item document is created, no MD5 dedup, no tag assembly, no WebSocket notification.

### 8.1.4 Parameter Constraints (Express Route Regex)

| Parameter | Allowed Values | Used In |
|-----------|---------------|---------|
| `:sortName` | `name`, `mtime` (getList); `name`, `mtime`, `count` (get/set) | All routes |
| `:sortType` | `desc`, `asc` | All routes |
| `:page` | `0` only (optional) | getList routes |
| `:id` | Any string (route-level); validated as `uid` in set/subscript handlers | get, del, set, subscript |

### 8.1.5 External ID Pattern (subscript route)

The `subscript` endpoint recognises 2 external service prefixes:

| Prefix | Likely Source |
|--------|--------------|
| `yif_` | Yify / torrent |
| `mad_` | MAD / external media |

When matched, the ID is validated as `'name'` type (allowing alphanumeric + underscores) instead of `'uid'` (ObjectID format).

### 8.1.6 Error Handling

All routes follow `handleError(err, next)` passing errors to Express error middleware. Specific error conditions:

| Condition | Error Message | Route |
|-----------|--------------|-------|
| Invalid name | `'name is not vaild'` | add, subscript |
| Empty parent list | `'empty parent list!!!'` | add (after addBookmark), subscript |
| Invalid bookmark ID | `'bookmark is not vaild'` | set |
| Item not found / missing btag/bexactly | `'can not find object!!!'` | set |
| Invalid path element | `'path name is not vaild'` | subscript |
| Invalid uid | `'uid is not vaild'` | subscript |

---

## 8.2 parent-router.js

**File:** `src/back/controllers/parent-router.js` (186 lines)

### 8.2.1 Architecture Overview

Parent tags are predefined category groupings. Each collection type exposes 5 endpoints for listing, querying, adding, and deleting parent tag categories.

| Concern | Detail |
|---|---|
| Auth gate | `router.use(checkLogin)` — all routes authenticated |
| TagTool instances | Same 5 instances as bookmark-router |
| Imports | `checkAdmin` used only for storage's adult-only list; per-type `getXxxItem` helpers |

### 8.2.2 STORAGE Parents (Has Admin-Only Feature)

| # | Method | Route Pattern | Handler Summary |
|---|--------|---------------|-----------------|
| 1 | GET | `/{STORAGEDB}/list` | Calls `StorageTagTool.parentList()`, maps each entry to `{ name, show: tw }`. **Admin feature:** If `checkAdmin(2, user)` is true, concatenates `StorageTagTool.adultonlyParentList()` into the result. Returns `{ parentList }`. |
| 2 | GET | `/{STORAGEDB}/taglist/:name/:sortName(name\|mtime)/:sortType(desc\|asc)/:page(\\d+)` | Calls `StorageTagTool.parentQuery(name, sortName, sortType, Number(page), user)`. The `:page` param accepts any digit string (cast to Number). Returns the query result directly. |
| 3 | GET | `/{STORAGEDB}/query/:id/:sortName(name\|mtime\|count)/:sortType(desc\|asc)/:single?` | Calls `StorageTagTool.queryParentTag(id, single, sortName, sortType, user, session)`. Transforms items through `getStorageItem(user, items, mediaHadle)`. Returns `{ itemList, parentList, latest, bookmarkID }`. The optional `:single` param controls single-item mode. |
| 4 | POST | `/{STORAGEDB}/add` | Calls `StorageTagTool.addParent(req.body.name, req.body.tag, user)`. No pre-validation of body fields at route level (delegated to TagTool). |
| 5 | DELETE | `/{STORAGEDB}/del/:id` | Calls `StorageTagTool.delParent(id, user)`. |

### 8.2.3 PASSWORD / STOCK Parents

Each follows the same 5-endpoint pattern as storage with these differences:

- **`/list`**: Calls `XxxTagTool.parentList()` only — **no** `adultonlyParentList()` concatenation (no admin check).
- **`/query`**: Uses `getXxxItem(user, items)` — **no** `mediaHadle` parameter (only storage passes it).
- All other routes are structurally identical.

### 8.2.4 Response Shape Comparison

| Endpoint | Response Fields |
|----------|----------------|
| `/list` | `{ parentList: [{ name, show }] }` |
| `/taglist` | Proxied directly from `parentQuery(...)` result |
| `/query` | `{ itemList, parentList, latest, bookmarkID }` |
| `/add` | Proxied directly from `addParent(...)` result |
| `/del` | Proxied directly from `delParent(...)` result |

### 8.2.5 Parameter Constraints

| Parameter | Allowed Values | Route |
|-----------|---------------|-------|
| `:name` | Any string | taglist |
| `:sortName` | `name`, `mtime` (taglist); `name`, `mtime`, `count` (query) | taglist, query |
| `:sortType` | `desc`, `asc` | taglist, query |
| `:page` | Any non-negative integer (`\\d+`) | taglist |
| `:id` | Any string | query, del |
| `:single` | Optional, any string | query |

---

## 8.3 Cross-File Comparison

| Aspect | bookmark-router | parent-router |
|--------|----------------|---------------|
| Total routes | 22 (6 storage + 4×4 others) | 25 (5 × 5 types) |
| Storage-unique features | `set`, `subscript`, `newBookmarkItem` helper | `adultonlyParentList` for admin(2) |
| Body validation | `isValidString` checks at route level | Delegated to TagTool methods |
| getXxxItem mediaHadle | Storage passes `result.mediaHadle` | Storage passes `result.mediaHadle` |
| Side effects | DB insert, sendWs, count increment | None at route level (delegated to TagTool) |

---

## 8.4 Test Scenarios

### 8.4.1 Authentication & Authorization

| ID | Scenario | Expected |
|----|----------|----------|
| T8-001 | Request any bookmark/parent route without login session | Rejected by `checkLogin` middleware |
| T8-002 | Request `GET /{STORAGEDB}/list` as non-admin user (admin level < 2) | Returns `parentList` without adult-only entries |
| T8-003 | Request `GET /{STORAGEDB}/list` as admin level 2 user | Returns `parentList` concatenated with `adultonlyParentList` entries |
| T8-004 | Non-storage `/list` routes (password, stock) with admin user | Returns `parentList` only — no adult-only entries regardless of admin level |

### 8.4.2 Input Validation

| ID | Scenario | Expected |
|----|----------|----------|
| T8-010 | POST `/storage/add` with empty name `""` | Error: `'name is not vaild'` |
| T8-011 | POST `/storage/add` with name containing injection characters | `isValidString` rejects → error |
| T8-012 | GET `/storage/set/{malformed_id}/name/asc` with non-uid id | Error: `'bookmark is not vaild'` |
| T8-013 | POST `/storage/subscript/{id}` with empty `path` array | Error: `'empty parent list!!!'` |
| T8-014 | POST `/storage/subscript/{id}` with empty `exactly` array | Error: `'empty parent list!!!'` |
| T8-015 | POST `/storage/subscript/{id}` with invalid element in `path` array | Error: `'path name is not vaild'` |
| T8-016 | GET `/storage/getList/invalid_sort/asc` (sortName not name\|mtime) | Express 404 — route regex does not match |
| T8-017 | GET `/storage/getList/name/invalid` (sortType not desc\|asc) | Express 404 — route regex does not match |
| T8-018 | GET `/storage/getList/name/asc/5` (page != 0) | Express 404 — page constrained to `(0)?` |
| T8-019 | POST `/password/add`, `/stock/add` with empty name | Error: `'name is not vaild'` |

### 8.4.3 Empty/Edge Results

| ID | Scenario | Expected |
|----|----------|----------|
| T8-020 | GET `/storage/getList/name/asc` when user has no bookmarks | Returns `{ bookmarkList: [] }` |
| T8-021 | GET `/storage/get/{id}/name/asc` with non-existent bookmark ID | Error propagated from `getBookmark` |
| T8-022 | POST `/storage/add` when `searchTags(session).getArray().cur` is empty | Error: `'empty parent list!!!'` |
| T8-023 | GET `/storage/set/{id}/name/asc` where item exists but has no `btag` | Error: `'can not find object!!!'` |
| T8-024 | GET `/storage/set/{id}/name/asc` where item exists but has no `bexactly` | Error: `'can not find object!!!'` |
| T8-025 | GET `/storage/set/{id}/name/asc` where item `status != 8` | Error: `'can not find object!!!'` (query returns empty) |
| T8-026 | GET `/{type}/taglist/{name}/name/asc/0` with non-existent parent name | Result from `parentQuery` (likely empty list) |

### 8.4.4 Duplicate Bookmark Handling

| ID | Scenario | Expected |
|----|----------|----------|
| T8-030 | POST `/storage/add` when MD5 of btag+bexactly already exists in DB | `newBookmarkItem` returns `[null,null,null,null]`; response contains `addBookmark` result only — no `bid`, `bname`, `select`, `option` fields |
| T8-031 | POST `/storage/add` with same name but different tag paths | Different MD5 → new bookmark item created (not a duplicate) |
| T8-032 | POST `/storage/add` where path tags differ only in `bexactly` flags | Different MD5 → new bookmark item created (exactness affects hash) |

### 8.4.5 External ID Patterns (subscript route)

| ID | Scenario | Expected |
|----|----------|----------|
| T8-040 | POST `/storage/subscript/yif_movie1` | ID validated as `'name'` type |
| T8-041 | POST `/storage/subscript/mad_item` | ID validated as `'name'` type |
| T8-042 | POST `/storage/subscript/unknown_prefix` (no matching pattern) | ID validated as `'uid'` type (ObjectID format) |
| T8-043 | POST `/storage/subscript/invalidObjectId` (non-matching prefix, non-ObjectID) | Error: `'uid is not vaild'` |

### 8.4.6 Storage newBookmarkItem Logic

| ID | Scenario | Expected |
|----|----------|----------|
| T8-050 | Bookmark name matches a default tag after normalize | Name gets `'1'` suffix via `addPost` before insert |
| T8-051 | `bpath` contains a tag where `isDefaultTag` returns `index === 0` | `data.adultonly` set to `1` |
| T8-052 | Parent tags (`searchTags().cur`) contain adult-only default tag | `data.adultonly` set to `1` |
| T8-053 | User is admin(2) and item is `adultonly === 1` | `'18+'` added to `select` array (selected tags) |
| T8-054 | User is admin(2) and item is `adultonly === 0` | `'18+'` added to `option` array (available tags) |
| T8-055 | User is not admin(2) | `'18+'` not present in either `select` or `option` |
| T8-056 | Item has `first === 1` | `'first item'` added to `select` array |
| T8-057 | Item has `first !== 1` | `'first item'` added to `option` array |
| T8-058 | Inserted document has correct `status: 8` | Verified in DB after insert |
| T8-059 | `sendWs` called with `{ type: 'file', data: item._id }` and correct `adultonly` flag | WebSocket notification dispatched |
| T8-060 | `getRelativeTag` returns more than 5 results | Only first 5 relative tags considered for `option` array |

### 8.4.7 Parent Router Specific

| ID | Scenario | Expected |
|----|----------|----------|
| T8-070 | POST `/{type}/add` with valid `name` and `tag` | `addParent` called with `(name, tag, user)` |
| T8-071 | DELETE `/{type}/del/{id}` with valid ID | `delParent` called with `(id, user)` |
| T8-072 | GET `/{type}/query/{id}/name/asc` without `:single` param | `queryParentTag` called with `single = undefined` |
| T8-073 | GET `/{type}/query/{id}/name/asc/1` with `:single` param | `queryParentTag` called with `single = '1'` |
| T8-074 | GET `/{type}/taglist/{name}/name/asc/0` with page `0` | `parentQuery` called with `page = 0` (Number cast) |
| T8-075 | GET `/{type}/taglist/{name}/name/asc/999` with large page number | `parentQuery` called with `page = 999` |

### 8.4.8 Cross-Collection Consistency

| ID | Scenario | Expected |
|----|----------|----------|
| T8-080 | Verify all 3 collection types expose `/getList`, `/get`, `/add`, `/del` bookmark routes | All present in bookmark-router |
| T8-081 | Verify only storage exposes `/set` and `/subscript` bookmark routes | Password, stock do NOT have these |
| T8-082 | Verify all 3 collection types expose `/list`, `/taglist`, `/query`, `/add`, `/del` parent routes | All present in parent-router |
| T8-083 | Verify only storage's `/list` has `adultonlyParentList` | Other types return `parentList()` only |
| T8-084 | Verify storage's `/get` and `/query` pass `mediaHadle` to `getStorageItem` | Other types' `getXxxItem` calls do NOT receive `mediaHadle` |
# Section 9: file-router.js (File Operations)

**File**: `src/back/controllers/file-router.js` (344 lines)
**Mount prefix**: `/f/api/file` (all routes below are relative to this base)
**Auth**: All routes require login via `checkLogin` middleware applied at the router level (line 16–18).

**Imports & Setup**:
- `STORAGEDB`, `NOISE_TIME` from constants
- `Express.Router` — creates `router`
- `fsModule` — destructured to `FsExistsSync` (existsSync) and `FsUnlink` (unlink)
- `MediaHandleTool` — provides `editFile`, `handleTag`, `handleMediaUpload`, `handleMedia`; named exports `errorMedia`, `completeMedia`
- `googleBackup` from `api-tool-google.js`
- `Mongo` — generic MongoDB operation wrapper
- `TagTool(STORAGEDB)` → `StorageTagTool` — tag management bound to STORAGEDB collection
- Utilities: `checkLogin`, `handleError`, `HoError`, `getFileLocation`, `checkAdmin`, `deleteFolderRecursive`, `isValidString`
- `sendWs` — WebSocket broadcast
- `supplyTag`, `isVideo` from mime utilities

---

## PUT /f/api/file/edit/:uid

**Purpose**: Edit a file's metadata (name) and notify connected clients.

**Route handler** (lines 20–33):

### Parameters
| Param | Source | Description |
|-------|--------|-------------|
| `uid` | URL param | File unique identifier |
| `name` | `req.body.name` | New name/value for the file |

### Flow
1. Calls `MediaHandleTool.editFile(uid, name, req.user)` — returns a `result` object containing `id`, `adultonly`, `select`, `option`, `other`.
2. **Side-effects** (fire-and-forget, errors caught with `handleError` label `'Set latest'`):
   - `StorageTagTool.setLatest(result.id, req.session)` — marks the item as most recently accessed.
   - `Mongo('update', STORAGEDB, {_id: result.id}, {$inc: {count: 1}})` — increments the access/edit counter.
3. **WebSocket broadcast**: `sendWs({type: 'file', data: result.id}, result.adultonly)` — notifies clients about the file change, respecting adult-only visibility.
4. **Response**: Returns JSON with the result object, `adultonly` nulled out, and `option` replaced by `supplyTag(result.select, result.option, result.other)` which merges/formats tag arrays.

### Error Handling
- `editFile` rejection → `handleError(err, next)`.
- `setLatest`/`$inc` failure → logged but does NOT fail the request.

### Response Shape
```json
{
  "id": "<ObjectId>",
  "adultonly": null,
  "select": ["<selected tags>"],
  "option": ["<available tag options from supplyTag>"],
  "other": ["<other tags>"],
  ...
}
```

---

## DELETE /f/api/file/del/:uid/:recycle

**Purpose**: Delete or recycle a file. Supports both soft delete (move to recycle bin with Google Drive backup) and permanent delete (remove files from disk and database).

**Route handler** (lines 35–171):

### Parameters
| Param | Source | Description |
|-------|--------|-------------|
| `uid` | URL param | File unique identifier (validated as UID) |
| `recycle` | URL param | `'1'` = permanent delete; anything else = soft delete (move to recycle) |

### Validation (lines 37–44)
1. `isValidString(uid, 'uid')` — rejects invalid UIDs immediately.
2. `Mongo('find', STORAGEDB, {_id: id}, {limit: 1})` — file must exist; error `'file can not be fund!!!'` if not found.

### Shared Helper: `rest()` (lines 45–52)
Executes the final permanent deletion:
- `Mongo('deleteMany', STORAGEDB, {_id: items[0]._id})` — removes the DB record.
- `sendWs({type: 'file', data: items[0]._id}, 1, 1)` — broadcasts with `adultonly=1, auth=1` (admin-only visibility).
- Returns `{apiOK: true}`.

### Branch A: Permanent Delete (`recycle === '1' && checkAdmin(1)`) — lines 54–116

**Precondition**: `items[0].recycle` must already equal `1` (item must be in recycle bin). Error `'recycle file first!!!'` otherwise.

#### Sub-branch A1: Status 7 or 8, or has `thumb` (line 58–59)
- These are external references or thumbnail-only records with no main file on disk.
- **Action**: Call `rest()` directly → `deleteMany` only, no filesystem operations.

#### Sub-branch A2: Status 9 — Playlist (lines 60–80)
Playlists have a folder structure and potentially a compressed archive file.

1. `deleteFolderRecursive(filePath)` — removes the playlist folder and all contents.
2. **Detect archive type** (line 62):
   - Check in order: `{filePath}_zip` → `{filePath}_7z` → `{filePath}.1.rar`
   - Sets `zip_filePath` to the first match, or `null` if none.
3. **If archive exists**:
   - Build `del_arr` starting with the archive file.
   - Detect companion files:
     - `{filePath}_zip_c` (zip checksum companion)
     - `{filePath}_7z_c` (7z checksum companion)
     - If RAR: iterate `{filePath}.{N}.rar` from N=2 upward while files exist (multi-part RAR).
   - `Promise.all(del_arr.map(unlink))` → then `rest()`.
4. **If no archive**: Call `rest()` directly.

#### Sub-branch A3: Other statuses — Regular file (lines 81–116)
Deletes the main file plus all associated sidecar files:

| File pattern | Description |
|---|---|
| `{filePath}` | Main file |
| `{filePath}.jpg` | Thumbnail image |
| `{filePath}_s.jpg` | Small/secondary thumbnail |
| `{filePath}.srt` | SRT subtitle |
| `{filePath}.srt1` | Alternate SRT subtitle |
| `{filePath}.ass` | ASS subtitle |
| `{filePath}.ass1` | Alternate ASS subtitle |
| `{filePath}.ssa` | SSA subtitle |
| `{filePath}.ssa1` | Alternate SSA subtitle |
| `{filePath}.vtt` | WebVTT subtitle |

Each is checked with `FsExistsSync` before adding to `del_arr`.

Additionally removes directories (unconditionally, via `deleteFolderRecursive`):
- `{filePath}_doc` — extracted documents
- `{filePath}_img` — extracted images
- `{filePath}_present` — presentation files
- `{filePath}_sub` — subtitle files

Then `Promise.all(del_arr.map(unlink))` → `rest()`.

### Branch B: Soft Delete / Recycle (`recycle !== '1'` or non-admin) — lines 117–131

#### Ownership Check (line 118–119)
Non-admin users must own the file:
- `isValidString(items[0].owner, 'uid')` must be valid AND `req.user._id.equals(items[0].owner)`.
- Error `'file is not yours!!!'` if neither condition met.

#### Google Drive Backup via `recur_backup(recycle)` (lines 132–169)
Recursive function that attempts Google Drive backup **up to 3 times** (recycle starts at 1, continues while `recycle < 4`, i.e., values 1, 2, 3).

##### Backup skip conditions (line 133):
- Status 7, 8, or has `thumb` → `Promise.resolve()` (no backup needed).

##### Status 9 — Playlist backup (lines 135–160):
1. If `playList.length > 0`:
   - Detect archive file (same zip/7z/rar detection as permanent delete).
   - If archive exists: `googleBackup(user, id, name, zip_filePath, tags, recycle)`.
   - Then iterate playlist items via `recur_playlist_backup(index)`:
     - For each index, checks if `{filePath}/{index}_complete` exists.
     - If complete: `googleBackup(user, id, playList[index], bufferPath, tags, recycle, '_complete')`.
     - After last playlist item: increment `recycle`, recurse `recur_backup` if `recycle < 4`.
2. If `playList` is empty → `Promise.resolve()`.

**Bug note (line 159)**: The `.then(() => rest2)` should likely be `.then(() => rest2())` — the function reference is returned instead of being called. This means after a successful backup of a playlist item with `_complete`, the recursion to the next item may not execute properly.

##### Other statuses — Single file backup (lines 161–168):
- `googleBackup(user, id, name, filePath, tags, recycle)`.
- Increment `recycle`, recurse if `recycle < 4`.

#### After backup completes (lines 121–130):
- `Mongo('update', ..., {$set: {recycle: 1, utime: <current_epoch_seconds>}})` — marks item as recycled.
- `sendWs({type: 'file', data: id}, items[0].adultonly)` — broadcasts change.
- Returns `{apiOK: true}`.

---

## GET /f/api/file/media/:action(act|del)/:uid/:index(\d+|v)?

**Purpose**: Process or cancel media operations (transcoding, uploading, etc.) for a file's media attachments.

**Route handler** (lines 173–261):

### Parameters
| Param | Source | Validation | Description |
|-------|--------|------------|-------------|
| `action` | URL param | Regex: `act` or `del` | Action to perform |
| `uid` | URL param | `isValidString(uid, 'uid')` | File unique identifier |
| `index` | URL param (optional) | Regex: `\d+` or literal `v` | Playlist index or `'v'` for first video |

### Authorization
- **Admin only**: `checkAdmin(1, req.user)` — returns `'permission denied'` for non-admins.

### Validation (lines 178–189)
1. UID must be valid.
2. File must exist in database.
3. File must have `mediaType` property — error `'this file is not media!!!'` otherwise.

### Action: `'act'` — Process Media (lines 191–231)

Computes `filePath = getFileLocation(owner, id)`.

#### Case 1: Single media (`items[0].mediaType.type` exists) — lines 193–195

Determines which handler to call based on presence of `.key`:

| Condition | Handler Called |
|---|---|
| No `.key` | `handleMediaUpload(mediaType, filePath, id, user)` |
| Has `.key` AND (not `.complete` AND elapsed > `NOISE_TIME`) | `handleMediaUpload(mediaType, filePath, id, user, key)` — re-upload stale incomplete media |
| Has `.key` AND (`.complete` OR elapsed ≤ `NOISE_TIME`) | `handleMedia(mediaType, filePath, id, key, user)` — continue processing |

On error: `errorMedia(id, fileIndex)` is called to mark the media as errored.
Response: `{apiOK: true}`.

#### Case 2: Playlist with specific index (`req.params.index` present) — lines 196–219

1. If `index === 'v'`: iterates `playList` to find the first video item (via `isVideo()`), replaces `index` with that numeric index.
2. Validates that `{filePath}/{mediaType[index].fileIndex}_complete` exists — error `'need complete first'` if not.
3. Searches `mediaType` object for entry where `mediaType[i].fileIndex === Number(index)`.
4. If no matching `fileIndex` found → error `'cannot find media'`.
5. Applies same handler logic as single media (key/complete/NOISE_TIME check).
6. On error: `errorMedia(id, fileIndex)`.
7. Response: `{apiOK: true}`.

#### Case 3: Playlist without index — process ALL completed items (lines 220–231)

1. Iterates all entries in `mediaType`, collecting those with existing `_complete` files into `handleItems`.
2. If none have `_complete` → error `'need complete first'`.
3. `Promise.all(handleItems.map(...))` — processes all completed items **in parallel**.
4. Each item uses the same key/complete/NOISE_TIME handler selection logic.
5. Individual errors are caught with `errorMedia` per item (non-fatal to other items).
6. Response: `{apiOK: true}`.

**Note**: The `case 'act'` block is missing a `break` statement (line 231→232). Execution falls through to `case 'del'` if none of the `return` statements execute. In practice, all three sub-branches contain `return`, so this is not a runtime issue but is a code smell.

### Action: `'del'` — Cancel Media Processing (lines 232–257)

#### Case 1: Single media (`mediaType.type` exists) — lines 233–234
- `completeMedia(id, status, fileIndex)`:
  - If current `status === 1` → sets status to `0`.
  - Otherwise preserves current status.
- Response: `{apiOK: true}`.

#### Case 2: Playlist with items — lines 236–256
1. Iterates `mediaType` entries to detect:
   - `is_empty` — whether `mediaType` has any enumerable properties at all.
   - `handleItems` — entries with existing `_complete` files.
2. **If `mediaType` is empty** (no entries):
   - `Mongo('update', ..., {$unset: {mediaType: ''}})` — removes the `mediaType` field entirely.
   - `sendWs` broadcast.
   - Response: `{apiOK: true}`.
3. **If no completed items**: error `'need complete first'`.
4. **Otherwise**: `Promise.all(handleItems.map(m => completeMedia(id, 0, m.fileIndex)))` — cancels all completed items in parallel with status `0`.
5. Response: `{apiOK: true}`.

---

## GET /f/api/file/feedback

**Purpose**: Retrieve files that need tagging feedback from the current user (or all users if admin and user has none).

**Route handler** (lines 264–342):

### Parameters
None (uses `req.user` for identity).

### Flow

#### Step 1: Query user's untagged items (lines 266–272)
```
Mongo('find', STORAGEDB, {untag: 1, owner: req.user._id}, {sort: ['utime','desc'], limit: 20})
```

#### Step 2: Admin fallback (lines 273–276)
If no items returned AND user is admin (`checkAdmin(1, req.user)`):
```
Mongo('find', STORAGEDB, {untag: 1}, {sort: ['utime','desc'], limit: 20})
```
This retrieves **all** untagged items regardless of owner.

#### Step 3: Process each item via `getFeedback()` (lines 279–325)
For each item, calls `MediaHandleTool.handleTag(filePath, {time, height}, name, '', status)` which returns `[mediaType, mediaTag, DBdata]`.

**Tag assembly logic**:

1. **Initialize `temp_tag` array** (will become tag options/suggestions).
2. **`first item` tag**:
   - If `item.first === 1`: added to `item.tags` (selected).
   - Otherwise: added to `temp_tag` (available option).
3. **`18+` tag**:
   - If `item.adultonly === 1`: added to `item.tags` (selected).
   - Otherwise: only added to `temp_tag` if `checkAdmin(2, req.user)` (level-2 admin).
4. **Media-suggested tags** (`mediaTag.opt`): each tag not already in `item.tags` is added to `temp_tag`.
5. `temp_tag = supplyTag(item.tags, temp_tag)` — finalizes/deduplicates tags.

#### Step 4: Build response — Admin vs Non-admin (lines 302–324)

**Non-admin** (lines 302–315):
- Reads `item[req.user._id.toString()]` as the user's personal tag selections.
- Removes the user's selected tags from the global `item.tags` array (they become `other`).
- Response per item:
  ```json
  {
    "id": "<ObjectId>",
    "name": "<filename>",
    "select": { "<user's personal tag selections>" },
    "option": ["<computed from supplyTag>"],
    "other": ["<remaining global tags minus user's>"]
  }
  ```

**Admin** (lines 316–324):
- `select` = full `item.tags` array.
- `option` = computed `temp_tag`.
- `other` = empty array `[]`.
- Response per item:
  ```json
  {
    "id": "<ObjectId>",
    "name": "<filename>",
    "select": ["<all tags>"],
    "option": ["<suggested tags>"],
    "other": []
  }
  ```

#### Step 5: Sequential processing via `recur_feedback(index)` (lines 326–339)
Items are processed **sequentially** (not in parallel) via recursive calls. Each result is pushed to `feedback_arr`.

### Response Shape
```json
{
  "feedbacks": [
    {
      "id": "<ObjectId>",
      "name": "<string>",
      "select": "<array or object>",
      "option": ["<string>"],
      "other": ["<string>"]
    }
  ]
}
```

Returns empty `feedbacks: []` if no untagged items exist (even after admin fallback).

---

## Test Scenarios

### PUT /edit/:uid
1. **Successful edit**: Verify `editFile` is called with correct params, response includes `supplyTag`-processed options, `adultonly` is nulled.
2. **Side-effect failure isolation**: `setLatest` or `$inc` failure must NOT affect the HTTP response (fire-and-forget).
3. **WebSocket notification**: Verify `sendWs` is called with correct `type:'file'` and `adultonly` value from result.
4. **Invalid user/auth**: Ensure `checkLogin` middleware rejects unauthenticated requests.

### DELETE /del/:uid/:recycle — Permanent Delete Branches
5. **Invalid UID**: Non-valid UID string → error response.
6. **File not found**: Valid UID but no matching document → `'file can not be fund!!!'`.
7. **Permanent delete without prior recycle**: `recycle=1`, admin, but `items[0].recycle !== 1` → `'recycle file first!!!'`.
8. **Perm delete status 7**: Admin, recycled, status=7 → `deleteMany` only, no filesystem ops, `sendWs(adultonly=1, auth=1)`.
9. **Perm delete status 8**: Same as status 7 path.
10. **Perm delete thumb item**: Item has `thumb` property → `deleteMany` only.
11. **Perm delete status 9 (playlist) with zip**: Verify `deleteFolderRecursive` called, zip file + `_zip_c` companion deleted.
12. **Perm delete status 9 with 7z**: `_7z` file + `_7z_c` companion detected and deleted.
13. **Perm delete status 9 with multi-part RAR**: `.1.rar` detected, iteration finds `.2.rar`, `.3.rar`, etc.
14. **Perm delete status 9 no archive**: Folder deleted, `rest()` called directly.
15. **Perm delete regular file**: All sidecar files (.jpg, _s.jpg, .srt, .srt1, .ass, .ass1, .ssa, .ssa1, .vtt) conditionally deleted; `_doc`, `_img`, `_present`, `_sub` folders always attempted.
16. **Perm delete regular file — partial sidecars**: Only existing sidecar files added to `del_arr`; missing ones skipped.

### DELETE /del/:uid/:recycle — Soft Delete Branches
17. **Non-admin, not owner**: Verify `'file is not yours!!!'` error.
18. **Non-admin, valid owner**: Backup runs, `recycle=1` set, `utime` updated, `sendWs` with item's `adultonly`.
19. **Admin soft delete**: Ownership check skipped, same backup + recycle flow.
20. **Backup skip for status 7/8/thumb**: `recur_backup` resolves immediately.
21. **Backup for status 9 playlist with archive**: `googleBackup` called for zip, then each `_complete` playlist item.
22. **Backup for status 9 playlist without archive**: Skips zip backup, still iterates playlist items.
23. **Backup for status 9 empty playlist**: `recur_backup` resolves immediately.
24. **Backup retry logic**: Verify `recur_backup` is called up to 3 times (recycle values 1, 2, 3) for non-skip statuses.
25. **Backup for regular file**: `googleBackup` called with file path, retried up to 3 times.
26. **Bug: `recur_playlist_backup` line 159**: `.then(() => rest2)` returns function reference instead of calling `rest2()` — verify behavior/document expected vs actual.

### GET /media/:action/:uid/:index — `act` Action
27. **Non-admin access**: Verify `'permission denied'` error.
28. **Invalid UID**: Error response.
29. **File not found**: `'cannot find file!!!'`.
30. **No mediaType**: `'this file is not media!!!'`.
31. **Single media, no key**: `handleMediaUpload` called without key.
32. **Single media, key, not complete, elapsed > NOISE_TIME**: `handleMediaUpload` called with key (re-upload stale).
33. **Single media, key, complete**: `handleMedia` called (continue processing).
34. **Single media, key, not complete, elapsed ≤ NOISE_TIME**: `handleMedia` called (too soon to re-upload).
35. **Single media error**: Verify `errorMedia(id, fileIndex)` invoked on handler failure.
36. **Playlist index='v'**: First video in `playList` found via `isVideo()`, index replaced.
37. **Playlist index='v' no video**: Index remains `'v'`, likely causes `_complete` check failure.
38. **Playlist numeric index, no _complete file**: `'need complete first'`.
39. **Playlist numeric index, no matching fileIndex**: `'cannot find media'`.
40. **Playlist numeric index, valid**: Correct handler invoked based on key/complete/NOISE_TIME.
41. **Playlist no index, all completed**: All items processed in parallel.
42. **Playlist no index, some completed**: Only completed items processed.
43. **Playlist no index, none completed**: `'need complete first'`.

### GET /media/:action/:uid/:index — `del` Action
44. **Single media, status=1**: `completeMedia` called with status `0`.
45. **Single media, status≠1**: `completeMedia` called with current status.
46. **Playlist, empty mediaType**: `$unset mediaType` + `sendWs` broadcast.
47. **Playlist, items but none complete**: `'need complete first'`.
48. **Playlist, completed items**: `completeMedia` called for each with status `0`.

### GET /feedback
49. **User has untagged items**: Returns up to 20 items, sorted by `utime` desc.
50. **User has no items, is admin**: Falls back to ALL untagged items.
51. **User has no items, not admin**: Returns empty `feedbacks: []`.
52. **`first` flag handling**: `first === 1` → tag in `select`; otherwise in `option`.
53. **`adultonly` flag handling**: `adultonly === 1` → tag in `select`; otherwise → only if `checkAdmin(2)`.
54. **Admin tag visibility**: `select` = all `item.tags`, `other` = empty.
55. **Non-admin tag visibility**: `select` = user's personal tags, `other` = remaining global tags.
56. **Non-admin tag removal**: User's personal selections removed from global tags before populating `other`.
57. **Sequential processing**: Items processed one-at-a-time via `recur_feedback`, not in parallel.
58. **`handleTag` integration**: Verify `mediaTag.opt` suggestions merged correctly, duplicates excluded.
# Section 10: file-other-router.js (File Server Utilities)

## Overview

**File:** `src/back/controllers/file-other-router.js` (753 lines)  
**Mount point:** `/f` (via `app.use('/f', OtherRouter)` in `file-server.js`)  
**Purpose:** Serves file previews, video streams, subtitles, images, documents, and file uploads. All file serving uses the **nginx X-Accel-Redirect (sendfile) pattern** — the Node.js process sets `X-Forwarded-Path`, `X-Forwarded-Type`, and optionally `X-Forwarded-Name` headers, then responds with a minimal body; nginx intercepts these headers and streams the actual file to the client.

**Key dependencies:**

| Import | Role |
|---|---|
| `Mongo` / `objectID` | MongoDB operations on `STORAGEDB` collection |
| `Redis` | Read-position tracking for documents/presentations |
| `MediaHandleTool` | Post-upload media processing (transcoding, thumbnails) |
| `PlaylistApi` | Torrent playlist creation from magnet links |
| `TagTool` (as `StorageTagTool`) | Tag management, latest-item tracking, relative-tag suggestions |
| `ReadTorrent` | Parse `.torrent` files into torrent metadata |
| `SRT2VTT` | Convert SRT/ASS/SSA subtitle files to WebVTT format |
| `sendWs` | WebSocket push notifications to connected clients |

**Status code reference** (used throughout for type dispatch):

| `status` | Meaning | File structure |
|---|---|---|
| 0 | Raw/unprocessed file | Base file path |
| 2 | Image | `{filePath}.jpg` (preview), file at base path |
| 3 | Video (single file) | Base path + `_complete` fallback, `_s.jpg` preview |
| 4 | Music/audio | Base path + `_complete` fallback |
| 5 | Document (doc/sheet) | `_doc/` directory with HTML pages, `document.jpg` preview |
| 6 | Presentation | `_present/` directory with SVG slides, `presentation.jpg` preview |
| 7 | Pending download (URL-type) | No local file yet |
| 9 | Playlist/torrent | `{filePath}/{index}` per playlist item |
| 10 | PDF | `_pdf/` directory with per-page PDFs, `pdf.png` preview |

---

## Endpoints

---

### GET /f/preview/:uid

**Purpose:** Serve a preview thumbnail/icon for a file item.

**Authentication:** `checkLogin` (inline, default type — any logged-in user).

**Flow:**

1. Validate `uid` via `isValidString(uid, 'uid')`.
2. Query `STORAGEDB` for the item by `_id`.
3. Reject if not found or status not in `{2, 3, 5, 6, 10}`.
4. Select preview path based on status:

| Status | Preview path | Description |
|---|---|---|
| 5 | `STATIC_PATH/document.jpg` | Generic document icon |
| 6 | `STATIC_PATH/presentation.jpg` | Generic presentation icon |
| 10 | `STATIC_PATH/pdf.png` | Generic PDF icon |
| 2 | `{filePath}.jpg` (with `_complete` fallback) | Image thumbnail |
| 3 | `{filePath}_s.jpg` (with `_complete` fallback) | Video small thumbnail |

5. Check file existence, return error if missing.
6. Respond with `X-Forwarded-Path` and `X-Forwarded-Type: image/jpeg`.

**`_complete` fallback logic:** If `{filePath}_complete` exists, that path is used as the base before appending `.jpg` or `_s.jpg`.

**Response headers:**

| Header | Value |
|---|---|
| `X-Forwarded-Path` | Absolute filesystem path to preview image |
| `X-Forwarded-Type` | `image/jpeg` |

**Test scenarios:**

| Scenario | Input | Expected |
|---|---|---|
| Valid document (status=5) | uid of doc item | 200, path → `STATIC_PATH/document.jpg` |
| Valid presentation (status=6) | uid of pres item | 200, path → `STATIC_PATH/presentation.jpg` |
| Valid PDF (status=10) | uid of PDF item | 200, path → `STATIC_PATH/pdf.png` |
| Valid image (status=2) | uid of image item | 200, path → `{filePath}.jpg` |
| Valid image with `_complete` | uid, `_complete` exists | 200, path → `{filePath}_complete.jpg` |
| Valid video (status=3) | uid of video item | 200, path → `{filePath}_s.jpg` |
| Missing file on disk | uid valid but file gone | Error: "cannot find file!!!" |
| Invalid uid format | `"not-a-uid"` | Error: "uid is not vaild" |
| Item not found in DB | nonexistent uid | Error: "cannot find file!!!" |
| Status not previewable (e.g. 0, 4, 7, 9) | uid of status=0 item | Error: "cannot find file!!!" |
| Not logged in | No session | Redirect/error from checkLogin |

---

### GET /f/video/:uid/file

**Purpose:** Serve a single video file (status 3 or 4) for streaming playback.

**Authentication:** `checkLogin` (default type).

**Route pattern:** `/video/:uid/file` — note the literal `/file` suffix.

**Flow:**

1. Validate `uid`.
2. Query DB, reject if not found or status not in `{3, 4}`.
3. Compute video path: `getFileLocation(owner, _id)`.
4. Try `{videoPath}_complete` first; fall back to `{videoPath}` if `_complete` doesn't exist.
5. Return error if neither path exists.
6. Respond with `X-Forwarded-Path` and `X-Forwarded-Type: video/mp4`.

**Note:** Commented-out code shows a previous implementation that handled HTTP Range requests for partial content (206 responses). This is now delegated to nginx.

**Test scenarios:**

| Scenario | Expected |
|---|---|
| Status=3 video, `_complete` exists | 200, serves `_complete` path |
| Status=3 video, only base exists | 200, serves base path |
| Status=4 music file | 200, serves as `video/mp4` |
| Neither path exists | Error: "cannot find file!!!" |
| Status not 3 or 4 | Error: "cannot find video!!!" |

---

### GET /f/subtitle/:uid/:lang/:index(\\d+|v)/:fresh(0+)?

**Purpose:** Serve a WebVTT subtitle file for a video.

**Authentication:** `checkLogin` with `type=1` (elevated access).

**Route parameters:**

| Param | Pattern | Description |
|---|---|---|
| `uid` | string | MongoDB ObjectId or external ID (prefixed: `you_`, `dym_`, `bil_`, etc.) |
| `lang` | string | Language code; `"en"` triggers English subtitle path suffix `.en` |
| `index` | `\d+` or `v` | Playlist index number, or `v` to auto-find first video |
| `fresh` | `0+` (optional) | Cache-busting parameter (one or more zeros) |

**External ID prefix mapping:**

| Prefix | Platform | Storage key |
|---|---|---|
| `yif_` | Yify | `yify` |
| `mad_` | MAD/DM5 | `dm5` |

**Flow — external IDs (prefix match):**

1. Validate uid as `'name'` type.
2. Map prefix → platform storage key.
3. Build file path via `getFileLocation(platform, id)`.
4. Call `sendSub(filePath)` (no index).

**Flow — internal IDs (MongoDB ObjectId):**

1. Validate uid as `'uid'` type.
2. Query DB, reject if not found.
3. Reject if status is not 3 (single video) or 9 (playlist).
4. For status=3: `sendSub(getFileLocation(owner, _id))`.
5. For status=9 (playlist):
   - If `index` is numeric, use that playlist index.
   - If `index` is `'v'` or absent, iterate `playList` to find first video entry via `isVideo()`.
   - Reject if selected playlist item is not a video.
   - Call `sendSub(filePath, fileIndex)`.

**`sendSub` inner function:**

1. If `fileIndex` provided: append `/{fileIndex}` to path.
2. If `lang === 'en'`: look for `{path}.en.vtt`.
3. Otherwise: look for `{path}.vtt`.
4. If `.vtt` file exists, serve it; otherwise serve `STATIC_PATH/123.vtt` (empty/default subtitle).
5. Respond with `X-Forwarded-Type: text/vtt`.

**Test scenarios:**

| Scenario | Expected |
|---|---|
| External `you_xxx`, lang=en, .en.vtt exists | Serves `.en.vtt` |
| External `bil_xxx`, lang=zh, .vtt missing | Serves fallback `123.vtt` |
| Internal status=3, .vtt exists | Serves subtitle |
| Internal status=9, index=2, video at index 2 | Serves `{path}/2.vtt` |
| Internal status=9, index=v, first video at index 5 | Serves `{path}/5.vtt` |
| Internal status=9, index points to non-video | Error: "file type error!!!" |
| Internal status=2 (image) | Error: "file type error!!!" |
| Item not found | Error: "cannot find file!!!" |

---

### GET /f/torrent/:index(\\d+|v)/:uid/:type(images|resources|\\d+)/:number(image\\d+.png|sheet\\.css|0+)?

**Purpose:** Serve individual files from a playlist/torrent item — videos, documents, images, or raw downloads.

**Authentication:** `checkLogin` (default type).

**Route parameters:**

| Param | Pattern | Description |
|---|---|---|
| `index` | `\d+` or `v` | Playlist index or `v` for auto-first-video |
| `uid` | string | MongoDB ObjectId |
| `type` | `images`, `resources`, or `\d+` | Sub-resource type or page number |
| `number` | `imageN.png`, `sheet.css`, or `0+` | Optional sub-resource filename or reset marker |

**Flow:**

1. Parse `index`: numeric → use directly; `'v'` → iterate `playList` to find first video.
2. Validate uid, query DB.
3. Compute `bufferPath = getFileLocation(owner, _id) + '/' + fileIndex`.
4. Determine content type from playlist entry:

| Detection | Type code | Behavior |
|---|---|---|
| `isImage()` | 2 | Image handling |
| `isVideo()` or `isMusic()` | 1 | Video/audio streaming |
| `isDoc()` or `isZipbook()` | 4 | Document/book rendering |
| Everything else | 3 | Raw file download |

**Type 1 — Video/Audio:**
- Try `{bufferPath}_complete`, fall back to `{bufferPath}`.
- Reject if `{bufferPath}_error` exists (encoding failure).
- Serve with `X-Forwarded-Type: video/mp4`.

**Type 4 — Document/Book (complex sub-routing):**

| `type` param | `number` param | Served path | MIME |
|---|---|---|---|
| `images` | `imageN.png` | `{bufferPath}_doc/images/{number}` | `image/jpeg` |
| `resources` | `sheet.css` | `{bufferPath}_doc/resources/sheet.css` | `text/css` |
| Numeric (page) | — | Depends on doc extension type (see below) | Varies |
| `0+` (reset) | — | First page of document | Varies |

**Document page serving by extension type (`isDoc()` result):**

| `ext.type` | Path pattern | MIME |
|---|---|---|
| `present` | `{bufferPath}_present/{page}.svg` | `image/svg+xml` |
| `pdf` | `{bufferPath}_pdf/{completeZero(page,3)}.pdf` | `application/pdf` |
| `doc`/`sheet` | `{bufferPath}_doc/doc{page}.html` | `text/html` |
| No ext / image-based | `{bufferPath}_img/{page}` | `image/jpeg` |

**Redis read-position tracking:** For type 4, the current page and file index are stored in Redis hash `record: {userId}` with key `{itemId}` and value `{page}&{fileIndex}`. At first/last item boundaries, the record is deleted (`hdel`).

**Type 2 (Image) and Type 3 (Other):**
- Track position in Redis (same boundary logic: `hdel` at first/last item).
- For type 3: serve `{bufferPath}_complete` with download disposition header.
- If `_complete` doesn't exist, error: "need download first!!!".

**Test scenarios:**

| Scenario | Expected |
|---|---|
| Video at index 3, `_complete` exists | 200, `video/mp4`, serves `_complete` |
| Video at index 3, `_error` exists | Error: "video error!!!" |
| Doc page 5, ext=present | Serves `_present/5.svg` |
| Doc page 12, ext=pdf | Serves `_pdf/012.pdf` |
| Doc page 3, ext=doc | Serves `_doc/doc3.html` |
| Doc images sub-resource | Serves `_doc/images/imageN.png` |
| Doc resources sub-resource | Serves `_doc/resources/sheet.css` |
| Type=`0+` reset, ext=present | Reset record, serve page 1 |
| Index=`v`, first video at idx 7 | Auto-selects index 7 |
| Non-video/doc file, `_complete` missing | Error: "need download first!!!" |
| First or last playlist item | Redis record deleted (hdel) |
| Middle playlist item | Redis record set (hmset) |

---

### GET /f/image/:uid/:type(file|images|resources|\\d+)/:number(image\\d+.png||sheet\\.css)?

**Purpose:** Serve images, document pages, and presentation slides for non-playlist items.

**Authentication:** `checkLogin` with `type=1` (elevated).

**Route parameters:**

| Param | Pattern | Description |
|---|---|---|
| `uid` | string | MongoDB ObjectId |
| `type` | `file`, `images`, `resources`, or `\d+` | Content type or page number |
| `number` | `imageN.png`, empty, or `sheet.css` | Optional sub-resource |

**Flow:**

1. Validate uid, query DB.
2. If item has no `present` field AND status is not 5, 6, or 10 → serve base `filePath` as `image/jpeg`.
3. If `type` is `images` or `resources` → serve doc sub-resource (same as torrent type 4).
4. If `type` is numeric (page number):
   - Track position in Redis.
   - Serve page based on status:

| Status | Path pattern | MIME |
|---|---|---|
| 6 (presentation) | `{filePath}_present/{page}.svg` | `image/svg+xml` |
| 5 (document) | `{filePath}_doc/doc{page}.html` | `text/html` |
| 10 (PDF) | `{filePath}_pdf/{completeZero(page,3)}.pdf` | `application/pdf` |
| Other (image book) | `{filePath}_img/{page}` | `image/jpeg` |

5. If `type` is `file` (initial load without page number):
   - Read last position from Redis via `hget`.
   - Resume from saved position, or default to first page.

**Redis position tracking:**
- Page 1 (or value matching `present` count) triggers `hdel` (clear position).
- Other pages trigger `hmset` to save position.
- For status=5: page `'1'` is mapped to empty string `''` (serves `doc.html` root).

**Test scenarios:**

| Scenario | Expected |
|---|---|
| Plain image (no present, status≠5/6/10) | Serves `{filePath}` as `image/jpeg` |
| Presentation slide 3 | Serves `_present/3.svg` |
| Document page 2 | Serves `_doc/doc2.html` |
| PDF page 5 | Serves `_pdf/005.pdf` |
| Image book page 10 | Serves `_img/10` as `image/jpeg` |
| type=`file`, saved position=7 | Resumes at page 7 |
| type=`file`, no saved position, status=6 | Serves `_present/1.svg` |
| type=`file`, no saved position, status=5 | Serves `_doc/doc.html` |
| type=`file`, no saved position, status=10 | Serves `_pdf/001.pdf` |
| Sub-resource `images/image3.png` | Serves `_doc/images/image3.png` |

---

### GET /f/download/:uid

**Purpose:** Download a file item with proper disposition headers.

**Authentication:** `checkLogin` (default type).

**Flow:**

1. Validate uid, query DB, reject if not found.
2. Compute base `filePath` from `getFileLocation(owner, _id)`.
3. **Status=9 (playlist) special handling:**
   - If item has `magnet` field → decode magnet URL, write to temp text file, serve as `.txt` download.
   - If item has `mega` field → same as magnet, decode and serve as `.txt`.
   - Otherwise → look for archive: `{filePath}_7z` → `{filePath}.1.rar` → `{filePath}_zip` (first that exists).
4. Side effects: `setLatest()` and increment `count` field.
5. If `ret_string` (magnet/mega):
   - Write decoded URL to random temp file in `NAS_TMP`.
   - Serve with `X-Forwarded-Name` as `{name}.txt` attachment.
6. Otherwise: serve file directly with `X-Forwarded-Name` as original filename.

**Download type resolution for status=9:**

| Condition | Download source |
|---|---|
| `item.magnet` exists | Decoded magnet URI → temp `.txt` file |
| `item.mega` exists | Decoded mega URI → temp `.txt` file |
| `{filePath}_7z` exists | 7z archive |
| `{filePath}.1.rar` exists | RAR archive |
| `{filePath}_zip` exists | ZIP archive |
| None found | Error: "cannot find file!!!" |

**Test scenarios:**

| Scenario | Expected |
|---|---|
| Regular file (status≠9) | 200, download with original filename |
| Playlist with magnet | 200, `.txt` file with magnet URI |
| Playlist with mega | 200, `.txt` file with mega URI |
| Playlist with `_7z` archive | 200, download archive |
| Playlist with `.1.rar` | 200, download RAR |
| Playlist with `_zip` | 200, download ZIP |
| No file found on disk | Error: "cannot find file!!!" |
| Item not in DB | Error: "cannot find file!!!" |
| Side effect: count increment | `count` field incremented by 1 |
| Side effect: latest tracking | `setLatest` called on item |

---

## Cross-Cutting Concerns

### Nginx Sendfile Pattern

All file-serving endpoints use the same pattern:

```javascript
res.writeHead(200, {
    'X-Forwarded-Path': absoluteFilePath,
    'X-Forwarded-Type': mimeType,        // for inline content
    'X-Forwarded-Name': disposition,      // for downloads
});
res.end('ok');
```

Nginx intercepts these headers and performs the actual file transfer via `X-Accel-Redirect`, offloading I/O from Node.js. The commented-out code throughout the file shows the previous direct-streaming implementation.

### Error Handling Pattern

All endpoints follow:
- Input validation errors → `handleError(new HoError(message), next)`
- DB/async errors → `.catch(err => handleError(err, next))`
- Some inner errors omit `next`, relying on the HoError to propagate

### Authentication Levels

| `checkLogin` call | Access level |
|---|---|
| `checkLogin(req, res, cb)` | Any logged-in user |
| `checkLogin(req, res, cb, 1)` | Elevated access (type=1) |

Endpoints using type=1: `/subtitle`, `/image`.

### Redis Read-Position Tracking

Used by `/torrent` (type 4 docs) and `/image` endpoints to remember where a user left off reading a multi-page document, presentation, or image book. Stored in Redis hash `record: {userId}` as `{itemId} → "{page}&{fileIndex}"` (torrent) or `{itemId} → "{page}"` (single item). Boundary positions (first/last item) trigger deletion rather than storage.

### External Platform ID System

External content from third-party platforms uses prefixed IDs (`you_`, `bil_`, `dym_`, etc.) stored in platform-specific directories. The prefix is stripped and mapped to a platform name for `getFileLocation()`. This pattern appears in `/subtitle` (GET and POST).

### File Location Resolution

`getFileLocation(owner, id)` maps an owner (userId or platform string) and item ID to an absolute filesystem path. The `_complete` suffix indicates a transcoded/processed version of the original file.
# Section 11: external-router.js (External Sources & Subtitles)

## Overview

The largest router in the application (1188 lines), `external-router.js` manages all external media source integrations, Google Drive uploads, and Kindle delivery. It orchestrates interactions with third-party APIs including OpenSubtitles (v1 and v2), Google Drive, YIFY, DM5, and Mega.

**File:** `src/back/controllers/external-router.js`
**Mount path:** `/f/api/external` (all routes below are relative to this)
**Authentication:** All routes require login via `checkLogin` middleware (line 29–31)

## Dependencies

| Module | Purpose |
|---|---|
| `read-torrent` (ReadTorrent) | Parse torrent files to extract metadata and magnet links |
| `opensubtitles.com` (OpenSubtitleRest) | OpenSubtitles REST API v2 — search and download subtitles |
| `opensubtitles-api` (OpenSubtitle) | OpenSubtitles API v1 — file hashing for subtitle lookup |
| `GoogleApi` | Google Drive uploads, email sending |
| `PlaylistApi` | Torrent management, mega downloads, zip handling |
| `External` | External source scrapers |
| `MediaHandleTool` / `errorMedia` | Media file processing, tag handling, upload workflow |
| `TagTool` / `StorageTagTool` | Tag normalization, relative tag suggestions, default tag detection |
| `Api` | Generic download utility, process stop commands |
| `sendWs` | WebSocket notification broadcasting |

## Constants & Configuration

| Constant | Source | Purpose |
|---|---|---|
| `OPENSUBTITLES_KEY` | `ver.js` | API key for OpenSubtitles v2 REST API |
| `OPENSUBTITLES_USERNAME` | `ver.js` | Login credential for OpenSubtitles |
| `OPENSUBTITLES_PASSWORD` | `ver.js` | Login credential for OpenSubtitles |
| `USERDB` | `constants.js` | MongoDB collection name for users |
| `STORAGEDB` | `constants.js` | MongoDB collection name for file storage |

---

## Endpoint Reference

---

### GET /2drive/:uid

**Purpose:** Upload a file (or playlist contents) from the storage system to the authenticated user's Google Drive folder.

**Lines:** 33–188

#### Parameters

| Parameter | Source | Validation | Description |
|---|---|---|---|
| `uid` | URL param | `isValidString(uid, 'uid')` | Storage file ID to upload |

#### Authentication & Authorization

- Requires authenticated user (`req.user._id`)
- User must have `auto` field set (Google Drive folder ID)

#### Processing Logic

1. **User validation:** Lookup user in `USERDB`; verify `userlist[0].auto` exists (Drive folder)
2. **File validation:** Lookup file in `STORAGEDB` by `_id`
3. **Skip conditions:** Rejects files with `status === 7` (URL bookmarks), `status === 8` (thumb-only entries), or `items[0].thumb` truthy
4. **Tracking:** Calls `StorageTagTool.setLatest()` and increments `count` field
5. **Status-based upload handling:**

| File Status | Upload Behavior |
|---|---|
| `status === 9` (playlist) with completed items | Creates folder structure on Drive, uploads each completed file recursively via `recur_upload()` |
| `status === 9` with no completed items but zip exists | Uploads `_zip`, `_7z`, or multi-part `.rar` files; handles `part*.rar` pattern recursively via `recur_zip()` |
| `status === 9` with magnet/mega only | Uploads a `.txt` file containing the decoded magnet/mega URL |
| Any other status | Direct file upload to Drive |

#### Zip File Detection Priority (line 139)

```
1. {filePath}_zip
2. {filePath}_7z
3. {filePath}.1.rar
```

#### Multi-part RAR Handling

- Detects pattern `{name}.part{N}.rar` via regex `^(.*)\.part\d+\.rar$`
- Recursively uploads parts starting from index 2 via `recur_zip()`

#### Google Drive API Calls

| Operation | Parameters |
|---|---|
| `GoogleApi('create', ...)` | Creates folders on Drive (for playlist directory structures) |
| `GoogleApi('upload', ...)` | Uploads files; type: `'auto'`, parent: user's `auto` folder |

#### Response

```json
{ "apiOK": true }
```

#### Error Conditions

| Error | Condition |
|---|---|
| `'do not find user!!!'` | User not found in DB |
| `'user dont have google drive!!!'` | `userlist[0].auto` is falsy |
| `'uid is not vaild'` | Invalid UID format |
| `'cannot find file!!!'` | File not found in storage |
| `'file cannot downlad!!!'` | File has status 7, 8, or is a thumb |
| `'do not find parent!!!'` | Parent folder not found during recursive upload |

---

### GET /2kindle/:uid

**Purpose:** Send a file to the user's Kindle device via email.

**Lines:** 190–218

#### Parameters

| Parameter | Source | Validation | Description |
|---|---|---|---|
| `uid` | URL param | `isValidString(uid, 'uid')` | Storage file ID to send |

#### Authentication & Authorization

- User must have `kindle` field set (Kindle username prefix)

#### Processing Logic

1. Validates user exists and has `kindle` field
2. Looks up file in `STORAGEDB`
3. Rejects files with `status === 7`, `status === 8`, or `thumb` truthy
4. Sends file via `GoogleApi('send mail', ...)` to `{kindle}@kindle.com`

#### Response

```json
{ "apiOK": true }
```

#### Error Conditions

| Error | Condition |
|---|---|
| `'do not find user!!!'` | User not found |
| `'user dont have kindle device!!!'` | `kindle` field not set |
| `'uid is not vaild'` | Invalid UID |
| `'cannot find file!!!'` | File not found |
| `'file cannot downlad!!!'` | Status 7/8 or thumb file |

---

### POST /upload/url

**Purpose:** The primary external source upload endpoint. Handles URL bookmarks, magnet links, torrent files, and external media sources (YIFY, DM5, Mega).

**Lines:** 276–788

#### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `url` | string | Yes | URL-encoded source URL or magnet link |
| `type` | string | No | JSON-encoded type data (adult content flag) |
| `path` | array | No | Additional tag paths |
| `hide` | boolean | No | If true, sets `untag: 0` and `first: 0` (hidden entry) |

#### URL Type Detection & Routing

The endpoint first checks if the URL starts with `url%3A` (URL bookmark) or is a magnet/source URL.

##### Branch 1: URL Bookmark (`url%3A{url}`) — Lines 282–362

- Creates a status 7 (bookmark) entry in storage
- Generates tags from name, username, and body path
- Calls `MediaHandleTool.handleTag()` with status 7
- Sends WebSocket notification on completion
- Returns tag selection UI data

##### Branch 2: Magnet Links — Lines 367–421

**Special magnet commands (stop commands):**

| Command | Action | Admin Required |
|---|---|---|
| `magnet:stop` | `PlaylistApi('torrent stop')` | No |
| `magnet:stopzip` | `PlaylistApi('zip stop')` | No |
| `magnet:stopmega` | `PlaylistApi('mega stop')` | No |
| `magnet:stopapi` | `Api('stop')` | Yes (admin level 1) |
| `magnet:stopgoogle` | `GoogleApi('stop')` | Yes (admin level 1) |

**Normal magnet links:**

1. Extracts short magnet (up to first `&`) for deduplication check
2. Queries `STORAGEDB` with regex on magnet hash to prevent duplicates
3. Calls `PlaylistApi('torrent info', ...)` to get torrent metadata
4. Builds playlist from `info.files`, extracting media types and tags
5. Tags include: `torrent`, `playlist`, `播放列表` (Chinese for "playlist")
6. Sorts playlist via `sortList()`
7. Returns `[name, setTag, optTag, {magnet, playList}]`

##### Branch 3: External Source URLs — Lines 494–601

| URL Pattern (Regex) | Source | `is_media` | ID Extraction |
|---|---|---|---|
| `^(https\|http):\/\/yts\.ag\/movie\/` | YIFY | 3 (video) | Last path segment: `[^\/]+$` |
| `^(https\|http):\/\/www\.dm5\.com\/` | DM5 | 2 (comic/image) | Path segment after domain: `\/([^\/]+)` |
| `^(https\|http):\/\/mega\.` | Mega | — | Full URL passed to `PlaylistApi('mega add', ...)` |

Each external source:
1. Checks for duplicates via `Mongo('find', STORAGEDB, {owner: source, url: encodedUrl})`
2. Calls `External.saveSingle(source, id)` to scrape metadata
3. Returns `[media_name, setTag, optTag, {owner, untag: 0, thumb, url}]`

##### Branch 4: Fallback / Pure Download — Lines 605–661

- Triggered on catch from any URL processing failure
- Uses `Api('download', ...)` to download the raw file
- If the downloaded file is a torrent (`isTorrent()`), processes it:
  - Parses with `ReadTorrent`
  - Converts to magnet via `torrent2Magnet()`
  - Gets torrent info via `PlaylistApi('torrent info', ...)`
  - Builds playlist

#### `streamClose()` Function — Lines 662–786

The shared finalization function for all upload types:

1. Sanitizes filename via `toValidName()`
2. Checks if name collides with default tags
3. Gets file size if file exists on disk
4. Builds DB document with fields: `_id`, `name`, `owner`, `utime`, `size`, `count`, `recycle`, `adultonly`, `untag`, `first`, `status`
5. Sets `status = 9` if magnet or mega link present, otherwise `status = 0`
6. Calls `MediaHandleTool.handleTag()` for media type detection
7. Overrides status for external media sources (`is_media` flag: 2=comic, 3=video, 4=music)
8. Builds tag sets (default + optional + relative) with max 5 relative tags
9. Inserts into `STORAGEDB`
10. Sends two WebSocket notifications:
    - `{type: 'file', data: item_id}` — file event
    - `{type: username, data: '{name} upload complete'}` — user-specific completion
11. For playlists from Mega: recursively handles each item via `recur_mhandle()`
12. For non-media: calls `MediaHandleTool.handleMediaUpload()`

#### Response (all branches)

**Stop commands:**
```json
{ "stop": true }
```

**Upload with tagging (untag = 1):**
```json
{
  "id": "<ObjectId>",
  "name": "<filename>",
  "select": ["tag1", "tag2"],
  "option": ["opt1", "opt2"],
  "other": []
}
```

**Hidden upload (untag = 0):**
```json
{ "id": "<ObjectId>" }
```

#### Error Conditions

| Error | Condition |
|---|---|
| `'url is not vaild'` | URL fails validation |
| `'json parse error!!!'` | `req.body.type` cannot be parsed |
| `'already has one'` | Duplicate magnet hash or external URL found |
| `'empty content!!!'` | Torrent has no files |
| `'yify url invalid'` | Cannot extract YIFY ID from URL |
| `'dm5 url invalid'` | Cannot extract DM5 path segment |
| `'unknown type'` | URL doesn't match any known pattern |
| `'permission denied!'` | Non-admin tries stopapi/stopgoogle |
| `'magnet create fail'` | Torrent-to-magnet conversion failed |
| `'magnet is not vaild'` | Generated magnet fails URL validation |

---

### POST /subtitle/search/:uid/:index(\d+)?

**Purpose:** Search and download subtitles from OpenSubtitles (v2 REST API). Supports both file-hash-based and name-based searches. Downloads and converts subtitles to VTT format.

**Lines:** 790–1051

#### Parameters

| Parameter | Source | Validation | Description |
|---|---|---|---|
| `uid` | URL param | `isValidString()` | File UID or external prefix ID |
| `index` | URL param (optional) | Regex `\d+` | Playlist item index for status 9 files |

#### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | Yes | Search query (movie name or IMDB ID like `tt1234567`) |
| `episode` | string | No | Episode identifier, format: `s{season}e{episode}`, `e{episode}`, `s{season}`, or bare number |

#### Episode Parsing Logic (Lines 797–841)

The episode string is parsed via regex `^(s(\d*))?(e)?(\d+)$/i`:

| Input Format | Season | Episode |
|---|---|---|
| `42` (bare number) | 1 | 42 |
| `e5` | 1 | 5 |
| `s2e3` | 2 | 3 |
| `s12e5` | 12 | 5 |
| `s2` (no episode) | 2 | 1 |
| `se7` (empty season) | 1 | 7 |

Episode/season strings are generated with zero-padding for search queries (e.g., `s01e05`, `s1e05`).

#### UID Type Detection (Lines 845–918)

**External source UIDs** (prefix-based):

| Prefix | Platform Type |
|---|---|

**Storage file UIDs:**
- Validates as MongoDB ObjectId
- Requires `status === 3` (video) or `status === 9` (playlist)
- Rejects thumb-only entries
- For status 9: resolves to specific playlist item by index, falls back to first video in playlist
- Gets actual file path, checks for `_complete` suffix variant

#### OpenSubtitles Integration (Lines 920–1049)

**API initialization:**
```javascript
OpenSubtitles = new OpenSubtitleRest({apikey: OPENSUBTITLES_KEY, useragent: 'anomopi v1.0'});
OpenSubtitles.login({username, password});
```

**File hashing (v1 API):**
```javascript
OpenSubtitlesHash = new OpenSubtitle('UserAgent');
OpenSubtitlesHash.hash(filePath); // returns {moviehash}
```

**Search parameters:**

| Parameter | Value | Notes |
|---|---|---|
| `languages` | `'en,zh-tw,zh-cn,ze'` | English + Traditional Chinese + Simplified Chinese + ze |
| `ai_translated` | `'include'` | Include AI translations |
| `machine_translated` | `'include'` | Include machine translations |
| `order_by` | `'votes'` | Sort by community votes |
| `order_direction` | `'desc'` | Highest votes first |
| `query` | filename or search name | Depends on search mode |
| `imdb_id` | Numeric IMDB ID | When name matches `^tt\d+$/i` |
| `episode_number` | Parsed episode | When episode is provided |
| `season_number` | Parsed season | When episode is provided |

**Search strategy (two-pass):**
1. First search: by filename (with `query: fileName`)
2. If no results: fallback search by name only (with `query: name`)

**Language priority for subtitle selection:**

| Priority | Language Code | Language |
|---|---|---|
| 1 (primary) | `zh-tw` | Traditional Chinese |
| 2 | `ze` | Chinese (alternate code) |
| 3 | `zh-cn` | Simplified Chinese |
| English track | `en` | English (separate track) |

#### SUB2VTT Function (Lines 1012–1049)

Handles subtitle download, file management, and format conversion:

1. **Existing subtitle backup:** Renames existing `.srt`, `.ass`, `.ssa` files by appending `1` suffix
2. **Language-specific paths:** English subtitles stored as `{path}.en.{ext}`
3. **Download mode (is_file = false):**
   - Calls `OpenSubtitles.download({file_id})` to get download link
   - Downloads via `Api('url', link, {filePath})`
   - Converts via `SRT2VTT(subPath, ext)`
4. **File mode (is_file = true):**
   - Validates extension via `isSub()`
   - Renames file in place
   - Converts via `SRT2VTT(subPath, ext)`

#### Response

```json
{ "apiOK": true }
```

#### WebSocket Notification

```javascript
sendWs({ type: 'sub', data: id }, 0, 0);
```

#### Error Conditions

| Error | Condition |
|---|---|
| `'name is not vaild'` | Invalid search name |
| `'file is not valid!!!'` | (from getSingle path) Invalid prefix |
| `'external is not vaild'` | External UID fails name validation |
| `'uid is not vaild'` | Storage UID fails validation |
| `'cannot find file!!!'` | File not found in DB |
| `'file type error!!!'` | Status is not 3 or 9, or playlist item is not video |
| `'external file, please open video'` | File is a thumb entry |
| `'cannot find subtitle!!!'` | No subtitles found in either search pass |
| `'donot have sub!!!'` | Null subtitle URL passed to SUB2VTT |
| `'is not sub!!!'` | File extension not recognized as subtitle |

---

### GET /subtitle/fix/:uid/:lang/:adjust/:index(\d+)?

**Purpose:** Adjust subtitle timing by a specified offset (positive or negative seconds). Reads, modifies, and rewrites the VTT file in place.

**Lines:** 1072–1186

#### Parameters

| Parameter | Source | Validation | Description |
|---|---|---|---|
| `uid` | URL param | Prefix-based or UID | File identifier |
| `lang` | URL param | `'en'` for English track, anything else for default | Language track to adjust |
| `adjust` | URL param | Regex `^\-?\d+(\.\d+)?$` | Time adjustment in seconds (supports decimals and negatives) |
| `index` | URL param (optional) | Regex `\d+` | Playlist item index |

#### UID Resolution

For storage UIDs: same resolution as subtitle search (status 3/9, playlist index support).

#### Timing Adjustment Logic (Lines 1130–1173)

1. Converts `adjust` param to milliseconds (`* 1000`)
2. Reads VTT file line by line via `readline.createInterface`
3. Matches VTT timestamp lines: `^(\d\d):(\d\d):(\d\d)\.(\d\d\d) --> (\d\d):(\d\d):(\d\d)\.(\d\d\d)$`
4. Converts start/end times to milliseconds, applies offset
5. Clamps negative results to 0
6. Reconstructs timestamp strings with `completeZero()` for zero-padding
7. Writes modified content back to same VTT file

#### Response

```json
{ "apiOK": true }
```

#### WebSocket Notification

```javascript
sendWs({ type: 'sub', data: id }, 0, 0);
```

#### Error Conditions

| Error | Condition |
|---|---|
| `'adjust time is not vaild'` | Adjust param fails decimal regex |
| `'external is not vaild'` | External UID validation failure |
| `'uid is not vaild'` | Storage UID validation failure |
| `'cannot find file!!!'` | File not found in DB |
| `'file type error!!!'` | Status not 3 or 9, or playlist item not video |
| `'do not have subtitle!!!'` | VTT file doesn't exist on disk |

---

## Endpoints Mentioned but Not Present

The following endpoints are **not implemented** in this file (may reside in other routers or be planned):

| Endpoint | Description |
|---|---|
| `PUT /edit/:uid` | Edit external source metadata |
| `DELETE /del/:uid` | Delete external source entry |

---

## Complete Endpoint Summary

| Method | Route | Lines | Purpose |
|---|---|---|---|
| GET | `/2drive/:uid` | 33–188 | Upload file to user's Google Drive |
| GET | `/2kindle/:uid` | 190–218 | Send file to Kindle via email |
| GET | `/getSingle/:uid` | 220–274 | Resolve external video platform URL |
| POST | `/upload/url` | 276–788 | External source upload (magnet, torrent, URLs) |
| POST | `/subtitle/search/:uid/:index?` | 790–1051 | Search + download subtitles from OpenSubtitles |
| GET | `/subtitle/fix/:uid/:lang/:adjust/:index?` | 1072–1186 | Adjust subtitle timing offset |

---

## URL Pattern Matching Reference

### Magnet Link Patterns

| Pattern | Meaning |
|---|---|
| `^magnet:[^&]+` | Short magnet (up to first `&`); used for dedup |
| `magnet:stop` | Stop torrent download |
| `magnet:stopzip` | Stop zip extraction |
| `magnet:stopmega` | Stop mega download |
| `magnet:stopapi` | Stop API downloads (admin) |
| `magnet:stopgoogle` | Stop Google operations (admin) |

### External Source URL Patterns

| Regex | Source |
|---|---|
| `^(https\|http):\/\/yts\.ag\/movie\/` | YIFY movie page |
| `^(https\|http):\/\/www\.dm5\.com\/` | DM5 comic page |
| `^(https\|http):\/\/mega\.` | Mega download link |
| `^url%3A(.*)` | URL bookmark (status 7) |


## External API Call Reference

| API | Function Call | Purpose |
|---|---|---|
| Google Drive | `GoogleApi('upload', {...})` | Upload file to Drive |
| Google Drive | `GoogleApi('create', {...})` | Create folder on Drive |
| Google Mail | `GoogleApi('send mail', {...})` | Send file to Kindle |
| OpenSubtitles v2 | `OpenSubtitles.subtitles(params)` | Search subtitles |
| OpenSubtitles v2 | `OpenSubtitles.download({file_id})` | Get subtitle download link |
| OpenSubtitles v1 | `OpenSubtitlesHash.hash(filePath)` | Calculate file hash |
| YIFY | `External.saveSingle('yify', id)` | Scrape YIFY movie data |
| DM5 | `External.saveSingle('dm5', id)` | Scrape DM5 comic data |
| Mega | `PlaylistApi('mega add', ...)` | Download from Mega |
| Torrent | `PlaylistApi('torrent info', ...)` | Get torrent file info |
| Generic | `Api('download', ...)` | Download file from URL |
| Generic | `Api('url', url, {filePath})` | Download URL to specific path |

---

## Error Handling for Third-Party Failures

| Scenario | Handling | Location |
|---|---|---|
| OpenSubtitles login failure | `try/catch` → `handleError(err, next)` | Lines 936–941 |
| OpenSubtitles search returns no results | Two-pass search; if both fail → `'cannot find subtitle!!!'` | Lines 989–1010 |
| OpenSubtitles download failure | Promise chain `.catch(err => handleError(err, next))` | Line 1050 |
| External.saveSingle() failure (YIFY/DM5) | Caught by outer `.catch()` → falls through to `pureDownload()` | Line 604 |
| Mega download failure | `errhandle` callback → `pureDownload()` | Line 598 |
| Google Drive upload failure | Promise chain `.catch(err => handleError(err, next))` | Line 187 |
| Torrent parsing failure (ReadTorrent) | Promise rejection → `handleError(err, next)` | Line 612 |
| Media processing failure | `handleMediaUpload().catch(err => handleError(err, errorMedia, id, fileIndex))` | Lines 765, 775 |
| Generic URL download failure | `pureDownload()` function logs error and attempts raw download | Lines 605–661 |
| File system errors (missing VTT) | Explicit `FsExistsSync()` checks before operations | Lines 1029–1037, 1127 |

---

## File Size Limits

| Context | Limit | Notes |
|---|---|---|
| Kindle email delivery | Handled by `GoogleApi('send mail')` | Size limit enforced in `api-tool-google.js`, not in this router directly |
| Subtitle files | No explicit limit | Downloaded and converted regardless of size |
| Google Drive uploads | No explicit limit | Uploads entire file/playlist contents |
| Torrent files | No explicit limit | Parsed by ReadTorrent for metadata |

---

## Subtitle Format Handling

### Supported Input Formats

| Format | Extension | Handling |
|---|---|---|
| SRT (SubRip) | `.srt` | Default format from OpenSubtitles download; converted to VTT via `SRT2VTT()` |
| ASS (Advanced SubStation) | `.ass` | Backed up with `.ass1` suffix before replacement |
| SSA (SubStation Alpha) | `.ssa` | Backed up with `.ssa1` suffix before replacement |
| VTT (WebVTT) | `.vtt` | Target output format; used for timing adjustment |

### Conversion Pipeline

```
OpenSubtitles API → download .srt → SRT2VTT(subPath, 'srt') → .vtt file
```

### File Naming Convention

| Scenario | Path Pattern |
|---|---|
| Default language subtitle | `{filePath}.vtt` |
| English subtitle | `{filePath}.en.vtt` |
| Playlist item subtitle | `{filePath}/{index}.vtt` |
| Playlist item (completed) | `{filePath}/{index}_complete.vtt` |
| Backup of replaced subtitle | `{filePath}.srt1`, `.ass1`, `.ssa1` |

---

## WebSocket Notifications

| Event Type | Data | When Sent |
|---|---|---|
| `'file'` | Item `_id` | After external source upload completes |
| `username` | `'{name} upload complete'` | After upload finishes (user-specific) |
| `'sub'` | File/external `_id` | After subtitle download or timing fix |

---

## Status Code Reference

| Status | Meaning | Upload/URL Behavior |
|---|---|---|
| 0 | Normal file | Direct upload to Drive |
| 2 | Comic/Image | External comic (DM5) |
| 3 | Video | External video (YIFY) |
| 4 | Music | External music |
| 7 | URL Bookmark | Skipped for Drive upload; created by `url%3A` prefix |
| 8 | Thumb-only | Skipped for Drive upload |
| 9 | Playlist (torrent/mega) | Complex upload: folders + files or zip + txt fallback |

---

## Test Scenarios

### GET /2drive/:uid

| # | Scenario | Input | Expected Outcome |
|---|---|---|---|
| 1 | Valid file upload to Drive | Authenticated user with `auto`, valid UID, status 0 file | File uploaded, `{apiOK: true}`, count incremented |
| 2 | User without Google Drive | User missing `auto` field | Error: `'user dont have google drive!!!'` |
| 3 | Status 7 bookmark file | UID pointing to status 7 entry | Error: `'file cannot downlad!!!'` |
| 4 | Status 8 thumb-only file | UID pointing to status 8 entry | Error: `'file cannot downlad!!!'` |
| 5 | Playlist with completed items | Status 9 file with completed playlist files | Folders created, files uploaded recursively |
| 6 | Playlist with zip archive | Status 9, no completed items, `_zip` exists | Zip uploaded to Drive |
| 7 | Playlist with multi-part RAR | Status 9, `name.part1.rar` exists | All RAR parts uploaded recursively |
| 8 | Playlist with 7z archive | Status 9, `_7z` exists (no `_zip`) | 7z uploaded to Drive |
| 9 | Playlist with only magnet URL | Status 9, no files, has `magnet` field | `.txt` file with decoded magnet uploaded |
| 10 | Playlist with only mega URL | Status 9, no files, has `mega` field | `.txt` file with decoded mega URL uploaded |
| 11 | Playlist with no content | Status 9, no files, no zip, no magnet/mega | No upload performed, returns `{apiOK: true}` |
| 12 | Invalid UID format | Malformed UID string | Error: `'uid is not vaild'` |
| 13 | Nonexistent file | Valid UID but not in DB | Error: `'cannot find file!!!'` |
| 14 | Unauthenticated user | No session | Blocked by `checkLogin` middleware |

### GET /2kindle/:uid

| # | Scenario | Input | Expected Outcome |
|---|---|---|---|
| 1 | Valid Kindle send | User with `kindle` field, valid file | Email sent, `{apiOK: true}` |
| 2 | User without Kindle | Missing `kindle` field | Error: `'user dont have kindle device!!!'` |
| 3 | Status 7/8 file | Bookmark or thumb file | Error: `'file cannot downlad!!!'` |
| 4 | Thumb file | File with `thumb` truthy | Error: `'file cannot downlad!!!'` |

### GET /getSingle/:uid

| # | Scenario | Input | Expected Outcome |
|---|---|---|---|
### POST /upload/url

| # | Scenario | Input | Expected Outcome |
|---|---|---|---|
| 1 | URL bookmark | `url%3Ahttps://example.com` | Status 7 entry created, tags returned |
| 2 | Magnet link (new) | Valid magnet URI, not in DB | Torrent info fetched, playlist created, status 9 |
| 3 | Duplicate magnet | Magnet already in DB | Error: `'already has one'` |
| 4 | `magnet:stop` command | Literal `magnet:stop` | Torrent stopped, `{stop: true}` |
| 5 | `magnet:stopzip` | Literal `magnet:stopzip` | Zip process stopped |
| 6 | `magnet:stopmega` | Literal `magnet:stopmega` | Mega download stopped |
| 7 | `magnet:stopapi` (admin) | Admin user | API process stopped |
| 8 | `magnet:stopapi` (non-admin) | Regular user | Error: `'permission denied!'` |
| 9 | `magnet:stopgoogle` (admin) | Admin user | Google process stopped |
| 10 | YIFY URL | `https://yts.ag/movie/example-2020` | YIFY metadata scraped, status 3 entry |
| 11 | Duplicate YIFY URL | Same URL already in DB | Error: `'already has one'` |
| 13 | DM5 URL | `https://www.dm5.com/manhua-example/` | DM5 metadata scraped, status 2 |
| 15 | Mega URL | `https://mega.nz/file/abc` | Mega download started, playlist created |
| 16 | Unknown URL type | `https://unknown-site.com/file` | Error: `'unknown type'` → fallback to `pureDownload()` |
| 17 | Torrent file via URL | URL that downloads a `.torrent` file | File downloaded, parsed, magnet extracted, playlist created |
| 18 | Empty torrent | Torrent with zero files | Error: `'empty content!!!'` |
| 19 | Adult content flag | `type` = 1, admin level 2 user | `adultonly: 1` set on entry |
| 20 | Hidden upload | `hide` = true | `untag: 0`, `first: 0`, minimal response |
| 21 | Invalid URL | Non-URL string | Error: `'url is not vaild'` |

### POST /subtitle/search/:uid/:index?

| # | Scenario | Input | Expected Outcome |
|---|---|---|---|
| 1 | Search by filename + hash | Valid storage UID, name query | OpenSubtitles searched by filename, subtitle downloaded |
| 2 | Fallback to name search | Filename search returns nothing | Second search by name only |
| 3 | IMDB ID search | `name` = `tt1234567` | Search uses `imdb_id` parameter |
| 4 | Episode search | `name` = `Breaking Bad`, `episode` = `s2e5` | Season 2, episode 5 filters applied |
| 5 | Bare episode number | `episode` = `42` | Season 1, episode 42 |
| 6 | Season only | `episode` = `s3` | Season 3, episode 1 |
| 7 | Chinese subtitle found | zh-tw result available | Chinese subtitle downloaded and converted |
| 8 | English only available | Only English result | English subtitle saved as `{path}.en.vtt` |
| 9 | No subtitles found | Both searches return empty | Error: `'cannot find subtitle!!!'` |
| 10 | Playlist item subtitle | Status 9 file, `index` = 3 | Subtitle saved alongside playlist item 3 |
| 11 | External source UID | `dym_abc123` | Uses external file path, name-only search |
| 12 | Thumb entry | UID points to thumb file | Error: `'external file, please open video'` |
| 13 | Non-video status | Status != 3 and != 9 | Error: `'file type error!!!'` |
| 14 | Non-video playlist item | `index` points to non-video file | Error: `'file type error!!!'` |
| 15 | Existing subtitles | `.srt` already exists at path | Old file renamed to `.srt1`, new subtitle saved |
| 16 | OpenSubtitles API failure | API login or search throws | Error propagated via catch |

### GET /subtitle/fix/:uid/:lang/:adjust/:index?

| # | Scenario | Input | Expected Outcome |
|---|---|---|---|
| 1 | Positive adjustment | `adjust` = `5.5` | All timestamps shifted +5500ms |
| 2 | Negative adjustment | `adjust` = `-3` | All timestamps shifted -3000ms |
| 3 | Negative clamp to zero | `adjust` = `-99999` | Timestamps clamped to `00:00:00.000` |
| 4 | English subtitle fix | `lang` = `en` | Adjusts `{path}.en.vtt` |
| 5 | Default language fix | `lang` = `zh` | Adjusts `{path}.vtt` |
| 6 | Decimal adjustment | `adjust` = `0.5` | 500ms shift applied |
| 7 | Playlist item subtitle | `index` = `2` | Fixes subtitle for playlist item 2 |
| 8 | Missing VTT file | VTT doesn't exist on disk | Error: `'do not have subtitle!!!'` |
| 9 | Invalid adjust format | `adjust` = `abc` | Error: `'adjust time is not vaild'` |
| 10 | External source UID | `yif_abc123` | Resolves to YIFY file path |
| 11 | Comic UID | `mad_xyz` | Resolves to DM5 file path |
| 12 | Non-video file status | Status = 0 file | Error: `'file type error!!!'` |

---

## Data Flow Diagrams

### Upload Flow (POST /upload/url)

```
URL Input
  ├── url%3A... → URL Bookmark (status 7)
  ├── magnet:stop* → Process control commands
  ├── magnet:... → Torrent info → Playlist (status 9)
  ├── yts.ag/movie/... → YIFY scrape → Video entry (status 3)
  ├── www.dm5.com/... → DM5 scrape → Comic entry (status 2)
  ├── mega.... → Mega download → Playlist (status 9)
  └── (unknown) → Error → pureDownload() fallback
                            ├── Downloaded .torrent → Parse → Playlist (status 9)
                            └── Downloaded file → Normal entry (status 0)
         ↓
    streamClose()
         ├── handleTag() → Media type detection
         ├── Tag building (set + optional + relative)
         ├── DB insert
         ├── sendWs notifications
         └── handleMediaUpload() or recur_mhandle()
```

### Subtitle Search Flow (POST /subtitle/search/:uid)

```
UID Input
  ├── External prefix (dym_, bil_, etc.) → External file path
  └── MongoDB ObjectId → DB lookup → File path resolution
         ↓
    File hash (OpenSubtitles v1 API)
         ↓
    Search pass 1: by filename
    Search pass 2: by name (fallback)
         ↓
    Language selection (zh-tw > ze > zh-cn for primary, en for secondary)
         ↓
    Download subtitle(s)
         ↓
    Convert SRT → VTT
         ↓
    sendWs notification
```
# Section 12: playlist-router.js (Playlist & Torrent Management)

**File:** `src/back/controllers/playlist-router.js` (340 lines)

## Overview

This router manages split-archive joining, torrent/playlist file copying, bulk download queueing, and download-progress checking. All endpoints require authentication via the `checkLogin` middleware applied at the router level (line 21–23). The router is mounted under a parent prefix (e.g., `/f/api/torrent`), so all paths below are relative to that mount point.

### Imports & Dependencies

| Import | Purpose |
|---|---|
| `STORAGEDB` | Database collection constant for file storage |
| `ENV_TYPE` | Environment type flag (imported but unused in this file) |
| `Express` | Router creation |
| `Child_process` | Shell `exec` for `cat` command (7z/zip join) |
| `pathModule` (`basename`, `dirname`) | Path manipulation for file locations |
| `Mkdirp` | Recursive directory creation |
| `fsModule` (`existsSync`, `unlink`, `createReadStream`, `createWriteStream`, `statSync`) | File system operations |
| `Mongo`, `objectID` | MongoDB operations and ObjectID generation |
| `MediaHandleTool`, `errorMedia` | Media upload processing and error handler |
| `PlaylistApi` | External playlist/torrent API integration |
| `TagTool`, `isDefaultTag`, `normalize` | Tag management utilities |
| `checkLogin`, `isValidString`, `handleError`, `HoError`, `getFileLocation`, `checkAdmin`, `toValidName` | Auth, validation, error handling, file paths |
| `extType`, `isVideo`, `supplyTag`, `addPost` | MIME type detection, video check, tag helpers |
| `sendWs` | WebSocket notification broadcast |

### Shared State

- `StorageTagTool` — instance of `TagTool` bound to `STORAGEDB`, used for tag operations (`setLatest`, `getRelativeTag`).

---

## Endpoint 1: PUT /join

**Purpose:** Join split archive parts (RAR multi-part, 7z split, ZIP split) into a single processable archive.

### Request

| Field | Location | Type | Required | Description |
|---|---|---|---|---|
| `uids` | body | `string[]` | Yes | Array of MongoDB ObjectID strings identifying split-archive file entries |

### Authentication

- Requires logged-in session (`checkLogin` middleware).

### Processing Flow

#### Step 1: UID Validation (lines 27–33)
- Iterates over `req.body.uids`, validates each with `isValidString(i, 'uid')`.
- Only valid UIDs are kept in the `uids` array.
- **Guard:** If fewer than 2 valid UIDs → error `"must large than one split"`.

#### Step 2: Database Lookup (lines 38–48)
- Executes `Promise.all` of `Mongo('find', STORAGEDB, {_id: u}, {limit: 1})` for each UID.
- Filters to only items that were found (non-empty result arrays).
- **Guard:** If fewer than 2 found items → error `"must large than one split"`.

#### Step 3: First-Part Detection (lines 50–59)
- Iterates all found items, testing each name against the regex:
  ```
  /^(.*)\.(part0*1\.(rar)|(7z)\.0*1|(zip)\.0*1)$/i
  ```
- This regex matches:
  - `*.part01.rar` or `*.part001.rar` (RAR multi-part, capture group 3 = `rar`)
  - `*.7z.001` or `*.7z.01` (7z split, capture group 4 = `7z`)
  - `*.zip.001` or `*.zip.01` (ZIP split, capture group 5 = `zip`)
- Breaks on first match. `main_match[1]` captures the base name prefix.
- **Guard:** If no item matches the first-part pattern → error `"need the first split"`.

#### Step 4: Zip Type & Part Ordering (lines 60–73)
- Determines `zip_type`:
  - `2` if `main_match[3]` (RAR)
  - `3` if `main_match[4]` (7z)
  - `1` otherwise (ZIP)
- Builds a part-number extraction regex based on type:
  - RAR: `/\.part(\d+)\.rar$/i`
  - 7z: `/\.7z\.(\d+)$/i`
  - ZIP: `/\.zip\.(\d+)$/i`
- Iterates items whose name starts with the same base prefix (`main_match[1]`), extracts part number, and stores in `order_items[partNumber]` keyed by numeric part number.
- **Guard:** If fewer than 2 ordered items → error `"must large than one split"`.

#### Step 5: Set Latest & Increment Count (line 76)
- Calls `StorageTagTool.setLatest(order_items[1]._id, req.session)` — fire-and-forget.
- Increments `count` field on first item via `Mongo('update', ..., {$inc: {count: 1}})`.
- Errors are caught and logged but do not block the join operation.

#### Step 6a: RAR Path (`zip_type === 2`) (lines 77–104)

1. Gets base file path for item #1: `filePath1 = getFileLocation(order_items[1].owner, order_items[1]._id)`.
2. Defines recursive copy function `recur_copy(index)` starting at index 2:
   - For each part index, attempts to read from `{filePath}.1.rar` first (processed RAR file).
   - Falls back to raw file path `{filePath}` if `.1.rar` doesn't exist.
   - Pipes read stream to `{filePath1}.{index}.rar` (writes all parts into item #1's directory).
   - Increments index; recurses until `index > Object.keys(order_items).length`.
3. Determines `mediaType` via `extType(order_items[1].name)`.
4. After all copies complete, calls `MediaHandleTool.handleMediaUpload(mediaType, filePath1, order_items[1]._id, req.user)`.
5. On success, responds with `{id, name}`.
6. On media error, calls `handleError(err, errorMedia, id, fileIndex)`.

**Error branches in RAR copy:**
- Stream `'error'` event on any part → rejects the promise, caught by outer `.catch`.
- Missing intermediate part file → falls back to raw path; if that also fails, stream error triggers.

#### Step 6b: 7z/ZIP Path (`zip_type !== 2`) (lines 105–130)

1. Determines extension suffix: `_7z` for 7z, `_zip` for ZIP.
2. Builds a shell `cat` command iterating parts 1 through `Object.keys(order_items).length`:
   - For each part, tries `{filePath}{ext}` first (e.g., `{path}_7z`).
   - Falls back to raw `{filePath}` if the suffixed file doesn't exist.
   - **Break condition:** If `order_items[i]` is undefined (gap in sequence), loop breaks immediately — skipping remaining parts.
3. Appends output redirect: `cat ... >> {filePath}{ext}_c` (e.g., `path_7z_c` or `path_zip_c`).
4. Defines `unlinkC()` — deletes the concatenated output file if it already exists (cleanup from previous attempt).
5. Executes: `unlinkC()` → `Child_process.exec(cmdline)` → `handleMediaUpload(...)`.
6. On success, responds with `{id, name}`.
7. On media error, calls `handleError(err, errorMedia, id, fileIndex)`.

**Error branches in 7z/ZIP cat:**
- Pre-existing concat file → deleted before new concatenation.
- `exec` error (command failure) → rejects, caught by outer `.catch`.
- Gap in part numbering → `break` exits loop early, concatenation proceeds with available parts only (potential data corruption).

### Response

**Success (200):**
```json
{
  "id": "<ObjectID of first part>",
  "name": "<filename of first part>"
}
```

**Error scenarios:**
| Condition | Error Message |
|---|---|
| Fewer than 2 valid UIDs | `"must large than one split"` |
| Fewer than 2 found in DB | `"must large than one split"` |
| No first-part file found | `"need the first split"` |
| Fewer than 2 matching parts after ordering | `"must large than one split"` |
| File stream error during copy | Stream error propagated |
| Shell exec error during cat | Exec error propagated |
| Media upload failure | `errorMedia` handler invoked |

### Test Scenarios

| # | Scenario | Input | Expected Outcome |
|---|---|---|---|
| 1 | Successful RAR join (2 parts) | 2 valid UIDs, names `archive.part01.rar` + `archive.part02.rar` | 200, `{id, name}` of part 1; files copied as `.2.rar`, `handleMediaUpload` called |
| 2 | Successful RAR join (3+ parts) | 3 valid UIDs, parts 01–03 | All parts copied sequentially; response from part 1 |
| 3 | Successful 7z join (2 parts) | 2 UIDs, names `data.7z.001` + `data.7z.002` | `cat` command with `_7z` paths, output to `_7z_c`, 200 response |
| 4 | Successful ZIP join (2 parts) | 2 UIDs, names `data.zip.001` + `data.zip.002` | `cat` command with `_zip` paths, output to `_zip_c`, 200 response |
| 5 | Only 1 valid UID | `uids: ["valid1"]` | Error: `"must large than one split"` |
| 6 | 2 UIDs but only 1 in DB | 2 UIDs, one not found | Error: `"must large than one split"` |
| 7 | No first-part file in set | `archive.part02.rar` + `archive.part03.rar` | Error: `"need the first split"` |
| 8 | Mixed base names | `a.part01.rar` + `b.part02.rar` | Error: `"must large than one split"` (only 1 matches prefix) |
| 9 | RAR fallback path | Part file lacks `.1.rar` suffix file | Falls back to raw path for that part |
| 10 | 7z fallback path | Part file lacks `_7z` suffix file | Falls back to raw path for that part |
| 11 | 7z with gap in sequence | Parts 1, 2, 4 (missing 3) | `cat` breaks at part 3, only parts 1–2 concatenated |
| 12 | Pre-existing concat file | `_7z_c` file exists from prior attempt | File deleted before new concatenation |
| 13 | Invalid UID format | `uids: ["notanid", "also-bad"]` | 0 valid UIDs → error |
| 14 | File stream error during RAR copy | Source file unreadable | Promise rejected, error propagated |
| 15 | Shell exec error during cat | Disk full or permission denied | Exec callback receives error, promise rejected |
| 16 | handleMediaUpload failure | Media processing fails | `errorMedia` handler called with item ID and fileIndex |
| 17 | Case-insensitive extension match | `archive.Part01.RAR` | Regex `i` flag matches; `zip_type=2` |
| 18 | Not authenticated | No session | `checkLogin` rejects before handler |
| 19 | setLatest/count increment failure | DB update fails | Error logged, join continues (fire-and-forget) |

---

## Endpoint 2: POST /copy/:uid/:index(\d+)

**Purpose:** Copy a single file from a torrent/archive playlist into a standalone file entry with its own tags.

### Request

| Field | Location | Type | Required | Description |
|---|---|---|---|---|
| `uid` | URL param | `string` | Yes | MongoDB ObjectID of the parent torrent/playlist item |
| `index` | URL param | `number` (digits only) | Yes | Zero-based index into the `playList` array |
| `path` | body | `string[]` | No | Additional tag paths to include in the new file's tags |

### Authentication

- Requires logged-in session.
- Admin level 2 check (`checkAdmin(2, req.user)`) affects `adultonly` flag propagation.

### Processing Flow

#### Step 1: Parameter Validation (lines 136–140)
- Parses `index` as Number.
- Validates `uid` with `isValidString(req.params.uid, 'uid')`.
- **Guard:** Invalid UID → error `"uid is not vaild"`.

#### Step 2: Database Lookup & Checks (lines 141–154)
- Finds item by `_id` in STORAGEDB.
- **Guard:** Item not found → error `"torrent can not be found!!!"`.
- **Guard:** `status !== 9` → error `"file type error!!!"`. (Status 9 indicates torrent/playlist type.)
- **Guard:** `playList[index]` doesn't exist → error `"torrent index can not be found!!!"`.
- Constructs `origPath = {fileLocation}/{index}_complete`.
- **Guard:** `_complete` file doesn't exist on disk → error `"please download first!!!"`.

#### Step 3: File Copy (lines 155–163)
- Generates new `objectID()` for the standalone file.
- Computes destination `filePath = getFileLocation(req.user._id, newOID)`.
- Creates parent directory via `Mkdirp` if it doesn't exist.
- Stream-copies `origPath` → `filePath` (read stream piped to write stream).

#### Step 4: Name & Tag Preparation (lines 165–180)
- Extracts filename from `playList[index]` via `PathBasename`, sanitizes with `toValidName`.
- If the normalized name is a default tag → appends `'1'` suffix via `addPost`.
- Calls `MediaHandleTool.handleTag(filePath, dbData, name, '', 0)` with:
  - `_id`: new ObjectID
  - `name`: sanitized playlist entry name
  - `owner`: current user's ID
  - `utime`: current Unix timestamp (seconds)
  - `size`: size of the `_complete` source file
  - `count`: 0, `first`: 1, `recycle`: 0, `untag`: 1, `status`: 0
  - `adultonly`: 1 if admin level 2 AND parent item is adultonly=1; otherwise 0

#### Step 5: Tag Building (lines 181–211)
- Returns `[mediaType, mediaTag, DBdata]` from `handleTag`.
- Builds `setTag` (Set) for definite tags:
  1. Normalized file name.
  2. Normalized username.
  3. Each entry from `req.body.path` (if provided).
  4. Parent item's tags — **excluding**: `'壓縮檔'`, `'zip'`, `'播放列表'`, `'playlist'` (Chinese and English zip/playlist tags filtered out).
  5. `mediaTag.def` entries.
- Builds `optTag` (Set) for optional/suggested tags from `mediaTag.opt`.
- Converts `setTag` to `setArr`, filtering out default tags. If a default tag has `index === 0`, sets `DBdata.adultonly = 1`.
- Converts `optTag` to `optArr`, filtering out default tags and duplicates with `setArr`.

#### Step 6: Database Insert & WebSocket Notification (lines 212–220)
- Inserts into STORAGEDB with `tags: setArr` and user-specific tag field `[req.user._id]: setArr`.
- Sends WebSocket notification: `{type: 'file', data: item._id}` with adultonly flag.

#### Step 7: Relative Tags & Media Upload (lines 222–243)
- Fetches relative tags via `StorageTagTool.getRelativeTag(setArr, req.user, optArr)`.
- Takes up to 5 relative tags, adds non-default, non-duplicate ones to `optArr`.
- If admin level 2: adds `'18+'` to `setArr` (if adultonly=1) or `optArr` (if not).
- If `first === 1`: adds `'first item'` to `setArr`; otherwise to `optArr`.
- Calls `MediaHandleTool.handleMediaUpload(mediaType, filePath, item._id, req.user)`.

### Response

**Success (200):**
```json
{
  "id": "<new ObjectID>",
  "name": "<sanitized filename>",
  "select": ["<definite tags array>"],
  "option": ["<optional tags from supplyTag()>"],
  "other": []
}
```

**Error scenarios:**
| Condition | Error Message |
|---|---|
| Invalid UID format | `"uid is not vaild"` |
| Item not found in DB | `"torrent can not be found!!!"` |
| Item status ≠ 9 | `"file type error!!!"` |
| Playlist index out of bounds | `"torrent index can not be found!!!"` |
| `_complete` file missing on disk | `"please download first!!!"` |
| Stream copy error | Stream error propagated |
| handleTag failure | Error propagated |
| DB insert failure | Error propagated |
| handleMediaUpload failure | `errorMedia` handler called |

### Test Scenarios

| # | Scenario | Input | Expected Outcome |
|---|---|---|---|
| 1 | Successful copy (basic) | Valid uid, status=9, index=0, `_complete` exists | 200, new file entry created, tags built, WebSocket sent |
| 2 | Successful copy with body.path | `path: ["tag1", "tag2"]` in body | Tags include normalized path entries |
| 3 | Admin user, adultonly parent | Admin level 2, parent `adultonly=1` | New file `adultonly=1`, `'18+'` in `setArr` |
| 4 | Non-admin user, adultonly parent | Non-admin user | New file `adultonly=0` regardless of parent |
| 5 | Name collides with default tag | Playlist entry name normalizes to a default tag | Name gets `'1'` suffix via `addPost` |
| 6 | Parent has zip/playlist tags | Parent tags include `'壓縮檔'`, `'zip'`, `'播放列表'`, `'playlist'` | Those 4 tags excluded from new file's tags |
| 7 | Parent has other tags | Parent tags `['video', 'anime']` | Both inherited into new file's `setArr` |
| 8 | Invalid UID | `uid = "xyz"` | Error: `"uid is not vaild"` |
| 9 | Item not found | Valid format UID, not in DB | Error: `"torrent can not be found!!!"` |
| 10 | Wrong status | Item `status=0` (not a torrent) | Error: `"file type error!!!"` |
| 11 | Index out of bounds | `index=999`, playlist only has 3 entries | Error: `"torrent index can not be found!!!"` |
| 12 | File not downloaded yet | `_complete` file missing | Error: `"please download first!!!"` |
| 13 | Destination directory doesn't exist | First file for this user | `Mkdirp` creates directory, copy proceeds |
| 14 | Destination directory already exists | Subsequent file for user | Skips `Mkdirp`, copy proceeds |
| 15 | Read stream error during copy | Source file becomes unreadable mid-copy | Promise rejected, error propagated |
| 16 | Default tag detection sets adultonly | A tag normalizes to default tag index 0 | `DBdata.adultonly` set to 1 |
| 17 | Relative tags overflow | >5 relative tags returned | Only first 5 considered |
| 18 | handleMediaUpload fails | Media processing error | `errorMedia` invoked with new item ID |
| 19 | `first` flag handling | New file always has `first=1` | `'first item'` appears in `setArr` |
| 20 | Not authenticated | No session | Blocked by `checkLogin` |

---

## Endpoint 3: GET /all/download/:uid

**Purpose:** Queue download of all incomplete items in a torrent/playlist. Iterates the playlist, skips already-completed or errored items, and queues remaining items via `PlaylistApi`.

### Request

| Field | Location | Type | Required | Description |
|---|---|---|---|---|
| `uid` | URL param | `string` | Yes | MongoDB ObjectID of the playlist/torrent entry |

### Authentication

- Requires logged-in session.

### Processing Flow

#### Step 1: Validation (lines 252–255)
- Validates `uid` with `isValidString`.
- **Guard:** Invalid UID → error `"uid is not vaild"`.

#### Step 2: Database Lookup (lines 256–259)
- Finds item by `_id`.
- **Guard:** Not found → error `"playlist can not be fund!!!"`.

#### Step 3: Queue Building (lines 261–271)
- Gets base `filePath = getFileLocation(items[0].owner, items[0]._id)`.
- Iterates each index `i` in `playList`:
  - If `{filePath}/{i}_complete` exists → skip (already downloaded).
  - If `{filePath}/{i}_error` exists → skip (previously errored).
  - Otherwise → add `i` to `queueItems`.

#### Step 4: Set Latest (line 272)
- Fire-and-forget: `setLatest` + increment `count` (same pattern as join endpoint).

#### Step 5: Queue Execution (lines 273–287)
- If `queueItems.length > 0`:
  - Defines `recur_queue(index, pType)` — recursive sequential download:
    - If item has `magnet` field → calls `PlaylistApi('torrent add', ...)` with decoded magnet URI.
    - If no `magnet` → calls `PlaylistApi('zip add', ...)` with playlist entry name and password.
    - First call uses `pType=1`, subsequent calls use `pType=2`.
  - Returns `{complete: false}` after all queued.
- If no items to queue → returns `{complete: true}`.

### Response

**Success (200):**
```json
{ "complete": false }
```
or
```json
{ "complete": true }
```

**Error scenarios:**
| Condition | Error Message |
|---|---|
| Invalid UID | `"uid is not vaild"` |
| Item not found | `"playlist can not be fund!!!"` |
| PlaylistApi failure | Error propagated via `.catch` |

### Test Scenarios

| # | Scenario | Input | Expected Outcome |
|---|---|---|---|
| 1 | All items already downloaded | Every index has `_complete` file | `{complete: true}` |
| 2 | No items downloaded | No `_complete` or `_error` files | All indexes queued, `{complete: false}` |
| 3 | Mix of complete/error/pending | Some `_complete`, some `_error`, some pending | Only pending items queued, `{complete: false}` |
| 4 | Magnet-based torrent | Item has `magnet` field | `PlaylistApi('torrent add', ...)` called per item |
| 5 | ZIP-based playlist | No `magnet` field | `PlaylistApi('zip add', ...)` called with entry name and pwd |
| 6 | First queue item uses pType=1 | First download call | `recur_queue(0, 1)` |
| 7 | Subsequent items use pType=2 | Second+ download call | `recur_queue(n, 2)` |
| 8 | All items errored | Every index has `_error` file | `{complete: true}` (nothing to queue) |
| 9 | Invalid UID | Bad format | Error response |
| 10 | Item not found | Valid UID, not in DB | Error: `"playlist can not be fund!!!"` |
| 11 | PlaylistApi error on one item | API fails mid-queue | Promise rejected, error propagated |
| 12 | setLatest failure | DB error on latest/count | Logged, download proceeds |
| 13 | Not authenticated | No session | Blocked by `checkLogin` |

---

## Endpoint 4: GET /check/:uid/:index(\d+|v)/:size(\d+)

**Purpose:** Check the download progress of a specific torrent/playlist item, or find and check the first video item.

### Request

| Field | Location | Type | Required | Description |
|---|---|---|---|---|
| `uid` | URL param | `string` | Yes | MongoDB ObjectID of the torrent/playlist entry |
| `index` | URL param | `number` or `'v'` | Yes | Numeric playlist index OR `'v'` to auto-find first video |
| `size` | URL param | `number` | Yes | Client's current buffer size for progress comparison |

### Authentication

- Requires logged-in session.

### Processing Flow

#### Step 1: Parameter Parsing (lines 293–298)
- `index`: if numeric → `Number(req.params.index)`; if `'v'` → defaults to `0` initially.
- `bufferSize`: parsed as Number from `req.params.size`.
- Validates `uid`.
- **Guard:** Invalid UID → error `"uid is not vaild"`.

#### Step 2: Database Lookup (lines 299–302)
- Finds item by `_id`.
- **Guard:** Not found → error `"torrent can not be fund!!!"`.

#### Step 3: Video Index Resolution (lines 303–310)
- If `req.params.index === 'v'`:
  - Iterates `playList`, finds first entry where `isVideo(playList[i])` is true.
  - Sets `index` to that numeric index.
  - If no video found, `index` remains 0.

#### Step 4: File Path Construction (lines 311–312)
- `filePath = getFileLocation(items[0].owner, items[0]._id)`
- `bufferPath = {filePath}/{index}`

#### Step 5: Status Check & Response (lines 313–337)

Three mutually exclusive branches:

**Branch A: Error file exists** (`{bufferPath}_error` exists, line 313–315)
- Returns error: `"torrent video error!!!"`.

**Branch B: Download complete** (`{bufferPath}_complete` exists, lines 319–324)
- Responds with:
  ```json
  {
    "newBuffer": true,
    "complete": true,
    "ret_size": <file size of _complete file>
  }
  ```
- Does NOT trigger additional PlaylistApi call.

**Branch C: Download in progress** (`{bufferPath}` exists but not complete, lines 325–333)
- Gets current file size via `statSync`.
- Computes `newBuffer`: `true` if `total > bufferSize + 10MB` (10 × 1024 × 1024 bytes), `false` otherwise.
- Responds with:
  ```json
  {
    "newBuffer": <boolean>,
    "complete": false,
    "ret_size": <current file size>
  }
  ```
- Then triggers PlaylistApi call (same magnet/zip branching as `/all/download`).

**Branch D: Not started** (no buffer file exists, lines 334–337)
- Responds with:
  ```json
  { "start": true }
  ```
- Then triggers PlaylistApi call to begin download.

### PlaylistApi Call Details (line 318)
- Constructed as a function `qt()`:
  - If `magnet` exists → `PlaylistApi('torrent add', req.user, decodedMagnet, index, _id, owner)`
  - If no `magnet` → `PlaylistApi('zip add', req.user, index, _id, owner, playList[index], pwd)`
- Called AFTER sending response in branches C and D (non-blocking from client perspective).

### Error Scenarios

| Condition | Error Message |
|---|---|
| Invalid UID | `"uid is not vaild"` |
| Item not found | `"torrent can not be fund!!!"` |
| Error file exists for index | `"torrent video error!!!"` |
| PlaylistApi failure | Error propagated |

### Test Scenarios

| # | Scenario | Input | Expected Outcome |
|---|---|---|---|
| 1 | Download complete | `_complete` file exists | `{newBuffer: true, complete: true, ret_size: <size>}` |
| 2 | Download in progress, enough new data | Buffer file exists, size > clientSize + 10MB | `{newBuffer: true, complete: false, ret_size: <size>}` |
| 3 | Download in progress, insufficient new data | Buffer file exists, size ≤ clientSize + 10MB | `{newBuffer: false, complete: false, ret_size: <size>}` |
| 4 | Download not started | No buffer or complete file | `{start: true}`, PlaylistApi called |
| 5 | Error file exists | `_error` file present | Error: `"torrent video error!!!"` |
| 6 | Index = 'v', video found | Playlist has video at index 3 | Checks status of index 3 |
| 7 | Index = 'v', no video in playlist | No video entries | Defaults to index 0 |
| 8 | Magnet-based torrent | Item has `magnet` field | `PlaylistApi('torrent add', ...)` called |
| 9 | ZIP-based playlist | No `magnet` field | `PlaylistApi('zip add', ...)` called |
| 10 | Invalid UID | Bad format | Error response |
| 11 | Item not found | Valid UID, not in DB | Error: `"torrent can not be fund!!!"` |
| 12 | Numeric index | `/check/{uid}/5/0` | Checks playlist index 5 directly |
| 13 | 10MB threshold boundary | File exactly `clientSize + 10MB` | `newBuffer: false` (not strictly greater) |
| 14 | 10MB threshold boundary +1 | File = `clientSize + 10MB + 1` | `newBuffer: true` |
| 15 | PlaylistApi failure (in-progress) | API error after response sent | Error propagated, client already received response |
| 16 | Not authenticated | No session | Blocked by `checkLogin` |

---

## Endpoints NOT Present in This File

The following endpoints were referenced in the task description but do **not** exist in `playlist-router.js`:

| Endpoint | Notes |
|---|---|
| `PUT /f/api/torrent/kick/:uid` | Not defined in this router (0 matches in 340 lines) |
| `GET /f/api/torrent/list/:uid` | Not defined in this router |
| `POST /f/api/torrent/add/:uid` | Not defined in this router |
| `DELETE /f/api/torrent/del/:uid` | Not defined in this router |

These may reside in a different router file or may have been removed/refactored.

---

## Cross-Cutting Concerns

### Authentication
All endpoints protected by `checkLogin` middleware (line 21–23). Unauthenticated requests are rejected before reaching any handler.

### Error Handling Pattern
- Validation errors use `handleError(new HoError(message), next)`.
- Some inner errors omit `next` parameter: `handleError(new HoError(message))` — these may not properly propagate to Express error middleware (potential bug pattern at lines 47, 143–154, 258, 301, 314).
- Media upload errors use specialized `handleError(err, errorMedia, itemId, fileIndex)`.
- Fire-and-forget operations (setLatest, count increment) catch errors internally with logging only.

### File Path Conventions
| Path Pattern | Meaning |
|---|---|
| `getFileLocation(owner, id)` | Base file path for a storage item |
| `{base}/{index}` | In-progress download buffer |
| `{base}/{index}_complete` | Completed download for playlist item |
| `{base}/{index}_error` | Failed download marker |
| `{base}.N.rar` | RAR multi-part file (N = part number) |
| `{base}_7z` / `{base}_zip` | 7z/ZIP split part with suffix |
| `{base}_7z_c` / `{base}_zip_c` | Concatenated 7z/ZIP output |
| `{base}/real/{filename}` | Real file path reference (used in check endpoint) |

### WebSocket Notifications
- `POST /copy` sends `{type: 'file', data: newItemId}` after successful DB insert, scoped by `adultonly` flag.

### Database Operations
All endpoints interact with `STORAGEDB` collection via the `Mongo` helper:
- `find` with `{limit: 1}` for single-item lookups
- `update` with `$inc` for count increments
- `insert` for new file entries (copy endpoint)
# Section 13: Feature Routers (Bitfinex)

---

## 13.1 bitfinex-router.js — Crypto Trading

**Source:** `src/back/controllers/bitfinex-router.js` (50 lines)

### Overview

Provides REST endpoints for querying Bitfinex crypto trading data and managing automated trading bots. Unlike the other feature routers, this module does **not** use `TagTool`; it delegates directly to `BitfinexTool`.

### Dependencies

| Import | Purpose |
|---|---|
| `Express` | Router factory |
| `BitfinexTool` | Model layer — in-memory query, bot CRUD, credit operations |
| `checkLogin`, `handleError` | Auth middleware and centralised error handler from `../util/utility.js` |

### Authentication

All routes are protected by `checkLogin` applied as router-level middleware. No admin checks exist on any endpoint — every authenticated user has full access to query and bot management.

### Route Table

| Method | Path | Handler | Sync/Async | Response Shape |
|---|---|---|---|---|
| GET | `/get/:sortName(name\|mtime\|count)/:sortType(desc\|asc)/:page(\\d+)/:name?/:exactly(true\|false)?/:index(\\d+)?` | `BitfinexTool.query(page, name, sortName, sortType, user, session)` | **Synchronous** — `res.json()` returns the value directly, no Promise chain | Raw query result |
| GET | `/getSingle/...` (same param pattern as `/get`) | Same as `/get` — identical call to `BitfinexTool.query` | **Synchronous** | Raw query result |
| GET | `/single/:sortName(name\|mtime\|count)/:sortType(desc\|asc)/:uid/:user?` | `BitfinexTool.query(0, name, sortName, sortType, user, session, Number(uid))` | **Synchronous** — page is hardcoded to `0`, uid passed as `Number` | Raw query result |
| GET | `/parent` | `BitfinexTool.parent()` | **Synchronous** — no arguments | Parent list |
| GET | `/bot` | `BitfinexTool.getBot(user._id)` | Async (Promise) | Bot list |
| PUT | `/bot` | `BitfinexTool.updateBot(user._id, body, username)` | Async (Promise) | Updated bot list |
| GET | `/bot/del/:type` | `BitfinexTool.deleteBot(user._id, type, username)` | Async (Promise) | Updated bot list |
| GET | `/bot/close/:credit` | `BitfinexTool.closeCredit(username, credit)` | Async (Promise) | `{ apiOK: true }` |

### Implementation Notes

1. **Synchronous query paths:** The `/get`, `/getSingle`, `/single`, and `/parent` routes call `BitfinexTool.query` / `BitfinexTool.parent` synchronously — the return value is passed directly to `res.json()` with no `.then()` chain. This means the data is held entirely in memory and the call is blocking on the event loop.
2. **`/single` quirk — `req.params.name`:** The route pattern for `/single` does not define a `:name` param, yet the handler references `req.params.name`. This will always resolve to `undefined`, effectively passing no name filter. Behaviour is correct only if `BitfinexTool.query` treats `undefined` name as "no filter".
3. **`/bot` dual methods:** GET and PUT share the `/bot` path via `router.route('/bot')`.
4. **`/bot/del/:type` uses GET**, not DELETE. Destructive action via GET is an idempotency and cacheability concern.
5. **`/bot/close/:credit`** — `credit` is passed as a raw string; no `Number()` cast is applied.

### Test Scenarios

| # | Scenario | Expected Result |
|---|---|---|
| T-BFX-01 | Unauthenticated request to any route | Rejected by `checkLogin` middleware |
| T-BFX-02 | GET `/get/name/asc/0` — valid query, no optional params | Returns query result; `name` param is `undefined` |
| T-BFX-03 | GET `/get/name/asc/0/bitcoin/true/5` — all optional params supplied | Returns filtered query result |
| T-BFX-04 | GET `/get/invalid/asc/0` — sortName not in enum | Express route regex rejects; 404 |
| T-BFX-05 | GET `/get/name/asc/abc` — page is non-numeric | Express route regex rejects (requires `\\d+`); 404 |
| T-BFX-06 | GET `/single/name/asc/42` — uid supplied, no user param | `BitfinexTool.query` called with uid=42, name=undefined |
| T-BFX-07 | GET `/parent` | Returns `BitfinexTool.parent()` synchronously |
| T-BFX-08 | GET `/bot` — authenticated | Returns promise-resolved bot list |
| T-BFX-09 | PUT `/bot` with JSON body | Calls `updateBot` with user._id, body, username |
| T-BFX-10 | GET `/bot/del/someType` | Calls `deleteBot`; returns updated list |
| T-BFX-11 | GET `/bot/close/123` | Calls `closeCredit(username, "123")` — string, not number |
| T-BFX-12 | Concurrent synchronous queries (`/get`) | No data races expected (synchronous in-memory), but event loop is blocked during execution |

---

