# mediaHandle-tool.js — Testing Strategy & Technical Documentation

> **Module**: `src/back/models/mediaHandle-tool.js` (789 lines)
> **Role**: Media processing, thumbnail generation, Google Drive integration, archive extraction, file integrity
> **Priority**: 🔴 Critical — Core file-server pipeline; failures cause data loss or stuck media states
> **Author**: Senior QA/Test Automation Engineer
> **Follows**: ANoMoPi QA Testing Blueprint (OUTLINE.md §11)

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Dependency Map](#2-dependency-map)
3. [Function Documentation & Test Strategy](#3-function-documentation--test-strategy)
   - 3.1 [editFile](#31-editfile)
   - 3.2 [handleTag](#32-handletag)
   - 3.3 [handleMediaUpload](#33-handlemediaupload)
   - 3.4 [handleMedia](#34-handlemedia)
   - 3.5 [singleDrive](#35-singledrive)
   - 3.6 [checkMedia](#36-checkmedia)
   - 3.7 [completeMedia](#37-completemedia)
   - 3.8 [errorMedia](#38-errormedia)
   - 3.9 [handleMediaError](#39-handlemediaerror)
   - 3.10 [getHd (private)](#310-gethd-private)
   - 3.11 [getTimeTag (private)](#311-gettimetag-private)
   - 3.12 [errDrive (private)](#312-errdrive-private)
4. [Cross-Cutting Test Concerns](#4-cross-cutting-test-concerns)
5. [Mock & Stub Strategy](#5-mock--stub-strategy)
6. [Snapshot Testing Data](#6-snapshot-testing-data)
7. [Test Execution Order](#7-test-execution-order)

---

## 1. Module Overview

`mediaHandle-tool.js` is the central media processing pipeline for the ANoMoPi file server. It orchestrates:

- **File renaming** with tag recalculation (`editFile`)
- **Media type detection & metadata extraction** via ffmpeg (`handleTag`)
- **Upload to Google Drive** with format-specific handling for video, image, document, presentation, ZIP, PDF, and zipbook types (`handleMediaUpload`)
- **Post-upload processing**: thumbnail download, video transcoding, document conversion (`handleMedia`)
- **Google Drive import**: ingesting files from shared Drive folders (`singleDrive`)
- **Timeout recovery**: detecting and retrying stalled media processing (`checkMedia`)
- **Completion & error lifecycle**: updating DB status, broadcasting WebSocket notifications (`completeMedia`, `errorMedia`, `handleMediaError`)

### Export Surface

| Export | Type | Access |
|--------|------|--------|
| `default.editFile` | Instance method | Public |
| `default.handleTag` | Instance method | Public |
| `default.handleMediaUpload` | Instance method | Public |
| `default.handleMedia` | Instance method | Public |
| `default.singleDrive` | Instance method | Public |
| `default.checkMedia` | Instance method | Public |
| `completeMedia` | Named export (function) | Public |
| `errorMedia` | Named export (function) | Public |
| `handleMediaError` | Named export (higher-order function) | Public |
| `getHd` | Module-scoped const | Private |
| `getTimeTag` | Module-scoped const | Private |
| `errDrive` | Module-scoped const | Private |

---

## 2. Dependency Map

| Dependency | Usage | Mock Required |
|------------|-------|---------------|
| `Mongo` (mongo-tool.js) | All DB reads/writes to `STORAGEDB` | ✅ Yes |
| `objectID` (mongo-tool.js) | Generate new MongoDB ObjectIDs | ✅ Yes |
| `GoogleApi` (api-tool-google.js) | Upload, download, delete, move, get, download media/doc/present | ✅ Yes |
| `isApiing` (api-tool-google.js) | Guard against concurrent API calls | ✅ Yes |
| `TagTool` / `StorageTagTool` (tag-tool.js) | `addTag`, `getRelativeTag` | ✅ Yes |
| `normalize`, `isDefaultTag` (tag-tool.js) | Tag normalization and default-tag detection | ✅ Yes |
| `Ffmpeg` (ffmpeg) | Video/audio metadata extraction | ✅ Yes |
| `Child_process.exec` | Shell commands: `qpdf`, `7za`, `myuzip.py`, `cat` | ✅ Yes |
| `Mkdirp` | Directory creation | ✅ Yes |
| `fs` module | `existsSync`, `readdirSync`, `lstatSync`, `renameSync`, `statSync` | ✅ Yes |
| `sendWs` (sendWs.js) | WebSocket broadcast notifications | ✅ Yes |
| Utility functions (`utility.js`) | `isValidString`, `handleError`, `HoError`, `checkAdmin`, `getFileLocation`, `deleteFolderRecursive`, `sortList`, `toValidName` | ✅ Yes (partial) |
| MIME utilities (`mime.js`) | `extTag`, `extType`, `isZip`, `isImage`, `changeExt`, `addPost` | ✅ Yes (partial) |
| Constants | `STORAGEDB`, `STATIC_PATH`, `NOISE_SIZE`, `__dirname` | ✅ Yes |

---

## 3. Function Documentation & Test Strategy

---

### 3.1 `editFile`

#### Purpose

Rename an existing file in the storage DB, recalculate tags based on the new name, detect media type changes, trigger media re-upload if needed, and return the updated tag set for the UI.

#### Function Signature

```js
editFile(uid, newName, user) → Promise<Object>
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uid` | `string` | Yes | File ID (validated as UID) |
| `newName` | `string` | Yes | New filename (validated as name) |
| `user` | `Object` | Yes | Authenticated user (`{ _id, perm, username }`) |

#### Logic Flow

```
1. Validate `newName` via isValidString(newName, 'name')
   └─ INVALID → handleError('name is not vaild!!!')
2. Validate `uid` via isValidString(uid, 'uid')
   └─ INVALID → handleError('uid is not vaild!!!')
3. Mongo('find', STORAGEDB, {_id: id}, {limit: 1})
   └─ NOT FOUND (items.length === 0) → handleError('file not exist!!!')
4. Authorization check:
   └─ NOT admin(1) AND (no valid owner OR user._id ≠ owner)
      → handleError('file is not yours!!!')
5. Mongo('update') → set name
6. StorageTagTool.addTag(uid, name, user)
7. Merge new tag into items[0].tags (prepend if not present)
8. Merge new tag into user-specific tag array (if exists, prepend if not present)
9. Build filePath via getFileLocation(owner, _id)
10. Call this.handleTag(filePath, {...}, newName, oldName, status)
11. Filter mediaTag.def/opt to exclude already-existing tags
12. Build MongoDB $set + $addToSet update
13. Mongo('update', STORAGEDB, {_id}, tagsAdd, {upsert: true})
14. Build result_tag based on admin status:
    ├─ NOT admin(1): concat user-specific tags, extract others_tag
    └─ admin(1): concat all tags
15. StorageTagTool.getRelativeTag(result_tag, user, mediaTag.opt)
16. Limit relative tags to 5, push normalized non-default relative tags to opt
17. Admin(2) check: push '18+' to result_tag or opt based on adultonly
18. Push 'first item' to result_tag or opt based on first flag
19. Call this.handleMediaUpload(mediaType, filePath, _id, user)
20. Return { id, name, select, option, other, adultonly }
```

#### Returns & Side Effects

| Return Field | Type | Description |
|-------------|------|-------------|
| `id` | `ObjectID` | File document ID |
| `name` | `string` | Validated new name |
| `select` | `Array<string>` | Selected/active tags for UI |
| `option` | `Array<string>` | Optional/suggested tags for UI |
| `other` | `Array<string>` | Other users' tags (non-admin only; empty for admin) |
| `adultonly` | `number` | Adult-only flag from DB |

**Side Effects**:
- DB: Updates `name` field, adds tags to `tags` and user-specific arrays
- DB: Updates `mediaType`, `status`, `height`, `hd` via `handleTag`→`handleMediaUpload`
- Google Drive: May upload/re-upload media if type changed
- WebSocket: `completeMedia` may broadcast on success

#### Comprehensive Test Scenarios (100% Coverage)

**Input Validation**:
| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Invalid name (empty string) | `uid="abc123"`, `newName=""` | `handleError('name is not vaild!!!')` |
| 2 | Invalid name (special chars failing validation) | `newName="<script>"` | `handleError('name is not vaild!!!')` |
| 3 | Invalid uid (empty) | `uid=""`, `newName="test.mp4"` | `handleError('uid is not vaild!!!')` |
| 4 | Invalid uid (malformed) | `uid="not-a-uid"`, `newName="test.mp4"` | `handleError('uid is not vaild!!!')` |
| 5 | Valid name and uid | Both pass `isValidString` | Proceeds to DB lookup |

**Authorization Branches**:
| # | Scenario | Condition | Expected |
|---|----------|-----------|----------|
| 6 | File not found | `items.length === 0` | `handleError('file not exist!!!')` |
| 7 | Non-admin, no owner field | `perm=0`, `owner=undefined` | `handleError('file is not yours!!!')` |
| 8 | Non-admin, different owner | `perm=0`, `owner ≠ user._id` | `handleError('file is not yours!!!')` |
| 9 | Non-admin, is owner | `perm=0`, `owner === user._id` | Proceeds |
| 10 | Admin (perm=1) bypasses ownership | `perm=1`, any owner | Proceeds |

**Tag Processing Branches**:
| # | Scenario | Condition | Expected |
|---|----------|-----------|----------|
| 11 | New tag already in items[0].tags | `result.tag ∈ items[0].tags` | No splice into tags |
| 12 | New tag not in items[0].tags | `result.tag ∉ items[0].tags` | Tag prepended at index 0 |
| 13 | User-specific tag array exists, tag not present | `items[0][userId]` exists | Tag prepended |
| 14 | User-specific tag array exists, tag present | Tag already in array | No splice |
| 15 | User-specific tag array does not exist | `items[0][userId]` falsy | Skip user-tag splice |
| 16 | mediaTag.def has new tags (not in items[0].tags) | After filter: `def.length > 0` | `$addToSet` used in update |
| 17 | mediaTag.def all filtered out | After filter: `def.length === 0` | Only `$set` in update |

**Admin-Dependent Result Building**:
| # | Scenario | Condition | Expected |
|---|----------|-----------|----------|
| 18 | Non-admin result_tag construction | `!checkAdmin(1, user)` | `result_tag = def + user-specific`; `others_tag` populated |
| 19 | Admin result_tag construction | `checkAdmin(1, user)` | `result_tag = def + all tags`; `others_tag = []` |
| 20 | Admin(2) with adultonly=1 | `checkAdmin(2, user)` and `adultonly===1` | `'18+'` pushed to `result_tag` |
| 21 | Admin(2) with adultonly=0 | `checkAdmin(2, user)` and `adultonly!==1` | `'18+'` pushed to `mediaTag.opt` |
| 22 | Non-admin(2) | `!checkAdmin(2, user)` | `'18+'` not added anywhere |
| 23 | first=1 | `items[0].first === 1` | `'first item'` in result_tag |
| 24 | first≠1 | `items[0].first !== 1` | `'first item'` in opt |

**Relative Tags**:
| # | Scenario | Condition | Expected |
|---|----------|-----------|----------|
| 25 | Less than 5 relative tags | `relative.length < 5` | All iterated |
| 26 | 5 or more relative tags | `relative.length >= 5` | Only first 5 iterated |
| 27 | Relative tag is default tag | `isDefaultTag(normal)` returns truthy | Skipped |
| 28 | Relative tag already in result_tag | Duplicate check | Not added to opt |
| 29 | Relative tag already in opt | Duplicate check | Not added to opt |
| 30 | Relative tag is new | Not in result_tag or opt | Added to opt |

**Media Upload & Error**:
| # | Scenario | Expected |
|---|----------|----------|
| 31 | handleMediaUpload succeeds | Return full result object |
| 32 | handleMediaUpload throws | Caught by `.catch(err => handleError(err, errorMedia, ...))` |

---

### 3.2 `handleTag`

#### Purpose

Determine the media type, extract metadata tags, and augment DB data based on the file's name, current status, and available ffmpeg metadata. Acts as the decision engine for media classification.

#### Function Signature

```js
handleTag(filePath, DBdata, newName, oldName, status, ret_mediaType = true) → Promise<[mediaType|false, mediaTag, DBdata]>
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `filePath` | `string` | Yes | — | Absolute path to file |
| `DBdata` | `Object` | Yes | — | Mutable DB update payload |
| `newName` | `string` | Yes | — | New filename |
| `oldName` | `string` | Yes | — | Previous filename |
| `status` | `number` | Yes | — | Current file status code |
| `ret_mediaType` | `boolean` | No | `true` | Whether to write mediaType into DBdata |

#### Logic Flow

```
1. status === 7 → Return [false, extTag('url'), DBdata]
2. status === 8 → Return [false, {def:[], opt:[]}, DBdata]
3. status === 9:
   ├─ extType(newName).type === 'zipbook'
   │  → Return [mediaType, extTag('zipbook'), DBdata + {status:1, mediaType}]
   └─ else → Return [false, {def:[], opt:[]}, DBdata]
4. else (normal path):
   a. Compute mediaType = extType(newName), oldType = extType(oldName)
   b. Compute `first` flag:
      first = mediaType AND (status ∈ {0,1,5}) AND (!oldType OR ext mismatch OR type mismatch)
   c. Switch on mediaType.type:
      ├─ 'video'/'music':
      │  ├─ No height/time in DBdata AND file exists → Ffmpeg probe
      │  │  ├─ video.codec === 'h264' → DBdata.status = 3
      │  │  ├─ Set DBdata.height from resolution
      │  │  └─ Set DBdata.time from duration
      │  └─ handleRest(first):
      │     ├─ DBdata.height exists → compute hd (if first), set isVideo
      │     ├─ DBdata.time exists:
      │     │  ├─ music + first → status=4, mediaType=false
      │     │  ├─ video + isVideo:
      │     │  │  ├─ first → set time, status=1 (or keep 3), set mediaType in DBdata
      │     │  │  └─ concat getTimeTag to mediaTag.def
      │     │  └─ else → mediaType=false
      │     └─ !first → mediaType=false
      ├─ 'image'/'doc'/'rawdoc'/'sheet'/'present'/'zipbook'/'pdf':
      │  ├─ first → status=1, extTag, optionally set mediaType
      │  └─ !first → mediaType=false
      ├─ 'zip':
      │  ├─ first OR status===2 → status=1, extTag, optionally set mediaType
      │  └─ else → mediaType=false
      └─ default → handleError('unknown media type!!!')
```

#### Returns & Side Effects

Returns a 3-element array: `[mediaType|false, mediaTag, DBdata]`

| Element | Type | Description |
|---------|------|-------------|
| `mediaType` | `Object\|false` | Media type info if processing needed; `false` if no upload required |
| `mediaTag` | `{def: string[], opt: string[]}` | Default and optional tags for this media |
| `DBdata` | `Object` | Mutated input with additional fields (status, height, hd, time, mediaType) |

**Side Effects**: Mutates the `DBdata` object in-place. May invoke ffmpeg for video/audio probing.

#### Comprehensive Test Scenarios (100% Coverage)

**Status Short-Circuits**:
| # | Scenario | Input status | Expected |
|---|----------|-------------|----------|
| 1 | URL type (status=7) | `status=7` | `[false, extTag('url'), DBdata]` |
| 2 | Status 8 (unknown/special) | `status=8` | `[false, {def:[], opt:[]}, DBdata]` |
| 3 | Status 9 + zipbook extension | `status=9`, `newName="book.cbz"` | `[mediaType, extTag('zipbook'), DBdata]` with `status:1` |
| 4 | Status 9 + non-zipbook | `status=9`, `newName="file.txt"` | `[false, {def:[], opt:[]}, DBdata]` |

**`first` Flag Computation**:
| # | Scenario | Conditions | `first` |
|---|----------|------------|---------|
| 5 | mediaType is null/false | `extType` returns falsy | `false` |
| 6 | status=0, new type | `status=0`, different ext | `true` |
| 7 | status=1, same ext & type | `status=1`, same ext+type | `false` |
| 8 | status=5, no old type | `status=5`, `oldName=""` | `true` |
| 9 | status=2 (not in {0,1,5}) | `status=2` | `false` |
| 10 | status=3 (not in {0,1,5}) | `status=3` | `false` |

**Video/Music Branch**:
| # | Scenario | Conditions | Expected |
|---|----------|------------|----------|
| 11 | Video, no height/time, file exists | `type='video'`, no metadata | Ffmpeg called; metadata extracted |
| 12 | Video, h264 codec detected | `video.codec === 'h264'` | `DBdata.status = 3` |
| 13 | Video, non-h264 codec | Other codec | `status` not set to 3 |
| 14 | Video, metadata.duration exists | Duration present | `DBdata.time` set in ms |
| 15 | Video, no duration | Missing duration | `DBdata.time` not set |
| 16 | Video, height/time already set | Pre-populated | Ffmpeg NOT called; handleRest directly |
| 17 | Video, file does not exist | `FsExistsSync=false` | Ffmpeg NOT called; handleRest directly |
| 18 | Music, first=true | `type='music'`, first | `status=4`, `mediaType=false` |
| 19 | Video, isVideo, first, status≠3 | Normal video first | `status=1`, time/hd set |
| 20 | Video, isVideo, first, status=3 | h264 video | `status` stays 3 |
| 21 | Video, isVideo, not first | Re-edit | `mediaType=false`; time tags still computed |
| 22 | Non-video/music type with time | e.g., `type='image'` but time set | `mediaType=false` |
| 23 | Ffmpeg probe rejects | Invalid file | Promise rejection propagates |

**Document/Image/Zip Branch**:
| # | Scenario | Conditions | Expected |
|---|----------|------------|----------|
| 24 | Image, first=true | New image | `status=1`, tags from `extTag('image')` |
| 25 | Doc, first=true | New doc | `status=1`, tags from `extTag('doc')` |
| 26 | PDF, first=false | Re-edit PDF | `mediaType=false` |
| 27 | Zip, first=true | New zip | `status=1`, extTag('zip') |
| 28 | Zip, first=false, status=2 | status=2 special case | `status=1`, extTag('zip') |
| 29 | Zip, first=false, status≠2 | Normal re-edit | `mediaType=false` |
| 30 | Unknown media type | `extType` returns unknown type | `handleError('unknown media type!!!')` |

**ret_mediaType Flag**:
| # | Scenario | Expected |
|---|----------|----------|
| 31 | `ret_mediaType=true`, first video | `DBdata.mediaType` set |
| 32 | `ret_mediaType=false`, first video | `DBdata.mediaType` NOT set |

---

### 3.3 `handleMediaUpload`

#### Purpose

Orchestrate the upload of a processed media file to Google Drive, handling type-specific logic for PDFs (page splitting), zipbooks (archive extraction + image indexing), ZIPs (listing contents + tag extraction), videos (noise appending), and documents (Google conversion).

#### Function Signature

```js
handleMediaUpload(mediaType, filePath, fileID, user, add_noise = false) → Promise<void>
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `mediaType` | `Object\|false` | Yes | — | Media type info; `false` short-circuits |
| `filePath` | `string` | Yes | — | Base file path |
| `fileID` | `ObjectID` | Yes | — | MongoDB document ID |
| `user` | `Object` | Yes | — | Authenticated user |
| `add_noise` | `string\|false` | No | `false` | Google Drive file ID to delete after noise addition |

#### Logic Flow

```
1. mediaType is falsy → Promise.resolve() (no-op)
2. Compute uploadPath (realPath variant or direct)
3. Switch on mediaType.type:
   ├─ 'pdf':
   │  a. deleteFolderRecursive(pdfPath)
   │  b. Mkdirp(pdfPath)
   │  c. exec: qpdf --split-pages=1
   │  d. Count output files
   │  e. completeMedia(fileID, 10, fileIndex, count)
   │
   ├─ 'zipbook':
   │  a. deleteFolderRecursive(imgPath, tempPath)
   │  b. Mkdirp(tempPath)
   │  c. Detect archive type (zip/rar/7z) and processed state
   │  d. Detect password-protected copies (_zip_c, _7z_c)
   │  e. exec: 7za or myuzip.py
   │  f. recurFolder: recursive image extraction (max depth 4)
   │  g. Validate non-empty → sortList → rename images sequentially
   │  h. Clean temp; rename original archive
   │  i. GoogleApi('upload') first image as thumbnail
   │  j. Update DB: present count, mediaType.key
   │  k. Call handleMedia for post-processing
   │
   ├─ 'zip':
   │  a. Detect archive type and processed state
   │  b. exec: 7za l or myuzip.py (list mode)
   │  c. Parse output by zip_type:
   │     ├─ rar (type 2): regex parse with start/end delimiters
   │     ├─ 7z (type 3): column-based parse with delimiters
   │     └─ zip (type 1): line-based parse, skip header, filter directories
   │  d. Validate non-empty → sortList
   │  e. Extract content-type tags from each entry
   │  f. Merge new tags into DB
   │  g. Rename original if not processed
   │  h. Mkdirp real folder
   │  i. completeMedia(fileID, 9, fileIndex)
   │
   └─ default (video/image/doc/rawdoc/sheet/present):
      a. rawdoc → force ext='txt'
      b. addNoise():
         ├─ add_noise truthy + video → cat noise >> file, delete old Drive file
         ├─ video + size > NOISE_SIZE → cat noise >> file
         └─ else → no-op
      c. GoogleApi('upload') with optional {convert: true} for doc types
      d. rest callback: extract thumbnail/alternate link based on type
      e. Update DB with mediaType key
      f. Call handleMedia
```

#### Returns & Side Effects

- **Returns**: `Promise<void>` (or implicitly via `completeMedia`/`handleMedia`)
- **DB Changes**: `status`, `present` (page/image count), `mediaType.key`, `playList`, `tags`, user-tags
- **File System**: Creates `_pdf/`, `_img/` directories; splits PDFs; extracts archives; appends noise bytes; renames archives
- **Google Drive**: Uploads file; may delete old file (noise case)
- **WebSocket**: Via `completeMedia` → `sendWs` broadcast

#### Comprehensive Test Scenarios (100% Coverage)

**Short-Circuit**:
| # | Scenario | Expected |
|---|----------|----------|
| 1 | `mediaType` is `false` | Immediate `Promise.resolve()` |
| 2 | `mediaType` is `null`/`undefined` | Immediate `Promise.resolve()` |

**PDF Branch**:
| # | Scenario | Expected |
|---|----------|----------|
| 3 | PDF with realPath | filePath includes `/${fileIndex}`, comPath = `_complete` |
| 4 | PDF without realPath | filePath = direct, comPath = direct |
| 5 | qpdf succeeds, produces N pages | `completeMedia(fileID, 10, fileIndex, N)` |
| 6 | qpdf command fails | Promise rejection from `Child_process.exec` |
| 7 | Mkdirp fails | Promise rejection |
| 8 | PDF directory pre-exists | `deleteFolderRecursive` cleans it first |

**Zipbook Branch**:
| # | Scenario | Expected |
|---|----------|----------|
| 9 | RAR archive (ext='rar') | `7za x` command with `-p123` |
| 10 | CBR archive (ext='cbr') | Same as RAR (`7za x`) |
| 11 | 7z archive (ext='7z') | `7za x` command |
| 12 | ZIP archive (default) | `myuzip.py` command |
| 13 | Pre-processed (`.1.rar` exists) | `is_processed=true`, uses existing path |
| 14 | Pre-processed (`_zip` exists) | `is_processed=true` |
| 15 | Pre-processed (`_7z` exists) | `is_processed=true` |
| 16 | Password-protected copy (`_zip_c` exists) | `zipPath` overridden to `_zip_c` |
| 17 | Password-protected copy (`_7z_c` exists) | `zipPath` overridden to `_7z_c` |
| 18 | Recursion depth > 4 | Stops recursing at depth 4 |
| 19 | No images found in archive | `handleError('empty zip')` |
| 20 | Images found, sorted, renamed | Sequential rename `1, 2, 3...` |
| 21 | Not pre-processed, zip type 1 | Rename to `_zip` |
| 22 | Not pre-processed, zip type 2 | Rename to `.1.rar` |
| 23 | Not pre-processed, zip type 3 | Rename to `_7z` |
| 24 | Google upload thumbnail missing | `handleError('error type')` |
| 25 | Google upload succeeds, fileIndex is number | DB: `present.${fileIndex}` set |
| 26 | Google upload succeeds, fileIndex not number | DB: `present` set directly |
| 27 | handleMedia call after zipbook upload | Chained correctly |
| 28 | Extraction command fails | Promise rejection propagated |

**ZIP Branch**:
| # | Scenario | Expected |
|---|----------|----------|
| 29 | RAR listing parse | Regex: `/([\d]+)\%[\s]+...$/`; filter size ≠ '0' |
| 30 | 7z listing parse | Column-based parse; `substr(0,38)` for size, `substr(53)` for name |
| 31 | Standard ZIP listing | Line-based; skip index 0; filter trailing `/` |
| 32 | Empty playlist after parse | `handleError('empty zip')` |
| 33 | Null output from command | `tmplist` null → `handleError('is not zip')` |
| 34 | File not found in DB during zip processing | `handleError('cannot find zip')` |
| 35 | Tags extracted from playlist entries | New tags merged via Set into tags + user-tags |
| 36 | Tags already exist in DB | No duplicate insertion |
| 37 | Not pre-processed zip | `FsRenameSync` + `Mkdirp('real')` |
| 38 | Already processed zip | Skip rename, skip Mkdirp |
| 39 | Zip command failure | `.catch(err => handleError(err, 'Zip get list fail!!!'))` |

**Default Branch (video/image/doc/rawdoc/sheet/present)**:
| # | Scenario | Expected |
|---|----------|----------|
| 40 | rawdoc type | `mediaType.ext` forced to `'txt'` |
| 41 | Video with `add_noise` truthy | Noise appended + old Drive file deleted |
| 42 | Video without `add_noise`, size > NOISE_SIZE | Noise appended |
| 43 | Video without `add_noise`, size ≤ NOISE_SIZE | No noise |
| 44 | Non-video type | `addNoise` is no-op |
| 45 | Upload succeeds with exportLinks (doc/sheet) | thumbnail = exportLinks PDF link |
| 46 | Present type with alternateLink | `mediaType.alternate` set |
| 47 | Present type without alternateLink | `handleError('error type')` |
| 48 | Video with alternateLink | thumbnail = alternateLink |
| 49 | Image with thumbnailLink | thumbnail = thumbnailLink |
| 50 | No thumbnail/export/alternate link | `handleError('error type')` |
| 51 | Doc/rawdoc/sheet/present uploads | `{convert: true}` option passed |
| 52 | Video/image uploads | No `convert` option |
| 53 | realPath present | DB key = `mediaType.${fileIndex}.key` |
| 54 | No realPath | DB key = `mediaType.key` |
| 55 | Upload errhandle callback | Calls `handleError(err, errorMedia, fileID, fileIndex)` |

---

### 3.4 `handleMedia`

#### Purpose

Post-upload processing: download thumbnails, transcode video, convert documents to PDF, handle presentations. This is called after a successful Google Drive upload.

#### Function Signature

```js
handleMedia(mediaType, filePath, fileID, key, user) → Promise<void>
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `mediaType` | `Object` | Yes | Media type info with `type`, `thumbnail`, etc. |
| `filePath` | `string` | Yes | Base file path |
| `fileID` | `ObjectID` | Yes | MongoDB document ID |
| `key` | `string` | Yes | Google Drive file ID |
| `user` | `Object` | Yes | Authenticated user |

#### Logic Flow

```
1. type === 'image' OR 'zipbook':
   ├─ thumbnail exists → use directly
   └─ thumbnail missing → GoogleApi('get') → extract thumbnailLink
   → GoogleApi('download') thumbnail to {filePath}.jpg
   → GoogleApi('delete') the uploaded file
   → completeMedia(fileID, 2, fileIndex)

2. type === 'video':
   ├─ No 'time' AND no 'hd' property → handleError('video can not be decoded!!!')
   └─ GoogleApi('download media') to {filePath}_complete
      → Optional: StorageTagTool.addTag for HD height tag
      → completeMedia(fileID, 3, fileIndex)

3. type === 'doc' OR 'rawdoc' OR 'sheet':
   ├─ thumbnail (exportLinks PDF) exists → use directly
   └─ missing → GoogleApi('get') → extract exportLinks PDF
   → GoogleApi('download doc') to filePath
   → GoogleApi('delete') uploaded file
   → completeMedia(fileID, 5, fileIndex, pageCount)

4. type === 'present':
   ├─ thumbnail+alternate exist → use directly
   └─ missing → GoogleApi('get') → extract both
   → GoogleApi('download present') with alternate link
   → GoogleApi('delete') uploaded file
   → completeMedia(fileID, 6, fileIndex, pageCount)
```

#### Returns & Side Effects

- **Returns**: `Promise<void>` (via `completeMedia`)
- **DB Changes**: Status updated via `completeMedia`; HD tag added for video
- **File System**: Thumbnail saved as `.jpg`; video saved as `_complete`
- **Google Drive**: Original file deleted after thumbnail/doc download (except video)

#### Comprehensive Test Scenarios (100% Coverage)

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Image, thumbnail pre-set | Skip `GoogleApi('get')`; download thumbnail directly |
| 2 | Image, no thumbnail | `GoogleApi('get')` → extract `thumbnailLink` |
| 3 | Image, get returns no thumbnailLink | `handleError('error type')` |
| 4 | Image, download thumbnail succeeds | Delete from Drive → `completeMedia(fileID, 2, ...)` |
| 5 | Zipbook, same path as image | Identical flow to image |
| 6 | Video, missing both `time` and `hd` | `handleError('video can not be decoded!!!')` |
| 7 | Video, has `time` only | Proceeds to download media |
| 8 | Video, has `hd` only | Proceeds to download media |
| 9 | Video, download media with height returned | `StorageTagTool.addTag` called with height |
| 10 | Video, download media with no height | `setHd()` resolves immediately |
| 11 | Video, realPath present | Download to `${filePath}/${fileIndex}_complete` |
| 12 | Video, no realPath | Download to `${filePath}_complete` |
| 13 | Doc, thumbnail pre-set | Skip `GoogleApi('get')` |
| 14 | Doc, no thumbnail | `GoogleApi('get')` → check `exportLinks['application/pdf']` |
| 15 | Doc, no exportLinks | `handleError('error type')` |
| 16 | Doc, download doc succeeds | Delete → `completeMedia(fileID, 5, ..., pageCount)` |
| 17 | Present, both thumbnail+alternate pre-set | Skip `GoogleApi('get')` |
| 18 | Present, missing data | `GoogleApi('get')` → extract both links |
| 19 | Present, no exportLinks | `handleError('error type')` |
| 20 | Present, download succeeds | Delete → `completeMedia(fileID, 6, ..., pageCount)` |
| 21 | Any type, errhandle callback triggered | Calls `handleError(err, errorMedia, ...)` |
| 22 | Rawdoc type | Handled same as 'doc' |
| 23 | Sheet type | Handled same as 'doc' |

---

### 3.5 `singleDrive`

#### Purpose

Process a single file from a Google Drive folder import: download it, detect media type, create a new storage entry, trigger media processing, and advance to the next file in the batch.

#### Function Signature

```js
singleDrive(metadatalist, index, user, folderId, uploaded, handling, dirpath) → Promise<void>
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `metadatalist` | `Array<Object>` | Yes | List of Google Drive file metadata objects |
| `index` | `number` | Yes | Current index in the list |
| `user` | `Object` | Yes | Authenticated user |
| `folderId` | `string` | Yes | Source Google Drive folder ID |
| `uploaded` | `string` | Yes | Target "uploaded" folder ID |
| `handling` | `string` | Yes | Intermediate "handling" folder ID |
| `dirpath` | `Array<string>\|null` | Yes | Directory path tags to apply |

#### Logic Flow

```
1. Generate new ObjectID and filePath
2. mkFolder: create parent directory if needed
3. handleFile():
   a. Sanitize name via toValidName
   b. If name is default tag → addPost(name, '1')
   c. Check admin(2) → scan dirpath for adult tags
   d. Build initial DB data object
   e. Switch on mediaType.type:
      ├─ 'video':
      │  ├─ No videoMediaMetadata → handleError('not transcode yet')
      │  └─ Move to handling folder
      │     ├─ File exists locally → download media directly
      │     └─ File not local → download raw first, then download media
      │     → handleRest(data, name, 3, metadata.id, true)
      └─ default:
         └─ Move to handling folder
            ├─ File exists → handleRest(data, name) directly
            └─ File not local → download then handleRest
4. handleRest():
   a. Call handleTag(filePath, data, name, '', 0)
   b. Build tag Set from: name, username, dirpath, mediaTag.def
   c. Filter default tags; mark adultonly if found
   d. Mongo('insert') into STORAGEDB
   e. sendWs file notification
   f. If is_handled → handleDelete only
      else → handleMediaUpload then handleDelete
5. handleDelete():
   ├─ User is owner → GoogleApi('delete')
   └─ Not owner → GoogleApi('move parent') to uploaded folder
6. handleNext():
   └─ index++ → recursive call to singleDrive if more items
7. Error in handleFile → handleNext (continue batch despite failure)
```

#### Returns & Side Effects

- **Returns**: `Promise<void>`
- **DB Changes**: New document inserted into `STORAGEDB`
- **File System**: Creates file directory; downloads file from Drive
- **Google Drive**: Moves files between folders; may delete owned files
- **WebSocket**: `sendWs` broadcasts new file arrival
- **Recursion**: Calls itself for next item in `metadatalist`

#### Comprehensive Test Scenarios (100% Coverage)

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Single file, video, transcoded | Move → download → handleRest → handleDelete → done |
| 2 | Video without videoMediaMetadata | `handleError('not transcode yet')` |
| 3 | Video, file already exists locally | Skip raw download, go directly to media download |
| 4 | Video, file not local | Download raw → download media → handleRest |
| 5 | Non-video file, exists locally | Move → handleRest directly |
| 6 | Non-video file, not local | Move → download → handleRest |
| 7 | File name is a default tag | Name amended with `addPost(name, '1')` |
| 8 | Admin(2), dirpath contains adult tag | `adultonly = 1` |
| 9 | Non-admin(2) | `adultonly = 0` regardless of dirpath |
| 10 | User is owner of Drive file | `GoogleApi('delete')` called |
| 11 | User is not owner | `GoogleApi('move parent')` to uploaded folder |
| 12 | Multiple files, process sequentially | `handleNext` increments and recurses |
| 13 | Last file in list | `handleNext` does nothing |
| 14 | Error in handleFile | Error logged; `handleNext` still called |
| 15 | mkFolder for existing directory | `FsExistsSync` returns true → skip Mkdirp |
| 16 | mkFolder for new directory | `Mkdirp` called |
| 17 | handleMediaUpload fails | `.catch(err => handleError(err, errorMedia, ...))` |
| 18 | errDrive called on download failure | Moves file back from handling to source folder |
| 19 | dirpath is null | `setTag` does not iterate dirpath |
| 20 | Multiple dirpath entries | All added to tag Set |
| 21 | Tag is a default tag with index 0 | `adultonly = 1` in DB data |
| 22 | `is_handled=true` (video) | Skip `handleMediaUpload`, call `handleDelete` only |
| 23 | `is_handled=false` (non-video) | Call `handleMediaUpload` then `handleDelete` |

---

### 3.6 `checkMedia`

#### Purpose

Periodic background job that scans for media documents with pending `mediaType` entries. Identifies timed-out items and retries their processing. Guards against concurrent execution via `isApiing()`.

#### Function Signature

```js
checkMedia() → Promise<void>
```

No parameters.

#### Logic Flow

```
1. isApiing() returns true → Promise.resolve() (abort)
2. Mongo('find', STORAGEDB, {mediaType: {$exists: true}})
3. items.length === 0 → implicit resolve (no items)
4. For each item:
   ├─ item.mediaType.type exists (single mediaType):
   │  └─ timeout === true → push to timeoutItems
   └─ item.mediaType.type missing (multi-mediaType object):
      ├─ Iterate keys; push timed-out sub-entries
      └─ If completely empty → Mongo('update') $unset mediaType
5. timeoutItems.length === 0 → implicit resolve
6. Recursive processing (recur_check):
   For each timeout item:
   ├─ Has key + realPath + _complete exists:
   │  → Reset timeout → handleMedia
   ├─ Has key + no realPath:
   │  → Reset timeout → handleMedia
   ├─ No key + realPath + _complete exists:
   │  → Reset timeout → handleMediaUpload
   └─ No key + no realPath:
      → Reset timeout → handleMediaUpload
```

#### Returns & Side Effects

- **Returns**: `Promise<void>`
- **DB Changes**: Resets `mediaType.timeout` to `false`; may unset empty `mediaType`
- **Google Drive**: Triggers upload/processing via `handleMedia`/`handleMediaUpload`
- **Concurrency**: Skips entirely if another API operation is in progress

#### Comprehensive Test Scenarios (100% Coverage)

| # | Scenario | Expected |
|---|----------|----------|
| 1 | `isApiing()` returns true | Immediate resolve; no DB query |
| 2 | No items with mediaType | Empty result; no processing |
| 3 | Single mediaType, not timed out | Skipped (not added to timeoutItems) |
| 4 | Single mediaType, timed out | Added to timeoutItems; processed |
| 5 | Multi-mediaType, some timed out | Only timed-out sub-entries processed |
| 6 | Multi-mediaType, completely empty object | `$unset mediaType` called |
| 7 | Timeout item with key + realPath + _complete exists | `handleMedia` called |
| 8 | Timeout item with key + realPath + _complete missing | Skipped (undefined return) |
| 9 | Timeout item with key + no realPath | `handleMedia` called |
| 10 | Timeout item without key + realPath + _complete exists | `handleMediaUpload` called |
| 11 | Timeout item without key + no realPath | `handleMediaUpload` called |
| 12 | Multiple timeout items | Processed sequentially via `recur_check` |
| 13 | handleMedia/handleMediaUpload throws | Caught by `.catch(err => handleError(...))` |
| 14 | Synthetic user object for retry | `{ _id: item.owner, perm: 1 }` |
| 15 | DB update to reset timeout (single) | `$set: {'mediaType.timeout': false}` |
| 16 | DB update to reset timeout (indexed) | `$set: {[mediaType.${fileIndex}.timeout]: false}` |

---

### 3.7 `completeMedia`

#### Purpose

Mark a media processing operation as complete: update DB status, set page/image counts, manage mediaType lifecycle, and broadcast WebSocket notifications.

#### Function Signature

```js
export const completeMedia = (fileID, status, fileIndex, number = 0) → Promise<void>
```

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `fileID` | `ObjectID` | Yes | — | MongoDB document ID |
| `status` | `number` | Yes | — | Target status code (2, 3, 5, 6, 9, 10) |
| `fileIndex` | `number\|undefined` | Yes | — | Sub-file index (for multi-file archives) |
| `number` | `number` | No | `0` | Page/image count |

#### Logic Flow

```
1. Build $set:
   ├─ status: fileIndex is number → 9 (archive container), else → status param
   ├─ present: number > 1 → set count (indexed or direct)
   └─ mediaType.complete: status === 3 → set true (indexed or direct)
2. Build $unset (if status ≠ 3):
   └─ Remove mediaType (indexed or direct)
3. Mongo('update') with combined $set/$unset
4. Mongo('find') to retrieve updated document
5. items.length < 1 → handleError('cannot find file!!!')
6. sendWs: text notification "{name} complete!!!"
7. sendWs: file type notification with adultonly flag
```

#### Returns & Side Effects

- **Returns**: `Promise<void>`
- **DB Changes**: Updates `status`, optionally `present`, optionally `mediaType.complete`; may `$unset mediaType`
- **WebSocket**: Two broadcasts — text notification + file update notification

#### Comprehensive Test Scenarios (100% Coverage)

| # | Scenario | Expected |
|---|----------|----------|
| 1 | `fileIndex` is number | Status set to `9`; indexed `$set`/`$unset` paths |
| 2 | `fileIndex` is not number | Status set to `status` param; direct paths |
| 3 | `number > 1`, indexed | `present.${fileIndex} = number` |
| 4 | `number > 1`, not indexed | `present = number` |
| 5 | `number <= 1` | No `present` field set |
| 6 | `number = 0` (default) | No `present` field set |
| 7 | `status === 3` (video complete) | `mediaType.complete = true`; NO `$unset` |
| 8 | `status !== 3` | `$unset mediaType` applied |
| 9 | File not found after update | `handleError('cannot find file!!!')` |
| 10 | File found | Two `sendWs` calls: text + file |
| 11 | Status 2 (image/zipbook complete) | Standard flow |
| 12 | Status 5 (doc complete) | Standard flow |
| 13 | Status 6 (present complete) | Standard flow |
| 14 | Status 9 (zip complete) | Standard flow |
| 15 | Status 10 (PDF complete) | Standard flow |

---

### 3.8 `errorMedia`

#### Purpose

Handle media processing errors: distinguish between timeout errors (recoverable, mark for retry) and other errors (record error details). Always re-throws via `handleError`.

#### Function Signature

```js
export const errorMedia = (err, fileID, fileIndex) → Promise<never>
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `err` | `Error\|HoError` | Yes | The error object |
| `fileID` | `ObjectID` | Yes | File document ID |
| `fileIndex` | `number\|undefined` | Yes | Sub-file index |

#### Logic Flow

```
1. Check: err.name === 'HoError' AND err.message === 'timeout'
   ├─ YES (timeout):
   │  ├─ fileIndex is number → $set: mediaType.${fileIndex}.timeout=true, status=9
   │  └─ fileIndex not number → $set: mediaType.timeout=true
   │  → handleError(err)
   └─ NO (other error):
      ├─ fileIndex is number → $set: mediaType.${fileIndex}.err=err
      └─ fileIndex not number → $set: mediaType.err=err
      → handleError(err)
```

#### Returns & Side Effects

- **Returns**: Always results in `handleError(err)` (rejection/throw)
- **DB Changes**: Sets `timeout: true` or stores error object in `mediaType`

#### Comprehensive Test Scenarios (100% Coverage)

| # | Scenario | Expected |
|---|----------|----------|
| 1 | HoError with message 'timeout', indexed | `mediaType.${fileIndex}.timeout=true`, `status=9` |
| 2 | HoError with message 'timeout', not indexed | `mediaType.timeout=true` |
| 3 | HoError with other message | Error stored in `mediaType.err` |
| 4 | Non-HoError (e.g., TypeError) | Error stored in `mediaType.err` |
| 5 | Indexed fileIndex for non-timeout | `mediaType.${fileIndex}.err=err` |
| 6 | Non-indexed for non-timeout | `mediaType.err=err` |
| 7 | DB update itself fails | Unhandled rejection (no inner catch) |

---

### 3.9 `handleMediaError`

#### Purpose

Express middleware error handler factory. Returns a function that records the media error in DB and sends a 500 JSON response if headers haven't been sent yet.

#### Function Signature

```js
export const handleMediaError = (res, fileID, fileIndex) → (err) → void
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `res` | `Express.Response` | HTTP response object |
| `fileID` | `ObjectID` | File document ID |
| `fileIndex` | `number\|undefined` | Sub-file index |

Returns: `(err) → void`

#### Logic Flow

```
1. Call errorMedia(err, fileID, fileIndex).catch(() => {})
   (fire-and-forget; suppress DB write errors)
2. If !res.headersSent → res.status(500).json({ error: 'media processing failed' })
```

#### Comprehensive Test Scenarios (100% Coverage)

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Headers not sent | `res.status(500).json(...)` called |
| 2 | Headers already sent | No response written |
| 3 | errorMedia DB write fails | Swallowed by `.catch(() => {})` |
| 4 | errorMedia DB write succeeds | No effect on response |
| 5 | Returned function called with Error | Both errorMedia and response triggered |

---

### 3.10 `getHd` (private)

#### Purpose

Map a video height (in pixels) to the nearest standard HD tier.

#### Function Signature

```js
const getHd = (height) → number
```

#### Logic Flow

```
height >= 2160 → 2160
height >= 1440 → 1440
height >= 1080 → 1080
height >= 720  → 720
height >= 480  → 480
height >= 360  → 360
height >= 240  → 240
height < 240   → 0
```

#### Comprehensive Test Scenarios (100% Coverage)

| # | Input | Expected | Category |
|---|-------|----------|----------|
| 1 | `4320` (8K) | `2160` | Above max tier |
| 2 | `2160` (4K boundary) | `2160` | Exact boundary |
| 3 | `2159` | `1440` | Just below 4K |
| 4 | `1440` (boundary) | `1440` | Exact boundary |
| 5 | `1439` | `1080` | Just below |
| 6 | `1080` (boundary) | `1080` | Exact boundary |
| 7 | `1079` | `720` | Just below |
| 8 | `720` (boundary) | `720` | Exact boundary |
| 9 | `719` | `480` | Just below |
| 10 | `480` (boundary) | `480` | Exact boundary |
| 11 | `479` | `360` | Just below |
| 12 | `360` (boundary) | `360` | Exact boundary |
| 13 | `359` | `240` | Just below |
| 14 | `240` (boundary) | `240` | Exact boundary |
| 15 | `239` | `0` | Below minimum |
| 16 | `0` | `0` | Zero height |
| 17 | `-1` | `0` | Negative (edge) |

---

### 3.11 `getTimeTag` (private)

#### Purpose

Determine duration-based tags for a video by splicing from the optional tag array based on time thresholds.

#### Function Signature

```js
const getTimeTag = (time, opt) → string[]
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `time` | `number` | Duration in milliseconds |
| `opt` | `Array<string>` | Mutable optional tags array (6+ elements expected) |

#### Logic Flow

```
time < 20min  (1,200,000ms) → return []
time < 40min  (2,400,000ms) → return opt.splice(2, 2)  (elements at index 2,3)
time < 60min  (3,600,000ms) → return opt.splice(4, 2)  (elements at index 4,5)
time >= 60min               → return opt.splice(0, 2)  (elements at index 0,1)
```

**Important**: This function **mutates** the `opt` array via `splice`.

#### Comprehensive Test Scenarios (100% Coverage)

| # | Input time | Expected return | Mutation effect |
|---|-----------|----------------|-----------------|
| 1 | `0` | `[]` | `opt` unchanged |
| 2 | `1,199,999` (< 20min) | `[]` | `opt` unchanged |
| 3 | `1,200,000` (= 20min) | `opt.splice(2,2)` | Elements 2,3 removed from opt |
| 4 | `1,800,000` (30min) | `opt.splice(2,2)` | Elements 2,3 removed |
| 5 | `2,399,999` (< 40min) | `opt.splice(2,2)` | Elements 2,3 removed |
| 6 | `2,400,000` (= 40min) | `opt.splice(4,2)` | Elements 4,5 removed |
| 7 | `3,000,000` (50min) | `opt.splice(4,2)` | Elements 4,5 removed |
| 8 | `3,599,999` (< 60min) | `opt.splice(4,2)` | Elements 4,5 removed |
| 9 | `3,600,000` (= 60min) | `opt.splice(0,2)` | Elements 0,1 removed |
| 10 | `7,200,000` (120min) | `opt.splice(0,2)` | Elements 0,1 removed |
| 11 | `opt` has < 6 elements | Partial splice; no error | May return fewer elements |

---

### 3.12 `errDrive` (private)

#### Purpose

Error recovery for Google Drive import failures: move the file back from the "handling" folder to the original source folder, then propagate the error.

#### Function Signature

```js
const errDrive = (err, key, folderId) → Promise<never>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `err` | `Error` | The original error |
| `key` | `string` | Google Drive file ID |
| `folderId` | `string` | Original source folder ID |

#### Logic Flow

```
1. GoogleApi('move parent', { fileId: key, rmFolderId: handling, addFolderId: folderId })
2. .then(() => handleError(err))
```

**Note**: References module-scoped `handling` variable which is a parameter from `singleDrive`. This relies on closure scope from the calling context.

#### Comprehensive Test Scenarios (100% Coverage)

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Move succeeds | `handleError(err)` called with original error |
| 2 | Move itself fails | Unhandled rejection from `GoogleApi` |
| 3 | Valid key and folderId | File moved from handling to source |

---

## 4. Cross-Cutting Test Concerns

### 4.1 Promise Chain Integrity

Every function returns Promises. Test that:
- All `.then()` chains properly propagate values
- All `.catch()` handlers fire correctly
- No unhandled promise rejections occur
- Nested promise chains (e.g., `editFile` → `handleTag` → `handleMediaUpload` → `handleMedia`) resolve end-to-end

### 4.2 `this` Context Binding

The default export is a plain object with methods referencing `this`:
- `editFile` calls `this.handleTag` and `this.handleMediaUpload`
- `handleMediaUpload` calls `this.handleMedia`
- `singleDrive` calls `this.handleTag`, `this.handleMediaUpload`, and recursively `this.singleDrive`
- `checkMedia` calls `this.handleMedia` and `this.handleMediaUpload`

**Test**: Verify methods work when called as `obj.method()` and fail (or bind correctly) when destructured.

### 4.3 Mutation Safety

Several functions mutate input objects:
- `handleTag` mutates `DBdata` in-place
- `getTimeTag` mutates the `opt` array via `splice`
- `singleDrive.handleRest` mutates `data` with `Object.assign`

**Test**: Verify mutation side effects and ensure callers are not affected by unexpected mutations.

### 4.4 Concurrency Guards

- `checkMedia` uses `isApiing()` to prevent concurrent processing
- `singleDrive` processes files sequentially (no parallelism)

**Test**: Verify that concurrent calls to `checkMedia` are idempotent when `isApiing` is true.

### 4.5 File System State

Many branches depend on `FsExistsSync` for:
- Ffmpeg probe gating (handleTag)
- Archive detection (handleMediaUpload)
- _complete file existence (checkMedia)
- Local file existence (singleDrive)

**Test**: Mock `FsExistsSync` to exercise all true/false branches independently.

---

## 5. Mock & Stub Strategy

### 5.1 Required Mocks

```
jest.mock('../models/mongo-tool.js')        → Mongo, objectID
jest.mock('../models/api-tool-google.js')    → GoogleApi, isApiing
jest.mock('../models/tag-tool.js')           → TagTool (factory), normalize, isDefaultTag
jest.mock('ffmpeg')                          → Ffmpeg
jest.mock('child_process')                   → Child_process.exec
jest.mock('mkdirp')                          → Mkdirp
jest.mock('fs')                              → existsSync, readdirSync, lstatSync, renameSync, statSync
jest.mock('../util/sendWs.js')               → sendWs
jest.mock('../util/utility.js')              → partial mock (keep HoError, mock handleError etc.)
jest.mock('../util/mime.js')                 → partial mock as needed
jest.mock('../constants.js')                 → STORAGEDB, STATIC_PATH, NOISE_SIZE, __dirname
```

### 5.2 Mock Behavior Patterns

| Mock | Default Behavior | Override per Test |
|------|-----------------|-------------------|
| `Mongo('find', ...)` | Return `[{...mockItem}]` | Empty array for "not found" tests |
| `Mongo('update', ...)` | Return resolved `{}` | Reject for DB error tests |
| `Mongo('insert', ...)` | Return `[{_id: mockOID, ...}]` | Reject for insert error tests |
| `GoogleApi('upload', ...)` | Invoke `rest` callback with mock metadata | Invoke `errhandle` for error tests |
| `GoogleApi('download', ...)` | Invoke `rest` callback | Invoke `errhandle` for error tests |
| `GoogleApi('delete', ...)` | Return resolved | Reject for cleanup error tests |
| `isApiing()` | Return `false` | Return `true` for concurrency tests |
| `Ffmpeg(path)` | Resolve with mock metadata | Reject for probe failure tests |
| `FsExistsSync(path)` | Return `true` | Per-path configuration |
| `Child_process.exec` | Invoke callback with `(null, output)` | `(error, null)` for failure tests |

### 5.3 Fixture Data

Create shared fixtures for:
- `mockUser`: `{ _id: ObjectID('...'), perm: 1, username: 'testuser' }`
- `mockItem`: Full storage document with all expected fields
- `mockMediaType`: Per-type variants (video, image, doc, zip, etc.)
- `mockMetadata`: Google Drive metadata responses per file type

---

## 6. Snapshot Testing Data

### 6.1 editFile Return Structure

```json
{
  "id": "ObjectID('507f1f77bcf86cd799439011')",
  "name": "my-video.mp4",
  "select": ["video", "hd", "username-tag"],
  "option": ["1080p", "movie", "action", "related-tag-1"],
  "other": [],
  "adultonly": 0
}
```

### 6.2 handleTag Return Tuple

```json
[
  { "type": "video", "ext": "mp4", "hd": 1080, "time": 5400000, "key": null },
  { "def": ["video", "movie"], "opt": ["short-film", "tv-episode"] },
  { "utime": 1679000000, "untag": 1, "height": 1080, "time": 5400000, "status": 1, "mediaType": { "type": "video", "ext": "mp4", "hd": 1080, "time": 5400000 } }
]
```

### 6.3 completeMedia DB Update Object (status=3, indexed)

```json
{
  "$set": {
    "status": 9,
    "mediaType.0.complete": true
  }
}
```

### 6.4 completeMedia DB Update Object (status=5, non-indexed, with pages)

```json
{
  "$set": {
    "status": 5,
    "present": 42
  },
  "$unset": {
    "mediaType": ""
  }
}
```

### 6.5 errorMedia DB Update (timeout, indexed)

```json
{
  "$set": {
    "mediaType.2.timeout": true,
    "status": 9
  }
}
```

### 6.6 errorMedia DB Update (non-timeout, non-indexed)

```json
{
  "$set": {
    "mediaType.err": "<Error object>"
  }
}
```

### 6.7 singleDrive Initial DB Document

```json
{
  "_id": "ObjectID('...')",
  "name": "downloaded-file.pdf",
  "owner": "ObjectID('...')",
  "utime": 1679000000,
  "size": 1048576,
  "count": 0,
  "first": 1,
  "recycle": 0,
  "status": 0,
  "adultonly": 0,
  "untag": 0,
  "tags": ["downloaded-file", "testuser"],
  "userId": ["downloaded-file", "testuser"]
}
```

### 6.8 checkMedia Timeout Item Structure

```json
{
  "item": {
    "_id": "ObjectID('...')",
    "owner": "ObjectID('...')",
    "mediaType": {
      "type": "video",
      "ext": "mp4",
      "key": "gdrive-key-123",
      "timeout": true,
      "hd": 720,
      "time": 3600000
    }
  },
  "mediaType": {
    "type": "video",
    "ext": "mp4",
    "key": "gdrive-key-123",
    "timeout": true,
    "hd": 720,
    "time": 3600000
  }
}
```

---

## 7. Test Execution Order

Following OUTLINE.md §11.9 priority phases:

| Phase | Scope | Functions | Rationale |
|-------|-------|-----------|-----------|
| **Phase 1** | Private helpers (pure logic) | `getHd`, `getTimeTag` | Zero dependencies; deterministic I/O |
| **Phase 2** | Named exports (isolated) | `completeMedia`, `errorMedia`, `handleMediaError` | Single dependency (Mongo); clear contracts |
| **Phase 3** | Tag classification | `handleTag` | Core decision engine; moderate dependencies |
| **Phase 4** | Upload orchestration | `handleMediaUpload`, `handleMedia` | Heavy external deps; requires Phase 3 |
| **Phase 5** | File editing | `editFile` | Full pipeline; requires Phase 3 + 4 |
| **Phase 6** | Drive import | `singleDrive` | Requires Phase 3 + 4; complex flow |
| **Phase 7** | Background recovery | `checkMedia` | Requires Phase 4; concurrency testing |

### Estimated Test Count

| Function | Unit Tests | Integration Tests | Total |
|----------|-----------|-------------------|-------|
| `getHd` | 17 | — | 17 |
| `getTimeTag` | 11 | — | 11 |
| `completeMedia` | 15 | 2 | 17 |
| `errorMedia` | 7 | 1 | 8 |
| `handleMediaError` | 5 | — | 5 |
| `errDrive` | 3 | — | 3 |
| `handleTag` | 32 | 3 | 35 |
| `handleMediaUpload` | 55 | 5 | 60 |
| `handleMedia` | 23 | 3 | 26 |
| `editFile` | 32 | 5 | 37 |
| `singleDrive` | 23 | 3 | 26 |
| `checkMedia` | 16 | 2 | 18 |
| **Total** | **239** | **24** | **263** |

---

> **Note**: This document defines the testing strategy only. No test code is included. Implementation should follow the Jest + ESM configuration described in OUTLINE.md §10.1, using the mock strategy from §5 above, and the test file should be placed at `src/back/models/__tests__/mediaHandle-tool.test.js` per OUTLINE.md §11.8.
