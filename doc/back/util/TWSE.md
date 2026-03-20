# `src/back/util/twse.py` — Taiwan Stock Exchange (Shioaji) Bridge

> **Module**: `twse.py` (~241 lines)
> **Language**: Python 3 (invoked via `child_process.exec` from Node.js)
> **External Dependency**: [Shioaji](https://sinotrade.github.io/) — Sinopac Securities Python SDK
> **Priority**: 🟡 High — Handles real-money stock trading operations

---

## Table of Contents

1. [Overview](#1-overview)
2. [Invocation Interface](#2-invocation-interface)
3. [Module-Level Initialization](#3-module-level-initialization)
4. [Function: `retryApi`](#4-function-retryapi)
5. [Mode: Query (argc == 3)](#5-mode-query-argc--3)
6. [Mode: Submit (argv\[3\] == 'submit')](#6-mode-submit-argv3--submit)
7. [Mode: Sell All (argv\[3\] == 'sellall')](#7-mode-sell-all-argv3--sellall)
8. [Node.js Callers](#8-nodejs-callers)
9. [Constants & Configuration](#9-constants--configuration)
10. [Comprehensive Test Strategy](#10-comprehensive-test-strategy)

---

## 1. Overview

`twse.py` is a Python CLI script that bridges the ANoMoPi Node.js application to the **Shioaji** brokerage API for Taiwan Stock Exchange (TWSE) operations. It is **not** imported as a module — it is executed as a subprocess by `shioaji-tool.js` via `child_process.exec`.

The script operates in three mutually exclusive modes based on `sys.argv` length and content:

| Mode | Trigger | Purpose |
|------|---------|---------|
| **Query** | `argc == 3` | Fetch account balance, positions, pending orders, filled orders |
| **Submit** | `argv[3] == 'submit'` | Cancel existing LMT orders, then place new buy/sell orders |
| **Sell All** | `argv[3] == 'sellall'` | Cancel pending orders for a specific stock, then market-sell entire position |

---

## 2. Invocation Interface

### Command-Line Signatures

```bash
# Mode: Query
python3 twse.py <API_KEY> <API_SECRET>

# Mode: Submit
python3 twse.py <API_KEY> <API_SECRET> submit <CA_PATH> <CA_PW_FILE> <TRADE_FEE> <ORDER_1> [ORDER_2] ...

# Mode: Sell All
python3 twse.py <API_KEY> <API_SECRET> sellall <CA_PATH> <CA_PW_FILE> <STOCK_CODE>
```

### Parameter Reference

| Position | Parameter | Description |
|----------|-----------|-------------|
| `argv[1]` | `API_KEY` | Shioaji API key. If matches `/^PAPIUSER\d+$/`, activates **simulation** mode |
| `argv[2]` | `API_SECRET` | Shioaji API secret key |
| `argv[3]` | Mode flag | `'submit'` or `'sellall'` (absent → Query mode) |
| `argv[4]` | `CA_PATH` | Path to CA certificate file (Submit/SellAll only, production only) |
| `argv[5]` | `CA_PW_FILE` | Path to file containing CA password (Submit/SellAll only, production only) |
| `argv[6]` | `TRADE_FEE` / `STOCK_CODE` | Trading fee rate (Submit) or stock code to liquidate (SellAll) |
| `argv[7+]` | Order specs | Order strings in format `<CODE>=<buy|sell><QTY>=<PRICE>[<buy|sell><QTY>=<PRICE>]` |

### Simulation Detection

```python
simulation = False
if re.match(re.compile(r'^PAPIUSER\d+$'), sys.argv[1]):
    simulation = True
```

When `simulation=True`, the Shioaji API connects to Sinopac's paper trading environment. CA activation is skipped in Submit and SellAll modes.

---

## 3. Module-Level Initialization

**Purpose**: Authenticate with Shioaji, load account balances, settlements, positions, and orders.

### Logic Flow

```
1. Validate argc >= 3, else raise ValueError('Need ID and PASSWORD')
2. Detect simulation mode from argv[1] pattern
3. Initialize Shioaji API: sj.Shioaji(simulation=simulation)
4. Login with retryApi (wait=30s, 5 attempts)
5. Fetch account balance with retryApi (timeout=10000ms)
6. Validate: if acc_balance.errmsg != '' → raise ValueError('Miss balance')
7. Fetch settlements with retryApi (timeout=10000ms)
8. Validate: if len(acc_settle) < 3 AND argc != 3 → raise ValueError('Miss settle')
9. Fetch positions with retryApi (unit=Share, timeout=10000ms)
10. Update order status with retryApi (timeout=10000ms)
11. List all trades (no retry wrapper)
12. Capture current datetime
```

### Cash Calculation Logic

```
if len(acc_settle) >= 3 AND acc_balance.acc_balance > 0:
    if hour < 10:
        current_cash = (balance + settle[0] + settle[1] + settle[2]) / 10
    else:
        current_cash = (balance + settle[1] + settle[2]) / 10
else:
    current_cash = 'same'
```

**Rationale**: Before 10:00 AM (market open), T+0 settlement (`settle[0]`) is included because it hasn't been processed yet. After 10:00, only T+1 and T+2 settlements are pending.

### Side Effects

- Network: HTTPS connection to Shioaji/Sinopac servers
- Prints: `acc_balance`, `acc_settle` to stdout
- State: Sets `api`, `person_info`, `acc_balance`, `acc_settle`, `acc_position`, `acc_order`, `now`, `current_cash`

---

## 4. Function: `retryApi`

### Purpose

Generic retry wrapper for Shioaji API calls with configurable wait and attempt count.

### Signature

```python
def retryApi(fun, wait=10, count=5):
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `fun` | callable | — | Zero-argument lambda wrapping the API call |
| `wait` | int | `10` | Seconds to sleep between retries |
| `count` | int | `5` | Maximum number of attempts before re-raising |

### Logic Flow

```
loop:
    try:
        return fun()
    except:
        apiCount += 1
        if apiCount < count:
            sleep(wait)
        else:
            raise  ← re-raises the last exception
```

### Returns

- **Success**: Return value of `fun()`
- **Failure**: Raises the last caught exception after `count` attempts

### Test Scenarios

| ID | Scenario | Expected |
|----|----------|----------|
| RA-01 | `fun()` succeeds on first call | Returns result immediately, no sleep |
| RA-02 | `fun()` fails 2x then succeeds on 3rd | Sleeps 2× `wait`, returns result |
| RA-03 | `fun()` fails all 5 attempts | Raises the original exception |
| RA-04 | `fun()` fails 4x then succeeds on 5th | Sleeps 4× `wait`, returns result |
| RA-05 | Custom `wait=30`, `count=3`, fails 3x | Sleeps 2× 30s, raises on 3rd |
| RA-06 | Custom `count=1`, fails once | Raises immediately (no sleep) |
| RA-07 | `fun()` raises different exception types | Last exception type is preserved |
| RA-08 | `fun()` returns `None` | Returns `None` (truthy check not used) |
| RA-09 | `fun()` returns falsy value (0, '', []) | Returns the falsy value without retrying |

---

## 5. Mode: Query (argc == 3)

### Purpose

Retrieve the current account state: cash, positions, pending orders, and filled orders. Output is parsed by Node.js `getShioajiData()` in `shioaji-tool.js`.

### Invocation

```bash
python3 twse.py <API_KEY> <API_SECRET>
```

### Logic Flow

```
1. Build position JSON array:
   for each p in acc_position:
       append {"symbol": p.code, "amount": p.quantity/10, "price": p.price}

2. Build pending order JSON array:
   for each o in acc_order:
       if status in (PendingSubmit, PreSubmitted, Submitted, Filling):
           if action == Buy: amount = +quantity
           else: amount = -quantity
           append {"symbol", "amount", "price", "type": price_type+order_lot, "time": timestamp}

3. Build filled order JSON array:
   for each o in acc_order:
       if status in (Filled, Filling):
           for each deal d in o.status.deals:
               accumulate price, time, ptime (timestamps), quantity
               if IntradayOdd: profit += price * qty / 10
               else: profit += price * qty * 100
           if IntradayOdd:
               remaining = (order_qty - filled_qty) // 10  → "oddquantity"
           else:
               remaining = (order_qty - filled_qty) * 100  → "quantity"
           append fill_order JSON

4. Print output:
   "start result"
   <current_cash>       ← number or 'same'
   <position JSON>      ← [{"symbol","amount","price"}, ...]
   <order JSON>         ← [{"symbol","amount","price","type","time"}, ...]
   <fill_order JSON>    ← [{"symbol","id","profit","price","type","time","ptime","quantity|oddquantity","starttime"}, ...]
```

### stdout Protocol

The Node.js caller (`getShioajiData`) splits output by `\n` and searches for the line `"start result"` as a delimiter. Lines before it are debug output; lines 1–4 after it are the structured data.

```
<debug lines from api.login, acc_balance, acc_settle, etc.>
<pending orders printed inline>
start result
<current_cash>
<position_json_array>
<order_json_array>
<fill_order_json_array>
<argv echo>
```

### Returns (via stdout)

| Line (after "start result") | Content | Type |
|------------------------------|---------|------|
| 1 | `current_cash` | `float` or string `'same'` |
| 2 | Positions array | JSON array string |
| 3 | Pending orders array | JSON array string |
| 4 | Filled orders array | JSON array string |

### Side Effects

- **Network**: 5 Shioaji API calls (login, balance, settlements, positions, status + trades)
- **stdout**: Structured output parsed by Node.js

### Test Scenarios

| ID | Scenario | Expected |
|----|----------|----------|
| QR-01 | Normal query with positions & orders | All 4 data sections printed after "start result" |
| QR-02 | No positions (empty `acc_position`) | Position line = `[]` |
| QR-03 | No orders (empty `acc_order`) | Order line = `[]`, fill_order line = `[]` |
| QR-04 | Mixed order statuses (Filled, PendingSubmit, Cancelled) | Only active/filled orders included |
| QR-05 | `current_cash == 'same'` (insufficient settlements) | First line after "start result" = `same` |
| QR-06 | Hour < 10 with 3+ settlements | Cash includes `settle[0] + settle[1] + settle[2]` |
| QR-07 | Hour >= 10 with 3+ settlements | Cash includes only `settle[1] + settle[2]` |
| QR-08 | Buy order vs Sell order sign | Buy = positive amount, Sell = negative amount |
| QR-09 | IntradayOdd order lot profit calc | `profit = price * qty / 10` per deal |
| QR-10 | Common order lot profit calc | `profit = price * qty * 100` per deal |
| QR-11 | IntradayOdd remaining quantity | `oddquantity = (order_qty - filled_qty) // 10` |
| QR-12 | Common remaining quantity | `quantity = (order_qty - filled_qty) * 100` |
| QR-13 | Order with status `Filling` | Appears in BOTH pending orders AND filled orders |
| QR-14 | Multiple deals in single order | `profit` = concatenated `"<val>p<val>p"`, `ptime` = concatenated `"<ts>t<ts>t"` |
| QR-15 | Simulation mode (PAPIUSER key) | API connects to paper trading, same output format |
| QR-16 | acc_balance.errmsg non-empty | Raises `ValueError('Miss balance')` before reaching query |
| QR-17 | `len(acc_settle) < 3` with argc == 3 | Does NOT raise (settle validation skipped for query) |
| QR-18 | `acc_balance.acc_balance == 0` with 3+ settlements | `current_cash = 'same'` |

---

## 6. Mode: Submit (argv[3] == 'submit')

### Purpose

Cancel all existing LMT pending orders, then place new buy/sell orders based on parsed command-line arguments. Implements cash management to prevent over-buying.

### Invocation

```bash
python3 twse.py <API_KEY> <API_SECRET> submit <CA_PATH> <CA_PW_FILE> <TRADE_FEE> [ORDER_SPECS...]
```

### Order Spec Format

```
<STOCK_CODE>=<buy|sell><QTY>=<PRICE>[<buy|sell><QTY>=<PRICE>]
```

**Examples**:
- `2330=buy100=580.0` — Buy 100 shares of 2330 at 580.0
- `2317=sell50=120.5buy30=118.0` — Sell 50 at 120.5 AND buy 30 at 118.0

**Regex**: `^(.+)=(buy|sell)(\d+)=(\d+\.?\d*)((buy|sell)(\d+)=(\d+\.?\d*))?$`

### Logic Flow

```
1. Validate: current_cash != 'same', else raise ValueError('Current cash error')
2. If NOT simulation:
   a. Read CA password from file at argv[5]
   b. Strip trailing newline from password
   c. Activate CA certificate with api.activate_ca()
3. Cancel all existing LMT pending orders:
   for each order where price_type=='LMT' AND status in (PendingSubmit,PreSubmitted,Submitted,Filling):
       api.cancel_order(order)
4. Update status via retryApi
5. Parse TRADE_FEE from argv[6]
6. Deduct reserve: current_cash -= 10000
7. For each argv element matching order regex:
   a. Parse stock code, action(s), quantity(ies), price(s)
   b. Resolve contract: api.Contracts.Stocks[code]
   c. Process BUY:
      - Cash sufficiency check (3-tier):
        if cash < price * qty * (1+fee) * 4/3:
            if cash < price * qty * (1+fee) * 2/3:
                buy = 0  (skip entirely)
            else:
                buy = int(cash / (price * (1+fee)))  (partial fill)
      - Deduct cash: current_cash -= price * buy * (1+fee)
      - Place Common lot order for buy//100 shares (if > 0)
      - Place IntradayOdd lot order for (buy%100)*10 shares (if > 0)
   d. Process SELL:
      - Find current position quantity for this stock
      - Cap sell qty: if position < sell * 4/3, sell = position
      - Convert: sell = sell * 10
      - Place Common lot order for sell//1000 shares (if > 0)
      - Place IntradayOdd lot order for sell%1000 shares (if > 0)
```

### Cash Management Decision Tree

```
                    ┌─ cash >= cost * 4/3 ──────► Place full order
                    │
buy > 0 AND ───────┤
buy_price != 0      │                              ┌─ cash >= cost * 2/3 ──► Reduce qty to affordable
                    └─ cash < cost * 4/3 ─────────┤
                                                   └─ cash < cost * 2/3 ──► Skip (buy = 0)

where cost = buy_price * buy * (1 + TRADE_FEE)
```

### Order Splitting Logic

Both buy and sell orders are split into **Common** (round lots of 100/1000) and **IntradayOdd** (remainder) sub-orders:

| Action | Common Lot | IntradayOdd Lot |
|--------|-----------|-----------------|
| **Buy** | `qty // 100` shares, order_lot=`"Common"` | `(qty % 100) * 10` shares, order_lot=`"IntradayOdd"` |
| **Sell** | `qty // 1000` shares, order_lot=`"Common"` | `qty % 1000` shares, order_lot=`"IntradayOdd"` |

All orders use: `price_type="LMT"`, `order_type="ROD"`, `account=api.stock_account`.

### Side Effects

- **Network**: Login + balance/settlement/position APIs, cancel orders, place new orders
- **File I/O**: Reads CA password file (`argv[5]`) in production mode
- **Brokerage**: Cancels existing LMT orders, places real buy/sell orders
- **stdout**: Debug prints (match groups, contract, qty, price, cash)

### Test Scenarios

| ID | Scenario | Expected |
|----|----------|----------|
| SM-01 | `current_cash == 'same'` | Raises `ValueError('Current cash error')` |
| SM-02 | Simulation mode submit | CA activation skipped, orders placed on paper account |
| SM-03 | Production mode submit | Reads CA file, activates CA, places real orders |
| SM-04 | CA password file with trailing newline | Newline stripped (`capw = capw[:-1]`) |
| SM-05 | Cancel existing LMT PendingSubmit order | `api.cancel_order()` called |
| SM-06 | Cancel existing LMT Filling order | `api.cancel_order()` called |
| SM-07 | Non-LMT order exists (e.g., MKT) | Not cancelled |
| SM-08 | Cancelled/Filled order exists | Not cancelled (status filter) |
| SM-09 | Buy with sufficient cash (≥ 4/3 cost) | Full quantity ordered |
| SM-10 | Buy with moderate cash (between 2/3 and 4/3 cost) | Reduced quantity: `int(cash / (price * (1+fee)))` |
| SM-11 | Buy with insufficient cash (< 2/3 cost) | Buy skipped entirely (buy = 0) |
| SM-12 | Buy 250 shares → split | Common: 2 lots (200 shares), IntradayOdd: 500 shares (50×10) |
| SM-13 | Buy exactly 100 shares | Common: 1 lot only, no IntradayOdd |
| SM-14 | Buy 50 shares (all odd) | No Common order, IntradayOdd: 500 shares |
| SM-15 | Sell with position ≥ sell × 4/3 | Full sell quantity |
| SM-16 | Sell with position < sell × 4/3 | Capped to actual position |
| SM-17 | Sell position = 0 for stock | sell = 0, no order placed |
| SM-18 | Sell 1500 → split (after ×10) | Common: 15 lots (15000 shares), IntradayOdd: 0 |
| SM-19 | Dual order spec: `CODE=buy100=50sell200=60` | Both buy and sell processed for same stock |
| SM-20 | Multiple stock order specs in argv | Each processed sequentially, cash decremented |
| SM-21 | Non-matching argv elements | Silently skipped (regex doesn't match) |
| SM-22 | `fee = 0.006` (default TRADE_FEE) | Cash deduction includes fee |
| SM-23 | Reserve deduction (10000) | `current_cash -= 10000` before processing |
| SM-24 | Stock code not found in Contracts | `api.Contracts.Stocks[code]` may raise |
| SM-25 | `buy_price == 0` | Buy block skipped (guard: `buy > 0 and buy_price != 0`) |
| SM-26 | `sell_price == 0` | Sell block skipped (guard: `sell > 0 and sell_price != 0`) |

---

## 7. Mode: Sell All (argv[3] == 'sellall')

### Purpose

Emergency or planned liquidation: cancel all pending LMT orders for a specific stock, then place a market-price sell order for the entire Common lot position.

### Invocation

```bash
python3 twse.py <API_KEY> <API_SECRET> sellall <CA_PATH> <CA_PW_FILE> <STOCK_CODE>
```

### Logic Flow

```
1. If NOT simulation:
   a. Read CA password from file at argv[5]
   b. Strip trailing newline
   c. Activate CA certificate
2. Get target stock code from argv[6]
3. Cancel pending LMT orders for target stock:
   for each order where code == target AND price_type == 'LMT'
       AND status in (PendingSubmit, PreSubmitted, Submitted):
       api.cancel_order(order)
4. Update status via retryApi
5. Find position quantity for target stock:
   q = int(position.quantity // 1000)  ← Common lot count only
6. If q > 0:
   a. Resolve contract: api.Contracts.Stocks[target]
   b. Place market sell order:
      price=10000, quantity=q, action="Sell",
      price_type="MKT", order_type="ROD"
```

### Key Differences from Submit Mode

| Aspect | Submit | Sell All |
|--------|--------|----------|
| Price type | `LMT` (limit) | `MKT` (market) |
| Scope | Multiple stocks | Single stock |
| Order lot | Common + IntradayOdd | Common only |
| Cancel scope | All LMT orders | Only target stock's LMT orders |
| `Filling` status | Also cancelled | NOT cancelled (only PendingSubmit, PreSubmitted, Submitted) |
| Direction | Buy and/or Sell | Sell only |

### Side Effects

- **Network**: Login + APIs, selective cancel, market sell order
- **File I/O**: Reads CA password file (production only)
- **Brokerage**: Cancels target stock orders, places market sell

### Test Scenarios

| ID | Scenario | Expected |
|----|----------|----------|
| SA-01 | Sell all with Common position = 5000 shares | q = 5, market sell 5 lots |
| SA-02 | Position has odd shares (e.g., 5300) | q = 5 (odd lot 300 ignored, `// 1000`) |
| SA-03 | No position for target stock (q = 0) | No sell order placed |
| SA-04 | Simulation mode | CA activation skipped |
| SA-05 | Production mode | CA file read, CA activated |
| SA-06 | Multiple pending orders for target stock | All matching LMT orders cancelled |
| SA-07 | Pending order for different stock | Not cancelled |
| SA-08 | Order with status `Filling` for target | NOT cancelled (excluded from filter) |
| SA-09 | MKT price type order for target stock | Not cancelled (LMT filter) |
| SA-10 | Stock code not in any position | Loop completes with q = 0, no order |
| SA-11 | `price=10000` on market order | Serves as price ceiling; exchange fills at market |

---

## 8. Node.js Callers

### `shioaji-tool.js` — Three Wrapper Functions

| Function | Calls twse.py as | Purpose |
|----------|------------------|---------|
| `getShioajiData(simulation)` | `twse.py <id> <pw>` | Query mode; parses stdout into `{position, fill_order}` + updates module globals |
| `submitShioajiOrder(submitList, simulation)` | `twse.py <id> <pw> submit <ca> <capw> <fee> <orders>` | Submit mode; builds order spec string from suggestion data |
| `sellallShioajiOrder(index, simulation)` | `twse.py <id> <pw> sellall <ca> <capw> <index>` | Sell-all mode; liquidates a single stock |

### `background.js` — Scheduler

```javascript
export const twseInit = () => {
    if (TWSE_TICKER(ENV_TYPE) && CHECK_STOCK(ENV_TYPE)) {
        // Initial delay: 270 seconds (4.5 minutes)
        // Then loop every PRICE_INTERVAL (600s = 10 minutes)
        // Calls twseShioajiInit() which orchestrates query → analysis → submit
    }
}
```

### Execution Lifecycle

```
file-server.js startup
    └── twseInit()
        └── wait 270s
            └── loop every 600s:
                ├── twseShioajiInit()
                │   ├── getShioajiData()        → twse.py (query mode)
                │   │   └── parse stdout → positions, orders, fills
                │   ├── process filled orders → update MongoDB totals
                │   ├── evaluate stock suggestions
                │   └── if market hours: skip
                │       else: submitShioajiOrder() → twse.py (submit mode)
                │              or sellallShioajiOrder() → twse.py (sellall mode)
                └── on error: resetShioaji() + bgError()
```

---

## 9. Constants & Configuration

| Constant | Value | Used In | Description |
|----------|-------|---------|-------------|
| `TRADE_FEE` | `0.006` | Submit mode | Brokerage fee rate (0.6%) |
| `PRICE_INTERVAL` | `600` | background.js | Seconds between ticker loops |
| `TWSE_ORDER_INTERVAL` | `86400` | shioaji-tool.js | Max age (seconds) for order relevance |
| `TWSE_MARKET_TIME` | `[4, 21]` | shioaji-tool.js | Market hours range (UTC) — skip order submission |
| `TWSE_ENTER_MID` | `100` | shioaji-tool.js | Midpoint threshold % for entry signal |
| `UPDATE_ORDER` | `60` | shioaji-tool.js | Seconds between book refreshes |
| `RANGE_INTERVAL` | `7776000` | shioaji-tool.js | ~90 days; buy/sell history retention window |
| `API_WAIT` | `5` | shioaji-tool.js | Base wait multiplier between API calls |
| `TWSE_TICKER` | config flag | background.js | Feature toggle for TWSE ticker |
| `CHECK_STOCK` | config flag | background.js | Feature toggle for stock monitoring |
| `SHIOAJI_APIKEY` | secret | ver.js | Production API key |
| `SHIOAJI_APISECRET` | secret | ver.js | Production API secret |
| `SHIOAJI_CA` | secret | ver.js | CA certificate path |
| `SHIOAJI_CAPW` | secret | ver.js | CA password file path |

---

## 10. Comprehensive Test Strategy

### 10.1 Testing Approach

Since `twse.py` is a CLI script invoked via `child_process.exec`, testing requires a **dual-layer strategy**:

| Layer | Framework | Scope |
|-------|-----------|-------|
| **Python unit tests** | `pytest` + `unittest.mock` | Test `retryApi`, argument parsing, order construction, stdout output format |
| **Node.js integration tests** | `jest` (existing) | Test `shioaji-tool.js` wrappers that invoke and parse `twse.py` output |

### 10.2 Mocking Strategy

#### Python Layer

```python
# Mock the shioaji module entirely
mock_api = MagicMock(spec=sj.Shioaji)
mock_api.login.return_value = [MagicMock(person_id='A123456789')]
mock_api.account_balance.return_value = MagicMock(acc_balance=500000, errmsg='')
mock_api.settlements.return_value = [MagicMock(amount=-10000), MagicMock(amount=-20000), MagicMock(amount=-30000)]
# etc.
```

#### Node.js Layer

```javascript
// Mock child_process.exec to return controlled stdout
jest.mock('child_process', () => ({
    exec: jest.fn((cmd, callback) => callback(null, mockStdout))
}));
```

### 10.3 Module-Level Initialization Tests

| ID | Scenario | Expected |
|----|----------|----------|
| IN-01 | `argc < 3` (no arguments) | `ValueError('Need ID and PASSWORD')` |
| IN-02 | `argc == 1` (script name only) | `ValueError('Need ID and PASSWORD')` |
| IN-03 | `argv[1] = 'PAPIUSER02'` | `simulation = True` |
| IN-04 | `argv[1] = 'PAPIUSER999'` | `simulation = True` |
| IN-05 | `argv[1] = 'PAPIUSER'` (no digit) | `simulation = False` |
| IN-06 | `argv[1] = 'papiuser02'` (lowercase) | `simulation = False` (case-sensitive) |
| IN-07 | `argv[1] = 'XPAPIUSER02'` (prefix) | `simulation = False` |
| IN-08 | `argv[1] = 'PAPIUSER02X'` (suffix) | `simulation = False` ($ anchor) |
| IN-09 | Login succeeds after 3 retries | Continues normally |
| IN-10 | Login fails all 5 retries | Script raises exception |
| IN-11 | `acc_balance.errmsg = 'timeout'` | `ValueError('Miss balance')` |
| IN-12 | `acc_balance.errmsg = ''` | Continues normally |
| IN-13 | `len(acc_settle) == 2`, `argc == 3` | No error (settle check skipped for query) |
| IN-14 | `len(acc_settle) == 2`, `argc == 7` | `ValueError('Miss settle')` |
| IN-15 | `len(acc_settle) == 3`, `argc == 7` | Continues normally |

### 10.4 Cash Calculation Tests

| ID | Scenario | Expected |
|----|----------|----------|
| CC-01 | 3 settlements, balance > 0, hour = 9 | `(balance + s0 + s1 + s2) / 10` |
| CC-02 | 3 settlements, balance > 0, hour = 10 | `(balance + s1 + s2) / 10` |
| CC-03 | 3 settlements, balance > 0, hour = 15 | `(balance + s1 + s2) / 10` |
| CC-04 | 3 settlements, balance = 0 | `current_cash = 'same'` |
| CC-05 | 2 settlements, balance > 0 | `current_cash = 'same'` |
| CC-06 | 0 settlements, balance > 0 | `current_cash = 'same'` |
| CC-07 | Negative settlement amounts | Correctly summed (reduces cash) |
| CC-08 | Very large balance (overflow check) | Handles large float values |

### 10.5 Query Mode Output Format Tests

| ID | Scenario | Expected |
|----|----------|----------|
| OF-01 | Output contains "start result" delimiter | Data parsing starts at correct line |
| OF-02 | Position JSON is valid parseable JSON | `JSON.parse()` succeeds in Node.js |
| OF-03 | Order JSON is valid parseable JSON | `JSON.parse()` succeeds in Node.js |
| OF-04 | Fill order JSON is valid parseable JSON | `JSON.parse()` succeeds in Node.js |
| OF-05 | Special chars in stock code | JSON correctly escaped |
| OF-06 | Zero positions, zero orders | Output: `[]` for each array |
| OF-07 | Float precision in prices | Prices maintain adequate precision |

### 10.6 Submit Mode: Order Regex Parsing Tests

| ID | Scenario | Expected |
|----|----------|----------|
| RX-01 | `2330=buy100=580.0` | code=2330, buy=100, price=580.0 |
| RX-02 | `2317=sell50=120.5` | code=2317, sell=50, price=120.5 |
| RX-03 | `2330=buy100=580sell50=600` | Dual: buy 100@580, sell 50@600 |
| RX-04 | `2330=sell50=600buy100=580` | Dual: sell 50@600, buy 100@580 |
| RX-05 | `2330=buy100=580.` | Matches (trailing dot allowed by `\d+\.?\d*`) |
| RX-06 | `2330=buy0=580` | buy=0, guard `buy > 0` prevents order |
| RX-07 | `INVALID_STRING` | No regex match, silently skipped |
| RX-08 | `submit` (argv[3] itself) | No regex match, skipped |
| RX-09 | `2330=buy100=0` | buy_price=0, guard `buy_price != 0` prevents order |
| RX-10 | `TSE.2330=buy100=580.0` | code=`TSE.2330` (`.+` matches greedily) |

### 10.7 Submit Mode: Cash Sufficiency Branch Tests

| ID | Scenario | Cash | Cost (price×qty×(1+fee)) | Expected |
|----|----------|------|--------------------------|----------|
| CS-01 | Ample cash | 1,000,000 | 58,348 | Full buy (100 shares) |
| CS-02 | Moderate cash | 60,000 | 58,348 (×4/3=77,797) | Cash < 4/3 cost → reduce: `int(60000/(580×1.006))=102` |
| CS-03 | Low cash | 30,000 | 58,348 (×2/3=38,899) | Cash < 2/3 cost → buy = 0 |
| CS-04 | Exact 4/3 boundary | 77,797 | 58,348 | Full buy (at boundary) |
| CS-05 | Exact 2/3 boundary | 38,899 | 58,348 | Reduced buy (at boundary) |
| CS-06 | Multiple buys draining cash | — | — | Cash decrements sequentially; later buys may be reduced |
| CS-07 | Cash after 10000 reserve | 10,001 | — | Only 1 available after reserve |

### 10.8 Submit Mode: Order Splitting Tests

| ID | Buy Qty | Common Order | IntradayOdd Order |
|----|---------|-------------|-------------------|
| OS-01 | 300 | 3 lots (qty=3) | None (300%100=0) |
| OS-02 | 350 | 3 lots (qty=3) | 500 shares (50×10) |
| OS-03 | 50 | None (50//100=0) | 500 shares (50×10) |
| OS-04 | 1 | None | 10 shares (1×10) |
| OS-05 | 0 | None | None |

| ID | Sell Qty (after ×10) | Common Order | IntradayOdd Order |
|----|---------------------|-------------|-------------------|
| OS-06 | 3000 | 3 lots (qty=3) | None |
| OS-07 | 3500 | 3 lots (qty=3) | 500 shares |
| OS-08 | 500 | None (500//1000=0) | 500 shares |
| OS-09 | 0 | None | None |

### 10.9 Sell All Mode Tests

| ID | Scenario | Expected |
|----|----------|----------|
| SA-12 | Target stock has 10000 shares | q = 10, sell 10 lots at MKT |
| SA-13 | Target stock has 500 shares | q = 0 (500//1000=0), no order |
| SA-14 | Target stock has 1500 shares | q = 1 (1500//1000=1), sell 1 lot |
| SA-15 | No orders to cancel for target | Cancel loop is no-op |
| SA-16 | Multiple orders for target (mix of LMT and MKT) | Only LMT orders cancelled |
| SA-17 | api.place_order times out | Exception propagates to Node.js caller |

### 10.10 Error Handling & Edge Cases

| ID | Scenario | Expected |
|----|----------|----------|
| EH-01 | Network timeout during login | `retryApi` retries up to 5 times (wait=30s) |
| EH-02 | Network timeout during balance fetch | `retryApi` retries up to 5 times (wait=10s) |
| EH-03 | Shioaji API returns unexpected structure | Likely `AttributeError`; unhandled → script crashes |
| EH-04 | CA password file not found | `FileNotFoundError` → script crashes |
| EH-05 | CA password file empty | `capw` becomes empty string after `[:-1]` strip |
| EH-06 | `api.place_order` raises exception | Unhandled → script crashes, Node.js sees exec error |
| EH-07 | `api.cancel_order` raises exception | Unhandled → script crashes |
| EH-08 | Concurrent script execution | Possible login conflicts on Shioaji API |
| EH-09 | `api.Contracts.Stocks[code]` for invalid code | May return `None` or raise `KeyError` |
| EH-10 | `api.logout()` is commented out (line 239) | Session may linger on Shioaji server |
| EH-11 | Integer overflow in quantity calculations | Python handles arbitrary precision; not a risk |
| EH-12 | `acc_settle` with negative amounts | Correctly handled (subtracted from cash) |
| EH-13 | `person_info` empty list | `person_info[0].person_id` → `IndexError` |
| EH-14 | Division by zero: `buy_price * (1 + fee)` when price=0 | Guarded by `buy_price != 0` check |
| EH-15 | argv echo on last line (`print(sys.argv)`) | Not parsed by Node.js (after data section) |

### 10.11 Integration Tests (Node.js ↔ Python Bridge)

| ID | Scenario | Layer | Expected |
|----|----------|-------|----------|
| IT-01 | `getShioajiData()` parses "start result" delimiter | Node.js | Returns `{position, fill_order}` |
| IT-02 | `getShioajiData()` with `current_cash = 'same'` | Node.js | Module variable `available` unchanged |
| IT-03 | `getShioajiData()` with numeric cash | Node.js | Module variable `available` updated |
| IT-04 | `submitShioajiOrder()` builds correct cmd string | Node.js | Correct argv format passed to exec |
| IT-05 | `sellallShioajiOrder()` builds correct cmd string | Node.js | Correct argv format passed to exec |
| IT-06 | Python script exits with non-zero code | Node.js | `exec` callback receives error → Promise rejects |
| IT-07 | Python script stdout exceeds exec buffer | Node.js | May truncate output → parsing fails |
| IT-08 | Python script hangs (infinite retry) | Node.js | `exec` timeout (if configured) or process hangs |
| IT-09 | Malformed JSON in stdout | Node.js | `JSON.parse()` throws → unhandled in shioaji-tool.js |
| IT-10 | `twseShioajiInit()` error → `resetShioaji()` | Node.js | Module state (updateTime, order, position) reset |
| IT-11 | `twseInit()` with `TWSE_TICKER=false` | Node.js | Returns `undefined`, no loop started |
| IT-12 | `twseInit()` with `CHECK_STOCK=false` | Node.js | Returns `undefined`, no loop started |

### 10.12 Security Considerations

| ID | Concern | Mitigation / Test |
|----|---------|-------------------|
| SC-01 | API credentials passed via argv | Visible in process list; verify no logging of secrets |
| SC-02 | CA password stored in plaintext file | Verify file permissions; ensure no stdout leak |
| SC-03 | Command injection via stock code | Verify stock codes are validated before building exec string |
| SC-04 | `api.logout()` commented out | Session may persist; verify Shioaji session timeout behavior |
| SC-05 | Simulation keys hardcoded in shioaji-tool.js | `'PAPIUSER02'` / `'2222'` — acceptable for paper trading |

---

> **Note**: This document is a testing strategy and technical reference. No code implementation is included. Test implementation should use `pytest` for the Python layer and `jest` for the Node.js integration layer, consistent with the project's existing test infrastructure (see `doc/OUTLINE.md` §10–§11).
