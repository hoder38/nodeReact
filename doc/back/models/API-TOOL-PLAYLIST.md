# `api-tool-playlist.js` — Technical Testing Documentation

> **Module**: `src/back/models/api-tool-playlist.js` (1030 lines)
> **Role**: Playlist/download pool manager — torrent, zip extraction, and MEGA download orchestration
> **Server**: File Server (`reactnode-file-server`)
> **Router**: `playlist-router` (`/f/api/torrent/*`)
> **Priority**: 🟡 High — manages concurrent download jobs, filesystem mutations, and process lifecycle

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Module-Level State & Concurrency](#2-module-level-state--concurrency)
3. [Function: `process` (Default Export)](#3-function-process-default-export)
4. [Function: `setLock`](#4-function-setlock)
5. [Function: `handle_err`](#5-function-handle_err)
6. [Function: `playlistKick`](#6-function-playlistkick)
7. [Function: `torrentInfo`](#7-function-torrentinfo)
8. [Function: `torrentAdd`](#8-function-torrentadd)
9. [Function: `torrentGet`](#9-function-torrentget)
10. [Function: `startTorrent`](#10-function-starttorrent)
11. [Function: `torrentStop`](#11-function-torrentstop)
12. [Function: `zipAdd`](#12-function-zipadd)
13. [Function: `zipGet`](#13-function-zipget)
14. [Function: `startZip`](#14-function-startzip)
15. [Function: `zipStop`](#15-function-zipstop)
16. [Function: `megaAdd`](#16-function-megaadd)
17. [Function: `megaGet`](#17-function-megaget)
18. [Function: `startMega`](#18-function-startmega)
19. [Function: `megaStop`](#19-function-megastop)
20. [Cross-Cutting Concerns](#20-cross-cutting-concerns)
21. [Mock & Stub Strategy](#21-mock--stub-strategy)

---

## 1. Module Overview

This module manages three independent download/extraction pools (torrent, zip, MEGA) with concurrency control via spin-lock mutexes. Each pool has:

- **A queue** (`*_pool` array) — holds pending and running jobs
- **A lock** (`*_lock` boolean) — prevents race conditions on pool mutations
- **A scheduler** (`*Get` function) — picks the next job by earliest timestamp and respects a configurable concurrency limit (`*_LIMIT`)
- **A worker** (`start*` function) — executes the download/extraction, manages filesystem output, updates MongoDB, and triggers media post-processing

### Dependency Graph

| Dependency | Usage |
|-----------|-------|
| `torrent-stream` | Create torrent engines, stream files |
| `child_process.exec` | Run `megadl` CLI, `7za`, `myuzip.py` |
| `mkdirp` | Create nested directories |
| `mongo-tool.js` | Update `storage` collection (utime, mediaType, status) |
| `api-tool.js` | General API utilities |
| `mediaHandle-tool.js` | Post-download media tag handling and upload |
| `utility.js` | `handleError`, `HoError`, `getFileLocation`, `checkAdmin`, `SRT2VTT`, `deleteFolderRecursive`, `sortList` |
| `mime.js` | `isVideo`, `isDoc`, `isZipbook`, `extType`, `extTag` |
| `sendWs.js` | WebSocket progress broadcasts and error notifications |
| `config.js` | `TORRENT_LIMIT`, `ZIP_LIMIT`, `MEGA_LIMIT`, `NAS_TMP` |
| `constants.js` | `TORRENT_CONNECT`, `TORRENT_UPLOAD`, `STORAGEDB`, `*_DURATION`, `__dirname`, `BEST_TRACKER_LIST` |
| `ver.js` | `ENV_TYPE` — dev vs. production environment flag |

---

## 2. Module-Level State & Concurrency

### State Variables

```js
let torrent_pool = [];   // Active/queued torrent jobs
let zip_pool = [];        // Active/queued zip extraction jobs
let mega_pool = [];       // Active/queued MEGA download jobs
let torrent_lock = false; // Spin-lock for torrent_pool mutations
let zip_lock = false;     // Spin-lock for zip_pool mutations
let mega_lock = false;    // Spin-lock for mega_pool mutations
```

### Pool Item Structures

**Torrent Pool Item:**
```js
{
  hash: String,          // Short magnet hash (up to first '&')
  index: [Number],       // Array of file indices to download
  user: Object,          // { _id, username, perm, ... }
  time: Number,          // Unix timestamp (seconds) — queue time
  start: Number,         // Unix timestamp (seconds) — run start time
  fileId: ObjectId,      // MongoDB storage document _id
  fileOwner: ObjectId,   // Owner user _id
  torrent: String,       // Full magnet URI
  engine: Object|null    // TorrentStream engine instance or null if queued
}
```

**Zip Pool Item:**
```js
{
  index: Number,         // File index within archive
  user: Object,          // User object
  time: Number,          // Unix timestamp — queue time
  start: Number,         // Unix timestamp — run start time
  fileId: ObjectId,      // MongoDB storage _id
  fileOwner: ObjectId,   // Owner user _id
  name: String,          // Filename within archive
  type: Number,          // Zip type (1=zip, 2=rar, 3=7z, 4=zip_c, 5=7z_c)
  pwd: String,           // Archive password
  run: Boolean,          // Currently executing
  chp: ChildProcess      // Child process handle (set after exec)
}
```

**MEGA Pool Item:**
```js
{
  user: Object,          // User object
  url: String,           // MEGA download URL
  filePath: String,      // Local destination path
  time: Number,          // Unix timestamp — queue time
  start: Number,         // Unix timestamp — run start time
  data: Object,          // { rest: Function|null, errhandle: Function|null }
  run: Boolean,          // Currently executing
  chp: ChildProcess      // Child process handle (set after exec)
}
```

### Concurrency Test Scenarios

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| S-01 | Two coroutines simultaneously attempt `setLock('torrent')` | Only one acquires the lock; the other retries via 500ms setTimeout |
| S-02 | Pool mutation while lock is held | Mutations are serialized; no race conditions |
| S-03 | Lock acquired but never released (crash scenario) | System stalls — no timeout/deadlock recovery mechanism exists |
| S-04 | Concurrent `torrentAdd` + `torrentStop` for the same hash | Operations are serialized by lock; stop should find and remove the entry |

---

## 3. Function: `process` (Default Export)

### Purpose

Central dispatcher that routes action strings to the appropriate internal function. This is the sole public API surface of the module.

### Invocation & Signature

```js
export default function process(action: String, ...args: any[]): Promise<any>
```

### Logic Flow

```
process(action, ...args)
│
├── Log pool sizes (torrent, zip, mega)
├── Log action and args
│
└── switch (action)
    ├── 'playlist kick' → return playlistKick(...args)
    ├── 'torrent info'  → return torrentInfo(...args)
    ├── 'torrent add'   → fire-and-forget torrentAdd → torrentGet chain; return resolved Promise
    ├── 'torrent stop'  → fire-and-forget torrentStop → torrentGet chain; return resolved Promise
    ├── 'zip add'       → fire-and-forget zipAdd → zipGet chain; return resolved Promise
    ├── 'zip stop'      → fire-and-forget zipStop → zipGet chain; return resolved Promise
    ├── 'mega add'      → fire-and-forget megaAdd → megaGet chain; return resolved Promise
    ├── 'mega stop'     → fire-and-forget megaStop → megaGet chain; return resolved Promise
    └── default         → handleError(new HoError('unknown playlist action!!!'))
```

### Returns & Side Effects

| Action | Return | Side Effects |
|--------|--------|-------------|
| `'playlist kick'` | Promise (synchronous chain) | May stop timed-out jobs, send WS messages |
| `'torrent info'` | Promise resolving to `{ files, name }` | Creates temporary torrent engine |
| `'torrent add'` | `Promise.resolve()` immediately | Background: adds to pool, may start engine |
| `'torrent stop'` | `Promise.resolve()` immediately | Background: destroys engine, removes from pool |
| `'zip add'` | `Promise.resolve()` immediately | Background: adds to pool, may start extraction |
| `'zip stop'` | `Promise.resolve()` immediately | Background: kills child process, removes from pool |
| `'mega add'` | `Promise.resolve()` immediately | Background: adds to pool, may start megadl |
| `'mega stop'` | `Promise.resolve()` immediately | Background: kills child process, cleans up files |
| default | Error thrown | None |

### Comprehensive Test Scenarios

| ID | Category | Scenario | Input | Expected |
|----|----------|----------|-------|----------|
| P-01 | Happy Path | Valid 'playlist kick' action | `('playlist kick')` | Returns Promise, invokes `playlistKick` |
| P-02 | Happy Path | Valid 'torrent info' action | `('torrent info', magnet, filePath)` | Returns Promise resolving to torrent data |
| P-03 | Happy Path | Valid 'torrent add' action | `('torrent add', user, torrent, idx, id, owner)` | Returns `Promise.resolve()` immediately |
| P-04 | Happy Path | Valid 'torrent stop' action | `('torrent stop', user)` | Returns `Promise.resolve()` immediately |
| P-05 | Happy Path | Valid 'zip add' action | `('zip add', user, idx, id, owner, name)` | Returns `Promise.resolve()` immediately |
| P-06 | Happy Path | Valid 'zip stop' action | `('zip stop', user)` | Returns `Promise.resolve()` immediately |
| P-07 | Happy Path | Valid 'mega add' action | `('mega add', user, url, filePath, data)` | Returns `Promise.resolve()` immediately |
| P-08 | Happy Path | Valid 'mega stop' action | `('mega stop', user)` | Returns `Promise.resolve()` immediately |
| P-09 | Error | Unknown action string | `('unknown action')` | Calls `handleError` with `HoError('unknown playlist action!!!')` |
| P-10 | Error | Empty action string | `('')` | Falls through to default → `handleError` |
| P-11 | Error | Null/undefined action | `(null)` | Falls through to default → `handleError` |
| P-12 | Edge Case | Background chain error in 'torrent add' | Add fn throws | Error caught by `.catch(handle_err)`, swallowed; caller's Promise already resolved |
| P-13 | Edge Case | Background chain error in 'zip add' | Add fn throws | Same fire-and-forget pattern; error does not propagate to caller |
| P-14 | Edge Case | Missing args for action | `('torrent add')` (no user) | Internal function receives `undefined`; behavior depends on downstream |

---

## 4. Function: `setLock`

### Purpose

Implements a spin-lock mechanism using recursive `setTimeout` polling (500ms interval) to serialize access to shared pool state.

### Invocation & Signature

```js
const setLock = (type: 'torrent'|'zip'|'mega') => Promise<Boolean>
```

### Logic Flow

```
setLock(type)
│
└── switch (type)
    ├── 'torrent' → torrent_lock ?
    │   ├── true  → setTimeout(500ms) → retry setLock('torrent')
    │   └── false → set torrent_lock = true → resolve(true)
    ├── 'zip' → zip_lock ?
    │   ├── true  → setTimeout(500ms) → retry setLock('zip')
    │   └── false → set zip_lock = true → resolve(true)
    ├── 'mega' → mega_lock ?
    │   ├── true  → setTimeout(500ms) → retry setLock('mega')
    │   └── false → set mega_lock = true → resolve(true)
    └── default → console.log('unknown lock') → resolve(false)
```

### Returns & Side Effects

| Case | Returns | Side Effect |
|------|---------|------------|
| Lock acquired | `Promise<true>` | Sets the corresponding `*_lock = true` |
| Lock busy | Retries after 500ms | No state change until acquired |
| Unknown type | `Promise<false>` | Logs 'unknown lock' |

### Comprehensive Test Scenarios

| ID | Category | Scenario | Expected |
|----|----------|----------|----------|
| SL-01 | Happy Path | Lock 'torrent' when unlocked | Resolves `true`, `torrent_lock` becomes `true` |
| SL-02 | Happy Path | Lock 'zip' when unlocked | Resolves `true`, `zip_lock` becomes `true` |
| SL-03 | Happy Path | Lock 'mega' when unlocked | Resolves `true`, `mega_lock` becomes `true` |
| SL-04 | Contention | Lock 'torrent' when already locked, released after 200ms | Waits ~500ms, retries, resolves `true` |
| SL-05 | Contention | Lock 'torrent' when locked for 2 seconds | Retries 4 times (500ms × 4), then acquires |
| SL-06 | Edge Case | Unknown type string `'ftp'` | Resolves `false`, logs 'unknown lock' |
| SL-07 | Edge Case | Undefined type | Falls to default, resolves `false` |
| SL-08 | Edge Case | Null type | Falls to default, resolves `false` |
| SL-09 | Stress | Multiple concurrent `setLock('torrent')` calls | Only one acquires at a time; others queue via setTimeout |
| SL-10 | Risk | Lock never released (no timeout mechanism) | All callers spin indefinitely — potential deadlock |

---

## 5. Function: `handle_err`

### Purpose

Standardized error handler that logs the error and sends a failure notification via WebSocket to the originating user.

### Invocation & Signature

```js
function handle_err(err: Error, user: Object, type: String, id: ObjectId|false = false): void
```

### Logic Flow

```
handle_err(err, user, type, id)
│
├── handleError(err, type)     ← logs the error
└── sendWs({
│     type: user.username,
│     data: `${type} fail: ${err.message}`,
│     zip: id (if truthy)
│   }, 0)
```

### Returns & Side Effects

- **Returns**: `undefined` (void)
- **Side Effects**: Error logged; WebSocket message sent with error details

### Comprehensive Test Scenarios

| ID | Category | Scenario | Expected |
|----|----------|----------|----------|
| HE-01 | Happy Path | Error with user and type, no id | `sendWs` called with `{ type: username, data: "Type fail: msg" }` |
| HE-02 | Happy Path | Error with user, type, and id | `sendWs` called with additional `{ zip: id }` field |
| HE-03 | Edge Case | `id = false` (default) | No `zip` property in WS payload |
| HE-04 | Edge Case | `id = null` (falsy) | No `zip` property in WS payload |
| HE-05 | Edge Case | Error with empty message | Data field becomes `"Type fail: "` |
| HE-06 | Edge Case | User object missing `username` | `type` field in WS message is `undefined` |

---

## 6. Function: `playlistKick`

### Purpose

Scheduled cleanup job that terminates timed-out jobs across all three pools. Called periodically by the background job scheduler to enforce duration limits.

### Invocation & Signature

```js
function playlistKick(): Promise<void>
```

Invoked via: `process('playlist kick')`

### Logic Flow

```
playlistKick()
│
├── kickTorrent()
│   ├── Calculate kick_time = now - TORRENT_DURATION
│   ├── Iterate torrent_pool
│   │   └── IF item.engine exists AND item.start < kick_time
│   │       ├── sendWs(`torrent ${i} stop`, 0, 0, true)
│   │       └── return process('torrent stop', null, i)
│   └── No match → resolve()
│
├── .then(() => kickZip())
│   ├── Calculate kick_time = now - ZIP_DURATION
│   ├── Iterate zip_pool
│   │   └── IF item.run AND item.time < kick_time
│   │       ├── sendWs(`zip ${i} stop`, 0, 0, true)
│   │       └── return process('zip stop', null, i)
│   └── No match → resolve()
│
└── .then(() => kickMega())
    ├── Calculate kick_time = now - MEGA_DURATION
    ├── Iterate mega_pool
    │   └── IF item.run AND item.time < kick_time
    │       ├── sendWs(`mega ${i} stop`, 0, 0, true)
    │       └── return process('mega stop', null, i)
    └── No match → resolve()
```

**Note**: For torrent, the comparison uses `item.start`, while zip and MEGA use `item.time`. This means torrent checks elapsed *running* time, while zip/MEGA check elapsed *queue* time.

### Returns & Side Effects

- **Returns**: `Promise<void>`
- **Side Effects**: Stops timed-out jobs; sends WS notifications; re-triggers schedulers via `process('* stop')`

### Comprehensive Test Scenarios

| ID | Category | Scenario | Expected |
|----|----------|----------|----------|
| PK-01 | Happy Path | All pools empty | Three resolve() calls; no stops |
| PK-02 | Happy Path | One torrent exceeded duration | That torrent stopped, WS sent, others untouched |
| PK-03 | Happy Path | One zip exceeded duration | That zip stopped, WS sent |
| PK-04 | Happy Path | One mega exceeded duration | That mega stopped, WS sent |
| PK-05 | Happy Path | Items in all three pools exceeded | First exceeded of each type stopped sequentially |
| PK-06 | Edge Case | Torrent in pool but no engine (queued, not running) | Skipped (check requires `item.engine` truthy) |
| PK-07 | Edge Case | Zip in pool but `run = false` (queued) | Skipped (check requires `item.run` truthy) |
| PK-08 | Edge Case | Multiple timed-out torrents | Only the first match (by pool index) is stopped per invocation |
| PK-09 | Edge Case | Job started exactly at kick_time boundary | `start < kick_time` is strict less-than; boundary job not kicked |
| PK-10 | Edge Case | Duration constants are 0 | kick_time equals current time; all running jobs kicked |
| PK-11 | Chaining | kickTorrent stops a job; kickZip also needs to stop | Both execute sequentially via `.then()` chain |
| PK-12 | Error | `process('torrent stop')` throws | Error propagates up the chain |

---

## 7. Function: `torrentInfo`

### Purpose

Retrieves metadata (file list and torrent name) from a magnet URI without downloading content. Used for previewing torrent contents before committing to a download.

### Invocation & Signature

```js
function torrentInfo(magnet: String, filePath: String): Promise<{ files: Array, name: String }>
```

Invoked via: `process('torrent info', magnet, filePath)`

### Logic Flow

```
torrentInfo(magnet, filePath)
│
├── Create TorrentStream engine with config:
│   ├── tmp: NAS_TMP(ENV_TYPE)
│   ├── path: `${filePath}/real`
│   ├── connections: TORRENT_CONNECT
│   ├── uploads: TORRENT_UPLOAD
│   └── trackers: BEST_TRACKER_LIST
│
└── Wait for engine 'ready' event
    ├── Extract { files: engine.files, name: engine.torrent.name || 'torrent' }
    ├── engine.destroy()
    └── resolve(data)
```

### Returns & Side Effects

- **Returns**: `Promise<{ files: Array<TorrentFile>, name: String }>`
- **Side Effects**: Temporary torrent engine created and destroyed; may create directories at `filePath/real`

### Snapshot Testing Data

```js
// Expected return structure
{
  files: [
    { path: "Movie/movie.mkv", length: 1073741824, name: "movie.mkv" },
    { path: "Movie/subs.srt", length: 45000, name: "subs.srt" }
  ],
  name: "My.Movie.2024.1080p"
}

// Fallback when no torrent name
{
  files: [...],
  name: "torrent"
}
```

### Comprehensive Test Scenarios

| ID | Category | Scenario | Expected |
|----|----------|----------|----------|
| TI-01 | Happy Path | Valid magnet, multi-file torrent | Returns files array and torrent name |
| TI-02 | Happy Path | Valid magnet, single file torrent | Returns single-item files array |
| TI-03 | Happy Path | Torrent with no name | `name` defaults to `'torrent'` |
| TI-04 | Edge Case | Torrent with empty name `''` | Falsy → defaults to `'torrent'` |
| TI-05 | Edge Case | Torrent with 0 files | Returns `{ files: [], name }` |
| TI-06 | Error | Invalid magnet URI | TorrentStream may never fire 'ready' → Promise hangs (no timeout) |
| TI-07 | Error | Network unreachable (no peers) | 'ready' event never fires → Promise hangs |
| TI-08 | Edge Case | `filePath` contains special characters | Path passed directly to TorrentStream config |
| TI-09 | Resource | Engine is destroyed after data extraction | `engine.destroy()` called before resolve |
| TI-10 | Risk | No timeout on 'ready' event listener | If torrent is dead/invalid, Promise never resolves — potential memory leak |

---

## 8. Function: `torrentAdd`

### Purpose

Adds a torrent download job to the pool or reports progress on an existing one. Handles admin priority queuing, engine reuse for same-hash torrents, and concurrency limit enforcement.

### Invocation & Signature

```js
function torrentAdd(
  user: Object,           // { _id, username, perm }
  torrent: String,        // Full magnet URI
  fileIndex: Number,      // Index of file to download within torrent
  id: ObjectId,           // Storage document _id
  owner: ObjectId,        // File owner _id
  pType: Number = 0       // Progress type: 0=single file %, 1=total %
): Promise<any>
```

Invoked via: `process('torrent add', user, torrent, fileIndex, id, owner, pType)`

### Logic Flow

```
torrentAdd(user, torrent, fileIndex, id, owner, pType)
│
├── Extract shortTorrent = torrent.match(/^[^&]+/)[0]
│   └── If no match → handleError('not torrent')
│
├── setLock('torrent')
│
├── Search torrent_pool for matching hash
│   ├── FOUND (is_queue = true):
│   │   ├── If user is admin → update pool item's user to admin user
│   │   ├── If fileIndex NOT in item.index:
│   │   │   ├── Push fileIndex to item.index
│   │   │   └── If engine exists → capture engine reference
│   │   └── If fileIndex ALREADY in item.index:
│   │       ├── If engine exists and engine.files loaded:
│   │       │   ├── pType === 1 → Calculate total progress %, send WS
│   │       │   ├── pType === 0 → Calculate single file progress %, send WS
│   │       │   └── Other pType → no progress report
│   │       ├── Release lock
│   │       └── return resolved Promise
│   └── NOT FOUND (is_queue = false): continue
│
├── If engine captured (existing pool item with engine):
│   ├── Release lock
│   └── startEngine(fileIndex) — start downloading the new file index
│
├── Else (no engine, need to check concurrency):
│   ├── Count running engines (runNum)
│   ├── If user is admin → only count other admin engines
│   │
│   ├── If runNum < TORRENT_LIMIT:
│   │   ├── Create new TorrentStream engine
│   │   ├── If is_queue → update existing pool item with engine
│   │   │   └── Start ALL pending indices: Promise.all(runIndex.map(startEngine))
│   │   ├── If !is_queue → push new pool item with engine
│   │   │   └── startEngine(fileIndex)
│   │   └── Then rest() → kick non-admin engines if over limit
│   │
│   └── If runNum >= TORRENT_LIMIT:
│       ├── If !is_queue → push new pool item with engine=null (queued)
│       ├── Release lock
│       └── return resolved(false)
```

### Returns & Side Effects

- **Returns**: `Promise<any>` — resolves when job is queued or started
- **Side Effects**:
  - Mutates `torrent_pool` (push new item or update existing)
  - May create TorrentStream engine
  - May kick non-admin engines when admin job causes over-limit
  - Sends WebSocket progress messages for duplicate requests
  - Updates MongoDB `storage` document (via `startTorrent`)

### Snapshot Testing Data

```js
// New torrent pool entry (queued)
{
  hash: "magnet:?xt=urn:btih:abc123",
  index: [0],
  user: { _id: ObjectId("..."), username: "testuser", perm: 0 },
  time: 1700000000,
  fileId: ObjectId("..."),
  fileOwner: ObjectId("..."),
  torrent: "magnet:?xt=urn:btih:abc123&dn=test",
  engine: null
}

// WebSocket progress message (pType=0, single file)
{
  type: "testuser",
  data: "Movie/file.mkv: 45%"
}

// WebSocket progress message (pType=1, total)
{
  type: "testuser",
  data: "Playlist My.Torrent: 67%"
}
```

### Comprehensive Test Scenarios

| ID | Category | Scenario | Expected |
|----|----------|----------|----------|
| TA-01 | Happy Path | New torrent, under concurrency limit | Pool entry created with `engine` set, download starts |
| TA-02 | Happy Path | New torrent, at concurrency limit | Pool entry created with `engine: null`, queued |
| TA-03 | Happy Path | Existing hash, new file index, engine running | File index added to existing entry, starts immediately |
| TA-04 | Happy Path | Existing hash, new file index, no engine | File index added; no immediate start |
| TA-05 | Happy Path | Existing hash, same file index, pType=0 | Reports single-file download percentage via WS |
| TA-06 | Happy Path | Existing hash, same file index, pType=1 | Reports total download percentage via WS |
| TA-07 | Auth | Admin user adds torrent, under admin limit | Starts immediately; non-admin limit doesn't apply |
| TA-08 | Auth | Admin user, over global limit but under admin limit | Creates engine; then `rest()` kicks a non-admin engine |
| TA-09 | Auth | Admin user on existing non-admin entry | `user` field on pool entry updated to admin user |
| TA-10 | Auth | Non-admin user, at global limit | Queued with `engine: null` |
| TA-11 | Edge Case | Magnet URI with no `&` characters | `shortTorrent` equals entire magnet string |
| TA-12 | Edge Case | Magnet URI is empty string | `match` returns null → `handleError('not torrent')` |
| TA-13 | Edge Case | Magnet URI is `null`/`undefined` | TypeError on `.match()` call |
| TA-14 | Edge Case | `fileIndex` already completed (`_complete` file exists) | `startTorrent` handles this (skips download) |
| TA-15 | Edge Case | Engine files not yet loaded (engine.files is empty) | `startEngine` waits for 'ready' event |
| TA-16 | Edge Case | pType is neither 0 nor 1 | No progress WS message sent |
| TA-17 | Edge Case | Existing entry, engine exists but no `engine.files` | Progress check skipped (conditional guard) |
| TA-18 | Edge Case | Torrent pool item with `engine.torrent.name = null` | Progress message defaults: `"Playlist torrent: X%"` |
| TA-19 | Concurrency | Admin kick logic: no non-admin engines exist to kick | `rest()` finds nothing to kick, no change |
| TA-20 | Concurrency | Admin kick logic: kicks lowest-priority (most recent) non-admin | Engine destroyed, set to null on pool item |
| TA-21 | Error | `startEngine` throws during download | Error caught by `handle_err` in `process` dispatcher |
| TA-22 | Edge Case | File size is 0 for percentage calculation | `percent` = 0 (division by zero guarded: `length > 0` check) |

---

## 9. Function: `torrentGet`

### Purpose

Scheduler that selects the next queued torrent job (no engine assigned) and starts it if under the concurrency limit. Prioritizes admin users. Called after each job completion or addition.

### Invocation & Signature

```js
const torrentGet = (): Promise<void>
```

Internal only — called after `torrentAdd`/`torrentStop` chains.

### Logic Flow

```
torrentGet()
│
├── setLock('torrent')
│   └── If !go → resolve()
│
├── Find best candidate (no engine):
│   ├── Prefer admin users (pri=1)
│   ├── Among same priority → earliest time
│   └── Track chosen hash
│
├── If no candidate (hash=null) → release lock, resolve()
│
├── Count running engines (runNum)
│
├── If runNum < TORRENT_LIMIT:
│   ├── Create TorrentStream engine for chosen item
│   ├── Set item.engine, item.start
│   ├── Release lock
│   ├── Wait for engine 'ready' if needed
│   ├── Promise.all(startTorrent for each index)
│   └── .then(() => torrentGet()) — recursive, process next
│
└── If runNum >= TORRENT_LIMIT:
    └── Release lock, resolve()
```

### Comprehensive Test Scenarios

| ID | Category | Scenario | Expected |
|----|----------|----------|----------|
| TG-01 | Happy Path | One queued job, under limit | Engine created, download starts, recursive call |
| TG-02 | Happy Path | Multiple queued jobs, under limit | Earliest-time job selected first |
| TG-03 | Happy Path | Admin + non-admin queued | Admin prioritized regardless of time |
| TG-04 | Happy Path | Empty pool | Immediate resolve |
| TG-05 | Happy Path | All jobs already running | No candidate found, resolve |
| TG-06 | Concurrency | At limit | Lock released, resolve (no new engine) |
| TG-07 | Recursion | Two queued jobs, limit=2 | First job starts, recursion starts second |
| TG-08 | Edge Case | Multiple items with same earliest time | First found in iteration order selected |
| TG-09 | Edge Case | Admin user has `checkAdmin(1, user)` returning true | Correctly identified as admin priority |
| TG-10 | Error | Engine creation fails | Error propagates up through catch chain |

---

## 10. Function: `startTorrent`

### Purpose

Executes the download of a single file from a torrent engine. Handles resume (append to existing partial file), post-download file renaming, media type detection, and MongoDB metadata updates.

### Invocation & Signature

```js
const startTorrent = (
  user: Object,
  id: ObjectId,
  owner: ObjectId,
  index: Number,
  hash: String,
  engine: TorrentEngine
): Promise<void>
```

### Logic Flow

```
startTorrent(user, id, owner, index, hash, engine)
│
├── Mongo.update(STORAGEDB, {_id: id}, {$set: {utime: now}})
│
├── Build paths: filePath, bufferPath (`filePath/index`), comPath (`filePath/index_complete`)
│
├── Build sorted playList from engine.files
│   └── If empty → handleError('empty content!!!')
│
├── Find tIndex (engine file matching playList[index])
│   └── If not found → torrentComplete() → handleError('unknown index')
│
├── If bufferPath exists (partial download):
│   ├── Get current file size
│   ├── If size >= file.length → torrentComplete(success)
│   └── Else → createReadStream({start: size}) → pipe(append) → torrentComplete(success)
│
└── If bufferPath does not exist (fresh download):
    └── createReadStream() → pipe(write) → torrentComplete(success)

torrentComplete(is_success, exitPath)
│
├── setLock('torrent')
├── Remove index from pool item's index array
├── If index array empty:
│   ├── engine.destroy()
│   └── Remove pool item entirely
├── Release lock
│
└── If is_success:
    ├── Rename bufferPath → comPath
    ├── If file is video/doc/zipbook:
    │   ├── MediaHandleTool.handleTag(...)
    │   ├── Set mediaType.fileIndex, mediaType.realPath
    │   ├── Set DBdata.status = 9
    │   ├── Mongo.update(STORAGEDB, ..., {$set: DBdata})
    │   └── MediaHandleTool.handleMediaUpload(...)
    └── Else → resolve()
```

### Returns & Side Effects

- **Returns**: `Promise<void>`
- **Side Effects**:
  - Updates MongoDB `storage.utime`
  - Writes file to filesystem (`bufferPath` → `comPath`)
  - Sets `storage.status = 9` and `storage.mediaType.{index}` for media files
  - Triggers `handleMediaUpload` for post-processing (thumbnail generation, etc.)
  - Mutates `torrent_pool` (removes completed index/item)
  - Destroys engine if all indices complete

### Comprehensive Test Scenarios

| ID | Category | Scenario | Expected |
|----|----------|----------|----------|
| ST-01 | Happy Path | Fresh download, single file torrent | File written, renamed to `_complete`, DB updated |
| ST-02 | Happy Path | Resume partial download | ReadStream starts at existing size, appends to file |
| ST-03 | Happy Path | Download completes, file is video | `handleTag` + `handleMediaUpload` called, status=9 |
| ST-04 | Happy Path | Download completes, file is document | `handleTag` + `handleMediaUpload` called |
| ST-05 | Happy Path | Download completes, file is not media | Just renamed to `_complete`, no media processing |
| ST-06 | Happy Path | Partial file already >= full size | Treated as complete immediately |
| ST-07 | Edge Case | Empty file list from engine | `handleError('empty content!!!')` |
| ST-08 | Edge Case | File index out of range after sort | `torrentComplete()` → `handleError('unknown index')` |
| ST-09 | Edge Case | `tIndex` is -1 (no matching path in engine files) | Error: unknown index |
| ST-10 | Edge Case | Multiple indices for same hash, one completes | Index removed from array; engine kept alive for remaining |
| ST-11 | Edge Case | Last index completes | Engine destroyed, pool item removed |
| ST-12 | Error | File stream read error | Promise rejection propagates |
| ST-13 | Error | MongoDB update fails | Promise rejection propagates |
| ST-14 | Error | `handleMediaUpload` fails | Error caught by `handleError(err, errorMedia, ...)` — non-fatal |
| ST-15 | DB | `utime` field updated on storage document | `Mongo('update', ...)` called with current timestamp |
| ST-16 | DB | `mediaType.{index}` set with fileIndex and realPath | Verified in `$set` payload |
| ST-17 | DB | `status` set to 9 | Indicates media processing in progress |

---

## 11. Function: `torrentStop`

### Purpose

Stops torrent downloads — either all jobs for a specific user (when `user` provided) or a specific pool entry by index (when `user` is falsy/null).

### Invocation & Signature

```js
function torrentStop(user: Object|null, index: Number|false = false): Promise<void>
```

Invoked via: `process('torrent stop', user, index)`

### Logic Flow

```
torrentStop(user, index)
│
├── If user is truthy:
│   └── forEach torrent_pool item:
│       └── If user._id.equals(item.user._id):
│           ├── If item.engine → engine.destroy()
│           └── Remove matching hash from pool (splice)
│
└── If user is falsy:
    ├── If torrent_pool[index].engine → engine.destroy()
    └── Remove matching hash from pool (splice)
│
└── return Promise.resolve()
```

### Returns & Side Effects

- **Returns**: `Promise<void>` (always resolves)
- **Side Effects**: Engine destroyed, pool item removed; no lock acquisition (potential race condition)

### Comprehensive Test Scenarios

| ID | Category | Scenario | Expected |
|----|----------|----------|----------|
| TS-01 | Happy Path | Stop by user, one matching job with engine | Engine destroyed, entry removed |
| TS-02 | Happy Path | Stop by user, one matching job without engine (queued) | Entry removed, no engine destroy call |
| TS-03 | Happy Path | Stop by index, job with engine | Engine destroyed, entry removed |
| TS-04 | Happy Path | Stop by index, queued job | Entry removed |
| TS-05 | Edge Case | Stop by user, multiple matching jobs | All matching entries processed (forEach), but splice during iteration may skip items |
| TS-06 | Edge Case | Stop by user, no matching jobs | No mutations |
| TS-07 | Edge Case | Stop by index, index out of bounds | TypeError accessing `torrent_pool[index]` |
| TS-08 | Edge Case | Stop by `user = null, index = false` (defaults) | Accesses `torrent_pool[false]` → `undefined` → TypeError |
| TS-09 | Race Cond. | No lock acquired before pool mutation | Concurrent add/stop could corrupt pool state |
| TS-10 | Edge Case | User `_id` is not an ObjectId (no `.equals` method) | TypeError |

---

## 12. Function: `zipAdd`

### Purpose

Adds a zip/rar/7z extraction job to the pool or reports progress on an existing one. Determines archive type by checking filesystem for specific file extensions.

### Invocation & Signature

```js
function zipAdd(
  user: Object,
  index: Number,          // File index within archive
  id: ObjectId,           // Storage document _id
  owner: ObjectId,        // File owner _id
  name: String,           // Filename to extract
  pwd: String = ''        // Archive password (default empty)
): Promise<any>
```

Invoked via: `process('zip add', user, index, id, owner, name, pwd)`

### Logic Flow

```
zipAdd(user, index, id, owner, name, pwd)
│
├── Determine zip_type by filesystem checks (priority order):
│   ├── `filePath_zip_c` exists → type 4 (combined zip)
│   ├── `filePath_7z_c` exists → type 5 (combined 7z)
│   ├── `filePath_zip` exists → type 1 (standard zip)
│   ├── `filePath.1.rar` exists → type 2 (RAR)
│   ├── `filePath_7z` exists → type 3 (7z)
│   └── None exist → handleError('not zip')
│
├── setLock('zip')
│
├── Search zip_pool for matching (id + index):
│   ├── FOUND → is_queue = true
│   │   └── If extracted file exists on disk → sendWs progress (file size in MB)
│   └── NOT FOUND → is_queue = false
│
├── Count running jobs (runNum)
├── is_run = runNum < ZIP_LIMIT
│
├── If !is_queue:
│   └── Push new entry to zip_pool
│       ├── If is_run → start=now, run=true
│       └── If !is_run → run=false
│
├── Release lock
└── If is_run → startZip(...); else → resolve()
```

### Returns & Side Effects

- **Returns**: `Promise<any>`
- **Side Effects**: Mutates `zip_pool`, may start child process extraction, sends WS progress for duplicates

### Snapshot Testing Data

```js
// Zip pool entry
{
  index: 3,
  user: { _id: ObjectId("..."), username: "admin" },
  time: 1700000000,
  start: 1700000000,
  fileId: ObjectId("..."),
  fileOwner: ObjectId("..."),
  name: "chapter01.pdf",
  type: 1,
  pwd: "",
  run: true
}

// WebSocket progress message (duplicate request)
{
  type: "admin",
  data: "chapter01.pdf: 2.45MB"
}
```

### Comprehensive Test Scenarios

| ID | Category | Scenario | Expected |
|----|----------|----------|----------|
| ZA-01 | Happy Path | New zip job, under limit, type 1 (zip) | Entry added with run=true, startZip called |
| ZA-02 | Happy Path | New rar job, under limit | Entry added with type=2 |
| ZA-03 | Happy Path | New 7z job, under limit | Entry added with type=3 |
| ZA-04 | Happy Path | New combined zip job | Entry added with type=4 |
| ZA-05 | Happy Path | New combined 7z job | Entry added with type=5 |
| ZA-06 | Happy Path | New job, at concurrency limit | Entry added with run=false, no startZip |
| ZA-07 | Happy Path | Duplicate (same id+index), file partially extracted | WS progress message sent with current MB |
| ZA-08 | Happy Path | Duplicate, extracted file doesn't exist yet | No WS message, no new pool entry |
| ZA-09 | Edge Case | No archive files exist on disk | `zip_type = 0` → `handleError('not zip')` |
| ZA-10 | Edge Case | Multiple archive types exist | Priority: `_zip_c` > `_7z_c` > `_zip` > `.1.rar` > `_7z` |
| ZA-11 | Edge Case | Password is empty string (default) | `pwd = ''` passed to startZip, which uses `'123'` as fallback |
| ZA-12 | Edge Case | Password contains single quotes | May break command line construction in `startZip` |
| ZA-13 | Edge Case | Filename contains double quotes | `regName` escaping in `startZip` handles this |
| ZA-14 | Error | `getFileLocation` throws | Error propagates |
| ZA-15 | Error | `FsExistsSync` throws (permissions) | Error propagates |

---

## 13. Function: `zipGet`

### Purpose

Scheduler that selects the next queued zip extraction job and starts it if under the concurrency limit. Selects by earliest `time` timestamp.

### Invocation & Signature

```js
const zipGet = (): Promise<void>
```

Internal only — called after `zipAdd`/`zipStop` chains.

### Logic Flow

```
zipGet()
│
├── setLock('zip')
├── Find item with earliest time (choose)
├── If no candidate → release lock, resolve()
├── Count running items (run = true)
├── If runNum < ZIP_LIMIT:
│   ├── Set item.start, item.run = true
│   ├── Capture run parameters
│   ├── Release lock
│   ├── startZip(...)
│   └── .then(() => zipGet()) — recursive
└── If at limit → release lock, resolve()
```

### Comprehensive Test Scenarios

| ID | Category | Scenario | Expected |
|----|----------|----------|----------|
| ZG-01 | Happy Path | One queued job, under limit | Job started, recursive call for next |
| ZG-02 | Happy Path | Empty pool | Immediate resolve |
| ZG-03 | Happy Path | All jobs running | No candidate selected |
| ZG-04 | Concurrency | At limit | No new job started |
| ZG-05 | Recursion | Two queued jobs, limit allows both | Both started sequentially via recursion |
| ZG-06 | Edge Case | Multiple items with same timestamp | First found in iteration order selected |
| ZG-07 | Error | `startZip` throws | Error caught by `.catch(handle_err)` in caller chain |

---

## 14. Function: `startZip`

### Purpose

Executes the extraction of a single file from an archive using either Python `myuzip.py` or `7za` command-line tool. Handles file copying, media detection, and MongoDB metadata updates.

### Invocation & Signature

```js
const startZip = (
  user: Object,
  index: Number,
  id: ObjectId,
  owner: ObjectId,
  name: String,
  pwd: String,
  zip_type: Number        // 1=zip, 2=rar, 3=7z, 4=zip_c, 5=7z_c
): Promise<void>
```

### Logic Flow

```
startZip(user, index, id, owner, name, pwd, zip_type)
│
├── Mongo.update(STORAGEDB, {_id: id}, {$set: {utime: now}})
│
├── Build paths: filePath, comPath (`filePath/index_complete`)
│
├── If comPath exists → zipComplete() (already extracted)
│
├── Build command line based on zip_type:
│   ├── type 1 → myuzip.py filePath_zip realPath "name" 'pwd|123'
│   ├── type 2 → 7za x filePath.1.rar -oRealPath "name" -ppwd|-p123
│   ├── type 3 → 7za x filePath_7z -oRealPath "name" -ppwd|-p123
│   ├── type 4 → myuzip.py filePath_zip_c realPath "name" 'pwd|123'
│   └── type 5 → 7za x filePath_7z_c -oRealPath "name" -ppwd|-p123
│
├── Delete existing realName if present
│
├── Child_process.exec(cmdline)
│   ├── Store chp in pool item via setLock
│   ├── On error → zipComplete() → reject
│   └── On success → copy realName → comPath via stream
│
├── zipComplete(realName) on successful copy
│
└── zipComplete(is_success):
    ├── setLock('zip')
    ├── Kill child process, remove pool item
    ├── Release lock
    └── If is_success AND file is video/doc/zipbook:
        ├── MediaHandleTool.handleTag(...)
        ├── Set mediaType, status=9
        ├── Mongo.update(STORAGEDB, ...)
        └── MediaHandleTool.handleMediaUpload(...)
```

### Returns & Side Effects

- **Returns**: `Promise<void>`
- **Side Effects**:
  - Spawns child process (`myuzip.py` or `7za`)
  - Extracts file to `realPath`, copies to `comPath`
  - Updates MongoDB: `utime`, `status=9`, `mediaType.{index}`
  - Triggers media post-processing for recognized file types
  - Kills child process on completion (SIGKILL)

### Comprehensive Test Scenarios

| ID | Category | Scenario | Expected |
|----|----------|----------|----------|
| SZ-01 | Happy Path | Type 1 (zip), valid extraction | File extracted, copied, DB updated |
| SZ-02 | Happy Path | Type 2 (rar), valid extraction | Uses `7za x` with `.1.rar` |
| SZ-03 | Happy Path | Type 3 (7z), valid extraction | Uses `7za x` with `_7z` |
| SZ-04 | Happy Path | Type 4 (combined zip) | Uses `myuzip.py` with `_zip_c` |
| SZ-05 | Happy Path | Type 5 (combined 7z) | Uses `7za x` with `_7z_c` |
| SZ-06 | Happy Path | Already extracted (`comPath` exists) | Returns `zipComplete()` immediately |
| SZ-07 | Happy Path | Extracted file is video | `handleTag` + `handleMediaUpload` triggered |
| SZ-08 | Happy Path | Extracted file is document | `handleTag` + `handleMediaUpload` triggered |
| SZ-09 | Happy Path | Extracted file is zipbook | `handleTag` + `handleMediaUpload` triggered |
| SZ-10 | Happy Path | Extracted file is other type (e.g., .txt) | No media processing |
| SZ-11 | Password | Custom password provided | Used in command line |
| SZ-12 | Password | Empty password (default) | Falls back to `'123'` |
| SZ-13 | Edge Case | Filename with double quotes | Escaped via `name.replace(/"/g, '\\"')` |
| SZ-14 | Edge Case | Filename with shell metacharacters | May cause command injection if not properly escaped |
| SZ-15 | Edge Case | Password with single quotes | May break `'${pwd}'` shell quoting |
| SZ-16 | Error | `7za` command fails (wrong password) | `zipComplete()` called, error rejected |
| SZ-17 | Error | `myuzip.py` fails | `zipComplete()` called, error rejected |
| SZ-18 | Error | File stream read error during copy | `zipComplete()` called, error rejected |
| SZ-19 | Error | MongoDB update fails | Error propagates |
| SZ-20 | Error | `handleMediaUpload` fails | Caught by `handleError(err, errorMedia, ...)` — non-fatal |
| SZ-21 | Resource | Child process SIGKILL on completion | `chp.kill('SIGKILL')` called in `zipComplete` |
| SZ-22 | Edge Case | Real file exists before extraction → deleted first | `unReal()` deletes existing file before exec |
| SZ-23 | Security | Command injection via `name` parameter | `regName` only escapes double quotes; other shell chars not escaped |
| SZ-24 | Security | Command injection via `pwd` parameter | Password wrapped in single quotes for zip, `-p` prefix for 7za |

---

## 15. Function: `zipStop`

### Purpose

Stops zip extraction jobs — either all jobs for a specific user or a specific pool entry by index.

### Invocation & Signature

```js
function zipStop(user: Object|null, index: Number|false = false): Promise<void>
```

Invoked via: `process('zip stop', user, index)`

### Logic Flow

```
zipStop(user, index)
│
├── If user is truthy:
│   └── forEach zip_pool item:
│       └── If user._id.equals(item.user._id):
│           ├── If item.run → chp.kill('SIGKILL')
│           └── Remove matching fileId from pool (splice)
│
└── If user is falsy:
    ├── If zip_pool[index].run → chp.kill('SIGKILL')
    └── Remove matching fileId from pool (splice)
│
└── return Promise.resolve()
```

### Returns & Side Effects

- **Returns**: `Promise<void>`
- **Side Effects**: Child process killed (SIGKILL), pool item removed; no lock acquired

### Comprehensive Test Scenarios

| ID | Category | Scenario | Expected |
|----|----------|----------|----------|
| ZS-01 | Happy Path | Stop by user, running job | Child process killed, entry removed |
| ZS-02 | Happy Path | Stop by user, queued job (run=false) | Entry removed, no kill |
| ZS-03 | Happy Path | Stop by index, running job | Child process killed, entry removed |
| ZS-04 | Edge Case | Stop by user, multiple matching jobs | forEach + splice during iteration may skip entries |
| ZS-05 | Edge Case | Stop by user, no matching jobs | No mutations |
| ZS-06 | Edge Case | Stop by invalid index | TypeError |
| ZS-07 | Edge Case | Queued job has no `chp` property | Accessing `chp.kill` throws if `run=true` but `chp` not yet set |
| ZS-08 | Race Cond. | No lock acquired | Concurrent mutations possible |

---

## 16. Function: `megaAdd`

### Purpose

Adds a MEGA download job to the pool or reports progress on an existing one. Calculates download progress by scanning the real directory for accumulated file sizes.

### Invocation & Signature

```js
const megaAdd = (
  user: Object,
  url: String,              // MEGA download URL
  filePath: String,         // Local destination path
  data: Object = {}         // { rest: Function|null, errhandle: Function|null }
): Promise<any>
```

Invoked via: `process('mega add', user, url, filePath, data)`

### Logic Flow

```
megaAdd(user, url, filePath, data)
│
├── setLock('mega')
│
├── Search mega_pool for matching URL:
│   ├── FOUND → is_queue = true
│   │   ├── Capture existing filePath and data from pool
│   │   ├── If real directory exists:
│   │   │   ├── Recursively calculate total file size
│   │   │   └── sendWs progress (filename: X.XXMB)
│   │   └── If real dir doesn't exist: no progress
│   └── NOT FOUND → is_queue = false
│
├── Count running items
├── is_run = runNum < MEGA_LIMIT
│
├── If !is_queue:
│   └── Push new entry to mega_pool
│       ├── If is_run → start=now, run=true
│       └── If !is_run → run=false
│
├── Release lock
└── If is_run → startMega(...); else → resolve()
```

### Returns & Side Effects

- **Returns**: `Promise<any>` — resolves when queued or started (return value from `startMega` may be a rest callback)
- **Side Effects**: Mutates `mega_pool`, may start `megadl` process, sends WS progress

### Snapshot Testing Data

```js
// MEGA pool entry
{
  user: { _id: ObjectId("..."), username: "testuser" },
  url: "https://mega.nz/file/abc123",
  filePath: "/mnt/storage/owner/fileid",
  time: 1700000000,
  start: 1700000000,
  data: { rest: [Function], errhandle: [Function] },
  run: true
}

// WebSocket progress (duplicate request)
{
  type: "testuser",
  data: "downloaded_file.zip: 156.78MB"
}
```

### Comprehensive Test Scenarios

| ID | Category | Scenario | Expected |
|----|----------|----------|----------|
| MA-01 | Happy Path | New MEGA job, under limit | Entry added, `startMega` called |
| MA-02 | Happy Path | New MEGA job, at limit | Entry added with run=false |
| MA-03 | Happy Path | Duplicate URL, real dir exists | Progress WS sent, no new entry |
| MA-04 | Happy Path | Duplicate URL, real dir missing | No progress sent, no new entry |
| MA-05 | Edge Case | `data` is empty object (default) | Entry created with `data = {}` |
| MA-06 | Edge Case | URL with special characters | Used directly, no encoding in pool |
| MA-07 | Edge Case | Duplicate match overwrites local filePath/data with pool values | Caller's filePath/data ignored |
| MA-08 | Edge Case | `FsReaddirSync` throws on real dir | Error propagates (no try/catch) |
| MA-09 | Edge Case | Files in nested subdirectories | `recur_size` recursively traverses all subdirectories |
| MA-10 | Edge Case | Empty real directory | `size = 0`, filename remains 'Mega file' |

---

## 17. Function: `megaGet`

### Purpose

Scheduler that selects the next queued MEGA download job and starts it if under the concurrency limit. Optionally executes a `rest` callback (post-processing continuation from a previous completion).

### Invocation & Signature

```js
const megaGet = (rest: Function|null = null): Promise<void>
```

Internal only — called after `megaAdd`/`megaStop` chains.

### Logic Flow

```
megaGet(rest)
│
├── setLock('mega')
│   └── If !go → resolve()
│
├── If rest is a function → invoke rest().catch(...)
│
├── Find item with earliest time (choose)
├── If no candidate → release lock, resolve()
│
├── Count running items
├── If runNum < MEGA_LIMIT:
│   ├── Set item.start, item.run = true
│   ├── Release lock
│   ├── startMega(...)
│   └── .then(rest => megaGet(rest)) — recursive with rest callback
│
└── If at limit → release lock, resolve()
```

### Comprehensive Test Scenarios

| ID | Category | Scenario | Expected |
|----|----------|----------|----------|
| MG-01 | Happy Path | One queued job, under limit | Job started, recursive |
| MG-02 | Happy Path | With rest callback | Callback invoked before scheduling |
| MG-03 | Happy Path | rest is null | Skipped |
| MG-04 | Happy Path | Empty pool | Resolve |
| MG-05 | Concurrency | At limit | No new start |
| MG-06 | Recursion | startMega returns a rest callback | Passed to next megaGet iteration |
| MG-07 | Error | rest() throws | Caught by `.catch(handleError)`, scheduling continues |
| MG-08 | Edge Case | rest is a non-function truthy value | `typeof rest === 'function'` guard prevents invocation |

---

## 18. Function: `startMega`

### Purpose

Executes a MEGA download using the `megadl` CLI tool. Handles single-file and multi-file (directory) downloads with different post-processing paths. Supports a continuation callback pattern for chaining post-download operations.

### Invocation & Signature

```js
const startMega = (
  user: Object,
  url: String,
  filePath: String,
  data: Object              // { rest: Function|null, errhandle: Function|null }
): Promise<Function|void>
```

### Logic Flow

```
startMega(user, url, filePath, data)
│
├── Mkdirp(`${filePath}/real`)
│
├── Child_process.exec(`megadl --no-progress --path "${real}" "${url}"`)
│   ├── Store chp in pool item via setLock
│   ├── On error → megaComplete() → reject
│   └── On success → process downloaded files
│
├── Build sorted playList from real directory (recursive scan)
│
├── If playList empty → megaComplete(), handleError('mega empty')
│
├── If playList has exactly 1 file:
│   ├── Rename single file out of real dir → filePath
│   ├── Delete folder structure
│   ├── megaComplete(success)
│   └── If data.rest → return rest callback function
│
└── If playList has multiple files:
    ├── For each file (recursive):
    │   ├── Copy to `filePath/{index}_complete` via stream
    │   ├── Detect media type → accumulate setTag/optTag
    │   └── Continue to next
    ├── After all files:
    │   ├── Delete mega subfolder
    │   ├── megaComplete(success)
    │   └── If data.rest → return rest callback with playlist metadata
    └── Return (via recur_media chain)

megaComplete(is_success):
    ├── setLock('mega')
    ├── Kill child process (SIGKILL)
    ├── Remove pool item
    ├── If !is_success → deleteFolderRecursive(filePath)
    ├── Release lock
    └── resolve()
```

### Returns & Side Effects

- **Returns**: `Promise<Function|void>` — may return a rest callback function for continuation
- **Side Effects**:
  - Spawns `megadl` child process
  - Creates directories, writes files
  - For single files: restructures filesystem (rename + delete folder)
  - For multi-file: copies to indexed `_complete` files, detects media types
  - Updates pool state, kills child process
  - On failure: deletes entire download directory

### Snapshot Testing Data

```js
// Single file rest callback arguments
[
  "downloaded_file.mkv",     // basename
  new Set(["mega upload"]),  // setTag
  new Set()                  // optTag
]

// Multi-file rest callback arguments
[
  "file_001.mkv",                                    // basename of first file
  new Set(["mega upload", "playlist", "播放列表"]),    // setTag with playlist markers
  new Set(["video", "1080p"]),                        // optTag from media detection
  {
    mega: "https%3A%2F%2Fmega.nz%2Ffile%2Fabc123",  // encoded URL
    playList: ["dir/file_001.mkv", "dir/file_002.mkv"]
  }
]
```

### Comprehensive Test Scenarios

| ID | Category | Scenario | Expected |
|----|----------|----------|----------|
| SM-01 | Happy Path | Single file download | File moved to filePath, folder deleted, rest callback returned |
| SM-02 | Happy Path | Multi-file download (directory) | Each file copied to `{index}_complete`, tags accumulated |
| SM-03 | Happy Path | Multi-file with mixed media types | `extType`/`extTag` called for each, tags merged |
| SM-04 | Happy Path | data.rest is null/undefined | No callback returned |
| SM-05 | Happy Path | data.rest is a function | Callback returned wrapping `data.rest([...])` |
| SM-06 | Edge Case | megadl downloads 0 files (empty directory) | `megaComplete()` + `handleError('mega empty')` |
| SM-07 | Edge Case | Files in nested subdirectories | `megaFolder` recursively collects all files |
| SM-08 | Edge Case | URL with special characters | Passed to `megadl` in double quotes |
| SM-09 | Edge Case | File with unrecognized extension | `extType` returns null, no tags added |
| SM-10 | Error | `megadl` command fails | `megaComplete()` → reject, filePath deleted |
| SM-11 | Error | File stream error during multi-file copy | `megaComplete()` → reject |
| SM-12 | Error | `Mkdirp` fails (permissions) | Error propagates |
| SM-13 | Error | `FsRenameSync` fails (cross-device) | Error propagates (no try/catch) |
| SM-14 | Error | data.errhandle called on rest callback failure | rest wraps in `.catch(data.errhandle)` |
| SM-15 | Resource | megaComplete on failure deletes filePath | Verifies `deleteFolderRecursive(filePath)` called |
| SM-16 | Resource | megaComplete on success does NOT delete filePath | `is_success=true` skips deletion |
| SM-17 | Bug Risk | `megaComplete(!is_success)` splices pool then accesses `mega_pool[i].filePath` | After `splice(i, 1)`, index `i` points to next item — potential wrong filePath deletion |
| SM-18 | Edge Case | Multi-file: `sortList` changes file order | Indices assigned by sorted order |
| SM-19 | Tags | Single file tags | `new Set(['mega upload'])` only |
| SM-20 | Tags | Multi-file tags | Base: `['mega upload', 'playlist', '播放列表']` + per-file tags |

---

## 19. Function: `megaStop`

### Purpose

Stops MEGA download jobs — either all jobs for a specific user or a specific pool entry by index. Cleans up downloaded files on stop.

### Invocation & Signature

```js
function megaStop(user: Object|null, index: Number|false = false): Promise<void>
```

Invoked via: `process('mega stop', user, index)`

### Logic Flow

```
megaStop(user, index)
│
├── If user is truthy:
│   └── forEach mega_pool item:
│       └── If user._id.equals(item.user._id):
│           ├── If item.run → chp.kill('SIGKILL')
│           ├── deleteFolderRecursive(item.filePath)
│           └── Remove matching URL from pool (splice)
│
└── If user is falsy:
    ├── If mega_pool[index].run:
    │   ├── chp.kill('SIGKILL')
    │   └── deleteFolderRecursive(mega_pool[index].filePath)
    └── Remove matching URL from pool (splice)
│
└── return Promise.resolve()
```

### Returns & Side Effects

- **Returns**: `Promise<void>`
- **Side Effects**: Child process killed, download directory deleted, pool item removed; no lock acquired

### Comprehensive Test Scenarios

| ID | Category | Scenario | Expected |
|----|----------|----------|----------|
| MS-01 | Happy Path | Stop by user, running job | Process killed, files deleted, entry removed |
| MS-02 | Happy Path | Stop by user, queued job | Files deleted, entry removed (no kill since no chp) |
| MS-03 | Happy Path | Stop by index, running job | Process killed, files deleted, entry removed |
| MS-04 | Edge Case | Stop by index, queued job (run=false) | Entry removed, no kill, **no file deletion** (guard: `if run`) |
| MS-05 | Edge Case | Stop by user, multiple matching | forEach + splice may skip entries |
| MS-06 | Edge Case | Invalid index | TypeError |
| MS-07 | Edge Case | Queued job, no `chp` property | `chp.kill` throws if run=true but chp not set |
| MS-08 | Race Cond. | No lock acquired | Concurrent mutations possible |
| MS-09 | Difference | Stop-by-user always deletes filePath | Even for queued jobs (run=false), `deleteFolderRecursive` called |
| MS-10 | Difference | Stop-by-index only deletes if running | Queued jobs by index skip file deletion |

---

## 20. Cross-Cutting Concerns

### 20.1 Security Considerations

| Concern | Location | Risk | Test Focus |
|---------|----------|------|-----------|
| Command injection | `startZip` command line construction | Filename/password can inject shell commands | Test names with `;`, `$()`, backticks, pipe chars |
| Command injection | `startMega` megadl URL | URL can contain shell metacharacters | Test URLs with spaces, quotes, semicolons |
| Path traversal | `startMega` megaFolder recursive scan | Symlinks could escape real directory | Test with symlinked directories |
| No auth on stop-by-index | `*Stop(null, index)` | Any caller can stop any job by pool index | Verify caller authorization |

### 20.2 Concurrency & Race Conditions

| Issue | Functions Affected | Description |
|-------|-------------------|-------------|
| No lock in stop functions | `torrentStop`, `zipStop`, `megaStop` | Pool mutations without lock; concurrent add/stop may corrupt state |
| Splice during forEach | All stop-by-user paths | `splice` during `forEach` iteration shifts indices, potentially skipping items |
| Deadlock risk | `setLock` | No timeout on spin-lock; if lock never released, all operations stall |
| Fire-and-forget errors | `process` dispatcher | Background chain errors swallowed; caller never knows about failures |

### 20.3 Resource Management

| Resource | Lifecycle | Cleanup |
|----------|----------|---------|
| TorrentStream engine | Created in `torrentAdd`/`torrentGet` | Destroyed in `torrentComplete`/`torrentStop` |
| Child process (`megadl`) | Created in `startMega` | SIGKILL in `megaComplete`/`megaStop` |
| Child process (`7za`/`myuzip.py`) | Created in `startZip` | SIGKILL in `zipComplete`/`zipStop` |
| Filesystem (downloaded files) | Created during download | Deleted on failure; kept on success |
| Filesystem (temp real dir) | Created by `Mkdirp` | Deleted after multi-file mega; left after torrent |

### 20.4 Error Propagation Pattern

```
process(action, ...args)
├── Fire-and-forget actions (torrent/zip/mega add/stop):
│   ├── Internal error → .catch(handle_err) → sendWs notification
│   ├── Scheduler error → .catch(handleError) → logged only
│   └── Caller receives resolved Promise regardless
│
└── Synchronous actions (playlist kick, torrent info):
    └── Errors propagate to caller
```

---

## 21. Mock & Stub Strategy

### Required Mocks for Unit Testing

| Dependency | Mock Strategy |
|-----------|---------------|
| `torrent-stream` | Mock TorrentStream factory returning engine with `.files`, `.on('ready')`, `.destroy()`, `.torrent.name` |
| `child_process.exec` | Mock to control stdout/stderr and error callback; capture command string for assertion |
| `fs` (all sync/async ops) | Mock `existsSync`, `statSync`, `readdirSync`, `lstatSync`, `createReadStream`, `createWriteStream`, `unlink`, `renameSync` |
| `mkdirp` | Mock to resolve immediately |
| `mongo-tool.js` | Mock `Mongo('update', ...)` to capture calls and return resolved promises |
| `mediaHandle-tool.js` | Mock `handleTag` and `handleMediaUpload` to return resolved promises with controlled data |
| `utility.js` | Mock `handleError`, `getFileLocation`, `checkAdmin`, `sortList`, `deleteFolderRecursive`, `SRT2VTT` |
| `mime.js` | Mock `isVideo`, `isDoc`, `isZipbook`, `extType`, `extTag` with controlled returns |
| `sendWs.js` | Mock to capture all WebSocket message payloads |
| `config.js` | Mock `TORRENT_LIMIT`, `ZIP_LIMIT`, `MEGA_LIMIT` to return controlled values |
| `constants.js` | Mock `TORRENT_DURATION`, `ZIP_DURATION`, `MEGA_DURATION`, `STORAGEDB`, etc. |

### State Management in Tests

Since `torrent_pool`, `zip_pool`, `mega_pool`, and lock variables are module-level state:

1. **Isolation**: Each test must reset pool arrays and lock booleans between tests
2. **Access**: Use the `process` export to indirectly test internal functions, or use a test helper to access module internals
3. **Timing**: Tests involving `setLock` spin-wait should use `jest.useFakeTimers()` to advance `setTimeout`
4. **Async**: All functions return Promises; tests must properly `await` or return Promise chains

### Suggested Test File

```
src/back/models/__tests__/api-tool-playlist.test.js
```

Following the project structure outlined in OUTLINE.md §11.8.

---

> **Document Version**: 1.0
> **Source File**: `src/back/models/api-tool-playlist.js` (1030 lines)
> **Aligned With**: OUTLINE.md §11 QA Testing Scope & Strategy
> **Coverage Target**: 100% logical branch coverage across all 16 internal functions + 1 default export
