# Technical Documentation: MIME & File Utility (`src/back/util/mime.js`)

## 1. Overview
The `mime.js` utility is a core backend module responsible for file type identification, extension manipulation, and metadata tagging. It relies on constants defined in `src/back/constants.js` to categorize files into specific media types (e.g., `image`, `video`, `zipbook`, `rawdoc`) and provide appropriate MIME types.

**Testing Reference:** This documentation adheres to the `doc/OUTLINE.md` standards for Unit and Utility testing.

---

## 2. Function: `getOptionTag`

### Purpose
Aggregates all available category and genre tags from multiple constants into a single array for frontend selection.

### Logic Flow
1. Spreads and concatenates `MEDIA_LIST_CH`, `GENRE_LIST_CH`, `GAME_LIST_CH`, `MUSIC_LIST`, and `ADULT_LIST`.
2. Returns the flattened array.

### Invocation & Authentication
- **Signature:** `getOptionTag()`
- **Authentication:** None (Internal utility).

### Returns & Side Effects
- **Returns:** `Array<String>` containing all available tags.
- **Side Effects:** None.

### Comprehensive Test Scenarios
- **Logical Branch:** Ensure all source arrays are included.
- **Edge Case:** Verify behavior if any source constant is empty.

---

## 3. Function: `addPost`

### Purpose
Appends a suffix (postfix) to a filename while preserving its extension.

### Logic Flow
1. Uses `EXT_FILENAME` regex to split the filename and extension.
2. **If Extension Exists:** Replaces the extension with `(post).ext`.
3. **If No Extension:** Appends `(post)` to the end of the string.

### Invocation & Authentication
- **Signature:** `addPost(str, post)`
- **Parameters:** `str` (String): Original filename, `post` (String): Suffix to add.

### Returns & Side Effects
- **Returns:** `String`: Modified filename.

### Comprehensive Test Scenarios
- **Branch: File with extension:** `test.jpg` + `v1` -> `test(v1).jpg`.
- **Branch: File without extension:** `test` + `v1` -> `test(v1)`.
- **Edge Case: Multiple dots:** `archive.tar.gz` + `fix` -> `archive.tar(fix).gz`.
- **Edge Case: Empty string:** Ensure it handles empty input safely.

---

## 4. Function: `extTag`

### Purpose
Retrieves the default and optional tags for a specific media type defined in `MEDIA_TAG`.

### Logic Flow
1. Attempts to deep-clone `MEDIA_TAG[type]` using `JSON.parse(JSON.stringify(...))`.
2. **Success:** Returns the cloned tag object.
3. **Failure:** Logs the error and returns an empty object `{}`.

### Invocation & Authentication
- **Signature:** `extTag(type)`
- **Parameters:** `type` (String): Media key (e.g., 'image', 'video').

### Returns & Side Effects
- **Returns:** `Object`: Tag configuration or `{}`.

### Comprehensive Test Scenarios
- **Branch: Valid Type:** Returns expected `def` and `opt` arrays.
- **Branch: Invalid Type:** Returns `{}` and logs output.

---

## 5. Function: `extType`

### Purpose
The primary classifier that determines a file's high-level category based on its extension and name patterns.

### Logic Flow
1. Extracts extension using `EXT_FILENAME`.
2. **Decision Tree:**
   - **Image:** If extension in `IMAGE_EXT`.
   - **Zip/Archive:** 
     - If `.book.zip` or `.cbr/.cbz` -> `zipbook`.
     - If `.001` -> Checks if it's `zip.001` or `7z.001`.
     - Else -> `zip`.
   - **Media:** Maps to `video`, `music`.
   - **Documents:** Maps to `doc`, `present`, `sheet`, `pdf`, `rawdoc` based on `DOC_EXT` categories.
3. Returns `false` if no match or no extension.

### Invocation & Authentication
- **Signature:** `extType(name)`
- **Parameters:** `name` (String): Filename.

### Returns & Side Effects
- **Returns:** `Object { type: String, ext: String }` or `false`.

### Comprehensive Test Scenarios
- **Branch: Special Case Zipbook:** `comic.book.zip` should return `type: 'zipbook'`.
- **Branch: Special Case Split Archive:** `data.zip.001` should return `type: 'zip', ext: 'zip'`.
- **Branch: Raw Document:** `server.js` should return `type: 'rawdoc', ext: 'js'`.
- **Edge Case: Hidden Files:** `.gitignore` (ext: `gitignore`) -> return `false` or appropriate type if in `DOC_EXT`.
- **Edge Case: Case Sensitivity:** Ensure `test.JPG` is treated as `test.jpg`.

---

## 6. Type Checkers (`isVideo`, `isImage`, `isMusic`, `isTorrent`, `isZip`, `isZipbook`, `isDoc`, `isSub`, `isKindle`, `isCSV`)

### Purpose
Dedicated boolean/string-return helpers for specific file types.

### Logical Branches (Generic)
1. **Extension Check:** Matches extension against global constants.
2. **Specific Logic:**
   - `isZip`: Handles `.001` multi-part logic.
   - `isZipbook`: Matches `.book.*` patterns.
   - `isKindle`: Handles `azw` and `azw3`.
   - `isDoc`: Returns an object `{type, ext}` instead of just the extension string.

### Comprehensive Test Scenarios
- **Branch: Correct Type:** Verify `isVideo('movie.mkv')` returns `'mkv'`.
- **Branch: Incorrect Type:** Verify `isImage('doc.pdf')` returns `false`.
- **Edge Case: No Extension:** All should return `false`.

---

## 7. Function: `mediaMIME`

### Purpose
Maps a filename to its standard MIME type string.

### Logic Flow
1. Extracts extension.
2. Looks up extension in `MIME_EXT` dictionary.
3. Returns the MIME string or `false`.

### Invocation & Authentication
- **Signature:** `mediaMIME(name)`

### Snapshot Testing Data
```json
{
  "test.jpg": "image/jpeg",
  "movie.mp4": "video/mp4",
  "data.zip": "application/zip",
  "unknown.xyz": false
}
```

---

## 8. Function: `supplyTag`

### Purpose
Intelligently suggests additional tags based on existing tags and category priority.

### Logic Flow
1. **Priority 1 (Adult):** If tags include `18+`, suggest all `ADULT_LIST` not already present.
2. **Priority 2 (Game):** If tags include `game` or `遊戲`, suggest `GAME_LIST_CH`.
3. **Priority 3 (Audio):** If tags include `audio` or `音頻`, suggest `MUSIC_LIST`.
4. **Default:** Suggest `GENRE_LIST_CH`.

### Invocation & Authentication
- **Signature:** `supplyTag(tags, retTags, otherTags)`
- **Parameters:** 
  - `tags`: Current item tags.
  - `retTags`: Already selected suggestions.
  - `otherTags`: Exclusion list.

### Returns & Side Effects
- **Returns:** `Array<String>`: Combined suggested tags.

### Comprehensive Test Scenarios
- **Branch: Suggest Adult:** `['18+']` -> suggests all tags in `ADULT_LIST`.
- **Branch: Filtering:** Ensure tags already in `tags`, `retTags`, or `otherTags` are **not** suggested again.

---

## 9. String Helpers (`changeExt`, `getExtname`)

### Purpose
Manipulate extension strings without affecting the filename.

### Comprehensive Test Scenarios
- **`changeExt`:** `image.png` + `jpg` -> `image.jpg`.
- **`getExtname`:** `my.long.file.name.txt` -> `{ front: 'my.long.file.name', ext: '.txt' }`.
- **Edge Case:** File with no extension.
