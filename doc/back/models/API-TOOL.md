# `api-tool.js` — Technical Documentation & QA Testing Strategy

> **Module**: `src/back/models/api-tool.js` (180 lines)
> **Role**: Concurrent HTTP fetch manager with rate-limiting, queuing, retry, and file-download support
> **Priority**: 🟡 High
> **Test File**: `src/back/models/__tests__/api-tool.test.js`
> **Framework**: Jest 27 (ESM) + mocked `node-fetch`, `fs`, `sendWs`

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Module-Level State](#2-module-level-state)
3. [Function: Default Export (Dispatcher)](#3-function-default-export-dispatcher)
4. [Function: `download`](#4-function-download)
5. [Function: `get`](#5-function-get)
6. [Function: `expire`](#6-function-expire)
7. [Function: `setLock`](#7-function-setlock)
8. [Function: `stopApi`](#8-function-stopapi)
9. [Function: `handle_err`](#9-function-handle_err)
10. [Dependency Map](#10-dependency-map)
11. [Global Test Setup & Mocking Strategy](#11-global-test-setup--mocking-strategy)

---

## 1. Module Overview

`api-tool.js` is a concurrency-controlled HTTP request engine used throughout the ANoMoPi backend. It wraps `node-fetch` with:

- **Rate limiting**: concurrent in-flight downloads capped by `API_LIMIT` (dev: 10, prod: 5).
- **Request queuing**: excess requests are pooled and drained as in-flight slots free up.
- **Automatic retry**: failed fetches retry up to `MAX_RETRY` (10) times with exponential back-off.
- **File download with integrity check**: streams response bodies to disk, validates `Content-Length` vs. file size.
- **Expiration watchdog**: queued items exceeding `API_EXPIRE` (86 400 s / 24 h) trigger forced drain.
- **Lock mechanism**: mutex via `setLock()` protects the pool from race conditions.

### Callers

| Caller | Invocation | Purpose |
|--------|------------|---------|
| `external-router.js` | `Api('stop')` | Halt all API operations |
| `external-router.js` | `Api('download', req.user, url, opts)` | Download external media |
| `external-router.js` | `Api('url', subtitles.link, opts)` | Fetch URL content (no user/save) |
| `stock-tool.js` | `Api('download', ...)` | Fetch stock data |
| `bitfinex-tool.js` | `Api('download', ...)` | Fetch crypto data |
| `external-tool.js` | `Api('download', ...)` | Fetch external content |

---

## 2. Module-Level State

| Variable | Type | Initial | Purpose |
|----------|------|---------|---------|
| `api_ing` | `number` | `0` | Count of in-flight downloads |
| `api_pool` | `Array<{name, args}>` | `[]` | FIFO queue of pending requests |
| `api_duration` | `number` | `0` | Epoch (seconds) of first queued item; used for expiration |
| `api_lock` | `boolean` | `false` | Mutex flag for pool operations |

> **Testing note**: These are module-scoped `let` bindings. Tests must either re-import the module per test (via `jest.resetModules()`) or invoke `stopApi()` to reset `api_ing`. `api_pool`, `api_duration`, and `api_lock` have no public reset; module re-import is the cleanest approach.

---

## 3. Function: Default Export (Dispatcher)

### Purpose

Central entry point that dispatches API operations by name. Manages concurrency by routing to either immediate execution or the overflow queue.

### Invocation & Signature

```js
import Api from '../models/api-tool.js';
Api(name: string, ...args: any[]): Promise<void | any>
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | `string` | ✅ | Operation name: `'stop'`, `'url'`, or `'download'` |
| `...args` | `any[]` | Depends | Forwarded to the target function |

### Logic Flow

```
START
│
├─ name === 'stop'
│   └─ return stopApi()
│
├─ name === 'url'
│   └─ return download(false, ...args)
│      (user=false → no file save, returns body content)
│
├─ name === 'download'
│   ├─ api_ing >= API_LIMIT?
│   │   ├─ YES → call expire(name, args) (queue it)
│   │   └─ NO  → api_ing++
│   │            call download(...args)
│   │              .catch → handle_err
│   │              .then  → get(rest)
│   └─ return Promise (resolves after 500 ms delay)
│
└─ default
    └─ return handleError(new HoError('unknown api'))
```

### Returns & Side Effects

| Case | Return Value | Side Effects |
|------|-------------|--------------|
| `'stop'` | `Promise<void>` | Resets `api_ing` to 0 |
| `'url'` | `Promise<string \| object>` | Network request; no file write |
| `'download'` (under limit) | `Promise<void>` (500 ms delay) | Increments `api_ing`, writes file, sends WebSocket on error |
| `'download'` (at limit) | `Promise<void>` (500 ms delay) | Pushes to `api_pool`, may trigger expiration drain |
| unknown name | `Promise.reject` via `handleError` | Logs error |

### Snapshot Testing Data

```js
// 'stop' call
Api('stop')
// Expected: api_ing === 0

// 'url' call
Api('url', 'https://example.com/data.json', { is_json: true })
// Expected: resolves with parsed JSON object

// 'download' call
Api('download', userObj, 'https://cdn.example.com/file.zip', {
  filePath: '/mnt/storage/file.zip',
  is_check: true,
  rest: ([pathname, filename]) => processFile(pathname, filename),
})
// Expected: file written to filePath, rest callback returned for chaining

// unknown name
Api('invalid')
// Expected: HoError('unknown api') thrown/rejected
```

### Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches

| # | Scenario | Branch | Expected Outcome |
|---|----------|--------|------------------|
| 1 | `name === 'stop'` | switch → `'stop'` | Calls `stopApi()`, resolves `undefined` |
| 2 | `name === 'url'` | switch → `'url'` | Calls `download(false, ...args)`, returns fetch result |
| 3 | `name === 'download'` and `api_ing < API_LIMIT` | switch → `'download'`, under limit | Increments `api_ing`, starts download immediately |
| 4 | `name === 'download'` and `api_ing >= API_LIMIT` | switch → `'download'`, at limit | Calls `expire()`, does NOT increment `api_ing` |
| 5 | `name === 'download'` and `api_ing === API_LIMIT - 1` | boundary | Last slot taken; next call should queue |
| 6 | `name` is unrecognized string | switch → `default` | `handleError(new HoError('unknown api'))` |
| 7 | `name` is `undefined` / `null` / `0` / `''` | switch → `default` | Falls through to default |

#### Edge Cases

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 8 | Called with no arguments `Api()` | `name` is `undefined`, hits default |
| 9 | `'download'` with empty `args` | `download()` called with no user/url — should error in download |
| 10 | Rapid sequential `'download'` calls exceeding limit | First N fill slots, remainder queued |
| 11 | `'download'` error in `download()` propagates to `handle_err` | WebSocket notification sent to user |
| 12 | The 500 ms delay promise resolves independently of download completion | Caller does not await the download result |

#### Error Handling

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 13 | `expire()` throws during queuing | `.catch(err => handleError(err, 'Api'))` logs it |
| 14 | `download()` rejects and `handle_err` is invoked | Error logged, WebSocket sent with `Api fail: <message>` |
| 15 | `get()` throws after download completes | Caught by outer `.catch(err => handleError(err, 'Api'))` |

---

## 4. Function: `download`

### Purpose

Core HTTP fetch function. Supports GET/POST, file streaming, JSON parsing, buffer-to-string conversion, integrity checking, Big5 encoding, custom headers (referer, cookie, fake IP, user agent), and automatic retry with exponential back-off.

### Invocation & Signature

```js
function download(
  user,                // false | { username: string } — false for URL mode, user object for file download
  url,                 // string — target URL
  {
    filePath   = null, // string | null — destination path for file writes
    is_check   = true, // boolean — validate Content-Length vs. file size
    referer    = null, // string | null — Referer header
    is_json    = false,// boolean — parse response as JSON
    post       = null, // object | null — POST body key-value pairs
    not_utf8   = false,// boolean — Big5-encode POST values
    cookie     = null, // string | null — Cookie header
    fake_ip    = null, // string | null — X-Forwarded-For / Client-IP
    rest       = null, // function | null — callback after successful download
    errHandle  = null, // function | null — custom error handler
    is_dm5     = false,// boolean — add Accept-Language header for DM5 scraping
    timeout    = 0,    // number — fetch timeout in ms (0 = no timeout)
    agent      = false // object | false — custom User-Agent header object
  } = {}
): Promise<any>
```

### Logic Flow

```
START
│
├─ POST body processing
│   ├─ post !== null && not_utf8 → Big5-encode each value
│   └─ post !== null && !not_utf8 → querystring.stringify(post)
│
├─ Build temp file path: `${filePath}_t`
│
├─ Define checkTmp(): delete temp file if it exists
│
├─ proc() — the actual fetch wrapped in retry logic:
│   │
│   ├─ Fetch(utf8.encode(url), { headers, method, body, timeout })
│   │   Headers assembled conditionally:
│   │   ├─ referer       → { Referer }
│   │   ├─ !user && !agent → default Chrome User-Agent
│   │   ├─ !user && agent → custom agent object
│   │   ├─ cookie        → { Cookie }
│   │   ├─ qspost        → { Content-Type, Content-Length }
│   │   ├─ fake_ip       → { X-Forwarded-For, Client-IP }
│   │   └─ is_dm5        → { Accept-Language: 'en-US,...' }
│   │
│   ├─ .then(res =>
│   │   ├─ user is truthy (file download mode):
│   │   │   ├─ !filePath → handleError('file path empty!')
│   │   │   ├─ checkTmp() → pipe res.body → temp file
│   │   │   ├─ rename temp → filePath
│   │   │   ├─ is_check && content-length mismatch → handleError('incomplete download')
│   │   │   └─ rest callback → extract filename from Content-Disposition or URL pathname
│   │   │       return () => rest([pathname, filename])
│   │   │
│   │   ├─ !user && is_json:
│   │   │   └─ return res.json()
│   │   │
│   │   └─ !user && !is_json:
│   │       ├─ filePath → pipe to temp → rename to filePath
│   │       └─ !filePath → res.buffer() → bufferToString()
│   │   )
│   │
│   └─ .catch(err =>
│       ├─ err.code === 'HPE_INVALID_CONSTANT' → handleError (no retry)
│       ├─ ++index > MAX_RETRY → handleError('timeout', errHandle)
│       └─ else → setTimeout(() => proc(), index * 1000)  [retry]
│       )
│
└─ return proc()   ← starts the first attempt
```

### Returns & Side Effects

| Mode | Condition | Return Value | Side Effects |
|------|-----------|-------------|--------------|
| File download | `user` truthy, `filePath` set | `undefined` or `() => rest(...)` thunk | Writes file to `filePath`, deletes temp file |
| File download | `user` truthy, no `filePath` | Rejects via `handleError` | None |
| URL + JSON | `user` falsy, `is_json` true | Parsed JSON object | Network I/O only |
| URL + file | `user` falsy, `filePath` set | `undefined` | Writes file to `filePath` |
| URL + buffer | `user` falsy, no `filePath`, no `is_json` | String (decoded buffer) | Network I/O only |
| Retry | Fetch error, index ≤ MAX_RETRY | Recursive `proc()` result | Logs error, delays `index * 1000` ms |
| Max retry exceeded | index > MAX_RETRY | Rejects via `handleError('timeout')` | Logs URL |
| HPE_INVALID_CONSTANT | Specific HTTP parse error | Rejects immediately | No retry |

### Snapshot Testing Data

```js
// File download mode — successful
download(
  { username: 'admin' },
  'https://cdn.example.com/video.mp4',
  {
    filePath: '/mnt/storage/video.mp4',
    is_check: true,
    rest: ([pathname, filename]) => Promise.resolve({ pathname, filename }),
  }
)
// Expected: /mnt/storage/video.mp4 written, rest thunk returned

// URL mode — JSON response
download(false, 'https://api.example.com/data', { is_json: true })
// Expected: { key: 'value', ... } parsed JSON

// URL mode — buffer to string
download(false, 'https://example.com/page.html', {})
// Expected: "<html>..." string

// POST with Big5 encoding
download(false, 'https://tw.example.com/search', {
  post: { query: '中文搜尋' },
  not_utf8: true,
})
// Expected: POST body Big5-encoded, response as string

// Fetch response headers for Content-Disposition
{
  'content-disposition': 'attachment; filename="report.pdf"',
  'content-length': '204800',
}
// Expected filename extraction: 'report.pdf'
```

### Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches — POST Body Processing

| # | Scenario | Branch | Expected Outcome |
|---|----------|--------|------------------|
| 1 | `post` is `null` | No POST processing | `qspost` remains `null`, GET request |
| 2 | `post` provided, `not_utf8` false | `QStringify(post)` | Standard URL-encoded body |
| 3 | `post` provided, `not_utf8` true | Big5 manual encode loop | Each value passed through `big5Encode()` |
| 4 | `post` with single key-value | `not_utf8` true, first iteration | `qspost` built from scratch (no `&` prefix) |
| 5 | `post` with multiple key-values | `not_utf8` true, subsequent iterations | `qspost` concatenated with `&` separator |

#### Logical Branches — Header Assembly

| # | Scenario | Branch | Expected Outcome |
|---|----------|--------|------------------|
| 6 | `referer` provided | Header includes `Referer` | `{ Referer: referer }` merged |
| 7 | `referer` is `null` | No Referer header | Empty object merged |
| 8 | `user` falsy, `agent` falsy | Default Chrome UA | `User-Agent: 'Mozilla/5.0 ...'` |
| 9 | `user` falsy, `agent` truthy | Custom agent | Agent object spread into headers |
| 10 | `user` truthy | No User-Agent | Empty object merged for UA slot |
| 11 | `cookie` provided | Cookie header | `{ Cookie: cookie }` merged |
| 12 | `qspost` truthy | Content-Type + Content-Length | Form-urlencoded headers added |
| 13 | `fake_ip` provided | X-Forwarded-For + Client-IP | Both headers set to `fake_ip` |
| 14 | `is_dm5` true | Accept-Language header | `'en-US,en;q=0.9'` added |
| 15 | `timeout` > 0 | Timeout in fetch options | `{ timeout }` merged |
| 16 | `timeout` is 0 | No timeout | Empty object merged |
| 17 | `post` truthy | POST method | `{ method: 'POST', body: qspost }` merged |

#### Logical Branches — Response Handling (user truthy)

| # | Scenario | Branch | Expected Outcome |
|---|----------|--------|------------------|
| 18 | `user` truthy, `filePath` is `null` | Missing path | `handleError('file path empty!', errHandle)` |
| 19 | `user` truthy, `filePath` set, temp file exists | `checkTmp()` deletes temp | `FsUnlink` called before download |
| 20 | `user` truthy, `filePath` set, no temp file | `checkTmp()` no-op | Download proceeds directly |
| 21 | File piped successfully | `dest.on('finish')` | Resolves, renames temp → filePath |
| 22 | File pipe error | `dest.on('error')` | Rejects with pipe error |
| 23 | `is_check` true, `content-length` matches file size | Integrity pass | No error raised |
| 24 | `is_check` true, `content-length` does NOT match file size | Integrity fail | `handleError('incomplete download', errHandle)` |
| 25 | `is_check` true, no `content-length` header | Missing header treated as mismatch | `handleError('incomplete download', errHandle)` |
| 26 | `is_check` false | Skip integrity check | No size comparison |
| 27 | `rest` callback provided, `content-disposition` header present | Filename extracted from header | `rest([pathname, filename])` called |
| 28 | `rest` callback provided, no `content-disposition` | Fallback to URL pathname | `rest([pathname, PathBasename(pathname)])` called |
| 29 | `rest` callback provided, `_headers['content-disposition']` fallback | Legacy header format | Filename extracted from `_headers` array |
| 30 | `rest` is `null` | No post-download action | Returns `undefined` from inner `.then()` |
| 31 | `rest` callback throws | Error in rest execution | Caught by `errHandle` in rest's `.catch()` |

#### Logical Branches — Response Handling (user falsy)

| # | Scenario | Branch | Expected Outcome |
|---|----------|--------|------------------|
| 32 | `is_json` true | JSON parse | `res.json()` returned |
| 33 | `is_json` false, `filePath` provided | File write (no integrity check) | Pipe to temp → rename |
| 34 | `is_json` false, `filePath` is `null` | Buffer to string | `res.buffer()` → `bufferToString()` |

#### Logical Branches — Retry / Error Handling

| # | Scenario | Branch | Expected Outcome |
|---|----------|--------|------------------|
| 35 | Fetch error with `code === 'HPE_INVALID_CONSTANT'` | Immediate failure | `handleError(err)` — no retry |
| 36 | Fetch error, `index` ≤ `MAX_RETRY` (10) | Retry with back-off | `setTimeout(proc, index * 1000)` |
| 37 | Fetch error, `index` > `MAX_RETRY` | Max retries exceeded | `handleError('timeout', errHandle)` |
| 38 | First attempt succeeds | `index === 0` | No retry path entered |
| 39 | Succeeds on 2nd attempt after 1 failure | `index === 1` after retry | 1 s delay then success |
| 40 | Succeeds on 10th attempt (boundary) | `index === 10` | Last allowed retry succeeds |
| 41 | Fails on 11th attempt (boundary) | `index === 11 > MAX_RETRY` | Timeout error |
| 42 | `errHandle` is a function | Custom error handler | Error routed to `errHandle` |
| 43 | `errHandle` is `null` | Default error handling | `handleError` logs and rejects |

#### Edge Cases

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 44 | URL contains non-ASCII characters | `utf8.encode(url)` normalizes before fetch |
| 45 | `filePath` with special characters | Temp file `${filePath}_t` path valid |
| 46 | Empty POST body `{}` | `QStringify({})` → `''`, Content-Length 0 |
| 47 | Very large file download (stream) | Pipe handles backpressure correctly |
| 48 | Network timeout (timeout > 0) | Fetch rejects, enters retry loop |
| 49 | `content-disposition` with quotes around filename | Regex captures filename without quotes |
| 50 | `content-disposition` without quotes around filename | Regex captures bare filename |
| 51 | URL with no pathname (root `/`) | `PathBasename('/')` → `''` |
| 52 | Concurrent `checkTmp()` + `FsUnlink` race | Sequential promise chain prevents race |

---

## 5. Function: `get`

### Purpose

Pool drainer. Decrements `api_ing`, executes an optional `rest` callback, and dequeues the next pending request from `api_pool`.

### Invocation & Signature

```js
function get(rest: function | null = null): Promise<void>
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `rest` | `function \| null` | No | Post-download callback thunk returned by `download()` |

### Logic Flow

```
START
│
├─ Reset api_duration = 0
│
├─ api_ing > 0 ? → api_ing--
│
├─ rest is a function ?
│   └─ YES → invoke rest().catch(handleError)
│
├─ api_pool.length > 0 ?
│   ├─ YES → splice first item from pool
│   │   ├─ fun.name === 'download'
│   │   │   └─ download(...fun.args).catch(handle_err).then(get)
│   │   └─ default → handleError('unknown api').then(get)
│   └─ NO → log 'empty', resolve
│
└─ return Promise.resolve()
```

### Returns & Side Effects

| Outcome | Return | Side Effects |
|---------|--------|--------------|
| Pool empty, no rest | `Promise<void>` | Decrements `api_ing`, resets `api_duration` |
| Pool has items | Chained `download → get` promise | Dequeues and starts next download |
| `rest` provided | `Promise<void>` | Executes rest callback (fire-and-forget) |

### Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches

| # | Scenario | Branch | Expected Outcome |
|---|----------|--------|------------------|
| 1 | `rest` is `null` (default) | Skip rest invocation | No callback executed |
| 2 | `rest` is a function | Invoke `rest()` | Callback called, errors caught |
| 3 | `rest` is a non-function truthy value (e.g., string) | `typeof rest === 'function'` false | Skip rest invocation |
| 4 | `api_ing > 0` | Decrement | `api_ing` reduced by 1 |
| 5 | `api_ing === 0` | No decrement | `api_ing` stays 0 (no underflow) |
| 6 | `api_pool` has one item with `name === 'download'` | Dequeue + download | Pool becomes empty, download starts |
| 7 | `api_pool` has one item with unknown `name` | Dequeue + handleError | Error logged, then `get()` recurses |
| 8 | `api_pool` is empty | No dequeue | Resolves immediately |
| 9 | `api_pool` has multiple items | Processes one per call | Only first item dequeued; chained `get()` processes rest |
| 10 | Spliced item is falsy (`undefined`) | `if (fun)` false | Falls through to empty resolve |

#### Edge Cases

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 11 | `rest()` throws synchronously | `.catch(err => handleError(...))` catches it |
| 12 | `rest()` returns a rejecting promise | `.catch` handler logs the error |
| 13 | `api_duration` was non-zero before call | Reset to 0 unconditionally |
| 14 | Recursive chain: pool has 5 items | Each `get()` drains one, chains to next |

---

## 6. Function: `expire`

### Purpose

Handles overflow requests when the concurrency limit is reached. Acquires a mutex lock, pushes the request into the pool, and checks whether the queue has exceeded the `API_EXPIRE` (24 h) threshold — if so, force-drains the oldest item.

### Invocation & Signature

```js
function expire(name: string, args: any[]): Promise<void>
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | `string` | ✅ | Operation name (currently always `'download'`) |
| `args` | `any[]` | ✅ | Arguments to forward when dequeued |

### Logic Flow

```
START
│
├─ setLock() → acquire mutex (waits via recursive setTimeout if locked)
│
├─ go === false ?
│   └─ YES → resolve immediately (lock was not acquired — defensive guard)
│
├─ Push { name, args } into api_pool
│
├─ now = Date.now() / 1000
│
├─ api_duration === 0 (falsy) ?
│   └─ YES → api_duration = now  (record first queue time)
│
├─ (now - api_duration) > API_EXPIRE (86400) ?
│   ├─ YES → api_duration = 0
│   │   ├─ api_pool.length > 0 ?
│   │   │   ├─ YES → splice first item
│   │   │   │   ├─ api_lock = false (release before long operation)
│   │   │   │   ├─ fun.name === 'download' → download(...).then(get)
│   │   │   │   └─ fun.name unknown → handleError.then(get)
│   │   │   └─ NO → fall through
│   │   └─ (note: lock released inside the splice block)
│   └─ NO → fall through
│
├─ api_lock = false  (release mutex)
│
└─ return Promise.resolve()
```

### Returns & Side Effects

| Outcome | Return | Side Effects |
|---------|--------|--------------|
| First overflow in session | `Promise<void>` | Sets `api_duration`, pushes to pool, releases lock |
| Within expiration window | `Promise<void>` | Pushes to pool only |
| Exceeds expiration window | `Promise<void>` | Resets duration, force-drains oldest item |

### Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches

| # | Scenario | Branch | Expected Outcome |
|---|----------|--------|------------------|
| 1 | `setLock()` returns `true` (go is truthy) | Normal path | Request queued |
| 2 | `go` is falsy (defensive) | Early return | Resolves immediately, nothing queued |
| 3 | `api_duration === 0` (first queue) | Set initial timestamp | `api_duration = now` |
| 4 | `api_duration !== 0`, within 24 h | No expiration trigger | Item queued, lock released |
| 5 | `api_duration !== 0`, exceeds 24 h | Expiration triggered | Oldest item force-drained |
| 6 | Expiration triggered, pool has items, `name === 'download'` | Drain download | `download()` called with spliced item's args |
| 7 | Expiration triggered, pool has items, unknown `name` | Drain unknown | `handleError('unknown api')` then `get()` |
| 8 | Expiration triggered, pool is empty after splice | No-op | Falls through, lock released |
| 9 | Expiration triggered, spliced item is falsy | `if (fun)` guard | Falls through |

#### Edge Cases

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 10 | Lock contention: two `expire()` calls at same time | First acquires lock, second waits 500 ms via `setLock()` recursion |
| 11 | `API_EXPIRE` exactly equals elapsed time | `>` not `>=`, so NOT expired |
| 12 | `api_duration` set to fractional seconds | Epoch math still correct |
| 13 | Lock released (`api_lock = false`) even on unrecognized name | Prevents deadlock |
| 14 | Force-drain sets `api_lock = false` before download | Allows other queue operations during download |

#### Error Handling

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 15 | `download()` fails during forced drain | `.catch(handle_err)` logs and notifies via WS |
| 16 | `setLock()` recursive timeout accumulation | Eventually resolves when lock freed |

---

## 7. Function: `setLock`

### Purpose

Simple recursive mutex. Returns a promise that resolves to `true` once the lock is acquired, polling every 500 ms if already locked.

### Invocation & Signature

```js
const setLock = (): Promise<true>
```

No parameters.

### Logic Flow

```
START
│
├─ api_lock === true ?
│   ├─ YES → setTimeout(500 ms) → resolve(setLock())  [recursive poll]
│   └─ NO  → api_lock = true → resolve(true)
│
└─ returns Promise<true>
```

### Returns & Side Effects

| Outcome | Return | Side Effects |
|---------|--------|--------------|
| Lock free | `Promise<true>` | Sets `api_lock = true` |
| Lock held | `Promise<true>` (delayed) | Waits 500 ms per poll until freed |

### Comprehensive Test Scenarios (100% Coverage)

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 1 | `api_lock` is `false` | Resolves immediately with `true`, sets lock |
| 2 | `api_lock` is `true`, freed after 500 ms | Resolves after one poll cycle |
| 3 | `api_lock` is `true`, freed after 2 s | Resolves after ~4 poll cycles |
| 4 | `api_lock` never freed (deadlock) | Infinite recursion — no timeout guard (known limitation) |
| 5 | Multiple concurrent `setLock()` calls | All eventually resolve; last one wins the lock |

---

## 8. Function: `stopApi`

### Purpose

Emergency stop — resets the in-flight counter to zero. Does **not** clear `api_pool`, `api_duration`, or `api_lock`.

### Invocation & Signature

```js
function stopApi(): Promise<void>
```

No parameters.

### Logic Flow

```
api_ing = 0
return Promise.resolve()
```

### Returns & Side Effects

| Outcome | Return | Side Effects |
|---------|--------|--------------|
| Always | `Promise<void>` | `api_ing` set to 0; pool/lock/duration unchanged |

### Comprehensive Test Scenarios (100% Coverage)

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 1 | `api_ing` was 5 | Becomes 0 |
| 2 | `api_ing` was 0 | Stays 0 |
| 3 | Called while downloads are in-flight | Counter reset; in-flight downloads continue to completion but `get()` may decrement below logical zero (guarded by `> 0` check) |
| 4 | Called while pool has items | Pool items remain — they will be drained when next `get()` runs |
| 5 | Called while lock is held | Lock not released — potential stale lock |

---

## 9. Function: `handle_err`

### Purpose

Error handler for download failures. Logs the error and notifies the requesting user via WebSocket.

### Invocation & Signature

```js
function handle_err(err: Error, user: { username: string }): void
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `err` | `Error` | ✅ | The caught error |
| `user` | `object` | ✅ | User object with `username` property |

### Logic Flow

```
handleError(err, 'Api')         ← log with 'Api' context
sendWs({
  type: user.username,          ← WebSocket channel = username
  data: `Api fail: ${err.message}`
}, 0)                           ← adultonly = 0 (public)
```

### Returns & Side Effects

| Outcome | Return | Side Effects |
|---------|--------|--------------|
| Always | `undefined` (no return) | Error logged; WebSocket message broadcast |

### Comprehensive Test Scenarios (100% Coverage)

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 1 | Normal error with message | `handleError` called with err + `'Api'`; WS sent with formatted message |
| 2 | Error with empty message | WS data = `'Api fail: undefined'` or `'Api fail: '` |
| 3 | `user` has `username` | WS `type` set to username string |
| 4 | `user` is `undefined` (caller passes wrong args) | `user.username` throws TypeError — unguarded |
| 5 | `sendWs` throws | Error propagates uncaught (no try/catch in `handle_err`) |

---

## 10. Dependency Map

```
api-tool.js
├── ver.js                    → ENV_TYPE (process.env)
├── config.js                 → API_LIMIT(env) → number (dev:10, prod:5)
├── constants.js              → API_EXPIRE (86400), MAX_RETRY (10)
├── node-fetch                → Fetch(url, options)
├── querystring               → stringify (QStringify)
├── fs                        → createWriteStream, statSync, unlink, existsSync, renameSync
├── path                      → basename
├── url                       → parse
├── utf8                      → encode
├── util/utility.js           → handleError, HoError, big5Encode, bufferToString
└── util/sendWs.js            → sendWs(data, adultonly)
```

---

## 11. Global Test Setup & Mocking Strategy

### Module Mocking (Jest)

```
jest.mock('node-fetch')             — Control HTTP responses, simulate errors
jest.mock('fs')                     — Stub file I/O (createWriteStream, statSync, etc.)
jest.mock('utf8')                   — Passthrough or verify encoding calls
jest.mock('../util/sendWs.js')      — Capture WebSocket notifications
jest.mock('../util/utility.js')     — Spy on handleError, HoError; stub big5Encode, bufferToString
jest.mock('../config.js')           — Control API_LIMIT return value
jest.mock('../constants.js')        — Control API_EXPIRE and MAX_RETRY
jest.mock('../../../ver.js')        — Provide test ENV_TYPE
```

### Timer Control

- Use `jest.useFakeTimers()` for:
  - The 500 ms dispatcher delay in the default export
  - The 500 ms polling in `setLock()`
  - The exponential back-off delays in `download()` retry (`index * 1000`)
  - The `API_EXPIRE` time comparison in `expire()`

### State Reset Strategy

- **Between tests**: Call `jest.resetModules()` and re-import the module to get fresh `api_ing`, `api_pool`, `api_duration`, `api_lock` values.
- **Alternative**: Use `Api('stop')` to reset `api_ing` and manually verify pool state via integration-style tests.

### Mock Factories

| Mock Target | Factory Purpose |
|-------------|----------------|
| `Fetch` response (file) | Return `{ body: ReadableStream, headers: Map }` with configurable `content-length`, `content-disposition` |
| `Fetch` response (JSON) | Return `{ json: () => Promise.resolve(data) }` |
| `Fetch` response (buffer) | Return `{ buffer: () => Promise.resolve(Buffer.from(...)) }` |
| `Fetch` error | Reject with `{ code: 'HPE_INVALID_CONSTANT' }` or generic `Error` |
| `FsCreateWriteStream` | Return `EventEmitter` with `pipe()` support, emit `finish` or `error` |
| `FsStatSync` | Return `{ size: N }` for integrity check assertions |
| User object | `{ username: 'testuser' }` |

### Coverage Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| **Statement** | 100% | All 180 lines reachable via described scenarios |
| **Branch** | 100% | Every `if/else`, `switch/case`, ternary documented |
| **Function** | 100% | All 7 functions (including default export) covered |
| **Line** | 100% | No dead code identified |

---

> **Reference**: This document follows the QA Testing Scope & Strategy defined in [OUTLINE.md §11](../../OUTLINE.md#11-qa-testing-scope--strategy). Test file should be placed at `src/back/models/__tests__/api-tool.test.js` per §11.8.
