# tdameritrade-tool.js — QA Testing Strategy & Technical Documentation

> **Module**: `src/back/models/tdameritrade-tool.js` (815 lines)
> **Role**: US Stock Trading — Schwab/TD Ameritrade OAuth, order management, position tracking, profit calculation
> **Priority**: 🟡 High (Financial operations, external API integration)
> **Conforms to**: OUTLINE.md §11 — QA Testing Scope & Strategy

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Module-Level State](#2-module-level-state)
3. [Function: `generateAuthUrl`](#3-function-generateauthurl)
4. [Function: `getToken`](#4-function-gettoken)
5. [Internal Function: `checkOauth`](#5-internal-function-checkoauth)
6. [Internal Function: `cancelTDOrder`](#6-internal-function-canceltdorder)
7. [Internal Function: `submitTDOrder`](#7-internal-function-submittdorder)
8. [Function: `usseTDInit`](#8-function-ussetdinit)
9. [Function: `getUssePosition`](#9-function-getusseposition)
10. [Function: `getUsseOrder`](#10-function-getusseorder)
11. [Function: `resetTD`](#11-function-resettd)
12. [Cross-Cutting Concerns](#12-cross-cutting-concerns)
13. [Mock & Fixture Strategy](#13-mock--fixture-strategy)

---

## 1. Module Overview

### 1.1 Purpose

This module integrates with the **Schwab API** (formerly TD Ameritrade) to manage US stock trading operations. It handles OAuth2 authentication, order submission/cancellation, position and balance tracking, profit calculation, and automated trading based on suggestion data from `stock-tool.js`.

### 1.2 Exports

| Export | Type | Visibility |
|--------|------|------------|
| `generateAuthUrl` | Named function | Public |
| `getToken` | Named function | Public |
| `usseTDInit` | Named function | Public |
| `getUssePosition` | Named function | Public |
| `getUsseOrder` | Named function | Public |
| `resetTD` | Named function | Public |
| `checkOauth` | Function | Internal (not exported) |
| `cancelTDOrder` | Function | Internal (not exported) |
| `submitTDOrder` | Function | Internal (not exported) |

### 1.3 External Dependencies

| Dependency | Usage |
|------------|-------|
| `node-fetch` | HTTP requests to Schwab API |
| `querystring` | URL-encoding POST bodies for OAuth |
| `mongo-tool.js` | MongoDB CRUD (`accessToken`, `total` collections) |
| `stock-tool.js` | `getSuggestionData('usse')` for trade signals |
| `sendWs.js` | WebSocket/Discord notifications |
| `utility.js` | `handleError`, `HoError` error handling |
| `ver.js` | `TDAMERITRADE_KEY`, `TDAMERITRADE_SECRET`, `GOOGLE_REDIRECT` |
| `constants.js` | `TD_AUTH_URL`, `TD_TOKEN_URL`, `TOTALDB`, interval/fee constants |
| `logger.js` | Structured logging via pino (`createLogger('tdameritrade')`) |

### 1.4 Key Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `TD_AUTH_URL` | `https://api.schwabapi.com/v1/oauth/authorize?` | OAuth authorization endpoint |
| `TD_TOKEN_URL` | `https://api.schwabapi.com/v1/oauth/token` | Token exchange endpoint |
| `TOTALDB` | `'total'` | MongoDB collection for portfolio totals |
| `USSE_ORDER_INTERVAL` | `86400` (1 day) | Order recency window in seconds |
| `UPDATE_ORDER` | `60` (1 min) | Minimum interval between book refreshes |
| `PRICE_INTERVAL` | `600` (10 min) | Price update interval |
| `USSE_ENTER_MID` | `100` | Midpoint entry threshold (%) |
| `USSE_MARKET_TIME` | `[16, 9]` | Market hours boundaries (UTC) |
| `RANGE_INTERVAL` | `7776000` (90 days) | Max age for buy/sell history entries |
| `USSE_FEE` | `0.004` (0.4%) | Trading fee rate |
| `API_WAIT` | `5` | Base delay multiplier between API calls (seconds) |

---

## 2. Module-Level State

The module maintains mutable singleton state in closure-scoped variables. This is critical for testing — all state must be controlled or reset between test cases.

| Variable | Type | Initial Value | Description |
|----------|------|---------------|-------------|
| `tokens` | `Object` | `{}` | OAuth access/refresh tokens + expiry dates |
| `encryptedId` | `String\|null` | `null` | Schwab hashed account identifier |
| `updateTime` | `Object` | `{book: 0, trade: 0}` | Timestamps/counters for throttling |
| `available` | `Object` | `{tradable: 0, cash: 0}` | Account available balances |
| `order` | `Array` | `[]` | Active (cancelable) orders |
| `position` | `Array` | `[]` | Current stock positions |
| `fakeOrder` | `Array` | `[]` | Simulated orders (when funds unavailable) |

### Snapshot: `tokens` Object (after successful auth)

```json
{
  "access_token": "eyJ0eXAiOiJKV1...",
  "refresh_token": "dGhpcyBpcyBhIH...",
  "expires_in": 1800,
  "expiry_date": 1710700000,
  "refresh_token_expiry_date": 1711304800,
  "token_type": "Bearer",
  "scope": "api",
  "api": "tdameritrade",
  "_id": "ObjectId(...)"
}
```

### Snapshot: `position` Array

```json
[
  { "symbol": "AAPL", "amount": 10, "price": 172.50 },
  { "symbol": "BRK-B", "amount": 5, "price": 410.20 },
  { "symbol": 0, "amount": 1, "price": 12500.00 }
]
```

### Snapshot: `order` Array

```json
[
  {
    "id": 12345678,
    "time": 1710600000,
    "amount": 10,
    "type": "LIMIT",
    "symbol": "AAPL",
    "price": 170.00,
    "duration": "GOOD_TILL_CANCEL",
    "partial": false
  }
]
```

### Snapshot: `fakeOrder` Array

```json
[
  {
    "type": "buy",
    "time": 1710600000,
    "price": 170.00,
    "symbol": "AAPL",
    "done": false
  }
]
```

---

## 3. Function: `generateAuthUrl`

### 3.1 Purpose

Constructs the Schwab OAuth2 authorization URL for user-initiated login.

### 3.2 Logic Flow

```
1. Concatenate TD_AUTH_URL + redirect_uri param + client_id param
2. Return the full URL string
```

### 3.3 Invocation & Authentication

```javascript
generateAuthUrl() → String
```

- **Parameters**: None
- **Auth required**: None (generates the URL to begin auth)

### 3.4 Returns & Side Effects

- **Returns**: `String` — Full OAuth authorization URL
- **Side Effects**: None
- **DB Changes**: None

### 3.5 Snapshot Testing Data

```javascript
// Expected URL pattern:
"https://api.schwabapi.com/v1/oauth/authorize?redirect_uri=<GOOGLE_REDIRECT>&client_id=<TDAMERITRADE_KEY>"
```

### 3.6 Comprehensive Test Scenarios

| # | Category | Scenario | Expected Result |
|---|----------|----------|-----------------|
| 1 | Happy Path | Call with valid env vars | URL contains TD_AUTH_URL, redirect_uri, client_id |
| 2 | Structure | URL is properly formatted | Starts with `https://api.schwabapi.com/v1/oauth/authorize?` |
| 3 | Params | redirect_uri matches GOOGLE_REDIRECT | Exact match |
| 4 | Params | client_id matches TDAMERITRADE_KEY | Exact match |
| 5 | Idempotency | Called multiple times | Returns identical string each time |

---

## 4. Function: `getToken`

### 4.1 Purpose

Exchanges an authorization code for tokens **or** refreshes an expiring access token. Persists tokens to MongoDB and updates the in-memory `tokens` object.

### 4.2 Logic Flow

```
1. IF code is provided:
   a. Attempt regex match for "code=<value>" pattern
   b. IF regex matches → extract code from URL
   c. Build POST body: grant_type=authorization_code, decoded code, redirect_uri
2. ELSE IF tokens exist AND access_token expires within 590 seconds:
   a. Build POST body: grant_type=refresh_token, refresh_token
3. ELSE:
   a. Set qspost = null → resolve immediately (no action needed)
4. Build Basic Auth header (base64 of KEY:SECRET)
5. IF qspost is not null:
   a. POST to TD_TOKEN_URL with auth header + form body
   b. Parse JSON response
   c. IF response has error → handleError (reject)
   d. IF response has expires_in → compute expiry_date (now + expires_in)
   e. IF original code was provided → set refresh_token_expiry_date (now + 7 days)
   f. ELSE IF refresh_token expires within 3 days → sendWs warning notification
   g. Query MongoDB for existing 'tdameritrade' token record
   h. IF record exists → UPDATE with new token fields
   i. ELSE → INSERT new token record
   j. Update in-memory tokens object
6. ELSE:
   a. Return Promise.resolve() (no-op)
```

### 4.3 Invocation & Authentication

```javascript
getToken(code?: String) → Promise<void>
```

- **Parameters**:
  - `code` (optional): Raw authorization code or full callback URL containing `code=<value>`
- **Auth required**: Valid `TDAMERITRADE_KEY` + `TDAMERITRADE_SECRET` for Basic Auth header

### 4.4 Returns & Side Effects

- **Returns**: `Promise<void>` (resolves on success)
- **Side Effects**:
  - **Module state**: Updates `tokens` object with new token data
  - **DB Changes**: Upserts record in `accessToken` collection (`{api: 'tdameritrade'}`)
  - **WebSocket**: Sends token refresh warning via `sendWs` if refresh_token nears expiry
  - **Console**: Logs code, token response, and DB operation result

### 4.5 Snapshot Testing Data

#### Token API Response (authorization_code grant)

```json
{
  "access_token": "eyJ0eXAiOiJKV1...",
  "refresh_token": "dGhpcyBpcyBhIH...",
  "expires_in": 1800,
  "token_type": "Bearer",
  "scope": "api"
}
```

#### Token API Response (refresh_token grant)

```json
{
  "access_token": "bmV3IGFjY2Vzcw...",
  "expires_in": 1800,
  "token_type": "Bearer",
  "scope": "api"
}
```

#### Token API Error Response

```json
{
  "error": "invalid_grant"
}
```

#### POST Body (authorization_code)

```
grant_type=authorization_code&code=<decoded_code>&redirect_uri=<GOOGLE_REDIRECT>
```

#### POST Body (refresh_token)

```
grant_type=refresh_token&refresh_token=<refresh_token>
```

### 4.6 Comprehensive Test Scenarios

| # | Category | Scenario | Expected Result |
|---|----------|----------|-----------------|
| **Authorization Code Flow** | | | |
| 1 | Happy Path | Valid code string, no existing token in DB | POST with grant_type=authorization_code; INSERT new token; `tokens` updated |
| 2 | Happy Path | Valid code string, existing token in DB | POST with grant_type=authorization_code; UPDATE existing token |
| 3 | Code Parsing | Code passed as full URL `https://...?code=ABC123&state=xyz` | Extracts `ABC123` via regex |
| 4 | Code Parsing | Code passed as raw string (no `code=` prefix) | Uses code as-is |
| 5 | Code Parsing | URL-encoded code | `decodeURIComponent` applied correctly |
| 6 | Token Fields | Response includes `expires_in` | `expiry_date` computed as `floor(now/1000) + expires_in` |
| 7 | Token Fields | Code provided | `refresh_token_expiry_date` set to `floor(now/1000) + 604800` (7 days) |
| **Refresh Token Flow** | | | |
| 8 | Happy Path | No code; token expires within 590s | POST with grant_type=refresh_token |
| 9 | Branch: Near Expiry | Refresh token expires within 3 days (259200s) | `sendWs` called with warning message |
| 10 | Branch: Not Near Expiry | Refresh token valid for > 3 days | No sendWs warning |
| 11 | Token Fields | Response includes `expires_in` | `expiry_date` recomputed |
| 12 | Token Fields | No code (refresh) | `refresh_token_expiry_date` NOT overwritten |
| **No-Op Branch** | | | |
| 13 | Branch | No code and token not expiring (expiry_date ≥ now/1000 + 590) | Returns `Promise.resolve()`, no API call |
| 14 | Branch | No code and no tokens at all (`tokens = {}`) | `tokens.expiry_date` is undefined → condition is falsy → resolves |
| **Error Handling** | | | |
| 15 | API Error | Token response has `error` field | `handleError(HoError(token.error))` called → Promise rejected |
| 16 | Network Error | Fetch throws (network timeout, DNS failure) | Unhandled rejection propagates |
| 17 | Malformed Response | Response is not valid JSON | `.json()` throws → rejection |
| **DB Operations** | | | |
| 18 | DB: Update | Existing `accessToken` record found | `Mongo('update', 'accessToken', ...)` called; `Object.assign(tokens, token)` |
| 19 | DB: Insert | No existing `accessToken` record | `Mongo('insert', 'accessToken', ...)` called; `tokens = item[0]` |
| 20 | DB Error | MongoDB operation fails | Promise rejected with DB error |
| **Edge Cases** | | | |
| 21 | Edge | Code is empty string `""` | Falsy → falls into refresh/no-op branch |
| 22 | Edge | Code is `null` | Falls into refresh/no-op branch |
| 23 | Edge | `expires_in` is 0 | `expiry_date` set to current time (immediate expiry) |
| 24 | Edge | `expires_in` missing from response | `expiry_date` not set; token object stored without it |

---

## 5. Internal Function: `checkOauth`

### 5.1 Purpose

Ensures a valid OAuth token exists before making API calls. Loads from MongoDB if not in memory, then refreshes if needed.

### 5.2 Logic Flow

```
1. IF tokens.access_token is missing OR tokens.expiry_date is missing:
   a. Query MongoDB: find('accessToken', {api: 'tdameritrade'}, {limit: 1})
   b. IF no token found → handleError('can not find token')
   c. ELSE → load token into memory, then call getToken() to refresh if needed
2. ELSE:
   a. Call getToken() directly (refresh check only)
```

### 5.3 Invocation & Authentication

```javascript
checkOauth() → Promise<void>
```

- **Parameters**: None
- **Auth**: Reads from `tokens` module state or DB

### 5.4 Returns & Side Effects

- **Returns**: `Promise<void>`
- **Side Effects**: May update `tokens` from DB; may trigger token refresh
- **DB Changes**: Reads `accessToken` collection; may update via `getToken()`

### 5.5 Comprehensive Test Scenarios

| # | Category | Scenario | Expected Result |
|---|----------|----------|-----------------|
| 1 | Happy Path | `tokens` has valid `access_token` and `expiry_date` | Calls `getToken()` (refresh-only path) |
| 2 | Cold Start | `tokens` is empty `{}` | Queries MongoDB → loads token → calls `getToken()` |
| 3 | Missing access_token | `tokens.expiry_date` exists but no `access_token` | Queries MongoDB first |
| 4 | Missing expiry_date | `tokens.access_token` exists but no `expiry_date` | Queries MongoDB first |
| 5 | DB Empty | No token record in MongoDB | `handleError('can not find token')` → rejected |
| 6 | DB Error | MongoDB query fails | Promise rejected with DB error |
| 7 | Token Loaded | Token loaded from DB, not yet expired | `getToken()` returns `Promise.resolve()` (no-op) |
| 8 | Token Loaded + Expired | Token loaded from DB, expiry imminent | `getToken()` performs refresh |

---

## 6. Internal Function: `cancelTDOrder`

### 6.1 Purpose

Cancels a specific open order on the Schwab brokerage account by order ID.

### 6.2 Logic Flow

```
1. IF encryptedId is null → handleError('TD cannot cancel order!!!')
2. Call checkOauth() to ensure valid token
3. DELETE https://api.schwabapi.com/trader/v1/accounts/{encryptedId}/orders/{id}
   - Header: Authorization: Bearer {access_token}
4. IF response is not OK:
   a. Decrement updateTime['trade'] (floor at 0)
   b. Parse error JSON → handleError with error message
5. CATCH any error:
   a. Decrement updateTime['trade'] (floor at 0)
   b. Re-reject the error
```

### 6.3 Invocation & Authentication

```javascript
cancelTDOrder(id: Number|String) → Promise<void>
```

- **Parameters**:
  - `id`: The Schwab order ID to cancel
- **Auth**: Requires valid `tokens.access_token` and non-null `encryptedId`

### 6.4 Returns & Side Effects

- **Returns**: `Promise<void>` on success
- **Side Effects**:
  - `updateTime['trade']` decremented on failure (minimum 0)
  - HTTP DELETE to Schwab API

### 6.5 Comprehensive Test Scenarios

| # | Category | Scenario | Expected Result |
|---|----------|----------|-----------------|
| 1 | Happy Path | Valid encryptedId, valid token, order exists | DELETE request sent; resolves |
| 2 | Guard | `encryptedId` is null | handleError('TD cannot cancel order!!!') immediately |
| 3 | API Error | Response `!res.ok` (e.g., 404, 400) | `updateTime['trade']` decremented; handleError with parsed message |
| 4 | Network Error | Fetch throws | `updateTime['trade']` decremented; Promise.reject(err) |
| 5 | Auth Expired | `checkOauth()` triggers token refresh before API call | Token refreshed → then DELETE proceeds |
| 6 | Auth Failure | `checkOauth()` rejects (no token in DB) | Promise rejected; no DELETE sent |
| 7 | Edge: trade=0 | `updateTime['trade']` is 0 and error occurs | Remains at 0 (floor logic: `< 1 ? 0`) |
| 8 | Edge: trade=1 | `updateTime['trade']` is 1 and error occurs | Decremented to 0 |

---

## 7. Internal Function: `submitTDOrder`

### 7.1 Purpose

Submits a buy or sell order (MARKET or LIMIT) to the Schwab brokerage account.

### 7.2 Logic Flow

```
1. IF encryptedId is null → handleError('TD cannot cancel order!!!')
2. IF id is 'BRK-B' → remap to 'BRK/B' (Schwab symbol format)
3. Build JSON order payload:
   - duration: "GOOD_TILL_CANCEL"
   - orderStrategyType: "SINGLE"
   - instruction: count > 0 ? 'BUY' : 'SELL'
   - quantity: Math.abs(count)
   - symbol: id, assetType: "EQUITY"
   - IF price === 'MARKET': orderType="MARKET", session="NORMAL"
   - ELSE: orderType="LIMIT", price=price, session="NORMAL"
4. Call checkOauth()
5. POST to https://api.schwabapi.com/trader/v1/accounts/{encryptedId}/orders
   - Headers: Authorization Bearer, Content-Type application/json
   - Body: JSON payload
6. IF response is not OK:
   a. Decrement updateTime['trade'] (floor at 0)
   b. Log symbol and price
   c. Parse error JSON → handleError with message
7. CATCH any error:
   a. Decrement updateTime['trade'] (floor at 0)
   b. Re-reject
```

### 7.3 Invocation & Authentication

```javascript
submitTDOrder(id: String, price: Number|'MARKET', count: Number) → Promise<void>
```

- **Parameters**:
  - `id`: Stock ticker symbol (e.g., `'AAPL'`, `'BRK-B'`)
  - `price`: Limit price as number, or the string `'MARKET'` for market orders
  - `count`: Positive = BUY, Negative = SELL; absolute value = quantity

### 7.4 Returns & Side Effects

- **Returns**: `Promise<void>` on success
- **Side Effects**:
  - HTTP POST to Schwab API (real order placed)
  - `updateTime['trade']` decremented on failure

### 7.5 Snapshot Testing Data

#### LIMIT BUY Order Payload

```json
{
  "duration": "GOOD_TILL_CANCEL",
  "orderStrategyType": "SINGLE",
  "orderLegCollection": [{
    "instruction": "BUY",
    "quantity": 10,
    "instrument": { "symbol": "AAPL", "assetType": "EQUITY" }
  }],
  "orderType": "LIMIT",
  "price": 170.50,
  "session": "NORMAL"
}
```

#### MARKET SELL Order Payload

```json
{
  "duration": "GOOD_TILL_CANCEL",
  "orderStrategyType": "SINGLE",
  "orderLegCollection": [{
    "instruction": "SELL",
    "quantity": 5,
    "instrument": { "symbol": "BRK/B", "assetType": "EQUITY" }
  }],
  "orderType": "MARKET",
  "session": "NORMAL"
}
```

### 7.6 Comprehensive Test Scenarios

| # | Category | Scenario | Expected Result |
|---|----------|----------|-----------------|
| 1 | Happy Path | LIMIT BUY, count=10, price=170.50, symbol='AAPL' | POST with instruction=BUY, quantity=10, orderType=LIMIT |
| 2 | Happy Path | MARKET SELL, count=-5, symbol='MSFT' | POST with instruction=SELL, quantity=5, orderType=MARKET |
| 3 | Symbol Remap | id='BRK-B' | Payload symbol is 'BRK/B' |
| 4 | Symbol Normal | id='AAPL' (no remap needed) | Payload symbol is 'AAPL' |
| 5 | Branch: MARKET | price='MARKET' | `orderType: "MARKET"`, `session: "NORMAL"`, no `price` field |
| 6 | Branch: LIMIT | price=150.00 | `orderType: "LIMIT"`, `price: 150.00`, `session: "NORMAL"` |
| 7 | Branch: BUY | count > 0 (e.g., 3) | instruction='BUY', quantity=3 |
| 8 | Branch: SELL | count < 0 (e.g., -7) | instruction='SELL', quantity=7 |
| 9 | Guard | encryptedId is null | handleError immediately; no API call |
| 10 | API Error | Response `!res.ok` | updateTime['trade'] decremented; handleError with parsed message |
| 11 | Network Error | Fetch throws | updateTime['trade'] decremented; Promise.reject |
| 12 | Edge | count=0 | instruction='SELL' (0 is not > 0), quantity=0 |
| 13 | Edge | count=1 | instruction='BUY', quantity=1 |
| 14 | Edge | price=0 | LIMIT order with price=0 |
| 15 | Auth | Token expired before call | checkOauth refreshes token first, then submits |

---

## 8. Function: `usseTDInit`

### 8.1 Purpose

Main orchestration function called on a recurring interval (~10 min). Performs:
1. OAuth check
2. Account initialization (fetch `encryptedId`)
3. Book/position refresh from Schwab API
4. Order history processing + profit calculation
5. Fake order simulation for under-funded trades
6. Automated order placement (cancel stale → sell → buy) based on suggestion data

This is the most complex function in the module (lines 147–786).

### 8.2 Logic Flow — Top Level

```
1. checkOauth()
2. initWs():
   a. IF encryptedId is null → fetch account numbers from Schwab API
      - IF response has 'message' → error
      - IF result[0] exists → set encryptedId = result[0].hashValue
      - ELSE → error "No account"
   b. ELSE → resolve (already initialized)
3. initialBook(force=false):
   a. IF encryptedId is null → error
   b. IF NOT force AND (now - updateTime['book']) <= UPDATE_ORDER → no-op ("TD no new")
   c. Set updateTime['book'] = now
   d. GET account positions from Schwab API
   e. Parse response: extract balances, positions
   f. Process fakeOrders (check if price trigger met)
   g. GET order history (last 30 days)
   h. Process each order recursively (order_recur):
      - Cancelable orders → add to order[] array
      - Partially/fully filled cancelable orders → update DB previous buy/sell + profit
      - Non-cancelable filled or fake orders → update DB previous buy/sell + profit
      - Skip all others
4. Increment updateTime['trade']
5. IF trade counter NOT at order interval threshold → return (skip trading logic)
6. IF within market hours (USSE_MARKET_TIME) → decrement trade counter, return
7. Fetch all USSE items from TOTALDB
8. For each item (recur_status):
   a. Skip if index=0 or no suggestion data
   b. Apply market cap multiplier if present
   c. IF ing=2 → cancel all orders + sell all positions + delete from DB
   d. IF ing=1 → proceed to add to newOrder queue (cancel existing orders first)
   e. IF ing=0 → check entry threshold; if met, set ing=1 and proceed
9. For each newOrder (recur_NewOrder):
   a. Submit SELL if sCount > 0, else push fakeOrder for sell
   b. Then submit BUY if bCount > 0 (with available funds check), else push fakeOrder for buy
```

### 8.3 Logic Flow — `initialBook` Inner Function (Position & Order Processing)

```
initialBook(force):
├── Guard: encryptedId null → error
├── Throttle: now - updateTime['book'] <= UPDATE_ORDER → skip (unless force)
├── GET /accounts/{id}?fields=positions
│   ├── Error: result['message'] → decrement trade (if force), error
│   ├── Error: no securitiesAccount → decrement trade (if force), error
│   ├── Extract available balances from projectedBalances
│   ├── Save lastP = [...position] (snapshot before update)
│   ├── Map positions → position[] array
│   └── Reset order = []
├── Process fakeOrder array:
│   ├── For each undone fake buy: if current price <= order price → mark done, push to orderStrategies
│   └── For each undone fake sell: if current price >= order price → mark done, push to orderStrategies
├── GET /accounts/{id}/orders?fromEnteredTime=...&toEnteredTime=...
│   ├── Error: result['error'] → decrement trade (if force), error
│   └── Recursive order_recur(index):
│       ├── IF cancelable:
│       │   ├── Push to order[] (normalize BRK symbols, compute partial flag)
│       │   ├── IF partially filled:
│       │   │   ├── Collect execution legs (time, price, profit per leg)
│       │   │   ├── Find item in TOTALDB by symbol
│       │   │   ├── IF BUY: insert into previous.buy (sorted by price asc), update previous if recent
│       │   │   └── IF SELL: insert into previous.sell (sorted by price desc), update previous if recent
│       │   │       └── Calculate profit from execution legs (deduct fee, compare with position changes)
│       │   └── Update TOTALDB: previous + profit
│       ├── ELSE IF fake OR non-cancelable filled:
│       │   ├── Same logic as cancelable+filled but with fake order handling
│       │   ├── Fake orders: use order's own price/time instead of execution legs
│       │   ├── Fake BUY: set tprice instead of time in previous
│       │   └── Profit calculation: skipped for fake orders
│       └── ELSE: skip (next index)
```

### 8.4 Logic Flow — Trading Decision (recur_status & recur_NewOrder)

```
recur_status(index):
├── Skip: index=0 or no suggestion data
├── Apply multiplier: item.orig *= mul, item.times = floor(times * mul)
├── cancelOrder(rest):
│   ├── initialBook(force=true)
│   ├── Filter orders for this symbol
│   └── Cancel each non-partial order (with API_WAIT delay between)
├── IF item.ing === 2 (liquidate):
│   ├── cancelOrder → sellAll
│   │   ├── initialBook(force=true)
│   │   ├── Find position count for this symbol
│   │   ├── IF count > 0 → submitTDOrder MARKET SELL
│   │   └── deleteMany from TOTALDB
├── IF item.ing === 1 (active trading):
│   ├── IF price exists → cancelOrder → push to newOrder queue (sorted by amount desc)
│   └── ELSE → skip
├── IF item.ing === 0 (watching):
│   ├── IF (price - mid) / mid * 100 < USSE_ENTER_MID → set ing=1, proceed as ing=1
│   └── ELSE → skip ("enter_mid" not met)

recur_NewOrder(index):
├── submitBuy():
│   ├── initialBook(force=true) → check available funds
│   ├── Compute order_avail = max(0, tradable - 300)
│   ├── IF order_avail < bCount * buy * 4/3 (insufficient margin):
│   │   ├── IF order_avail < bCount * buy * 2/3 → zero out buy order
│   │   └── ELSE → reduce bCount to floor(avail / buy)
│   ├── IF bCount > 0 AND buy price → submitTDOrder(symbol, buy, bCount)
│   │   ├── Catch: "oversold/overbought" → increment trade, warn, swallow error
│   │   └── Catch: other errors → re-reject
│   ├── ELSE IF buy price exists (but count=0) → push fakeOrder
│   └── ELSE → skip
├── IF sCount > 0 AND sell price → submitTDOrder(symbol, sell, -sCount) → then submitBuy
│   ├── Catch: "oversold/overbought" → increment trade, warn, swallow error
│   └── Catch: other errors → re-reject
├── ELSE IF sell price (but count=0) → push fakeOrder → submitBuy
└── ELSE → submitBuy
```

### 8.5 Invocation & Authentication

```javascript
usseTDInit() → Promise<void>
```

- **Parameters**: None (uses module state + DB + suggestion data)
- **Auth**: Full OAuth chain via `checkOauth`; requires valid `encryptedId`

### 8.6 Returns & Side Effects

- **Returns**: `Promise<void>`
- **Side Effects**:
  - **Module state**: Updates `encryptedId`, `updateTime`, `available`, `order`, `position`, `fakeOrder`
  - **DB Changes**: Updates `total` collection (`previous`, `profit` fields); may delete records (`ing=2`)
  - **API Calls**: Multiple Schwab API calls (account info, positions, orders, cancel, submit)
  - **WebSocket**: Sends error/warning notifications via `sendWs`

### 8.7 Snapshot Testing Data

#### Schwab Account Numbers Response

```json
[{ "accountNumber": "12345678", "hashValue": "ENCRYPTED_HASH_ABC123" }]
```

#### Schwab Account Positions Response

```json
{
  "securitiesAccount": {
    "projectedBalances": {
      "cashAvailableForWithdrawal": 15000.00
    },
    "currentBalances": {
      "totalCash": 20000.00
    },
    "positions": [
      {
        "instrument": { "symbol": "AAPL" },
        "longQuantity": 10,
        "averagePrice": 172.50
      }
    ],
    "orderStrategies": []
  }
}
```

#### Schwab Order History Response (array)

```json
[
  {
    "orderId": 98765432,
    "cancelable": true,
    "enteredTime": "2024-03-15T10:30:00Z",
    "orderType": "LIMIT",
    "price": 170.00,
    "quantity": 10,
    "duration": "GOOD_TILL_CANCEL",
    "orderLegCollection": [{
      "instruction": "BUY",
      "instrument": { "symbol": "AAPL" }
    }],
    "orderActivityCollection": null
  },
  {
    "orderId": 98765433,
    "cancelable": false,
    "enteredTime": "2024-03-14T14:00:00Z",
    "orderType": "LIMIT",
    "price": 175.00,
    "quantity": 5,
    "duration": "GOOD_TILL_CANCEL",
    "orderLegCollection": [{
      "instruction": "SELL",
      "instrument": { "symbol": "AAPL" }
    }],
    "orderActivityCollection": [{
      "executionType": "FILL",
      "executionLegs": [{
        "time": "2024-03-14T14:05:00Z",
        "price": 175.25,
        "quantity": 5
      }]
    }]
  }
]
```

#### TOTALDB Item (USSE stock record)

```json
{
  "_id": "ObjectId(...)",
  "setype": "usse",
  "index": "AAPL",
  "ing": 1,
  "amount": 5000,
  "orig": 10000,
  "mid": 170.00,
  "times": 4,
  "mul": null,
  "profit": 250.50,
  "previous": {
    "price": 172.50,
    "time": 1710600000,
    "type": "buy",
    "buy": [
      { "price": 165.00, "time": 1710500000 },
      { "price": 170.00, "time": 1710600000 }
    ],
    "sell": [
      { "price": 180.00, "time": 1710400000 }
    ]
  }
}
```

#### Suggestion Data (`getSuggestionData('usse')`)

```json
{
  "AAPL": {
    "price": 173.25,
    "buy": 170.00,
    "sell": 180.00,
    "bCount": 3,
    "sCount": 2,
    "type": 6,
    "str": "Buy 3/4 170.00 ( 3 )"
  }
}
```

### 8.8 Comprehensive Test Scenarios

#### 8.8.1 Initialization (initWs)

| # | Category | Scenario | Expected Result |
|---|----------|----------|-----------------|
| 1 | Happy Path | encryptedId is null, API returns valid account | encryptedId set to hashValue |
| 2 | Already Init | encryptedId already set | Resolves immediately (no API call) |
| 3 | API Error | Response has `message` field | handleError with message |
| 4 | No Account | Response is empty array `[]` | handleError("No account") |
| 5 | Multiple Accounts | Response has multiple entries | Uses `result[0].hashValue` only |

#### 8.8.2 Book/Position Refresh (initialBook)

| # | Category | Scenario | Expected Result |
|---|----------|----------|-----------------|
| 6 | Guard | encryptedId is null | handleError('TD cannot be inital book!!!') |
| 7 | Throttle | `now - updateTime['book'] <= UPDATE_ORDER`, force=false | No-op; logs "TD no new" |
| 8 | Throttle | force=true bypasses time check | Proceeds with API call |
| 9 | Happy Path | Valid positions response | `position` updated, `available` updated, `order` reset |
| 10 | No Positions | `positions` key missing from response | `position` set to empty array |
| 11 | No Balances | `projectedBalances` missing | `available` not updated (retains previous values) |
| 12 | API Error | Response has `message` | handleError; if force=true, decrements updateTime['trade'] |
| 13 | Missing Account | `securitiesAccount` missing from response | handleError('miss securitiesAccount') |
| 14 | BRK Symbol | Position has symbol `BRK/B` or `BRK.B` | Normalized to `BRK-B` in order array |

#### 8.8.3 Fake Order Processing

| # | Category | Scenario | Expected Result |
|---|----------|----------|-----------------|
| 15 | Fake Buy Trigger | Fake buy order exists, current price ≤ order price | Marked done, pushed to orderStrategies |
| 16 | Fake Buy No Trigger | Fake buy order exists, current price > order price | Not marked done |
| 17 | Fake Sell Trigger | Fake sell order exists, current price ≥ order price | Marked done, pushed to orderStrategies |
| 18 | Fake Sell No Trigger | Fake sell order exists, current price < order price | Not marked done |
| 19 | Already Done | Fake order already has `done=true` | Skipped |
| 20 | No Price Data | `usseSuggestion[symbol].price` is falsy (0 or undefined) | Not triggered |
| 21 | Edge | No fake orders | fakeOrder loop executes zero iterations |

#### 8.8.4 Order History Processing (order_recur)

| # | Category | Scenario | Expected Result |
|---|----------|----------|-----------------|
| 22 | Cancelable, No Fill | Cancelable order, no orderActivityCollection | Added to order[]; no DB update |
| 23 | Cancelable, Partial Fill | Cancelable with executionType='PARTIALFILL' | Added to order[] with partial=true; DB previous updated |
| 24 | Cancelable, Full Fill | Cancelable with executionType='FILL' | Added to order[] with partial=true; DB previous + profit updated |
| 25 | Non-Cancelable, Filled | Not cancelable, has FILL execution | DB previous + profit updated; not added to order[] |
| 26 | Fake Order | Has `fake: true` flag | DB previous updated; profit calculation skipped |
| 27 | Neither | Not cancelable, not filled, not fake | Skipped entirely |
| 28 | BUY Fill | BUY instruction, filled | previous.buy updated (sorted insert by price ascending) |
| 29 | SELL Fill | SELL instruction, filled | previous.sell updated (sorted insert by price descending) |
| 30 | Duplicate | Same price+time already in previous.buy/sell | Skipped (dedup check) |
| 31 | Recent Order | Order entered within USSE_ORDER_INTERVAL | `previous` object fully replaced with new price/time/type |
| 32 | Old Order | Order older than USSE_ORDER_INTERVAL | Only buy/sell arrays updated; previous.price/time/type unchanged |
| 33 | Range Filter | Entries older than RANGE_INTERVAL (90 days) | Filtered out from buy/sell arrays |
| 34 | Price ≤ 0 | Execution price is zero or negative | Skip DB update, proceed to next order |
| 35 | Symbol Not in DB | Symbol not found in TOTALDB | Log miss, proceed to next order |
| 36 | Empty Orders | Result array is empty | order_recur resolves immediately |
| 37 | 'PARTIAL FILL' | executionType string with space | Treated same as 'PARTIALFILL' |

#### 8.8.5 Profit Calculation

| # | Category | Scenario | Expected Result |
|---|----------|----------|-----------------|
| 38 | Profit: SELL | SELL order filled, lastP has matching symbol | profit = Σ(legs × price × (1 - USSE_FEE)) - previousCost + currentCost |
| 39 | No Previous Position | lastP is empty | profit = 0 |
| 40 | Symbol Not in lastP | Symbol missing from lastP array | pp=0 → profit=0 |
| 41 | Position Unchanged | lastP amount === current position amount (peq=true) | profit = 0 (positions didn't actually change) |
| 42 | Multiple Legs | Multiple executionLegs in orderActivityCollection | All legs processed; last matching leg sets final time/price |
| 43 | Duplicate Leg Check | Execution leg already in previous.sell (is_insert ≥ 2) | Stops accumulating profit at that leg |
| 44 | Cumulative Profit | item.profit already has value | New profit added to existing |
| 45 | Zero Initial Profit | item.profit is falsy (0 or undefined) | Initialized to computed profit |
| 46 | Fake Order SELL | Fake order type SELL | Profit calculation skipped entirely |

#### 8.8.6 Trade Counter & Market Hours

| # | Category | Scenario | Expected Result |
|---|----------|----------|-----------------|
| 47 | Counter | trade counter not at interval threshold | Returns after initialBook; no trading logic |
| 48 | Counter | trade counter at threshold (modulo match) | Proceeds to trading logic |
| 49 | Market Hours (Wrap) | USSE_MARKET_TIME=[16,9]; hour=20 (8pm UTC) | Within market hours → decrement trade, skip |
| 50 | Market Hours (Wrap) | USSE_MARKET_TIME=[16,9]; hour=3 (3am UTC) | Within market hours → decrement trade, skip |
| 51 | Outside Market | USSE_MARKET_TIME=[16,9]; hour=12 (noon UTC) | Outside market → proceed with trading |
| 52 | Market Hours (Normal) | USSE_MARKET_TIME=[9,16]; hour=12 | Within hours → decrement, skip |
| 53 | Edge: Hour=16 | Hour exactly equals USSE_MARKET_TIME[0] (start boundary) | `>=` → within hours (for wrap case); `>=` for normal |
| 54 | Edge: Hour=9 | Hour exactly equals USSE_MARKET_TIME[1] (end boundary) | `<` → NOT within hours |

#### 8.8.7 Trading Decisions (recur_status)

| # | Category | Scenario | Expected Result |
|---|----------|----------|-----------------|
| 55 | Skip | item.index === 0 | Skipped |
| 56 | Skip | No suggestion data for item.index | Skipped |
| 57 | Multiplier | item.mul=2 | orig doubled, times = floor(times × 2) |
| 58 | No Multiplier | item.mul is falsy | orig/times unchanged |
| 59 | ing=2 (Liquidate) | Item marked for liquidation | Cancel orders → sell all at MARKET → delete from DB |
| 60 | ing=2, No Position | Liquidation but position count=0 | Cancel orders → delete from DB (no sell) |
| 61 | ing=1 (Active) | Active trading, price available | Cancel existing → add to newOrder queue |
| 62 | ing=1, No Price | Active but no price data | Skipped |
| 63 | ing=0 (Watch) | Entry threshold met: `(price-mid)/mid*100 < 100` | Set ing=1 in DB → proceed as active |
| 64 | ing=0, Threshold Not Met | `(price-mid)/mid*100 >= 100` | Skipped ("enter_mid" not met) |
| 65 | Cancel Partial | Order has `partial=true` | Not cancelled (skipped in real_delete) |

#### 8.8.8 Order Submission (recur_NewOrder)

| # | Category | Scenario | Expected Result |
|---|----------|----------|-----------------|
| 66 | Sell + Buy | sCount > 0 and bCount > 0 | submitTDOrder SELL → wait → submitBuy |
| 67 | Sell Only | sCount > 0, bCount = 0, buy price exists | SELL submitted → fakeOrder for buy |
| 68 | Buy Only | sCount = 0, bCount > 0 | No sell → submitBuy directly |
| 69 | Neither | sCount = 0, bCount = 0 | No orders; possible fakeOrders |
| 70 | Fake Sell | sell price exists but sCount = 0 | fakeOrder pushed for sell → proceed to submitBuy |
| 71 | Fake Buy | buy price exists but bCount = 0 | fakeOrder pushed for buy |
| 72 | Funds: Sufficient | order_avail ≥ bCount × buy × 4/3 | Full buy order submitted |
| 73 | Funds: Partial | order_avail between 2/3 and 4/3 of needed | bCount reduced to floor(avail/buy) |
| 74 | Funds: Insufficient | order_avail < bCount × buy × 2/3 | bCount and buy zeroed; fakeOrder instead |
| 75 | Funds: Low Tradable | tradable ≤ 300 | order_avail = 0 → buy zeroed |
| 76 | Error: Oversold | Submit returns "oversold/overbought" error | updateTime['trade'] incremented; error swallowed; continues |
| 77 | Error: Other | Submit returns non-oversold error | Promise.reject; halts further orders |
| 78 | API Wait | Between sell and buy submissions | 10-second delay (API_WAIT × 2000ms) |
| 79 | Order Sorting | newOrder array sorted by item.amount descending | Higher-amount items processed first |

#### 8.8.9 Error Handling

| # | Category | Scenario | Expected Result |
|---|----------|----------|-----------------|
| 80 | OAuth Failure | checkOauth rejects | Entire usseTDInit rejects |
| 81 | initWs Error | Account fetch fails | Propagated; initialBook not called |
| 82 | initialBook Error | Position fetch fails | Propagated; trading logic not executed |
| 83 | Order API Error | Order history fetch returns error | handleError; if force, trade counter decremented |
| 84 | cancelOrder Error | Cancel API fails | Error caught; sendWs notification sent; continues to next order |
| 85 | DB Error | Mongo update/find fails | Promise rejected; propagated up |

---

## 9. Function: `getUssePosition`

### 9.1 Purpose

Returns the current portfolio position array, normalizing BRK symbols and ensuring a cash entry exists.

### 9.2 Logic Flow

```
1. Iterate over position array:
   a. IF symbol === 0 → set is_exist = true
   b. IF symbol is 'BRK.B' or 'BRK/B' → normalize to 'BRK-B'
2. IF no cash entry exists (is_exist === false):
   a. Push {symbol: 0, amount: 1, price: available.cash} to position
3. Return position array
```

### 9.3 Invocation & Authentication

```javascript
getUssePosition() → Array<{symbol: String|Number, amount: Number, price: Number}>
```

- **Parameters**: None
- **Auth**: None (reads module state)

### 9.4 Returns & Side Effects

- **Returns**: `Array` — Position objects
- **Side Effects**: **Mutates** the module-level `position` array (normalizes symbols, may push cash entry)

### 9.5 Snapshot Testing Data

```json
[
  { "symbol": "AAPL", "amount": 10, "price": 172.50 },
  { "symbol": "BRK-B", "amount": 5, "price": 410.20 },
  { "symbol": 0, "amount": 1, "price": 20000.00 }
]
```

### 9.6 Comprehensive Test Scenarios

| # | Category | Scenario | Expected Result |
|---|----------|----------|-----------------|
| 1 | Happy Path | Positions populated, no cash entry | Cash entry appended with `available.cash` |
| 2 | Cash Exists | Position already has `symbol: 0` entry | No duplicate cash entry added |
| 3 | BRK.B Normalize | Position has `symbol: 'BRK.B'` | Changed to `'BRK-B'` |
| 4 | BRK/B Normalize | Position has `symbol: 'BRK/B'` | Changed to `'BRK-B'` |
| 5 | Empty Positions | `position` is empty array | Returns `[{symbol: 0, amount: 1, price: available.cash}]` |
| 6 | Multiple BRK | Both BRK.B and BRK/B in positions | Both normalized to BRK-B |
| 7 | Idempotency | Called twice consecutively | Second call detects existing cash entry; no duplicate |
| 8 | Cash Value | `available.cash` is 0 | Cash entry has `price: 0` |
| 9 | Mutation | Caller modifies returned array | Module-level `position` is also modified (same reference) |

---

## 10. Function: `getUsseOrder`

### 10.1 Purpose

Returns the current open (cancelable) orders array.

### 10.2 Logic Flow

```
1. Return order array (direct reference)
```

### 10.3 Invocation & Authentication

```javascript
getUsseOrder() → Array<Object>
```

- **Parameters**: None
- **Auth**: None

### 10.4 Returns & Side Effects

- **Returns**: `Array` — Direct reference to module-level `order` array
- **Side Effects**: None

### 10.5 Comprehensive Test Scenarios

| # | Category | Scenario | Expected Result |
|---|----------|----------|-----------------|
| 1 | Happy Path | Orders populated | Returns order array with order objects |
| 2 | Empty | No orders | Returns `[]` |
| 3 | Reference | Mutate returned array | Module state also mutated (same reference) |

---

## 11. Function: `resetTD`

### 11.1 Purpose

Resets the book update timer while preserving the trade counter. Used to force a position refresh on the next cycle.

### 11.2 Logic Flow

```
1. Log 'TD reset'
2. Save current trade_count = updateTime['trade']
3. Reset updateTime to empty object {}
4. Set updateTime['book'] = 0
5. Set updateTime['trade'] = saved trade_count
```

### 11.3 Invocation & Authentication

```javascript
resetTD(update?: Boolean) → void
```

- **Parameters**:
  - `update` (optional, default `false`): Declared but **not used** in function body
- **Auth**: None

### 11.4 Returns & Side Effects

- **Returns**: `undefined` (void)
- **Side Effects**: Resets `updateTime` object; `book` set to 0; `trade` preserved

### 11.5 Comprehensive Test Scenarios

| # | Category | Scenario | Expected Result |
|---|----------|----------|-----------------|
| 1 | Happy Path | updateTime has both book and trade values | book reset to 0; trade preserved |
| 2 | Initial State | updateTime = {book: 0, trade: 0} | Remains {book: 0, trade: 0} |
| 3 | High Trade | updateTime['trade'] = 100 | After reset: trade = 100, book = 0 |
| 4 | Param Ignored | `resetTD(true)` vs `resetTD(false)` vs `resetTD()` | All produce identical results |
| 5 | Extra Keys | updateTime has extra keys (e.g., updateTime['foo'] = 1) | Extra keys discarded (object replaced) |

---

## 12. Cross-Cutting Concerns

### 12.1 Authentication & Token Lifecycle

| Scenario | Test Approach |
|----------|---------------|
| Token cold start (no tokens in memory or DB) | Mock Mongo('find') to return empty → verify error handling |
| Token in DB but expired | Mock Mongo('find') → valid record, mock Fetch for refresh → verify new token stored |
| Token refresh race condition | Two concurrent `checkOauth()` calls → verify no duplicate DB writes |
| Refresh token near expiry (<3 days) | Verify `sendWs` warning triggered |
| Refresh token expired | Verify error propagation |
| Basic Auth header | Verify base64 encoding of `KEY:SECRET` |

### 12.2 Rate Limiting & Throttling

| Scenario | Test Approach |
|----------|---------------|
| `updateTime['book']` throttle | Verify `initialBook` skips when called within `UPDATE_ORDER` seconds |
| `updateTime['trade']` counter modulo | Verify trading logic only fires at correct interval |
| `API_WAIT` delays | Verify `setTimeout` calls between sequential API requests |
| Trade counter decrement on error | Verify counter doesn't go below 0 |
| Trade counter increment on "oversold" error | Verify counter recovery |

### 12.3 Symbol Normalization

| Input | Expected Output | Context |
|-------|----------------|---------|
| `'BRK-B'` | `'BRK/B'` | `submitTDOrder` (outbound to Schwab API) |
| `'BRK/B'` | `'BRK-B'` | Order/position processing (inbound from Schwab API) |
| `'BRK.B'` | `'BRK-B'` | Order/position processing (inbound from Schwab API) |
| `'AAPL'` | `'AAPL'` | No transformation needed |

### 12.4 State Mutation Safety

| Concern | Detail |
|---------|--------|
| `position` array mutation | `getUssePosition` mutates the shared array (pushes cash entry, normalizes symbols) — test for idempotency |
| `order` array reference leak | `getUsseOrder` returns a direct reference — external mutations affect internal state |
| `tokens` object merge | `Object.assign(tokens, token)` vs `tokens = item[0]` — different behaviors for update vs insert |
| `fakeOrder` shared state | Modified in both `initialBook` (mark done) and `recur_NewOrder` (push new) within same cycle |

### 12.5 Market Hours Logic

```
USSE_MARKET_TIME = [16, 9]  (wraps midnight: 16:00 UTC → 09:00 UTC)

Hour:   0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23
Market: ■  ■  ■  ■  ■  ■  ■  ■  ■  □  □  □  □  □  □  □  ■  ■  ■  ■  ■  ■  ■  ■
                                     └── Trading allowed ──┘
■ = Market hours (no trading)  □ = Off-market (trading allowed)
```

---

## 13. Mock & Fixture Strategy

### 13.1 Required Mocks

| Dependency | Mock Type | Notes |
|------------|-----------|-------|
| `node-fetch` | Function mock | Return configurable Response objects with `.ok`, `.json()` |
| `Mongo` (mongo-tool.js) | Function mock | Return configurable arrays/results per operation+collection |
| `getSuggestionData` | Function mock | Return configurable suggestion objects keyed by symbol |
| `sendWs` | Function mock | Verify call arguments (message, adultonly, auth, ds) |
| `TDAMERITRADE_KEY` | Constant | Fixed test value (e.g., `'TEST_KEY'`) |
| `TDAMERITRADE_SECRET` | Constant | Fixed test value (e.g., `'TEST_SECRET'`) |
| `GOOGLE_REDIRECT` | Constant | Fixed test value (e.g., `'https://localhost/callback'`) |
| `Date.now` / `new Date()` | Spy/mock | Control time for expiry checks, throttle logic, market hours |

### 13.2 Fixture Data Files

| Fixture | Purpose |
|---------|---------|
| `schwab-account-numbers.json` | Mock response for `/accounts/accountNumbers` |
| `schwab-positions.json` | Mock response for account positions (with/without positions/balances) |
| `schwab-orders-empty.json` | Empty order array |
| `schwab-orders-mixed.json` | Array with cancelable, filled, partial, and fake orders |
| `schwab-token-auth.json` | Token response for authorization_code grant |
| `schwab-token-refresh.json` | Token response for refresh_token grant |
| `schwab-error.json` | Various error responses (`{error: "..."}`, `{message: "..."}`) |
| `totaldb-usse-items.json` | Sample TOTALDB records with various `ing` states (0, 1, 2) |
| `suggestion-data-usse.json` | Mock suggestion data with buy/sell signals |

### 13.3 State Reset Strategy

Since this module uses closure-scoped mutable state, tests must either:

1. **Re-import the module** per test (using Jest `isolateModules` or dynamic `import()`) to reset all state variables to their initial values
2. **Use `resetTD()`** for partial reset (only resets `updateTime`), then manually verify other state
3. **Expose internal state** via a test-only helper (not recommended for production)

### 13.4 Test Isolation Recommendations

```
Before each test:
├── Reset module state (fresh import or manual reset)
├── Reset all Fetch mocks
├── Reset Mongo mocks
├── Reset Date.now mock
└── Clear sendWs call history

After each test:
├── Verify no unhandled promise rejections
├── Verify no unexpected Fetch calls
└── Clear all timers (fake timers recommended)
```

### 13.5 Coverage Targets

| Function | Lines | Branches | Minimum Target |
|----------|-------|----------|---------------|
| `generateAuthUrl` | 1 | 0 | 100% |
| `getToken` | 30 | 12 | 100% |
| `checkOauth` | 8 | 4 | 100% |
| `cancelTDOrder` | 13 | 4 | 100% |
| `submitTDOrder` | 37 | 8 | 100% |
| `usseTDInit` | ~640 | ~80 | 95%+ |
| `getUssePosition` | 16 | 6 | 100% |
| `getUsseOrder` | 1 | 0 | 100% |
| `resetTD` | 5 | 0 | 100% |
| **Total Module** | **815** | **~114** | **95%+** |

---

> **Document Version**: 1.0
> **Source**: `src/back/models/tdameritrade-tool.js` (815 lines)
> **Conformance**: OUTLINE.md §11 — QA Testing Scope & Strategy
> **Approach**: Mock HTTP (node-fetch) + Mock DB (mongo-tool) + Controlled time (Date.now) + Jest `isolateModules` for state reset
