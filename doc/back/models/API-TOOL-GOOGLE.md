# api-tool-google.js — QA Testing Strategy & Technical Documentation

> **Module**: `src/back/models/api-tool-google.js`
> **Project**: ANoMoPi (anomopi.com)
> **Role**: Google Drive API integration — OAuth, file upload/download, Gmail, YouTube data, automated backup
> **External Dependencies**: `googleapis`, `node-fetch`, `youtube-dl-exec`, `child_process`, `mkdirp`, `fs`
> **Internal Dependencies**: `mongo-tool.js`, `mediaHandle-tool.js`, `external-tool.js`, `utility.js`, `mime.js`, `sendWs.js`
> **Testing Approach**: Mock `googleapis`, `node-fetch`, `youtube-dl-exec`, `fs`, `child_process`, MongoDB, and WebSocket; per OUTLINE.md §11.4 (Phase 6)
> **Priority**: 🟡 High — External API integration with rate-limiting, retry logic, and file I/O side effects

---

## Table of Contents

1. [Module-Level State & Architecture](#1-module-level-state--architecture)
2. [`api()` — Default Export (Dispatcher)](#2-api--default-export-dispatcher)
3. [`setLock()` — Concurrency Mutex](#3-setlock--concurrency-mutex)
4. [`checkOauth()` / `setToken()` — OAuth Lifecycle](#4-checkoauth--settoken--oauth-lifecycle)
5. [`handle_err()` — Error Handler with WebSocket Notification](#5-handle_err--error-handler-with-websocket-notification)
6. [`get()` — Queue Consumer / Pool Drainer](#6-get--queue-consumer--pool-drainer)
7. [`expire()` — Rate-Limit Overflow Handler](#7-expire--rate-limit-overflow-handler)
8. [`stopApi()` — API Counter Reset](#8-stopapi--api-counter-reset)
9. [`sendMail()` — Gmail Kindle Attachment Sender](#9-sendmail--gmail-kindle-attachment-sender)
10. [`sendName()` — Gmail Plain-Text Email Sender](#10-sendname--gmail-plain-text-email-sender)
11. [`youtubeAPI()` — YouTube Data API Dispatcher](#11-youtubeapi--youtube-data-api-dispatcher)
12. [`upload()` — Google Drive File Upload](#12-upload--google-drive-file-upload)
13. [`list()` — Drive Folder Listing](#13-list--drive-folder-listing)
14. [`listFile()` — Drive File Listing](#14-listfile--drive-file-listing)
15. [`create()` — Drive Folder Creation](#15-create--drive-folder-creation)
16. [`download()` — Authenticated HTTP Download](#16-download--authenticated-http-download)
17. [`deleteFile()` — Drive File Trash](#17-deletefile--drive-file-trash)
18. [`getFile()` — Drive File Metadata Retrieval](#18-getfile--drive-file-metadata-retrieval)
19. [`copyFile()` — Drive File Copy](#19-copyfile--drive-file-copy)
20. [`moveParent()` — Drive File Re-parent](#20-moveparent--drive-file-re-parent)
21. [`downloadMedia()` — Drive Media Download via yt-dlp](#21-downloadmedia--drive-media-download-via-yt-dlp)
22. [`downloadPresent()` — Google Slides SVG Export](#22-downloadpresent--google-slides-svg-export)
23. [`downloadDoc()` — Google Docs ZIP Export](#23-downloaddoc--google-docs-zip-export)
24. [`googleBackup()` — Selective File Backup to Drive](#24-googlebackup--selective-file-backup-to-drive)
25. [`userDrive()` — Automated User Drive Sync](#25-userdrive--automated-user-drive-sync)
26. [`autoDoc()` — Scheduled Document Downloader](#26-autodoc--scheduled-document-downloader)
27. [`isApiing()` — Active API Check](#27-isapiing--active-api-check)
28. [`sendPresentName()` — Christmas Exchange Email](#28-sendpresentname--christmas-exchange-email)
29. [`sendLotteryName()` — Lottery Notification Email](#29-sendlotteryname--lottery-notification-email)
30. [`googleBackupWhole()` — Full System Backup Upload](#30-googlebackupwhole--full-system-backup-upload)
31. [`googleBackupDb()` — Database Collection Backup](#31-googlebackupdb--database-collection-backup)

---

## 1. Module-Level State & Architecture

### Shared Mutable State

| Variable | Type | Initial | Purpose |
|----------|------|---------|---------|
| `tokens` | `Object` | `{}` | Cached OAuth2 credentials (access_token, expiry_date) |
| `api_ing` | `Number` | `0` | Count of in-flight rate-limited API calls |
| `api_pool` | `Array` | `[]` | Queue of deferred API calls waiting for capacity |
| `api_duration` | `Number` | `0` | Timestamp of first queued item (expiration tracking) |
| `api_lock` | `Boolean` | `false` | Mutex flag for `expire()` critical section |
| `oauth2Client` | `OAuth2` | Constructed | Singleton Google OAuth2 client |

### Rate-Limiting Architecture

```
api(name, data)
  ├─ api_ing < API_LIMIT?
  │    YES → api_ing++; execute immediately → get() on completion
  │    NO  → expire(name, data) → push to api_pool
  │           └─ If (now - api_duration) > API_EXPIRE → force dequeue one
  └─ get(rest) on completion
       ├─ api_ing--
       ├─ Invoke rest callback if provided
       └─ Dequeue next from api_pool if non-empty
```

### Snapshot: Module State

```js
// Idle state
{ tokens: { access_token: 'ya29.xxx', expiry_date: 1700000000000 }, api_ing: 0, api_pool: [], api_duration: 0, api_lock: false }

// Under load
{ tokens: { access_token: 'ya29.xxx', expiry_date: 1700000000000 }, api_ing: 3, api_pool: [{ name: 'upload', data: {...} }, { name: 'download', data: {...} }], api_duration: 1699999500, api_lock: false }
```

---

## 2. `api()` — Default Export (Dispatcher)

### Purpose
Central entry point for all Google API operations. Routes by operation name, enforces OAuth validity, and applies rate limiting for long-running operations (upload, download variants).

### Invocation & Authentication
```js
import api from '../models/api-tool-google.js';
api(name: string, data: object): Promise<any>
```
- Called by routers, background jobs, and other models
- OAuth is validated/refreshed on every call via `checkOauth()`

### Logic Flow
1. Call `checkOauth()` to ensure valid credentials
2. If `name` starts with `"y "` → delegate to `youtubeAPI(name, data)`
3. Switch on `name`:
   - `'stop'` → `stopApi()`
   - `'list folder'` → `list(data)`
   - `'list file'` → `listFile(data)`
   - `'create'` → `create(data)`
   - `'delete'` → `deleteFile(data)`
   - `'get'` → `getFile(data)`
   - `'copy'` → `copyFile(data)`
   - `'move parent'` → `moveParent(data)`
   - `'send mail'` → `sendMail(data)`
   - `'send name'` → `sendName(data)`
   - `'upload'`, `'download'`, `'download media'`, `'download present'`, `'download doc'` → **rate-limited** path:
     - If `api_ing >= API_LIMIT` → `expire(name, data)` (queue)
     - Else → `api_ing++`; execute; chain `.then(get).catch(handleError)`
     - Return a 500ms delayed resolved promise (fire-and-forget)
   - `default` → `handleError(new HoError('unknown api'))`

### Returns & Side Effects
| Name Prefix | Returns | Side Effects |
|-------------|---------|-------------|
| Non-rate-limited ops | Promise resolved with API result | OAuth refresh if near expiry; DB update of tokens |
| Rate-limited ops | Promise resolving after ~500ms (void) | Async background execution; `api_ing` incremented; WebSocket error notifications on failure |
| Unknown name | Rejected promise via `handleError` | Error logged |

### Comprehensive Test Scenarios

#### Logical Branches
| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | YouTube method routing | `name='y search'` | Delegates to `youtubeAPI` |
| 2 | Each direct switch case | `name='list folder'` through `'send name'` | Correct function invoked |
| 3 | Rate-limited op below limit | `name='upload'`, `api_ing=0` | `api_ing` incremented, `upload()` called |
| 4 | Rate-limited op at limit | `name='upload'`, `api_ing=API_LIMIT` | `expire()` called, `api_ing` unchanged |
| 5 | Unknown API name | `name='nonexistent'` | `HoError('unknown api')` |
| 6 | All 5 rate-limited operations | `upload/download/download media/download present/download doc` | Each dispatches correct internal function |

#### Edge Cases
| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 7 | Empty name string | `name=''` | Falls to default → error |
| 8 | Name with `'y '` prefix but invalid method | `name='y invalid'` | Routed to `youtubeAPI`, error from its default case |
| 9 | `null` / `undefined` data | Various names with `data=null` | Downstream param validation errors |
| 10 | Concurrent calls racing on `api_ing` | Multiple simultaneous calls | `api_ing` increments/decrements correctly |

#### Error Handling
| # | Scenario | Expected |
|---|----------|----------|
| 11 | `checkOauth()` fails (no token in DB) | Promise rejected before dispatch |
| 12 | Rate-limited op throws in handler | `handle_err` called → WebSocket notification sent, then `get()` for cleanup |
| 13 | Fire-and-forget error in upload/download | Error caught by `.catch(handleError)` — does not propagate to caller |

---

## 3. `setLock()` — Concurrency Mutex

### Purpose
Busy-wait spinlock for protecting `api_pool` mutations inside `expire()`.

### Invocation & Authentication
```js
setLock(): Promise<true>
```
Internal only. No auth required.

### Logic Flow
1. Log current `api_lock` value
2. If `api_lock === true` → wait 500ms, recurse
3. If `api_lock === false` → set `api_lock = true`, resolve with `true`

### Returns & Side Effects
- Returns `Promise<true>` when lock acquired
- Sets `api_lock = true` as side effect
- Caller MUST set `api_lock = false` when done

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Lock free | Immediately resolves `true`, `api_lock` becomes `true` |
| 2 | Lock held, released after 1 cycle | Waits ~500ms, then resolves `true` |
| 3 | Lock held for extended period | Recursively polls every 500ms until released |
| 4 | Starvation scenario (lock never released) | Infinite recursion — potential stack issue (edge case to document) |

---

## 4. `checkOauth()` / `setToken()` — OAuth Lifecycle

### Purpose
Ensure valid Google OAuth2 credentials before every API call. Load from MongoDB on first use, refresh when within 10 minutes of expiry.

### Invocation & Authentication
```js
checkOauth(): Promise<void>  // Internal
setToken(): Promise<void>    // Internal
```

### Logic Flow — `checkOauth()`
1. If `tokens.access_token` is falsy OR `tokens.expiry_date` is falsy:
   - Query MongoDB: `Mongo('find', 'accessToken', {api: 'google'}, {limit: 1})`
   - If no token found → `handleError('can not find token')`
   - Else → cache in `tokens`, fall through to `setToken()`
2. Else → call `setToken()` directly

### Logic Flow — `setToken()`
1. Set credentials on `oauth2Client`
2. If `tokens.expiry_date < (Date.now() + 600000)` (within 10 min of expiry):
   - Call `oauth2Client.refreshAccessToken()`
   - Update MongoDB: `Mongo('update', 'accessToken', {api: 'google'}, {$set: token})`
   - Update local `tokens` cache
   - Reset credentials on `oauth2Client`
3. Else → resolve immediately

### Returns & Side Effects
- **DB reads**: `accessToken` collection queried on cold start
- **DB writes**: `accessToken` collection updated on token refresh
- **State mutation**: `tokens` object updated; `oauth2Client` credentials set

### Snapshot Testing Data

```js
// MongoDB accessToken document
{
  _id: ObjectId("..."),
  api: "google",
  access_token: "ya29.a0AfH6SMCX...",
  refresh_token: "1//0dx...",
  expiry_date: 1700000000000,
  token_type: "Bearer",
  scope: "https://www.googleapis.com/auth/drive ..."
}
```

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Cold start — tokens empty, DB has valid token | Load from DB, set credentials |
| 2 | Cold start — tokens empty, DB empty | `HoError('can not find token')` |
| 3 | Warm cache — token valid (>10 min to expiry) | No DB call, resolve immediately |
| 4 | Warm cache — token near expiry (<10 min) | Refresh via OAuth2, update DB, update cache |
| 5 | Refresh fails (Google API error) | Promise rejected with refresh error |
| 6 | DB update fails during refresh | Promise rejected with DB error |
| 7 | Race condition — multiple concurrent `checkOauth()` calls | All should see consistent `tokens` state |
| 8 | Token exactly at 600000ms boundary | Should trigger refresh (boundary condition) |

---

## 5. `handle_err()` — Error Handler with WebSocket Notification

### Purpose
Log error and notify user via WebSocket when a background Google API operation fails.

### Invocation & Authentication
```js
handle_err(err: Error, user: { username: string }): void
```
Internal only. No return value.

### Logic Flow
1. Call `handleError(err, 'Google api')` for logging
2. Send WebSocket message: `{ type: user.username, data: 'Google api fail: {message}' }` with security level `0`

### Returns & Side Effects
- No return value (implicitly `undefined`)
- Logs error
- Sends WebSocket broadcast

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Standard error with user | Error logged, WS sent with username |
| 2 | Error with missing `user.username` | WS sent with `undefined` type |
| 3 | Error with no message | WS data contains `'Google api fail: undefined'` |
| 4 | `sendWs` throws | Unhandled — verify behavior |

---

## 6. `get()` — Queue Consumer / Pool Drainer

### Purpose
Called after each rate-limited operation completes. Decrements the active counter, invokes optional rest callback, and dequeues the next waiting operation from `api_pool`.

### Invocation & Authentication
```js
get(rest?: Function | null): Promise<void>
```
Internal only.

### Logic Flow
1. Reset `api_duration` to `0`
2. If `api_ing > 0` → decrement `api_ing`
3. If `rest` is a function → invoke `rest()` (catch errors)
4. If `api_pool.length > 0`:
   - Splice first item from pool
   - If item exists, switch on `fun.name` → call corresponding function → chain `.then(get)`
   - Unknown name → `handleError` → chain `.then(get)`
5. If pool is empty → resolve

### Returns & Side Effects
- Resets `api_duration`
- Decrements `api_ing`
- Dequeues and executes next pool item
- Invokes `rest` callback for post-processing

### Snapshot Testing Data

```js
// Pool item structure
{ name: 'upload', data: { type: 'media', name: 'file.mp4', filePath: '/tmp/file.mp4', user: { username: 'admin' } } }
```

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | `rest=null`, empty pool | `api_ing` decremented, resolve |
| 2 | `rest` is a function | Callback invoked, pool drained |
| 3 | `rest` callback throws | Error caught, does not break pool drain |
| 4 | Pool has `upload` item | `upload()` called with pool item data |
| 5 | Pool has `download` item | `download()` called |
| 6 | Pool has `download media` item | `downloadMedia()` called |
| 7 | Pool has `download present` item | `downloadPresent()` called |
| 8 | Pool has `download doc` item | `downloadDoc()` called |
| 9 | Pool has unknown name | `handleError` called, pool continues draining |
| 10 | Pool item is `undefined`/falsy after splice | Skip, log "empty google" |
| 11 | `api_ing` already `0` | Does not go negative |
| 12 | Multiple items in pool | Drains sequentially via recursive `.then(get)` |

---

## 7. `expire()` — Rate-Limit Overflow Handler

### Purpose
Queue operations that exceed the rate limit. If queue has been stalled beyond `API_EXPIRE` seconds, force-dequeue one operation.

### Invocation & Authentication
```js
expire(name: string, data: object): Promise<void>
```
Internal only.

### Logic Flow
1. Acquire lock via `setLock()`
2. If lock returns falsy → resolve (guard, though `setLock` always returns `true`)
3. Push `{ name, data }` to `api_pool`
4. Check time:
   - If `api_duration === 0` → set `api_duration = now`
   - Else if `(now - api_duration) > API_EXPIRE`:
     - Reset `api_duration`
     - Dequeue first pool item
     - Release lock (`api_lock = false`)
     - Execute dequeued item (same switch as `get()`)
     - Return
5. Release lock (`api_lock = false`)
6. Resolve

### Returns & Side Effects
- Mutates `api_pool`, `api_duration`, `api_lock`
- May trigger immediate execution of a dequeued item

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | First overflow (pool was empty) | Item pushed, `api_duration` set to now |
| 2 | Subsequent overflow within `API_EXPIRE` | Item pushed, `api_duration` unchanged |
| 3 | Overflow after `API_EXPIRE` elapsed | Force-dequeue; first pool item executed |
| 4 | Force-dequeue with `upload` name | `upload()` invoked |
| 5 | Force-dequeue with `download` name | `download()` invoked |
| 6 | Force-dequeue with unknown name | `handleError` called |
| 7 | Force-dequeue when pool item is falsy | No execution, lock released |
| 8 | Lock contention — two expire() calls | Second waits for first to release lock |
| 9 | Lock released in both normal and force-dequeue paths | `api_lock === false` after completion |

---

## 8. `stopApi()` — API Counter Reset

### Purpose
Emergency reset of the active API counter to `0`.

### Invocation & Authentication
```js
// Via dispatcher
api('stop', {})
```

### Logic Flow
1. Set `api_ing = 0`
2. Resolve immediately

### Returns & Side Effects
- Returns `Promise<void>`
- Resets `api_ing` to `0`
- Does NOT drain `api_pool` — queued items remain

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Normal stop | `api_ing` becomes `0` |
| 2 | Stop when `api_ing` already `0` | No-op, resolves |
| 3 | Stop while pool has items | Pool remains unchanged — verify stale pool behavior |

---

## 9. `sendMail()` — Gmail Kindle Attachment Sender

### Purpose
Send a file as an email attachment to a Kindle device via Gmail API, using RFC 2822 MIME multipart format.

### Invocation & Authentication
```js
// Via dispatcher
api('send mail', {
  name: 'book.mobi',           // Filename (must be Kindle-compatible format)
  filePath: '/mnt/tmp/book.mobi', // Absolute path to file
  kindle: 'user@kindle.com'    // Kindle email address
})
```
Requires valid OAuth2 Gmail scope.

### Logic Flow
1. Validate required fields: `name`, `filePath`, `kindle`
2. Validate Kindle format via `isKindle(name)`
3. Verify file exists via `FsExistsSync(filePath)`
4. Verify file size ≤ `KINDLE_LIMIT`
5. Write MIME headers to temp file (`NAS_TMP/kindle{timestamp}`)
6. Stream file content (base64-encoded) appended to temp file
7. Send via `gmail.users.messages.send()` with `message/rfc822` media type
8. Delete temp file

### Returns & Side Effects
- Returns `Promise<void>` on success
- **Filesystem**: Creates and deletes temp file in `NAS_TMP`
- **Network**: Sends email via Gmail API
- Ignores `ECONNRESET` errors from Gmail (treated as success)

### Snapshot Testing Data

```js
// Input
{ name: 'novel.epub', filePath: '/mnt/tmp/novel.epub', kindle: 'user_12345@kindle.com' }

// Temp file content (headers portion)
'Content-Type: multipart/mixed; boundary="foo_bar_baz"\r\n' +
'MIME-Version: 1.0\r\n' +
'From: me\r\n' +
'To: user_12345@kindle.com\r\n' +
'Subject: Kindle\r\n\r\n' +
'--foo_bar_baz\r\n...'
```

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Valid Kindle file within size limit | Email sent, temp file deleted |
| 2 | Missing `name` | `HoError('mail parameter lost!!!')` |
| 3 | Missing `filePath` | `HoError('mail parameter lost!!!')` |
| 4 | Missing `kindle` | `HoError('mail parameter lost!!!')` |
| 5 | Non-Kindle format (e.g., `.mp4`) | `HoError('Unsupported kindle format!!!')` |
| 6 | File does not exist | `HoError('file not exist!!!')` |
| 7 | File exceeds `KINDLE_LIMIT` | `HoError('file too large!!!')` |
| 8 | Gmail API returns `ECONNRESET` | Treated as success (resolve) |
| 9 | Gmail API returns other error | Promise rejected |
| 10 | Temp file write fails | Promise rejected from `FsWriteFile` |
| 11 | Stream pipe error | Rejected via `dest.on('error')` |
| 12 | Temp file unlink fails | Promise rejected |

---

## 10. `sendName()` — Gmail Plain-Text Email Sender

### Purpose
Send a plain-text email with base64-decoded body and UTF-8 encoded subject via Gmail API.

### Invocation & Authentication
```js
api('send name', {
  text: 'base64EncodedContent',  // Base64-encoded body text
  mail: 'recipient@example.com', // Destination email
  title: 'Subject Line',         // Email subject
  append: 'optional suffix'      // Optional subject/body suffix
})
```

### Logic Flow
1. Validate `text`, `mail`, `title` exist
2. Validate `mail` is valid email via `isValidString(mail, 'email')`
3. Construct `name` = decoded text (± append)
4. Construct `subject` = title (± append)
5. Send via `gmail.users.messages.send()` with inline RFC 2822 body
6. Subject encoded as `=?utf-8?B?{base64}?=` for Unicode support

### Returns & Side Effects
- Returns `Promise<void>`
- **Network**: Sends email via Gmail API
- Ignores `ECONNRESET` errors

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Valid params without `append` | Email sent with title as subject |
| 2 | Valid params with `append` | Subject = `"title append"`, body includes append |
| 3 | Missing `text` | `HoError('mail parameter lost!!!')` |
| 4 | Missing `mail` | `HoError('mail parameter lost!!!')` |
| 5 | Missing `title` | `HoError('mail parameter lost!!!')` |
| 6 | Invalid email format | `HoError('invalid email!!!')` |
| 7 | Unicode subject characters | Properly base64-encoded in `=?utf-8?B?...?=` |
| 8 | Gmail `ECONNRESET` | Treated as success |
| 9 | Gmail other error | Promise rejected |

---

## 11. `youtubeAPI()` — YouTube Data API Dispatcher

### Purpose
Interface to YouTube Data API v3 for search, video metadata, channel info, playlist info, and playlist items.

### Invocation & Authentication
```js
api('y search', data)    // YouTube search
api('y video', data)     // Video details
api('y channel', data)   // Channel info
api('y playlist', data)  // Playlist details
api('y playItem', data)  // Playlist items
```

### Logic Flow — `y search`
1. Validate `order`, `maxResults`, `type` required
2. If `id_arr` exists and length > 20 → `maxResults = 0`; else subtract length
3. Map `type` integer to string: `1|2` → `'video'`, `10|20` → `'playlist'`, default → `'video,playlist'`
4. Build search params (conditionally add `keyword`, `channelId`, `pageToken`)
5. Call `youtube.search.list()`
6. Parse results into `video_id` Set and `playlist_id` Set
7. Return `{ type, video: 'id1,id2', playlist: 'pl1,pl2', nextPageToken }`

### Logic Flow — `y video`
1. If no `data['id']` → return `[]`
2. Call `youtube.videos.list({ part: 'snippet,statistics', id })` → return `metadata.items`

### Logic Flow — `y channel`
1. If no `data['id']` → `HoError('channel parameter lost!!!')`
2. Call `youtube.channels.list({ part: 'snippet, brandingSettings', id })` → return full metadata

### Logic Flow — `y playlist`
1. If no `data['id']` → return `[]`
2. Call `youtube.playlists.list({ part: 'snippet', id })` → return `metadata.items`

### Logic Flow — `y playItem`
1. If no `data['id']` → `HoError('playItem parameter lost!!!')`
2. Call `youtube.playlistItems.list()` with optional `pageToken`
3. Map items to `[{ id: 'you_{videoId}', index, showId }]`
4. Return `[items, totalResults, nextPageToken, prevPageToken]`

### Returns & Side Effects

| Sub-method | Returns |
|------------|---------|
| `y search` | `{ type, video, playlist, nextPageToken }` |
| `y video` | `Array<VideoItem>` or `[]` |
| `y channel` | YouTube channel metadata object |
| `y playlist` | `Array<PlaylistItem>` or `[]` |
| `y playItem` | `[items, totalResults, nextPageToken, prevPageToken]` |

### Snapshot Testing Data

```js
// y search result
{ type: 1, video: 'dQw4w9WgXcQ,9bZkp7q19f0', playlist: '', nextPageToken: 'CAUQAA' }

// y video item
[{ id: 'dQw4w9WgXcQ', snippet: { title: 'Video', channelTitle: 'Channel' }, statistics: { viewCount: '1000000' } }]

// y playItem result
[
  [{ id: 'you_abc123', index: 1, showId: 1 }, { id: 'you_def456', index: 2, showId: 2 }],
  50,
  'CDIQAA',
  undefined
]
```

### Comprehensive Test Scenarios

#### `y search`
| # | Scenario | Expected |
|---|----------|----------|
| 1 | Missing `order` | `HoError('search parameter lost!!!')` |
| 2 | Missing `maxResults` | `HoError('search parameter lost!!!')` |
| 3 | Missing `type` | `HoError('search parameter lost!!!')` |
| 4 | `type=1` (video) | Search type string = `'video'` |
| 5 | `type=2` (video) | Search type string = `'video'` |
| 6 | `type=10` (playlist) | Search type string = `'playlist'` |
| 7 | `type=20` (playlist) | Search type string = `'playlist'` |
| 8 | `type=0` (default) | Search type string = `'video,playlist'` |
| 9 | `id_arr` with > 20 items | `maxResults` set to `0` |
| 10 | `id_arr` with ≤ 20 items | `maxResults` reduced by array length |
| 11 | No `id_arr` | `maxResults` unchanged |
| 12 | With `keyword`, `channelId`, `pageToken` | All added to search params |
| 13 | Without optional params | Only base params sent |
| 14 | Response has no `items` | `HoError('search error')` |
| 15 | Response with mixed video and playlist IDs | Both Sets populated correctly |
| 16 | Empty results but `id_arr`/`pl_arr` provided | Pre-existing IDs included |
| 17 | `ECONNRESET` from YouTube API | Treated as success (null metadata) |

#### `y video`
| # | Scenario | Expected |
|---|----------|----------|
| 18 | Missing `id` | Returns `[]` |
| 19 | Valid `id` | Returns `metadata.items` |
| 20 | API error (non-ECONNRESET) | Promise rejected |

#### `y channel`
| # | Scenario | Expected |
|---|----------|----------|
| 21 | Missing `id` | `HoError('channel parameter lost!!!')` |
| 22 | Valid `id` | Returns full channel metadata |

#### `y playlist`
| # | Scenario | Expected |
|---|----------|----------|
| 23 | Missing `id` | Returns `[]` |
| 24 | Valid `id` | Returns `metadata.items` |

#### `y playItem`
| # | Scenario | Expected |
|---|----------|----------|
| 25 | Missing `id` | `HoError('playItem parameter lost!!!')` |
| 26 | Valid `id` with results | Returns mapped array with `you_` prefix IDs |
| 27 | With `pageToken` | `pageToken` param included |
| 28 | Without `pageToken` | `pageToken` param omitted |

#### General
| # | Scenario | Expected |
|---|----------|----------|
| 29 | Unknown YouTube method | `HoError('youtube api unknown!!!')` |

---

## 12. `upload()` — Google Drive File Upload

### Purpose
Upload a file or body content to Google Drive with retry logic, supporting media, backup, and auto-folder types.

### Invocation & Authentication
```js
// Via dispatcher (rate-limited)
api('upload', {
  type: 'media' | 'backup' | 'auto',
  name: 'filename.ext',
  filePath: '/path/to/file',   // OR
  body: 'string content',      // (mutually exclusive with filePath)
  parent: 'folderId',          // Required for type 'auto'
  convert: true,               // Optional
  user: { username: 'admin' }, // Required for rate-limit error handling
  rest: (metadata) => {},      // Optional post-upload callback
  errhandle: (err) => {}       // Optional error handler
})
```

### Logic Flow
1. Validate `type`, `name`, and either `filePath` or `body`
2. Determine `parent` and `mimeType` by type:
   - `'media'` → `GOOGLE_MEDIA_FOLDER`, `mediaMIME(name)`
   - `'backup'` → `GOOGLE_BACKUP_FOLDER`, `'*/*'`
   - `'auto'` → `data.parent`, `mediaMIME(name)` or `'text/plain'`
   - Default → error
3. Build upload params (file stream or body string)
4. If `data.convert === true` → add `convert: true` to params
5. Execute `drive.files.insert()` with retry:
   - On success: if `rest` callback → return thunk for deferred execution
   - On error: increment `index`; if `index > MAX_RETRY` → fail; else backoff `index * 1000ms` and retry after `checkOauth()`

### Returns & Side Effects
- Returns `Promise<Function|void>` — optional rest callback thunk
- **Network**: Google Drive API v2 file insert
- **Filesystem**: Creates read stream from `filePath`
- **Retry**: Up to `MAX_RETRY` attempts with linear backoff + OAuth refresh

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Missing `type` | `HoError('upload parameter lost!!!')` |
| 2 | Missing `name` | `HoError('upload parameter lost!!!')` |
| 3 | Missing both `filePath` and `body` | `HoError('upload parameter lost!!!')` |
| 4 | `type='media'`, valid MIME | Upload with `GOOGLE_MEDIA_FOLDER` parent |
| 5 | `type='media'`, unknown MIME | `HoError('upload mime type unknown!!!')` |
| 6 | `type='backup'` | Upload with `GOOGLE_BACKUP_FOLDER`, `*/*` MIME |
| 7 | `type='auto'`, known MIME | Upload with custom parent, detected MIME |
| 8 | `type='auto'`, unknown MIME | Fallback to `text/plain` |
| 9 | Unknown `type` | `HoError('upload type unknown!!!')` |
| 10 | Upload via `filePath` | `FsCreateReadStream` used for media body |
| 11 | Upload via `body` string | String body with `text/plain` MIME |
| 12 | `convert=true` | `param.convert` set to `true` |
| 13 | `convert=false` or absent | No `convert` property |
| 14 | Success with `rest` callback | Returns thunk function |
| 15 | Success without `rest` | Returns `undefined` |
| 16 | First attempt fails, retry succeeds | `checkOauth()` called, second attempt made |
| 17 | All retries exhausted (`MAX_RETRY`) | Error forwarded to `errhandle` |
| 18 | `ECONNRESET` from Drive API | Treated as success |
| 19 | `errhandle` callback invoked on fatal error | Custom error handler receives error |

---

## 13. `list()` — Drive Folder Listing

### Purpose
List sub-folders within a Google Drive folder, with optional name filtering and retry logic.

### Invocation & Authentication
```js
api('list folder', { folderId: 'abc123', name: 'optional', max: 100 })
```

### Logic Flow
1. Validate `folderId` required
2. Build query: `'{folderId}' in parents AND trashed = false AND mimeType = 'application/vnd.google-apps.folder'` ± name filter
3. Call `drive.files.list()` with `maxResults` (default `DRIVE_LIMIT`)
4. If result has `items` → return items
5. Else retry up to `MAX_RETRY` times with 3s delay

### Returns & Side Effects
- Returns `Promise<Array<DriveItem>>`
- Returns `[]` if max retries exceeded with empty results

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Missing `folderId` | `HoError('list parameter lost!!!')` |
| 2 | Folder with sub-folders | Returns array of folder items |
| 3 | Empty folder | Retries up to `MAX_RETRY`, then returns `[]` |
| 4 | With `name` filter | Query includes `title = '{name}'` |
| 5 | With `max` override | `maxResults` set to custom value |
| 6 | Without `max` | `maxResults` defaults to `DRIVE_LIMIT` |
| 7 | API returns `null` metadata | Retry triggered |
| 8 | API `ECONNRESET` | Treated as success (null metadata → retry) |
| 9 | API non-ECONNRESET error | Promise rejected |

---

## 14. `listFile()` — Drive File Listing

### Purpose
List non-folder files within a Google Drive folder with `401` retry handling.

### Invocation & Authentication
```js
api('list file', { folderId: 'abc123', max: 50 })
```

### Logic Flow
1. Validate `folderId` required
2. Query: `'{folderId}' in parents AND trashed = false AND mimeType != folder`
3. Call `drive.files.list()` → return `metadata.data.items`
4. On `401` error → retry up to `MAX_RETRY` with `OATH_WAITING * 1000` ms delay
5. On other error → `handleError`

### Returns & Side Effects
- Returns `Promise<Array<DriveFileItem>>`

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Missing `folderId` | `HoError('list parameter lost!!!')` |
| 2 | Folder with files | Returns file item array |
| 3 | Empty folder | Returns `[]` |
| 4 | `401` error, retry succeeds | Waits `OATH_WAITING` seconds, retries |
| 5 | `401` error, all retries fail | `handleError` with original error |
| 6 | Non-`401` error | Immediate `handleError` |
| 7 | With `max` override | Custom `maxResults` |
| 8 | `ECONNRESET` | Treated as success |

**Note**: Line 520 (`max = data['max']`) references undeclared variable `max` — potential bug to document.

---

## 15. `create()` — Drive Folder Creation

### Purpose
Create a new folder in Google Drive under a specified parent.

### Invocation & Authentication
```js
api('create', { name: 'New Folder', parent: 'parentFolderId' })
```

### Logic Flow
1. Validate `name` and `parent` required
2. Call `drive.files.insert()` with `mimeType: 'application/vnd.google-apps.folder'`
3. Return `metadata.data`

### Returns & Side Effects
- Returns `Promise<DriveMetadata>` (created folder metadata with `.id`)

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Missing `name` | `HoError('create parameter lost!!!')` |
| 2 | Missing `parent` | `HoError('create parameter lost!!!')` |
| 3 | Valid params | Folder created, metadata returned |
| 4 | `ECONNRESET` | Treated as success |
| 5 | Drive API error | Promise rejected |

---

## 16. `download()` — Authenticated HTTP Download

### Purpose
Download a file from a URL using OAuth2 bearer token to a local file path, with temp-file atomicity and retry logic.

### Invocation & Authentication
```js
// Internal — called via dispatcher or by downloadPresent/downloadDoc
download({
  url: 'https://...',
  filePath: '/mnt/storage/file.dat',
  rest: () => {},       // Optional callback
  errhandle: (err) => {} // Optional error handler
})
```

### Logic Flow
1. Validate `url` and `filePath` required
2. Create temp path `{filePath}_t`
3. Fetch with Authorization bearer header
4. Clean up existing temp file if present
5. Pipe response to temp file via write stream
6. Rename temp → final path (atomic)
7. Verify content-length matches file size
8. If mismatch → `HoError('incomplete download')`
9. If `rest` → return deferred callback thunk
10. On error → retry up to `MAX_RETRY` with linear backoff (`index * 1000ms`)

### Returns & Side Effects
- Returns `Promise<Function|void>`
- **Filesystem**: Creates temp file, renames to final, verifies integrity
- **Network**: HTTP fetch with OAuth2 token

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Missing `url` | `HoError('download parameter lost!!!')` |
| 2 | Missing `filePath` | `HoError('download parameter lost!!!')` |
| 3 | Successful download, size matches | File saved, temp cleaned |
| 4 | Successful download, no content-length header | No size check, success |
| 5 | Content-length mismatch | `HoError('incomplete download')` |
| 6 | Temp file already exists | Deleted before write |
| 7 | Network error, retry succeeds | Retries with backoff |
| 8 | All retries exhausted | `HoError('timeout')` via `errhandle` |
| 9 | Write stream error | Caught and retried |
| 10 | With `rest` callback | Returns thunk |
| 11 | Without `rest` | Returns `undefined` |

---

## 17. `deleteFile()` — Drive File Trash

### Purpose
Move a Google Drive file to trash.

### Invocation & Authentication
```js
api('delete', { fileId: 'driveFileId' })
```

### Logic Flow
1. Validate `fileId` required
2. Call `drive.files.trash({ fileId })`

### Returns & Side Effects
- Returns `Promise<void>`
- File moved to Drive trash (recoverable)

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Missing `fileId` | `HoError('delete parameter lost!!!')` |
| 2 | Valid `fileId` | File trashed, resolves |
| 3 | `ECONNRESET` | Treated as success |
| 4 | File not found | Drive API error propagated |

---

## 18. `getFile()` — Drive File Metadata Retrieval

### Purpose
Retrieve metadata for a specific Google Drive file.

### Invocation & Authentication
```js
api('get', { fileId: 'driveFileId' })
```

### Logic Flow
1. Validate `fileId` required
2. Call `drive.files.get({ fileId })`
3. Return `metadata.data` if present, else `metadata`

### Returns & Side Effects
- Returns `Promise<DriveMetadata>`

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Missing `fileId` | `HoError('get parameter lost!!!')` |
| 2 | Valid `fileId` with `metadata.data` | Returns `metadata.data` |
| 3 | Valid `fileId` without `metadata.data` | Returns raw `metadata` |
| 4 | `ECONNRESET` | Treated as success |
| 5 | File not found | Drive API error propagated |

---

## 19. `copyFile()` — Drive File Copy

### Purpose
Create a copy of a Google Drive file.

### Invocation & Authentication
```js
api('copy', { fileId: 'driveFileId' })
```

### Logic Flow
1. Validate `fileId` required
2. Call `drive.files.copy({ fileId })`
3. Return `metadata.data` if present, else `metadata`

### Returns & Side Effects
- Returns `Promise<DriveMetadata>` (new file's metadata)

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Missing `fileId` | `HoError('copy parameter lost!!!')` |
| 2 | Valid `fileId` | File copied, new metadata returned |
| 3 | `ECONNRESET` | Treated as success |
| 4 | Quota exceeded | Drive API error propagated |

---

## 20. `moveParent()` — Drive File Re-parent

### Purpose
Move a file from one Drive folder to another by patching parent references.

### Invocation & Authentication
```js
api('move parent', { fileId: 'id', rmFolderId: 'oldParent', addFolderId: 'newParent' })
```

### Logic Flow
1. Validate `fileId`, `rmFolderId`, `addFolderId` all required
2. Call `drive.files.patch()` with `removeParents` and `addParents`

### Returns & Side Effects
- Returns `Promise<void>`
- File's parent folder changes

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Missing `fileId` | `HoError('move parent parameter lost!!!')` |
| 2 | Missing `rmFolderId` | `HoError('move parent parameter lost!!!')` |
| 3 | Missing `addFolderId` | `HoError('move parent parameter lost!!!')` |
| 4 | Valid params | File re-parented |
| 5 | Same source and dest folder | API allows it, no-op |
| 6 | `ECONNRESET` | Treated as success |

---

## 21. `downloadMedia()` — Drive Media Download via yt-dlp

### Purpose
Download media from Google Drive using `youtube-dl-exec` (yt-dlp), selecting the best MP4 format that meets HD quality requirements.

### Invocation & Authentication
```js
// Via dispatcher (rate-limited)
api('download media', {
  key: 'driveFileId',
  filePath: '/mnt/storage/media.mp4',
  hd: 720,                     // Minimum desired height
  rest: (height) => {},         // Optional callback with achieved height
  errhandle: (err) => {},       // Optional error handler
  user: { username: 'admin' }
})
```

### Logic Flow
1. Validate `key` and `filePath` required
2. Call `youtubedl` with `dumpSingleJson` to enumerate formats
3. Filter formats: `ext=mp4`, has both video and audio codecs, has dimensions
4. Select format with `height >= hd * 0.7` and maximum height
5. If no qualifying format → `HoError('quality low')`
6. Determine save path (handle existing file / temp conflicts)
7. Download with selected format ID and `writeThumbnail: true`
8. Clean up temp paths, rename thumbnail
9. If `rest` → return thunk passing `currentHeight`
10. On error → retry with exponential backoff: `2^index * 40` seconds

### Returns & Side Effects
- Returns `Promise<Function|void>`
- **Filesystem**: Downloads media file, optional thumbnail `.jpg`
- **Network**: Uses `youtube-dl-exec` for Google Drive download
- **Retry**: Exponential backoff up to `MAX_RETRY`

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Missing `key` | `HoError('get parameter lost!!!')` |
| 2 | Missing `filePath` | `HoError('get parameter lost!!!')` |
| 3 | Multiple MP4 formats, best meets HD | Highest qualifying format selected |
| 4 | No MP4 formats available | `HoError('quality low')` |
| 5 | Formats below 70% of `hd` threshold | `HoError('quality low')` |
| 6 | Format at exactly 70% of `hd` | Selected (boundary: `hd * 0.7`) |
| 7 | Format with `vcodec='none'` | Skipped |
| 8 | Format with `acodec='none'` | Skipped |
| 9 | Format without `height`/`width` | Skipped |
| 10 | `filePath` already exists | Downloads to `_t` temp path, cleans up |
| 11 | `filePath` and `_t` both exist | Deletes `_t` first, then downloads |
| 12 | Neither exists | Downloads directly to `filePath` |
| 13 | Thumbnail generated | Renamed to `{filePath}_s.jpg` |
| 14 | No thumbnail | No rename, no error |
| 15 | With `rest` callback | Thunk called with `currentHeight` |
| 16 | Download error, retry succeeds | Exponential backoff (`2^n * 40s`) |
| 17 | All retries exhausted | `HoError('timeout')` via `errhandle` |

---

## 22. `downloadPresent()` — Google Slides SVG Export

### Purpose
Download a Google Slides presentation as individual SVG pages by first fetching the HTML to discover page IDs, then downloading each page as SVG.

### Invocation & Authentication
```js
// Via dispatcher (rate-limited)
api('download present', {
  exportlink: 'https://docs.google.com/...export?format=pdf',
  alternate: 'https://docs.google.com/.../htmlpresent',
  filePath: '/mnt/storage/presentation',
  rest: (pageCount) => {},
  errhandle: (err) => {},
  user: { username: 'admin' }
})
```

### Logic Flow
1. Validate `exportlink`, `alternate`, `filePath` required
2. Download HTML presentation via `download()` to `{filePath}_b.htm`
3. Transform export link: replace `=pdf` with `=svg&pageid=p`
4. Create `{filePath}_present/` directory
5. Recursively grep HTML for page IDs matching `12,"p{N}",{number},0`
6. For each page → download SVG to `{dir}/{number}.svg`
7. On grep failure (no more pages):
   - If `number > 0` → success, invoke `rest(number)`
   - If `number === 0` → error via `errhandle`

### Returns & Side Effects
- Returns `Promise<Function|void>`
- **Filesystem**: Creates `_b.htm` file, `_present/` directory with SVG files
- **Child process**: Uses `grep` via `Child_process.exec`

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Missing `exportlink` | `HoError('get parameter lost!!!')` |
| 2 | Missing `alternate` | `HoError('get parameter lost!!!')` |
| 3 | Missing `filePath` | `HoError('get parameter lost!!!')` |
| 4 | Presentation with 5 pages | Downloads 5 SVGs to `_present/` dir |
| 5 | Presentation with 0 discoverable pages | Error via `errhandle` |
| 6 | First page download fails | Error propagated |
| 7 | Middle page download fails | Partial download, `rest` not called |
| 8 | HTML does not contain page pattern | `number=0`, error via `errhandle` |
| 9 | `_present/` dir already exists | No error, reuse directory |
| 10 | `_present/` dir creation fails | `Mkdirp` error propagated |
| 11 | Regex extraction fails (`pageid` null) | `HoError('can not find present')` |
| 12 | Export link format conversion | `=pdf` → `=svg&pageid=p` correctly |

---

## 23. `downloadDoc()` — Google Docs ZIP Export

### Purpose
Download a Google Doc as a ZIP archive, extract it, and rename HTML files sequentially.

### Invocation & Authentication
```js
// Via dispatcher (rate-limited)
api('download doc', {
  exportlink: 'https://docs.google.com/...export?format=pdf',
  filePath: '/mnt/storage/document',
  rest: (docIndex) => {},
  errhandle: (err) => {},
  user: { username: 'admin' }
})
```

### Logic Flow
1. Validate `exportlink` and `filePath` required
2. Transform link: replace `=pdf` with `=zip`
3. Download ZIP to `{filePath}.zip`
4. Verify ZIP exists
5. Create `{filePath}_doc/` directory
6. Wait 5 seconds (filesystem sync)
7. Extract via Python script `myuzip.py`
8. Delete ZIP file
9. Iterate extracted files; rename:
   - First file → `doc.html`
   - Subsequent → `doc2.html`, `doc3.html`, ... (up to `doc99.html`)
   - Skip directories
10. If `rest` → return thunk with `doc_index`

### Returns & Side Effects
- Returns `Promise<Function|void>`
- **Filesystem**: Downloads ZIP, extracts, renames, deletes ZIP
- **Child process**: Executes Python unzip script

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Missing `exportlink` | `HoError('get parameter lost!!!')` |
| 2 | Missing `filePath` | `HoError('get parameter lost!!!')` |
| 3 | Single HTML in ZIP | Renamed to `doc.html` |
| 4 | Multiple HTML files in ZIP | First → `doc.html`, second → `doc2.html`, etc. |
| 5 | ZIP download fails | Error propagated |
| 6 | ZIP file not found after download | `HoError('cannot find zip')` |
| 7 | Python unzip script fails | Promise rejected |
| 8 | Extracted directory contains subdirectories | Subdirectories skipped |
| 9 | `doc.html` already exists (name collision) | Increments to `doc2.html` |
| 10 | More than 99 files | Loop stops at 99 (boundary) |
| 11 | `_doc/` dir already exists | Reuse directory |
| 12 | ZIP deletion fails | Error propagated |
| 13 | With `rest` callback | Thunk called with final `doc_index` |
| 14 | Export link format conversion | `=pdf` → `=zip` correctly |

---

## 24. `googleBackup()` — Selective File Backup to Drive

### Purpose
Upload file, subtitle, or tag data to Google Drive backup based on recycle phase.

### Invocation & Authentication
```js
import { googleBackup } from '../models/api-tool-google.js';
googleBackup(user, id, name, filePath, tags, recycle, append='')
```

| Param | Type | Description |
|-------|------|-------------|
| `user` | `Object` | User object with `username` |
| `id` | `String` | File/document ID |
| `name` | `String` | Filename |
| `filePath` | `String` | Base file path |
| `tags` | `Array` | Tag list (used for recycle=3) |
| `recycle` | `Number` | Phase: 1=file, 2=subtitle, 3=tags |
| `append` | `String` | Optional path suffix for recycle=1 |

### Logic Flow — Switch on `recycle`
- **`1` (File backup)**: Upload `{filePath}{append}` as `{id}.{name}` to backup folder
- **`2` (Subtitle backup)**: Check existence of `.srt`, `.ass`, `.ssa` (priority order); upload first found
- **`3` (Tag backup)**: Upload `tags.toString()` as body string named `{id}.{name}.txt`
- **`default`**: `HoError('recycle {n} denied!!!')`

### Returns & Side Effects
- Returns `Promise<void>` (delegates to `api('upload', ...)`)
- For `recycle=2`: may resolve without upload if no subtitle found

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | `recycle=1`, file exists | File uploaded as `{id}.{name}` |
| 2 | `recycle=1` with `append` | File path includes append suffix |
| 3 | `recycle=2`, `.srt` exists | `.srt` file uploaded |
| 4 | `recycle=2`, `.srt` missing, `.ass` exists | `.ass` file uploaded |
| 5 | `recycle=2`, `.srt`+`.ass` missing, `.ssa` exists | `.ssa` file uploaded |
| 6 | `recycle=2`, no subtitle files | Resolves without upload |
| 7 | `recycle=3` | Tags converted to string and uploaded |
| 8 | `recycle=0` (invalid) | `HoError('recycle 0 denied!!!')` |
| 9 | `recycle=4` (invalid) | `HoError('recycle 4 denied!!!')` |

## 25. `userDrive()` — Automated User Drive Sync

### Purpose
Recursively traverse a user's Google Drive folder tree, listing files and dispatching them to `MediaHandleTool.singleDrive()` for processing. Iterates through multiple users.

### Invocation & Authentication
```js
import { userDrive } from '../models/api-tool-google.js';
userDrive(userlist: Array, index: number, drive_batch?: number): Promise<void>
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `userlist` | `Array<User>` | — | Users with `.auto` (Drive folder ID) and `.username` |
| `index` | `Number` | — | Current user index |
| `drive_batch` | `Number` | `DRIVE_LIMIT` | Max files to process per user |

### Logic Flow
1. Initialize folder stack with root `{ id: userlist[index].auto, title: 'drive upload' }`
2. `getDriveList()`: Pop folder from stack
   - Skip null-ID markers (used as depth separators)
   - List files in current folder via `api('list file', ...)`
   - If files found:
     - Truncate to remaining batch capacity
     - Locate `uploaded` and `handling` sub-folders (cached after first lookup)
     - Call `MediaHandleTool.singleDrive()` for processing
     - If batch not full → recurse into sub-folders
   - If no files → recurse into sub-folders via `getFolder()`
3. `getFolder()`: List sub-folders, filter out `uploaded`/`downloaded`/`handling` at root level
4. After user complete → advance to next user recursively

### Returns & Side Effects
- **Network**: Multiple Google Drive API calls
- **WebSocket**: Sends file names being processed
- **Side effects**: Delegates to `MediaHandleTool.singleDrive()` for actual file handling

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Single user with files in root | Files listed and processed |
| 2 | Multiple nested folders | Recursive traversal via folder stack |
| 3 | Root folder contains `uploaded`/`downloaded`/`handling` | These folders filtered out at root |
| 4 | Non-root folder named `uploaded` | NOT filtered (filter only at root) |
| 5 | File count exceeds `drive_batch` | Truncated at batch limit |
| 6 | File count exactly at `drive_batch` | All processed, no further folder traversal |
| 7 | Empty folder tree | Resolves without processing |
| 8 | `uploaded` folder missing | `HoError('do not have uploaded folder!!!')` |
| 9 | `handling` folder missing | `HoError('do not have handling folder!!!')` |
| 10 | Multiple users in list | Processes sequentially, advances index |
| 11 | Last user in list | Resolves without further recursion |
| 12 | WebSocket notification | Sends comma-separated file titles per batch |
| 13 | Custom `drive_batch` value | Respects custom limit |
| 14 | `MediaHandleTool.singleDrive()` throws | Error propagated |

---

## 26. `autoDoc()` — Scheduled Document Downloader

### Purpose
Automatically download documents from external sources for each user, organized by document type and country.

### Invocation & Authentication
```js
import { autoDoc } from '../models/api-tool-google.js';
autoDoc(userlist: Array, index: number, type: string, date?: Date): Promise<void>
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `userlist` | `Array<User>` | — | Users with `.auto` Drive folder ID |
| `index` | `Number` | — | Current user index |
| `type` | `String` | — | Country type key in `DOC_TYPE` |
| `date` | `Date\|null` | `new Date()` | Target date for document fetch |

### Logic Flow
1. Validate `type` exists in `DOC_TYPE` map
2. Set `downloaded` folder to `userlist[index].auto`
3. For each document type in `DOC_TYPE[type]`:
   - Call `External.getSingleList(docType, date)` to get document list
   - Send file names via WebSocket
   - Recursively download each document via `External.save2Drive()`
4. After all types → advance to next user recursively

### Returns & Side Effects
- **Network**: External API calls via `External.getSingleList()` and `External.save2Drive()`
- **WebSocket**: Sends document names being processed

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Invalid `type` (not in `DOC_TYPE`) | `HoError('do not have this country!!!')` |
| 2 | Valid type with documents available | Documents downloaded for all doc types |
| 3 | Valid type with no documents | Resolves without downloads |
| 4 | `date` provided | Uses provided date |
| 5 | `date=null` | Uses `new Date()` |
| 6 | Multiple users | Processes sequentially |
| 7 | Single user | Processes and resolves |
| 8 | `External.getSingleList()` fails | Error propagated |
| 9 | `External.save2Drive()` fails mid-list | Error propagated |
| 10 | Multiple document types per country | All types iterated |
| 11 | WebSocket sends document names | Correct format with doc type prefix |

---

## 27. `isApiing()` — Active API Check

### Purpose
Check if any rate-limited Google API operations are currently in progress.

### Invocation & Authentication
```js
import { isApiing } from '../models/api-tool-google.js';
isApiing(): boolean
```

### Logic Flow
1. Return `true` if `api_ing > 0`, else `false`

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | `api_ing = 0` | Returns `false` |
| 2 | `api_ing = 1` | Returns `true` |
| 3 | `api_ing = 5` | Returns `true` |

---

## 28. `sendPresentName()` — Christmas Exchange Email

### Purpose
Convenience wrapper to send a Christmas gift exchange notification email.

### Invocation & Authentication
```js
import { sendPresentName } from '../models/api-tool-google.js';
sendPresentName(text: string, mail: string, append?: string|null): Promise<void>
```

### Logic Flow
1. Delegates to `api('send name', { title: 'Christmas Presents Exchange', text, mail, append })`

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | With all params including `append` | Email sent with appended subject |
| 2 | Without `append` (null default) | Email sent without suffix |
| 3 | Invalid email | Error from `sendName()` validation |

---

## 29. `sendLotteryName()` — Lottery Notification Email

### Purpose
Convenience wrapper to send lottery result notification emails.

### Invocation & Authentication
```js
import { sendLotteryName } from '../models/api-tool-google.js';
sendLotteryName(title: string, text: string, mail: string): Promise<void>
```

### Logic Flow
1. Delegates to `api('send name', { title, text, mail })`

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Valid params | Email sent with custom title |
| 2 | Invalid email | Error from `sendName()` validation |

---

## 30. `googleBackupWhole()` — Full System Backup Upload

### Purpose
Upload a complete system backup file to Google Drive and notify via WebSocket.

### Invocation & Authentication
```js
import { googleBackupWhole } from '../models/api-tool-google.js';
googleBackupWhole(backupName: string): Promise<void>
```

### Logic Flow
1. Call `api('upload', ...)` with `type: 'auto'`, `parent: GOOGLE_DB_BACKUP_FOLDER`, `user: ROOT_USER`
2. File path: `{BACKUP_PATH}/{backupName}`
3. On success → send WebSocket notification: `"whole backup: {name}, please clean up previous backup"`

### Returns & Side Effects
- **Network**: Drive upload + WebSocket broadcast
- Uses `ROOT_USER` as the user context

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Valid backup file | Uploaded and WS notification sent |
| 2 | Upload fails | Error propagated (no WS sent) |
| 3 | File does not exist at `BACKUP_PATH` | Upload error from `api()` |
| 4 | WebSocket notification content | Contains backup name and cleanup reminder |

---

## 31. `googleBackupDb()` — Database Collection Backup

### Purpose
Create a Drive folder structure mirroring MongoDB backup directories and upload all backup files.

### Invocation & Authentication
```js
import { googleBackupDb } from '../models/api-tool-google.js';
googleBackupDb(backupDate: string): Promise<void>
```

### Logic Flow
1. Create date-named folder in `GOOGLE_DB_BACKUP_FOLDER` via `api('create', ...)`
2. Read local backup directory `{BACKUP_PATH}/{backupDate}/`
3. For each sub-directory (collection):
   - Read files within
   - Build `backup_collection` array with `{ name, path, list }`
4. Create Drive sub-folders for each collection sequentially
5. Upload all files sequentially within each collection folder
6. Send WebSocket notification per file uploaded

### Returns & Side Effects
- **Filesystem**: Reads local backup directory structure
- **Network**: Multiple Drive folder creations + file uploads
- **WebSocket**: Per-file upload notifications

### Snapshot Testing Data

```js
// backup_collection structure
[
  {
    name: 'storage',
    path: '/mnt/backup/2024-01-02/storage',
    list: ['storage.bson', 'storage.metadata.json'],
    id: 'driveFolderId123'
  },
  {
    name: 'user',
    path: '/mnt/backup/2024-01-02/user',
    list: ['user.bson', 'user.metadata.json'],
    id: 'driveFolderId456'
  }
]
```

### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Backup with multiple collections | All folders created, all files uploaded |
| 2 | Empty backup directory | No uploads, resolves |
| 3 | Collection with no files | Folder created, no uploads for that collection |
| 4 | Drive folder creation fails | Error propagated |
| 5 | Single file upload fails | Error propagated (remaining files not uploaded) |
| 6 | WebSocket notifications | Sent for each uploaded file |
| 7 | Local backup path does not exist | `FsReaddirSync` throws |
| 8 | Large number of collections | All processed sequentially |

---

## Appendix A: Known Issues / Bugs Identified During Analysis

| Line | Issue | Severity | Description |
|------|-------|----------|-------------|
| 346 | `new Set(data.pl_arr[i])` | 🔴 Bug | Variable `i` is undefined; should likely be `data.pl_arr` |
| 520 | `max = data['max']` | 🟡 Warning | Assigns to undeclared variable `max` (unused); potential global leak |
| 892 | `${filePath}}${lang}` | 🔴 Bug | Extra closing brace — `SRT2VTT` receives malformed path |

## Appendix B: Mock Strategy Summary

Per OUTLINE.md §11.4, the following should be mocked:

| Dependency | Mock Approach |
|-----------|---------------|
| `googleapis` (Drive v2, Gmail v1, YouTube v3) | Jest module mock; return controlled metadata objects |
| `node-fetch` | Mock HTTP responses with headers and body streams |
| `youtube-dl-exec` | Mock with format metadata, subtitle lists |
| `fs` module (`existsSync`, `createReadStream`, etc.) | Selective mocking per test |
| `child_process.exec` | Mock `grep` and `myuzip.py` outputs |
| `Mongo` (mongo-tool) | Mock `find`/`update` for `accessToken` collection |
| `MediaHandleTool.singleDrive` | Mock to verify invocation args |
| `External.getSingleList` / `External.save2Drive` | Mock external document sources |
| `sendWs` | Mock to verify WebSocket messages |
| `Mkdirp` | Mock directory creation |

## Appendix C: Test File Location

Per OUTLINE.md §11.8:
```
src/back/models/__tests__/api-tool-google.test.js
```

---

> **Note**: This document serves as the QA testing strategy blueprint for `api-tool-google.js`. Test implementation should use **Jest 27** with `NODE_OPTIONS=--experimental-vm-modules` for ESM support, following the project's existing configuration in `jest.config.cjs`.
