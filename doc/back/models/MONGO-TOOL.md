# mongo-tool.js — Technical Documentation & QA Testing Strategy

> **Module**: `src/back/models/mongo-tool.js` (117 lines)
> **Role**: MongoDB connection pool manager + CRUD wrapper
> **Priority**: 🔴 Critical — foundational data-access layer used by all backend models
> **Reference**: [OUTLINE.md §3.4, §11.2, §11.3](../../OUTLINE.md)

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Dependencies & Imports](#2-dependencies--imports)
3. [Module-Level Connection Initializer](#3-module-level-connection-initializer)
4. [Exported Function: `objectID`](#4-exported-function-objectid)
5. [Default Export: CRUD Dispatcher](#5-default-export-crud-dispatcher)
6. [Module-Level State](#6-module-level-state)
7. [Cross-Cutting Concerns](#7-cross-cutting-concerns)

---

## 1. Module Overview

`mongo-tool.js` is the single point of contact between the application and MongoDB. It:

1. Establishes and manages a persistent connection pool on module load.
2. Seeds the `user` collection with a root user when the collection is empty.
3. Exposes an `objectID` helper to create/parse MongoDB `ObjectId` values.
4. Exports a default CRUD dispatcher that translates simplified operation names (`insert`, `count`, `update`) into native MongoDB driver methods and wraps callback-based driver calls in Promises.

Every backend model and controller that reads or writes MongoDB data does so through this module's default export.

---

## 2. Dependencies & Imports

| Import | Source | Usage |
|--------|--------|-------|
| `ENV_TYPE` | `../../../ver.js` | Selects dev/release environment |
| `DB_USERNAME`, `DB_PWD` | `../../../ver.js` | MongoDB authentication credentials |
| `ROOT_USER` | `../../../ver.js` | Default root user document template |
| `DEFAULT_PASS` | `../../../ver.js` | Default root user password (plaintext) |
| `DB_IP`, `DB_PORT`, `DB_NAME` | `../config.js` | Environment-aware DB host, port, database name (functions of `ENV_TYPE`) |
| `mongodb` → `MongoClient`, `ObjectId` | `mongodb` (npm) | Native MongoDB Node.js driver |
| `crypto` → `createHash` | Node built-in | MD5 hashing for root user password seeding |
| `handleError`, `HoError` | `../util/utility.js` | Centralized error logging / custom error constructor |

---

## 3. Module-Level Connection Initializer

### 3.1 Purpose

Establish a persistent MongoDB connection when the module is first imported. If the database has zero users, seed it with a default root account.

### 3.2 Logic Flow

```
Module imported
│
├─► MongoClient.connect(URI + "?authSource=admin", opts)
│   │
│   ├─ SUCCESS (no err) ──────────────────────────────────┐
│   │   ├─ client is falsy? → handleError("No client")    │
│   │   ├─ client.db() is falsy? → handleError("No db")   │
│   │   ├─ Assign db to module-level `mongo`               │
│   │   └─ → seedRootUser(db)                              │
│   │                                                      │
│   └─ FAILURE (err) ─► RETRY without "?authSource=admin"  │
│       │                                                  │
│       ├─ SUCCESS ────────────────────────────────────────┘
│       │   (same validation + seed logic)
│       │
│       └─ FAILURE → handleError(err, 'DB connect')
│
seedRootUser(db):
    db.collection('user') → collection
    collection.countDocuments()
    ├─ count === 0 → insertOne({ ...ROOT_USER, password: md5(DEFAULT_PASS) })
    └─ count > 0  → no-op (log count)
```

### 3.3 Invocation & Authentication

- **Invocation**: Automatic on first `import`. No explicit call required.
- **Authentication**: Uses `DB_USERNAME` / `DB_PWD` from `ver.js`, authenticating against the `admin` database (primary) or the target database (fallback).
- **Connection Options**: `poolSize: 10`, `useUnifiedTopology: true`.

### 3.4 Returns & Side Effects

| Aspect | Detail |
|--------|--------|
| **Returns** | Nothing (void); sets module-scoped `mongo` variable |
| **DB Side Effect** | May insert one document into the `user` collection |
| **Password Hashing** | MD5 of `DEFAULT_PASS` (⚠️ MD5 is cryptographically weak; acceptable only for initial seed) |
| **Console Output** | `"database connected"`, user count, and inserted user object |

### 3.5 Snapshot Testing Data

**Root user seed document:**
```json
{
  "_id": "<ObjectId>",
  "username": "<ROOT_USER.username>",
  "perm": "<ROOT_USER.perm>",
  "password": "md5hex(<DEFAULT_PASS>)",
  "...other ROOT_USER fields": "..."
}
```

**Connection URI patterns:**
```
Primary:  mongodb://<user>:<pwd>@<host>:<port>/<dbname>?authSource=admin
Fallback: mongodb://<user>:<pwd>@<host>:<port>/<dbname>
```

### 3.6 Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches

| # | Scenario | Branch | Expected Outcome |
|---|----------|--------|-----------------|
| 1 | Primary connection succeeds, client valid, db valid | L11→L52–L81 | `mongo` assigned, seed check runs |
| 2 | Primary connection succeeds, client is `null` | L53–L54 | `handleError(HoError('No client connected'))` |
| 3 | Primary connection succeeds, `client.db()` returns `null` | L57–L58 | `handleError(HoError('No db connected'))` |
| 4 | Primary fails, fallback succeeds, client valid, db valid | L11→L16→L26–L50 | `mongo` assigned via fallback |
| 5 | Primary fails, fallback succeeds, client is `null` | L16→L24–L25 | `handleError(HoError('No client connected'))` |
| 6 | Primary fails, fallback succeeds, `client.db()` returns `null` | L16→L27–L29 | `handleError(HoError('No db connected'))` |
| 7 | Primary fails, fallback fails | L16→L20–L21 | `handleError(err, 'DB connect')` |
| 8 | Connection OK, `user` collection count === 0 | L41/L70 (count===0) | Root user inserted with MD5-hashed password |
| 9 | Connection OK, `user` collection count > 0 | L41/L70 (count>0) | No insertion; count logged |
| 10 | `db.collection('user')` returns error | L33/L63 err truthy | `handleError(err, 'DB connect')` |
| 11 | `countDocuments` returns error | L37/L67 err truthy | `handleError(err, 'DB connect')` |
| 12 | `insertOne` returns error | L43/L73 err truthy | `handleError(err, 'DB connect')` |

#### Edge Cases

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 13 | Module imported multiple times (singleton) | Node module cache returns same instance; single connection |
| 14 | `DB_IP` / `DB_PORT` / `DB_NAME` return unexpected values for `ENV_TYPE` | Connection string malformed; driver error → fallback or handleError |
| 15 | MongoDB server not running | Both connection attempts fail; handleError called |
| 16 | Network timeout during connection | err passed to handleError |
| 17 | `ROOT_USER` has extra/missing fields | `Object.assign({}, ROOT_USER, {password: ...})` still produces a document; schema validation (if any) may reject |
| 18 | `DEFAULT_PASS` is empty string | MD5 of empty string (`d41d8cd98f00b204e9800998ecf8427e`) stored |

#### Error Handling

| # | Scenario | Error Type | Handler |
|---|----------|-----------|---------|
| 19 | Any `err` in primary connect callback | Driver error | `handleError(err, 'DB connect')` — falls through to retry |
| 20 | Any `err` in fallback connect callback | Driver error | `handleError(err, 'DB connect')` — terminal |
| 21 | HoError for null client | `HoError` (code 400) | `handleError` |
| 22 | HoError for null db | `HoError` (code 400) | `handleError` |

---

## 4. Exported Function: `objectID`

### 4.1 Purpose

Factory/parser for MongoDB `ObjectId` values. Generates a new `ObjectId` when called without arguments or converts a string/hex ID into an `ObjectId` instance.

### 4.2 Logic Flow

```
objectID(id)
│
├─ id === null → new ObjectId()          // generate new
└─ id !== null → new ObjectId(id)        // parse existing
```

### 4.3 Invocation & Authentication

```js
import { objectID } from '../models/mongo-tool.js'

objectID()                // → new ObjectId (random)
objectID('507f1f77...')   // → ObjectId from hex string
```

- **Parameters**: `id` (optional, default `null`) — a 24-character hex string, 12-byte buffer, or existing `ObjectId`.
- **Authentication**: None required.

### 4.4 Returns & Side Effects

| Aspect | Detail |
|--------|--------|
| **Returns** | `ObjectId` instance |
| **Side Effects** | None (pure function) |

### 4.5 Snapshot Testing Data

```js
// New ObjectId
objectID()       // → ObjectId("64a7c8e1f2b3d4e5a6b7c8d9")  // 24-hex chars

// Parsed ObjectId
objectID("507f1f77bcf86cd799439011")  // → ObjectId("507f1f77bcf86cd799439011")

// Default param (explicit null)
objectID(null)   // → ObjectId("<new random>")
```

### 4.6 Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches

| # | Scenario | Branch | Expected Outcome |
|---|----------|--------|-----------------|
| 1 | Called with no arguments | `id === null` | Returns new unique `ObjectId`; `toString()` is 24-char hex |
| 2 | Called with `null` explicitly | `id === null` | Same as #1 |
| 3 | Called with valid 24-char hex string | `id !== null` | Returns `ObjectId` matching input string |
| 4 | Called with existing `ObjectId` instance | `id !== null` | Returns equivalent `ObjectId` |

#### Edge Cases

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 5 | Called with `undefined` | `id` defaults to `null` → generates new ObjectId |
| 6 | Two consecutive calls with no args | Two distinct ObjectId values |
| 7 | Called with 12-byte `Buffer` | Valid `ObjectId` created from buffer |
| 8 | Called with integer `0` | `0 !== null` → `new ObjectId(0)` — driver may throw `BSONTypeError` |
| 9 | Called with empty string `""` | `"" !== null` → `new ObjectId("")` — throws `BSONTypeError` (not 24-char hex) |

#### Error Handling

| # | Scenario | Error Type | Expected Behavior |
|---|----------|-----------|------------------|
| 10 | Invalid hex string (23 chars) | `BSONTypeError` | Thrown by MongoDB driver; no internal catch |
| 11 | Non-hex characters in 24-char string | `BSONTypeError` | Thrown by MongoDB driver |
| 12 | Numeric input (not null) | `BSONTypeError` | Thrown by MongoDB driver |
| 13 | Boolean `false` | `false !== null` → `new ObjectId(false)` → `BSONTypeError` |

> **Note**: `objectID` does not wrap `new ObjectId()` in a try/catch. Callers must handle `BSONTypeError` for invalid inputs.

---

## 5. Default Export: CRUD Dispatcher

### 5.1 Purpose

Unified Promise-based interface for all MongoDB CRUD operations across all collections. Translates shorthand operation names, manages a collection cache, and normalizes return values.

### 5.2 Logic Flow

```
mongoTool(functionName, collectionName, ...args)
│
├─► ALIAS RESOLUTION (switch)
│   ├─ 'insert'  → 'insertOne'
│   ├─ 'count'   → 'countDocuments'
│   ├─ 'update'  → 'updateOne'
│   └─ default   → functionName unchanged (e.g., 'find', 'deleteOne', 'aggregate')
│
├─► COLLECTION CACHE CHECK
│   │
│   ├─ name IN collections[] (CACHED)
│   │   │
│   │   ├─ functionName === 'find'
│   │   │   └─ collection.find(...args).toArray() → resolve(data[])
│   │   │
│   │   └─ functionName !== 'find'
│   │       └─ collection[functionName](...args, callback)
│   │           ├─ 'insertOne'      → resolve(data.ops)
│   │           ├─ 'countDocuments' → resolve(data)       // numeric count
│   │           └─ other            → resolve(data.result.n)  // affected count
│   │
│   └─ name NOT IN collections[] (UNCACHED)
│       └─ mongo.collection(name) → Promise
│           ├─ err → reject(err)
│           └─ success → cache collection, then same find/non-find logic above
```

### 5.3 Invocation & Authentication

```js
import mongoTool from '../models/mongo-tool.js'

// Insert
await mongoTool('insert', 'user', { username: 'test', perm: 0 })

// Find
await mongoTool('find', 'storage', { tags: 'video' }, { projection: { name: 1 } })

// Count
await mongoTool('count', 'user', { perm: { $gte: 2 } })

// Update
await mongoTool('update', 'user', { _id: objectID(uid) }, { $set: { perm: 1 } })

// Native method names also work
await mongoTool('deleteOne', 'storage', { _id: objectID(id) })
await mongoTool('aggregate', 'storage', [{ $match: {} }, { $group: { _id: '$type' } }])
```

- **Parameters**:
  - `functionName` (string, required) — MongoDB operation or alias (`insert`, `count`, `update`, `find`, `deleteOne`, `insertMany`, `aggregate`, etc.)
  - `name` (string, required) — MongoDB collection name
  - `...args` (variadic) — arguments forwarded to the underlying MongoDB driver method
- **Authentication**: None at this layer; relies on the module-level connection credentials.

### 5.4 Returns & Side Effects

| Operation | Resolved Value | DB Side Effect |
|-----------|---------------|----------------|
| `'insert'` / `'insertOne'` | `data.ops` — array of inserted document(s) | Document(s) created |
| `'count'` / `'countDocuments'` | Numeric count (integer) | None (read-only) |
| `'find'` | Array of matching documents | None (read-only) |
| `'update'` / `'updateOne'` | `data.result.n` — number of matched documents | Document(s) modified |
| `'deleteOne'` | `data.result.n` — number of deleted documents | Document(s) removed |
| Any other | `data.result.n` | Varies by operation |

**Collection Cache Side Effect**: On first access to any collection name, the collection reference is stored in the module-level `collections[]` array for subsequent calls.

### 5.5 Snapshot Testing Data

**Insert operation:**
```js
// Input
mongoTool('insert', 'user', { username: 'alice', perm: 0, password: 'abc123hash' })

// Resolved value (data.ops)
[
  {
    "_id": ObjectId("64a7c8e1f2b3d4e5a6b7c8d9"),
    "username": "alice",
    "perm": 0,
    "password": "abc123hash"
  }
]
```

**Find operation:**
```js
// Input
mongoTool('find', 'storage', { type: 1 }, { projection: { name: 1, _id: 1 } })

// Resolved value
[
  { "_id": ObjectId("..."), "name": "video1.mp4" },
  { "_id": ObjectId("..."), "name": "video2.mp4" }
]
```

**Count operation:**
```js
// Input
mongoTool('count', 'user', {})

// Resolved value
42
```

**Update operation:**
```js
// Input
mongoTool('update', 'user', { _id: objectID('507f1f77bcf86cd799439011') }, { $set: { perm: 2 } })

// Resolved value (data.result.n)
1
```

### 5.6 Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches — Alias Resolution (switch statement)

| # | Scenario | Input `functionName` | Resolved Name | Branch |
|---|----------|---------------------|---------------|--------|
| 1 | Insert alias | `'insert'` | `'insertOne'` | `case 'insert'` (L90–L91) |
| 2 | Count alias | `'count'` | `'countDocuments'` | `case 'count'` (L93–L94) |
| 3 | Update alias | `'update'` | `'updateOne'` | `case 'update'` (L96–L97) |
| 4 | Native name (find) | `'find'` | `'find'` | Falls through switch unchanged |
| 5 | Native name (deleteOne) | `'deleteOne'` | `'deleteOne'` | Falls through switch unchanged |
| 6 | Native name (aggregate) | `'aggregate'` | `'aggregate'` | Falls through switch unchanged |
| 7 | Native name (insertMany) | `'insertMany'` | `'insertMany'` | Falls through switch unchanged |

#### Logical Branches — Collection Cache

| # | Scenario | Branch | Expected Outcome |
|---|----------|--------|-----------------|
| 8 | First call to a collection (not cached) | `name NOT in collections` (L106–L114) | `mongo.collection()` called, reference cached, then operation executed |
| 9 | Second call to same collection (cached) | `name IN collections` (L100–L105) | Cached reference used directly, no `mongo.collection()` call |
| 10 | Calls to different collections | Both paths | Each collection cached independently |

#### Logical Branches — Operation Dispatch (find vs non-find)

| # | Scenario | Branch | Expected Outcome |
|---|----------|--------|-----------------|
| 11 | `find` on cached collection | L101–L102 | `.find(...args).toArray()` called; resolves with array |
| 12 | `find` on uncached collection | L109–L110 | Collection fetched, cached, then `.find(...args).toArray()` |
| 13 | `insertOne` on cached collection | L104, `functionName === 'insertOne'` | Resolves with `data.ops` |
| 14 | `insertOne` on uncached collection | L112, `functionName === 'insertOne'` | Resolves with `data.ops` |
| 15 | `countDocuments` on cached collection | L104, `functionName === 'countDocuments'` | Resolves with numeric `data` |
| 16 | `countDocuments` on uncached collection | L112, `functionName === 'countDocuments'` | Resolves with numeric `data` |
| 17 | `updateOne` on cached collection | L104, else branch | Resolves with `data.result.n` |
| 18 | `updateOne` on uncached collection | L112, else branch | Resolves with `data.result.n` |
| 19 | `deleteOne` on cached collection | L104, else branch | Resolves with `data.result.n` |
| 20 | `deleteOne` on uncached collection | L112, else branch | Resolves with `data.result.n` |

#### Edge Cases

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 21 | `mongo` is `null` (called before connection established) | `mongo.collection(name)` throws `TypeError: Cannot read property 'collection' of null` — Promise rejects |
| 22 | Empty `args` for `find` (no query filter) | `collection.find().toArray()` — returns all documents |
| 23 | Empty `args` for `countDocuments` | `collection.countDocuments(callback)` — counts all documents |
| 24 | Unknown/invalid `functionName` (e.g., `'foo'`) | `collection['foo']` is `undefined` → `.call()` throws `TypeError` |
| 25 | Collection name is empty string `""` | Driver may still create/return a collection handle; behavior is driver-dependent |
| 26 | Very large result set from `find` | `.toArray()` loads all into memory; potential OOM for unbounded queries |
| 27 | `collections` is an Array used with string keys (`name in collections`) | Works via JS property lookup but uses array as dict — `in` operator checks property existence on array object |
| 28 | Concurrent calls to same uncached collection | Race condition: `mongo.collection()` may be called multiple times before cache is set; eventual consistency once both resolve |
| 29 | `find` with sort/limit in args | `args` passed via `.apply()` — only the first arg (query) and second arg (options) are standard; sort/limit must be in options |
| 30 | `args` contains callback as last element | Callback forwarded as a regular argument; may cause unexpected behavior in non-find paths since the dispatcher appends its own callback |

#### Error Handling

| # | Scenario | Error Source | Expected Behavior |
|---|----------|-------------|------------------|
| 31 | `mongo.collection(name, callback)` returns error | MongoDB driver | Promise rejects with driver error (L107) |
| 32 | `find` toArray callback receives error | MongoDB driver | Promise rejects (L102/L110) |
| 33 | `insertOne` callback receives error | MongoDB driver (e.g., duplicate key) | Promise rejects (L104/L112) |
| 34 | `countDocuments` callback receives error | MongoDB driver | Promise rejects (L104/L112) |
| 35 | `updateOne` callback receives error | MongoDB driver | Promise rejects (L104/L112) |
| 36 | `deleteOne` callback receives error | MongoDB driver | Promise rejects (L104/L112) |
| 37 | `insertOne` succeeds but `data.ops` is `undefined` | Driver version mismatch | `resolve(undefined)` — silent data loss in return value |
| 38 | Non-insert/non-count operation succeeds but `data.result` is `undefined` | Driver version mismatch | `TypeError: Cannot read property 'n' of undefined` — unhandled rejection |
| 39 | Network disconnection mid-operation | MongoDB driver | Callback receives network error; Promise rejects |
| 40 | Collection dropped while cached | MongoDB driver | Stale cache reference; driver may return error on operation |

#### Auth / Login Scenarios

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 41 | CRUD dispatcher called with user-collection to query login credentials | Returns user documents (password hashes) as-is; no auth filtering at this layer |
| 42 | Non-authenticated caller uses dispatcher | No auth guard; the dispatcher is a low-level DB tool — auth is enforced at the router/middleware layer |

---

## 6. Module-Level State

### 6.1 `mongo` (line 9)

| Property | Detail |
|----------|--------|
| **Type** | `Db` instance (MongoDB driver) or `null` |
| **Initialized** | `null`; set to `Db` upon successful connection |
| **Scope** | Module-private; not exported |
| **Risk** | If any caller imports and invokes the default export before the async connection completes, `mongo` is still `null` |

### 6.2 `collections` (line 84)

| Property | Detail |
|----------|--------|
| **Type** | `Array` (used as a dictionary with string keys) |
| **Purpose** | Caches `Collection` references keyed by collection name |
| **Scope** | Module-private; not exported |
| **Risk** | Using an `Array` as a string-keyed cache is unconventional; `in` operator checks prototype chain. A plain `Object` or `Map` would be safer |

### 6.3 State Test Scenarios

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 1 | Verify `mongo` is `null` before connection callback fires | Any CRUD call rejects or throws |
| 2 | Verify `collections` accumulates entries after multiple collection accesses | Cached references are reused |
| 3 | Verify `collections` prototype properties (e.g., `'length'`, `'toString'`) don't collide with collection names | `'length' in collections` is `true` for Array — a collection named `"length"` would hit the cache incorrectly |

---

## 7. Cross-Cutting Concerns

### 7.1 Security Observations

| Concern | Detail | Test Implication |
|---------|--------|-----------------|
| **MD5 password hashing** | Root user seed uses MD5 — cryptographically broken for passwords | Verify seed only runs once (count === 0); document risk |
| **No input sanitization** | CRUD dispatcher passes args directly to MongoDB driver | NoSQL injection testing should target router/model layers above |
| **Credentials in connection string** | `DB_USERNAME` / `DB_PWD` embedded in URI | Verify `ver.js` is not committed; ensure env-var sourcing in production |

### 7.2 Reliability Observations

| Concern | Detail | Test Implication |
|---------|--------|-----------------|
| **No reconnection logic** | If the connection drops after init, `mongo` remains stale | Simulate disconnect; verify error propagation |
| **No connection readiness gate** | No event/promise signals when `mongo` is ready | Race condition: early imports may call CRUD before connection |
| **Pool exhaustion** | `poolSize: 10`; no queue or backpressure | Load test with >10 concurrent operations |
| **Callback-style driver API** | Uses legacy callback API wrapped in Promises | Verify no unhandled callback errors leak |

### 7.3 Recommended Mock Strategy

| Component | Mock Approach |
|-----------|--------------|
| `MongoClient.connect` | Jest mock of `mongodb` module; control success/failure/client shape |
| `client.db()` | Return mock `Db` object with `.collection()` method |
| `collection` methods | Mock `find`, `insertOne`, `countDocuments`, `updateOne`, `deleteOne` with controllable callbacks |
| `createHash('md5')` | Spy on `crypto.createHash` to verify MD5 usage and input |
| `handleError` / `HoError` | Mock `../util/utility.js` to capture error calls |
| `ver.js` / `config.js` | Mock environment values for deterministic testing |

### 7.4 Suggested Test File

Per [OUTLINE.md §11.8](../../OUTLINE.md):
```
src/back/models/__tests__/mongo-tool.test.js
```

### 7.5 Test Execution Phase

Per [OUTLINE.md §11.9](../../OUTLINE.md): **Phase 4** — Backend integration tests requiring MongoDB mocks or test containers.

---

> **Document Version**: 1.0
> **Source**: `src/back/models/mongo-tool.js` (117 lines)
> **Standard**: ANoMoPi QA Testing Blueprint ([OUTLINE.md §11](../../OUTLINE.md))
