# external-tool.js — QA Testing Strategy & Technical Documentation

> **Module**: `src/back/models/external-tool.js`
> **Project**: ANoMoPi (anomopi.com)
> **Role**: External media source integration — scraping, parsing, metadata extraction from YIFY, DM5, Steam, IMDB, and more
> **External Dependencies**: `node-opencc`, `htmlparser2`, `mkdirp`, `fs`, `read-torrent`
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
   - 2.4 [`getSingleId()`](#24-getsingleid--single-item-fetcher)
   - 2.5 [`saveSingle()`](#25-savesingle--single-item-metadata-persister)
3. [Internal Helper Functions](#3-internal-helper-functions)

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

### Module Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      external-tool.js                           │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Default Export Object (5 functions)                   │   │
│  ├────────────────────────────────────────────────────────┤   │
│  │  getSingleList()  ─┬─> YIFY, DM5, Steam, IMDB scrape  │   │
│  │                    └─> Returns: [{id, name, thumb}]    │   │
│  │                                                         │   │
│  │  save2Drive()      ─┬─> Parse external source HTML     │   │
│  │                    ├─> Extract video/torrent links     │   │
│  │                    └─> Upload to Google Drive          │   │
│  │                                                         │   │
│  │  parseTagUrl()     ─┬─> IMDB, Steam tag parsing        │   │
│  │                    └─> Extract tags from URL metadata  │   │
│  │                                                         │   │
│  │  getSingleId()     ─┬─> Single item deep fetch         │   │
│  │                    ├─> YIFY, DM5 item retrieval        │   │
│  │                    └─> Returns: [item, isEnd, total]   │   │
│  │                                                         │   │
│  │  saveSingle()      ─┬─> Persist metadata to MongoDB    │   │
│  │                    └─> Returns: [name, tags, ...]      │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                 │
│  External Dependencies:                                        │
│  ├─ Api() ──────────────> HTTP GET/POST with retries          │
│  ├─ GoogleApi() ────────> Google Drive upload                  │
│  ├─ Redis() ────────────> Caching layer (TTL: CACHE_EXPIRE)   │
│  ├─ Mongo() ────────────> CRUD operations on STORAGEDB         │
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
Fetches paginated lists of media items from external sources. Supports various platforms including torrent sites (YIFY), manga (DM5), and metadata sources (Steam, IMDB). Returns standardized item arrays with `id`, `name`, `thumb`, `date`, `tags`, `rating`, `count`.

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
| 2 | DM5 manga category | `type='dm5'`, category URL | Array of manga with chapter counts |
| 3 | POST request type | Any type supporting POST, with `post` object | Correct POST data sent |
| 4 | Each of 15+ supported types | All `type` values | Type-specific parsing logic executes |

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
  - `type`: External source type (e.g., `'bls'`, `'cen'`)
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

#### Input: DM5 Manga Upload
```js
type: 'dm5'
obj: {
  name: "One Piece Chapter 1",
  date: "2023-05-15",
  url: "https://www.dm5.com/manhua-onepiece/"
}
parent: "1DriveParentFolderId"
```

#### Expected Behavior:
1. Fetch HTML from DM5 URL
2. Parse DOM to extract image `<img src="https://...image.jpg">`
3. Call `GoogleApi('upload', { name: "One Piece Chapter 1", url: "https://...image.jpg", parent: "1DriveParentFolderId" })`
4. Return Google Drive file object

### Comprehensive Test Scenarios

#### Logical Branches
| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 1 | Each supported `type` | All 15+ type values | Type-specific extraction logic |
| 2 | Valid obj with all fields | `{ name, date, url }` | Successful upload |
| 3 | obj missing `date` | `{ name, url }` | Date omitted, upload proceeds |
| 4 | Multiple video sources | HTML with multiple `<source>` | Upload all or first source (document) |
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
Extracts tags, genres, and metadata from various URL types (IMDB, Steam, etc.) to enrich file metadata. Parses URL patterns and scrapes linked pages to build comprehensive tag sets.

### Invocation & Authentication
```js
defaultExport.parseTagUrl(type: string, url: string): Promise<Array<string>>
```
- **Parameters**:
  - `type`: URL source type (`'imdb'`, `'steam'`)
  - `url`: URL to parse/scrape
- **Authentication**: None required for public pages
- Returns array of normalized tag strings

### Logic Flow
1. **Type Dispatch**:
   - `'imdb'` → Extract IMDB movie ID, scrape genres/actors/directors
   - `'steam'` → Parse Steam app ID, fetch game categories/tags
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
  - HTTP requests to external sites (IMDB, Steam)
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


## 2.4 `getSingleId()` — Single Item Fetcher

### Purpose
Deep-fetches a single media item from external sources with full metadata. Used when user clicks on a list item to view details. Supports pagination context (previous/next) and returns navigation metadata.

### Invocation & Authentication
```js
defaultExport.getSingleId(type: string, url: string, index: number, pageToken?: string, back?: boolean): Promise<[object, boolean, number]>
```
- **Parameters**:
  - `type`: Source type (`'yify'`, `'dm5'`)
  - `url`: Item or list URL
  - `index`: Item index within list context
  - `pageToken` (optional): Not used
  - `back` (optional): Navigation direction
- **Authentication**: None required
- Returns `[item_data, is_end, total_count]`

### Logic Flow
1. **Type Dispatch**: Switch on `type`:
   - `'yify'` → Fetch YIFY movie with torrent links
   - `'dm5'` → Scrape DM5 manga chapter
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

### Comprehensive Test Scenarios

#### Logical Branches
| # | Scenario | Input | Expected |
|---|----------|-------|----------|
| 2 | YIFY movie detail | `type='yify'`, movie URL | Full movie metadata with torrents |
| 5 | DM5 manga chapter | `type='dm5'`, chapter URL | Chapter images and metadata |
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
| 25 | Redis connection error | Logged, continues without cache |

#### Authentication Scenarios
| # | Scenario | Expected Behavior |
|---|----------|-------------------|

| 26 | Public sources (YIFY, etc.) | No auth required |
| 27 | Login-walled content | Fails with 401/403 (not supported) |

---

## 2.5 `saveSingle()` — Single Item Metadata Persister

### Purpose
Persists metadata for a single item to MongoDB's `STORAGEDB` collection. Extracts comprehensive metadata (tags, thumbnails, URLs) and stores in normalized format for search and retrieval.

### Invocation & Authentication
```js
defaultExport.saveSingle(type: string, id: string | number): Promise<[string, Set<string>, Set<string>, string, string, string]>
```
- **Parameters**:
  - `type`: Source type (`'yify'`, `'dm5'`)
  - `id`: Item identifier from source
- **Authentication**: None for external fetch; requires user session for DB write
- Returns tuple: `[name, tags_set, additional_tags_set, type_name, thumbnail_url, full_url]`

### Logic Flow
1. **Type Dispatch**: Switch on `type`:
   - `'yify'` → Fetch YIFY movie API JSON
   - `'dm5'` → Parse DM5 manga metadata
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
| 3 | DM5 manga | `type='dm5'`, manga ID | Manga metadata tuple |
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

## 3. Internal Helper Functions

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

## 4. Testing Infrastructure Recommendations

### 4.1 Mock Strategy

#### HTTP Mocking
```js
// Mock Api() for external requests
jest.mock('../api-tool.js', () => ({
  default: jest.fn((method, url, options) => {
    if (url.includes('yts.mx')) {
      return Promise.resolve(mockYifyHtml);
    }
    if (url.includes('dm5.com')) {
      return Promise.resolve(mockDm5Html);
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

### 4.2 Fixture Data

**Create fixtures directory**: `test/fixtures/external-tool/`

```
test/fixtures/external-tool/
├── yify-browse-page.html       # YIFY movie list HTML
├── yify-movie-detail.html      # YIFY movie detail page
├── dm5-manga-list.html         # DM5 manga category
└── ...
```

### 4.3 Test File Structure

```
test/back/models/
├── external-tool.test.js
│   ├── describe('getSingleList')
│   │   ├── test('yify movie list')
│   │   ├── test('dm5 category')
│   │   └── ...
│   ├── describe('save2Drive')
│   │   └── ...
│   ├── describe('parseTagUrl')
│   │   ├── test('imdb url')
│   │   └── ...
│   ├── describe('getSingleId')
│   │   └── ...
│   └── describe('saveSingle')
│       └── ...
```

### 4.4 Integration Test Considerations

#### Live API Tests (Optional, Separate Suite)
```js
describe('external-tool integration (live)', () => {
  jest.setTimeout(30000); // 30s timeout
  
  test('real YIFY movie fetch', async () => {
    // Use actual YIFY site (public)
    const result = await getSingleId('yify', 'https://yts.mx/movies/inception-2010', 0);
    expect(result).toMatchSnapshot();
  });
});
```

**Run separately**: `npm test -- --testPathPattern=integration`

### 4.5 Performance Benchmarks

| Function | Expected Max Duration | Notes |
|----------|----------------------|-------|
| `getSingleList()` | 5s | Network-bound |
| `save2Drive()` | 30s | File upload, network-bound |
| `parseTagUrl()` | 3s | Single page scrape |
| `getSingleId()` | 5s | Detail page scrape |
| `saveSingle()` | 3s | Metadata fetch |

---

## 5. Known Limitations & Edge Cases

### 5.1 External Site Dependencies
- **Risk**: HTML structure changes break parsers
- **Mitigation**: Fixture-based tests detect breakage; version pins on dependencies
- **Monitoring**: Log parsing errors to detect site changes

### 5.2 Rate Limiting
- **YIFY**: May block after excessive requests
- **Steam, IMDB**: Rate-limited on some requests
- **Mitigation**: Redis caching with `CACHE_EXPIRE` TTL; backoff in `Api()`

### 5.3 Geo-Restrictions
- **IMDB, Steam**: Region availability varies
- **Behavior**: Returns error or empty results
- **Testing**: Mock geo-blocked responses

### 5.4 Authentication Limitations
- **No Cookie Support**: Login-walled content inaccessible
- **OAuth Limitation**: Only Google Drive OAuth implemented
- **Premium Content**: Cannot extract subscription-only media


---

## 6. Future Enhancements

### 6.1 Recommended Improvements
1. **Retry Logic**: Add exponential backoff for transient failures
2. **Circuit Breaker**: Disable failing sources temporarily
3. **Caching Layer**: Expand Redis caching to all functions
4. **Queue System**: Rate-limit with job queue (Bull, Agenda)
5. **Health Checks**: Periodic site availability tests
6. **Fallback Sources**: Alternate scrapers for redundancy
7. **WebSocket Notifications**: Real-time scrape status updates
8. **Admin Panel**: UI for managing external sources

### 6.2 Testability Improvements
1. **Dependency Injection**: Pass `Api`, `Mongo`, `Redis` as params
2. **Config Externalization**: Move site URLs to config files
3. **Parser Abstraction**: Separate DOM parsing logic into testable units
4. **Type Definitions**: Add TypeScript/JSDoc for better IDE support

---

## 7. Security Considerations

### 7.1 Input Validation
- **URL Sanitization**: Validate URLs before fetching
- **XSS Prevention**: Sanitize scraped HTML before rendering
- **Path Traversal**: Use `PathJoin()` for file operations
- **Injection Prevention**: Parameterize MongoDB queries

### 7.2 External Content Risks
- **Malicious HTML**: Untrusted HTML parsed (use Htmlparser2 safely)
- **Large Responses**: Limit HTTP response sizes
- **Redirect Loops**: Limit redirects in `Api()`
- **SSRF**: Validate URLs are external, not internal IPs

### 7.3 Secrets Management
- **Google API Key**: Store in `ver.js` (environment vars)
- **OAuth Tokens**: Encrypted in MongoDB `accessToken` collection
- **No Hardcoded Secrets**: All secrets externalized

---

## 8. Documentation Maintenance

### 8.1 Update Triggers
Update this document when:
- New external source added
- Function signature changes
- Error handling behavior changes
- External API version updates
- Breaking changes to HTML structure

### 8.2 Documentation Ownership
- **Primary**: Backend team
- **Review**: QA team (test scenarios)
- **Approval**: Tech lead

---

## 9. Appendix: External Source Details

### 9.1 Supported Sources

| Type | Name | URL Pattern | Content Type | Status |
|------|------|-------------|--------------|--------|
| `yify` | YIFY Torrents | `yts.mx` | Movies (torrents) | Active |
| `dm5` | DM5 | `dm5.com` | Manga | Active |
| `bls`, `cen`, `bea`, etc. | Various manga/video | Multiple | Manga/video | Various |
| `imdb` | IMDB | `imdb.com` | Movie metadata | Active |
| `steam` | Steam | `steampowered.com` | Game metadata | Active |

### 9.2 External API Versions

| Service | API Version | Docs |
|---------|-------------|------|
| YIFY | None | Public scraping |
| DM5 | None | Public scraping |

---

**Document Version**: 1.0
**Last Updated**: 2024-03-24
**Next Review**: 2024-06-24

