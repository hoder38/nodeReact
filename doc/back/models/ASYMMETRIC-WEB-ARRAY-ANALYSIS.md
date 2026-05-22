# Asymmetric Web Array Analysis

## Current Symmetric Design

### Structure

`calStair` builds the web array with **3 up layers + mid + 3 down layers** using `NORMAL_DISTRIBUTION = [1, 2, 16, 50, 84, 98, 99]`:

```
Layer       │ nd[] indices │ σ range      │ Probability
────────────┼──────────────┼──────────────┼────────────
Up layer 3  │ nd[6]–nd[5]  │ +2σ → +3σ   │ 2.15%
Up layer 2  │ nd[5]–nd[4]  │ +1σ → +2σ   │ 13.59%
Up layer 1  │ nd[4]–nd[3]  │ mid → +1σ   │ 34.13%
────────────┼──────────────┼──────────────┼────────────
Mid         │ nd[3]        │ 50th %ile    │ —
────────────┼──────────────┼──────────────┼────────────
Down layer 1│ nd[3]–nd[2]  │ mid → -1σ   │ 34.13%
Down layer 2│ nd[2]–nd[1]  │ -1σ → -2σ   │ 13.59%
Down layer 3│ nd[1]–nd[0]  │ -2σ → -3σ   │ 2.15%
```

### How `stockProcess` Consumes It

Two counters traverse the web array:

- **bP** starts at 8 (bottom), decrements as price crosses each value going up
- **sP** starts at 0 (top), increments as price crosses each value going down

Trade signals depend on fixed boundary crossings:

| Check      | Signal      | Position |
|------------|-------------|----------|
| `bP > 6`   | Buy 3/4     | Below -2σ |
| `bP > 5`   | Buy 1/2     | Below -1σ |
| `bP > 4`   | Buy 1/4     | Below mid |
| `sP < 2`   | Sell 3/4    | Above +2σ |
| `sP < 3`   | Sell 1/2    | Above +1σ |
| `sP < 4`   | Sell 1/4    | Above mid |

The negative markers (σ boundaries) partition the array into 7 segments. Each boundary crossing changes bP/sP by one position. **These threshold values (6, 5, 4, 2, 3, 4) are hardcoded and assume exactly 7 boundaries (3 up + mid + 3 down).**

---

## Asymmetric Proposal

Make up-sigma and down-sigma different lengths, e.g.:
- 4 up layers (tighter sell-side granularity)
- 2 down layers (wider buy-side spread)
- Or vice versa

### Pros

1. **Market-adapted positioning**: Financial returns are negatively skewed — sharp drops are rarer but larger than gradual rises. More down layers let you buy at finer granularity during crashes, while fewer up layers sell faster during rallies.

2. **Strategy flexibility**: Different assets have different volatility profiles. Crypto has sharper upside moves; stocks crash harder. Asymmetric layers let you tune per-asset.

3. **Better capital allocation**: If upside probability > downside per σ (e.g., trending market), you want fewer sell layers (take profit faster) and more buy layers (scale in slowly on dips).

4. **Finer dead-zone tuning**: With more layers on one side, the 3×fee dead zone can be per-side, giving tighter zone where volatility is lower.

### Cons

1. **`stockProcess` hardcoded thresholds break**: The `bP > 6/5/4` and `sP < 2/3/4` thresholds assume 7 boundaries. With 6 or 8 boundaries, these thresholds produce wrong signals. You'd need to dynamically compute thresholds from layer counts.

   **Effort**: Medium — change thresholds to `bP > (totalBoundaries - 2)/(totalBoundaries - 3)/(totalBoundaries - 4)` etc., or parameterize by layer count.

2. **`adjustWeb` assumes symmetric probability weights**: The `sigmaProbs` array `[34.13, 13.59, 2.15]` is applied symmetrically from `midIdx`. With asymmetric layers, the probability weights would need separate up/down arrays. Also, `maxAmount = webMid * (webArr.length - 1) / 3 * 2` — the divisor `3` and multiplier `2` assume 3 layers per side.

   **Effort**: Medium — rework `adjustWeb` to use layer-aware probability computation.

3. **`scaleWebArr` and `calcResetMid` are layer-count-agnostic**: These functions operate on the flat array with negative markers, so they'd work without change. ✅

4. **`resolveNewMidStack` is layer-count-agnostic**: Also operates on flat array. ✅

5. **`calStair` loop needs separate up/down configuration**: Currently uses symmetric `upLayers` / `downLayers` arrays built from mirrored `nd[]` indices. Would need separate constants or a configuration object.

   **Effort**: Low — just change the loop bounds.

6. **Backtest comparison becomes harder**: Changing the web structure means historical backtest results are no longer comparable. Need to re-run all backtests with the new structure.

7. **`NORMAL_DISTRIBUTION` percentiles need expansion**: Currently 7 values for 3+1+3 = 7 boundaries. Asymmetric (4 up + 2 down) would need, e.g., `[2, 16, 50, 75, 90, 97, 99]` — no longer symmetric around 50th percentile.

8. **Position control logic couples to layer count**: The `newMid` position control (`amount > orig 5/8` → buy half, `amount < orig 3/8` → sell half) is layer-count-independent (uses `orig` amount, not web structure). ✅

### Summary

| Component | Asymmetric-Compatible | Changes Needed |
|-----------|----------------------|----------------|
| `calStair` | ⚠️ Needs config change | Separate up/down layer counts |
| `stockProcess` | ❌ Hardcoded thresholds | Dynamic threshold computation |
| `adjustWeb` | ❌ Symmetric probabilities | Per-side probability weights |
| `scaleWebArr` | ✅ No change | — |
| `calcResetMid` | ✅ No change | — |
| `resolveNewMidStack` | ✅ No change | — |
| `NORMAL_DISTRIBUTION` | ⚠️ Symmetric percentiles | Asymmetric percentile list |
| Position control | ✅ No change | — |

---

## Recommendation

**Not recommended at this time.** The required changes to `stockProcess` thresholds and `adjustWeb` probability weights are significant and error-prone. The symmetric design works correctly and the graduated shift + newMid stack already handles directional bias adaptively.

If you do pursue it later:

1. **Start with configuration**: Add `UP_LAYERS = 3` and `DOWN_LAYERS = 3` constants. Keep them equal initially.
2. **Parameterize `stockProcess`**: Compute buy/sell thresholds from layer counts instead of hardcoding 6/5/4 and 2/3/4.
3. **Rework `adjustWeb`**: Use per-layer probability from `NORMAL_DISTRIBUTION` percentile differences instead of hardcoded `sigmaProbs`.
4. **Test with one asset first**: Run backtest with 4-up / 2-down on a trending crypto asset and compare metrics against symmetric.

The graduated shift mechanism (`newMid` stack with 1σ → 1.5σ → 2σ) already provides directional adaptation — it effectively creates "more layers" on the side where price is trending. Asymmetric arrays would be an additional tuning knob on top of this.
