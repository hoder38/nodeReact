# Backtest Redesign — `stockTest` Function

**Date**: 2025-07-22  
**File**: `src/back/models/stock-tool.js` (lines ~3776–4154)

---

## 1. Overview

The `stockTest` backtest function has been redesigned from a single-price-per-candle simulation returning a formatted string to an OHLC two-pass simulation returning a structured metrics object.

### Before (Old Design)

- Used only one price per candle (`.h` for the scan loop)
- Returned a formatted string: `"startMid% maxAmount returnPct% buyHoldPct% sellTrade stopLoss maxLost% maxGain%"`
- Consumers parsed the string with regex `.match(/([-\d.]+)/g)` to extract values
- No equity curve, no risk-adjusted metrics, no round-trip trade matching

### After (New Design)

- OHLC two-pass: each candle visits both high and low, closer extreme first
- FIFO round-trip trade matching for win/loss statistics
- Full equity curve tracking for drawdown and risk metrics
- Returns `{ start, metrics }` where `metrics` is a structured object
- Supports full-run mode (`len <= 0`): simulates all data in one pass
- Consumers access `m.returnPct`, `m.sellTrade`, etc. directly

---

## 2. Function Signature (Unchanged)

```js
stockTest(his_arr, loga, min, pType = 0, start = 0, reverse = false,
          len = 200, rinterval = RANGE_INTERVAL, fee = TRADE_FEE,
          ttime = TRADE_TIME, tinterval = TRADE_INTERVAL, resetWeb = 5, sType = 0)
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `his_arr` | `[{h, l, v}]` | Historical OHLCV data (newest first) |
| `loga` | `{arr, diff}` | Logarithmic price array from `logArray()` |
| `min` | `number` | Minimum value for `calStair` percentile lookup |
| `pType` | `number` | Position type (0–5), affects buy/sell branching in `stockProcess` |
| `start` | `number` | Starting index offset into `his_arr` |
| `reverse` | `boolean` | If true, scans forward to find entry point (for reverse backtests) |
| `len` | `number` | Simulation length (trading days). **`len <= 0` = full-run mode**: uses all data |
| `rinterval` | `number` | Range interval for trade cooldown (seconds) |
| `fee` | `number` | Trading fee rate |
| `ttime` | `number` | Trade time window (seconds) |
| `tinterval` | `number` | Trade interval (seconds per candle) |
| `resetWeb` | `number` | How often to recalculate the web (every N candles) |
| `sType` | `number` | Stock type: 0=TWSE, 1=Bitfinex, 2=other |

---

## 3. Architecture

### Phase 1: Find Start Position

Scans `his_arr` (backward for `reverse=false`, forward for `reverse=true`) until price drops below `web.mid`. This establishes the entry point where the backtest begins.

- Recalculates `web` via `calStair()` every `resetWeb` candles
- Sets `maxAmount` = initial portfolio value = `web.mid × (arr.length-1) / 3 × 2`

**Full-run mode** (`len <= 0`):
- `startI = Math.min(start, his_arr.length - 2)` — no len-based cap
- `scanLimit = 0` — Phase 1 scans all the way to index 0
- `calStairLen = false` — calStair uses all available data
- `tlength = 1` — simulation runs from startI down to index 2

If no valid start position is found (`startI <= scanLimit`), returns early with all-zero metrics.

### Phase 2: Main Simulation Loop (OHLC Two-Pass)

For each candle `i` from `startI` down to `tlength`:

#### a. Web Recalculation
Every `resetWeb` candles, recalculates `calStair()` → `adjustWeb()` to adapt the trading grid to current volatility.

#### b. OHLC Two-Pass Price Visit
```
distH = |prevClose - high|
distL = |prevClose - low|
Visit closer extreme first, then the other
```

This catches intra-candle signals the old single-price model missed. For example, if price first rises to trigger a sell, then falls to trigger a buy within the same candle, both signals fire.

#### c. For Each Price Pass
1. **Resolve newMid stack** — `resolveNewMidStack()` unwinds breakout entries when price crosses back past the mid
2. **Run signal** — `runSignal()` calls `stockProcess()` to get buy/sell signals. If `resetWeb` is triggered (price breakout), pushes to `newMid` stack and re-signals with `scaleWebArr()`
3. **Try execute** — `tryExecute()` checks if candle range reaches signal prices and calls `executeBuy()`/`executeSell()`

#### d. Equity Tracking
After each candle:
```
equity = cash + (position × low × (1 - fee))
```
Tracks peak equity, current drawdown, and max drawdown duration.

### Phase 3: Liquidate Remaining Position

Force-sells any remaining shares at the last candle's low, recording round-trip matches via `recordSell()`.

### Phase 4: Compute Metrics

Calculates all risk-adjusted and trade statistics from the equity curve and trade logs.

---

## 4. Round-Trip Trade Matching (FIFO)

Two arrays track open and completed trades:

- `buyLog[]` — `{ price, count, idx }` — accumulated buy fills
- `sellLog[]` — `{ price, count, idx, profit }` — completed sell fills with P&L

When a sell executes:

```js
recordSell(sellPrice, soldCount, idx)
```

Matches the sold quantity against the **oldest** buy entry (FIFO):
1. Takes `matched = min(remaining, oldest.count)` shares
2. Computes `profit = (sellPrice × (1-fee) - buyPrice) × matched`
3. Classifies as win (profit ≥ 0) or loss (profit < 0)
4. Accumulates `grossProfit`, `grossLoss`, `totalWin`, `totalLoss`, `winCount`, `lossCount`
5. Removes fully matched buy entries from `buyLog`

---

## 5. Return Value

### Success
```js
{
    start: <number>,           // index where simulation began (0 in full-run mode)
    metrics: { ... }           // structured metrics object
}
```

### Insufficient Data (Early Return)
```js
{
    start: 0,
    metrics: { /* all zeros, tradesPerYear: 0 */ }
}
```

### Data Error
```js
"data miss"
```

---

## 6. Metrics Object

| Field | Type | Description |
|-------|------|-------------|
| `maxAmount` | `number` | Initial portfolio value (ceiling) |
| `returnPct` | `number` | Total return (%, e.g., 12.5 = 12.5%) |
| `returnAnnualPct` | `number` | Annualized return (CAGR, %) |
| `buyHoldPct` | `number` | Buy-and-hold return over same period (%) |
| `sharpe` | `number` | Sharpe ratio (annualized, risk-free = 0) |
| `sortino` | `number` | Sortino ratio (annualized, downside deviation only) |
| `calmar` | `number` | Calmar ratio (annualized return / max drawdown) |
| `maxDrawdownPct` | `number` | Maximum drawdown (%, positive value, e.g., 15.5 = 15.5%) |
| `maxDrawdownDuration` | `number` | Longest drawdown duration (candles) |
| `winRate` | `number` | Percentage of winning round-trips (%) |
| `avgWin` | `number` | Average winning trade profit |
| `avgLoss` | `number` | Average losing trade loss (absolute value) |
| `profitFactor` | `number` | Gross profit / gross loss (∞ if no losses) |
| `buyTrade` | `number` | Total buy trade count |
| `sellTrade` | `number` | Total sell trade count |
| `stopLoss` | `number` | Number of stop-loss events (price breakouts) |
| `tradeDays` | `number` | Simulation length in candles |
| `tradesPerYear` | `number` | Annualized trade count (sellTrade / years) |

### Metric Formulas

**Sharpe Ratio**:
```
dailyReturns[k] = equity[k] / equity[k-1] - 1
mean = avg(dailyReturns)
stdDev = sqrt(variance(dailyReturns))
sharpe = (mean / stdDev) × sqrt(250)
```

**Sortino Ratio**:
```
downVariance = avg(min(dailyReturn, 0)²)
downDev = sqrt(downVariance)
sortino = (mean / downDev) × sqrt(250)
```

**Calmar Ratio**:
```
calmar = returnAnnualPct / maxDrawdownPct
```

**Profit Factor**:
```
profitFactor = grossProfit / grossLoss
```

---

## 7. Consumer Migration

### Old Pattern (Year-by-Year Chaining with String Parsing)
```js
// Old: loopTest chains 200-candle segments, parses str with regex
const tempM = v.str.match(/([-\d.]+)/g);
rate = rate * (+tempM[3] + 100) / 100;
```

### New Pattern (Single Full-Run with Direct Metrics)
```js
// New: one stockTest call with len=0 (full-run mode)
const temp = await stockTest(raw_arr, loga, min, type, raw_arr.length - 1, false, 0, ...);
const m = temp.metrics;
const str = `${pricePct}% ${m.maxAmount} ${m.returnPct}% ${m.buyHoldPct}% ${m.sharpe} ${m.sortino} ${m.maxDrawdownPct}% ${m.maxDrawdownDuration} ${m.winRate}% ${winLoss} ${m.profitFactor} ${m.tradesPerYear} ${m.calmar} ${dataLength} ${minVol}`;
```

### Consumer Str Format (15 Fields)
```
pricePct% maxAmount returnPct% buyHoldPct% sharpe sortino maxDrawdownPct% maxDrawdownDuration winRate% winLossRatio profitFactor tradesPerYear calmar dataLength minVol
```

### Consumer Return Value
```js
// Old: [interval_data, bestStr, lastest_type]
// New: [interval_data, bestStr, lastest_type, bestMetrics]
```

### Database Storage
- **STOCKDB**: `web.metrics = bestMetrics` stored alongside `web.arr`, `web.mid`, `web.wType`
- **TOTALDB** (bitfinex): `metrics: bestMetrics` in both insert and update calls

---

## 8. Differences from Old Backtest

| Aspect | Old | New |
|--------|-----|-----|
| Price per candle | Single (`.h` only) | Two-pass (closer extreme first) |
| Return format | Formatted string | `{ start, metrics }` |
| `str` property | 8 space-separated fields | Removed from return |
| `startMid` | In str and metrics | Removed |
| Testing mode | Year-by-year 200-candle segments | Single full-data run (`len=0`) |
| Risk metrics | maxLost/maxGain only | Sharpe, Sortino, Calmar, max drawdown |
| Trade statistics | sellTrade, stopLoss count | + winRate, avgWin/Loss, profitFactor, tradesPerYear |
| Trade matching | None | FIFO round-trip matching |
| Equity tracking | None | Full equity curve |
| Consumer parsing | Regex `match(/([-\d.]+)/g)` | Direct property access from metrics |
| DB storage | No metrics stored | `web.metrics` in STOCKDB, `metrics` in TOTALDB |

---

## 9. Test Coverage

### Existing Tests Updated
- `returns object with start and metrics when valid data` — validates metrics properties exist, no str
- `insufficient data returns early result with metrics zeros` — validates all-zero metrics + tradesPerYear
- `reverse=true uses reverse scan path` — validates `toHaveProperty('metrics')`, no str
- `no str in return, metrics has no startMid` — validates absence of removed fields

### New Metrics Tests Added
- `metrics.tradeDays matches simulation length` — tradeDays > 0 and ≤ len
- `metrics.maxDrawdownPct is non-negative` — ≥ 0
- `metrics.buyTrade + sellTrade are non-negative integers` — integer check
- `metrics.winRate is between 0 and 100` — range check
- `metrics.maxAmount matches initial portfolio size` — > 0
- `metrics.tradesPerYear exists` — validates annualized trade count

### Comprehensive Tests (Unchanged, Still Pass)
- `large dataset with various price swings triggers buy+sell trades`
- `reverse=true with proper data`
- `type 7/3/6 buy trade` and `type 9/5/8 sell trade` tests
- `data with null h in main loop → returns "data miss"`
- All 449 stock-tool tests pass ✅
- All 364 bitfinex-tool tests pass ✅

---

## 10. Changelog

| Date | Change |
|------|--------|
| 2025-07-22 | Complete redesign: OHLC two-pass, FIFO round-trip tracking, equity curve, structured metrics return, consumer migration from regex to direct access |
| 2025-07-23 | Removed `str` from return, removed `startMid` from metrics, added `tradesPerYear`, full-run mode (`len<=0`), single-run consumers (no year-by-year), metrics stored in STOCKDB/TOTALDB, consumer str format: 15 fields with 9 key metrics |
