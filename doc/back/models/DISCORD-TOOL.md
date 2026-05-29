# discord-tool.js — Technical Documentation & QA Testing Strategy

> **Module**: `src/back/models/discord-tool.js`
> **Project**: ANoMoPi (anomopi.com)
> **Role**: Discord bot integration — bidirectional messaging, command processing, and system notifications
> **External Dependency**: `discord.js`
> **Priority**: 🟡 High (External API Integration — Phase 6 per §11.9)
> **Test Framework**: Jest 27 + ESM (`NODE_OPTIONS=--experimental-vm-modules`)

---

## Table of Contents

1. [Module Overview](#1-module-overview)
2. [Dependency Map](#2-dependency-map)
3. [Exports](#3-exports)
4. [`init()` — Bot Initialization & Command Router](#4-init--bot-initialization--command-router)
5. [`discordSend(msg)` — Outbound Notification](#5-discordsendmsg--outbound-notification)
6. [`help(msg)` — Help Command Handler](#6-helpmsg--help-command-handler)
7. [`schwabAuth(msg)` — Schwab/TD OAuth URL](#7-schwabauthmsg--schwabtd-oauth-url)
8. [`schwabCode(msg, code)` — Schwab/TD Token Exchange](#8-schwabcodemsg-code--schwabtd-token-exchange)
9. [Cross-Cutting Concerns](#9-cross-cutting-concerns)
10. [Mock Strategy](#10-mock-strategy)

---

## 1. Module Overview

`discord-tool.js` provides a Discord bot that serves two purposes:

1. **Inbound**: Listens for user commands in a configured Discord channel and dispatches them to handler functions (Schwab OAuth, help).
2. **Outbound**: Exposes a `discordSend()` default export used by other modules (notably `sendWs.js`) to push system notifications to the Discord channel.

The module maintains a **module-level mutable `channel` reference** (`let channel = null`) that is set during initialization and shared across all functions — a critical architectural detail for testing.

---

## 2. Dependency Map

| Import | Source | Purpose |
|--------|--------|---------|
| `DISCORD_TOKEN` | `../../../ver.js` | Bot authentication token (`process.env.DISCORD_TOKEN`) |
| `DISCORD_CHANNEL` | `../../../ver.js` | Target channel ID (`process.env.DISCORD_CHANNEL`) |
| `Discord` | `discord.js` | Discord.js client library |
| `generateAuthUrl` | `../models/tdameritrade-tool.js` | Generates Schwab/TD Ameritrade OAuth authorization URL (no-arg, returns string) |
| `getToken` | `../models/tdameritrade-tool.js` | Exchanges authorization code for access token — `getToken(code)` → Promise |

---

## 3. Exports

| Export | Type | Visibility | Description |
|--------|------|------------|-------------|
| `init` | Named export (`export const`) | Public | Initializes Discord client, registers event handlers, logs in |
| `discordSend` | Default export (`export default function`) | Public | Sends a message to the configured Discord channel |
| `help` | `const` | Private (module-scoped) | Replies with command list |
| `schwabAuth` | `const` | Private (module-scoped) | Replies with Schwab OAuth URL |
| `schwabCode` | `const` | Private (module-scoped) | Exchanges auth code for token via TD Ameritrade API |

---

## 4. `init()` — Bot Initialization & Command Router

### Purpose

Creates a `Discord.Client` instance, registers event listeners (`ready`, `message`, `shardError`, `error`), and authenticates using `DISCORD_TOKEN`. On successful connection, caches the target channel reference and sends a startup greeting.

### Function Signature

```javascript
export const init = () => void
```

**Parameters**: None
**Returns**: `undefined` (fire-and-forget; no Promise returned)

### Logic Flow

```
init()
 ├─ 1. Create new Discord.Client()
 ├─ 2. Register 'ready' handler:
 │     ├─ console.log bot tag
 │     ├─ Retrieve channel from cache via DISCORD_CHANNEL
 │     └─ Send greeting "Nice to serve you!!!"
 ├─ 3. Register 'message' handler:
 │     ├─ Log message content and bot flag
 │     ├─ IF msg.author.bot → SKIP (ignore bot messages)
 │     └─ ELSE → Parse with regex: /<@.*> ([^\s]*)(.*)/
 │           ├─ IF no match (cmd is null) → SKIP (no-op)
 │           └─ IF match → switch on cmd[1].toLowerCase():
 │                 ├─ 'schwab'    → schwabAuth(msg)
 │                 ├─ 'schwabcode'→ schwabCode(msg, cmd[2].trim())
 │                 ├─ 'help'      → help(msg)  (explicit)
 │                 └─ default     → help(msg)  (fallback)
 ├─ 4. Register 'shardError' handler → console.error
 ├─ 5. Register 'error' handler → console.error
 └─ 6. client.login(DISCORD_TOKEN)
```

### Side Effects

| Side Effect | Details |
|-------------|---------|
| **Module state mutation** | Sets module-level `channel` variable on `ready` event |
| **Network** | Authenticates with Discord API, opens WebSocket connection |
| **Console output** | Logs bot tag, message content, author.bot flag, and errors |
| **Discord message** | Sends "Nice to serve you!!!" greeting on ready |

### Snapshot Testing Data

**Simulated `ready` event state:**
```json
{
  "client.user.tag": "ANoMoPiBot#1234",
  "DISCORD_CHANNEL": "123456789012345678",
  "channel": { "id": "123456789012345678", "send": "<function>" }
}
```

**Simulated `message` event — valid command:**
```json
{
  "content": "<@987654321098765432> schwab",
  "author": { "bot": false, "id": "111222333444555666" }
}
```

**Regex match result for `<@987654321098765432> schwabCode ABC123`:**
```json
{
  "cmd[0]": "<@987654321098765432> schwabCode ABC123",
  "cmd[1]": "schwabCode",
  "cmd[2]": " ABC123"
}
```

### Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches

| # | Scenario | Input | Expected Behavior |
|---|----------|-------|-------------------|
| 4.1 | `ready` event fires | Client connects successfully | Logs bot tag, retrieves channel from cache, sends greeting |
| 4.2 | Message from bot (`msg.author.bot === true`) | Bot-authored message | No command processing; only `console.log` calls |
| 4.3 | Message from user, no mention/command pattern | `"hello world"` (no `<@...>` prefix) | Regex returns `null`; no command dispatched |
| 4.4 | Message from user, command = `schwab` | `"<@id> schwab"` | Calls `schwabAuth(msg)` |
| 4.5 | Message from user, command = `SCHWAB` (case) | `"<@id> SCHWAB"` | `toLowerCase()` normalizes → calls `schwabAuth(msg)` |
| 4.6 | Message from user, command = `schwabcode` with arg | `"<@id> schwabCode ABC123"` | Calls `schwabCode(msg, "ABC123")` |
| 4.7 | Message from user, command = `schwabcode` no arg | `"<@id> schwabCode"` | `cmd[2]` is `""`, trim → `""`, calls `schwabCode(msg, "")` |
| 4.8 | Message from user, command = `help` | `"<@id> help"` | Calls `help(msg)` |
| 4.9 | Message from user, unknown command | `"<@id> unknown"` | Falls through to `default` → calls `help(msg)` |
| 4.10 | Message from user, command = `SchwabCode` (mixed case) | `"<@id> SchwabCode ABC123"` | `toLowerCase()` normalizes → calls `schwabCode(msg, "ABC123")` |
| 4.11 | `shardError` event fires | WebSocket error | Logs error via `console.error` |
| 4.12 | `error` event fires | General Discord error | Logs error via `console.error` |

#### Edge Cases

| # | Scenario | Input | Expected Behavior |
|---|----------|-------|-------------------|
| 4.13 | `DISCORD_CHANNEL` is invalid / not in cache | Channel ID not found | `client.channels.cache.get()` returns `undefined`; `channel.send()` throws TypeError |
| 4.14 | `DISCORD_TOKEN` is `undefined` | Env var not set | `client.login(undefined)` rejects with Discord API error |
| 4.15 | Message with multiple spaces in command args | `"<@id> schwabCode  AB  CD  "` | `cmd[2].trim()` → `"AB  CD"` (inner spaces preserved) |
| 4.16 | Message with special regex characters in mention | `"<@!123456> help"` | Regex `<\@.*\>` matches `<@!123456>` — still works due to greedy `.*` |
| 4.17 | Message with mention only, no command | `"<@id> "` | Regex requires `([^\s]*)` — may match empty string, `cmd[1]` is `""` → `default` case → `help` |
| 4.18 | Message with newlines in content | `"<@id> help\nextra"` | Regex `.` does not match `\n` by default; captures up to newline |
| 4.19 | Multiple mentions in a single message | `"<@id1> <@id2> schwab"` | Greedy `.*` in `<\@.*\>` matches through both mentions; `cmd[1]` depends on regex backtracking |
| 4.20 | `channel` is `null` after init (race condition) | `discordSend()` called before `ready` fires | `channel` still `null`; send silently skipped |

#### Error Handling

| # | Scenario | Trigger | Expected Behavior |
|---|----------|---------|-------------------|
| 4.21 | Discord login failure | Invalid token | `client.login()` rejects; unhandled rejection (no `.catch` on login) |
| 4.22 | `channel.send()` fails on greeting | Network error on ready | Unhandled rejection from `channel.send('Nice to serve you!!!')` |
| 4.23 | `console.log` called with `null` user tag | `client.user` is undefined | TypeError in template literal |

---

## 5. `discordSend(msg)` — Outbound Notification

### Purpose

Sends a text message to the cached Discord channel. Used as the default export for system-wide notification dispatch (called from `sendWs.js` and other modules).

### Function Signature

```javascript
export default function discordSend(msg: string) → void
```

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `msg` | `string` | Yes | Message text to send to the Discord channel |

**Returns**: `undefined`

### Logic Flow

```
discordSend(msg)
 ├─ IF channel is truthy (not null/undefined)
 │   └─ channel.send(msg)
 └─ ELSE → no-op (silent skip)
```

### Side Effects

| Side Effect | Details |
|-------------|---------|
| **Discord message** | Sends `msg` to the cached channel (if initialized) |
| **None** | If `channel` is `null`, no action taken and no error thrown |

### Snapshot Testing Data

```json
{
  "msg": "Stock AAPL dropped below $150 threshold",
  "channel_state": "initialized",
  "expected_call": "channel.send('Stock AAPL dropped below $150 threshold')"
}
```

### Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches

| # | Scenario | Module State | Input | Expected Behavior |
|---|----------|-------------|-------|-------------------|
| 5.1 | Channel initialized, valid message | `channel` is set | `"Alert: backup complete"` | `channel.send()` called with message |
| 5.2 | Channel not initialized | `channel` is `null` | `"Alert: backup complete"` | No-op; no error thrown |

#### Edge Cases

| # | Scenario | Input | Expected Behavior |
|---|----------|-------|-------------------|
| 5.3 | Empty string message | `""` | `channel.send("")` called (Discord may reject) |
| 5.4 | `undefined` message | `undefined` | `channel.send(undefined)` called |
| 5.5 | Very long message (>2000 chars) | 2001-char string | Discord API rejects (message exceeds limit) |
| 5.6 | Message with Discord markdown/mentions | `"@everyone alert"` | Sent as-is; may trigger Discord mentions |
| 5.7 | Non-string input (object/number) | `{ key: "val" }` | `channel.send()` receives object; Discord.js coerces or errors |
| 5.8 | Called rapidly in succession | Multiple calls | Each invocation calls `channel.send()` independently; no debounce |

#### Error Handling

| # | Scenario | Trigger | Expected Behavior |
|---|----------|---------|-------------------|
| 5.9 | `channel.send()` rejects | Network failure | Unhandled Promise rejection (no `.catch`) |
| 5.10 | Channel object becomes stale | Bot disconnected | `channel.send()` may throw or reject |

---

## 6. `help(msg)` — Help Command Handler

### Purpose

Replies to the user with a list of available bot commands.

### Function Signature

```javascript
const help = (msg) → Promise<Discord.Message>
```

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `msg` | `Discord.Message` | Yes | The incoming Discord message to reply to |

**Returns**: Result of `msg.reply()` (Promise resolving to the sent reply message)

### Logic Flow

```
help(msg)
 └─ msg.reply('\nCommand:\nschwab\nschwabCode code')
```

### Side Effects

| Side Effect | Details |
|-------------|---------|
| **Discord message** | Sends a reply in the channel with the command list |

### Snapshot Testing Data

**Expected reply content:**
```
\nCommand:\nschwab\nschwabCode code
```

Rendered in Discord:
```
Command:
schwab
schwabCode code
```

### Comprehensive Test Scenarios (100% Coverage)

| # | Scenario | Input | Expected Behavior |
|---|----------|-------|-------------------|
| 6.1 | Valid message object | Discord.Message mock | `msg.reply()` called with exact help string |
| 6.2 | `msg.reply()` rejects | Network failure | Unhandled rejection propagates to caller |
| 6.3 | Triggered by unknown command | `"<@id> foobar"` | Same help text returned (via `default` case) |
| 6.4 | Triggered by explicit `help` | `"<@id> help"` | Same help text returned |

---

## 7. `schwabAuth(msg)` — Schwab/TD OAuth URL

### Purpose

Replies with the Schwab/TD Ameritrade OAuth authorization URL so the user can begin the authentication flow.

### Function Signature

```javascript
const schwabAuth = (msg) → Promise<Discord.Message>
```

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `msg` | `Discord.Message` | Yes | The incoming Discord message to reply to |

**Returns**: Result of `msg.reply()` (Promise resolving to the sent reply message)

### Logic Flow

```
schwabAuth(msg)
 └─ msg.reply(generateAuthUrl())
      └─ generateAuthUrl() returns a URL string:
         "${TD_AUTH_URL}redirect_uri=${GOOGLE_REDIRECT}&client_id=${TDAMERITRADE_KEY}"
```

### Side Effects

| Side Effect | Details |
|-------------|---------|
| **Discord message** | Replies with OAuth URL string |

### Snapshot Testing Data

**Expected reply (representative):**
```
https://api.schwabapi.com/v1/oauth/authorize?redirect_uri=https://anomopi.com/callback&client_id=APPKEY123
```

### Comprehensive Test Scenarios (100% Coverage)

| # | Scenario | Input | Expected Behavior |
|---|----------|-------|-------------------|
| 7.1 | Valid generation | Discord message | `msg.reply()` called with URL from `generateAuthUrl()` |
| 7.2 | `generateAuthUrl()` returns URL with undefined vars | Missing env vars | URL contains `"undefined"` segments |
| 7.3 | `msg.reply()` rejects | Network failure | Unhandled rejection |
| 7.4 | URL contains special characters | Redirect URI with encoding | Passed as-is to Discord |

---

## 8. `schwabCode(msg, code)` — Schwab/TD Token Exchange

### Purpose

Exchanges a Schwab/TD Ameritrade authorization code for an access token. Reports success or failure back to the Discord channel.

### Function Signature

```javascript
const schwabCode = (msg, code) → Promise<Discord.Message> | Discord.Message
```

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `msg` | `Discord.Message` | Yes | The incoming Discord message to reply to |
| `code` | `string` | Yes | Authorization code from OAuth callback |

**Returns**: Conditional — `msg.reply()` (sync if code is falsy) or Promise chain (if code is truthy)

### Logic Flow

```
schwabCode(msg, code)
 ├─ IF code is truthy (non-empty string)
 │   ├─ getToken(code)
 │   │   ├─ ON SUCCESS → msg.reply("Update token Successed!!!")
 │   │   └─ ON ERROR  → msg.reply(err.message)
 └─ ELSE (code is falsy: empty string, null, undefined)
     └─ msg.reply("Need input code!!!")
```

### Side Effects

| Side Effect | Details |
|-------------|---------|
| **HTTP request** | `getToken()` makes POST request to TD Ameritrade token endpoint |
| **Token storage** | On success, `getToken()` internally persists the access/refresh token |
| **Discord message** | Replies with success confirmation, error details, or missing-code prompt |

### Snapshot Testing Data

**Success flow:**
```json
{
  "code": "AUTH_CODE_FROM_OAUTH",
  "getToken_resolves": { "access_token": "...", "refresh_token": "..." },
  "expected_reply": "Update token Successed!!!"
}
```

**Error flow:**
```json
{
  "code": "INVALID_CODE",
  "getToken_rejects": { "message": "invalid_grant: authorization code expired" },
  "expected_reply": "invalid_grant: authorization code expired"
}
```

**Missing code flow:**
```json
{
  "code": "",
  "expected_reply": "Need input code!!!"
}
```

### Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches

| # | Scenario | `code` Value | Expected Behavior |
|---|----------|-------------|-------------------|
| 8.1 | Valid code, token exchange succeeds | `"AUTH_CODE_123"` | `getToken()` called → `msg.reply("Update token Successed!!!")` |
| 8.2 | Valid code, token exchange fails | `"EXPIRED_CODE"` | `getToken()` rejects → `msg.reply(err.message)` |
| 8.3 | Empty string code | `""` | Falsy → `msg.reply("Need input code!!!")` |

#### Edge Cases

| # | Scenario | `code` Value | Expected Behavior |
|---|----------|-------------|-------------------|
| 8.4 | Code with leading/trailing spaces | `"  ABC  "` | Truthy; passed to `getToken()` as-is (spaces already trimmed by caller via `cmd[2].trim()`) |
| 8.5 | Code with special characters | `"code%3Dvalue&extra"` | Passed as-is to `getToken()` |
| 8.6 | Very long code string | 10000-char string | Passed to `getToken()`; may fail at HTTP layer |
| 8.7 | Numeric-like code | `"12345"` | Truthy string; passed to `getToken()` |
| 8.8 | Code is whitespace only | `" "` (space) | Truthy; passed to `getToken()` (note: `cmd[2].trim()` in caller would make this `""`) |

#### Error Handling

| # | Scenario | Trigger | Expected Behavior |
|---|----------|---------|-------------------|
| 8.9 | `getToken()` throws synchronously | Internal error | Unhandled exception (not wrapped in try/catch) |
| 8.10 | `getToken()` rejects with error without `.message` | Non-standard error | `msg.reply(undefined)` |
| 8.11 | `msg.reply()` fails in success path | Discord network error | Unhandled rejection |
| 8.12 | `msg.reply()` fails in error path | Discord network error during error reporting | Unhandled rejection |

---

## 9. Cross-Cutting Concerns

### 9.1 Module State Management

The `channel` variable is module-scoped mutable state (`let channel = null`). This creates:

- **Initialization dependency**: `discordSend()` silently no-ops until `init()` completes and `ready` fires
- **Test isolation risk**: Tests must reset `channel` state between runs or mock at the module level
- **No re-initialization path**: Calling `init()` twice creates a second client without cleaning up the first

### 9.2 Error Handling Gaps

| Location | Issue |
|----------|-------|
| `client.login(DISCORD_TOKEN)` (line 45) | No `.catch()` — rejected Promise is unhandled |
| `channel.send('Nice to serve you!!!')` (line 13) | No `.catch()` — network errors during greeting are unhandled |
| `schwabCode` `.catch` path (line 47) | If `msg.reply()` itself fails inside `.catch()`, no secondary handler |
| `schwabCode` success path (line 54) | `msg.reply()` rejection not caught |

### 9.3 Regex Analysis

**Pattern**: `/\<\@.*\> ([^\s]*)(.*)/`

| Component | Matches | Notes |
|-----------|---------|-------|
| `\<\@` | Literal `<@` | Escaped angle bracket and at-sign |
| `.*` | Any characters (greedy) | Matches through nested `>` chars — potential over-matching with multiple mentions |
| `\>` | Literal `>` | End of mention |
| ` ` | Single space | Separator |
| `([^\s]*)` | Non-whitespace (group 1 = command) | Empty string if only spaces follow |
| `(.*)` | Everything else (group 2 = arguments) | Includes leading space; caller uses `.trim()` |

**Known regex behaviors:**
- Greedy `.*` inside `<@...>` matches through multiple `>` characters
- Multiple mentions: `<@id1> <@id2> cmd` — `.*` may span both mentions
- No `^` anchor: match can start mid-string
- No `$` anchor: trailing content captured in group 2

### 9.4 Security Considerations

| Concern | Details |
|---------|---------|
| **Token exposure** | `DISCORD_TOKEN` imported from env; never logged directly, but `client.user.tag` is logged |
| **Command injection** | Commands are dispatched via switch; no `eval()` or dynamic execution |
| **Auth URL exposure** | OAuth URL sent to Discord channel — channel access controls apply |
| **Auth code exposure** | Authorization codes sent via Discord message — visible to channel members |
| **No permission check** | Any non-bot user in the channel can execute any command |

---

## 10. Mock Strategy

### 10.1 Required Mocks

| Dependency | Mock Approach | Notes |
|------------|---------------|-------|
| `discord.js` | Full module mock | Mock `Client` constructor, `channels.cache.get()`, event registration |
| `generateAuthUrl` | Module mock | Return static URL string |
| `getToken` | Module mock | Return resolving/rejecting Promises |
| `DISCORD_TOKEN` | Module mock | Provide test token string |
| `DISCORD_CHANNEL` | Module mock | Provide test channel ID |
| `console.log` / `console.error` | `jest.spyOn` | Verify logging behavior |

### 10.2 Discord.js Client Mock Structure

```javascript
// Representative mock structure (strategy only — not implementation)
const mockSend = jest.fn();
const mockReply = jest.fn();
const mockChannel = { id: 'test-channel', send: mockSend };
const mockMessage = {
  content: '<@123> schwab',
  author: { bot: false },
  reply: mockReply
};
const mockClient = {
  on: jest.fn((event, handler) => { /* store handlers */ }),
  login: jest.fn(),
  channels: { cache: { get: jest.fn(() => mockChannel) } },
  user: { tag: 'TestBot#0001' }
};
```

### 10.3 Test Isolation Strategy

1. **Module state reset**: The `channel` variable must be reset between tests. This requires either:
   - Re-importing the module per test (`jest.resetModules()`)
   - Exporting a test-only reset function (not recommended for production)
2. **Event handler capture**: Mock `client.on()` to capture registered handlers, then invoke them directly in tests
3. **Async timing**: `ready` event is asynchronous; tests must simulate event emission order

### 10.4 Suggested Test File Location

Per §11.8 of OUTLINE.md:
```
src/back/models/__tests__/discord-tool.test.js
```

---

> **Reference**: This document follows the QA Testing Blueprint defined in [OUTLINE.md](../../OUTLINE.md) §11 (QA Testing Scope & Strategy). Discord integration testing falls under **Phase 6: External API mocks** (§11.9).
