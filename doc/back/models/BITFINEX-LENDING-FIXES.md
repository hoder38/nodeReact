# Bitfinex Lending Fixes & Improvement Advice

## Fixes Applied

### R1: `calOBRate` Short Array (Medium → Fixed)

**Problem**: Sparse order books produced fewer than 11 elements. `finalRate` map indexed `OBRate[k]` which was `undefined` for `k >= OBRate.length`. Worked by accident (`!OBRate[k]` is `true` for `undefined`).

**Fix**: Pad `calOBRate` output to 11 elements using the last known value:
```js
const fill = rate.length > 0 ? rate[rate.length - 1] : 0;
while (rate.length < 11) rate.push(fill);
```

### R2: `calTenthRate` Short Array (Medium → Fixed)

**Problem**: Sparse candle data → `weight[]` too sparse → percentile loop produces < 9 intermediate values. `maxRange[curType] = tenthRate[1] - tenthRate[9]` could index `undefined`.

**Fix**: Same padding approach as R1 — guaranteed 11 elements.

### L2: Non-Atomic Balance Check in `submitOffer` (Low → Fixed)

**Problem**: Each offer in the submission loop called `calKeepCash()` (REST) independently. Between check and `fo.submit()`, balance could change from concurrent WS events or other fills.

**Fix**: Single `calKeepCash()` call before the loop; track `submitAvailable` locally, decrement after each successful submit. Eliminates N-1 REST round-trips and prevents race between check and submit.

### L3: `deleteOffer` Unbounded Growth (Low → Fixed)

**Problem**: `deleteOffer` array only trimmed when `submitOffer` finds a match. If offers close without subsequent submissions, array grows indefinitely.

**Fix**: Cap at `OFFER_MAX * 5` (50 entries) in `makeOnFundingOfferClose`. Oldest entries trimmed first — they're the least likely to match a future submission.

### L4: WS Mutation During Offer Iteration (Medium → Fixed)

**Problem**: `adjustOffer()` iterated `offer[id][current.type]` directly. During the async `cancelOffer()` / `submitOffer()` phases, WS handlers could splice/push the same array.

**Fix**: Snapshot the array at the start of `adjustOffer`: `const offerSnapshot = [...offer[id][current.type]]`. The adjustment pipeline reads from the snapshot; mutations to the live array by WS handlers don't affect classification.

### E1: `is_low`/`is_high` Naming (Low → Fixed)

**Problem**: Fields named `is_low`/`is_high` suggest booleans, but they store Unix timestamps of when the extreme was triggered. Code like `is_high < is_low` compares timestamps ("high triggered before low").

**Fix**: Renamed to `lowTriggeredAt`/`highTriggeredAt` throughout source and tests (18 occurrences). Self-documenting: `highTriggeredAt < lowTriggeredAt` clearly means "high happened before low".

---

## Explanations

### W1: Why NOT Push Back Unknown Offers in `makeOnFundingOfferUpdate`

The update handler silently ignores offers not found in local state. The analysis suggested pushing unknown offers back. Here's why that's **risky**:

1. **Phantom offers**: If local state was reset (reconnect, `_resetState()`), the update handler would re-add offers that may have already been closed on Bitfinex. The next `adjustOffer` would try to manage them — potentially creating duplicate cancel requests.

2. **Missing fields**: WS `funding_offer_update` events may not carry all fields needed for proper management (e.g., `risk` is local-only, never from Bitfinex). Pushed-back offers would have `risk: undefined`, causing `adjustOffer` to treat them as "manual" and skip them forever.

3. **Double-push with `makeOnFundingOfferNew`**: Bitfinex often sends `new` + `update` in rapid succession. If `new` hasn't been processed yet (batched event queue), pushing in `update` creates a duplicate. The `new` handler then also pushes — two entries for one offer.

4. **`initialBookFn` is the correct recovery mechanism**: It does a full REST snapshot of all offers with proper risk assignment. If state is stale, the fix is to trigger `initialBookFn` (reset `updateTime.book = 0`), not to reconstruct state piecemeal from WS events.

**Verdict**: The current silent-skip behavior is correct. The real fix is ensuring `initialBookFn` runs after any reconnect, which it already does (the `close` handler calls `reconnect()` which re-triggers the auth → initialBook flow).

### L1: Why Multiple `risk = 0` Is Not a Critical Bug

In `initialBookFn`, `risk[v.symbol]--` (post-decrement) assigns descending risk: 10, 9, 8, ... 1. When `risk[v.symbol]` reaches 0, subsequent offers all get `risk = 0`.

Why this is **acceptable in practice**:

1. **`checkRisk(0, ...)` returns `false`**: Risk < 1 always returns false. So `risk = 0` offers never block other risk slots. They don't cause slot collisions.

2. **`finalRate[10 - 0] = finalRate[10]`**: This is the last element of the 11-element rate array — the lowest rate. Multiple offers at the lowest rate is a reasonable fallback for excess offers.

3. **`OFFER_MAX = RISK_MAX = 10`**: In practice, you never have more than 10 offers per currency. Risk starts at 10, decrements to 1 for the 10th offer. The 11th offer (risk = 0) can't happen unless `OFFER_MAX` is raised above `RISK_MAX`.

4. **`adjustOffer` re-assigns risk dynamically**: Even if `initialBookFn` assigns `risk = 0`, the next `singleLoan` cycle re-computes risk for each offer based on current state.

**Verdict**: Not a bug under current constants (`OFFER_MAX = RISK_MAX`). Would become a bug if `OFFER_MAX > RISK_MAX`. No fix needed unless those constants diverge.

---

## Improvement Suggestions

### 1. Rate Staleness Detection

**Current**: `calRate` runs on a fixed schedule. If the schedule is delayed (network, load), stale rates persist until next successful run. `adjustOffer` uses rates that may be minutes old.

**Improvement**: Add a `rateAge` check before `singleLoan`:
```js
const rateAge = now - currentRate[current.type].time;
if (rateAge > RATE_STALENESS_THRESHOLD) {
    console.log(`Skipping ${current.type}: rate ${rateAge}s old`);
    return Promise.resolve();
}
```

**Pros**:
- Prevents submitting offers at stale rates during API outages
- Avoids placing offers far from market during volatile periods
- Simple to implement — just one timestamp check
- Configurable threshold per currency

### 2. Offer Amount Splitting for Large Balances

**Current**: Each offer uses `current.amountLimit` as a fixed size. For large balances, this creates many small offers that all compete at different rate tiers.

**Improvement**: Scale offer size with available balance:
```js
const scaledAmount = Math.min(
    current.amountLimit * Math.ceil(keep_available / (current.amountLimit * OFFER_MAX)),
    keep_available / 2
);
```

**Pros**:
- Fewer, larger offers → less API traffic (fewer submits/cancels)
- Larger offers fill faster (more attractive to borrowers)
- Reduces the number of active offers to manage
- Better utilization of rate tiers (each tier has meaningful volume)

### 3. Graduated KAM (Keep Amount Money)

**Current**: KAM is a binary switch — first N offers use `MR2` rate floor, rest use `MR`. This creates a sharp discontinuity.

**Improvement**: Graduated rate floors based on remaining KAM balance:
```js
const kamRatio = Math.max(0, KAM / originalKAM);
const gradedFloor = MR + (MR2 - MR) * kamRatio;
```

**Pros**:
- Smooth transition from conservative (MR2) to aggressive (MR) rates
- Better price discovery — no sudden rate cliff at KAM boundary
- More capital deployed at intermediate rates instead of binary high/low
- Self-adjusting: as KAM fills, rates naturally approach market

### 4. Exponential Backoff for Cancel Errors

**Current**: `cancelOffer` catches errors, splices the offer from state, and continues with a fixed `API_WAIT` delay. Repeated failures hit the API at the same rate.

**Improvement**: Exponential backoff on consecutive cancel failures:
```js
let cancelRetries = 0;
try {
    await userRest.cancelFundingOffer(id);
    cancelRetries = 0;
} catch (err) {
    cancelRetries++;
    const backoff = API_WAIT * Math.pow(2, Math.min(cancelRetries, 5));
    await new Promise(r => setTimeout(r, backoff * 1000));
}
```

**Pros**:
- Reduces API pressure during outages/rate-limits
- Prevents cascading failures when Bitfinex is degraded
- Self-healing: backs off during issues, recovers quickly when resolved
- Bounded by max 5 doublings (160s max delay)

### 5. Merge Offer Rate Tolerance

**Current**: `mergeOffer` matches on exact rate bucket (`ceil(rate/BITFINEX_MIN)`). A 1-unit rate difference causes a cancel+resubmit cycle.

**Improvement**: Add tolerance for near-matches:
```js
const rateDiff = Math.abs(rate - needDelete[i].rate);
if (rateDiff <= BITFINEX_MIN * 2 && amount === needDelete[i].amount) {
    return i; // close enough, skip cancel+resubmit
}
```

**Pros**:
- Fewer unnecessary cancel+submit cycles (saves 2 API calls each)
- Reduces offer churn during small rate fluctuations
- Lower latency — existing offer keeps earning while market oscillates
- Configurable tolerance via multiplier

### 6. Credit Duration Analytics

**Current**: `getDR` maps rate → period using fixed thresholds. No feedback from actual credit performance.

**Improvement**: Track actual credit fill rates per duration tier:
```js
// On credit fill:
creditStats[current.type][period] = {
    count: (creditStats[current.type][period]?.count || 0) + 1,
    avgRate: runningAvg,
    avgFillTime: runningAvg,
};
```

**Pros**:
- Data-driven period selection instead of fixed thresholds
- Identifies which durations are most profitable per currency
- Can auto-adjust `DR` entries based on market conditions
- Enables backtesting lending strategies against historical fills
