# `rank-tool.js` — Technical Documentation & QA Testing Strategy

> **Module**: `src/back/models/rank-tool.js`
> **Role**: Ranking system — CRUD operations for fitness-ranking charts with chart data retrieval, row lifecycle, and item listing
> **Priority**: 🟡 High
> **Dependencies**: `mongo-tool.js`, `tag-tool.js`, `utility.js`, `constants.js`
> **Collections**: `rank`, `rankUser`, `fitness`, `fitnessCount`, `user`

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Shared Dependencies & Constants](#2-shared-dependencies--constants)
3. [Function: `getChart`](#3-function-getchart)
4. [Function: `newRow`](#4-function-newrow)
5. [Function: `delRow`](#5-function-delrow)
6. [Function: `getItem`](#6-function-getitem)
7. [Cross-Cutting Concerns](#7-cross-cutting-concerns)
8. [Recommended Test File Placement](#8-recommended-test-file-placement)

---

## 1. Module Overview

`rank-tool.js` exports a default object containing four methods that power the ranking/leaderboard feature of the ANoMoPi platform. Rankings are tied to the **fitness** subsystem — each rank row tracks a leaderboard for a specific fitness item (or the special "point" item) over a time period.

The module relies heavily on:

- **MongoDB** via `Mongo()` wrapper for all data persistence
- **TagTool** (scoped to `RANKDB`) for bookmark/latest-tracking side effects
- **Validation utilities** (`isValidString`, `HoError`, `handleError`) for input gating

All functions return **Promises** and follow a consistent error-handling pattern using `handleError(new HoError(...))` which returns a rejected Promise.

---

## 2. Shared Dependencies & Constants

| Import | Source | Value / Purpose |
|--------|--------|-----------------|
| `RANKDB` | `constants.js` | `'rank'` — MongoDB collection name |
| `RANK_LIMIT` | `constants.js` | `10` — Maximum entries in a rank chart |
| `USERDB` | `constants.js` | `'user'` — User collection name |
| `FITNESSDB` | `constants.js` | `'fitness'` — Fitness collection name |
| `FITNESS_POINT` | `constants.js` | `'598174b08bd4ed7a80e4dc80'` — Special ObjectId for the "point" fitness item |
| `Mongo` | `mongo-tool.js` | `(op, collection, ...args) → Promise` — MongoDB CRUD wrapper |
| `objectID` | `mongo-tool.js` | `(id?) → ObjectId` — ObjectId constructor/parser |
| `TagTool` | `tag-tool.js` | Factory `(collection) → {setLatest, ...}` — Tag management scoped to a collection |
| `isDefaultTag` | `tag-tool.js` | `(tag) → {index} \| false` — Checks if a tag is a system default |
| `normalize` | `tag-tool.js` | `(tag) → string` — Lowercases, normalizes full-width chars and Chinese numerals |
| `isValidString` | `utility.js` | `(str, type) → value \| false` — Validates/normalizes input; `'uid'` type returns `ObjectId` |
| `handleError` | `utility.js` | `(err, type?) → Promise.reject \| undefined` — Error logging and rejection |
| `HoError` | `utility.js` | Custom Error constructor with `.code` (default `400`) |
| `completeZero` | `utility.js` | `(number, offset) → string` — Zero-pads a number to `offset` digits |

**Module-level initialization**:
```js
const RankTagTool = TagTool(RANKDB);  // Scoped tag tool for the 'rank' collection
```

---

## 3. Function: `getChart`

### 3.1 Purpose

Retrieves a complete chart dataset for a specific rank entry, including user labels, count data, the rank name, and the item name. Used by the frontend `RankStatis` component to render Chart.js bar/line charts.

### 3.2 Invocation & Authentication

```js
getChart(uid, user, session)
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | `string` | ✅ | Raw string rank document ID |
| `user` | `object` | ✅ | Authenticated user object with `._id` (ObjectId) and `.username` (string) |
| `session` | `object` | ✅ | Express session object, passed to `RankTagTool.setLatest()` |

**Authentication**: Caller must supply a valid `user` object. Auth is enforced at the router level (not within this function).

### 3.3 Logic Flow

```
1.  VALIDATE uid via isValidString(uid, 'uid')
    ├── INVALID → handleError('uid not vaild!!!')  [rejected Promise]
    └── VALID → ObjectId `id`

2.  QUERY Mongo('find', RANKDB, {_id: id})
    ├── NO RESULTS (items.length < 1) → handleError('rank cannot find!!!')
    └── FOUND → items[0] = rank document

3.  RESOLVE item name (getName):
    ├── IF items[0].type === FITNESSDB AND items[0].itemId equals FITNESS_POINT ObjectId
    │   └── RESOLVE 'point'
    └── ELSE → QUERY Mongo('find', items[0].type, {_id: items[0].itemId})
        ├── NO RESULTS → 'unknown'
        └── FOUND → items1[0].name

4.  RESOLVE chart data (findData):
    ├── IF items[0].history EXISTS (truthy)
    │   └── RESOLVE items[0].history (cached snapshot)
    └── ELSE → QUERY Mongo('find', `${items[0].type}Count`, {
            itemId: items[0].itemId,
            start: {$gte: items[0].start}
        }, {limit: RANK_LIMIT, sort: [['count', 'desc']]})
        └── REVERSE the result array (ascending order)

5.  CHECK itemData length
    ├── EMPTY (length < 1) → handleError('no data!!!')
    └── HAS DATA → continue

6.  ITERATE itemData recursively (recur):
    FOR each entry at index:
    ├── IF entry.owner equals user._id
    │   └── SET owner = index, push user.username to labels, push count to data
    └── ELSE → QUERY Mongo('find', USERDB, {_id: entry.owner})
        ├── NO RESULTS → push 'unknown' to labels
        └── FOUND → push items2[0].username to labels
        └── push count to data

7.  RESOLVE current user's entry if not in top results (getUser):
    ├── IF owner === RANK_LIMIT (user not found in top results) AND !items[0].history
    │   └── QUERY Mongo('find', `${items[0].type}Count`, {itemId, owner: user._id})
    │       ├── NO RESULTS → handleError('rank cannot find user!!!')
    │       └── FOUND → append user.username and count to labels/data
    └── ELSE → Promise.resolve() (no-op)

8.  SIDE EFFECT: RankTagTool.setLatest(items[0]._id, session)
    └── Fire-and-forget (.catch only logs errors)

9.  RETURN {labels, data, name, itemName, owner}
```

### 3.4 Returns & Side Effects

**Returns** (on success):
```js
{
  labels: string[],    // Array of usernames (up to RANK_LIMIT + 1)
  data: number[],      // Corresponding count values
  name: string,        // Rank document name
  itemName: string,    // Fitness item name or 'point' or 'unknown'
  owner: number         // Index of current user in data, or RANK_LIMIT if appended / not found
}
```

**Side Effects**:
- `RankTagTool.setLatest()` updates the `rankUser` collection to mark this rank as the user's most recently viewed item (fire-and-forget)

**Error Cases** (rejected Promises):
| Condition | Error Message | HTTP Code |
|-----------|--------------|-----------|
| Invalid `uid` | `'uid not vaild!!!'` | 400 |
| Rank document not found | `'rank cannot find!!!'` | 400 |
| No chart data entries | `'no data!!!'` | 400 |
| User has no count entry (live mode) | `'rank cannot find user!!!'` | 400 |

### 3.5 Snapshot Testing Data

**Input**:
```js
uid: '507f1f77bcf86cd799439011'
user: { _id: ObjectId('507f191e810c19729de860ea'), username: 'testuser' }
session: { /* Express session */ }
```

**Rank Document (RANKDB)**:
```js
{
  _id: ObjectId('507f1f77bcf86cd799439011'),
  name: 'January Sprint',
  type: 'fitness',
  itemId: ObjectId('598174b08bd4ed7a80e4dc80'),  // FITNESS_POINT
  start: 20260101,
  history: null,  // or array of {owner, count}
  utime: 1706745600,
  tags: ['january', 'sprint', '2026', 'fitness', 'sport', '運動', 'point']
}
```

**Successful Response**:
```js
{
  labels: ['alice', 'bob', 'charlie', 'testuser'],
  data: [150, 120, 95, 42],
  name: 'January Sprint',
  itemName: 'point',
  owner: 3
}
```

**Count Document (`fitnessCount`)**:
```js
{
  itemId: ObjectId('598174b08bd4ed7a80e4dc80'),
  owner: ObjectId('507f191e810c19729de860ea'),
  start: 20260101,
  count: 42
}
```

### 3.6 Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches

| # | Scenario | Branch | Expected Outcome |
|---|----------|--------|-----------------|
| 1 | Valid uid, rank found, type=FITNESSDB + itemId=FITNESS_POINT | getName → `'point'` | `itemName` is `'point'` |
| 2 | Valid uid, rank found, type=FITNESSDB + itemId ≠ FITNESS_POINT, fitness item found | getName → item name lookup | `itemName` is the fitness item's `.name` |
| 3 | Valid uid, rank found, type=FITNESSDB + itemId ≠ FITNESS_POINT, fitness item NOT found | getName → `'unknown'` | `itemName` is `'unknown'` |
| 4 | Rank document has `.history` (truthy) | findData → resolves with history directly | No `fitnessCount` query executed |
| 5 | Rank document has no `.history` (falsy/null/undefined) | findData → queries `${type}Count` collection | Count query executed with RANK_LIMIT and desc sort, result reversed |
| 6 | Current user appears in itemData (owner match) | recur → sets `owner = index`, uses `user.username` directly | No USERDB query for current user's entry |
| 7 | Current user NOT in itemData, other users found in USERDB | recur → queries USERDB per entry | Labels populated with looked-up usernames |
| 8 | Other user NOT found in USERDB | recur → label is `'unknown'` | `'unknown'` pushed to labels |
| 9 | User not in top RANK_LIMIT AND no history | getUser → queries `${type}Count` for user | User appended to labels/data |
| 10 | User not in top RANK_LIMIT AND history exists | getUser → no-op | User not appended |
| 11 | User IS in top RANK_LIMIT results | getUser → no-op (owner < RANK_LIMIT) | `owner` set to user's index |

#### Edge Cases

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 12 | `uid` is `null` / `undefined` / empty string | Rejected: `'uid not vaild!!!'` |
| 13 | `uid` is a valid string but not a valid ObjectId format | Rejected: `'uid not vaild!!!'` (isValidString returns false) |
| 14 | Rank exists but `itemData` is empty after query | Rejected: `'no data!!!'` |
| 15 | `itemData` has exactly 1 entry (minimum) | Chart returned with single-element arrays |
| 16 | `itemData` has exactly RANK_LIMIT (10) entries | No overflow; all entries processed |
| 17 | Current user is the only entry in itemData | `owner = 0`, single label/data entry |
| 18 | All itemData entries belong to deleted/unknown users | All labels are `'unknown'` |
| 19 | History array is an empty array `[]` (truthy but no items) | Rejected: `'no data!!!'` |
| 20 | User count entry not found (live mode, user never participated) | Rejected: `'rank cannot find user!!!'` |
| 21 | `setLatest` throws an error | Error caught and logged; main flow unaffected (fire-and-forget) |

#### Error Handling

| # | Scenario | Error | Code |
|---|----------|-------|------|
| 22 | MongoDB connection failure on RANKDB find | Unhandled rejection propagates | N/A |
| 23 | MongoDB connection failure on USERDB find | Unhandled rejection during recur | N/A |
| 24 | MongoDB connection failure on `${type}Count` find | Unhandled rejection from findData | N/A |

---

## 4. Function: `newRow`

### 4.1 Purpose

Creates a new rank entry for a fitness item, auto-generates normalized tags, and snapshots the previous rank's leaderboard into its `history` field (archival).

### 4.2 Invocation & Authentication

```js
newRow(data)
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `data` | `object` | ✅ | Object with keys `name` (string) and `item` (string uid of fitness item) |

**Authentication**: Enforced at the router level. No `user` or `session` parameter.

### 4.3 Logic Flow

```
1.  VALIDATE required fields
    ├── IF !data['name'] OR !data['item'] → handleError('parameter lost!!!')
    └── BOTH present → continue

2.  VALIDATE data['name'] via isValidString(data['name'], 'name')
    ├── INVALID → handleError('name not vaild!!!')
    └── VALID → normalized `name`

3.  VALIDATE data['item'] via isValidString(data['item'], 'uid')
    ├── INVALID → handleError('item not vaild!!!')
    └── VALID → ObjectId `id`

4.  COMPUTE start date
    └── date = new Date()
    └── start = Number(`${YYYY}${MM}${DD}`)   // e.g. 20260317

5.  RESOLVE fitness item (getItem):
    ├── IF id equals FITNESS_POINT ObjectId
    │   └── RESOLVE 'point'
    └── ELSE → QUERY Mongo('find', FITNESSDB, {_id: id})
        ├── NO RESULTS → handleError('fitness row does not exist!!!')
        └── FOUND → items1[0].name

6.  CHECK for duplicate rank
    └── QUERY Mongo('find', RANKDB, {type: FITNESSDB, itemId: id, start})
        ├── FOUND (length > 0) → handleError('double rank!!!')
        └── NOT FOUND → continue

7.  BUILD tag set
    └── Set contains: normalize(name), year string, FITNESSDB, 'sport', '運動', normalize(itemName)
    └── FILTER out default tags via isDefaultTag()
    └── Convert to array `setArr`

8.  INSERT new rank document
    └── Mongo('insert', RANKDB, {
          _id: objectID(),    // new ObjectId
          name, start, itemId: id, type: FITNESSDB,
          utime: Math.round(now / 1000),
          tags: setArr
        })

9.  ARCHIVE previous rank's leaderboard
    └── QUERY Mongo('find', RANKDB, {type, itemId}, {limit: 2, sort: [['start', 'desc']]})
        ├── ONLY 1 result (this is the first rank for this item)
        │   └── RETURN {id: newItem._id}
        └── 2 results (previous rank exists at items1[1])
            └── QUERY Mongo('find', `${type}Count`, {
                    itemId: items1[1].itemId,
                    start: {$gte: items1[1].start}
                }, {limit: RANK_LIMIT, sort: [['count', 'desc']]})
            └── SNAPSHOT: Mongo('update', RANKDB, {_id: items1[1]._id}, {
                    $set: { history: items2.map(i => ({owner, count})).reverse() }
                })
            └── RETURN {id: newItem._id}

10. CONSOLE LOG: item + 'save end' (debug output)
```

### 4.4 Returns & Side Effects

**Returns** (on success):
```js
{ id: ObjectId }  // The _id of the newly created rank document
```

**Side Effects**:
1. **INSERT** into `RANKDB` — new rank document created
2. **UPDATE** on `RANKDB` — previous rank's `history` field is populated with a snapshot of the top RANK_LIMIT count entries (archival)
3. **Console output** — `console.log(item)` and `console.log('save end')` for debugging

**Error Cases** (rejected Promises):
| Condition | Error Message | HTTP Code |
|-----------|--------------|-----------|
| Missing `name` or `item` | `'parameter lost!!!'` | 400 |
| Invalid `name` | `'name not vaild!!!'` | 400 |
| Invalid `item` uid | `'item not vaild!!!'` | 400 |
| Fitness item not found (non-point) | `'fitness row does not exist!!!'` | 400 |
| Duplicate rank for same item + start date | `'double rank!!!'` | 400 |

### 4.5 Snapshot Testing Data

**Input**:
```js
data: { name: 'February Challenge', item: '598174b08bd4ed7a80e4dc80' }
```

**Inserted Document**:
```js
{
  _id: ObjectId('...'),           // auto-generated
  name: 'February Challenge',
  start: 20260317,                // date-based numeric
  itemId: ObjectId('598174b08bd4ed7a80e4dc80'),
  type: 'fitness',
  utime: 1710633600,              // Unix timestamp (seconds)
  tags: ['february challenge', '2026', 'fitness', 'sport', '運動', 'point']
}
```

**Archived History (on previous rank)**:
```js
{
  $set: {
    history: [
      { owner: ObjectId('...'), count: 10 },   // ascending order after reverse
      { owner: ObjectId('...'), count: 50 },
      { owner: ObjectId('...'), count: 120 }
    ]
  }
}
```

**Successful Response**:
```js
{ id: ObjectId('...') }
```

### 4.6 Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches

| # | Scenario | Branch | Expected Outcome |
|---|----------|--------|-----------------|
| 1 | `data.name` missing | Parameter check fails | Rejected: `'parameter lost!!!'` |
| 2 | `data.item` missing | Parameter check fails | Rejected: `'parameter lost!!!'` |
| 3 | Both `data.name` and `data.item` missing | Parameter check fails | Rejected: `'parameter lost!!!'` |
| 4 | `data.name` present but fails validation | isValidString returns false | Rejected: `'name not vaild!!!'` |
| 5 | `data.item` present but fails uid validation | isValidString returns false | Rejected: `'item not vaild!!!'` |
| 6 | Item is FITNESS_POINT | getItem → `'point'` | No FITNESSDB query; itemName = `'point'` |
| 7 | Item is a regular fitness item, exists | getItem → looks up name | itemName = fitness item name |
| 8 | Item is a regular fitness item, NOT found | getItem → error | Rejected: `'fitness row does not exist!!!'` |
| 9 | Duplicate rank exists (same type + itemId + start) | Duplicate check | Rejected: `'double rank!!!'` |
| 10 | No duplicate, first rank for this item | Only 1 rank found after insert | Returns `{id}` with no history archival |
| 11 | No duplicate, previous rank exists | 2 ranks found after insert | Previous rank gets history snapshot |
| 12 | All tags pass isDefaultTag check (all filtered out) | setArr is empty | Empty tags array inserted |
| 13 | Some tags are default tags | Filtered out of setArr | Only non-default tags inserted |

#### Edge Cases

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 14 | `data.name` is empty string `''` | Rejected: `'parameter lost!!!'` (falsy) |
| 15 | `data.item` is empty string `''` | Rejected: `'parameter lost!!!'` (falsy) |
| 16 | `data.name` contains special/unicode characters | Depends on isValidString('name') rules |
| 17 | `data` object has extra unrelated keys | Extra keys ignored; only `name` and `item` used |
| 18 | Tag set produces duplicate normalized values | `Set` deduplicates automatically |
| 19 | `normalize(name)` produces the same value as `normalize(itemName)` | Set deduplicates; only one entry |
| 20 | Date at year boundary (Dec 31 → Jan 1) | Start date uses `new Date()` at call time; no cross-boundary issue |
| 21 | Single-digit month/day | `completeZero` pads to 2 digits (e.g., `1` → `'01'`) |
| 22 | Previous rank's count collection returns 0 entries | `history` set to empty reversed array `[]` |
| 23 | Previous rank's count collection returns fewer than RANK_LIMIT entries | All entries included in history |

#### Error Handling

| # | Scenario | Error |
|---|----------|-------|
| 24 | MongoDB insert fails | Unhandled rejection propagates |
| 25 | MongoDB update (history archival) fails | Unhandled rejection propagates |
| 26 | Concurrent inserts create duplicate (race condition) | Both may succeed if duplicate check passes before either insert completes |

---

## 5. Function: `delRow`

### 5.1 Purpose

Deletes a single rank document by its ID after verifying it exists.

### 5.2 Invocation & Authentication

```js
delRow(uid)
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | `string` | ✅ | Raw string rank document ID |

**Authentication**: Enforced at the router level. No permission check within this function — any authenticated caller can delete any rank.

### 5.3 Logic Flow

```
1.  VALIDATE uid via isValidString(uid, 'uid')
    ├── INVALID → handleError('uid not vaild!!!')
    └── VALID → ObjectId `id`

2.  QUERY Mongo('find', RANKDB, {_id: id}, {limit: 1})
    ├── NO RESULTS (length < 1) → handleError('rank row does not exist!!!')
    └── FOUND → items[0]

3.  DELETE Mongo('deleteMany', RANKDB, {_id: items[0]._id})
    └── RETURN result (MongoDB deleteMany result)
```

### 5.4 Returns & Side Effects

**Returns** (on success): MongoDB `deleteMany` result object (typically `{ deletedCount: 1 }`).

**Side Effects**:
- **DELETE** from `RANKDB` — rank document permanently removed
- **Note**: Associated `rankUser` bookmark entries and `${type}Count` data are **NOT** cleaned up

**Error Cases** (rejected Promises):
| Condition | Error Message | HTTP Code |
|-----------|--------------|-----------|
| Invalid `uid` | `'uid not vaild!!!'` | 400 |
| Rank document not found | `'rank row does not exist!!!'` | 400 |

### 5.5 Snapshot Testing Data

**Input**:
```js
uid: '507f1f77bcf86cd799439011'
```

**Successful Response** (MongoDB result):
```js
{ acknowledged: true, deletedCount: 1 }
```

### 5.6 Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches

| # | Scenario | Branch | Expected Outcome |
|---|----------|--------|-----------------|
| 1 | Valid uid, rank document exists | Find → Delete | Document deleted, result returned |
| 2 | Valid uid, rank document NOT found | Find returns empty | Rejected: `'rank row does not exist!!!'` |
| 3 | Invalid uid format | Validation fails | Rejected: `'uid not vaild!!!'` |

#### Edge Cases

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 4 | `uid` is `null` | Rejected: `'uid not vaild!!!'` |
| 5 | `uid` is `undefined` | Rejected: `'uid not vaild!!!'` |
| 6 | `uid` is empty string | Rejected: `'uid not vaild!!!'` |
| 7 | `uid` is a number instead of string | Depends on `isValidString` behavior with non-string input |
| 8 | Deleting a rank that has `history` set (archived) | Deleted normally; history is lost |
| 9 | Deleting a rank that is the latest for its item | Deleted; no cascade to recalculate newer rank's start boundary |
| 10 | `deleteMany` with `{_id: ObjectId}` always deletes 0 or 1 doc | `deletedCount` is 0 or 1 |

#### Error Handling

| # | Scenario | Error |
|---|----------|-------|
| 11 | MongoDB find fails (connection issue) | Unhandled rejection propagates |
| 12 | MongoDB deleteMany fails | Unhandled rejection propagates |

---

## 6. Function: `getItem`

### 6.1 Purpose

Returns a list of all fitness items (type `1`) prepended with the special "point" entry. Used to populate dropdown/select controls when creating a new rank.

### 6.2 Invocation & Authentication

```js
getItem()
```

**No parameters**. Authentication enforced at the router level.

### 6.3 Logic Flow

```
1.  QUERY Mongo('find', FITNESSDB, {type: 1})
    └── Returns all fitness documents with type=1

2.  BUILD result array:
    └── PREPEND static entry: { id: FITNESS_POINT, name: 'point' }
    └── CONCAT with items.map(i => ({ id: i._id, name: i.name }))

3.  RETURN combined array
```

### 6.4 Returns & Side Effects

**Returns** (on success):
```js
[
  { id: '598174b08bd4ed7a80e4dc80', name: 'point' },   // Always first
  { id: ObjectId('...'), name: 'Running' },
  { id: ObjectId('...'), name: 'Swimming' },
  // ... more fitness items
]
```

**Side Effects**: None — pure read operation.

**Note**: The first entry's `id` is the raw string `FITNESS_POINT`, while subsequent entries have `ObjectId` values from `i._id`. This type inconsistency may be intentional for frontend handling.

### 6.5 Snapshot Testing Data

**FITNESSDB Documents** (input):
```js
[
  { _id: ObjectId('aaa...'), name: 'Running', type: 1 },
  { _id: ObjectId('bbb...'), name: 'Swimming', type: 1 }
]
```

**Successful Response**:
```js
[
  { id: '598174b08bd4ed7a80e4dc80', name: 'point' },
  { id: ObjectId('aaa...'), name: 'Running' },
  { id: ObjectId('bbb...'), name: 'Swimming' }
]
```

### 6.6 Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 1 | Fitness collection has multiple type=1 items | Array with point + all items |
| 2 | Fitness collection has zero type=1 items | Array with only the point entry: `[{id: FITNESS_POINT, name: 'point'}]` |

#### Edge Cases

| # | Scenario | Expected Outcome |
|---|----------|-----------------|
| 3 | Fitness collection has items with type ≠ 1 | Those items are excluded from results |
| 4 | Fitness collection has items with type=1 but missing `name` field | Entry with `name: undefined` included |
| 5 | Very large number of fitness items | All returned; no pagination |
| 6 | `FITNESS_POINT` constant value changes | First entry always uses the constant value |
| 7 | First entry `id` is a string while others are ObjectIds | Type inconsistency persists (document this for consumers) |

#### Error Handling

| # | Scenario | Error |
|---|----------|-------|
| 8 | MongoDB find fails (connection issue) | Unhandled rejection propagates |
| 9 | FITNESSDB collection does not exist | MongoDB returns empty array; result is `[{id: FITNESS_POINT, name: 'point'}]` |

---

## 7. Cross-Cutting Concerns

### 7.1 Authentication & Authorization

| Concern | Status |
|---------|--------|
| Auth check within module | ❌ Not performed — all auth is at router level |
| Permission-based access | ❌ No permission checks — any authenticated user can call any function |
| Owner-based restrictions | ❌ `delRow` has no ownership check — any user can delete any rank |
| Session dependency | `getChart` only: passes `session` to `setLatest` for bookmark tracking |

**Auth Test Scenarios**:

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 1 | Unauthenticated user reaches `getChart` | Router should block; if bypassed, `user` may be undefined causing runtime error |
| 2 | User with perm=0 calls `delRow` on another user's rank | Function succeeds — no ownership guard |
| 3 | `session` object is null/undefined in `getChart` | `setLatest` may throw, but it's caught by `.catch()` |

### 7.2 Data Consistency Risks

| Risk | Description | Affected Function |
|------|-------------|-------------------|
| Orphaned history | Deleting a rank with history doesn't clean up references | `delRow` |
| Orphaned bookmarks | `rankUser` entries not deleted when rank is removed | `delRow` |
| Race condition | Concurrent `newRow` calls for same item+date could bypass duplicate check | `newRow` |
| Stale history | History snapshot is write-once; if count data changes after archival, history is stale | `newRow` |
| Missing user in chart | If user never participated and has no count entry, `getChart` rejects | `getChart` |

### 7.3 Error Pattern Summary

All functions use the same error pattern:
```js
return handleError(new HoError('message!!!'));
// → Returns Promise.reject(HoError) with code 400
```

MongoDB-level failures (connection errors, timeouts) are **not explicitly caught** — they propagate as unhandled rejections to the caller.

### 7.4 MongoDB Query Summary

| Function | Operation | Collection | Query |
|----------|-----------|------------|-------|
| `getChart` | find | `rank` | `{_id: id}` |
| `getChart` | find | `${type}` (e.g., `fitness`) | `{_id: itemId}` |
| `getChart` | find | `${type}Count` (e.g., `fitnessCount`) | `{itemId, start: {$gte}}` |
| `getChart` | find | `user` | `{_id: owner}` |
| `getChart` | find | `${type}Count` | `{itemId, owner: user._id}` |
| `newRow` | find | `fitness` | `{_id: id}` |
| `newRow` | find | `rank` | `{type, itemId, start}` |
| `newRow` | insert | `rank` | New rank document |
| `newRow` | find | `rank` | `{type, itemId}` (limit 2, sort desc) |
| `newRow` | find | `${type}Count` | `{itemId, start: {$gte}}` |
| `newRow` | update | `rank` | `{_id}` → `{$set: {history}}` |
| `delRow` | find | `rank` | `{_id: id}` (limit 1) |
| `delRow` | deleteMany | `rank` | `{_id}` |
| `getItem` | find | `fitness` | `{type: 1}` |

---

## 8. Recommended Test File Placement

Per the project's test file structure (OUTLINE.md §11.8):

```
src/back/models/__tests__/rank-tool.test.js
```

**Mock Requirements**:
- `mongo-tool.js` — mock `Mongo` and `objectID`
- `tag-tool.js` — mock `TagTool` factory, `isDefaultTag`, `normalize`
- `utility.js` — use real `isValidString`, `HoError`, `handleError`, `completeZero` OR mock selectively

**Test Framework**: Jest 27 with ESM support (`NODE_OPTIONS=--experimental-vm-modules`)

**Total Scenario Count**: **62 test scenarios** across all four functions providing 100% logical branch, edge case, and error handling coverage.

---

> **Document Version**: 1.0
> **Source File**: `src/back/models/rank-tool.js` (167 lines)
> **Standard**: Follows OUTLINE.md §11 QA Testing Scope & Strategy
