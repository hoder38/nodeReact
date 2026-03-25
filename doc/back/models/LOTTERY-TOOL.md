# lottery-tool.js — Technical QA Testing Documentation

> **Module**: `src/back/models/lottery-tool.js` (435 lines)
> **Collection**: `lottery` (MongoDB)
> **Role**: Lottery lifecycle management — creation, participant/prize input, random selection, CSV import/export
> **Priority**: 🟡 High
> **Author**: QA/Test Automation Engineering

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Internal Helper: `getRewardItem()`](#2-internal-helper-getrewarditem)
3. [Internal Helper: `getUserItem()`](#3-internal-helper-getuseritem)
4. [Export: `getInit(owner)`](#4-export-getinitowner)
5. [Export: `getData(uid)`](#5-export-getdatauid)
6. [Export: `newLottery(owner, name, type, big5, user, reward)`](#6-export-newlotteryowner-name-type-big5-user-reward)
7. [Export: `input(filePath, big5)`](#7-export-inputfilepath-big5)
8. [Export: `select(uid, owner)`](#8-export-selectuid-owner)
9. [Export: `downloadCsv(user)`](#9-export-downloadcsvuser)
10. [Export: `outputCsv(user)`](#10-export-outputcsvuser)
11. [Data Model Reference](#11-data-model-reference)
12. [Cross-Cutting Concerns](#12-cross-cutting-concerns)

---

## 1. Module Overview

### 1.1 Purpose

`lottery-tool.js` implements the complete lottery system — a raffle/prize-draw engine that supports:

- Creating a lottery with typed options (remove-after-win, multi-win, anonymous)
- Importing participants and prizes from CSV files (UTF-8 or Big5 encoding)
- Random prize selection with blacklist (pre-assigned) support
- Email notification to winners via Google API
- CSV export of results
- Cleanup/teardown of lottery data

### 1.2 Dependencies

| Dependency | Usage |
|------------|-------|
| `Mongo` (`mongo-tool.js`) | All CRUD on `lottery` collection |
| `handleError`, `HoError` (`utility.js`) | Error wrapping and propagation |
| `isValidString` (`utility.js`) | Input validation (uid, email) |
| `checkAdmin` (`utility.js`) | Permission-level authorization |
| `bufferToString` (`utility.js`) | Encoding conversion for CSV import |
| `sendLotteryName` (`api-tool-google.js`) | Email notifications to winners |
| `iconv-lite` | Big5 encoding for CSV output |
| `fs` / `readline` | File I/O for CSV import/export |
| `NAS_TMP` (`config.js`) | Temp file path resolution |
| `ENV_TYPE` (`ver.js`) | Environment flag (dev/prod) |
| `LOTTERYDB` (`constants.js`) | Collection name constant (`'lottery'`) |

### 1.3 Lottery Collection Document Types

| `type` | Role | Key Fields |
|--------|------|------------|
| `0` | **Lottery metadata** (singleton) | `name`, `owner`, `count` (encoding flag), `option` [remove, multiple, anonymous] |
| `1` | **Prize/reward** entry | `name`, `owner` (sort index), `count` (quantity), `option` (winner names list), `utime` (draw progress) |
| `2` | **User/participant** entry | `name`, `owner` (sort index), `count` (entries), `option` (blacklist data), `utime` (email) |

---

## 2. Internal Helper: `getRewardItem()`

### 2.1 Purpose

Transforms raw MongoDB prize documents into a client-safe response shape, masking tags (winner names) when anonymous mode is active.

### 2.2 Function Signature

```js
const getRewardItem = (items, anonymous) => [...]
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `items` | `Array<Object>` | MongoDB documents with `type: 1` |
| `anonymous` | `Boolean` | Whether to mask the `option` (winner names) |

### 2.3 Logic Flow

1. Map each `item` to an object with `name`, `id` (`_id`), `utime`, `count`, `tags`.
2. **Branch — anonymous mode**:
   - `true` → Replace every element in `item.option` with `'********'`.
   - `false` → Pass `item.option` through as-is.

### 2.4 Returns

```js
[
  {
    name: String,     // Prize name
    id: ObjectId,     // MongoDB _id
    utime: Mixed,     // Draw timestamp or progress counter
    count: Number,    // Total quantity
    tags: [String],   // Winner names or masked strings
  },
  ...
]
```

### 2.5 Snapshot Testing Data

**Input (non-anonymous):**
```js
items = [
  { _id: ObjectId('aaa'), name: 'Gold Prize', utime: 1700000000, count: 3, option: ['Alice', 'Bob'] }
];
anonymous = false;
```

**Expected Output:**
```js
[{ name: 'Gold Prize', id: ObjectId('aaa'), utime: 1700000000, count: 3, tags: ['Alice', 'Bob'] }]
```

**Input (anonymous):**
```js
anonymous = true;
```

**Expected Output:**
```js
[{ name: 'Gold Prize', id: ObjectId('aaa'), utime: 1700000000, count: 3, tags: ['********', '********'] }]
```

### 2.6 Comprehensive Test Scenarios

| # | Scenario | Input | Expected Outcome |
|---|----------|-------|------------------|
| 1 | Empty items array | `items=[], anonymous=false` | Returns `[]` |
| 2 | Single item, non-anonymous | 1 prize doc, `anonymous=false` | `tags` contains actual names |
| 3 | Single item, anonymous | 1 prize doc, `anonymous=true` | All `tags` entries are `'********'` |
| 4 | Multiple items | 3 prize docs | Returns 3 mapped objects in order |
| 5 | Item with empty option array | `option=[]` | `tags` is `[]` |
| 6 | Item with many options | `option` has 50 entries | All 50 masked or passed through |
| 7 | Preserves all fields | Any doc | `name`, `id`, `utime`, `count` copied correctly |

---

## 3. Internal Helper: `getUserItem()`

### 3.1 Purpose

Builds a flat user list from participant documents, expanding each user by their `count` value. Returns a placeholder when anonymous or empty.

### 3.2 Function Signature

```js
const getUserItem = (items, anonymous) => [...]
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `items` | `Array<Object>` | MongoDB documents with `type: 2` |
| `anonymous` | `Boolean` | Whether to hide participant identities |

### 3.3 Logic Flow

```
START
 ├── anonymous === true?
 │    ├── YES → Return [{ id: -2, name: 'UNDISCLOSED' }]
 │    └── NO  → For each item:
 │               For j = 0..item.count-1:
 │                 Push { id: i++, name: item.name }
 │               ↓
 │              user.length < 1?
 │                ├── YES → Push { id: -1, name: 'EMPTY' }
 │                └── NO  → Return user array
END
```

### 3.4 Returns

```js
// Normal case
[{ id: 0, name: 'Alice' }, { id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]

// Anonymous case
[{ id: -2, name: 'UNDISCLOSED' }]

// Empty participants case
[{ id: -1, name: 'EMPTY' }]
```

### 3.5 Snapshot Testing Data

**Normal (2 users, counts 2 and 1):**
```js
items = [
  { name: 'Alice', count: 2 },
  { name: 'Bob',   count: 1 }
];
anonymous = false;
// → [{ id: 0, name: 'Alice' }, { id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]
```

**Anonymous:**
```js
items = [{ name: 'Alice', count: 2 }];
anonymous = true;
// → [{ id: -2, name: 'UNDISCLOSED' }]
```

**Empty:**
```js
items = [];
anonymous = false;
// → [{ id: -1, name: 'EMPTY' }]
```

### 3.6 Comprehensive Test Scenarios

| # | Scenario | Input | Expected Outcome |
|---|----------|-------|------------------|
| 1 | Anonymous mode — non-empty items | `items=[{...}], anonymous=true` | `[{ id: -2, name: 'UNDISCLOSED' }]` — items ignored |
| 2 | Anonymous mode — empty items | `items=[], anonymous=true` | `[{ id: -2, name: 'UNDISCLOSED' }]` |
| 3 | Single user, count=1 | `[{ name:'A', count:1 }]` | `[{ id: 0, name: 'A' }]` |
| 4 | Single user, count=5 | `[{ name:'A', count:5 }]` | 5 entries, ids 0–4, all name `'A'` |
| 5 | Multiple users | 3 users with counts 2, 3, 1 | 6 entries total, sequential ids 0–5 |
| 6 | Empty items, non-anonymous | `items=[], anonymous=false` | `[{ id: -1, name: 'EMPTY' }]` |
| 7 | User with count=0 | `[{ name:'A', count:0 }]` | No entries for that user; if only user → `EMPTY` |
| 8 | Large count value | `count: 10000` | 10,000 entries generated (performance edge case) |
| 9 | Sequential id assignment | Multiple users | `id` is a global counter, not per-user |

---

## 4. Export: `getInit(owner)`

### 4.1 Purpose

Retrieves the full lottery state for initial page load: lottery name, participant list, reward list, and whether the current user is the lottery owner.

### 4.2 Function Signature

```js
getInit(owner) → Promise<Object>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | `ObjectId` | The current authenticated user's ID (must have `.equals()` method) |

### 4.3 Logic Flow

```
Mongo.find(LOTTERYDB, {type: 0}, limit:1)
 ├── items.length < 1
 │    └── Return { name: false }
 └── items.length >= 1
      ├── Extract: name, anonymous (option[2]), isOwner (owner.equals)
      ├── Mongo.find(LOTTERYDB, {type: 2}, sort: owner asc)
      │    └── getUserItem(items, anonymous) → user
      └── Mongo.find(LOTTERYDB, {type: 1}, sort: owner asc)
           └── getRewardItem(items, anonymous) → reward
           └── Return { owner: isOwner, name, user, reward }
```

### 4.4 Returns & Side Effects

**Returns:**
```js
// No lottery exists
{ name: false }

// Lottery exists
{
  owner: Boolean,       // true if caller owns this lottery
  name: String,         // lottery name
  user: Array,          // getUserItem() output
  reward: Array,        // getRewardItem() output
}
```

**Side Effects:** None (read-only).

### 4.5 Snapshot Testing Data

**No lottery exists:**
```js
// Mongo find returns []
getInit(someOwnerId) → { name: false }
```

**Lottery exists, user is owner:**
```js
// type:0 doc: { name: 'Year-End Draw', owner: ObjectId('owner1'), option: [true, true, false] }
// type:2 docs: [{ name: 'Alice', count: 2 }, { name: 'Bob', count: 1 }]
// type:1 docs: [{ name: 'TV', _id: ..., utime: null, count: 1, option: [] }]
getInit(ObjectId('owner1')) → {
  owner: true,
  name: 'Year-End Draw',
  user: [{ id: 0, name: 'Alice' }, { id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
  reward: [{ name: 'TV', id: ..., utime: null, count: 1, tags: [] }]
}
```

### 4.6 Comprehensive Test Scenarios

| # | Scenario | Condition | Expected Outcome |
|---|----------|-----------|------------------|
| 1 | No lottery exists | `type:0` find returns `[]` | `{ name: false }` |
| 2 | Lottery exists, caller is owner | `owner.equals(items[0].owner) === true` | `owner: true` in response |
| 3 | Lottery exists, caller is NOT owner | `owner.equals(items[0].owner) === false` | `owner: false` in response |
| 4 | Anonymous lottery | `option[2] === true` | `user` = `[UNDISCLOSED]`, `reward.tags` all masked |
| 5 | Non-anonymous lottery | `option[2] === false` | Full user/reward details visible |
| 6 | No participants (type:2 empty) | Only type:0 exists | `user: [{ id: -1, name: 'EMPTY' }]` |
| 7 | No rewards (type:1 empty) | Only type:0 and type:2 | `reward: []` |
| 8 | Multiple participants/rewards | 10 users, 5 prizes | All correctly aggregated |
| 9 | Sort order verification | Multiple type:2 docs | Results sorted by `owner` ascending |

---

## 5. Export: `getData(uid)`

### 5.1 Purpose

Fetches either a specific prize's reward data (by uid) or the full participant list. Used for data refresh after a draw.

### 5.2 Function Signature

```js
getData(uid = null) → Promise<Array>
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `uid` | `String\|null` | `null` | If provided, fetch specific prize. If null, fetch user list. |

### 5.3 Logic Flow

```
Mongo.find(LOTTERYDB, {type: 0}, limit:1)
 ├── items.length < 1
 │    └── handleError('cannot find lottery!!!')
 └── items.length >= 1
      ├── Extract anonymous = option[2]
      ├── uid is truthy?
      │    ├── YES:
      │    │    ├── isValidString(uid, 'uid') → id
      │    │    ├── id falsy? → handleError('invalid uid')
      │    │    ├── Mongo.find(LOTTERYDB, {_id: id}, limit:1)
      │    │    │    ├── items.length < 1 → handleError('Prize is not exist!!!')
      │    │    │    └── Return getRewardItem(items, anonymous)
      │    └── NO:
      │         ├── Mongo.find(LOTTERYDB, {type: 2}, sort: owner asc)
      │         └── Return getUserItem(items, anonymous)
```

### 5.4 Returns & Side Effects

**Returns:**
- With valid `uid` → `Array` from `getRewardItem()` (single-element array)
- Without `uid` → `Array` from `getUserItem()`

**Side Effects:** None (read-only).

**Error Conditions:**

| Error Message | Trigger |
|---------------|---------|
| `'cannot find lottery!!!'` | No `type:0` document exists |
| `'invalid uid'` | `uid` fails `isValidString(uid, 'uid')` |
| `'Prize is not exist!!!'` | No document matches the given `_id` |

### 5.5 Snapshot Testing Data

**Fetch user list (no uid):**
```js
getData() → [{ id: 0, name: 'Alice' }, { id: 1, name: 'Bob' }]
```

**Fetch specific prize:**
```js
getData('507f1f77bcf86cd799439011') → [{ name: 'TV', id: ..., utime: 2, count: 3, tags: ['Alice'] }]
```

### 5.6 Comprehensive Test Scenarios

| # | Scenario | Input | Expected Outcome |
|---|----------|-------|------------------|
| 1 | No lottery exists | Any uid | Error: `'cannot find lottery!!!'` |
| 2 | uid = null (default) | No arg | Returns full user list via `getUserItem()` |
| 3 | uid = valid ObjectId string | Existing prize ID | Returns `getRewardItem()` for that prize |
| 4 | uid = invalid string format | `'not-a-uid'` | Error: `'invalid uid'` |
| 5 | uid = valid format but non-existent | Valid ObjectId, no matching doc | Error: `'Prize is not exist!!!'` |
| 6 | uid = empty string `''` | `''` | Falsy → falls to user list branch |
| 7 | Anonymous mode + uid | Prize exists, anonymous=true | Winner tags masked as `'********'` |
| 8 | Anonymous mode + no uid | No uid, anonymous=true | Returns `[UNDISCLOSED]` |
| 9 | uid = `undefined` (explicit) | `undefined` | Falsy → user list branch |

---

## 6. Export: `newLottery(owner, name, type, big5, user, reward)`

### 6.1 Purpose

Creates a new lottery with its metadata, all participant entries, and all prize entries in the database. Enforces singleton constraint (only one lottery at a time).

### 6.2 Function Signature

```js
newLottery(owner, name, type, big5, user, reward) → Promise<void>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `owner` | `ObjectId` | Creator's user ID |
| `name` | `String` | Lottery name |
| `type` | `String` | Option preset (`'0'`–`'5'`), maps to `[remove, multiple, anonymous]` |
| `big5` | `String` | Encoding flag: `'en'` sets count=0, else count=1 |
| `user` | `Array<Array>` | Participant data: `[[name, count, emailOrEmpty, ...blacklist], ...]` |
| `reward` | `Array<Array>` | Prize data: `[[name, count], ...]` |

### 6.3 Logic Flow

```
1. Compute option array from type:
     '1' → [true,  true,  false]  (remove + multiple)
     '2' → [false, true,  false]  (multiple only)
     '3' → [true,  false, true]   (remove + anonymous)
     '4' → [true,  true,  true]   (remove + multiple + anonymous)
     '5' → [false, true,  true]   (multiple + anonymous)
     default → [true, false, false] (remove only)

2. Mongo.find(LOTTERYDB, {type: 0}, limit:1)
   ├── items.length > 0 → handleError('already has a lottery!!!')
   └── items.length === 0:
        ├── Insert type:0 metadata doc { type:0, owner, name, count:(big5==='en'?0:1), option }
        ├── recurUser(0): For each user[i]:
        │    Insert type:2 doc {
        │      type: 2,
        │      owner: i (index),
        │      name: user[i][0],
        │      count: user[i][1],
        │      option: user[i].splice(3),   // blacklist data
        │      utime: user[i][2]            // only if valid email
        │    }
        ├── recurReward(0): For each reward[i]:
        │    Insert type:1 doc {
        │      type: 1,
        │      owner: i (index),
        │      name: reward[i][0],
        │      count: reward[i][1],
        │      option: [],
        │    }
        └── On error → Mongo.deleteMany(LOTTERYDB, {}) (cleanup all) → re-throw
```

### 6.4 Returns & Side Effects

**Returns:** Resolves with `undefined` on success.

**Side Effects:**
- **DB inserts**: 1 type:0 doc + N type:2 docs + M type:1 docs into `lottery` collection
- **On failure**: All lottery documents are deleted (rollback via `deleteMany`)

**Error Conditions:**

| Error Message | Trigger |
|---------------|---------|
| `'already has a lottery!!!'` | A `type:0` document already exists |
| Any insertion error | Propagated after cleanup |

### 6.5 Type-to-Option Mapping Table

| `type` value | `option[0]` remove | `option[1]` multiple | `option[2]` anonymous | Description |
|-------------|-------------------|---------------------|----------------------|-------------|
| `'0'` (default) | `true` | `false` | `false` | Winner removed, single-win |
| `'1'` | `true` | `true` | `false` | Winner removed, multi-win |
| `'2'` | `false` | `true` | `false` | Winner stays, multi-win |
| `'3'` | `true` | `false` | `true` | Winner removed, single-win, anonymous |
| `'4'` | `true` | `true` | `true` | Winner removed, multi-win, anonymous |
| `'5'` | `false` | `true` | `true` | Winner stays, multi-win, anonymous |

### 6.6 Snapshot Testing Data

**Minimal creation:**
```js
newLottery(
  ObjectId('owner1'), 'Holiday Draw', '0', 'en',
  [['Alice', 2, ''], ['Bob', 1, 'bob@test.com']],
  [['TV', 1], ['Phone', 2]]
)
// Inserts: 1 meta + 2 users + 2 rewards = 5 documents
```

### 6.7 Comprehensive Test Scenarios

| # | Scenario | Input / Condition | Expected Outcome |
|---|----------|-------------------|------------------|
| 1 | Successful creation (type '0') | Valid inputs, no existing lottery | 1 meta + N users + M rewards inserted |
| 2 | Lottery already exists | type:0 doc already in DB | Error: `'already has a lottery!!!'` |
| 3 | Type '1' option mapping | `type='1'` | `option = [true, true, false]` |
| 4 | Type '2' option mapping | `type='2'` | `option = [false, true, false]` |
| 5 | Type '3' option mapping | `type='3'` | `option = [true, false, true]` |
| 6 | Type '4' option mapping | `type='4'` | `option = [true, true, true]` |
| 7 | Type '5' option mapping | `type='5'` | `option = [false, true, true]` |
| 8 | Default option mapping | `type='9'` or any non-'1'..'5' | `option = [true, false, false]` |
| 9 | big5 = 'en' | `big5='en'` | Meta doc `count = 0` |
| 10 | big5 ≠ 'en' | `big5='zh'` or any other | Meta doc `count = 1` |
| 11 | User with valid email | `user[i][2]` is valid email | `utime` set to email string |
| 12 | User with invalid/empty email | `user[i][2]` fails `isValidString(_, 'email')` | `utime` field omitted |
| 13 | User with blacklist data | `user[i]` has elements at index 3+ | `option` contains blacklist indices |
| 14 | Empty user array | `user = []` | No type:2 docs inserted |
| 15 | Empty reward array | `reward = []` | No type:1 docs inserted |
| 16 | Insertion failure mid-user | 2nd user insert throws | All docs cleaned up via `deleteMany`, error propagated |
| 17 | Insertion failure mid-reward | 1st reward insert throws | All docs cleaned up, error propagated |
| 18 | Owner index assignment | 3 users | `owner` field = 0, 1, 2 respectively |
| 19 | user array mutation | `user[i].splice(3)` | Verify original array is mutated (`.splice` side effect) |

---

## 7. Export: `input(filePath, big5)`

### 7.1 Purpose

Parses a CSV file containing participant and prize data. Handles encoding conversion (Big5 → UTF-8), duplicate user merging, blacklist data extraction, and email field detection regardless of column order.

### 7.2 Function Signature

```js
input(filePath, big5 = false) → Promise<{ user: Array, reward: Array }>
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `filePath` | `String` | — | Absolute path to uploaded CSV file |
| `big5` | `Boolean` | `false` | Whether the CSV is Big5-encoded |

### 7.3 Logic Flow

```
1. Read filePath as raw buffer
2. Convert buffer to string (bufferToString handles Big5 if needed)
3. Write UTF-8 version to NAS_TMP/lottery.csv
4. Read line-by-line via readline:
   ├── isUser = true (starts in user section)
   ├── For each line:
   │    ├── Split by ','
   │    ├── parse[0] empty → skip
   │    ├── parse[0] === 'prize' → switch to reward section (isUser = false)
   │    ├── isUser === true:
   │    │    ├── Check for duplicate name (parse[0].trim())
   │    │    │    ├── DUPLICATE FOUND:
   │    │    │    │    ├── Detect email/count column swap (parse[1] may be email)
   │    │    │    │    ├── Accumulate count
   │    │    │    │    ├── Set email if not already set
   │    │    │    │    ├── parse[26] → accumulate blacklist count
   │    │    │    │    ├── parse[27+] → append blacklist reward indices (value - 1)
   │    │    │    │    └── break
   │    │    │    └── NOT DUPLICATE:
   │    │    │         ├── Detect email/count column swap
   │    │    │         ├── Create [name, count, email, ...blacklist]
   │    │    │         └── Push to user[]
   │    │    └── (Column layout: 0=name, 1=count OR email, 2=email OR count, 26=blacklist count, 27+=blacklist reward indices)
   │    └── isUser === false (reward section):
   │         └── Push [name.trim(), count || 1] to reward[]
   ├── On close:
   │    ├── user.length < 1 OR reward.length < 1 → reject('user or prize is empty!!!')
   │    └── Resolve { user, reward }
```

### 7.4 CSV Format Specification

```csv
Alice,3,alice@mail.com,,,,,,,,,,,,,,,,,,,,,,,,2,1,3
Bob,bob@mail.com,1
Alice,2
prize
TV,1
Phone,2
```

| Column | Index | Content |
|--------|-------|---------|
| Name | 0 | Participant or prize name |
| Count/Email | 1 | Entry count OR email (auto-detected) |
| Email/Count | 2 | Email OR entry count (auto-detected) |
| (unused) | 3–25 | Reserved |
| Blacklist count | 26 | Number of blacklisted draws |
| Blacklist rewards | 27+ | Prize indices (1-based in CSV, stored 0-based) |
| Separator | — | Row with `prize` in column 0 divides users from prizes |

### 7.5 Returns & Side Effects

**Returns:**
```js
{
  user: [
    ['Alice', 5, 'alice@mail.com', 2, 0, 2],  // name, total count, email, blacklist count, reward indices...
    ['Bob', 1, 'bob@mail.com']
  ],
  reward: [
    ['TV', 1],
    ['Phone', 2]
  ]
}
```

**Side Effects:**
- Writes a temporary UTF-8 CSV file to `NAS_TMP/lottery.csv`

**Error Conditions:**

| Error Message | Trigger |
|---------------|---------|
| File read error | `filePath` doesn't exist or is unreadable |
| File write error | Cannot write to `NAS_TMP/lottery.csv` |
| `'user or prize is empty!!!'` | No users or no prizes parsed |

### 7.6 Snapshot Testing Data

**Standard CSV:**
```csv
Alice,2,alice@test.com
Bob,1
prize
TV,3
```
→ `{ user: [['Alice', 2, 'alice@test.com'], ['Bob', 1, undefined]], reward: [['TV', 3]] }`

**Duplicate user merge:**
```csv
Alice,2,alice@test.com
Alice,3
prize
TV,1
```
→ `{ user: [['Alice', 5, 'alice@test.com']], reward: [['TV', 1]] }`

**Swapped email/count columns:**
```csv
Alice,alice@test.com,2
prize
TV,1
```
→ `{ user: [['Alice', 2, 'alice@test.com']], reward: [['TV', 1]] }`

### 7.7 Comprehensive Test Scenarios

| # | Scenario | Input | Expected Outcome |
|---|----------|-------|------------------|
| 1 | Standard CSV (users + prizes) | Well-formed CSV | Correct `user` and `reward` arrays |
| 2 | Big5 encoded CSV | `big5=true`, Big5-encoded file | Converted to UTF-8, parsed correctly |
| 3 | UTF-8 CSV (default) | `big5=false` | Direct parse |
| 4 | Empty line in CSV | Blank row | Skipped (`!parse[0]`) |
| 5 | `prize` separator row | Row starting with `'prize'` | Switches parser to reward section |
| 6 | Duplicate user names | Same name on 2 rows | Counts accumulated, email preserved from first non-empty |
| 7 | Email in column 1, count in column 2 | `Alice,alice@test.com,3` | Auto-detect swap: count=3, email=alice@test.com |
| 8 | Email in column 2, count in column 1 | `Alice,3,alice@test.com` | Normal order: count=3, email=alice@test.com |
| 9 | No count provided | `Alice,,alice@test.com` | Default count = 1 |
| 10 | No email provided | `Alice,3` | email = `undefined` |
| 11 | Blacklist count (col 26) | Sparse row with col 26 = `'5'` | Blacklist count = 5 |
| 12 | Blacklist reward indices (col 27+) | Cols 27, 28 = `'1'`, `'3'` | Stored as `[0, 2]` (1-based → 0-based) |
| 13 | Duplicate user with blacklist merge | Same name, both have col 26 | Blacklist counts summed |
| 14 | Duplicate user, only 2nd has blacklist | First row no blacklist, second has | Blacklist data added correctly |
| 15 | Empty blacklist column terminates | Col 27=`'2'`, col 28=`''`, col 29=`'4'` | Only `[1]` stored (break on empty) |
| 16 | Prize with no count | `TV,` or `TV` | Default count = 1 |
| 17 | Prize name trimmed | `  TV  ,2` | Name = `'TV'` |
| 18 | User name trimmed | `  Alice  ,3` | Name = `'Alice'` |
| 19 | No users, only prizes | Only `prize` separator + rewards | Error: `'user or prize is empty!!!'` |
| 20 | Only users, no prizes | No `prize` separator | Error: `'user or prize is empty!!!'` |
| 21 | Completely empty file | Empty content | Error: `'user or prize is empty!!!'` |
| 22 | File does not exist | Invalid `filePath` | Promise rejects with fs read error |
| 23 | NAS_TMP not writable | Disk full or permissions | Promise rejects with fs write error |
| 24 | Duplicate user — email set on first, not second | 2nd row has no email | Original email preserved |
| 25 | Duplicate user — email NOT set on first, set on second | 1st row no email, 2nd has | Email filled from 2nd row |
| 26 | Blacklist with no existing blacklist count | Col 27+ present but col 26 absent, new user | `u.length < 4` check → push 0 first |
| 27 | Blacklist with no existing blacklist count (duplicate) | Duplicate, col 27+ present but user has no `[3]` | `user[i].length < 4` → push 0 first |
| 28 | Multiple prizes | Several reward rows | All parsed in order |
| 29 | Very large CSV | 10,000 users, 100 prizes | Parses without error (performance) |

---

## 8. Export: `select(uid, owner)`

### 8.1 Purpose

Core lottery draw engine. Selects random winner(s) for a specific prize, handles blacklist (pre-assigned) winners, updates the database, removes winners from pool if configured, and sends email notifications.

### 8.2 Function Signature

```js
select(uid, owner) → Promise<{ namelist, id, rewardName }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `uid` | `String` | Prize document ID to draw for |
| `owner` | `ObjectId` | Current user's ID — must match lottery owner |

### 8.3 Logic Flow

```
1. Validate uid via isValidString(uid, 'uid')
   ├── Invalid → handleError('invalid uid')
   └── Valid → id

2. Mongo.find(LOTTERYDB, {type: 0}, limit:1) → lottery meta
   ├── Not found → handleError('lottery is not exist')
   ├── owner mismatch → handleError('You are not the owner')
   └── Extract: lotteryName, remove, multiple, anonymous

3. Mongo.find(LOTTERYDB, {_id: id}, limit:1) → reward doc
   ├── Not found → handleError('Prize is not exist!!!')
   └── Extract: rewardName, number (owner index)

4. Calculate remaining quantity:
   ├── utime is object (null/Date) → quantity = 0  (already used up/initial)
   │   [Note: initial utime is undefined/absent, so typeof is 'undefined' → falls to else]
   ├── utime is number → quantity = count - utime
   └── else → quantity = count
   ├── quantity < 1 → handleError('Prize has already opened!!!')

5. Build user pool:
   Mongo.find(LOTTERYDB, {type: 2}) → all participants
   For each participant:
   ├── Has blacklist entries (option.length > 1):
   │    ├── q = multiple ? (count - option.length + 1) : 0
   │    ├── For each option[i] (i > 0): add to rewardlist Map (key=reward index → user info)
   │    └── (Blacklisted users pre-assigned to specific reward numbers)
   ├── q > 0:
   │    ├── q += option[0] (blacklist count bonus)
   │    └── Push q copies into userlist[]

6. Draw loop (quantity iterations):
   For i = 0..quantity-1:
   ├── Check rewardlist.has(number) → blacklist match
   │    ├── YES → name = rewardlist.get(number); delete from map
   │    └── NO:
   │         ├── userlist empty?
   │         │    ├── YES + rewardlist has entries → take first from rewardlist
   │         │    ├── YES + rewardlist empty → break loop
   │         │    └── NO → random select from userlist
   │         ├── remove mode?
   │              ├── multiple → splice single entry
   │              └── !multiple → filter ALL entries with same name
   ├── Push winner to prizedlist[]

7. prizedlist empty → handleError('There is no user left!!!')

8. DB Update — reward document:
   ├── utime = (existing utime || 0) + prizedlist.length
   ├── If utime >= count → utime = current Unix timestamp (marks as fully drawn)
   ├── option = existing option + winner names
   └── Mongo.update reward doc

9. If remove mode — update/delete user docs:
   ├── For each winner in prizedlist:
   │    ├── multiple mode:
   │    │    ├── Decrement count
   │    │    ├── count < 1 → deleteMany user doc
   │    │    └── count >= 1 → update user doc with new count
   │    └── !multiple mode:
   │         └── deleteMany user doc (remove entirely)

10. Send email notifications:
    ├── For each winner:
    │    ├── Has valid email → sendLotteryName(lotteryName, congratsMsg, email)
    │    └── No valid email → skip

11. Return:
    {
      namelist: anonymous ? masked : winner names,
      id: prize ObjectId,
      rewardName: String
    }
```

### 8.4 Returns & Side Effects

**Returns:**
```js
{
  namelist: ['Alice', 'Bob'] | ['********', '********'],  // masked if anonymous
  id: ObjectId,              // the prize document ID
  rewardName: String,        // the prize name
}
```

**Side Effects:**
- **DB update**: Reward document (`type:1`) — updates `utime` and appends names to `option`
- **DB update/delete**: User documents (`type:2`) — count decremented or document deleted when `remove=true`
- **External call**: `sendLotteryName()` sends email to winners with valid email addresses
- **Randomness**: Uses `Math.random()` — non-deterministic

**Error Conditions:**

| Error Message | Trigger |
|---------------|---------|
| `'invalid uid'` | `uid` fails validation |
| `'lottery is not exist'` | No `type:0` document |
| `'You are not the owner'` | `owner` doesn't match lottery creator |
| `'Prize is not exist!!!'` | No document with given `_id` |
| `'Prize has already opened!!!'` | Remaining quantity ≤ 0 |
| `'There is no user left!!!'` | Draw produced 0 winners |

### 8.5 Snapshot Testing Data

**Simple draw (remove mode, non-anonymous):**
```js
// Setup: type:0 with option [true, false, false], owner matches
// Prize: { count: 2, owner: 0, option: [], utime: undefined }
// Users: [{ name: 'Alice', count: 1, option: [] }, { name: 'Bob', count: 1, option: [] }]
// Math.random mocked to return 0 → selects first user

select(prizeId, ownerId) → {
  namelist: ['Alice', 'Alice'],  // or ['Bob', ...] depending on random
  id: prizeId,
  rewardName: 'TV'
}
// DB: Prize utime set to timestamp (2 >= 2), Alice's doc deleted
```

**Blacklist draw:**
```js
// User Charlie has option: [0, 0] → pre-assigned to reward index 0
// Prize at owner index 0 drawn
// → Charlie automatically wins (no randomness)
```

### 8.6 Comprehensive Test Scenarios

| # | Scenario | Condition | Expected Outcome |
|---|----------|-----------|------------------|
| **Validation** |||
| 1 | Invalid uid | `uid='invalid'` | Error: `'invalid uid'` |
| 2 | No lottery exists | Empty DB | Error: `'lottery is not exist'` |
| 3 | Not the owner | `owner ≠ lottery.owner` | Error: `'You are not the owner'` |
| 4 | Prize not found | Valid uid, no matching doc | Error: `'Prize is not exist!!!'` |
| **Quantity Calculation** |||
| 5 | utime is object (Date/null) | `typeof utime === 'object'` | `quantity = 0` → already opened |
| 6 | utime is number (partial draw) | `utime = 2, count = 5` | `quantity = 3` |
| 7 | utime is undefined (fresh) | No utime field | `quantity = count` |
| 8 | quantity = 0 (fully drawn) | `utime === count` | Error: `'Prize has already opened!!!'` |
| **User Pool Construction** |||
| 9 | Users with no blacklist | `option = []` | All entries added to userlist |
| 10 | User with blacklist entries | `option.length > 1` | Pre-assigned to rewardlist Map |
| 11 | Multiple mode + blacklist | `multiple=true`, user has 2 blacklists | `q = count - option.length + 1` |
| 12 | Non-multiple mode + blacklist | `multiple=false` | `q = 0` for that user (all chances pre-assigned) |
| 13 | Blacklist count bonus | `option[0] = 3` | Extra 3 entries added to userlist |
| **Draw Logic** |||
| 14 | Blacklist match for current reward | `rewardlist.has(number)` | Forced winner, no randomness |
| 15 | Normal random selection | No blacklist match, users available | `Math.floor(Math.random() * userlist.length)` |
| 16 | Remove + multiple mode | Winner drawn | Single entry spliced from userlist |
| 17 | Remove + non-multiple mode | Winner drawn | ALL entries with same name filtered out |
| 18 | No remove mode | Winner drawn | userlist unchanged |
| 19 | Userlist exhausted + rewardlist has entries | All users drawn | Takes from rewardlist overflow |
| 20 | Userlist and rewardlist both empty | No candidates | Loop breaks early |
| 21 | Empty prizedlist after loop | No winners selected | Error: `'There is no user left!!!'` |
| **DB Update** |||
| 22 | Partial draw (utime < count after) | 1 of 3 drawn | `utime = 0 + 1 = 1` (counter) |
| 23 | Fully drawn (utime >= count) | Last prize drawn | `utime = Unix timestamp` |
| 24 | Option array concatenation | 2 winners drawn | `option` appended with 2 names |
| 25 | Remove + multiple: count decrements | Winner has count=3 | count becomes 2, doc updated |
| 26 | Remove + multiple: count hits 0 | Winner has count=1 | Doc deleted |
| 27 | Remove + non-multiple: user deleted | Any winner | User doc deleted entirely |
| **Email Notifications** |||
| 28 | Winner has valid email | `isValidString(mail, 'email')` | `sendLotteryName()` called with lottery name, congratulations message, email |
| 29 | Winner has no email | `mail` is undefined/invalid | Skipped, no call |
| 30 | Multiple winners, mixed email | Some have email, some don't | Only valid emails trigger send |
| **Anonymous Mode** |||
| 31 | Anonymous = true | `option[2] = true` | `namelist` entries replaced with `'********'` |
| 32 | Anonymous = false | `option[2] = false` | `namelist` contains actual names |
| **Edge Cases** |||
| 33 | Single user, single prize | Minimal lottery | Correct winner, doc cleanup |
| 34 | Prize count = 1 | One winner to draw | Single element in prizedlist |
| 35 | Prize count = 100 | Many draws in one call | Loop runs 100 times (or until pool exhausted) |
| 36 | Decrement bug (postfix `--`) | `prizedlist[index].count--` | Returns old value; verify DB gets old value |
| 37 | Concurrent select calls | Two draws at same time | Race condition on user pool (document-level) |

---

## 9. Export: `downloadCsv(user)`

### 9.1 Purpose

Finalizes the lottery by deleting all lottery data from the database and returning the CSV output file path and lottery name. Acts as the "end lottery" operation.

### 9.2 Function Signature

```js
downloadCsv(user) → Promise<{ path, name }>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `user` | `Object` | Authenticated user object with `_id` and permission data |

### 9.3 Invocation & Authentication

- **Auth required**: Yes — user must be admin (`checkAdmin(1, user)` returns falsy) OR be the lottery owner.
- **Permission logic**: `checkAdmin(1, user) && !user._id.equals(items[0].owner)` — if the user is NOT admin (checkAdmin returns truthy for non-admin) AND is not the owner, access is denied.

### 9.4 Logic Flow

```
Mongo.find(LOTTERYDB, {type: 0}, limit:1)
 ├── items.length < 1 → handleError('lottery is not exist')
 ├── checkAdmin(1, user) && !user._id.equals(owner) → handleError('You are not the owner')
 └── OK:
      ├── Mongo.deleteMany(LOTTERYDB, {}) → deletes ALL lottery docs
      └── Return { path: NAS_TMP/lotteryoutput.csv, name: lottery name }
```

### 9.5 Returns & Side Effects

**Returns:**
```js
{
  path: '/mnt/tmp/lotteryoutput.csv',  // or prod equivalent
  name: 'Holiday Draw'
}
```

**Side Effects:**
- **DB delete**: ALL documents in the `lottery` collection are deleted (`deleteMany({})`)
- This is a destructive operation — the lottery is permanently ended

**Error Conditions:**

| Error Message | Trigger |
|---------------|---------|
| `'lottery is not exist'` | No `type:0` document |
| `'You are not the owner'` | User is non-admin AND not the owner |

### 9.6 Comprehensive Test Scenarios

| # | Scenario | Condition | Expected Outcome |
|---|----------|-----------|------------------|
| 1 | No lottery exists | Empty DB | Error: `'lottery is not exist'` |
| 2 | User is lottery owner (non-admin) | `checkAdmin(1, user) = true`, `user._id === owner` | Success — data deleted, path returned |
| 3 | User is admin (not owner) | `checkAdmin(1, user) = false` (is admin) | Success — admin bypass, short-circuit `&&` |
| 4 | User is neither admin nor owner | `checkAdmin(1, user) = true`, `user._id ≠ owner` | Error: `'You are not the owner'` |
| 5 | User is both admin and owner | Both conditions | Success |
| 6 | Verify deleteMany scope | After success | ALL docs in lottery collection deleted |
| 7 | Return path correctness | Dev vs prod environment | Path uses correct `NAS_TMP(ENV_TYPE)` |
| 8 | Return name correctness | Lottery named `'Test'` | `name: 'Test'` |
| 9 | CSV file not yet generated | `outputCsv` not called first | Path returned but file may not exist |

---

## 10. Export: `outputCsv(user)`

### 10.1 Purpose

Exports the current lottery state (participants + prizes with results) to a CSV file. Supports both UTF-8 and Big5 encoding output.

### 10.2 Function Signature

```js
outputCsv(user) → Promise<void>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `user` | `Object` | Authenticated user object with `_id` and permission data |

### 10.3 Invocation & Authentication

Same as `downloadCsv()`:
- Admin users (`checkAdmin(1, user)` returns falsy) can always access.
- Non-admin users must be the lottery owner.

### 10.4 Logic Flow

```
Mongo.find(LOTTERYDB, {type: 0}, limit:1)
 ├── items.length < 1 → handleError('lottery is not exist')
 ├── Auth check (same as downloadCsv)
 └── OK:
      ├── Extract big5 = items[0].count (0 = UTF-8, 1 = Big5)
      ├── Mongo.find(LOTTERYDB, {type: 2}, sort: owner asc) → users
      │    Map each user to CSV row:
      │    ├── Has option data (option.length > 0):
      │    │    [name, count, utime, '', '', ... (23 empties) ..., option[0], option[1]+1, option[2]+1, ...]
      │    │    (Blacklist reward indices converted back to 1-based)
      │    └── No option data:
      │         [name, count, utime]
      ├── Mongo.find(LOTTERYDB, {type: 1}, sort: owner asc) → rewards
      │    Map each reward to: [name, count, ...option (winner names)]
      ├── Combine: output = [...users, ['prize'], ...rewards]
      ├── If NAS_TMP/lotteryoutput.csv exists → delete it first
      └── Recursively append each row:
           ├── big5 (count=1) → IconvEncode(row + '\n', 'big5')
           └── UTF-8 (count=0) → plain string append
```

### 10.5 Returns & Side Effects

**Returns:** Resolves with `undefined` on success.

**Side Effects:**
- **File system**: Creates/overwrites `NAS_TMP/lotteryoutput.csv`
- Deletes existing file before writing if present

### 10.6 CSV Output Format

```csv
Alice,2,alice@mail.com,,,,,,,,,,,,,,,,,,,,,,,,2,1,3
Bob,1,bob@mail.com
prize
TV,3,Alice,Bob,Charlie
Phone,2,Dave,Eve
```

- User rows: padded with 23 empty columns before blacklist data
- Blacklist reward indices stored as 1-based (option[i] + 1 for i > 0)
- `prize` separator row between user and reward sections
- Reward rows: name, count, followed by all winner names from option array

### 10.7 Comprehensive Test Scenarios

| # | Scenario | Condition | Expected Outcome |
|---|----------|-----------|------------------|
| 1 | No lottery exists | Empty DB | Error: `'lottery is not exist'` |
| 2 | User is not admin and not owner | Non-privileged user | Error: `'You are not the owner'` |
| 3 | Admin user (not owner) | Admin permission | Success |
| 4 | Owner user (not admin) | Owner match | Success |
| 5 | UTF-8 output | `items[0].count = 0` (big5=false) | File written as `'utf8'` encoding |
| 6 | Big5 output | `items[0].count = 1` (big5=true) | File written via `IconvEncode(_, 'big5')` |
| 7 | Existing output file | `lotteryoutput.csv` already exists | Deleted first, then recreated |
| 8 | No existing output file | Fresh filesystem | File created directly |
| 9 | User with blacklist data | `option.length > 0` | Padded row with 23 empties, indices 1-based |
| 10 | User without blacklist data | `option = []` | Short row: `[name, count, utime]` |
| 11 | Reward with winners | `option = ['Alice', 'Bob']` | Row: `[name, count, 'Alice', 'Bob']` |
| 12 | Reward with no winners | `option = []` | Row: `[name, count]` |
| 13 | Prize separator row | Always present | `['prize']` between user and reward sections |
| 14 | Sort order preserved | Multiple users/rewards | Output sorted by `owner` field ascending |
| 15 | Empty user list | No type:2 docs | Output = `[['prize'], ...rewards]` |
| 16 | Empty reward list | No type:1 docs | Output = `[...users, ['prize']]` |
| 17 | Blacklist index conversion | `option[1] = 0` (0-based) | Written as `0 + 1 = 1` (1-based) |
| 18 | Blacklist count (option[0]) | `option[0] = 3` | Written as-is (no +1) |
| 19 | File write failure | Disk full or permissions | Promise rejects with fs error |
| 20 | Large dataset | 1000 users, 100 prizes | Recursive append completes without stack overflow |
| 21 | CSV special characters in name | Name contains commas | Not escaped — verify expected behavior |
| 22 | Unlink failure on existing file | File locked or permissions | Promise rejects with fs unlink error |

---

## 11. Data Model Reference

### 11.1 Lottery Collection Schema

```js
// Type 0 — Lottery Metadata (singleton)
{
  _id: ObjectId,
  type: 0,
  owner: ObjectId,           // Creator's user ID
  name: String,              // Lottery display name
  count: Number,             // 0 = UTF-8, 1 = Big5 (encoding flag)
  option: [Boolean, Boolean, Boolean]
  //        remove  multiple anonymous
}

// Type 1 — Prize/Reward
{
  _id: ObjectId,
  type: 1,
  owner: Number,             // Sort/display index
  name: String,              // Prize name
  count: Number,             // Total quantity available
  option: [String, ...],     // Winner names (populated during draws)
  utime: Number|Object|undefined
  //   undefined → not yet drawn
  //   Number < count → partial draw progress
  //   Number (Unix timestamp) → fully drawn (when progress >= count)
  //   Object → treated as quantity=0
}

// Type 2 — User/Participant
{
  _id: ObjectId,
  type: 2,
  owner: Number,             // Sort/display index
  name: String,              // Participant name
  count: Number,             // Number of entries (chances)
  option: [Number, Number, ...]
  //        [0] = blacklist count bonus
  //        [1+] = pre-assigned reward indices (0-based)
  utime: String|undefined    // Email address (if provided)
}
```

### 11.2 Index

```
lottery collection: { type_1_owner_1 }
```

---

## 12. Cross-Cutting Concerns

### 12.1 Error Handling Strategy

All functions use `handleError(new HoError(message))` for business logic errors. This wraps errors consistently for upstream route handlers. File system errors are propagated via rejected Promises.

### 12.2 Authentication Matrix

| Function | Auth Required | Owner Check | Admin Bypass |
|----------|--------------|-------------|-------------|
| `getInit` | Implicit (needs owner ID) | Read-only owner flag | No |
| `getData` | No explicit auth | No | No |
| `newLottery` | Implicit (needs owner ID) | No (creator becomes owner) | No |
| `input` | No explicit auth | No | No |
| `select` | Yes | Must be lottery owner | No |
| `downloadCsv` | Yes | Owner OR admin | Yes (`checkAdmin(1, user)`) |
| `outputCsv` | Yes | Owner OR admin | Yes (`checkAdmin(1, user)`) |

### 12.3 Concurrency & Race Conditions

- **Singleton enforcement**: `newLottery` checks for existing `type:0` doc before insert — vulnerable to race condition if two users create simultaneously.
- **Select draw**: Reads all users, computes in-memory, then writes results — concurrent `select` calls may draw the same user twice.
- **No transactions**: MongoDB operations are not wrapped in transactions; partial failures in `newLottery` are handled by `deleteMany` cleanup, but `select` has no rollback.

### 12.4 Performance Considerations

- `input()` uses recursive line-by-line parsing with `O(n*m)` duplicate detection (n lines × m existing users).
- `select()` builds full user pool in memory — may be large with high participant counts.
- `outputCsv()` uses recursive file append (`recur(index)`) — potential stack depth issues with very large datasets (though Promise chains mitigate this).
- `getUserItem()` expands users by count — a user with `count: 10000` generates 10,000 array entries.

### 12.5 Security Test Considerations

| Area | Test Focus |
|------|-----------|
| **Authorization bypass** | Call `select` with non-owner user ID |
| **Input validation** | Malformed uid strings, injection via CSV names |
| **Path traversal** | Crafted `filePath` in `input()` to read arbitrary files |
| **CSV injection** | Names containing `=`, `+`, `-`, `@` (formula injection) |
| **Privilege escalation** | Non-admin calling `downloadCsv`/`outputCsv` on others' lottery |
| **Data cleanup** | Verify `deleteMany({})` removes ALL docs, not just owned |

### 12.6 Mock Requirements for Testing

| Dependency | Mock Strategy |
|------------|--------------|
| `Mongo` | Mock all CRUD operations (`find`, `insert`, `update`, `deleteMany`) |
| `sendLotteryName` | Mock to verify call args; avoid real email sends |
| `fs` module | Mock `readFile`, `writeFile`, `appendFile`, `unlink`, `existsSync`, `createReadStream` |
| `readline.createInterface` | Mock or use actual with in-memory stream |
| `Math.random` | Mock for deterministic draw testing |
| `isValidString` | May use real implementation or mock for specific edge cases |
| `checkAdmin` | Mock to control admin/non-admin paths |
| `NAS_TMP` / `ENV_TYPE` | Mock to control file paths |
| `bufferToString` | Mock or use real for encoding tests |
| `iconv-lite.encode` | Mock or use real for Big5 encoding verification |

---

> **Document Version**: 1.0
> **Source**: `src/back/models/lottery-tool.js` (435 lines)
> **Reference**: `doc/OUTLINE.md` §3.4, §6.1, §11.2–§11.9
> **Testing Framework**: Jest 27 + Supertest (per project configuration)
> **Suggested Test File**: `src/back/models/__tests__/lottery-tool.test.js`
