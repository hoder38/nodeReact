# Background Jobs — QA Testing Documentation

> **Module**: `src/back/cmd/background.js` (374 lines)
> **Invoked from**: `controllers/file-server.js` at startup — internal process, no HTTP authentication
> **Environment Config**: `src/back/config.js` resolves Dev vs Release feature flags via `ENV_TYPE`

---

## Table of Contents

1. [Global Architecture](#global-architecture)
2. [autoUpload](#1-autoupload)
3. [autoDownload](#2-autodownload)
4. [checkMedia](#3-checkmedia)
5. [updateStock](#4-updatestock)
6. [updateStockList](#5-updatestocklist)
7. [filterStock](#6-filterstock)
8. [dbBackup](#7-dbbackup)
9. [checkStock](#8-checkstock)
10. [rateCalculator](#9-ratecalculator)
11. [setUserOffer](#10-setuseroffer)
12. [filterBitfinex](#11-filterbitfinex)
13. [usseInit](#12-usseinit)
14. [twseInit](#13-twseinit)
15. [Summary Matrix](#summary-matrix)

---

## Global Architecture

### Shared Patterns

All 13 exported functions follow a consistent pattern:

1. **Feature-flag guard** — The outer function checks a config flag (e.g., `AUTO_UPLOAD(ENV_TYPE)`). If falsy, the function returns `undefined` immediately.
2. **Initial delay** — Each function wraps its first loop invocation in a `setTimeout` with a unique stagger delay (60 000 ms – 540 000 ms) to avoid thundering-herd at startup.
3. **Recursive scheduling** — An inner function calls itself via `Promise → setTimeout → resolve → recurse`. This is **not** `setInterval`; it is a self-scheduling promise chain.
4. **Concurrency guard** — Functions that call expensive external APIs use a `current*` timestamp sentinel. Before running, they check `!current* || current* < (now - INTERVAL * (MAX_RETRY + 2))`. This prevents overlapping executions while allowing recovery if the previous run never cleared.
5. **Error handling** — Errors are caught with `.catch(err => bgError(err, '<label>'))`, which sends a WebSocket notification (`sendWs`) and calls `handleError` for logging/Discord.
6. **Fire-and-forget** — No function returns a meaningful value to its caller; they return a never-resolving promise chain (infinite loop).

### Shared Helper

```js
function bgError(err, type) {
    sendWs(`${type}: ${err.message||err.msg}`, 0, 0, true);
    handleError(err, type);
}
```

### Key Constants (from `constants.js`)

| Constant | Value | Unit |
|----------|-------|------|
| `DRIVE_INTERVAL` | 3 600 | seconds (1 h) |
| `DOC_INTERVAL` | 3 600 | seconds (1 h) |
| `MEDIA_INTERVAl` | 7 200 | seconds (2 h) |
| `BACKUP_INTERVAL` | 86 400 | seconds (24 h) |
| `PRICE_INTERVAL` | 600 | seconds (10 min) |
| `RATE_INTERVAL` | 90 | seconds (1.5 min) |
| `MAX_RETRY` | 10 | count |
| `USERDB` | `'user'` | collection name |
| `STOCKDB` | `'stock'` | collection name |
| `BACKUP_COLLECTION` | `['user','storage','stock','password','storageUser','stockUser','passwordUser']` | array |

### Feature Flags (Dev vs Release)

| Flag | Dev | Release |
|------|-----|---------|
| `AUTO_UPLOAD` | `false` | `false` |
| `AUTO_DOWNLOAD` | `false` | `true` |
| `CHECK_MEDIA` | `false` | `true` |
| `UPDATE_STOCK` | `false` | `true` |
| `STOCK_FILTER` | `false` | `true` |
| `DB_BACKUP` | `false` | `true` |
| `CHECK_STOCK` | `false` | `true` |
| `BITFINEX_LOAN` | `false` | `true` |
| `BITFINEX_FILTER` | `false` | `true` |
| `USSE_TICKER` | `false` | `true` |
| `TWSE_TICKER` | `false` | `true` |

> **Note**: `AUTO_UPLOAD` is `false` in **both** environments. All other flags are disabled in Dev and enabled in Release.

---

## 1. autoUpload

### Purpose

Periodically uploads user files to Google Drive for users who have the `auto` field set in the `user` collection.

### Logic Flow

1. Guard: `AUTO_UPLOAD(ENV_TYPE)` — returns `undefined` if disabled.
2. Initial delay: `setTimeout(360000)` (6 minutes).
3. Inner function `loopDrive()`:
   a. Compute `now` (epoch seconds).
   b. Concurrency guard: skip if `currentAutoUpload` is set AND not older than `DRIVE_INTERVAL * (MAX_RETRY + 2)` = 3 600 × 12 = 43 200 s.
   c. Set `currentAutoUpload = now`.
   d. `Mongo('find', USERDB, {auto: {$exists: true}})` — find all users with auto-upload enabled.
   e. `userDrive(userlist, 0)` — iterate through users and upload to Google Drive.
   f. On completion or error: reset `currentAutoUpload = 0`.
   g. Errors caught by `bgError(err, 'Loop drive')`.
4. Reschedule: `setTimeout(DRIVE_INTERVAL * 1000)` → recurse `loopDrive()`.

### Invocation & Authentication

- **Signature**: `export const autoUpload = () => { ... }`
- **Called from**: `file-server.js` at startup — no HTTP auth required.
- **Feature flag**: `AUTO_UPLOAD(ENV_TYPE)` — `false` in both Dev and Release.
- **Requires**: Valid Google Drive OAuth credentials (GOOGLE_ID, GOOGLE_SECRET, stored token).

### Returns & Side Effects

- **Return**: Never-resolving promise chain (void/fire-and-forget).
- **DB reads**: `user` collection (query `{auto: {$exists: true}}`).
- **Google Drive API**: File upload via `userDrive()` (googleapis).
- **WebSocket**: Error notifications via `sendWs` on failure.
- **Discord**: Error forwarded through `handleError`.

### Snapshot Testing Data

```js
// Timer configuration shape
{
  interval: 3600,          // DRIVE_INTERVAL seconds
  initialDelay: 360000,    // ms (6 min)
  featureFlag: 'AUTO_UPLOAD',
  enabled: { dev: false, release: false },
  concurrencyGuard: 'currentAutoUpload',
  guardTimeout: 43200      // DRIVE_INTERVAL * (MAX_RETRY + 2) = 3600 * 12
}

// Example Mongo query
Mongo('find', 'user', { auto: { $exists: true } })

// Expected userlist shape
[{ _id: ObjectId, username: 'user1', auto: { ... }, perm: 1 }]
```

### Test Scenarios

| ID | Scenario | Input/State | Expected Behavior | Priority |
|----|----------|-------------|-------------------|----------|
| AU-01 | Feature flag disabled | `AUTO_UPLOAD(ENV_TYPE)` returns `false` | Function returns `undefined` immediately; no timers created | 🔴 Critical |
| AU-02 | Happy path — users with auto field | DB has 2 users with `auto` field | `userDrive` called with userlist; `currentAutoUpload` resets to 0 | 🔴 Critical |
| AU-03 | No users with auto field | DB query returns `[]` | `userDrive([],0)` called; completes without error | 🟡 High |
| AU-04 | Concurrency guard — already running | `currentAutoUpload` set to recent timestamp | Loop iteration skipped; waits for next interval | 🔴 Critical |
| AU-05 | Concurrency guard — stale lock | `currentAutoUpload` older than 43 200 s | Guard allows re-entry; resets sentinel | 🟡 High |
| AU-06 | Google Drive API error | `userDrive` throws network error | `bgError` called with label `'Loop drive'`; `currentAutoUpload` resets to 0; loop continues | 🔴 Critical |
| AU-07 | MongoDB query failure | `Mongo('find')` rejects | `bgError` called; `currentAutoUpload` resets to 0 | 🟡 High |
| AU-08 | Reschedule after success | Previous iteration completes | `setTimeout(3600000)` created; `loopDrive` re-called | 🟡 High |
| AU-09 | Initial delay timing | Function invoked | First execution delayed by 360 000 ms (6 min) | 🟢 Medium |
| AU-10 | Timer drift over 24 h | 24 consecutive iterations | Each iteration starts ~3 600 s apart (no cumulative drift from execution time since timer starts before work completes) | 🟢 Medium |

---

## 2. autoDownload

### Purpose

Automatically downloads documents from government APIs at scheduled hours (11:00, 17:00, 18:00 UTC) for users with `auto` field and `perm: 1`.

### Logic Flow

1. Guard: `AUTO_DOWNLOAD(ENV_TYPE)`.
2. Initial delay: `setTimeout(390000)` (6.5 minutes).
3. Inner function `loopDoc()`:
   a. Log `'loopDoc'` and current timestamp.
   b. `Mongo('find', USERDB, {auto: {$exists: true}, perm: 1})` — find admin users with auto-download.
   c. Check `new Date().getHours()`:
      - `11` → `autoDoc(userlist, 0, 'am')` (morning / US docs)
      - `17` → `autoDoc(userlist, 0, 'jp')` (Japan docs)
      - `18` → `autoDoc(userlist, 0, 'tw')` (Taiwan docs)
      - default → `Promise.resolve()` (no-op)
   d. Errors caught by `bgError(err, 'Loop doc')`.
   e. **No concurrency guard** — uses simple schedule without sentinel.
4. Reschedule: `setTimeout(DOC_INTERVAL * 1000)` (3 600 s = 1 h) → recurse.

### Invocation & Authentication

- **Signature**: `export const autoDownload = () => { ... }`
- **Called from**: `file-server.js` at startup.
- **Feature flag**: `AUTO_DOWNLOAD(ENV_TYPE)` — Dev: `false`, Release: `true`.
- **Requires**: Valid Google Drive OAuth credentials for `autoDoc`.

### Returns & Side Effects

- **Return**: Never-resolving promise chain.
- **DB reads**: `user` collection (query `{auto: {$exists: true}, perm: 1}`).
- **Google Drive API**: Document download via `autoDoc()`.
- **WebSocket**: Error notifications on failure.
- **Discord**: Error forwarded through `handleError`.

### Snapshot Testing Data

```js
{
  interval: 3600,          // DOC_INTERVAL
  initialDelay: 390000,    // ms (6.5 min)
  featureFlag: 'AUTO_DOWNLOAD',
  enabled: { dev: false, release: true },
  concurrencyGuard: null,  // none
  scheduledHours: [11, 17, 18],
  hourToRegion: { 11: 'am', 17: 'jp', 18: 'tw' }
}

// Example Mongo query
Mongo('find', 'user', { auto: { $exists: true }, perm: 1 })
```

### Test Scenarios

| ID | Scenario | Input/State | Expected Behavior | Priority |
|----|----------|-------------|-------------------|----------|
| AD-01 | Feature flag disabled | `AUTO_DOWNLOAD(ENV_TYPE)` returns `false` | Function returns `undefined`; no timers | 🔴 Critical |
| AD-02 | Hour = 11 (AM docs) | System clock at 11:xx UTC | `autoDoc(userlist, 0, 'am')` called | 🔴 Critical |
| AD-03 | Hour = 17 (JP docs) | System clock at 17:xx UTC | `autoDoc(userlist, 0, 'jp')` called | 🔴 Critical |
| AD-04 | Hour = 18 (TW docs) | System clock at 18:xx UTC | `autoDoc(userlist, 0, 'tw')` called | 🔴 Critical |
| AD-05 | Hour = 14 (off-schedule) | System clock at 14:xx UTC | `Promise.resolve()` returned; no download | 🔴 Critical |
| AD-06 | No admin users | DB returns `[]` | `autoDoc([],0,'am')` called; completes gracefully | 🟡 High |
| AD-07 | autoDoc throws | Google API returns 403 | `bgError(err, 'Loop doc')` called; loop continues | 🟡 High |
| AD-08 | MongoDB query failure | DB connection drops | `bgError` called; loop reschedules | 🟡 High |
| AD-09 | Boundary: hour transition | Invoked at 10:59, completes at 11:01 | Depends on when `new Date().getHours()` is evaluated (at loop start) | 🟢 Medium |
| AD-10 | No concurrency guard | Two rapid calls | Both executions run concurrently — verify no data corruption | 🟡 High |
| AD-11 | 1-hour interval alignment | First run at 11:00 | Subsequent runs at 12:00, 13:00… only 11:00 triggers download again next day | 🟢 Medium |

---

## 3. checkMedia

### Purpose

Verifies media file integrity and performs playlist maintenance. Kicks stale playlist entries then runs media file checks.

### Logic Flow

1. Guard: `CHECK_MEDIA(ENV_TYPE)`.
2. Initial delay: `setTimeout(420000)` (7 minutes).
3. Inner function `loopHandleMedia()`:
   a. Compute `now`.
   b. Concurrency guard: `currentCheckMedia` sentinel, timeout = `MEDIA_INTERVAl * (MAX_RETRY + 2)` = 7 200 × 12 = 86 400 s.
   c. Set `currentCheckMedia = now`.
   d. `PlaylistApi('playlist kick')` — remove stale playlist entries.
   e. `.then(() => MediaHandleTool.checkMedia())` — verify media files.
   f. Reset `currentCheckMedia = 0` on completion.
   g. Errors caught by `bgError(err, 'Loop checkMedia')`.
4. Reschedule: `setTimeout(MEDIA_INTERVAl * 1000)` (7 200 s = 2 h) → recurse.

### Invocation & Authentication

- **Signature**: `export const checkMedia = () => { ... }`
- **Called from**: `file-server.js` at startup.
- **Feature flag**: `CHECK_MEDIA(ENV_TYPE)` — Dev: `false`, Release: `true`.
- **Requires**: Filesystem access to media files, ffmpeg for integrity checks.

### Returns & Side Effects

- **Return**: Never-resolving promise chain.
- **DB reads/writes**: `storage` collection (media metadata updates).
- **Filesystem**: Reads media files for integrity check; may remove corrupt files.
- **Playlist API**: Kicks stale entries via `PlaylistApi('playlist kick')`.
- **WebSocket**: Error notifications on failure.
- **Discord**: Error forwarded through `handleError`.

### Snapshot Testing Data

```js
{
  interval: 7200,          // MEDIA_INTERVAl (note: typo in source — lowercase 'l')
  initialDelay: 420000,    // ms (7 min)
  featureFlag: 'CHECK_MEDIA',
  enabled: { dev: false, release: true },
  concurrencyGuard: 'currentCheckMedia',
  guardTimeout: 86400      // 7200 * 12
}
```

### Test Scenarios

| ID | Scenario | Input/State | Expected Behavior | Priority |
|----|----------|-------------|-------------------|----------|
| CM-01 | Feature flag disabled | `CHECK_MEDIA` returns `false` | Returns `undefined`; no timers | 🔴 Critical |
| CM-02 | Happy path | Playlist has stale entries; some media files exist | `PlaylistApi('playlist kick')` then `MediaHandleTool.checkMedia()` called in sequence | 🔴 Critical |
| CM-03 | Concurrency guard — active | `currentCheckMedia` set recently | Iteration skipped | 🔴 Critical |
| CM-04 | Concurrency guard — stale | `currentCheckMedia` > 86 400 s old | Guard allows re-entry | 🟡 High |
| CM-05 | PlaylistApi throws | Playlist service error | `bgError(err, 'Loop checkMedia')`; `currentCheckMedia` resets | 🟡 High |
| CM-06 | checkMedia throws | ffmpeg not found or file corrupt | `bgError` called; loop continues | 🟡 High |
| CM-07 | Empty media set | No media files in storage | `checkMedia()` completes with no-op | 🟢 Medium |
| CM-08 | Reschedule timing | After completion | Next run in 7 200 s | 🟢 Medium |

---

## 4. updateStock

### Purpose

Batches stock list retrieval on a weekly schedule: TWSE stocks on Saturday at 03:00, USSE stocks on Thursday at 03:00. Retrieved stocks are pushed into the shared `stock_batch_list` array for `updateStockList` to process.

### Logic Flow

1. Guard: `UPDATE_STOCK(ENV_TYPE)`.
2. Initial delay: `setTimeout(450000)` (7.5 minutes).
3. Inner function `loopUpdateStock()`:
   a. Log `'loopUpdateStock'` and timestamp.
   b. Capture `sd = new Date()`.
   c. `parseStockList()`:
      - Saturday (`sd.getDay() === 6`) AND hour 3 → `getStockListV2('twse', year, month)` → push each item to `stock_batch_list`.
      - Thursday (`sd.getDay() === 4`) AND hour 3 → `getStockListV2('usse', year, month)` → push each item to `stock_batch_list`.
      - Otherwise → `Promise.resolve()`.
   d. Errors caught by `bgError(err, 'Loop updateStock')`.
   e. **No concurrency guard** — fires regardless of prior state.
4. Reschedule: `setTimeout(DOC_INTERVAL * 1000)` (3 600 s = 1 h) → recurse.

### Invocation & Authentication

- **Signature**: `export const updateStock = () => { ... }`
- **Called from**: `file-server.js` at startup.
- **Feature flag**: `UPDATE_STOCK(ENV_TYPE)` — Dev: `false`, Release: `true`.
- **Requires**: Yahoo Finance API access (via `yahoo-finance2` patched library).

### Returns & Side Effects

- **Return**: Never-resolving promise chain.
- **Module-level mutation**: Pushes items into `stock_batch_list[]` (shared with `updateStockList`).
- **DB reads**: `stock` collection via `getStockListV2`.
- **External API**: Yahoo Finance for stock list retrieval.
- **WebSocket**: Error notifications on failure.

### Snapshot Testing Data

```js
{
  interval: 3600,          // DOC_INTERVAL
  initialDelay: 450000,    // ms (7.5 min)
  featureFlag: 'UPDATE_STOCK',
  enabled: { dev: false, release: true },
  concurrencyGuard: null,
  schedule: {
    twse: { day: 6, hour: 3 },  // Saturday 03:00
    usse: { day: 4, hour: 3 }   // Thursday 03:00
  }
}

// stock_batch_list item shape (pushed by getStockListV2)
{ type: 'twse'|'usse', index: 'AAPL', /* ...other stock fields */ }
```

### Test Scenarios

| ID | Scenario | Input/State | Expected Behavior | Priority |
|----|----------|-------------|-------------------|----------|
| US-01 | Feature flag disabled | `UPDATE_STOCK` returns `false` | Returns `undefined`; no timers | 🔴 Critical |
| US-02 | Saturday 03:xx UTC | `sd.getDay()===6`, `sd.getHours()===3` | `getStockListV2('twse',...)` called; items pushed to `stock_batch_list` | 🔴 Critical |
| US-03 | Thursday 03:xx UTC | `sd.getDay()===4`, `sd.getHours()===3` | `getStockListV2('usse',...)` called; items pushed to `stock_batch_list` | 🔴 Critical |
| US-04 | Off-schedule day/hour | Monday 10:00 | `Promise.resolve()`; `stock_batch_list` unchanged | 🔴 Critical |
| US-05 | Saturday 04:xx (wrong hour) | `sd.getDay()===6`, `sd.getHours()===4` | No-op — hour must be exactly 3 | 🟡 High |
| US-06 | getStockListV2 throws | API timeout | `bgError(err, 'Loop updateStock')`; loop continues | 🟡 High |
| US-07 | Large stock list | 500+ items returned | All items pushed to `stock_batch_list`; no truncation | 🟢 Medium |
| US-08 | Empty stock list | API returns `[]` | Nothing pushed; no error | 🟢 Medium |
| US-09 | Concurrent pushes | `updateStock` and manual push overlap | Array grows correctly (JS single-threaded — safe) | 🟢 Medium |

---

## 5. updateStockList

### Purpose

Processes the shared `stock_batch_list` queue one item at a time, updating individual stock data. Acts as the consumer for items enqueued by `updateStock`.

### Logic Flow

1. Guard: `UPDATE_STOCK(ENV_TYPE)`.
2. Initial delay: `setTimeout(540000)` (9 minutes).
3. Inner function `loopUpdateStockList()`:
   a. Check `stock_batch_list.length > 0`.
   b. Concurrency guard: `currentUpdateStockList` sentinel, timeout = `RATE_INTERVAL * (MAX_RETRY + 2)` = 90 × 12 = 1 080 s.
   c. Set `currentUpdateStockList = now`.
   d. Log current item and queue length.
   e. `stock_batch_list.splice(0, 1)` — dequeue first item.
   f. `StockTool.getSingleStockV2(item[0].type, item[0], 1, true)`.
   g. On error: if message does **not** include `'too short stock data'`, re-push item to queue; always call `bgError`.
   h. Reset `currentUpdateStockList = 0`.
4. Reschedule: `setTimeout(RATE_INTERVAL * 1000)` (90 s) → recurse.

### Invocation & Authentication

- **Signature**: `export const updateStockList = () => { ... }`
- **Called from**: `file-server.js` at startup.
- **Feature flag**: `UPDATE_STOCK(ENV_TYPE)` — Dev: `false`, Release: `true`.
- **Requires**: Yahoo Finance API access.

### Returns & Side Effects

- **Return**: Never-resolving promise chain.
- **Module-level mutation**: Splices from `stock_batch_list[]` (dequeue); may re-push on non-fatal errors.
- **DB writes**: `stock` collection updated via `getSingleStockV2`.
- **External API**: Yahoo Finance for individual stock data.
- **WebSocket**: Error notifications on failure.

### Snapshot Testing Data

```js
{
  interval: 90,            // RATE_INTERVAL
  initialDelay: 540000,    // ms (9 min)
  featureFlag: 'UPDATE_STOCK',
  enabled: { dev: false, release: true },
  concurrencyGuard: 'currentUpdateStockList',
  guardTimeout: 1080       // 90 * 12
}

// Dequeued item shape
{ type: 'twse', index: '2330', /* ...stock fields */ }

// getSingleStockV2 call
StockTool.getSingleStockV2('twse', item, 1, true)
```

### Test Scenarios

| ID | Scenario | Input/State | Expected Behavior | Priority |
|----|----------|-------------|-------------------|----------|
| SL-01 | Feature flag disabled | `UPDATE_STOCK` returns `false` | Returns `undefined`; no timers | 🔴 Critical |
| SL-02 | Queue non-empty, guard clear | `stock_batch_list` has 3 items | First item dequeued; `getSingleStockV2` called; queue now has 2 | 🔴 Critical |
| SL-03 | Queue empty | `stock_batch_list.length === 0` | Inner block skipped; waits 90 s; checks again | 🔴 Critical |
| SL-04 | Concurrency guard — active | `currentUpdateStockList` set recently | Iteration skipped; waits for next interval | 🟡 High |
| SL-05 | Error: "too short stock data" | `getSingleStockV2` throws with that message | Item is **not** re-pushed; `bgError` called | 🔴 Critical |
| SL-06 | Error: other message | `getSingleStockV2` throws generic error | Item re-pushed to end of queue; `bgError` called | 🔴 Critical |
| SL-07 | Stale concurrency lock | `currentUpdateStockList` > 1 080 s old | Guard allows re-entry | 🟡 High |
| SL-08 | Rapid queue drain | 100 items in queue | Items processed one per 90 s interval; ~2.5 h total | 🟢 Medium |
| SL-09 | Yahoo Finance timeout | API hangs | `bgError` after promise rejects; item re-pushed | 🟡 High |

---

## 6. filterStock

### Purpose

Applies stock screening/filter analysis. Runs only on **Tuesday at 03:00 UTC**.

### Logic Flow

1. Guard: `STOCK_FILTER(ENV_TYPE)`.
2. Initial delay: `setTimeout(480000)` (8 minutes).
3. Inner function `loopStockFilter()`:
   a. Log and capture `sd = new Date()`.
   b. Check `sd.getDay() === 2` (Tuesday) AND `sd.getHours() === 3`.
   c. If matched → `StockTool.stockFilterWarp()`.
   d. Otherwise → `Promise.resolve()`.
   e. Errors caught by `bgError(err, 'Loop stockFilter')`.
   f. **No concurrency guard**.
4. Reschedule: `setTimeout(DOC_INTERVAL * 1000)` (3 600 s = 1 h) → recurse.

### Invocation & Authentication

- **Signature**: `export const filterStock = () => { ... }`
- **Called from**: `file-server.js` at startup.
- **Feature flag**: `STOCK_FILTER(ENV_TYPE)` — Dev: `false`, Release: `true`.
- **Requires**: Stock data already populated in DB.

### Returns & Side Effects

- **Return**: Never-resolving promise chain.
- **DB reads/writes**: `stock` collection (filter results written back).
- **WebSocket**: Error notifications on failure.

### Snapshot Testing Data

```js
{
  interval: 3600,          // DOC_INTERVAL
  initialDelay: 480000,    // ms (8 min)
  featureFlag: 'STOCK_FILTER',
  enabled: { dev: false, release: true },
  concurrencyGuard: null,
  schedule: { day: 2, hour: 3 }  // Tuesday 03:00 UTC
}
```

### Test Scenarios

| ID | Scenario | Input/State | Expected Behavior | Priority |
|----|----------|-------------|-------------------|----------|
| FS-01 | Feature flag disabled | `STOCK_FILTER` returns `false` | Returns `undefined` | 🔴 Critical |
| FS-02 | Tuesday 03:xx UTC | Correct day and hour | `StockTool.stockFilterWarp()` called | 🔴 Critical |
| FS-03 | Tuesday 04:xx UTC | Correct day, wrong hour | No-op | 🟡 High |
| FS-04 | Monday 03:xx UTC | Wrong day, correct hour | No-op | 🟡 High |
| FS-05 | stockFilterWarp throws | DB error | `bgError(err, 'Loop stockFilter')`; loop continues | 🟡 High |
| FS-06 | No stock data | `stock` collection empty | `stockFilterWarp()` handles gracefully | 🟢 Medium |
| FS-07 | Multiple invocations at 03:xx | Loop fires at 03:00 and 03:59 | Both fire `stockFilterWarp()` (no concurrency guard) — verify idempotency | 🟡 High |

---

## 7. dbBackup

### Purpose

Performs database backups on the **2nd of each month** (collection-level dumps + Google Drive upload) and whole-system image backups on the **3rd of Feb/May/Aug/Nov** (quarterly).

### Logic Flow

1. Guard: `DB_BACKUP(ENV_TYPE)`.
2. Initial delay: `setTimeout(510000)` (8.5 minutes).
3. Inner function `allBackup()`:
   a. Capture `sd = new Date()` and format `backupDate` as `YYYYMMDD`.
   b. Define `singleBackup(index)`:
      - Iterate `BACKUP_COLLECTION` array (7 collections).
      - For each: `dbDump(collection, backupDate)` (shell `mongodump`).
      - After all: `googleBackupDb(backupDate)` — upload to Google Drive.
   c. Define `wholeBackup()`:
      - Build filename: `{YYYYMMDD}_Ubuntu_20_04_1_LTS.img`.
      - Execute `sudo dd if=${DEVICE_PATH} of=${BACKUP_PATH}/${backupName}` via `Child_process.exec`.
      - `sendWs` notification with local path.
      - `googleBackupWhole(backupName)` — upload image to Google Drive.
   d. Schedule check:
      - `sd.getDate() === 2` → run `singleBackup(0)`.
      - `sd.getDate() === 3` AND month ∈ `{1, 4, 7, 10}` (Feb/May/Aug/Nov, 0-indexed) → run `wholeBackup()`.
      - Both run sequentially: `sdf().then(() => wdf())`.
   e. Errors caught by `bgError(err, 'Loop allBackup')`.
4. Reschedule: `setTimeout(BACKUP_INTERVAL * 1000)` (86 400 s = 24 h) → recurse.

### Invocation & Authentication

- **Signature**: `export const dbBackup = () => { ... }`
- **Called from**: `file-server.js` at startup.
- **Feature flag**: `DB_BACKUP(ENV_TYPE)` — Dev: `false`, Release: `true`.
- **Requires**: MongoDB credentials for `mongodump`, Google Drive OAuth, `sudo` privileges for `dd`, `DEVICE_PATH` from `ver.js`.

### Returns & Side Effects

- **Return**: Never-resolving promise chain.
- **DB reads**: All 7 collections in `BACKUP_COLLECTION` via `mongodump`.
- **Filesystem writes**: Dump files to backup directory; whole system image via `dd`.
- **Google Drive API**: `googleBackupDb` (DB dumps), `googleBackupWhole` (system image).
- **WebSocket**: Success notification for whole backup; error notifications.
- **Child process**: `sudo dd` for system image creation.

### Snapshot Testing Data

```js
{
  interval: 86400,         // BACKUP_INTERVAL
  initialDelay: 510000,    // ms (8.5 min)
  featureFlag: 'DB_BACKUP',
  enabled: { dev: false, release: true },
  concurrencyGuard: null,
  collections: ['user','storage','stock','password','storageUser','stockUser','passwordUser'],
  schedule: {
    dbBackup: { date: 2 },                        // 2nd of every month
    wholeBackup: { date: 3, months: [1,4,7,10] }  // 3rd of Feb/May/Aug/Nov (0-indexed)
  }
}

// backupDate format
'20260302'

// wholeBackup filename
'20260303_Ubuntu_20_04_1_LTS.img'

// dd command
`sudo dd if=/dev/mmcblk0 of=/mnt/backup/20260303_Ubuntu_20_04_1_LTS.img`
```

### Test Scenarios

| ID | Scenario | Input/State | Expected Behavior | Priority |
|----|----------|-------------|-------------------|----------|
| DB-01 | Feature flag disabled | `DB_BACKUP` returns `false` | Returns `undefined` | 🔴 Critical |
| DB-02 | 2nd of month — DB backup | `sd.getDate()===2` | All 8 collections dumped then uploaded to Google Drive | 🔴 Critical |
| DB-03 | 3rd of Feb — whole backup | `sd.getDate()===3`, `sd.getMonth()===1` | `dd` creates system image; uploaded to Google Drive | 🔴 Critical |
| DB-04 | 3rd of May — whole backup | `sd.getDate()===3`, `sd.getMonth()===4` | Same as DB-03 | 🟡 High |
| DB-05 | 3rd of Aug — whole backup | `sd.getDate()===3`, `sd.getMonth()===7` | Same as DB-03 | 🟡 High |
| DB-06 | 3rd of Nov — whole backup | `sd.getDate()===3`, `sd.getMonth()===10` | Same as DB-03 | 🟡 High |
| DB-07 | 3rd of March (not quarterly) | `sd.getDate()===3`, `sd.getMonth()===2` | No whole backup | 🟡 High |
| DB-08 | 2nd AND 3rd same run? | Impossible — 24 h interval ensures only one date per cycle | Both `sdf` and `wdf` evaluated but only one fires per day | 🟢 Medium |
| DB-09 | dbDump fails mid-collection | 3rd collection dump throws | `bgError` called; remaining collections skipped (promise chain breaks) | 🔴 Critical |
| DB-10 | googleBackupDb fails | Upload to Drive fails | `bgError` called; loop continues next day | 🟡 High |
| DB-11 | dd command fails | `sudo dd` returns error | `bgError(err, 'Loop allBackup')`; `googleBackupWhole` not called | 🔴 Critical |
| DB-12 | 15th of month | Neither date matches | Both `sdf` and `wdf` resolve immediately; no backup runs | 🟢 Medium |
| DB-13 | Disk full | `dd` write fails | Child_process rejects; error caught | 🟡 High |
| DB-14 | Google Drive quota exceeded | Upload fails | `bgError` called; local backup still exists on disk | 🟡 High |

---

## 8. checkStock

### Purpose

Monitors stock status changes (price alerts, threshold crossings). After 20:00 UTC, passes `newStr=true` to indicate end-of-day processing.

### Logic Flow

1. Guard: `CHECK_STOCK(ENV_TYPE)`.
2. Initial delay: `setTimeout(330000)` (5.5 minutes).
3. Inner function `checkS()`:
   a. Compute `now`.
   b. Concurrency guard: `currentCheckStock` sentinel, timeout = `PRICE_INTERVAL * (MAX_RETRY + 2)` = 600 × 12 = 7 200 s.
   c. Set `currentCheckStock = now`.
   d. Log `'checkStock'`.
   e. Determine `newStr`: `true` if `new Date().getHours() >= 20`, else `false`.
   f. `stockStatus(newStr)`.
   g. Reset `currentCheckStock = 0` on completion.
   h. Errors caught by `bgError(err, 'Loop checkStock')`.
4. Reschedule: `setTimeout(PRICE_INTERVAL * 1000)` (600 s = 10 min) → recurse.

### Invocation & Authentication

- **Signature**: `export const checkStock = () => { ... }`
- **Called from**: `file-server.js` at startup.
- **Feature flag**: `CHECK_STOCK(ENV_TYPE)` — Dev: `false`, Release: `true`.
- **Requires**: Stock data in DB; Yahoo Finance API for live prices.

### Returns & Side Effects

- **Return**: Never-resolving promise chain.
- **DB reads/writes**: `stock`, `stockUser` collections (status updates).
- **Redis cache**: Stock price data cached.
- **External API**: Yahoo Finance for live stock prices.
- **WebSocket**: Status change notifications via `sendWs`.
- **Discord**: Alerts forwarded via `handleError`/`sendWs`.

### Snapshot Testing Data

```js
{
  interval: 600,           // PRICE_INTERVAL
  initialDelay: 330000,    // ms (5.5 min)
  featureFlag: 'CHECK_STOCK',
  enabled: { dev: false, release: true },
  concurrencyGuard: 'currentCheckStock',
  guardTimeout: 7200       // 600 * 12
}

// stockStatus argument
stockStatus(true)   // after 20:00 UTC
stockStatus(false)  // before 20:00 UTC
```

### Test Scenarios

| ID | Scenario | Input/State | Expected Behavior | Priority |
|----|----------|-------------|-------------------|----------|
| CS-01 | Feature flag disabled | `CHECK_STOCK` returns `false` | Returns `undefined` | 🔴 Critical |
| CS-02 | Before 20:00 UTC | `getHours() === 15` | `stockStatus(false)` called | 🔴 Critical |
| CS-03 | After 20:00 UTC | `getHours() === 21` | `stockStatus(true)` called | 🔴 Critical |
| CS-04 | Exactly 20:00 UTC | `getHours() === 20` | `stockStatus(true)` — `>=` includes 20 | 🟡 High |
| CS-05 | Concurrency guard active | `currentCheckStock` set recently | Iteration skipped | 🔴 Critical |
| CS-06 | Stale concurrency lock | `currentCheckStock` > 7 200 s old | Guard allows re-entry | 🟡 High |
| CS-07 | stockStatus throws | Yahoo Finance API error | `bgError` called; `currentCheckStock` resets; loop continues | 🟡 High |
| CS-08 | No stocks in DB | Empty `stock` collection | `stockStatus` completes with no-op | 🟢 Medium |
| CS-09 | Redis cache miss | Price data not cached | API called; cache populated | 🟢 Medium |

---

## 9. rateCalculator

### Purpose

Calculates Bitfinex lending rates for all supported coins. Runs every 90 seconds.

### Logic Flow

1. Guard: `BITFINEX_LOAN(ENV_TYPE)`.
2. Initial delay: `setTimeout(60000)` (1 minute).
3. Inner function `calR()`:
   a. Compute `now`.
   b. Concurrency guard: `currentRateCalculator` sentinel, timeout = `RATE_INTERVAL * (MAX_RETRY + 2)` = 90 × 12 = 1 080 s.
   c. Set `currentRateCalculator = now`.
   d. `calRate(SUPPORT_COIN)` — calculate rates for all 12 supported coins.
   e. Reset `currentRateCalculator = 0` on completion.
   f. Errors caught by `bgError(err, 'Loop rate calculator')`.
4. Reschedule: `setTimeout(RATE_INTERVAL * 1000)` (90 s) → recurse.

### Invocation & Authentication

- **Signature**: `export const rateCalculator = () => { ... }`
- **Called from**: `file-server.js` at startup.
- **Feature flag**: `BITFINEX_LOAN(ENV_TYPE)` — Dev: `false`, Release: `true`.
- **Requires**: Bitfinex API credentials (BITFINEX_KEY, BITFINEX_SECRET).

### Returns & Side Effects

- **Return**: Never-resolving promise chain.
- **External API**: Bitfinex REST API for order book / lending data.
- **Redis cache**: Rate calculation results stored.
- **DB writes**: Rate data may be persisted.
- **WebSocket**: Error notifications on failure.

### Snapshot Testing Data

```js
{
  interval: 90,            // RATE_INTERVAL
  initialDelay: 60000,     // ms (1 min)
  featureFlag: 'BITFINEX_LOAN',
  enabled: { dev: false, release: true },
  concurrencyGuard: 'currentRateCalculator',
  guardTimeout: 1080       // 90 * 12
}

// SUPPORT_COIN array (12 coins)
['fUSD','fUST','fBTC','fETH','fLTC','fDOT','fSOL','fADA','fXRP','fTRX','fAVAX','fUNI']

// calRate call
calRate(['fUSD','fUST','fBTC','fETH','fLTC','fDOT','fSOL','fADA','fXRP','fTRX','fAVAX','fUNI'])
```

### Test Scenarios

| ID | Scenario | Input/State | Expected Behavior | Priority |
|----|----------|-------------|-------------------|----------|
| RC-01 | Feature flag disabled | `BITFINEX_LOAN` returns `false` | Returns `undefined` | 🔴 Critical |
| RC-02 | Happy path | Bitfinex API accessible | `calRate(SUPPORT_COIN)` processes all 12 coins | 🔴 Critical |
| RC-03 | Concurrency guard active | `currentRateCalculator` set recently | Iteration skipped | 🔴 Critical |
| RC-04 | Stale concurrency lock | Lock > 1 080 s | Guard allows re-entry | 🟡 High |
| RC-05 | Bitfinex API timeout | Network error | `bgError(err, 'Loop rate calculator')`; resets; loop continues | 🟡 High |
| RC-06 | Bitfinex rate limit | HTTP 429 | Error caught; retried next interval | 🟡 High |
| RC-07 | Partial coin failure | 1 of 12 coins fails within `calRate` | Depends on `calRate` internal handling | 🟢 Medium |
| RC-08 | High frequency validation | Verify 90 s interval is maintained | Timer created correctly | 🟢 Medium |

---

## 10. setUserOffer

### Purpose

Updates Bitfinex lending offers for all users with Bitfinex configuration. Includes special error recovery — resets the Bitfinex WebSocket connection on specific error types.

### Logic Flow

1. Guard: `BITFINEX_LOAN(ENV_TYPE)`.
2. Initial delay: `setTimeout(90000)` (1.5 minutes).
3. Define `checkUser(index, userlist)`: recursively processes each user via `setWsOffer(username, bitfinex, _id)`.
4. Inner function `setO()`:
   a. Compute `now`.
   b. Concurrency guard: `currentSetOffer` sentinel, timeout = `RATE_INTERVAL * (MAX_RETRY + 2)` = 1 080 s.
   c. Set `currentSetOffer = now`.
   d. Log `'setUserOffer'` and timestamp.
   e. `Mongo('find', USERDB, {bitfinex: {$exists: true}})` — find users with Bitfinex config.
   f. `checkUser(0, userlist)` — iterate and set offers.
   g. **Special error handling**:
      - If error message includes `'Maximum call stack size exceeded'`, `'socket hang up'`, or `'Order not found'`:
        - Send WS notification `'Loop set offer BFX reset {msg}'`.
        - Call `resetBFX()` (soft reset — reconnect).
      - All other errors:
        - Call `resetBFX(true)` (hard reset — full teardown).
        - Call `bgError(err, 'Loop set offer')`.
   h. Reset `currentSetOffer = 0`.
5. Reschedule: `setTimeout(RATE_INTERVAL * 1000)` (90 s) → recurse.

### Invocation & Authentication

- **Signature**: `export const setUserOffer = () => { ... }`
- **Called from**: `file-server.js` at startup.
- **Feature flag**: `BITFINEX_LOAN(ENV_TYPE)` — Dev: `false`, Release: `true`.
- **Requires**: Bitfinex API credentials; users must have `bitfinex` field in DB.

### Returns & Side Effects

- **Return**: Never-resolving promise chain.
- **DB reads**: `user` collection (query `{bitfinex: {$exists: true}}`).
- **External API**: Bitfinex WebSocket API for offer placement via `setWsOffer`.
- **WebSocket (internal)**: Notifications via `sendWs` on BFX reset.
- **Connection management**: `resetBFX()` (soft) or `resetBFX(true)` (hard) on specific errors.
- **Discord**: Error forwarded through `handleError` (non-recoverable errors only).

### Snapshot Testing Data

```js
{
  interval: 90,            // RATE_INTERVAL
  initialDelay: 90000,     // ms (1.5 min)
  featureFlag: 'BITFINEX_LOAN',
  enabled: { dev: false, release: true },
  concurrencyGuard: 'currentSetOffer',
  guardTimeout: 1080       // 90 * 12
}

// Mongo query
Mongo('find', 'user', { bitfinex: { $exists: true } })

// User shape
{ _id: ObjectId, username: 'trader1', bitfinex: { key: '...', secret: '...' } }

// Recoverable error messages (soft reset)
['Maximum call stack size exceeded', 'socket hang up', 'Order not found']
```

### Test Scenarios

| ID | Scenario | Input/State | Expected Behavior | Priority |
|----|----------|-------------|-------------------|----------|
| SO-01 | Feature flag disabled | `BITFINEX_LOAN` returns `false` | Returns `undefined` | 🔴 Critical |
| SO-02 | Happy path — multiple users | 3 users with `bitfinex` field | `setWsOffer` called sequentially for each user | 🔴 Critical |
| SO-03 | No Bitfinex users | DB query returns `[]` | `checkUser(0,[])` resolves immediately | 🟡 High |
| SO-04 | Concurrency guard active | `currentSetOffer` set recently | Iteration skipped | 🔴 Critical |
| SO-05 | Error: "Maximum call stack size exceeded" | `setWsOffer` throws stack overflow | WS notification sent; `resetBFX()` (soft) called; `bgError` NOT called | 🔴 Critical |
| SO-06 | Error: "socket hang up" | WebSocket connection drops | WS notification sent; `resetBFX()` (soft) called | 🔴 Critical |
| SO-07 | Error: "Order not found" | Stale order reference | WS notification sent; `resetBFX()` (soft) called | 🔴 Critical |
| SO-08 | Error: other (e.g., auth failure) | Invalid API key | `resetBFX(true)` (hard) called; `bgError` called | 🔴 Critical |
| SO-09 | Mid-user failure | User 2 of 3 fails | Error handler fires; remaining users skipped in that iteration | 🟡 High |
| SO-10 | Stale concurrency lock | Lock > 1 080 s | Guard allows re-entry | 🟡 High |
| SO-11 | MongoDB query failure | DB connection error | Error caught by outer `.then()` chain | 🟡 High |
| SO-12 | resetBFX itself throws | WebSocket teardown fails | Unhandled rejection risk — verify error propagation | 🟢 Medium |

---

## 11. filterBitfinex

### Purpose

Filters/cleans Bitfinex historical data by recalculating web-facing analytics for the `fUSD` trading pairs. Runs once every 24 hours.

### Logic Flow

1. Guard: `BITFINEX_FILTER(ENV_TYPE)`.
2. Initial delay: `setTimeout(150000)` (2.5 minutes).
3. Inner function `cW()`:
   a. `calWeb(SUPPORT_PAIR[FUSD_SYM])` — calculate web analytics for `fUSD` pairs.
      - `SUPPORT_PAIR['fUSD']` = `[tBTCUSD, tETHUSD, tLTCUSD, tDOTUSD, tSOLUSD, tADAUSD, tXRPUSD, tTRXUSD, tAVAXUSD, tUNIUSD]` (10 pairs).
   b. Errors caught by `bgError(err, 'Loop bitfinex filter')`.
   c. **No concurrency guard**.
4. Reschedule: `setTimeout(BACKUP_INTERVAL * 1000)` (86 400 s = 24 h) → recurse.

### Invocation & Authentication

- **Signature**: `export const filterBitfinex = () => { ... }`
- **Called from**: `file-server.js` at startup.
- **Feature flag**: `BITFINEX_FILTER(ENV_TYPE)` — Dev: `false`, Release: `true`.
- **Requires**: Bitfinex API access for candle/trade data.

### Returns & Side Effects

- **Return**: Never-resolving promise chain.
- **External API**: Bitfinex REST API for trading pair data.
- **DB writes**: Filtered analytics data stored.
- **Redis cache**: May update cached rate calculations.
- **WebSocket**: Error notifications on failure.

### Snapshot Testing Data

```js
{
  interval: 86400,         // BACKUP_INTERVAL
  initialDelay: 150000,    // ms (2.5 min)
  featureFlag: 'BITFINEX_FILTER',
  enabled: { dev: false, release: true },
  concurrencyGuard: null
}

// calWeb argument
calWeb(['tBTCUSD','tETHUSD','tLTCUSD','tDOTUSD','tSOLUSD','tADAUSD','tXRPUSD','tTRXUSD','tAVAXUSD','tUNIUSD'])
```

### Test Scenarios

| ID | Scenario | Input/State | Expected Behavior | Priority |
|----|----------|-------------|-------------------|----------|
| FB-01 | Feature flag disabled | `BITFINEX_FILTER` returns `false` | Returns `undefined` | 🔴 Critical |
| FB-02 | Happy path | Bitfinex API accessible | `calWeb` processes all 10 fUSD pairs | 🔴 Critical |
| FB-03 | Bitfinex API error | Network timeout | `bgError(err, 'Loop bitfinex filter')`; loop continues in 24 h | 🟡 High |
| FB-04 | No concurrency guard | Rapid double invocation | Both executions run — verify no data corruption | 🟡 High |
| FB-05 | Partial pair failure | 1 of 10 pairs fails within `calWeb` | Depends on `calWeb` internal error handling | 🟢 Medium |
| FB-06 | 24 h interval verified | After completion | Next run exactly 86 400 s later | 🟢 Medium |

---

## 12. usseInit

### Purpose

Initializes the US Stock Exchange real-time ticker connection via the TD Ameritrade API. Resets the connection on failure.

### Logic Flow

1. Guard: `USSE_TICKER(ENV_TYPE) && CHECK_STOCK(ENV_TYPE)` — **both** flags must be true.
2. Initial delay: `setTimeout(210000)` (3.5 minutes).
3. Inner function `setO()`:
   a. Compute `now`.
   b. Concurrency guard: `currentInitUsse` sentinel, timeout = `PRICE_INTERVAL * (MAX_RETRY + 2)` = 7 200 s.
   c. Set `currentInitUsse = now`.
   d. Log `'initUsse'` and timestamp.
   e. `usseTDInit()` — initialize TD Ameritrade WebSocket connection.
   f. On error: `resetTD()` (teardown TD connection) then `bgError(err, 'Loop usse init')`.
   g. Reset `currentInitUsse = 0`.
4. Reschedule: `setTimeout(PRICE_INTERVAL * 1000)` (600 s = 10 min) → recurse.

### Invocation & Authentication

- **Signature**: `export const usseInit = () => { ... }`
- **Called from**: `file-server.js` at startup.
- **Feature flags**: `USSE_TICKER(ENV_TYPE)` AND `CHECK_STOCK(ENV_TYPE)` — both Dev: `false`, Release: `true`.
- **Requires**: TD Ameritrade API credentials (TDAMERITRADE_KEY, TDAMERITRADE_SECRET), valid OAuth token.

### Returns & Side Effects

- **Return**: Never-resolving promise chain.
- **External API**: TD Ameritrade streaming API (WebSocket).
- **Connection management**: `resetTD()` on failure — tears down and prepares for reconnect.
- **WebSocket (internal)**: Error notifications via `sendWs`.
- **Discord**: Error forwarded through `handleError`.

### Snapshot Testing Data

```js
{
  interval: 600,           // PRICE_INTERVAL
  initialDelay: 210000,    // ms (3.5 min)
  featureFlags: ['USSE_TICKER', 'CHECK_STOCK'],  // both required
  enabled: { dev: false, release: true },
  concurrencyGuard: 'currentInitUsse',
  guardTimeout: 7200       // 600 * 12
}
```

### Test Scenarios

| ID | Scenario | Input/State | Expected Behavior | Priority |
|----|----------|-------------|-------------------|----------|
| UI-01 | Both flags disabled | `USSE_TICKER` or `CHECK_STOCK` returns `false` | Returns `undefined` | 🔴 Critical |
| UI-02 | Only USSE_TICKER enabled | `USSE_TICKER=true`, `CHECK_STOCK=false` | Returns `undefined` — both required | 🔴 Critical |
| UI-03 | Only CHECK_STOCK enabled | `USSE_TICKER=false`, `CHECK_STOCK=true` | Returns `undefined` | 🔴 Critical |
| UI-04 | Happy path | Both flags true; TD API accessible | `usseTDInit()` called; connection established | 🔴 Critical |
| UI-05 | Concurrency guard active | `currentInitUsse` set recently | Iteration skipped | 🟡 High |
| UI-06 | usseTDInit throws | OAuth token expired | `resetTD()` called; `bgError(err, 'Loop usse init')` | 🔴 Critical |
| UI-07 | resetTD itself throws | Teardown fails | Error may propagate — verify handling | 🟢 Medium |
| UI-08 | Stale concurrency lock | Lock > 7 200 s | Guard allows re-entry | 🟡 High |
| UI-09 | Reconnection cycle | Repeated failures | Each cycle: `usseTDInit` → `resetTD` → wait 600 s → retry | 🟡 High |

---

## 13. twseInit

### Purpose

Initializes the Taiwan Stock Exchange real-time ticker connection via the Shioaji Python bridge. Resets the connection on failure.

### Logic Flow

1. Guard: `TWSE_TICKER(ENV_TYPE) && CHECK_STOCK(ENV_TYPE)` — **both** flags must be true.
2. Initial delay: `setTimeout(270000)` (4.5 minutes).
3. Inner function `setO()`:
   a. Compute `now`.
   b. Concurrency guard: `currentInitTwse` sentinel, timeout = `PRICE_INTERVAL * (MAX_RETRY + 2)` = 7 200 s.
   c. Set `currentInitTwse = now`.
   d. Log `'initTwse'` and timestamp.
   e. `twseShioajiInit()` — initialize Shioaji Python bridge for TWSE.
   f. On error: `resetShioaji()` (teardown Shioaji) then `bgError(err, 'Loop twse init')`.
   g. Reset `currentInitTwse = 0`.
4. Reschedule: `setTimeout(PRICE_INTERVAL * 1000)` (600 s = 10 min) → recurse.

### Invocation & Authentication

- **Signature**: `export const twseInit = () => { ... }`
- **Called from**: `file-server.js` at startup.
- **Feature flags**: `TWSE_TICKER(ENV_TYPE)` AND `CHECK_STOCK(ENV_TYPE)` — both Dev: `false`, Release: `true`.
- **Requires**: Shioaji credentials (SHIOAJI_ID, SHIOAJI_PW, SHIOAJI_APIKEY), Python runtime.

### Returns & Side Effects

- **Return**: Never-resolving promise chain.
- **External API**: Shioaji real-time streaming (Python bridge → WebSocket).
- **Connection management**: `resetShioaji()` on failure.
- **WebSocket (internal)**: Error notifications via `sendWs`.
- **Discord**: Error forwarded through `handleError`.

### Snapshot Testing Data

```js
{
  interval: 600,           // PRICE_INTERVAL
  initialDelay: 270000,    // ms (4.5 min)
  featureFlags: ['TWSE_TICKER', 'CHECK_STOCK'],  // both required
  enabled: { dev: false, release: true },
  concurrencyGuard: 'currentInitTwse',
  guardTimeout: 7200       // 600 * 12
}
```

### Test Scenarios

| ID | Scenario | Input/State | Expected Behavior | Priority |
|----|----------|-------------|-------------------|----------|
| TI-01 | Both flags disabled | `TWSE_TICKER` or `CHECK_STOCK` returns `false` | Returns `undefined` | 🔴 Critical |
| TI-02 | Only TWSE_TICKER enabled | `TWSE_TICKER=true`, `CHECK_STOCK=false` | Returns `undefined` | 🔴 Critical |
| TI-03 | Only CHECK_STOCK enabled | `TWSE_TICKER=false`, `CHECK_STOCK=true` | Returns `undefined` | 🔴 Critical |
| TI-04 | Happy path | Both flags true; Shioaji accessible | `twseShioajiInit()` called; connection established | 🔴 Critical |
| TI-05 | Concurrency guard active | `currentInitTwse` set recently | Iteration skipped | 🟡 High |
| TI-06 | twseShioajiInit throws | Shioaji service down | `resetShioaji()` called; `bgError(err, 'Loop twse init')` | 🔴 Critical |
| TI-07 | resetShioaji itself throws | Python bridge crash | Error may propagate — verify handling | 🟢 Medium |
| TI-08 | Stale concurrency lock | Lock > 7 200 s | Guard allows re-entry | 🟡 High |
| TI-09 | Reconnection cycle | Repeated failures | Each cycle: `twseShioajiInit` → `resetShioaji` → wait 600 s → retry | 🟡 High |
| TI-10 | Python runtime missing | Shioaji bridge cannot spawn | Error caught; `resetShioaji` called; loop continues | 🟡 High |

---

## Summary Matrix

| Function | Feature Flag(s) | Interval | Initial Delay | Concurrency Guard | External APIs | DB Collections | Redis | WebSocket | Discord |
|----------|----------------|----------|---------------|-------------------|---------------|----------------|-------|-----------|---------|
| `autoUpload` | `AUTO_UPLOAD` | 3 600 s (1 h) | 360 000 ms (6 min) | `currentAutoUpload` | Google Drive | `user` (read) | — | Error only | Error only |
| `autoDownload` | `AUTO_DOWNLOAD` | 3 600 s (1 h) | 390 000 ms (6.5 min) | None | Google Drive | `user` (read) | — | Error only | Error only |
| `checkMedia` | `CHECK_MEDIA` | 7 200 s (2 h) | 420 000 ms (7 min) | `currentCheckMedia` | — | `storage` (r/w) | — | Error only | Error only |
| `updateStock` | `UPDATE_STOCK` | 3 600 s (1 h) | 450 000 ms (7.5 min) | None | Yahoo Finance | `stock` (read) | — | Error only | Error only |
| `updateStockList` | `UPDATE_STOCK` | 90 s | 540 000 ms (9 min) | `currentUpdateStockList` | Yahoo Finance | `stock` (r/w) | — | Error only | Error only |
| `filterStock` | `STOCK_FILTER` | 3 600 s (1 h) | 480 000 ms (8 min) | None | — | `stock` (r/w) | — | Error only | Error only |
| `dbBackup` | `DB_BACKUP` | 86 400 s (24 h) | 510 000 ms (8.5 min) | None | Google Drive | All 8 backup collections (read) | — | Success + Error | Error only |
| `checkStock` | `CHECK_STOCK` | 600 s (10 min) | 330 000 ms (5.5 min) | `currentCheckStock` | Yahoo Finance | `stock`, `stockUser` (r/w) | Price cache | Status alerts | Error only |
| `rateCalculator` | `BITFINEX_LOAN` | 90 s | 60 000 ms (1 min) | `currentRateCalculator` | Bitfinex REST | — | Rate data | Error only | Error only |
| `setUserOffer` | `BITFINEX_LOAN` | 90 s | 90 000 ms (1.5 min) | `currentSetOffer` | Bitfinex WS | `user` (read) | — | BFX reset + Error | Error only |
| `filterBitfinex` | `BITFINEX_FILTER` | 86 400 s (24 h) | 150 000 ms (2.5 min) | None | Bitfinex REST | Analytics (write) | May update | Error only | Error only |
| `usseInit` | `USSE_TICKER` + `CHECK_STOCK` | 600 s (10 min) | 210 000 ms (3.5 min) | `currentInitUsse` | TD Ameritrade WS | — | — | Error only | Error only |
| `twseInit` | `TWSE_TICKER` + `CHECK_STOCK` | 600 s (10 min) | 270 000 ms (4.5 min) | `currentInitTwse` | Shioaji (Python) | — | — | Error only | Error only |

### Startup Stagger Order (by initial delay)

| Order | Function | Delay | Offset |
|-------|----------|-------|--------|
| 1 | `rateCalculator` | 60 000 ms | 1.0 min |
| 2 | `setUserOffer` | 90 000 ms | 1.5 min |
| 3 | `filterBitfinex` | 150 000 ms | 2.5 min |
| 4 | `usseInit` | 210 000 ms | 3.5 min |
| 5 | `twseInit` | 270 000 ms | 4.5 min |
| 6 | `checkStock` | 330 000 ms | 5.5 min |
| 7 | `autoUpload` | 360 000 ms | 6.0 min |
| 8 | `autoDownload` | 390 000 ms | 6.5 min |
| 9 | `checkMedia` | 420 000 ms | 7.0 min |
| 10 | `updateStock` | 450 000 ms | 7.5 min |
| 11 | `filterStock` | 480 000 ms | 8.0 min |
| 12 | `dbBackup` | 510 000 ms | 8.5 min |
| 13 | `updateStockList` | 540 000 ms | 9.0 min |

### Cross-Cutting Test Concerns

| Concern | Description | Applicable Functions |
|---------|-------------|---------------------|
| **Startup stagger** | All 13 functions start with staggered delays (60 s – 540 s apart) to avoid thundering-herd | All |
| **Graceful shutdown** | Promise chains are infinite loops — verify process exit doesn't leave pending DB operations | All |
| **Environment isolation** | Dev mode disables all jobs (except `AUTO_UPLOAD` which is off in both) | All |
| **Error isolation** | One job's failure must not affect other jobs (separate promise chains) | All |
| **Timestamp-based guards** | `current*` sentinels use epoch seconds — test clock rollback/NTP jumps | 8 functions with guards |
| **Module-level state** | `stock_batch_list`, `current*` vars are module-level — test reset between test runs | `updateStock`, `updateStockList`, all guarded functions |
| **bgError side effects** | Both `sendWs` and `handleError` called — mock both in tests | All |
| **Typo in constant** | `MEDIA_INTERVAl` (lowercase 'l') — ensure import matches exactly | `checkMedia` |
