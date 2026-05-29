# ANoMoPi — System Architecture & QA Testing Blueprint

> **Project**: ANoMoPi (anomopi.com)
> **Stack**: Node.js 14 · Express · React 17 · Redux · MongoDB 4.4 · Redis 5 · Nginx · Docker Compose
> **Generated**: 2026-05-26

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Infrastructure & Deployment](#2-infrastructure--deployment)
3. [Backend Architecture](#3-backend-architecture)
4. [Frontend Architecture](#4-frontend-architecture)
5. [External Service Integrations](#5-external-service-integrations)
6. [Data Model & Storage](#6-data-model--storage)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [Real-Time Communication](#8-real-time-communication)
9. [Background Jobs & Scheduling](#9-background-jobs--scheduling)
10. [Current Test Coverage](#10-current-test-coverage)
11. [QA Testing Scope & Strategy](#11-qa-testing-scope--strategy)

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Client (Browser)                           │
│  React 17 + Redux + React Router 5 + connected-react-router        │
│  WebSocket Client (ws)                                              │
└────────────┬──────────────────────────────────┬─────────────────────┘
             │ HTTPS (443 / 8080)               │ WSS
             ▼                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Nginx Reverse Proxy                            │
│  SSL termination · Static files · Auth sub-request · Sendfile       │
│  Routes: /api/* → Main Server | /f/* → File Server                  │
└────────┬───────────────────────────────────────────────┬────────────┘
         │                                               │
         ▼                                               ▼
┌─────────────────────────┐       ┌───────────────────────────────────┐
│   reactnode-server      │       │   reactnode-file-server            │
│   Express HTTPS         │ TCP   │   Express HTTPS                    │
│   Port: 8082 (dev)      │◄─────►│   Port: 8084 (dev)                │
│         3389 (prod)     │ COM   │         3391 (prod)               │
│                         │ PORT  │                                    │
│  Routers:               │       │  Routers:                          │
│  · basic-router         │       │  · file-basic-router               │
│  · login-router         │       │  · file-router                     │
│  · user-router          │       │  · file-other-router               │
│  · storage-router       │       │  · playlist-router                 │
│  · password-router      │       │  · external-router                 │
│  · stock-router         │       │  · bitfinex-router                 │
│  · bookmark-router      │       │  · login-router                    │
│  · parent-router        │       │                                    │
│  · home-router          │       │  WebSocket Server (path: /f)       │
│  · other-router         │       │  Background Job Scheduler          │
│                         │       │  File Upload (connect-multiparty)  │
└────────┬────────────────┘       └────────┬──────────────────────────┘
         │                                  │
         ▼                                  ▼
┌─────────────────────────┐       ┌────────────────────┐
│       MongoDB 4.4       │       │     Redis 5.0      │
│  Port: 27017            │       │  Port: 6379        │
│  Auth: enabled          │       │  Auth: password    │
│  12+ collections        │       │  Session store     │
│  30+ indexes            │       │  Data cache (LRU)  │
└─────────────────────────┘       └────────────────────┘
```

### Service Summary

| Service | Container | Port (Dev) | Port (Prod) | Role |
|---------|-----------|-----------|-------------|------|
| **Nginx** | `nginx-proxy` | 8080 | 80→443 | Reverse proxy, SSL, static files |
| **Main API** | `reactnode-server` | 8082 | 3389 | Core API (users, storage, passwords, stocks) |
| **File Server** | `reactnode-file-server` | 8084 | 3391 | File ops, media, WebSocket, background jobs |
| **MongoDB** | `mongodb` | 27017 | 27017 | Primary data store |
| **Redis** | `redis` | 6379 | 6379 | Session store + data cache |

---

## 2. Infrastructure & Deployment

### 2.1 Docker Compose (Development)

- **5 services**: Redis → MongoDB → Nginx, reactnode-server, reactnode-file-server
- Health checks on Redis (ping) and MongoDB (version query)
- Service dependencies: Both Node servers depend on Redis + MongoDB healthy
- Shared volumes: `/mnt/storage` (media), `/mnt/tmp_dev` (uploads), Let's Encrypt certs
- Code volume mount (`.:/app/`) for live development

### 2.2 Production (Bare Metal)

- init.d scripts for each Node.js process and Nginx
- Separate `release` database (`releasedb`) and storage paths
- Node.js heap limited to 1 GB (`--max-old-space-size=1024`)
- Feature toggles enabled: auto-download, stock updates, DB backup, Bitfinex lending

### 2.3 Build Pipeline

- **Webpack** bundles frontend:
  - Dev → `app.js` + `app.css` (dynamic naming, watch mode)
  - Prod → `release.js` + `release.css`
- **Babel**: `@babel/preset-env` + `@babel/preset-react`
- **CSS**: MiniCssExtractPlugin extraction
- **Patches** (patch-package): yahoo-finance2, ffmpeg, opensubtitles.com, bfx-api-node-rest

### 2.4 Configuration Management

| Layer | Dev Source | Prod Source |
|-------|-----------|-------------|
| Secrets | `.env` → `ver.js` (process.env) | `release-ver.js` (hardcoded) |
| App Config | `config/node-dev-config.js` | `config/node-release-config.js` |
| Nginx | `config/nginx-dev.conf` | `config/nginx-release.conf` |
| Feature Flags | Mostly disabled | Most enabled |

---

## 3. Backend Architecture

### 3.1 Entry Points

| File | Role | Protocol |
|------|------|----------|
| `controllers/server.js` | Main API server | HTTPS |
| `controllers/file-server.js` | File/media server + WS + background jobs | HTTPS + WSS |
| `cmd/cmd.js` | CLI tool for admin operations | stdin/stdout |
| `cmd/background.js` | Scheduled background job runner | Internal |
| `cmd/googledrive.js` | Google Drive OAuth setup | CLI |
| `cmd/tdameritrade.js` | TD Ameritrade OAuth setup | CLI |

### 3.2 Middleware Stack

**Main Server (`server.js`)**:
1. `body-parser` (URL-encoded + JSON)
2. `express-session` (Redis-backed, 3-day secure cookie)
3. `passport` (local strategy)
4. Request logger (`showLog` — per-request console trace, separate from the pino structured logging; see §3.6)

**File Server (`file-server.js`)**:
1. `body-parser` (URL-encoded + JSON)
2. `connect-multiparty` (file uploads → NAS_TMP)
3. `express-session` (Redis-backed)
4. `passport`
5. CORS headers
6. Checksum validation

### 3.3 API Route Map

#### Main Server (`/api/*`)

| Router | Mount | Key Endpoints |
|--------|-------|---------------|
| **login-router** | `/api/login`, `/api/logout` | POST login (passport local), GET logout |
| **basic-router** | `/api/getuser`, `/api/testLogin`, `/api/getPath` | User info, auth test, session path |
| **user-router** | `/api/user/act/:uid?` | CRUD users |
| **storage-router** | `/api/storage/*` | File listing, metadata, tag queries |
| **password-router** | `/api/password/*` | Encrypted password CRUD, decrypt, generate |
| **stock-router** | `/api/stock/*` | Stock data, P/E ratios, portfolio totals |
| **bookmark-router** | `/api/bookmark/*` | Bookmark CRUD for all collection types |
| **parent-router** | `/api/parent/*` | Tag category CRUD and queries |
| **home-router** | `/api/homepage` | Help text / instructions |
| **other-router** | `/refresh`, `/privacy`, `/s` | Utility & short URL redirects |

#### File Server (`/f/api/*`)

| Router | Mount | Key Endpoints |
|--------|-------|---------------|
| **login-router** | `/f/api/login`, `/f/api/logout` | Mirrored auth for file server |
| **file-basic-router** | `/f/api/testLogin` | Auth test (mobile/Firefox exceptions) |
| **file-router** | `/f/api/file/*` | File edit, delete, media processing |
| **playlist-router** | `/f/api/torrent/*` | Torrent/playlist management, archive merge |
| **external-router** | `/f/api/external/*` | External media sources, subtitle retrieval |
| **bitfinex-router** | `/f/api/bitfinex/*` | Crypto trading data, bot management |
| **file-other-router** | `/f/*` | Preview, download, subtitle serving |

### 3.4 Models (Business Logic)

| Model | Purpose | External Dependency |
|-------|---------|-------------------|
| `mongo-tool.js` | MongoDB connection pool + CRUD wrapper | MongoDB driver |
| `redis-tool.js` | Redis client wrapper (LRU, 100MB max) | Redis client |
| `session-tool.js` | Express session with Redis store | connect-redis |
| `password-tool.js` | AES-256-CTR encrypt/decrypt passwords | Node crypto |
| `stock-tool.js` | Stock data fetch, P/E calc, filtering | yahoo-finance2 |
| `bitfinex-tool.js` | Crypto trading, lending, rate calc | bitfinex-api-node |
| `shioaji-tool.js` | Taiwan stock real-time ticker | Shioaji (Python bridge) |
| `tdameritrade-tool.js` | US stock trading OAuth + data | TD Ameritrade API |
| `api-tool-google.js` | Google Drive upload, doc download, backup | googleapis |
| `api-tool-playlist.js` | Playlist/torrent management | torrent-stream |
| `discord-tool.js` | Discord webhook notifications | discord.js |
| `external-tool.js` | External media sources (YIFY, DM5) | Various scrapers |
| `mediaHandle-tool.js` | Media processing, thumbnails, integrity | ffmpeg, yt-dlp |
| `tag-tool.js` | Tag CRUD, bookmark management, related tags | — |
| `api-tool.js` | General API utilities | — |

- **§6c Conviction-weighted `newOrder` sorting (2026-05-26)**: `bitfinex-tool.js`, `shioaji-tool.js`, and `tdameritrade-tool.js` now sort `newOrder` by a 50/50 blend of normalized invested market value (`|count| × price`) and conviction (`1 / extrem`), so lower-`extrem` / more stable positions are submitted first. This replaces the older invested-amount insertion sort.
- **Sizing note (2026-05-26)**: `stock-tool.js` and `bitfinex-tool.js` now consume TOTALDB `metrics` / `extrem` data for Kelly-based trade-count boosts and volatility-aware position sizing.

### 3.5 Utilities

| Utility | Purpose |
|---------|---------|
| `utility.js` | Validation (`isValidString`), auth middleware (`checkLogin`, `checkAdmin`), error handling (`HoError`), data formatters, file path helpers, crypto utilities |
| `mime.js` | File type detection (23+ media, 10+ archive, 8+ doc, 6+ subtitle types), MIME mapping, extension utilities |
| `sendWs.js` | WebSocket broadcast, TCP inter-process communication, Discord forwarding |
| `logger.js` | Structured logging via **pino**; exports `createLogger(module)` factory that returns a child logger with `{ module }` bound to every entry |
| `twse.py` | Taiwan stock exchange Python helpers; Shioaji enum values are normalized with `str()` before comparisons/concatenation |
| `myuzip.py` | Python ZIP/archive utilities |

### 3.6 Logging

The project uses **pino** for structured JSON logging via `src/back/util/logger.js`.

```javascript
import createLogger from '../util/logger.js';
const log = createLogger('module-name');   // e.g. 'stock', 'bitfinex'

log.debug({ item }, 'stock status item');
log.info({ str }, 'trade suggestion');
log.warn({ shiftedCount, total }, 'emergency stop triggered');
```

| Environment | Output | Transport |
|-------------|--------|-----------|
| Development (`ENV_TYPE !== 'release'`) | Human-readable, colorized | `pino-pretty` (`HH:MM:ss`, no pid/hostname) |
| Production (`ENV_TYPE === 'release'`) | JSON to stdout | None (Docker captures timestamps) |

**Log level**: Controlled by `LOG_LEVEL` env var, defaults to `debug`.

**Migration status**: `stock-tool.js` and `bitfinex-tool.js` use structured pino logging exclusively. Other modules (controllers, `password-tool.js`) still use `console.log` for request/debug tracing — these are migration candidates.

---

## 4. Frontend Architecture

### 4.1 Technology Stack

- **React 17** (class components)
- **Redux** (createStore, combineReducers)
- **React Router 5** + **connected-react-router** (history sync)
- **Bootstrap 3** (Glyphicons, grid, theme CSS)
- **isomorphic-fetch** for API calls
- **Chart.js 2** for data visualization
- **WebSocket** (native browser) for real-time updates

### 4.2 Page Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `ReApp` → `Homepage` | Main dashboard / help |
| `/Login` | `ReLogin` | Authentication page |
| `/User` | `ReUserlist` | User management |
| `/Storage` | `Storage` | File storage browser |
| `/Password` | `RePassword` | Password manager |
| `/Stock` | `ReStock` | Stock portfolio tracker |
| `/Bitfinex` | `ReBitfinex` | Crypto trading dashboard |
| *(commented out)* | `ReFitness`, `ReRank`, `ReLottery` | Fitness, rankings, lottery |

### 4.3 State Management (Redux)

**Store Shape** (13 active reducers):

| Reducer | State Slice | Purpose |
|---------|-------------|---------|
| `alertHandle` | Alert queue | Push/pop notification messages |
| `basicDataHandle` | `{id, url, edit, level, sub}` | Current user session info |
| `uploadDataHandle` | `{progress}` | File upload progress |
| `feedbackDataHandle` | Simple list | File operation feedback |
| `userDataHandle` | Simple list | User list data |
| `itemDataHandle` | Complex list | Storage items |
| `passDataHandle` | Complex list | Password items |
| `stockDataHandle` | Complex list | Stock items |
| `bitfinexDataHandle` | Complex list | Bitfinex trading data |
| `idirDataHandle` / `pdirDataHandle` / `sdirDataHandle` | Directory trees | Tag categories per type |
| `ibookmarkDataHandle` / `pbookmarkDataHandle` / `sbookmarkDataHandle` | Bookmark lists | Saved searches per type |
| `glbPwHandle` | `{show, callback}` | Global password prompt dialog |
| `glbCfHandle` | `{show, callback, text}` | Global confirmation dialog |
| `glbInHandle` | `{show, callback}` | Global input dialog |

### 4.4 Component Inventory (68 components + 56 containers)

**Layout Components**:
- `App.js` — Main layout shell (navbar, sidebar, routes, modals)
- `Navlist.js` / `ToggleNav.js` — Navigation sidebar
- `TopSection.js` — Top action bar
- `Dropdown.js` / `DropdownMenu.js` — Dropdown menus
- `AlertMsg.js` / `Alertlist.js` — Notification system

**Feature Modules**:

| Module | Components | Info Panel | Item Renderer |
|--------|-----------|------------|---------------|
| Storage | `Storage.js` | — | `ItemFile.js` |
| Password | `Password.js` | `PasswordInfo.js` | `ItemPassword.js` |
| Stock | `Stock.js` | `StockInfo.js`, `StockTotal.js` | `ItemStock.js` |
| Bitfinex | `Bitfinex.js` | `BitfinexInfo.js` | `ItemBitfinex.js` |
| Fitness | `Fitness.js` | `FitnessInfo.js`, `FitnessStatis.js` | `ItemFitness.js` |
| Rank | `Rank.js` | `RankInfo.js`, `RankStatis.js` | `ItemRank.js` |
| Lottery | `Lottery.js` | — | `ItemLottery.js` |

**Shared Components**:
- `Itemlist.js` — Generic paginated item list
- `ItemHead.js` — List header with sort controls
- `ItemPath.js` — Breadcrumb tag path
- `ItemInput.js` — Inline edit input
- `Categorylist.js` / `Dirlist.js` — Category/directory tree
- `FileManage.js` / `FileAdd.js` / `FileUploader.js` — File operations
- `FileFeedback.js` — Upload/process progress
- `MediaManage.js` / `MediaWidget.js` / `WidgetManage.js` / `WidgetButton.js` — Media player
- `GlobalPassword.js` / `GlobalComfirm.js` — Modal dialogs
- `Homepage.js` — Help/instructions display
- `Login.js` — Login form
- `Userlist.js` / `UserInfo.js` / `UserInput.js` — User management
- `Tooltip.js` — Tooltip component

**Container Pattern** (56 Redux-connected containers):
- Naming: `Re{ComponentName}.js` (e.g., `ReApp.js`, `ReLogin.js`, `ReStock.js`)
- Each maps `state → props` and `dispatch → props` via `connect()`

### 4.5 Frontend API Communication

```
utility.js::api(url, data, method, relogin)
├── fetch() with credentials: 'include'
├── Error handling: 400/401/403/404/500
├── 401 → auto redirect to /Login (if relogin=true)
└── Returns: response.json()

Key API helper functions:
├── doLogin(username, password, url)    — cascading login across servers
├── doLogout(url)                       — cascading logout
├── testLogin()                         — auth check
├── getItemList(type, sort, ...)        — paginated query
├── resetItemList(type, sort, ...)      — reset filters
├── dirItemList(type, sort, ...)        — category query
└── bookmarkItemList(type, ...)         — bookmark query
```

---

## 5. External Service Integrations

| Service | Library/API | Purpose | Config Source |
|---------|------------|---------|---------------|
| **Google Drive** | `googleapis` | Auto-upload, doc download, DB backup | GOOGLE_ID, GOOGLE_SECRET, GOOGLE_REDIRECT |
| **Google Sheets** | `googleapis` | Data import/export | Same as above |
| **Bitfinex** | `bitfinex-api-node` (patched) | Crypto trading, lending, rate calc | BITFINEX_KEY, BITFINEX_SECRET |
| **Shioaji** | Python bridge (`twse.py`) | Taiwan stock real-time trading | SHIOAJI_ID, SHIOAJI_PW, SHIOAJI_APIKEY |
| **TD Ameritrade** | Custom REST client | US stock trading & positions | TDAMERITRADE_KEY, TDAMERITRADE_SECRET |
| **Yahoo Finance** | `yahoo-finance2` (patched) | Stock data, P/E ratios, history | — |
| **Discord** | `discord.js` | Notification webhook | DISCORD_TOKEN, DISCORD_CHANNEL |
| **OpenSubtitles** | `opensubtitles.com` (patched) | Subtitle search & download | OPENSUBTITLES_KEY, USERNAME, PASSWORD |
| **YouTube/yt-dlp** | `youtube-dl-exec` + yt-dlp | Video downloading | — |
| **YIFY/DM5** | Custom scrapers | External media sources | — |
| **WebRTC TURN** | Nginx config | P2P relay | TURN_USERNAME, TURN_CREDENTIAL |
| **Let's Encrypt** | Certbot | SSL/TLS certificates | `/etc/letsencrypt/` |

---

## 6. Data Model & Storage

### 6.1 MongoDB Collections

| Collection | Purpose | Key Fields | Indexes |
|-----------|---------|------------|---------|
| `user` | User accounts | username, password, perm, auto, kindle, desc, unDay, unHit | `username_1` (unique) |
| `storage` | File metadata | name, owner, status, tags, mediaType, count, utime, recycle, adultonly | 9 compound indexes |
| `storageUser` | User-storage prefs | userId, name, mtime | `userId_1_name_1`, `userId_1_mtime_1` |
| `password` | Encrypted passwords | owner, name, username, password (encrypted), url, email, important, tags | 4 compound indexes |
| `passwordUser` | User-password prefs | userId, name, mtime | `userId_1_name_1`, `userId_1_mtime_1` |
| `stock` | Stock entries | type, index, per, tags, important | 5 compound indexes |
| `stockUser` | User-stock prefs | userId, name, mtime | `userId_1_name_1`, `userId_1_mtime_1` |
| `docUpdate` | Document sync status | — | — |
| `total` | Stock/crypto portfolio totals, trading state, sizing inputs | owner, index, name, type, setype/sType, amount, count, pricecost, web, mid, times, mul, extrem, metrics | — |

- **TOTALDB note (2026-05-26)**: `extrem` stores the `calStair` daily swing percentile, and `metrics` stores backtest outputs such as `winRate`, `avgWin`, `avgLoss`, `profitFactor`, and related fields. `recur_web` now propagates `web.metrics` from STOCKDB into TOTALDB so scheduled trading logic can reuse them.

### 6.2 Redis Usage

| Purpose | Key Pattern | TTL |
|---------|------------|-----|
| Session store | `sess:*` | 3 days |
| Stock price cache | Stock identifier | 86,400s (1 day) |
| Bitfinex rate data | Coin/pair keys | In-memory (LRU eviction) |
| Password verification cache | User-specific | 70s |

### 6.3 File Storage (NAS)

```
/mnt/storage/              (production: /mnt/release/storage/)
├── {owner_id}/
│   └── {file_id}/         (per-file directory)
│       ├── original file
│       ├── thumbnails
│       └── extracted content
/mnt/tmp/                  (upload staging area)
```

---

## 7. Authentication & Authorization

### 7.1 Authentication Flow

```
Browser                    Main Server              File Server
   │  POST /api/login         │                         │
   │  {username, password} ──►│                         │
   │                          │  passport.authenticate  │
   │                          │  (local strategy)       │
   │                          │  MD5 hash compare       │
   │  ◄── {loginOK, url} ────│                         │
   │                          │                         │
   │  POST /f/api/login       │                         │
   │  (cascading login) ─────────────────────────────►  │
   │  ◄── {loginOK} ─────────────────────────────────   │
   │                          │                         │
   │  Session cookie set on both servers (Redis-backed) │
```

### 7.2 Permission Model

| Level | Role | Capabilities |
|-------|------|-------------|
| `perm = 0` | Standard user | Own data, limited views |
| `perm = 1` | Owner/Admin | User management, all data, system config |
| `perm = 2` | Content admin | Adult content access, stock filtering |
| `perm ≤ 32` | Granular levels | Bitwise permission support |

### 7.3 Security Mechanisms

- **Session**: Redis-backed, 3-day HTTPS-only secure cookies
- **Password storage**: MD5 hash (user auth), AES-256-CTR (password manager)
- **Nginx auth sub-request**: `/auth` endpoint for file download authorization
- **CORS**: Explicit `Access-Control-Allow-Credentials` on file server
- **SSL/TLS**: Let's Encrypt certificates, TLSv1/1.1/1.2

---

## 8. Real-Time Communication

```
File Server (WSS /f)
    │
    ├── WebSocket Server (ws library)
    │   ├── Broadcasts: file status, media progress, notifications
    │   ├── Security levels: 0=public, 1=adult, 2=auth+adult
    │   └── Client filtering by session auth
    │
    ├── TCP Server (COM_PORT: 8083/3390)
    │   ├── Background job → File Server notifications
    │   └── JSON message protocol, keep-alive (10s)
    │
    └── TCP Client (Main Server → File Server)
        ├── Reconnect every 10s on disconnect
        └── Forward notifications between servers
```

---

## 9. Background Jobs & Scheduling

| Job | Interval | Condition | Purpose |
|-----|----------|-----------|---------|
| `autoUpload` | 3,600s (1h) | `AUTO_UPLOAD=true` | Upload files to Google Drive |
| `autoDownload` | Cron: 11:00, 17:00, 18:00 UTC | `AUTO_DOWNLOAD=true` | Download documents from gov't APIs |
| `checkMedia` | 7,200s (2h) | `CHECK_MEDIA=true` | Verify media file integrity |
| `updateStock` | Scheduled | `UPDATE_STOCK=true` | Batch update stock data |
| `updateStockList` | 90s | `UPDATE_STOCK=true` | Update stock list queue |
| `filterStock` | Cron: Tue 3:00 UTC | `STOCK_FILTER=true` | Apply stock screening filters |
| `dbBackup` | 2nd of month + quarterly | `DB_BACKUP=true` | MongoDB collection/system backup |
| `checkStock` | 600s (10m) | `CHECK_STOCK=true` | Monitor stock status changes |
| `rateCalculator` | 90s | `BITFINEX_FILTER=true` | Calculate Bitfinex lending rates |
| `setUserOffer` | 90s | `BITFINEX_LOAN=true` | Update user lending offers |
| `filterBitfinex` | 86,400s (1d) | `BITFINEX_FILTER=true` | Clean Bitfinex data |
| `usseInit` | 600s (10m) | `USSE_TICKER=true` | US stock ticker WebSocket |
| `twseInit` | 600s (10m) | `TWSE_TICKER=true` | Taiwan stock ticker (Shioaji) |

- **§9a Kelly Criterion sizing boost**: After the normal position-control pass in `stock-tool.js` and `bitfinex-tool.js`, the system computes `kelly = p - (1-p)/b` from TOTALDB `metrics.winRate`, `metrics.avgWin`, and `metrics.avgLoss`. When `kelly > 50%`, it increments `bCount` for active buys or `sCount` for active sells. These metrics are propagated from STOCKDB `web.metrics` into TOTALDB via `recur_web`.
- **§9b Volatility-normalized position size**: `stockFilterV4` (TWSE/USSE market-cap loop) and `calRate` (Bitfinex market-cap loop) now store `extrem` in the relevant `marketcapList` arrays, compute `value = max(0, 1 - extrem/0.4)`, and use it to derive capped position-size multiplier `mul` (default `1`, max `5`) from market-cap plus volatility inputs.

---

## 10. Current Test Coverage

### 10.1 Existing Setup

- **Jest 27** configured with `babel-jest` transform and `node` environment
- **ESM support**: `NODE_OPTIONS=--experimental-vm-modules`
- **Supertest** available as a dev dependency (HTTP assertions)
- **Scripts**: `npm test` (Jest), `npm run dev-test` (Docker exec), `npm run dev-test-python`

### 10.2 Current Coverage

- **41 test suites passing** with **3992 tests** across the current Jest/Python test inventory
- ESM-aware mocking via `jest.unstable_mockModule()` throughout
- Python tests for archive utilities (`myuzip_test.py`) and TWSE helpers (`twse_test.py`)
- Coverage hot-spots (≈100% line coverage where reachable): `util/utility.js`, `util/mime.js`, `util/sendWs.js`, `models/mongo-tool.js`, `models/redis-tool.js`, `models/tag-tool.js`, `models/api-tool-google.js`, `models/discord-tool.js`, `models/password-tool.js`, `models/external-tool.js`, `controllers/user-router.js`, `cmd/cmd.js`

---

## 11. QA Testing Scope & Strategy

### 11.1 Testing Pyramid

```
          ┌──────────────┐
          │    E2E Tests  │  ← Full user flows via Supertest
          │   (Minimal)   │     Login → Action → Verify
          ├──────────────┤
          │  Integration  │  ← API route + DB + Redis
          │    Tests      │     Controller → Model → DB
          ├──────────────┤
          │  Unit Tests   │  ← Pure logic, isolated
          │  (Foundation) │     Utilities, models, reducers
          └──────────────┘
```

### 11.2 Backend Unit Test Scope

| Module | File(s) | Test Focus | Priority |
|--------|---------|-----------|----------|
| **Validation** | `util/utility.js` | `isValidString()` for all types (name, passwd, url, email, int, perm, uid, desc) | 🔴 Critical |
| **Auth Helpers** | `util/utility.js` | `checkAdmin()`, `userPWCheck()`, `checkLogin()` | 🔴 Critical |
| **Error Handling** | `util/utility.js` | `HoError` construction, `handleError()` behavior | 🟡 High |
| **File Type Detection** | `util/mime.js` | `extType()` for all 60+ extensions, edge cases | 🔴 Critical |
| **MIME Utilities** | `util/mime.js` | `isVideo()`, `isImage()`, `isMusic()`, `isZip()`, `isSub()`, etc. | 🟡 High |
| **Password Crypto** | `models/password-tool.js` | Encrypt/decrypt round-trip, key validation, salt handling | 🔴 Critical |
| **Data Formatters** | `util/utility.js` | `getStorageItem()`, `getPasswordItem()`, `getStockItem()`, etc. | 🟡 High |
| **Tag System** | `models/tag-tool.js` | Tag normalization, search, relative tag calculation | 🟡 High |
| **Stock Calculations** | `models/stock-tool.js` | P/E ratio, moving averages, variance analysis, interval prediction | 🟡 High |
| **Bitfinex Calculations** | `models/bitfinex-tool.js` | Rate calculation, fee computation, risk limits | 🟡 High |
| **Constants** | `constants.js` | Exported values integrity, regex patterns, collection names | 🟢 Medium |
| **Config** | `config.js` | Environment-based config resolution (dev vs release) | 🟢 Medium |
| **File Path** | `util/utility.js` | `getFileLocation()`, `deleteFolderRecursive()` | 🟢 Medium |
| **Sort** | `util/utility.js` | `sortList()` for name/mtime/count × asc/desc | 🟢 Medium |

### 11.3 Backend Integration Test Scope

| Scope | Test Focus | Dependencies |
|-------|-----------|-------------|
| **Authentication** | Login/logout flow, session creation, cascading login | MongoDB, Redis |
| **User CRUD** | Create/read/update/delete users, permission enforcement | MongoDB |
| **Password Manager** | CRUD + encryption round-trip + password generation | MongoDB, crypto |
| **Storage Queries** | Tag-based search, pagination, sort, bookmarks, parent categories | MongoDB |
| **Stock Data** | Fetch, cache, P/E calculation, portfolio totals | MongoDB, Redis, Yahoo Finance |
| **File Operations** | Upload (multipart), edit metadata, delete (with recycle), archive merge | MongoDB, filesystem |
| **Bookmark System** | Create/delete/subscribe bookmarks per collection type | MongoDB |
| **MongoDB Wrapper** | CRUD operations, connection pooling, auto-init | MongoDB |
| **Redis Cache** | Set/get/expire, LRU eviction behavior | Redis |
| **WebSocket** | Broadcast, security-level filtering, TCP forwarding | WS, TCP |
| **Middleware Chain** | Auth check, body parsing, CORS, request logging | Express |

### 11.4 External API Integration Test Scope

| API | Test Focus | Approach |
|-----|-----------|----------|
| **Yahoo Finance** | Stock data fetch, error handling, response parsing | Mock HTTP responses |
| **Bitfinex REST** | Order book, candles, order submission (patched methods) | Mock API client |
| **Google Drive** | OAuth flow, file upload, folder creation, backup | Mock googleapis |
| **OpenSubtitles** | Search, download, user-agent header (patched) | Mock API |
| **Discord** | Webhook message sending | Mock client |
| **Shioaji** | Real-time tick subscription, order placement | Mock Python bridge |
| **TD Ameritrade** | OAuth, position/order retrieval | Mock HTTP |

### 11.5 Frontend Unit Test Scope

| Module | Test Focus | Priority |
|--------|-----------|----------|
| **Reducers** (10) | State transitions for all action types | 🔴 Critical |
| **Actions** (40+) | Action creator return values | 🟢 Medium |
| **utility.js** | `isValidString()`, `api()` fetch wrapper, `checkInput()`, `arrayObject()`, `arrayId()` | 🔴 Critical |
| **constants.js** | Route/action constant integrity | 🟢 Medium |

### 11.6 Frontend Integration Test Scope

| Scope | Test Focus |
|-------|-----------|
| **Login Flow** | `doLogin()` cascading auth, error handling, redirect |
| **API Communication** | `api()` error handling (400/401/403/404/500), relogin behavior |
| **Item List Queries** | `getItemList()`, `resetItemList()`, `dirItemList()`, `bookmarkItemList()` |
| **Redux Store** | Combined reducer initialization, action dispatch → state update |

### 11.7 Security Test Scope

| Area | Test Cases |
|------|-----------|
| **Authentication** | Invalid credentials, session expiry, concurrent sessions |
| **Authorization** | Privilege escalation (perm 0 → admin routes), owner-only operations |
| **Input Validation** | SQL/NoSQL injection in search, XSS in names/tags, path traversal in file ops |
| **Encryption** | Password decryption with wrong key, salt tampering, algorithm downgrade |
| **Session** | Cookie security flags, Redis session fixation, cross-server session sync |
| **File Access** | Unauthorized file download, nginx auth sub-request bypass |

### 11.8 Suggested Test File Structure

```
src/
├── back/
│   ├── util/
│   │   ├── __tests__/
│   │   │   ├── utility.test.js        (validation, auth helpers, formatters)
│   │   │   ├── mime.test.js            (file type detection)
│   │   │   └── sendWs.test.js          (WebSocket/TCP)
│   │   └── myuzip.test.py             (existing Python tests)
│   ├── models/
│   │   └── __tests__/
│   │       ├── mongo-tool.test.js      (DB CRUD)
│   │       ├── password-tool.test.js   (encrypt/decrypt)
│   │       ├── stock-tool.test.js      (calculations)
│   │       ├── tag-tool.test.js        (tag system)
│   │       ├── redis-tool.test.js      (cache)
│   │       └── bitfinex-tool.test.js   (trading calc)
│   ├── controllers/
│   │   └── __tests__/
│   │       ├── login-router.test.js    (auth endpoints)
│   │       ├── user-router.test.js     (user management)
│   │       ├── password-router.test.js (password manager)
│   │       ├── storage-router.test.js  (file storage)
│   │       ├── stock-router.test.js    (stock data)
│   │       ├── file-router.test.js     (file operations)
│   │       └── bitfinex-router.test.js (crypto trading)
│   └── __tests__/
│       ├── config.test.js              (env config)
│       └── constants.test.js           (constant integrity)
└── front/
    ├── __tests__/
    │   ├── utility.test.js             (frontend utilities)
    │   └── constants.test.js           (route/action constants)
    ├── reducers/
    │   └── __tests__/
    │       ├── alertHandle.test.js
    │       ├── basicDataHandle.test.js
    │       ├── complexDataHandle.test.js
    │       ├── simpleDataHandle.test.js
    │       ├── dirDataHandle.test.js
    │       └── bookmarkDataHandle.test.js
    └── actions/
        └── __tests__/
            └── index.test.js           (action creators)
```

### 11.9 Recommended Execution Priority

| Phase | Scope | Rationale |
|-------|-------|-----------|
| **Phase 1** | Backend unit tests: `utility.js`, `mime.js`, `password-tool.js` | Highest-risk pure logic; zero external deps needed |
| **Phase 2** | Backend unit tests: `config.js`, `constants.js`, `tag-tool.js`, `stock-tool.js` | Business logic with calculatable expected results |
| **Phase 3** | Frontend unit tests: `utility.js`, all reducers, action creators | Client-side validation + state management correctness |
| **Phase 4** | Backend integration: auth flow, user CRUD, password manager | Requires MongoDB/Redis mocks or test containers |
| **Phase 5** | Backend integration: storage, stock, file operations, bookmarks | Full API route testing with Supertest |
| **Phase 6** | External API mocks: Yahoo Finance, Bitfinex, Google Drive | Isolated external service testing |
| **Phase 7** | Security tests: injection, auth bypass, privilege escalation | Dedicated adversarial testing |

---

> **Note**: This document serves as the master blueprint for QA test planning. Each phase should produce test files following the structure in §11.8, using Jest + Supertest for backend and Jest for frontend, matching the existing project configuration.
