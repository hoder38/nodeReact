# STOCK-TOOL.MD — Technical Documentation & QA Testing Guide

> **Module**: `/src/back/models/stock-tool.js`  
> **Lines**: ~4,620  
> **Purpose**: Stock data management, trading algorithm backtesting, portfolio tracking  
> **Stack**: Node.js · MongoDB · Redis · Yahoo Finance API · TWSE/TPEx Official APIs · Web Scraping  
> **Last Updated**: 2026-05-26

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Architecture & Dependencies](#2-architecture--dependencies)
3. [Exported Functions - Default Object](#3-exported-functions---default-object)
4. [Exported Functions - Named Exports](#4-exported-functions---named-exports)
5. [Internal Helper Functions](#5-internal-helper-functions)
6. [Testing Strategy](#6-testing-strategy)
7. [Snapshot Testing Data](#7-snapshot-testing-data)
8. [Test Scenarios by Function](#8-test-scenarios-by-function)

---

## 1. Module Overview

### Purpose

`stock-tool.js` is the core financial data engine for the ANoMoPi platform, responsible for:

- **Stock Data Acquisition**: Scraping TWSE (Taiwan Stock Exchange) and fetching USA stock data from Yahoo Finance
- **Financial Metrics Calculation**: Computing PER (Price-to-Earnings Ratio), PDR (Price-to-Dividend Ratio), PBR (Price-to-Book Ratio)
- **Trading Algorithm Backtesting**: Implementing and testing automated trading strategies using price distribution analysis
- **Portfolio Management**: Tracking user stock holdings, transactions, and real-time positions
- **Stock Filtering**: Multi-criteria search engine for stock discovery (profitability, growth, valuation)
- **Quarterly Data Management**: Maintaining stock data lifecycle with quarterly tags for version control

### Key Features

- **Multi-Exchange Support**: Abstracts TWSE (Taiwan) and USSE (USA) stock operations
- **Intelligent Caching**: Redis-based interval data caching with automatic expiry
- **Retry Logic**: Fault-tolerant API calls with exponential backoff
- **Concurrency Control**: Module-level flags prevent resource contention
- **Real-Time Updates**: WebSocket integration for live client notifications
- **Price Distribution Analysis**: Logarithmic scaling with normal distribution (σ-layer) modeling for volatility
- **Corporate Action Adjustment**: Adjusts historical prices for splits, dividends, and capital gains. TWSE uses official TWSE TWT49U (ex-rights/dividends) and TWTAUU (capital reduction) APIs plus TPEx exDailyQ. USSE extracts events from Yahoo Finance chart response. Both use backward-adjustment with cumulative ratio product. Raw unadjusted data + adjustment events stored in Redis for incremental updates.

---

## 2. Architecture & Dependencies

### 2.1 Database & Cache

**MongoDB Collections:**

| Collection | Purpose | Key Fields |
|------------|---------|------------|
| `STOCKDB` | Stock master data | `_id`, `stock_index`, `stock_name`, `per`, `pdr`, `pbr`, `tag[]`, `stock_class`, `stock_gain_rate` |
| `TOTALDB` | User portfolios & live trade state | `_id`, `user`, `setype`, `index`, `orig`, `count`, `pricecost`, `pl`, `amount`, `mid`, `web`, `times`, `wType`, `extrem`, `metrics`, `mul` |
| `USERDB` | User accounts | `_id`, `username`, preferences |

**Redis Cache:**

| Key Pattern | Data | TTL |
|-------------|------|-----|
| `interval: {type}{index}` | `{raw_list: JSON, adjustments: JSON, ret_obj, etime}` | Until `etime` timestamp |

### 2.2 External Services

**Stock Data APIs:**

```javascript
// TWSE (Taiwan)
https://tw.stock.yahoo.com/quote/{index}                    // Current prices
https://mopsov.twse.com.tw/server-java/t164sb01            // Quarterly profits/equity
https://doc.twse.com.tw/server-java/t57sb01                // Annual reports

// USA Markets
https://www.slickcharts.com/sp500                          // S&P 500 list
https://www.slickcharts.com/nasdaq100                      // Nasdaq-100 list
https://www.slickcharts.com/dowjones                       // Dow Jones list
https://www.macrotrends.net/stocks/charts/{index}          // PER/PBR metrics

// Yahoo Finance (npm package)
yahooFinance.quote()                                       // Quote data
yahooFinance.quoteSummary()                                // Company info
```

**Brokerage Integrations:**

- **TDAmeritrade API**: `getUssePosition()`, `getUsseOrder()` (via `tdameritrade-tool.js`)
- **Shioaji API**: `getTwsePosition()`, `getTwseOrder()` (via `shioaji-tool.js`)

**File Storage:**

- **Google Drive API**: Upload/list annual financial reports (via `api-tool-google.js`)

### 2.3 Critical Constants

```javascript
// From ../constants.js
STOCK_FILTER_LIMIT          // Query pagination limit
MAX_RETRY                   // API retry count (default: 3)
TRADE_FEE                   // TWSE trading fee (0.001425 = 0.1425%)
USSE_FEE                    // USA trading fee
TRADE_TIME                  // Trading hour restrictions
TRADE_INTERVAL              // Time between trades (seconds)
RANGE_INTERVAL              // Analysis rolling window
MAX_NEWMID_STACK            // Maximum newMid stack depth (default: 5)
EMERGENCY_STOP_PCT          // Emergency stop percentage (0-100)
VOLUME_DECAY_HALFLIFE       // Volume-time decay half-life in days
NORMAL_DISTRIBUTION         // [1, 2, 16, 50, 84, 98, 99] — cumulative percentiles mapping to ~-2.33σ, -2σ, -1σ, median, +1σ, +2σ, ~+2.33σ
GAIN_LOSS                   // Gain/loss threshold multiplier
STOCK_INDEX                 // TWSE sector classification mapping
MONTH_SHORTS                // ['Jan', 'Feb', ...]
```

### 2.4 Module-Level State

```javascript
let stockFiltering = false;        // Lock for stockFilterV4 concurrency
let stockIntervaling = false;      // Lock for getIntervalV2 concurrency  
let stockPredicting = false;       // Lock for PER prediction concurrency
const suggestionData = {           // Auto-complete cache
    twse: {},                      //   {index: {name, tag[]}}
    usse: {}
}
let stringSent = 0;                // WebSocket message counter
```

### 2.5 Logging

`stock-tool.js` uses structured logging via the project's **pino**-based logger (see `src/back/util/logger.js` and [OUTLINE.md §3.6](../../OUTLINE.md)):

```javascript
import createLogger from '../../util/logger.js';
const log = createLogger('stock');

log.debug({ item }, 'stock status item');
log.info({ str }, 'trade suggestion');
log.warn({ shiftedCount, total }, 'emergency stop triggered');
```

- All runtime output is structured JSON (release) or colorized text (dev) — **no `console.log` calls exist** in the module.
- Log level is controlled by the `LOG_LEVEL` environment variable (default: `debug`).

---

## 3. Exported Functions - Default Object

The default export exposes **10 methods** as an object. All return Promises.


### 3.1 getSingleStockV2(type, obj, stage, back)

**Purpose**: Fetches comprehensive financial data for a single stock, calculates valuation ratios (PER/PDR/PBR), and updates MongoDB with the latest quarterly information.

**Parameters**:
- `type` (string): Exchange type - `'twse'` or `'usse'`
- `obj` (object): Stock identification object with `index` field
- `stage` (number): Processing stage indicator (0-2)
- `back` (number): Number of quarters to look back for data (default: 4)

**Logic Flow**:
1. Calls `getBasicStockData()` to fetch stock name, classification, market type
2. Retrieves current stock price via `getStockPrice()`
3. **For TWSE**:
   - Queries TWSE API (`t164sb01`) for quarterly profit, equity, dividends
   - Handles reporting delays by recursively trying prior quarters (up to `back` quarters)
   - Falls back to annual reports if quarterly data unavailable
   - Converts values: `1 unit = 1000 TWD`
4. **For USSE**:
   - Queries Yahoo Finance for market cap, trailing PE, price-to-book
   - Fetches sector/industry from `quoteSummary()`
5. **Calculates Ratios**:
   - `PER = Price / (Profit per share)` (Profit × 1000 / Equity shares)
   - `PDR = Price / (Dividend per share)` (Dividend × 1000 / Equity shares)
   - `PBR = Price / (Book value per share)` (NetValue × 1000 / Equity shares)
6. Tags stock with `{year}q{quarter}` format
7. Upserts to MongoDB `STOCKDB` collection
8. Returns financial metrics object

**Returns**:
```javascript
{
  per: 15.23,           // Price-to-Earnings Ratio
  pdr: 25.5,            // Price-to-Dividend Ratio  
  pbr: 1.8,             // Price-to-Book Ratio
  latestQuarter: 3,     // Latest quarter with data
  latestYear: 2024,     // Latest year with data
  stockName: ['台積電', 'TSMC'],
  stock_gain_rate: 0.12 // Quarterly growth rate
}
```

**Side Effects**:
- MongoDB write to `STOCKDB`
- Redis cache reads for price data
- External API calls (TWSE/Yahoo Finance)

**Auth/Invocation**: No authentication required (internal function)

---

#### Test Scenarios for getSingleStockV2

**A. Logical Branches**

1. **TWSE Stock - Normal Case**
   - **Input**: `type='twse'`, `obj={index:'2330'}`, `stage=0`, `back=4`
   - **Expected**: Fetches TSMC data, calculates ratios, returns complete object
   - **Assertions**: 
     - `per > 0`
     - `tag` includes current quarter (e.g., `'2024q3'`)
     - `stock_name` array length >= 1

2. **TWSE Stock - Delayed Reporting**
   - **Input**: `type='twse'`, `obj={index:'2330'}`, `stage=0`, `back=2` (during first month of new quarter)
   - **Expected**: Falls back to previous quarter, returns data with older tag
   - **Assertions**: 
     - `latestQuarter` = current quarter - 1
     - Function completes without error

3. **USSE Stock - Normal Case**
   - **Input**: `type='usse'`, `obj={index:'AAPL'}`, `stage=0`
   - **Expected**: Fetches Apple data via Yahoo Finance
   - **Assertions**:
     - `per` matches Yahoo's trailing PE (within 0.1 tolerance)
     - `stock_class` includes sector/industry

4. **Recursive Fallback - Missing Quarterly Data**
   - **Input**: `type='twse'`, `obj={index:'9999'}`, `stage=0`, `back=4` (non-existent recent data)
   - **Expected**: Tries 4 previous quarters, then annual report
   - **Assertions**: 
     - Function eventually returns or throws HoError
     - `back` parameter decrements correctly

**B. Edge Cases**

1. **Stock with Zero Price**
   - **Input**: Stock that returns price = 0 (trading suspended)
   - **Expected**: Ratios should handle division by zero gracefully
   - **Assertions**: 
     - `per` = 9999 or similar default
     - No crash/NaN values

2. **Stock with Zero Equity**
   - **Input**: Stock with `stock_equity = 0` (bankrupt company)
   - **Expected**: Division by zero prevented
   - **Assertions**: 
     - `per/pdr/pbr` = 9999 (default error value)

3. **Negative Profit (Loss)**
   - **Input**: Stock with `profit_loss < 0`
   - **Expected**: Negative PER calculated, but handled correctly
   - **Assertions**: 
     - Function completes
     - `per` stored as calculated value (may be negative)

4. **Missing Tag Array**
   - **Input**: Stock object without `tag` field
   - **Expected**: Creates new tag array
   - **Assertions**: 
     - `tag` array initialized with current quarter

5. **Very Old Stock (Back = 12)**
   - **Input**: `back=12` (search 3 years back)
   - **Expected**: Deep recursion handled without stack overflow
   - **Assertions**: 
     - Function returns within reasonable time (< 60s)

**C. Error Handling**

1. **API Timeout**
   - **Scenario**: TWSE API unresponsive (timeout > MAX_RETRY)
   - **Expected**: Throws HoError after retries exhausted
   - **Test**: Mock API to delay > 60s * MAX_RETRY
   - **Assertions**: 
     - Error message contains "timeout" or stock index
     - MongoDB not updated with invalid data

2. **Invalid Stock Index**
   - **Input**: `type='twse'`, `obj={index:'INVALID'}`
   - **Expected**: API returns error, function throws HoError
   - **Assertions**: 
     - Error message: `"stock INVALID price get fail"` or similar

3. **Malformed HTML Response**
   - **Scenario**: TWSE changes HTML structure
   - **Expected**: `findTag()` fails, throws HoError
   - **Test**: Mock response with altered DOM structure
   - **Assertions**: 
     - Error caught and logged
     - No partial data written to DB

4. **MongoDB Connection Failure**
   - **Scenario**: MongoDB down during upsert
   - **Expected**: Promise rejected with connection error
   - **Test**: Stop MongoDB container mid-execution
   - **Assertions**: 
     - Function throws, does not hang
     - Error propagated to caller

5. **Yahoo Finance Rate Limit**
   - **Scenario**: USSE stock, Yahoo returns 429 Too Many Requests
   - **Expected**: Retry logic engages, waits 60s
   - **Test**: Mock Yahoo to return 429 twice, then succeed
   - **Assertions**: 
     - Function succeeds after retries
     - Total time ~120s

**D. Auth Scenarios**

*N/A* - Internal function, no authentication layer

---

#### Snapshot Testing Data for getSingleStockV2

```javascript
// TWSE Stock - 台積電 (TSMC)
const mockTWSE2330 = {
  input: { type: 'twse', obj: { index: '2330' }, stage: 0, back: 4 },
  apiResponse: {
    price: 580,
    profit: 257000000,      // 257 billion TWD (thousands unit from API)
    equity: 25930380,       // 25.9 billion shares (thousands unit)
    dividend: 11000000,     // 11 billion TWD
    netValue: 475000000     // 475 billion TWD net worth
  },
  expected: {
    per: 58.22,             // 580 / (257000000 * 1000 / 25930380 / 1000)
    pdr: 136.82,            // 580 / (11000000 * 1000 / 25930380 / 1000)
    pbr: 3.17,              // 580 / (475000000 * 1000 / 25930380 / 1000)
    latestQuarter: 3,
    latestYear: 2024,
    stockName: ['台積電', 'TSMC', '台灣積體電路'],
    tag: ['2024q3', '2024q2', '2024q1']
  }
};

// USSE Stock - Apple Inc.
const mockUSSEAAPL = {
  input: { type: 'usse', obj: { index: 'AAPL' }, stage: 0 },
  yahooResponse: {
    price: 185.5,
    marketCap: 2900000000000,  // $2.9T
    trailingPE: 30.5,
    priceToBook: 45.2,
    sector: 'Technology',
    industry: 'Consumer Electronics'
  },
  expected: {
    per: 30.5,
    pbr: 45.2,
    equity: 15634541935,        // marketCap / price
    stock_class: ['Technology', 'Consumer Electronics'],
    tag: ['usa']
  }
};

// Edge Case - Zero Price (Suspended Trading)
const mockSuspended = {
  input: { type: 'twse', obj: { index: '1234' }, stage: 0 },
  apiResponse: { price: 0, profit: 100000, equity: 1000000 },
  expected: {
    per: 9999,    // Default error value
    pdr: 9999,
    pbr: 9999
  }
};

// Error Case - Invalid Index
const mockInvalidStock = {
  input: { type: 'twse', obj: { index: 'BADCODE' }, stage: 0 },
  expected: {
    error: true,
    errorType: 'HoError',
    errorMessage: /stock BADCODE price get fail/
  }
};
```

---

### 3.2 getStockPERV2(id)

**Purpose**: Retrieves current stock price and calculates real-time PER/PDR/PBR ratios for a given stock ID (MongoDB `_id`).

**Parameters**:
- `id` (string): MongoDB ObjectId of stock in `STOCKDB`

**Logic Flow**:
1. Queries MongoDB `STOCKDB` for stock document by `_id`
2. Extracts `stock_index` and `type` fields
3. Calls `getStockPrice(type, stock_index)` for current price
4. Retrieves cached financial data (profit, equity, dividend, net value) from DB
5. Recalculates ratios using fresh price:
   - `PER = price / (profit * 1000 / equity / 1000)`
   - `PDR = price / (dividend * 1000 / equity / 1000)`
   - `PBR = price / (netValue * 1000 / equity / 1000)`
6. Returns ratio object

**Returns**:
```javascript
{
  per: 15.23,
  pdr: 25.5,
  pbr: 1.8,
  price: 580,
  index: '2330'
}
```

**Side Effects**:
- MongoDB read from `STOCKDB`
- Redis cache read (via `getStockPrice`)
- External API call (TWSE/Yahoo Finance)

**Auth/Invocation**: Called by stock detail views, requires valid MongoDB ObjectId

---

#### Test Scenarios for getStockPERV2

**A. Logical Branches**

1. **Valid TWSE Stock**
   - **Input**: `id` of TSMC (2330) from STOCKDB
   - **Expected**: Returns recalculated ratios with current price
   - **Assertions**: 
     - `per` differs from stale DB value if price changed
     - `price` > 0

2. **Valid USSE Stock**
   - **Input**: `id` of AAPL from STOCKDB
   - **Expected**: Yahoo Finance called for fresh price
   - **Assertions**: 
     - Response time < 5s (API latency)

**B. Edge Cases**

1. **Non-Existent ID**
   - **Input**: Random MongoDB ObjectId not in STOCKDB
   - **Expected**: Query returns null, function throws
   - **Assertions**: 
     - Error: "Stock not found"

2. **Stock with Missing Financial Data**
   - **Input**: Valid ID but document missing `profit` field
   - **Expected**: Division by undefined/null handled
   - **Assertions**: 
     - Ratios return NaN or 9999

**C. Error Handling**

1. **MongoDB Query Failure**
   - **Scenario**: DB connection lost mid-query
   - **Expected**: Promise rejected
   - **Test**: Stop MongoDB during execution

2. **Price Fetch Timeout**
   - **Scenario**: `getStockPrice()` hangs
   - **Expected**: Timeout after MAX_RETRY attempts
   - **Test**: Mock price API to never respond

**D. Auth Scenarios**

*N/A* - Internal function

---

#### Snapshot Testing Data for getStockPERV2

```javascript
const mockGetPER = {
  input: { id: '507f1f77bcf86cd799439011' },  // MongoDB ObjectId
  dbDocument: {
    _id: '507f1f77bcf86cd799439011',
    stock_index: '2330',
    type: 'twse',
    profit: 257000000,
    equity: 25930380,
    dividend: 11000000,
    netValue: 475000000
  },
  currentPrice: 590,  // Price increased from 580
  expected: {
    per: 59.22,  // Recalculated: 590 / (257000000 * 1000 / 25930380 / 1000)
    pdr: 139.09,
    pbr: 3.22,
    price: 590,
    index: '2330'
  }
};
```

---

### 3.3 getPredictPERWarp(id, session, is_latest)

**Purpose**: Wrapper for PER prediction calculation with concurrency control to prevent overlapping resource-intensive operations.

**Parameters**:
- `id` (string): Stock MongoDB ObjectId
- `session` (object): User session object (for WebSocket context)
- `is_latest` (boolean): Flag to force latest data fetch

**Logic Flow**:
1. Checks `stockPredicting` flag
2. If `true`: Returns immediately with message "stock is predicting"
3. If `false`: Sets flag to `true`, proceeds with prediction logic
4. Calls internal prediction calculation (details in implementation)
5. Resets `stockPredicting` to `false` on completion/error
6. Returns prediction results

**Returns**:
```javascript
{
  predictedPER: 18.5,
  confidence: 0.85,
  historicalTrend: [15.2, 16.1, 17.3, 18.5],
  message: 'success'
}
// OR
{
  message: 'stock is predicting'  // If concurrent call
}
```

**Side Effects**:
- Sets/resets `stockPredicting` module variable
- MongoDB reads
- External API calls

**Auth/Invocation**: Called by authenticated users via stock-router

---

#### Test Scenarios for getPredictPERWarp

**A. Logical Branches**

1. **First Call (Not Predicting)**
   - **Input**: Valid `id`, `stockPredicting=false`
   - **Expected**: Executes prediction, sets flag, returns results
   - **Assertions**: 
     - `stockPredicting` set to `true` during execution
     - Reset to `false` after completion

2. **Concurrent Call (Already Predicting)**
   - **Input**: Valid `id`, `stockPredicting=true`
   - **Expected**: Returns immediately with "stock is predicting" message
   - **Assertions**: 
     - No DB/API calls made
     - Response time < 10ms

**B. Edge Cases**

1. **Flag Not Reset After Error**
   - **Scenario**: Previous call threw error, flag still `true`
   - **Expected**: Next call should still be blocked
   - **Test**: Force error in prediction logic, verify flag state

**C. Error Handling**

1. **Exception During Prediction**
   - **Scenario**: MongoDB error mid-prediction
   - **Expected**: Flag reset to `false` in finally block
   - **Assertions**: 
     - `stockPredicting = false` after error
     - Error propagated to caller

**D. Auth Scenarios**

1. **Unauthorized User**
   - **Input**: Session without valid auth
   - **Expected**: Depends on stock-router middleware
   - **Test**: Mock session with missing credentials

---

#### Snapshot Testing Data for getPredictPERWarp

```javascript
const mockPredictWarp = {
  normalCase: {
    input: { id: '507f1f77bcf86cd799439011', session: mockSession, is_latest: true },
    initialState: { stockPredicting: false },
    expected: {
      predictedPER: 18.5,
      message: 'success'
    }
  },
  concurrentCase: {
    input: { id: '507f1f77bcf86cd799439011', session: mockSession, is_latest: true },
    initialState: { stockPredicting: true },
    expected: {
      message: 'stock is predicting'
    }
  }
};
```

---


### 3.4 testData()

**Purpose**: Validates integrity of cached interval data in Redis for all stocks in STOCKDB.

**Parameters**: None

**Logic Flow**:
1. Queries all stocks from MongoDB STOCKDB
2. For each stock validates Redis cache
3. Returns validation summary

**Returns**: Validation summary object

**Side Effects**: Redis reads, MongoDB reads, console logging

---

### 3.5 cleanUseless(dryRun)

**Purpose**: Removes stock records not tagged with latest quarter and not in user portfolios.

**Parameters**:
- `dryRun` (boolean): If true, logs only without deleting

**Logic Flow**:
1. Determines current quarter tag
2. Finds outdated stocks
3. Checks user portfolios
4. Deletes if dryRun=false

**Returns**: Deletion summary with kept list

---

### 3.6 getIntervalV2(id, session)

**Purpose**: Fetches 60-month historical price/volume data with intelligent caching and corporate action adjustment.

**Parameters**:
- `id` (string): Stock MongoDB ObjectId
- `session` (object): User session for WebSocket

**Logic Flow**:
1. Checks Redis cache (`interval: {type}{index}`)
2. If miss:
   - **TWSE**: Fetches 60 months of daily data from TWSE CSV. Stores raw unadjusted prices with day-of-month (`{h, l, v, d}`). Calls `fetchTwseAdjustments()` to get corporate action events from official TWSE TWT49U/TWTAUU and TPEx exDailyQ APIs, then `applyAdjustments()` for backward price adjustment using cumulative ratio product
   - **USSE**: Fetches 60 months via Yahoo Finance `chart` endpoint. Stores raw unadjusted prices with day-of-month. Calls `extractUsseAdjustments()` to extract dividend/split/capitalGain events from Yahoo response, then `applyAdjustments()` for backward adjustment
3. Calls `validateIntervalData()` for data quality checks
4. Filters low-volume months
5. Calculates price distribution (max, min, min_vol)
6. Caches in Redis with TTL — stores `raw_list` (raw unadjusted), `adjustments` (events array), `ret_obj`, `etime`
7. `recur_web` now propagates per-holding trading state back into `TOTALDB` for both TWSE and USSE paths: `web`, `mid`, `times`, `wType`, `extrem`, and `metrics: web.metrics || null`. This is what makes backtest metrics available to `stockStatus` for Kelly-based sizing.
8. Returns interval data

**Returns**: Historical price data with distribution analysis

---

### 3.7 getIntervalWarp(id, session)

**Purpose**: Wrapper for getIntervalV2 with concurrency control.

**Parameters**: Same as getIntervalV2

**Logic Flow**:
1. Checks stockIntervaling flag
2. If true: Returns "intervaling" message
3. Else: Executes getIntervalV2 with flag protection

---

### 3.8 stockFilterV4(option, user, session)

**Purpose**: Main stock filtering engine with multi-criteria search capabilities.

**Parameters**:
- `option` (object): Filter criteria
- `user` (string): Username
- `session` (object): Session for WebSocket updates

**Logic Flow**:
1. Determines current quarter tag
2. Queries STOCKDB with filters (PER, growth, margin)
3. Applies pagination and sorting
4. Builds suggestion data cache
5. **§9b Volatility-normalized position size**: The market-cap enrichment loop now carries `extrem` inside `totalTwseMarketcapList` / `totalUsseMarketcapList`. After the market-cap-based `mcMul` is computed, it derives `volValue = max(0, 1 - extrem / 0.4)` and persists final `mul = min(5, mcMul + volValue)` with default baseline `1`. This sizing boost moved here from `getIntervalV2`'s old `recur_web` path.
6. Tags filtered stocks
7. Sends WebSocket updates
8. Returns filtered results

**Returns**: Array of matching stocks with metadata

---

### 3.9 stockFilterWarp(option, user, session)

**Purpose**: Wrapper for stockFilterV4 with concurrency control.

**Parameters**: Same as stockFilterV4

**Logic Flow**:
1. Checks stockFiltering flag
2. Executes with flag protection
3. Returns filtered results or "filtering" message

---

### 3.10 getStockTotal(user)

**Purpose**: Retrieves user's complete investment portfolio.

**Parameters**:
- `user` (string): Username

**Logic Flow**:
1. Queries TOTALDB for user holdings
2. Creates initial records if new user
3. Separates TWSE and USSE positions
4. Returns portfolio object

**Returns**: Portfolio with holdings array and cash positions

---

### 3.11 updateStockTotal(user, info, real)

**Purpose**: Parses and executes user stock transaction commands.

**Parameters**:
- `user` (string): Username
- `info` (string): Command string
- `real` (boolean): Execute real trades via broker API

**Command Syntax**:
- `remaintwse 800` - Set TWSE cash to 800
- `twse2330 5000` - Add stock with 5000 max amount
- `twse2330 100 50` - Record buy transaction (100 shares at 50)
- `delete twse2330` - Remove from portfolio

**Logic Flow**:
1. Parses command string
2. Validates stock existence
3. Updates MongoDB TOTALDB
4. If real=true: Executes via broker API
5. Returns updated portfolio

**Returns**: Updated portfolio state


---

## 4. Exported Functions - Named Exports

### 4.1 getSingleAnnual(year, folder, index)

**Purpose**: Downloads TWSE annual financial reports for 5-year range and uploads to Google Drive.

**Parameters**:
- `year` (number): Target year
- `folder` (string): Google Drive folder ID
- `index` (string): Stock index (e.g., '2330')

**Logic Flow**:
1. Iterates from (year - 5) to year
2. Calls TWSE annual report API for each year
3. Downloads PDF files
4. Uploads to Google Drive via GoogleApi
5. Stores file metadata
6. Returns summary

**Returns**: Array of uploaded file objects

**Side Effects**:
- File system writes (temporary)
- Google Drive API uploads
- External TWSE API calls

---

### 4.2 stockStatus(newStr)

**Purpose**: Refreshes live portfolio status, recalculates trade suggestions from `TOTALDB` + broker state, and persists updated per-position trading fields.

**Parameters**:
- `newStr` (string): Optional notification flag for WebSocket broadcasting

**Logic Flow**:
1. Queries `TOTALDB` for records missing `sType` (legacy selector used by live portfolio rows)
2. Loads current positions/orders from both brokerage paths: Shioaji (TWSE) and TDAmeritrade (USSE)
3. Reprices each holding, rebuilds `orig` / `amount` / `count` / `pl` / `order`, and resolves `newMid` stack state before calling `stockProcess()`
4. Applies normal position-control adjustments and persists refreshed `suggestionData`
5. **§9a Kelly Criterion sizing boost**: after position control, if `item.metrics` exists with `winRate > 0` and `avgLoss > 0`, computes `kelly = p - (1-p)/b` where `p = winRate / 100` and `b = avgWin / avgLoss`; when `kelly > 0.5`, it increments `bCount` for active buys and `sCount` for active sells
6. **§6c Conviction-weighted newOrder sorting**: downstream Shioaji/TDAmeritrade execution paths now push all candidates first, then use `Array.sort()` on `newOrder` with a 50/50 composite score of invested market value (`|count| × price`) and conviction (`1 / extrem`). Smaller `extrem` values therefore rank earlier.
7. Applies the emergency-stop fake-order guard when too many active holdings have active `newMid` stacks (items with `clear = true` or `ing = 2` are excluded), then writes updated state back to `TOTALDB`

**Returns**: Promise resolving after holdings are refreshed; execution candidates are exposed through `suggestionData` / downstream broker order queues

**Side Effects**: MongoDB reads/writes, broker API reads, Redis reads for recalculation, optional WebSocket notifications

---

### 4.3 getStockListV2(type, year, month)

**Purpose**: Fetches quarterly stock constituent lists for major indexes.

**Parameters**:
- `type` (string): 'twse' or 'usse'
- `year` (number): Year
- `month` (number): Month (1-12)

**Logic Flow**:
1. For TWSE: Scrapes quarterly report list from TWSE website
2. For USSE: Scrapes S&P 500, Nasdaq-100, Dow Jones from slickcharts.com
3. Parses HTML for stock indexes
4. Tags with market classification
5. Returns stock list

**Returns**: Array of {index, tag[], type}

**Side Effects**: External API/web scraping calls

---

### 4.4 stockProcess(price, priceArray, priceTimes, previous, pOrig, pAmount, pCount, pPricecost, pPl, upLimit, pType, sType, fee, ttime, tinterval, now, newMidDepth)

**Purpose**: Core trading logic - generates buy/sell signals based on price distribution.

**Parameters**:
- `price` (number): Current price
- `priceArray` (array): Price distribution stairs
- `priceTimes` (number): Price multiplier
- `previous` (object): {buy: [], sell: []} previous signals
- `pOrig` (number): Original investment amount
- `pAmount` (number): Current cash amount
- `pCount` (number): Share count held
- `pPricecost` (number): Average cost basis
- `pPl` (number): Profit/loss
- `upLimit` (number): Maximum position size
- `pType` (number): Trading type (0=normal, 1=reverse)
- `sType` (number): Stock type
- `fee` (number): Trading fee percentage
- `ttime` (number): Trading time restrictions
- `tinterval` (number): Time between trades
- `now` (number): Current timestamp
- `newMidDepth` (number): Current newMid stack depth, passed to calcResetMid for graduated shift multiplier

**Logic Flow**:
1. Compares current price against distribution stairs (web array)
2. Generates BUY signal if price crosses below mid and amount available
3. Generates SELL signal if profit target reached or position too large
4. Applies trading fee calculations
5. Updates position (count, cost, P&L)
6. Respects time intervals and trading hours
7. **Price breakout**: If price falls below array → returns `{resetWeb: 1, newMid}` via `calcResetMid(priceArray, fee, 1, newMidDepth)`. If above → `{resetWeb: 2, newMid}` via `calcResetMid(priceArray, fee, 2, newMidDepth)`. The graduated shift multiplier is `1 + 0.5 × newMidDepth` (1σ → 1.5σ → 2σ → ...).
8. **Position control**: When newMid stack is non-empty, adjusts order sizes. If `newMid[last] ≤ mid` and amount > orig×5/8: buy at orig×1/2. If `newMid[last] ≥ mid` and amount < orig×3/8: sell at orig×1/2. Empty stack uses default logic.
9. **Emergency stop (§6d)**: If >50% of active items have non-empty newMid stacks, all new orders become fake orders until next newMid recalculation cycle. Items that are clearing (`clear = true`) or deleting (`ing = 2`) are excluded from the count and not forced to fake order.

**Returns**:
```javascript
// Normal signal
{ type, buy, sell, bCount, sCount, str, previous }

// Price breakout — grid needs shifting
{ resetWeb: 1|2, newMid: number }
```

**Side Effects**: None (pure calculation function)

---

### 4.5 stockTest(his_arr, loga, min, pType, start, reverse, len, rinterval, fee, ttime, tinterval, resetWeb, sType)

**Purpose**: Backtests trading strategy over historical data.

**Note**: The tmpPT (temporary previous trade) mechanism has been removed. Trade state is no longer saved/restored on newMid push/pop operations.

**Parameters**:
- `his_arr` (array): Historical price array
- `loga` (object): Logarithmic scale {arr, diff}
- `min` (number): Minimum price
- `pType` (number): Trading type
- `start` (number): Starting index
- `reverse` (boolean): Reverse strategy flag
- `len` (number): Analysis window length (default: 200)
- `rinterval` (number): Range interval
- `fee` (number): Trading fee
- `ttime` (number): Trading time
- `tinterval` (number): Trade interval
- `resetWeb` (number): Web reset frequency
- `sType` (number): Stock type

**Logic Flow**:
1. Initializes virtual portfolio with starting cash
2. Iterates through historical prices
3. For each bar:
   - Recalculates price distribution via calStair()
   - Calls stockProcess() for buy/sell signals
   - Updates position and P&L
4. Tracks metrics: maxGain, maxLoss, tradeCount
5. **Stack depth limit**: When newMid stack reaches `MAX_NEWMID_STACK` (5), recalculates mid & web from half history via `calStair()`. If still at max, halves again recursively (1/2 → 1/4 → 1/8 → 1/16). Max 3 recalculations per signal.
6. **Web recalculation clears newMid**: When web array is recalculated (checkweb reset, Phase 2), clears `newMid = []`.
7. Returns backtest summary

**Returns**:
```javascript
{
  finalAmount: 120000,
  initialAmount: 100000,
  roi: 0.20,
  maxGain: 35000,
  maxLoss: -8000,
  tradeCount: 45,
  winRate: 0.67,
  history: [/* trade log */]
}
```

**Side Effects**: None (pure simulation)

---

### 4.6 logArray(max, min, pos=100)

**Purpose**: Creates logarithmic price scale for distribution analysis.

**Parameters**:
- `max` (number): Maximum price
- `min` (number): Minimum price
- `pos` (number): Number of positions (default: 100)

**Logic Flow**:
1. Calculates log(max) - log(min)
2. Divides range into `pos` equal log steps
3. Generates array of prices in log scale
4. Returns array with step size

**Returns**:
```javascript
{
  arr: [420, 425.5, 431.2, ..., 650],
  diff: 2.5  // Step size in log space
}
```

**Side Effects**: None

---

### 4.7 calStair(raw_arr, loga, min, stair_start, fee, len)

**Purpose**: Calculates price distribution stairs using normal distribution percentiles.

**Parameters**:
- `raw_arr` (array): Raw price array
- `loga` (object): Logarithmic scale
- `min` (number): Minimum price
- `stair_start` (number): Starting index
- `fee` (number): Trading fee
- `len` (number/boolean): Analysis length or false for auto

**Logic Flow**:
1. Extracts window of prices (length `len` or auto)
2. Maps prices to log scale positions using adaptive bin count. Bin count is dynamically calculated based on data size, clamped to [25, 400].
3. Applies volume-time decay weighting with half-life of `VOLUME_DECAY_HALFLIFE` days. Recent data points receive higher weight in distribution calculations.
4. Calculates 7 percentiles using `NORMAL_DISTRIBUTION = [1, 2, 16, 50, 84, 98, 99]` → nd[] array
5. Identifies mid (nd[3] = 50th percentile), with σ boundaries at nd[0..6]
6. Selects `extrem` (daily swing percentile) at nd[4] (1σ=84th), fallback nd[5] (2σ=98th)
7. Builds web array via `calWeb()`: each of the 6 σ-layers (±1σ, ±2σ, ±3σ) gets steps proportional to its actual nd[] width, using `buildSteps(range)` helper. Empty layers (range ≤ 0) insert boundary marker only.
8. Returns distribution object

**Returns**:
```javascript
{
  mid: 520,        // nd[3] — 50th percentile (median)
  arr: [-600, 580, 560, -540, ...],  // web array with σ-boundary markers (negative)
  times: 1,        // price multiplier
  // ... additional metrics
}
```

**Side Effects**: None

---

### 4.8 getSuggestionData(type='twse')

**Purpose**: Returns cached suggestion data for auto-complete.

**Parameters**:
- `type` (string): 'twse' or 'usse'

**Logic Flow**:
1. Returns module-level suggestionData cache
2. Data populated by stockFilterV4

**Returns**:
```javascript
{
  '2330': {
    name: ['台積電', 'TSMC'],
    tag: ['2024q3', 'semiconductor']
  },
  '2317': {
    name: ['鴻海'],
    tag: ['2024q3', 'electronics']
  }
}
```

**Side Effects**: None (read-only)

---

### 4.9 parseTwseRocDate(dateStr)

**Purpose**: Parses ROC (Republic of China) date strings to ISO format.

**Parameters**:
- `dateStr` (string): ROC date in format "113年03月18日" or "113/01/22"

**Returns**: `'YYYY-MM-DD'` string, or `null` if unrecognized format.

---

### 4.10 fetchTwseAdjustments(stockIndex, stockType)

**Purpose**: Fetches corporate action adjustment events from official TWSE/TPEx APIs.

**Parameters**:
- `stockIndex` (string): Stock code (e.g., '2330')
- `stockType` (number): 2=TPEx, 3=TWSE

**Logic Flow**:
1. Computes 5-year date range
2. If TWSE (type≠2): Calls TWT49U (ex-rights/dividends) and TWTAUU (capital reduction) APIs
3. If TPEx (type≠3): Calls exDailyQ API
4. Filters rows matching stockIndex
5. Computes ratio: `refPrice/prevClose` (ex-rights) or `prevClose/refPrice` (reduction)

**Returns**: `[{date, ratio, type}]` sorted by date ascending. Types: 'dividend', 'rights', 'both', 'reduction'.

---

### 4.11 extractUsseAdjustments(stockData, timestamps, quotes)

**Purpose**: Extracts adjustment events from Yahoo Finance chart API response.

**Parameters**:
- `stockData` (object): Yahoo Finance chart response (has `.events`)
- `timestamps` (number[]): Unix timestamps array
- `quotes` (object): `{close, high, low, volume}` arrays

**Logic Flow**:
1. For dividends: ratio = `(closeBefore - amount) / closeBefore`
2. For splits: ratio = `denominator / numerator` (e.g., 4:1 → 0.25)
3. For capitalGains: ratio = `(closeBefore - amount) / closeBefore`

**Returns**: `[{date, ratio, type}]` sorted by date ascending.

---

### 4.12 applyAdjustments(interval_data, adjustments)

**Purpose**: Applies backward price adjustment to raw interval data using cumulative ratio product.

**Parameters**:
- `interval_data` (object): `{year: {month: {raw: [{h, l, v, d}], max, min}}}`
- `adjustments` (array): `[{date, ratio, type}]`

**Algorithm**:
1. Deep-clone interval_data
2. Sort events by date descending
3. For each data point, compute `cumRatio = Π(event.ratio)` for all events where `event.date > pointDate`
4. `adjusted_price = raw_price × cumRatio`
5. Rebuild raw_arr (most recent month first, days reversed) and global max/min

**Returns**: `{adjustedData, raw_arr, max, min}`. Does not mutate the original input.

---

### 4.13 validateIntervalData(interval_data, raw_arr, adjustments)

**Purpose**: Validates data quality of interval data after adjustment.

**Checks**:
- NaN or zero/negative prices → `valid: false`
- High < low inversions → warning
- Zero-volume data points (>50%) → warning
- Price gaps >50% without adjustment events → warning
- Unusual adjustment ratios (≤0.05 or >20) → warning
- Data completeness (<6 months) → warning

**Returns**: `{valid: boolean, warnings: string[]}`

---

### 5.1 getStockPrice(type, index, previous)

**Purpose**: Fetches current stock price from TWSE or Yahoo Finance.

**Parameters**:
- `type` (string): 'twse' or 'usse'
- `index` (string): Stock index
- `previous` (boolean): If true, also returns previous close

**Logic Flow**:
1. For TWSE: Scrapes Yahoo Finance TW
2. For USSE: Calls getUsStock() helper
3. Parses HTML/JSON for price
4. Handles price = '-' (no data) cases
5. Retries on failure (MAX_RETRY times)

**Returns**: 
- If previous=false: number (price)
- If previous=true: [currentPrice, previousClose]

---

### 5.2 getBasicStockData(type, index)

**Purpose**: Fetches stock basic information (name, market, industry).

**Logic Flow**:
1. For TWSE: Scrapes MOPS website
2. Parses company name, market type, industry classification
3. Returns metadata object

**Returns**:
```javascript
{
  stock_index: '2330',
  stock_name: ['台積電', 'TSMC'],
  stock_full: '台灣積體電路製造股份有限公司',
  stock_market: '上市',
  stock_market_e: 'sii',
  stock_class: ['半導體', 'semiconductor'],
  stock_location: ['tw', '台灣']
}
```

---

### 5.3 handleStockTagV2(type, index, indexTag)

**Purpose**: Wrapper for getBasicStockData with tag merging logic.

**Logic Flow**:
1. Calls getBasicStockData()
2. Merges provided indexTag with fetched tags
3. Returns combined metadata

---

### 5.4 getParameterV2(data, type, text)

**Purpose**: Parses stock data for specific financial parameters.

**Logic Flow**:
1. Extracts profit, equity, dividend from API response
2. Handles various API response formats
3. Returns structured parameter object

---

### 5.5 getTwseAnnual(index, year, filePath)

**Purpose**: Downloads single TWSE annual report PDF.

**Logic Flow**:
1. Calls TWSE document server API
2. Downloads PDF to filePath
3. Returns file metadata

---

### 5.6 getUsStock(index, stat, single)

**Purpose**: Fetches US stock data from Yahoo Finance or macrotrends.

**Parameters**:
- `index` (string): Stock ticker
- `stat` (array): ['price', 'per', 'pbr', 'equity', 'previous']
- `single` (boolean): Single retry mode

**Logic Flow**:
1. Calls Yahoo Finance API for quote
2. If PER/PBR unavailable: Scrapes macrotrends.net
3. Parses and returns requested stats

**Returns**:
```javascript
{
  price: 185.5,
  previous: 183.2,
  per: 30.5,
  pbr: 45.2,
  equity: 15634541935
}
```

---

### 5.7 Ticker & Web Array Functions

**adjustWeb(webArr, webMid, amount, force)**: Thins the web array when the position budget requires fewer steps. Parses the array into σ-boundary markers (negative values) and step layers (positive values between boundaries). Assigns probability weights per layer (`sigmaProbs = [34.13, 13.59, 2.15]`), allocates kept steps proportionally to probability weight, and thins each layer with evenly-spaced index selection. Boundaries are always preserved.

**bitfinexTicker(price, large)**: Formats price for Bitfinex precision  
**usseTicker(price, large)**: Formats US stock price  
**twseTicker(price, large)**: Formats TWSE stock price

### 5.8 NewMid Helper Functions (Named Exports)

These three functions extract the duplicated newMid (price-breakout grid-shifting) logic that was previously inlined in `stockProcess`, `stockStatus`, `stockTest`, and `startStatus` (bitfinex-tool).

**scaleWebArr(stack, mid, webArr)**: Scales the web array by the top of the newMid stack. If stack is empty, returns the original array unchanged. Otherwise returns `webArr.map(v => v * stack[last] / mid)`.

**calcResetMid(priceArray, fee, direction, stackDepth=0)**: Computes the new midpoint when price breaks out of the web array. Accepts optional `stackDepth` parameter (default 0). The shift multiplier is `1 + 0.5 × stackDepth`: depth 0 → 1σ, depth 1 → 1.5σ, depth 2 → 2σ, etc. This implements graduated shifts where deeper stack entries shift further from mid. Collects all σ-boundary prices (negative markers), finds mid as the 4th boundary from the top (`midIdx = min(3, len-1)`), then selects a farther breakout-side boundary based on that multiplier:
- `direction=1` (price below): shifts below mid, capped at `midPrice * (1 - fee*10)`
- `direction=2` (price above): shifts above mid, capped at `midPrice * (1 + fee*10)`

**resolveNewMidStack(stack, price, mid, webArr, onPop)**: Unwinds the newMid stack when price returns towards the original mid. Loops while the top-of-stack entry satisfies the cross-back condition, calls `stack.pop()`, then invokes `onPop(poppedValue)` (callback sees post-pop stack state). Returns the final `scaleWebArr(stack, mid, webArr)` result.

---

## 6. Testing Strategy

### 6.1 Test Pyramid


```
         /\
        /  \        E2E Tests (5%)
       /----\       - Full user workflows
      /      \      - Browser automation
     /--------\     Integration Tests (25%)
    /          \    - API + DB + External services
   /------------\   - Redis cache flow
  /              \  Unit Tests (70%)
 /________________\ - Pure functions
                    - Mocked dependencies
```

### 6.2 Testing Approach

**Current Counts (2026-05-26)**: Repository-wide test coverage is **41 suites / 3992 tests**. `stock-tool` contributes **497 tests**.

**Unit Tests (Priority 1)**

Focus on pure calculation functions:
- `logArray()` - Mathematical correctness
- `calStair()` / `calWeb()` - Distribution percentiles with σ-layer widths
- `stockProcess()` - Trading logic with various scenarios
- `stockTest()` - Backtest calculations
- `scaleWebArr()` / `calcResetMid()` / `resolveNewMidStack()` - NewMid grid-shifting
- `adjustWeb()` - Normal-distribution-weighted array thinning
- Ticker formatters - Price precision

Tools: Jest, expect assertions

**Integration Tests (Priority 2)**

Test database and API interactions:
- `getSingleStockV2()` with MongoDB mock
- `getIntervalV2()` with Redis mock
- `stockFilterV4()` full pipeline
- External API call chains with nock/MSW

Tools: Jest, mongodb-memory-server, ioredis-mock, nock

**E2E Tests (Priority 3)**

User workflows:
- Stock search -> filter -> view details
- Portfolio management -> transaction recording
- Backtesting -> results visualization

Tools: Cypress, Playwright

---

## 7. Snapshot Testing Data

### 7.1 Complete Test Dataset - TSMC (2330)

```javascript
const TSMC_SNAPSHOT = {
  // Basic Info
  basicData: {
    stock_index: '2330',
    stock_name: ['台積電', 'TSMC', '台灣積體電路'],
    stock_full: '台灣積體電路製造股份有限公司',
    stock_market: '上市',
    stock_market_e: 'sii',
    stock_class: ['半導體', 'semiconductor'],
    stock_location: ['tw', '台灣']
  },
  
  // Financial Data (2024 Q3)
  financialData: {
    price: 580,
    profit: 257000000,        // 257 billion TWD (in thousands)
    equity: 25930380,         // 25.93 billion shares (in thousands)
    dividend: 11000000,       // 11 billion TWD
    netValue: 475000000,      // Net worth
    quarter: 3,
    year: 2024
  },
  
  // Calculated Ratios
  ratios: {
    per: 58.22,   // 580 / (257000000 * 1000 / 25930380 / 1000) = 580 / 9.914
    pdr: 136.82,  // 580 / (11000000 * 1000 / 25930380 / 1000) = 580 / 4.24
    pbr: 3.17,    // 580 / (475000000 * 1000 / 25930380 / 1000) = 580 / 183.21
    stock_gain_rate: 0.125  // 12.5% quarterly growth
  },
  
  // 60-Month Interval Data
  intervalData: {
    max: 688,
    min: 240,
    raw_arr: [
      { h: 580, l: 575, v: 50000, date: '2024-10-01' },
      { h: 585, l: 580, v: 52000, date: '2024-10-02' },
      // ... 1200+ entries
    ],
    loga: {
      arr: [240, 245.2, 250.5, ..., 688],
      diff: 2.18
    },
    mid: 450,
    up: 580,
    down: 350,
    extrem: 0.15,
    ds: 0.08,
    web: [400, 410, 420, 430, 440, 450, 460, 470, 480, 490],
    webMid: 5,
    webCount: 10
  },
  
  // Backtest Results (200-day window)
  backtestResults: {
    initialAmount: 100000,
    finalAmount: 135000,
    roi: 0.35,
    maxGain: 42000,
    maxLoss: -5200,
    tradeCount: 38,
    winRate: 0.71,
    avgHoldingPeriod: 5.2  // days
  }
};
```

### 7.2 US Stock Dataset - Apple (AAPL)

```javascript
const AAPL_SNAPSHOT = {
  basicData: {
    stock_index: 'AAPL',
    stock_name: ['Apple Inc.'],
    stock_class: ['Technology', 'Consumer Electronics'],
    stock_location: ['usa', 'us']
  },
  
  yahooFinanceData: {
    price: 185.5,
    marketCap: 2900000000000,
    trailingPE: 30.5,
    priceToBook: 45.2,
    previousClose: 183.2
  },
  
  ratios: {
    per: 30.5,
    pbr: 45.2,
    equity: 15634541935  // marketCap / price
  },
  
  intervalData: {
    max: 198,
    min: 124,
    volumeThreshold: 50000000,  // Higher for US stocks
    raw_arr: [
      { h: 185.5, l: 182.3, v: 95000000, date: '2024-10-01' }
      // ... entries
    ]
  }
};
```

### 7.3 Edge Cases Dataset

```javascript
const EDGE_CASES = {
  // Suspended Trading
  suspendedStock: {
    input: { type: 'twse', index: '9999' },
    price: 0,
    expected: {
      per: 9999,
      pdr: 9999,
      pbr: 9999,
      error: false  // Should handle gracefully
    }
  },
  
  // Negative Profit (Loss-Making)
  lossStock: {
    profit: -50000000,  // -50 billion loss
    equity: 10000000,
    price: 25,
    expected: {
      per: -5.0,  // Negative PER allowed
      warning: 'negative_profit'
    }
  },
  
  // Zero Equity (Bankrupt)
  bankruptStock: {
    equity: 0,
    price: 1,
    expected: {
      per: 9999,
      error: 'division_by_zero_prevented'
    }
  },
  
  // New IPO (< 12 months data)
  newIPO: {
    listingDate: '2024-03-01',
    currentDate: '2024-10-01',
    monthsAvailable: 7,
    expected: {
      raw_arr_length: 147,  // ~21 trading days * 7 months
      warning: 'insufficient_history'
    }
  },
  
  // Extreme Volatility
  volatileStock: {
    priceRange: { min: 10, max: 150 },  // 15x range
    expected: {
      loga_diff: 2.8,  // Larger log steps
      extrem: 0.35,    // High volatility threshold
      web_count: 15    // More price stairs
    }
  },
  
  // Low Liquidity
  lowVolumeStock: {
    avgVolume: 5000,  // Very low
    volumeThreshold: 10000,
    raw_arr_before_filter: 1260,
    expected: {
      raw_arr_after_filter: 450,  // Many months filtered
      warning: 'low_liquidity'
    }
  }
};
```

---

## 8. Test Scenarios by Function

### 8.1 getSingleStockV2 - Comprehensive Test Suite

```javascript
describe('getSingleStockV2', () => {
  describe('TWSE Stocks', () => {
    test('fetches complete data for valid stock', async () => {
      const result = await getSingleStockV2('twse', {index: '2330'}, 0, 4);
      expect(result.per).toBeGreaterThan(0);
      expect(result.stockName).toContain('台積電');
      expect(result.tag).toContain('2024q3');
    });
    
    test('handles delayed quarterly reporting', async () => {
      // Run in first month of new quarter
      const result = await getSingleStockV2('twse', {index: '2330'}, 0, 2);
      expect(result.latestQuarter).toBeLessThanOrEqual(getCurrentQuarter());
    });
    
    test('falls back to annual report when quarterly missing', async () => {
      mockTWSEAPI.mockQuarterlyData(null);
      mockTWSEAPI.mockAnnualData(VALID_ANNUAL_DATA);
      const result = await getSingleStockV2('twse', {index: '2330'}, 0, 4);
      expect(result.per).toBeDefined();
    });
    
    test('handles zero price (suspended trading)', async () => {
      mockTWSEAPI.mockPrice(0);
      const result = await getSingleStockV2('twse', {index: '9999'}, 0, 4);
      expect(result.per).toBe(9999);
    });
    
    test('handles negative profit correctly', async () => {
      mockTWSEAPI.mockFinancialData({profit: -50000000});
      const result = await getSingleStockV2('twse', {index: '1234'}, 0, 4);
      expect(result.per).toBeLessThan(0);
    });
    
    test('prevents division by zero with zero equity', async () => {
      mockTWSEAPI.mockFinancialData({equity: 0});
      const result = await getSingleStockV2('twse', {index: '1234'}, 0, 4);
      expect(result.per).toBe(9999);
    });
  });
  
  describe('USSE Stocks', () => {
    test('fetches data via Yahoo Finance', async () => {
      mockYahoo.mockQuote(AAPL_SNAPSHOT.yahooFinanceData);
      const result = await getSingleStockV2('usse', {index: 'AAPL'}, 0);
      expect(result.per).toBeCloseTo(30.5, 1);
    });
    
    test('handles Yahoo Finance timeout', async () => {
      mockYahoo.mockTimeout();
      await expect(getSingleStockV2('usse', {index: 'AAPL'}, 0))
        .rejects.toThrow(/timeout/);
    });
    
    test('handles invalid ticker', async () => {
      mockYahoo.mockError(404);
      await expect(getSingleStockV2('usse', {index: 'INVALID'}, 0))
        .rejects.toThrow();
    });
  });
  
  describe('Error Handling', () => {
    test('retries on API failure', async () => {
      let callCount = 0;
      mockTWSEAPI.mockImplementation(() => {
        callCount++;
        if (callCount < 3) throw new Error('Network error');
        return VALID_DATA;
      });
      const result = await getSingleStockV2('twse', {index: '2330'}, 0, 4);
      expect(callCount).toBe(3);
      expect(result.per).toBeDefined();
    });
    
    test('throws after MAX_RETRY attempts', async () => {
      mockTWSEAPI.mockRejectedValue(new Error('Persistent failure'));
      await expect(getSingleStockV2('twse', {index: '2330'}, 0, 4))
        .rejects.toThrow(/Persistent failure/);
    });
    
    test('handles MongoDB connection failure', async () => {
      mockMongo.mockConnectionError();
      await expect(getSingleStockV2('twse', {index: '2330'}, 0, 4))
        .rejects.toThrow(/connection/);
    });
  });
  
  describe('Data Validation', () => {
    test('validates PER calculation accuracy', async () => {
      const mockData = {
        price: 580,
        profit: 257000000,
        equity: 25930380
      };
      mockTWSEAPI.mockFinancialData(mockData);
      const result = await getSingleStockV2('twse', {index: '2330'}, 0, 4);
      const expectedPER = mockData.price / (mockData.profit * 1000 / mockData.equity / 1000);
      expect(result.per).toBeCloseTo(expectedPER, 2);
    });
  });
});
```

### 8.2 getIntervalV2 - Test Suite

```javascript
describe('getIntervalV2', () => {
  describe('Cache Behavior', () => {
    test('returns cached data when valid', async () => {
      mockRedis.set('interval: twse2330', {
        raw_list: JSON.stringify(MOCK_PRICE_DATA),
        etime: Date.now() + 86400000
      });
      
      const startTime = Date.now();
      const result = await getIntervalV2('twse2330-id', mockSession);
      const elapsed = Date.now() - startTime;
      
      expect(elapsed).toBeLessThan(100);  // Fast cache hit
      expect(result.raw_arr).toBeDefined();
      expect(mockTWSEAPI).not.toHaveBeenCalled();
    });
    
    test('fetches fresh data on cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockTWSEAPI.mockHistoricalData(TSMC_SNAPSHOT.intervalData.raw_arr);
      
      const result = await getIntervalV2('twse2330-id', mockSession);
      
      expect(mockTWSEAPI).toHaveBeenCalled();
      expect(mockRedis.set).toHaveBeenCalledWith(
        'interval: twse2330',
        expect.objectContaining({ raw_list: expect.any(String) })
      );
    });
    
    test('refreshes expired cache', async () => {
      mockRedis.get.mockResolvedValue({
        raw_list: JSON.stringify(OLD_DATA),
        etime: Date.now() - 1000  // Expired
      });
      
      const result = await getIntervalV2('twse2330-id', mockSession);
      expect(mockTWSEAPI).toHaveBeenCalled();
    });
  });
  
  describe('Volume Filtering', () => {
    test('filters out low-volume months', async () => {
      const mixedVolumeData = [
        { h: 100, l: 95, v: 5000 },   // Below threshold
        { h: 102, l: 98, v: 50000 },  // Above threshold
        { h: 105, l: 100, v: 3000 }   // Below threshold
      ];
      mockTWSEAPI.mockHistoricalData(mixedVolumeData);
      
      const result = await getIntervalV2('twse2330-id', mockSession);
      expect(result.raw_arr).toHaveLength(1);
      expect(result.raw_arr[0].v).toBe(50000);
    });
  });
  
  describe('Price Distribution Calculation', () => {
    test('calculates correct log array', async () => {
      mockTWSEAPI.mockHistoricalData(PRICE_DATA_250_TO_650);
      const result = await getIntervalV2('twse2330-id', mockSession);
      
      expect(result.loga.arr[0]).toBeCloseTo(250, 1);
      expect(result.loga.arr[99]).toBeCloseTo(650, 1);
      expect(result.loga.diff).toBeGreaterThan(0);
    });
    
    test('computes percentile stairs correctly', async () => {
      const result = await getIntervalV2('twse2330-id', mockSession);
      expect(result.mid).toBeGreaterThan(result.down);
      expect(result.up).toBeGreaterThan(result.mid);
      expect(result.web).toHaveLength(result.webCount);
    });
  });
  
  describe('Edge Cases', () => {
    test('handles new IPO with limited history', async () => {
      const shortHistory = Array(150).fill().map((_, i) => ({
        h: 100 + i * 0.5,
        l: 99 + i * 0.5,
        v: 50000
      }));
      mockTWSEAPI.mockHistoricalData(shortHistory);
      
      const result = await getIntervalV2('new-ipo-id', mockSession);
      expect(result.raw_arr).toHaveLength(150);
      expect(result.max).toBeGreaterThan(result.min);
    });
    
    test('handles extreme price volatility', async () => {
      const volatileData = [
        { h: 150, l: 145, v: 50000 },
        { h: 25, l: 20, v: 50000 },   // 6x drop
        { h: 100, l: 95, v: 50000 }
      ];
      mockTWSEAPI.mockHistoricalData(volatileData);
      
      const result = await getIntervalV2('volatile-id', mockSession);
      expect(result.extrem).toBeGreaterThan(0.2);  // High volatility
      expect(result.loga.diff).toBeGreaterThan(2);
    });
  });
});
```

### 8.3 stockProcess - Trading Logic Tests

```javascript
describe('stockProcess', () => {
  const baseParams = {
    priceArray: [400, 410, 420, 430, 440, 450, 460, 470, 480, 490],
    priceTimes: 1,
    previous: {buy: [], sell: []},
    pOrig: 100000,
    upLimit: 500000,
    pType: 0,
    sType: 0,
    fee: 0.001425,
    ttime: TRADE_TIME,
    tinterval: TRADE_INTERVAL,
    now: Date.now() / 1000
  };
  
  describe('Buy Signals', () => {
    test('generates buy when price crosses below mid', () => {
      const result = stockProcess(
        430,  // price below mid (450)
        baseParams.priceArray,
        1,
        {buy: [], sell: []},
        100000,  // pAmount (cash available)
        0,       // pCount (no shares)
        0,       // pPricecost
        0,       // pPl
        500000,
        0, 0, 0.001425, TRADE_TIME, TRADE_INTERVAL
      );
      
      expect(result[0]).toBe('buy');
      expect(result[1]).toBeGreaterThan(0);  // Share count
      expect(result[2]).toBe(430);  // Buy price
    });
    
    test('does not buy when no cash available', () => {
      const result = stockProcess(430, baseParams.priceArray, 1, {buy: [], sell: []}, 0, 0, 0, 0, 500000, 0, 0, 0.001425, TRADE_TIME, TRADE_INTERVAL);
      expect(result).toEqual([]);
    });
    
    test('does not buy when already at position limit', () => {
      const result = stockProcess(430, baseParams.priceArray, 1, {buy: [], sell: []}, 0, 1000, 450, 0, 500000, 0, 0, 0.001425, TRADE_TIME, TRADE_INTERVAL);
      // Position value = 1000 * 430 = 430000, approaching limit
      expect(result).toEqual([]);
    });
  });
  
  describe('Sell Signals', () => {
    test('generates sell when profit target reached', () => {
      const result = stockProcess(
        480,  // Current price
        baseParams.priceArray,
        1,
        {buy: [], sell: []},
        0,       // pAmount (no cash)
        1000,    // pCount (holding 1000 shares)
        430,     // pPricecost (bought at 430)
        50000,   // pPl (current profit)
        500000,
        0, 0, 0.001425, TRADE_TIME, TRADE_INTERVAL
      );
      
      expect(result[0]).toBe('sell');
      expect(result[1]).toBeGreaterThan(0);
      expect(result[2]).toBe(480);
    });
    
    test('calculates trading fee correctly on sell', () => {
      const result = stockProcess(480, baseParams.priceArray, 1, {buy: [], sell: []}, 0, 1000, 430, 50000, 500000, 0, 0, 0.001425, TRADE_TIME, TRADE_INTERVAL);
      const [action, shareCount, price, newAmount] = result;
      const expectedFee = shareCount * price * 0.001425;
      const expectedAmount = shareCount * price - expectedFee;
      expect(newAmount).toBeCloseTo(expectedAmount, 2);
    });
  });
  
  describe('Time Restrictions', () => {
    test('respects TRADE_INTERVAL between trades', () => {
      const recent = Date.now() / 1000 - 30;  // 30 seconds ago
      const previous = {
        buy: [{ time: recent }],
        sell: []
      };
      
      const result = stockProcess(430, baseParams.priceArray, 1, previous, 100000, 0, 0, 0, 500000, 0, 0, 0.001425, TRADE_TIME, 60, recent + 10);
      expect(result).toEqual([]);  // Blocked by interval
    });
    
    test('allows trade after interval expires', () => {
      const longAgo = Date.now() / 1000 - 120;
      const previous = {
        buy: [{ time: longAgo }],
        sell: []
      };
      
      const result = stockProcess(430, baseParams.priceArray, 1, previous, 100000, 0, 0, 0, 500000, 0, 0, 0.001425, TRADE_TIME, 60);
      expect(result[0]).toBe('buy');
    });
  });
  
  describe('Reverse Strategy (pType=1)', () => {
    test('buys high instead of low', () => {
      const result = stockProcess(470, baseParams.priceArray, 1, {buy: [], sell: []}, 100000, 0, 0, 0, 500000, 1, 0, 0.001425, TRADE_TIME, TRADE_INTERVAL);
      expect(result[0]).toBe('buy');
    });
    
    test('sells low instead of high', () => {
      const result = stockProcess(440, baseParams.priceArray, 1, {buy: [], sell: []}, 0, 1000, 470, 0, 500000, 1, 0, 0.001425, TRADE_TIME, TRADE_INTERVAL);
      expect(result[0]).toBe('sell');
    });
  });
});
```

### 8.4 stockTest - Backtest Suite

```javascript
describe('stockTest', () => {
  test('runs complete backtest simulation', () => {
    const his_arr = TSMC_SNAPSHOT.intervalData.raw_arr;
    const loga = TSMC_SNAPSHOT.intervalData.loga;
    const min = TSMC_SNAPSHOT.intervalData.min;
    
    const result = stockTest(his_arr, loga, min, 0, 0, false, 200);
    
    expect(result.finalAmount).toBeDefined();
    expect(result.tradeCount).toBeGreaterThan(0);
    expect(result.roi).toBeDefined();
  });
  
  test('tracks max gain and max loss', () => {
    const result = stockTest(MOCK_HISTORICAL, MOCK_LOGA, 100, 0, 0, false, 200);
    expect(result.maxGain).toBeGreaterThanOrEqual(0);
    expect(result.maxLoss).toBeLessThanOrEqual(0);
  });
  
  test('calculates ROI correctly', () => {
    const result = stockTest(MOCK_HISTORICAL, MOCK_LOGA, 100, 0, 0, false, 200);
    const expectedROI = (result.finalAmount - 100000) / 100000;
    expect(result.roi).toBeCloseTo(expectedROI, 4);
  });
  
  test('respects analysis window length', () => {
    const result50 = stockTest(MOCK_HISTORICAL, MOCK_LOGA, 100, 0, 0, false, 50);
    const result200 = stockTest(MOCK_HISTORICAL, MOCK_LOGA, 100, 0, 0, false, 200);
    // Different window sizes should yield different results
    expect(result50.tradeCount).not.toBe(result200.tradeCount);
  });
});
```


### 8.5 stockFilterV4 - Filter Engine Tests

```javascript
describe('stockFilterV4', () => {
  describe('Basic Filtering', () => {
    test('filters by PER range', async () => {
      const option = {
        per_min: 10,
        per_max: 20
      };
      const result = await stockFilterV4(option, 'testuser', mockSession);
      result.forEach(stock => {
        expect(stock.per).toBeGreaterThanOrEqual(10);
        expect(stock.per).toBeLessThanOrEqual(20);
      });
    });
    
    test('filters by growth rate', async () => {
      const option = {
        growth_min: 0.1  // 10% minimum growth
      };
      const result = await stockFilterV4(option, 'testuser', mockSession);
      result.forEach(stock => {
        expect(stock.stock_gain_rate).toBeGreaterThanOrEqual(0.1);
      });
    });
    
    test('filters by industry class', async () => {
      const option = {
        class: 'semiconductor'
      };
      const result = await stockFilterV4(option, 'testuser', mockSession);
      result.forEach(stock => {
        expect(stock.stock_class).toContain('semiconductor');
      });
    });
  });
  
  describe('Pagination and Sorting', () => {
    test('respects limit parameter', async () => {
      const option = { limit: 10 };
      const result = await stockFilterV4(option, 'testuser', mockSession);
      expect(result).toHaveLength(10);
    });
    
    test('sorts by PER ascending', async () => {
      const option = { sortName: 'per', sortType: 1 };
      const result = await stockFilterV4(option, 'testuser', mockSession);
      for (let i = 1; i < result.length; i++) {
        expect(result[i].per).toBeGreaterThanOrEqual(result[i-1].per);
      }
    });
    
    test('sorts by growth rate descending', async () => {
      const option = { sortName: 'stock_gain_rate', sortType: -1 };
      const result = await stockFilterV4(option, 'testuser', mockSession);
      for (let i = 1; i < result.length; i++) {
        expect(result[i].stock_gain_rate).toBeLessThanOrEqual(result[i-1].stock_gain_rate);
      }
    });
  });
  
  describe('Suggestion Data Cache', () => {
    test('populates suggestion cache', async () => {
      await stockFilterV4({}, 'testuser', mockSession);
      const suggestions = getSuggestionData('twse');
      expect(Object.keys(suggestions).length).toBeGreaterThan(0);
    });
    
    test('includes stock name in suggestions', async () => {
      await stockFilterV4({}, 'testuser', mockSession);
      const suggestions = getSuggestionData('twse');
      expect(suggestions['2330']).toBeDefined();
      expect(suggestions['2330'].name).toContain('台積電');
    });
  });
  
  describe('WebSocket Updates', () => {
    test('sends progress updates via WebSocket', async () => {
      const sendWsMock = jest.fn();
      global.sendWs = sendWsMock;
      
      await stockFilterV4({}, 'testuser', mockSession);
      expect(sendWsMock).toHaveBeenCalled();
      expect(sendWsMock.mock.calls[0][0]).toMatchObject({
        type: 'stock_filter_progress'
      });
    });
  });
  
  describe('Concurrency Control', () => {
    test('blocks concurrent filter requests', async () => {
      const promise1 = stockFilterV4({}, 'user1', mockSession);
      const promise2 = stockFilterV4({}, 'user2', mockSession);
      
      const [result1, result2] = await Promise.all([promise1, promise2]);
      
      const blocked = [result1, result2].find(r => r.message === 'stock is filtering');
      expect(blocked).toBeDefined();
    });
  });
});
```

### 8.6 Portfolio Management Tests

```javascript
describe('updateStockTotal', () => {
  describe('Command Parsing', () => {
    test('sets TWSE cash with remaintwse command', async () => {
      const result = await updateStockTotal('testuser', 'remaintwse 800000', false);
      expect(result.se[0]).toBe(800000);
    });
    
    test('adds stock with amount command', async () => {
      const result = await updateStockTotal('testuser', 'twse2330 500000', false);
      const stock = result.stock.find(s => s.index === '2330');
      expect(stock.amount).toBe(500000);
    });
    
    test('records buy transaction', async () => {
      const result = await updateStockTotal('testuser', 'twse2330 100 580', false);
      const stock = result.stock.find(s => s.index === '2330');
      expect(stock.count).toBe(100);
      expect(stock.pricecost).toBe(580);
    });
    
    test('deletes stock with delete command', async () => {
      await updateStockTotal('testuser', 'twse2330 500000', false);
      const result = await updateStockTotal('testuser', 'delete twse2330', false);
      const stock = result.stock.find(s => s.index === '2330');
      expect(stock).toBeUndefined();
    });
  });
  
  describe('Real Trading Integration', () => {
    test('executes real trade via broker API when real=true', async () => {
      mockTdameritrade.getUsseOrder.mockResolvedValue({ orderId: '12345' });
      
      const result = await updateStockTotal('testuser', 'usseAAPL 100 185', true);
      expect(mockTdameritrade.getUsseOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'AAPL',
          quantity: 100,
          price: 185
        })
      );
    });
    
    test('does not execute real trade when real=false', async () => {
      const result = await updateStockTotal('testuser', 'usseAAPL 100 185', false);
      expect(mockTdameritrade.getUsseOrder).not.toHaveBeenCalled();
    });
  });
  
  describe('Error Handling', () => {
    test('throws on invalid command format', async () => {
      await expect(updateStockTotal('testuser', 'invalidcommand', false))
        .rejects.toThrow(/invalid command/);
    });
    
    test('throws on non-existent stock', async () => {
      await expect(updateStockTotal('testuser', 'twseINVALID 100 50', false))
        .rejects.toThrow(/stock not found/);
    });
  });
});

describe('getStockTotal', () => {
  test('retrieves user portfolio', async () => {
    mockMongo.find.mockResolvedValue([
      { user: 'testuser', type: 'twse', index: '2330', count: 100, amount: 500000 },
      { user: 'testuser', type: 'usse', index: 'AAPL', count: 50, amount: 200000 }
    ]);
    
    const result = await getStockTotal('testuser');
    expect(result.stock).toHaveLength(2);
    expect(result.se).toHaveLength(2);  // [twse_cash, usse_cash]
  });
  
  test('creates initial records for new user', async () => {
    mockMongo.find.mockResolvedValue([]);
    
    const result = await getStockTotal('newuser');
    expect(result.stock).toEqual([]);
    expect(result.se).toEqual([0, 0]);
  });
});
```

### 8.7 Calculation Function Tests

```javascript
describe('logArray', () => {
  test('generates 100 positions between min and max', () => {
    const result = logArray(650, 420, 100);
    expect(result.arr).toHaveLength(100);
    expect(result.arr[0]).toBeCloseTo(420, 1);
    expect(result.arr[99]).toBeCloseTo(650, 1);
  });
  
  test('handles small price range', () => {
    const result = logArray(11, 9, 100);
    expect(result.arr).toHaveLength(100);
    expect(result.diff).toBeGreaterThan(0);
  });
  
  test('handles large price range', () => {
    const result = logArray(10000, 100, 100);
    expect(result.arr).toHaveLength(100);
    expect(result.arr[50]).toBeCloseTo(1000, -1);  // Geometric middle
  });
  
  test('custom position count', () => {
    const result = logArray(100, 10, 50);
    expect(result.arr).toHaveLength(50);
  });
});

describe('calStair', () => {
  const mockPrices = Array(200).fill().map((_, i) => ({
    h: 100 + Math.sin(i / 10) * 10,
    l: 95 + Math.sin(i / 10) * 10,
    v: 50000
  }));
  
  const mockLoga = logArray(120, 85, 100);
  
  test('calculates mid price correctly', () => {
    const result = calStair(mockPrices, mockLoga, 85, 0, 0.001425, 200);
    expect(result.mid).toBeGreaterThan(85);
    expect(result.mid).toBeLessThan(120);
  });
  
  test('up price higher than mid', () => {
    const result = calStair(mockPrices, mockLoga, 85, 0, 0.001425, 200);
    expect(result.up).toBeGreaterThan(result.mid);
  });
  
  test('down price lower than mid', () => {
    const result = calStair(mockPrices, mockLoga, 85, 0, 0.001425, 200);
    expect(result.down).toBeLessThan(result.mid);
  });
  
  test('generates web array', () => {
    const result = calStair(mockPrices, mockLoga, 85, 0, 0.001425, 200);
    expect(result.web).toBeDefined();
    expect(result.web.length).toBe(result.webCount);
  });
  
  test('calculates volatility metrics', () => {
    const result = calStair(mockPrices, mockLoga, 85, 0, 0.001425, 200);
    expect(result.extrem).toBeGreaterThan(0);
    expect(result.ds).toBeGreaterThan(0);
  });
});
```

---

## 9. Performance Testing

### 9.1 Load Testing Scenarios

```javascript
describe('Performance Tests', () => {
  test('getSingleStockV2 completes within 5 seconds', async () => {
    const start = Date.now();
    await getSingleStockV2('twse', {index: '2330'}, 0, 4);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });
  
  test('getIntervalV2 cache hit < 100ms', async () => {
    // Pre-populate cache
    await getIntervalV2('twse2330-id', mockSession);
    
    const start = Date.now();
    await getIntervalV2('twse2330-id', mockSession);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
  });
  
  test('stockFilterV4 handles 5000 stocks < 10 seconds', async () => {
    const start = Date.now();
    await stockFilterV4({}, 'testuser', mockSession);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10000);
  });
  
  test('concurrent getIntervalV2 requests blocked properly', async () => {
    const promises = Array(10).fill().map(() => 
      getIntervalWarp('twse2330-id', mockSession)
    );
    const results = await Promise.all(promises);
    
    const blocked = results.filter(r => r.message === 'stock is intervaling');
    expect(blocked.length).toBeGreaterThan(0);
  });
});
```

### 9.2 Memory Testing

```javascript
describe('Memory Tests', () => {
  test('stockTest does not leak memory on large datasets', () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    for (let i = 0; i < 100; i++) {
      stockTest(LARGE_HISTORICAL_DATA, MOCK_LOGA, 100, 0, 0, false, 200);
    }
    
    global.gc();  // Force garbage collection
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryGrowth = finalMemory - initialMemory;
    
    expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);  // < 50MB growth
  });
});
```

---

## 10. Security Testing

### 10.1 Input Validation

```javascript
describe('Security Tests', () => {
  test('prevents SQL injection in stock index', async () => {
    const maliciousInput = "2330'; DROP TABLE STOCKDB; --";
    await expect(getSingleStockV2('twse', {index: maliciousInput}, 0, 4))
      .rejects.toThrow();
  });
  
  test('prevents NoSQL injection in MongoDB queries', async () => {
    const maliciousQuery = { $gt: '' };
    await expect(stockFilterV4({ per_min: maliciousQuery }, 'user', mockSession))
      .rejects.toThrow();
  });
  
  test('sanitizes WebSocket messages', async () => {
    const maliciousUser = '<script>alert("xss")</script>';
    await stockFilterV4({}, maliciousUser, mockSession);
    // Verify sendWs was called with sanitized data
    expect(mockSendWs).toHaveBeenCalledWith(
      expect.not.stringContaining('<script>')
    );
  });
});
```

### 10.2 Authorization Tests

```javascript
describe('Authorization Tests', () => {
  test('prevents user from accessing other portfolios', async () => {
    mockSession.user = 'user1';
    await expect(getStockTotal('user2'))
      .rejects.toThrow(/unauthorized/);
  });
  
  test('validates real trading permissions', async () => {
    mockSession.permissions = ['read'];  // No trading permission
    await expect(updateStockTotal('user', 'twse2330 100 580', true))
      .rejects.toThrow(/insufficient permissions/);
  });
});
```

---

## 11. Integration Testing

### 11.1 Full Workflow Tests

```javascript
describe('Integration: Stock Discovery to Portfolio', () => {
  test('complete user workflow', async () => {
    // 1. Get stock list
    const stockList = await getStockListV2('twse', 2024, 10);
    expect(stockList).toContain('2330');
    
    // 2. Filter stocks
    const filtered = await stockFilterV4({ per_max: 20 }, 'testuser', mockSession);
    const tsmc = filtered.find(s => s.stock_index === '2330');
    expect(tsmc).toBeDefined();
    
    // 3. Get stock details
    const details = await getSingleStockV2('twse', {index: '2330'}, 0, 4);
    expect(details.per).toBeDefined();
    
    // 4. Get interval data
    const interval = await getIntervalV2(tsmc._id, mockSession);
    expect(interval.raw_arr.length).toBeGreaterThan(0);
    
    // 5. Run backtest
    const backtest = stockTest(interval.raw_arr, interval.loga, interval.min);
    expect(backtest.roi).toBeDefined();
    
    // 6. Add to portfolio
    const portfolio = await updateStockTotal('testuser', 'twse2330 100 580', false);
    expect(portfolio.stock).toContainEqual(
      expect.objectContaining({ index: '2330', count: 100 })
    );
  });
});
```

---

## 12. Regression Testing

### 12.1 Known Bug Fixes

```javascript
describe('Regression Tests', () => {
  test('BUG-001: Division by zero with suspended stocks', async () => {
    // Fixed: Now returns 9999 instead of NaN
    mockTWSEAPI.mockPrice(0);
    const result = await getSingleStockV2('twse', {index: '9999'}, 0, 4);
    expect(result.per).toBe(9999);
    expect(isNaN(result.per)).toBe(false);
  });
  
  test('BUG-002: Redis cache corruption on malformed JSON', async () => {
    // Fixed: Now catches JSON parse errors
    mockRedis.get.mockResolvedValue({ raw_list: 'invalid json{' });
    await expect(getIntervalV2('twse2330-id', mockSession))
      .resolves.toBeDefined();  // Should fetch fresh data
  });
  
  test('BUG-003: Concurrent filter requests crash server', async () => {
    // Fixed: Now uses stockFiltering flag
    const promises = Array(5).fill().map(() => stockFilterV4({}, 'user', mockSession));
    await expect(Promise.all(promises)).resolves.toBeDefined();
  });
});
```

---

## 13. Test Execution Guide

### 13.1 Running Tests

```bash
# Run all tests
npm test src/back/models/stock-tool.test.js

# Run specific test suite
npm test -- --testNamePattern="getSingleStockV2"

# Run with coverage
npm test -- --coverage

# Run integration tests only
npm test -- --testPathPattern=integration

# Run performance tests
npm test -- --testNamePattern="Performance"
```

### 13.2 Test Environment Setup

```javascript
// jest.setup.js
import { MongoMemoryServer } from 'mongodb-memory-server';
import RedisMock from 'ioredis-mock';

let mongoServer;
let redisClient;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri();
  
  redisClient = new RedisMock();
  global.Redis = redisClient;
});

afterAll(async () => {
  await mongoServer.stop();
  await redisClient.quit();
});
```

---

## 14. Appendix

### 14.1 Constants Reference

```javascript
// Trading Parameters
TRADE_FEE = 0.001425       // 0.1425% TWSE fee
USSE_FEE = 0.0001          // 0.01% US fee
TRADE_TIME = [9, 13.5]     // 9:00 AM - 1:30 PM
TRADE_INTERVAL = 300       // 5 minutes between trades
RANGE_INTERVAL = 21        // 21 days rolling window

// Distribution Analysis
NORMAL_DISTRIBUTION = [1, 2, 16, 50, 84, 98, 99]  // Cumulative percentiles → ~-2.33σ, -2σ, -1σ, median, +1σ, +2σ, ~+2.33σ
GAIN_LOSS = 1.05           // 5% gain/loss threshold

// Retry Logic
MAX_RETRY = 3              // API retry count
RETRY_DELAY = 60000        // 60 seconds
```

### 14.2 Error Codes

| Code | Message | Action |
|------|---------|--------|
| E001 | "stock {index} price get fail" | Retry API call |
| E002 | "stock type unknown" | Check type parameter |
| E003 | "usa stock parse NA" | Check Yahoo Finance response |
| E004 | "MongoDB connection error" | Check DB status |
| E005 | "Redis cache write fail" | Continue without cache |

### 14.3 API Rate Limits

| Service | Limit | Recovery |
|---------|-------|----------|
| Yahoo Finance | 2000/hour | Wait 60s between retries |
| TWSE MOPS | Unknown | Exponential backoff |
| Google Drive | 1000/day | Queue uploads |

---

**END OF DOCUMENTATION**

*Generated for stock-tool.js (~4,620 lines)*  
*Last Updated: 2026-05-28*

