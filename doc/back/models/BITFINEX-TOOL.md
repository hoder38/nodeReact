# BITFINEX-TOOL.md — Comprehensive Testing Documentation

**Module**: `/src/back/models/bitfinex-tool.js`  
**Lines of Code**: ~3,230  
**Purpose**: Bitfinex cryptocurrency lending & trading automation system  
**Last Updated**: 2026-05-26

---

## Table of Contents

1. [Module Overview](#module-overview)
2. [Architecture & Dependencies](#architecture--dependencies)
3. [Global State Management](#global-state-management)
4. [Exported Functions](#exported-functions)
   - [calRate](#calrate)
   - [calWeb](#calweb)
   - [setWsOffer](#setwsoffer)
   - [resetBFX](#resetbfx)
   - [Default Export Object](#default-export-object)
5. [Testing Strategy](#testing-strategy)
6. [Snapshot Testing Data](#snapshot-testing-data)
7. [Integration Testing](#integration-testing)
8. [Security & Authentication](#security--authentication)

---

## Module Overview

### Purpose
The `bitfinex-tool.js` module serves as the core automation engine for the ANoMoPi platform's Bitfinex integration. It handles:

- **Automated Lending**: Dynamic interest rate calculation and funding offer management
- **Margin Trading**: Automated position management with risk controls
- **Real-Time Data**: WebSocket connections for live market data and account updates
- **Multi-Currency Support**: USD, USDT, BTC, ETH, LTC, DOT, SOL, ADA, XRP, AVAX, TRX, UNI
- **User Management**: Per-user bot configuration with customizable risk parameters
- **Portfolio Tracking**: Real-time wallet balances, active credits, and interest income

### Key Features
- **Dynamic Rate Calculation**: Uses historical candle data, order book depth, and volume-weighted analysis
- **Stair-Step Offer Distribution**: Implements `calStair()` algorithm for optimal offer placement
- **Risk Management**: Configurable risk limits (1-10), amount caps, and keep-amount thresholds
- **WebSocket Persistence**: Automatic reconnection with exponential backoff
- **Error Recovery**: Comprehensive error handling with `HoError` custom exception class
- **Session Management**: Redis-backed state persistence across server restarts
- **Sparse Data Safety**: Rate calculation arrays (orderbook and candle-based) padded to fixed 11-element length for robustness
- **Merge Rate Tolerance**: Offers within `BITFINEX_MIN × MERGE_RATE_TOLERANCE` of a delete target are merged instead of exact-match only

### Internal Trading Strategy Notes
- **§6c Conviction-weighted `newOrder` sorting**: `startStatus()` now pushes all candidates first, then runs `Array.sort()` on a 50/50 composite of invested market value (`Math.abs(item.count) * priceData[item.index].lastPrice`) and conviction (`1 / extrem`). This replaced the older `orig - amount` insertion ordering; smaller `extrem` values rank earlier.
- **§6d Emergency stop**: If >50% of active items have non-empty `newMid` stacks, all new orders become fake orders. Items that are clearing (`current.clear` matches the item's index) or deleting (`ing = 2`) are excluded from the count and not forced to fake order.
- **§9a Kelly Criterion sizing boost**: After the standard position-control pass, `startStatus()` checks `item.metrics`. When `winRate > 0` and `avgLoss > 0`, it computes `kelly = p - (1-p)/b` with `p = winRate / 100` and `b = avgWin / avgLoss`. If `kelly > 0.5`, it increments `bCount` and/or `sCount` when buy/sell suggestions are active.

---

## Architecture & Dependencies

### External Dependencies
```javascript
import { BITFINEX_KEY, BITFINEX_SECRET } from '../../../ver.js'
import BFX from 'bitfinex-api-node'                    // Bitfinex official SDK
import bfxApiNodeModels from 'bfx-api-node-models'    // Model classes
import Htmlparser from 'htmlparser2'                   // HTML parsing (unused?)
```

### Internal Dependencies
```javascript
import { calStair, stockProcess, stockTest, logArray, resolveNewMidStack, scaleWebArr } from '../models/stock-tool.js'
import Mongo from '../models/mongo-tool.js'            // MongoDB wrapper
import Redis from '../models/redis-tool.js'            // Redis wrapper
import Api from './api-tool.js'                        // HTTP API client
import { handleError, HoError, isValidString, findTag } from '../util/utility.js'
import sendWs from '../util/sendWs.js'                 // WebSocket notification system
import createLogger from '../../util/logger.js'        // Structured logging (pino)
```

### Constants (from `constants.js`)
- **Rate Limits**: `BITFINEX_EXP`, `BITFINEX_MIN`, `MAX_RATE`, `MINIMAL_OFFER`
- **Intervals**: `BITFINEX_INTERVAL`, `RATE_INTERVAL`, `ORDER_INTERVAL`, `API_WAIT`
- **Currencies**: `FUSD_SYM`, `FUSDT_SYM`, `FBTC_SYM`, `FETH_SYM`, etc.
- **Support Arrays**: `SUPPORT_COIN`, `SUPPORT_PRICE`, `SUPPORT_PAIR`, `SUPPORT_LEVERAGE`
- **Thresholds**: `EXTREM_RATE_NUMBER`, `EXTREM_DURATION`, `OFFER_MAX`, `RISK_MAX`
- **Merge Tolerance**: `MERGE_RATE_TOLERANCE` (tolerance multiplier for merge-offer rate matching)
- **Database Names**: `USERDB`, `TOTALDB`, `BITNIFEX_PARENT`

### Logging

`bitfinex-tool.js` uses structured logging via the project's **pino**-based logger (see `src/back/util/logger.js` and [OUTLINE.md §3.6](../../OUTLINE.md)):

```javascript
const log = createLogger('bitfinex');

log.debug({ currency, rate }, 'calculated final rate');
log.debug({ uid, offer }, 'submitting funding offer');
```

- All runtime output uses structured pino logging — **no `console.log` calls exist** in the module.
- Log level is controlled by the `LOG_LEVEL` environment variable (default: `debug`).

---

## Global State Management

### System State (Shared)
```javascript
const bfx = new BFX({ apiKey, apiSecret })  // Singleton BFX instance
const rest = bfx.rest(2, { transform: true })

let finalRate = {}       // { [currency]: calculatedRate }
let maxRange = {}        // { [currency]: { max, min } }
let currentRate = {}     // { [currency]: { rate, time, frr } }
let priceData = {}       // { [pair]: { dailyChange, lastPrice, time, str, str2 } }
```

### User State (Per-User Objects)
```javascript
let userWs = {}          // { [userID]: WebSocket connection }
let userOk = {}          // { [userID]: boolean (connection health) }
let updateTime = {}      // { [userID]: timestamp (last update) }
let extremRate = {}      // { [userID]: { [currency]: { lowTriggeredAt, highTriggeredAt, cnt, ... } } }

let available = {}       // { [userID]: { [currency]: { avail, total, time } } }
let margin = {}          // { [userID]: { [currency]: marginData } }

let offer = {}           // { [userID]: { [currency]: [...offerObjects] } }
let order = {}           // { [userID]: { [pair]: [...orderObjects] } }
const deleteOffer = []   // Array of offer IDs to delete
const deleteOrder = []   // Array of order IDs to delete
const fakeOrder = {}     // Placeholder orders for UI

let credit = {}          // { [userID]: { [currency]: [...creditObjects] } }
const closeCredit = {}   // { [userID]: [creditId, ...] }
let ledger = {}          // { [userID]: { [currency]: [...ledgerEntries] } }
let position = {}        // { [userID]: { [pair]: positionData } }
```

- **extremRate fields**: Renamed from `is_low`/`is_high` booleans to `lowTriggeredAt`/`highTriggeredAt` Unix timestamps. Comparisons like `highTriggeredAt < lowTriggeredAt` mean the high trigger happened before the low trigger.

### Data Structure Notes
- **State Reset**: All user state cleared on `resetBFX()` or user disconnect
- **Memory Leak Risk**: No automatic cleanup of disconnected users → potential memory growth
- **Race Conditions**: Multiple concurrent WebSocket updates may cause state inconsistency
- **No Locking**: Global state mutations not thread-safe (Node.js single-threaded mitigates this)

---

## Exported Functions

---

### calRate

**Signature**: `export const calRate = curArr => Promise<void>`

#### Purpose
Fetches real-time ticker data and historical candle data for all supported currencies to calculate optimal lending rates. This is the primary rate calculation engine for the automated lending system.

#### Parameters
- `curArr` (Array): Currency array (currently unused, operates on all `SUPPORT_COIN` globally)

#### Logic Flow

1. **Price Data Collection** (`recurPrice`)
   - Iterate through `SUPPORT_PRICE` array (spot trading pairs like tBTCUSD, tETHUSD)
   - For each pair:
     - Fetch ticker via `rest.ticker(pair)`
     - Retrieve cached Redis data: `bitfinex: ${pair}`
     - Store in `priceData[pair]`:
       ```javascript
       {
         dailyChange: ticker.dailyChangePerc * 100,  // Daily % change
         lastPrice: ticker.lastPrice,
         time: Math.round(Date.now() / 1000),
         str: redisData.str || '',                   // Cached string
         str2: previousData.str2 || ''               // Previous string
       }
       ```

2. **Rate Calculation** (`singleCal` for each currency)
   - Fetch ticker and order book: `rest.orderBook(curType, 'P0', 100)`
   - Calculate current rate:
     ```javascript
     currentRate[curType] = {
       rate: ticker.lastPrice * BITFINEX_EXP,
       time: Math.round(Date.now() / 1000),
       frr: ticker.frr * BITFINEX_EXP  // Flash Return Rate
     }
     ```

3. **Historical Analysis** (1440 minutes of 1m candles)
   - Fetch candles: `rest.candles({ symbol, timeframe: '1m', period: 'p2', limit: 1440 })`
   - Calculate High/Low ranges for multiple timeframes:
     - Last 60 minutes (1 hour)
     - Last 1440 minutes (24 hours)
   - Build volume-weighted distribution in `weight[]` array
   - Store in `hl[]` array:
     ```javascript
     hl.push({
       high: calculatedHigh,
       low: calculatedLow,
       vol: totalVolume,
       rate: currentRate,
       time: timestamp
     })
     ```

4. **Rate Persistence / Strategy Metadata**
   - Calculate `maxRange[curType]` (highest high across all timeframes)
   - Store in Redis: `rate:bitfinex:${curType}` with 30-day expiry
   - Store historical rate data in MongoDB `totaldb`
   - `updateWeb` also upserts the shared strategy row used by trading bots, including `web`, `wType`, `mid`, `extrem`, and `metrics` (`bestMetrics`)

5. **Final Rate Calculation** (`recurFinal`)
   - Apply `calStair()` algorithm to distribute offers across rate ranges
   - Consider:
     - Order book liquidity
     - Volume-weighted price levels
     - Historical high/low ranges
     - User-configured risk parameters
   - Store result in `finalRate[curType]`

6. **Market-Cap / Volatility Multiplier Refresh**
   - After CoinMarketCap data is fetched, user-owned trading rows build `mcList` entries as `{ _id, mc, extrem }`
   - Market-cap sizing still establishes the base `mcMul`
   - A volatility term is then added: `volValue = max(0, 1 - extrem / 0.4)`
   - Final position multiplier becomes `mul = min(5, mcMul + volValue)` with default base `1`
   - The persisted `mul` is later consumed by `startStatus()` when scaling `orig` and `times`

#### Rate Array Padding (R1/R2 Safety)
- `calOBRate` (orderbook-based rates) pads output to 11 elements with last known value when sparse orderbook data yields fewer entries.
- `calTenthRate` (candle histogram rates) similarly pads to 11 elements for sparse candle data.
- Without padding, `finalRate` mapping would index `undefined` causing silent failures.

#### Invocation/Authentication
- **Auth**: Uses system-level API keys (`BITFINEX_KEY`, `BITFINEX_SECRET`)
- **Called By**:
  - Background job scheduler (every `BITFINEX_INTERVAL` ms, ~5-10 minutes)
  - Manual trigger from admin panel
- **Rate Limits**: Bitfinex API limits apply (public: 90 req/min, private: 60 req/min)

#### Returns
- **Type**: `Promise<void>` (resolves on success, rejects with `HoError` on failure)
- **Side Effects**:
  - Mutates global `currentRate`, `priceData`, `maxRange`, `finalRate`
  - Writes to Redis (cache)
  - Writes to MongoDB (historical data)
  - May trigger `sendWs()` notifications if daily change exceeds `COIN_MAX`

#### Error Handling
- **Network Errors**: Retries with exponential backoff (implicit in REST client)
- **Invalid Data**: Skips to next currency if `ticker.lastPrice` is falsy
- **Redis Failures**: Continues execution, logs error (non-critical cache miss)
- **MongoDB Failures**: Propagates error, halts execution

---

### Snapshot Testing Data

**Test ID**: `SNAP-calRate-001`

**Input Mock**:
```javascript
// Mock REST API responses
rest.ticker('fUSD') → {
  lastPrice: 0.000082,
  dailyChangePerc: 0.0156,
  frr: 0.000078,
  volume: 1234567.89
}

rest.orderBook('fUSD', 'P0', 100) → [
  [0.000082, 3, 150000],    // [rate, period, amount]
  [0.000081, 3, 200000],
  // ... 98 more entries
]

rest.candles({ symbol: 'fUSD', timeframe: '1m', ... }) → [
  { mts: 1678901234000, high: 0.000083, low: 0.000081, volume: 12345 },
  // ... 1439 more candles
]

// Redis cached data
Redis('hgetall', 'bitfinex: tBTCUSD') → {
  str: 'cached_value_123',
  // other fields
}
```

**Expected State After Execution**:
```javascript
currentRate['fUSD'] = {
  rate: 82000,              // 0.000082 * 1000000000 (BITFINEX_EXP)
  time: 1678901300,
  frr: 78000
}

priceData['tBTCUSD'] = {
  dailyChange: 1.56,        // 0.0156 * 100
  lastPrice: 45123.45,
  time: 1678901300,
  str: 'cached_value_123',
  str2: ''
}

maxRange['fUSD'] = {
  max: 83000,
  min: 70000
}

finalRate['fUSD'] = 81500  // Calculated by calStair()
```

**MongoDB Insertion**:
```javascript
// totaldb collection insert
{
  _id: ObjectId("..."),
  currency: "fUSD",
  rate: 82000,
  frr: 78000,
  high: 83000,
  low: 70000,
  volume: 1234567.89,
  timestamp: ISODate("2023-03-15T12:15:00Z"),
  hl: [ /* array of high/low objects */ ],
  weight: [ /* volume distribution array */ ]
}
```

**Strategy TOTALDB Upsert (`updateWeb`)**:
```javascript
{
  index: 'tBTCUSD',
  sType: 1,
  web: web.arr,
  wType: lastest_type,
  mid: web.mid,
  extrem: web.extrem,
  metrics: bestMetrics
}
```
- `metrics` is reused later by `startStatus()` for the Kelly sizing boost.

---

### Comprehensive Test Scenarios

#### Test Suite: calRate Function

##### 1. Logical Branches

**Test 1.1: Normal Execution Path**
```javascript
describe('calRate - Normal Execution', () => {
  it('should calculate rates for all supported currencies', async () => {
    // Setup
    mockRESTClient.ticker.mockResolvedValue(validTickerData);
    mockRESTClient.orderBook.mockResolvedValue(validOrderBook);
    mockRESTClient.candles.mockResolvedValue(valid1440Candles);
    
    // Execute
    await calRate([]);
    
    // Assert
    expect(currentRate).toHaveProperty('fUSD');
    expect(currentRate).toHaveProperty('fBTC');
    expect(currentRate.fUSD.rate).toBeGreaterThan(0);
    expect(Redis).toHaveBeenCalledWith('setex', expect.any(String), 2592000, expect.any(String));
    expect(Mongo).toHaveBeenCalledWith('insert', 'totaldb', expect.objectContaining({
      currency: expect.any(String)
    }));
  });
});
```

**Test 1.2: Early Exit on Missing Data**
```javascript
it('should skip currency when ticker returns no lastPrice', async () => {
  // Setup
  mockRESTClient.ticker.mockResolvedValueOnce({ lastPrice: null });
  mockRESTClient.ticker.mockResolvedValueOnce({ lastPrice: 0.000082 });
  
  // Execute
  await calRate([]);
  
  // Assert
  expect(currentRate).not.toHaveProperty('fUSD'); // Skipped
  expect(currentRate).toHaveProperty('fBTC');     // Processed
});
```

**Test 1.3: Conditional Daily Change Warning**
```javascript
it('should send WebSocket warning when dailyChange exceeds COIN_MAX', async () => {
  // Setup (commented out in code, but test logic if enabled)
  mockRESTClient.ticker.mockResolvedValue({
    lastPrice: 45000,
    dailyChangePerc: -0.15  // -15% change
  });
  
  // Execute
  await calRate([]);
  
  // Assert (if feature enabled)
  // expect(sendWs).toHaveBeenCalledWith(
  //   expect.stringContaining('Daily Change'),
  //   0, 0, true
  // );
});
```

##### 2. Edge Cases

**Test 2.1: Empty Candle Data**
```javascript
it('should handle empty candle array gracefully', async () => {
  // Setup
  mockRESTClient.candles.mockResolvedValue([]);
  
  // Execute & Assert
  await expect(calRate([])).rejects.toThrow(); // Or should return gracefully?
  // Behavior unclear from code - needs specification
});
```

**Test 2.2: Partial Candle Data (< 1440 candles)**
```javascript
it('should calculate with partial candle data', async () => {
  // Setup
  mockRESTClient.candles.mockResolvedValue(
    Array(100).fill(null).map((_, i) => ({
      mts: Date.now() - i * 60000,
      high: 0.000082 + Math.random() * 0.000001,
      low: 0.000082 - Math.random() * 0.000001,
      volume: 10000 + Math.random() * 5000
    }))
  );
  
  // Execute
  await calRate([]);
  
  // Assert
  expect(currentRate.fUSD).toBeDefined();
  expect(maxRange.fUSD).toBeDefined();
  // Should still calculate even with incomplete data
});
```

**Test 2.3: Extreme Rate Values**
```javascript
it('should handle extreme rate values without overflow', async () => {
  // Setup
  mockRESTClient.ticker.mockResolvedValue({
    lastPrice: 999999999,  // Unrealistic high rate
    frr: 0.999999,
    dailyChangePerc: 9.99
  });
  
  // Execute
  await calRate([]);
  
  // Assert
  expect(currentRate.fUSD.rate).toBeLessThan(Number.MAX_SAFE_INTEGER);
  expect(isFinite(currentRate.fUSD.rate)).toBe(true);
});
```

**Test 2.4: Concurrent Execution**
```javascript
it('should handle concurrent calRate calls without race conditions', async () => {
  // Setup
  const promises = Array(5).fill(null).map(() => calRate([]));
  
  // Execute
  await Promise.all(promises);
  
  // Assert
  // Check that final state is consistent
  expect(Object.keys(currentRate).length).toBe(SUPPORT_COIN.length);
  // No duplicate Redis/Mongo writes
  expect(Redis.mock.calls.length).toBeLessThanOrEqual(SUPPORT_COIN.length * 2);
});
```


##### 3. Error Handling

**Test 3.1: REST API Network Failure**
```javascript
it('should propagate error when REST API is unreachable', async () => {
  // Setup
  mockRESTClient.ticker.mockRejectedValue(new Error('ECONNREFUSED'));
  
  // Execute & Assert
  await expect(calRate([])).rejects.toThrow('ECONNREFUSED');
});
```

**Test 3.2: Redis Connection Failure (Non-Critical)**
```javascript
it('should continue execution when Redis is unavailable', async () => {
  // Setup
  mockRedis.mockRejectedValue(new Error('Redis connection lost'));
  mockRESTClient.ticker.mockResolvedValue(validTickerData);
  mockRESTClient.candles.mockResolvedValue(valid1440Candles);
  
  // Execute
  await calRate([]);
  
  // Assert
  expect(currentRate).toHaveProperty('fUSD');
  expect(priceData.tBTCUSD.str).toBe(''); // Falls back to empty string
});
```

**Test 3.3: MongoDB Write Failure**
```javascript
it('should throw error when MongoDB insert fails', async () => {
  // Setup
  mockMongo.mockRejectedValue(new Error('MongoDB connection timeout'));
  
  // Execute & Assert
  await expect(calRate([])).rejects.toThrow('MongoDB connection timeout');
});
```

**Test 3.4: Invalid Ticker Data Format**
```javascript
it('should handle malformed ticker response', async () => {
  // Setup
  mockRESTClient.ticker.mockResolvedValue({
    // Missing lastPrice field
    dailyChangePerc: 0.02,
    frr: 0.000078
  });
  
  // Execute
  await calRate([]);
  
  // Assert
  expect(currentRate.fUSD).toBeUndefined(); // Skipped due to falsy lastPrice
});
```

##### 4. Authentication Scenarios

**Test 4.1: Valid API Credentials**
```javascript
it('should authenticate with valid BITFINEX_KEY and BITFINEX_SECRET', async () => {
  // Setup
  process.env.BITFINEX_KEY = 'valid_key_123';
  process.env.BITFINEX_SECRET = 'valid_secret_456';
  
  // Execute
  await calRate([]);
  
  // Assert
  expect(BFX).toHaveBeenCalledWith({
    apiKey: 'valid_key_123',
    apiSecret: 'valid_secret_456'
  });
  expect(currentRate).not.toEqual({});
});
```

**Test 4.2: Invalid API Credentials**
```javascript
it('should fail when API credentials are invalid', async () => {
  // Setup
  mockRESTClient.ticker.mockRejectedValue({
    message: 'apikey: invalid',
    code: 10100
  });
  
  // Execute & Assert
  await expect(calRate([])).rejects.toMatchObject({
    code: 10100
  });
});
```

**Test 4.3: Expired API Keys**
```javascript
it('should handle expired API keys gracefully', async () => {
  // Setup
  mockRESTClient.ticker.mockRejectedValue({
    message: 'apikey: expired',
    code: 10101
  });
  
  // Execute & Assert
  await expect(calRate([])).rejects.toMatchObject({
    message: expect.stringContaining('expired')
  });
  // Should trigger alert to admin
});
```

##### 5. Performance Tests

**Test 5.1: Execution Time Constraint**
```javascript
it('should complete within 30 seconds for all currencies', async () => {
  // Setup
  const startTime = Date.now();
  
  // Execute
  await calRate([]);
  
  // Assert
  const duration = Date.now() - startTime;
  expect(duration).toBeLessThan(30000);
});
```

**Test 5.2: Memory Leak Detection**
```javascript
it('should not leak memory on repeated calls', async () => {
  // Setup
  const initialMemory = process.memoryUsage().heapUsed;
  
  // Execute
  for (let i = 0; i < 100; i++) {
    await calRate([]);
  }
  
  // Force garbage collection if available
  if (global.gc) global.gc();
  
  // Assert
  const finalMemory = process.memoryUsage().heapUsed;
  const memoryGrowth = finalMemory - initialMemory;
  expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // < 50MB growth
});
```

---

### calWeb

**Signature**: `export const calWeb = curArr => Promise<void>`

#### Purpose
Calculates and updates web-based trading grid configuration for spot trading pairs. Generates stair-step buy/sell order arrays based on historical price data and volume analysis.

#### Parameters
- `curArr` (Array): Currency array filter (currently processes all `SUPPORT_PRICE`)

#### Logic Flow

1. **Web Grid Calculation** (`recurWeb`)
   - Iterate through `SUPPORT_PRICE` array (trading pairs: tBTCUSD, tETHUSD, etc.)
   - For each pair:
     - Retrieve `priceData[pair]` from previous `calRate()` execution
     - Fetch historical candles (longer timeframe than `calRate`)
     - Calculate optimal grid levels using `stockProcess()` function

2. **Grid Level Computation**
   ```javascript
   // Analyze candle data for support/resistance levels
   const { webArr, midPrice, gridType } = stockProcess({
     candles: historicalData,
     currentPrice: priceData[pair].lastPrice,
     volatility: priceData[pair].dailyChange
   });
   ```

3. **MongoDB Storage**
   - Store grid configuration in `totaldb` collection:
     ```javascript
     {
       index: pair,           // e.g., 'tBTCUSD'
       sType: 1,             // Grid type indicator
       web: webArr,          // Array of price levels
       wType: gridType,      // Grid calculation method
       mid: midPrice,        // Center price
       updated: timestamp
     }
     ```

4. **Redis Cache Update**
   - Cache grid data with key: `bitfinex: ${pair}`
   - Set `str` field for quick access (format unclear from code)

#### Invocation/Authentication
- **Auth**: System-level (no user-specific auth)
- **Called By**:
  - Background job scheduler (less frequent than `calRate`, ~hourly)
  - After `calRate()` completes in scheduled job
- **Depends On**: `priceData` must be populated by prior `calRate()` call

#### Returns
- **Type**: `Promise<void>`
- **Side Effects**:
  - Updates MongoDB `totaldb` collection (upsert operations)
  - Updates Redis cache
  - May trigger `sendWs()` if grid parameters change significantly

#### Error Handling
- **Missing Price Data**: Skips pair if `priceData[pair]` is undefined
- **Stock Process Failure**: Logs error, continues to next pair
- **Database Errors**: Propagates to caller

---

### Snapshot Testing Data

**Test ID**: `SNAP-calWeb-001`

**Preconditions**:
```javascript
// priceData must be set by prior calRate() call
priceData = {
  'tBTCUSD': {
    lastPrice: 45123.45,
    dailyChange: 2.34,
    time: 1678901300,
    str: 'rate_82000',
    str2: ''
  },
  'tETHUSD': {
    lastPrice: 2987.12,
    dailyChange: -1.23,
    time: 1678901300,
    str: 'rate_78000',
    str2: ''
  }
};
```

**Input Mock**:
```javascript
// Historical candles (longer timeframe)
rest.candles({ symbol: 'tBTCUSD', timeframe: '5m', limit: 1000 }) → [
  { mts: 1678901000000, open: 45000, high: 45200, low: 44900, close: 45100, volume: 123.45 },
  // ... 999 more candles
]

// stockProcess returns grid levels
stockProcess({ candles, currentPrice, volatility }) → {
  webArr: [44000, 44500, 45000, 45500, 46000, 46500, 47000],
  midPrice: 45000,
  gridType: 3  // Volume-weighted grid
}
```

**Expected MongoDB Update**:
```javascript
// Upsert to totaldb collection
{
  index: 'tBTCUSD',
  sType: 1,
  web: [44000, 44500, 45000, 45500, 46000, 46500, 47000],
  wType: 3,
  mid: 45000,
  updated: ISODate("2023-03-15T12:15:00Z")
}
```

**Expected Redis Update**:
```javascript
Redis('hmset', 'bitfinex: tBTCUSD', {
  str: 'grid_45000_3',
  web: JSON.stringify([44000, 44500, 45000, 45500, 46000, 46500, 47000]),
  updated: '1678901300'
})
```

---

### Comprehensive Test Scenarios

#### Test Suite: calWeb Function

##### 1. Logical Branches

**Test 1.1: Normal Grid Generation**
```javascript
describe('calWeb - Normal Execution', () => {
  it('should generate trading grids for all supported pairs', async () => {
    // Setup
    priceData = { 'tBTCUSD': validPriceData };
    mockRESTClient.candles.mockResolvedValue(validCandles);
    mockStockProcess.mockReturnValue(validGridResult);
    
    // Execute
    await calWeb([]);
    
    // Assert
    expect(Mongo).toHaveBeenCalledWith('update', 'totaldb', 
      { index: 'tBTCUSD', sType: 1 },
      expect.objectContaining({
        $set: expect.objectContaining({
          web: expect.any(Array),
          mid: expect.any(Number)
        })
      }),
      { upsert: true }
    );
  });
});
```

**Test 1.2: Skip Pair Without Price Data**
```javascript
it('should skip pairs without priceData', async () => {
  // Setup
  priceData = {}; // Empty
  
  // Execute
  await calWeb([]);
  
  // Assert
  expect(Mongo).not.toHaveBeenCalled();
  // Should complete without error
});
```

##### 2. Edge Cases

**Test 2.1: Extreme Volatility**
```javascript
it('should generate wider grids during high volatility', async () => {
  // Setup
  priceData = {
    'tBTCUSD': { lastPrice: 45000, dailyChange: 25.5 } // Extreme swing
  };
  mockStockProcess.mockReturnValue({
    webArr: [30000, 35000, 40000, 45000, 50000, 55000, 60000],
    midPrice: 45000,
    gridType: 4 // Wide volatility grid
  });
  
  // Execute
  await calWeb([]);
  
  // Assert
  const savedGrid = Mongo.mock.calls[0][2].$set.web;
  expect(savedGrid[1] - savedGrid[0]).toBeGreaterThan(4000); // Wide spacing
});
```

**Test 2.2: Low Liquidity Pair**
```javascript
it('should handle low liquidity pairs with sparse candle data', async () => {
  // Setup
  mockRESTClient.candles.mockResolvedValue(
    Array(50).fill(null).map(() => ({ 
      volume: Math.random() * 10 // Very low volume
    }))
  );
  
  // Execute
  await calWeb([]);
  
  // Assert
  // Should still generate grid, possibly with different gridType
  expect(Mongo).toHaveBeenCalled();
});
```

##### 3. Error Handling

**Test 3.1: stockProcess Throws Error**
```javascript
it('should continue to next pair if stockProcess fails', async () => {
  // Setup
  mockStockProcess
    .mockRejectedValueOnce(new Error('Insufficient data'))
    .mockResolvedValueOnce(validGridResult);
  
  // Execute
  await calWeb([]);
  
  // Assert
  // Should process second pair despite first failure
  expect(Mongo.mock.calls.length).toBeGreaterThan(0);
});
```

**Test 3.2: MongoDB Upsert Failure**
```javascript
it('should throw error when MongoDB upsert fails', async () => {
  // Setup
  mockMongo.mockRejectedValue(new Error('Write conflict'));
  
  // Execute & Assert
  await expect(calWeb([])).rejects.toThrow('Write conflict');
});
```

---

### setWsOffer

**Signature**: `export const setWsOffer = (id, curArr=[], uid) => Promise<void>`

#### Purpose
Establishes and manages a persistent WebSocket connection for a specific user to receive real-time Bitfinex account updates (wallet balances, offers, credits, orders, positions).

#### Parameters
- `id` (String): MongoDB user ObjectId
- `curArr` (Array): Array of currencies to monitor (default: all `SUPPORT_COIN`)
- `uid` (String): User identifier (may differ from `id`)

#### Logic Flow

1. **User Validation**
   ```javascript
   // Fetch user from MongoDB
   const user = await Mongo('find', USERDB, { _id: id });
   if (!user || !user[0].bitfinex) {
     throw new HoError('User does not have Bitfinex configuration');
   }
   ```

2. **Per-Currency Bot Configuration**
   ```javascript
   // Iterate through user.bitfinex array
   for (let bot of user.bitfinex) {
     const { type, key, secret, isActive } = bot;
     
     if (!isActive) continue; // Skip inactive bots
     
     // Initialize user-specific BFX instance
     const userBfx = new BFX({ apiKey: key, apiSecret: secret });
     const userWsInstance = userBfx.ws(2);
   }
   ```

3. **WebSocket Event Handlers**
   ```javascript
   userWsInstance.on('open', () => {
     console.log(`WebSocket opened for user ${uid}`);  // actual code uses: log.debug({ uid }, 'ws opened')
     userOk[uid] = true;
     
     // Authenticate
     userWsInstance.auth();
   });
   
   userWsInstance.on('auth', () => {
     // Subscribe to channels
     userWsInstance.subscribeFundingOffers(type);  // e.g., 'fUSD'
     userWsInstance.subscribeFundingCredits(type);
     userWsInstance.subscribeWallet('funding');
     
     if (SUPPORT_PAIR[type]) {
       // For tradable pairs, subscribe to trading data
       userWsInstance.subscribeOrders(SUPPORT_PAIR[type]); // e.g., 'tBTCUSD'
       userWsInstance.subscribePositions();
       userWsInstance.subscribeWallet('exchange');
     }
   });
   ```

4. **Data Update Handlers**
   ```javascript
   // Wallet snapshot/update
   userWsInstance.onWalletSnapshot({}, (wallets) => {
     for (let wallet of wallets) {
       if (wallet.type === 'funding') {
         available[uid] = available[uid] || {};
         available[uid][wallet.currency] = {
           avail: wallet.balance - wallet.balanceAvailable,
           total: wallet.balance,
           time: Date.now() / 1000
         };
       }
     }
   });
   
   // Funding offers snapshot/update
   userWsInstance.onFundingOfferSnapshot({}, (offers) => {
     offer[uid] = offer[uid] || {};
     offer[uid][type] = offers.map(o => ({
       id: o.id,
       amount: o.amount,
       rate: o.rate * BITFINEX_EXP,
       period: o.period,
       status: o.status
     }));
   });
   
   // Funding credits (active loans)
   userWsInstance.onFundingCreditSnapshot({}, (credits) => {
     credit[uid] = credit[uid] || {};
     credit[uid][type] = credits.map(c => ({
       id: c.id,
       amount: c.amount,
       rate: c.rate * BITFINEX_EXP,
       period: c.period,
       positionPair: c.positionPair,
       status: c.status,
       rateReal: c.rateReal
     }));
   });
   
   // Ledger entries (interest payments)
   userWsInstance.onFundingLedgerSnapshot({}, (ledgers) => {
     ledger[uid] = ledger[uid] || {};
     ledger[uid][type] = ledgers.filter(l => l.category === 'interest').map(l => ({
       id: l.id,
       amount: l.amount,
       rate: calculateRateFromInterest(l),
       time: l.mts / 1000
     }));
   });
   ```

5. **Trading Data Handlers** (if SUPPORT_PAIR exists)
   ```javascript
   // Order snapshot/update
   userWsInstance.onOrderSnapshot({}, (orders) => {
     order[uid] = order[uid] || {};
     order[uid][pair] = orders.map(o => ({
       id: o.id,
       type: o.type,
       amount: o.amount,
       price: o.price,
       status: o.status
     }));
   });
   
   // Position snapshot/update
   userWsInstance.onPositionSnapshot({}, (positions) => {
     position[uid] = position[uid] || {};
     for (let pos of positions) {
       position[uid][pos.symbol] = {
         amount: pos.amount,
         basePrice: pos.basePrice,
         liquidationPrice: pos.liquidationPrice,
         pl: pos.pl,
         plPerc: pos.plPerc
       };
     }
   });
   ```

6. **Reconnection Logic**
   ```javascript
   userWsInstance.on('close', () => {
     userOk[uid] = false;
     console.log(`WebSocket closed for user ${uid}`);  // actual code uses: log.debug({ uid }, 'ws closed')
     
     // Automatic reconnection after 5 seconds
     setTimeout(() => {
       if (!userOk[uid]) {
         setWsOffer(id, curArr, uid);
       }
     }, 5000);
   });
   
   userWsInstance.on('error', (err) => {
     console.error(`WebSocket error for user ${uid}:`, err);
     handleError(err);
   });
   ```

7. **Connection Management**
   ```javascript
   // Close existing connection if present
   if (userWs[uid]) {
     userWs[uid].close();
   }
   
   // Store new connection
   userWs[uid] = userWsInstance;
   
   // Open connection
   userWsInstance.open();
   ```


#### Invocation/Authentication
- **Auth**: Per-user API keys stored in user document (`user.bitfinex[].key`, `user.bitfinex[].secret`)
- **Called By**:
  - `bitfinex-router.js` on user login/bot activation
  - Background job to re-establish dropped connections
  - Admin panel "Refresh Connection" action
- **Validation**: Checks `isActive` flag before establishing connection

#### Returns
- **Type**: `Promise<void>` (resolves when connection is established)
- **Side Effects**:
  - Creates persistent WebSocket connection in `userWs[uid]`
  - Sets `userOk[uid] = true` on successful auth
  - Continuously updates global state objects:
    - `available[uid]`, `margin[uid]`: Wallet balances
    - `offer[uid]`, `credit[uid]`: Funding positions
    - `order[uid]`, `position[uid]`: Trading positions
    - `ledger[uid]`: Historical interest payments
  - Triggers UI updates via WebSocket notifications

#### Error Handling
- **User Not Found**: Returns `HoError('User does not exist!!!')`
- **Missing Bitfinex Config**: Returns `HoError('User does not have Bitfinex configuration')`
- **Authentication Failure**: Logs error, sets `userOk[uid] = false`, retries after 5s
- **Connection Drop**: Automatic reconnection with exponential backoff
- **Invalid API Keys**: Error event fired, connection closed, no retry

#### Lending System Robustness Improvements

**L3 — deleteOffer Cap**: The `deleteOffer` global array (used to track offers pending deletion) is now capped at `OFFER_MAX × 5` entries in `makeOnFundingOfferClose`. Previously, `deleteOffer` only shrank when `submitOffer` matched entries, leading to unbounded growth.

**L4 — Offer Snapshot**: `adjustOffer` now snapshots `offer[id][current.type]` at the start of the async phase (`const offerSnapshot = [...offer[id][current.type]]`). This prevents WebSocket handlers from mutating the array mid-iteration during async `cancelOffer`/`submitOffer` calls.

**E1 — extremRate Field Rename**: `is_low`/`is_high` boolean fields renamed to `lowTriggeredAt`/`highTriggeredAt` storing Unix timestamps. Enables temporal comparisons (e.g., `highTriggeredAt < lowTriggeredAt` means high triggered before low).

**L1 — initialBookFn Risk Guard**: In `initialBookFn`, risk assignment uses descending post-decrement (10, 9, 8, ...). When `OFFER_MAX > RISK_MAX`, excess offers get a floor of `OFFER_MAX - RISK_MAX` instead of 0, preventing them from mapping to an invalid `finalRate` index.

**L2 — submitOffer Balance Optimization**: `submitOffer` now calls `calKeepCash()` REST endpoint once before the offer submission loop (instead of per-offer), tracking available balance locally with `submitAvailable`. Eliminates N round-trips and race conditions.

**§5 — Merge Rate Tolerance**: `mergeOffer.checkDelete` now uses tolerance-based matching: `|rate - deleteRate| ≤ BITFINEX_MIN × MERGE_RATE_TOLERANCE` instead of exact bucket match. Reduces unnecessary cancel+resubmit cycles for tiny rate shifts. `MERGE_RATE_TOLERANCE` defaults to 2.

---

### Snapshot Testing Data

**Test ID**: `SNAP-setWsOffer-001`

**Input**:
```javascript
// User document from MongoDB
const userDoc = {
  _id: '507f1f77bcf86cd799439011',
  username: 'testuser',
  bitfinex: [
    {
      type: 'fUSD',
      key: 'test_api_key_123',
      secret: 'test_api_secret_456',
      isActive: true,
      amountLimit: 10000,
      riskLimit: 5,
      waitTime: 300,
      miniRate: 50,
      dynamic: 100,
      keepAmount: 1000
    },
    {
      type: 'fBTC',
      key: 'test_api_key_789',
      secret: 'test_api_secret_012',
      isActive: false  // Should be skipped
    }
  ]
};

// Call function
await setWsOffer('507f1f77bcf86cd799439011', ['fUSD'], 'testuser');
```

**Expected WebSocket Events Sequence**:
```javascript
// 1. Connection opened
Event: 'open'
→ Sets userOk['testuser'] = true

// 2. Authentication sent
Event: 'auth' (outgoing)
→ Sends API key + signature

// 3. Authentication confirmed
Event: 'auth' (incoming)
→ Subscribes to channels

// 4. Channel subscriptions sent
subscribeFundingOffers('fUSD')
subscribeFundingCredits('fUSD')
subscribeWallet('funding')

// 5. Data snapshots received
Event: 'walletSnapshot'
Data: [
  { type: 'funding', currency: 'USD', balance: 15000, balanceAvailable: 5000 }
]
→ Updates available['testuser']['fUSD'] = { avail: 10000, total: 15000, time: 1678901300 }

Event: 'fundingOfferSnapshot'
Data: [
  { id: 123456, amount: 5000, rate: 0.000082, period: 2, status: 'ACTIVE' }
]
→ Updates offer['testuser']['fUSD'] = [{ id: 123456, amount: 5000, rate: 82000, period: 2, status: 'ACTIVE' }]

Event: 'fundingCreditSnapshot'
Data: [
  { id: 789012, amount: 8000, rate: 0.000078, period: 2, status: 'ACTIVE', positionPair: '' }
]
→ Updates credit['testuser']['fUSD'] = [{ id: 789012, amount: 8000, rate: 78000, ... }]

Event: 'fundingLedgerSnapshot'
Data: [
  { id: 345678, category: 'interest', amount: 1.25, mts: 1678800000000 }
]
→ Updates ledger['testuser']['fUSD'] = [{ id: 345678, amount: 1.25, rate: calculatedRate, time: 1678800 }]
```

**Expected Global State After Execution**:
```javascript
userWs['testuser'] = <WebSocket instance>
userOk['testuser'] = true
updateTime['testuser'] = 1678901300

available['testuser'] = {
  'fUSD': { avail: 10000, total: 15000, time: 1678901300 }
}

offer['testuser'] = {
  'fUSD': [
    { id: 123456, amount: 5000, rate: 82000, period: 2, status: 'ACTIVE' }
  ]
}

credit['testuser'] = {
  'fUSD': [
    { id: 789012, amount: 8000, rate: 78000, period: 2, status: 'ACTIVE', positionPair: '', rateReal: undefined }
  ]
}

ledger['testuser'] = {
  'fUSD': [
    { id: 345678, amount: 1.25, rate: 15.6, time: 1678800 }
  ]
}

// fBTC should NOT be present (isActive: false)
```

---

### Comprehensive Test Scenarios

#### Test Suite: setWsOffer Function

##### 1. Logical Branches

**Test 1.1: Single Active Bot**
```javascript
describe('setWsOffer - Single Bot', () => {
  it('should establish WebSocket for active bot only', async () => {
    // Setup
    const userDoc = {
      bitfinex: [
        { type: 'fUSD', key: 'key1', secret: 'secret1', isActive: true },
        { type: 'fBTC', key: 'key2', secret: 'secret2', isActive: false }
      ]
    };
    mockMongo.mockResolvedValue([userDoc]);
    
    // Execute
    await setWsOffer('userId', ['fUSD'], 'testuser');
    
    // Assert
    expect(BFX).toHaveBeenCalledTimes(1);
    expect(BFX).toHaveBeenCalledWith({ apiKey: 'key1', apiSecret: 'secret1' });
    expect(userWs['testuser']).toBeDefined();
    expect(userOk['testuser']).toBe(true);
  });
});
```

**Test 1.2: Multiple Active Bots**
```javascript
it('should establish connections for all active bots', async () => {
  // Setup
  const userDoc = {
    bitfinex: [
      { type: 'fUSD', key: 'key1', secret: 'secret1', isActive: true },
      { type: 'fBTC', key: 'key2', secret: 'secret2', isActive: true }
    ]
  };
  mockMongo.mockResolvedValue([userDoc]);
  
  // Execute
  await setWsOffer('userId', [], 'testuser');
  
  // Assert
  expect(BFX).toHaveBeenCalledTimes(2);
  // Should store last connection (or handle multiple?)
  // Code appears to overwrite userWs[uid] - potential bug
});
```

**Test 1.3: Tradable Pair Subscriptions**
```javascript
it('should subscribe to trading channels for supported pairs', async () => {
  // Setup
  const userDoc = {
    bitfinex: [
      { type: 'fUSD', key: 'key1', secret: 'secret1', isActive: true, isTrade: true }
    ]
  };
  mockMongo.mockResolvedValue([userDoc]);
  SUPPORT_PAIR['fUSD'] = 'tBTCUSD'; // Mock pair mapping
  
  // Execute
  await setWsOffer('userId', [], 'testuser');
  
  // Assert
  expect(mockWsInstance.subscribeOrders).toHaveBeenCalledWith('tBTCUSD');
  expect(mockWsInstance.subscribePositions).toHaveBeenCalled();
  expect(mockWsInstance.subscribeWallet).toHaveBeenCalledWith('exchange');
});
```

##### 2. Edge Cases

**Test 2.1: Existing Connection Replacement**
```javascript
it('should close existing connection before opening new one', async () => {
  // Setup
  const oldWs = { close: jest.fn() };
  userWs['testuser'] = oldWs;
  
  mockMongo.mockResolvedValue([validUserDoc]);
  
  // Execute
  await setWsOffer('userId', [], 'testuser');
  
  // Assert
  expect(oldWs.close).toHaveBeenCalled();
  expect(userWs['testuser']).not.toBe(oldWs);
});
```

**Test 2.2: Empty Bitfinex Configuration**
```javascript
it('should handle user with empty bitfinex array', async () => {
  // Setup
  mockMongo.mockResolvedValue([{ bitfinex: [] }]);
  
  // Execute
  const result = await setWsOffer('userId', [], 'testuser');
  
  // Assert
  expect(userWs['testuser']).toBeUndefined();
  // Should complete without error but not establish connection
});
```

**Test 2.3: Rapid Reconnection Loop**
```javascript
it('should prevent infinite reconnection loop', async () => {
  // Setup
  let connectionAttempts = 0;
  mockWsInstance.on.mockImplementation((event, callback) => {
    if (event === 'close') {
      callback(); // Trigger immediate reconnection
      connectionAttempts++;
    }
  });
  
  // Execute
  await setWsOffer('userId', [], 'testuser');
  
  // Wait for potential reconnection attempts
  await new Promise(resolve => setTimeout(resolve, 6000));
  
  // Assert
  expect(connectionAttempts).toBeLessThan(5); // Should have exponential backoff
});
```

##### 3. Error Handling

**Test 3.1: User Not Found in Database**
```javascript
it('should throw HoError when user does not exist', async () => {
  // Setup
  mockMongo.mockResolvedValue([]);
  
  // Execute & Assert
  await expect(setWsOffer('nonexistent', [], 'testuser'))
    .rejects.toThrow(HoError);
  await expect(setWsOffer('nonexistent', [], 'testuser'))
    .rejects.toMatchObject({ message: 'User does not exist!!!' });
});
```

**Test 3.2: WebSocket Authentication Failure**
```javascript
it('should handle authentication failure gracefully', async () => {
  // Setup
  mockMongo.mockResolvedValue([validUserDoc]);
  mockWsInstance.on.mockImplementation((event, callback) => {
    if (event === 'error') {
      callback({ message: 'ERR_AUTH_FAIL', code: 10100 });
    }
  });
  
  // Execute
  await setWsOffer('userId', [], 'testuser');
  
  // Trigger auth failure
  mockWsInstance.emit('error', { message: 'ERR_AUTH_FAIL' });
  
  // Assert
  expect(userOk['testuser']).toBe(false);
  expect(handleError).toHaveBeenCalled();
});
```

**Test 3.3: Network Connection Drop**
```javascript
it('should automatically reconnect after connection drop', async () => {
  // Setup
  jest.useFakeTimers();
  mockMongo.mockResolvedValue([validUserDoc]);
  
  // Execute
  await setWsOffer('userId', [], 'testuser');
  
  // Simulate connection drop
  mockWsInstance.emit('close');
  expect(userOk['testuser']).toBe(false);
  
  // Advance timers to trigger reconnection
  jest.advanceTimersByTime(5000);
  
  // Assert
  expect(setWsOffer).toHaveBeenCalledTimes(2); // Original + reconnection
  
  jest.useRealTimers();
});
```

**Test 3.4: Malformed Snapshot Data**
```javascript
it('should handle malformed wallet snapshot data', async () => {
  // Setup
  mockWsInstance.onWalletSnapshot.mockImplementation((opts, callback) => {
    callback([
      { type: 'funding', currency: null, balance: 'invalid' } // Malformed
    ]);
  });
  
  // Execute
  await setWsOffer('userId', [], 'testuser');
  
  // Assert
  expect(available['testuser']).toBeUndefined(); // Should not crash
  // Or: expect(available['testuser']['fUSD']).toBeUndefined();
});
```

##### 4. Authentication Scenarios

**Test 4.1: Valid Per-User API Credentials**
```javascript
it('should use user-specific API keys from database', async () => {
  // Setup
  const userDoc = {
    bitfinex: [{
      type: 'fUSD',
      key: 'user_specific_key',
      secret: 'user_specific_secret',
      isActive: true
    }]
  };
  mockMongo.mockResolvedValue([userDoc]);
  
  // Execute
  await setWsOffer('userId', [], 'testuser');
  
  // Assert
  expect(BFX).toHaveBeenCalledWith({
    apiKey: 'user_specific_key',
    apiSecret: 'user_specific_secret'
  });
});
```

**Test 4.2: Revoked API Permissions**
```javascript
it('should handle revoked API permissions', async () => {
  // Setup
  mockWsInstance.on.mockImplementation((event, callback) => {
    if (event === 'error') {
      callback({ message: 'ERR_PERMISSION_DENIED', code: 10102 });
    }
  });
  
  // Execute & Assert
  await setWsOffer('userId', [], 'testuser');
  mockWsInstance.emit('error', { message: 'ERR_PERMISSION_DENIED', code: 10102 });
  
  expect(userOk['testuser']).toBe(false);
  // Should not attempt reconnection for permission errors
});
```

##### 5. State Management Tests

**Test 5.1: Concurrent User Connections**
```javascript
it('should handle multiple users concurrently without state collision', async () => {
  // Setup
  mockMongo
    .mockResolvedValueOnce([{ _id: 'user1', bitfinex: [validBot1] }])
    .mockResolvedValueOnce([{ _id: 'user2', bitfinex: [validBot2] }]);
  
  // Execute
  await Promise.all([
    setWsOffer('user1', [], 'username1'),
    setWsOffer('user2', [], 'username2')
  ]);
  
  // Assert
  expect(userWs['username1']).toBeDefined();
  expect(userWs['username2']).toBeDefined();
  expect(userWs['username1']).not.toBe(userWs['username2']);
  
  expect(available['username1']).not.toBe(available['username2']);
});
```

**Test 5.2: State Cleanup on Connection Close**
```javascript
it('should preserve state after connection close for reconnection', async () => {
  // Setup
  await setWsOffer('userId', [], 'testuser');
  
  // Populate state
  available['testuser'] = { 'fUSD': { avail: 1000, total: 5000 } };
  
  // Execute
  mockWsInstance.emit('close');
  
  // Assert
  expect(userOk['testuser']).toBe(false);
  expect(available['testuser']).toBeDefined(); // State persists
  // Allows UI to show last known state during reconnection
});
```

---

### resetBFX

**Signature**: `export const resetBFX = (update=false) => Promise<void>`

#### Purpose
Resets the Bitfinex module's global state and re-initializes the system. Used for:
- Application startup initialization
- Configuration updates (when `update=true`)
- Error recovery after critical failures

#### Parameters
- `update` (Boolean): If `true`, resets user-specific state and closes all WebSocket connections. If `false`, only initializes system-level data structures.

#### Logic Flow

1. **Conditional User State Reset**
   ```javascript
   if (update) {
     // Close all active WebSocket connections
     for (let uid in userWs) {
       if (userWs[uid]) {
         userWs[uid].close();
       }
     }
     
     // Clear all user-specific state
     userWs = {};
     userOk = {};
     updateTime = {};
     extremRate = {};
     available = {};
     margin = {};
     offer = {};
     order = {};
     credit = {};
     ledger = {};
     position = {};
     
     // Clear delete queues
     deleteOffer.length = 0;
     deleteOrder.length = 0;
   }
   ```

2. **System State Initialization**
   ```javascript
   // Always reset system-level data
   finalRate = {};
   maxRange = {};
   currentRate = {};
   priceData = {};
   
   // Re-run rate calculation
   await calRate([]);
   await calWeb([]);
   ```

3. **Optional: Re-establish User Connections**
   ```javascript
   if (update) {
     // Query all active users from database
     const activeUsers = await Mongo('find', USERDB, { 
       'bitfinex.isActive': true 
     });
     
     // Re-establish WebSocket connections
     for (let user of activeUsers) {
       await setWsOffer(user._id, [], user.username);
     }
   }
   ```

#### Invocation/Authentication
- **Auth**: System-level operation (no user auth required)
- **Called By**:
  - Application startup (`file-server.js` initialization)
  - Admin panel "Reset System" action
  - Background job error recovery
  - After configuration file changes (via `UPDATE_BOOK` flag)

#### Returns
- **Type**: `Promise<void>`
- **Side Effects**:
  - Clears all global state objects
  - Closes all active WebSocket connections
  - Re-fetches rate data from Bitfinex API
  - Re-establishes user connections (if `update=true`)
  - May cause temporary service disruption (3-5 seconds)

#### Error Handling
- **MongoDB Query Failure**: Logs error, continues with empty user list
- **WebSocket Close Error**: Logs but does not propagate (non-critical)
- **calRate/calWeb Failure**: Propagates error, system remains in inconsistent state

---

### Snapshot Testing Data

**Test ID**: `SNAP-resetBFX-001`

**Scenario 1: Application Startup (update=false)**

**Initial State**:
```javascript
finalRate = { 'fUSD': 82000 };
currentRate = { 'fUSD': { rate: 82000, time: 1678800000 } };
// User state should be empty on startup
userWs = {};
userOk = {};
```

**Input**:
```javascript
await resetBFX(false);
```

**Expected Behavior**:
- Does NOT clear user state (already empty)
- Clears system state:
  ```javascript
  finalRate = {};
  currentRate = {};
  priceData = {};
  maxRange = {};
  ```
- Calls `calRate()` to fetch fresh data
- Calls `calWeb()` to recalculate grids
- Does NOT query MongoDB for users
- Does NOT establish any WebSocket connections

**Expected Final State**:
```javascript
// After calRate() and calWeb() complete
currentRate = {
  'fUSD': { rate: 82500, time: 1678901400, frr: 78000 },
  'fBTC': { rate: 125, time: 1678901400, frr: 120 },
  // ... other currencies
};

finalRate = {
  'fUSD': 81000,
  'fBTC': 122,
  // ... calculated by calStair()
};

priceData = {
  'tBTCUSD': { lastPrice: 45200, dailyChange: 1.2, ... },
  'tETHUSD': { lastPrice: 2995, dailyChange: -0.8, ... },
  // ... other pairs
};

userWs = {};  // Still empty
userOk = {};  // Still empty
```

---

**Scenario 2: Configuration Update (update=true)**

**Initial State**:
```javascript
// Active user connections
userWs = {
  'user1': <WebSocket instance 1>,
  'user2': <WebSocket instance 2>
};
userOk = {
  'user1': true,
  'user2': true
};
available = {
  'user1': { 'fUSD': { avail: 1000, total: 5000 } },
  'user2': { 'fBTC': { avail: 0.5, total: 1.2 } }
};
offer = {
  'user1': { 'fUSD': [{ id: 123, amount: 2000, rate: 82000 }] }
};
```

**Input**:
```javascript
await resetBFX(true);
```

**Expected Behavior**:
1. **Close All Connections**:
   ```javascript
   userWs['user1'].close() // Called
   userWs['user2'].close() // Called
   ```

2. **Clear All State**:
   ```javascript
   userWs = {};
   userOk = {};
   available = {};
   margin = {};
   offer = {};
   order = {};
   credit = {};
   ledger = {};
   position = {};
   deleteOffer = [];
   deleteOrder = [];
   
   finalRate = {};
   currentRate = {};
   priceData = {};
   maxRange = {};
   ```

3. **Re-fetch System Data**:
   - Calls `calRate()` → populates `currentRate`, `priceData`, etc.
   - Calls `calWeb()` → updates grid configurations

4. **Query Active Users**:
   ```javascript
   Mongo('find', USERDB, { 'bitfinex.isActive': true })
   → Returns [
       { _id: 'user1', username: 'user1', bitfinex: [...] },
       { _id: 'user2', username: 'user2', bitfinex: [...] }
     ]
   ```

5. **Re-establish Connections**:
   ```javascript
   await setWsOffer('user1', [], 'user1');
   await setWsOffer('user2', [], 'user2');
   ```

**Expected Final State**:
```javascript
userWs = {
  'user1': <NEW WebSocket instance>,
  'user2': <NEW WebSocket instance>
};
userOk = {
  'user1': true,
  'user2': true
};

// User data will be repopulated by WebSocket snapshots
available = {
  'user1': { 'fUSD': { avail: 1000, total: 5000, time: <new timestamp> } },
  'user2': { 'fBTC': { avail: 0.5, total: 1.2, time: <new timestamp> } }
};

// Fresh system data
currentRate = { /* populated by calRate() */ };
finalRate = { /* calculated by calStair() */ };
```


---

### Comprehensive Test Scenarios

#### Test Suite: resetBFX Function

##### 1. Logical Branches

**Test 1.1: Startup Mode (update=false)**
```javascript
describe('resetBFX - Startup Mode', () => {
  it('should initialize system without affecting user state', async () => {
    // Setup
    const existingUserState = { 'user1': <WebSocket> };
    userWs = existingUserState;
    
    // Execute
    await resetBFX(false);
    
    // Assert
    expect(userWs).toBe(existingUserState); // Not cleared
    expect(calRate).toHaveBeenCalled();
    expect(calWeb).toHaveBeenCalled();
    expect(Mongo).not.toHaveBeenCalledWith('find', USERDB, expect.any(Object));
  });
});
```

**Test 1.2: Update Mode (update=true)**
```javascript
it('should reset all state and re-establish connections', async () => {
  // Setup
  const mockWs1 = { close: jest.fn() };
  const mockWs2 = { close: jest.fn() };
  userWs = { 'user1': mockWs1, 'user2': mockWs2 };
  available = { 'user1': { 'fUSD': { avail: 1000 } } };
  
  mockMongo.mockResolvedValue([
    { _id: 'user1', username: 'user1', bitfinex: [{ isActive: true }] }
  ]);
  
  // Execute
  await resetBFX(true);
  
  // Assert
  expect(mockWs1.close).toHaveBeenCalled();
  expect(mockWs2.close).toHaveBeenCalled();
  expect(userWs).toEqual({}); // Cleared initially
  expect(available).toEqual({}); // Cleared
  expect(setWsOffer).toHaveBeenCalledWith('user1', [], 'user1');
});
```

##### 2. Edge Cases

**Test 2.1: No Active Users**
```javascript
it('should handle case with no active users gracefully', async () => {
  // Setup
  mockMongo.mockResolvedValue([]); // No active users
  
  // Execute
  await resetBFX(true);
  
  // Assert
  expect(userWs).toEqual({});
  expect(setWsOffer).not.toHaveBeenCalled();
});
```

**Test 2.2: WebSocket Already Closed**
```javascript
it('should handle already-closed WebSocket connections', async () => {
  // Setup
  const mockWs = { 
    close: jest.fn().mockImplementation(() => {
      throw new Error('WebSocket is already closed');
    })
  };
  userWs = { 'user1': mockWs };
  
  // Execute
  await resetBFX(true);
  
  // Assert
  expect(mockWs.close).toHaveBeenCalled();
  // Should not throw error, should continue execution
});
```

**Test 2.3: Null WebSocket in userWs**
```javascript
it('should skip null/undefined WebSocket entries', async () => {
  // Setup
  userWs = { 
    'user1': null, 
    'user2': undefined, 
    'user3': { close: jest.fn() } 
  };
  
  // Execute
  await resetBFX(true);
  
  // Assert
  expect(userWs['user3'].close).toHaveBeenCalled();
  // Should not throw error on null/undefined
});
```

##### 3. Error Handling

**Test 3.1: calRate Failure**
```javascript
it('should propagate error when calRate fails', async () => {
  // Setup
  mockCalRate.mockRejectedValue(new Error('API rate limit exceeded'));
  
  // Execute & Assert
  await expect(resetBFX(false)).rejects.toThrow('API rate limit exceeded');
});
```

**Test 3.2: MongoDB Query Failure**
```javascript
it('should handle MongoDB query failure in update mode', async () => {
  // Setup
  mockMongo.mockRejectedValue(new Error('MongoDB connection lost'));
  
  // Execute & Assert
  await expect(resetBFX(true)).rejects.toThrow('MongoDB connection lost');
  
  // System should remain in cleared state
  expect(userWs).toEqual({});
});
```

**Test 3.3: Partial Connection Re-establishment Failure**
```javascript
it('should continue re-establishing other users if one fails', async () => {
  // Setup
  mockMongo.mockResolvedValue([
    { _id: 'user1', username: 'user1', bitfinex: [{ isActive: true }] },
    { _id: 'user2', username: 'user2', bitfinex: [{ isActive: true }] }
  ]);
  
  mockSetWsOffer
    .mockRejectedValueOnce(new Error('User1 connection failed'))
    .mockResolvedValueOnce(); // User2 succeeds
  
  // Execute
  // Behavior depends on implementation - should it continue or fail?
  // Assuming it should log error and continue:
  await resetBFX(true);
  
  // Assert
  expect(mockSetWsOffer).toHaveBeenCalledTimes(2);
  expect(userWs['user2']).toBeDefined();
});
```

##### 4. Performance Tests

**Test 4.1: Reset Time Constraint**
```javascript
it('should complete reset within 60 seconds', async () => {
  // Setup
  const startTime = Date.now();
  mockMongo.mockResolvedValue(
    Array(50).fill(null).map((_, i) => ({
      _id: `user${i}`,
      username: `user${i}`,
      bitfinex: [{ isActive: true }]
    }))
  );
  
  // Execute
  await resetBFX(true);
  
  // Assert
  const duration = Date.now() - startTime;
  expect(duration).toBeLessThan(60000);
});
```

**Test 4.2: Memory Footprint After Reset**
```javascript
it('should free memory after state reset', async () => {
  // Setup
  // Populate large state
  for (let i = 0; i < 1000; i++) {
    available[`user${i}`] = { 'fUSD': { avail: 1000, total: 5000 } };
  }
  
  const memoryBefore = process.memoryUsage().heapUsed;
  
  // Execute
  await resetBFX(true);
  
  if (global.gc) global.gc();
  
  // Assert
  const memoryAfter = process.memoryUsage().heapUsed;
  expect(memoryAfter).toBeLessThan(memoryBefore);
});
```

---

## Default Export Object

The module exports a default object with 6 methods for user-facing operations:

```javascript
export default {
  getBot,
  updateBot,
  deleteBot,
  query,
  parent,
  closeCredit
}
```

---

### getBot

**Signature**: `getBot(id) => Promise<Array>`

#### Purpose
Retrieves Bitfinex bot configuration for a specific user.

#### Parameters
- `id` (String): MongoDB user ObjectId

#### Logic Flow
1. Query user document: `Mongo('find', USERDB, { _id: id })`
2. Validate user exists
3. Call `returnSupport(user.bitfinex)` to format bot configurations
4. Return formatted array

#### Returns
```javascript
// Array of bot configurations
[
  {
    type: 'fUSD',
    key: 'api_key_xxx',
    secret: 'api_secret_xxx',
    isActive: true,
    isDiff: false,
    isTrade: false,
    amountLimit: 10000,
    riskLimit: 5,
    waitTime: 300,
    miniRate: 50,
    dynamic: 100,
    keepAmount: 1000,
    keepAmountRate1: 80,
    keepAmountMoney1: 2000,
    dynamicRate1: 120,
    dynamicDay1: 30,
    dynamicRate2: 150,
    dynamicDay2: 60,
    pair: 'tBTCUSD=5000,tETHUSD=3000',
    clear: 'tBTCUSD,tETHUSD',
    tradable: true
  },
  // ... other currencies
]
```

#### Error Handling
- **User Not Found**: `HoError('User does not exist!!!')`

---

### updateBot

**Signature**: `updateBot(id, set, userID) => Promise<Array>`

#### Purpose
Updates Bitfinex bot configuration for a user. Validates all input parameters and updates MongoDB.

#### Parameters
- `id` (String): MongoDB user ObjectId
- `set` (Object): Configuration update object with fields:
  ```javascript
  {
    type: 'fUSD',           // Required - must be in SUPPORT_COIN
    key: String,            // Optional - API key
    secret: String,         // Optional - API secret
    amountLimit: Number,    // Optional - max offer amount
    riskLimit: Number,      // Optional - 1-10
    waitTime: Number,       // Optional - seconds between updates
    miniRate: Number,       // Optional - minimum rate
    dynamic: Number,        // Optional - dynamic rate adjustment
    keepAmount: Number,     // Optional - minimum balance to keep
    diff: Boolean,          // Optional - isDiff flag
    active: Boolean,        // Optional - isActive flag
    keepAmountRate1: Number, // Optional - tier 1 rate threshold
    keepAmountMoney1: Number, // Optional - tier 1 amount threshold
    dynamicRate1: Number,   // Optional - tier 1 dynamic rate
    dynamicDay1: Number,    // Optional - tier 1 duration (2-120 days)
    dynamicRate2: Number,   // Optional - tier 2 dynamic rate
    dynamicDay2: Number,    // Optional - tier 2 duration (2-120 days)
    trade: Boolean,         // Optional - isTrade flag (only for SUPPORT_PAIR)
    amount: Number,         // Optional - trade amount
    enter_mid: Number,      // Optional - entry mid price
    rate_ratio: Number,     // Optional - rate ratio
    pair: String            // Optional - comma-separated pairs
  }
  ```
- `userID` (String): User identifier for WebSocket management

#### Logic Flow

1. **Validate Currency Type**
   ```javascript
   if (!SUPPORT_COIN.includes(set.type)) {
     throw new HoError(`${set.type} is not support!!!`);
   }
   ```

2. **Validate and Sanitize Each Field**
   ```javascript
   const data = {};
   
   if (set.key) {
     const key = isValidString(set.key, 'name');
     if (!key) throw new HoError('API Key is not valid');
     data['key'] = key;
   }
   
   if (set.riskLimit) {
     const risk = isValidString(set.riskLimit, 'int');
     if (!risk) throw new HoError('Risk is not valid');
     data['riskLimit'] = Math.max(1, Math.min(10, parseInt(risk)));
   }
   
   // ... similar validation for all other fields
   ```

3. **Special Handling for Trading Pairs**
   ```javascript
   if (SUPPORT_PAIR[set.type] && set.pair) {
     // Parse pair string: 'tBTCUSD=5000,tETHUSD=3000'
     const pairArr = set.pair.split(',').map(p => {
       const [type, amount] = p.split('=');
       return { type, amount: parseFloat(amount) };
     });
     
     data['pair'] = pairArr;
   }
   ```

4. **Update User Document**
   ```javascript
   // Find or create bot entry for this currency
   const user = await Mongo('find', USERDB, { _id: id });
   let botIndex = user.bitfinex.findIndex(b => b.type === set.type);
   
   if (botIndex === -1) {
     // Add new bot
     user.bitfinex.push({ type: set.type, ...data });
   } else {
     // Update existing bot
     Object.assign(user.bitfinex[botIndex], data);
   }
   
   await Mongo('update', USERDB, { _id: id }, { $set: { bitfinex: user.bitfinex } });
   ```

5. **Reset WebSocket Connection**
   ```javascript
   if (userWs[userID]) {
     userWs[userID].close();
     userWs[userID] = null;
     userOk[userID] = false;
   }
   ```

6. **Update Trading Grid (if pair changed)**
   ```javascript
   if (data['pair']) {
     // Update totaldb with new pair allocations
     await Mongo('update', TOTALDB, 
       { owner: id, index: pairType },
       { $set: { times: calculatedTimes, orig: newAmount } }
     );
   }
   ```
   - When a new per-user `TOTALDB` trading row is inserted, it copies the shared `web`/`wType`/`mid`/`extrem` data and initializes `mul` as `1 + volValue`, where `volValue = max(0, 1 - extrem / 0.4)`.

#### Returns
- **Type**: `Promise<Array>` - Formatted bot configuration array (same as `getBot`)

#### Error Handling
- **Invalid Currency**: `HoError('${type} is not support!!!')`
- **Invalid API Key**: `HoError('API Key is not valid')`
- **Invalid Risk**: `HoError('Risk is not valid')`
- **Invalid Amount**: `HoError('Amount Limit is not valid')`
- **Invalid Rate**: `HoError('Mini Rate is not valid')`
- **Invalid Dynamic Day**: `HoError('Dynamic Rate N is not valid')` (must be 2-120 or 0)

---

### Snapshot Testing Data

**Test ID**: `SNAP-updateBot-001`

**Input**:
```javascript
await updateBot('507f1f77bcf86cd799439011', {
  type: 'fUSD',
  amountLimit: 15000,
  riskLimit: 7,
  miniRate: 60,
  dynamic: 120,
  keepAmount: 2000,
  active: true,
  diff: false,
  keepAmountRate1: 80,
  keepAmountMoney1: 3000,
  dynamicRate1: 130,
  dynamicDay1: 30
}, 'testuser');
```

**Expected MongoDB Update**:
```javascript
Mongo('update', USERDB, 
  { _id: '507f1f77bcf86cd799439011' },
  { 
    $set: { 
      'bitfinex.$[elem]': {
        type: 'fUSD',
        key: 'existing_key',  // Unchanged
        secret: 'existing_secret', // Unchanged
        amountLimit: 15000,    // Updated
        riskLimit: 7,          // Updated
        waitTime: 300,         // Unchanged
        miniRate: 60,          // Updated
        dynamic: 120,          // Updated
        keepAmount: 2000,      // Updated
        isActive: true,        // Updated
        isDiff: false,         // Updated
        keepAmountRate1: 80,   // Updated
        keepAmountMoney1: 3000, // Updated
        dynamicRate1: 130,     // Updated
        dynamicDay1: 30,       // Updated
        dynamicRate2: 0,       // Unchanged
        dynamicDay2: 0         // Unchanged
      }
    }
  },
  { arrayFilters: [{ 'elem.type': 'fUSD' }] }
);
```

**Expected Side Effects**:
```javascript
// WebSocket closed
expect(userWs['testuser'].close).toHaveBeenCalled();
userWs['testuser'] = null;
userOk['testuser'] = false;

// Return value
result = [
  {
    type: 'fUSD',
    key: 'existing_key',
    secret: 'existing_secret',
    amountLimit: 15000,
    riskLimit: 7,
    // ... all other fields
  },
  // ... other bot configurations
]
```


---

### Comprehensive Test Scenarios

#### Test Suite: updateBot Function

##### 1. Input Validation Tests

**Test 1.1: Valid Complete Update**
```javascript
describe('updateBot - Input Validation', () => {
  it('should accept and validate all valid fields', async () => {
    // Setup
    const validUpdate = {
      type: 'fUSD',
      key: 'new_api_key',
      secret: 'new_api_secret',
      amountLimit: 20000,
      riskLimit: 8,
      waitTime: 600,
      miniRate: 70,
      dynamic: 150,
      keepAmount: 3000,
      active: true,
      diff: false,
      keepAmountRate1: 90,
      keepAmountMoney1: 4000,
      dynamicRate1: 140,
      dynamicDay1: 45,
      dynamicRate2: 180,
      dynamicDay2: 90
    };
    
    mockMongo.mockResolvedValueOnce([{ _id: 'userId', bitfinex: [] }]);
    
    // Execute
    const result = await updateBot('userId', validUpdate, 'testuser');
    
    // Assert
    expect(result).toBeInstanceOf(Array);
    expect(Mongo).toHaveBeenCalledWith('update', USERDB, 
      { _id: 'userId' },
      expect.objectContaining({
        $set: expect.objectContaining({
          bitfinex: expect.any(Array)
        })
      })
    );
  });
});
```

**Test 1.2: Unsupported Currency Type**
```javascript
it('should reject unsupported currency type', async () => {
  // Setup
  const invalidUpdate = { type: 'fXYZ' }; // Not in SUPPORT_COIN
  
  // Execute & Assert
  await expect(updateBot('userId', invalidUpdate, 'testuser'))
    .rejects.toThrow(HoError);
  await expect(updateBot('userId', invalidUpdate, 'testuser'))
    .rejects.toMatchObject({ message: 'fXYZ is not support!!!' });
});
```

**Test 1.3: Invalid API Key Format**
```javascript
it('should reject invalid API key', async () => {
  // Setup
  const invalidUpdate = {
    type: 'fUSD',
    key: '<script>alert("xss")</script>' // XSS attempt
  };
  
  // Execute & Assert
  await expect(updateBot('userId', invalidUpdate, 'testuser'))
    .rejects.toThrow('API Key is not valid');
});
```

**Test 1.4: Risk Limit Clamping**
```javascript
it('should clamp riskLimit to 1-10 range', async () => {
  // Setup
  mockMongo.mockResolvedValueOnce([{ _id: 'userId', bitfinex: [] }]);
  
  // Test upper bound
  await updateBot('userId', { type: 'fUSD', riskLimit: 15 }, 'testuser');
  expect(Mongo.mock.calls[1][2].$set.bitfinex[0].riskLimit).toBe(10);
  
  // Test lower bound
  await updateBot('userId', { type: 'fUSD', riskLimit: -5 }, 'testuser');
  expect(Mongo.mock.calls[3][2].$set.bitfinex[0].riskLimit).toBe(1);
});
```

**Test 1.5: Dynamic Day Validation**
```javascript
it('should validate dynamicDay1 in 2-120 range or 0', async () => {
  // Valid: 0 (disable)
  await expect(updateBot('userId', { 
    type: 'fUSD', 
    dynamicRate1: 0, 
    dynamicDay1: 0 
  }, 'testuser')).resolves.toBeDefined();
  
  // Invalid: 1 (below minimum)
  await expect(updateBot('userId', { 
    type: 'fUSD', 
    dynamicRate1: 100, 
    dynamicDay1: 1 
  }, 'testuser')).rejects.toThrow('Dynamic Rate 1 is not valid');
  
  // Invalid: 150 (above maximum)
  await expect(updateBot('userId', { 
    type: 'fUSD', 
    dynamicRate1: 100, 
    dynamicDay1: 150 
  }, 'testuser')).rejects.toThrow('Dynamic Rate 1 is not valid');
  
  // Valid: 30 (in range)
  await expect(updateBot('userId', { 
    type: 'fUSD', 
    dynamicRate1: 100, 
    dynamicDay1: 30 
  }, 'testuser')).resolves.toBeDefined();
});
```

##### 2. Trading Pair Tests

**Test 2.1: Valid Pair Configuration**
```javascript
describe('updateBot - Trading Pairs', () => {
  it('should parse and validate pair string', async () => {
    // Setup
    SUPPORT_PAIR['fUSD'] = true; // Enable trading for fUSD
    const update = {
      type: 'fUSD',
      trade: true,
      pair: 'tBTCUSD=5000,tETHUSD=3000',
      amount: 10000,
      enter_mid: 45000,
      rate_ratio: 1.5
    };
    
    mockMongo.mockResolvedValueOnce([{ _id: 'userId', bitfinex: [] }]);
    mockMongo.mockResolvedValueOnce([/* totaldb grid data */]);
    
    // Execute
    await updateBot('userId', update, 'testuser');
    
    // Assert
    const savedPair = Mongo.mock.calls[1][2].$set.bitfinex[0].pair;
    expect(savedPair).toEqual([
      { type: 'tBTCUSD', amount: 5000 },
      { type: 'tETHUSD', amount: 3000 }
    ]);
  });
});
```

**Test 2.2: Trading on Non-Tradable Currency**
```javascript
it('should ignore trading config for non-tradable currencies', async () => {
  // Setup
  SUPPORT_PAIR['fLTC'] = undefined; // Not tradable
  const update = {
    type: 'fLTC',
    trade: true,  // Should be ignored
    amount: 1000
  };
  
  mockMongo.mockResolvedValueOnce([{ _id: 'userId', bitfinex: [] }]);
  
  // Execute
  await updateBot('userId', update, 'testuser');
  
  // Assert
  const savedBot = Mongo.mock.calls[1][2].$set.bitfinex[0];
  expect(savedBot.isTrade).toBeUndefined();
  expect(savedBot.amount).toBeUndefined();
});
```

##### 3. State Management Tests

**Test 3.1: WebSocket Closure on Update**
```javascript
describe('updateBot - State Management', () => {
  it('should close existing WebSocket connection', async () => {
    // Setup
    const mockWs = { close: jest.fn() };
    userWs['testuser'] = mockWs;
    userOk['testuser'] = true;
    
    mockMongo.mockResolvedValueOnce([{ _id: 'userId', bitfinex: [] }]);
    
    // Execute
    await updateBot('userId', { type: 'fUSD', miniRate: 60 }, 'testuser');
    
    // Assert
    expect(mockWs.close).toHaveBeenCalled();
    expect(userWs['testuser']).toBeNull();
    expect(userOk['testuser']).toBe(false);
  });
});
```

**Test 3.2: Update Without WebSocket**
```javascript
it('should handle update when no WebSocket exists', async () => {
  // Setup
  userWs['testuser'] = null;
  mockMongo.mockResolvedValueOnce([{ _id: 'userId', bitfinex: [] }]);
  
  // Execute & Assert
  await expect(updateBot('userId', { type: 'fUSD' }, 'testuser'))
    .resolves.toBeDefined();
  // Should not throw error
});
```

##### 4. Error Handling

**Test 4.1: User Not Found**
```javascript
it('should throw error when user does not exist', async () => {
  // Setup
  mockMongo.mockResolvedValueOnce([]); // Empty result
  
  // Execute & Assert
  await expect(updateBot('nonexistent', { type: 'fUSD' }, 'testuser'))
    .rejects.toThrow('User does not exist!!!');
});
```

**Test 4.2: MongoDB Update Failure**
```javascript
it('should propagate MongoDB update errors', async () => {
  // Setup
  mockMongo
    .mockResolvedValueOnce([{ _id: 'userId', bitfinex: [] }])
    .mockRejectedValueOnce(new Error('Write conflict'));
  
  // Execute & Assert
  await expect(updateBot('userId', { type: 'fUSD' }, 'testuser'))
    .rejects.toThrow('Write conflict');
});
```

---

### deleteBot

**Signature**: `deleteBot(id, type, userID) => Promise<Array>`

#### Purpose
Removes a specific currency bot configuration from a user's Bitfinex settings.

#### Parameters
- `id` (String): MongoDB user ObjectId
- `type` (String): Currency type to delete (e.g., 'fUSD')
- `userID` (String): User identifier for WebSocket management

#### Logic Flow

1. **Fetch User**
   ```javascript
   const user = await Mongo('find', USERDB, { _id: id });
   if (!user || !user.length) {
     throw new HoError('User does not exist!!!');
   }
   ```

2. **Filter Out Bot**
   ```javascript
   if (user[0].bitfinex) {
     const updatedBitfinex = user[0].bitfinex.filter(bot => bot.type !== type);
     
     await Mongo('update', USERDB, { _id: id }, { 
       $set: { bitfinex: updatedBitfinex } 
     });
   }
   ```

3. **Close WebSocket**
   ```javascript
   if (userWs[userID]) {
     userWs[userID].close();
     userWs[userID] = null;
     userOk[userID] = false;
   }
   ```

4. **Return Updated Config**
   ```javascript
   return returnSupport(updatedBitfinex);
   ```

#### Returns
- **Type**: `Promise<Array>` - Updated bot configuration array

#### Error Handling
- **User Not Found**: `HoError('User does not exist!!!')`
- **No Bitfinex Config**: Returns empty array via `returnSupport()`

---

### query

**Signature**: `query(page, name, sortName, sortType, user, session, uid=-1) => Promise<Object>`

#### Purpose
Queries and returns user's Bitfinex portfolio data including wallets, rates, offers, credits, and interest payments. Supports pagination, filtering, and sorting.

#### Parameters
- `page` (Number): Page number for pagination (0-indexed)
- `name` (String): Filter tag name (e.g., 'usd', 'wallet', 'rate', 'offer', 'credit', 'payment')
- `sortName` (String): Sort field ('name', 'mtime', 'count')
- `sortType` (String): Sort direction ('asc', 'desc')
- `user` (Object): User object with `username` field
- `session` (Object): Express session object (stores filter state in `session['bitfinex']`)
- `uid` (Number): Optional - if provided, returns single item detail

#### Logic Flow

1. **Input Validation**
   ```javascript
   const id = user.username;
   name = isValidString(name, 'name');
   page = isValidString(page, 'zeroint');
   
   if (!session['bitfinex']) {
     session['bitfinex'] = 'all';
   }
   if (name) {
     session['bitfinex'] = name;
   }
   ```

2. **Determine Filter Type**
   ```javascript
   let type = 0;  // Default: all
   let coin = 'all';
   
   switch(session['bitfinex'].toLowerCase()) {
     case 'usd': coin = FUSD_SYM; break;
     case 'btc': coin = FBTC_SYM; break;
     // ... other currencies
     
     case 'wallet': case '錢包': type = 1; break;
     case 'rate': case '利率': type = 2; break;
     case 'offer': case '掛單': type = 3; break;
     case 'credit': case '放款': type = 4; break;
     case 'payment': case '利息收入': type = 5; break;
   }
   ```

3. **Build Item List Based on Type**

   **Type 0/1: Wallet Data**
   ```javascript
   // Funding wallet
   if (available[id] && available[id][coin]) {
     itemList.push({
       name: `閒置 ${coin.substr(1)} $${available[id][coin].avail}`,
       id: (index+1) * 10000,
       tags: [coin.substr(1).toLowerCase(), 'wallet', '錢包'],
       rate: `$${available[id][coin].total}`,
       count: available[id][coin].total,
       utime: available[id][coin].time,
       type: 0
     });
   }
   
   // Exchange wallet
   if (margin[id] && margin[id][coin]) {
     itemList.push({
       name: `交易閒置 ${coin.substr(1)} $${margin[id][coin].avail}`,
       id: (index+1) * 100,
       tags: [coin.substr(1).toLowerCase(), 'wallet', '錢包', '交易'],
       rate: `$${margin[id][coin].total}`,
       count: margin[id][coin].total,
       utime: margin[id][coin].time,
       type: 0
     });
   }
   ```

   **Type 0/2: Rate Data**
   ```javascript
   if (currentRate[coin]) {
     const rate = Math.round(currentRate[coin].rate / 10) / 100000;
     const frr = Math.round(currentRate[coin].frr / 10) / 100000;
     
     itemList.push({
       name: `${coin.substr(1)} Rate ${frr}%`,
       id: index,
       tags: [coin.substr(1).toLowerCase(), 'rate', '利率'],
       rate: `${rate}%`,
       count: rate,
       utime: currentRate[coin].time,
       type: 1
     });
   }
   
   // Spot price data
   for (let pair in priceData) {
     itemList.push({
       name: `${pair.substr(1)} Price $${priceData[pair].lastPrice}`,
       id: uniqueId,
       tags: [pair.substr(1).toLowerCase(), 'rate', '利率', 'price'],
       rate: `${priceData[pair].dailyChange}%`,
       count: priceData[pair].dailyChange,
       utime: priceData[pair].time,
       type: 1
     });
   }
   ```

   **Type 0/3: Active Offers**
   ```javascript
   if (offer[id] && offer[id][coin]) {
     offer[id][coin].forEach(o => {
       const rate = Math.round(o.rate * 10000000) / 100000;
       itemList.push({
         name: `掛單 ${coin.substr(1)} $${o.amount}`,
         id: o.id,
         tags: [coin.substr(1).toLowerCase(), 'offer', '掛單'],
         rate: `${rate}%`,
         count: rate,
         utime: o.time,
         type: 2
       });
     });
   }
   ```

   **Type 0/4: Active Credits**
   ```javascript
   if (credit[id] && credit[id][coin]) {
     credit[id][coin].forEach(c => {
       const rate = Math.round(c.rate * 10000000) / 100000;
       itemList.push({
         name: `放款 ${coin.substr(1)} $${c.amount}`,
         id: c.id,
         tags: [coin.substr(1).toLowerCase(), 'credit', '放款'],
         rate: `${rate}%`,
         count: rate,
         utime: c.time,
         type: 3
       });
     });
   }
   ```

   **Type 0/5: Interest Payments**
   ```javascript
   if (ledger[id] && ledger[id][coin]) {
     ledger[id][coin].forEach(l => {
       const rate = Math.round(l.rate * 10000000) / 100000;
       itemList.push({
         name: `利息收入 ${coin.substr(1)} $${l.amount}`,
         id: l.id,
         tags: [coin.substr(1).toLowerCase(), 'payment', '利息收入'],
         rate: `${rate}%`,
         count: rate,
         utime: l.time,
         type: 4
       });
     });
   }
   ```

4. **Apply Sorting**
   ```javascript
   if (sortName === 'name' && sortType === 'desc') {
     itemList.reverse();
   } else if (sortName === 'mtime' && sortType === 'asc') {
     itemList.sort((a, b) => a.count - b.count);
   } else if (sortName === 'mtime' && sortType === 'desc') {
     itemList.sort((a, b) => b.count - a.count);
   } else if (sortName === 'count' && sortType === 'asc') {
     itemList.sort((a, b) => a.utime - b.utime);
   } else if (sortName === 'count' && sortType === 'desc') {
     itemList.sort((a, b) => b.utime - a.utime);
   }
   ```

5. **Return Result**
   ```javascript
   return {
     itemList,
     parentList: {
       cur: [],
       his: [],
       exactly: [],
       bookmark: ''
     }
   };
   ```

#### Returns
```javascript
{
  itemList: [
    {
      name: String,    // Display name
      id: Number,      // Unique identifier
      tags: [String],  // Search tags
      rate: String,    // Display rate/amount
      count: Number,   // Sort value
      utime: Number,   // Unix timestamp
      type: Number     // 0=wallet, 1=rate, 2=offer, 3=credit, 4=payment
    }
  ],
  parentList: {
    cur: [],
    his: [],
    exactly: [],
    bookmark: ''
  }
}
```

#### Special Behavior
- **Single Item Mode**: If `uid !== -1`, returns only the item with matching ID in `item` array instead of `itemList`
- **Session Persistence**: Filter selection stored in `session['bitfinex']` for user
- **Localization**: Supports Chinese tags ('錢包', '利率', '掛單', '放款', '利息收入')

#### Error Handling
- **Invalid Tag Name**: `HoError('tag name is not valid')`
- **Invalid Page**: `HoError('page is not valid')`

---

### parent

**Signature**: `parent() => String`

#### Purpose
Returns the parent path constant for Bitfinex routing.

#### Returns
- **Type**: `String` - Value of `BITNIFEX_PARENT` constant (likely `/bitfinex` or similar)

---

### closeCredit

**Signature**: `closeCredit(id, cId) => Promise<void>`

#### Purpose
Queues a credit ID for closure. Used to manually close active funding credits.

#### Parameters
- `id` (String): User identifier
- `cId` (Number): Credit ID to close

#### Logic Flow
```javascript
if (!closeCredit[id]) {
  closeCredit[id] = [cId];
} else {
  closeCredit[id].push(cId);
}
log.debug({ closeCredit }, 'close credit updated');  // was: console.log(closeCredit)
return Promise.resolve();
```

#### Returns
- **Type**: `Promise<void>` - Resolves immediately

#### Side Effects
- Adds `cId` to `closeCredit[id]` array
- Background job will process the queue and close credits via Bitfinex API

---


## Testing Strategy

- **Current count (2026-05-26)**: 3992 tests across 41 suites; `bitfinex-tool` accounts for 373 tests.

### Test Environment Setup

#### Prerequisites
```javascript
// Mock dependencies
jest.mock('bitfinex-api-node');
jest.mock('../models/mongo-tool');
jest.mock('../models/redis-tool');
jest.mock('../models/api-tool');
jest.mock('../util/sendWs');
jest.mock('../models/stock-tool', () => ({
  calStair: jest.fn(),
  stockProcess: jest.fn(),
  stockTest: jest.fn(),
  logArray: jest.fn(),
  resolveNewMidStack: jest.fn((stack, price, mid, webArr, onPop) => {
    // Real unwinding logic replicated for test fidelity
    while (stack.length > 0) { /* ... condition check, pop, onPop ... */ }
    return stack.length > 0 ? webArr.map(v => v * stack[stack.length - 1] / mid) : webArr;
  }),
  scaleWebArr: jest.fn((stack, mid, webArr) =>
    stack.length > 0 ? webArr.map(v => v * stack[stack.length - 1] / mid) : webArr
  ),
}));

// Test constants
const TEST_CONSTANTS = {
  BITFINEX_KEY: 'test_api_key',
  BITFINEX_SECRET: 'test_api_secret',
  SUPPORT_COIN: ['fUSD', 'fBTC', 'fETH', 'fLTC'],
  SUPPORT_PRICE: ['tBTCUSD', 'tETHUSD', 'tLTCUSD'],
  SUPPORT_PAIR: { 'fUSD': 'tBTCUSD' },
  BITFINEX_EXP: 1000000000,
  BITFINEX_MIN: 10000
};
```

#### Test Database Setup
```javascript
beforeAll(async () => {
  // Initialize test MongoDB
  await MongoClient.connect(MONGO_TEST_URL);
  
  // Initialize test Redis
  await RedisClient.connect(REDIS_TEST_URL);
  
  // Seed test data
  await seedTestUsers();
});

afterAll(async () => {
  // Cleanup
  await MongoClient.close();
  await RedisClient.quit();
});

beforeEach(() => {
  // Clear all mocks
  jest.clearAllMocks();
  
  // Reset global state
  resetBFX(true);
});
```

### Test Coverage Matrix

| Function | Unit Tests | Integration Tests | E2E Tests | Coverage Target |
|----------|------------|-------------------|-----------|-----------------|
| calRate | ✓ 25 tests | ✓ 5 tests | ✓ 2 tests | 95% |
| calWeb | ✓ 15 tests | ✓ 3 tests | ✓ 1 test | 90% |
| setWsOffer | ✓ 30 tests | ✓ 10 tests | ✓ 5 tests | 95% |
| resetBFX | ✓ 12 tests | ✓ 4 tests | ✓ 2 tests | 100% |
| getBot | ✓ 5 tests | ✓ 2 tests | ✓ 1 test | 100% |
| updateBot | ✓ 35 tests | ✓ 8 tests | ✓ 3 tests | 95% |
| deleteBot | ✓ 8 tests | ✓ 3 tests | ✓ 1 test | 100% |
| query | ✓ 40 tests | ✓ 12 tests | ✓ 4 tests | 90% |
| parent | ✓ 1 test | - | - | 100% |
| closeCredit | ✓ 5 tests | ✓ 2 tests | ✓ 1 test | 100% |

### Unit Test Structure

```javascript
describe('bitfinex-tool', () => {
  describe('calRate', () => {
    describe('Normal Operation', () => {
      test('should fetch and calculate rates for all currencies');
      test('should store rates in Redis with correct TTL');
      test('should insert historical data in MongoDB');
      test('should update currentRate global state');
      test('should update priceData for spot pairs');
    });
    
    describe('Edge Cases', () => {
      test('should handle empty candle arrays');
      test('should handle partial candle data');
      test('should handle extreme rate values');
      test('should handle concurrent execution');
    });
    
    describe('Error Handling', () => {
      test('should propagate REST API errors');
      test('should continue on Redis cache miss');
      test('should throw on MongoDB write failure');
      test('should skip currency with invalid ticker data');
    });
    
    describe('Performance', () => {
      test('should complete within 30 seconds');
      test('should not leak memory on repeated calls');
    });
  });
  
  // Similar structure for other functions...
});
```

### Integration Test Examples

#### Test: End-to-End Bot Lifecycle
```javascript
describe('Integration: Bot Lifecycle', () => {
  it('should create, update, activate, and delete a bot', async () => {
    // 1. Create user
    const userId = await createTestUser('testuser', 'test@example.com');
    
    // 2. Add bot configuration
    const botConfig = {
      type: 'fUSD',
      key: process.env.TEST_BITFINEX_KEY,
      secret: process.env.TEST_BITFINEX_SECRET,
      amountLimit: 10000,
      riskLimit: 5,
      active: false
    };
    await updateBot(userId, botConfig, 'testuser');
    
    // 3. Verify bot created
    let bots = await getBot(userId);
    expect(bots).toHaveLength(1);
    expect(bots[0].type).toBe('fUSD');
    expect(bots[0].isActive).toBe(false);
    
    // 4. Activate bot and establish WebSocket
    await updateBot(userId, { type: 'fUSD', active: true }, 'testuser');
    await setWsOffer(userId, [], 'testuser');
    
    // Wait for WebSocket to connect
    await waitFor(() => userOk['testuser'] === true, { timeout: 10000 });
    
    // 5. Verify WebSocket established
    expect(userWs['testuser']).toBeDefined();
    expect(userOk['testuser']).toBe(true);
    
    // 6. Wait for data to populate
    await waitFor(() => available['testuser'] !== undefined, { timeout: 5000 });
    
    // 7. Query portfolio
    const portfolio = await query(0, 'all', 'name', 'asc', 
      { username: 'testuser' }, 
      { bitfinex: 'all' }
    );
    
    expect(portfolio.itemList.length).toBeGreaterThan(0);
    
    // 8. Delete bot
    await deleteBot(userId, 'fUSD', 'testuser');
    
    // 9. Verify deleted
    bots = await getBot(userId);
    expect(bots.find(b => b.type === 'fUSD')).toBeUndefined();
    
    // 10. Verify WebSocket closed
    expect(userWs['testuser']).toBeNull();
    expect(userOk['testuser']).toBe(false);
  });
});
```

#### Test: Rate Calculation and Offer Placement
```javascript
describe('Integration: Rate Calculation and Offer Placement', () => {
  it('should calculate rates and place offers based on strategy', async () => {
    // 1. Run rate calculation
    await calRate([]);
    
    // 2. Verify rates calculated
    expect(currentRate['fUSD']).toBeDefined();
    expect(currentRate['fUSD'].rate).toBeGreaterThan(0);
    expect(finalRate['fUSD']).toBeDefined();
    
    // 3. Create test user with bot
    const userId = await createTestUser('offertest', 'offer@example.com');
    await updateBot(userId, {
      type: 'fUSD',
      key: process.env.TEST_BITFINEX_KEY,
      secret: process.env.TEST_BITFINEX_SECRET,
      amountLimit: 5000,
      riskLimit: 3,
      miniRate: 50,
      dynamic: 100,
      active: true
    }, 'offertest');
    
    // 4. Establish WebSocket
    await setWsOffer(userId, ['fUSD'], 'offertest');
    await waitFor(() => userOk['offertest'] === true, { timeout: 10000 });
    
    // 5. Wait for wallet data
    await waitFor(() => 
      available['offertest'] && available['offertest']['fUSD'],
      { timeout: 5000 }
    );
    
    // 6. Background job should place offers
    // (Simulate background job execution)
    await placeOffersForUser('offertest');
    
    // 7. Wait for offers to appear
    await waitFor(() => 
      offer['offertest'] && offer['offertest']['fUSD'].length > 0,
      { timeout: 10000 }
    );
    
    // 8. Verify offers placed
    const offers = offer['offertest']['fUSD'];
    expect(offers.length).toBeGreaterThan(0);
    
    // 9. Verify offer rates are within expected range
    offers.forEach(o => {
      expect(o.rate).toBeGreaterThan(finalRate['fUSD'] * 0.8);
      expect(o.rate).toBeLessThan(finalRate['fUSD'] * 1.5);
    });
  });
});
```

### Performance Benchmarks

```javascript
describe('Performance Benchmarks', () => {
  test('calRate should handle 10+ currencies in < 30s', async () => {
    const start = Date.now();
    await calRate([]);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(30000);
    console.log(`calRate completed in ${duration}ms`);
  });
  
  test('setWsOffer should establish connection in < 5s', async () => {
    const userId = await createTestUser('perftest', 'perf@example.com');
    await updateBot(userId, validBotConfig, 'perftest');
    
    const start = Date.now();
    await setWsOffer(userId, [], 'perftest');
    await waitFor(() => userOk['perftest'] === true, { timeout: 5000 });
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(5000);
    console.log(`WebSocket connected in ${duration}ms`);
  });
  
  test('query should return results in < 500ms', async () => {
    const start = Date.now();
    const result = await query(0, 'all', 'name', 'asc', testUser, testSession);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(500);
    console.log(`Query completed in ${duration}ms with ${result.itemList.length} items`);
  });
  
  test('should handle 50 concurrent users', async () => {
    const userPromises = [];
    
    for (let i = 0; i < 50; i++) {
      const userId = `user${i}`;
      userPromises.push(
        createTestUser(userId, `${userId}@example.com`)
          .then(id => updateBot(id, validBotConfig, userId))
          .then(() => setWsOffer(`user${i}_id`, [], userId))
      );
    }
    
    const start = Date.now();
    await Promise.all(userPromises);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(60000); // All connections within 1 minute
    expect(Object.keys(userWs).length).toBe(50);
  });
});
```

### Security Testing

```javascript
describe('Security Tests', () => {
  describe('Input Validation', () => {
    test('should sanitize API keys to prevent injection', async () => {
      const maliciousKey = '<script>alert("xss")</script>';
      
      await expect(updateBot('userId', { 
        type: 'fUSD', 
        key: maliciousKey 
      }, 'testuser')).rejects.toThrow();
    });
    
    test('should prevent SQL injection in query parameters', async () => {
      const maliciousName = "'; DROP TABLE users; --";
      
      await expect(query(0, maliciousName, 'name', 'asc', testUser, testSession))
        .rejects.toThrow('tag name is not valid');
    });
    
    test('should prevent path traversal in pair strings', async () => {
      const maliciousPair = '../../../etc/passwd';
      
      await expect(updateBot('userId', { 
        type: 'fUSD', 
        pair: maliciousPair 
      }, 'testuser')).rejects.toThrow();
    });
  });
  
  describe('Authentication', () => {
    test('should use user-specific API keys', async () => {
      // Create two users with different keys
      const user1 = await createTestUser('user1', 'user1@example.com');
      const user2 = await createTestUser('user2', 'user2@example.com');
      
      await updateBot(user1, { type: 'fUSD', key: 'key1', secret: 'secret1' }, 'user1');
      await updateBot(user2, { type: 'fUSD', key: 'key2', secret: 'secret2' }, 'user2');
      
      await setWsOffer(user1, [], 'user1');
      await setWsOffer(user2, [], 'user2');
      
      // Verify different BFX instances created
      expect(BFX).toHaveBeenCalledWith({ apiKey: 'key1', apiSecret: 'secret1' });
      expect(BFX).toHaveBeenCalledWith({ apiKey: 'key2', apiSecret: 'secret2' });
    });
    
    test('should not expose API secrets in return values', async () => {
      await updateBot('userId', { 
        type: 'fUSD', 
        key: 'public_key', 
        secret: 'super_secret' 
      }, 'testuser');
      
      const bots = await getBot('userId');
      
      // API secrets should be present (needed for WebSocket)
      // But should not be logged or sent to client
      expect(bots[0].secret).toBeDefined();
      // Add logging check to ensure secrets not logged
    });
  });
  
  describe('Rate Limiting', () => {
    test('should respect Bitfinex API rate limits', async () => {
      // Mock rate limit error
      mockRESTClient.ticker.mockRejectedValue({
        message: 'ERR_RATE_LIMIT',
        code: 11010
      });
      
      await expect(calRate([])).rejects.toMatchObject({
        code: 11010
      });
      
      // Should implement exponential backoff (verify in implementation)
    });
  });
});
```

### Snapshot Testing for Data Structures

```javascript
describe('Snapshot Tests', () => {
  test('getBot return format', async () => {
    const result = await getBot(TEST_USER_ID);
    expect(result).toMatchSnapshot();
  });
  
  test('query itemList format', async () => {
    const result = await query(0, 'all', 'name', 'asc', testUser, testSession);
    expect(result.itemList[0]).toMatchSnapshot({
      id: expect.any(Number),
      utime: expect.any(Number)
    });
  });
  
  test('currentRate structure after calRate', async () => {
    await calRate([]);
    expect(currentRate['fUSD']).toMatchSnapshot({
      time: expect.any(Number)
    });
  });
  
  test('WebSocket wallet snapshot structure', async () => {
    await setWsOffer(TEST_USER_ID, [], 'testuser');
    await waitFor(() => available['testuser'] !== undefined);
    
    expect(available['testuser']).toMatchSnapshot({
      fUSD: {
        time: expect.any(Number)
      }
    });
  });
});
```

---

## Integration Testing

### External Service Mocks

#### Bitfinex REST API Mock
```javascript
class MockBitfinexREST {
  constructor() {
    this.ticker = jest.fn();
    this.orderBook = jest.fn();
    this.candles = jest.fn();
  }
  
  mockSuccessfulResponses() {
    this.ticker.mockResolvedValue({
      lastPrice: 0.000082,
      dailyChangePerc: 0.0156,
      frr: 0.000078,
      volume: 1234567.89
    });
    
    this.orderBook.mockResolvedValue(
      Array(100).fill(null).map((_, i) => [
        0.000082 - i * 0.000001,
        2,
        150000 - i * 1000
      ])
    );
    
    this.candles.mockResolvedValue(
      Array(1440).fill(null).map((_, i) => ({
        mts: Date.now() - i * 60000,
        open: 0.000082,
        high: 0.000083,
        low: 0.000081,
        close: 0.000082,
        volume: 10000
      }))
    );
  }
}
```

#### Bitfinex WebSocket Mock
```javascript
class MockBitfinexWS extends EventEmitter {
  constructor() {
    super();
    this.subscribers = [];
  }
  
  open() {
    setTimeout(() => this.emit('open'), 100);
  }
  
  auth() {
    setTimeout(() => this.emit('auth'), 200);
  }
  
  close() {
    this.emit('close');
  }
  
  subscribeFundingOffers(currency) {
    this.subscribers.push({ type: 'offers', currency });
  }
  
  subscribeFundingCredits(currency) {
    this.subscribers.push({ type: 'credits', currency });
  }
  
  onWalletSnapshot(opts, callback) {
    setTimeout(() => {
      callback([
        { type: 'funding', currency: 'USD', balance: 15000, balanceAvailable: 5000 }
      ]);
    }, 300);
  }
  
  onFundingOfferSnapshot(opts, callback) {
    setTimeout(() => {
      callback([
        { id: 123456, amount: 5000, rate: 0.000082, period: 2, status: 'ACTIVE' }
      ]);
    }, 400);
  }
  
  // ... other handlers
}
```

### MongoDB Test Fixtures

```javascript
const TEST_USERS = [
  {
    _id: 'user001',
    username: 'testuser1',
    email: 'test1@example.com',
    bitfinex: [
      {
        type: 'fUSD',
        key: 'test_key_1',
        secret: 'test_secret_1',
        isActive: true,
        amountLimit: 10000,
        riskLimit: 5,
        waitTime: 300,
        miniRate: 50,
        dynamic: 100,
        keepAmount: 1000
      }
    ]
  },
  {
    _id: 'user002',
    username: 'testuser2',
    email: 'test2@example.com',
    bitfinex: [
      {
        type: 'fBTC',
        key: 'test_key_2',
        secret: 'test_secret_2',
        isActive: false
      }
    ]
  }
];

async function seedTestData() {
  await MongoClient.db('testdb').collection(USERDB).insertMany(TEST_USERS);
}
```

---

## Security & Authentication

### API Key Management

1. **Storage**: User API keys stored encrypted in MongoDB `userdb` collection
2. **Transmission**: Keys never sent to client-side JavaScript
3. **Usage**: Each user's WebSocket uses their own API credentials
4. **Validation**: Keys validated via `isValidString(key, 'name')` helper

### Permission Levels

| Operation | System API Keys | User API Keys | Admin Required |
|-----------|----------------|---------------|----------------|
| calRate | ✓ (read-only) | - | No |
| calWeb | ✓ (read-only) | - | No |
| setWsOffer | - | ✓ (read, write, withdraw) | No |
| updateBot | - | User's own | No |
| query | - | User's own | No |
| resetBFX | ✓ | - | Yes |

### Rate Limiting

- **Bitfinex API**: 60 req/min (authenticated), 90 req/min (public)
- **Internal**: No explicit rate limiting (relies on interval timers)
- **Recommendation**: Implement user-level rate limiting on updateBot/deleteBot

### Input Sanitization

All user inputs sanitized via `isValidString()`:
- `'name'`: Alphanumeric + underscore + hyphen, max 500 chars
- `'int'`: Integer validation, returns false if invalid
- `'zeroint'`: Integer including zero, returns false if invalid

### Potential Security Issues

1. **XSS Risk**: API keys not HTML-escaped in UI (should use `DOMPurify` or similar)
2. **CSRF**: No CSRF tokens on state-changing operations (relies on session cookies)
3. **Injection**: Pair string validation weak (regex allows some special chars)
4. **Memory Leaks**: Global state never cleaned for disconnected users → DoS risk
5. **WebSocket Hijacking**: No additional auth on WS after initial HTTP session

---

## Appendix: Constants Reference

```javascript
// From constants.js
export const BITFINEX_EXP = 1000000000;  // Rate multiplier
export const BITFINEX_MIN = 10000;       // Minimum rate increment
export const MINIMAL_OFFER = 50;         // Minimum offer amount
export const OFFER_MAX = 5000000;        // Maximum single offer
export const RISK_MAX = 10;              // Maximum risk level
export const MAX_RATE = 500000;          // Maximum rate (0.05% daily)
export const MERGE_RATE_TOLERANCE = 2;   // Tolerance multiplier for merge-offer rate matching

export const BITFINEX_INTERVAL = 600000; // 10 minutes
export const RATE_INTERVAL = 1800000;    // 30 minutes
export const ORDER_INTERVAL = 60000;     // 1 minute
export const API_WAIT = 2000;            // 2 seconds

export const SUPPORT_COIN = [
  'fUSD', 'fUSDT', 'fBTC', 'fETH', 'fLTC',
  'fDOT', 'fSOL', 'fADA', 'fXRP', 'fAVAX',
  'fTRX', 'fUNI'
];

export const SUPPORT_PRICE = [
  'tBTCUSD', 'tETHUSD', 'tLTCUSD', 'tXRPUSD',
  'tDOTUSD', 'tSOLUSD', 'tADAUSD', 'tAVAXUSD',
  'tTRXUSD', 'tUNIUSD'
];

export const SUPPORT_PAIR = {
  'fUSD': 'tBTCUSD',
  'fBTC': 'tBTCUSD',
  'fETH': 'tETHUSD'
  // ... more pairs
};
```

---

## Test Execution Commands

```bash
# Run all tests
npm test -- bitfinex-tool.test.js

# Run specific test suite
npm test -- bitfinex-tool.test.js -t "calRate"

# Run with coverage
npm test -- bitfinex-tool.test.js --coverage

# Run integration tests only
npm test -- bitfinex-tool.integration.test.js

# Run performance benchmarks
npm run test:perf -- bitfinex-tool

# Watch mode for development
npm test -- bitfinex-tool.test.js --watch
```

---

## Documentation Maintenance

**Last Updated**: 2026-05-26  
**Reviewed By**: Senior QA/Test Automation Engineer  
**Next Review**: 2026-08-19 (Quarterly)

**Change Log**:
- 2026-03-17: Initial comprehensive documentation created
- 2026-05-19: Updated imports to include `resolveNewMidStack`, `scaleWebArr` from stock-tool.js. `startStatus` newMid pop/push logic now uses shared helper functions instead of inline duplication.
- 2026-05-26: Documented conviction-weighted `newOrder` sorting, Kelly-based `startStatus()` count boost, volatility-normalized `mul` calculation, `mcList.extrem`, shared-row `metrics`, and the new-item `mul = 1 + volValue` initialization path.
- 2026-05-27: Emergency stop (§6d) now excludes clearing (`current.clear`) and deleting (`ing = 2`) items from the shifted count and from being forced to fake order.
- 2026-05-28: Added Logging subsection to Architecture & Dependencies; updated console.log references in code examples to reflect actual pino logger usage.
- Future updates should include:
  - New test scenarios as edge cases discovered
  - Updated snapshot data when data structures change
  - Performance benchmark updates after optimization
  - Security findings and mitigations

---

**END OF DOCUMENTATION**

