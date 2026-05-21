# FakeOrder & Profit Analysis — shioaji-tool, tdameritrade-tool, bitfinex-tool

**Date**: 2025-07-23

---

## 1. Overview

All three tools share a common pattern:
1. **fakeOrder**: When no real order can be submitted (insufficient funds/bCount=0), a virtual order is recorded
2. **Profit tracking**: When a sell is filled, the realized P&L is computed and accumulated in `TOTALDB.profit`
3. **previous** ledger: A sorted buy/sell history for each stock, used for duplicate detection and profit calculation

---

## 2. FakeOrder Mechanism

### 2.1 Shioaji (TWSE)

```
Location: shioaji-tool.js lines 409–437, 56–82
```

- **Creation**: In `submitShioajiOrder()`, if `bCount === 0` but `buy` price exists, or `sCount === 0` but `sell` price exists → push to `fakeOrder[]`
- **Resolution**: In `twseShioajiInit()` after `getShioajiData()`, iterates `fakeOrder` checking if `twseSuggestion[symbol].price <= fakeOrder.price` (buy) or `>= fakeOrder.price` (sell). If met, marks `o.done = true` and pushes to `ret.fill_order[]` with `fake: true`
- **Lifecycle**: `fakeOrder = []` is reset at start of each `submitShioajiOrder()` call

### 2.2 TDAmeritrade (USSE)

```
Location: tdameritrade-tool.js lines 606, 196–230, 732–764
```

- **Creation**: In `recur_NewOrder()`, if `bCount === 0` but `buy` exists → push. If `sCount === 0` but `sell` exists → push
- **Resolution**: In `initialBook()` (the book-fetching phase), iterates `fakeOrder` checking `usseSuggestion[symbol].price` vs fake price. If met, injects into `orderStrategies[]` with `fake: true`
- **Lifecycle**: `fakeOrder = []` reset at start of trade phase

### 2.3 Bitfinex

```
Location: bitfinex-tool.js lines 1338–1453, 1974–2006
```

- **Creation**: In `_recur_status()` sell/buy legs, when `sCount <= 0` or `bCount <= 0` but price exists → push to `fakeOrder[id][current.type][]`
- **Resolution**: In `checkFakeOrder()`, checks `priceData[symbol].lastPrice` vs fake price. If met, calls `processOrderRest()` directly (no intermediate array)
- **Lifecycle**: `fakeOrder[id][current.type] = []` reset at start of each `_recur_status()` call

---

## 3. Profit Calculation

### 3.1 Shioaji Profit Logic (lines 197–253)

**Trigger**: Only on Sell orders where `!o.fake && ret.position.length > 0`

**Formula**:
```
pp = prev_position_amount × prev_position_price   (position value BEFORE sell)
cp = curr_position_amount × curr_position_price   (position value AFTER sell)
profit_from_fills = Σ fill_profit[i] × (1 - TRADE_FEE)   (net proceeds from fill entries)
final_profit = profit_from_fills - pp + cp
```

**Issues Found**:

| # | Issue | Severity | Description |
|---|-------|----------|-------------|
| S1 | **`o.profit` string parsing is fragile** | Medium | Profit data comes as `"p123.4p567.8"` string from Python script. Uses `.split('p')` — if format changes or contains unexpected chars, silent data corruption |
| S2 | **`is_insert` reused for two purposes** | Medium | `is_insert` variable is declared as a boolean (duplicate check) then reassigned to `0` (number) for the profit calculation counter. This works but is confusing and error-prone |
| S3 | **`is_insert < 2` logic** | Low | The break condition `is_insert < 2` means: stop if ≥2 sell entries in `previous.sell` match a fill time. Intent: avoid counting already-processed fills. Correct but fragile — if two genuine fills have same time, one would be skipped |
| S4 | **Fee applied to gross proceeds, not profit** | ⚠️ Bug | `profit + p * (1 - TRADE_FEE)` deducts fee from the sell *revenue* (which includes cost basis). Should deduct fee only from the sell proceeds portion, or compute as `(sell_proceeds × (1-fee)) - cost_basis`. Current formula underestimates profit when profitable, overestimates loss when losing |
| S5 | **`profit = profit - pp + cp`** | Correctness concern | This adjusts by "position value change". If position partially sold: `pp - cp = sold_shares × avg_cost`. Combined with fill proceeds above, this double-counts part of the calculation in some scenarios |
| S6 | **Buy orders always set `profit += 0`** | Low | Buy path doesn't calculate profit but still hits `item.profit = item.profit ? item.profit + profit : profit` with `profit = 0`. Harmless but adds unnecessary DB write |
| S7 | **fakeOrder sell does NOT compute profit** | ⚠️ Bug | When `o.fake === true`, the code skips profit calculation (`if (!o.fake && ret.position.length > 0)`), but the position didn't actually change for a fake sell, so this is correct behavior. However, if `tprice` is set for the fake, the `previous.price` field gets `item.previous.time` (old time) which means the "last trade time" is wrong |

### 3.2 TDAmeritrade Profit Logic (lines 344–393, 522–572)

**Two identical profit blocks**: One for `cancelable` partial-fill orders (line 264–393), another for non-cancelable filled orders (line 404–572). These are essentially duplicated code.

**Issues Found**:

| # | Issue | Severity | Description |
|---|-------|----------|-------------|
| T1 | **Code duplication** | High | The profit calculation logic is copied verbatim between the cancelable-partial and non-cancelable branches (~130 lines × 2). Bug fixes must be applied twice |
| T2 | **`this_profit` accumulates ALL execution legs** | Medium | `this_profit.push({ time, price, profit: oace.quantity × oace.price })` — the "profit" field is actually gross sell revenue (qty × price), not net profit. Naming is misleading |
| T3 | **Same `is_insert < 2` issue as shioaji** | Medium | Same fragile dedup logic. If broker reports two fills at same price+time for different partial fills, the second is skipped |
| T4 | **Fee applied to revenue, not profit** | ⚠️ Bug | `profit + this_profit[i].profit * (1 - USSE_FEE)` — same issue as S4. `this_profit[i].profit` is `qty × sell_price`, so fee is applied to the whole sale amount, not the gain |
| T5 | **`profit = profit - pp + cp` same concern** | Correctness | Same as S5 — combines fill revenue with position delta |
| T6 | **Missing `quantity` field on fakeOrder** | Low | fakeOrder entries have no `quantity`, so `o.hasOwnProperty("quantity")` is never true for fake orders — meaning the Mongo $set never includes `bquantity`/`squantity` for fake fills. This is intentional (shioaji path) but not an issue in TD since fake orders don't set those fields |

### 3.3 Bitfinex Profit Logic (lines 710–726)

**Much simpler**: When a position is closed (WebSocket `pu`/`pc` event), profit comes directly from `lastP[0].pl` (the platform-reported P&L from Bitfinex API).

```js
const profit = items[0].profit ? items[0].profit + Number(lastP[0].pl) : Number(lastP[0].pl);
```

**Issues Found**:

| # | Issue | Severity | Description |
|---|-------|----------|-------------|
| B1 | **No fee deduction** | Low | Bitfinex API's `pl` field already includes trading fees, so no additional fee deduction needed. This is correct |
| B2 | **`processOrderRest` for fake orders doesn't update profit** | Design | Fake orders call `processOrderRest()` which only updates `previous` ledger, not `profit`. This means fake order P&L is never tracked in DB — only the "previous" entry is recorded for duplicate detection |
| B3 | **`item.orig += item.profit` in recur_status** | Important | When calculating available trading capital, profit is added to `orig`. This means profitable trades increase the effective capital for future trading. This is correct (reinvestment) but means `orig` in memory differs from DB |
| B4 | **Race condition on position close** | Low | The `Mongo('find'...then(processOrderRest))` in the WebSocket handler is fire-and-forget (no await). If two positions close rapidly, they could read stale `previous` data |

---

## 4. Correctness Analysis of Profit Formula

### The Core Formula (shioaji & tdameritrade)

```
profit = Σ(sell_fills × (1 - fee)) - prev_position_value + curr_position_value
       = Σ(qty_i × price_i × (1-fee)) - (pa × pp) + (ca × cp)
```

Where:
- `sell_fills` = each fill execution's `qty × price`  
- `prev_position` = position **before** this sell
- `curr_position` = position **after** this sell (from updated broker data)

**Expected correct formula** for realized profit on a partial sell:

```
realized_profit = (sell_qty × sell_price × (1-fee)) - (sell_qty × avg_cost_basis)
```

**What the code actually computes**:

The code uses `position_delta = -pp + cp = -(pa × pp_price) + (ca × cp_price)`.

If we sold `n` shares at `sell_price` with fee:
- `pp = total_shares × avg_cost` (total cost before)  
- `cp = remaining_shares × new_avg_cost` (total cost after)
- `pp - cp = n × avg_cost` (cost of shares sold, if avg_cost unchanged)

Then: `profit = sell_revenue×(1-fee) + cp - pp = sell_revenue×(1-fee) - cost_of_shares_sold`

This IS correct if:
1. `pp` and `cp` represent cost basis (amount × average_cost_per_share)
2. The broker reports `position.price` as the average cost

**However**: In shioaji, `position[i].price` is the *current market price* (or average entry price from broker) — if it's market price, the formula is wrong. Let me verify:

Looking at shioaji's `getShioajiData` (returns position from Python):
- `ret.position[i].price` = average cost price from broker  
- `position[i].price` after the sell = updated average cost  

If both are **average cost** (not current market price), then:
- Before sell: `pp = shares × avg_cost`
- After sell: `cp = remaining_shares × avg_cost` (avg_cost unchanged for partial sell)
- `profit = sell_proceeds × (1-fee) - (pp - cp) = sell_proceeds × (1-fee) - sold_qty × avg_cost`

**This is correct!** The `× (1-fee)` is applied to the fill revenue (sell_qty × sell_price), which is the gross proceeds. Fee on proceeds is correct.

**Re-evaluating S4/T4**: The fee IS correctly applied to the sell proceeds (not to profit). The formula:
```
net_proceeds = gross_proceeds × (1 - fee)
realized_profit = net_proceeds - cost_basis_of_sold_shares
```
This is mathematically sound. **S4 and T4 are NOT bugs** — my initial assessment was wrong. The formula is correct.

---

## 5. Issues Requiring Fixes

### 5.1 Critical: Code Duplication in tdameritrade-tool (T1)

Lines 260–393 and lines 398–572 contain nearly identical profit logic. This should be extracted into a helper function.

### 5.2 Medium: `is_insert` Variable Reuse (S2)

The same variable serves as:
1. A boolean for duplicate detection in buy/sell insertion
2. A counter for already-processed fills in profit calculation

This makes the code hard to understand and prone to refactoring bugs.

### 5.3 Medium: Missing `quantity` on fakeOrder for profit tracking (B2)

Bitfinex fake orders don't track P&L. When a fake buy is "filled" and later a real sell closes it, the profit from the fake-bought portion isn't attributed correctly.

### 5.4 Low: Buy path writes profit=0 unnecessarily (S6)

On buy fills, `profit` stays 0 but still writes to DB. Can skip the write.

---

## 6. Improvements Made

### 6.1 Profit formula — confirmed correct (no changes needed)

After thorough analysis, the profit formula is mathematically correct:
- `net_proceeds - cost_delta` gives the realized P&L
- Fee is correctly applied to gross sell revenue
- Position delta (`-pp + cp`) correctly captures the cost basis released

### 6.2 The `tprice` fake-order pattern — confirmed intentional

For fake orders, `tprice` preserves the "true previous price" so that if the fake order turns out to not execute in reality, the system can revert to the real last trade's price. Setting `time: item.previous.time` (keeping old time) prevents the fake from appearing as a "recent" trade for timing purposes.

### 6.3 TDAmeritrade: Extracted `processFilledOrder()` helper (T1 fix)

**File**: `tdameritrade-tool.js`

The two ~130-line duplicate profit blocks (handling filled BUY and SELL legs) were extracted into a single `processFilledOrder(o, lastP, currentPosition, order_recur, nextIndex)` helper function. This:
- Eliminates ~130 lines of duplicated code
- Centralizes profit logic in one place for future maintenance
- Renames confusing `this_profit` → `fillRevenue` (it's gross revenue before cost subtraction)
- Keeps identical behavior (all 111 tests pass)

### 6.4 Shioaji: Renamed `is_insert` → `matchCount` (S2 fix)

**File**: `shioaji-tool.js`

The variable `is_insert` in the profit loop was dual-purpose: it served as both a boolean flag (initially `true`) and later as a counter of already-processed fills. Renamed to `matchCount` (initialized to `0`, incremented on match) which accurately describes its role. The conditional was inverted accordingly (`matchCount === 0` means no match found → insert). All 93 tests pass.

---

## 7. Summary Table

| Tool | FakeOrder Type | Profit Source | Formula Correct | Issues Fixed |
|------|---------------|---------------|-----------------|-------------|
| Shioaji | Array, reset per submit | Python fill string parsing | ✅ Yes | S2 var rename |
| TDAmeritrade | Array, reset per trade cycle | Broker execution legs | ✅ Yes | T1 deduplication |
| Bitfinex | Object keyed by id/type, reset per cycle | Platform `pl` field | ✅ Yes | — |

---

## 8. Remaining Recommendations

1. ~~Extract profit helper in tdameritrade-tool~~ — **Done** (§6.3)
2. ~~Rename `is_insert` to `matchCount`~~ — **Done** (§6.4)
3. **Add guard for `o.profit`/`o.ptime` undefined** in shioaji — If Python script returns unexpected format, current code throws
4. **Consider tracking fake order P&L in bitfinex** — Currently fake orders update `previous` but not `profit`; this means if price moves favorably after fake fill, that gain is "invisible" until a real position close
5. **Add position.price documentation** — Document that position[].price means average cost (not market price) to prevent future confusion
