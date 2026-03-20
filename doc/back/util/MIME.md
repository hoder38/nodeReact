# `src/back/util/mime.js` — Technical Documentation & Test Blueprint

> **Module**: MIME Type Detection & File Type Classification  
> **Path**: `src/back/util/mime.js`  
> **Lines**: ~279  
> **Phase**: 1 (per OUTLINE.md §11.9 — highest-risk pure logic, zero external deps)  
> **Test File**: `src/back/util/__tests__/mime.test.js`  
> **Framework**: Jest 27 · babel-jest · Node environment  

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Dependencies & Constants](#2-dependencies--constants)
3. [Exported Functions & Constants](#3-exported-functions--constants)
   - 3.1 [`getOptionTag()`](#31-getoptiontag)
   - 3.2 [`addPost(str, post)`](#32-addpoststr-post)
   - 3.3 [`extTag(type)`](#33-exttagtype)
   - 3.4 [`extType(name)`](#34-exttypename)
   - 3.5 [`isVideo(name)`](#35-isvideoname)
   - 3.6 [`isImage(name)`](#36-isimagename)
   - 3.7 [`isMusic(name)`](#37-ismusicname)
   - 3.8 [`isTorrent(name)`](#38-istorrentname)
   - 3.9 [`isZip(name)`](#39-iszipname)
   - 3.10 [`isZipbook(name)`](#310-iszipbookname)
   - 3.11 [`isDoc(name)`](#311-isdocname)
   - 3.12 [`isSub(name)`](#312-issubname)
   - 3.13 [`isKindle(name)`](#313-iskindlename)
   - 3.14 [`isCSV(name)`](#314-iscsvname)
   - 3.15 [`mediaMIME(name)`](#315-mediamimename)
   - 3.16 [`supplyTag(tags, retTags, otherTags)`](#316-supplytagtags-rettags-othertags)
   - 3.17 [`changeExt(str, ext)`](#317-changeextstr-ext)
   - 3.18 [`getExtname(name)`](#318-getextnamename)
4. [Snapshot Testing Data](#4-snapshot-testing-data)
5. [Comprehensive Test Scenarios](#5-comprehensive-test-scenarios)
6. [Mock Strategy](#6-mock-strategy)
7. [Coverage Targets](#7-coverage-targets)

---

## 1. Module Overview

`mime.js` is a **pure utility module** that centralises all file-type detection logic for ANoMoPi. It answers two core questions for every file the system encounters:

1. **What type of media is this?** — image, video, music, zip, document, etc.
2. **What MIME string should be served for this file?**

The module is imported by **12 consumers** spanning both controllers and models:

| Consumer | Functions Used |
|----------|---------------|
| `controllers/file-router.js` | `supplyTag`, `isVideo` |
| `controllers/file-other-router.js` | `isVideo`, `isImage`, `isMusic`, `addPost`, `supplyTag`, `isTorrent`, `extTag`, `extType`, `isDoc`, `isZipbook`, `isSub`, `isCSV` |
| `controllers/playlist-router.js` | `extType`, `isVideo`, `supplyTag`, `addPost` |
| `controllers/external-router.js` | `addPost`, `extType`, `extTag`, `supplyTag`, `isTorrent`, `isVideo`, `isDoc`, `isZipbook`, `isSub`, `isZip` |
| `controllers/bookmark-router.js` | `addPost` |
| `controllers/storage-router.js` | `getOptionTag`, `isImage`, `isMusic`, `isVideo`, `isDoc`, `isZipbook` |
| `models/mediaHandle-tool.js` | `extTag`, `extType`, `isZip`, `isImage`, `changeExt`, `addPost` |
| `models/tag-tool.js` | `getOptionTag` |
| `models/stock-tool.js` | `getExtname` |
| `models/api-tool-google.js` | `mediaMIME`, `isSub`, `isKindle` |
| `models/external-tool.js` | `addPost` |
| `models/api-tool-playlist.js` | `isVideo`, `isDoc`, `isZipbook`, `extType`, `extTag` |

---

## 2. Dependencies & Constants

All dependencies are internal constants from `../constants.js`:

| Constant | Type | Description |
|----------|------|-------------|
| `EXT_FILENAME` | `RegExp` — `/(?:\.([^.]+))?$/` | Captures the file extension (group 1) from a filename |
| `IMAGE_EXT` | `string[]` | `['jpg', 'gif', 'bmp', 'jpeg', 'png']` |
| `ZIP_EXT` | `string[]` | `['zip', 'rar', '7z', 'cbr', 'cbz', '001']` |
| `VIDEO_EXT` | `string[]` | `['webm', 'mp4', 'mts', 'm2ts', '3gp', 'mov', 'avi', 'mpg', 'wmv', 'flv', 'f4v', 'ogv', 'asf', 'mkv', 'm4v']` (15 formats) |
| `MUSIC_EXT` | `string[]` | `['mp3', 'wav', 'ogg', 'm4a']` |
| `DOC_EXT` | `object` | Sub-categories: `.doc`, `.present`, `.sheet`, `.pdf`, `.rawdoc` |
| `TORRENT_EXT` | `string[]` | `['torrent']` |
| `SUB_EXT` | `string[]` | `['srt', 'ass', 'ssa', 'vtt']` |
| `KINDLE_EXT` | `string[]` | `['azw', 'doc', 'docx', 'pdf', 'htm', 'html', 'txt', 'rtf', 'jpg', 'jpeg', 'gif', 'png', 'bmp', 'prc', 'mobi']` |
| `MIME_EXT` | `object` | Extension → MIME string mapping (30+ entries) |
| `MEDIA_TAG` | `object` | Type → `{ def: string[], opt: string[] }` for tag suggestions |
| `MEDIA_LIST_CH` | `string[]` | Chinese media type labels (24 items) |
| `GENRE_LIST_CH` | `string[]` | Chinese genre labels (22 items) |
| `GAME_LIST_CH` | `string[]` | Chinese game genre labels (10 items) |
| `MUSIC_LIST` | `string[]` | Music genre labels (21 items) |
| `ADULT_LIST` | `string[]` | Adult content tag labels |

### `DOC_EXT` Breakdown

```
DOC_EXT = {
    doc:     ['rtf', 'txt', 'doc', 'docx', 'odt', 'htm', 'html', 'conf'],
    present: ['ppt', 'pps', 'pptx', 'odp'],
    sheet:   ['xls', 'xlsx', 'xlsm', 'csv', 'ods'],
    pdf:     ['pdf'],
    rawdoc:  ['c', 'cc', 'cpp', 'cs', 'm', 'h', 'sh', 'csh', 'bash', 'tcsh',
              'java', 'js', 'mxml', 'pl', 'pm', 'py', 'sql', 'php', 'rb',
              'xhtml', 'xml', 'xsl', 'json', 'css', 'ini', 'patch', 'vim', 'eml'],
}
```

---

## 3. Exported Functions & Constants

---

### 3.1 `getOptionTag()`

#### Purpose
Returns a combined flat array of all tag option lists used to populate UI dropdowns for media tagging. Merges media, genre, game, music, and adult tag lists.

#### Invocation
```js
getOptionTag() → string[]
```

**Parameters**: None

#### Logic Flow
1. Spread `MEDIA_LIST_CH` (24 items)
2. Spread `GENRE_LIST_CH` (22 items)
3. Spread `GAME_LIST_CH` (10 items)
4. Spread `MUSIC_LIST` (21 items)
5. Spread `ADULT_LIST`
6. Return the concatenated array

#### Returns
- `string[]` — Combined tag list (order preserved: media → genre → game → music → adult)

#### Side Effects
None (pure function).

#### Test Scenarios

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | Call `getOptionTag()` | Returns an array |
| 2 | Result includes all `MEDIA_LIST_CH` items | Each item present in result |
| 3 | Result includes all `GENRE_LIST_CH` items | Each item present in result |
| 4 | Result includes all `GAME_LIST_CH` items | Each item present in result |
| 5 | Result includes all `MUSIC_LIST` items | Each item present in result |
| 6 | Result includes all `ADULT_LIST` items | Each item present in result |
| 7 | Verify concatenation order | `MEDIA_LIST_CH` items appear before `GENRE_LIST_CH` items, etc. |
| 8 | Result length equals sum of all source lists | `result.length === MEDIA_LIST_CH.length + GENRE_LIST_CH.length + GAME_LIST_CH.length + MUSIC_LIST.length + ADULT_LIST.length` |
| 9 | Snapshot stability | Snapshot matches frozen constant values |

---

### 3.2 `addPost(str, post)`

#### Purpose
Appends a postfix (e.g., a version or duplicate marker) to a filename, preserving the original extension. If no extension is found, appends the postfix directly.

#### Invocation
```js
addPost(str: string, post: string) → string
```

**Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| `str` | `string` | Original filename |
| `post` | `string` | Postfix to append (e.g., `'1'`, `'copy'`) |

#### Logic Flow
1. Match `str` against `EXT_FILENAME` regex
2. **If** match exists and capture group 1 (extension) is truthy:
   - Replace the extension portion with `(${post}).${extension_lowercase}`
   - Example: `"file.TXT"` + `"1"` → `"file(1).txt"`
3. **Else** (no extension found):
   - Append `(${post})` to the string
   - Example: `"README"` + `"copy"` → `"README(copy)"`

#### Returns
- `string` — Modified filename with postfix inserted

#### Side Effects
None (pure function).

#### Test Scenarios

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | File with extension | `addPost('movie.mp4', '1')` | `'movie(1).mp4'` |
| 2 | File with uppercase ext | `addPost('photo.JPG', '2')` | `'photo(2).jpg'` |
| 3 | File with no extension | `addPost('README', 'copy')` | `'README(copy)'` |
| 4 | File with multiple dots | `addPost('archive.tar.gz', '1')` | `'archive.tar(1).gz'` |
| 5 | File with mixed-case ext | `addPost('data.Csv', '3')` | `'data(3).csv'` |
| 6 | Numeric postfix | `addPost('song.mp3', '99')` | `'song(99).mp3'` |
| 7 | Postfix with special chars | `addPost('doc.pdf', 'v2.1')` | `'doc(v2.1).pdf'` |
| 8 | Empty string filename | `addPost('', 'x')` | `'(x)'` |
| 9 | Extension-only filename | `addPost('.gitignore', '1')` | Verify behavior with dot-leading names |
| 10 | Very long postfix | `addPost('f.txt', 'a'.repeat(100))` | Correctly embeds long postfix |

---

### 3.3 `extTag(type)`

#### Purpose
Returns a deep-cloned copy of the `MEDIA_TAG` entry for a given media type. The deep clone (`JSON.parse(JSON.stringify(...))`) prevents mutation of the shared constant.

#### Invocation
```js
extTag(type: string) → { def: string[], opt: string[] } | {}
```

**Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| `type` | `string` | Media type key (e.g., `'image'`, `'video'`, `'music'`, `'doc'`, `'pdf'`, `'present'`, `'sheet'`, `'rawdoc'`, `'url'`, `'zip'`, `'zipbook'`) |

#### Logic Flow
1. **Try**: `JSON.parse(JSON.stringify(MEDIA_TAG[type]))`
   - Deep-clones the tag object for the given type
2. **Catch**: If `MEDIA_TAG[type]` is `undefined`, `JSON.stringify(undefined)` produces `undefined`, `JSON.parse(undefined)` throws `SyntaxError`
   - Logs `MEDIA_TAG[type]` to console (will log `undefined`)
   - Returns `{}`

#### Returns
- `{ def: string[], opt: string[] }` — Deep-cloned tag metadata for valid types
- `{}` — Empty object for invalid/unknown types

#### Side Effects
- **Console output**: Logs `MEDIA_TAG[type]` (i.e., `undefined`) to `console.log` on error

#### Test Scenarios

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Valid type `'image'` | `extTag('image')` | `{ def: ['圖片', 'image'], opt: ['相片', 'photo', '漫畫', 'comic'] }` |
| 2 | Valid type `'video'` | `extTag('video')` | Object with `def` and `opt` arrays |
| 3 | Valid type `'music'` | `extTag('music')` | Object with `def` and `opt` arrays |
| 4 | Valid type `'doc'` | `extTag('doc')` | Object with `def` and `opt` arrays |
| 5 | Valid type `'pdf'` | `extTag('pdf')` | Object with `def` and `opt` arrays |
| 6 | Valid type `'present'` | `extTag('present')` | `{ def: ['簡報', 'presentation'], opt: [] }` |
| 7 | Valid type `'sheet'` | `extTag('sheet')` | `{ def: ['試算表', 'sheet'], opt: [] }` |
| 8 | Valid type `'rawdoc'` | `extTag('rawdoc')` | Object with `def` and `opt` arrays |
| 9 | Valid type `'url'` | `extTag('url')` | Object with `def` and `opt` arrays |
| 10 | Valid type `'zip'` | `extTag('zip')` | Object with `def` and `opt` arrays |
| 11 | Valid type `'zipbook'` | `extTag('zipbook')` | Object with `def` and `opt` arrays |
| 12 | Invalid type | `extTag('unknown')` | `{}` |
| 13 | `undefined` type | `extTag(undefined)` | `{}` |
| 14 | `null` type | `extTag(null)` | `{}` |
| 15 | Empty string | `extTag('')` | `{}` |
| 16 | Deep clone integrity | Mutate result; re-call should return original | Original `MEDIA_TAG` unchanged |
| 17 | Console.log called on error | `extTag('bad')` | `console.log` invoked with `undefined` |

---

### 3.4 `extType(name)`

#### Purpose
The **primary file classifier** — determines the media type and normalised extension for a given filename. This is the most complex function in the module with the deepest branching logic.

#### Invocation
```js
extType(name: string) → { type: string, ext: string } | false
```

**Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| `name` | `string` | Full filename (e.g., `'movie.mp4'`, `'archive.book.zip'`) |

#### Logic Flow (Decision Tree)

```
name
 ├── EXT_FILENAME match?
 │    ├── NO → return false
 │    └── YES → extName = group[1].toLowerCase()
 │         ├── IMAGE_EXT.includes(extName)?
 │         │    └── YES → { type: 'image', ext }
 │         ├── ZIP_EXT.includes(extName)?
 │         │    ├── name matches /\.book\.(zip|7z|rar)$/?
 │         │    │    └── YES → { type: 'zipbook', ext }
 │         │    ├── extName === 'cbr' || 'cbz'?
 │         │    │    └── YES → { type: 'zipbook', ext }
 │         │    └── ELSE (regular zip)
 │         │         ├── extName === '001'?
 │         │         │    ├── name matches /\.zip\.001$/?
 │         │         │    │    └── { type: 'zip', ext: 'zip' }
 │         │         │    ├── name matches /\.7z\.001$/?
 │         │         │    │    └── { type: 'zip', ext: '7z' }
 │         │         │    └── ELSE → return false
 │         │         └── ELSE → { type: 'zip', ext }
 │         ├── VIDEO_EXT.includes(extName)?
 │         │    └── YES → { type: 'video', ext }
 │         ├── MUSIC_EXT.includes(extName)?
 │         │    └── YES → { type: 'music', ext }
 │         ├── DOC_EXT.doc.includes(extName)?
 │         │    └── YES → { type: 'doc', ext }
 │         ├── DOC_EXT.present.includes(extName)?
 │         │    └── YES → { type: 'present', ext }
 │         ├── DOC_EXT.sheet.includes(extName)?
 │         │    └── YES → { type: 'sheet', ext }
 │         ├── DOC_EXT.pdf.includes(extName)?
 │         │    └── YES → { type: 'pdf', ext }
 │         ├── DOC_EXT.rawdoc.includes(extName)?
 │         │    └── YES → { type: 'rawdoc', ext }
 │         └── ELSE → return false
```

#### Returns
- `{ type: string, ext: string }` — Classified result with one of 11 possible type values: `'image'`, `'zipbook'`, `'zip'`, `'video'`, `'music'`, `'doc'`, `'present'`, `'sheet'`, `'pdf'`, `'rawdoc'`
- `false` — Unrecognised or missing extension

#### Side Effects
None (pure function).

#### Test Scenarios

| # | Branch | Scenario | Input | Expected |
|---|--------|----------|-------|----------|
| **No extension** | | | | |
| 1 | No match | No extension | `'README'` | `false` |
| 2 | No match | Empty string | `''` | `false` |
| **Image branch** | | | | |
| 3 | IMAGE | jpg | `'photo.jpg'` | `{ type: 'image', ext: 'jpg' }` |
| 4 | IMAGE | JPG (case) | `'photo.JPG'` | `{ type: 'image', ext: 'jpg' }` |
| 5 | IMAGE | gif | `'anim.gif'` | `{ type: 'image', ext: 'gif' }` |
| 6 | IMAGE | bmp | `'img.bmp'` | `{ type: 'image', ext: 'bmp' }` |
| 7 | IMAGE | jpeg | `'pic.jpeg'` | `{ type: 'image', ext: 'jpeg' }` |
| 8 | IMAGE | png | `'icon.png'` | `{ type: 'image', ext: 'png' }` |
| **ZIP — zipbook sub-branch** | | | | |
| 9 | ZIP→book | .book.zip | `'manga.book.zip'` | `{ type: 'zipbook', ext: 'zip' }` |
| 10 | ZIP→book | .book.7z | `'manga.book.7z'` | `{ type: 'zipbook', ext: '7z' }` |
| 11 | ZIP→book | .book.rar | `'manga.book.rar'` | `{ type: 'zipbook', ext: 'rar' }` |
| 12 | ZIP→cbr | cbr | `'comic.cbr'` | `{ type: 'zipbook', ext: 'cbr' }` |
| 13 | ZIP→cbz | cbz | `'comic.cbz'` | `{ type: 'zipbook', ext: 'cbz' }` |
| **ZIP — split archive (001) sub-branch** | | | | |
| 14 | ZIP→001→zip | .zip.001 | `'archive.zip.001'` | `{ type: 'zip', ext: 'zip' }` |
| 15 | ZIP→001→7z | .7z.001 | `'archive.7z.001'` | `{ type: 'zip', ext: '7z' }` |
| 16 | ZIP→001→other | .rar.001 | `'archive.rar.001'` | `false` |
| 17 | ZIP→001→other | bare .001 | `'data.001'` | `false` |
| **ZIP — regular** | | | | |
| 18 | ZIP→regular | zip | `'files.zip'` | `{ type: 'zip', ext: 'zip' }` |
| 19 | ZIP→regular | rar | `'files.rar'` | `{ type: 'zip', ext: 'rar' }` |
| 20 | ZIP→regular | 7z | `'files.7z'` | `{ type: 'zip', ext: '7z' }` |
| **Video branch** | | | | |
| 21 | VIDEO | mp4 | `'clip.mp4'` | `{ type: 'video', ext: 'mp4' }` |
| 22 | VIDEO | mkv | `'film.mkv'` | `{ type: 'video', ext: 'mkv' }` |
| 23 | VIDEO | webm | `'v.webm'` | `{ type: 'video', ext: 'webm' }` |
| 24 | VIDEO | All 15 formats | Each VIDEO_EXT member | `{ type: 'video', ext: <ext> }` |
| **Music branch** | | | | |
| 25 | MUSIC | mp3 | `'song.mp3'` | `{ type: 'music', ext: 'mp3' }` |
| 26 | MUSIC | wav | `'track.wav'` | `{ type: 'music', ext: 'wav' }` |
| 27 | MUSIC | ogg | `'clip.ogg'` | `{ type: 'music', ext: 'ogg' }` |
| 28 | MUSIC | m4a | `'audio.m4a'` | `{ type: 'music', ext: 'm4a' }` |
| **Doc sub-branches** | | | | |
| 29 | DOC.doc | txt | `'notes.txt'` | `{ type: 'doc', ext: 'txt' }` |
| 30 | DOC.doc | docx | `'report.docx'` | `{ type: 'doc', ext: 'docx' }` |
| 31 | DOC.doc | html | `'page.html'` | `{ type: 'doc', ext: 'html' }` |
| 32 | DOC.present | pptx | `'slides.pptx'` | `{ type: 'present', ext: 'pptx' }` |
| 33 | DOC.present | odp | `'deck.odp'` | `{ type: 'present', ext: 'odp' }` |
| 34 | DOC.sheet | xlsx | `'data.xlsx'` | `{ type: 'sheet', ext: 'xlsx' }` |
| 35 | DOC.sheet | csv | `'data.csv'` | `{ type: 'sheet', ext: 'csv' }` |
| 36 | DOC.pdf | pdf | `'manual.pdf'` | `{ type: 'pdf', ext: 'pdf' }` |
| 37 | DOC.rawdoc | js | `'app.js'` | `{ type: 'rawdoc', ext: 'js' }` |
| 38 | DOC.rawdoc | py | `'script.py'` | `{ type: 'rawdoc', ext: 'py' }` |
| 39 | DOC.rawdoc | json | `'config.json'` | `{ type: 'rawdoc', ext: 'json' }` |
| **Unrecognised extension** | | | | |
| 40 | Fallthrough | .exe | `'program.exe'` | `false` |
| 41 | Fallthrough | .xyz | `'data.xyz'` | `false` |
| **Edge cases** | | | | |
| 42 | Case insensitivity | .MP4 | `'MOVIE.MP4'` | `{ type: 'video', ext: 'mp4' }` |
| 43 | Multi-dot filename | .tar.gz | `'archive.tar.gz'` | Resolves on last extension `'gz'` → `false` |
| 44 | Dot-only filename | `.` | Regex match behavior | `false` |

---

### 3.5 `isVideo(name)`

#### Purpose
Boolean-style check: returns the normalised extension if the file is a video, otherwise `false`.

#### Invocation
```js
isVideo(name: string) → string | false
```

#### Logic Flow
1. Extract extension via `EXT_FILENAME`
2. If no extension → `false`
3. Lowercase the extension
4. Return `extName` if `VIDEO_EXT.includes(extName)`, else `false`

#### Returns
- `string` — Lowercase extension (e.g., `'mp4'`) if video
- `false` — Not a video or no extension

#### Test Scenarios

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Valid video (mp4) | `'movie.mp4'` | `'mp4'` |
| 2 | Valid video (mkv) | `'film.MKV'` | `'mkv'` |
| 3 | All 15 VIDEO_EXT members | Each format | Corresponding lowercase ext |
| 4 | Non-video file | `'photo.jpg'` | `false` |
| 5 | No extension | `'README'` | `false` |
| 6 | Empty string | `''` | `false` |
| 7 | Case insensitivity | `'clip.MP4'` | `'mp4'` |

---

### 3.6 `isImage(name)`

#### Purpose
Boolean-style check: returns the normalised extension if the file is an image, otherwise `false`.

#### Invocation
```js
isImage(name: string) → string | false
```

#### Logic Flow
Identical pattern to `isVideo` but checks against `IMAGE_EXT`.

#### Returns
- `string` — Lowercase extension (e.g., `'jpg'`) if image
- `false` — Not an image or no extension

#### Test Scenarios

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Valid image (jpg) | `'photo.jpg'` | `'jpg'` |
| 2 | Valid image (png) | `'icon.PNG'` | `'png'` |
| 3 | All 5 IMAGE_EXT members | `jpg, gif, bmp, jpeg, png` | Corresponding ext |
| 4 | Non-image file | `'movie.mp4'` | `false` |
| 5 | No extension | `'file'` | `false` |
| 6 | Empty string | `''` | `false` |

---

### 3.7 `isMusic(name)`

#### Purpose
Boolean-style check: returns the normalised extension if the file is an audio file, otherwise `false`.

#### Invocation
```js
isMusic(name: string) → string | false
```

#### Logic Flow
Identical pattern to `isVideo` but checks against `MUSIC_EXT`.

#### Returns
- `string` — Lowercase extension (e.g., `'mp3'`) if music
- `false` — Not a music file or no extension

#### Test Scenarios

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Valid music (mp3) | `'song.mp3'` | `'mp3'` |
| 2 | All 4 MUSIC_EXT members | `mp3, wav, ogg, m4a` | Corresponding ext |
| 3 | Non-music file | `'doc.pdf'` | `false` |
| 4 | No extension | `'track'` | `false` |
| 5 | Case insensitivity | `'audio.WAV'` | `'wav'` |

---

### 3.8 `isTorrent(name)`

#### Purpose
Boolean-style check: returns the normalised extension if the file is a `.torrent`, otherwise `false`.

#### Invocation
```js
isTorrent(name: string) → string | false
```

#### Logic Flow
Identical pattern to `isVideo` but checks against `TORRENT_EXT` (`['torrent']`).

#### Returns
- `string` — `'torrent'` if match
- `false` — Not a torrent file or no extension

#### Test Scenarios

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Valid torrent | `'file.torrent'` | `'torrent'` |
| 2 | Uppercase | `'file.TORRENT'` | `'torrent'` |
| 3 | Non-torrent | `'file.zip'` | `false` |
| 4 | No extension | `'torrentfile'` | `false` |

---

### 3.9 `isZip(name)`

#### Purpose
Determines if a file is a zip archive and returns the effective archive extension. Handles split archives (`.001` suffix) specially.

#### Invocation
```js
isZip(name: string) → string | false
```

#### Logic Flow
```
name
 ├── Extract extension
 │    ├── No extension → false
 │    └── extName = lowercase ext
 │         ├── ZIP_EXT.includes(extName)?
 │         │    ├── extName === '001'?
 │         │    │    ├── name matches /zip\.001$/ → 'zip'
 │         │    │    ├── name matches /7z\.001$/ → '7z'
 │         │    │    └── else → false
 │         │    └── else → extName
 │         └── else → false
```

#### Returns
- `string` — Effective archive extension (`'zip'`, `'rar'`, `'7z'`, `'cbr'`, `'cbz'`)
- `false` — Not a zip or unresolvable split archive

#### Test Scenarios

| # | Branch | Scenario | Input | Expected |
|---|--------|----------|-------|----------|
| 1 | Regular | zip | `'a.zip'` | `'zip'` |
| 2 | Regular | rar | `'a.rar'` | `'rar'` |
| 3 | Regular | 7z | `'a.7z'` | `'7z'` |
| 4 | Regular | cbr | `'a.cbr'` | `'cbr'` |
| 5 | Regular | cbz | `'a.cbz'` | `'cbz'` |
| 6 | 001→zip | .zip.001 | `'a.zip.001'` | `'zip'` |
| 7 | 001→7z | .7z.001 | `'a.7z.001'` | `'7z'` |
| 8 | 001→false | .rar.001 | `'a.rar.001'` | `false` |
| 9 | 001→false | bare .001 | `'data.001'` | `false` |
| 10 | Not zip | .mp4 | `'video.mp4'` | `false` |
| 11 | No ext | no extension | `'archive'` | `false` |
| 12 | Case | .ZIP | `'a.ZIP'` | `'zip'` |

---

### 3.10 `isZipbook(name)`

#### Purpose
Determines if a file is a "zip book" — a comic book archive (`.cbr`, `.cbz`) or a zip/7z/rar with the `.book.` naming convention.

#### Invocation
```js
isZipbook(name: string) → string | false
```

#### Logic Flow
1. Extract extension; if none → `false`
2. If `ZIP_EXT.includes(extName)`:
   - If `name` matches `/\.book\.(zip|7z|rar)$/` **OR** `extName === 'cbr'` **OR** `extName === 'cbz'` → return `extName`
   - Else → `false`
3. Else → `false`

#### Returns
- `string` — Extension if zipbook
- `false` — Not a zipbook

#### Test Scenarios

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | .book.zip | `'manga.book.zip'` | `'zip'` |
| 2 | .book.7z | `'manga.book.7z'` | `'7z'` |
| 3 | .book.rar | `'manga.book.rar'` | `'rar'` |
| 4 | cbr file | `'comic.cbr'` | `'cbr'` |
| 5 | cbz file | `'comic.cbz'` | `'cbz'` |
| 6 | Regular zip (not book) | `'files.zip'` | `false` |
| 7 | Regular 7z (not book) | `'files.7z'` | `false` |
| 8 | Non-zip ext | `'photo.jpg'` | `false` |
| 9 | No extension | `'comicbook'` | `false` |
| 10 | .book.001 (edge) | `'data.book.001'` | Evaluate: `'001'` is in `ZIP_EXT`, regex does not match `.book.(zip\|7z\|rar)`, not cbr/cbz → `false` |
| 11 | Case insensitivity | `'manga.book.ZIP'` | `'zip'` (lowercased ext is `'zip'`, but regex matches against original `name`) — verify regex case sensitivity |

---

### 3.11 `isDoc(name)`

#### Purpose
Determines if a file is a document and returns its sub-type (`doc`, `present`, `sheet`, `pdf`, `rawdoc`).

#### Invocation
```js
isDoc(name: string) → { type: string, ext: string } | false
```

#### Logic Flow
1. Extract extension; if none → `false`
2. Check `DOC_EXT.doc` → `{ type: 'doc', ext }`
3. Check `DOC_EXT.present` → `{ type: 'present', ext }`
4. Check `DOC_EXT.sheet` → `{ type: 'sheet', ext }`
5. Check `DOC_EXT.pdf` → `{ type: 'pdf', ext }`
6. Check `DOC_EXT.rawdoc` → `{ type: 'rawdoc', ext }`
7. Else → `false`

#### Returns
- `{ type: string, ext: string }` — Document classification
- `false` — Not a document

#### Test Scenarios

| # | Branch | Scenario | Input | Expected |
|---|--------|----------|-------|----------|
| 1 | doc | txt | `'notes.txt'` | `{ type: 'doc', ext: 'txt' }` |
| 2 | doc | docx | `'report.docx'` | `{ type: 'doc', ext: 'docx' }` |
| 3 | doc | All 8 doc exts | Each member of `DOC_EXT.doc` | `{ type: 'doc', ext }` |
| 4 | present | pptx | `'slides.pptx'` | `{ type: 'present', ext: 'pptx' }` |
| 5 | present | All 4 present exts | Each member | `{ type: 'present', ext }` |
| 6 | sheet | xlsx | `'data.xlsx'` | `{ type: 'sheet', ext: 'xlsx' }` |
| 7 | sheet | All 5 sheet exts | Each member | `{ type: 'sheet', ext }` |
| 8 | pdf | pdf | `'doc.pdf'` | `{ type: 'pdf', ext: 'pdf' }` |
| 9 | rawdoc | js | `'app.js'` | `{ type: 'rawdoc', ext: 'js' }` |
| 10 | rawdoc | py | `'script.py'` | `{ type: 'rawdoc', ext: 'py' }` |
| 11 | rawdoc | All 28 rawdoc exts | Each member | `{ type: 'rawdoc', ext }` |
| 12 | fallthrough | Unknown ext | `'file.exe'` | `false` |
| 13 | No ext | No extension | `'Makefile'` | `false` |

---

### 3.12 `isSub(name)`

#### Purpose
Boolean-style check: returns the normalised extension if the file is a subtitle file, otherwise `false`.

#### Invocation
```js
isSub(name: string) → string | false
```

#### Logic Flow
Identical pattern to `isVideo` but checks against `SUB_EXT` (`['srt', 'ass', 'ssa', 'vtt']`).

#### Returns
- `string` — Lowercase extension if subtitle
- `false` — Not a subtitle file

#### Test Scenarios

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | srt | `'movie.srt'` | `'srt'` |
| 2 | ass | `'movie.ass'` | `'ass'` |
| 3 | ssa | `'movie.ssa'` | `'ssa'` |
| 4 | vtt | `'movie.vtt'` | `'vtt'` |
| 5 | Not subtitle | `'movie.mp4'` | `false` |
| 6 | No ext | `'subtitles'` | `false` |
| 7 | Case insensitive | `'file.SRT'` | `'srt'` |

---

### 3.13 `isKindle(name)`

#### Purpose
Determines if a file is Kindle-compatible. Checks both the static `KINDLE_EXT` list **and** a dynamic regex pattern for `azwN` variants (e.g., `azw3`, `azw4`).

#### Invocation
```js
isKindle(name: string) → string | false
```

#### Logic Flow
1. Extract extension; if none → `false`
2. If `KINDLE_EXT.includes(extName)` → return `extName`
3. Else if `extName.match(/^azw\d$/)` → return `extName` (handles `azw1`–`azw9`)
4. Else → `false`

> **Note**: The ternary chain: `KINDLE_EXT.includes(extName) ? extName : extName.match(/^azw\d$/) ? extName : false`

#### Returns
- `string` — Lowercase extension if Kindle-compatible
- `false` — Not Kindle-compatible

#### Test Scenarios

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Static: azw | `'book.azw'` | `'azw'` |
| 2 | Static: mobi | `'book.mobi'` | `'mobi'` |
| 3 | Static: pdf | `'book.pdf'` | `'pdf'` |
| 4 | Static: doc | `'book.doc'` | `'doc'` |
| 5 | Static: all 15 KINDLE_EXT | Each member | Corresponding ext |
| 6 | Dynamic: azw3 | `'book.azw3'` | `'azw3'` |
| 7 | Dynamic: azw4 | `'book.azw4'` | `'azw4'` |
| 8 | Dynamic: azw9 | `'book.azw9'` | `'azw9'` |
| 9 | Dynamic: azw0 | `'book.azw0'` | `'azw0'` |
| 10 | Not Kindle | `'file.mp4'` | `false` |
| 11 | No ext | `'kindle'` | `false` |
| 12 | Edge: azw10 (2 digits) | `'book.azw10'` | `false` (regex requires exactly one digit) |
| 13 | Edge: azwX (non-digit) | `'book.azwX'` | `false` |
| 14 | Case insensitive | `'book.MOBI'` | `'mobi'` |

---

### 3.14 `isCSV(name)`

#### Purpose
Boolean-style check: returns `'csv'` if the file has a `.csv` extension, otherwise `false`.

#### Invocation
```js
isCSV(name: string) → string | false
```

#### Logic Flow
1. Extract extension; if none → `false`
2. Return `extName === 'csv' ? extName : false`

#### Returns
- `'csv'` — If CSV file
- `false` — Not CSV

#### Test Scenarios

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Valid CSV | `'data.csv'` | `'csv'` |
| 2 | Uppercase | `'DATA.CSV'` | `'csv'` |
| 3 | Not CSV | `'data.xlsx'` | `false` |
| 4 | No extension | `'csvfile'` | `false` |
| 5 | Similar ext | `'file.csv2'` | `false` |

---

### 3.15 `mediaMIME(name)`

#### Purpose
Returns the MIME content-type string for a given filename based on the `MIME_EXT` lookup table.

#### Invocation
```js
mediaMIME(name: string) → string | false
```

#### Logic Flow
1. Extract extension via `EXT_FILENAME`
2. Lowercase; default to `''` if no match
3. Lookup `MIME_EXT[extName]`
4. Return MIME string if found, else `false`

#### Returns
- `string` — MIME type (e.g., `'video/mp4'`, `'image/jpeg'`)
- `false` — Extension not in MIME table

#### Test Scenarios

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Image: jpg | `'photo.jpg'` | `'image/jpeg'` |
| 2 | Image: png | `'icon.png'` | `'image/png'` |
| 3 | Video: mp4 | `'clip.mp4'` | `'video/mp4'` |
| 4 | Video: mkv | `'film.mkv'` | `'video/x-matroska'` |
| 5 | Audio: mp3 | `'song.mp3'` | `'audio/mpeg'` |
| 6 | Doc: pdf | `'doc.pdf'` | `'application/pdf'` |
| 7 | Doc: docx | `'file.docx'` | `'application/vnd.openxmlformats-officedocument.wordprocessingml.document'` |
| 8 | Archive: zip | `'file.zip'` | `'application/zip'` |
| 9 | All MIME_EXT keys | Each key | Corresponding MIME string |
| 10 | Unknown ext | `'file.xyz'` | `false` |
| 11 | No extension | `'README'` | `false` (lookup for `''` key) |
| 12 | Case insensitive | `'FILE.MP4'` | `'video/mp4'` |
| 13 | Empty string | `''` | `false` |

---

### 3.16 `supplyTag(tags, retTags, otherTags)`

#### Purpose
Provides supplemental tag suggestions based on the media category. Filters out tags already present in the current tag set, return tags, or other tags.

#### Invocation
```js
supplyTag(tags: string[], retTags: string[], otherTags?: string[]) → string[]
```

**Parameters**:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `tags` | `string[]` | (required) | Current tags on the item |
| `retTags` | `string[]` | (required) | Already-selected return tags |
| `otherTags` | `string[]` | `[]` | Additional tags to exclude |

#### Logic Flow (Decision Tree)

```
tags
 ├── includes('18+') → ADULT_LIST filtered
 ├── includes('game') OR includes('遊戲') → GAME_LIST_CH filtered
 ├── includes('audio') OR includes('音頻') → MUSIC_LIST filtered
 └── else → GENRE_LIST_CH filtered (default)
```

Filter logic (applied to the selected list):
- Exclude any item `i` where `tags.includes(i)` OR `retTags.includes(i)` OR `otherTags.includes(i)`
- Prepend `retTags` to the filtered list

#### Returns
- `string[]` — `[...retTags, ...filteredSupplyList]`

#### Side Effects
None (pure function).

#### Test Scenarios

| # | Branch | Scenario | Input | Expected |
|---|--------|----------|-------|----------|
| **Adult branch** | | | | |
| 1 | 18+ | Adult tag present | `tags=['18+'], retTags=[]` | `ADULT_LIST` (minus `'18+'` if in ADULT_LIST) |
| 2 | 18+ | With existing tags | `tags=['18+', 'ol'], retTags=['中出']` | Excludes `'ol'` and `'中出'` from result |
| 3 | 18+ | With otherTags | `tags=['18+'], retTags=[], otherTags=['多p']` | Excludes `'多p'` |
| **Game branch** | | | | |
| 4 | game | English trigger | `tags=['game'], retTags=[]` | `GAME_LIST_CH` filtered |
| 5 | 遊戲 | Chinese trigger | `tags=['遊戲'], retTags=[]` | `GAME_LIST_CH` filtered |
| 6 | game | With exclusions | `tags=['game', '動作'], retTags=['冒險']` | Excludes `'動作'` and `'冒險'` |
| **Audio/Music branch** | | | | |
| 7 | audio | English trigger | `tags=['audio'], retTags=[]` | `MUSIC_LIST` filtered |
| 8 | 音頻 | Chinese trigger | `tags=['音頻'], retTags=[]` | `MUSIC_LIST` filtered |
| **Default (Genre) branch** | | | | |
| 9 | default | No category tag | `tags=['動作'], retTags=[]` | `GENRE_LIST_CH` minus `'動作'` |
| 10 | default | Empty tags | `tags=[], retTags=[]` | Full `GENRE_LIST_CH` |
| **Priority / overlap** | | | | |
| 11 | priority | `18+` takes priority over `game` | `tags=['18+', 'game'], retTags=[]` | Uses `ADULT_LIST`, not `GAME_LIST_CH` |
| 12 | priority | `game` takes priority over `audio` | `tags=['game', 'audio'], retTags=[]` | Uses `GAME_LIST_CH` |
| **otherTags default** | | | | |
| 13 | default param | Omitted otherTags | `supplyTag([], [])` | Works without error (defaults to `[]`) |
| **retTags preservation** | | | | |
| 14 | retTags | retTags appear first in result | `tags=[], retTags=['x', 'y']` | Result starts with `['x', 'y', ...]` |

---

### 3.17 `changeExt(str, ext)`

#### Purpose
Replaces the file extension in a filename with a new extension.

#### Invocation
```js
changeExt(str: string, ext: string) → string
```

**Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| `str` | `string` | Original filename |
| `ext` | `string` | New extension (without dot) |

#### Logic Flow
1. Uses `str.replace(EXT_FILENAME, a => '.${ext}')` to replace the matched extension portion

#### Returns
- `string` — Filename with the new extension

#### Test Scenarios

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Replace ext | `changeExt('video.avi', 'mp4')` | `'video.mp4'` |
| 2 | Multi-dot name | `changeExt('file.tar.gz', 'bz2')` | `'file.tar.bz2'` |
| 3 | No extension | `changeExt('README', 'txt')` | `'README.txt'` |
| 4 | Same ext | `changeExt('file.mp4', 'mp4')` | `'file.mp4'` |
| 5 | Uppercase source | `changeExt('IMG.JPG', 'png')` | `'IMG.png'` |
| 6 | Empty ext param | `changeExt('file.txt', '')` | `'file.'` |

---

### 3.18 `getExtname(name)`

#### Purpose
Splits a filename into its base name (front) and extension (including the dot), both lowercased for the extension.

#### Invocation
```js
getExtname(name: string) → { front: string, ext: string }
```

**Parameters**:
| Param | Type | Description |
|-------|------|-------------|
| `name` | `string` | Full filename |

#### Logic Flow
1. Match `name` against `EXT_FILENAME`
2. `extName` = full match (`result[0]`), lowercased — includes the dot (e.g., `'.mp4'`)
3. `frontName` = `name.substr(0, name.length - extName.length)`
4. Return `{ front, ext }`

> **Important**: Unlike other functions, this uses `result[0]` (full match including dot), not `result[1]` (capture group without dot).

#### Returns
- `{ front: string, ext: string }` — Always returns an object; `ext` may be `''` if no extension

#### Test Scenarios

| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Normal file | `getExtname('photo.jpg')` | `{ front: 'photo', ext: '.jpg' }` |
| 2 | Multi-dot | `getExtname('archive.tar.gz')` | `{ front: 'archive.tar', ext: '.gz' }` |
| 3 | No extension | `getExtname('README')` | `{ front: 'README', ext: '' }` |
| 4 | Uppercase ext | `getExtname('FILE.TXT')` | `{ front: 'FILE', ext: '.txt' }` |
| 5 | Dot-leading name | `getExtname('.gitignore')` | Verify split behavior |
| 6 | Only extension | `getExtname('.env')` | `{ front: '', ext: '.env' }` |
| 7 | Empty string | `getExtname('')` | `{ front: '', ext: '' }` |
| 8 | Multiple dots | `getExtname('v1.2.3.tar.gz')` | `{ front: 'v1.2.3.tar', ext: '.gz' }` |

---

## 4. Snapshot Testing Data

The following data structures should be captured as Jest snapshots to detect unintended changes:

### 4.1 `getOptionTag()` Output Snapshot
```js
expect(getOptionTag()).toMatchSnapshot();
```
Freeze the full combined tag array. Any addition/removal of tags from the source constants will break the snapshot intentionally.

### 4.2 `extTag()` — All Valid Types
```js
const VALID_TYPES = ['image', 'zipbook', 'video', 'music', 'doc', 'pdf', 'present', 'sheet', 'rawdoc', 'url', 'zip'];
VALID_TYPES.forEach(type => {
    expect(extTag(type)).toMatchSnapshot(`extTag-${type}`);
});
```

### 4.3 `MIME_EXT` Coverage via `mediaMIME()`
```js
const MIME_SAMPLES = {
    'photo.jpg':  'image/jpeg',
    'photo.jpeg': 'image/jpeg',
    'icon.png':   'image/png',
    'anim.gif':   'image/gif',
    'img.bmp':    'image/bmp',
    'clip.mp4':   'video/mp4',
    'clip.webm':  'video/webm',
    'clip.mkv':   'video/x-matroska',
    'clip.avi':   'video/x-msvideo',
    'clip.mov':   'video/quicktime',
    'clip.wmv':   'video/x-ms-wmv',
    'clip.flv':   'video/x-flv',
    'clip.ogv':   'video/ogg',
    'clip.mpg':   'video/mpeg',
    'clip.asf':   'video/x-ms-asf',
    'clip.m4v':   'video/x-m4v',
    'clip.3gp':   'video/3gpp',
    'clip.m2ts':  'video/MP2T',
    'clip.mts':   'model/vnd.mts',
    'song.mp3':   'audio/mpeg',
    'song.ogg':   'audio/ogg',
    'song.wav':   'audio/wav',
    'song.m4a':   'audio/mp4',
    'doc.pdf':    'application/pdf',
    'doc.doc':    'application/msword',
    'doc.docx':   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'doc.rtf':    'application/rtf',
    'doc.txt':    'text/plain',
    'doc.odt':    'application/vnd.oasis.opendocument.text',
    'page.htm':   'text/html',
    'page.html':  'text/html',
    'cfg.conf':   'text/plain',
    'data.xls':   'application/vnd.ms-excel',
    'data.xlsx':  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'data.xlsm':  'application/vnd.ms-excel.sheet.macroenabled.12',
    'data.csv':   'text/csv',
    'data.ods':   'application/vnd.oasis.opendocument.spreadsheet',
    'deck.ppt':   'application/vnd.ms-powerpoint',
    'deck.pps':   'application/vnd.ms-powerpoint',
    'deck.pptx':  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'deck.odp':   'application/vnd.oasis.opendocument.presentation',
    'file.zip':   'application/zip',
    'file.7z':    'application/x-7z-compressed',
    'file.rar':   'application/x-rar-compressed',
    'clip.rm':    'application/vnd.rn-realmedia',
    'clip.rmvb':  'application/vnd.rn-realmedia-vbr',
};
```

### 4.4 `extType()` — Full Type Classification Map
```js
const TYPE_SAMPLES = {
    'photo.jpg':         { type: 'image',   ext: 'jpg' },
    'movie.mp4':         { type: 'video',   ext: 'mp4' },
    'song.mp3':          { type: 'music',   ext: 'mp3' },
    'file.zip':          { type: 'zip',     ext: 'zip' },
    'manga.book.zip':    { type: 'zipbook', ext: 'zip' },
    'comic.cbr':         { type: 'zipbook', ext: 'cbr' },
    'notes.txt':         { type: 'doc',     ext: 'txt' },
    'slides.pptx':       { type: 'present', ext: 'pptx' },
    'data.xlsx':         { type: 'sheet',   ext: 'xlsx' },
    'manual.pdf':        { type: 'pdf',     ext: 'pdf' },
    'app.js':            { type: 'rawdoc',  ext: 'js' },
    'archive.zip.001':   { type: 'zip',     ext: 'zip' },
    'archive.7z.001':    { type: 'zip',     ext: '7z' },
};
```

---

## 5. Comprehensive Test Scenarios

### 5.1 Common Extension Extraction Pattern

Eight functions share the same extension-extraction pattern (`isVideo`, `isImage`, `isMusic`, `isTorrent`, `isZip`, `isZipbook`, `isDoc`, `isSub`, `isKindle`, `isCSV`). The following **cross-cutting edge cases** apply to ALL of them:

| # | Edge Case | Input | Expected |
|---|-----------|-------|----------|
| 1 | No extension | `'filename'` | `false` |
| 2 | Empty string | `''` | `false` |
| 3 | Uppercase extension | `'FILE.EXT'` | Lowercase comparison |
| 4 | Mixed case | `'File.ExT'` | Lowercase comparison |
| 5 | Multiple dots | `'my.file.name.ext'` | Uses last extension only |
| 6 | Trailing dot | `'file.'` | `result[1]` is `''` → `false` or empty ext handling |
| 7 | Path-like input | `'/path/to/file.mp4'` | Should still extract `.mp4` |
| 8 | Spaces in name | `'my file.mp4'` | Should still extract `.mp4` |
| 9 | Unicode filename | `'映画.mp4'` | Should still extract `.mp4` |
| 10 | Double extension | `'file.tar.gz'` | Only considers `'gz'` |

### 5.2 `extType()` — Full Branch Coverage Matrix

Total distinct branches to cover for 100% coverage: **17**

| Branch ID | Condition | Path |
|-----------|-----------|------|
| B1 | No regex match | → `false` |
| B2 | IMAGE_EXT match | → `{ type: 'image' }` |
| B3 | ZIP_EXT + `.book.(zip\|7z\|rar)` | → `{ type: 'zipbook' }` |
| B4 | ZIP_EXT + cbr/cbz | → `{ type: 'zipbook' }` |
| B5 | ZIP_EXT + `001` + `.zip.001` | → `{ type: 'zip', ext: 'zip' }` |
| B6 | ZIP_EXT + `001` + `.7z.001` | → `{ type: 'zip', ext: '7z' }` |
| B7 | ZIP_EXT + `001` + other | → `false` |
| B8 | ZIP_EXT + regular | → `{ type: 'zip' }` |
| B9 | VIDEO_EXT match | → `{ type: 'video' }` |
| B10 | MUSIC_EXT match | → `{ type: 'music' }` |
| B11 | DOC_EXT.doc match | → `{ type: 'doc' }` |
| B12 | DOC_EXT.present match | → `{ type: 'present' }` |
| B13 | DOC_EXT.sheet match | → `{ type: 'sheet' }` |
| B14 | DOC_EXT.pdf match | → `{ type: 'pdf' }` |
| B15 | DOC_EXT.rawdoc match | → `{ type: 'rawdoc' }` |
| B16 | No category match | → `false` |
| B17 | Extension exists but result[1] falsy | → `false` |

### 5.3 `supplyTag()` — Branch & Filter Coverage

| Branch ID | Condition | Supply List |
|-----------|-----------|-------------|
| S1 | `tags.includes('18+')` | `ADULT_LIST` |
| S2 | `tags.includes('game')` | `GAME_LIST_CH` |
| S3 | `tags.includes('遊戲')` | `GAME_LIST_CH` |
| S4 | `tags.includes('audio')` | `MUSIC_LIST` |
| S5 | `tags.includes('音頻')` | `MUSIC_LIST` |
| S6 | Default (none of above) | `GENRE_LIST_CH` |

Filter validation per branch:
- Tag in `tags` → excluded
- Tag in `retTags` → excluded
- Tag in `otherTags` → excluded
- Tag in none → included

---

## 6. Mock Strategy

### 6.1 Module Mocking

Since `mime.js` is a pure utility module importing only constants, **mocking should be minimal**:

```js
// Option A: Test with real constants (preferred — validates integration with constants.js)
import { extType, isVideo, ... } from '../mime.js';

// Option B: Mock constants for isolation testing
jest.mock('../../constants.js', () => ({
    EXT_FILENAME: /(?:\.([^.]+))?$/,
    IMAGE_EXT: ['jpg', 'png'],
    VIDEO_EXT: ['mp4'],
    // ... minimal sets for focused testing
}));
```

### 6.2 Console Spy

For `extTag()` error branch:
```js
const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
extTag('nonexistent');
expect(consoleSpy).toHaveBeenCalledWith(undefined);
consoleSpy.mockRestore();
```

---

## 7. Coverage Targets

| Metric | Target | Notes |
|--------|--------|-------|
| **Statements** | 100% | All return paths exercised |
| **Branches** | 100% | All `if/else`, ternary, and `switch` paths |
| **Functions** | 100% | All 18 exports tested |
| **Lines** | 100% | All 279 lines covered |

### Function-Level Coverage Checklist

| Function | Branches | Min Tests for 100% |
|----------|----------|-------------------|
| `getOptionTag` | 0 | 1 (+ snapshot) |
| `addPost` | 2 (match/no-match) | 3 |
| `extTag` | 2 (try/catch) | 3 |
| `extType` | 17 (see §5.2) | 17 |
| `isVideo` | 3 (no-ext, match, no-match) | 3 |
| `isImage` | 3 | 3 |
| `isMusic` | 3 | 3 |
| `isTorrent` | 3 | 3 |
| `isZip` | 6 (no-ext, zip-001-zip, zip-001-7z, zip-001-other, zip-regular, not-zip) | 6 |
| `isZipbook` | 4 (no-ext, book-pattern, cbr/cbz, regular-zip, not-zip) | 5 |
| `isDoc` | 7 (no-ext, 5 doc types, fallthrough) | 7 |
| `isSub` | 3 | 3 |
| `isKindle` | 4 (no-ext, static-match, dynamic-azw, no-match) | 4 |
| `isCSV` | 3 | 3 |
| `mediaMIME` | 2 (found, not-found) | 3 |
| `supplyTag` | 6 (see §5.3) | 6+ |
| `changeExt` | 1 | 2 |
| `getExtname` | 2 (match, no-match) | 3 |
| **Total** | | **~78 minimum tests** |

---

> **Reference**: OUTLINE.md §11.2, §11.8, §11.9 — Phase 1 priority, `src/back/util/__tests__/mime.test.js`
