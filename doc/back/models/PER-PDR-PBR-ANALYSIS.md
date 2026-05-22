# PER / PDR / PBR Calculation Logic — Analysis

## 1. Overview

Three valuation ratios are calculated for every stock:

| Ratio | Meaning | Formula (TWSE) |
|-------|---------|----------------|
| **PER** | Price-to-Earnings Ratio | `price / profit * equity` |
| **PDR** | Price-to-Dividends Ratio | `price / dividends * equity` |
| **PBR** | Price-to-Book Ratio | `price / netValue * equity` |

Sentinel value **9999** means "not available / not meaningful".

---

## 2. Code Locations

| Path | Lines | Purpose |
|------|-------|---------|
| `stock-tool.js` L446–448 | `getSingleStockV2` → `final_stage` | Compute PER/PDR/PBR for **TWSE** during stock filter scan |
| `stock-tool.js` L716–719 | `getStockPERV2` → TWSE branch | Recalculate PER/PDR/PBR from stored `profit`/`dividends`/`netValue`/`equity` |
| `stock-tool.js` L4664–4726 | `getUsStock` | Fetch PER/PBR for **USSE** from Yahoo Finance / Macrotrends |
| `stock-tool.js` L642–699 | `getSingleStockV2` → USSE path | Store PER/PDR/PBR from `getUsStock()` into STOCKDB |
| `stock-tool.js` L707–726 | `getStockPERV2` → USSE branch | Return stored values directly (no recalculation) |
| `stock-router.js` L107–110 | `GET /getQuick/:uid` | API endpoint — formats `per pdr pbr` as string for display |

---

## 3. TWSE Calculation Detail

### 3a. Data Collection (`getSingleStockV2` → `recur_getTwseProfit`)

1. **Profit**: Fetched from MOPS (公開資訊觀測站) quarterly financial statements. Uses cumulative approach:
   - Q4: takes full-year cumulative profit directly
   - Q3/Q2: subtracts previous quarter's cumulative from current
   - Q1: takes Q1 cumulative directly
   - Walks backwards from current quarter to find the latest Q4 data as the annual profit base.

2. **Equity** (`股本合計`): Total shares outstanding, fetched once from the latest available financial statement.

3. **Net Value** (`權益總計` / `權益總額`): Total equity/net worth from balance sheet.

4. **Dividends** (`C04500`): Cash dividends declared. If Q4 report has `dividends === 0`, goes back one more quarter to Q3 to search.

### 3b. Formula Applied (L446–448)

```js
const per = (profit <= 0) ? 9999 : Math.round(price / profit * equity * 10) / 100;
const pdr = (dividends <= 0) ? 9999 : Math.round(price / dividends * equity * 10) / 100;
const pbr = (netValue <= 0) ? 9999 : Math.round(price / netValue * equity * 10) / 100;
```

**Rounding**: `Math.round(x * 10) / 100` ← this gives **one decimal place** precision (e.g. 15.3), NOT two. The `* 10 / 100` sequence means the value is effectively `Math.round(raw * 10) / 100`.

### 3c. Recalculation in `getStockPERV2` (L716–719)

```js
const per = (items[0].profit === 0) ? 0 : Math.round(price / items[0].profit * items[0].equity * 10) / 100;
const pdr = (items[0].dividends === 0) ? 0 : Math.round(price / items[0].dividends * items[0].equity * 10) / 100;
const pbr = (items[0].netValue === 0) ? 0 : Math.round(price / items[0].netValue * items[0].equity * 10) / 100;
return [(per > 0) ? per : 9999, (pdr > 0) ? pdr : 9999, (pbr > 0) ? pbr : 9999, ...];
```

---

## 4. USSE Calculation Detail

### 4a. Data Sources (`getUsStock`)

| Stat | Primary Source | Fallback Source |
|------|---------------|-----------------|
| `per` | `yahoo-finance2` → `trailingPE` | Macrotrends PE ratio page |
| `pbr` | `yahoo-finance2` → `priceToBook` | Macrotrends price-book page |
| `pdr` | **Always 9999** | None — never computed |
| `equity` | `yahoo-finance2` → `marketCap / price` | Macrotrends net-worth page |

### 4b. `getStockPERV2` USSE Path (L721–722)

```js
return [items[0].per, items[0].pdr, items[0].pbr, items[0].index, start];
```

Returns stored values directly — **no recalculation** with current price. This means USSE PER/PBR are stale from the last `stockFilterV4` run.

---

## 5. Issues Found

### Issue 1: Inconsistent Zero-Handling Between `getSingleStockV2` and `getStockPERV2`

| Function | Condition for sentinel | Sentinel value |
|----------|----------------------|----------------|
| `getSingleStockV2` (L446) | `profit <= 0` | `9999` |
| `getStockPERV2` (L716) | `profit === 0` | `0` (then `per > 0 ? per : 9999`) |

**Problem**: In `getSingleStockV2`, negative profit → `9999`. In `getStockPERV2`, negative profit → **computes a negative PER**, then the `per > 0` guard converts it to `9999`. The result is the same, but the logic is different and confusing. If profit is stored as negative in the DB, `getStockPERV2` will compute `price / negative_profit * equity` → negative number → 9999. Same outcome, but the negative computation is unnecessary.

**Severity**: Low (cosmetic). The output is correct in both paths.

**Fix**: Align `getStockPERV2` to use `<= 0` check like `getSingleStockV2`:
```js
const per = (items[0].profit <= 0) ? 9999 : Math.round(price / items[0].profit * items[0].equity * 10) / 100;
```

### Issue 2: USSE PDR Is Always 9999

`getUsStock` hardcodes `ret['pdr'] = 9999` (L4685) with no attempt to compute it. Yahoo Finance does provide `dividendYield` and `trailingAnnualDividendRate` fields. If dividend data is available, PDR could be computed as:

```
pdr = price / trailingAnnualDividendRate
```

**Severity**: Medium — missing feature. Users cannot compare USSE PDR values.

### Issue 3: USSE PER/PBR Are Not Recalculated in `getStockPERV2`

The TWSE branch recalculates PER/PBR with the **current** stock price (via `getStockPrice`), but the USSE branch returns stale stored values. If the stock price has moved significantly since the last `stockFilterV4` run, the displayed PER/PBR is outdated.

**Severity**: Medium — stale data for USSE stocks.

**Fix**: Add a Yahoo Finance quote call in the USSE branch:
```js
case 'usse':
    return getUsStock(items[0].index, ['price', 'per', 'pbr']).then(ret => 
        [ret.per, items[0].pdr, ret.pbr, items[0].index, start]
    );
```

### Issue 4: Rounding Precision Is Only 1 Decimal Place

The formula `Math.round(x * 10) / 100` rounds to 1 decimal (e.g. `15.3`), while `getUsStock` rounds to 2 decimals (`Math.round(x * 100) / 100` → `15.32`). This creates inconsistency between TWSE and USSE precision.

**Severity**: Low. The display format in the API (`stock-router.js` L109) just concatenates numbers into a string, so both precisions are shown.

**Fix (if desired)**: Change TWSE formula to `Math.round(price / profit * equity * 100) / 100` for 2 decimal precision, matching USSE.

### Issue 5: `latestQuarter` / `latestYear` Not Set for USSE

The USSE path in `getSingleStockV2` (L642) gets PER/PBR from `getUsStock()`, but `getUsStock` never sets `ret.latestQuarter` or `ret.latestYear`. These are stored as `undefined` in STOCKDB.

In `getStockPERV2`, the `start` date string is computed from `latestQuarter`/`latestYear`:
```js
const start = (items[0].latestQuarter === 0) ? `${items[0].latestYear - 1912}12` : ...
```

For USSE stocks with `latestQuarter = undefined`, the `=== 0` check fails (undefined !== 0), so it goes to the else branch and computes `undefined * 3` → `NaN`. The result is `start = "NaN"`, which is benign since USSE doesn't use the ROC calendar, but it's still a bug.

**Severity**: Low — the `start` value is only used for display and USSE doesn't need ROC year conversion.

### Issue 6: Equity Is Shares Outstanding, Not a Pure Scalar

For TWSE, `equity` = `股本合計` (total paid-in capital, in thousands of NT$), and `profit`/`dividends`/`netValue` are per-share (EPS) or total values from financial statements. The formula `price / profit * equity` only makes sense if `profit` is the total company profit (not EPS). Since `getParameterV2` returns the raw value from MOPS reports:

- If profit = total pre-tax profit (e.g. 100 billion) and equity = total shares (e.g. 25.93 billion shares), then `PER = price * shares / total_profit` ≈ `market_cap / total_profit`. This is correct.
- The formula effectively computes `PER = market_cap / total_profit`, which is the standard P/E ratio.

For USSE, `equity = marketCap / price = shares_outstanding`. But PER/PBR come directly from Yahoo Finance (`trailingPE`, `priceToBook`), so `equity` is only used for market cap display — not in ratio calculations. No issue here.

**Severity**: None — the TWSE formula is mathematically correct for total values.

---

## 6. The Filter Pipeline (`stockFilterV4`)

PER/PDR/PBR are **not** used in the filter ranking logic. The filter (`stockFilterV4`) ranks stocks by:

1. **ETF membership tier** (tw50 > tw100 > dow jones > nasdaq 100 > s&p 500 > none)
2. **Market cap** (descending within each tier)

PER/PDR/PBR are stored in STOCKDB and displayed in the frontend, but they do not influence which stocks are selected for trading. This is by design — the grid mechanism is price-action based.

---

## 7. Summary of Recommended Improvements

| # | Issue | Priority | Effort |
|---|-------|----------|--------|
| 1 | Align zero-handling (`<= 0` everywhere) | Low | Trivial |
| 2 | Compute USSE PDR from Yahoo Finance `trailingAnnualDividendRate` | Medium | Small |
| 3 | Recalculate USSE PER/PBR with current price in `getStockPERV2` | Medium | Small |
| 4 | Unify rounding to 2 decimal places | Low | Trivial |
| 5 | Set `latestQuarter`/`latestYear` for USSE or handle `undefined` | Low | Trivial |

Issues 1, 4, 5 are quick fixes. Issues 2 and 3 add real value by making USSE ratios more useful and current.
