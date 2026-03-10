# Technical Documentation: Bitfinex Router (`src/back/controllers/bitfinex-router.js`)

## 1. Overview
The `bitfinex-router.js` handles all API interactions related to Bitfinex trading and lending automation. It provides endpoints for querying account status, managing automated "bots" (lending/trading configurations), and closing active credits. This router heavily relies on the `BitfinexTool` model for complex financial calculations and API interactions with the Bitfinex exchange.

**Testing Reference:** This documentation adheres to the `doc/OUTLINE.md` standards for Integration and Functional testing (Finance/Bitfinex section).

---

## 2. Module: Bitfinex Query Routes (`/get`, `/getSingle`, `/single`)

### Purpose
To retrieve Bitfinex account metadata, market rates, or specific user-defined trading/lending statuses.

### Logic Flow
1. **Authentication:** All routes are protected by `checkLogin` middleware.
2. **Parameters Mapping:**
   - `:sortName`: Specifies the field to sort by (`name`, `mtime`, `count`).
   - `:sortType`: Specifies sort order (`desc`, `asc`).
   - `:page`: Pagination index.
   - `:name`, `:exactly`, `:index`, `:uid`, `:user`: Optional filters for targeting specific coins or users.
3. **Model Interaction:** Calls `BitfinexTool.query(...)` with the parsed parameters.
4. **Response:** Returns the JSON result from the model.

### Invocation & Authentication
- **Endpoints:** 
  - `GET /api/bitfinex/get/:sortName/:sortType/:page/:name?/:exactly?/:index?`
  - `GET /api/bitfinex/getSingle/:sortName/:sortType/:page/:name?/:exactly?/:index?`
  - `GET /api/bitfinex/single/:sortName/:sortType/:uid/:user?`
- **Authentication:** Required (User session must exist).

### Returns & Side Effects
- **Returns:** A complex JSON object containing market data, wallet balances, and active offers/credits.
- **Side Effects:** None.

### Snapshot Testing Data
```json
{
  "total": 1,
  "data": [
    {
      "symbol": "fUSD",
      "available": 1500.25,
      "rate": 0.00015,
      "dailyChange": 0.02,
      "lastPrice": 1.0,
      "time": 1710000000
    }
  ]
}
```

### Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches
- **Sort Branching:** Test sorting by each valid `sortName` and `sortType`.
- **Filtering Branching:** Test with and without the `:name` parameter.
- **UID Branching:** Test the `single` route with specific `uid` vs. current session user.

#### Edge Cases
- **Page Overflow:** Request a page number beyond available results.
- **Invalid Sort Name:** Request with a sort name not in `(name|mtime|count)`. (Handled by Express regex).

#### Auth/Login Scenarios
- **Unauthenticated:** Access any of these routes without logging in. Expected: `401 Unauthorized`.

---

## 3. Module: Parent Configuration (`/parent`)

### Purpose
Retrieves the hierarchical configuration data (parents/categories) used for the Bitfinex UI.

### Logic Flow
1. **Authentication:** Middleware check.
2. **Retrieval:** Calls `BitfinexTool.parent()`.
3. **Response:** Returns the static or dynamic category list (e.g., USD, BTC, ETH, Wallet, Rate).

### Invocation & Authentication
- **Endpoint:** `GET /api/bitfinex/parent`
- **Authentication:** Required.

### Returns & Side Effects
- **Returns:** Array of parent category objects.

### Snapshot Testing Data
```json
[
  { "name": "all", "show": "全部" },
  { "name": "usd", "show": "USD" }
]
```

### Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches
- **Standard Return:** Verify the standard structure of the parent list.

---

## 4. Module: Bot Management (`/bot`)

### Purpose
To retrieve or update the configuration for automated lending/trading bots.

### Logic Flow
#### GET Mode:
1. Calls `BitfinexTool.getBot(req.user._id)`.
2. Resolves to the current user's bot settings.

#### PUT Mode:
1. Receives configuration data in `req.body`.
2. Calls `BitfinexTool.updateBot(req.user._id, req.body, req.user.username)`.
3. Validates and saves the new parameters to the database.

### Invocation & Authentication
- **Endpoint:** `GET/PUT /api/bitfinex/bot`
- **Authentication:** Required.

### Returns & Side Effects
- **Returns:** The updated or retrieved bot configuration list.
- **Side Effects:** Updates MongoDB with new bot settings.

### Snapshot Testing Data
```json
[
  {
    "type": "fUSD",
    "isActive": true,
    "amountLimit": 1000,
    "riskLimit": 5,
    "waitTime": 15
  }
]
```

### Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches
- **Update Success:** Provide valid configuration in `PUT`.
- **Empty Settings:** Test `GET` for a user who hasn't configured a bot yet.

#### Error Handling
- **Invalid Config:** Send malformed JSON or invalid values (e.g., negative `amountLimit`) in `PUT`. Expected: Caught by `handleError`.

---

## 5. Module: Bot Deletion & Credit Closing

### Purpose
To remove specific bot configurations or manually close an active lending credit.

### Logic Flow
#### Delete Bot:
1. Calls `BitfinexTool.deleteBot(uid, type, username)`.
2. Removes the bot for the specified coin `type`.

#### Close Credit:
1. Calls `BitfinexTool.closeCredit(username, creditID)`.
2. Interacts with the Bitfinex API to terminate the active loan.

### Invocation & Authentication
- **Endpoints:**
  - `GET /api/bitfinex/bot/del/:type`
  - `GET /api/bitfinex/bot/close/:credit`
- **Authentication:** Required.

### Returns & Side Effects
- **Returns:** 
  - Delete: Updated bot list.
  - Close: `{ "apiOK": true }`.
- **Side Effects:** 
  - Deletes database records.
  - Triggers external API calls to Bitfinex.

### Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches
- **Valid Deletion:** Delete an existing bot.
- **Valid Close:** Close an active credit ID.

#### Edge Cases
- **Non-existent ID:** Attempt to close a credit ID that doesn't exist or is already closed.
- **Unauthorized Close:** Attempt to close a credit belonging to another user.

#### Error Handling
- **API Timeout:** Handle scenario where Bitfinex API is unreachable during a `closeCredit` call.
