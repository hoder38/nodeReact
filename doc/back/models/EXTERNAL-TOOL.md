# external-tool.js — QA Testing Strategy & Technical Documentation

> **Module**: `src/back/models/external-tool.js`
> **Project**: ANoMoPi (anomopi.com)
> **Role**: External media source integration — scraping, parsing, metadata extraction from YIFY, Bilibili, Kubo, DM5, EZTV, YouTube, Steam, IMDB, and more
> **External Dependencies**: `node-opencc`, `htmlparser2`, `youtube-dl-exec`, `mkdirp`, `fs`, `read-torrent`
> **Internal Dependencies**: `redis-tool.js`, `api-tool-google.js`, `tag-tool.js`, `mongo-tool.js`, `utility.js`, `mime.js`, `api-tool.js`, `sendWs.js`
> **Testing Approach**: Mock HTTP clients, HTML parsers, filesystem, MongoDB, Redis; stub external API responses per OUTLINE.md §11.4 (Phase 6)
> **Priority**: 🟡 High — Critical for external content aggregation, complex HTML parsing, multi-source scraping with rate-limiting and caching

---

## Table of Contents

1. [Module-Level State & Architecture](#1-module-level-state--architecture)
2. [Default Export Object Functions](#2-default-export-object-functions)
   - 2.1 [`getSingleList()`](#21-getsinglelist--multi-source-list-scraper)
   - 2.2 [`save2Drive()`](#22-save2drive--google-drive-persistence)
   - 2.3 [`parseTagUrl()`](#23-parsetagurl--url-metadata-extractor)
   - 2.4 [`youtubePlaylist()`](#24-youtubeplaylist--youtube-playlist-paginator)
   - 2.5 [`getSingleId()`](#25-getsingleid--single-item-fetcher)
   - 2.6 [`saveSingle()`](#26-savesingle--single-item-metadata-persister)
3. [Named Export Functions](#3-named-export-functions)
   - 3.1 [`bilibiliVideoUrl()`](#31-bilibilivideourl--bilibili-video-extractor)
   - 3.2 [`kuboVideoUrl()`](#32-kubovideourl--kubo-multi-player-extractor)
   - 3.3 [`youtubeVideoUrl()`](#33-youtubevideourl--youtube-dl-wrapper)
4. [Internal Helper Functions](#4-internal-helper-functions)

---

## 1. Module-Level State & Architecture

### Imported Constants & Dependencies

| Constant | Source | Purpose |
|----------|--------|---------|
| `GENRE_LIST`, `GENRE_LIST_CH` | `constants.js` | Genre mappings for YIFY films |
| `DM5_ORI_LIST`, `DM5_CH_LIST` | `constants.js` | DM5 manga category mappings |
| `GAME_LIST`, `GAME_LIST_CH` | `constants.js` | Game genre translations |
| `MUSIC_LIST`, `MUSIC_LIST_WEB` | `constants.js` | Music streaming platforms |
| `CACHE_EXPIRE` | `constants.js` | Redis cache TTL (seconds) |
| `STORAGEDB`, `DOCDB` | `constants.js` | MongoDB collection names |
| `MONTH_NAMES`, `MONTH_SHORTS` | `constants.js` | Date parsing utilities |
| `KUBO_TYPE` | `constants.js` | Kubo video player type mappings |

### Module Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      external-tool.js                           │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Default Export Object (6 functions)                   │   │
│  ├────────────────────────────────────────────────────────┤   │
│  │  getSingleList()  ─┬─> YIFY, Bilibili, Kubo, DM5      │   │
│  │                    ├─> EZTV, Steam, IMDB scraping      │   │
│  │                    └─> Returns: [{id, name, thumb}]    │   │
│  │                                                         │   │
│  │  save2Drive()      ─┬─> Parse external source HTML     │   │
│  │                    ├─> Extract video/torrent links     │   │
│  │                    └─> Upload to Google Drive          │   │
│  │                                                         │   │
│  │  parseTagUrl()     ─┬─> IMDB, Steam, Youku parsing     │   │
│  │                    └─> Extract tags from URL metadata  │   │
│  │                                                         │   │
│  │  youtubePlaylist() ─┬─> YouTube Data API v3           │   │
│  │                    └─> Paginated playlist retrieval    │   │
│  │                                                         │   │
│  │  getSingleId()     ─┬─> Single item deep fetch         │   │
│  │                    ├─> YouTube, EZTV, YIFY, Kubo       │   │
│  │                    └─> Returns: [item, isEnd, total]   │   │
│  │                                                         │   │
│  │  saveSingle()      ─┬─> Persist metadata to MongoDB    │   │
│  │                    └─> Returns: [name, tags, ...]      │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Named Exports (3 functions)                           │   │
│  ├────────────────────────────────────────────────────────┤   │
│  │  bilibiliVideoUrl()  → Bilibili embed extractor        │   │
│  │  kuboVideoUrl()      → Kubo multi-player URL parser    │   │
│  │  youtubeVideoUrl()   → youtube-dl-exec wrapper         │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                 │
│  External Dependencies:                                        │
│  ├─ Api() ──────────────> HTTP GET/POST with retries          │
│  ├─ GoogleApi() ────────> Google Drive upload                  │
│  ├─ Redis() ────────────> Caching layer (TTL: CACHE_EXPIRE)   │
│  ├─ Mongo() ────────────> CRUD operations on STORAGEDB         │
│  ├─ youtubedl() ────────> Video URL extraction               │
│  ├─ Htmlparser ─────────> HTML DOM parsing                     │
│  └─ OpenCC ─────────────> Traditional/Simplified Chinese      │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow Example

```
User → external-router → getSingleList('yify', 'https://yts.mx/browse-movies')
                              ↓
                        Api('url', url) → HTML response
                              ↓
                        Htmlparser.parseDOM(html)
                              ↓
                        Extract: id, name, thumb, date, rating, genre
                              ↓
                        [{id: 12345, name: 'Movie Title', thumb: '...', ...}]
                              ↓
                        Frontend displays list
                              ↓
User clicks → getSingleId('yify', url, index)
                              ↓
                        Fetch specific item with torrents
                              ↓
                        [item_data, is_end, total_count]
```

---

## 2. Default Export Object Functions

---

## 2.1 `getSingleList()` — Multi-Source List Scraper

### Purpose
Fetches paginated lists of media items from external sources. Supports 18+ different platforms including torrent sites (YIFY, EZTV), manga (DM5), streaming platforms (Bilibili, Kubo), and more. Returns standardized item arrays with `id`, `name`, `thumb`, `date`, `tags`, `rating`, `count`.

### Invocation & Authentication
```js
import ExternalTool from '../models/external-tool.js';
const defaultExport = ExternalTool; // Object with functions
defaultExport.getSingleList(type: string, url: string, post?: object): Promise<Array<object>>
```
- Called by `/f/api/external/` router endpoints
- No authentication required (public data scraping)
- `type` determines scraping strategy
- `url` is the target page URL
- `post` (optional) for POST request data

### Logic Flow
1. **Type Routing**: Switch on `type` parameter:
   - `'yify'` → Scrape YIFY torrent site
   - `'bilibili'` → Parse Bilibili video pages
   - `'kubo'` → Extract Kubo streaming content
   - `'dm5'` → DM5 manga chapters
   - `'bls'`, `'cen'`, `'bea'`, `'ism'`, `'cbo'`, `'nar'`, `'sca'`, `'fed'`, `'sea'`, `'tri'`, `'ndc'`, `'sta'`, `'mof'`, `'moe'`, `'cbc'` → Various manga/content aggregators
2. **HTTP Fetch**: Use `Api('url', url)` or `Api('url', url, {post})` for POST requests
3. **HTML Parsing**: `Htmlparser.parseDOM(raw_data)` → DOM tree
4. **DOM Navigation**: Use `findTag()` utility to traverse DOM:
   - Locate list containers (e.g., `<div class="browse-movie-wrap">`)
   - Extract item nodes
   - Parse attributes: `href`, `src`, `alt`, `data-*`
5. **Data Normalization**:
   - **ID extraction**: From URL patterns (e.g., `/movie/12345/` → `12345`)
   - **Name sanitization**: Remove special chars, normalize whitespace
   - **Date parsing**: Handle formats like "2023", "Jan 2023", ISO dates
   - **Genre mapping**: Map genre IDs to localized names via `GENRE_LIST`/`GENRE_LIST_CH`
   - **Rating conversion**: Extract from text/attributes, convert to numeric
6. **Return**: Array of objects conforming to schema:
   ```js
   {
     id: string | number,
     name: string,
     thumb?: string,
     date?: string,
     tags?: Array<string>,
     rating?: number,
     count?: number,
     url?: string
   }
   ```

### Returns & Side Effects
- **Returns**: `Promise<Array<object>>` with standardized item data
- **Side Effects**:
  - HTTP requests to external sites (rate-limited by `Api()` backoff)
  - No database writes (read-only scraping)
  - Potential for parsing errors if external HTML structure changes

### Snapshot Testing Data

#### Input: YIFY Movie List
```js
type: 'yify'
url: 'https://yts.mx/browse-movies?page=1'
```

#### Expected Output:
```js
[
  {
    id: 12345,
    name: "Inception",
    thumb: "https://img.yts.mx/assets/images/movies/inception_2010/medium-cover.jpg",
    date: "2010",
    rating: 8.8,
    tags: ["Action", "Sci-Fi", "Thriller"],
    count: 42  // Comments count
  },
  {
    id: 12346,
    name: "The Matrix",
    thumb: "https://img.yts.mx/assets/images/movies/the_matrix_1999/medium-cover.jpg",
    date: "1999",
    rating: 8.7,
    tags: ["Action", "Sci-Fi"]
  }
  // ... more items
]
```

#### Input: DM5 Manga List
```js
type: 'dm5'
url: 'https://www.dm5.com/manhua-list-p1/'
```

#### Expected Output:
```js
[
  {
    id: "one-piece",
    name: "航海王",
    thumb: "https://mhpic.jumanhua.com/comic/o/onepiece/cover.jpg",
    date: "2023-05",
    count: 1087  // Chapter count
  },
  {
    id: "naruto",
    name: "火影忍者",
    thumb: "https://mhpic.jumanhua.com/comic/n/naruto/cover.jpg",
    date: "2023-04",
    count: 700
  }
]
```

### Comprehensive Test Scenarios

#### Logical Branches
| # | Scenario | Input | Expected Output |
|---|----------|-------|-----------------|
| 1 | YIFY movie list (page 1) | `type='yify'`, `url='https://yts.mx/browse-movies'` | Array of movie objects with torrents |
| 2 | Bilibili video search | `type='bilibili'`, `url` with search query | Array with video IDs, titles, thumbnails |
| 3 | Kubo streaming list | `type='kubo'`, URL to Kubo category | Array with video entries |
| 4 | DM5 manga category | `type='dm5'`, category URL | Array of manga with chapter counts |
| 5 | EZTV torrent list | `type='eztv'`, EZTV URL (if supported) | Array with torrent metadata |
| 6 | POST request type | Any type supporting POST, with `post` object | Correct POST data sent |
| 7 | Each of 18+ supported types | All `type` values | Type-specific parsing logic executes |

#### Edge Cases
| # | Scenario | Input | Expected Behavior |
|---|----------|-------|-------------------|
| 8 | Empty result page | Valid URL, no items | Returns `[]` (empty array) |
| 9 | Malformed HTML | URL returning broken HTML | Parsing errors caught, partial results or empty array |
| 10 | Missing thumbnail images | Items without `thumb` attribute | Objects returned with `thumb: undefined` or omitted |
| 11 | Non-existent genre ID | YIFY with unknown genre | Genre mapped to fallback or ID string |
| 12 | Unicode/emoji in titles | Manga with special chars | Correctly decoded and returned |
| 13 | Extremely long item lists | Page with 100+ items | All items parsed and returned |
| 14 | Paginated results at boundary | Last page URL | Correct parsing, no duplicate items |
| 15 | Mixed Traditional/Simplified Chinese | DM5 with both character sets | OpenCC conversion applied correctly |
| 16 | Invalid URL format | `url=''` or malformed | `Api()` error propagated |
| 17 | Null/undefined parameters | `type=null` or `url=undefined` | Early return or error thrown |
| 18 | HTML structure change | External site redesign | Parsing fails gracefully, logs error |

#### Error Handling
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 19 | Network timeout | `Api()` retry logic, eventually reject with timeout error |
| 20 | HTTP 404 on URL | Promise rejected with 404 status |
| 21 | HTTP 503 (rate-limited) | Backoff retry via `Api()` |
| 22 | `Htmlparser.parseDOM()` throws | Error caught, logged via `handleError()`, rejected |
| 23 | `findTag()` returns empty | Downstream code handles empty arrays, returns `[]` |
| 24 | Unsupported `type` parameter | Falls through switch, returns `Promise.resolve([])` or error |
| 25 | Circular redirect loop | `Api()` max redirect limit reached, error |
| 26 | CORS/SSL errors | `Api()` handles, error propagated |

#### Authentication Scenarios
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 27 | No authentication required | All requests succeed without auth headers |
| 28 | Site requires cookies | Cookies managed by `Api()` if implemented, else fails |
| 29 | Cloudflare challenge | `Api()` cannot bypass, request fails (document limitation) |

---

## 2.2 `save2Drive()` — Google Drive Persistence

### Purpose
Downloads content from external sources (HTML pages, torrents, media links) and uploads to Google Drive. Supports multiple content types with type-specific extraction logic. Typically used for archiving video playlists, manga chapters, or entire series.

### Invocation & Authentication
```js
defaultExport.save2Drive(type: string, obj: object, parent: string): Promise<object>
```
- **Parameters**:
  - `type`: External source type (e.g., `'bls'`, `'cen'`, `'kubo'`)
  - `obj`: Object with `{ name: string, date?: string, url: string }`
  - `parent`: Google Drive folder ID (destination)
- **Authentication**: Requires Google Drive OAuth via `GoogleApi`
- Called by background jobs or manual archive operations

### Logic Flow
1. **Type Routing**: Switch on `type`:
   - `'bls'`, `'cen'`, `'bea'`, `'ism'`, `'cbo'`, `'nar'`, `'sca'`, `'fed'`, `'sea'`, `'tri'`, `'ndc'`, `'sta'`, `'mof'`, `'moe'`, `'cbc'` → Manga/video site handlers
2. **Content Fetching**: 
   - `Api('url', obj.url)` → Fetch HTML
   - `Htmlparser.parseDOM(raw_data)` → Parse DOM
3. **Link Extraction**:
   - Use `findTag()` to locate video `<source>` tags, torrent links, or download URLs
   - Extract `src`, `href`, or `data-*` attributes
   - Filter by file type (`.mp4`, `.torrent`, `.mkv`, etc.)
4. **File Download** (if applicable):
   - Use `Api('download', download_url)` to get binary data
   - Or construct magnet links from torrent info
5. **Google Drive Upload**:
   - Call `GoogleApi('upload', { name: obj.name, url: download_url, parent })`
   - Wait for upload completion
6. **Return**: Google Drive API response (file ID, metadata)

### Returns & Side Effects
- **Returns**: `Promise<object>` with Google Drive file metadata
  ```js
  {
    id: "1A2B3C4D5E6F7G8H9I0J",
    name: "Episode 01.mp4",
    mimeType: "video/mp4",
    size: "524288000",
    parents: ["0ABCDEFGHIJK"]
  }
  ```
- **Side Effects**:
  - HTTP requests to external source
  - Google Drive API calls (quota consumption)
  - Temporary file writes (if downloading before upload)
  - MongoDB updates (if tracking upload status)

### Snapshot Testing Data

#### Input: Kubo Episode Upload
```js
type: 'kubo'
obj: {
  name: "進擊的巨人 EP12",
  date: "2023-05-15",
  url: "https://www.99kubo.tv/vod-play/12345-1-12.html"
}
parent: "1DriveParentFolderId"
```

#### Expected Behavior:
1. Fetch HTML from Kubo URL
2. Parse DOM to extract video `<source src="https://cdn.99kubo.tv/12345.mp4">`
3. Call `GoogleApi('upload', { name: "進擊的巨人 EP12", url: "https://cdn.99kubo.tv/12345.mp4", parent: "1DriveParentFolderId" })`
4. Return Google Drive file object

### Comprehensive Test Scenarios

#### Logical Branches
| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Each supported `type` | All 15+ type values | Type-specific extraction logic |
| 2 | Valid obj with all fields | `{ name, date, url }` | Successful upload |
| 3 | obj missing `date` | `{ name, url }` | Date omitted, upload proceeds |
| 4 | Multiple video sources | HTML with multiple `<source>` | Upload all or first source (document) |
| 5 | Torrent link extraction | `type='eztv'`, torrent page | Extract magnet/torrent URL |
| 6 | Direct video URL | `type` with direct `.mp4` link | Upload without intermediate download |

#### Edge Cases
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 7 | Empty `obj.name` | Error or use filename from URL |
| 8 | Duplicate file in Drive | Google Drive handles (creates duplicate or errors) |
| 9 | Extremely large file (>5GB) | Google Drive API handles chunked upload |
| 10 | Invalid Drive `parent` ID | Google Drive API error (404 or 403) |
| 11 | URL with no extractable links | Error: "No downloadable content found" |
| 12 | HTML with obfuscated URLs | Parsing fails, error logged |
| 13 | Non-video content type | Upload proceeds with detected MIME type |
| 14 | Special characters in filename | Sanitized via `toValidName()` |

#### Error Handling
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 15 | `Api('url')` timeout | Retry logic, eventual rejection |
| 16 | Google Drive quota exceeded | API error (403), propagated to caller |
| 17 | OAuth token expired | `GoogleApi` refreshes token, retries |
| 18 | Network failure during upload | Upload aborted, error returned |
| 19 | Malformed HTML | Parsing error, logged and rejected |
| 20 | Unsupported `type` | Default case returns error or skips |

#### Authentication Scenarios
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 21 | Valid Google OAuth token | Upload succeeds |
| 22 | Token expired, refresh succeeds | Auto-refresh, upload retries |
| 23 | Token expired, refresh fails | Error returned to caller |
| 24 | No Drive permissions | 403 error from Google API |

---

## 2.3 `parseTagUrl()` — URL Metadata Extractor

### Purpose
Extracts tags, genres, and metadata from various URL types (IMDB, Steam, Youku, etc.) to enrich file metadata. Parses URL patterns and scrapes linked pages to build comprehensive tag sets.

### Invocation & Authentication
```js
defaultExport.parseTagUrl(type: string, url: string): Promise<Array<string>>
```
- **Parameters**:
  - `type`: URL source type (`'imdb'`, `'steam'`, `'youku'`, `'youku_playlist'`)
  - `url`: URL to parse/scrape
- **Authentication**: None required for public pages
- Returns array of normalized tag strings

### Logic Flow
1. **Type Dispatch**:
   - `'imdb'` → Extract IMDB movie ID, scrape genres/actors/directors
   - `'steam'` → Parse Steam app ID, fetch game categories/tags
   - `'youku'` → Parse Youku video page for tags
   - `'youku_playlist'` → Extract playlist metadata
2. **URL Pattern Matching**:
   - Use regex to extract IDs from URLs
   - Example IMDB: `/title/tt0133093/` → `tt0133093`
   - Example Steam: `/app/570/` → `570`
3. **Content Scraping** (if needed):
   - `Api('url', constructed_url)` → Fetch HTML
   - `Htmlparser.parseDOM(raw_data)` → Parse
   - Navigate to metadata sections (e.g., `<div class="genres">`)
   - Extract text content from tags
4. **Tag Normalization**:
   - Apply `normalize()` to lowercase, remove special chars
   - Filter out default/blacklisted tags via `isDefaultTag()`
   - Deduplicate via Set
5. **Return**: `Promise<Array<string>>` with normalized tags

### Returns & Side Effects
- **Returns**: `Promise<string[]>` — Array of tag strings
- **Side Effects**:
  - HTTP requests to external sites (IMDB, Steam, Youku)
  - No database writes

### Snapshot Testing Data

#### Input: IMDB Movie URL
```js
type: 'imdb'
url: 'https://www.imdb.com/title/tt0133093/'  // The Matrix
```

#### Expected Output:
```js
[
  "action",
  "sci-fi",
  "keanu reeves",
  "wachowski",
  "dystopian",
  "cyberpunk",
  "1999"
]
```

#### Input: Steam Game URL
```js
type: 'steam'
url: 'https://store.steampowered.com/app/570/Dota_2/'
```

#### Expected Output:
```js
[
  "moba",
  "free to play",
  "multiplayer",
  "strategy",
  "competitive",
  "esports"
]
```

### Comprehensive Test Scenarios

#### Logical Branches
| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | IMDB movie URL | Valid IMDB URL | Array of genres/actors |
| 2 | Steam game URL | Valid Steam app URL | Array of game categories |
| 3 | Youku video URL | Valid Youku URL | Tags from video page |
| 4 | Youku playlist URL | Playlist URL with `type='youku_playlist'` | Playlist-level tags |
| 5 | Each supported type | All 4 type values | Type-specific scraping |

#### Edge Cases
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 6 | URL with no extractable tags | Returns `[]` |
| 7 | IMDB page with no genres | Returns actor/director tags only |
| 8 | Steam Early Access game | Includes "early access" tag |
| 9 | URL pattern mismatch | Regex fails, error or `[]` |
| 10 | Redirect chain (301/302) | `Api()` follows redirects, parses final URL |
| 11 | Non-English tags | Preserved as-is or normalized to ASCII |
| 12 | URL with query params | Params stripped before ID extraction |
| 13 | Mobile site URLs (m.imdb.com) | Redirected to desktop or parsed as-is |

#### Error Handling
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 14 | Network timeout | Retry via `Api()`, eventual rejection |
| 15 | HTTP 404 (invalid ID) | Returns `[]` or error logged |
| 16 | Malformed HTML response | Parsing fails, returns `[]` |
| 17 | `type` not recognized | Default case returns `[]` |
| 18 | URL is `null` or `undefined` | Error thrown or returns `[]` |
| 19 | CORS/SSL errors | `Api()` propagates error |

#### Authentication Scenarios
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 20 | Public page access | No auth required, succeeds |
| 21 | Age-gated content (Steam) | May return restricted tags or error |
| 22 | Geo-blocked content | Request fails with regional error |

---

## 2.4 `youtubePlaylist()` — YouTube Playlist Paginator

### Purpose
Fetches items from a YouTube playlist using YouTube Data API v3 with pagination support. Returns a single item at specified index, along with navigation metadata (is_end, total_count).

### Invocation & Authentication
```js
defaultExport.youtubePlaylist(id: string, index: number, pageToken?: string, back?: boolean): Promise<[object, boolean, number]>
```
- **Parameters**:
  - `id`: YouTube playlist ID (e.g., `PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf`)
  - `index`: Zero-based index of item to fetch
  - `pageToken` (optional): Pagination token from previous call
  - `back` (optional): If `true`, navigate backwards through pages
- **Authentication**: Uses Google API key via `GoogleApi('y playlist', ...)`
- Returns `[item_object, is_end_boolean, total_count]`

### Logic Flow
1. **API Call**:
   - Construct request: `GoogleApi('y playlist', { id, pageToken, maxResults: 50 })`
   - Receive response with `items[]`, `nextPageToken`, `pageInfo.totalResults`
2. **Index Resolution**:
   - Calculate which page contains `index`
   - If `index` beyond current page, recursively call with `nextPageToken`
   - If `index` within current page, extract item at position
3. **End Detection**:
   - If `nextPageToken` is absent → `is_end = true`
   - If `back === true` and no `prevPageToken` → `is_end = true`
4. **Item Transformation**:
   - Extract `videoId`, `title`, `thumbnail`, `publishedAt`
   - Normalize to internal schema
5. **Return**: `[item, is_end, total_count]`

### Returns & Side Effects
- **Returns**: `Promise<[object, boolean, number]>`
  - `item`: Playlist item with video metadata
  - `is_end`: Boolean indicating last item
  - `total_count`: Total items in playlist
- **Side Effects**:
  - YouTube Data API quota consumption (~1-3 units per call)
  - Recursive calls for deep pagination (multiple API requests)

### Snapshot Testing Data

#### Input: First Item of Playlist
```js
id: "PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf"
index: 0
pageToken: undefined
back: false
```

#### Expected Output:
```js
[
  {
    id: "dQw4w9WgXcQ",
    name: "Rick Astley - Never Gonna Give You Up",
    thumb: "https://i.ytimg.com/vi/dQw4w9WgXcQ/default.jpg",
    date: "2009-10-25T06:57:33Z"
  },
  false,  // Not the last item
  217     // Total items in playlist
]
```

#### Input: Last Item of Playlist
```js
id: "PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf"
index: 216
pageToken: "CBQQAA"
back: false
```

#### Expected Output:
```js
[
  {
    id: "J9gKyRmic20",
    name: "Last Video in Playlist",
    thumb: "https://i.ytimg.com/vi/J9gKyRmic20/default.jpg",
    date: "2023-05-20T12:00:00Z"
  },
  true,   // Last item
  217
]
```

### Comprehensive Test Scenarios

#### Logical Branches
| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | First item, no token | `index=0`, `pageToken=undefined` | First item, `is_end=false` |
| 2 | Mid-playlist item | `index=25` | Correct item at index 25 |
| 3 | Last item in playlist | `index=total_count-1` | Last item, `is_end=true` |
| 4 | Item on second page | `index=60` (page size 50) | Recursive call with `nextPageToken` |
| 5 | Backwards navigation | `back=true`, `pageToken` present | Previous page fetched |
| 6 | Item at page boundary | `index=49` (last on page 1) | Correct item, `is_end=false` |

#### Edge Cases
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 7 | Empty playlist | Total count = 0, returns `[null, true, 0]` |
| 8 | Single-item playlist | `index=0`, returns item with `is_end=true` |
| 9 | Index out of bounds | `index >= total_count`, error or null item |
| 10 | Invalid playlist ID | YouTube API error (404), propagated |
| 11 | Private/deleted videos | Item skipped or marked as unavailable |
| 12 | Extremely large playlist (5000+ items) | Multiple recursive API calls, eventual result |
| 13 | Negative index | Error or treated as 0 |
| 14 | Non-integer index | Rounded down or error |

#### Error Handling
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 15 | YouTube API rate limit | 403 error, propagated to caller |
| 16 | Network timeout | Retry logic in `GoogleApi`, eventual error |
| 17 | Invalid pageToken | API error (400), propagated |
| 18 | API key quota exceeded | Daily quota error (403) |
| 19 | Malformed API response | Parsing error, rejected promise |

#### Authentication Scenarios
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 20 | Valid API key | Request succeeds |
| 21 | API key missing | 400 error from YouTube |
| 22 | API key revoked | 403 error |
| 23 | OAuth vs API key | Uses API key (not OAuth) |

---

## 2.5 `getSingleId()` — Single Item Fetcher

### Purpose
Deep-fetches a single media item from external sources with full metadata. Used when user clicks on a list item to view details. Supports pagination context (previous/next) and returns navigation metadata.

### Invocation & Authentication
```js
defaultExport.getSingleId(type: string, url: string, index: number, pageToken?: string, back?: boolean): Promise<[object, boolean, number]>
```
- **Parameters**:
  - `type`: Source type (`'youtube'`, `'lovetv'`, `'eztv'`, `'yify'`, `'kubo'`, `'dm5'`, `'bilibili'`)
  - `url`: Item or list URL
  - `index`: Item index within list context
  - `pageToken` (optional): For YouTube playlists
  - `back` (optional): Navigation direction
- **Authentication**: None for most sources; Google API key for YouTube
- Returns `[item_data, is_end, total_count]`

### Logic Flow
1. **Type Dispatch**: Switch on `type`:
   - `'youtube'` → Delegate to `youtubePlaylist()`
   - `'lovetv'` → Scrape lovetv drama episode list
   - `'eztv'` → Parse EZTV torrent page
   - `'yify'` → Fetch YIFY movie with torrent links
   - `'kubo'` → Extract Kubo video episode data
   - `'dm5'` → Scrape DM5 manga chapter
   - `'bilibili'` → Parse Bilibili video metadata
2. **List Context Handling**:
   - If `url` is a list page, parse to find item at `index`
   - Extract item's detail page URL
   - Fetch detail page HTML
3. **Detail Scraping**:
   - `Api('url', detail_url)` → HTML
   - `Htmlparser.parseDOM()` → DOM tree
   - Extract: title, thumbnail, description, video sources, download links, subtitles
4. **Navigation Metadata**:
   - Determine if `index` is last in list → `is_end`
   - Calculate `total_count` from list metadata
5. **Caching** (some types):
   - Check Redis: `Redis('get', cache_key)`
   - If miss, fetch and store: `Redis('setex', cache_key, CACHE_EXPIRE, data)`
6. **Return**: `[item_object, is_end, total_count]`

### Returns & Side Effects
- **Returns**: `Promise<[object, boolean, number]>`
  - `item_object`: Full item metadata
  - `is_end`: Boolean indicating last item
  - `total_count`: Total items in source list
- **Side Effects**:
  - HTTP requests to external sources
  - Redis cache reads/writes (if enabled)
  - No MongoDB writes (read-only operation)

### Snapshot Testing Data

#### Input: YIFY Movie Detail
```js
type: 'yify'
url: 'https://yts.mx/movies/inception-2010'
index: 0
```

#### Expected Output:
```js
[
  {
    id: 12345,
    name: "Inception",
    thumb: "https://img.yts.mx/assets/images/movies/inception_2010/large-cover.jpg",
    year: "2010",
    rating: 8.8,
    genre: ["Action", "Sci-Fi", "Thriller"],
    description: "A thief who steals corporate secrets...",
    torrents: [
      {
        quality: "720p",
        type: "bluray",
        size: "1.2GB",
        url: "magnet:?xt=urn:btih:..."
      },
      {
        quality: "1080p",
        type: "bluray",
        size: "2.4GB",
        url: "magnet:?xt=urn:btih:..."
      }
    ],
    imdb: "tt1375666",
    runtime: 148
  },
  true,  // Single item (no list context)
  1
]
```

#### Input: YouTube Playlist Item
```js
type: 'youtube'
url: 'https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf'
index: 5
```

#### Expected Output:
```js
[
  {
    id: "dQw4w9WgXcQ",
    name: "Video Title at Index 5",
    thumb: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    date: "2021-03-15T10:30:00Z",
    channel: "Channel Name",
    views: 1500000
  },
  false,  // Not last item
  217     // Total in playlist
]
```

### Comprehensive Test Scenarios

#### Logical Branches
| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | YouTube playlist item | `type='youtube'`, valid playlist URL | Delegates to `youtubePlaylist()` |
| 2 | YIFY movie detail | `type='yify'`, movie URL | Full movie metadata with torrents |
| 3 | EZTV torrent page | `type='eztv'`, episode URL | Episode info with magnet links |
| 4 | Kubo video episode | `type='kubo'`, episode URL | Video sources and subtitles |
| 5 | DM5 manga chapter | `type='dm5'`, chapter URL | Chapter images and metadata |
| 6 | Bilibili video | `type='bilibili'`, video URL | Video info with embed URL |
| 7 | LoveTV drama episode | `type='lovetv'`, episode URL | Episode metadata |
| 8 | Each supported type | All 7+ type values | Type-specific detail scraping |

#### Edge Cases
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 9 | First item in list | `index=0`, `is_end=false` |
| 10 | Last item in list | `index=total_count-1`, `is_end=true` |
| 11 | Single-item source | No list context, `is_end=true`, `total_count=1` |
| 12 | Index out of bounds | Error or null item |
| 13 | URL to list page | Parses list, extracts item at index |
| 14 | Direct item URL | Fetches item directly, `total_count=1` |
| 15 | Cached item in Redis | Returns cached data, no HTTP request |
| 16 | Cache miss | Fetches from source, stores in Redis |
| 17 | Redis unavailable | Falls back to direct fetch |
| 18 | HTML structure changed | Parsing fails, error or partial data |

#### Error Handling
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 19 | Network timeout | Retry via `Api()`, eventual error |
| 20 | HTTP 404 (item deleted) | Error propagated to caller |
| 21 | Parsing error | Logged via `handleError()`, rejected |
| 22 | Invalid `type` parameter | Default case error or `[]` |
| 23 | Malformed URL | URL parsing error, propagated |
| 24 | YouTube API rate limit | 403 error from YouTube |
| 25 | Redis connection error | Logged, continues without cache |

#### Authentication Scenarios
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 26 | YouTube (requires API key) | Uses `GoogleApi` with key |
| 27 | Public sources (YIFY, etc.) | No auth required |
| 28 | Login-walled content | Fails with 401/403 (not supported) |

---

## 2.6 `saveSingle()` — Single Item Metadata Persister

### Purpose
Persists metadata for a single item to MongoDB's `STORAGEDB` collection. Extracts comprehensive metadata (tags, thumbnails, URLs) and stores in normalized format for search and retrieval.

### Invocation & Authentication
```js
defaultExport.saveSingle(type: string, id: string | number): Promise<[string, Set<string>, Set<string>, string, string, string]>
```
- **Parameters**:
  - `type`: Source type (`'yify'`, `'kubo'`, `'dm5'`, `'eztv'`)
  - `id`: Item identifier from source
- **Authentication**: None for external fetch; requires user session for DB write
- Returns tuple: `[name, tags_set, additional_tags_set, type_name, thumbnail_url, full_url]`

### Logic Flow
1. **Type Dispatch**: Switch on `type`:
   - `'yify'` → Fetch YIFY movie API JSON
   - `'kubo'` → Scrape Kubo video page
   - `'dm5'` → Parse DM5 manga metadata
   - `'eztv'` → Extract EZTV show info
2. **Data Fetching**:
   - `Api('url', constructed_url)` or API endpoint
   - Parse response (JSON or HTML)
3. **Tag Extraction**:
   - **Primary tags**: Genres, categories, actors
   - **Additional tags**: Year, rating, keywords
   - Apply `normalize()` and filter via `isDefaultTag()`
4. **Thumbnail Resolution**:
   - Extract high-res thumbnail URL
   - Fallback to medium/small if unavailable
5. **URL Construction**:
   - Build canonical URL for item
   - Extract download/magnet links
6. **MongoDB Insert** (not in this function, prepared for caller):
   - Returns data tuple for caller to insert
7. **Return**: `[name, tags_set, additional_tags_set, type_name, thumbnail_url, full_url]`

### Returns & Side Effects
- **Returns**: `Promise<[string, Set<string>, Set<string>, string, string, string]>`
  - `name`: Item display name
  - `tags_set`: Primary tag Set
  - `additional_tags_set`: Secondary tag Set
  - `type_name`: Content type (e.g., "movie", "video")
  - `thumbnail_url`: Image URL
  - `full_url`: Canonical item URL
- **Side Effects**:
  - HTTP requests to external sources
  - No direct DB writes (returns data for caller)

### Snapshot Testing Data

#### Input: YIFY Movie
```js
type: 'yify'
id: 12345
```

#### Expected Output:
```js
[
  "Inception",                              // name
  Set(["action", "sci-fi", "thriller", "christopher nolan", "leonardo dicaprio"]), // tags_set
  Set(["2010", "8.8", "148min", "tt1375666"]), // additional_tags_set
  "movie",                                  // type_name
  "https://img.yts.mx/assets/images/movies/inception_2010/large-cover.jpg", // thumbnail_url
  "https://yts.mx/movies/inception-2010"    // full_url
]
```

#### Input: DM5 Manga
```js
type: 'dm5'
id: "one-piece"
```

#### Expected Output:
```js
[
  "航海王",
  Set(["manga", "adventure", "shonen", "eiichiro oda"]),
  Set(["1997", "ongoing", "chapter-1087"]),
  "manga",
  "https://mhpic.jumanhua.com/comic/o/onepiece/cover.jpg",
  "https://www.dm5.com/manhua-one-piece/"
]
```

### Comprehensive Test Scenarios

#### Logical Branches
| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | YIFY movie | `type='yify'`, valid movie ID | Full movie metadata tuple |
| 2 | Kubo video | `type='kubo'`, video ID | Video metadata tuple |
| 3 | DM5 manga | `type='dm5'`, manga ID | Manga metadata tuple |
| 4 | EZTV show | `type='eztv'`, show ID | Show metadata tuple |
| 5 | Each supported type | All 4 type values | Type-specific extraction |

#### Edge Cases
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 6 | Item with no tags | Returns empty Sets for tags |
| 7 | Item with no thumbnail | `thumbnail_url` is `null` or empty string |
| 8 | Extremely long name | Name truncated or preserved as-is |
| 9 | Special characters in name | Sanitized via `toValidName()` |
| 10 | Duplicate tags | Set deduplicates automatically |
| 11 | Mixed case tags | Normalized to lowercase |
| 12 | Item with default tags | Filtered out via `isDefaultTag()` |
| 13 | Non-existent item ID | API/scrape returns 404 or null |
| 14 | Malformed API response | Parsing error, rejected promise |

#### Error Handling
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 15 | Network timeout | Retry via `Api()`, eventual error |
| 16 | HTTP 404 (invalid ID) | Error propagated to caller |
| 17 | Parsing error | Logged and rejected |
| 18 | Invalid `type` parameter | Default case error |
| 19 | `id` is `null` or `undefined` | Error thrown |
| 20 | Tag normalization fails | Error logged, tag skipped |

#### Authentication Scenarios
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 21 | Public external source | No auth required, succeeds |
| 22 | API key required (future) | Would need key in config |

---

## 3. Named Export Functions

---

## 3.1 `bilibiliVideoUrl()` — Bilibili Video Extractor

### Purpose
Extracts video metadata and embed URLs from Bilibili (Chinese video platform). Uses Bilibili's public API to fetch video info and constructs embed player URL.

### Invocation & Authentication
```js
import { bilibiliVideoUrl } from '../models/external-tool.js';
bilibiliVideoUrl(url: string): Promise<object>
```
- **Parameters**:
  - `url`: Bilibili video URL (format: `https://www.bilibili.com/video/av{id}` or `https://www.bilibili.com/video/BV{bvid}`)
- **Authentication**: None required (public API)
- Returns video metadata with embed URL

### Logic Flow
1. **ID Extraction**:
   - Parse URL for `av{id}` (e.g., `av170001`)
   - Extract numeric ID: `170001`
2. **API Call**:
   - `Api('url', 'https://api.bilibili.com/x/web-interface/view?aid={id}')`
   - Response is JSON with video metadata
3. **Response Parsing**:
   - Extract `data.title` → video title
   - Extract `data.aid` → video ID
   - Extract `data.bvid` → BV ID (newer format)
4. **Embed URL Construction**:
   - Build: `https://player.bilibili.com/player.html?aid={aid}&bvid={bvid}`
5. **Return**: Object with title, video array, embed array

### Returns & Side Effects
- **Returns**: `Promise<object>`
  ```js
  {
    title: "Video Title",
    video: [],  // Empty (direct URLs not exposed by API)
    embed: ["https://player.bilibili.com/player.html?aid=170001&bvid=BV17x411w7KC"]
  }
  ```
- **Side Effects**:
  - HTTP request to Bilibili API
  - No database writes

### Snapshot Testing Data

#### Input:
```js
url: "https://www.bilibili.com/video/av170001"
```

#### Expected Output:
```js
{
  title: "【東方】Bad Apple!! ＰＶ【影絵】",
  video: [],
  embed: ["https://player.bilibili.com/player.html?aid=170001&bvid=BV17x411w7KC"]
}
```

### Comprehensive Test Scenarios

#### Logical Branches
| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Standard AV URL | `https://www.bilibili.com/video/av170001` | Title and embed URL |
| 2 | BV URL format | `https://www.bilibili.com/video/BV17x411w7KC` | Correct parsing (if supported) |
| 3 | Mobile URL | `https://m.bilibili.com/video/av170001` | Same result |

#### Edge Cases
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 4 | Invalid video ID | API returns error (404 or -404 code) |
| 5 | Deleted video | API error, propagated |
| 6 | Private video | API error (access denied) |
| 7 | URL without ID | Parsing fails, error |
| 8 | Non-Bilibili URL | ID extraction fails, error |

#### Error Handling
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 9 | Network timeout | Retry, eventual error |
| 10 | Bilibili API down | 500 error, propagated |
| 11 | Malformed JSON response | Parsing error |
| 12 | URL is `null` | Error thrown |

#### Authentication Scenarios
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 13 | Public video | No auth required, succeeds |
| 14 | Region-locked video | May fail based on server IP |

---

## 3.2 `kuboVideoUrl()` — Kubo Multi-Player Extractor

### Purpose
Extracts video URLs from Kubo (99kubo.tv) with support for multiple player types. Handles 3 different player implementations (kdy, kud, kyu) with varying URL structures and subtitle support.

### Invocation & Authentication
```js
import { kuboVideoUrl } from '../models/external-tool.js';
kuboVideoUrl(id: string, url: string, subIndex?: number): Promise<object>
```
- **Parameters**:
  - `id`: Player type identifier (`'kdy'`, `'kud'`, `'kyu'`)
  - `url`: Kubo video page URL
  - `subIndex` (optional): Subtitle/source index (default: `1`)
- **Authentication**: None required
- Returns video URLs and optional subtitle info

### Logic Flow
1. **Type Dispatch**: Switch on `id`:
   - `'kdy'` → KDY player (most common)
   - `'kud'` → KUD player variant
   - `'kyu'` → KYU player (older format)
2. **Page Fetch**:
   - `Api('url', url)` → HTML response
   - `Htmlparser.parseDOM(raw_data)` → DOM tree
3. **Player-Specific Parsing**:
   - **KDY**: Extract from `<script>` tag containing `player_aaaa=` variable
     - Parse JSON object with video sources
     - Support multiple subtitle tracks
     - Return: `{ video: [urls], url: [urls], title, sub: count }`
   - **KUD**: Similar to KDY but different variable name
   - **KYU**: Parse from `player_data` with iframe fallback
4. **Subtitle Handling** (if `subIndex` provided):
   - Select subtitle track at index
   - Extract subtitle URL and video URL pair
5. **URL Resolution**:
   - Resolve relative URLs to absolute
   - Handle CDN variations
6. **Return**: Object with video URLs and metadata

### Returns & Side Effects
- **Returns**: `Promise<object>`
  - KDY/KUD format:
    ```js
    {
      video: ["https://cdn1.99kubo.tv/20230515/vid1.m3u8", "https://cdn2.99kubo.tv/20230515/vid1.m3u8"],
      url: ["https://cdn1.99kubo.tv/20230515/vid1.m3u8"],
      title: "進擊的巨人 第12集",
      sub: 3  // Number of subtitle tracks
    }
    ```
  - KYU format:
    ```js
    {
      video: ["https://v.99kubo.tv/play/abc123.mp4"],
      url: ["https://v.99kubo.tv/play/abc123.mp4"]
    }
    ```
- **Side Effects**:
  - HTTP request to Kubo
  - No database writes

### Snapshot Testing Data

#### Input: KDY Player
```js
id: 'kdy'
url: 'https://www.99kubo.tv/vod-play/12345-1-12.html'
subIndex: 1
```

#### Expected Output:
```js
{
  video: [
    "https://cdn1.99kubo.tv/20230515/12345_12.m3u8",
    "https://cdn2.99kubo.tv/20230515/12345_12.m3u8"
  ],
  url: ["https://cdn1.99kubo.tv/20230515/12345_12.m3u8"],
  title: "進擊的巨人 第12集",
  sub: 2
}
```

#### Input: KYU Player (Fallback)
```js
id: 'kyu'
url: 'https://www.99kubo.tv/vod-play/old-12345-1-1.html'
subIndex: 1
```

#### Expected Output:
```js
{
  video: ["https://v.99kubo.tv/play/old_12345.mp4"],
  url: ["https://v.99kubo.tv/play/old_12345.mp4"]
}
```

### Comprehensive Test Scenarios

#### Logical Branches
| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | KDY player | `id='kdy'`, valid URL | Video URLs with subtitle info |
| 2 | KUD player | `id='kud'`, valid URL | KUD-specific parsing |
| 3 | KYU player | `id='kyu'`, valid URL | KYU-specific parsing |
| 4 | subIndex = 1 | Default subtitle track | First subtitle source |
| 5 | subIndex = 2 | Second subtitle track | Second subtitle source |
| 6 | Multiple CDN mirrors | Page with 2+ CDN URLs | All URLs in `video` array |

#### Edge Cases
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 7 | Page with no subtitles | `sub` field omitted or `0` |
| 8 | Single CDN source | `video` and `url` arrays have 1 item |
| 9 | subIndex out of bounds | Returns last available or error |
| 10 | Invalid player ID | Default case, may error |
| 11 | URL with no video data | Empty arrays or null |
| 12 | Relative video URLs | Converted to absolute with base URL |
| 13 | M3U8 playlist URLs | Returned as-is for HLS playback |
| 14 | Direct MP4 URLs | Returned for direct download |

#### Error Handling
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 15 | Network timeout | Retry, eventual error |
| 16 | HTTP 404 | Error propagated |
| 17 | Malformed HTML | Parsing error, rejected |
| 18 | Missing `player_aaaa` variable | Error or empty result |
| 19 | Invalid JSON in script tag | JSON parse error |
| 20 | `id` is `null` or `undefined` | Error or default behavior |

#### Authentication Scenarios
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 21 | Public video | No auth required, succeeds |
| 22 | Premium content | May fail if not supported |

---

## 3.3 `youtubeVideoUrl()` — YouTube-DL Wrapper

### Purpose
Extracts video and audio URLs from multiple platforms using `youtube-dl-exec` (yt-dlp). Supports YouTube, Dailymotion, LINE TV, iQiyi, Youku, and others. Returns direct media URLs or embed URLs depending on platform.

### Invocation & Authentication
```js
import { youtubeVideoUrl } from '../models/external-tool.js';
youtubeVideoUrl(id: string, url: string): Promise<object>
```
- **Parameters**:
  - `id`: Platform identifier (`'you'`, `'dym'`, `'lin'`, `'iqi'`, `'yuk'`, or generic)
  - `url`: Video URL from respective platform
- **Authentication**: None required (uses public extraction)
- Returns media URLs and metadata

### Logic Flow
1. **Platform Detection**: Switch on `id`:
   - `'you'` → YouTube (video + audio split)
   - `'dym'` → Dailymotion
   - `'lin'` → LINE TV
   - `'iqi'` → iQiyi
   - `'yuk'` → Youku (with iframe embed)
   - Default → Generic platform
2. **youtube-dl-exec Call**:
   - For YouTube: `youtubedl(url, { dumpSingleJson: true, format: 'bestvideo+bestaudio' })`
   - For others: `youtubedl(url, { dumpSingleJson: true })`
   - Returns JSON with format list
3. **Format Selection**:
   - **YouTube**: Find best video format (h264, VP9) + best audio (m4a, opus)
   - **Others**: Extract all available format URLs
4. **URL Extraction**:
   - Parse `formats` array from JSON
   - Filter by codec, quality preferences
   - Build URL arrays
5. **Special Handling**:
   - **Youku**: Detect FLV format → construct iframe embed URL
   - **YouTube**: Return separate video and audio URLs
6. **Return**: Object with video, audio, embed, iframe, title fields

### Returns & Side Effects
- **Returns**: `Promise<object>`
  - YouTube format:
    ```js
    {
      video: ["https://rr5---sn-..googlevideo.com/videoplayback?..."],
      audio: "https://rr5---sn-..googlevideo.com/videoplayback?...",
      title: "Video Title"
    }
    ```
  - Generic format:
    ```js
    {
      video: ["https://platform.com/video1.mp4", "https://platform.com/video2.mp4"],
      title: "Video Title"
    }
    ```
  - Youku (FLV) format:
    ```js
    {
      video: ["https://v.youku.com/v_show/id_XMTIzNDU2Nzg5MA==.html?spm=..."],
      iframe: ["//player.youku.com/embed/XMTIzNDU2Nzg5MA=="]
    }
    ```
- **Side Effects**:
  - Spawns `youtube-dl-exec` subprocess
  - HTTP requests to video platforms
  - CPU/memory usage for video metadata extraction
  - No database writes

### Snapshot Testing Data

#### Input: YouTube Video
```js
id: 'you'
url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
```

#### Expected Output:
```js
{
  video: ["https://rr5---sn-ab5l6nls.googlevideo.com/videoplayback?expire=1234567890&ei=..."],
  audio: "https://rr5---sn-ab5l6nls.googlevideo.com/videoplayback?expire=1234567890&ei=...&mime=audio%2Fmp4",
  title: "Rick Astley - Never Gonna Give You Up (Official Video)"
}
```

#### Input: Dailymotion Video
```js
id: 'dym'
url: 'https://www.dailymotion.com/video/x8b9xyz'
```

#### Expected Output:
```js
{
  video: [
    "https://www.dailymotion.com/cdn/H264-1280x720/video/x8b9xyz.mp4",
    "https://www.dailymotion.com/cdn/H264-854x480/video/x8b9xyz.mp4"
  ],
  title: "Dailymotion Video Title"
}
```

#### Input: Youku Video (FLV)
```js
id: 'yuk'
url: 'https://v.youku.com/v_show/id_XMTIzNDU2Nzg5MA==.html'
```

#### Expected Output:
```js
{
  video: ["https://v.youku.com/v_show/id_XMTIzNDU2Nzg5MA==.html?type=flv"],
  iframe: ["//player.youku.com/embed/XMTIzNDU2Nzg5MA=="]
}
```

### Comprehensive Test Scenarios

#### Logical Branches
| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | YouTube video | `id='you'`, YouTube URL | Video + audio URLs separated |
| 2 | Dailymotion video | `id='dym'`, Dailymotion URL | Multiple quality video URLs |
| 3 | LINE TV video | `id='lin'`, LINE TV URL | LINE-specific extraction |
| 4 | iQiyi video | `id='iqi'`, iQiyi URL | iQiyi video URLs |
| 5 | Youku video (FLV) | `id='yuk'`, Youku URL with FLV | Iframe embed URL |
| 6 | Youku video (non-FLV) | `id='yuk'`, Youku URL without FLV | Direct video URLs |
| 7 | Generic platform | `id='generic'`, unsupported platform | Best-effort extraction |

#### Edge Cases
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 8 | Video with no audio | `audio` field omitted or empty |
| 9 | Audio-only content | `video` array empty, `audio` present |
| 10 | Multiple video qualities | All qualities in `video` array |
| 11 | Age-restricted YouTube | May fail without auth |
| 12 | Private/deleted video | youtube-dl error propagated |
| 13 | Live stream URL | May return manifest URL or error |
| 14 | Playlist URL | Only extracts first video (or error) |
| 15 | Short URL (youtu.be) | Resolves to full URL, extracts |
| 16 | Mobile URL (m.youtube.com) | Resolves and extracts normally |

#### Error Handling
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 17 | youtube-dl-exec not installed | Process spawn error |
| 18 | youtube-dl-exec crashes | Error caught, propagated |
| 19 | Unsupported URL | youtube-dl error message |
| 20 | Network timeout | youtube-dl timeout error |
| 21 | Invalid JSON from youtube-dl | JSON parse error |
| 22 | Empty format list | Returns empty `video` array |
| 23 | `url` is `null` or `undefined` | Error thrown by youtube-dl |
| 24 | Geo-blocked content | youtube-dl error (403) |

#### Authentication Scenarios
| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 25 | Public videos | No auth required, succeeds |
| 26 | Login-required content | Fails (cookies not passed) |
| 27 | Premium-only content | Extraction fails |

---

## 4. Internal Helper Functions

### Overview
The module contains numerous internal helper functions not exported but critical for operation:

| Function | Purpose |
|----------|---------|
| `updateDocDate()` | Updates document date in `DOCDB` for tracking last scrape |
| `findTag()` | DOM traversal utility (from `utility.js`) |
| `toValidName()` | Sanitizes filenames (from `utility.js`) |
| `normalize()` | Tag normalization (from `tag-tool.js`) |
| `isDefaultTag()` | Filters blacklisted tags (from `tag-tool.js`) |
| `addPre()` | Prepends base URL to relative paths (from `utility.js`) |
| `torrent2Magnet()` | Converts torrent data to magnet URI (from `utility.js`) |

### Testing Strategy for Internal Functions
- **Unit Test via Exported Functions**: Test indirectly through public API
- **Stub External Dependencies**: Mock `Api()`, `GoogleApi()`, `Mongo()`, `Redis()`
- **Boundary Testing**: Test edge cases in DOM parsing, URL construction
- **Regression Testing**: Snapshot HTML samples from external sources

---

## 5. Testing Infrastructure Recommendations

### 5.1 Mock Strategy

#### HTTP Mocking
```js
// Mock Api() for external requests
jest.mock('../api-tool.js', () => ({
  default: jest.fn((method, url, options) => {
    if (url.includes('yts.mx')) {
      return Promise.resolve(mockYifyHtml);
    }
    if (url.includes('bilibili.com')) {
      return Promise.resolve(mockBilibiliJson);
    }
    return Promise.reject(new Error('Unmocked URL'));
  })
}));
```

#### HTML Parser Mocking
```js
// Use real Htmlparser with fixture HTML strings
import Htmlparser from 'htmlparser2';
const dom = Htmlparser.parseDOM(fixtureHtml);
```

#### Database Mocking
```js
// Mock Mongo for reads/writes
jest.mock('../mongo-tool.js', () => ({
  default: jest.fn((op, coll, query, update) => {
    if (op === 'find') return Promise.resolve([mockDocument]);
    if (op === 'update') return Promise.resolve({ ok: 1 });
    return Promise.resolve();
  })
}));
```

### 5.2 Fixture Data

**Create fixtures directory**: `test/fixtures/external-tool/`

```
test/fixtures/external-tool/
├── yify-browse-page.html       # YIFY movie list HTML
├── yify-movie-detail.html      # YIFY movie detail page
├── bilibili-api-response.json  # Bilibili API JSON
├── kubo-kdy-player.html        # Kubo KDY player page
├── dm5-manga-list.html         # DM5 manga category
├── youtube-playlist-api.json   # YouTube Data API response
└── ...
```

### 5.3 Test File Structure

```
test/back/models/
├── external-tool.test.js
│   ├── describe('getSingleList')
│   │   ├── test('yify movie list')
│   │   ├── test('bilibili search')
│   │   ├── test('kubo category')
│   │   └── ...
│   ├── describe('save2Drive')
│   │   ├── test('kubo episode upload')
│   │   └── ...
│   ├── describe('parseTagUrl')
│   │   ├── test('imdb url')
│   │   └── ...
│   ├── describe('youtubePlaylist')
│   │   ├── test('first item')
│   │   ├── test('pagination')
│   │   └── ...
│   ├── describe('getSingleId')
│   │   └── ...
│   ├── describe('saveSingle')
│   │   └── ...
│   ├── describe('bilibiliVideoUrl')
│   │   └── ...
│   ├── describe('kuboVideoUrl')
│   │   └── ...
│   └── describe('youtubeVideoUrl')
│       └── ...
```

### 5.4 Integration Test Considerations

#### Live API Tests (Optional, Separate Suite)
```js
describe('external-tool integration (live)', () => {
  jest.setTimeout(30000); // 30s timeout
  
  test('real YouTube playlist fetch', async () => {
    // Use actual YouTube API (requires key)
    const result = await youtubePlaylist('PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf', 0);
    expect(result).toMatchSnapshot();
  });
});
```

**Run separately**: `npm test -- --testPathPattern=integration`

### 5.5 Performance Benchmarks

| Function | Expected Max Duration | Notes |
|----------|----------------------|-------|
| `getSingleList()` | 5s | Network-bound |
| `save2Drive()` | 30s | File upload, network-bound |
| `parseTagUrl()` | 3s | Single page scrape |
| `youtubePlaylist()` | 2s | API call |
| `getSingleId()` | 5s | Detail page scrape |
| `saveSingle()` | 3s | Metadata fetch |
| `bilibiliVideoUrl()` | 2s | API call |
| `kuboVideoUrl()` | 3s | Page scrape |
| `youtubeVideoUrl()` | 10s | youtube-dl subprocess |

---

## 6. Known Limitations & Edge Cases

### 6.1 External Site Dependencies
- **Risk**: HTML structure changes break parsers
- **Mitigation**: Fixture-based tests detect breakage; version pins on dependencies
- **Monitoring**: Log parsing errors to detect site changes

### 6.2 Rate Limiting
- **YIFY, EZTV**: May block after excessive requests
- **YouTube**: API quota (10,000 units/day)
- **Bilibili**: Soft limits on API calls
- **Mitigation**: Redis caching with `CACHE_EXPIRE` TTL; backoff in `Api()`

### 6.3 Geo-Restrictions
- **YouTube, Bilibili**: Some content region-locked
- **Behavior**: Returns error or empty results
- **Testing**: Mock geo-blocked responses

### 6.4 Authentication Limitations
- **No Cookie Support**: Login-walled content inaccessible
- **OAuth Limitation**: Only Google Drive OAuth implemented
- **Premium Content**: Cannot extract subscription-only media

### 6.5 youtube-dl-exec Dependency
- **Maintenance Risk**: youtube-dl/yt-dlp frequently updated
- **Breakage**: YouTube changes break extraction weekly
- **Mitigation**: Use yt-dlp (active fork), version pin, update regularly

---

## 7. Future Enhancements

### 7.1 Recommended Improvements
1. **Retry Logic**: Add exponential backoff for transient failures
2. **Circuit Breaker**: Disable failing sources temporarily
3. **Caching Layer**: Expand Redis caching to all functions
4. **Queue System**: Rate-limit with job queue (Bull, Agenda)
5. **Health Checks**: Periodic site availability tests
6. **Fallback Sources**: Alternate scrapers for redundancy
7. **WebSocket Notifications**: Real-time scrape status updates
8. **Admin Panel**: UI for managing external sources

### 7.2 Testability Improvements
1. **Dependency Injection**: Pass `Api`, `Mongo`, `Redis` as params
2. **Config Externalization**: Move site URLs to config files
3. **Parser Abstraction**: Separate DOM parsing logic into testable units
4. **Type Definitions**: Add TypeScript/JSDoc for better IDE support

---

## 8. Security Considerations

### 8.1 Input Validation
- **URL Sanitization**: Validate URLs before fetching
- **XSS Prevention**: Sanitize scraped HTML before rendering
- **Path Traversal**: Use `PathJoin()` for file operations
- **Injection Prevention**: Parameterize MongoDB queries

### 8.2 External Content Risks
- **Malicious HTML**: Untrusted HTML parsed (use Htmlparser2 safely)
- **Large Responses**: Limit HTTP response sizes
- **Redirect Loops**: Limit redirects in `Api()`
- **SSRF**: Validate URLs are external, not internal IPs

### 8.3 Secrets Management
- **Google API Key**: Store in `ver.js` (environment vars)
- **OAuth Tokens**: Encrypted in MongoDB `accessToken` collection
- **No Hardcoded Secrets**: All secrets externalized

---

## 9. Documentation Maintenance

### 9.1 Update Triggers
Update this document when:
- New external source added
- Function signature changes
- Error handling behavior changes
- External API version updates
- Breaking changes to HTML structure

### 9.2 Documentation Ownership
- **Primary**: Backend team
- **Review**: QA team (test scenarios)
- **Approval**: Tech lead

---

## 10. Appendix: External Source Details

### 10.1 Supported Sources

| Type | Name | URL Pattern | Content Type | Status |
|------|------|-------------|--------------|--------|
| `yify` | YIFY Torrents | `yts.mx` | Movies (torrents) | Active |
| `bilibili` | Bilibili | `bilibili.com` | Videos | Active |
| `kubo` | 99Kubo | `99kubo.tv` | TV shows/anime | Active |
| `dm5` | DM5 | `dm5.com` | Manga | Active |
| `eztv` | EZTV | `eztv.re` | TV torrents | Active |
| `bls`, `cen`, `bea`, etc. | Various manga/video | Multiple | Manga/video | Various |
| `youtube` | YouTube | `youtube.com` | Videos/playlists | Active |
| `imdb` | IMDB | `imdb.com` | Movie metadata | Active |
| `steam` | Steam | `steampowered.com` | Game metadata | Active |
| `youku` | Youku | `youku.com` | Videos | Active |
| `dailymotion` | Dailymotion | `dailymotion.com` | Videos | Active |
| `linetv` | LINE TV | `tv.line.me` | Videos | Active |
| `iqiyi` | iQiyi | `iqiyi.com` | Videos | Active |

### 10.2 External API Versions

| Service | API Version | Docs |
|---------|-------------|------|
| YouTube Data API | v3 | https://developers.google.com/youtube/v3 |
| Bilibili API | Unofficial | Community-documented |
| youtube-dl-exec | yt-dlp 2023+ | https://github.com/yt-dlp/yt-dlp |

---

**Document Version**: 1.0
**Last Updated**: 2024-03-24
**Next Review**: 2024-06-24

