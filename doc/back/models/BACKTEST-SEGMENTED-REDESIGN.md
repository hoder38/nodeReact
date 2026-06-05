# Backtest Redesign — Segmented Walk-Forward `stockTest`

**Date**: 2026-06-05
**Scope (rewrite allowed):**
- `src/back/models/stock-tool.js` — the whole `restTest` block (lines ~932–991: `resultShow` + `loopShow`) plus the `stockTest` core it drives.
- `src/back/models/bitfinex-tool.js` — the whole `loopShow`/`resultShow` driver (lines ~312–353).

Design-only document. No production code is changed by this file.

---

## 0. Output Behaviour (unchanged shape, extended fields)

Keep the **current display behaviour** of `restTest`/`loopShow`: a single space-separated
string built from the chosen backtest, persisted to STOCKDB/TOTALDB/Redis exactly as today.

### Current string (4 fields)
```
`${pricePct}% ${m.returnPct}% ${m.sortino} ${m.profitFactor}`
```

### New string (6 fields)
```
`${pricePct}% ${avgReturnAnnualPct}% ${avgBuyHoldPct}% ${avgSortino} ${avgProfitFactor} ${maxDrawdownPct}%`
```

Field-by-field rules (these are the **only** output changes):

| Position | Field | Source | Rule |
|---|---|---|---|
| 1 | `pricePct` | `Math.round((+price - web.mid) / web.mid * 10000) / 100` | **Distance to Mid.** Shown directly as in current behaviour. **Not** averaged, **not** recalculated — it is the live `pricePct` already computed in `restTest`. |
| 2 | `avgReturnAnnualPct` | per-group `returnAnnualPct` | **Replaces** `returnPct`. Average across the 10 groups. |
| 3 | `avgBuyHoldPct` | per-group Hold & Buy annualized pct | **New.** Average across the 10 groups. |
| 4 | `avgSortino` | per-group `sortino` | Average across the 10 groups. |
| 5 | `avgProfitFactor` | per-group `profitFactor` | Average across the 10 groups (guard `Infinity`/`NaN`). |
| 6 | `maxDrawdownPct` | per-group `maxDrawdownPct` | **New = MDD.** Use the **largest** drawdown across the 10 groups (a max, **not** an average). |

Notes:
- `pricePct` stays a single live value (Distance to Mid). The phrase "show
  `avgDistanceToMid` as a str like current behaviour" means: keep emitting `pricePct`
  in field 1 exactly as the current code does — no aggregation over groups.
- MDD (`maxDrawdownPct`) is the single worst peak-to-trough drop observed across all 10
  groups, surfaced as-is.
- The `{ start, metrics }` return contract of `stockTest` is preserved; new per-group
  data is additive (see §4.3) so existing consumers/DB schema keep working.

---

## 1. Data Segmentation & Capital Constraints

### 1.1 Five equal chronological segments
- `his_arr` is newest-first; normalize to chronological order for the split.
- `segLen = Math.floor(N / 5)`; `S1` = oldest fifth … `S5` = newest fifth.
- Remainder candles from the floor are appended to the **newest** segment `S5` so no data
  is dropped. Document this rounding rule in code.
- Guard: if any segment is too small for `calStair` to yield a web, return the existing
  early all-zero metrics object (current shape, `stockTest` lines ~3855–3865).

### 1.2 Initial web from Segment 1 only
- `web0 = calStair(S1, loga, min, 0, fee, S1.length)`.
- `loga`/`min` are still derived from the **full** dataset price range (as today), so the
  log ladder spans real min/max while the web *structure* is seeded from S1 only.

### 1.3 Per-seed max amounts (implemented: one per seed, not global)
- The original design froze `FIXED_MAX_AMOUNT` once from the S1 web. The implementation
  uses a **per-seed capital base** so that each group's denominator reflects the price
  history the seed actually observed:
  - `maxAmountBySeed[1]` = `webMaxAmount(webStates[1])` (S1 only)
  - `maxAmountBySeed[2]` = `webMaxAmount(webStates[2])` (S1+S2 cumulative)
  - `maxAmountBySeed[3]` = `webMaxAmount(webStates[3])` (S1+S2+S3)
  - `maxAmountBySeed[4]` = `webMaxAmount(webStates[4])` (S1+S2+S3+S4)
- Each `runGroup` declares `const FIXED_MAX_AMOUNT = maxAmountBySeed[seedIdx]` locally.
  Groups sharing the same `seedIdx` use the same amount; groups with different `seedIdx`
  may differ.
- `adjustWeb()` may still reshape **step density** on rebuild, but is always called with
  the group's `FIXED_MAX_AMOUNT`; any max-amount it derives is discarded.

### 1.4 Continuous web rebuild every 5 data points (append, not slide)
- Maintain a growing `webHistory` seeded with the group's cumulative seed segments (§2).
- Every **5 consumed candles**: append those 5 to `webHistory`, rebuild via
  `calStair(webHistory, loga, min, 0, fee, webHistory.length)` over the **whole accumulated
  window**, then reshape with `adjustWeb(web.arr, web.mid, FIXED_MAX_AMOUNT, true)`.
- Repurpose the existing `checkweb`/`resetWeb` cadence counter to fire every `5`.
- `newMid` breakout handling (`resolveNewMidStack` / `scaleWebArr` / `MAX_NEWMID_STACK`) is
  preserved untouched.

---

## 2. The 10-Group Testing Matrix

### 2.1 Definition (traded range vs. cumulative web seed)
"Seed" = all segments **before** the first traded segment.

| Group | Traded segment(s) | Web seed | Span | Annualize? |
|---|---|---|---|---|
| 1 | S2 | S1 | 1 | No |
| 2 | S3 | S1+S2 | 1 | No |
| 3 | S4 | S1+S2+S3 | 1 | No |
| 4 | S5 | S1+S2+S3+S4 | 1 | No |
| 5 | S2+S3 | S1 | 2 | Yes |
| 6 | S3+S4 | S1+S2 | 2 | Yes |
| 7 | S4+S5 | S1+S2+S3 | 2 | Yes |
| 8 | S2+S3+S4 | S1 | 3 | Yes |
| 9 | S3+S4+S5 | S1+S2 | 3 | Yes |
| 10 | S2+S3+S4+S5 | S1 | 4 | Yes |

### 2.2 Sequential run with cumulative state preservation
- Single chronological walk-forward builds reusable web snapshots:
  1. Build `web0` from S1 → snapshot `webState[1]`.
  2. Walk S2 (append-every-5) → snapshot `webState[2]` (state after S1+S2).
  3. Walk S3, S4 → snapshots `webState[3]`, `webState[4]`.
- Group seeds:
  - Groups 1, 5, 8, 10 → `webState[1]`
  - Groups 2, 6, 9 → `webState[2]`
  - Groups 3, 7 → `webState[3]`
  - Group 4 → `webState[4]`
- **Deep-clone** the snapshot (incl. `arr`, `mid`, `times`, `newMid`) before a group mutates
  it, so groups never contaminate each other. `FIXED_MAX_AMOUNT`, `loga`, `min` are shared
  read-only.
- Within a group the web keeps rebuilding every 5 points by appending the **traded**
  candles onto the inherited seed history.

### 2.3 Group runner contract
Extract the current Phase-2/3 candle loop (`stockTest` lines ~4067–4142) into a reusable
internal `runGroup(candles, seedWebState, FIXED_MAX_AMOUNT, opts)` returning a raw
per-group metrics object. The 10 groups all call this one core (keeps stock-tool and the
imported usage in bitfinex-tool DRY).

---

## 3. Trading Logic Simulation

### 3.1 Initial position = 25 % of frozen max amount
- Each group opens with ¼ of `FIXED_MAX_AMOUNT` deployed as position, ¾ held as cash:
  - `count0 = floor((FIXED_MAX_AMOUNT * 0.25) / referencePrice)`
  - `amount0 = FIXED_MAX_AMOUNT - count0 * referencePrice * (1 + fee)`
- Seed `buyLog` with this opening lot so FIFO round-trip attribution (`recordSell`) is correct.
- Set `initialMaxAmount = peakEquity = FIXED_MAX_AMOUNT` so return is measured against the
  frozen base (not the partially-invested cash).
- **Virtual fractional position (high-price stocks):** when `count0 = 0` (referencePrice >
  4 × `FIXED_MAX_AMOUNT`, i.e. one share cannot be bought with 25% of capital), deploy a
  dollar-value virtual position instead:
  - `initialValue = FIXED_MAX_AMOUNT * 0.25`; `amount = FIXED_MAX_AMOUNT - initialValue`.
  - This position does **not** interact with integer buy/sell logic but appreciates/depreciates
    proportionally with price (mark-to-market each candle; liquidated at Phase 3 low).
  - Ensures the group captures ¼ buy-hold return even when no discrete trades fire, preventing
    spurious `0% return` results for stocks whose price has risen above the seed's capital base
    (e.g. NVDA groups 2–4, 6–7, 9 where the test period starts at prices ≫ seed max amount).

### 3.2 Daily order placement via `stockStatus` semantics
Mirror the live engine (`stockStatus`, lines ~2986–3056) so backtest == production:
- `resolveNewMidStack(newMid, price, web.mid, web.arr, …)` before signalling.
- `suggestion = stockProcess(price, newArr, web.times, priviousTrade, FIXED_MAX_AMOUNT,
  amount, count, …, newMid.length)`.
- Handle `suggestion.resetWeb` (1 = down/stop-loss, 2 = up-break) with the existing
  `newMid.push` → `scaleWebArr` → recalc loop and `MAX_NEWMID_STACK` hard-stop
  (`runSignal`, lines 3950–3984). Increment `stopLoss` when `resetWeb === 1`.

### 3.3 Execution against daily High/Low
- Keep the OHLC two-pass touch model (lines ~4088–4112): visit the extreme closer to
  `prevClose` first.
- Order executes when the candle range reaches the trigger:
  - Buy fills if `candle.l <= suggest.buy` → `executeBuy(suggest, amount, FIXED_MAX_AMOUNT, count, fee)`.
  - Sell fills if `candle.h >= suggest.sell` and `count > 0` →
    `executeSell(suggest, amount, FIXED_MAX_AMOUNT, count, fee)`.
  - Preserve the mid-shift `type:0` branches and `recordSell` FIFO attribution.
- Phase-3 liquidation (force-sell remainder at the last candle low) runs per group before
  metrics, closing all risk.

### 3.4 Hold & Buy baseline (per group)
- Deploy **100 % of `FIXED_MAX_AMOUNT`** at the group's first traded candle, then **no
  trading**.
- `holdCount = floor(FIXED_MAX_AMOUNT / firstPrice)`;
  `finalValue = holdCount * lastPrice * (1 - fee) + leftoverCash`;
  `buyHoldPct = (finalValue / FIXED_MAX_AMOUNT - 1) * 100`.
- Annualize identically to the active strategy for multi-segment groups (§4.2). This
  replaces the current ad-hoc `buyHoldPct` (`his_arr` high/low ratio) with a
  capital-consistent baseline on the same frozen base + fee model.

---

## 4. Metrics Collection & Output

### 4.1 Reuse existing formulas
All formulas stay as in `stockTest` (lines ~4145–4201):
- **Distance to Mid** = `pricePct` (live value in `restTest`; output field 1, not aggregated).
- **Return Rate** = `returnAnnualPct` (vs. frozen `FIXED_MAX_AMOUNT`).
- **Hold & Buy Return Rate** = `buyHoldPct` (from §3.4).
- **Sortino** = downside-deviation Sharpe (lines 4167–4170).
- **Profit Factor** = `grossProfit / grossLoss` (line 4180).
- **MDD** = `maxDrawdownPct` (lines 4128–4173).

### 4.2 Annualization for multi-segment groups
- Groups 1–4 (single segment): `returnAnnualPct` over the one segment's `tradeDays`.
- Groups 5–10 (>1 segment): annualize using the existing CAGR form
  `((finalValue / FIXED_MAX_AMOUNT) ** (1/years) - 1) * 100`, with
  `years = tradeDays / 250` (TWSE) — for Bitfinex (`sType=1`) keep the project's existing
  period basis, not a hard-coded 250.
- Apply the same annualization to the Hold & Buy baseline so the comparison is
  apples-to-apples.
- Sortino (already × √250), Profit Factor (unitless), and MDD (a percentage magnitude) are
  reported as-is.

### 4.3 Aggregation → output string
After all 10 groups complete:
- **Average** across the 10 groups: `returnAnnualPct`, `buyHoldPct`, `sortino`,
  `profitFactor` (guard/cap `Infinity`/`NaN` profit factors before averaging — document
  the rule).
- **Max** across the 10 groups: `maxDrawdownPct` (MDD = largest drawdown, not averaged).
- `pricePct` (Distance to Mid) is taken from the live `restTest` value, untouched.
- Build the field-6 string of §0 and persist it where the current `str` is persisted.
- `stockTest` return extended additively:
  `{ start, metrics, groups: [...perGroupMetrics], summary }` where `summary` carries the
  averaged + max values used to build the string. Existing direct-property consumers and DB
  fields (`web.metrics`, TOTALDB `metrics`) remain valid.

---

## 5. Driver Rewrites

### 5.1 `stock-tool.js` `restTest` (lines ~932–991)
- `resultShow(type)` calls the new segmented `stockTest` once per `type` (full-history),
  reads `temp.summary`, and builds the 6-field string of §0.
- The "no less than mid point" empty-result guard and the middle-profitable `bestIdx`
  selection (lines 982–989) are preserved.
- The second `stockTest(reverse=true)` call for `lastest_type` selection is **removed**.
  `lastest_type` is now chosen inline from the single call's `m.returnPct`
  (`temp.metrics.returnPct`), since `start`/`reverse`/`len` are superseded by the
  segmented design and both calls would return identical results.
- The `start`, `reverse`, `len`, and `resetWeb` parameters have been **removed** from the
  `stockTest` signature entirely. New signature:
  `stockTest(his_arr, loga, min, pType=0, rinterval, fee, ttime, tinterval, sType=0)`
- Persistence (`web.metrics`, `recur_web` → TOTALDB) unchanged.

### 5.2 `bitfinex-tool.js` `loopShow`/`resultShow` (lines ~312–353)
- Same rewrite: consume `temp.summary`, emit the 6-field string, keep the `bestIdx`
  middle-pick, Redis `str` write, and TOTALDB `metrics` persistence.
- The second `stockTest` call and `start`/`reverse`/`len`/`resetWeb` args are likewise
  removed (same reasoning as §5.1).
- Preserve Bitfinex args (`RANGE_BITFINEX_INTERVAL`, `BITFINEX_FEE`, `BITFINEX_INTERVAL`,
  `sType=1`). The every-5 append cadence is the backtest rebuild trigger; the live
  `resetWeb` arg previously passed to `stockTest` is now an internal concern of the
  segmented harness and no longer a caller parameter.

---

## 6. Risks & Edge Cases
- **Backward-compat:** keep `{ start, metrics }`; add `groups`/`summary` additively.
- **Short symbols:** segment too small for `calStair` → early all-zero return (existing shape).
- **Per-seed capital invariant:** groups with the same `seedIdx` always share the same
  `FIXED_MAX_AMOUNT`; groups with different `seedIdx` may differ.
- **High-price stocks (virtual position):** when `count0 = 0`, a fractional dollar-value
  position tracks ¼ buy-hold; no discrete trades fire but return is non-zero (see §3.1).
- **Profit factor `Infinity`** (no-loss groups): explicit cap/exclude before averaging.
- **MDD semantics:** field 6 is the single largest group drawdown, not an average.
- **Bitfinex period basis:** annualization divisor follows existing convention per `sType`.
- **Snapshot bleed:** deep-clone `webState` (arrays + `newMid`) per group.
- **Removed params:** `start`, `reverse`, `len`, `resetWeb` are no longer accepted by
  `stockTest`; all call sites have been updated accordingly.

---

## 7. Test Plan (run inside `reactnode-server` container)
- **Unit:** `splitSegments` sizes/remainder/guard; per-seed max-amount invariant (groups
  with the same `seedIdx` share the same `maxAmount`); every-5 append cadence; 25 % opening
  sizing (including virtual fractional case); Hold & Buy final value; annualization only for
  multi-segment groups; MDD = max (not avg); profit-factor guard.
- **Integration:** synthetic uptrend/downtrend/sideways → 10 groups produced, seeds match
  table §2.1, output string has 6 fields and parses; `pricePct` passed through unchanged.
- **Regression:** existing stock-tool (513) and bitfinex-tool (375) suites green;
  `data miss` and insufficient-data early returns preserved.
- Commands: `npm run dev-test`, or targeted
  `docker exec -w /app -e NODE_OPTIONS=--experimental-vm-modules reactnode-server npx jest src/back/models/__tests__/stock-tool.test.js --forceExit --no-cache`.

---

## 8. Acceptance Criteria
1. Data split into 5 equal chronological segments; S1 seeds the initial web.
2. Max amount is per-seed: groups sharing the same `seedIdx` use the same
   `FIXED_MAX_AMOUNT`; seedIdx 1→S1, 2→S1+S2, 3→S1+S2+S3, 4→S1+S2+S3+S4.
3. Web rebuilt by appending every 5 data points (accumulating window, not sliding).
4. 10 groups run sequentially with correct cumulative seed states (table §2.1), no bleed.
5. Each group opens at 25 % of frozen max amount; when price is too high for 1 share a
   virtual fractional position captures ¼ buy-hold return. Daily orders driven by
   `stockProcess`/`stockStatus` logic with High/Low touch execution and `resetWeb` handling.
6. Hold & Buy baseline per group; multi-segment groups annualized (active + baseline).
7. Output string = `pricePct% avgReturnAnnualPct% avgBuyHoldPct% avgSortino avgProfitFactor
   maxDrawdownPct%` — `pricePct` shown live (no aggregation), MDD = largest group drawdown.
8. Existing metric formulas reused unchanged; full suite green in-container.
9. `stockTest` signature: `(his_arr, loga, min, pType=0, rinterval, fee, ttime, tinterval, sType=0)` —
   `start`, `reverse`, `len`, `resetWeb` removed; single call per pType (no reverse pass).
