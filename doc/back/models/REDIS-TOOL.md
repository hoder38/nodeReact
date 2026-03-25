# redis-tool.js — Technical Documentation & QA Testing Strategy

> **Module**: `src/back/models/redis-tool.js`
> **Role**: Redis client wrapper — provides a unified Promise-based interface to all Redis commands with transactional (`multi`) support
> **Layer**: Model (Infrastructure)
> **External Dependency**: `redis` npm package (Node Redis client)
> **Referenced By**: `fitness-tool.js`, `external-tool.js`, `bitfinex-tool.js`, `stock-tool.js`, `storage-router.js`, `file-other-router.js`
> **Test File Location**: `src/back/models/__tests__/redis-tool.test.js`

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Client Initialization & Connection Events](#2-client-initialization--connection-events)
3. [Default Export — Unified Redis Command Dispatcher](#3-default-export--unified-redis-command-dispatcher)
4. [Comprehensive Test Scenarios](#4-comprehensive-test-scenarios)
5. [Snapshot Testing Data](#5-snapshot-testing-data)
6. [Test Infrastructure & Mocking Strategy](#6-test-infrastructure--mocking-strategy)
7. [Traceability Matrix](#7-traceability-matrix)

---

## 1. Module Overview

`redis-tool.js` is a thin wrapper around the Node `redis` client library. It accomplishes three things:

1. **Establishes a singleton Redis connection** using environment-specific host, port, and authentication credentials.
2. **Configures the Redis instance** on connect (`maxmemory: 100mb`, `maxmemory-policy: allkeys-lru`).
3. **Exports a single function** that proxies any Redis command through a Promise interface and provides special handling for `multi` (transactional batch) operations.

### Dependency Graph

```
ver.js ──────────► ENV_TYPE, SESS_PWD
config.js ────────► SESS_IP(env), SESS_PORT(env)
redis (npm) ──────► Redis.createClient()
                         │
                    redis-tool.js
                         │
              ┌──────────┼──────────────┬──────────────┐
              ▼          ▼              ▼              ▼
        fitness-tool  stock-tool  storage-router  file-other-router
        external-tool bitfinex-tool
```

### Known Redis Commands Used by Consumers

| Command    | Callers                                             |
|------------|-----------------------------------------------------|
| `hmset`    | bitfinex-tool, external-tool, fitness-tool, stock-tool, storage-router, file-other-router |
| `hgetall`  | bitfinex-tool, external-tool, fitness-tool, stock-tool, storage-router, file-other-router |
| `hmget`    | fitness-tool                                        |
| `hget`     | fitness-tool, storage-router, file-other-router     |
| `del`      | fitness-tool                                        |
| `multi`    | storage-router, file-other-router                   |

---

## 2. Client Initialization & Connection Events

### 2.1 `Redis.createClient()` — Connection Setup

```
const client = Redis.createClient(
    SESS_PORT(ENV_TYPE),   // Port from config (6379 typical)
    SESS_IP(ENV_TYPE),     // Host from config
    { auth_pass: SESS_PWD } // Password from environment variable
);
```

#### Purpose

Create and authenticate a persistent Redis connection using environment-dependent configuration.

#### Logic Flow

```
1. Import ENV_TYPE (process.env) and SESS_PWD from ver.js
2. Import SESS_IP / SESS_PORT functions from config.js
3. Call SESS_PORT(ENV_TYPE) → resolve port based on dev/release environment
4. Call SESS_IP(ENV_TYPE) → resolve host based on dev/release environment
5. Call Redis.createClient(port, host, { auth_pass }) → return client instance
```

#### Invocation & Authentication

- **Not user-invocable** — runs at module import time (side effect).
- Authenticates with `SESS_PWD` environment variable via `auth_pass` option.
- Connection is a **module-level singleton**: all consumers share one client.

#### Returns & Side Effects

| Aspect          | Detail                                              |
|-----------------|-----------------------------------------------------|
| Returns         | `client` instance (module-scoped, not exported)     |
| Side Effect     | Opens a persistent TCP connection to Redis           |
| Side Effect     | Registers three event listeners (`error`, `ready`, `connect`) |
| Console Output  | Logs on error, ready, and connect events            |

---

### 2.2 Event Handlers

#### `client.on('error', ...)`

- **Purpose**: Log Redis connection/runtime errors to stdout.
- **Logic**: Receives `err` object → logs `Redis error: ${err}`.
- **Side Effect**: Console output only — no error propagation, no reconnect logic, no crash.

#### `client.on('ready', ...)`

- **Purpose**: Signal that the client has completed authentication and is ready.
- **Logic**: Logs `Redis ready`.
- **Note**: The callback signature includes an `err` parameter that is unused.

#### `client.on('connect', ...)`

- **Purpose**: Configure the Redis instance memory policies immediately after connection.
- **Logic Flow**:
  ```
  1. Connection established → event fires
  2. client.config('SET', 'maxmemory', '100mb')
  3. client.config('SET', 'maxmemory-policy', 'allkeys-lru')
  ```
- **Side Effects**:
  - Redis server memory capped at 100 MB.
  - Eviction policy set to `allkeys-lru` (Least Recently Used across all keys).
  - Logs `Redis connect`.

---

## 3. Default Export — Unified Redis Command Dispatcher

### 3.1 Function Signature

```js
export default function(functionName, ...args)
```

| Parameter      | Type       | Required | Description                                                    |
|----------------|------------|----------|----------------------------------------------------------------|
| `functionName` | `string`   | Yes      | Redis command name (e.g., `'get'`, `'set'`, `'hmset'`, `'multi'`) |
| `...args`      | `any[]`    | Varies   | Command-specific arguments; for `multi`, the first arg is an array of command tuples |

### 3.2 Purpose

Provide a single Promise-based entry point for **all** Redis operations, abstracting away the callback-style API of the `redis` npm client. Includes special handling for `multi` transactions.

### 3.3 Logic Flow — Decision Tree

```
┌─────────────────────────────────────────────┐
│  Caller invokes: redisTool(functionName, …) │
└────────────────────┬────────────────────────┘
                     │
            ┌────────▼────────┐
            │ functionName    │
            │ === 'multi' ?   │
            └───┬─────────┬───┘
               YES        NO
                │          │
     ┌──────────▼──┐  ┌───▼──────────────────────────────┐
     │ MULTI PATH  │  │ STANDARD PATH                     │
     │             │  │                                    │
     │ 1. Create   │  │ 1. Call client[functionName](…args,│
     │    multi()  │  │    callback)                       │
     │ 2. Iterate  │  │ 2. Wrap in new Promise             │
     │    args[0]  │  │ 3. callback(err, data):            │
     │    array    │  │    err → reject(err)               │
     │ 3. For each │  │    ok  → resolve(data)             │
     │    tuple:   │  └────────────────────────────────────┘
     │    [cmd,    │
     │    ...params│
     │    ]        │
     │ 4. Chain    │
     │    multi[cmd│
     │    ](params)│
     │ 5. Call     │
     │    multi    │
     │    .exec()  │
     │ 6. Wrap in  │
     │    Promise  │
     │ 7. callback │
     │    (err,    │
     │    data):   │
     │   err →     │
     │   reject    │
     │   ok →      │
     │   resolve   │
     └─────────────┘
```

### 3.4 Branch: Standard Command Path (`functionName !== 'multi'`)

#### Logic

```js
return new Promise((resolve, reject) =>
    client[functionName](...args, (err, data) =>
        err ? reject(err) : resolve(data)
    )
);
```

1. Access the Redis command method dynamically via `client[functionName]`.
2. Spread all additional `...args` as command parameters.
3. Append a Node-style `(err, data)` callback as the **final** argument.
4. On error → `reject(err)` (Promise rejection).
5. On success → `resolve(data)` (Promise resolution with Redis response).

#### Invocation Examples

```js
// GET a key
redisTool('get', 'session:abc123')

// HMSET a hash
redisTool('hmset', 'user:42', 'name', 'Alice', 'role', 'admin')

// HGETALL
redisTool('hgetall', 'cache:stock:AAPL')

// DEL a key
redisTool('del', 'cache:expired')
```

#### Returns & Side Effects

| Aspect          | Detail                                                   |
|-----------------|----------------------------------------------------------|
| Returns         | `Promise<any>` — resolves with the Redis command response |
| Rejection       | `Promise<Error>` — rejects with the Redis error object    |
| Side Effect     | Executes the Redis command (read or write)                |
| Cache Impact    | Depends on the command (SET/HMSET write; GET/HGETALL read; DEL delete) |

---

### 3.5 Branch: Multi/Transaction Path (`functionName === 'multi'`)

#### Logic

```js
let multi = client.multi();
args[0].forEach(a => {
    const [b, ...c] = a;
    multi = multi[b](...c);
});
return new Promise((resolve, reject) =>
    multi.exec((err, data) => err ? reject(err) : resolve(data))
);
```

1. Create a new `multi` (transaction) context on the client.
2. Read `args[0]` — expected to be an **array of command tuples**: `[[cmd, ...params], ...]`.
3. For each tuple, destructure: `b` = command name, `c` = parameters.
4. Chain `multi[b](...c)` — queues each command in the transaction pipeline.
5. Call `multi.exec()` — atomically execute all queued commands.
6. Wrap the exec callback in a Promise: error → reject, success → resolve.

#### Invocation Examples

```js
// Batch read multiple hash keys
redisTool('multi', [
    ['hgetall', 'cache:item:1'],
    ['hgetall', 'cache:item:2'],
    ['hgetall', 'cache:item:3']
])

// Mixed read/write batch
redisTool('multi', [
    ['hmset', 'cache:item:1', 'views', '100'],
    ['del', 'cache:item:old'],
    ['hgetall', 'cache:item:1']
])
```

#### Returns & Side Effects

| Aspect          | Detail                                                           |
|-----------------|------------------------------------------------------------------|
| Returns         | `Promise<Array>` — resolves with an array of results, one per queued command |
| Rejection       | `Promise<Error>` — rejects if the transaction execution fails     |
| Side Effect     | Atomically executes all queued commands on the Redis server       |
| Atomicity       | Redis guarantees all commands in `multi.exec()` run without interleaving |

#### `args[0]` Data Structure

```js
// Type: Array<[string, ...any[]]>
[
    ['hgetall', 'keyName'],               // [commandName, ...params]
    ['hmset', 'keyName', 'field', 'val'], // [commandName, key, field, value]
    ['del', 'keyName'],                   // [commandName, key]
]
```

---

## 4. Comprehensive Test Scenarios (100% Coverage)

### 4.1 Client Initialization Tests

| ID       | Scenario                                       | Category         | Expected Outcome                                  |
|----------|-------------------------------------------------|------------------|----------------------------------------------------|
| INIT-01  | Module imports successfully with valid env vars | Happy Path       | `createClient` called with correct port, host, auth_pass |
| INIT-02  | `SESS_PORT(ENV_TYPE)` resolves correct dev port | Config           | Port value matches dev config (e.g., 6379)         |
| INIT-03  | `SESS_IP(ENV_TYPE)` resolves correct dev host   | Config           | Host value matches dev config                      |
| INIT-04  | `SESS_PWD` is passed as `auth_pass` option      | Auth             | Options object contains `{ auth_pass: <value> }`   |
| INIT-05  | `ENV_TYPE` is `undefined` or unexpected value   | Edge Case        | Falls through to dev config (default branch)       |
| INIT-06  | `SESS_PWD` is `undefined` (no env var set)      | Error Handling   | `auth_pass` is `undefined`; Redis may reject auth  |

### 4.2 Event Handler Tests

| ID       | Scenario                                           | Category         | Expected Outcome                                  |
|----------|----------------------------------------------------|------------------|----------------------------------------------------|
| EVT-01   | `'error'` event fires with Error object            | Error Handling   | `console.log` called with `Redis error: <err>`    |
| EVT-02   | `'error'` event fires with string error            | Edge Case        | Logged correctly via template literal              |
| EVT-03   | `'ready'` event fires                              | Happy Path       | `console.log` called with `Redis ready`           |
| EVT-04   | `'connect'` event fires                            | Happy Path       | `console.log` logs `Redis connect`                |
| EVT-05   | `'connect'` event sets maxmemory to 100mb          | Side Effect      | `client.config('SET', 'maxmemory', '100mb')` called |
| EVT-06   | `'connect'` event sets eviction to allkeys-lru     | Side Effect      | `client.config('SET', 'maxmemory-policy', 'allkeys-lru')` called |
| EVT-07   | `'connect'` fires multiple times (reconnect)       | Edge Case        | Config commands re-issued each time (idempotent)  |
| EVT-08   | `client.config` fails during `'connect'`           | Error Handling   | No crash; error propagates through Redis error event |

### 4.3 Standard Command Path Tests (`functionName !== 'multi'`)

| ID       | Scenario                                             | Category           | Expected Outcome                                        |
|----------|------------------------------------------------------|--------------------|---------------------------------------------------------|
| STD-01   | `redisTool('get', 'key')` — key exists               | Happy Path         | Promise resolves with the stored string value            |
| STD-02   | `redisTool('get', 'key')` — key does not exist        | Happy Path         | Promise resolves with `null`                             |
| STD-03   | `redisTool('set', 'key', 'value')` — write           | Happy Path         | Promise resolves with `'OK'`                             |
| STD-04   | `redisTool('hmset', key, field, val)` — hash write   | Happy Path         | Promise resolves with `'OK'`; hash fields updated        |
| STD-05   | `redisTool('hgetall', 'key')` — hash exists          | Happy Path         | Promise resolves with `{ field: value, ... }` object     |
| STD-06   | `redisTool('hgetall', 'key')` — key not found         | Edge Case          | Promise resolves with `null`                             |
| STD-07   | `redisTool('hget', 'key', 'field')` — field exists   | Happy Path         | Promise resolves with the field's string value           |
| STD-08   | `redisTool('hget', 'key', 'field')` — field missing  | Edge Case          | Promise resolves with `null`                             |
| STD-09   | `redisTool('hmget', 'key', 'f1', 'f2')` — mixed      | Happy Path         | Promise resolves with `['val1', null]` for existing/missing |
| STD-10   | `redisTool('del', 'key')` — key exists               | Happy Path         | Promise resolves with `1` (number of keys deleted)       |
| STD-11   | `redisTool('del', 'key')` — key does not exist        | Edge Case          | Promise resolves with `0`                                |
| STD-12   | Redis returns an error (e.g., WRONGTYPE)             | Error Handling     | Promise rejects with the Redis error object              |
| STD-13   | `functionName` is not a valid Redis command           | Error Handling     | `client[functionName]` is `undefined` → TypeError thrown |
| STD-14   | `functionName` is `undefined`                         | Edge Case          | `client[undefined]` → TypeError                         |
| STD-15   | `functionName` is `null`                              | Edge Case          | `client[null]` → TypeError                              |
| STD-16   | `functionName` is an empty string `''`                | Edge Case          | `client['']` → TypeError (no such method)               |
| STD-17   | No additional args provided (e.g., `redisTool('ping')`) | Edge Case       | Promise resolves with `'PONG'` (callback auto-appended) |
| STD-18   | Args contain special characters / binary data         | Edge Case          | Data passes through unchanged; Redis handles encoding    |
| STD-19   | Connection is down when command issued                | Error Handling     | Promise rejects with connection error                    |
| STD-20   | Very large value (approaching 100MB limit)            | Boundary           | May trigger LRU eviction; command itself may succeed or error |
| STD-21   | Concurrent calls to the same key                      | Concurrency        | Both resolve independently; last-write-wins semantics    |

### 4.4 Multi/Transaction Path Tests (`functionName === 'multi'`)

| ID       | Scenario                                                     | Category           | Expected Outcome                                                 |
|----------|--------------------------------------------------------------|--------------------|-----------------------------------------------------------------|
| MUL-01   | Single command tuple: `[['get', 'key']]`                     | Happy Path         | Promise resolves with `[value]` (1-element array)                |
| MUL-02   | Multiple command tuples (batch read)                         | Happy Path         | Promise resolves with array of results in order                  |
| MUL-03   | Mixed read/write commands in batch                           | Happy Path         | All commands execute atomically; results array matches order     |
| MUL-04   | Empty command array: `[]`                                    | Edge Case          | `multi.exec()` resolves with empty array `[]`                   |
| MUL-05   | Command tuple with no params: `[['ping']]`                   | Edge Case          | Destructures to `b='ping'`, `c=[]`; resolves with `['PONG']`    |
| MUL-06   | Invalid command name in tuple: `[['notacommand', 'key']]`   | Error Handling     | `multi[b]` is `undefined` → TypeError during queue phase         |
| MUL-07   | `args[0]` is `undefined` (no command array provided)         | Error Handling     | `args[0].forEach` → TypeError: cannot read property of undefined |
| MUL-08   | `args[0]` is `null`                                          | Error Handling     | `null.forEach` → TypeError                                      |
| MUL-09   | `args[0]` is not an array (e.g., string, number)             | Edge Case          | `.forEach` may not exist → TypeError                             |
| MUL-10   | Tuple is not an array: `['string']`                          | Error Handling     | Destructure `[b, ...c]` on string → `b` = first char → invalid command |
| MUL-11   | Tuple is empty array: `[[]]`                                 | Edge Case          | `b = undefined`, `c = []` → `multi[undefined]()` → TypeError    |
| MUL-12   | `multi.exec` returns error                                   | Error Handling     | Promise rejects with the error from `exec` callback              |
| MUL-13   | Individual command within multi fails (WRONGTYPE)            | Error Handling     | Redis `exec` returns `null` for the failed command in results array; overall may not reject |
| MUL-14   | Large batch (100+ commands)                                  | Performance        | Should process without stack overflow; results array length matches input |
| MUL-15   | Nested arrays in command tuples                              | Edge Case          | Spread `...c` passes them as-is to Redis command                 |
| MUL-16   | Connection lost mid-transaction                              | Error Handling     | `exec` callback receives error → Promise rejects                 |
| MUL-17   | `multi` chaining returns new multi object each time          | Correctness        | `multi = multi[b](...c)` reassignment preserves chain            |

### 4.5 Boundary & Security Tests

| ID       | Scenario                                                 | Category    | Expected Outcome                                       |
|----------|----------------------------------------------------------|-------------|--------------------------------------------------------|
| SEC-01   | `functionName` is a prototype method (e.g., `'constructor'`, `'__proto__'`) | Security | Should not expose or execute internal client methods    |
| SEC-02   | Key contains injection-like patterns                     | Security    | Redis treats keys as opaque binary strings; no injection risk |
| SEC-03   | Auth password is incorrect                               | Auth        | Client emits `'error'` event with NOAUTH/WRONGPASS     |
| SEC-04   | Auth password is empty string                            | Auth        | Depends on Redis server config; may fail or succeed    |
| BND-01   | Key name is empty string `''`                            | Boundary    | Redis accepts empty keys; command succeeds             |
| BND-02   | Key name is very long (>512 MB key name limit)           | Boundary    | Redis rejects; error propagated                        |
| BND-03   | Value is `0`, `false`, `''` (falsy values)               | Boundary    | Redis stores as strings; `resolve` returns string `'0'`, `'false'`, `''` |

---

## 5. Snapshot Testing Data

### 5.1 Standard Command — `hgetall` Response

```json
{
  "functionName": "hgetall",
  "key": "cache:stock:AAPL",
  "expectedResponse": {
    "symbol": "AAPL",
    "price": "178.52",
    "pe": "29.14",
    "updated": "1679068800000"
  }
}
```

### 5.2 Standard Command — `hmset` Invocation

```json
{
  "functionName": "hmset",
  "args": ["cache:stock:AAPL", "symbol", "AAPL", "price", "178.52", "pe", "29.14", "updated", "1679068800000"],
  "expectedResponse": "OK"
}
```

### 5.3 Standard Command — `hget` Response

```json
{
  "functionName": "hget",
  "args": ["cache:stock:AAPL", "price"],
  "expectedResponse": "178.52"
}
```

### 5.4 Standard Command — `hmget` Response

```json
{
  "functionName": "hmget",
  "args": ["cache:fitness:user42", "weight", "height", "nonexistent"],
  "expectedResponse": ["75.5", "180", null]
}
```

### 5.5 Multi Command — Batch Read

```json
{
  "functionName": "multi",
  "args": [
    [
      ["hgetall", "cache:item:1"],
      ["hgetall", "cache:item:2"],
      ["hgetall", "cache:item:3"]
    ]
  ],
  "expectedResponse": [
    { "name": "Item 1", "views": "42" },
    { "name": "Item 2", "views": "17" },
    null
  ]
}
```

### 5.6 Multi Command — Mixed Operations

```json
{
  "functionName": "multi",
  "args": [
    [
      ["hmset", "cache:item:1", "views", "100"],
      ["del", "cache:item:old"],
      ["hgetall", "cache:item:1"]
    ]
  ],
  "expectedResponse": [
    "OK",
    1,
    { "views": "100" }
  ]
}
```

### 5.7 Error Response Snapshot

```json
{
  "functionName": "hgetall",
  "key": "non-hash-key",
  "expectedError": {
    "message": "WRONGTYPE Operation against a key holding the wrong kind of value",
    "command": "HGETALL",
    "code": "WRONGTYPE"
  }
}
```

### 5.8 Client Configuration Snapshot (on connect)

```json
{
  "event": "connect",
  "configCommands": [
    { "command": "config", "args": ["SET", "maxmemory", "100mb"] },
    { "command": "config", "args": ["SET", "maxmemory-policy", "allkeys-lru"] }
  ]
}
```

---

## 6. Test Infrastructure & Mocking Strategy

### 6.1 Module Mocking Approach

Since `redis-tool.js` creates a client at **import time** (module-level side effect), tests must mock the `redis` module **before** importing `redis-tool.js`.

```
Mock Targets:
├── redis (npm)
│   ├── createClient() → returns mock client object
│   └── Mock client methods: get, set, hmset, hgetall, hget, hmget, del, multi, config, on
├── ver.js
│   ├── ENV_TYPE → controlled test value
│   └── SESS_PWD → controlled test password
└── config.js
    ├── SESS_IP() → '127.0.0.1'
    └── SESS_PORT() → 6379
```

### 6.2 Mock Client Structure

```
mockClient = {
    on: jest.fn((event, callback) => store callback for later invocation),
    config: jest.fn(),
    get: jest.fn((key, cb) => cb(null, 'value')),
    set: jest.fn((key, val, cb) => cb(null, 'OK')),
    hmset: jest.fn((...args) => { const cb = args.pop(); cb(null, 'OK') }),
    hgetall: jest.fn((key, cb) => cb(null, { field: 'value' })),
    hget: jest.fn((key, field, cb) => cb(null, 'value')),
    hmget: jest.fn((...args) => { const cb = args.pop(); cb(null, [...]) }),
    del: jest.fn((key, cb) => cb(null, 1)),
    multi: jest.fn(() => mockMulti),
}

mockMulti = {
    hgetall: jest.fn(() => mockMulti),  // returns self for chaining
    hmset: jest.fn(() => mockMulti),
    del: jest.fn(() => mockMulti),
    exec: jest.fn((cb) => cb(null, [...])),
}
```

### 6.3 Testing Event Handlers

To test the `'connect'`, `'ready'`, and `'error'` event handlers:

1. Capture the callback registered via `mockClient.on(event, callback)`.
2. Invoke the captured callback manually in the test.
3. Assert `console.log` was called with the expected message.
4. For `'connect'`, assert `client.config` was called twice with the correct arguments.

### 6.4 Framework & Configuration

| Aspect            | Value                                                    |
|-------------------|----------------------------------------------------------|
| Framework         | Jest 27 (ESM mode via `jest.config.cjs`)                 |
| Assertion Style   | `expect()` with Jest matchers                            |
| Mocking           | `jest.unstable_mockModule()` (ESM) or manual mock in `__mocks__/` |
| Async Testing     | `async/await` with `expect(...).resolves` / `.rejects`   |
| Console Spying    | `jest.spyOn(console, 'log')` to verify logging           |
| Test Location     | `src/back/models/__tests__/redis-tool.test.js`           |
| Execution Phase   | Phase 2 (per OUTLINE.md §11.9 priority)                  |

---

## 7. Traceability Matrix

| Source Line(s) | Logic Element                          | Test IDs                                |
|----------------|----------------------------------------|-----------------------------------------|
| 1–2            | Import config (ENV_TYPE, SESS_*)       | INIT-01 through INIT-06                 |
| 6              | `Redis.createClient()`                 | INIT-01, INIT-04, SEC-03, SEC-04        |
| 7              | `client.on('error', ...)`             | EVT-01, EVT-02                          |
| 8              | `client.on('ready', ...)`             | EVT-03                                  |
| 9–13           | `client.on('connect', ...)` + config   | EVT-04, EVT-05, EVT-06, EVT-07, EVT-08 |
| 15             | Function signature / entry point       | STD-13, STD-14, STD-15, STD-16          |
| 16             | `if (functionName === 'multi')`        | MUL-01 through MUL-17                   |
| 17             | `client.multi()`                       | MUL-01, MUL-04                          |
| 18             | `args[0].forEach(...)`                 | MUL-07, MUL-08, MUL-09                  |
| 19             | Destructure `[b, ...c]`               | MUL-05, MUL-10, MUL-11                  |
| 20             | `multi[b](...c)` chaining             | MUL-06, MUL-17                          |
| 22             | `multi.exec()` Promise                 | MUL-02, MUL-03, MUL-12, MUL-13, MUL-16 |
| 23–24          | Standard command Promise               | STD-01 through STD-21                   |
| 24             | `client[functionName](...args, cb)`    | STD-13, STD-17, STD-18, SEC-01          |
| 24             | `err ? reject(err) : resolve(data)`   | STD-12, STD-19                          |

---

> **Total Scenarios**: 55 test cases across 5 categories
> **Branch Coverage Target**: 100% (2 branches: `multi` vs standard)
> **Statement Coverage Target**: 100% (lines 1–25)
> **Priority**: Phase 2 — Backend Integration (per OUTLINE.md §11.9)
