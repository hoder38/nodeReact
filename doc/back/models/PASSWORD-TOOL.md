# PASSWORD-TOOL.md — Comprehensive Testing Strategy

> **Module**: `src/back/models/password-tool.js`
> **Priority**: 🔴 Critical (Phase 1 — per OUTLINE.md §11.9)
> **Stack**: Node.js 14 · MongoDB 4.4 · Node `crypto` (AES-256-CTR) · `password-generator`
> **Author Role**: Senior QA / Test Automation Engineer

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Dependencies & Imports](#2-dependencies--imports)
3. [Function: `newRow`](#3-function-newrow)
4. [Function: `editRow`](#4-function-editrow)
5. [Function: `delRow`](#5-function-delrow)
6. [Function: `getPassword`](#6-function-getpassword)
7. [Function: `generatePW`](#7-function-generatepw)
8. [Internal Function: `encrypt`](#8-internal-function-encrypt)
9. [Internal Function: `decrypt`](#9-internal-function-decrypt)
10. [Exported Function: `updatePasswordCipher`](#10-exported-function-updatepasswordcipher)
11. [Cross-Cutting Concerns](#11-cross-cutting-concerns)
12. [Test Environment & Mocking Strategy](#12-test-environment--mocking-strategy)

---

## 1. Module Overview

`password-tool.js` is the core business-logic layer for the ANoMoPi encrypted password manager. It provides CRUD operations for password entries stored in MongoDB, with AES-256-CTR encryption/decryption for sensitive credential fields. Each password record is owned by a single user and may be flagged as "important," requiring an additional user-password (`userPW`) verification step before access.

### Exports

| Export | Type | Description |
|--------|------|-------------|
| `default` (object) | Named methods | `newRow`, `editRow`, `delRow`, `getPassword`, `generatePW` |
| `updatePasswordCipher` | Named export (function) | Batch migration utility — re-encrypts legacy cipher records to current IV-based format |

---

## 2. Dependencies & Imports

| Import | Source | Purpose |
|--------|--------|---------|
| `PASSWORD_PRIVATE_KEY`, `PASSWORD_SALT` | `ver.js` | AES-256 encryption key and salt (environment secrets) |
| `ALGORITHM`, `ALGORITHM_LEGACY`, `PASSWORDDB` | `constants.js` | Cipher algorithm name (`aes-256-gcm`), legacy algorithm (`aes-256-ctr`), and MongoDB collection name |
| `TagTool`, `isDefaultTag`, `normalize` | `tag-tool.js` | Tag management: factory for `PasswordTagTool`, tag normalization & filtering |
| `Mongo`, `objectID` | `mongo-tool.js` | MongoDB CRUD wrapper and ObjectID generator |
| `isValidString`, `handleError`, `HoError`, `userPWCheck` | `utility.js` | Input validation, error construction, and user-password verification |
| `crypto` (destructured) | Node built-in | `createCipheriv`, `createDecipheriv`, `randomBytes` |
| `PasswordGenerator` | `password-generator` | Random password generation with configurable character classes |

### Module-Level Initialization

```js
const PasswordTagTool = TagTool(PASSWORDDB);
const keyBuffer = Buffer.from(Buffer.concat([Buffer.from(PASSWORD_PRIVATE_KEY), Buffer.alloc(32)], 32), 'hex');
```

A `TagTool` instance bound to the `PASSWORDDB` collection, plus a module-level precomputed 32-byte key buffer reused by `encrypt()`, `decrypt()`, and `decryptLegacyCTR()`. `PasswordTagTool` is used by `editRow` and `getPassword` to call `setLatest()`.

---

## 3. Function: `newRow`

### 3.1 Purpose

Creates a new encrypted password record in MongoDB. Validates all input fields, encrypts the password with AES-256-CTR, enforces the "important" flag permission gate, auto-generates tags from the record's metadata, and perserts the document.

### 3.2 Invocation & Authentication

```js
newRow(data, user)
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `data` | Object | ✅ | Request body with fields: `username`, `password`, `conpassword`, `name`, `url`, `email`, `important`, `userPW` |
| `user` | Object | ✅ | Authenticated user object (must have `_id`) |

**Authentication**: Caller must be an authenticated user. If `data.important` is truthy, `userPWCheck(user, userPW)` must pass.

### 3.3 Logic Flow

```
1. Guard: Reject if any of username, password, conpassword, name are missing
2. Validate `name` via isValidString(data.name, 'name')
3. Validate `username` via isValidString(data.username, 'name')
4. Validate `password` via isValidString(data.password, 'altpwd')
5. Validate `conpassword` via isValidString(data.conpassword, 'altpwd')
6. Guard: Reject if password !== conpassword
7. If data.url exists → validate via isValidString(data.url, 'url')
8. If data.email exists → validate via isValidString(data.email, 'email')
9. Encrypt password → encrypt(password)
10. Determine important flag: data.important ? 1 : 0
11. If important !== 0:
    a. If data.userPW exists → validate via isValidString(data.userPW, 'passwd')
    b. Guard: Reject if userPWCheck(user, userPW) fails → "permission denied"
12. Build tag Set from normalized name, username, email (if present), url (if present)
13. Filter out default tags via isDefaultTag()
14. Insert document into PASSWORDDB with:
    - _id: new objectID()
    - name, username, password (encrypted), prePassword (same as password)
    - owner: user._id
    - utime: current Unix timestamp (seconds)
    - url, email, tags, important
15. Return { id: inserted._id }
```

### 3.4 Returns & Side Effects

| Outcome | Return Value | Side Effects |
|---------|-------------|-------------|
| Success | `Promise<{ id: ObjectID }>` | New document inserted into `PASSWORDDB` collection |
| Validation failure | `handleError(new HoError(...))` | No DB write; error propagated |
| Permission denied | `handleError(new HoError('permission denied'))` | No DB write |

### 3.5 Snapshot Testing Data

**Input (Minimal)**:
```json
{
  "data": {
    "name": "GitHub",
    "username": "johndoe",
    "password": "S3cure!Pass",
    "conpassword": "S3cure!Pass"
  },
  "user": { "_id": "507f1f77bcf86cd799439011" }
}
```

**Input (Full with Important)**:
```json
{
  "data": {
    "name": "Bank Account",
    "username": "bankuser",
    "password": "B@nk2024!",
    "conpassword": "B@nk2024!",
    "url": "https://bank.example.com",
    "email": "user@bank.com",
    "important": true,
    "userPW": "mySecretPin"
  },
  "user": { "_id": "507f1f77bcf86cd799439011" }
}
```

**Expected Inserted Document**:
```json
{
  "_id": "<ObjectID>",
  "name": "GitHub",
  "username": "johndoe",
  "password": "<hex_iv>:<hex_encrypted>",
  "prePassword": "<hex_iv>:<hex_encrypted>",
  "owner": "507f1f77bcf86cd799439011",
  "utime": 1710000000,
  "url": "",
  "email": "",
  "tags": ["github", "johndoe"],
  "important": 0
}
```

### 3.6 Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches

| # | Scenario | Branch | Expected Outcome |
|---|----------|--------|-----------------|
| 1 | All required fields present, no optional fields | Lines 14–35, skip url/email blocks | Insert succeeds, url/email empty strings, important = 0 |
| 2 | All required + url provided | Line 37–42 entered | Insert succeeds with validated url in document and tags |
| 3 | All required + email provided | Line 43–49 entered | Insert succeeds with validated email in document and tags |
| 4 | All required + url + email both provided | Both optional blocks entered | Insert succeeds with both fields populated and added to tags |
| 5 | `important` = truthy, valid `userPW`, `userPWCheck` passes | Lines 52–63 entered, check passes | Insert succeeds with important = 1 |
| 6 | `important` = truthy, valid `userPW`, `userPWCheck` fails | Line 60–61 | handleError "permission denied" |
| 7 | `important` = truthy, no `userPW` provided | Line 53 skip, userPW = '' | handleError "permission denied" (empty string fails check) |
| 8 | `important` = falsy (0, false, undefined, null, '') | Line 52 evaluates to 0, skip auth block | Insert succeeds with important = 0 |
| 9 | Tags containing a default tag value | Line 74 `isDefaultTag` returns true | Default tag excluded from final `setArr` |
| 10 | All normalized tags are unique | Set deduplication | Tags array has expected distinct count |
| 11 | Normalized name and username produce same tag | Set deduplication | Tags array deduplicated to single entry |

#### Edge Cases

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 12 | `data.name` is empty string | handleError "parameter lost!!!" |
| 13 | `data.username` is empty string | handleError "parameter lost!!!" |
| 14 | `data.password` is empty string | handleError "parameter lost!!!" |
| 15 | `data.conpassword` is empty string | handleError "parameter lost!!!" |
| 16 | `data` object is completely empty `{}` | handleError "parameter lost!!!" |
| 17 | `name` fails `isValidString` (contains injection chars) | handleError "name is not vaild!!!" |
| 18 | `username` fails `isValidString` | handleError "username is not vaild!!!" |
| 19 | `password` fails `isValidString('altpwd')` | handleError "password is not vaild!!!" |
| 20 | `conpassword` fails `isValidString('altpwd')` | handleError "password is not vaild!!!" |
| 21 | `password` and `conpassword` both valid but not equal | handleError "password not equal!!!" |
| 22 | `url` provided but fails `isValidString('url')` | handleError "url not vaild!!!" |
| 23 | `email` provided but fails `isValidString('email')` | handleError "email not vaild!!!" |
| 24 | `userPW` provided but fails `isValidString('passwd')` | handleError "passwd not vaild!!!" |
| 25 | Very long valid name (boundary of 'name' validation) | Depends on `isValidString` limits |
| 26 | Unicode characters in name/username | Verify normalization behavior |
| 27 | `data.important` is a truthy non-boolean (e.g., `1`, `"yes"`) | Should set important = 1 |
| 28 | `data.important` is `0` or `false` | Should set important = 0 |

#### Error Handling

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 29 | `Mongo('insert', ...)` rejects with DB error | Promise rejects; error propagated |
| 30 | `encrypt()` throws (e.g., invalid key config) | Synchronous throw before Mongo call |
| 31 | `objectID()` returns unexpected format | Insert may fail at DB level |

#### Auth/Login Scenarios

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 32 | `user` object has valid `_id` | Document `owner` set correctly |
| 33 | `user` object is `null` or `undefined` | Runtime error accessing `user._id` |
| 34 | `user._id` is not a valid ObjectID | Document created with malformed owner (DB may reject) |

---

## 4. Function: `editRow`

### 4.1 Purpose

Updates an existing password record. Supports partial updates — only provided fields are modified. If the password is changed, the old password is preserved as `prePassword`. Enforces ownership and the important-flag permission gate. Updates tags and triggers `setLatest` on the tag tool.

### 4.2 Invocation & Authentication

```js
editRow(uid, data, user, session)
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | String | ✅ | Record ID (validated as 'uid') |
| `data` | Object | ✅ | Fields to update: `password`, `conpassword`, `name`, `username`, `url`, `email`, `important`, `userPW` |
| `user` | Object | ✅ | Authenticated user (must have `_id`) |
| `session` | Object | ✅ | Express session object (passed to `setLatest`) |

**Authentication**: Record must match `{ _id: id, owner: user._id }`. If the existing record has `important !== 0` **or** if the `important` flag is being changed, `userPWCheck` must pass.

### 4.3 Logic Flow

```
1. If data.password exists → validate via isValidString(data.password, 'altpwd')
2. If data.password exists → validate conpassword via isValidString(data.conpassword, 'altpwd')
   ⚠ NOTE: conpassword validation is gated on data['password'], not data['conpassword']
3. Guard: Reject if password !== conpassword
4. If data.name exists → validate via isValidString(data.name, 'name')
5. If data.username exists → validate via isValidString(data.username, 'name')
6. If data.url exists → validate via isValidString(data.url, 'url')
7. If data.email exists → validate via isValidString(data.email, 'email')
8. Validate uid via isValidString(uid, 'uid')
9. Mongo.find PASSWORDDB where { _id: id, owner: user._id } (limit: 1)
10. Guard: Reject if no results → "password row does not exist!!!"
11. Build update_data, include important field if data.hasOwnProperty('important')
12. Permission gate check:
    IF existing.important !== 0 OR (data has 'important' AND existing differs from new):
    a. If data.userPW exists → validate via isValidString(data.userPW, 'passwd')
    b. Guard: Reject if userPWCheck fails → "permission denied"
13. Build tag Set from existing tags + any new name/username/email/url (normalized)
14. Filter out default tags
15. Merge update_data with tags and (if password changed) new encrypted password + prePassword + utime
16. Fire-and-forget: PasswordTagTool.setLatest(pws[0]._id, session)
17. Mongo.update PASSWORDDB where { _id, owner } with $set: update_data
18. Return update result
```

### 4.4 Returns & Side Effects

| Outcome | Return Value | Side Effects |
|---------|-------------|-------------|
| Success (with password change) | `Promise<update_result>` | DB updated: new password encrypted, old password saved to `prePassword`, `utime` refreshed, `setLatest` called |
| Success (no password change) | `Promise<update_result>` | DB updated: only changed fields + tags, `setLatest` called |
| Record not found / not owned | `handleError(...)` | No DB write |
| Permission denied | `handleError(...)` | No DB write |
| Validation failure | `handleError(...)` | No DB write |

### 4.5 Snapshot Testing Data

**Input (Password Change)**:
```json
{
  "uid": "507f1f77bcf86cd799439011",
  "data": {
    "password": "NewP@ss1",
    "conpassword": "NewP@ss1"
  },
  "user": { "_id": "60d5ecb74e4d2a001f2c8b01" }
}
```

**Expected Update $set (Password Change)**:
```json
{
  "tags": ["existingtag1", "existingtag2"],
  "password": "<new_hex_iv>:<new_hex_encrypted>",
  "prePassword": "<old_hex_iv>:<old_hex_encrypted>",
  "utime": 1710000000
}
```

**Input (Metadata Only)**:
```json
{
  "uid": "507f1f77bcf86cd799439011",
  "data": {
    "name": "Updated Name",
    "email": "newemail@test.com"
  },
  "user": { "_id": "60d5ecb74e4d2a001f2c8b01" }
}
```

**Expected Update $set (Metadata Only)**:
```json
{
  "name": "Updated Name",
  "email": "newemail@test.com",
  "tags": ["existingtag1", "updated name", "newemail@test.com"]
}
```

### 4.6 Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches

| # | Scenario | Branch | Expected Outcome |
|---|----------|--------|-----------------|
| 1 | Update password only | password + conpassword provided | prePassword = old password, password = new encrypted, utime updated |
| 2 | Update name only | name provided, no password | name + tags updated; password/prePassword/utime unchanged |
| 3 | Update username only | username provided | username + tags updated |
| 4 | Update url only | url provided | url + tags updated |
| 5 | Update email only | email provided | email + tags updated |
| 6 | Update multiple fields (name + email + password) | Multiple branches entered | All fields updated; prePassword rotated |
| 7 | No fields provided (empty data) | All if-blocks skipped | Tags rebuilt from existing, Mongo update with minimal changes |
| 8 | `important` field set in `data` (truthy) | `data.hasOwnProperty('important')` = true | important = 1 set in update_data |
| 9 | `important` field set in `data` (falsy) | `data.hasOwnProperty('important')` = true | important = 0 set in update_data |
| 10 | `important` NOT in `data` | `data.hasOwnProperty('important')` = false | important omitted from update_data |
| 11 | Existing record has `important !== 0` | Permission gate entered | userPW check required |
| 12 | Existing record has `important === 0`, changing to `important = 1` | Gate: `pws[0].important !== update_data['important']` | userPW check required |
| 13 | Existing record has `important === 0`, not changing important | Gate condition false | userPW check skipped |
| 14 | Existing record has `important === 1`, changing to `important = 0` | Gate: existing important !== 0 | userPW check required |
| 15 | Password provided but conpassword missing | conpassword validated (gated on data['password']), fails isValidString | handleError "password not vaild!!!" |
| 16 | password !== conpassword | Line 111–113 | handleError "password not equal!!!" |

#### Edge Cases

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 17 | `uid` is invalid (fails isValidString 'uid') | handleError "uid not vaild!!!" |
| 18 | Valid uid but record does not exist in DB | handleError "password row does not exist!!!" |
| 19 | Valid uid, record exists but different owner | Mongo find returns empty (owner mismatch) → handleError |
| 20 | New tags overlap with existing tags | Set deduplication; no duplicate tags |
| 21 | All new tags are default tags | setArr may be empty after filtering |
| 22 | `conpassword` not provided but `password` also not provided | Both default to '', password === conpassword passes |
| 23 | `data.password` exists but is falsy (empty string) | isValidString returns false → handleError |
| 24 | Session is null/undefined | setLatest may throw (fire-and-forget catches via `.catch`) |

#### Error Handling

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 25 | Mongo find rejects | Promise rejects |
| 26 | Mongo update rejects | Promise rejects |
| 27 | `PasswordTagTool.setLatest` rejects | Error caught silently (`.catch(err => handleError(err, 'Set latest'))`) — does not affect main flow |
| 28 | `encrypt()` throws during password change | Synchronous throw inside `.then()` → Promise rejects |

#### Auth/Login Scenarios

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 29 | User owns the record, non-important, no auth gate | Update proceeds without userPW |
| 30 | User owns the record, important, valid userPW | Update proceeds |
| 31 | User owns the record, important, invalid userPW | handleError "permission denied" |
| 32 | User owns the record, important, no userPW provided | userPW = '' → userPWCheck(user, '') fails → "permission denied" |
| 33 | User does not own the record | Mongo find returns empty → "password row does not exist!!!" |

---

## 5. Function: `delRow`

### 5.1 Purpose

Deletes a password record from MongoDB. Enforces ownership and the important-flag permission gate before deletion.

### 5.2 Invocation & Authentication

```js
delRow(uid, userPW, user)
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | String | ✅ | Record ID (validated as 'uid') |
| `userPW` | String | Conditional | Required if record is marked important |
| `user` | Object | ✅ | Authenticated user (must have `_id`) |

**Authentication**: Record must match `{ _id: id, owner: user._id }`. If `important !== 0`, `userPWCheck` must pass.

### 5.3 Logic Flow

```
1. Validate uid via isValidString(uid, 'uid')
2. Guard: Reject if uid invalid
3. Mongo.find PASSWORDDB where { _id: id, owner: user._id } (limit: 1)
4. Guard: Reject if no results → "password row does not exist!!!"
5. If existing.important !== 0:
   a. If userPW exists → validate via isValidString(userPW, 'passwd')
   b. Guard: Reject if userPWCheck fails → "permission denied"
6. Mongo.deleteMany PASSWORDDB where { _id, owner }
7. Return delete result
```

### 5.4 Returns & Side Effects

| Outcome | Return Value | Side Effects |
|---------|-------------|-------------|
| Success | `Promise<deleteMany_result>` | Document removed from `PASSWORDDB` |
| Record not found | `handleError(...)` | No DB change |
| Permission denied | `handleError(...)` | No DB change |

### 5.5 Snapshot Testing Data

**Input**:
```json
{
  "uid": "507f1f77bcf86cd799439011",
  "userPW": "myPin",
  "user": { "_id": "60d5ecb74e4d2a001f2c8b01" }
}
```

### 5.6 Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches

| # | Scenario | Branch | Expected Outcome |
|---|----------|--------|-----------------|
| 1 | Non-important record, valid uid, correct owner | Skip auth block, deleteMany | Record deleted |
| 2 | Important record, valid userPW, userPWCheck passes | Auth block entered, check passes | Record deleted |
| 3 | Important record, valid userPW, userPWCheck fails | Auth block entered, check fails | handleError "permission denied" |
| 4 | Important record, no userPW provided | validUserPW = '' | handleError "permission denied" |
| 5 | Important record, userPW fails isValidString | Line 218–219 | handleError "passwd not vaild!!!" |

#### Edge Cases

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 6 | `uid` is null/undefined | isValidString returns false → handleError "uid not vaild!!!" |
| 7 | `uid` is valid but record not in DB | handleError "password row does not exist!!!" |
| 8 | `uid` valid, record exists, wrong owner | Mongo find returns empty → handleError |
| 9 | `userPW` is falsy (empty string, null) for non-important record | Auth block skipped, deletion proceeds |
| 10 | `important` is exactly `0` (number) | `pws[0].important !== 0` is false → skip auth |
| 11 | `important` is `''` or `false` (falsy but !== 0) | `pws[0].important !== 0` is true → auth block entered |

#### Error Handling

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 12 | Mongo find rejects | Promise rejects |
| 13 | Mongo deleteMany rejects | Promise rejects |

#### Auth/Login Scenarios

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 14 | Correct owner, non-important | Delete succeeds without userPW |
| 15 | Correct owner, important, correct userPW | Delete succeeds |
| 16 | Wrong owner | "password row does not exist!!!" |

---

## 6. Function: `getPassword`

### 6.1 Purpose

Retrieves and decrypts a password (or previous password) from a record. Enforces ownership and the important-flag permission gate. Triggers `setLatest` on the tag tool.

### 6.2 Invocation & Authentication

```js
getPassword(uid, userPW, user, session, type = null)
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `uid` | String | ✅ | — | Record ID (validated as 'uid') |
| `userPW` | String | Conditional | — | Required if record is marked important |
| `user` | Object | ✅ | — | Authenticated user (must have `_id`) |
| `session` | Object | ✅ | — | Express session (passed to `setLatest`) |
| `type` | String\|null | ❌ | `null` | If `'pre'`, returns previous password |

**Authentication**: Record must match `{ _id: id, owner: user._id }`. If `important !== 0`, `userPWCheck` must pass.

### 6.3 Logic Flow

```
1. Validate uid via isValidString(uid, 'uid')
2. Guard: Reject if uid invalid
3. Mongo.find PASSWORDDB where { _id: id, owner: user._id }
   Projection:
     - _id: 0, important: 1
     - If type === 'pre' → prePassword: 1
     - Else → password: 1
   Limit: 1
4. Guard: Reject if no results → "can not find password object!!!"
5. If items[0].important !== 0:
   a. If userPW exists → validate via isValidString(userPW, 'passwd')
   b. Guard: Reject if userPWCheck fails → "permission denied"
6. Fire-and-forget: PasswordTagTool.setLatest(id, session)
7. Decrypt the appropriate field:
   - type === 'pre' → decrypt(items[0].prePassword)
   - else → decrypt(items[0].password)
8. Return { password: decrypted_value }
```

### 6.4 Returns & Side Effects

| Outcome | Return Value | Side Effects |
|---------|-------------|-------------|
| Success (current) | `Promise<{ password: "plaintext" }>` | `setLatest` called (fire-and-forget) |
| Success (previous) | `Promise<{ password: "previous_plaintext" }>` | `setLatest` called |
| Record not found | `handleError(...)` | None |
| Permission denied | `handleError(...)` | None |

### 6.5 Snapshot Testing Data

**Input (Current Password)**:
```json
{
  "uid": "507f1f77bcf86cd799439011",
  "userPW": null,
  "user": { "_id": "60d5ecb74e4d2a001f2c8b01" },
  "session": {},
  "type": null
}
```

**Expected Output**:
```json
{
  "password": "S3cure!Pass"
}
```

**Input (Previous Password)**:
```json
{
  "uid": "507f1f77bcf86cd799439011",
  "userPW": "myPin",
  "user": { "_id": "60d5ecb74e4d2a001f2c8b01" },
  "session": {},
  "type": "pre"
}
```

### 6.6 Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches

| # | Scenario | Branch | Expected Outcome |
|---|----------|--------|-----------------|
| 1 | `type = null` (default), non-important record | Fetch `password` field, skip auth | Return decrypted current password |
| 2 | `type = 'pre'`, non-important record | Fetch `prePassword` field, skip auth | Return decrypted previous password |
| 3 | `type = null`, important record, valid userPW | Fetch `password`, auth passes | Return decrypted current password |
| 4 | `type = 'pre'`, important record, valid userPW | Fetch `prePassword`, auth passes | Return decrypted previous password |
| 5 | Important record, userPW fails userPWCheck | Auth block fails | handleError "permission denied" |
| 6 | Important record, no userPW | validUserPW = '' | handleError "permission denied" |
| 7 | Important record, userPW fails isValidString | Line 254–255 | handleError "passwd not vaild!!!" |
| 8 | `type` is any other string (not 'pre' and not null) | Falls to else branch | Decrypts `password` (current), not `prePassword` |

#### Edge Cases

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 9 | `uid` is invalid | handleError "uid not vaild!!!" |
| 10 | Valid uid, record not found | handleError "can not find password object!!!" |
| 11 | Valid uid, wrong owner | Mongo find returns empty → handleError |
| 12 | Stored password is corrupted (not in supported 2-part/3-part format) | `decrypt()` may throw → Promise rejects |
| 13 | `prePassword` field is missing from legacy record | `decrypt(undefined)` → runtime error |
| 14 | Session is null/undefined | `setLatest` may throw (fire-and-forget) |

#### Error Handling

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 15 | Mongo find rejects | Promise rejects |
| 16 | `decrypt()` throws (malformed cipher text) | Promise rejects |
| 17 | `setLatest` rejects | Caught silently; does not affect return value |

#### Auth/Login Scenarios

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 18 | Correct owner, non-important | Password returned without userPW |
| 19 | Correct owner, important, correct userPW | Password returned |
| 20 | Wrong owner | "can not find password object!!!" |
| 21 | `important` stored as non-zero non-one value (e.g., 2) | `!== 0` is true → auth required |

---

## 7. Function: `generatePW`

### 7.1 Purpose

Generates a random 16-character password using the `password-generator` library with a character class determined by the `type` parameter.

### 7.2 Invocation & Authentication

```js
generatePW(type)
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | Number | ✅ | Character class selector: `3` = digits only, `2` = alphanumeric, other = alphanumeric + special |

**Authentication**: None required (pure utility function).

### 7.3 Logic Flow

```
1. If type === 3 → PasswordGenerator(16, false, /[0-9]/)
2. Else if type === 2 → PasswordGenerator(16, false, /[0-9a-zA-Z]/)
3. Else (default) → PasswordGenerator(16, false, /[0-9a-zA-Z!@#$%]/)
```

### 7.4 Returns & Side Effects

| Outcome | Return Value | Side Effects |
|---------|-------------|-------------|
| `type === 3` | 16-char numeric string | None |
| `type === 2` | 16-char alphanumeric string | None |
| Other | 16-char alphanumeric + special chars string | None |

### 7.5 Snapshot Testing Data

| Input | Expected Pattern | Example |
|-------|-----------------|---------|
| `generatePW(3)` | `/^[0-9]{16}$/` | "4829371056281945" |
| `generatePW(2)` | `/^[0-9a-zA-Z]{16}$/` | "aB3kQ9mR7xYz4LpN" |
| `generatePW(1)` | `/^[0-9a-zA-Z!@#$%]{16}$/` | "aB3!Q9#mR7$z2@Lp" |
| `generatePW(0)` | `/^[0-9a-zA-Z!@#$%]{16}$/` | "x@4Km#9$Rz2!Lp7Q" |
| `generatePW(null)` | `/^[0-9a-zA-Z!@#$%]{16}$/` | — |

### 7.6 Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches

| # | Scenario | Branch | Expected Outcome |
|---|----------|--------|-----------------|
| 1 | `type === 3` | First ternary branch | 16-char digits-only string |
| 2 | `type === 2` | Second ternary branch | 16-char alphanumeric string |
| 3 | `type === 1` | Default (else) branch | 16-char alphanumeric + special chars |
| 4 | `type === 0` | Default (else) branch | 16-char alphanumeric + special chars |
| 5 | `type === undefined` / `null` | Default branch (`!== 3` and `!== 2`) | 16-char alphanumeric + special chars |

#### Edge Cases

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 6 | `type = '3'` (string "3") | `'3' !== 3` → falls to default branch (special chars) |
| 7 | `type = '2'` (string "2") | `'2' !== 2` → falls to default branch |
| 8 | Negative number `-1` | Falls to default branch |
| 9 | `type = 3.0` (float) | `3.0 === 3` → digits-only branch |
| 10 | Call multiple times in succession | Each call returns a different random value (non-deterministic) |
| 11 | Always returns exactly 16 characters | Verify `.length === 16` for all types |

#### Error Handling

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 12 | `PasswordGenerator` library throws | Synchronous exception propagated to caller |

---
## 8. Internal Function: `encrypt`

### 8.1 Purpose

Encrypts a plaintext string using AES-256-GCM with a random 12-byte initialization vector (IV). Returns the IV, authentication tag, and ciphertext as a colon-separated hex string.

### 8.2 Invocation & Authentication

```js
encrypt(text) // module-internal, not exported
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | String | ✅ | Plaintext to encrypt |

**Authentication**: N/A — internal function.

### 8.3 Logic Flow

```
1. Generate random 12-byte IV via randomBytes(12)
2. Key buffer: module-level const, derived as Buffer.concat([Buffer.from(PASSWORD_PRIVATE_KEY), Buffer.alloc(32)], 32)
3. Create AES-256-GCM cipher with keyBuffer and IV
4. Encrypt: cipher.update(text, 'utf8') + cipher.final()
5. Get 16-byte authTag via cipher.getAuthTag()
6. Return: iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex')
```

### 8.4 Returns & Side Effects

| Outcome | Return Value | Side Effects |
|---------|-------------|-------------|
| Success | `"<24-hex-char-iv>:<32-hex-char-authTag>:<hex-ciphertext>"` | None (pure function aside from random IV) |

### 8.5 Snapshot Testing Data

**Output Format**:
```
"a1b2c3d4e5f6a7b8a1b2c3d4:9f8e7d6c5b4a3f2e1a2b3c4d5e6f7a8b:ciphertextHex"
```

- IV portion: always 24 hex characters (12 bytes)
- Auth tag: always 32 hex characters (16 bytes)
- Separator: colons `:`
- Ciphertext: variable length hex string

### 8.6 Comprehensive Test Scenarios (100% Coverage)

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 1 | Encrypt a normal ASCII string | Returns `iv:authTag:ciphertext` format; IV is 24 hex chars and authTag is 32 hex chars |
| 2 | Encrypt empty string `""` | Returns valid 3-part GCM format |
| 3 | Encrypt string with special characters `!@#$%^&*()` | Returns valid encrypted format |
| 4 | Encrypt very long string (1000+ chars) | Returns valid format with proportionally longer ciphertext |
| 5 | Encrypt same string twice | Different results (random IV ensures uniqueness) |
| 6 | Round-trip: `decrypt(encrypt(text)) === text` | Verified for various inputs |
| 7 | Unicode string input | Encrypt succeeds; round-trip preserves UTF-8 |
| 8 | `PASSWORD_PRIVATE_KEY` is shorter than 32 bytes | Precomputed `keyBuffer` padding compensates; encrypt still works |
| 9 | `PASSWORD_PRIVATE_KEY` is exactly 32 hex chars (16 bytes) | Key padded to 32 bytes with zeros |
| 10 | GCM output includes auth tag | Auth tag is present as the middle segment of the 3-part format |

---
## 9. Internal Function: `decrypt`

### 9.1 Purpose

Decrypts a ciphertext string. Auto-detects format: 3-part (GCM) or 2-part (legacy CTR). For GCM, verifies the authentication tag.

### 9.2 Invocation & Authentication

```js
decrypt(text) // module-internal, not exported
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | String | ✅ | Encrypted string in `"iv:authTag:ciphertext"` (GCM) or `"iv:ciphertext"` (legacy CTR) format |

**Authentication**: N/A — internal function.

### 9.3 Logic Flow

```
1. Split text on ':' → parts array
2. If parts.length === 3 → GCM format:
   a. IV = Buffer.from(parts[0], 'hex') (12 bytes)
   b. authTag = Buffer.from(parts[1], 'hex') (16 bytes)
   c. encryptedText = Buffer.from(parts[2], 'hex')
   d. Create AES-256-GCM decipher with keyBuffer and IV
   e. Set authTag via decipher.setAuthTag()
   f. Decrypt and return plaintext
3. If parts.length === 2 → legacy CTR format:
   a. IV = Buffer.from(parts[0], 'hex') (16 bytes)
   b. encryptedText = Buffer.from(parts[1], 'hex')
   c. Create AES-256-CTR decipher with keyBuffer and IV using ALGORITHM_LEGACY
   d. Decrypt and return plaintext
```

### 9.4 Returns & Side Effects

| Outcome | Return Value | Side Effects |
|---------|-------------|-------------|
| Success (GCM) | Original plaintext string | None |
| Success (legacy CTR) | Original plaintext string | None |
| Malformed / tampered input | Throws error | None |

### 9.5 Comprehensive Test Scenarios (100% Coverage)

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 1 | Decrypt output of `encrypt("hello")` | Returns `"hello"` via 3-part GCM path |
| 2 | Decrypt legacy `iv:ciphertext` record | Returns original plaintext via 2-part CTR path |
| 3 | Decrypt output for special characters | Returns exact original string |
| 4 | Decrypt output for empty string | Returns `""` |
| 5 | Decrypt output for Unicode string | Returns original UTF-8 string |
| 6 | Input with no colon separator | Unsupported 1-part format → throws |
| 7 | Input is empty string `""` | Split produces `[""]`; unsupported format → throws |
| 8 | Input is `null` or `undefined` | `text.split` throws TypeError |
| 9 | GCM authTag is tampered | `decipher.final()` throws authentication error |
| 10 | GCM ciphertext is tampered | Authentication failure → throws |
| 11 | Wrong `PASSWORD_PRIVATE_KEY` used with GCM data | Authentication failure → throws |
| 12 | Wrong `PASSWORD_PRIVATE_KEY` used with legacy CTR data | Returns garbage plaintext (legacy CTR has no integrity check) |

---
## 10. Exported Function: `updatePasswordCipher`

### 10.1 Purpose

Batch migration utility that re-encrypts all password records from CTR format (2-part `iv:ciphertext`) to GCM format (3-part `iv:authTag:ciphertext`). Processes records sequentially via reduce chain.

### 10.2 Invocation & Authentication

```js
import { updatePasswordCipher } from './password-tool.js';
updatePasswordCipher()
```

No parameters. Intended to be run as an admin/CLI operation.

**Authentication**: N/A — typically invoked from CLI/admin context, not user-facing routes.

### 10.3 Logic Flow

```
1. Mongo.find PASSWORDDB {} → fetch ALL password records
2. Filter malformed records: any with password or prePassword that has no ':' (1-part) → log IDs in error and reject
3. Filter records needing migration: any where password or prePassword has exactly 2 parts (CTR format)
4. For each record to migrate, build $set independently:
   a. If password is 2-part: decryptLegacyCTR(password) → encrypt() → $set.password
   b. If prePassword is 2-part: decryptLegacyCTR(prePassword) → encrypt() → $set.prePassword
5. Sequential updates via reduce chain: Mongo.update(PASSWORDDB, {_id}, {$set: update})
6. console.log the count of migrated records
```

### 10.4 Returns & Side Effects

| Outcome | Return Value | Side Effects |
|---------|-------------|-------------|
| Success (records migrated) | `Promise<void>` | Matching CTR fields updated in DB to 3-part GCM format; migration count logged |
| Success (already all GCM) | `Promise<void>` | No DB writes; logs `0 records migrated` summary |
| Malformed 1-part record detected | Promise rejects | No migration for that batch; malformed `_id` values included in error |
| Partial migration (error mid-batch) | Promise rejects | Some records updated, others not (no transaction) |

### 10.5 Snapshot Testing Data

**Mixed-format Record Set (Pre-Migration)**:
```json
[
  {
    "_id": "507f1f77bcf86cd799439011",
    "password": "<32-hex-iv>:<ctr-ciphertext>",
    "prePassword": "<32-hex-iv>:<ctr-ciphertext>"
  },
  {
    "_id": "507f1f77bcf86cd799439012",
    "password": "<24-hex-iv>:<32-hex-authTag>:<gcm-ciphertext>",
    "prePassword": "<32-hex-iv>:<ctr-ciphertext>"
  }
]
```

**Migrated Record (Post-Migration)**:
```json
{
  "_id": "507f1f77bcf86cd799439012",
  "password": "<24-hex-iv>:<32-hex-authTag>:<gcm-ciphertext>",
  "prePassword": "<24-hex-iv>:<32-hex-authTag>:<gcm-ciphertext>"
}
```

**Representative console output:**
```
2 record(s) migrated to GCM (15 total)
```

### 10.6 Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches

| # | Scenario | Branch | Expected Outcome |
|---|----------|--------|-----------------|
| 1 | Empty collection (no records) | No malformed, no migrations needed | Resolves with `0 records migrated (0 already GCM)` output |
| 2 | All records already GCM | `toMigrate.length === 0` | No DB writes; logs already-GCM summary |
| 3 | Single record, both fields CTR | Both split lengths are `2` | Record updated with 3-part GCM values in both fields |
| 4 | Single record, only `password` is CTR | Only `$set.password` populated | Record updated without touching `prePassword` |
| 5 | Single record, only `prePassword` is CTR | Only `$set.prePassword` populated | Record updated without touching `password` |
| 6 | Multiple records, mixed CTR and GCM | Filter + reduce chain | Only CTR fields are migrated |
| 7 | Malformed 1-part record exists | `malformed.length > 0` | Rejects with `_id` list in error message |

#### Edge Cases

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 8 | Record missing `password` field | `.split(':')` throws TypeError before migration |
| 9 | Record missing `prePassword` field | `.split(':')` throws TypeError before migration |
| 10 | Hundreds/thousands of records | Sequential reduce prevents concurrent write bursts; migration remains ordered |
| 11 | Legacy CTR decrypt fails on corrupt data | `decryptLegacyCTR()` throws → Promise rejects at that record |
| 12 | New GCM record includes auth tag | 3-part value is skipped as already migrated |

#### Error Handling

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 13 | Mongo find rejects | Promise rejects before filtering starts |
| 14 | Mongo update rejects mid-batch (e.g., record 3 of 10) | Promise rejects; earlier records remain migrated |
| 15 | `encrypt()` throws during re-encryption | Promise rejects at that record |
| 16 | Malformed `_id` list is long | Error message still includes comma-separated IDs for diagnostics |

#### Known Code Observations

| # | Observation | Impact |
|---|------------|--------|
| 17 | Uses `decryptLegacyCTR()` helper instead of deprecated `createDecipher` | Migration stays on supported crypto APIs |
| 18 | Builds `$set` per field independently | Avoids `encrypt(null)` / partial-field corruption bug from prior implementation |
| 19 | No transactional safety — partial migration possible on failure | Re-running is safe because already-migrated 3-part fields are skipped |

---
## 11. Cross-Cutting Concerns

### 11.1 Encryption Security Tests

| # | Test | Rationale |
|---|------|-----------|
| 1 | Round-trip: `decrypt(encrypt(plaintext)) === plaintext` for various inputs | Core correctness guarantee |
| 2 | Different plaintexts produce different ciphertexts | Non-determinism from random IV |
| 3 | Same plaintext encrypted twice produces different ciphertexts | IV randomness |
| 4 | New ciphertext format always matches `^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$` | GCM write-format invariant |
| 5 | Key derivation produces consistent 32-byte `keyBuffer` | Key stability |
| 6 | Tampering with GCM authTag causes decryption failure | Authentication guarantee |
| 7 | Legacy 2-part CTR ciphertext still decrypts during migration window | Backward compatibility |

### 11.2 Ownership Enforcement Tests

| # | Test | Applies To |
|---|------|-----------|
| 1 | User A cannot read User B's password record | `getPassword`, `editRow`, `delRow` |
| 2 | User A cannot edit User B's password record | `editRow` |
| 3 | User A cannot delete User B's password record | `delRow` |
| 4 | Ownership is checked via Mongo query filter, not post-fetch | All DB operations |

### 11.3 Important Flag Permission Gate Tests

| # | Test | Applies To |
|---|------|-----------|
| 1 | Non-important records bypass userPW check entirely | All functions with gate |
| 2 | Important records require valid userPW | All functions with gate |
| 3 | Empty userPW on important record → denied | All functions with gate |
| 4 | Invalid userPW format on important record → validation error | All functions with gate |
| 5 | Changing important flag (0→1 or 1→0) triggers userPW check | `editRow` only |

### 11.4 Tag System Integration Tests

| # | Test | Applies To |
|---|------|-----------|
| 1 | Tags auto-generated from name, username, email, url | `newRow`, `editRow` |
| 2 | Tags are normalized before storage | `newRow`, `editRow` |
| 3 | Default tags are filtered out | `newRow`, `editRow` |
| 4 | Duplicate tags are deduplicated (Set behavior) | `newRow`, `editRow` |
| 5 | Edit preserves existing tags and adds new ones | `editRow` |
| 6 | `setLatest` is called on read/edit operations | `editRow`, `getPassword` |

---

## 12. Test Environment & Mocking Strategy

### 12.1 Required Mocks

| Dependency | Mock Strategy | Notes |
|-----------|--------------|-------|
| `Mongo` (mongo-tool.js) | Jest module mock | Mock `find`, `insert`, `update`, `deleteMany` — return controlled promises |
| `objectID` (mongo-tool.js) | Return deterministic ID | e.g., `"000000000000000000000001"` |
| `TagTool` / `PasswordTagTool` | Mock factory + `setLatest` | Return mock instance with jest.fn() methods |
| `isDefaultTag`, `normalize` | Passthrough or controlled mock | Test tag filtering logic |
| `isValidString` | Controlled mock per test case | Return input or `false` to simulate validation failure |
| `handleError`, `HoError` | Spy / pass-through | Verify error messages and codes |
| `userPWCheck` | Controlled boolean return | Toggle permission gate behavior |
| `crypto.randomBytes` | Optional: deterministic mock for snapshot tests | Makes encrypt output predictable |
| `PasswordGenerator` | Controlled mock | Return fixed string for snapshot; verify regex arg for branch |
| `PASSWORD_PRIVATE_KEY` | Test fixture value | Must be valid hex for crypto operations |
| `ALGORITHM` | `'aes-256-gcm'` | Match production constant |
| `ALGORITHM_LEGACY` | `'aes-256-ctr'` | Legacy constant for backward compatibility |
| `PASSWORDDB` | `'password'` or test collection name | Match production constant |

### 12.2 Test File Location

Per OUTLINE.md §11.8:
```
src/back/models/__tests__/password-tool.test.js
```

### 12.3 Jest Configuration Notes

- **ESM support**: `NODE_OPTIONS=--experimental-vm-modules` (per OUTLINE.md §10.1)
- **Transform**: `babel-jest` with `@babel/preset-env`
- **Environment**: `node`
- **Module mocking**: Use `jest.unstable_mockModule()` for ESM imports

### 12.4 Test Organization

```
describe('password-tool')
├── describe('newRow')
│   ├── describe('input validation')
│   ├── describe('important flag permission gate')
│   ├── describe('tag generation')
│   ├── describe('successful creation')
│   └── describe('error handling')
├── describe('editRow')
│   ├── describe('input validation')
│   ├── describe('ownership enforcement')
│   ├── describe('important flag permission gate')
│   ├── describe('partial update logic')
│   ├── describe('password rotation')
│   ├── describe('tag management')
│   └── describe('error handling')
├── describe('delRow')
│   ├── describe('input validation')
│   ├── describe('ownership enforcement')
│   ├── describe('important flag permission gate')
│   └── describe('error handling')
├── describe('getPassword')
│   ├── describe('input validation')
│   ├── describe('ownership enforcement')
│   ├── describe('important flag permission gate')
│   ├── describe('current vs previous password')
│   └── describe('error handling')
├── describe('generatePW')
│   ├── describe('type-based character class selection')
│   └── describe('edge cases')
├── describe('encrypt / decrypt (internal)')
│   ├── describe('round-trip correctness')
│   ├── describe('output format')
│   └── describe('edge cases')
└── describe('updatePasswordCipher')
    ├── describe('empty collection')
    ├── describe('legacy format migration')
    ├── describe('already-migrated records')
    ├── describe('mixed records')
    └── describe('error handling')
```

### 12.5 Total Test Count Estimate

| Function | Scenarios | Est. Tests |
|----------|----------|-----------|
| `newRow` | 34 | ~34 |
| `editRow` | 33 | ~33 |
| `delRow` | 16 | ~16 |
| `getPassword` | 21 | ~21 |
| `generatePW` | 12 | ~12 |
| `encrypt` | 10 | ~10 |
| `decrypt` | 11 | ~11 |
| `updatePasswordCipher` | 22 | ~22 |
| Cross-cutting | 18 | ~18 |
| **Total** | **177** | **~177** |

---

> **Document Version**: 1.0
> **Aligned With**: OUTLINE.md §11.2 (Backend Unit Test Scope), §11.3 (Integration Scope), §11.7 (Security Scope), §11.8 (File Structure), §11.9 (Phase 1 Priority)
