# Stock Mechanism — Improvement Proposals

> **Scope**: Full trading mechanism in `stock-tool.js` and `bitfinex-tool.js`  
> **Date**: 2026-05-19  
> **Status**: Proposal — no code changes

---

## Table of Contents

1. [Current Architecture Summary](#1-current-architecture-summary)
2. [Grid Construction — calStair / calWeb](#2-grid-construction--calstair--calweb)
3. [Signal Generation — stockProcess](#3-signal-generation--stockprocess)
4. [Price Breakout — newMid Stack](#4-price-breakout--newmid-stack)
5. [Backtesting — stockTest](#5-backtesting--stocktest)
6. [Live Execution — stockStatus / startStatus](#6-live-execution--stockstatus--startstatus)
7. [Data Pipeline — getIntervalV2](#7-data-pipeline--getintervalv2)
8. [Web Array Representation](#8-web-array-representation)
9. [Position Sizing & Risk Management](#9-position-sizing--risk-management)
10. [Priority Matrix](#10-priority-matrix)

---

## 1. Current Architecture Summary

The system is a **grid trading strategy** built on normal-distribution-based price bands:

```
getIntervalV2  →  60 months historical data
       ↓
   calStair    →  volume-weighted percentile grid (7 σ-boundaries, 6 layers)
       ↓
 stockProcess  →  walk price through grid → buy/sell signals
       ↓
  newMid stack  →  shift grid when price breaks out
       ↓
 stockStatus   →  live execution loop (TWSE/USSE)
 startStatus   →  live execution loop (Bitfinex)
  stockTest    →  historical backtest
```

The grid divides price space into 6 layers (±1σ, ±2σ, ±3σ) around a volume-weighted median. Steps within each layer are spaced by the stock's typical daily swing (`extrem`). Trading signals fire when price crosses step boundaries.

---

## 2. Grid Construction — calStair / calWeb

### Current Behaviour

- Bins 100-position log-scaled histogram weighted by candle volume
- Samples 7 percentiles via `NORMAL_DISTRIBUTION = [1, 2, 16, 50, 84, 98, 99]`
- `calWeb` builds step arrays for each σ-layer proportional to its actual nd[] width
- `extrem` is picked from a sorted daily-range array at the 84th percentile, fallback 98th
- `buildSteps(range)` fills each layer with evenly-spaced price levels

### Proposed Improvements

#### 2a. Adaptive Bin Count

The fixed 100-bin histogram can be too coarse for low-volatility stocks (many empty bins) and too fine for wide-range penny stocks. An adaptive approach:

- Use **Freedman–Diaconis rule**: `binWidth = 2 × IQR × n^(-1/3)` to determine optimal bin count
- Clamp to [50, 200] to keep computational cost bounded
- This would make nd[] boundaries more accurate for stocks with skewed volume distributions

#### 2b. Volume-Time Decay Weighting

Currently all 60 months of volume have equal weight. Recent volume distributions should matter more:

- Apply exponential decay: `weight = baseWeight × e^(-λ × monthsAgo)` with λ ≈ 0.02 (half-life ≈ 35 months)
- This would make the grid adapt faster to regime changes (e.g., a stock that used to be low-vol but is now high-vol)
- Only affects the histogram binning, not the raw price range

#### 2c. Skewness-Aware Layer Widths

The current grid is symmetric around the median — same number of σ-layers above and below. Many stocks exhibit persistent skew (e.g., biotech = right-skewed, utilities = left-skewed):

- Compute skewness from the volume-weighted distribution
- If skew > +0.5: allocate more steps on the upside (e.g., 4 up-layers, 2 down-layers)
- If skew < −0.5: allocate more steps on the downside
- This would reduce unnecessary newMid events on the side that naturally has more range

#### 2d. Extrem Fallback Chain

Current: try 84th percentile → try 98th → return false. The jump from 1σ to 2σ is large. Add intermediate steps:

- Try 84th → 90th → 95th → 98th → false
- This gives more granular step sizes for very-low-volatility stocks before giving up entirely

---

## 3. Signal Generation — stockProcess

### Current Behaviour

- Walks `priceArray` from both ends to find current position (bP/sP)
- Generates buy types 3/6/7 and sell types 5/8/9 based on distance from mid
- `finalBuy` / `finalSell` clamp position size using 1/4-based fraction rules
- `priceTimes` multiplier scales step size for higher-priced stocks
- Time gate: no action if interval since last trade < `tinterval`

### Proposed Improvements

#### 3a. Continuous Position Sizing

The current fractional rules (1/4, 1/2, 3/4) create discrete jumps in position size. A continuous function would be smoother:

- Instead of `type 6 → buy 3/4`, compute: `buyFraction = sigmoid(distanceFromMid / totalRange) × maxFraction`
- This smooths out the position-building curve and reduces the chance of concentration at a single price level
- The sigmoid's steepness parameter could be calibrated from the backtest

#### 3b. Volatility-Scaled Intervals

`tinterval` is static. A volatile market should trade faster, a quiet market slower:

- `effectiveInterval = tinterval × (medianExtrem / currentExtrem)`
- When current volatility exceeds historical median, intervals shrink → more responsive
- When volatility is below median, intervals stretch → avoid overtrading in low-vol ranges

#### 3c. Fee-Aware Dead Zone

The current code checks `fee` for break-even but doesn't enforce a minimum profitable spread. Improvement:

- Require `|stepPrice - prevTradePrice| > price × fee × 3` before acting (round-trip cost = 2× fee, plus 1× margin)
- This prevents the known pattern of buying and selling the same step when price oscillates right at a boundary

#### 3d. Momentum Filter

stockProcess is pure mean-reversion — it always buys dips and sells rallies. A simple momentum guard:

- Track the last N (e.g., 5) price inputs
- If all N are declining, delay buy by one extra interval (allow trend to stabilize)
- If all N are rising, delay sell similarly
- This is a lightweight anti-trend filter that doesn't require external indicators

---

## 4. Price Breakout — newMid Stack

### Current Behaviour

- When price leaves the grid, `calcResetMid` shifts the midpoint to the 1σ boundary in the breakout direction
- `newMid` values are pushed onto a stack
- `resolveNewMidStack` pops when price crosses back past the previous checkpoint
- `onPop` callback restores prior trade state (`tmpPT`)

### Proposed Improvements

#### 4a. Graduated Shift Size

Currently the shift is always exactly 1σ. In a strong trend, the price may immediately break out again, causing rapid stack growth (push → reprocess → push → ...). Graduated shifts:

- 1st breakout: shift by 1σ (current)
- 2nd consecutive same-direction breakout: shift by 1.5σ
- 3rd+: shift by 2σ
- This makes the grid "chase" the trend faster, reducing the number of newMid events in trending markets and the resulting overhead of repeated stockProcess calls

#### 4b. Stack Depth Limit

The stack can grow unbounded in a sustained trend (crash or parabolic rally). A cap:

- Max stack depth = 5 (configurable)
- When depth is reached, collapse the bottom 2 entries and recalculate mid from scratch using recent price data
- This prevents the unwinding condition from becoming unreachable (if mid was set at a price from 6 shifts ago, the cross-back condition may never fire)

#### 4c. Time-Based Stack Decay

A newMid entry that was pushed 6+ months ago is probably stale. The original mid may no longer be relevant:

- Attach a timestamp to each stack entry
- In `resolveNewMidStack`, auto-pop entries older than N months regardless of price condition
- Replace the popped entry's mid with a freshly computed mid from recent data
- This avoids the situation where the system is still trying to "return" to a mid that was set during a completely different market regime

#### 4d. Asymmetric Shift for Cap-Gain Bias

For long-only stock portfolios (TWSE/USSE), downside breakouts are more dangerous than upside. Consider asymmetric treatment:

- Down breakout: shift 1σ + reduce position target by 20% (defensive)
- Up breakout: shift 0.5σ + maintain full position target (let winners run)
- This aligns the grid behaviour with the inherent long bias of stock holding

---

## 5. Backtesting — stockTest

### Current Behaviour

- Selects price from `h/l` using directional movement comparison against previous candle
- Rebuilds grid every `resetWeb` candles via calStair
- Reports: startMid%, maxAmount, return%, maxMove%, sellTrade, stopLoss, maxLost%, maxGain%
- Single forward pass through history

### Proposed Improvements

#### 5a. OHLC Walk-Through

The single-price-per-candle model misses intra-candle sequences. A better approach:

- For each candle, simulate **two passes**: first to the extreme closer to the previous close, then to the other extreme
- E.g., if previous close was near high and candle is bearish: walk price to high first (no action likely), then to low (may trigger buy)
- This catches signals that the current h/l selection misses, especially for wide-range candles

#### 5b. Richer Backtest Metrics

The current output string is hard to parse programmatically. Add structured metrics:

| Metric | Description |
|--------|-------------|
| Sharpe ratio | `(annualReturn - riskFree) / annualStdDev` |
| Sortino ratio | Same but only downside deviation |
| Max drawdown | Largest peak-to-trough decline |
| Max drawdown duration | Longest time to recover from a drawdown |
| Win rate | Percentage of round-trip trades that were profitable |
| Average win / average loss | Risk-reward ratio |
| Profit factor | Gross profits / gross losses |
| Trade count per year | Turnover metric |
| Calmar ratio | Annual return / max drawdown |

Return as an object alongside the existing string for backward compatibility.

#### 5c. Walk-Forward Validation

Currently `stockTest` tests one contiguous window. Walk-forward splits the data into multiple in-sample/out-of-sample windows:

- Split 60 months into 5 × 12-month blocks
- For each block: train on prior 48 months (calStair), test on the 12-month block
- Report average and worst-case out-of-sample performance
- This reveals overfitting: if in-sample performance far exceeds out-of-sample, the grid parameters are fitting noise

#### 5d. Monte Carlo Shuffle

Randomize the order of candles within each calStair window and run N simulations (e.g., 100). Report the distribution of outcomes:

- Median return ± std dev
- 5th percentile return (worst-case)
- 95th percentile return (best-case)
- This tests whether the strategy's return is path-dependent or robust to ordering

---

## 6. Live Execution — stockStatus / startStatus

### Current Behaviour

- `stockStatus` iterates all user totals, fetches live price, runs stockProcess
- `startStatus` does the same for Bitfinex positions
- Both handle newMid push/pop (now via shared helper functions)
- `tmpPT` preserves trade state across stack events

### Proposed Improvements

#### 6a. Stale Grid Detection

The grid can become misaligned with current market conditions if the Redis cache hasn't expired yet:

- Track the ratio: `currentPrice / grid.mid`
- If ratio > 1.5 or < 0.67 (i.e., price is >50% away from the grid center), force a grid rebuild regardless of cache TTL
- Log a warning when this happens — it may indicate a corporate action that wasn't caught

#### 6b. Execution Slip Tracking

The system generates signals but doesn't track whether real executions matched:

- Add a `lastSignal` / `lastExecution` comparison
- If a buy signal was generated but no execution is recorded within 2 × tinterval, flag the stock
- This catches cases where the market moved too fast, the order failed, or the system was down

#### 6c. Consolidated Cross-Stock Risk Check

Each stock is processed independently. No check prevents the system from generating buy signals across 10 stocks simultaneously (overcommitting cash):

- Before outputting signals, sum the cash required for all pending buys across all stocks
- If total exceeds available cash × 1.2 (allowing some margin), prioritize by: distance from mid (favor deeper dips) or by conviction (stocks with smaller extrem = more reliable signals)
- This is especially important for TWSE where odd-lot orders may partially fill

#### 6d. Emergency Stop Logic

No circuit breaker exists. If the market crashes 20% intraday:

- Detect if >50% of stocks have triggered `resetWeb` in the same execution cycle
- If so, enter "observation mode": log signals but don't generate buy suggestions until the next cycle
- This prevents the system from deploying all capital at the start of a crash before the full extent is known

---

## 7. Data Pipeline — getIntervalV2

### Current Behaviour

- TWSE: 60 months CSV + Yahoo Finance chart for corporate action adjustment
- USSE: 60 months Yahoo Finance chart with adjclose/close ratio
- Redis caching with TTL-based expiry
- Recursive re-fetch when corporate actions detected

### Proposed Improvements

#### 7a. Data Quality Validation

No validation that the fetched data is consistent:

- Check for: duplicate dates, missing months, negative prices, volume = 0 for all candles
- Check that adjusted prices are monotonically related to raw prices (adjclose ≤ close if no reverse split)
- Reject and retry if validation fails, with a different data source as fallback

#### 7b. Multi-Source Cross-Validation (TWSE)

TWSE data comes from CSV, adjustments from Yahoo. If Yahoo is wrong, adjustments are wrong:

- Cross-validate by comparing Yahoo's `close` with TWSE's `close` for overlapping dates
- If >5% of dates differ by >2%, log a warning and skip adjustment for that stock
- Consider using TWSE's own adjustment data (ex-dividend reference prices) as primary source

#### 7c. Incremental Cache Update

Currently: cache miss → fetch 60 months → cache. When the cache expires, it refetches everything:

- Store the last-fetched date in Redis alongside the data
- On cache miss: fetch only the months since last-fetched-date, merge with cached data, drop months older than 60
- This reduces API calls by ~95% on typical updates (only fetching 1-2 new months)

#### 7d. Weekend/Holiday Alignment

TWSE and USSE have different trading calendars. The current code doesn't account for this in the 60-month window:

- TWSE has ~22 trading days/month, USSE has ~21
- Ensure the comparison is on trading-day basis, not calendar-month basis
- This matters for calStair: a month with 10 trading days (holiday month) should have half the volume weight of a normal month

---

## 8. Web Array Representation

### Current Behaviour

The web array uses a flat array with negative values as σ-boundary markers:

```
[-3σ, step, step, -2σ, step, step, step, -1σ, step, ..., -mid, ..., -1σ, ..., -2σ, ..., -3σ]
```

### Proposed Improvements

#### 8a. Structured Representation

The current encoding is clever but error-prone. Any function that processes the array must re-parse it. A structured format:

```javascript
{
  mid: 520,
  layers: [
    { sigma: 3, direction: 'up',   boundary: 680, steps: [670, 660, 650] },
    { sigma: 2, direction: 'up',   boundary: 640, steps: [630, 620] },
    { sigma: 1, direction: 'up',   boundary: 580, steps: [570, 560, 550] },
    { sigma: 1, direction: 'down', boundary: 470, steps: [480, 490, 500] },
    { sigma: 2, direction: 'down', boundary: 420, steps: [430, 440] },
    { sigma: 3, direction: 'down', boundary: 380, steps: [390, 400, 410] },
  ]
}
```

- Pro: self-documenting, no re-parsing, easy to add metadata per layer
- Con: larger memory footprint, requires migration of all consumers
- Compromise: keep the flat array for storage/transport, add `parseWebArray()` / `buildWebArray()` converters and migrate internal logic to use the parsed form

#### 8b. Step Price Snapping

Step prices are raw floating-point values. For real trading, they should snap to market tick sizes:

- TWSE: ticks vary by price range (< 10: 0.01, 10-50: 0.05, 50-100: 0.1, etc.)
- USSE: 0.01 for most stocks
- Bitfinex: varies by pair

Apply tick-rounding at grid construction time, not at signal generation time. This prevents the grid from having two steps that round to the same tradable price.

---

## 9. Position Sizing & Risk Management

### Current State

- Position size is based on fractional rules (1/4, 1/2, 3/4 of orig)
- No per-stock risk limit beyond `upLimit`
- No portfolio-level risk management
- No correlation-aware sizing

### Proposed Improvements

#### 9a. Kelly Criterion Sizing

Replace the fixed fractions with data-driven sizing:

- From backtest: estimate win rate (p) and win/loss ratio (b)
- Kelly fraction: `f* = p - (1-p)/b`
- Use half-Kelly for safety: `fraction = f* / 2`
- This automatically sizes positions smaller for stocks with worse risk/reward profiles

#### 9b. Volatility-Normalized Position Size

Currently the same `orig` amount is used regardless of volatility. A $10K position in a 50%-annual-vol stock has very different risk than in a 15%-annual-vol stock:

- Compute annualized volatility from the 60-month data
- Normalize: `adjustedOrig = baseOrig × targetVol / stockVol`
- This equalizes the dollar-risk across stocks, producing smoother portfolio returns

#### 9c. Maximum Drawdown Stop

No automatic stop-loss exists at the portfolio level:

- Track cumulative P&L across all positions
- If total drawdown exceeds a threshold (e.g., 15% of total deployed capital), halt all new buys until recovery
- This prevents the "averaging down into oblivion" failure mode that grid strategies are prone to

#### 9d. Sector/Correlation Limits

No check prevents concentration in correlated positions:

- Group stocks by `stock_class` (TWSE sector classification)
- Cap sector exposure at 30% of total portfolio
- For USSE, use GICS sector codes from Yahoo Finance
- This protects against sector-wide crashes (e.g., all semiconductor stocks dropping together)

---

## 10. Priority Matrix

| # | Improvement | Impact | Effort | Risk | Priority |
|---|-------------|--------|--------|------|----------|
| 4b | Stack depth limit | High — prevents unbounded growth | Low | Low | **P0** |
| 6d | Emergency stop logic | High — crash protection | Low | Low | **P0** |
| 3c | Fee-aware dead zone | Medium — reduces churn | Low | Low | **P1** |
| 7a | Data quality validation | Medium — catches bad data | Low | Low | **P1** |
| 6a | Stale grid detection | Medium — catches drift | Low | Low | **P1** |
| 5b | Richer backtest metrics | High — enables data-driven decisions | Medium | Low | **P1** |
| 4a | Graduated shift size | Medium — reduces stack churn in trends | Low | Medium | **P2** |
| 9c | Max drawdown stop | High — portfolio protection | Medium | Medium | **P2** |
| 2b | Volume-time decay | Medium — faster regime adaptation | Medium | Medium | **P2** |
| 3a | Continuous position sizing | Medium — smoother curve | Medium | Medium | **P2** |
| 9b | Vol-normalized sizing | High — risk equalization | Medium | Medium | **P2** |
| 7c | Incremental cache update | Medium — reduces API calls | Medium | Low | **P2** |
| 8b | Step price snapping | Low-Medium — correctness | Low | Low | **P2** |
| 3d | Momentum filter | Medium — anti-trend guard | Low | Medium | **P3** |
| 4c | Time-based stack decay | Medium — prevents stale state | Low | Medium | **P3** |
| 5a | OHLC walk-through | Medium — better backtest fidelity | Medium | Low | **P3** |
| 5c | Walk-forward validation | High — overfitting detection | High | Low | **P3** |
| 2a | Adaptive bin count | Low — marginal accuracy gain | Medium | Low | **P3** |
| 2c | Skewness-aware layers | Medium — fewer breakouts for skewed stocks | Medium | High | **P3** |
| 6c | Cross-stock risk check | High — cash management | High | Medium | **P3** |
| 9a | Kelly criterion sizing | High — optimal sizing | High | High | **P4** |
| 9d | Sector/correlation limits | High — diversification | High | Medium | **P4** |
| 8a | Structured web array | Low — code quality | Very High | Medium | **P4** |
| 5d | Monte Carlo shuffle | Medium — robustness test | Medium | Low | **P4** |
| 4d | Asymmetric shift | Low — philosophical | Low | Medium | **P4** |
| 2d | Extrem fallback chain | Low — marginal | Low | Low | **P4** |
| 7b | Multi-source cross-validation | Low — rare issue | High | Low | **P4** |
| 7d | Weekend/holiday alignment | Low — minor correctness | Medium | Low | **P4** |
| 3b | Volatility-scaled intervals | Medium — adaptive | Medium | High | **P4** |
| 6b | Execution slip tracking | Low — observability | Medium | Low | **P4** |

### Recommended First Batch (P0 + P1)

1. **Stack depth limit** (4b) — simple cap with collapse logic
2. **Emergency stop** (6d) — counter + threshold check in stockStatus
3. **Fee-aware dead zone** (3c) — one conditional in stockProcess
4. **Data quality validation** (7a) — assertions after fetch
5. **Stale grid detection** (6a) — ratio check in stockStatus
6. **Richer backtest metrics** (5b) — add object return alongside string

These 6 items are all low-to-medium effort, low risk, and address the most impactful gaps.

---

**END OF PROPOSAL**
