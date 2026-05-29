# `session-tool.js` — Testing Strategy & Technical Documentation

> **Module**: `src/back/models/session-tool.js`
> **Role**: Express session configuration factory with Redis-backed store
> **Priority**: 🟡 High — Infrastructure-level module consumed by both servers
> **External Dependencies**: `connect-redis@^5.0.0`, `redis@^3.0.2`
> **Internal Dependencies**: `ver.js` (secrets/env), `config.js` (host/port resolution)
> **Consumers**: `controllers/server.js`, `controllers/file-server.js`

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Dependency Map](#2-dependency-map)
3. [Exported Function: `default` (Session Factory)](#3-exported-function-default-session-factory)
   - [Purpose](#31-purpose)
   - [Logic Flow](#32-logic-flow)
   - [Invocation & Authentication](#33-invocation--authentication)
   - [Returns & Side Effects](#34-returns--side-effects)
   - [Snapshot Testing Data](#35-snapshot-testing-data)
   - [Comprehensive Test Scenarios (100% Coverage)](#36-comprehensive-test-scenarios-100-coverage)
4. [Integration Testing Strategy](#4-integration-testing-strategy)
5. [Security Testing Strategy](#5-security-testing-strategy)
6. [Mocking Strategy](#6-mocking-strategy)

---

## 1. Module Overview

`session-tool.js` is a **factory function** that produces a fully configured `express-session` options object. It initializes a Redis-backed session store (`connect-redis`) using environment-aware host/port resolution and secret injection. The returned configuration is consumed by both the Main API server (`server.js`, port 8082/3389) and the File Server (`file-server.js`, port 8084/3391) to establish shared session state across the dual-server architecture.

### Source (21 lines)

```javascript
import { ENV_TYPE, SESS_SECRET, SESS_PWD } from '../../../ver.js'
import { SESS_IP, SESS_PORT } from '../config.js'
import ConnectRedis from 'connect-redis'
import Redis from 'redis'

export default function (express) {
    const redisStore = ConnectRedis(express)
    return {
        config: {
            secret: SESS_SECRET,
            cookie: {
                maxAge: 86400 * 1000 * 3,
                secure: true,
                httpOnly: true,
                sameSite: 'lax',
            },
            store: new redisStore({
                client: Redis.createClient(SESS_PORT(ENV_TYPE), SESS_IP(ENV_TYPE), {auth_pass: SESS_PWD}),
            }),
            resave: false,
            saveUninitialized: false,
        }
    }
}
```

---

## 2. Dependency Map

```
ver.js
  ├── ENV_TYPE ──────────── process.env (entire object; used as environment discriminator)
  ├── SESS_SECRET ───────── process.env.SESS_SECRET (session signing key)
  └── SESS_PWD ──────────── process.env.SESS_PWD (Redis AUTH password)

config.js
  ├── SESS_IP(env) ──────── Factory fn → 'redis' (dev/Docker) | '127.0.0.1' (release)
  └── SESS_PORT(env) ────── Factory fn → 6379 (both environments)

NPM
  ├── connect-redis@^5 ─── ConnectRedis(express-session) → RedisStore class
  └── redis@^3 ──────────── Redis.createClient(port, host, {auth_pass}) → RedisClient
```

---

## 3. Exported Function: `default` (Session Factory)

### 3.1 Purpose

Create and return an `express-session` configuration object with:

- A **cryptographic secret** for signing session cookies
- A **Redis-backed store** for distributed, persistent session storage
- **Secure cookie defaults** (HTTPS-only, 3-day expiry)
- **Performance-optimized** session save behavior (`resave: false`, `saveUninitialized: false`)

This enables cross-server session sharing: a user authenticated on the Main API server is also recognized by the File Server because both consume the same Redis store.

### 3.2 Logic Flow

```
┌─────────────────────────────────────────────┐
│  Caller invokes: SessionStore(expressSession)│
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ Step 1: Create RedisStore class             │
│   const redisStore = ConnectRedis(express)  │
│   ─ Wraps express-session with Redis adapter│
│   ─ Returns a constructor (class)           │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ Step 2: Resolve environment config          │
│   SESS_PORT(ENV_TYPE) → 6379               │
│   SESS_IP(ENV_TYPE)   → 'redis' | '127.0.0.1'│
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ Step 3: Create Redis client                 │
│   Redis.createClient(port, host, {          │
│     auth_pass: SESS_PWD                     │
│   })                                        │
│   ─ Establishes TCP connection to Redis     │
│   ─ Authenticates with password             │
│   ─ Returns RedisClient instance            │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ Step 4: Instantiate RedisStore              │
│   new redisStore({ client: <RedisClient> }) │
│   ─ Binds session CRUD to Redis             │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ Step 5: Return config object                │
│   { config: { secret, cookie, store,        │
│     resave, saveUninitialized } }           │
└─────────────────────────────────────────────┘
```

**Decision Points:**

| # | Decision | Resolved By | Outcome |
|---|----------|-------------|---------|
| 1 | Which Redis host/port? | `SESS_IP(ENV_TYPE)` / `SESS_PORT(ENV_TYPE)` | Dev: `redis:6379` (Docker DNS), Prod: `127.0.0.1:6379` |
| 2 | What session secret? | `SESS_SECRET` from env | Value from `process.env.SESS_SECRET` |
| 3 | What Redis password? | `SESS_PWD` from env | Value from `process.env.SESS_PWD` |

> **Note**: There are no explicit `if/else` branches in this module. All conditional logic is delegated to the `config.js` factory functions (`SESS_IP`, `SESS_PORT`), which internally switch on `env === RELEASE`.

### 3.3 Invocation & Authentication

#### Function Signature

```javascript
export default function (express: ExpressSession): { config: SessionConfig }
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `express` | `express-session` module | **Yes** | The express-session middleware function (not Express itself). Passed to `ConnectRedis()` to create the store class. |

#### How It's Called (Both Servers)

```javascript
// controllers/server.js (line 22)
import SessionStore from '../models/session-tool.js'
import session from 'express-session'

const sessionStore = SessionStore(session)
app.use(session(sessionStore.config))
```

```javascript
// controllers/file-server.js (line 19)
import SessionStore from '../models/session-tool.js'
import session from 'express-session'

const sessionStore = SessionStore(session)
app.use(session(sessionStore.config))
```

#### Implicit Authentication

This module itself does not perform user authentication. However, it configures the **session infrastructure** that authentication depends on:

- `SESS_SECRET` signs session cookies (tamper detection)
- `SESS_PWD` authenticates the Redis connection (data-plane security)
- `cookie.secure: true` enforces HTTPS-only cookie transmission
- `cookie.httpOnly: true` prevents JavaScript access to session cookie (XSS mitigation)
- `cookie.sameSite: 'lax'` provides CSRF protection; `'lax'` chosen over `'strict'` for cascading login compatibility

### 3.4 Returns & Side Effects

#### Return Value

```javascript
{
    config: {
        secret: String,                // Session signing secret
        cookie: {
            maxAge: 259200000,         // 3 days in ms (86400 * 1000 * 3)
            secure: true,              // HTTPS-only
            httpOnly: true,            // No JS access
            sameSite: 'lax'            // CSRF protection
        },
        store: RedisStore,             // connect-redis instance
        resave: false,                 // Don't re-save unchanged sessions
        saveUninitialized: false       // Don't create session until modified
    }
}
```

#### Side Effects

| Side Effect | Scope | Description |
|-------------|-------|-------------|
| **Redis TCP connection opened** | Network | `Redis.createClient()` initiates a persistent TCP connection to the Redis server. This connection remains open for the server's lifetime. |
| **Redis AUTH command issued** | Network | The `auth_pass` option causes an `AUTH` command to be sent immediately upon connection. |
| **Event listeners registered** | Process | The Redis client registers `error`, `connect`, `ready`, and `reconnecting` event handlers internally. |
| **No DB/MongoDB changes** | None | This module does not interact with MongoDB. |
| **No cache writes** | None | This module does not write data to the Redis data cache (LRU layer). Session data is written later by express-session at request time. |

### 3.5 Snapshot Testing Data

#### Expected Config Snapshot (Dev Environment)

```javascript
{
    config: {
        secret: "<SESS_SECRET from .env>",
        cookie: {
            maxAge: 259200000,
            secure: true
        },
        store: {
            // RedisStore instance — verify constructor was called with:
            //   client: RedisClient({ port: 6379, host: 'redis', auth_pass: '<SESS_PWD>' })
        },
        resave: false,
        saveUninitialized: false
    }
}
```

#### Key Snapshot Assertions

| Property Path | Expected Value | Assertion Type |
|---------------|---------------|----------------|
| `config.secret` | `process.env.SESS_SECRET` | Strict equality |
| `config.cookie.maxAge` | `259200000` (exactly) | Numeric equality |
| `config.cookie.secure` | `true` | Boolean strict |
| `config.cookie.httpOnly` | `true` | Boolean strict |
| `config.cookie.sameSite` | `'lax'` | String equality |
| `config.resave` | `false` | Boolean strict |
| `config.saveUninitialized` | `false` | Boolean strict |
| `config.store` | Instance of `RedisStore` | `instanceof` check |

#### Redis Client Construction Snapshot

```javascript
// Expected call to Redis.createClient:
Redis.createClient(
    6379,             // SESS_PORT(ENV_TYPE) → 6379
    'redis',          // SESS_IP(ENV_TYPE) → 'redis' (dev) or '127.0.0.1' (prod)
    { auth_pass: '<SESS_PWD from .env>' }
)
```

### 3.6 Comprehensive Test Scenarios (100% Coverage)

---

#### 3.6.1 Happy Path — Normal Initialization

| ID | Scenario | Input | Expected Result | Coverage Target |
|----|----------|-------|----------------|-----------------|
| HP-01 | Factory returns config object | Valid `express-session` module | Object with `.config` key containing all required properties | Statement coverage: L6–L21 |
| HP-02 | Secret is correctly assigned | `SESS_SECRET = 'test-secret-key'` | `config.secret === 'test-secret-key'` | L10 |
| HP-03 | Cookie maxAge equals 3 days | N/A (hardcoded) | `config.cookie.maxAge === 259200000` | L12 |
| HP-04 | Cookie secure flag is true | N/A (hardcoded) | `config.cookie.secure === true` | L13 |
| HP-05 | resave is false | N/A (hardcoded) | `config.resave === false` | L18 |
| HP-06 | saveUninitialized is false | N/A (hardcoded) | `config.saveUninitialized === false` | L19 |
| HP-07 | ConnectRedis called with express param | Mock express-session | `ConnectRedis` called once with the passed argument | L7 |
| HP-08 | RedisStore instantiated with client | Mock Redis client | `new redisStore({ client: <mock> })` called once | L15–L17 |
| HP-09 | Redis.createClient receives correct args (dev) | `ENV_TYPE` resolving to dev | Called with `(6379, 'redis', { auth_pass: '<pwd>' })` | L16 |
| HP-10 | Redis.createClient receives correct args (prod) | `ENV_TYPE` resolving to release | Called with `(6379, '127.0.0.1', { auth_pass: '<pwd>' })` | L16 |

---

#### 3.6.2 Logical Branches (Delegated to Dependencies)

> The module itself has **zero explicit branches**. All branching logic resides in `config.js` factory functions. These scenarios verify the branch delegation works correctly end-to-end.

| ID | Scenario | Condition | Expected Result | Coverage Target |
|----|----------|-----------|----------------|-----------------|
| LB-01 | Dev environment → Docker Redis host | `ENV_TYPE` = dev process.env | `SESS_IP(ENV_TYPE) === 'redis'` | config.js branch |
| LB-02 | Release environment → localhost Redis | `ENV_TYPE` = release process.env | `SESS_IP(ENV_TYPE) === '127.0.0.1'` | config.js branch |
| LB-03 | Dev environment → port 6379 | `ENV_TYPE` = dev process.env | `SESS_PORT(ENV_TYPE) === 6379` | config.js branch |
| LB-04 | Release environment → port 6379 | `ENV_TYPE` = release process.env | `SESS_PORT(ENV_TYPE) === 6379` | config.js branch |

---

#### 3.6.3 Edge Cases — Boundary Conditions

| ID | Scenario | Input | Expected Result | Rationale |
|----|----------|-------|----------------|-----------|
| EC-01 | `SESS_SECRET` is `undefined` | `process.env.SESS_SECRET` unset | `config.secret === undefined`; express-session will throw at runtime | Missing .env variable |
| EC-02 | `SESS_SECRET` is empty string | `process.env.SESS_SECRET = ''` | `config.secret === ''`; express-session may reject or warn | Empty secret edge case |
| EC-03 | `SESS_PWD` is `undefined` | `process.env.SESS_PWD` unset | Redis client created with `{ auth_pass: undefined }`; AUTH skipped or fails depending on Redis config | Missing password |
| EC-04 | `SESS_PWD` is empty string | `process.env.SESS_PWD = ''` | Redis AUTH sent with empty password; Redis rejects if requirepass is set | Empty password |
| EC-05 | `express` parameter is `null` | `SessionStore(null)` | `ConnectRedis(null)` throws TypeError | Null guard |
| EC-06 | `express` parameter is `undefined` | `SessionStore(undefined)` | `ConnectRedis(undefined)` throws TypeError | Undefined guard |
| EC-07 | `express` parameter is wrong type | `SessionStore('not-a-function')` | `ConnectRedis('not-a-function')` throws or returns unusable constructor | Type mismatch |
| EC-08 | Factory called multiple times | `SessionStore(session)` × N | Each call creates a **new** Redis client and store instance; verify no singleton caching | Multiple instantiation |
| EC-09 | Cookie maxAge arithmetic precision | N/A | `86400 * 1000 * 3 === 259200000` (safe integer, no floating-point issue) | Numeric overflow check |
| EC-10 | `ENV_TYPE` is unexpected value | `process.env` contains no `RELEASE` key | `SESS_IP`/`SESS_PORT` default to dev config values | Unknown environment fallback |

---

#### 3.6.4 Error Handling — Exception Scenarios

| ID | Scenario | Trigger | Expected Behavior | Error Type |
|----|----------|---------|-------------------|------------|
| EH-01 | Redis server unreachable | Wrong host/port or Redis down | `Redis.createClient()` succeeds (lazy connect), but store emits `error` event later | `RedisClient` error event |
| EH-02 | Redis AUTH failure | Wrong `SESS_PWD` | Redis client emits `error` with `NOAUTH` or `ERR invalid password` | Redis `ReplyError` |
| EH-03 | `ConnectRedis` receives invalid argument | Non-function `express` param | `ConnectRedis` throws `TypeError` | `TypeError` |
| EH-04 | `RedisStore` constructor fails | Null client | `new redisStore({ client: null })` may throw or produce broken store | Constructor error |
| EH-05 | Redis connection timeout | Network partition, firewall | Client emits `error` or `end` event after default timeout (~null by default in redis@3) | `AggregateError` / `error` event |
| EH-06 | Redis max memory exceeded | Server OOM | Session writes fail; store emits error | Redis `OOM` error |
| EH-07 | Import resolution failure | `ver.js` or `config.js` missing/corrupt | Module load fails at import time | `ERR_MODULE_NOT_FOUND` |
| EH-08 | `connect-redis` package missing | Not installed | Import fails | `ERR_MODULE_NOT_FOUND` |
| EH-09 | `redis` package missing | Not installed | Import fails | `ERR_MODULE_NOT_FOUND` |

---

#### 3.6.5 Auth / Login Scenarios (Session Infrastructure)

> While `session-tool.js` does not implement authentication directly, it provides the session layer that authentication depends on. These scenarios verify the session config supports auth correctly.

| ID | Scenario | Validation Point | Expected Behavior |
|----|----------|-----------------|-------------------|
| AL-01 | Session cookie is HTTPS-only | `config.cookie.secure === true` | Browser only sends cookie over HTTPS; prevents sniffing on HTTP |
| AL-02 | Session expires after 3 days | `config.cookie.maxAge === 259200000` | User must re-authenticate after 3 days of inactivity |
| AL-03 | Session not created for unauthenticated requests | `config.saveUninitialized === false` | No empty sessions stored in Redis for anonymous visitors |
| AL-04 | Unchanged sessions are not re-saved | `config.resave === false` | Reduces Redis write load; prevents race conditions on concurrent requests |
| AL-05 | Session secret enables cookie tamper detection | `config.secret` is set and non-empty | Modified session cookies are rejected by express-session signature check |
| AL-06 | Cross-server session sharing | Same Redis store, same secret | User authenticated on Main Server (port 8082/3389) is recognized by File Server (port 8084/3391) |
| AL-07 | Session fixation resistance | `saveUninitialized: false` + `resave: false` | Pre-authentication session IDs are not persisted, mitigating fixation attacks |
| AL-08 | Redis password prevents unauthorized store access | `auth_pass` configured | External processes cannot read/write session data without the Redis password |
| AL-09 | Cookie httpOnly flag prevents XSS | `config.cookie.httpOnly === true` | Session cookie cannot be read by client-side JavaScript |
| AL-10 | Cookie sameSite prevents CSRF | `config.cookie.sameSite === 'lax'` | Cookie not sent on cross-origin requests (except top-level navigations) |

---

#### 3.6.6 Structural / Snapshot Assertions

| ID | Scenario | Assertion |
|----|----------|-----------|
| SS-01 | Return value shape | `typeof result === 'object' && 'config' in result` |
| SS-02 | Config has exactly 5 top-level keys | `Object.keys(result.config)` → `['secret', 'cookie', 'store', 'resave', 'saveUninitialized']` |
| SS-03 | Cookie has exactly 2 keys | `Object.keys(result.config.cookie)` → `['maxAge', 'secure']` |
| SS-04 | Store is instance of RedisStore | `result.config.store instanceof redisStore` |
| SS-05 | No extra/unexpected properties | Deep structural snapshot matches expected schema |

---

## 4. Integration Testing Strategy

### 4.1 Session Middleware Integration

| ID | Test | Dependencies | Setup |
|----|------|-------------|-------|
| IT-01 | Session config integrates with `express-session` middleware | express, express-session | `app.use(session(sessionStore.config))` boots without error |
| IT-02 | Session data persists to Redis | Redis (running) | Set `req.session.user = {...}`, verify with `redis-cli GET sess:<id>` |
| IT-03 | Session retrieval across requests | Redis, supertest | First request sets session; second request reads same session |
| IT-04 | Cross-server session access | Both servers, shared Redis | Authenticate on Main Server; use same session cookie on File Server |
| IT-05 | Session expiry honored by Redis | Redis TTL | Verify Redis `TTL` on session key equals ~259200 seconds |
| IT-06 | Concurrent session writes | Redis, parallel requests | Two requests modifying the same session do not corrupt data (resave: false helps) |

### 4.2 Redis Connection Lifecycle

| ID | Test | Scenario | Expected |
|----|------|----------|----------|
| IT-07 | Connection established on startup | Normal boot | Redis client emits `ready` event |
| IT-08 | Reconnection after Redis restart | Kill Redis, restart | Client reconnects automatically; sessions resume |
| IT-09 | Graceful degradation on Redis failure | Redis down at boot | Server should handle error (log/crash depending on implementation) |

---

## 5. Security Testing Strategy

Per OUTLINE.md §11.7 — Session-specific security tests:

| ID | Area | Test Case | Risk |
|----|------|-----------|------|
| ST-01 | Cookie flags | Verify `secure: true` prevents HTTP transmission | Cookie sniffing |
| ST-02 | Session secret strength | Verify `SESS_SECRET` is sufficiently long and random | Session forgery |
| ST-03 | Redis AUTH | Verify `auth_pass` is non-empty in all environments | Unauthorized session access |
| ST-04 | Session fixation | Verify session ID regenerates after login (`req.session.regenerate`) | Session fixation attack |
| ST-05 | Cookie tampering | Modify session cookie value → request should be rejected | Session hijacking |
| ST-06 | Redis network isolation | Verify Redis port is not exposed externally in production | Direct Redis access |
| ST-07 | Explicit `httpOnly` flag | Verify `httpOnly: true` blocks JavaScript access to the session cookie | XSS session theft |
| ST-08 | Explicit `SameSite=lax` cookie attribute | Verify top-level navigation remains compatible while cross-site subrequests are restricted | CSRF via session cookie |

---

## 6. Mocking Strategy

### 6.1 Required Mocks for Unit Testing

```
┌─────────────────────────────────────────────┐
│  Module Under Test: session-tool.js          │
├─────────────────────────────────────────────┤
│                                              │
│  Mock 1: ver.js                              │
│    ├── ENV_TYPE → mock process.env object    │
│    ├── SESS_SECRET → 'mock-secret-123'       │
│    └── SESS_PWD → 'mock-redis-password'      │
│                                              │
│  Mock 2: config.js                           │
│    ├── SESS_IP → jest.fn(() => 'localhost')   │
│    └── SESS_PORT → jest.fn(() => 6379)       │
│                                              │
│  Mock 3: connect-redis                       │
│    └── Returns mock constructor function     │
│        that returns a mock store instance    │
│                                              │
│  Mock 4: redis                               │
│    └── Redis.createClient → returns mock     │
│        client object (spy on call args)      │
│                                              │
└─────────────────────────────────────────────┘
```

### 6.2 Mock Implementation Notes

| Mock Target | Approach | Verification Points |
|-------------|----------|-------------------|
| `ver.js` | `jest.mock('../../../ver.js')` with known test values | Secrets correctly propagated |
| `config.js` | `jest.mock('../config.js')` returning spy functions | Functions called with `ENV_TYPE`; return values used in Redis client args |
| `connect-redis` | `jest.mock('connect-redis')` returning factory spy | Called once with express-session; returned constructor called with `{ client }` |
| `redis` | `jest.mock('redis')` with `createClient` spy | Called with exact `(port, host, { auth_pass })` args |

### 6.3 What NOT to Mock

- The factory function itself (the SUT)
- The config object literal structure (test the actual return shape)
- The arithmetic in `maxAge` computation (verify the final value)

---

## Appendix: Coverage Matrix

| Line(s) | Statement | Branch | Covered By |
|---------|-----------|--------|------------|
| 1–4 | Imports | N/A | EH-07, EH-08, EH-09 |
| 6 | Function declaration | — | HP-01 |
| 7 | `ConnectRedis(express)` | — | HP-07, EC-05, EC-06, EC-07, EH-03 |
| 8 | Return object | — | HP-01, SS-01 |
| 10 | `secret: SESS_SECRET` | — | HP-02, EC-01, EC-02 |
| 11–14 | Cookie config | — | HP-03, HP-04, EC-09, AL-01, AL-02 |
| 15–17 | RedisStore + createClient | — | HP-08, HP-09, HP-10, EC-03, EC-04, EH-01, EH-02 |
| 18 | `resave: false` | — | HP-05, AL-04 |
| 19 | `saveUninitialized: false` | — | HP-06, AL-03, AL-07 |
| 6–21 (all) | Full function | — | SS-02, SS-05, EC-08 |

> **Estimated Coverage**: 100% statement, 100% branch (no branches in SUT), 100% function (1 of 1).
