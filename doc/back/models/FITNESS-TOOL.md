# FITNESS-TOOL.md — QA Testing Strategy & Technical Documentation

> **Module**: `src/back/models/fitness-tool.js`
> **Project**: ANoMoPi (anomopi.com)
> **Stack**: Node.js 14 · Express · MongoDB 4.4 · Redis 5
> **Author**: Senior QA/Test Automation Engineer
> **Generated**: 2026-03-17
> **Priority**: 🟡 High (Business logic — fitness tracking subsystem)

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Dependencies & Constants](#2-dependencies--constants)
3. [Function: `newRow`](#3-function-newrow)
4. [Function: `editRow`](#4-function-editrow)
5. [Function: `delRow`](#5-function-delrow)
6. [Function: `getPoint`](#6-function-getpoint)
7. [Function: `exchange`](#7-function-exchange)
8. [Function: `getStat`](#8-function-getstat)
9. [Function: `resetDate`](#9-function-resetdate)
10. [Cross-Cutting Test Concerns](#10-cross-cutting-test-concerns)
11. [Snapshot Testing Data](#11-snapshot-testing-data)

---

## 1. Module Overview

`fitness-tool.js` implements the fitness tracking subsystem of ANoMoPi. It manages fitness item CRUD, a point-based reward system (earn points via type-1 items, redeem points for type-2 items), time-series chart statistics (stored in Redis), and stat lifecycle management.

### Export Shape

The module exports a **default object** with 7 methods:

| Method | Purpose |
|--------|---------|
| `newRow(data)` | Create a new fitness item |
| `editRow(uid, data, session)` | Update an existing fitness item |
| `delRow(uid)` | Delete a fitness item and its counts |
| `getPoint(user)` | Retrieve a user's current point balance |
| `exchange(uid, user, exchange, session)` | Exchange counts/points for a fitness item |
| `getStat(uid, index, typeId)` | Retrieve/manage chart statistics |
| `resetDate(uid)` | Reset all user fitness stats/counts/charts |

### Database Collections Used

| Collection | Variable | Purpose |
|------------|----------|---------|
| `fitness` | `FITNESSDB` | Fitness item definitions |
| `fitnessCount` | `` `${FITNESSDB}Count` `` | Per-user item counts and point balances |
| `fitnessStat` | `` `${FITNESSDB}Stat` `` | Per-user chart/stat metadata |

### Redis Keys Used

| Key Pattern | Purpose |
|-------------|---------|
| `chart: {userId}` | Hash map storing time-series chart data per fitness item |

---

## 2. Dependencies & Constants

| Import | Source | Purpose |
|--------|--------|---------|
| `FITNESSDB` | `constants.js` | `'fitness'` — base collection name |
| `FITNESS_POINT` | `constants.js` | `'598174b08bd4ed7a80e4dc80'` — special ObjectID for the point counter |
| `CHART_LIMIT` | `constants.js` | `4` — maximum number of chart slots |
| `TagTool` / `isDefaultTag` / `normalize` | `tag-tool.js` | Tag factory, default-tag filter, tag normalization |
| `Mongo` / `objectID` | `mongo-tool.js` | MongoDB CRUD wrapper, ObjectID factory |
| `Redis` | `redis-tool.js` | Redis command wrapper |
| `isValidString` | `utility.js` | Input validation/sanitization |
| `handleError` | `utility.js` | Centralized error handler → `Promise.reject(err)` |
| `HoError` | `utility.js` | Custom error class (default code: 400) |
| `completeZero` | `utility.js` | Zero-pad numbers (e.g., `5` → `'05'`) |

### Initialized Instances

```
FitnessTagTool = TagTool(FITNESSDB)  // Tag tool configured for 'fitness' collection
```

---

## 3. Function: `newRow`

### Purpose

Create a new fitness item record with auto-generated tags.

### Invocation & Authentication

```
newRow(data: Object): Promise<{ id: ObjectId }>
```

| Parameter | Type | Required | Validation |
|-----------|------|----------|------------|
| `data.name` | string | ✅ | `isValidString(_, 'name')` — 1–500 chars, no `\\/|*?"<>:` |
| `data.price` | string/number | ✅ | `isValidString(_, 'int')` — positive integer |
| `data.desc` | string | ✅ | `isValidString(_, 'desc')` — 0–500 chars, restricted special chars |

> **Auth**: No direct auth check. Authentication enforced at the router level.

### Logic Flow

```
1. Guard: Reject if data.price, data.desc, or data.name is falsy
   → handleError(HoError('parameter lost!!!'))

2. Validate name via isValidString(data.name, 'name')
   → Reject if falsy: HoError('name not vaild!!!')

3. Validate price via isValidString(data.price, 'int')
   → Reject if falsy: HoError('price not vaild!!!')

4. Validate desc via isValidString(data.desc, 'desc')
   → Reject if falsy: HoError('description not vaild!!!')

5. Build tag Set:
   a. Add normalize(name) — lowercased/normalized name
   b. Add 'sport'
   c. Add '運動'

6. Filter tags: remove any tag where isDefaultTag(tag) returns truthy
   → Produces setArr[]

7. Insert into MongoDB 'fitness' collection:
   {
     _id: objectID(),        ← new ObjectID
     name,                   ← validated name
     price,                  ← validated price (Number)
     desc,                   ← validated description
     utime: epoch_seconds,   ← current UNIX timestamp (seconds)
     type: 1,                ← hardcoded type 1 (earnable)
     use: {},                ← empty usage map
     tags: setArr            ← filtered tag array
   }

8. Return { id: item[0]._id }
```

### Returns & Side Effects

| Outcome | Return Value | Side Effects |
|---------|-------------|--------------|
| Success | `{ id: ObjectId }` | New document in `fitness` collection |
| Missing parameter | `Promise.reject(HoError)` | None |
| Invalid name | `Promise.reject(HoError)` | None |
| Invalid price | `Promise.reject(HoError)` | None |
| Invalid desc | `Promise.reject(HoError)` | None |
| Mongo insert failure | Rejected Promise (from Mongo) | None |

### Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches

| # | Scenario | Input Condition | Expected Outcome |
|---|----------|-----------------|------------------|
| 1 | All params valid | `{ name: 'Pushups', price: '10', desc: 'Do pushups' }` | Resolves with `{ id: <ObjectId> }` |
| 2 | Missing `price` | `{ name: 'Pushups', desc: 'test' }` | Rejects: `'parameter lost!!!'` |
| 3 | Missing `desc` | `{ name: 'Pushups', price: '10' }` | Rejects: `'parameter lost!!!'` |
| 4 | Missing `name` | `{ price: '10', desc: 'test' }` | Rejects: `'parameter lost!!!'` |
| 5 | All three missing | `{}` | Rejects: `'parameter lost!!!'` |
| 6 | Name fails validation | `{ name: 'test/invalid', price: '10', desc: 'ok' }` | Rejects: `'name not vaild!!!'` |
| 7 | Price fails validation (negative) | `{ name: 'ok', price: '-5', desc: 'ok' }` | Rejects: `'price not vaild!!!'` |
| 8 | Price fails validation (zero) | `{ name: 'ok', price: '0', desc: 'ok' }` | Rejects: `'price not vaild!!!'` |
| 9 | Desc fails validation | `{ name: 'ok', price: '10', desc: 'bad&chars' }` | Rejects: `'description not vaild!!!'` |
| 10 | Name is a default tag | Name normalizes to a default tag (e.g., a stock filter pattern) | Default tag filtered from `tags[]`, but insert succeeds |
| 11 | 'sport' or '運動' is default tag | If isDefaultTag returns truthy for 'sport'/'運動' | Those tags excluded from `tags[]` |
| 12 | Name with Unicode | `{ name: '腹筋', price: '5', desc: 'ok' }` | Normalize applies full-width conversion + lowercasing |

#### Edge Cases

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 13 | `data.price` is string `'0'` (falsy) | Rejects: `'parameter lost!!!'` (guard catches `!data['price']`) |
| 14 | `data.name` is empty string | Rejects: `'parameter lost!!!'` |
| 15 | `data.desc` is empty string | Rejects: `'parameter lost!!!'` |
| 16 | Very large price value | Validated as int, stored as-is |
| 17 | Name at max length (500 chars) | Should pass validation and insert |
| 18 | Tags array is empty after filtering | Insert succeeds with `tags: []` |
| 19 | `utime` precision | Verify `Math.round(new Date().getTime() / 1000)` is epoch seconds |

#### Error Handling

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 20 | MongoDB `insert` fails (connection error) | Promise rejected with Mongo error |
| 21 | `objectID()` throws | Promise rejected with ObjectID error |

---

## 4. Function: `editRow`

### Purpose

Update an existing fitness item's name, price, and/or description. Optionally updates tags and sets the item as the latest viewed in the session.

### Invocation & Authentication

```
editRow(uid: string, data: Object, session: Object): Promise<MongoUpdateResult>
```

| Parameter | Type | Required | Validation |
|-----------|------|----------|------------|
| `uid` | string | ✅ | `isValidString(_, 'uid')` — 24-char hex ObjectID |
| `data.name` | string | ❌ | `isValidString(_, 'name')` if present |
| `data.price` | string/number | ❌ | `isValidString(_, 'int')` if present |
| `data.desc` | string | ❌ | `isValidString(_, 'desc')` if present |
| `session` | Object | ✅ | Express session object (passed to `setLatest`) |

> **Auth**: No direct auth check. Session object used for tag latest tracking.

### Logic Flow

```
1. If data.name is truthy:
   a. Validate via isValidString(data.name, 'name')
   b. Reject if falsy: HoError('description not vaild!!!')
      ← Note: error message says "description" but refers to name

2. If data.price is truthy:
   a. Validate via isValidString(data.price, 'int')
   b. Reject if falsy: HoError('price not vaild!!!')

3. If data.desc is truthy:
   a. Validate via isValidString(data.desc, 'desc')
   b. Reject if falsy: HoError('description not vaild!!!')

4. Validate uid via isValidString(uid, 'uid')
   → Reject if falsy: HoError('uid is not vaild!!!')

5. Mongo('find', 'fitness', { _id: id }, { limit: 1 })
   → If empty result: HoError('fitness row does not exist!!!')

6. Build update_data:
   a. Start with existing tags from items[0].tags as a Set
   b. If name: add normalize(name) to Set, add name to update_data
   c. If price: add price to update_data
   d. If desc: add desc to update_data
   e. Filter tags through isDefaultTag → setArr
   f. Merge { tags: setArr } into update_data

7. Fire-and-forget: FitnessTagTool.setLatest(items[0]._id, session)
   → Errors caught silently via .catch()

8. Mongo('update', 'fitness', { _id: items[0]._id }, { $set: update_data })
   → Return update result
```

### Returns & Side Effects

| Outcome | Return Value | Side Effects |
|---------|-------------|--------------|
| Success | Mongo update result | `fitness` doc updated; `setLatest` fired (async, non-blocking) |
| Invalid uid | `Promise.reject(HoError)` | None |
| Row not found | `Promise.reject(HoError)` | None |
| Invalid name/price/desc | `Promise.reject(HoError)` | None |
| No fields provided | Empty `$set` update | Tags re-filtered and written (even with no changes) |

### Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches

| # | Scenario | Input Condition | Expected Outcome |
|---|----------|-----------------|------------------|
| 1 | Update name only | `data: { name: 'NewName' }` | `$set` contains `name` + updated `tags` |
| 2 | Update price only | `data: { price: '20' }` | `$set` contains `price` + existing `tags` |
| 3 | Update desc only | `data: { desc: 'new desc' }` | `$set` contains `desc` + existing `tags` |
| 4 | Update all fields | `data: { name, price, desc }` | All three + tags in `$set` |
| 5 | Update no fields | `data: {}` | `$set` contains only `tags` (re-filtered from existing) |
| 6 | Name present but invalid | `data: { name: 'a/b' }` | Rejects: `'description not vaild!!!'` |
| 7 | Price present but invalid | `data: { price: '-1' }` | Rejects: `'price not vaild!!!'` |
| 8 | Desc present but invalid | `data: { desc: 'bad<html>' }` | Rejects: `'description not vaild!!!'` |
| 9 | Invalid uid format | `uid: 'not-hex'` | Rejects: `'uid is not vaild!!!'` |
| 10 | Valid uid, row not found | uid is valid 24-hex but no matching doc | Rejects: `'fitness row does not exist!!!'` |
| 11 | Existing tags contain default tag | `items[0].tags = ['sport', 'default-tag']` | Default tag stripped from updated `tags` |
| 12 | New name normalizes to default tag | normalize(name) matches a default tag pattern | Tag not added to final `setArr` |

#### Edge Cases

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 13 | `data.name = ''` (empty string = falsy) | Name branch skipped, no name validation |
| 14 | `data.price = 0` (falsy) | Price branch skipped, no price validation |
| 15 | `data.desc = ''` (empty string = falsy) | Desc branch skipped |
| 16 | `session` is null/undefined | `setLatest` may throw, but error is caught silently |
| 17 | Existing document has empty tags array | Set starts empty, only new name tag (if any) added |
| 18 | Tags array unchanged after filtering | `$set` still writes tags (idempotent update) |

#### Error Handling

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 19 | `Mongo('find')` rejects | Promise bubbles up Mongo error |
| 20 | `Mongo('update')` rejects | Promise bubbles up Mongo error |
| 21 | `FitnessTagTool.setLatest` rejects | Error caught and logged; does NOT affect return |

#### Known Bug / Anomaly

| # | Issue | Detail |
|---|-------|--------|
| B1 | Misleading error message | Invalid name produces `'description not vaild!!!'` instead of name-related message (line 55) |

---

## 5. Function: `delRow`

### Purpose

Delete a fitness item and all associated per-user count records.

### Invocation & Authentication

```
delRow(uid: string): Promise<MongoDeleteResult>
```

| Parameter | Type | Required | Validation |
|-----------|------|----------|------------|
| `uid` | string | ✅ | `isValidString(_, 'uid')` — 24-char hex ObjectID |

### Logic Flow

```
1. Validate uid via isValidString(uid, 'uid')
   → Reject if falsy: HoError('uid is not vaild!!!')

2. Mongo('find', 'fitness', { _id: id }, { limit: 1 })
   → If empty result: HoError('fitness row does not exist!!!')

3. Mongo('deleteMany', 'fitness', { _id: items[0]._id })
   → Delete the fitness item document

4. Mongo('deleteMany', 'fitnessCount', { itemId: items[0]._id })
   → Delete all count records referencing this item
```

### Returns & Side Effects

| Outcome | Return Value | Side Effects |
|---------|-------------|--------------|
| Success | Mongo deleteMany result (count records) | `fitness` doc deleted; all `fitnessCount` docs with matching `itemId` deleted |
| Invalid uid | `Promise.reject(HoError)` | None |
| Row not found | `Promise.reject(HoError)` | None |

### Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches

| # | Scenario | Input Condition | Expected Outcome |
|---|----------|-----------------|------------------|
| 1 | Valid uid, row exists | Existing fitness doc ID | Both fitness doc and associated counts deleted |
| 2 | Invalid uid | `'xyz'` | Rejects: `'uid is not vaild!!!'` |
| 3 | Valid uid, row not found | Valid 24-hex, no match | Rejects: `'fitness row does not exist!!!'` |

#### Edge Cases

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 4 | Item has no associated count records | Fitness doc deleted; `deleteMany` on counts is a no-op |
| 5 | Item has multiple users' count records | All count records for that itemId deleted (all users affected) |
| 6 | `uid` is null or undefined | `isValidString` returns false → rejects |

#### Error Handling

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 7 | First `deleteMany` (fitness) fails | Promise rejected; count records NOT deleted (no cleanup) |
| 8 | Second `deleteMany` (fitnessCount) fails | Fitness doc already deleted; orphan state possible |

#### Side Effect Observation

| # | Note |
|---|------|
| S1 | Deletion does NOT clean up Redis chart data (`chart: {userId}` hash fields for this item remain) |
| S2 | Deletion does NOT clean up `fitnessStat.chart` references (chart slots pointing to deleted item become stale) |

---

## 6. Function: `getPoint`

### Purpose

Retrieve the current point balance for a given user.

### Invocation & Authentication

```
getPoint(user: Object): Promise<number>
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user` | Object | ✅ | User object with `_id` property (ObjectId or string) |

### Logic Flow

```
1. Mongo('find', 'fitnessCount', {
     owner: user._id,
     itemId: objectID(FITNESS_POINT)   ← objectID('598174b08bd4ed7a80e4dc80')
   })

2. If no result (items.length < 1): return 0
3. Otherwise: return items[0].count
```

### Returns & Side Effects

| Outcome | Return Value | Side Effects |
|---------|-------------|--------------|
| User has point record | `items[0].count` (number) | None (read-only) |
| User has no point record | `0` | None |

### Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches

| # | Scenario | Input Condition | Expected Outcome |
|---|----------|-----------------|------------------|
| 1 | User has points | Count doc exists with `count: 42` | Returns `42` |
| 2 | User has no point record | No matching doc in `fitnessCount` | Returns `0` |
| 3 | User has zero points | Count doc exists with `count: 0` | Returns `0` |

#### Edge Cases

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 4 | `user._id` is undefined | Query with `owner: undefined` — likely returns empty |
| 5 | `user` is null | TypeError accessing `user._id` |
| 6 | Multiple point records for same user (data integrity issue) | Returns first match `items[0].count` |
| 7 | `count` is negative value | Returns the negative value as-is |

#### Error Handling

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 8 | MongoDB connection fails | Promise rejected with Mongo error |

---

## 7. Function: `exchange`

### Purpose

Exchange fitness item counts for points (type 1) or redeem points for item counts (type 2). Updates Redis chart data for time-series visualization.

### Invocation & Authentication

```
exchange(uid: string, user: Object, exchange: string|number, session: Object): Promise<number>
```

| Parameter | Type | Required | Validation |
|-----------|------|----------|------------|
| `uid` | string | ✅ | `isValidString(_, 'uid')` — 24-char hex ObjectID |
| `user` | Object | ✅ | Must have `_id` property |
| `exchange` | string/number | ✅ | `isValidString(_, 'int')` — positive integer |
| `session` | Object | ✅ | Express session (for `setLatest`) |

### Logic Flow

```
1. Validate uid → Reject if invalid: HoError('uid is not vaild!!!')
2. Validate exchange as 'int' → Reject if invalid: HoError('exchange is not vaild!!!')

3. Define inner function end(id=null, itemCount=0):
   a. Find user's FITNESS_POINT count record
   b. If no record: HoError('point row does not exist!!!')
   c. Fire-and-forget: FitnessTagTool.setLatest(id, session)
   d. If id is truthy:
      i.  Redis('hmget', 'chart: {userId}', [FITNESS_POINT, id.toString()])
      ii. Build dateStr as YYYYMMDD
      iii. Merge current point count + itemCount into chart hash
      iv. Redis('hmset', ...) to save updated chart
      v. Return point count
   e. If id is null: return point count directly

4. Main flow:
   a. Mongo('find', 'fitnessStat', { owner: user._id })
      → If empty: HoError('fitness stat row does not exist!!!')
   b. Mongo('find', 'fitness', { _id: id })
      → If empty: HoError('fitness row does not exist!!!')
   c. Switch on items[0].type:

      CASE 1 (Earn points from activity):
        i.   Find user's count for this item
        ii.  Upsert: increment count by `number`, set `start`
        iii. Calculate addPoint = floor((existing_remainder + number) / price)
             - existing_remainder = (no prior count) ? number : (prior.count % price + number)
        iv.  If addPoint > 0: upsert increment FITNESS_POINT by addPoint
        v.   Call end(id, totalItemCount) → returns point balance + updates chart

      CASE 2 (Redeem points for reward):
        i.   Find user's point count
        ii.  Calculate max redeemable: floor(points / price)
        iii. addCount = min(number, max)
        iv.  If addCount > 0:
             - Upsert: increment item count by addCount
             - Upsert: decrement point count by (addCount × price)
        v.   Call end() → returns updated point balance (no chart update for redemption)

      DEFAULT:
        → HoError('fitness type unknown!!!')
```

### Returns & Side Effects

| Outcome | Return Value | Side Effects |
|---------|-------------|--------------|
| Type 1 success | User's updated point count (number) | `fitnessCount` item count incremented; `fitnessCount` point record incremented if threshold crossed; Redis chart updated |
| Type 2 success | User's updated point count (number) | `fitnessCount` item count incremented (capped); `fitnessCount` point record decremented; Redis chart NOT updated |
| Invalid uid/exchange | `Promise.reject(HoError)` | None |
| Missing stat/fitness/point rows | `Promise.reject(HoError)` | None |

### Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches — Validation

| # | Scenario | Input Condition | Expected Outcome |
|---|----------|-----------------|------------------|
| 1 | Invalid uid | `uid: 'bad'` | Rejects: `'uid is not vaild!!!'` |
| 2 | Invalid exchange | `exchange: '-3'` | Rejects: `'exchange is not vaild!!!'` |
| 3 | exchange is zero | `exchange: '0'` | Rejects: `'exchange is not vaild!!!'` (0 is falsy for int validation) |

#### Logical Branches — Missing Records

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 4 | No `fitnessStat` for user | Rejects: `'fitness stat row does not exist!!!'` |
| 5 | Fitness item not found | Rejects: `'fitness row does not exist!!!'` |
| 6 | (Type 1) No point record in `end()` | Rejects: `'point row does not exist!!!'` |
| 7 | (Type 2) No point record | TypeError or unexpected behavior accessing `items1[0].count` |

#### Logical Branches — Type 1 (Earn Points)

| # | Scenario | Input | Expected Outcome |
|---|----------|-------|------------------|
| 8 | First exchange, count reaches threshold | `number: 10`, `price: 5`, no prior count | `addPoint = 2`; point incremented by 2; count set to 10 |
| 9 | First exchange, count below threshold | `number: 3`, `price: 5`, no prior count | `addPoint = 0`; no point change; count set to 3 |
| 10 | Subsequent exchange crosses threshold | Prior `count: 3`, `number: 4`, `price: 5` | Remainder `3 % 5 + 4 = 7`; `addPoint = 1`; count = 7 |
| 11 | Subsequent exchange, no threshold cross | Prior `count: 3`, `number: 1`, `price: 5` | Remainder `3 % 5 + 1 = 4`; `addPoint = 0`; count = 4 |
| 12 | Exact threshold crossing | Prior `count: 0`, `number: 5`, `price: 5` | `addPoint = 1` |
| 13 | Multiple threshold crossings in one exchange | `number: 25`, `price: 5` | `addPoint = 5` |

#### Logical Branches — Type 2 (Redeem Points)

| # | Scenario | Input | Expected Outcome |
|---|----------|-------|------------------|
| 14 | Enough points to cover request | Points: 100, `number: 3`, `price: 10` | `max = 10`; `addCount = 3`; points decremented by 30 |
| 15 | Not enough points — capped | Points: 15, `number: 3`, `price: 10` | `max = 1`; `addCount = 1`; points decremented by 10 |
| 16 | Zero points | Points: 0, `number: 1`, `price: 10` | `max = 0`; `addCount = 0`; no DB changes |
| 17 | Points less than price | Points: 5, `number: 1`, `price: 10` | `max = 0`; `addCount = 0`; no DB changes |
| 18 | Request exactly matches affordable | Points: 30, `number: 3`, `price: 10` | `addCount = 3`; points decremented by 30 |

#### Logical Branches — Type Switch Default

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 19 | `items[0].type` is unknown (e.g., `3`) | Rejects: `'fitness type unknown!!!'` |
| 20 | `items[0].type` is `0` | Rejects: `'fitness type unknown!!!'` |

#### Logical Branches — `end()` Inner Function

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 21 | `end(id, itemCount)` with valid id | Redis chart updated with point + item count; returns point count |
| 22 | `end()` with id=null (default) | Skips Redis update; returns point count directly |
| 23 | Existing Redis chart data | Merged with new date entry via `Object.assign` |
| 24 | No existing Redis chart data (`item[0]` is null) | New chart object `{ dateStr: count }` created |
| 25 | Redis chart for item exists (`item[1]` truthy) | Merged with new date entry |
| 26 | Redis chart for item is null (`item[1]` falsy) | New chart object `{ dateStr: itemCount }` created |

#### Edge Cases

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 27 | `exchange` is `'1'` (minimum valid) | Processed as `number = 1` |
| 28 | Very large exchange number | Type 1: many points earned. Type 2: capped by point balance |
| 29 | `price` is `1` | Every count increment earns a point (type 1) |
| 30 | `start` field from stat used in upsert | `start` value from `fitnessStat` stored in count records |
| 31 | Date format: single-digit months/days | `completeZero` ensures `YYYYMMDD` format (e.g., `20260301`) |
| 32 | Multiple rapid exchanges on same date | Chart key for same date overwritten (last value wins) |

#### Error Handling

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 33 | Any Mongo operation fails mid-chain | Promise rejected; partial writes possible (no transaction) |
| 34 | Redis `hmget` fails | Promise rejected from `end()` |
| 35 | Redis `hmset` fails | Promise rejected from `end()` |
| 36 | `FitnessTagTool.setLatest` fails | Error caught silently; exchange still completes |
| 37 | `JSON.parse` of corrupted Redis data | Throws SyntaxError → unhandled in `end()` |

#### Data Consistency Concerns

| # | Concern |
|---|---------|
| D1 | No transaction: type-1 count increment and point increment are separate writes — partial failure leaves inconsistent state |
| D2 | Type-2 point decrement and item increment are separate writes — same risk |
| D3 | Type-2 `end()` called without `id` — no chart data recorded for redemptions |

---

## 8. Function: `getStat`

### Purpose

Retrieve and manage chart statistics. Supports three modes: (1) fetch all stats for the FITNESS_POINT overview, (2) remove a chart slot, or (3) add/view a specific item chart.

### Invocation & Authentication

```
getStat(uid: string, index: number = 0, typeId: string = FITNESS_POINT): Promise<Object|null>
```

| Parameter | Type | Required | Default | Validation |
|-----------|------|----------|---------|------------|
| `uid` | string | ✅ | — | `isValidString(_, 'uid')` |
| `index` | number | ❌ | `0` | `isValidString(_, 'perm')` — 0–31; checked against `CHART_LIMIT` (4) |
| `typeId` | string | ❌ | `FITNESS_POINT` | `isValidString(_, 'uid')` |

### Logic Flow

```
1. Validate typeId → Reject if invalid: HoError('uid is not vaild!!!')
2. Validate index as 'perm' → Reject if > CHART_LIMIT (4): HoError('index is not vaild!!!')
3. Validate uid → Reject if invalid: HoError('uid is not vaild!!!')

4. Inner function getStart():
   a. Find fitnessStat for owner=id
   b. If not found: insert new stat { owner, start: YYYYMMDD (number), chart: [] }
   c. Return [start.toString(), chart]

5. Inner function getChart(tId, start, name):
   a. Redis('hget', 'chart: {uid}', tId.toString())
   b. Build labels array: iterate backwards day-by-day from today to `start` date (max 365 days)
   c. Initialize data array with zeros
   d. If Redis data exists: parse JSON and fill matching date indices
   e. Transform data to cumulative running maximum:
      data[i] = max(data[i], data[i-1])
   f. Return { label: name, labels: [...], data: [...] }

6. Main decision tree:
   IF typeId equals FITNESS_POINT ObjectID:
     IF index > 0 (cIndex is truthy):
       → Remove chart slot: set chart[index - 1] = null, return null
     ELSE (index = 0):
       → Full overview mode:
         a. Find all type-1 fitness items
         b. Get or create stat record
         c. Build ret_chart[]:
            - First entry: getChart(FITNESS_POINT, start, 'point')
            - For each chart[] slot:
              - If null: push null
              - If valid: find item, getChart(), push result
         d. Return { start, fitness: [{title, id}...], chart: ret_chart }
   ELSE (typeId is a specific item):
     a. Find the fitness item
     b. If not found: HoError('fitness type unknown!!!')
     c. Set chart[index - 1] = typeId in stat record
     d. Get chart data and return it
```

### Returns & Side Effects

| Mode | Condition | Return Value | Side Effects |
|------|-----------|-------------|--------------|
| Overview | `typeId = FITNESS_POINT, index = 0` | `{ start, fitness: [...], chart: [...] }` | May create `fitnessStat` if first access |
| Remove slot | `typeId = FITNESS_POINT, index > 0` | `null` | `fitnessStat.chart[index-1]` set to `null` |
| Add/view slot | `typeId ≠ FITNESS_POINT` | `{ label, labels, data }` | `fitnessStat.chart[index-1]` set to `typeId` |
| Validation fail | Any invalid param | `Promise.reject(HoError)` | None |

### Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches — Validation

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 1 | Invalid `typeId` | Rejects: `'uid is not vaild!!!'` |
| 2 | `index` exceeds `CHART_LIMIT` (>4) | Rejects: `'index is not vaild!!!'` |
| 3 | Invalid `uid` | Rejects: `'uid is not vaild!!!'` |
| 4 | `index = 0` (default, valid) | Passes validation |
| 5 | `index = 4` (equal to CHART_LIMIT) | Passes validation (not `>`, it's `>`) |
| 6 | `index = 5` (exceeds CHART_LIMIT) | Rejects |

#### Logical Branches — Overview Mode (FITNESS_POINT, index=0)

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 7 | First-time user (no stat record) | New stat record created with today's date and empty chart |
| 8 | Existing stat record, empty chart | Returns `{ start, fitness: [...], chart: [pointChart] }` |
| 9 | Chart has populated slots | Each slot resolved to chart data object |
| 10 | Chart has null slots | Null entries preserved in `ret_chart` |
| 11 | Chart slot references deleted item | `items.length < 1` check → pushes null (note: checks `items` not `items1`) |
| 12 | No type-1 fitness items exist | `fitness: []`, chart contains only point chart |
| 13 | Multiple type-1 items | All listed in `fitness` array with `{title, id}` |

#### Logical Branches — Remove Slot Mode (FITNESS_POINT, index>0)

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 14 | Remove occupied slot (index=1) | `chart[0]` set to `null`; returns `null` |
| 15 | Remove already-null slot | No-op on chart; returns `null` |
| 16 | Remove slot beyond current chart length | Array auto-extends with `undefined` up to index; `chart[index-1] = null` |

#### Logical Branches — Add/View Slot Mode (specific typeId)

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 17 | Valid fitness item, index=1 | `chart[0] = typeId`; returns chart data |
| 18 | Fitness item not found | Rejects: `'fitness type unknown!!!'` |
| 19 | Replace existing chart slot | Previous typeId overwritten with new one |

#### Logical Branches — `getChart()` Inner Function

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 20 | Redis has chart data for item | Data filled at matching date indices |
| 21 | Redis has no chart data (null) | All data values remain 0 |
| 22 | Start date is today | Labels array has single entry (today) |
| 23 | Start date is 365 days ago | Labels array has 365 entries |
| 24 | Start date is >365 days ago | Loop caps at 365 iterations; earliest dates missing |
| 25 | Data with cumulative max transform | `[0, 5, 3, 8]` → `[0, 5, 5, 8]` |
| 26 | Data all zeros | Remains `[0, 0, ...]` |
| 27 | Redis data has dates outside range | Those entries silently ignored (`indexOf === -1`) |

#### Edge Cases

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 28 | `start` stored as Number, converted to string | `toString()` produces `'YYYYMMDD'` correctly |
| 29 | Leap year date handling (Feb 29) | JavaScript `Date.setDate` handles correctly |
| 30 | Timezone sensitivity | `new Date()` uses server timezone for date labels |
| 31 | `chart` array in stat is undefined | Potential TypeError when accessing `chart.length` |
| 32 | Recursive `recur_chart` with large chart array | Stack depth limited to `CHART_LIMIT` (4), safe |
| 33 | Index 0 with non-FITNESS_POINT typeId | Goes to "add/view slot" branch; `chart[-1]` = undefined assignment |

#### Error Handling

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 34 | Redis `hget` fails | Promise rejected from `getChart` |
| 35 | Mongo insert for new stat fails | Promise rejected |
| 36 | Mongo update for chart slot fails | Promise rejected |
| 37 | `JSON.parse` of corrupted Redis data | SyntaxError → unhandled rejection |

#### Known Bug / Anomaly

| # | Issue | Detail |
|---|-------|--------|
| B1 | Wrong length check in `recur_chart` | Line 284: checks `items.length` (outer scope, type-1 items) instead of `items1.length` (found item); may incorrectly push `null` or proceed with wrong data |

---

## 9. Function: `resetDate`

### Purpose

Completely reset a user's fitness statistics: update the stat start date to today, clear chart slots, delete all count records, and purge Redis chart cache.

### Invocation & Authentication

```
resetDate(uid: string): Promise<RedisDelResult>
```

| Parameter | Type | Required | Validation |
|-----------|------|----------|------------|
| `uid` | string | ✅ | `isValidString(_, 'uid')` — 24-char hex ObjectID |

### Logic Flow

```
1. Validate uid → Reject if invalid: HoError('uid is not vaild!!!')

2. Mongo('update', 'fitnessStat', { owner: id }, { $set: {
     start: YYYYMMDD (Number),
     chart: []
   }})

3. Mongo('deleteMany', 'fitnessCount', { owner: id })
   → Delete ALL count records for this user (points + item counts)

4. Redis('del', 'chart: {id}')
   → Delete entire Redis chart hash for this user
```

### Returns & Side Effects

| Outcome | Return Value | Side Effects |
|---------|-------------|--------------|
| Success | Redis `del` result | `fitnessStat` updated (new start date, empty chart); all `fitnessCount` records deleted; Redis chart hash deleted |
| Invalid uid | `Promise.reject(HoError)` | None |
| No stat record | Mongo update is a no-op (no match); continues to delete counts and Redis |

### Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches

| # | Scenario | Input Condition | Expected Outcome |
|---|----------|-----------------|------------------|
| 1 | Valid uid, all data exists | User has stat, counts, and Redis data | All three stores cleaned |
| 2 | Invalid uid | `'not-valid'` | Rejects: `'uid is not vaild!!!'` |
| 3 | No stat record | User never initialized | Mongo update is no-op; counts + Redis still cleaned |
| 4 | No count records | User has stat but no counts | deleteMany returns 0; Redis still cleaned |
| 5 | No Redis chart data | User has stat + counts but no chart cache | Redis del on non-existent key is safe |

#### Edge Cases

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 6 | Reset on same day as original start | `start` updated to same YYYYMMDD value |
| 7 | User has counts for multiple items + points | ALL deleted (not item-specific) |
| 8 | Concurrent reset requests | Both succeed; idempotent for stat/redis, second deleteMany is no-op |

#### Error Handling

| # | Scenario | Expected Outcome |
|---|----------|------------------|
| 9 | Mongo update (stat) fails | Promise rejected; counts and Redis NOT cleaned |
| 10 | Mongo deleteMany (counts) fails | Stat already updated; Redis NOT cleaned; inconsistent state |
| 11 | Redis del fails | Stat + counts already modified; Redis stale |

#### Data Consistency Concerns

| # | Concern |
|---|---------|
| D1 | No transaction: three operations are sequential; partial failure leaves inconsistent state |
| D2 | Point balance completely lost (not archived) |

---

## 10. Cross-Cutting Test Concerns

### 10.1 Input Validation Pattern

All functions follow the same validation pattern with `isValidString`. Test matrix:

| Input Type | Valid Examples | Invalid Examples |
|------------|---------------|------------------|
| `'uid'` | `'598174b08bd4ed7a80e4dc80'` (24 hex) | `'short'`, `'xyz'`, `null`, `undefined`, `''`, non-hex 24-char |
| `'name'` | `'Pushups'`, `'跑步'`, 500-char string | `'a/b'`, `'a\\b'`, `'.'`, `'..'`, `''` (>500 chars) |
| `'int'` | `'1'`, `'100'`, `1` | `'0'`, `'-1'`, `'abc'`, `''`, `null` |
| `'desc'` | `'Simple description'` | Strings with `& < > " '` or `\` chars |
| `'perm'` | `0`, `1`, `31` | `32`, `-1`, `'abc'` |

### 10.2 Error Handling Pattern

All errors follow this pattern:
- `handleError(new HoError(message))` → returns `Promise.reject(HoError)`
- `HoError` default code: `400`
- Error messages use `!!!` suffix consistently

### 10.3 Database Operation Patterns

| Pattern | Functions Using It |
|---------|-------------------|
| Find-then-act (existence check) | `editRow`, `delRow`, `exchange`, `getStat` |
| Upsert with `$inc` | `exchange` (type 1 and type 2) |
| Fire-and-forget async | `editRow` → `setLatest`, `exchange` → `setLatest` |
| Multi-collection sequential writes (no transaction) | `delRow`, `exchange`, `resetDate` |

### 10.4 Authentication & Authorization

| Aspect | Detail |
|--------|--------|
| Module-level auth | **None** — all functions trust caller |
| Router-level auth | Enforced by Express middleware (`checkLogin`, `checkAdmin`) |
| Test implication | Unit tests do not need auth mocking; integration tests via router must verify auth middleware |

### 10.5 Concurrency Risks

| Function | Risk |
|----------|------|
| `exchange` (type 1) | Concurrent exchanges may miscalculate point thresholds (read-then-write race) |
| `exchange` (type 2) | Concurrent redemptions may overdraw points (no atomic check-and-decrement) |
| `resetDate` | Concurrent exchange + reset may leave orphan data |
| `editRow` | Concurrent edits may lose tag updates (last-write-wins) |

---

## 11. Snapshot Testing Data

### 11.1 Fitness Item Document (MongoDB `fitness` Collection)

```json
{
  "_id": "ObjectId('64a1b2c3d4e5f6a7b8c9d0e1')",
  "name": "Pushups",
  "price": 10,
  "desc": "Daily pushup routine",
  "utime": 1688200000,
  "type": 1,
  "use": {},
  "tags": ["pushups", "sport", "運動"]
}
```

### 11.2 Fitness Count Document (MongoDB `fitnessCount` Collection)

```json
{
  "owner": "ObjectId('507f1f77bcf86cd799439011')",
  "itemId": "ObjectId('64a1b2c3d4e5f6a7b8c9d0e1')",
  "count": 45,
  "start": 20260301
}
```

### 11.3 Fitness Point Document (MongoDB `fitnessCount` Collection)

```json
{
  "owner": "ObjectId('507f1f77bcf86cd799439011')",
  "itemId": "ObjectId('598174b08bd4ed7a80e4dc80')",
  "count": 12,
  "start": 20260301
}
```

### 11.4 Fitness Stat Document (MongoDB `fitnessStat` Collection)

```json
{
  "owner": "ObjectId('507f1f77bcf86cd799439011')",
  "start": 20260301,
  "chart": [
    "ObjectId('64a1b2c3d4e5f6a7b8c9d0e1')",
    null,
    "ObjectId('64a1b2c3d4e5f6a7b8c9d0e2')",
    null
  ]
}
```

### 11.5 Redis Chart Hash (`chart: {userId}`)

```
Key: "chart: 507f1f77bcf86cd799439011"
Fields:
  "598174b08bd4ed7a80e4dc80" → "{\"20260301\":5,\"20260302\":12,\"20260303\":12}"
  "64a1b2c3d4e5f6a7b8c9d0e1" → "{\"20260301\":10,\"20260302\":25,\"20260303\":45}"
```

### 11.6 `newRow` Success Response

```json
{
  "id": "ObjectId('64a1b2c3d4e5f6a7b8c9d0e1')"
}
```

### 11.7 `getStat` Overview Response (FITNESS_POINT, index=0)

```json
{
  "start": "20260301",
  "fitness": [
    { "title": "Pushups", "id": "ObjectId('64a1b2c3d4e5f6a7b8c9d0e1')" },
    { "title": "Running", "id": "ObjectId('64a1b2c3d4e5f6a7b8c9d0e2')" }
  ],
  "chart": [
    {
      "label": "point",
      "labels": ["20260301", "20260302", "20260303"],
      "data": [5, 12, 12]
    },
    {
      "label": "Pushups",
      "labels": ["20260301", "20260302", "20260303"],
      "data": [10, 25, 45]
    },
    null,
    null
  ]
}
```

### 11.8 `getChart` Single Chart Response

```json
{
  "label": "Pushups",
  "labels": ["20260301", "20260302", "20260303", "20260304"],
  "data": [0, 10, 25, 45]
}
```

### 11.9 Error Response Shape

```json
{
  "name": "HoError",
  "message": "parameter lost!!!",
  "code": 400
}
```

---

> **Reference**: This document follows the QA Testing Scope & Strategy defined in [OUTLINE.md](../../OUTLINE.md) §11. Test implementation should use **Jest 27** with mocked `Mongo`, `Redis`, and `TagTool` dependencies per the project's existing test infrastructure (§10.1). Test files should be placed at `src/back/models/__tests__/fitness-tool.test.js` per §11.8.
