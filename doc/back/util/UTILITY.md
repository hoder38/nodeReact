# `src/back/util/utility.js` — Technical Documentation & Test Strategy

> **Module**: Backend Utility Library (shared across all controllers and models)
> **Lines**: ~510 | **Exports**: 22 functions
> **Priority**: 🔴 Critical — Phase 1 (ref: `doc/OUTLINE.md` §11.9)
> **Test File**: `src/back/util/__tests__/utility.test.js`

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Dependencies](#2-dependencies)
3. [Exported Functions](#3-exported-functions)
   - 3.1 [isValidString](#31-isvalidstring)
   - 3.2 [toValidName](#32-tovalidname)
   - 3.3 [userPWCheck](#33-userpwcheck)
   - 3.4 [checkAdmin](#34-checkadmin)
   - 3.5 [HoError](#35-hoerror)
   - 3.6 [handleError](#36-handleerror)
   - 3.7 [showLog](#37-showlog)
   - 3.8 [checkLogin](#38-checklogin)
   - 3.9 [big5Encode](#39-big5encode)
   - 3.10 [selectRandom](#310-selectrandom)
   - 3.11 [getStorageItem](#311-getstorageitem)
   - 3.12 [getPasswordItem](#312-getpassworditem)
   - 3.13 [getStockItem](#313-getstockitem)
   - 3.14 [getFitnessItem](#314-getfitnessitem)
   - 3.15 [getRankItem](#315-getrankitem)
   - 3.16 [getFileLocation](#316-getfilelocation)
   - 3.17 [deleteFolderRecursive](#317-deletefolderrecursive)
   - 3.18 [SRT2VTT](#318-srt2vtt)
   - 3.19 [bufferToString](#319-buffertostring)
   - 3.20 [getJson](#320-getjson)
   - 3.21 [torrent2Magnet](#321-torrent2magnet)
   - 3.22 [sortList](#322-sortlist)
   - 3.23 [completeZero](#323-completezero)
   - 3.24 [findTag](#324-findtag)
   - 3.25 [convertTimestampToDate](#325-converttimestamptodate)
   - 3.26 [addPre](#326-addpre)
4. [Internal (Non-Exported) Functions](#4-internal-non-exported-functions)
   - 4.1 [showError](#41-showerror)
5. [Module-Level State](#5-module-level-state)
6. [Cross-Cutting Test Concerns](#6-cross-cutting-test-concerns)

---

## 1. Module Overview

`utility.js` is the backbone utility module of the ANoMoPi backend. It is imported by **every controller** (17 routers), **every model** (14 tools), and both CLI entry points. It provides:

| Category | Functions |
|----------|-----------|
| **Input Validation** | `isValidString`, `toValidName` |
| **Authentication & Authorization** | `checkLogin`, `checkAdmin`, `userPWCheck` |
| **Error Handling** | `HoError` (constructor), `handleError`, `showError` (internal) |
| **Middleware** | `showLog`, `checkLogin` |
| **Data Formatters** | `getStorageItem`, `getPasswordItem`, `getStockItem`, `getFitnessItem`, `getRankItem` |
| **File System** | `getFileLocation`, `deleteFolderRecursive`, `SRT2VTT`, `sortList` |
| **Encoding / Parsing** | `big5Encode`, `bufferToString`, `getJson` |
| **Misc Helpers** | `selectRandom`, `completeZero`, `findTag`, `torrent2Magnet`, `convertTimestampToDate`, `addPre` |

---

## 2. Dependencies

| Import | Source | Used By |
|--------|--------|---------|
| `RE_WEBURL` | `../constants.js` | `isValidString('url')` |
| `ENV_TYPE` | `../../../ver.js` | `getFileLocation` |
| `NAS_PREFIX` | `../config.js` | `getFileLocation` |
| `objectID` | `../models/mongo-tool.js` | `isValidString('uid')` |
| `MobileDetect` | `mobile-detect` | `checkLogin` |
| `createHash` | `crypto` | `userPWCheck`, `getFileLocation` |
| `iconvLite` | `iconv-lite` | `big5Encode`, `bufferToString` |
| `pathModule` | `path` | `getFileLocation` |
| `fsModule` | `fs` | `deleteFolderRecursive`, `SRT2VTT` |
| `jsCharDet` | `jschardet` | `bufferToString` |
| `Ass2vtt` | `ass-to-vtt` | `SRT2VTT` |

**Mock Requirements**: `objectID`, `MobileDetect`, `crypto.createHash`, `iconv-lite`, `fs`, `jschardet`, `ass-to-vtt`, `RE_WEBURL`, `NAS_PREFIX`, `ENV_TYPE`.

---

## 3. Exported Functions

---

### 3.1 `isValidString`

**Priority**: 🔴 Critical

#### Purpose

Central input validation gate. Validates and sanitizes a value against a named type. Returns the cleaned value on success or `false` on failure. Used in virtually every route handler to validate user input before processing.

#### Signature

```js
export function isValidString(str, type)
```

| Param | Type | Description |
|-------|------|-------------|
| `str` | `string \| number \| object` | Value to validate |
| `type` | `string` | Validation type (see table below) |

#### Logic Flow

```
1. IF typeof str is 'string' OR 'number':
   a. Convert to UTF-8 string (Buffer round-trip for strings, .toString() for numbers)
   b. SWITCH on type:
      - 'name'        → trim, reject '.'/'..' , regex [^\\\/\|\*\?"<>:]{1,500}, reject whitespace-only
      - 'desc'        → encode [[...]] content, regex [^\\\/\|\*\?\'"<>\`:&]{0,500}
      - 'perm'        → Number, 0 ≤ n < 32
      - 'parentIndex' → Number, 1 ≤ n ≤ 10
      - 'int'         → Number, n > 0
      - 'zeroint'     → Number, n ≥ 0
      - 'passwd'      → regex [0-9a-zA-Z!@#$%]{6,20}
      - 'verify'      → regex [0-9]{4}
      - 'altpwd'      → regex [0-9a-zA-Z\._!@#$%;\u4e00-\u9fa5]{2,30}
      - 'url'         → RE_WEBURL OR magnet link → encodeURIComponent
      - 'uid'         → regex [0-9a-f]{24} → objectID()
      - 'email'       → standard email regex
2. ELSE IF type === 'uid' AND typeof str === 'object':
   a. toString(), validate hex-24, return objectID()
3. console.log invalid string
4. return false
```

#### Returns & Side Effects

| Condition | Return | Side Effect |
|-----------|--------|-------------|
| Valid input | Cleaned/converted value (string, number, or ObjectID) | None |
| Invalid input | `false` | `console.log('invalid string ${type} ${str}')` |

#### Snapshot Testing Data

```js
// 'name' type
{ input: ['  My File  ', 'name'],   expected: 'My File' }
{ input: ['.', 'name'],             expected: false }
{ input: ['..', 'name'],            expected: false }

// 'uid' type (string)
{ input: ['507f1f77bcf86cd799439011', 'uid'], expected: objectID('507f1f77bcf86cd799439011') }

// 'uid' type (object)
{ input: [ObjectId('507f1f77bcf86cd799439011'), 'uid'], expected: objectID('507f1f77bcf86cd799439011') }

// 'perm' type
{ input: ['0', 'perm'],  expected: 0 }
{ input: ['31', 'perm'], expected: 31 }
{ input: ['32', 'perm'], expected: false }

// 'email' type
{ input: ['user@example.com', 'email'], expected: 'user@example.com' }
{ input: ['bad@@email', 'email'],       expected: false }
```

#### Comprehensive Test Scenarios

**Logical Branches (by type)**:

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | `name` — valid trimmed | `('hello', 'name')` | `'hello'` |
| 2 | `name` — leading/trailing spaces | `('  hi  ', 'name')` | `'hi'` |
| 3 | `name` — dot | `('.', 'name')` | `false` |
| 4 | `name` — double dot | `('..', 'name')` | `false` |
| 5 | `name` — contains backslash | `('a\\b', 'name')` | `false` |
| 6 | `name` — contains colon | `('a:b', 'name')` | `false` |
| 7 | `name` — contains `?` `*` `"` `<` `>` `\|` `/` | Each individually | `false` |
| 8 | `name` — allows `'`, `` ` ``, `&` | `("it's", 'name')` | `"it's"` |
| 9 | `name` — whitespace-only | `('   ', 'name')` | `false` |
| 10 | `name` — fullwidth whitespace only | `('　', 'name')` | `false` |
| 11 | `name` — 500 char boundary valid | 500-char string | valid |
| 12 | `name` — 501 char boundary invalid | 501-char string | `false` |
| 13 | `desc` — valid | `('hello', 'desc')` | `'hello'` |
| 14 | `desc` — encodes `[[...]]` content | `('[[foo bar]]', 'desc')` | `'[[foo%20bar]]'` |
| 15 | `desc` — contains forbidden chars (`\`, `'`, `&`, etc.) | `("it's", 'desc')` | `false` |
| 16 | `desc` — empty string | `('', 'desc')` | `''` |
| 17 | `desc` — 500 char boundary valid | 500-char string | valid |
| 18 | `desc` — 501 char boundary invalid | 501-char string | `false` |
| 19 | `perm` — zero | `('0', 'perm')` | `0` |
| 20 | `perm` — upper bound 31 | `('31', 'perm')` | `31` |
| 21 | `perm` — out-of-range 32 | `('32', 'perm')` | `false` |
| 22 | `perm` — negative | `('-1', 'perm')` | `false` |
| 23 | `parentIndex` — valid 1 | `('1', 'parentIndex')` | `1` |
| 24 | `parentIndex` — valid 10 | `('10', 'parentIndex')` | `10` |
| 25 | `parentIndex` — zero (invalid) | `('0', 'parentIndex')` | `false` |
| 26 | `parentIndex` — 11 (out-of-range) | `('11', 'parentIndex')` | `false` |
| 27 | `int` — positive | `('5', 'int')` | `5` |
| 28 | `int` — zero (invalid) | `('0', 'int')` | `false` |
| 29 | `int` — negative | `('-1', 'int')` | `false` |
| 30 | `zeroint` — zero | `('0', 'zeroint')` | `0` |
| 31 | `zeroint` — positive | `('99', 'zeroint')` | `99` |
| 32 | `zeroint` — negative | `('-1', 'zeroint')` | `false` |
| 33 | `passwd` — valid 6 chars | `('Abc12!', 'passwd')` | `'Abc12!'` |
| 34 | `passwd` — valid 20 chars | 20-char alnum+special | valid |
| 35 | `passwd` — too short (5) | `('Ab12!', 'passwd')` | `false` |
| 36 | `passwd` — too long (21) | 21-char string | `false` |
| 37 | `passwd` — forbidden char `^` | `('Abc12^', 'passwd')` | `false` |
| 38 | `verify` — valid 4 digits | `('1234', 'verify')` | `'1234'` |
| 39 | `verify` — 3 digits | `('123', 'verify')` | `false` |
| 40 | `verify` — 5 digits | `('12345', 'verify')` | `false` |
| 41 | `verify` — contains letter | `('12a4', 'verify')` | `false` |
| 42 | `altpwd` — valid basic | `('Ab', 'altpwd')` | `'Ab'` |
| 43 | `altpwd` — valid CJK chars | `('中文', 'altpwd')` | `'中文'` |
| 44 | `altpwd` — 30 char boundary | 30-char string | valid |
| 45 | `altpwd` — 31 chars (invalid) | 31-char string | `false` |
| 46 | `altpwd` — 1 char (invalid) | `('A', 'altpwd')` | `false` |
| 47 | `url` — valid http | `('http://example.com', 'url')` | `encodeURIComponent(...)` |
| 48 | `url` — valid https | `('https://example.com', 'url')` | `encodeURIComponent(...)` |
| 49 | `url` — valid magnet | `('magnet:?xt=urn:btih:abc123...', 'url')` | `encodeURIComponent(...)` |
| 50 | `url` — invalid | `('not-a-url', 'url')` | `false` |
| 51 | `uid` — valid 24-hex string | `('507f1f77bcf86cd799439011', 'uid')` | ObjectID |
| 52 | `uid` — valid object | `(ObjectId(...), 'uid')` | ObjectID |
| 53 | `uid` — invalid length | `('507f1f', 'uid')` | `false` |
| 54 | `uid` — uppercase hex (invalid) | `('507F1F77BCF86CD799439011', 'uid')` | `false` |
| 55 | `email` — valid simple | `('a@b.co', 'email')` | `'a@b.co'` |
| 56 | `email` — valid subdomain | `('a@b.c.co', 'email')` | `'a@b.c.co'` |
| 57 | `email` — no TLD | `('a@b', 'email')` | `false` |
| 58 | `email` — double @ | `('a@@b.co', 'email')` | `false` |

**Edge Cases**:

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 59 | `str` is `null` | `(null, 'name')` | `false` |
| 60 | `str` is `undefined` | `(undefined, 'name')` | `false` |
| 61 | `str` is boolean | `(true, 'name')` | `false` |
| 62 | `str` is array | `([], 'name')` | `false` |
| 63 | `str` is number (name type) | `(123, 'name')` | `'123'` |
| 64 | `str` is number (int type) | `(5, 'int')` | `5` |
| 65 | Unknown type | `('hello', 'unknown')` | `false` |
| 66 | `str` is object (non-uid type) | `({}, 'name')` | `false` |
| 67 | `str` is object (uid type, invalid toString) | `({toString: ()=>'xxx'}, 'uid')` | `false` |

**Error Handling**:

| # | Scenario | Expected |
|---|----------|----------|
| 68 | Every `false` return logs to console | Verify `console.log('invalid string ...')` called |

---

### 3.2 `toValidName`

**Priority**: 🟡 High

#### Purpose

Sanitizes a raw string into a safe file/item name by removing forbidden characters, collapsing HTML entities, and truncating to 255 characters. Used when normalizing user-provided or externally-scraped file names.

#### Signature

```js
export function toValidName(str)
```

| Param | Type | Description |
|-------|------|-------------|
| `str` | `string` | Raw name to sanitize |

#### Logic Flow

```
1. Buffer round-trip (UTF-8 normalization)
2. Replace HTML numeric entities (&#NNN;) with space
3. Trim whitespace
4. IF result is whitespace-only (incl. fullwidth space) → set to 'empty'
5. Replace all forbidden chars [\\\/\|\*\?"<>:]+ with comma
6. Slice to 255 characters
7. Return cleaned string
```

#### Returns & Side Effects

| Condition | Return | Side Effect |
|-----------|--------|-------------|
| Normal | Cleaned string (max 255 chars) | None |
| All-whitespace | `'empty'` | None |

#### Comprehensive Test Scenarios

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Clean string passthrough | `'hello world'` | `'hello world'` |
| 2 | Strips HTML entities | `'file&#123;name'` | `'file name'` |
| 3 | Replaces forbidden chars with comma | `'a\\b/c\|d'` | `'a,b,c,d'` |
| 4 | Consecutive forbidden chars → single comma | `'a\\/\|b'` | `'a,b'` |
| 5 | Trims whitespace | `'  hello  '` | `'hello'` |
| 6 | Whitespace-only returns 'empty' | `'   '` | `'empty'` |
| 7 | Fullwidth-space-only returns 'empty' | `'　'` | `'empty'` |
| 8 | Truncates at 255 chars | 300-char string | 255-char result |
| 9 | Preserves allowed special chars | `"it's a test & fun"` | `"it's a test & fun"` |
| 10 | Unicode (CJK) preserved | `'测试文件'` | `'测试文件'` |

---

### 3.3 `userPWCheck`

**Priority**: 🔴 Critical

#### Purpose

Verifies a user's password by comparing the MD5 hash. Implements a 70-second cache (via in-memory `pwCheck` map) to allow password-protected operations within a short window without re-entering the password.

#### Signature

```js
export function userPWCheck(user, pw)
```

| Param | Type | Description |
|-------|------|-------------|
| `user` | `Object` | User document with `_id` and `password` (MD5 hash) |
| `pw` | `string` | Plaintext password to verify |

#### Logic Flow

```
1. IF user.password === MD5(pw):
   a. Set pwCheck[user._id] = 1
   b. setTimeout → reset pwCheck[user._id] = 0 after 70,000ms
   c. Return true
2. ELSE IF pwCheck[user._id] === 1 (cache still valid):
   a. Return true
3. ELSE:
   a. Return false
```

#### Returns & Side Effects

| Condition | Return | Side Effect |
|-----------|--------|-------------|
| Password matches | `true` | Sets `pwCheck[user._id] = 1`; schedules 70s timeout to reset |
| Cache hit (within 70s of previous success) | `true` | None |
| Password mismatch, no cache | `false` | None |

#### Snapshot Testing Data

```js
const user = { _id: 'user123', password: 'e10adc3949ba59abbe56e057f20f883e' }; // MD5 of '123456'
{ input: [user, '123456'], expected: true }
{ input: [user, 'wrong'],  expected: false }
```

#### Comprehensive Test Scenarios

| # | Scenario | Expected | Notes |
|---|----------|----------|-------|
| 1 | Correct password — first call | `true` | Verify `pwCheck` set |
| 2 | Wrong password — no cache | `false` | |
| 3 | Wrong password — within 70s cache | `true` | Call correct first, then wrong within 70s |
| 4 | Wrong password — after 70s cache expires | `false` | Use `jest.advanceTimersByTime(70001)` |
| 5 | Multiple users — isolated caches | Each user has own cache | |
| 6 | Correct password resets timer | `true` | Verify new 70s window starts |

**Mock Requirements**: Use `jest.useFakeTimers()` to control the 70s timeout.

---

### 3.4 `checkAdmin`

**Priority**: 🔴 Critical

#### Purpose

Checks whether a user has admin-level permission. Returns `true` if `user.perm` is between 1 and `perm` (inclusive).

#### Signature

```js
export const checkAdmin = (perm, user) => (user.perm > 0 && user.perm <= perm) ? true : false
```

| Param | Type | Description |
|-------|------|-------------|
| `perm` | `number` | Maximum permission level to check against |
| `user` | `Object` | User object with `.perm` field |

#### Logic Flow

```
1. IF user.perm > 0 AND user.perm <= perm → return true
2. ELSE → return false
```

#### Returns & Side Effects

| Condition | Return | Side Effect |
|-----------|--------|-------------|
| User perm in range (0 < perm ≤ threshold) | `true` | None |
| User perm is 0 or exceeds threshold | `false` | None |

#### Comprehensive Test Scenarios

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Admin (perm=1), threshold=1 | `(1, {perm:1})` | `true` |
| 2 | Standard user (perm=0) | `(1, {perm:0})` | `false` |
| 3 | Higher-level admin (perm=2), threshold=2 | `(2, {perm:2})` | `true` |
| 4 | Perm exceeds threshold | `(1, {perm:2})` | `false` |
| 5 | Perm=1, threshold=10 | `(10, {perm:1})` | `true` |
| 6 | Negative perm | `(1, {perm:-1})` | `false` |
| 7 | Perm is undefined | `(1, {})` | `false` |

---

### 3.5 `HoError`

**Priority**: 🟡 High

#### Purpose

Custom error constructor for application-specific errors. Extends `Error.prototype`. Used throughout the codebase (every controller and model) to throw errors with an HTTP status code.

#### Signature

```js
export function HoError(message, { code = 400 } = {})
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `message` | `string` | `'Hoder Message'` | Error message |
| `code` | `number` | `400` | HTTP status code |

#### Logic Flow

```
1. Set this.name = 'HoError'
2. Set this.message = message || 'Hoder Message'
3. Set this.code = code (default 400)
4. Capture stack trace via (new Error()).stack
5. Prototype chain: HoError → Error
```

#### Returns & Side Effects

Returns an `HoError` instance (used with `new` keyword). No side effects.

#### Comprehensive Test Scenarios

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Default message and code | `new HoError()` | `name='HoError'`, `message='Hoder Message'`, `code=400` |
| 2 | Custom message, default code | `new HoError('fail')` | `message='fail'`, `code=400` |
| 3 | Custom message and code | `new HoError('denied', {code:403})` | `message='denied'`, `code=403` |
| 4 | 401 code | `new HoError('auth', {code:401})` | `code=401` |
| 5 | `instanceof Error` | `new HoError()` | `true` |
| 6 | Has stack trace | `new HoError()` | `.stack` is truthy string |
| 7 | Empty string message | `new HoError('')` | `message='Hoder Message'` (falsy falls to default) |
| 8 | Null message | `new HoError(null)` | `message='Hoder Message'` |

---

### 3.6 `handleError`

**Priority**: 🟡 High

#### Purpose

Centralized error handler. Behavior varies based on the `type` parameter: delegates to a callback function, logs with a label, or returns a rejected Promise.

#### Signature

```js
export function handleError(err, type = null, ...args)
```

| Param | Type | Description |
|-------|------|-------------|
| `err` | `Error \| HoError` | The error to handle |
| `type` | `function \| string \| null` | Handler behavior selector |
| `...args` | `any[]` | Additional args forwarded to callback |

#### Logic Flow

```
1. IF type is truthy:
   a. IF typeof type === 'function':
      - showError(err, 'Delay')
      - console.log(type)
      - return type(err, ...args)
   b. ELSE IF typeof type === 'string':
      - showError(err, type)
   c. ELSE:
      - console.log(type)
      - showError(err, 'Unknown type')
2. ELSE (type is null/falsy):
   - showError(err, 'Reject')
   - return Promise.reject(err)
```

#### Returns & Side Effects

| Condition | Return | Side Effect |
|-----------|--------|-------------|
| `type` is function | Result of `type(err, ...args)` | Logs 'Delay error: ...' |
| `type` is string | `undefined` | Logs '{type} error: ...' |
| `type` is other truthy value | `undefined` | Logs 'Unknown type error: ...' |
| `type` is null/falsy | `Promise.reject(err)` | Logs 'Reject error: ...' |

#### Comprehensive Test Scenarios

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | No type → Promise.reject | `(err)` | Returns rejected promise with `err` |
| 2 | Null type → Promise.reject | `(err, null)` | Returns rejected promise |
| 3 | String type → logs | `(err, 'Test')` | `showError` called with 'Test'; returns `undefined` |
| 4 | Function type → callback invoked | `(err, fn)` | `fn(err)` called; returns fn's return value |
| 5 | Function type with extra args | `(err, fn, 'a', 'b')` | `fn(err, 'a', 'b')` called |
| 6 | Number type → Unknown | `(err, 42)` | Logs 'Unknown type error' |
| 7 | Object type → Unknown | `(err, {})` | Logs 'Unknown type error' |
| 8 | Error with code property | `(hoErr, null)` | `console.log(hoErr.code)` called |
| 9 | Error without stack | Custom err without stack | No stack logged |

---

### 3.7 `showLog`

**Priority**: 🟢 Medium

#### Purpose

Express middleware that logs the current timestamp, request URL, and non-sensitive body fields. Specifically excludes `password`, `newPwd`, `conPwd`, and `userPW` fields from logging.

#### Signature

```js
export function showLog(req, next)
```

| Param | Type | Description |
|-------|------|-------------|
| `req` | `Object` | Express request object |
| `next` | `Function` | Express next() callback |

#### Logic Flow

```
1. Log current date/time (toLocaleString)
2. Log req.url
3. FOR each key in req.body:
   - SKIP if key is 'password', 'newPwd', 'conPwd', or 'userPW'
   - Log "key: value"
4. Call next()
```

#### Returns & Side Effects

| Condition | Return | Side Effect |
|-----------|--------|-------------|
| Always | `undefined` | Logs to console; calls `next()` |

#### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Basic request logging | Logs timestamp, URL, body fields |
| 2 | Password field excluded | `password` not logged |
| 3 | `newPwd` field excluded | `newPwd` not logged |
| 4 | `conPwd` field excluded | `conPwd` not logged |
| 5 | `userPW` field excluded | `userPW` not logged |
| 6 | Non-sensitive fields logged | `username`, `email` etc. logged |
| 7 | Empty body | Only timestamp and URL logged |
| 8 | Always calls `next()` | Verify `next` invoked once |

---

### 3.8 `checkLogin`

**Priority**: 🔴 Critical

#### Purpose

Express middleware that enforces authentication. Supports a special bypass for mobile/Firefox user-agents accessing specific file paths (video, subtitle, torrent) when `type=1`.

#### Signature

```js
export function checkLogin(req, res, next, type = 0)
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `req` | `Object` | — | Express request (must have `isAuthenticated()`, `headers`, `path`, `user`) |
| `res` | `Object` | — | Express response (unused but part of signature) |
| `next` | `Function` | — | Express next() callback |
| `type` | `number` | `0` | 0 = strict auth, 1 = allow mobile/Firefox bypass for media paths |

#### Logic Flow

```
1. IF req.isAuthenticated() === false:
   a. IF type === 1 (file server mode):
      i.  IF user-agent is mobile OR Firefox OR armv7l:
          - IF path matches /^\/f\/video\//, /^\/f\/subtitle\//, or /^\/f\/torrent\//:
            → Log "mobile or firefox", call next()
          - ELSE → throw HoError('auth fail!!!', {code: 401})
      ii. ELSE → throw HoError('auth fail!!!', {code: 401})
   b. ELSE (type === 0) → throw HoError('auth fail!!!', {code: 401})
2. ELSE (authenticated):
   a. Log req.user._id
   b. Call next()
```

#### Returns & Side Effects

| Condition | Return | Side Effect |
|-----------|--------|-------------|
| Authenticated | `undefined` | Logs user ID; calls `next()` |
| Unauthenticated, type=0 | Throws HoError (401) | Error logged |
| Unauthenticated, type=1, mobile + media path | `undefined` | Logs "mobile or firefox"; calls `next()` |
| Unauthenticated, type=1, mobile + non-media path | Throws HoError (401) | Error logged |
| Unauthenticated, type=1, desktop non-Firefox | Throws HoError (401) | Error logged |

#### Snapshot Testing Data

```js
// Authenticated request mock
const authReq = {
  isAuthenticated: () => true,
  user: { _id: '507f1f77bcf86cd799439011' },
  headers: { 'user-agent': 'Mozilla/5.0' },
  path: '/api/test',
  body: {}
};

// Unauthenticated mobile request
const mobileReq = {
  isAuthenticated: () => false,
  headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS)' },
  path: '/f/video/12345',
  body: {}
};
```

#### Comprehensive Test Scenarios

**Authentication Scenarios**:

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Authenticated user, type=0 | `next()` called, user ID logged |
| 2 | Authenticated user, type=1 | `next()` called, user ID logged |
| 3 | Unauthenticated, type=0 | Throws HoError with code 401 |

**Mobile/Firefox Bypass (type=1)**:

| # | Scenario | User-Agent | Path | Expected |
|---|----------|------------|------|----------|
| 4 | Mobile + video path | iPhone UA | `/f/video/abc` | `next()` called |
| 5 | Mobile + subtitle path | Android UA | `/f/subtitle/abc` | `next()` called |
| 6 | Mobile + torrent path | Mobile UA | `/f/torrent/abc` | `next()` called |
| 7 | Mobile + other path | iPhone UA | `/f/api/file` | Throws 401 |
| 8 | Firefox + video path | Firefox UA | `/f/video/abc` | `next()` called |
| 9 | Firefox + non-media path | Firefox UA | `/f/api/file` | Throws 401 |
| 10 | armv7l + video path | armv7l UA | `/f/video/abc` | `next()` called |
| 11 | Desktop Chrome + video path | Chrome UA | `/f/video/abc` | Throws 401 |
| 12 | Desktop Safari + video path | Safari UA | `/f/video/abc` | Throws 401 |

**Edge Cases**:

| # | Scenario | Expected |
|---|----------|----------|
| 13 | Empty user-agent, type=1 | Throws 401 (no mobile/Firefox match) |

---

### 3.9 `big5Encode`

**Priority**: 🟢 Medium

#### Purpose

Encodes a string into Big5 percent-encoding. ASCII characters use standard `encodeURIComponent`; non-ASCII characters are converted to Big5 byte pairs with custom encoding logic (uppercase letters in Big5 low bytes are kept as-is).

#### Signature

```js
export const big5Encode = str => { ... }
```

| Param | Type | Description |
|-------|------|-------------|
| `str` | `string` | Input string to encode |

#### Logic Flow

```
1. FOR each character j in str:
   a. IF j is ASCII (0x00-0x7F): append encodeURIComponent(j)
   b. ELSE:
      - Encode j to Big5 buffer via iconv-lite
      - FOR pairs of bytes (i, i+1):
        - Append '%' + hex(buf[i]) uppercase
        - IF buf[i+1] is A-Z or a-z: append as-is character
        - ELSE: append '%' + hex(buf[i+1]) uppercase
2. Return encoded string
```

#### Comprehensive Test Scenarios

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Pure ASCII | `'hello'` | `'hello'` |
| 2 | ASCII special char | `'hello world'` | `'hello%20world'` |
| 3 | Single CJK char | `'中'` | Big5 percent-encoded |
| 4 | Mixed ASCII + CJK | `'a中b'` | `'a' + Big5('中') + 'b'` |
| 5 | Empty string | `''` | `''` |
| 6 | Big5 low-byte is letter | Char with alphabetic low byte | Letter kept as literal |

---

### 3.10 `selectRandom`

**Priority**: 🟢 Medium

#### Purpose

Weighted random selection. Given an array of weights (or an integer count for uniform weights), returns a randomly selected index. Optionally maps through a `select_arr` indirection array.

#### Signature

```js
export function selectRandom(count_arr, select_arr = null)
```

| Param | Type | Description |
|-------|------|-------------|
| `count_arr` | `number[] \| number` | Array of weights, or integer N for N uniform-weight items |
| `select_arr` | `number[] \| null` | Optional subset of indices to choose from |

#### Logic Flow

```
1. IF count_arr is not an array:
   a. Create array of N ones (uniform weights)
2. Build cumulative accumulation list
3. Generate random number in [0, total_weight)
4. Return first index whose cumulative value ≥ random number
5. If select_arr provided, return select_arr[index] instead of index
```

#### Comprehensive Test Scenarios

| # | Scenario | Notes |
|---|----------|-------|
| 1 | Uniform weights (integer input) | `selectRandom(5)` → index 0–4 |
| 2 | Array weights — single item | `selectRandom([1])` → always `0` |
| 3 | Array weights — heavily biased | `selectRandom([1000, 1])` → mostly `0` |
| 4 | With select_arr | `selectRandom([1,1], [3,7])` → `3` or `7` |
| 5 | All zero weights | `selectRandom([0,0,0])` → behavior depends on Math.random (edge case) |

**Mock Requirements**: Mock `Math.random` to get deterministic results.

---

### 3.11 `getStorageItem`

**Priority**: 🟡 High

#### Purpose

Transforms raw MongoDB storage documents into API-friendly response objects. Handles adult-only tags, first-item tags, media type formatting, ownership checks, and status normalization.

#### Signature

```js
export const getStorageItem = (user, items, mediaHandle) => items.map(item => { ... })
```

| Param | Type | Description |
|-------|------|-------------|
| `user` | `Object` | Current user (for ownership/admin checks) |
| `items` | `Array` | Array of storage documents from MongoDB |
| `mediaHandle` | `number` | `1` to include media info, other to exclude |

#### Logic Flow

```
1. FOR each item:
   a. IF item.adultonly === 1 → push '18+' to tags
   b. IF item.first === 1 → push 'first item' to tags
   c. IF mediaHandle === 1:
      - IF item.mediaType.type exists → format complete/timeout as strings
      - ELSE → build flattened media object from multiple mediaType entries
   d. Compute isOwn: admin(perm≤1) OR owner matches user._id
   e. Normalize status: 5→2, 6→2, 10→2
   f. Add conditional fields: present, url, thumb, cid, ctitle
   g. Add doc flag: status 6→doc:1, 5→doc:2, 10→doc:3
```

#### Returns & Side Effects

Returns array of formatted objects. **Mutates** `item.tags` in-place (pushes '18+' and 'first item'). Also mutates `item.mediaType.complete` and `item.mediaType.timeout` to strings.

#### Snapshot Testing Data

```js
// Minimal storage item
{
  _id: '507f1f77bcf86cd799439011',
  name: 'test.mp4',
  tags: ['video'],
  recycle: 0,
  owner: '507f1f77bcf86cd799439012',
  status: 2,
  utime: 1609459200,
  count: 5,
  adultonly: 0,
  first: 0,
  mediaType: { type: 'video', complete: null, timeout: null }
}
```

#### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Basic item — no flags | Standard mapped object |
| 2 | adultonly=1 | `tags` includes `'18+'` |
| 3 | first=1 | `tags` includes `'first item'` |
| 4 | mediaHandle=1, mediaType has `.type` | `complete` and `timeout` converted to strings |
| 5 | mediaHandle=1, mediaType is multi-entry (no `.type`) | Flattened `media` object with concatenated fields |
| 6 | mediaHandle ≠ 1 | No `media` field in output |
| 7 | Admin user (perm=1) | `isOwn: true` regardless of owner |
| 8 | Owner matches user._id | `isOwn: true` |
| 9 | Non-admin, non-owner | `isOwn: false` |
| 10 | status=5 | Output `status: 2`, `doc: 2` |
| 11 | status=6 | Output `status: 2`, `doc: 1` |
| 12 | status=10 | Output `status: 2`, `doc: 3` |
| 13 | Item with `present` field | `present` included |
| 14 | Item with `url` field | `url` included |
| 15 | Item with `thumb` field | `thumb` included |
| 16 | Item with `cid` field | `cid` included |
| 17 | Item with `ctitle` field | `ctitle` included |
| 18 | Item without optional fields | Optional fields absent from output |
| 19 | Empty items array | Returns `[]` |

---

### 3.12 `getPasswordItem`

**Priority**: 🟡 High

#### Purpose

Transforms raw MongoDB password documents into API-friendly response objects. Adds 'important' tag and flag for important entries.

#### Signature

```js
export const getPasswordItem = (user, items) => items.map(item => { ... })
```

#### Logic Flow

```
1. FOR each item:
   a. IF item.important === 1 → push 'important' to tags
   b. Map to: { name, id, tags, username, url, email, utime, important: true/false }
```

#### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Non-important item | `important: false`, no 'important' tag |
| 2 | Important item | `important: true`, 'important' in tags |
| 3 | Empty items | `[]` |
| 4 | Multiple items | Correct mapping for each |

---

### 3.13 `getStockItem`

**Priority**: 🟡 High

#### Purpose

Transforms raw MongoDB stock documents into API response objects. **Only returns data for admin users** (perm ≤ 1); returns empty array for non-admins.

#### Signature

```js
export const getStockItem = (user, items) => checkAdmin(1, user) ? items.map(...) : []
```

#### Logic Flow

```
1. IF checkAdmin(1, user) === false → return []
2. FOR each item:
   a. IF item.important === 1 → push 'important' to tags
   b. Map to: { name, id, tags, profit, safety, management, index, type }
```

#### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Admin user (perm=1) | Returns mapped items |
| 2 | Non-admin user (perm=0) | Returns `[]` |
| 3 | Important item | 'important' pushed to tags |
| 4 | Field mapping | `profit ← per`, `safety ← pdr`, `management ← pbr` |

---

### 3.14 `getFitnessItem`

**Priority**: 🟢 Medium

#### Purpose

Transforms raw MongoDB fitness documents into API response objects.

#### Signature

```js
export const getFitnessItem = (user, items) => items.map(item => ({
  name, id, tags, price, count, desc, type
}))
```

#### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Standard mapping | All fields correctly mapped |
| 2 | Empty array | `[]` |

---

### 3.15 `getRankItem`

**Priority**: 🟢 Medium

#### Purpose

Transforms raw MongoDB rank documents into API response objects.

#### Signature

```js
export const getRankItem = (user, items) => items.map(item => ({
  name, id, tags, start, type
}))
```

#### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Standard mapping | All fields correctly mapped |
| 2 | Empty array | `[]` |

---

### 3.16 `getFileLocation`

**Priority**: 🟢 Medium

#### Purpose

Computes the NAS file storage path for a given owner + file UID. Uses MD5 hashes to create a two-level directory sharding scheme.

#### Signature

```js
export const getFileLocation = (owner, uid) => { ... }
```

| Param | Type | Description |
|-------|------|-------------|
| `owner` | `ObjectID \| string` | Owner user ID |
| `uid` | `ObjectID \| string` | File/storage document ID |

#### Logic Flow

```
1. owner_S = owner.toString()
2. owner_md5 = MD5(owner_S)
3. uid_S = uid.toString()
4. uid_md5 = MD5(uid_S)
5. Return PathJoin(NAS_PREFIX(ENV_TYPE), owner_md5[0..1], owner_S, uid_md5[0..1], uid_S)
```

#### Returns & Side Effects

Returns a path string like: `/mnt/storage/ab/owner123/cd/uid456`. No side effects.

#### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Known owner and uid | Predictable MD5-sharded path |
| 2 | String IDs | Same as ObjectID equivalents |
| 3 | Different owners → different paths | Verified isolation |

**Mock Requirements**: Mock `NAS_PREFIX` and `ENV_TYPE`.

---

### 3.17 `deleteFolderRecursive`

**Priority**: 🟢 Medium

#### Purpose

Recursively deletes a directory and all its contents (files and subdirectories). A synchronous rm -rf equivalent.

#### Signature

```js
export const deleteFolderRecursive = path => { ... }
```

| Param | Type | Description |
|-------|------|-------------|
| `path` | `string` | Absolute path to delete |

#### Logic Flow

```
1. IF path exists (FsExistsSync):
   a. FOR each file in directory (FsReaddirSync):
      - IF file is directory → recurse
      - ELSE → FsUnlinkSync
   b. FsRmdirSync(path)
2. ELSE: no-op
```

#### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Delete empty directory | Directory removed |
| 2 | Delete directory with files | All files and directory removed |
| 3 | Delete nested directories | Recursive removal |
| 4 | Non-existent path | No-op (no error) |
| 5 | Path is a file (not directory) | Behavior depends on `readdirSync` error |

**Mock Requirements**: Mock all `fs` functions (`existsSync`, `readdirSync`, `lstatSync`, `unlinkSync`, `rmdirSync`).

---

### 3.18 `SRT2VTT`

**Priority**: 🟢 Medium

#### Purpose

Converts subtitle files (SRT or ASS/SSA format) to WebVTT format for browser-native subtitle rendering.

#### Signature

```js
export const SRT2VTT = (filePath, ext) => new Promise(...)
```

| Param | Type | Description |
|-------|------|-------------|
| `filePath` | `string` | File path without extension |
| `ext` | `string` | Source extension: `'srt'` or ASS/SSA |

#### Logic Flow

```
1. Read source file (filePath.ext)
2. IF ext === 'srt':
   a. Prepend 'WEBVTT\n\n' header
   b. Replace commas with dots in timestamps
   c. Write to filePath.vtt
3. ELSE (ASS/SSA):
   a. Convert buffer to string, write as .sub
   b. Pipe .sub through ass-to-vtt → .vtt
   c. Delete .sub temp file
```

#### Returns & Side Effects

Returns a `Promise<void>`. **Side Effects**: Creates `.vtt` file on disk; for ASS format, creates then deletes temporary `.sub` file.

#### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | SRT → VTT | `.vtt` file with WEBVTT header, dots in timestamps |
| 2 | ASS → VTT | `.vtt` file created via ass-to-vtt pipe, `.sub` cleaned up |
| 3 | Source file not found | Promise rejects with read error |
| 4 | Write permission error | Promise rejects |

**Mock Requirements**: Mock `fs.readFile`, `fs.writeFile`, `fs.createReadStream`, `fs.createWriteStream`, `fs.unlinkSync`, `Ass2vtt`.

---

### 3.19 `bufferToString`

**Priority**: 🟢 Medium

#### Purpose

Detects the character encoding of a buffer and decodes it to a UTF-8 string. Falls back to iconv-lite for encodings not supported by Node's native `Buffer.toString()`.

#### Signature

```js
export const bufferToString = (buffer, big5 = false) => { ... }
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `buffer` | `Buffer` | — | Raw bytes to decode |
| `big5` | `boolean` | `false` | Force Big5 decoding |

#### Logic Flow

```
1. Detect charset via jschardet
2. IF charset detected:
   a. TRY buffer.toString(encoding) — use 'big5' if big5=true
   b. CATCH → use iconv-lite decode
3. ELSE → return 'Unknown Charset'
```

#### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | UTF-8 buffer | Decoded string via toString |
| 2 | Big5 buffer, big5=false | Decoded using detected charset |
| 3 | Big5 buffer, big5=true | Force Big5 decoding |
| 4 | Unrecognized charset | `'Unknown Charset'` |
| 5 | toString throws | Falls back to iconv-lite |
| 6 | jschardet returns null | `'Unknown Charset'` |

---

### 3.20 `getJson`

**Priority**: 🟢 Medium

#### Purpose

Safe JSON parser that returns `false` on parse failure instead of throwing.

#### Signature

```js
export const getJson = raw_data => { ... }
```

| Param | Type | Description |
|-------|------|-------------|
| `raw_data` | `string` | JSON string to parse |

#### Logic Flow

```
1. TRY JSON.parse(raw_data)
   a. Return parsed object
2. CATCH:
   a. Log raw_data
   b. showError(error, 'Json parse')
   c. Return false
```

#### Comprehensive Test Scenarios

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Valid JSON object | `'{"a":1}'` | `{a: 1}` |
| 2 | Valid JSON array | `'[1,2]'` | `[1, 2]` |
| 3 | Valid JSON string | `'"hello"'` | `'hello'` |
| 4 | Invalid JSON | `'{bad}'` | `false` |
| 5 | Empty string | `''` | `false` |
| 6 | `null` string | `'null'` | `null` |
| 7 | Numeric string | `'42'` | `42` |

---

### 3.21 `torrent2Magnet`

**Priority**: 🟢 Medium

#### Purpose

Converts torrent metadata into a magnet URI string. Supports both `announceList` and `announce` tracker formats, limited to 10 trackers.

#### Signature

```js
export const torrent2Magnet = torInfo => { ... }
```

| Param | Type | Description |
|-------|------|-------------|
| `torInfo` | `Object` | Torrent metadata with `infoHash`, optional `announceList` or `announce` |

#### Logic Flow

```
1. IF no infoHash → log 'miss infoHash', return false
2. Build base: magnet:?xt=urn:btih:{infoHash}
3. IF announceList exists:
   a. Append up to 10 &tr= entries (URI-encoded)
4. ELSE IF announce exists:
   a. Append up to 10 &tr= entries (URI-encoded)
5. Return magnet string
```

#### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Valid infoHash only | `magnet:?xt=urn:btih:{hash}` |
| 2 | With announceList (3 items) | 3 `&tr=` appended |
| 3 | With announce (3 items) | 3 `&tr=` appended |
| 4 | announceList with 15 items | Only first 10 appended |
| 5 | Both announceList and announce | `announceList` takes priority |
| 6 | Missing infoHash | Returns `false` |
| 7 | Empty announceList | Just base magnet URI |
| 8 | Trackers with special chars | Properly URI-encoded |

---

### 3.22 `sortList`

**Priority**: 🟢 Medium

#### Purpose

Sorts a list of file paths by their directory prefix first, then numerically by extracted numbers in the filename portion. Used for ordering media file lists.

#### Signature

```js
export const sortList = list => { ... }
```

| Param | Type | Description |
|-------|------|-------------|
| `list` | `string[]` | Array of file paths |

#### Logic Flow

```
1. FOR each path in list:
   a. Split into prefix (directory) and filename via regex /^(.*?)([^\/]+)$/
   b. Extract numeric portions from filename via /\d+/g
   c. Group items by same directory prefix
   d. When prefix changes, sort previous group numerically then append
2. Sort compares each extracted number sequentially
3. Items without numbers sort first (-1)
4. Return concatenated sorted list
```

#### Comprehensive Test Scenarios

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Single directory, numeric files | `['dir/ep2', 'dir/ep1', 'dir/ep10']` | `['dir/ep1', 'dir/ep2', 'dir/ep10']` |
| 2 | Multiple directories | `['b/2', 'a/1', 'b/1']` | `['b/1', 'b/2', 'a/1']` (grouped by dir, list order) |
| 3 | No numbers in filename | `['dir/abc', 'dir/def']` | Stable order (no-number items sort first) |
| 4 | Multi-number filenames | `['d/s01e02', 'd/s01e01', 'd/s02e01']` | Sequential number comparison |
| 5 | Single file | `['dir/file']` | `['dir/file']` |
| 6 | Empty list | `[]` | `[]` |

---

### 3.23 `completeZero`

**Priority**: 🟢 Medium

#### Purpose

Pads a number with leading zeros to reach a specified width (offset). Used for formatting episode numbers, dates, etc.

#### Signature

```js
export const completeZero = (number, offset) => { ... }
```

| Param | Type | Description |
|-------|------|-------------|
| `number` | `number` | The number to pad |
| `offset` | `number` | Desired total digit width |

#### Logic Flow

```
1. FOR i from 1 to offset-1:
   a. IF number < 10^i:
      - Prepend '0' for each remaining position (j from i to offset-1)
      - Break
2. Return number.toString()
```

#### Comprehensive Test Scenarios

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Single digit, width 3 | `(5, 3)` | `'005'` |
| 2 | Double digit, width 3 | `(42, 3)` | `'042'` |
| 3 | Triple digit, width 3 | `(123, 3)` | `'123'` |
| 4 | Zero, width 2 | `(0, 2)` | `'00'` |
| 5 | Width 1 (no padding) | `(5, 1)` | `'5'` |
| 6 | Number equals 10^(offset-1) | `(10, 2)` | `'10'` |
| 7 | Large number, small width | `(1000, 2)` | `'1000'` |

---

### 3.24 `findTag`

**Priority**: 🟢 Medium

#### Purpose

Searches a parsed HTML/XML node tree (e.g., from `htmlparser2`) for elements matching a tag name and/or attribute value, or extracts text/comment content.

#### Signature

```js
export const findTag = (node, tag = null, id = null) => { ... }
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `node` | `Object \| Array` | — | Parsed DOM node (with `.children`) or array of nodes |
| `tag` | `string \| null` | `null` | Tag name to search for; `null` = extract text/comments |
| `id` | `string \| null` | `null` | Attribute value to match (any attribute) |

#### Logic Flow

```
1. Get item list: node.children if exists, else node itself
2. IF item is not an array → return []
3. FOR each child:
   a. IF tag is provided:
      - IF child is 'tag' or 'script' type AND name matches tag:
        - IF id provided: check all attribs for value === id.trim()
        - ELSE: push child to results
   b. ELSE (no tag — text extraction mode):
      - IF type === 'text': push trimmed non-empty data
      - IF type === 'comment': extract from CDATA or nested comment wrappers, push if non-empty
4. Return results array
```

#### Comprehensive Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Find tag by name | Returns matching elements |
| 2 | Find tag by name + attribute value | Returns elements with matching attrib |
| 3 | No tag — extract text nodes | Returns trimmed text strings |
| 4 | No tag — extract CDATA comments | Unwraps `[CDATA[...]]`, returns content |
| 5 | No tag — extract nested comments | Unwraps `<!--...-->`, returns content |
| 6 | Script tag matching | Matches `type === 'script'` |
| 7 | Node is array (no `.children`) | Iterates directly |
| 8 | Node is non-array non-object | Returns `[]` |
| 9 | Empty children | Returns `[]` |
| 10 | Whitespace-only text nodes | Excluded from results |
| 11 | Tag with no attribs, id provided | Not matched (no attribs to check) |

---

### 3.25 `convertTimestampToDate`

**Priority**: 🟢 Low

#### Purpose

Converts a Unix timestamp (seconds) to a `{year, month, day}` object with zero-padded month and day.

#### Signature

```js
export const convertTimestampToDate = (timestamp) => { ... }
```

| Param | Type | Description |
|-------|------|-------------|
| `timestamp` | `number` | Unix epoch seconds |

#### Logic Flow

```
1. Create Date from timestamp * 1000 (convert to milliseconds)
2. Extract year, month (0-indexed + 1, zero-padded), day (zero-padded)
3. Return { year, month, day }
```

#### Comprehensive Test Scenarios

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Unix epoch 0 | `0` | `{year: 1970, month: '01', day: '01'}` |
| 2 | Specific date | `1609459200` (2021-01-01) | `{year: 2021, month: '01', day: '01'}` |
| 3 | Single-digit month/day padding | `1612137600` (Feb 1) | month: `'02'`, day: `'01'` |
| 4 | End of year | `1640995199` (Dec 31) | month: `'12'`, day: `'31'` |
| 5 | Negative timestamp | `-86400` | Pre-epoch date |

**Note**: Results are timezone-dependent. Tests should account for the server's timezone or mock `Date`.

---

### 3.26 `addPre`

**Priority**: 🟢 Low

#### Purpose

Prepends a URL prefix to relative URLs. Absolute URLs (http/https) are returned as-is.

#### Signature

```js
export const addPre = (url, pre) => url.match(/^(https|http):\/\//) ? url : url.match(/^\//) ? `${pre}${url}` : `${pre}/${url}`
```

| Param | Type | Description |
|-------|------|-------------|
| `url` | `string` | URL to process |
| `pre` | `string` | Prefix to prepend for relative URLs |

#### Logic Flow

```
1. IF url starts with http:// or https:// → return url as-is
2. ELSE IF url starts with / → return pre + url
3. ELSE → return pre + '/' + url
```

#### Comprehensive Test Scenarios

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Absolute https URL | `('https://ex.com', 'http://pre')` | `'https://ex.com'` |
| 2 | Absolute http URL | `('http://ex.com', 'http://pre')` | `'http://ex.com'` |
| 3 | Root-relative URL | `('/path', 'http://pre')` | `'http://pre/path'` |
| 4 | Relative URL (no leading /) | `('path', 'http://pre')` | `'http://pre/path'` |
| 5 | Empty URL | `('', 'http://pre')` | `'http://pre/'` |
| 6 | FTP URL (not http/s) | `('ftp://x', 'http://pre')` | `'http://pre/ftp://x'` |

---

## 4. Internal (Non-Exported) Functions

### 4.1 `showError`

**Scope**: Module-private (not exported)

#### Purpose

Logs error details to console. Called by `handleError`.

#### Signature

```js
function showError(err, type)
```

#### Logic Flow

```
1. Log "{type} error: {err.name} {err.message||err.msg}"
2. IF err.code !== undefined → log err.code
3. IF err.stack → log err.stack
```

#### Test Strategy

Tested indirectly through `handleError` tests. Verify console output by spying on `console.log`.

---

## 5. Module-Level State

```js
let pwCheck = {}
```

**Description**: In-memory cache for password verification. Maps `user._id` → `1` (verified) or `0` (expired). Entries are set by `userPWCheck()` and auto-expire after 70 seconds via `setTimeout`.

**Test Impact**:
- Must use `jest.useFakeTimers()` for deterministic behavior
- Must reset module state between tests (use `jest.resetModules()` or re-import)
- Tests for `userPWCheck` that verify cache expiry depend on timer advancement

---

## 6. Cross-Cutting Test Concerns

### 6.1 Mock Strategy

| Dependency | Mock Approach |
|------------|---------------|
| `objectID` (mongo-tool) | Return input string wrapped in mock ObjectID |
| `RE_WEBURL` (constants) | Use actual regex or simplified mock |
| `NAS_PREFIX` / `ENV_TYPE` | Mock to return deterministic test paths |
| `MobileDetect` | Mock `.mobile()` to return truthy/falsy per scenario |
| `crypto.createHash` | Use real implementation (deterministic) or mock for isolation |
| `fs` (all sync/async ops) | Mock entirely to avoid filesystem side effects |
| `iconv-lite` | Mock for big5Encode; use real for bufferToString if integration |
| `jschardet` | Mock `.detect()` to return specific charset results |
| `ass-to-vtt` | Mock pipe behavior |
| `console.log` | Spy to verify logging behavior and suppress test output |
| `Math.random` | Mock for `selectRandom` deterministic tests |
| Timers | `jest.useFakeTimers()` for `userPWCheck` 70s cache |

### 6.2 Test File Structure

```
src/back/util/__tests__/utility.test.js
├── describe('isValidString')
│   ├── describe('type: name')
│   ├── describe('type: desc')
│   ├── describe('type: perm')
│   ├── describe('type: parentIndex')
│   ├── describe('type: int')
│   ├── describe('type: zeroint')
│   ├── describe('type: passwd')
│   ├── describe('type: verify')
│   ├── describe('type: altpwd')
│   ├── describe('type: url')
│   ├── describe('type: uid')
│   ├── describe('type: email')
│   └── describe('edge cases')
├── describe('toValidName')
├── describe('userPWCheck')
├── describe('checkAdmin')
├── describe('HoError')
├── describe('handleError')
├── describe('showLog')
├── describe('checkLogin')
├── describe('big5Encode')
├── describe('selectRandom')
├── describe('getStorageItem')
├── describe('getPasswordItem')
├── describe('getStockItem')
├── describe('getFitnessItem')
├── describe('getRankItem')
├── describe('getFileLocation')
├── describe('deleteFolderRecursive')
├── describe('SRT2VTT')
├── describe('bufferToString')
├── describe('getJson')
├── describe('torrent2Magnet')
├── describe('sortList')
├── describe('completeZero')
├── describe('findTag')
├── describe('convertTimestampToDate')
└── describe('addPre')
```

### 6.3 Coverage Targets

| Category | Target | Rationale |
|----------|--------|-----------|
| Statements | 100% | All functions are pure or near-pure logic |
| Branches | 100% | Critical: every `if/else`, `switch` case, ternary |
| Functions | 100% | All 22 exports + 1 internal via indirect testing |
| Lines | 100% | No dead code expected |

### 6.4 Auth/Login Test Pattern

For any function with authentication implications (`checkLogin`, `checkAdmin`, `userPWCheck`), always include:

| Scenario | Description |
|----------|-------------|
| **Unauthenticated** | `req.isAuthenticated()` returns `false`, no session |
| **Unauthorized** | Authenticated but `perm` too low for operation |
| **Authorized** | Authenticated with sufficient `perm` |
| **Cache-based auth** | `userPWCheck` within 70s window |

### 6.5 Execution Notes

- **Framework**: Jest 27 with `--experimental-vm-modules` (ESM)
- **Run**: `npm test -- --testPathPattern=utility`
- **Coverage**: `npm test -- --coverage --collectCoverageFrom='src/back/util/utility.js'`
- **Priority**: Phase 1 per `doc/OUTLINE.md` §11.9

---

> **Document Version**: 1.0
> **Source**: `src/back/util/utility.js` (510 lines, 22 exports)
> **Reference**: `doc/OUTLINE.md` §3.5, §11.2, §11.9
