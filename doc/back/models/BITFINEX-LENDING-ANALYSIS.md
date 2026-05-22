# Automated Lending System — Detailed Analysis

## 1. Architecture Overview

The automated lending system manages funding offers on Bitfinex. It monitors real-time market rates, creates/cancels/renews funding offers, and manages risk exposure across multiple currencies.

### Core Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `calRate()` | L105–236 | Compute market rate curves from ticker + order book + candle data |
| `singleLoan()` | L1670–2085 | Per-currency offer lifecycle: adjust → create → merge → cancel → submit |
| `initialBookFn()` | L857–970 | Bootstrap state from REST: wallets, offers, credits, orders, positions |
| WS handlers | L521–608 | Real-time updates: wallet, offer new/update/close, credit, order |
| `checkRisk()` | L486–498 | Prevent duplicate risk-slot allocation |
| `closeRestCredit()` | L502–511 | Drain pending credit close queue |

### State Variables (Module-scoped)

```
offer[id][symbol]     — Active funding offers per user per currency
credit[id][symbol]    — Active funding credits (filled offers)
available[id][symbol] — Funding wallet balance {avail, total, time}
margin[id][symbol]    — Margin wallet balance
position[id][symbol]  — Trading positions
order[id][symbol]     — Active trade orders
extremRate[id][symbol]— Rate extreme tracking {high, low, is_low, is_high}
updateTime[id]        — Throttle timestamps for WS notifications
deleteOffer[]         — Queue for close events arriving before local state
fakeOrder[id][symbol] — Simulated orders for grid trading
```

---

## 2. Rate Calculation (`calRate`)

### Flow

1. **Ticker data** → `currentRate[type].rate` and `.frr` (FRR = flash return rate)
2. **Candle histogram** (1-min candles, 1440 entries = 24h):
   - Accumulates high/low/volume in doubling windows: [0-5), [5-10), [10-20), ..., [1280-2560)
   - Builds volume-weighted rate distribution via `weight[]` sparse array
3. **Order book rates** (`calOBRate`):
   - Iterates positive-volume offers, bins by `DISTRIBUTION` percentiles
   - Returns 11-element rate array (reversed: high→low)
4. **Volume rates** (`calTenthRate`):
   - Uses candle `weight[]` histogram, bins by `DISTRIBUTION` percentiles
   - Returns 11-element rate array (reversed: high→low)
5. **Final rate**: `finalRate[type] = max(tenthRate, OBRate) - 1` per slot, clamped to `MAX_RATE - 1`
6. **Max range**: `maxRange[type] = tenthRate[1] - tenthRate[9]`

### Issues Found

#### Issue R1: `calOBRate` Can Produce Short Arrays

**Line 175–201**: If the order book has sparse positive-volume entries, the `DISTRIBUTION` percentile loop may not fill all 10 slots. `OBRate` can end up with fewer than 11 elements.

**Impact**: `finalRate[curType] = tenthRate.map((v, k) => ... OBRate[k] ...)` — when `k >= OBRate.length`, `OBRate[k]` is `undefined`. The condition `v > OBRate[k] || !OBRate[k]` evaluates to `true` when `OBRate[k]` is `undefined` (falsy), so it falls back to `tenthRate`. This is accidental correctness, not intentional.

**Fix**: Initialize `OBRate` with a fill value or guard the map:
```js
// Option A: pad OBRate to 11 elements
while (rate.length < 11) rate.push(rate[rate.length - 1] || 0);
// Option B: explicit guard in finalRate map
finalRate[curType] = tenthRate.map((v, k) => {
    const ob = OBRate[k];
    return (ob === undefined || v > ob) ? (v - 1) : (ob - 1);
});
```

#### Issue R2: `tenthRate` Assumes Exactly 11 Elements

**Lines 203–217**: `rate` starts with `[hl[9].low]`, pushes during percentile loop, then pushes `hl[9].high`. If candle data is sparse (e.g., low volume), the `DISTRIBUTION` loop may push fewer than 9 intermediate values. The function still returns `rate.reverse()`, but `maxRange` at L221 uses `tenthRate[1] - tenthRate[9]` which could index undefined.

**Fix**: Add length guard:
```js
maxRange[curType] = (tenthRate.length >= 10)
    ? tenthRate[1] - tenthRate[9]
    : (tenthRate[0] - tenthRate[tenthRate.length - 1]) || 0;
```

#### Issue R3: `BITFINEX_MIN = 100` Bucket Precision

**Line 147**: `weight[wi] = weight[wi] ? ...` where `wi = Math.floor(high / BITFINEX_MIN)`. With `BITFINEX_EXP = 100000000`, rates like 0.0003 (30%/yr APR) become `30000`. `Math.floor(30000 / 100) = 300`. This creates 100-unit rate buckets, which is adequate for typical rate ranges (~100–70000) but could lose precision for very low rates.

**Severity**: Low — current rate ranges are well above the bucket size.

#### Issue R4: No Deduplication of Candle Entries

**Lines 165–173**: The doubling-window HL calculation (`calHL`) accumulates stats. However, each window overlaps with previous: window [0,5) feeds into [5,10) which feeds into [10,20) etc. — this is cumulative by design (`calHL(10, 20, hl[1].high, hl[1].low, hl[1].vol)`). This means `hl[9]` has the full 24h data, and `weight[]` accumulates all candle volumes. This is correct behavior — not a bug — but the cumulative design should be documented.

---

## 3. Offer Lifecycle (`singleLoan`)

### 3a. Configuration Parameters

| Parameter | Source | Purpose |
|-----------|--------|---------|
| `current.riskLimit` | DB/config | Max risk slot for new offers |
| `current.waitTime` | DB/config | Timeout (minutes) before offer is considered stale |
| `current.amountLimit` | DB/config | Target amount per offer |
| `current.keepAmount` | DB/config | Cash to keep unlent |
| `current.miniRate` | DB/config | Minimum acceptable rate (MR) |
| `current.keepAmountRate1` | DB/config | Rate threshold for KAM mode (MR2) |
| `current.keepAmountMoney1` | DB/config | KAM amount to lend at MR2 rate |
| `current.isDiff` | DB/config | If true, preserve original risk when risk falls below 1 |
| `current.dynamic` | DB/config | Dynamic rate for 30-day period |
| `current.dynamicRate1/2` | DB/config | Additional dynamic rate thresholds |
| `current.dynamicDay1/2` | DB/config | Corresponding lending periods |

### 3b. Decision Pipeline

```
calKeepCash()           → available cash (minus keepAmount)
  ↓
adjustOffer()           → classify existing offers into needRetain / needDelete
  ↓
newOffer(riskLimit)     → create new offers from remaining cash
  ↓
mergeOffer()            → cancel delete+new pairs that match (rate, amount)
  ↓
cancelOffer()           → REST cancel all remaining needDelete
  ↓
submitOffer()           → REST submit all finalNew offers
  ↓
checkFakeOrder()        → process simulated grid trading orders
```

### 3c. adjustOffer() Logic (L1820–1887)

For each existing offer:

1. **Skip manual** (L1826): `v.risk === undefined` → user-created offer, skip
2. **Undersized + cash available** (L1830): `amount < amountLimit && keep_available > 1` → delete and recreate with combined amount
3. **Rate too far** (L1845): `(rate - currentRate) > maxRange` → delete (rate is stale)
4. **Timed out** (L1851): `age >= waitTime * speed_factor` → delete
5. **Otherwise** → retain

Deleted offers are requeued as new offers with:
- Risk slot decremented (or preserved if `isDiff && risk < 1`)
- Rate from `finalRate[10 - risk]` (higher risk → lower rate → faster fill)
- Rate floor: `MR` or `MR2` depending on KAM balance

### 3d. newOffer() Logic (L1889–1943)

Creates up to `OFFER_MAX - needRetain - needNew` new offers:
- Each uses `current.amountLimit` or remaining cash (whichever smaller)
- Risk slot decremented for each new offer
- Stops if: `risk < 0`, `keep_available < MINIMAL_OFFER`, or `finalRate` empty

### 3e. mergeOffer() — Dedup Optimization (L1945–1975)

Compares each `needNew` entry against `needDelete`:
- Match = same rate bucket (`ceil(rate/BITFINEX_MIN)`) AND same amount
- If match: skip both cancel and submit (just update local state)
- If no match: add to `finalNew` for actual REST submission

### 3f. submitOffer() (L1998–2049)

For each `finalNew`:
1. Re-check available balance via `calKeepCash()` (skip if insufficient)
2. Compute `finalfinalRate`: adjusts rate using FRR and extrem rate conditions
3. Determine period from `getDR(finalfinalRate)` dynamic rate table
4. Submit via `fo.submit()`
5. Reconcile local `offer` state with WS `deleteOffer` queue

---

## 4. Risk Management

### 4a. Risk Slot System

Each offer has a `risk` value (1–10). `checkRisk()` prevents two offers from occupying the same slot. Higher risk = lower rate (further from market) = slower fill = higher return.

Risk slots map to rate tiers: `finalRate[10 - risk]` → risk=10 uses `finalRate[0]` (highest rate), risk=1 uses `finalRate[9]` (lowest rate).

### 4b. Issues Found

#### Issue L1: `risk--` Post-Decrement in `initialBookFn` (L902)

```js
risk: risk[v.symbol] > 0 ? risk[v.symbol]-- : 0,
```

**Bug**: Post-decrement returns the value BEFORE decrement, so the first offer gets `risk = RISK_MAX` (10), the second gets 9 (correctly decremented), etc. But `risk[v.symbol]--` also mutates the counter, so the sequence is: 10, 9, 8, 7, ... This is actually correct behavior, but the post-decrement returning the pre-decremented value means the first offer gets `10`, second gets `9`, etc. — which is the intended descending assignment.

However: when `risk[v.symbol] === 1`, `risk[v.symbol]-- = 1` (returns 1, then decrements to 0). Next call: `risk[v.symbol] > 0 ? risk[v.symbol]-- : 0` → `0 > 0` is false → returns `0`. Then next call: `0 > 0` → returns `0`. So multiple offers can get `risk = 0`.

**Impact**: Multiple offers with `risk = 0` bypass `checkRisk` (which returns false for `risk < 1`). These offers all map to `finalRate[10]` which may be undefined.

**Fix**: Use `Math.max(0, risk[v.symbol]--)` or initialize risk to `OFFER_MAX` (not `RISK_MAX`) if they differ.

#### Issue L2: Non-Atomic Balance Check in `submitOffer`

**Lines 2000–2001**: `calKeepCash()` makes a REST call to check balance before each submit. But between the check and `fo.submit()`, other offers may be filled/cancelled by WS events, changing the actual balance.

**Severity**: Low in practice — `API_WAIT` (5s) between submissions limits concurrency, and Bitfinex rejects offers exceeding available balance anyway.

#### Issue L3: `deleteOffer` Array Grows Unbounded

**Line 606**: `deleteOffer.push(fo.id)` — this global array is only trimmed when `submitOffer` finds a match (L2027–2038). If offers are closed without subsequent submissions, the array grows indefinitely.

**Fix**: Add a periodic cleanup or cap size:
```js
if (deleteOffer.length > 100) deleteOffer.splice(0, deleteOffer.length - 50);
```

#### Issue L4: Race Between WS Updates and `adjustOffer` Iteration

**Line 1825**: `offer[id][current.type].forEach(v => ...)` iterates the offer array while WS handlers (`makeOnFundingOfferNew`, `makeOnFundingOfferClose`) can splice/push to the same array concurrently.

**Severity**: Medium — Node.js is single-threaded, but `await` points within the async flow (e.g., `cancelOffer`, `submitOffer`) yield control. If a WS event fires during an `await`, the `offer` array may be modified.

**Mitigation**: The `adjustOffer` + `newOffer` + `mergeOffer` pipeline is synchronous (no awaits), so the race only affects `cancelOffer` and `submitOffer`. Since those iterate `needDelete`/`finalNew` (copies), not `offer` directly, the actual risk is limited to:
- `cancelOffer` splicing from `offer` on error (L1988) — could invalidate WS handler loops
- `submitOffer` pushing to `offer` (L2029) — could cause double-push with WS handler

**Fix**: Snapshot `offer[id][current.type]` at the start of `singleLoan` instead of referencing the live array.

---

## 5. Extreme Rate Detection (`extremRateCheck`)

### Logic (L1727–1789)

Tracks consecutive rate-too-high / rate-too-low observations:

- **Rate too high**: `currentRate > DR[0].rate` → increment `high` counter; decrement `low`. When `high >= EXTREM_RATE_NUMBER` (15), set `is_high` timestamp and send alert.
- **Rate too low**: `currentRate < MR` → increment `low` counter; decrement `high`. When `low >= 15`, set `is_low` timestamp and send alert.
- **Normal**: both counters decay by 1 (floored at 0).

### Effect on Lending

In `submitOffer` (L2004), the `finalfinalRate` calculation:
```js
const finalfinalRate = ((currentRate.frr >= current.dynamic) ||
    (extremRate.is_low && (now - extremRate.is_low) <= EXTREM_DURATION && extremRate.is_high < extremRate.is_low) ||
    (finalNew[index].rate > currentRate.frr * 0.7))
    ? finalNew[index].rate
    : currentRate.frr * 0.7;
```

This uses `finalNew[index].rate` (market-computed) when:
- FRR is above the dynamic threshold, OR
- Rate was recently extremely low (don't chase lower), OR
- The computed rate is already > 70% of FRR

Otherwise falls back to `FRR * 0.7` (slightly below FRR for faster fill).

### Issue E1: `is_high` / `is_low` Are Timestamps, Not Booleans

Comparisons like `extremRate.is_high < extremRate.is_low` compare timestamps, meaning "high-extreme happened before low-extreme". This works but is confusing — `is_low` is actually `when_low_was_triggered`.

---

## 6. Period (Duration) Selection

### Dynamic Rate Table (`DR`)

Up to 3 entries from user config: `{rate, day, speed}`. The `speed` factor accelerates offer timeout for higher-rate/longer-period offers:

```js
speed = (day > 30) ? ((210 - day) / 360) : ((58 - day) / 56)
```

- 2-day period: speed = 1.0 (full waitTime)
- 30-day period: speed = 0.5 (half waitTime)
- 120-day period: speed = 0.25 (quarter waitTime)

`getDR(rate)` returns the first entry where `rate >= DR[i].rate` (sorted ascending by rate). If rate is below all thresholds, returns `false` → period defaults to 2 days.

### Issue P1: Speed Formula Discontinuity at Day 30

- Day 30: `(58 - 30) / 56 = 0.5`
- Day 31: `(210 - 31) / 360 = 0.497`

The two formulas meet smoothly at ~30 days, so no actual discontinuity. However the logic would be clearer with a single formula.

---

## 7. WebSocket Event Handling

### Offer Lifecycle Events

| Event | Handler | Action |
|-------|---------|--------|
| `funding_offer_update` | `makeOnFundingOfferUpdate` | Update amount/rate/period/status |
| `funding_offer_new` | `makeOnFundingOfferNew` | Add to `offer[id]` or update existing |
| `funding_offer_close` | `makeOnFundingOfferClose` | Splice from `offer[id]` or queue in `deleteOffer` |

### Issue W1: Update Handler Does Not Find Missing Offers

**Lines 549–560**: The update handler loops through existing offers. If the offer is not found (e.g., state was reset), it silently does nothing. The offer exists on Bitfinex but not in local state.

**Fix**: Add a push to `offer[id]` if not found:
```js
// After loop, if offer not found in local state:
if (!found) {
    offer[id][fo.symbol].push({ id: fo.id, amount: fo.amount, rate: fo.rate, ... });
}
```

### Issue W2: `UPDATE_ORDER` Throttle Drops Updates

**Lines 562–565**: Offer updates are only forwarded to UI if `> UPDATE_ORDER` (60s) have passed. Rapid offer changes within 60s are silently dropped from the UI. The state is still correct internally, but the user sees stale data.

**Severity**: Low — next update will refresh. But during volatile markets, 60s is a long time.

---

## 8. Summary of Issues

| # | Issue | Severity | Category |
|---|-------|----------|----------|
| R1 | `calOBRate` short array → undefined in finalRate map | Medium | Bug (accidental correctness) |
| R2 | `tenthRate` length assumption → possible undefined index | Medium | Bug |
| L1 | `risk--` post-decrement allows multiple `risk=0` | Low | Bug |
| L2 | Non-atomic balance check in submitOffer | Low | Race condition |
| L3 | `deleteOffer` array grows unbounded | Low | Memory leak |
| L4 | WS handlers can modify offer array during async iteration | Medium | Race condition |
| W1 | Update handler ignores unknown offers | Low | Missing state |
| W2 | 60s UI throttle drops rapid updates | Low | UX |
| E1 | `is_high`/`is_low` naming confusion (timestamps not booleans) | Low | Readability |
| P1 | Speed formula could be simplified | Low | Readability |

### Recommended Fixes (Priority Order)

1. **R1 + R2**: Pad `calOBRate` / `calTenthRate` output to guaranteed 11 elements
2. **L4**: Snapshot offer array before adjustment pipeline
3. **L3**: Cap `deleteOffer` array size
4. **W1**: Add missing offer to state on update
5. **L1**: Guard `risk[v.symbol]` to prevent multiple zero-risk offers
