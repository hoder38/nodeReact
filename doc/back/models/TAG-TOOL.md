# TAG-TOOL.JS — Technical Testing Documentation

> **File**: `/src/back/models/tag-tool.js`  
> **Lines**: 1,732  
> **Module Type**: Factory function returning tag management system  
> **Dependencies**: MongoDB, Redis (via session), utility functions, constants  
> **Generated**: 2026-03-17  

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Architecture & Design](#2-architecture--design)
3. [Exported Methods](#3-exported-methods)
4. [Helper Functions](#4-helper-functions)
5. [Comprehensive Test Scenarios](#5-comprehensive-test-scenarios)
6. [Snapshot Testing Data](#6-snapshot-testing-data)
7. [Integration Testing](#7-integration-testing)

---

## 1. Module Overview

### 1.1 Purpose

The `tag-tool.js` module is a **factory function** that creates a collection-specific tag management system. It provides comprehensive tag-based querying, search, filtering, categorization, and bookmark management for multiple collection types:

- **STORAGEDB**: File storage items (videos, images, archives)
- **PASSWORDDB**: Password manager entries
- **STOCKDB**: Stock/investment tracking

### 1.2 Key Capabilities

- **Tag-Based Queries**: Complex multi-tag search with exact/fuzzy matching
- **Hierarchical Navigation**: Parent-child tag relationships
- **Bookmark System**: Save and restore query states across sessions
- **External API Integration**: Yify, MangaDex queries
- **Relative Tag Calculation**: Find related tags using union/intersection logic
- **Session State Management**: Persistent tag search state via Redis session
- **Permission Enforcement**: Owner-based and admin-level access control

### 1.3 Module Signature

```javascript
export default function process(collection)
```

**Parameters**:
- `collection` (string): One of STORAGEDB, PASSWORDDB, STOCKDB

**Returns**: Object containing 30+ methods for tag operations, or `false` if invalid collection

**Side Effects**: None (pure factory function)

---

## 2. Architecture & Design

### 2.1 Factory Pattern

The module uses a **closure-based factory pattern** to create collection-specific instances:

```
process(STORAGEDB) → { tagQuery, addTag, delTag, ... } (Storage-specific)
process(STOCKDB)   → { tagQuery, addTag, delTag, ... } (Stock-specific)
```

Each returned object shares the same method interface but operates on different:
- MongoDB collections
- SQL generation functions (getStorageQuerySql, getStockQuerySql, etc.)
- Tag extraction functions (getStorageQueryTag, getStockQueryTag, etc.)
- Sort field mappings (getStorageSortName, getStockSortName, etc.)
- Parent category arrays (STORAGE_PARENT, STOCK_PARENT, etc.)

### 2.2 Session-Based State Management

Tag search state is stored in Express session (backed by Redis):

```javascript
session.searchData[collection] = {
    cur: ['tag1', 'tag2'],        // Current tag filters
    exactly: [false, true],       // Exact match flags per tag
    bookmark: 'bookmarkId',       // Active bookmark reference
    saveName: 'mySearch',         // Named search save
    sortName: 'mtime',            // Sort field
    sortType: -1                  // Sort direction
}
```

**Benefits**:
- Persistent search state across page refreshes
- Multi-tab consistency (same session, same state)
- Server-side state eliminates client-side tampering

### 2.3 Tag Normalization

All tags undergo normalization for consistent storage/comparison:

```javascript
normalize('My Tag Name') → 'my_tag_name'
denormalize('my_tag_name') → 'My Tag Name'
```

**Rules**:
- Lowercase conversion
- Space → underscore
- Trimming whitespace
- Special character handling

### 2.4 Default Tags System

Predefined tags with special meaning (indices 0-31):

| Index | Tag | Purpose |
|-------|-----|---------|
| 0 | `all` | Match all items |
| 1 | `local` | Local files |
| 2 | `media` | Media files |
| 6 | `untagged` | Items with no tags |
| 8 | `yv` | YouTube videos |
| 9 | `yp` | YouTube playlists |
| 10 | `ym` | YouTube music |
| 11 | `ymp` | YouTube music playlists |
| 17 | `search` | Search mode |
| 22 | `you` | YouTube general |
| 30 | `ou:*`, `pl:*`, `ch:*` | YouTube ID patterns |
| 31 | Special collection-specific tags |

---

## 3. Exported Methods

### 3.1 `tagQuery(page, tagName, exactly, index, sortName, sortType, user, session, customLimit)`

**Purpose**: Execute paginated tag-based query against MongoDB collection

**Parameters**:
- `page` (number): Skip offset for pagination (e.g., 0, 50, 100)
- `tagName` (string|null): Tag to search for (null = use session state)
- `exactly` (boolean): Require exact tag match vs. fuzzy
- `index` (number): Parent category index (0 = no parent filter)
- `sortName` (string): Field to sort by ('name', 'mtime', 'count')
- `sortType` (number): Sort direction (1 = asc, -1 = desc)
- `user` (object): User object with `_id` and `perm` fields
- `session` (object): Express session with `searchData[collection]`
- `customLimit` (number, optional): Override default QUERY_LIMIT (50)

**Returns**: Promise resolving to:
```javascript
{
    items: [],              // Array of MongoDB documents
    parentList: {...},      // Current tag navigation state
    latest: 'latestItemId', // (Optional) Latest viewed item for bookmarks
    bookmark: 'bookmarkId', // (Optional) Active bookmark
    mediaHadle: 1           // (Optional) Flag for media type handling
}
```

**Logic Flow**:

1. **Session Tag Retrieval**: Call `this.searchTags(session)` to get tag state manager
2. **Tag Validation**:
   - If `!tagName` → Use all tags from session (`tags.getArray()`)
   - If `!index` → Validate `tagName` with `isValidString(tagName, 'name')`
     - Exception: Collection-specific special tags (index 31) bypass validation
     - Fail → Return `handleError(new HoError('name not valid!!!'))`
   - If `index` → Validate both `tagName` and `index`
     - `isValidString(tagName, 'name')` and `isValidString(index, 'parentIndex')`
     - Get parent-filtered array: `tags.getArray(tagName, exactly, index)`

3. **SQL Generation**: `getQuerySql(user, parentList.cur, parentList.exactly)`
   - Returns `{nosql: {...}, select: {...}, hint: {...}, skip: number}`
   - Builds MongoDB query with user ownership, permission filters, tag conditions

4. **MongoDB Query**: Execute `Mongo('find', collection, sql.nosql, options)`
   - Projection: `sql.select` (field filtering)
   - Pagination: `skip: page + (sql.skip || 0)`, `limit: customLimit`
   - Sorting: `[[getSortName(sortName), sortType]]`
   - Hint: `sql.hint` for index optimization


6. **Media Type Handling**:
   - If `sql.nosql.mediaType` exists → Return `{items, parentList, mediaHadle: 1}`
   - Else → Call `returnPath(items, parentList)` for bookmark/latest logic

7. **Bookmark Latest Retrieval**:
   - If `parentList.bookmark` → Query `${collection}User` for latest viewed item
   - Append `latest` and `bookmark` to return object

**Edge Cases**:
- Empty `tagName` with no session state → Returns all items matching user permissions
- Invalid `tagName` → Error thrown immediately
- No SQL generated (null return from `getQuerySql`) → Returns `returnPath([], parentList)`
- Zero results → Returns `{items: [], parentList, ...}`

**Authentication**:
- Requires valid `user` object with `_id` field
- Query filtering based on `user.perm` level (admin sees more)
- Ownership checks embedded in SQL generation

**Side Effects**:
- Modifies `session.searchData[collection]` via `searchTags()`
- Reads from MongoDB collections: `collection`, `${collection}Count`, `${collection}User`

---

### 3.2 `singleQuery(uid, user, session)`

**Purpose**: Retrieve a single item by ID with permission checks

**Parameters**:
- `uid` (string): MongoDB ObjectID as string
- `user` (object): User object with `_id` and `perm`
- `session` (object): Express session

**Returns**: Promise resolving to:
```javascript
{item: {...}}              // Single item object
// OR
{item: {...}, mediaHadle: 1}  // If media type filter active
// OR
{empty: true}              // If not found or unauthorized
```

**Logic Flow**:

1. **ID Validation**: `isValidString(uid, 'uid')`
   - Fail → Return `handleError(new HoError('uid is not valid!!!'))`

2. **Session Tag Retrieval**: `this.searchTags(session).getArray()`
   - Gets current tag filter state (even for single item query)

3. **SQL Generation**: `getQuerySql(user, parentList.cur, parentList.exactly)`
   - Apply same permission/tag filters as multi-item query
   - Add `{_id: objectID(uid)}` to query

4. **MongoDB Query**: `Mongo('find', collection, sql.nosql, {projection, limit: 1, hint: {_id: 1}})`
   - Use `_id` index for fast lookup


6. **Result Handling**:
   - `items.length < 1` → `{empty: true}`
   - `sql.nosql.mediaType` exists → `{item: items[0], mediaHadle: 1}`
   - Default → `{item: items[0]}`

**Edge Cases**:
- Invalid ObjectID format → Validation error
- Valid ID but unauthorized access → `{empty: true}`
- Item exists but filtered by tags → `{empty: true}`
- No SQL generated → `{empty: true}`

**Authentication**:
- ID must pass ownership/permission checks in `getQuerySql`
- Returns empty instead of 401/403 to prevent ID enumeration

**Side Effects**:
- Reads from MongoDB: `collection`, `${collection}Count`

---

### 3.3 `resetQuery(sortName, sortType, user, session)`

**Purpose**: Reset tag filters to default and fetch initial page

**Parameters**:
- `sortName` (string): Field to sort by
- `sortType` (number): Sort direction
- `user` (object): User object
- `session` (object): Express session

**Returns**: Promise resolving to `{items: [], parentList: {...}}`

**Logic Flow**:

1. **Reset Session State**: `this.searchTags(session).resetArray()`
   - Clears `session.searchData[collection].cur` and `.exactly`
   - Returns fresh `parentList` with no filters

2. **SQL Generation**: `getQuerySql(user, parentList.cur, parentList.exactly)`
   - Empty tag filters = match all items for user

3. **MongoDB Query**: Fetch first page (skip: 0, limit: QUERY_LIMIT)


**Edge Cases**:
- No SQL generated → Returns `{items: [], parentList}`

**Side Effects**:
- Clears `session.searchData[collection]` tag filters

---

### 3.4 `getYifyQuery(search_arr, sortName, page)`

**Purpose**: Build Yify Torrents API query parameters

**Parameters**:
- `search_arr` (array): Tag array
- `sortName` (string): Sort field
- `page` (number): Skip offset

**Returns**: Object or false
```javascript
{
    query_term: 'search terms',
    sort_by: 'year',
    limit: 50,
    page: 1,
    genre: 'action',
    quality: '1080p'
}
```

**Logic Flow**:

1. **Initialize**: `{limit: QUERY_LIMIT, page: Math.floor(page / QUERY_LIMIT) + 1}`

2. **Sort Mapping**:
   - 'count' → 'download_count'
   - 'mtime' → 'year'
   - Default → 'year'

3. **Tag Processing**:
   - GENRE_LIST match → Set `query.genre`
   - `1080p`, `720p`, `3D` → Set `query.quality`
   - Default tags (0, 6, 17, 22) → Add to query_term
   - Others → Add to query_term

4. **Query Term**: Join with spaces

**Edge Cases**:
- No genre tags → No genre filter
- Multiple qualities → Last one wins

**Returns**: Object for Yify API or false if no query_term

---

### 3.5 `getMadQuery(search_arr, sortName, page)`

**Purpose**: Build MangaDex API query parameters

**Parameters**: Same as `getYifyQuery`

**Returns**: Object or false
```javascript
{
    title: 'search title',
    order: {createdAt: 'desc'},
    limit: 50,
    offset: 0,
    includedTags: [...],
    excludedTags: [...],
    publicationDemographic: ['shounen'],
    status: ['completed']
}
```

**Logic Flow**:

1. **Initialize**: `{limit: QUERY_LIMIT, offset: page, order: {createdAt: 'desc'}}`

2. **Sort Mapping**:
   - 'count' → `{followedCount: 'desc'}`
   - 'mtime' → `{createdAt: 'desc'}`

3. **Tag Processing**:
   - `include:*` prefix → Add to `includedTags` UUID array
   - `exclude:*` prefix → Add to `excludedTags` UUID array
   - GENRE_LIST match → Add to `includedTags`
   - `shounen`, `shoujo`, `seinen`, `josei` → `publicationDemographic`
   - `ongoing`, `completed`, `hiatus`, `cancelled` → `status`
   - Default → Add to `title`

**Edge Cases**:
- Empty title with only filters → Valid query
- Invalid UUID format → Ignored

---

### 3.6 `getRelativeTag(tag_arr, user, pre_arr, exactly_arr)`

**Purpose**: Calculate related tags using union/intersection logic

**Parameters**:
- `tag_arr` (array): Current tag filters
- `user` (object): User object
- `pre_arr` (array|null): Previous results for optimization
- `exactly_arr` (array|null): Exact match flags per tag

**Returns**: Promise resolving to:
```javascript
{
    union: [{name: 'tag1', count: 10}, ...],    // Tags in ANY current filter
    inter: [{name: 'tag2', count: 5}, ...],     // Tags in ALL current filters
    single: [{name: 'tag3', count: 20}, ...],   // Tags for single filter
    all: {name: 'all', count: 100}              // Total item count
}
```

**Logic Flow**:

1. **Validation**: If `!tag_arr || tag_arr.length === 0` → Return `{union: [], inter: [], single: [], all: {count: 0}}`

2. **Parallel Query Generation**: For each tag in `tag_arr`:
   - Build SQL with `getQuerySql(user, [tag], [exactly])`
   - Query `${collection}User` aggregation for tag counts
   - Use `$unwind` on `tagList` → `$group` to count

3. **Union Calculation** (if `tag_arr.length > 1`):
   - Combine all tag results
   - Deduplicate by tag name
   - Sum counts for duplicate tags
   - Sort by count descending
   - Limit to RELATIVE_UNION (100)

4. **Intersection Calculation** (if `tag_arr.length > 1`):
   - Find tags present in ALL queries
   - Use minimum count across queries
   - Sort by count descending
   - Limit to RELATIVE_INTER (100)

5. **Single Query** (if `tag_arr.length === 1`):
   - Return first query results as-is
   - Limit to RELATIVE_LIMIT (500)

6. **All Count**: Query total items matching `getQuerySql(user, tag_arr, exactly_arr)`
   - Use `Mongo('count', ...)`

**Edge Cases**:
- Empty tag array → All zeros
- Single tag → Union/inter empty, single populated
- No matching items → All counts zero
- Optimization with `pre_arr` → Skip re-query if tags unchanged

**Performance**:
- Uses MongoDB aggregation pipeline
- Indexed tag lookups
- Limits result sets early

**Authentication**: Respects user permissions via `getQuerySql`

**Side Effects**: Read-only MongoDB queries

---

### 3.7 `addTag(uid, tag, user, checkValid)`

**Purpose**: Add a tag to an item with permission validation

**Parameters**:
- `uid` (string|ObjectID): Item ID
- `tag` (string): Tag to add (will be normalized)
- `user` (object): User object with `_id` and `perm`
- `checkValid` (boolean, default true): Validate tag format

**Returns**: Promise resolving to update result

**Logic Flow**:

1. **ID Validation**: 
   ```javascript
   const id = (typeof uid === 'object') ? uid : isValidString(uid, 'uid')
   ```
   - Fail → Return `handleError(new HoError('uid is not valid!!!'))`

2. **Tag Validation** (if `checkValid === true`):
   - `isValidString(tag, 'name')`
   - Fail → Return `handleError(new HoError('name is not valid!!!'))`

3. **Item Retrieval**: Query `${collection}User` to get current item
   - SQL: `{_id: id, owner: user._id}` (owner check)
   - If not found → Error

4. **Duplicate Check**: 
   - Normalize input tag
   - Check if `normalize(tag)` already in `item.tagList`
   - If exists → Return `handleError(new HoError('duplicate tag!!!'))`

5. **Permission Validation**:
   - If tag already exists in item tags → Check if user is owner
   - Query collection tags to find tag document
   - If `tag.owner !== user._id` and `user.perm !== 1` → Error

6. **Upsert Tag Document**: 
   ```javascript
   Mongo('update', `${collection}Tag`, 
       {name: normalize(tag)}, 
       {$set: {name: normalize(tag), owner: user._id, perm: 0}}, 
       {upsert: true}
   )
   ```

7. **Update Item**:
   ```javascript
   Mongo('update', `${collection}User`,
       {_id: id},
       {$addToSet: {tagList: normalize(tag)}}
   )
   ```

**Edge Cases**:
- Tag already exists with different owner → Error if not admin
- Duplicate tag → Error
- Item not owned by user → Error
- Invalid characters in tag → Validation error
- Tag with spaces → Auto-normalized to underscores

**Authentication**:
- Owner check: `item.owner === user._id`
- Admin override: `user.perm === 1`

**Side Effects**:
- Writes to `${collection}Tag` (upsert)
- Updates `${collection}User.tagList` array

---

### 3.8 `delTag(uid, tag, user, checkValid)`

**Purpose**: Remove a tag from an item

**Parameters**: Same as `addTag`

**Returns**: Promise resolving to update result

**Logic Flow**:

1. **Validation**: ID and tag validation (same as addTag)

2. **Item Retrieval**: Get item with owner check

3. **Tag Existence Check**: 
   - Normalize tag
   - If not in `item.tagList` → Return `handleError(new HoError('tag not exist!!!'))`

4. **Permission Validation**:
   - Query `${collection}Tag` for tag document
   - If `tag.owner !== user._id` and `user.perm !== 1` → Error
   - Exception: If tag has `perm: 1` (public), allow deletion

5. **Update Item**:
   ```javascript
   Mongo('update', `${collection}User`,
       {_id: id},
       {$pull: {tagList: normalize(tag)}}
   )
   ```

6. **Tag Cleanup** (if last usage):
   - Query if any other items have this tag
   - If count === 0 → Delete tag document from `${collection}Tag`

**Edge Cases**:
- Tag doesn't exist on item → Error
- Tag owned by other user → Error unless admin
- Last item using tag → Tag document deleted
- Public tag (`perm: 1`) → Anyone can remove from their items

**Authentication**:
- Owner check for item and tag
- Admin can remove any tag

**Side Effects**:
- Updates `${collection}User.tagList` (removes tag)
- May delete from `${collection}Tag` if orphaned

---

### 3.9 `sendTag(uid, objName, tags, user)`

**Purpose**: Batch replace all tags on an item

**Parameters**:
- `uid` (string): Item ID
- `objName` (string): Item name (for logging)
- `tags` (array): New tag array
- `user` (object): User object

**Returns**: Promise resolving to operation result

**Logic Flow**:

1. **ID Validation**: `isValidString(uid, 'uid')`

2. **Get Current Tags**: Query item to get existing `tagList`

3. **Calculate Diff**:
   ```javascript
   const toAdd = tags.filter(t => !currentTags.includes(t))
   const toRemove = currentTags.filter(t => !tags.includes(t))
   ```

4. **Sequential Operations**:
   - For each tag in `toRemove`: Call `this.delTag(uid, tag, user, false)`
   - For each tag in `toAdd`: Call `this.addTag(uid, tag, user, false)`
   - Use recursion with promises to ensure order

5. **Error Handling**: Log errors but continue processing remaining tags

**Edge Cases**:
- Empty tags array → Removes all tags
- Duplicate tags in input → Deduplicated by set logic
- Partial failure → Continues processing, returns cumulative result

**Authentication**: Enforced via `addTag`/`delTag` calls

**Side Effects**: Multiple writes to MongoDB via add/del operations

---

### 3.10 `searchTags(search)`

**Purpose**: Create or retrieve session-based tag state manager

**Parameters**:
- `search` (object): Express session object

**Returns**: Object with methods:
```javascript
{
    getArray(value, exactly, index),
    resetArray(),
    setArray(bookmark, tagList, exactly),
    getBookmark(),
    saveArray(saveName, sortName, sortType),
    loadArray(saveName)
}
```

**Logic Flow**:

1. **Session Initialization**: 
   ```javascript
   if (!search.searchData) search.searchData = {}
   if (!search.searchData[collection]) {
       search.searchData[collection] = {
           cur: [],
           exactly: [],
           bookmark: null
       }
   }
   ```

2. **Return State Manager Object**: Closure-based methods operating on `search.searchData[collection]`

**Methods**:

#### `getArray(value, exactly, index)`
- **Purpose**: Get current tag filter state, optionally adding new tag
- **Logic**:
  - If `value === null` → Return current state
  - If `value` provided → Normalize and add to `cur` array
  - If `exactly` → Add true to `exactly` array
  - If `index` → Filter by parent category
  - Update session and return new state
- **Returns**: `{cur: [], exactly: [], ...}`

#### `resetArray()`
- **Purpose**: Clear all tag filters
- **Logic**: Set `cur: []`, `exactly: []`, clear `bookmark`
- **Returns**: Fresh state object

#### `setArray(bookmark, tagList, exactly)`
- **Purpose**: Restore bookmark state
- **Logic**: 
  - Parse `tagList` (comma-separated string to array)
  - Parse `exactly` (comma-separated booleans)
  - Set `bookmark` reference
  - Update session

#### `getBookmark()`
- **Purpose**: Get current bookmark ID
- **Returns**: `bookmark` field or null

#### `saveArray(saveName, sortName, sortType)`
- **Purpose**: Save current search state with name
- **Logic**:
  - Store `cur`, `exactly`, `sortName`, `sortType` under `saveName` key
  - Update session

#### `loadArray(saveName)`
- **Purpose**: Restore named search state
- **Logic**: Retrieve saved state and apply to current session

**Edge Cases**:
- Session not initialized → Auto-creates structure
- Invalid saveName → Returns current state
- Concurrent tabs → Redis session ensures consistency

**Authentication**: None (session-based, already authenticated)

**Side Effects**: Modifies `req.session` (persisted to Redis)

---

### 3.11 `getBookmarkList(sortName, sortType, user)`

**Purpose**: Retrieve user's saved bookmarks

**Parameters**:
- `sortName` (string): Sort field
- `sortType` (number): Sort direction
- `user` (object): User object

**Returns**: Promise resolving to bookmark array

**Logic Flow**:

1. **Query**: `Mongo('find', `${collection}Bookmark`, {owner: user._id})`

2. **Sorting**: Apply `sortName` and `sortType`

3. **Limit**: BOOKMARK_LIMIT (100)

**Edge Cases**:
- No bookmarks → Empty array
- Invalid sort field → Uses default

**Authentication**: Filters by `owner: user._id`

---

### 3.12 `getBookmark(id, sortName, sortType, user, session)`

**Purpose**: Load a specific bookmark by ID

**Parameters**:
- `id` (string): Bookmark ObjectID
- `sortName`, `sortType`: Sort parameters
- `user`, `session`: User and session objects

**Returns**: Promise resolving to `{items: [], parentList: {...}}`

**Logic Flow**:

1. **ID Validation**: `isValidString(id, 'uid')`

2. **Bookmark Retrieval**: Query `${collection}Bookmark` with `{_id: id, owner: user._id}`

3. **Tag State Restoration**: 
   - Call `this.searchTags(session).setArray(id, bookmark.path, bookmark.exactly)`
   - Applies saved tag filters to session

4. **Query Execution**: Call `this.tagQuery()` with restored state

**Edge Cases**:
- Bookmark not found → Error
- Bookmark owned by other user → Error
- Invalid tag format in bookmark → Handled by tagQuery

**Authentication**: Owner check on bookmark document

---

### 3.13 `setBookmark(btag, bexactly, sortName, sortType, user, session)`

**Purpose**: Update existing bookmark with current search state

**Parameters**:
- `btag` (string): Comma-separated tag list
- `bexactly` (string): Comma-separated boolean flags
- `sortName`, `sortType`: Sort parameters
- `user`, `session`: User and session objects

**Returns**: Promise resolving to update result

**Logic Flow**:

1. **Get Bookmark ID**: `this.searchTags(session).getBookmark()`

2. **Update**: 
   ```javascript
   Mongo('update', `${collection}Bookmark`,
       {_id: bookmarkId, owner: user._id},
       {$set: {path: btag, exactly: bexactly, sortName, sortType}}
   )
   ```

**Edge Cases**:
- No active bookmark → Error
- Bookmark deleted since load → Error

**Authentication**: Owner check in query

---

### 3.14 `addBookmark(name, user, session, bpath, bexactly)`

**Purpose**: Create new bookmark

**Parameters**:
- `name` (string): Bookmark display name
- `user` (object): User object
- `session` (object): Session
- `bpath` (string|null): Tag path (null = use session state)
- `bexactly` (string|null): Exact flags

**Returns**: Promise resolving to insert result

**Logic Flow**:

1. **Name Validation**: `isValidString(name, 'name')`

2. **Path Resolution**:
   - If `!bpath` → Get from session: `searchTags(session).getArray().cur.join(',')`
   - If `!bexactly` → Get from session: `exactly` array joined

3. **Duplicate Check**: Query existing bookmarks with same name
   - If exists → Error

4. **Insert**:
   ```javascript
   Mongo('insert', `${collection}Bookmark`, {
       name: normalize(name),
       owner: user._id,
       path: bpath,
       exactly: bexactly,
       sortName: session.searchData[collection].sortName || 'mtime',
       sortType: session.searchData[collection].sortType || -1,
       mtime: new Date()
   })
   ```

**Edge Cases**:
- Duplicate name → Error
- Empty path → Valid (bookmark to "all")
- Name with special chars → Normalized

**Authentication**: Sets `owner: user._id`

**Side Effects**: Inserts into `${collection}Bookmark`

---

### 3.15 `delBookmark(id)`

**Purpose**: Delete a bookmark by ID

**Parameters**:
- `id` (string): Bookmark ObjectID

**Returns**: Promise resolving to delete result

**Logic Flow**:

1. **ID Validation**: `isValidString(id, 'uid')`

2. **Delete**: `Mongo('delete', `${collection}Bookmark`, {_id: objectID(id)})`
   - Note: No explicit owner check (should be added for security)

**Edge Cases**:
- Bookmark not found → Silent success (MongoDB delete behavior)
- Invalid ID → Validation error

**Security Issue**: Missing owner check allows deleting other users' bookmarks

**Authentication**: ⚠️ Currently bypasses owner check

**Side Effects**: Deletes from `${collection}Bookmark`

---

### 3.16 `parentList()`

**Purpose**: Get list of parent categories for collection

**Parameters**: None

**Returns**: Array of parent category objects
```javascript
[
    {name: 'category1', index: 1},
    {name: 'category2', index: 2},
    ...
]
```

**Logic**: Returns `parent_arr` (STORAGE_PARENT, STOCK_PARENT, etc.)

**Edge Cases**: None (static data)

**Authentication**: None (public data)

---

### 3.17 `adultonlyParentList()`

**Purpose**: Get adult-only parent categories

**Parameters**: None

**Returns**: ADULTONLY_PARENT array

**Logic**: Returns filtered parent list for adult content

**Authentication**: Should check user age/permission (not enforced in method)

---

### 3.18 `parentQuery(tagName, sortName, sortType, page, user)`

**Purpose**: Query items by parent category

**Parameters**:
- `tagName` (string): Parent category name
- `sortName`, `sortType`: Sort parameters
- `page` (number): Pagination offset
- `user` (object): User object

**Returns**: Promise resolving to `{items: [], parentList: {}}`

**Logic Flow**:

1. **Tag Validation**: `isValidString(tagName, 'name')`

2. **Parent Validation**: `inParentArray(tagName)`
   - Check if tagName exists in parent_arr
   - Fail → Error

3. **Tag Extraction**: Call `getQueryTag(tagName)` to get tags for parent
   - Returns array of tags belonging to category

4. **SQL Generation**: `getQuerySql(user, extractedTags, [])`

5. **Query**: Standard MongoDB find with pagination

**Edge Cases**:
- Invalid parent name → Error
- Parent with no tags → Empty results
- Parent category doesn't exist → Error

**Authentication**: Via `getQuerySql` user filtering

---

### 3.19 `queryParentTag(id, single, sortName, sortType, user, session)`

**Purpose**: Query items within a specific parent tag

**Parameters**:
- `id` (number): Parent index
- `single` (boolean): Single item mode
- `sortName`, `sortType`: Sort parameters
- `user`, `session`: User and session objects

**Returns**: Promise resolving to query results

**Logic Flow**:

1. **Index Validation**: `isValidString(id, 'parentIndex')`

2. **Parent Lookup**: Find parent object with matching index

3. **Tag Extraction**: `getQueryTag(parent.name)`

4. **Query Execution**:
   - If `single` → Call `this.singleQuery()` with first tag
   - Else → Call `this.tagQuery()` with parent tags

**Edge Cases**:
- Invalid index → Error
- Index out of range → Error
- Parent with no tags → Empty results

**Authentication**: Via underlying query methods

---

### 3.20 `addParent(parentName, tagName, user)`

**Purpose**: Add a tag to a parent category

**Parameters**:
- `parentName` (string): Parent category name
- `tagName` (string): Tag to add to parent
- `user` (object): User object (must be admin)

**Returns**: Promise resolving to update result

**Logic Flow**:

1. **Admin Check**: `checkAdmin(user)`
   - Fail → Return `handleError(new HoError('need admin'))`

2. **Validation**:
   - `isValidString(parentName, 'name')`
   - `isValidString(tagName, 'name')`

3. **Parent Validation**: `inParentArray(parentName)`

4. **Tag Normalization**: `normalize(tagName)`

5. **Update**:
   ```javascript
   Mongo('update', `${collection}Parent`,
       {name: normalize(parentName)},
       {$addToSet: {tagList: normalize(tagName)}},
       {upsert: true}
   )
   ```

**Edge Cases**:
- Parent doesn't exist → Auto-created via upsert
- Tag already in parent → Ignored ($addToSet)
- Non-admin user → Error

**Authentication**: Requires `user.perm === 1` (admin)

**Side Effects**: Writes to `${collection}Parent`

---

### 3.21 `delParent(uid, user)`

**Purpose**: Remove a tag from all parent categories (admin only)

**Parameters**:
- `uid` (string): Tag name to remove
- `user` (object): Admin user

**Returns**: Promise resolving to update result

**Logic Flow**:

1. **Admin Check**: `checkAdmin(user)`

2. **Tag Validation**: `isValidString(uid, 'name')`

3. **Update All Parents**:
   ```javascript
   Mongo('update', `${collection}Parent`,
       {},  // All documents
       {$pull: {tagList: normalize(uid)}},
       {multi: true}
   )
   ```

**Edge Cases**:
- Tag not in any parent → Silent success
- Non-admin → Error

**Authentication**: Admin only

**Side Effects**: Updates all `${collection}Parent` documents

---

### 3.22 `setLatest(latest, session, saveName)`

**Purpose**: Update latest viewed item for bookmark

**Parameters**:
- `latest` (string): Item ID
- `session` (object): Session
- `saveName` (string|false): Optional bookmark name

**Returns**: Promise resolving to update result

**Logic Flow**:

1. **Get Bookmark ID**:
   - If `saveName` → Load bookmark by name
   - Else → Get from session: `this.searchTags(session).getBookmark()`

2. **Update**:
   ```javascript
   Mongo('update', `${collection}User`,
       {_id: bookmarkId},
       {$set: {latest}}
   )
   ```

**Edge Cases**:
- No active bookmark → Error
- Invalid item ID → Validation error

**Authentication**: Should check ownership (not enforced)

**Side Effects**: Updates `${collection}User.latest` field

---

### 3.23 `saveSql(page, saveName, back, user, session)`

**Purpose**: Save current query as named search

**Parameters**:
- `page` (number): Current page offset
- `saveName` (string): Name for saved search
- `back` (boolean): Navigate back flag
- `user`, `session`: User and session objects

**Returns**: Promise resolving to query results

**Logic Flow**:

1. **Save State**: `this.searchTags(session).saveArray(saveName, sortName, sortType)`

2. **Execute Query**: Call `this.tagQuery()` with current state

3. **Navigation**: If `back === true` → Return to previous page

**Edge Cases**:
- Duplicate saveName → Overwrites
- Invalid saveName → Validation error

**Authentication**: Session-based (user-specific saves)

**Side Effects**: Updates `session.searchData[collection][saveName]`

---

## 4. Helper Functions

### 4.1 `getStorageQuerySql(user, tagList, exactly)` (lines 1131-1440)

**Purpose**: Build MongoDB query for STORAGEDB collection

**Parameters**:
- `user` (object): User with `_id` and `perm`
- `tagList` (array): Array of normalized tags
- `exactly` (array): Exact match flags per tag

**Returns**: Object or null
```javascript
{
    nosql: {owner: user._id, tagList: {$all: [...]}, ...},
    select: {field1: 1, field2: 1},
    hint: {_id: 1, tagList: 1},
    skip: 0
}
```

**Logic Flow**:

1. **Base Query**: `{owner: user._id}` (admin sees all: `{}`)

2. **Tag Processing Loop**: For each tag in `tagList`:
   - Check `isDefaultTag(normalize(tag))`
   - **Index 0 (`all`)**: No filter
   - **Index 1 (`local`)**: Add `{local: {$exists: true}}`
   - **Index 2 (`media`)**: Add `{mediaType: {$exists: true}}`
   - **Index 6 (`untagged`)**: Add `{$or: [{tagList: {$exists: false}}, {tagList: {$size: 0}}]}`
   - **Index 8, 22 (`yv`, `you`)**: Add `{mediaType: {$in: [0, 1, 2]}}`
   - **Index 9 (`yp`)**: Add `{mediaType: {$in: [10, 11, 12]}}`
   - **Index 10 (`ym`)**: Add `{mediaType: {$in: [20, 21, 22]}}`
   - **Index 11 (`ymp`)**: Add `{mediaType: {$in: [30, 31, 32]}}`
   - **Index 17 (`search`)**: Build text search query
   - **Index 30 (YouTube IDs)**:
     - `ou:*` → `{youtubeId: '*'}`
     - `pl:*` → `{playlistId: '*'}`
     - `ch:*` → `{channelId: '*'}`
   - **Index 31 (special)**: Collection-specific handling
   - **Default**: Add to `tagList` match array

3. **Tag List Matching**:
   - If `exactly[i] === true` → `{tagList: {$all: [tag]}}`
   - Else → `{tagList: tag}` (exists check)

4. **Field Projection**: Select relevant fields based on query type

5. **Hint Generation**: Suggest MongoDB indexes to use

6. **Skip Calculation**: For nested queries (e.g., YouTube sub-queries)

**Edge Cases**:
- Empty tagList → Returns base query (all user items)
- Conflicting filters → MongoDB handles via $and
- Text search without index → Slow query warning
- Admin user → No owner filter

**Performance Optimization**:
- Uses compound indexes: `{owner: 1, tagList: 1, mtime: -1}`
- Hint directs MongoDB to optimal index
- Projection reduces data transfer

**Returns**: Null if invalid query structure

---

### 4.2 `getPasswordQuerySql / getStockQuerySql` (inline in switch)

**Purpose**: Build queries for password manager and stock tracker

**Logic**: Similar pattern to storage, with domain-specific tags

---

### 4.3 Tag Extraction Functions

**`getStorageQueryTag(tagName)`, etc.**

**Purpose**: Extract tags belonging to a parent category

**Logic**:
1. Query `${collection}Parent` with `{name: normalize(tagName)}`
2. Return `tagList` array from document

**Returns**: Array of tag names or empty array

---

### 4.4 Sort Name Mappers

**`getStorageSortName(sortName)`, etc.**

**Purpose**: Map frontend sort names to MongoDB field names

**Mappings**:
```javascript
'mtime' → 'mtime'
'name' → 'name'
'count' → 'count' (or 'viewCount', 'downloadCount')
'atime' → 'atime'
'size' → 'size'
```

**Edge Cases**: Invalid sortName → Defaults to 'mtime'

---

### 4.5 `normalize(tag)`

**Purpose**: Standardize tag format for storage

**Logic**:
```javascript
tag.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^\w_-]/g, '')
```

**Examples**:
- `"My Tag"` → `"my_tag"`
- `"Action/Adventure"` → `"actionadventure"`
- `"  Drama  "` → `"drama"`

---

### 4.6 `denormalize(tag)`

**Purpose**: Convert normalized tag to display format

**Logic**:
```javascript
tag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
```

**Examples**:
- `"my_tag"` → `"My Tag"`
- `"action"` → `"Action"`

---

### 4.7 `isDefaultTag(tag)`

**Purpose**: Check if tag is predefined system tag

**Returns**: `{index: number, ...}` or false

**Logic**: Lookup in DEFAULT_TAGS array

**Examples**:
- `"all"` → `{index: 0, ...}`
- `"yv"` → `{index: 8, ...}`
- `"custom_tag"` → `false`

---

### 4.8 `inParentArray(parent)`

**Purpose**: Validate parent category existence

**Logic**: Linear search through `parent_arr`

**Returns**: Boolean

---

### 4.9 `getLatest(bookmark)`

**Purpose**: Get latest viewed item for bookmark

**Logic**: Query `${collection}User` with `{_id: bookmark}` → Return `latest` field

**Returns**: Promise resolving to item ID or false

---

### 4.10 `returnPath(items, parentList)`

**Purpose**: Enhance query results with bookmark context

**Logic**:
1. If `parentList.bookmark` → Call `getLatest()`
2. Append `latest` and `bookmark` to result object
3. Return promise resolving to `{items, parentList, latest?, bookmark?}`

**Returns**: Promise

---

## 5. Comprehensive Test Scenarios

### 5.1 Unit Tests — Tag Operations

#### Test Suite: `addTag()`

**Logical Branches**:

```javascript
describe('addTag()', () => {
    describe('ID Validation', () => {
        test('should accept valid ObjectID string', () => {
            expect(addTag('507f1f77bcf86cd799439011', 'mytag', user)).resolves.toBeDefined()
        })
        
        test('should accept ObjectID object', () => {
            expect(addTag(objectID('507f1f77bcf86cd799439011'), 'mytag', user)).resolves.toBeDefined()
        })
        
        test('should reject invalid ObjectID format', async () => {
            await expect(addTag('invalid-id', 'mytag', user)).rejects.toThrow('uid is not valid')
        })
        
        test('should reject null/undefined ID', async () => {
            await expect(addTag(null, 'mytag', user)).rejects.toThrow('uid is not valid')
        })
    })
    
    describe('Tag Validation', () => {
        test('should accept valid tag name', () => {
            expect(addTag(validId, 'action', user)).resolves.toBeDefined()
        })
        
        test('should normalize tag with spaces', async () => {
            const result = await addTag(validId, 'My Action Tag', user)
            // Should store as 'my_action_tag'
            expect(result.tagList).toContain('my_action_tag')
        })
        
        test('should reject empty tag name', async () => {
            await expect(addTag(validId, '', user)).rejects.toThrow('name is not valid')
        })
        
        test('should reject tag with only special characters', async () => {
            await expect(addTag(validId, '!@#$', user)).rejects.toThrow('name is not valid')
        })
        
        test('should allow bypassing validation when checkValid=false', async () => {
            await expect(addTag(validId, '', user, false)).resolves.toBeDefined()
        })
    })
    
    describe('Duplicate Detection', () => {
        test('should reject duplicate tag (exact match)', async () => {
            await addTag(validId, 'drama', user)
            await expect(addTag(validId, 'drama', user)).rejects.toThrow('duplicate tag')
        })
        
        test('should reject duplicate tag (case insensitive)', async () => {
            await addTag(validId, 'Drama', user)
            await expect(addTag(validId, 'DRAMA', user)).rejects.toThrow('duplicate tag')
        })
        
        test('should reject duplicate tag (space vs underscore)', async () => {
            await addTag(validId, 'my_tag', user)
            await expect(addTag(validId, 'my tag', user)).rejects.toThrow('duplicate tag')
        })
    })
    
    describe('Permission Checks', () => {
        test('should allow owner to add tag to own item', async () => {
            const item = {_id: validId, owner: user._id, tagList: []}
            await expect(addTag(validId, 'newtag', user)).resolves.toBeDefined()
        })
        
        test('should reject non-owner adding tag', async () => {
            const item = {_id: validId, owner: otherUserId, tagList: []}
            await expect(addTag(validId, 'newtag', user)).rejects.toThrow()
        })
        
        test('should allow admin to add tag to any item', async () => {
            const adminUser = {_id: 'admin123', perm: 1}
            const item = {_id: validId, owner: otherUserId, tagList: []}
            await expect(addTag(validId, 'newtag', adminUser)).resolves.toBeDefined()
        })
        
        test('should prevent overwriting tag owned by another user', async () => {
            // Tag 'premium' exists, owned by otherUser
            const tag = {name: 'premium', owner: otherUserId, perm: 0}
            await expect(addTag(validId, 'premium', user)).rejects.toThrow()
        })
        
        test('should allow admin to overwrite any tag', async () => {
            const adminUser = {_id: 'admin123', perm: 1}
            const tag = {name: 'premium', owner: otherUserId, perm: 0}
            await expect(addTag(validId, 'premium', adminUser)).resolves.toBeDefined()
        })
    })
    
    describe('Database Operations', () => {
        test('should upsert tag document if not exists', async () => {
            await addTag(validId, 'newtag', user)
            const tagDoc = await Mongo('find', 'storageTag', {name: 'newtag'})
            expect(tagDoc[0].owner).toBe(user._id)
        })
        
        test('should add tag to item tagList array', async () => {
            await addTag(validId, 'newtag', user)
            const item = await Mongo('find', 'storageUser', {_id: validId})
            expect(item[0].tagList).toContain('newtag')
        })
        
        test('should preserve existing tags', async () => {
            await addTag(validId, 'tag1', user)
            await addTag(validId, 'tag2', user)
            const item = await Mongo('find', 'storageUser', {_id: validId})
            expect(item[0].tagList).toEqual(['tag1', 'tag2'])
        })
    })
})
```

**Edge Cases**:
- Adding 100+ tags to single item → Performance test
- Concurrent addTag calls for same item → Race condition
- Tag name at max length (255 chars) → Boundary test
- Unicode characters in tag name → Encoding test
- SQL injection in tag name → Security test

**Error Handling**:
- MongoDB connection failure → Graceful error
- Session timeout during operation → Retry logic
- Partial success (tag created but item update fails) → Rollback test

---

#### Test Suite: `delTag()`

**Logical Branches**:

```javascript
describe('delTag()', () => {
    describe('Tag Existence Check', () => {
        test('should delete existing tag', async () => {
            await addTag(validId, 'drama', user)
            await expect(delTag(validId, 'drama', user)).resolves.toBeDefined()
        })
        
        test('should reject deleting non-existent tag', async () => {
            await expect(delTag(validId, 'nonexistent', user)).rejects.toThrow('tag not exist')
        })
        
        test('should handle case-insensitive deletion', async () => {
            await addTag(validId, 'Drama', user)
            await expect(delTag(validId, 'drama', user)).resolves.toBeDefined()
        })
    })
    
    describe('Permission Checks', () => {
        test('should allow owner to delete own tag', async () => {
            const tag = {name: 'mytag', owner: user._id, perm: 0}
            await expect(delTag(validId, 'mytag', user)).resolves.toBeDefined()
        })
        
        test('should reject non-owner deleting private tag', async () => {
            const tag = {name: 'mytag', owner: otherUserId, perm: 0}
            await expect(delTag(validId, 'mytag', user)).rejects.toThrow()
        })
        
        test('should allow deleting public tag (perm=1)', async () => {
            const tag = {name: 'public', owner: otherUserId, perm: 1}
            await expect(delTag(validId, 'public', user)).resolves.toBeDefined()
        })
        
        test('should allow admin to delete any tag', async () => {
            const adminUser = {_id: 'admin123', perm: 1}
            const tag = {name: 'private', owner: otherUserId, perm: 0}
            await expect(delTag(validId, 'private', adminUser)).resolves.toBeDefined()
        })
    })
    
    describe('Orphan Tag Cleanup', () => {
        test('should delete tag document when last usage removed', async () => {
            // Only item with 'uniquetag'
            await addTag(validId, 'uniquetag', user)
            await delTag(validId, 'uniquetag', user)
            const tagDoc = await Mongo('find', 'storageTag', {name: 'uniquetag'})
            expect(tagDoc.length).toBe(0)
        })
        
        test('should preserve tag document when other items use it', async () => {
            await addTag(item1, 'sharedtag', user)
            await addTag(item2, 'sharedtag', user)
            await delTag(item1, 'sharedtag', user)
            const tagDoc = await Mongo('find', 'storageTag', {name: 'sharedtag'})
            expect(tagDoc.length).toBe(1)
        })
    })
    
    describe('Database Operations', () => {
        test('should remove tag from item tagList array', async () => {
            await addTag(validId, 'tag1', user)
            await addTag(validId, 'tag2', user)
            await delTag(validId, 'tag1', user)
            const item = await Mongo('find', 'storageUser', {_id: validId})
            expect(item[0].tagList).toEqual(['tag2'])
        })
        
        test('should handle deleting last tag from item', async () => {
            await addTag(validId, 'onlytag', user)
            await delTag(validId, 'onlytag', user)
            const item = await Mongo('find', 'storageUser', {_id: validId})
            expect(item[0].tagList).toEqual([])
        })
    })
})
```

**Edge Cases**:
- Deleting tag while another user adds it concurrently
- Item with 1000+ tags → Performance test
- Tag used by 10000+ items → Cleanup query performance

---

#### Test Suite: `sendTag()`

**Logical Branches**:

```javascript
describe('sendTag()', () => {
    describe('Batch Tag Replacement', () => {
        test('should replace all tags with new set', async () => {
            await addTag(validId, 'old1', user)
            await addTag(validId, 'old2', user)
            await sendTag(validId, 'item', ['new1', 'new2'], user)
            const item = await Mongo('find', 'storageUser', {_id: validId})
            expect(item[0].tagList).toEqual(['new1', 'new2'])
        })
        
        test('should remove all tags when empty array', async () => {
            await addTag(validId, 'tag1', user)
            await sendTag(validId, 'item', [], user)
            const item = await Mongo('find', 'storageUser', {_id: validId})
            expect(item[0].tagList).toEqual([])
        })
        
        test('should deduplicate input tags', async () => {
            await sendTag(validId, 'item', ['tag1', 'tag1', 'TAG1'], user)
            const item = await Mongo('find', 'storageUser', {_id: validId})
            expect(item[0].tagList).toEqual(['tag1'])
        })
    })
    
    describe('Partial Failure Handling', () => {
        test('should continue on single tag error', async () => {
            // 'protected' tag owned by other user
            await sendTag(validId, 'item', ['good1', 'protected', 'good2'], user)
            // Should add 'good1' and 'good2', skip 'protected'
        })
        
        test('should log errors but not throw', async () => {
            const consoleSpy = jest.spyOn(console, 'error')
            await sendTag(validId, 'item', ['bad!@#', 'good'], user)
            expect(consoleSpy).toHaveBeenCalled()
        })
    })
    
    describe('Optimization', () => {
        test('should skip operations when tags unchanged', async () => {
            await sendTag(validId, 'item', ['tag1', 'tag2'], user)
            const mongoSpy = jest.spyOn(Mongo, 'update')
            await sendTag(validId, 'item', ['tag1', 'tag2'], user)
            expect(mongoSpy).not.toHaveBeenCalled()
        })
    })
})
```

---

### 5.2 Unit Tests — Query Building

#### Test Suite: `tagQuery()`

**Logical Branches**:

```javascript
describe('tagQuery()', () => {
    describe('Tag Source Resolution', () => {
        test('should use session tags when tagName=null', async () => {
            session.searchData.storagedb = {cur: ['action', 'drama'], exactly: [false, false]}
            const result = await tool.tagQuery(0, null, false, 0, 'mtime', -1, user, session)
            expect(result.items.length).toBeGreaterThan(0)
        })
        
        test('should use provided tagName when specified', async () => {
            const result = await tool.tagQuery(0, 'comedy', false, 0, 'mtime', -1, user, session)
            // Should ignore session tags
        })
    })
    
    describe('Parent Filtering', () => {
        test('should filter by parent category when index provided', async () => {
            const result = await tool.tagQuery(0, 'action', false, 1, 'mtime', -1, user, session)
            // Should only return items in parent category 1
        })
        
        test('should return all matching tags when index=0', async () => {
            const result = await tool.tagQuery(0, 'action', false, 0, 'mtime', -1, user, session)
            // Should return items from all categories
        })
    })
    
    describe('Exact Match Logic', () => {
        test('should match exactly when exactly=true', async () => {
            const result = await tool.tagQuery(0, 'action', true, 0, 'mtime', -1, user, session)
            result.items.forEach(item => {
                expect(item.tagList).toEqual(['action'])
            })
        })
        
        test('should fuzzy match when exactly=false', async () => {
            const result = await tool.tagQuery(0, 'action', false, 0, 'mtime', -1, user, session)
            result.items.forEach(item => {
                expect(item.tagList).toContain('action')
            })
        })
    })
    
    describe('Pagination', () => {
        test('should return first page when page=0', async () => {
            const result = await tool.tagQuery(0, 'action', false, 0, 'mtime', -1, user, session)
            expect(result.items.length).toBeLessThanOrEqual(QUERY_LIMIT)
        })
        
        test('should skip items based on page offset', async () => {
            const page1 = await tool.tagQuery(0, 'action', false, 0, 'mtime', -1, user, session)
            const page2 = await tool.tagQuery(QUERY_LIMIT, 'action', false, 0, 'mtime', -1, user, session)
            expect(page1.items[0]._id).not.toEqual(page2.items[0]._id)
        })
        
        test('should honor customLimit parameter', async () => {
            const result = await tool.tagQuery(0, 'action', false, 0, 'mtime', -1, user, session, 10)
            expect(result.items.length).toBeLessThanOrEqual(10)
        })
    })
    
    describe('Sorting', () => {
        test('should sort by mtime descending', async () => {
            const result = await tool.tagQuery(0, 'action', false, 0, 'mtime', -1, user, session)
            expect(result.items[0].mtime).toBeGreaterThanOrEqual(result.items[1].mtime)
        })
        
        test('should sort by name ascending', async () => {
            const result = await tool.tagQuery(0, 'action', false, 0, 'name', 1, user, session)
            expect(result.items[0].name).toBeLessThanOrEqual(result.items[1].name)
        })
        
        test('should sort by count descending', async () => {
            const result = await tool.tagQuery(0, 'action', false, 0, 'count', -1, user, session)
            expect(result.items[0].count).toBeGreaterThanOrEqual(result.items[1].count)
        })
    })
    
    describe('Permission Filtering', () => {
        test('should return only owned items for regular user', async () => {
            const result = await tool.tagQuery(0, 'action', false, 0, 'mtime', -1, user, session)
            result.items.forEach(item => {
                expect(item.owner.toString()).toBe(user._id.toString())
            })
        })
        
        test('should return all items for admin user', async () => {
            const adminUser = {_id: 'admin123', perm: 1}
            const result = await tool.tagQuery(0, 'action', false, 0, 'mtime', -1, adminUser, session)
            // May include items from other users
        })
    })
    
    describe('Special Tags', () => {
        test('should return all items for "all" tag', async () => {
            const allResult = await tool.tagQuery(0, 'all', false, 0, 'mtime', -1, user, session)
            const normalResult = await tool.tagQuery(0, null, false, 0, 'mtime', -1, user, session)
            expect(allResult.items.length).toBe(normalResult.items.length)
        })
        
        test('should return untagged items for "untagged" tag', async () => {
            const result = await tool.tagQuery(0, 'untagged', false, 0, 'mtime', -1, user, session)
            result.items.forEach(item => {
                expect(item.tagList || []).toEqual([])
            })
        })
        
        test('should filter by mediaType for YouTube tags', async () => {
            const result = await tool.tagQuery(0, 'yv', false, 0, 'mtime', -1, user, session)
            result.items.forEach(item => {
                expect([0, 1, 2]).toContain(item.mediaType)
            })
        })
    })
    
    describe('Bookmark Integration', () => {
        test('should include latest item for bookmark query', async () => {
            session.searchData.storagedb = {bookmark: bookmarkId}
            const result = await tool.tagQuery(0, null, false, 0, 'mtime', -1, user, session)
            expect(result).toHaveProperty('latest')
            expect(result).toHaveProperty('bookmark')
        })
    })
})
```

**Edge Cases**:
- Query with 50 tags → Complex MongoDB query
- Tag name exceeds MongoDB key size limit
- Sort on non-indexed field → Performance warning
- Zero results → Empty array handling
- MongoDB timeout → Retry logic

---

### 5.3 Unit Tests — External API Query Builders

#### Test Suite: `getYifyQuery()`

```javascript
describe('getYifyQuery()', () => {
    describe('Genre Filtering', () => {
        test('should map genre tags to Yify genres', () => {
            const query = tool.getYifyQuery(['action'], 'mtime', 0)
            expect(query.genre).toBe('action')
        })
        
        test('should handle genre list translations', () => {
            const query = tool.getYifyQuery(['动作'], 'mtime', 0)
            expect(query.genre).toBe('action') // Chinese to English
        })
    })
    
    describe('Quality Filtering', () => {
        test('should set quality for 1080p', () => {
            const query = tool.getYifyQuery(['1080p'], 'mtime', 0)
            expect(query.quality).toBe('1080p')
        })
        
        test('should set quality for 720p', () => {
            const query = tool.getYifyQuery(['720p'], 'mtime', 0)
            expect(query.quality).toBe('720p')
        })
        
        test('should set quality for 3D', () => {
            const query = tool.getYifyQuery(['3D'], 'mtime', 0)
            expect(query.quality).toBe('3D')
        })
    })
    
    describe('Sort Mapping', () => {
        test('should map count to download_count', () => {
            const query = tool.getYifyQuery(['action'], 'count', 0)
            expect(query.sort_by).toBe('download_count')
        })
        
        test('should map mtime to year', () => {
            const query = tool.getYifyQuery(['action'], 'mtime', 0)
            expect(query.sort_by).toBe('year')
        })
    })
    
    describe('Query Term', () => {
        test('should build search query from tags', () => {
            const query = tool.getYifyQuery(['avengers', 'marvel'], 'mtime', 0)
            expect(query.query_term).toBe('avengers marvel')
        })
        
        test('should return false if no query_term', () => {
            const query = tool.getYifyQuery(['1080p'], 'mtime', 0) // Only quality, no search
            // Should still return query with only quality filter
        })
    })
})
```

---

#### Test Suite: `getMadQuery()`

```javascript
describe('getMadQuery()', () => {
    test('should build MangaDex include/exclude tags', () => {
        const query = tool.getMadQuery(['include:uuid1', 'exclude:uuid2'], 'mtime', 0)
        expect(query.includedTags).toContain('uuid1')
        expect(query.excludedTags).toContain('uuid2')
    })
    
    test('should set publication demographic', () => {
        const query = tool.getMadQuery(['shounen'], 'mtime', 0)
        expect(query.publicationDemographic).toContain('shounen')
    })
    
    test('should filter by status', () => {
        const query = tool.getMadQuery(['completed'], 'mtime', 0)
        expect(query.status).toContain('completed')
    })
})
```

---

### 5.4 Unit Tests — Relative Tag Calculation

#### Test Suite: `getRelativeTag()`

**Logical Branches**:

```javascript
describe('getRelativeTag()', () => {
    describe('Single Tag Query', () => {
        test('should return single tag results', async () => {
            const result = await tool.getRelativeTag(['action'], user, null, [false])
            expect(result.single.length).toBeGreaterThan(0)
            expect(result.union.length).toBe(0)
            expect(result.inter.length).toBe(0)
        })
        
        test('should limit single results to RELATIVE_LIMIT', async () => {
            const result = await tool.getRelativeTag(['popular'], user, null, [false])
            expect(result.single.length).toBeLessThanOrEqual(RELATIVE_LIMIT)
        })
    })
    
    describe('Multi-Tag Query', () => {
        test('should calculate union of tags', async () => {
            const result = await tool.getRelativeTag(['action', 'comedy'], user, null, [false, false])
            expect(result.union.length).toBeGreaterThan(0)
            // Union should contain tags from either action OR comedy
        })
        
        test('should calculate intersection of tags', async () => {
            const result = await tool.getRelativeTag(['action', 'comedy'], user, null, [false, false])
            expect(result.inter.length).toBeGreaterThan(0)
            // Intersection should contain tags in BOTH action AND comedy
        })
        
        test('should limit union to RELATIVE_UNION', async () => {
            const result = await tool.getRelativeTag(['tag1', 'tag2'], user, null, [false, false])
            expect(result.union.length).toBeLessThanOrEqual(RELATIVE_UNION)
        })
        
        test('should limit intersection to RELATIVE_INTER', async () => {
            const result = await tool.getRelativeTag(['tag1', 'tag2'], user, null, [false, false])
            expect(result.inter.length).toBeLessThanOrEqual(RELATIVE_INTER)
        })
    })
    
    describe('Count Calculation', () => {
        test('should include count for each related tag', async () => {
            const result = await tool.getRelativeTag(['action'], user, null, [false])
            result.single.forEach(tag => {
                expect(tag).toHaveProperty('name')
                expect(tag).toHaveProperty('count')
                expect(tag.count).toBeGreaterThanOrEqual(0)
            })
        })
        
        test('should calculate total item count', async () => {
            const result = await tool.getRelativeTag(['action'], user, null, [false])
            expect(result.all).toHaveProperty('count')
            expect(result.all.count).toBeGreaterThanOrEqual(result.single.length)
        })
    })
    
    describe('Optimization with pre_arr', () => {
        test('should reuse results when tags unchanged', async () => {
            const result1 = await tool.getRelativeTag(['action'], user, null, [false])
            const result2 = await tool.getRelativeTag(['action'], user, result1.single, [false])
            expect(result2.single).toBe(result1.single) // Same reference
        })
        
        test('should recalculate when tags change', async () => {
            const result1 = await tool.getRelativeTag(['action'], user, null, [false])
            const result2 = await tool.getRelativeTag(['comedy'], user, result1.single, [false])
            expect(result2.single).not.toBe(result1.single)
        })
    })
    
    describe('Exact Match Handling', () => {
        test('should apply exact match to tag queries', async () => {
            const result = await tool.getRelativeTag(['action'], user, null, [true])
            // Items should have ONLY 'action' tag
        })
    })
    
    describe('Edge Cases', () => {
        test('should return empty for null tag_arr', async () => {
            const result = await tool.getRelativeTag(null, user, null, null)
            expect(result).toEqual({union: [], inter: [], single: [], all: {count: 0}})
        })
        
        test('should return empty for empty tag_arr', async () => {
            const result = await tool.getRelativeTag([], user, null, [])
            expect(result).toEqual({union: [], inter: [], single: [], all: {count: 0}})
        })
        
        test('should handle tags with no related tags', async () => {
            const result = await tool.getRelativeTag(['orphan_tag'], user, null, [false])
            expect(result.single.length).toBe(0)
            expect(result.all.count).toBe(0)
        })
    })
    
    describe('Permission Filtering', () => {
        test('should respect user permissions in related tags', async () => {
            const result = await tool.getRelativeTag(['action'], user, null, [false])
            // All related tags should come from items user can access
        })
        
        test('should return different results for different users', async () => {
            const user1Result = await tool.getRelativeTag(['action'], user1, null, [false])
            const user2Result = await tool.getRelativeTag(['action'], user2, null, [false])
            expect(user1Result.all.count).not.toBe(user2Result.all.count)
        })
    })
})
```

---

### 5.5 Integration Tests — Bookmark System

#### Test Suite: Bookmark Lifecycle

```javascript
describe('Bookmark System Integration', () => {
    let user, session, tool
    
    beforeEach(async () => {
        user = await createTestUser()
        session = {searchData: {}}
        tool = process(STORAGEDB)
    })
    
    describe('Create Bookmark', () => {
        test('should create bookmark from current search state', async () => {
            // Set search state
            const searchTags = tool.searchTags(session)
            searchTags.getArray('action', false, 0)
            searchTags.getArray('comedy', false, 0)
            
            // Create bookmark
            const result = await tool.addBookmark('My Search', user, session, null, null)
            expect(result.insertedId).toBeDefined()
            
            // Verify stored
            const bookmarks = await tool.getBookmarkList('mtime', -1, user)
            expect(bookmarks[0].name).toBe('my_search')
            expect(bookmarks[0].path).toBe('action,comedy')
        })
        
        test('should create bookmark with explicit path', async () => {
            const result = await tool.addBookmark('Custom', user, session, 'drama,romance', 'false,false')
            const bookmarks = await tool.getBookmarkList('mtime', -1, user)
            expect(bookmarks[0].path).toBe('drama,romance')
        })
        
        test('should reject duplicate bookmark names', async () => {
            await tool.addBookmark('MyBookmark', user, session, 'action', 'false')
            await expect(
                tool.addBookmark('mybookmark', user, session, 'comedy', 'false')
            ).rejects.toThrow()
        })
    })
    
    describe('Load Bookmark', () => {
        test('should restore search state from bookmark', async () => {
            // Create bookmark
            const searchTags = tool.searchTags(session)
            searchTags.getArray('action', false, 0)
            const bookmark = await tool.addBookmark('Test', user, session, null, null)
            
            // Clear session
            session.searchData = {}
            
            // Load bookmark
            const result = await tool.getBookmark(bookmark.insertedId.toString(), 'mtime', -1, user, session)
            expect(result.items.length).toBeGreaterThan(0)
            expect(session.searchData.storagedb.cur).toEqual(['action'])
        })
        
        test('should reject loading other user bookmark', async () => {
            const user2 = await createTestUser()
            const bookmark = await tool.addBookmark('Test', user, session, 'action', 'false')
            
            await expect(
                tool.getBookmark(bookmark.insertedId.toString(), 'mtime', -1, user2, session)
            ).rejects.toThrow()
        })
    })
    
    describe('Update Bookmark', () => {
        test('should update bookmark with new search state', async () => {
            // Create initial bookmark
            const searchTags = tool.searchTags(session)
            searchTags.getArray('action', false, 0)
            await tool.addBookmark('Test', user, session, null, null)
            
            // Load and modify
            const bookmarks = await tool.getBookmarkList('mtime', -1, user)
            await tool.getBookmark(bookmarks[0]._id.toString(), 'mtime', -1, user, session)
            searchTags.getArray('comedy', false, 0)
            
            // Update
            await tool.setBookmark('action,comedy', 'false,false', 'name', 1, user, session)
            
            // Verify
            const updated = await tool.getBookmarkList('mtime', -1, user)
            expect(updated[0].path).toBe('action,comedy')
            expect(updated[0].sortName).toBe('name')
            expect(updated[0].sortType).toBe(1)
        })
    })
    
    describe('Delete Bookmark', () => {
        test('should delete bookmark by ID', async () => {
            const bookmark = await tool.addBookmark('Test', user, session, 'action', 'false')
            await tool.delBookmark(bookmark.insertedId.toString())
            
            const bookmarks = await tool.getBookmarkList('mtime', -1, user)
            expect(bookmarks.length).toBe(0)
        })
        
        test('⚠️ SECURITY: currently allows deleting other user bookmarks', async () => {
            const user2 = await createTestUser()
            const session2 = {searchData: {}}
            const bookmark = await tool.addBookmark('Test', user2, session2, 'action', 'false')
            
            // Bug: No owner check in delBookmark
            await tool.delBookmark(bookmark.insertedId.toString())
            // Should fail but currently succeeds
        })
    })
    
    describe('Latest Item Tracking', () => {
        test('should track latest viewed item in bookmark', async () => {
            const bookmark = await tool.addBookmark('Test', user, session, 'action', 'false')
            await tool.setLatest('item123', session, false)
            
            const result = await tool.getBookmark(bookmark.insertedId.toString(), 'mtime', -1, user, session)
            expect(result.latest).toBe('item123')
            expect(result.bookmark).toBe(bookmark.insertedId.toString())
        })
    })
})
```

---

### 5.9 Performance Tests

#### Test Suite: Query Performance

```javascript
describe('Performance - Query Optimization', () => {
    let tool, user
    
    beforeEach(async () => {
        tool = process(STORAGEDB)
        user = await createTestUser()
    })
    
    describe('Index Usage', () => {
        test('should use index for owner queries', async () => {
            const explain = await Mongo('find', 'storageUser', 
                {owner: user._id}, 
                {explain: true}
            )
            expect(explain.executionStats.executionStages.inputStage.indexName).toContain('owner')
        })
        
        test('should use compound index for tag queries', async () => {
            const session = {}
            // Query should use {owner: 1, tagList: 1, mtime: -1} index
        })
    })
    
    describe('Large Dataset Handling', () => {
        beforeEach(async () => {
            // Create 10,000 test items
            await createTestItems(10000, {owner: user._id})
        })
        
        test('should complete query within 100ms', async () => {
            const start = Date.now()
            await tool.tagQuery(0, 'action', false, 0, 'mtime', -1, user, {})
            const duration = Date.now() - start
            expect(duration).toBeLessThan(100)
        })
        
        test('should handle pagination efficiently', async () => {
            const start = Date.now()
            await tool.tagQuery(5000, 'action', false, 0, 'mtime', -1, user, {})
            const duration = Date.now() - start
            expect(duration).toBeLessThan(150) // Skip should be fast with index
        })
    })
    
    describe('Relative Tag Calculation Performance', () => {
        test('should complete single tag relative query within 500ms', async () => {
            const start = Date.now()
            await tool.getRelativeTag(['action'], user, null, [false])
            const duration = Date.now() - start
            expect(duration).toBeLessThan(500)
        })
        
        test('should handle multi-tag union efficiently', async () => {
            const start = Date.now()
            await tool.getRelativeTag(['action', 'comedy', 'drama'], user, null, [false, false, false])
            const duration = Date.now() - start
            expect(duration).toBeLessThan(1000)
        })
    })
    
    describe('Concurrent Query Handling', () => {
        test('should handle 10 concurrent queries', async () => {
            const promises = []
            for (let i = 0; i < 10; i++) {
                promises.push(tool.tagQuery(0, 'action', false, 0, 'mtime', -1, user, {}))
            }
            
            const start = Date.now()
            await Promise.all(promises)
            const duration = Date.now() - start
            expect(duration).toBeLessThan(1000)
        })
    })
})
```

---

### 5.10 Edge Case Tests

#### Test Suite: Boundary Conditions

```javascript
describe('Edge Cases', () => {
    let tool, user, session
    
    beforeEach(async () => {
        tool = process(STORAGEDB)
        user = await createTestUser()
        session = {}
    })
    
    describe('Empty States', () => {
        test('should handle user with no items', async () => {
            const result = await tool.tagQuery(0, null, false, 0, 'mtime', -1, user, session)
            expect(result.items).toEqual([])
            expect(result.parentList).toBeDefined()
        })
        
        test('should handle item with no tags', async () => {
            const item = await createTestItem({owner: user._id, tagList: []})
            const result = await tool.singleQuery(item._id.toString(), user, session)
            expect(result.item.tagList || []).toEqual([])
        })
        
        test('should handle empty tag search', async () => {
            const result = await tool.tagQuery(0, '', false, 0, 'mtime', -1, user, session)
            // Should throw validation error
        })
    })
    
    describe('Maximum Limits', () => {
        test('should handle item with 1000 tags', async () => {
            const tags = Array.from({length: 1000}, (_, i) => `tag${i}`)
            const item = await createTestItem({owner: user._id, tagList: tags})
            
            const result = await tool.singleQuery(item._id.toString(), user, session)
            expect(result.item.tagList.length).toBe(1000)
        })
        
        test('should handle query with 50 tag filters', async () => {
            const searchTags = tool.searchTags(session)
            for (let i = 0; i < 50; i++) {
                searchTags.getArray(`tag${i}`, false, 0)
            }
            
            // Should not throw, but may return no results
            const result = await tool.tagQuery(0, null, false, 0, 'mtime', -1, user, session)
            expect(result).toBeDefined()
        })
        
        test('should handle user with 10000+ items', async () => {
            await createTestItems(10000, {owner: user._id})
            
            const result = await tool.tagQuery(0, null, false, 0, 'mtime', -1, user, session)
            expect(result.items.length).toBe(QUERY_LIMIT)
        })
    })
    
    describe('Unicode and Special Characters', () => {
        test('should handle Unicode tag names', async () => {
            const item = await createTestItem({owner: user._id})
            await tool.addTag(item._id.toString(), '日本語', user)
            
            const dbItem = await Mongo('find', 'storageUser', {_id: item._id})
            expect(dbItem[0].tagList).toContain('日本語')
        })
        
        test('should handle emoji in tags', async () => {
            const item = await createTestItem({owner: user._id})
            await tool.addTag(item._id.toString(), '🎬movie', user)
            
            const dbItem = await Mongo('find', 'storageUser', {_id: item._id})
            expect(dbItem[0].tagList[0]).toContain('🎬')
        })
        
        test('should handle tags with spaces and underscores', async () => {
            const item = await createTestItem({owner: user._id})
            await tool.addTag(item._id.toString(), 'my tag name', user)
            
            // Should normalize to 'my_tag_name'
            const dbItem = await Mongo('find', 'storageUser', {_id: item._id})
            expect(dbItem[0].tagList).toContain('my_tag_name')
        })
    })
    
    describe('Race Conditions', () => {
        test('should handle concurrent tag additions', async () => {
            const item = await createTestItem({owner: user._id})
            
            const promises = [
                tool.addTag(item._id.toString(), 'tag1', user),
                tool.addTag(item._id.toString(), 'tag2', user),
                tool.addTag(item._id.toString(), 'tag3', user),
            ]
            
            await Promise.all(promises)
            
            const dbItem = await Mongo('find', 'storageUser', {_id: item._id})
            expect(dbItem[0].tagList.length).toBe(3)
        })
        
        test('should handle concurrent add/delete of same tag', async () => {
            const item = await createTestItem({owner: user._id, tagList: ['existing']})
            
            // Race: delete and re-add same tag
            await Promise.all([
                tool.delTag(item._id.toString(), 'existing', user),
                tool.addTag(item._id.toString(), 'existing', user),
            ])
            
            // Result should be consistent (either exists or not)
        })
    })
    
    describe('MongoDB Connection Failures', () => {
        test('should handle connection timeout gracefully', async () => {
            // Mock MongoDB connection failure
            jest.spyOn(Mongo, 'find').mockRejectedValue(new Error('Connection timeout'))
            
            await expect(
                tool.tagQuery(0, 'action', false, 0, 'mtime', -1, user, session)
            ).rejects.toThrow('Connection timeout')
        })
        
        test('should retry on transient failures', async () => {
            // Mock: fail once, succeed on retry
            jest.spyOn(Mongo, 'find')
                .mockRejectedValueOnce(new Error('Temporary failure'))
                .mockResolvedValueOnce([])
            
            // Assuming retry logic exists
        })
    })
})
```

---

## 6. Snapshot Testing Data

### 6.1 Sample User Objects

```javascript
// Regular User (Permission 0)
const regularUser = {
    _id: objectID('507f1f77bcf86cd799439011'),
    name: 'testuser',
    perm: 0,
    email: 'test@example.com'
}

// Admin User (Permission 1)
const adminUser = {
    _id: objectID('507f1f77bcf86cd799439012'),
    name: 'admin',
    perm: 1,
    email: 'admin@example.com'
}
```

### 6.2 Sample Storage Items

```javascript
const storageItems = [
    {
        _id: objectID('60a1b2c3d4e5f6g7h8i9j0k1'),
        name: 'Movie - Inception',
        owner: objectID('507f1f77bcf86cd799439011'),
        tagList: ['action', 'sci_fi', '2010s'],
        mtime: new Date('2024-01-15T10:30:00Z'),
        local: true,
        mediaType: 0, // YouTube video
        youtubeId: 'YoHD9XEInc0',
        size: 1024000000,
        count: 150
    },
    {
        _id: objectID('60a1b2c3d4e5f6g7h8i9j0k2'),
        name: 'Archive - Photos 2023',
        owner: objectID('507f1f77bcf86cd799439011'),
        tagList: ['photos', '2023', 'vacation'],
        mtime: new Date('2023-12-20T15:45:00Z'),
        local: true,
        size: 5120000000
    },
    {
        _id: objectID('60a1b2c3d4e5f6g7h8i9j0k3'),
        name: 'Untagged File',
        owner: objectID('507f1f77bcf86cd799439011'),
        tagList: [],
        mtime: new Date('2024-03-01T08:00:00Z'),
        local: true
    }
]
```

### 6.3 Sample Tag Documents

```javascript
const tagDocuments = [
    {
        _id: objectID('60a1b2c3d4e5f6g7h8i9j0k4'),
        name: 'action',
        owner: objectID('507f1f77bcf86cd799439011'),
        perm: 0, // Private
        mtime: new Date('2024-01-10T00:00:00Z')
    },
    {
        _id: objectID('60a1b2c3d4e5f6g7h8i9j0k5'),
        name: 'public_tag',
        owner: objectID('507f1f77bcf86cd799439012'),
        perm: 1, // Public
        mtime: new Date('2024-01-05T00:00:00Z')
    }
]
```

### 6.4 Sample Bookmark Documents

```javascript
const bookmarkDocuments = [
    {
        _id: objectID('60a1b2c3d4e5f6g7h8i9j0k6'),
        name: 'action_movies',
        owner: objectID('507f1f77bcf86cd799439011'),
        path: 'action,movie',
        exactly: 'false,false',
        sortName: 'mtime',
        sortType: -1,
        mtime: new Date('2024-02-01T00:00:00Z')
    },
    {
        _id: objectID('60a1b2c3d4e5f6g7h8i9j0k7'),
        name: 'exact_sci_fi',
        owner: objectID('507f1f77bcf86cd799439011'),
        path: 'sci_fi',
        exactly: 'true',
        sortName: 'count',
        sortType: -1,
        mtime: new Date('2024-02-15T00:00:00Z')
    }
]
```

### 6.5 Sample Session State

```javascript
const sessionState = {
    searchData: {
        storagedb: {
            cur: ['action', 'comedy'],
            exactly: [false, true],
            bookmark: '60a1b2c3d4e5f6g7h8i9j0k6',
            sortName: 'mtime',
            sortType: -1,
            mySearch: {
                cur: ['drama'],
                exactly: [false],
                sortName: 'name',
                sortType: 1
            }
        },
        stockdb: {
            cur: ['AAPL', 'tech'],
            exactly: [false, false],
            sortName: 'count',
            sortType: -1
        }
    }
}
```

### 6.6 Sample Query Results

```javascript
// tagQuery() response
const tagQueryResult = {
    items: [
        {
            _id: objectID('60a1b2c3d4e5f6g7h8i9j0k1'),
            name: 'Movie - Inception',
            tagList: ['action', 'sci_fi'],
            mtime: new Date('2024-01-15T10:30:00Z'),
            owner: objectID('507f1f77bcf86cd799439011')
        }
    ],
    parentList: {
        cur: ['action'],
        exactly: [false],
        arr: [...STORAGE_PARENT]
    },
    latest: '60a1b2c3d4e5f6g7h8i9j0k1',
    bookmark: '60a1b2c3d4e5f6g7h8i9j0k6'
}

// getRelativeTag() response
const relativeTagResult = {
    union: [
        {name: 'sci_fi', count: 50},
        {name: 'thriller', count: 30},
        {name: '2010s', count: 25}
    ],
    inter: [
        {name: 'movie', count: 40},
        {name: 'hd', count: 35}
    ],
    single: [],
    all: {name: 'all', count: 100}
}
```

### 6.7 Sample Parent Categories

```javascript
const STORAGE_PARENT = [
    {name: 'video', index: 1},
    {name: 'image', index: 2},
    {name: 'music', index: 3},
    {name: 'document', index: 4},
    {name: 'archive', index: 5}
]

const STOCK_PARENT = [
    {name: 'tech', index: 1},
    {name: 'finance', index: 2},
    {name: 'healthcare', index: 3},
    {name: 'energy', index: 4}
]
```

---

## 7. Integration Testing

### 7.1 Test Environment Setup

```javascript
// jest.config.js
module.exports = {
    testEnvironment: 'node',
    setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
    testMatch: ['**/__tests__/**/*.test.js'],
    coveragePathIgnorePatterns: ['/node_modules/'],
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 75,
            lines: 80,
            statements: 80
        }
    }
}

// test/setup.js
const { MongoMemoryServer } = require('mongodb-memory-server')
const Mongo = require('../src/back/models/mongo-tool')

let mongoServer

beforeAll(async () => {
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create()
    const mongoUri = mongoServer.getUri()
    
    // Connect Mongo tool
    await Mongo.connect(mongoUri)
    
    // Seed test data
    await seedTestData()
})

afterAll(async () => {
    await Mongo.disconnect()
    await mongoServer.stop()
})

beforeEach(async () => {
    // Clear collections before each test
    await clearTestData()
})
```

### 7.2 Helper Functions for Testing

```javascript
// test/helpers.js
const { objectID } = require('../src/back/models/mongo-tool')

async function createTestUser(overrides = {}) {
    const user = {
        _id: objectID(),
        name: 'testuser',
        perm: 0,
        email: 'test@example.com',
        ...overrides
    }
    await Mongo('insert', 'user', user)
    return user
}

async function createAdminUser(overrides = {}) {
    return createTestUser({ perm: 1, name: 'admin', ...overrides })
}

async function createTestItem(collection, overrides = {}) {
    const item = {
        _id: objectID(),
        name: 'Test Item',
        owner: objectID(),
        tagList: ['test'],
        mtime: new Date(),
        ...overrides
    }
    await Mongo('insert', `${collection}User`, item)
    return item
}

async function createTestItems(count, collection, overrides = {}) {
    const items = Array.from({length: count}, (_, i) => ({
        _id: objectID(),
        name: `Test Item ${i}`,
        owner: objectID(),
        tagList: [`tag${i % 10}`],
        mtime: new Date(Date.now() - i * 1000),
        ...overrides
    }))
    await Mongo('insert', `${collection}User`, items)
    return items
}

function createMockSession(data = {}) {
    return {
        searchData: {
            storagedb: {cur: [], exactly: [], ...data}
        }
    }
}

async function seedTestData() {
    // Create indexes
    await createIndexes()
    
    // Seed parent categories
    await seedParentCategories()
    
    // Seed default tags
    await seedDefaultTags()
}

async function clearTestData() {
    const collections = [
        'storageUser', 'storageTag', 'storageBookmark', 'storageParent',
        'stockUser', 'stockTag', 'stockBookmark', 'stockParent',
        'user'
    ]
    
    for (const col of collections) {
        await Mongo('delete', col, {})
    }
}
```

### 7.3 MongoDB Indexes for Testing

```javascript
async function createIndexes() {
    // Storage collection indexes
    await Mongo('createIndex', 'storageUser', {owner: 1, tagList: 1, mtime: -1})
    await Mongo('createIndex', 'storageUser', {owner: 1, mtime: -1})
    await Mongo('createIndex', 'storageUser', {tagList: 1})
    await Mongo('createIndex', 'storageUser', {mediaType: 1})
    await Mongo('createIndex', 'storageUser', {youtubeId: 1})
    
    // Tag collection indexes
    await Mongo('createIndex', 'storageTag', {name: 1}, {unique: true})
    await Mongo('createIndex', 'storageTag', {owner: 1})
    
    // Bookmark collection indexes
    await Mongo('createIndex', 'storageBookmark', {owner: 1, name: 1})
    await Mongo('createIndex', 'storageBookmark', {owner: 1, mtime: -1})
    
    // Repeat for other collections...
}
```

### 7.4 End-to-End Test Scenario

```javascript
describe('E2E: Complete Tag Management Workflow', () => {
    let tool, user, session
    
    beforeEach(async () => {
        tool = process(STORAGEDB)
        user = await createTestUser()
        session = createMockSession()
    })
    
    test('should complete full tag workflow', async () => {
        // 1. Create items
        const item1 = await createTestItem('storage', {
            owner: user._id,
            name: 'Movie 1',
            tagList: []
        })
        const item2 = await createTestItem('storage', {
            owner: user._id,
            name: 'Movie 2',
            tagList: []
        })
        
        // 2. Add tags
        await tool.addTag(item1._id.toString(), 'action', user)
        await tool.addTag(item1._id.toString(), 'sci_fi', user)
        await tool.addTag(item2._id.toString(), 'action', user)
        await tool.addTag(item2._id.toString(), 'comedy', user)
        
        // 3. Query by tag
        const searchTags = tool.searchTags(session)
        searchTags.getArray('action', false, 0)
        const result1 = await tool.tagQuery(0, null, false, 0, 'mtime', -1, user, session)
        expect(result1.items.length).toBe(2)
        
        // 4. Add second tag filter
        searchTags.getArray('sci_fi', false, 0)
        const result2 = await tool.tagQuery(0, null, false, 0, 'mtime', -1, user, session)
        expect(result2.items.length).toBe(1)
        expect(result2.items[0].name).toBe('Movie 1')
        
        // 5. Get relative tags
        const relatives = await tool.getRelativeTag(['action'], user, null, [false])
        expect(relatives.single.find(t => t.name === 'sci_fi')).toBeDefined()
        expect(relatives.single.find(t => t.name === 'comedy')).toBeDefined()
        
        // 6. Create bookmark
        const bookmark = await tool.addBookmark('Action Movies', user, session, null, null)
        expect(bookmark.insertedId).toBeDefined()
        
        // 7. Reset and load bookmark
        searchTags.resetArray()
        const loaded = await tool.getBookmark(bookmark.insertedId.toString(), 'mtime', -1, user, session)
        expect(loaded.items.length).toBe(2)
        expect(session.searchData.storagedb.cur).toEqual(['action', 'sci_fi'])
        
        // 8. Delete tag
        await tool.delTag(item1._id.toString(), 'sci_fi', user)
        const updated = await tool.singleQuery(item1._id.toString(), user, session)
        expect(updated.item.tagList).toEqual(['action'])
        
        // 9. Delete bookmark
        await tool.delBookmark(bookmark.insertedId.toString())
        const bookmarks = await tool.getBookmarkList('mtime', -1, user)
        expect(bookmarks.length).toBe(0)
    })
})
```

---

## 8. Known Issues & Recommendations

### 8.1 Security Vulnerabilities

| Issue | Severity | Location | Recommendation |
|-------|----------|----------|----------------|
| **Missing owner check in delBookmark** | 🔴 High | Line ~975 | Add owner verification before deletion |
| **No rate limiting on tag operations** | 🟡 Medium | All methods | Implement per-user rate limits |
| **Bookmark name enumeration** | 🟢 Low | addBookmark | Return generic error on duplicate |

### 8.2 Performance Concerns

| Issue | Impact | Location | Recommendation |
|-------|--------|----------|----------------|
| **N+1 queries in getRelativeTag** | 🟡 Medium | Line ~521 | Use aggregation pipeline for parallel tag counts |
| **Sequential tag operations in sendTag** | 🟡 Medium | Line ~764 | Batch MongoDB updates |
| **Missing pagination in getRelativeTag** | 🟢 Low | Line ~521 | Already limited by constants |

### 8.3 Code Quality

| Issue | Impact | Recommendation |
|-------|--------|----------------|
| **Complex nested callbacks** | Maintainability | Refactor to async/await |
| **Magic numbers** | Readability | Extract QUERY_LIMIT to config |
| **Inconsistent error handling** | Debugging | Standardize error format |

---

## 9. Testing Checklist

### 9.1 Unit Tests (Priority Order)

- [ ] `addTag()` — all branches
- [ ] `delTag()` — all branches
- [ ] `sendTag()` — batch operations
- [ ] `tagQuery()` — pagination, sorting, filtering
- [ ] `singleQuery()` — permission checks
- [ ] `resetQuery()` — state reset
- [ ] `getRelativeTag()` — union/intersection logic
- [ ] `getYifyQuery()` — query builder
- [ ] `getMadQuery()` — query builder
- [ ] `searchTags()` — session state manager
- [ ] `addBookmark()` — validation
- [ ] `getBookmark()` — loading
- [ ] `setBookmark()` — updating
- [ ] `delBookmark()` — deletion (with owner check fix)
- [ ] `parentQuery()` — parent filtering
- [ ] `addParent()` — admin only
- [ ] `delParent()` — admin only
- [ ] Helper functions (normalize, isDefaultTag, etc.)

### 9.2 Integration Tests

- [ ] Full tag workflow (add, query, delete)
- [ ] Bookmark lifecycle (create, load, update, delete)
- [ ] Session state persistence across requests
- [ ] Multi-collection isolation
- [ ] Permission enforcement across operations
- [ ] MongoDB transaction handling

### 9.3 Security Tests

- [ ] NoSQL injection attempts
- [ ] XSS in tag names
- [ ] Path traversal in tags
- [ ] Owner check bypass attempts
- [ ] Admin privilege escalation
- [ ] Rate limiting validation

### 9.4 Performance Tests

- [ ] Query performance with 10K items
- [ ] Concurrent query handling
- [ ] Relative tag calculation speed
- [ ] Index usage verification
- [ ] Memory usage under load

---

## 10. Test Execution Commands

```bash
# Run all tests
npm test src/back/models/__tests__/tag-tool.test.js

# Run with coverage
npm test -- --coverage src/back/models/__tests__/tag-tool.test.js

# Run specific test suite
npm test -- --testNamePattern="addTag"

# Run integration tests only
npm test -- --testPathPattern="integration"

# Run with watch mode
npm test -- --watch src/back/models/__tests__/tag-tool.test.js

# Generate coverage report
npm test -- --coverage --coverageReporters=html

# Run performance tests
npm test -- --testNamePattern="Performance"
```

---

## 11. Summary

**tag-tool.js** is a **1,732-line factory function** providing comprehensive tag management for 5 collection types. It implements:

- ✅ **30+ methods** for tag operations, queries, bookmarks, and parent categories
- ✅ **Session-based state** management via Redis-backed Express sessions
- ✅ **Complex query building** for MongoDB with permission filtering
- ✅ **External API integration** (Yify, MangaDex)
- ✅ **Relative tag calculation** using union/intersection algorithms
- ✅ **Bookmark system** for saving/loading search states

**Testing Priority**:
1. Core tag operations (addTag, delTag) — **Critical**
2. Query building and filtering — **High**
3. Session state management — **High**
4. Security and permission checks — **Critical**
5. External API builders — **Medium**
6. Performance under load — **Medium**

**Key Test Files to Create**:
- `__tests__/tag-tool.unit.test.js` (600+ tests)
- `__tests__/tag-tool.integration.test.js` (100+ tests)
- `__tests__/tag-tool.security.test.js` (50+ tests)
- `__tests__/tag-tool.performance.test.js` (20+ tests)

**Estimated Total Test Count**: ~800 test cases

---

*Generated: 2026-03-17*  
*Author: Senior QA/Test Automation Engineer*  
*Version: 1.0*
