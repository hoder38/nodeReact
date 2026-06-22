# shioaji-tool.js — Technical Documentation & QA Testing Strategy

> **Module**: `src/back/models/shioaji-tool.js`
> **Role**: Taiwan Stock Exchange (TWSE) real-time trading via Shioaji Python bridge
> **Priority**: 🟡 High (External API Integration — Financial Operations)
> **Standards**: Follows [OUTLINE.md §11 — QA Testing Scope & Strategy](../../OUTLINE.md)

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Module-Level State](#2-module-level-state)
3. [Function: `twseShioajiInit`](#3-function-twseshioajiinit)
4. [Function: `getShioajiData`](#4-function-getshioajidata)
5. [Function: `submitShioajiOrder`](#5-function-submitshioajiorder)
6. [Function: `sellallShioajiOrder`](#6-function-sellallshioajiorder)
7. [Function: `getTwsePosition`](#7-function-gettwseposition)
8. [Function: `getTwseOrder`](#8-function-gettwseorder)
9. [Function: `resetShioaji`](#9-function-resetshioaji)
10. [Cross-Cutting Test Concerns](#10-cross-cutting-test-concerns)
11. [Suggested Mock Strategy](#11-suggested-mock-strategy)

---

## 1. Module Overview

### Dependencies

| Dependency | Type | Usage |
|---|---|---|
| `ver.js` | Config secrets | `SHIOAJI_APIKEY`, `SHIOAJI_APISECRET`, `SHIOAJI_CA`, `SHIOAJI_CAPW` |
| `constants.js` | App constants | `TRADE_FEE`, `UPDATE_ORDER`, `TOTALDB`, `RANGE_INTERVAL`, `TWSE_ORDER_INTERVAL`, `TWSE_MARKET_TIME`, `PRICE_INTERVAL`, `API_WAIT`, `TWSE_ENTER_MID` |
| `child_process` | Node built-in | Spawns Python script `util/twse.py` |
| `stock-tool.js` | Internal model | `getSuggestionData('twse')` for live price suggestions |
| `utility.js` | Internal util | `handleError()`, `HoError` |
| `mongo-tool.js` | Internal model | MongoDB CRUD wrapper |
| `logger.js` | Internal util | Structured logging via pino (`createLogger('shioaji')`) |

### Exports

| Export | Type | Visibility |
|---|---|---|
| `twseShioajiInit` | `function` | Public (named export) |
| `getTwsePosition` | `function` | Public (named export) |
| `getTwseOrder` | `function` | Public (named export) |
| `resetShioaji` | `function` | Public (named export) |

### Internal (Non-Exported) Functions

| Function | Scope |
|---|---|
| `getShioajiData` | Module-private |
| `submitShioajiOrder` | Module-private |
| `sellallShioajiOrder` | Module-private |

---

## 2. Module-Level State

The module maintains mutable singleton state across invocations:

```js
let updateTime = { book: 0, trade: 0 };  // Timestamps for throttling
let available = 0;                         // Available cash balance
let order = [];                            // Current open orders
let position = [];                         // Current held positions
let fakeOrder = [];                        // Simulated/odd-lot orders
```

### Snapshot Testing Data

```json
{
  "updateTime": { "book": 1710000000, "trade": 42 },
  "available": 500000,
  "order": [
    { "symbol": "2330", "price": 580, "amount": 1, "type": "Buy" }
  ],
  "position": [
    { "symbol": "2330", "amount": 2, "price": 575.5 },
    { "symbol": "2317", "amount": 1, "price": 105.0 }
  ],
  "fakeOrder": [
    { "type": "buy", "time": 1710000100, "price": 570, "symbol": "2330", "done": false }
  ]
}
```

### State-Related Test Scenarios

| # | Scenario | Expected |
|---|----------|----------|
| S-1 | Module loads for the first time | `updateTime = {book:0, trade:0}`, `available = 0`, all arrays empty |
| S-2 | State persists between `twseShioajiInit()` calls | `updateTime.trade` increments, `position`/`order` retain previous values |
| S-3 | `resetShioaji()` called | `updateTime.book` resets to 0, `trade` preserves count, arrays cleared |
| S-4 | Concurrent calls sharing module state | Race condition risk on `fakeOrder`/`position` — verify sequential safety |

---

## 3. Function: `twseShioajiInit`

### Purpose

Main orchestrator for the TWSE trading cycle. Called on a recurring timer (every ~600s per OUTLINE.md §9). Performs two phases:

1. **Phase 1 (initialBook)**: Fetch latest Shioaji data, process filled orders, update MongoDB portfolio records.
2. **Phase 2 (Trade Evaluation)**: On a modulo-based interval, evaluate all TWSE portfolio items for new buy/sell submissions.

### Invocation & Authentication

```js
// Signature
export const twseShioajiInit = () => Promise<void>

// No parameters — uses module-level state and constants
// Authentication: Delegates to getShioajiData / submitShioajiOrder (API key-based)
```

### Logic Flow

```
twseShioajiInit()
│
├─ initialBook(force=false)
│  ├─ Check: (now - updateTime.book) > UPDATE_ORDER ?
│  │  ├─ NO → resolve immediately ("Shioaji no new")
│  │  └─ YES → updateTime.book = now
│  │     ├─ getShioajiData(false) → parse available, position, order, fill_order
│  │     │  └─ ON ERROR:
│  │     │     ├─ If force === true → decrement updateTime.trade (floor 0)
│  │     │     └─ handleError(HoError)
│  │     │
│  │     ├─ Process fakeOrder array:
│  │     │  ├─ For each fakeOrder entry where !o.done:
│  │     │  │  ├─ type='buy' AND suggestion.price <= o.price → mark done, push to fill_order
│  │     │  │  └─ type='sell' AND suggestion.price >= o.price → mark done, push to fill_order
│  │     │  └─ Skip entries where o.done === true
│  │     │
│  │     └─ fill_order_recur(0) — recursive MongoDB update:
│  │        ├─ Base: index >= fill_order.length → resolve
│  │        ├─ Skip: o.price <= 0 → recurse(index+1)
│  │        ├─ Mongo.find(TOTALDB, {setype:'twse', index: o.symbol})
│  │        │  ├─ No match → log "miss {symbol}", recurse(index+1)
│  │        │  └─ Match found → process by o.type:
│  │        │     │
│  │        │     ├─ Buy:
│  │        │     │  ├─ Duplicate check (time+price match) → skip
│  │        │     │  ├─ Insert into item.previous.buy (sorted by price ASC)
│  │        │     │  ├─ Time check: (starttime + TWSE_ORDER_INTERVAL) >= now?
│  │        │     │  │  ├─ YES + fake → set previous with tprice logic
│  │        │     │  │  ├─ YES + real → set previous with o.time
│  │        │     │  │  └─ NO → "out of time", filter buy array only
│  │        │     │  └─ Filter buy[] by RANGE_INTERVAL
│  │        │     │
│  │        │     └─ Sell:
│  │        │        ├─ Duplicate check → skip
│  │        │        ├─ Insert into item.previous.sell (sorted by price DESC)
│  │        │        ├─ Time check (same as Buy)
│  │        │        ├─ Profit calculation (real orders only, position change):
│  │        │        │  ├─ Parse o.profit ('p'-delimited) and o.ptime ('t'-delimited)
│  │        │        │  ├─ Walk sell history backward, accumulate profit * (1 - TRADE_FEE)
│  │        │        │  ├─ Apply position delta: profit = profit - pp + cp
│  │        │        │  └─ Skip if position amounts are equal (peq)
│  │        │        └─ Filter sell[] by RANGE_INTERVAL
│  │        │
│  │        └─ Mongo.update(TOTALDB): set previous, profit, quantity fields
│  │           ├─ o has 'quantity' → bquantity (Buy) or squantity (Sell)
│  │           └─ o has no 'quantity' → boddquantity (Buy) or soddquantity (Sell)
│  │
│  └─ After initialBook resolves:
│     ├─ updateTime.trade++
│     ├─ Modulo check: trade % (ceil(TWSE_ORDER_INTERVAL/PRICE_INTERVAL) - 3) !== 3 → resolve
│     └─ Market hours guard:
│        ├─ TWSE_MARKET_TIME[0] > [1] (overnight): skip if hour >= [0] OR hour < [1]
│        └─ Normal: skip if hour >= [0] AND hour < [1]
│
├─ Phase 2: Trade Evaluation (when modulo + market hours pass)
│  ├─ Mongo.find(TOTALDB, {setype:'twse', sType:{$exists:false}})
│  ├─ recur_status(0):
│  │  ├─ Skip: item.index === 0 OR no suggestion data
│  │  ├─ Apply market cap multiplier (item.mul): adjust orig & times
│  │  ├─ Branch on item.ing:
│  │  │  ├─ ing === 2 (Delete):
│  │  │  │  ├─ sellallShioajiOrder(item.index)
│  │  │  │  ├─ Wait API_WAIT * 2000 ms
│  │  │  │  └─ Mongo.deleteMany(TOTALDB, {_id})
│  │  │  ├─ ing === 1 (Active):
│  │  │  │  ├─ price exists → startStatus()
│  │  │  │  └─ no price → skip
│  │  │  └─ ing === 0 (New/Pending):
│  │  │     ├─ (price - item.mid) / item.mid * 100 < TWSE_ENTER_MID → activate (set ing=1), startStatus()
│  │  │     └─ Above threshold → skip ("enter_mid")
│  │  │
│  │  └─ startStatus():
│  │     ├─ isSubmit = true
│  │     └─ Insert {item, suggestion} into newOrder[] (sorted by amount DESC)
│  │
│  └─ submitTwseOrder():
│     ├─ isSubmit === true → submitShioajiOrder(newOrder, false)
│     └─ isSubmit === false → resolve
```

### Returns & Side Effects

| Aspect | Detail |
|---|---|
| **Returns** | `Promise<void>` |
| **DB Reads** | `Mongo('find', TOTALDB, ...)` — reads portfolio items |
| **DB Writes** | `Mongo('update', TOTALDB, ...)` — updates `previous`, `profit`, quantity fields |
| **DB Deletes** | `Mongo('deleteMany', TOTALDB, ...)` — removes items with `ing === 2` |
| **Module State** | Mutates `updateTime`, `available`, `order`, `position`, `fakeOrder` |
| **External Call** | Spawns `twse.py` via `child_process.exec` |
| **Console Output** | Extensive logging throughout |

### Snapshot Testing Data

**fill_order entry (real):**
```json
{
  "price": 580.0,
  "time": 1710000100,
  "symbol": "2330",
  "starttime": 1710000050,
  "type": "Buy",
  "quantity": 1000,
  "profit": "100p200p",
  "ptime": "1710000000t1710000050t"
}
```

**fill_order entry (fake):**
```json
{
  "price": 570.0,
  "time": 1710000100,
  "symbol": "2330",
  "starttime": 1710000100,
  "type": "Buy",
  "fake": true
}
```

**TOTALDB document (MongoDB):**
```json
{
  "_id": "ObjectId(...)",
  "setype": "twse",
  "index": "2330",
  "ing": 1,
  "mid": 550.0,
  "orig": 1000,
  "times": 2,
  "amount": 2,
  "mul": 1.5,
  "profit": 3200.5,
  "previous": {
    "price": 575.0,
    "time": 1710000000,
    "type": "buy",
    "buy": [
      { "price": 570.0, "time": 1709999000 },
      { "price": 575.0, "time": 1710000000 }
    ],
    "sell": [
      { "price": 590.0, "time": 1709998000 }
    ]
  },
  "bquantity": 1000,
  "squantity": 500,
  "boddquantity": 50,
  "soddquantity": 30
}
```

### Comprehensive Test Scenarios (100% Coverage)

#### Phase 1 — initialBook

| # | Scenario | Branch/Condition | Expected |
|---|----------|-----------------|----------|
| T1-01 | Throttle: time since last book < `UPDATE_ORDER` | `(now - updateTime.book) <= UPDATE_ORDER` | Resolve immediately, no API call |
| T1-02 | Throttle: time since last book ≥ `UPDATE_ORDER` | `(now - updateTime.book) > UPDATE_ORDER` | Call `getShioajiData`, update `updateTime.book` |
| T1-03 | Throttle: first ever call (`updateTime.book === 0`) | `now - 0 > UPDATE_ORDER` (always true for non-zero now) | Always proceeds |
| T1-04 | `getShioajiData` rejects with error, `force=false` | Error path, `force !== true` | `handleError(HoError)` called, `updateTime.trade` unchanged |
| T1-05 | `getShioajiData` rejects with error, `force=true` | Error path, `force === true` | `updateTime.trade` decremented (floor 0) |
| T1-06 | `getShioajiData` rejects, `updateTime.trade` already 0, `force=true` | `updateTime.trade < 1` guard | `updateTime.trade` stays 0 (not negative) |

#### Phase 1 — fakeOrder Processing

| # | Scenario | Branch/Condition | Expected |
|---|----------|-----------------|----------|
| T1-07 | fakeOrder empty | `fakeOrder.length === 0` | No entries pushed to `fill_order` |
| T1-08 | fakeOrder buy, `!o.done`, price condition met | `suggestion.price <= o.price` | `o.done = true`, entry pushed with `type:'Buy'`, `fake:true` |
| T1-09 | fakeOrder buy, `!o.done`, price condition NOT met | `suggestion.price > o.price` | Entry not pushed, `o.done` stays false |
| T1-10 | fakeOrder sell, `!o.done`, price condition met | `suggestion.price >= o.price` | `o.done = true`, entry pushed with `type:'Sell'`, `fake:true` |
| T1-11 | fakeOrder sell, `!o.done`, price condition NOT met | `suggestion.price < o.price` | Entry not pushed |
| T1-12 | fakeOrder entry already done (`o.done === true`) | First `!o.done` check | Skipped entirely |
| T1-13 | fakeOrder: suggestion has no price (`price === 0` or undefined) | `twseSuggestion[o.symbol].price` falsy | Condition fails, entry not pushed |
| T1-14 | fakeOrder: symbol not in suggestion data | `twseSuggestion[o.symbol]` undefined | TypeError thrown — edge case to verify |

#### Phase 1 — fill_order_recur

| # | Scenario | Branch/Condition | Expected |
|---|----------|-----------------|----------|
| T1-15 | fill_order array empty | `index >= ret.fill_order.length` at start | Resolve immediately |
| T1-16 | fill_order entry with `price <= 0` | `o.price <= 0` | Skip to next, no DB call |
| T1-17 | fill_order entry with `price = 0` exactly | Boundary: `o.price <= 0` | Skip (boundary confirmed) |
| T1-18 | fill_order entry with `price = 0.01` | Boundary: `o.price > 0` | Processed normally |
| T1-19 | No matching TOTALDB document | `items.length < 1` | Log "miss", skip to next |
| T1-20 | Buy order: duplicate (same time + price exists) | `buy[k].time === o.time && buy[k].price === o.price` | Log "s order duplicate", skip |
| T1-21 | Buy order: inserted in sorted position (mid-array) | `o.price < buy[k].price` | Splice at position k |
| T1-22 | Buy order: appended (highest price) | Loop completes without insert | Push to end of buy array |
| T1-23 | Buy order: within time window, real | `(starttime + TWSE_ORDER_INTERVAL) >= now`, `!o.fake` | `previous.price = o.price`, `previous.time = o.time`, `type = 'buy'` |
| T1-24 | Buy order: within time window, fake | `(starttime + TWSE_ORDER_INTERVAL) >= now`, `o.fake` | `tprice` set conditionally, `time = item.previous.time` (preserved) |
| T1-25 | Buy order: fake, `previous.tprice` is truthy | `item.previous.tprice ? 0 : item.previous.price` | `tprice = 0` |
| T1-26 | Buy order: fake, `previous.tprice` is falsy | Same ternary | `tprice = item.previous.price` |
| T1-27 | Buy order: out of time window | `(starttime + TWSE_ORDER_INTERVAL) < now` | Only filter buy array, do not update previous type/price |
| T1-28 | Buy order: RANGE_INTERVAL filter removes old entries | `o.time - v.time >= RANGE_INTERVAL` | Old buy entries removed |
| T1-29 | Sell order: duplicate (same time + price) | Same as T1-20 but for sell | Log "s order duplicate", skip |
| T1-30 | Sell order: inserted in sorted position (DESC) | `o.price > sell[k].price` | Splice at position k |
| T1-31 | Sell order: appended (lowest price) | Loop completes | Push to end of sell array |
| T1-32 | Sell order: within time window, real | Same time check | `previous` updated with sell type |
| T1-33 | Sell order: within time window, fake | Same + `o.fake` | `tprice` logic applied |
| T1-34 | Sell order: out of time window | Expired | Only filter sell array |

#### Phase 1 — Profit Calculation (Sell Orders Only)

| # | Scenario | Branch/Condition | Expected |
|---|----------|-----------------|----------|
| T1-35 | Sell: fake order | `o.fake` | Profit calculation skipped entirely |
| T1-36 | Sell: real, `ret.position` empty | `ret.position.length === 0` | Profit calculation skipped |
| T1-37 | Sell: real, symbol not in `ret.position` | No match in loop | `pp === 0`, profit calculation skipped |
| T1-38 | Sell: real, symbol found, amounts equal (`peq=true`) | `pa === position[i].amount` | `profit` stays 0 |
| T1-39 | Sell: real, symbol found, amounts differ | `pa !== position[i].amount` | Parse `o.profit`/`o.ptime`, compute profit |
| T1-40 | Sell: profit string with single entry | `"100p"` → `["100"]` | One iteration, `profit = 100 * (1 - TRADE_FEE) - pp + cp` |
| T1-41 | Sell: profit string with multiple entries | `"100p200p300p"` | Walks backward, accumulates until `is_insert >= 2` |
| T1-42 | Sell: profit/ptime entries share same time | `Number(this_time[i-1]) === t` | Inner while loop processes consecutive same-time entries |
| T1-43 | Sell: `is_insert` reaches 2 (sell time match) | `item.previous.sell[k].time === t` found twice | Breaks out of outer loop |
| T1-44 | Sell: symbol not in cached `position[]` | Not found in old position | `cp = 0`, `peq` stays false |
| T1-45 | Profit accumulation on existing `item.profit` | `item.profit` is truthy | `item.profit += profit` |
| T1-46 | Profit accumulation, `item.profit` is 0/falsy | `item.profit` is falsy | `item.profit = profit` |

#### Phase 1 — MongoDB Update (fill_order_recur tail)

| # | Scenario | Branch/Condition | Expected |
|---|----------|-----------------|----------|
| T1-47 | Buy order with `quantity` property | `o.hasOwnProperty("quantity")` + Buy | `$set` includes `bquantity` |
| T1-48 | Sell order with `quantity` property | `o.hasOwnProperty("quantity")` + Sell | `$set` includes `squantity` |
| T1-49 | Buy order without `quantity` (odd lot) | No `quantity` + Buy | `$set` includes `boddquantity` |
| T1-50 | Sell order without `quantity` (odd lot) | No `quantity` + Sell | `$set` includes `soddquantity` |
| T1-51 | Multiple fill_orders processed in sequence | Recursive chain | Each DB update completes before next |

#### Phase 2 — Trade Counter & Market Hours

| # | Scenario | Branch/Condition | Expected |
|---|----------|-----------------|----------|
| T2-01 | `updateTime.trade` modulo does NOT equal 3 | Modulo check fails | Resolve early, no trade evaluation |
| T2-02 | `updateTime.trade` modulo equals 3 | Modulo check passes | Proceed to market hours check |
| T2-03 | Market hours: overnight wrap (`[0] > [1]`), currently within market | `hour >= TWSE_MARKET_TIME[0] \|\| hour < TWSE_MARKET_TIME[1]` | Decrement trade (floor 0), resolve |
| T2-04 | Market hours: overnight wrap, outside market | Complement of T2-03 | Proceed to trade evaluation |
| T2-05 | Market hours: normal (`[0] <= [1]`), within market | `hour >= [0] && hour < [1]` | Decrement trade, resolve |
| T2-06 | Market hours: normal, outside market | Complement of T2-05 | Proceed |
| T2-07 | Market hours: boundary — hour exactly equals `[0]` | `hour >= [0]` true | Within market hours |
| T2-08 | Market hours: boundary — hour exactly equals `[1]` | `hour < [1]` false | Outside market hours |
| T2-09 | Trade decrement when `updateTime.trade < 1` | Floor guard | Stays 0, never negative |

#### Phase 2 — recur_status (Trade Evaluation)

| # | Scenario | Branch/Condition | Expected |
|---|----------|-----------------|----------|
| T2-10 | No TOTALDB items returned | `items.length === 0` | `recur_status` resolves, `isSubmit` stays false |
| T2-11 | Item with `index === 0` | `item.index === 0` | Skip to next item |
| T2-12 | Item with no suggestion data | `!twseSuggestion[item.index]` | Skip to next item |
| T2-13 | Item with `mul` multiplier | `item.mul` truthy | `item.orig *= mul`, `item.times = floor(times * mul)` |
| T2-14 | Item without `mul` multiplier | `item.mul` falsy | `orig`/`times` unchanged |
| T2-15 | `ing === 2` (Delete): sellall succeeds | Normal path | `sellallShioajiOrder` → wait → `deleteMany` |
| T2-16 | `ing === 2` (Delete): sellall fails | Error from `sellallShioajiOrder` | Trade decremented, `handleError` called |
| T2-17 | `ing === 1` (Active): price exists | `price` truthy | `startStatus()` called, item added to `newOrder` |
| T2-18 | `ing === 1` (Active): price is 0/falsy | `!price` | Skip to next item |
| T2-19 | `ing === 0` (New): below entry threshold | `(price - mid) / mid * 100 < TWSE_ENTER_MID` | Set `ing = 1` via Mongo.update, then startStatus |
| T2-20 | `ing === 0` (New): above entry threshold | `>= TWSE_ENTER_MID` | Log "enter_mid", skip |
| T2-21 | `ing === 0`: activated but price is 0/falsy | After `ing` update, `!price` | Skip (don't call startStatus) |
| T2-22 | `ing === 0`: negative `mid` value | Division result changes sign | Verify threshold comparison with negative mid |
| T2-23 | `ing === 0`: `mid === 0` | Division by zero → `Infinity` | `Infinity < TWSE_ENTER_MID` is false → skip |

#### Phase 2 — startStatus & newOrder Sorting

| # | Scenario | Branch/Condition | Expected |
|---|----------|-----------------|----------|
| T2-24 | First item added to empty `newOrder` | `newOrder.length === 0`, `!is_insert` | Push to array |
| T2-25 | Item with highest amount (inserted first) | `item.amount > newOrder[0].item.amount` | Splice at index 0 |
| T2-26 | Item with lowest amount | Loop completes | Push to end |
| T2-27 | No suggestion for item in `startStatus` | `!twseSuggestion[item.index]` | Not added to `newOrder` |
| T2-28 | Suggestion exists | Truthy | Added to `newOrder` with `{item, suggestion}` |

#### Phase 2 — submitTwseOrder

| # | Scenario | Branch/Condition | Expected |
|---|----------|-----------------|----------|
| T2-29 | `isSubmit === false` (no eligible items) | No `startStatus` called | Resolve without API call |
| T2-30 | `isSubmit === true`, submit succeeds | Normal path | `submitShioajiOrder(newOrder, false)` called |
| T2-31 | `isSubmit === true`, submit fails | Error from submit | Trade decremented, `handleError` |

---

## 4. Function: `getShioajiData`

### Purpose

Fetches real-time account data (available balance, positions, orders, filled orders) from the Shioaji Python bridge by executing `twse.py` as a child process.

### Invocation & Authentication

```js
// Signature (module-private)
const getShioajiData = (simulation = true) => Promise<{ position: Array, fill_order: Array }>

// Parameters:
//   simulation: boolean (default true)
//     true  → uses paper-trading credentials (PAPIUSER02 / 2222)
//     false → uses real credentials (SHIOAJI_APIKEY / SHIOAJI_APISECRET)
```

### Logic Flow

```
getShioajiData(simulation)
│
├─ Resolve credentials:
│  ├─ simulation=true  → id='PAPIUSER02', pw='2222'
│  └─ simulation=false → id=SHIOAJI_APIKEY, pw=SHIOAJI_APISECRET
│
├─ Child_process.exec('util/twse.py {id} {pw}')
│  ├─ ON ERROR → reject(err)
│  └─ ON SUCCESS → parse output by newline
│
├─ Parse output (state machine):
│  ├─ State 0: Scan for 'start result' marker
│  ├─ State 1: Parse available balance
│  │  ├─ 'same' → keep current `available` value
│  │  └─ Numeric → set module-level `available = Number(result[i])`
│  ├─ State 2: Parse position JSON
│  │  ├─ Save current `position` as `ret.position` (old snapshot)
│  │  └─ Update module-level `position = JSON.parse(result[i])`
│  ├─ State 3: Parse order JSON → update module-level `order`
│  └─ State 4: Parse fill_order JSON → `ret.fill_order`, break
│
└─ Return { position: <old_position>, fill_order: <parsed> }
```

### Returns & Side Effects

| Aspect | Detail |
|---|---|
| **Returns** | `Promise<{ position: Array, fill_order: Array }>` |
| **Module State** | Updates `available`, `position`, `order` |
| **External Call** | Spawns `util/twse.py` process |
| **Note** | `ret.position` contains the *previous* position snapshot (before update) |

### Snapshot Testing Data

**Python bridge output (success):**
```
Connection established
Login successful
start result
500000
[{"symbol":"2330","amount":2,"price":575.5}]
[{"symbol":"2330","type":"Buy","price":580}]
[{"price":580,"time":1710000100,"symbol":"2330","starttime":1710000050,"type":"Buy","quantity":1000}]
```

**Python bridge output (balance unchanged):**
```
start result
same
[{"symbol":"2330","amount":2,"price":575.5}]
[]
[]
```

### Comprehensive Test Scenarios (100% Coverage)

| # | Scenario | Branch/Condition | Expected |
|---|----------|-----------------|----------|
| G-01 | Simulation mode credentials | `simulation=true` | Uses `PAPIUSER02`/`2222` |
| G-02 | Real mode credentials | `simulation=false` | Uses `SHIOAJI_APIKEY`/`SHIOAJI_APISECRET` |
| G-03 | Default parameter | Called with no args | `simulation` defaults to `true` |
| G-04 | Python script execution error | `exec` returns error | Promise rejects with error |
| G-05 | Output has no 'start result' marker | Malformed output | `ret` is empty object, no state updates |
| G-06 | Available is 'same' | `result[i] === 'same'` | Module `available` unchanged |
| G-07 | Available is a number string | `result[i]` is numeric | `available` set to parsed number |
| G-08 | Available is '0' | Edge case | `available = 0` |
| G-09 | Available is negative string | `"-5000"` | `available = -5000` (no guard) |
| G-10 | Position JSON parse error | Invalid JSON | `JSON.parse` throws — unhandled |
| G-11 | Order JSON parse error | Invalid JSON | `JSON.parse` throws — unhandled |
| G-12 | Fill order JSON parse error | Invalid JSON | `JSON.parse` throws — unhandled |
| G-13 | Empty arrays in output | `[]` for positions/orders/fill_order | Module state set to empty arrays |
| G-14 | Previous position preserved in return | `ret.position` | Contains spread of *old* `position` before overwrite |
| G-15 | Output with extra lines before 'start result' | Preamble text | Parser ignores lines until marker |
| G-16 | Output with extra lines after fill_order | Trailing lines | `break` exits after state 4, ignored |
| G-17 | Output truncated (missing state 4 data) | Only 3 data lines | `ret.fill_order` undefined |

---

## 5. Function: `submitShioajiOrder`

### Purpose

Submits buy/sell orders for multiple stock symbols to the Shioaji API via the Python bridge. Also manages the `fakeOrder` array for odd-lot / simulated orders that cannot go through the real API.

### Invocation & Authentication

```js
// Signature (module-private)
const submitShioajiOrder = (submitList, simulation = true) => Promise<void>

// Parameters:
//   submitList: Array<{ item: { index: string }, suggestion: { bCount?, buy?, sCount?, sell? } }>
//   simulation: boolean (default true)
//     true  → paper-trading credentials + dummy CA
//     false → real credentials (APIKEY, APISECRET, CA, CAPW)
```

### Logic Flow

```
submitShioajiOrder(submitList, simulation)
│
├─ Reset: fakeOrder = []
│
├─ Build command-line list string:
│  └─ For each item in submitList:
│     ├─ Append ' {symbol}='
│     ├─ Buy side:
│     │  ├─ bCount exists → append 'buy{bCount}={buy}'
│     │  └─ bCount absent BUT buy exists → push to fakeOrder (type:'buy')
│     ├─ Sell side:
│     │  ├─ sCount exists → append 'sell{sCount}={sell}'
│     │  └─ sCount absent BUT sell exists → push to fakeOrder (type:'sell')
│     └─ Neither → no append for that side
│
├─ Resolve credentials (simulation vs real, includes CA/CAPW)
│
├─ Child_process.exec('twse.py {id} {pw} submit {ca} {capw} {TRADE_FEE} {list}')
│  ├─ ON ERROR → reject(err)
│  └─ ON SUCCESS → log output
│
└─ Return Promise<void>
```

### Returns & Side Effects

| Aspect | Detail |
|---|---|
| **Returns** | `Promise<void>` (output logged only) |
| **Module State** | Resets and populates `fakeOrder[]` |
| **External Call** | Spawns `twse.py submit ...` process |
| **Security** | Passes API secrets as CLI arguments (visible in process list) |

### Snapshot Testing Data

**submitList input:**
```json
[
  {
    "item": { "index": "2330", "amount": 5 },
    "suggestion": { "bCount": 1000, "buy": 575.0, "sCount": 500, "sell": 590.0 }
  },
  {
    "item": { "index": "2317", "amount": 2 },
    "suggestion": { "buy": 105.0, "sell": 110.0 }
  }
]
```

**Generated CLI list string:**
```
 2330=buy1000=575sell500=590 2317=
```

**Resulting fakeOrder (for item 2317 with no bCount/sCount):**
```json
[
  { "type": "buy", "time": 1710000200, "price": 105.0, "symbol": "2317" },
  { "type": "sell", "time": 1710000200, "price": 110.0, "symbol": "2317" }
]
```

### Comprehensive Test Scenarios (100% Coverage)

| # | Scenario | Branch/Condition | Expected |
|---|----------|-----------------|----------|
| SO-01 | Simulation mode | `simulation=true` | Credentials: PAPIUSER02/2222/2222/2222 |
| SO-02 | Real mode | `simulation=false` | Real APIKEY/APISECRET/CA/CAPW |
| SO-03 | Item with both `bCount` and `sCount` | Both present | List string includes `buy{n}={price}sell{n}={price}` |
| SO-04 | Item with `bCount` only, no `sCount` but `sell` exists | `sCount` absent, `sell` truthy | Buy in list, sell pushed to `fakeOrder` |
| SO-05 | Item with `sCount` only, no `bCount` but `buy` exists | `bCount` absent, `buy` truthy | Sell in list, buy pushed to `fakeOrder` |
| SO-06 | Item with neither `bCount` nor `sCount`, both prices exist | Both absent, both truthy | Both pushed to `fakeOrder` |
| SO-07 | Item with no buy/sell suggestion at all | All falsy | Only `{symbol}=` appended, no fakeOrder |
| SO-08 | `fakeOrder` is reset at start | Prior `fakeOrder` existed | Cleared to `[]` before processing |
| SO-09 | Empty `submitList` | `submitList = []` | `list` is empty string, `fakeOrder` is `[]` |
| SO-10 | Python bridge error | `exec` returns error | Promise rejects |
| SO-11 | Multiple items in submitList | 3+ items | All concatenated into single CLI arg string |
| SO-12 | `bCount` is 0 (falsy) | `s.suggestion.bCount = 0` | Treated as falsy, falls to `buy` check |
| SO-13 | `buy` price is 0 (falsy) | `s.suggestion.buy = 0` | Neither appended to list nor pushed to fakeOrder |
| SO-14 | `fakeOrder` timestamp accuracy | `Math.round(Date.now() / 1000)` | Verify time is epoch seconds |

---

## 6. Function: `sellallShioajiOrder`

### Purpose

Liquidates all held shares of a specific stock symbol via the Shioaji Python bridge. Used when a portfolio item's `ing` status is set to `2` (pending deletion).

### Invocation & Authentication

```js
// Signature (module-private)
const sellallShioajiOrder = (index, simulation = true) => Promise<void>

// Parameters:
//   index: string — stock symbol to sell all positions for
//   simulation: boolean (default true)
```

### Logic Flow

```
sellallShioajiOrder(index, simulation)
│
├─ Resolve credentials (id, pw, ca, capw — same pattern as others)
│
├─ Child_process.exec('twse.py {id} {pw} sellall {ca} {capw} {index}')
│  ├─ ON ERROR → reject(err)
│  └─ ON SUCCESS → log output
│
└─ Return Promise<void>
```

### Returns & Side Effects

| Aspect | Detail |
|---|---|
| **Returns** | `Promise<void>` |
| **Module State** | None |
| **External Call** | Spawns `twse.py sellall ...` |

### Comprehensive Test Scenarios (100% Coverage)

| # | Scenario | Branch/Condition | Expected |
|---|----------|-----------------|----------|
| SA-01 | Simulation mode | `simulation=true` | Paper credentials used |
| SA-02 | Real mode | `simulation=false` | Real credentials used |
| SA-03 | Valid stock index | e.g., `"2330"` | Command includes the index |
| SA-04 | Python bridge error | `exec` fails | Promise rejects with error |
| SA-05 | Default `simulation` parameter | Called with 1 arg | Defaults to `true` |
| SA-06 | Index is empty string | `""` | Command still executes (empty arg) |
| SA-07 | Index with special characters | e.g., `"2330; rm -rf"` | Shell injection risk — security test |

---

## 7. Function: `getTwsePosition`

### Purpose

Returns the current TWSE position array, augmenting it with a synthetic `symbol: 0` entry representing the available cash balance if not already present.

### Invocation & Authentication

```js
// Signature
export const getTwsePosition = () => Array

// No parameters, no authentication required
// Reads module-level `position` and `available`
```

### Logic Flow

```
getTwsePosition()
│
├─ Scan `position[]` for entry with symbol === 0
│  ├─ Found → set is_exist = true
│  └─ Not found → push { symbol: 0, amount: 1, price: available }
│
└─ Return position (mutated reference)
```

### Returns & Side Effects

| Aspect | Detail |
|---|---|
| **Returns** | `Array` — reference to module-level `position` (not a copy) |
| **Module State** | May mutate `position[]` by appending cash entry |
| **Side Effect** | Returns a *mutable reference* — callers can modify module state |

### Snapshot Testing Data

**Return value (with cash entry added):**
```json
[
  { "symbol": "2330", "amount": 2, "price": 575.5 },
  { "symbol": 0, "amount": 1, "price": 500000 }
]
```

### Comprehensive Test Scenarios (100% Coverage)

| # | Scenario | Branch/Condition | Expected |
|---|----------|-----------------|----------|
| GP-01 | Position is empty | `position = []` | Returns `[{symbol:0, amount:1, price: available}]` |
| GP-02 | Position has items but no `symbol:0` | No cash entry | Cash entry appended |
| GP-03 | Position already has `symbol:0` | `is_exist = true` | Array unchanged, no duplicate |
| GP-04 | Called twice consecutively | Second call | Cash entry exists from first call, not duplicated |
| GP-05 | `available = 0` | Cash is zero | Cash entry has `price: 0` |
| GP-06 | Returns mutable reference | Caller modifies array | Module-level `position` also modified |
| GP-07 | `position` has `symbol: "0"` (string) | `"0" === 0` is false | Cash entry still appended (type mismatch) |

---

## 8. Function: `getTwseOrder`

### Purpose

Returns the current open order array. Simple getter with no transformation.

### Invocation & Authentication

```js
// Signature
export const getTwseOrder = () => Array

// No parameters, no authentication
```

### Logic Flow

```
getTwseOrder() → return order
```

### Returns & Side Effects

| Aspect | Detail |
|---|---|
| **Returns** | `Array` — reference to module-level `order` |
| **Module State** | None (read-only) |

### Comprehensive Test Scenarios (100% Coverage)

| # | Scenario | Branch/Condition | Expected |
|---|----------|-----------------|----------|
| GO-01 | Order array is empty | `order = []` | Returns `[]` |
| GO-02 | Order array has items | Populated by `getShioajiData` | Returns current orders |
| GO-03 | Returns mutable reference | Caller modifies | Module-level `order` also modified |
| GO-04 | Called before any `getShioajiData` | Initial state | Returns `[]` |

---

## 9. Function: `resetShioaji`

### Purpose

Resets the Shioaji module state, preserving only the trade counter. Called to reinitialize the trading cycle without losing the interval counter.

### Invocation & Authentication

```js
// Signature
export const resetShioaji = () => void

// No parameters, no authentication
```

### Logic Flow

```
resetShioaji()
│
├─ Save trade_count = updateTime['trade']
├─ Reset updateTime = {}
├─ Set updateTime['book'] = 0
└─ Set updateTime['trade'] = trade_count (restored)
```

### Returns & Side Effects

| Aspect | Detail |
|---|---|
| **Returns** | `void` (implicit `undefined`) |
| **Module State** | Resets `updateTime.book` to 0, preserves `updateTime.trade` |
| **Note** | Does NOT reset `available`, `order`, `position`, or `fakeOrder` |

### Comprehensive Test Scenarios (100% Coverage)

| # | Scenario | Branch/Condition | Expected |
|---|----------|-----------------|----------|
| RS-01 | Normal reset | `updateTime = {book: 1710000000, trade: 42}` | `book = 0`, `trade = 42` |
| RS-02 | Reset when trade is 0 | `trade = 0` | Both `book` and `trade` are 0 |
| RS-03 | Reset preserves other module state | `position`, `order`, `fakeOrder` populated | All unchanged |
| RS-04 | Double reset | Called twice | Idempotent — same result |
| RS-05 | Reset when `updateTime` has extra keys | Custom keys added | Destroyed — new object has only `book`/`trade` |
| RS-06 | `updateTime.trade` is `undefined` | Edge case | `trade_count = undefined`, restored as undefined |

---

## 10. Cross-Cutting Test Concerns

### 10.1 Error Handling Patterns

| Pattern | Locations | Test Focus |
|---|---|---|
| `.catch(err => { ... handleError(new HoError(...)) })` | `initialBook`, `recur_status(ing=2)`, `submitTwseOrder` | Verify `handleError` is called with `HoError` instance |
| `updateTime.trade` floor guard | Multiple catch blocks | Verify `trade` never goes below 0 |
| Unhandled `JSON.parse` errors | `getShioajiData` | Verify behavior on malformed Python output |
| Child process timeout | All `exec` calls | Verify behavior when Python script hangs |

### 10.2 Timing & Concurrency

| Concern | Test Focus |
|---|---|
| `UPDATE_ORDER` throttle window | Verify exact boundary (equal vs. greater than) |
| `TWSE_ORDER_INTERVAL` time window | Orders expire correctly based on `starttime` |
| `RANGE_INTERVAL` filter | Old buy/sell entries filtered from `previous` arrays |
| `API_WAIT * 2000` delay | `sellall` path waits before delete |
| Modulo-based trade interval | Correct cadence of trade evaluation |

### 10.3 Security Concerns

| Concern | Risk | Test Focus |
|---|---|---|
| CLI argument injection | `index` parameter passed to shell | Verify shell metacharacters are escaped or rejected |
| Credentials in process list | API keys visible in `ps aux` | Document as known risk |
| Paper-trading fallback | `simulation=true` default | Verify production calls always pass `false` |

### 10.4 Data Integrity

| Concern | Test Focus |
|---|---|
| `position` is returned by reference | Callers can corrupt module state |
| `fakeOrder` reset on every submit | Previous fake orders lost |
| Profit accumulation | Floating-point precision over many trades |
| Sorted insertion (buy ASC, sell DESC) | Verify ordering invariant maintained |

---

## 11. Suggested Mock Strategy

### 11.1 Dependencies to Mock

| Dependency | Mock Approach | Justification |
|---|---|---|
| `child_process.exec` | Jest `jest.mock('child_process')` | Avoid spawning real Python processes |
| `Mongo` (mongo-tool) | Jest module mock | Isolate from real database |
| `getSuggestionData` | Jest module mock | Control suggestion data per test |
| `handleError` / `HoError` | Jest spy / module mock | Verify error handling calls |
| `Date.now()` / `new Date()` | `jest.useFakeTimers()` or `jest.spyOn(Date, 'now')` | Deterministic time for interval/throttle tests |
| `setTimeout` | `jest.useFakeTimers()` | Control `API_WAIT` delay |
| `console.log` | `jest.spyOn(console, 'log')` | Suppress noise, optionally verify logging |

### 11.2 Constants to Override

| Constant | Test Value | Reason |
|---|---|---|
| `UPDATE_ORDER` | `60` | Short interval for faster throttle tests |
| `TWSE_ORDER_INTERVAL` | `300` | Controllable time window |
| `RANGE_INTERVAL` | `600` | Predictable filter boundary |
| `PRICE_INTERVAL` | `90` | Match production ratio |
| `TWSE_MARKET_TIME` | `[9, 14]` | Standard TWSE hours for predictable tests |
| `TWSE_ENTER_MID` | `5` | Known threshold for entry tests |
| `TRADE_FEE` | `0.001425` | Standard Taiwan brokerage fee |
| `API_WAIT` | `1` | Minimize test wait time |
| `TOTALDB` | `'total'` | Collection name |

### 11.3 Module State Reset Pattern

Since the module uses mutable singleton state, tests must reset state between runs:

```
// Recommended approach per test:
// 1. Call resetShioaji() to clear updateTime
// 2. Re-import or use jest.isolateModules() for full state isolation
// 3. Mock getShioajiData to control position/order/fakeOrder indirectly
```

### 11.4 Suggested Test File

Per OUTLINE.md §11.8:

```
src/back/models/__tests__/shioaji-tool.test.js
```

---

> **Document Version**: 1.0
> **Source File**: `src/back/models/shioaji-tool.js` (456 lines)
> **Reference**: [OUTLINE.md — §11 QA Testing Scope & Strategy](../../OUTLINE.md)
> **Coverage Target**: 100% logical branch coverage across all 7 functions
