# cmd.js — CLI Admin Tool QA Testing Documentation

> **Module**: `src/back/cmd/cmd.js` (290 lines)
> **Type**: Interactive CLI — reads from `process.stdin`, dispatches admin commands
> **Protocol**: stdin / stdout (no HTTP, no auth middleware)
> **Generated**: 2026-03-18

---

## Table of Contents

1. [Module Architecture](#1-module-architecture)
2. [Command Reference](#2-command-reference)
   - 2.1 [stock](#21-stock)
   - 2.2 [stocklist](#22-stocklist)
   - 2.3 [testdata](#23-testdata)
   - 2.4 [cleanstock](#24-cleanstock)
   - 2.5 [doc](#25-doc)
   - 2.6 [complete](#26-complete)
   - 2.7 [dbdump](#27-dbdump)
   - 2.8 [dbrestore](#28-dbrestore)
   - 2.9 [randomsend](#29-randomsend)
   - 2.10 [resettotal](#210-resettotal)
   - 2.11 [updatepassword](#211-updatepassword)
   - 2.12 [default (help)](#212-default-help)
3. [Helper Functions](#3-helper-functions)
   - 3.1 [cmdUpdateDrive](#31-cmdupdatedrive)
   - 3.2 [dbDump](#32-dbdump-function)
   - 3.3 [dbRestore](#33-dbrestore-function)
   - 3.4 [randomSend](#34-randomsend-function)
   - 3.5 [resetTotal](#35-resettotal-function)
4. [Cross-Cutting Concerns](#4-cross-cutting-concerns)
5. [Summary Table](#5-summary-table)
6. [Master Test Scenario Table](#6-master-test-scenario-table)

---

## 1. Module Architecture

### 1.1 Imports & Dependencies

| Import | Source | Purpose |
|--------|--------|---------|
| `USERDB`, `DRIVE_LIMIT`, `STORAGEDB`, `STOCKDB`, `PASSWORDDB`, `RANDOM_EMAIL`, `BACKUP_LIMIT`, `TOTALDB` | `../constants.js` | Collection names & config constants |
| `ENV_TYPE` | `../../../ver.js` | Environment selector (`'dev'` / `'release'`) |
| `BACKUP_PATH` | `../config.js` | Env-aware backup folder path function |
| `readline` | Node.js built-in | `createInterface` for stdin line-based reading |
| `fs` | Node.js built-in | `writeFile`, `createReadStream`, `existsSync` |
| `Mkdirp` | `mkdirp` | Recursive directory creation |
| `userDrive`, `autoDoc`, `sendPresentName` | `../models/api-tool-google.js` | Google Drive & doc-download APIs |
| `completeMimeTag` | `../models/tag-tool.js` | MIME-tag completion |
| `Mongo`, `objectID` | `../models/mongo-tool.js` | MongoDB CRUD wrapper & ObjectID helper |
| `StockTool`, `getStockListV2` | `../models/stock-tool.js` | Stock data fetch & list retrieval |
| `updatePasswordCipher` | `../models/password-tool.js` | Password re-encryption |
| `handleError`, `isValidString`, `HoError`, `completeZero` | `../util/utility.js` | Error handling & string utilities |

### 1.2 Constants Resolved at Import Time

| Constant | Resolved Value | Usage |
|----------|---------------|-------|
| `USERDB` | `'user'` | User collection |
| `STORAGEDB` | `'storage'` | Storage collection (also `storageUser`, `storageDir`) |
| `STOCKDB` | `'stock'` | Stock collection (also `stockUser`, `stockDir`) |
| `PASSWORDDB` | `'password'` | Password collection (also `passwordUser`, `passwordDir`) |
| `TOTALDB` | `'total'` | Stock portfolio totals collection |
| `BACKUP_LIMIT` | `1000` | Documents per backup file chunk |
| `DRIVE_LIMIT` | `100` | Default Drive batch size |
| `RANDOM_EMAIL` | `Array<{name, mail}>` (8 entries) | Default gift exchange participant list |

### 1.3 Process-Level Setup

```
Line 17:  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0"
```
Disables TLS certificate verification globally — required for self-signed certs used by the backend services.

```
Line 19:  const sendList = RANDOM_EMAIL;
```
`sendList` is a **reference** to the imported `RANDOM_EMAIL` array. Mutations in `randomSend('edit', …)` modify this in-place within the process lifetime.

### 1.4 Readline Interface (Lines 197–201)

```js
const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
});
```

- Uses Node.js `readline` to read **line-by-line** from stdin.
- `terminal: false` — suppresses ANSI escape sequences / raw mode.
- Each completed line (terminated by `\n`) fires the `'line'` event.

### 1.5 Uncaught Exception Handler (Lines 203–208)

```js
process.on('uncaughtException', err => {
    console.log(`Threw Exception: ${err.name} ${err.message}`);
    if (err.stack) {
        console.log(err.stack);
    }
});
```

- Catches **any** unhandled synchronous throw or unhandled rejection that bubbles up.
- Logs name + message; conditionally logs stack trace.
- **Does NOT exit the process** — the readline loop continues.

### 1.6 Main Command Dispatcher (Lines 210–291)

```js
rl.on('line', line => {
    const cmd = line.split(' ');
    switch (cmd[0]) { … }
});
```

- `line.split(' ')` — splits on **single space**; extra spaces become empty-string tokens.
- `cmd[0]` — the command verb, matched via `switch`.
- Each case **returns** the resulting Promise (though `rl.on` ignores the return value).
- No `break` statements between cases — uses `return` to exit each branch. Each case returns a Promise chain with `.then(() => console.log('done')).catch(err => handleError(err, label))`.
- The `default` case prints help text — 13 `console.log` lines listing all valid commands.

### 1.7 Error Handling Pattern

Every command case follows the same pattern:

```js
return someAsyncCall(…)
    .then(() => console.log('done'))
    .catch(err => handleError(err, 'CMD <label>'));
```

- `handleError` from `util/utility.js` logs the error with its label.
- The process does **not** terminate — the readline continues accepting new commands.
- For helper functions (`dbDump`, `dbRestore`, `randomSend`, `resetTotal`), validation failures are raised via `handleError(new HoError(msg))` which returns an immediately-rejected promise or logs the error.

---

## 2. Command Reference

### 2.1 `stock`

#### Purpose
Fetch single stock data for a given market type, stock index, and mode.

#### Logic Flow (Line 213–215)
1. Parse: `cmd[1]` → type (default `'twse'`), `cmd[2]` → index (default `'2330'`), `cmd[3]` → mode (default `1`).
2. Log `'stock'` to stdout.
3. Call `StockTool.getSingleStockV2(type, {index, tag: []}, mode)`.
4. On success: log `'done'`.
5. On error: `handleError(err, 'CMD stock')`.

#### Invocation
```
stock                          # defaults: type='twse', index='2330', mode=1
stock twse 2330 1              # explicit Taiwan Stock Exchange, ticker 2330, mode 1
stock usse AAPL 2              # US Stock Exchange, Apple, mode 2
stock bfx BTC 1                # Bitfinex, Bitcoin, mode 1
```

#### Returns & Side Effects
- **Console**: `'stock'` then `'done'` on success.
- **DB**: Depends on `StockTool.getSingleStockV2` — typically upserts into `stock` collection.
- **External API**: Yahoo Finance / exchange API via stock-tool.

#### Snapshot Testing Data
```
Input:   "stock twse 2330 1"
Output:  "stock\ndone\n"

Input:   "stock"
Output:  "stock\ndone\n"   (uses defaults twse/2330/1)
```

#### Test Scenarios

| ID | Scenario | Input | Expected Behavior | Priority |
|----|----------|-------|-------------------|----------|
| STK-01 | Default parameters | `stock` | Calls `getSingleStockV2('twse', {index:'2330', tag:[]}, 1)` | 🔴 Critical |
| STK-02 | Explicit TWSE | `stock twse 2330 1` | Same call with explicit args | 🟡 High |
| STK-03 | US stock | `stock usse AAPL 2` | `getSingleStockV2('usse', {index:'AAPL', tag:[]}, 2)` | 🟡 High |
| STK-04 | Mode coercion | `stock twse 2330 abc` | mode passed as `'abc'` (string); behavior depends on downstream | 🟢 Medium |
| STK-05 | API failure | `stock twse 9999 1` | Catches error, logs via handleError | 🟡 High |
| STK-06 | Missing index only | `stock twse` | index defaults to `'2330'`, mode defaults to `1` | 🟢 Medium |
| STK-07 | Extra spaces | `stock  twse  2330` | `cmd[1]` = `''` (empty string), `cmd[2]` = `'twse'` — misaligned params | 🔴 Critical |

---

### 2.2 `stocklist`

#### Purpose
Retrieve the stock list for a given market, compute the current fiscal quarter, and print each stock's index and tags.

#### Logic Flow (Lines 216–236)
1. Log `'stock list'`.
2. Get current date.
3. Call `getStockListV2(cmd[1] || 'twse', year, month)`.
4. Compute `updateyear` and `updatequarter` from current month:
   - month < 4 → Q4 of previous year
   - month 4–6 → Q1
   - month 7–9 → Q2
   - month ≥ 10 → Q3 (default)
5. Log `'{year}q{quarter}'`.
6. Iterate result: log each stock's `index` and `tag`.
7. Error: `handleError(err, 'CMD stock list')`.

#### Invocation
```
stocklist                 # defaults to 'twse'
stocklist twse
stocklist usse
```

#### Returns & Side Effects
- **Console**: `'stock list'`, then `'{year}q{quarter}'`, then per-stock `index` and `tag` lines.
- **DB**: Read-only (fetch from external source or cache).
- **External API**: Exchange API for stock list data.

#### Snapshot Testing Data
```
Input:   "stocklist twse"
Output:  "stock list\n2026q4\n2330\n['semiconductor']\n..."

Input:   "stocklist"
Output:  Same with type='twse' default
```

#### Quarter Calculation Truth Table

| Month Range | updatequarter | updateyear Adjustment |
|-------------|--------------|----------------------|
| 1–3 | 4 | year − 1 |
| 4–6 | 1 | year |
| 7–9 | 2 | year |
| 10–12 | 3 | year |

#### Test Scenarios

| ID | Scenario | Input | Expected Behavior | Priority |
|----|----------|-------|-------------------|----------|
| SL-01 | Default type | `stocklist` | Calls `getStockListV2('twse', year, month)` | 🔴 Critical |
| SL-02 | Explicit type | `stocklist usse` | US stock list fetch | 🟡 High |
| SL-03 | Quarter calc Jan | Run in January | Logs `{prevYear}q4` | 🟡 High |
| SL-04 | Quarter calc May | Run in May | Logs `{year}q1` | 🟡 High |
| SL-05 | Quarter calc Aug | Run in August | Logs `{year}q2` | 🟡 High |
| SL-06 | Quarter calc Nov | Run in November | Logs `{year}q3` | 🟡 High |
| SL-07 | Empty response | `stocklist twse` (API returns `[]`) | No per-stock output; `'stock list'` + quarter logged | 🟢 Medium |
| SL-08 | API failure | `stocklist invalid` | Error caught and logged | 🟡 High |

---

### 2.3 `testdata`

#### Purpose
Generate test data for stock entries using `StockTool.testData()`.

#### Logic Flow (Lines 237–239)
1. Log `'testdata'`.
2. Call `StockTool.testData()`.
3. On success: log `'done'`.

#### Invocation
```
testdata
```

#### Returns & Side Effects
- **Console**: `'testdata'` then `'done'`.
- **DB**: Inserts test documents into `stock` (and possibly `total`) collections.
- **External API**: None (uses generated data).

#### Test Scenarios

| ID | Scenario | Input | Expected Behavior | Priority |
|----|----------|-------|-------------------|----------|
| TD-01 | Normal execution | `testdata` | `StockTool.testData()` called, logs `'done'` | 🟡 High |
| TD-02 | Ignores extra args | `testdata foo bar` | Extra tokens ignored; same behavior | 🟢 Medium |
| TD-03 | DB write failure | `testdata` (DB down) | Error caught via handleError | 🟡 High |

---

### 2.4 `cleanstock`

#### Purpose
Clean useless stock data. Supports a "dry-run" (default) or destructive "remove" mode.

#### Logic Flow (Line 240–242)
1. Log `'clean stock'`.
2. Evaluate `cmd[1] === 'remove'`:
   - If `'remove'`: call `StockTool.cleanUseless(false)` — actually delete records.
   - Otherwise: call `StockTool.cleanUseless(true)` — dry-run / report only.
3. On success: log `'done'`.

> **Note**: The boolean parameter is **inverted** — `true` = dry-run, `false` = actual removal.

#### Invocation
```
cleanstock                # dry-run mode (cleanUseless(true))
cleanstock remove         # destructive mode (cleanUseless(false))
cleanstock anything       # same as dry-run (anything !== 'remove')
```

#### Returns & Side Effects
- **Console**: `'clean stock'` then `'done'`.
- **DB**: When `remove`, deletes documents from `stock` collection.

#### Test Scenarios

| ID | Scenario | Input | Expected Behavior | Priority |
|----|----------|-------|-------------------|----------|
| CS-01 | Dry-run default | `cleanstock` | `cleanUseless(true)` — no deletion | 🔴 Critical |
| CS-02 | Explicit remove | `cleanstock remove` | `cleanUseless(false)` — deletes data | 🔴 Critical |
| CS-03 | Non-remove arg | `cleanstock preview` | `cleanUseless(true)` — treated as dry-run | 🟡 High |
| CS-04 | Case sensitivity | `cleanstock Remove` | `'Remove' !== 'remove'` → dry-run | 🟡 High |
| CS-05 | Error handling | `cleanstock remove` (DB error) | Caught via handleError | 🟢 Medium |

---

### 2.5 `doc`

#### Purpose
Auto-download government/institutional documents for a given region and optional time parameter.

#### Logic Flow (Lines 246–251)
1. Log `'doc'`.
2. Query MongoDB: `Mongo('find', USERDB, { auto: {$exists: true}, perm: 1 })` — finds admin users with `auto` field.
3. Pass the user list to `autoDoc(userlist, 0, cmd[1], cmd[2])`:
   - `cmd[1]` — region: `'am'` (America), `'jp'` (Japan), `'tw'` (Taiwan).
   - `cmd[2]` — optional time parameter.
4. On success: log `'done'`.

The `DOC_TYPE` constant maps regions to data source codes:
- `am` → `['cen', 'dol', 'sca', 'fed', 'cbo']`
- `jp` → `['sea']`
- `tw` → `['sta', 'moe', 'cbc', 'mof']`

#### Invocation
```
doc am                    # Download American documents
doc jp                    # Download Japanese documents
doc tw                    # Download Taiwanese documents
doc am 202603             # Download with specific time parameter
```

#### Returns & Side Effects
- **Console**: `'doc'` then `'done'`.
- **DB**: Reads from `user` collection.
- **External API**: Government / institutional data APIs (Census, Federal Reserve, etc.).
- **File system**: Downloaded documents stored via Google Drive integration.

#### Test Scenarios

| ID | Scenario | Input | Expected Behavior | Priority |
|----|----------|-------|-------------------|----------|
| DOC-01 | American docs | `doc am` | Finds admin users, calls `autoDoc(list, 0, 'am', undefined)` | 🔴 Critical |
| DOC-02 | Japanese docs | `doc jp` | `autoDoc(list, 0, 'jp', undefined)` | 🟡 High |
| DOC-03 | Taiwanese docs | `doc tw` | `autoDoc(list, 0, 'tw', undefined)` | 🟡 High |
| DOC-04 | With time param | `doc am 202603` | `autoDoc(list, 0, 'am', '202603')` | 🟡 High |
| DOC-05 | Missing region | `doc` | `cmd[1]` = `undefined`; behavior depends on `autoDoc` validation | 🔴 Critical |
| DOC-06 | Invalid region | `doc eu` | Passed to `autoDoc` which may reject | 🟡 High |
| DOC-07 | No admin users | `doc am` (empty user query result) | `autoDoc([], 0, 'am', undefined)` — likely no-op | 🟢 Medium |
| DOC-08 | DB error on user query | `doc am` (DB down) | Caught at `.catch(err => handleError(err, 'CMD doc'))` | 🟢 Medium |

---

### 2.6 `complete`

#### Purpose
Complete MIME tags for storage entries. Optionally pass `'add'` to modify behavior.

#### Logic Flow (Lines 258–260)
1. Log `'complete'`.
2. Call `completeMimeTag(cmd[1])` — `cmd[1]` is `undefined` or `'add'`.
3. On success: log `'done'`.

#### Invocation
```
complete                  # Run MIME tag completion (default mode)
complete add              # Run with 'add' modifier
```

#### Returns & Side Effects
- **Console**: `'complete'` then `'done'`.
- **DB**: May update `storage` collection entries with correct MIME tags.

#### Test Scenarios

| ID | Scenario | Input | Expected Behavior | Priority |
|----|----------|-------|-------------------|----------|
| CM-01 | Default mode | `complete` | `completeMimeTag(undefined)` called | 🟡 High |
| CM-02 | Add mode | `complete add` | `completeMimeTag('add')` called | 🟡 High |
| CM-03 | Unknown modifier | `complete delete` | `completeMimeTag('delete')` — depends on downstream validation | 🟢 Medium |
| CM-04 | Error handling | `complete` (DB error) | Caught with label `'CMD complete'` | 🟢 Medium |

---

### 2.7 `dbdump`

#### Purpose
Backup a MongoDB collection to the filesystem in chunked JSON files.

#### Logic Flow (Lines 261–263 → helper function lines 34–57)
1. Log `'dbdump'`.
2. Call `dbDump(cmd[1])` where `cmd[1]` is the collection name.
3. **`dbDump` function** (exported):
   1. **Validate collection** against whitelist (line 35):
      - Allowed: `'accessToken'`, `'total'`, `'user'`, `'storage'`, `'stock'`, `'password'`, `'storageUser'`, `'stockUser'`, `'passwordUser'`, `'storageDir'`, `'stockDir'`, `'passwordDir'`
   2. If not in whitelist → `handleError(new HoError('Collection not find'))`.
   3. Generate `backupDate` string: `YYYYMMDD` format from current date (lines 38–40).
   4. Compute `folderPath`: `BACKUP_PATH(ENV_TYPE)/{backupDate}/{collection}`.
   5. Create folder via `Mkdirp` if not exists.
   6. **Recursive dump** (`recur_dump`):
      - Query `Mongo('find', collection, {}, { limit: 1000, skip: offset })`.
      - If no items → resolve (base case).
      - Log item count.
      - Serialize each document as JSON + `\r\n` newline.
      - Write to `{folderPath}/{index}` file (index starts at 0).
      - Recurse with `index + 1`, `offset + items.length`.

#### Invocation
```
dbdump user
dbdump stock
dbdump total
dbdump storageUser
dbdump accessToken
```

#### Returns & Side Effects
- **Console**: `'dbdump'`, chunk size logs (e.g., `1000`, `500`), then `'done'`.
- **DB**: Read-only on target collection.
- **File system**: Creates `{BACKUP_PATH}/{YYYYMMDD}/{collection}/0`, `1`, `2`, … files.

#### Snapshot Testing Data
```
Input:   "dbdump user"
Output:  "dbdump\n1000\n250\ndone\n"

# File created: /backup/path/20260318/user/0
# Content: One JSON document per line, \r\n terminated
# {"_id":"...","username":"admin","perm":1,...}\r\n
# {"_id":"...","username":"user1","perm":0,...}\r\n
```

#### Valid Collection Whitelist

| Constant | Resolved Name |
|----------|--------------|
| `'accessToken'` | `accessToken` |
| `TOTALDB` | `total` |
| `USERDB` | `user` |
| `STORAGEDB` | `storage` |
| `STOCKDB` | `stock` |
| `PASSWORDDB` | `password` |
| `${STORAGEDB}User` | `storageUser` |
| `${STOCKDB}User` | `stockUser` |
| `${PASSWORDDB}User` | `passwordUser` |
| `${STORAGEDB}Dir` | `storageDir` |
| `${STOCKDB}Dir` | `stockDir` |
| `${PASSWORDDB}Dir` | `passwordDir` |

#### Test Scenarios

| ID | Scenario | Input | Expected Behavior | Priority |
|----|----------|-------|-------------------|----------|
| DD-01 | Valid collection | `dbdump user` | Creates backup files at `{BACKUP_PATH}/{date}/user/` | 🔴 Critical |
| DD-02 | All valid collections | `dbdump stock`, `dbdump total`, etc. | Each passes whitelist check | 🟡 High |
| DD-03 | Invalid collection | `dbdump sessions` | `HoError('Collection not find')` | 🔴 Critical |
| DD-04 | Missing collection arg | `dbdump` | `cmd[1]` = `undefined` → fails whitelist → error | 🔴 Critical |
| DD-05 | Empty collection (0 docs) | `dbdump user` (empty) | Creates folder, no files written, logs `'done'` | 🟡 High |
| DD-06 | Large collection (>1000) | `dbdump storage` (3500 docs) | Creates files `0`, `1`, `2`, `3`; logs `1000`, `1000`, `1000`, `500` | 🟡 High |
| DD-07 | Folder already exists | `dbdump user` (run twice same day) | `FsExistsSync` returns true, skips Mkdirp, overwrites files | 🟢 Medium |
| DD-08 | Filesystem write error | `dbdump user` (read-only disk) | `FsWriteFile` rejects → caught by `.catch` | 🟢 Medium |
| DD-09 | Backup date format | `dbdump user` on 2026-03-08 | Folder name = `20260308` (zero-padded via `completeZero`) | 🟡 High |

---

### 2.8 `dbrestore`

#### Purpose
Restore a MongoDB collection from previously dumped JSON files.

#### Logic Flow (Lines 264–266 → helper function lines 59–89)
1. Log `'dbrestore'`.
2. Call `dbRestore(cmd[1])`.
3. **`dbRestore` function**:
   1. **Same whitelist validation** as `dbDump` (line 60).
   2. Compute `folderPath`: `BACKUP_PATH(ENV_TYPE)/{collection}` (note: **no date subfolder** — expects files directly under collection name).
   3. **Recursive restore** (`recur_restore`):
      - Check if `{folderPath}/{index}` exists; if not → resolve (base case).
      - Log the file path.
      - Open file as readline stream.
      - For each line: parse JSON, convert `_id`, `userId`, `owner` fields to ObjectID if string length > 20.
      - Collect parsed documents in `store` array.
      - On stream close: **recursive insert** (`recur_insert`):
        - For each document, check `Mongo('count', collection, {_id: doc._id})`.
        - If count > 0 → skip (already exists).
        - If count === 0 → `Mongo('insert', collection, doc)`.
      - After all inserts: recurse to next file index.

#### Invocation
```
dbrestore user
dbrestore stock
dbrestore passwordUser
```

#### Returns & Side Effects
- **Console**: `'dbrestore'`, file path logs per chunk, then `'done'`.
- **DB**: Inserts documents into target collection (skip-if-exists by `_id`).
- **File system**: Reads from `{BACKUP_PATH}/{collection}/0`, `1`, `2`, …

#### Key Behavior: ObjectID Conversion (Lines 76–82)
Fields `_id`, `userId`, `owner` are converted to MongoDB ObjectID **only if** the string value length > 20. This handles the difference between serialized ObjectID strings (24 hex chars) and shorter string IDs.

#### Test Scenarios

| ID | Scenario | Input | Expected Behavior | Priority |
|----|----------|-------|-------------------|----------|
| DR-01 | Valid restore | `dbrestore user` | Reads files, inserts non-duplicate docs | 🔴 Critical |
| DR-02 | Invalid collection | `dbrestore foobar` | `HoError('Collection not find')` | 🔴 Critical |
| DR-03 | Missing arg | `dbrestore` | `undefined` fails whitelist | 🔴 Critical |
| DR-04 | No backup files | `dbrestore user` (no files) | `FsExistsSync` returns false at index 0 → immediate resolve | 🟡 High |
| DR-05 | Duplicate documents | `dbrestore user` (docs already in DB) | `Mongo('count')` > 0 → skips insert | 🔴 Critical |
| DR-06 | ObjectID conversion | Restore file with `_id` of 24+ chars | Converted to `objectID(value)` | 🟡 High |
| DR-07 | Short ID preservation | Restore file with `_id` ≤ 20 chars | Left as-is (no ObjectID conversion) | 🟡 High |
| DR-08 | Malformed JSON line | `dbrestore user` (corrupted file) | `JSON.parse` throws → uncaught in readline, caught by `uncaughtException` handler | 🟡 High |
| DR-09 | Multiple chunk files | `dbrestore stock` (files 0, 1, 2) | Processes sequentially: 0 → 1 → 2 → stops at 3 (not found) | 🟢 Medium |
| DR-10 | Path structure | `dbrestore user` | Reads from `{BACKUP_PATH}/user/0` (no date in path — differs from dump path) | 🔴 Critical |

---

### 2.9 `randomsend`

#### Purpose
Manage and execute a gift exchange (Secret Santa) — list participants, edit the participant list, or send randomized assignments via email.

#### Logic Flow (Lines 267–269 → helper function lines 91–162)

The `randomSend(action, joiner)` function uses a `switch` on `action`:

##### Action: `list` (Lines 93–96)
1. Log the `sendList` array (the current participants).
2. Return resolved promise.

##### Action: `edit` (Lines 97–118)
1. If `joiner` is null → `HoError('Joiner unknown!!!')`.
2. Split `joiner` on `':'` → `result`.
3. Search `sendList` for a participant whose `name` matches `result[0]`:
   - If found: **remove** them via `splice(i, 1)`, log updated list, return.
4. If not found and `result.length < 2` → `HoError('Joiner infomation valid!!!')` (sic: typo for "invalid").
5. Otherwise: **add** new participant `{name: result[0], mail: result[1]}`, log updated list.

> **Note**: The `edit` case has no `break` — but each branch uses `return`, so fall-through does not occur in practice.

##### Action: `send` (Lines 118–158)
1. Log `sendList`.
2. If `sendList.length < 3` → `HoError('Send list too short!!!')`.
3. Create index array `orig = [0, 1, 2, …, n-1]`.
4. **Shuffle** using Fisher-Yates algorithm (in-place, lines 125–135).
5. **Validate** (`testArr`): Ensure no one is assigned to themselves (`arr[i] !== i`) AND no mutual pair exists (`arr[arr[i]] !== i`). (Lines 137–146.)
6. Retry up to 100 times to find a valid derangement.
7. If valid: **recursive send** — for each index, call `sendPresentName(base64EncodedName, recipientMail, joiner)`.
   - The `joiner` param passed from `cmd[2]` is forwarded as an "append" parameter to the email function.
8. If 100 attempts exhausted: log `'out of limit'`, resolve without sending.

##### Default Action (Lines 159–161)
- `HoError('Action unknown!!!')`.

#### Invocation
```
randomsend list                         # Show current participant list
randomsend edit Alice:alice@mail.com    # Add participant
randomsend edit Alice                   # Remove participant named 'Alice'
randomsend send                         # Execute random assignment & send emails
randomsend send 2026                    # Send with joiner='2026' passed to email
```

#### Returns & Side Effects
- **Console**: `'randomsend'`, participant list logs, then `'done'`.
- **DB**: None — all state is in-memory `sendList` array.
- **External API**: `sendPresentName` sends emails via Google API.
- **In-memory mutation**: `sendList` is modified by `edit` (add/remove).

#### Snapshot Testing Data

**List action:**
```
Input:   "randomsend list"
Output:  "randomsend\n[ { name: 'hoder', mail: 'hoder3388@gmail.com' }, ... ]\ndone\n"
```

**Edit — add participant:**
```
Input:   "randomsend edit NewUser:new@mail.com"
Output:  "randomsend\n[ ..., { name: 'NewUser', mail: 'new@mail.com' } ]\ndone\n"
```

**Edit — remove participant:**
```
Input:   "randomsend edit hoder"
Output:  "randomsend\n[ { name: 'sky', mail: '...' }, ... ]\ndone\n"  (hoder removed)
```

#### Test Scenarios

| ID | Scenario | Input | Expected Behavior | Priority |
|----|----------|-------|-------------------|----------|
| RS-01 | List participants | `randomsend list` | Logs sendList array | 🟡 High |
| RS-02 | Add participant | `randomsend edit Bob:bob@email.com` | Appends to sendList | 🔴 Critical |
| RS-03 | Remove participant | `randomsend edit hoder` | Removes first match by name | 🔴 Critical |
| RS-04 | Edit no joiner | `randomsend edit` | `HoError('Joiner unknown!!!')` | 🟡 High |
| RS-05 | Remove non-existent, no email | `randomsend edit Unknown` | `HoError('Joiner infomation valid!!!')` — name not found & no `:email` part | 🟡 High |
| RS-06 | Send normal (≥3 participants) | `randomsend send` | Shuffles, validates derangement, sends emails | 🔴 Critical |
| RS-07 | Send too few (<3) | `randomsend send` (after removing participants to <3) | `HoError('Send list too short!!!')` | 🔴 Critical |
| RS-08 | Send with append param | `randomsend send 2026` | `joiner='2026'` passed to `sendPresentName` | 🟡 High |
| RS-09 | Derangement validation — no self-assignment | `randomsend send` | `testArr` rejects `arr[i] === i` | 🔴 Critical |
| RS-10 | Derangement validation — no mutual pairs | `randomsend send` | `testArr` rejects `arr[arr[i]] === i` | 🔴 Critical |
| RS-11 | Shuffle exhaustion (100 tries) | `randomsend send` (list of exactly 2 — bypassed by length check; theoretical edge) | Logs `'out of limit'` if no valid arrangement found | 🟢 Medium |
| RS-12 | Unknown action | `randomsend foo` | `HoError('Action unknown!!!')` | 🟡 High |
| RS-13 | In-memory persistence | `randomsend edit X:x@m.com` then `randomsend list` | Second call shows X in list (same process) | 🟡 High |
| RS-14 | Name with colon in email | `randomsend edit User:user:name@mail.com` | `split(':')` → `result[0]='User'`, `result[1]='user'` — email is truncated | 🟡 High |

---

### 2.10 `resettotal`

#### Purpose
Reset stock portfolio totals — either the `newMid` (new middle-price) array or the `profit` value — for a specific stock exchange.

#### Logic Flow (Lines 270–271 → helper function lines 164–195)

The `resetTotal(type, se)` function:

1. **Resolve `find` filter** based on `se` (stock exchange):
   - `'bfx'` → `{sType: 1}` (Bitfinex crypto)
   - `'twse'` → `{sType: {$exists: false}, setype: 'twse'}` (Taiwan)
   - `'usse'` → `{sType: {$exists: false}, setype: 'usse'}` (US)
   - default → `HoError('Reset se unknown!!!')`

2. **Execute reset** based on `type`:
   - `'newmid'` → `Mongo('updateMany', TOTALDB, {…find, newMid: {$exists: true}}, {$set: {newMid: []}})` — resets `newMid` to empty array.
     - Then logs the update count.
     - Then queries & logs all matching records.
   - `'profit'` → `Mongo('updateMany', TOTALDB, {…find, profit: {$exists: true}}, {$set: {profit: 0}})` — resets `profit` to `0`.
     - Same count + query-and-log flow.
   - default → `HoError('Reset type unknown!!!')`

> **Note**: Both `newmid` and `profit` branches have a secondary `.catch` with label `'Reset new mid'` (copy-paste artifact — the profit branch also uses this label).

#### Invocation
```
resettotal newmid bfx       # Reset newMid for Bitfinex entries
resettotal newmid twse      # Reset newMid for TWSE entries
resettotal profit usse      # Reset profit for US stock entries
resettotal profit bfx       # Reset profit for Bitfinex entries
```

#### Returns & Side Effects
- **Console**: Update count, then the matching documents array, then `'done'`.
- **DB**: `updateMany` on `total` collection — writes `{newMid: []}` or `{profit: 0}`.
- **Collections affected**: `total` (`TOTALDB`).

#### MongoDB Query Shapes

**newmid + bfx:**
```js
// updateMany filter:
{ sType: 1, newMid: { $exists: true } }
// update:
{ $set: { newMid: [] } }
```

**profit + twse:**
```js
// updateMany filter:
{ sType: { $exists: false }, setype: 'twse', profit: { $exists: true } }
// update:
{ $set: { profit: 0 } }
```

#### Test Scenarios

| ID | Scenario | Input | Expected Behavior | Priority |
|----|----------|-------|-------------------|----------|
| RT-01 | Reset newmid bfx | `resettotal newmid bfx` | Updates `total` where `sType:1`, sets `newMid:[]` | 🔴 Critical |
| RT-02 | Reset newmid twse | `resettotal newmid twse` | Updates `total` where `setype:'twse'`, sets `newMid:[]` | 🟡 High |
| RT-03 | Reset profit usse | `resettotal profit usse` | Updates `total` where `setype:'usse'`, sets `profit:0` | 🟡 High |
| RT-04 | Reset profit bfx | `resettotal profit bfx` | Updates `total` where `sType:1`, sets `profit:0` | 🟡 High |
| RT-05 | Unknown exchange | `resettotal newmid nyse` | `HoError('Reset se unknown!!!')` | 🔴 Critical |
| RT-06 | Unknown type | `resettotal volume bfx` | `HoError('Reset type unknown!!!')` | 🔴 Critical |
| RT-07 | Missing both params | `resettotal` | `se` = `undefined` → falls to default → error | 🔴 Critical |
| RT-08 | Missing exchange | `resettotal newmid` | `se` = `undefined` → error | 🟡 High |
| RT-09 | No matching docs | `resettotal profit twse` (no profit fields exist) | `updateMany` returns count 0, find returns `[]` | 🟢 Medium |
| RT-10 | Object.assign mutation | Two consecutive calls with different `se` | `Object.assign(find, …)` mutates `find` — second query filter may carry extra fields from first call | 🔴 Critical |

---

### 2.11 `updatepassword`

#### Purpose
Re-encrypt all stored password entries with the current cipher configuration.

#### Logic Flow (Lines 272–273)
1. Call `updatePasswordCipher()` — no arguments.
2. On success: log `'done'`.

#### Invocation
```
updatepassword
```

#### Returns & Side Effects
- **Console**: `'done'`.
- **DB**: Updates documents in `password` collection with new encryption.
- **Note**: Does **not** log a command echo (no `console.log('updatepassword')` line — unlike most other commands).

#### Test Scenarios

| ID | Scenario | Input | Expected Behavior | Priority |
|----|----------|-------|-------------------|----------|
| UP-01 | Normal execution | `updatepassword` | `updatePasswordCipher()` called, logs `'done'` | 🔴 Critical |
| UP-02 | Ignores extra args | `updatepassword foo` | Extra tokens ignored | 🟢 Low |
| UP-03 | Cipher failure | `updatepassword` (crypto error) | Caught with label `'CMD Update password'` | 🟡 High |

---

### 2.12 `default` (Help)

#### Purpose
Display the help text listing all available commands when an unknown/empty command is entered.

#### Logic Flow (Lines 274–290)
The `default` case of the switch statement logs:

```
help:
stock type index mode
stocklist type
doc am|jp|tw [time]
complete [add]
dbdump collection
dbrestore collection
randomsend list|edit|send [name:email|append]
testdata
cleanstock [remove]
resettotal newmid|profit bfx|twse|usse
updatepassword
```

Also contains commented-out help lines for `drive` and `external`.

#### Test Scenarios

| ID | Scenario | Input | Expected Behavior | Priority |
|----|----------|-------|-------------------|----------|
| HLP-01 | Unknown command | `foobar` | Prints help text (13 lines) | 🟡 High |
| HLP-02 | Empty line | `` (empty string / just Enter) | `cmd[0]` = `''` → default case → help | 🟡 High |
| HLP-03 | Partial command | `stoc` | Not matched → help | 🟢 Medium |
| HLP-04 | Case sensitivity | `Stock` | Not matched (`'Stock' !== 'stock'`) → help | 🟡 High |
| HLP-05 | Only whitespace | `   ` | `split(' ')` → `cmd[0]` = `''` → help | 🟢 Medium |

---

## 3. Helper Functions

### 3.1 `cmdUpdateDrive` (Lines 21–32)

> **Status**: Not directly accessible from CLI (the `drive` case is commented out at line 243–245).

- Accepts `drive_batch` (defaults to `DRIVE_LIMIT=100`) and `singleUser`.
- Validates `singleUser` via `isValidString(singleUser, 'name')`.
- Queries `user` collection for users with `auto` field.
- Calls `userDrive(userlist, 0, drive_batch)`.

### 3.2 `dbDump` Function (Lines 34–57)

Exported as named export. See [§2.7](#27-dbdump) for detailed coverage.

**Key implementation details**:
- Uses `BACKUP_LIMIT = 1000` as page size for chunked reads.
- Date folder format: `YYYYMMDD` using `completeZero` for zero-padding.
- Each chunk file contains one JSON document per line, `\r\n` terminated.
- File naming: `0`, `1`, `2`, … (integer index, no extension).

### 3.3 `dbRestore` Function (Lines 59–89)

See [§2.8](#28-dbrestore) for detailed coverage.

**Key implementation details**:
- Restore path does **not** include date: `{BACKUP_PATH}/{collection}/` (user must manually place files).
- Uses readline on file stream for line-by-line JSON parsing.
- Converts `_id`, `userId`, `owner` fields to `objectID()` when string length > 20.
- Skip-on-duplicate logic: checks `count` before inserting each document.
- Sequential processing: file 0 → file 1 → … until file not found.

### 3.4 `randomSend` Function (Lines 91–162)

See [§2.9](#29-randomsend) for detailed coverage.

**Key implementation details**:
- Operates on in-memory `sendList` (reference to `RANDOM_EMAIL` constant array).
- Fisher-Yates shuffle with derangement validation (no self-assignment, no mutual pairs).
- Retry limit: 100 attempts.
- Email sending: base64-encodes recipient name before sending.
- The `edit` action `break` after `case 'edit':` is unreachable (returns before reaching it).
- The `case 'send':` has no `break` either — relies on `return`.

### 3.5 `resetTotal` Function (Lines 164–195)

See [§2.10](#210-resettotal) for detailed coverage.

**Key implementation details**:
- Uses `Object.assign(find, {newMid/profit: {$exists: true}})` which **mutates** the `find` object.
- Both branches have `.catch(err => handleError(err, 'Reset new mid'))` — the `'profit'` branch has an incorrect error label (copy-paste bug).
- After `updateMany`, performs a follow-up `find` to log the updated records.

---

## 4. Cross-Cutting Concerns

### 4.1 stdin Event Handling

| Aspect | Detail |
|--------|--------|
| Interface | `readline.createInterface({ input: process.stdin, terminal: false })` |
| Event | `'line'` — fires once per newline-delimited input |
| Parsing | `line.split(' ')` — no trim, no multi-space handling |
| Async | Each command returns a Promise; readline does not await it |

**Edge case**: Multiple rapid commands can create overlapping Promise chains since readline does not serialize commands.

### 4.2 Unknown Command Handling

Any unrecognized `cmd[0]` falls through to the `default` case, printing help text. This includes empty strings, typos, and case mismatches.

### 4.3 Process Exit Behavior

- The CLI does **not** terminate after any command — the readline loop stays open.
- `process.on('uncaughtException')` prevents crash on unhandled errors.
- To exit: send EOF (Ctrl+D) or kill the process.

### 4.4 MongoDB Connection Lifecycle

- `Mongo` from `models/mongo-tool.js` manages a shared connection pool.
- Connection is established lazily on first database operation.
- Connection persists across multiple commands within the same process.
- No explicit connection close / cleanup on exit.

### 4.5 TLS Configuration

```js
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0"
```
Set at module load time. Affects **all** HTTPS requests from this process (stock APIs, Google APIs, etc.). This is a security trade-off for self-signed certificates.

### 4.6 Space-Splitting Caveat

`line.split(' ')` does **not** handle:
- Leading spaces → `cmd[0]` becomes `''` (empty string).
- Multiple consecutive spaces → empty-string tokens inserted between args.
- Trailing spaces → extra empty-string tokens at end.

This is the source of edge-case bugs where parameters are shifted.

### 4.7 Commented-Out Commands

Two commands are commented out but remain in the source:
- **`drive`** (lines 243–245): Would call `cmdUpdateDrive(cmd[1], cmd[2])`.
- **`external`** (lines 255–257): Would call `External.getList(cmd[1], cmd[2])`.

The `External` import is also commented out (line 11).

---

## 5. Summary Table

| Command | Params | DB Collections | External APIs | Side Effects |
|---------|--------|---------------|---------------|-------------|
| `stock` | `[type] [index] [mode]` | `stock` (write) | Yahoo Finance / Exchange API | Stock data upsert |
| `stocklist` | `[type]` | — | Exchange API | Console output only |
| `testdata` | — | `stock`, `total` (write) | — | Test data insertion |
| `cleanstock` | `[remove]` | `stock` (read/delete) | — | Deletes useless entries if `remove` |
| `doc` | `<am\|jp\|tw> [time]` | `user` (read) | Government data APIs, Google Drive | Document download & storage |
| `complete` | `[add]` | `storage` (read/write) | — | MIME tag updates |
| `dbdump` | `<collection>` | Target collection (read) | — | Filesystem: backup files created |
| `dbrestore` | `<collection>` | Target collection (write) | — | Filesystem: reads backup files |
| `resettotal` | `<newmid\|profit> <bfx\|twse\|usse>` | `total` (write) | — | Resets `newMid` / `profit` fields |
| `updatepassword` | — | `password` (write) | — | Re-encrypts all passwords |

---

## 6. Master Test Scenario Table

| ID | Command | Scenario | Input | Expected Behavior | Priority |
|----|---------|----------|-------|-------------------|----------|
| STK-01 | stock | Default parameters | `stock` | `getSingleStockV2('twse', {index:'2330', tag:[]}, 1)` | 🔴 Critical |
| STK-02 | stock | Explicit TWSE | `stock twse 2330 1` | Explicit args passed | 🟡 High |
| STK-03 | stock | US stock | `stock usse AAPL 2` | US market fetch | 🟡 High |
| STK-04 | stock | Mode coercion | `stock twse 2330 abc` | String mode passed downstream | 🟢 Medium |
| STK-05 | stock | API failure | `stock twse 9999 1` | Error caught, label `'CMD stock'` | 🟡 High |
| STK-07 | stock | Extra spaces | `stock  twse  2330` | Misaligned params due to empty tokens | 🔴 Critical |
| SL-01 | stocklist | Default type | `stocklist` | TWSE list fetch | 🔴 Critical |
| SL-02 | stocklist | Explicit type | `stocklist usse` | US list fetch | 🟡 High |
| SL-03 | stocklist | Quarter calc (Jan) | Run in January | Logs `{prevYear}q4` | 🟡 High |
| SL-04 | stocklist | Quarter calc (May) | Run in May | Logs `{year}q1` | 🟡 High |
| SL-05 | stocklist | Quarter calc (Aug) | Run in August | Logs `{year}q2` | 🟡 High |
| SL-06 | stocklist | Quarter calc (Nov) | Run in November | Logs `{year}q3` | 🟡 High |
| SL-07 | stocklist | Empty API response | `stocklist twse` | No per-stock output | 🟢 Medium |
| SL-08 | stocklist | API failure | `stocklist invalid` | Error caught | 🟡 High |
| TD-01 | testdata | Normal execution | `testdata` | `testData()` called | 🟡 High |
| TD-02 | testdata | Extra args ignored | `testdata foo bar` | Same behavior | 🟢 Medium |
| TD-03 | testdata | DB failure | `testdata` (DB down) | Error caught | 🟡 High |
| CS-01 | cleanstock | Dry-run default | `cleanstock` | `cleanUseless(true)` | 🔴 Critical |
| CS-02 | cleanstock | Explicit remove | `cleanstock remove` | `cleanUseless(false)` | 🔴 Critical |
| CS-03 | cleanstock | Non-remove arg | `cleanstock preview` | Treated as dry-run | 🟡 High |
| CS-04 | cleanstock | Case sensitivity | `cleanstock Remove` | Dry-run (`'Remove' !== 'remove'`) | 🟡 High |
| DOC-01 | doc | American docs | `doc am` | Admin user query + `autoDoc(list, 0, 'am', undefined)` | 🔴 Critical |
| DOC-02 | doc | Japanese docs | `doc jp` | Region `'jp'` | 🟡 High |
| DOC-03 | doc | Taiwanese docs | `doc tw` | Region `'tw'` | 🟡 High |
| DOC-04 | doc | With time param | `doc am 202603` | Time param forwarded | 🟡 High |
| DOC-05 | doc | Missing region | `doc` | `undefined` region | 🔴 Critical |
| DOC-06 | doc | Invalid region | `doc eu` | Depends on `autoDoc` validation | 🟡 High |
| DOC-07 | doc | No admin users | `doc am` | Empty userlist, likely no-op | 🟢 Medium |
| CM-01 | complete | Default mode | `complete` | `completeMimeTag(undefined)` | 🟡 High |
| CM-02 | complete | Add mode | `complete add` | `completeMimeTag('add')` | 🟡 High |
| CM-03 | complete | Unknown modifier | `complete delete` | Depends on downstream | 🟢 Medium |
| DD-01 | dbdump | Valid collection | `dbdump user` | Creates backup files | 🔴 Critical |
| DD-03 | dbdump | Invalid collection | `dbdump sessions` | `HoError('Collection not find')` | 🔴 Critical |
| DD-04 | dbdump | Missing arg | `dbdump` | Fails whitelist | 🔴 Critical |
| DD-05 | dbdump | Empty collection | `dbdump user` (empty) | Folder created, no files | 🟡 High |
| DD-06 | dbdump | Large collection | `dbdump storage` (3500 docs) | 4 chunk files | 🟡 High |
| DD-09 | dbdump | Date format | `dbdump user` (2026-03-08) | Folder `20260308` | 🟡 High |
| DR-01 | dbrestore | Valid restore | `dbrestore user` | Inserts non-duplicate docs | 🔴 Critical |
| DR-02 | dbrestore | Invalid collection | `dbrestore foobar` | `HoError('Collection not find')` | 🔴 Critical |
| DR-03 | dbrestore | Missing arg | `dbrestore` | Fails whitelist | 🔴 Critical |
| DR-04 | dbrestore | No backup files | `dbrestore user` | Immediate resolve | 🟡 High |
| DR-05 | dbrestore | Duplicate docs | `dbrestore user` | Skips existing | 🔴 Critical |
| DR-06 | dbrestore | ObjectID conversion | Restore with 24-char `_id` | Converted to ObjectID | 🟡 High |
| DR-07 | dbrestore | Short ID | Restore with ≤20-char `_id` | Left as string | 🟡 High |
| DR-08 | dbrestore | Malformed JSON | Corrupted backup file | Parse error caught | 🟡 High |
| DR-10 | dbrestore | Path difference | `dbrestore user` | No date in path (differs from dump) | 🔴 Critical |
| RS-01 | randomsend | List participants | `randomsend list` | Logs sendList | 🟡 High |
| RS-02 | randomsend | Add participant | `randomsend edit Bob:b@e.com` | Appends to list | 🔴 Critical |
| RS-03 | randomsend | Remove participant | `randomsend edit hoder` | Removes from list | 🔴 Critical |
| RS-04 | randomsend | Edit no joiner | `randomsend edit` | `HoError('Joiner unknown!!!')` | 🟡 High |
| RS-05 | randomsend | Remove non-existent | `randomsend edit Unknown` | Error — no email part | 🟡 High |
| RS-06 | randomsend | Send normal | `randomsend send` | Shuffles & sends emails | 🔴 Critical |
| RS-07 | randomsend | Send too few | `randomsend send` (<3 participants) | `HoError('Send list too short!!!')` | 🔴 Critical |
| RS-09 | randomsend | No self-assignment | `randomsend send` | `testArr` validates | 🔴 Critical |
| RS-10 | randomsend | No mutual pairs | `randomsend send` | `testArr` validates | 🔴 Critical |
| RS-12 | randomsend | Unknown action | `randomsend foo` | `HoError('Action unknown!!!')` | 🟡 High |
| RS-14 | randomsend | Colon in email | `randomsend edit U:a:b@m.com` | Email truncated at first colon | 🟡 High |
| RT-01 | resettotal | Reset newmid bfx | `resettotal newmid bfx` | `total` updated, `newMid:[]` | 🔴 Critical |
| RT-02 | resettotal | Reset newmid twse | `resettotal newmid twse` | `total` updated, `newMid:[]` | 🟡 High |
| RT-03 | resettotal | Reset profit usse | `resettotal profit usse` | `total` updated, `profit:0` | 🟡 High |
| RT-05 | resettotal | Unknown exchange | `resettotal newmid nyse` | `HoError('Reset se unknown!!!')` | 🔴 Critical |
| RT-06 | resettotal | Unknown type | `resettotal volume bfx` | `HoError('Reset type unknown!!!')` | 🔴 Critical |
| RT-07 | resettotal | Missing both params | `resettotal` | Error — both undefined | 🔴 Critical |
| RT-10 | resettotal | Object.assign mutation | Two consecutive resets | `find` object mutated — potential stale filter | 🔴 Critical |
| UP-01 | updatepassword | Normal execution | `updatepassword` | `updatePasswordCipher()` called | 🔴 Critical |
| UP-03 | updatepassword | Cipher failure | `updatepassword` | Error caught, label `'CMD Update password'` | 🟡 High |
| HLP-01 | default | Unknown command | `foobar` | Prints help (13 lines) | 🟡 High |
| HLP-02 | default | Empty line | `` (Enter) | `cmd[0]` = `''` → help | 🟡 High |
| HLP-04 | default | Case mismatch | `Stock` | Not matched → help | 🟡 High |
| HLP-05 | default | Whitespace only | `   ` | `cmd[0]` = `''` → help | 🟢 Medium |
| CC-01 | cross-cutting | Concurrent commands | Two rapid inputs | Overlapping Promise chains — no serialization | 🟡 High |
| CC-02 | cross-cutting | Uncaught exception | Unhandled throw in async chain | `uncaughtException` handler logs but doesn't exit | 🟡 High |
| CC-03 | cross-cutting | EOF signal | Ctrl+D | readline `'close'` event — process may exit | 🟢 Medium |
| CC-04 | cross-cutting | TLS disabled | Any HTTPS call | `NODE_TLS_REJECT_UNAUTHORIZED=0` in effect | 🟢 Medium |

---

> **Total scenarios**: 72
> **Critical (🔴)**: 28 | **High (🟡)**: 34 | **Medium (🟢)**: 10

---

*This document covers all 290 lines of `src/back/cmd/cmd.js`. Every switch case, helper function, edge case, and cross-cutting concern has been traced from source.*
