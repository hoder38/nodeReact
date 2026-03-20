# sendWs.js — WebSocket & TCP Communication Utility

**File**: `src/back/util/sendWs.js` (~86 lines)
**Role**: Central hub for real-time message broadcasting via WebSocket (to browser clients) and TCP (inter-process communication between main server and file server). Also supports Discord channel forwarding.

---

## Table of Contents

1. [Module Overview](#module-overview)
2. [Dependencies](#dependencies)
3. [Module-Level State](#module-level-state)
4. [Exported Functions](#exported-functions)
   - [`mainInit(server)`](#maininitserver)
   - [`init()`](#init)
   - [`default export` (sendWs dispatcher)](#default-export-sendws-dispatcher)
5. [Internal Functions](#internal-functions)
   - [`sendWs(data, adultonly, auth)`](#sendwsdata-adultonly-auth)
6. [Test Strategy](#test-strategy)
7. [Test Scenarios by Function](#test-scenarios-by-function)

---

## Module Overview

The module implements a **dual-transport broadcast architecture**:

```
┌──────────────┐   default export   ┌──────────────┐
│  Controller  │ ──────────────────► │  sendWs.js   │
│  / Model     │                     │  (dispatch)  │
└──────────────┘                     └──────┬───────┘
                                       ┌────┴────┐
                               ds=true │         │ ds=false
                                       ▼         ▼
                                ┌──────────┐  ┌──────────────────┐
                                │ Discord  │  │ sendWs() local   │
                                │ channel  │  │ WS broadcast     │
                                └──────────┘  │ + TCP relay      │
                                              └───────┬──────────┘
                                                      │
                                         ┌────────────┴────────────┐
                                         ▼                         ▼
                                  ┌────────────┐          ┌──────────────┐
                                  │ wsServer   │          │ TCP client   │
                                  │ .clients   │          │ (net.connect)│
                                  │ broadcast  │          │ relay to     │
                                  └────────────┘          │ file-server  │
                                                          └──────────────┘
```

**Two entry points exist for two server processes:**
- **File server** (`file-server.js`): calls `mainInit(server)` → owns the WebSocket server + TCP server
- **Main server** (`server.js`): calls `init()` → connects as a TCP client to the file server

---

## Dependencies

| Dependency | Usage |
|---|---|
| `ws` | WebSocket server (`Ws.Server`) for browser clients |
| `net` (Node built-in) | TCP server (`createServer`) and TCP client (`connect`) for inter-process relay |
| `ver.js → ENV_TYPE` | Environment type selector (dev vs release) |
| `config.js → FILE_IP, COM_PORT` | TCP connection target IP and port, resolved by environment |
| `discord-tool.js → sendDs, init` | Discord channel message forwarding |
| `utility.js → handleError` | Centralized error logging |

---

## Module-Level State

| Variable | Type | Initial | Mutated By |
|---|---|---|---|
| `wsServer` | `Ws.Server \| null` | `null` | `mainInit()` — set once on file-server startup |
| `client` | `net.Socket \| null` | `null` | `init()` — set on main-server startup; reset on reconnect |

Both are **singletons** — the module is designed to be imported once per process.

---

## Exported Functions

### `mainInit(server)`

**Purpose**: Initialize the WebSocket server (attached to the HTTPS server) and a TCP server for receiving forwarded messages from the main server process. Called **once** by the file server on startup.

**Signature**:
```js
export function mainInit(server: http.Server | https.Server): void
```

**Parameters**:

| Param | Type | Description |
|---|---|---|
| `server` | `http.Server` / `https.Server` | The HTTP(S) server instance to attach WebSocket upgrades to |

**Returns**: `void`

**Side Effects**:
- Sets module-level `wsServer` to a new `Ws.Server` instance
- Starts a TCP server on `COM_PORT(ENV_TYPE)` bound to `0.0.0.0`
- Calls `initDs()` to initialize the Discord bot client

**Logic Flow**:

1. Create `Ws.Server` with `perMessageDeflate: false`, attached to `server`, path `/f`
2. Register `connection` handler on `wsServer`:
   - On each WebSocket `message`: log raw message, attempt `JSON.parse`, catch parse errors via `handleError`
   - On `close`: log disconnect reason
3. Create TCP server via `NetCreateServer`:
   - On each TCP client connection: enable keepalive (10s interval)
   - On `data`: parse JSON from buffer → call internal `sendWs(recvData.data, recvData.adultonly, recvData.auth)`
   - On parse error: call `handleError`, log raw data
4. TCP server listens on `COM_PORT(ENV_TYPE)`, `'0.0.0.0'`
5. Call `initDs()` to boot the Discord integration

**Decision Tree**:
```
TCP data received
  └─ JSON.parse succeeds?
       ├─ YES → call sendWs(recvData.data, recvData.adultonly, recvData.auth)
       └─ NO  → handleError(e, 'Client'), console.log(data)

WS message received
  └─ JSON.parse succeeds?
       ├─ YES → console.log parsed message
       └─ NO  → handleError(e, 'Web socket')
```

---

### `init()`

**Purpose**: Connect to the file server's TCP server as a client. Called **once** by the main server on startup. Implements auto-reconnect on disconnect.

**Signature**:
```js
export function init(): void
```

**Parameters**: None

**Returns**: `void`

**Side Effects**:
- Sets module-level `client` to a new `net.Socket` connected to `FILE_IP(ENV_TYPE):COM_PORT(ENV_TYPE)`
- Enables TCP keepalive (10s interval) on successful connect
- Registers auto-reconnect: on `close`, waits 10 seconds then recursively calls `init()`

**Logic Flow**:

1. `client = NetConnect(COM_PORT(ENV_TYPE), FILE_IP(ENV_TYPE), callback)`
2. On connect callback: log, set keepalive 10s
3. On `end` event: log disconnection
4. On `close` event: log reconnect notice, schedule `setTimeout(() => init(), 10000)`

**Decision Tree**:
```
Connection established
  └─ on 'close' event
       └─ setTimeout(10s) → init() (recursive reconnect)
```

---

### Default Export (sendWs Dispatcher)

**Purpose**: Primary API consumed by all controllers and models to broadcast real-time messages. Routes messages to either Discord or WebSocket+TCP based on the `ds` flag.

**Signature**:
```js
export default (data: object|string, adultonly: any, auth: any, ds?: boolean) => void
```

**Parameters**:

| Param | Type | Default | Description |
|---|---|---|---|
| `data` | `object` or `string` | — | Payload to broadcast. Object for WS (gets `level` property added), string for Discord |
| `adultonly` | `any` (truthy/falsy) | — | Content maturity flag. Determines `data.level` |
| `auth` | `any` (truthy/falsy) | — | Authentication/authorization flag. Combined with `adultonly` for level calculation |
| `ds` | `boolean` | `false` | If `true`, forward to Discord channel instead of WS/TCP |

**Returns**: `void`

**Side Effects**:
- When `ds=true`: calls `sendDs(data.toString())` to send message to Discord channel; returns immediately
- When `ds=false`:
  1. Calls internal `sendWs(data, adultonly, auth)` → broadcasts to all connected WS clients
  2. If `client` is connected (non-null): writes JSON payload over TCP to the file server

**Logic Flow**:

1. Check `ds` flag:
   - **`ds=true`**: call `sendDs(data.toString())`, `return` (skip WS/TCP)
   - **`ds=false`** (default): continue
2. Call `sendWs(data, adultonly, auth)` — broadcast to local WS clients
3. Check `client`:
   - **truthy**: serialize and `client.write()` JSON: `{ send: 'web', data, adultonly: adultonly ? 1 : 0, auth: auth ? 1 : 0 }`
   - **falsy**: no TCP relay (main server not connected or this is the file server process)

**Decision Tree**:
```
ds === true?
  ├─ YES → sendDs(data.toString()) → return
  └─ NO
       ├─ sendWs(data, adultonly, auth)   [always]
       └─ client !== null?
            ├─ YES → client.write(JSON.stringify({...}))
            └─ NO  → no-op (TCP not connected)
```

**TCP Payload Schema**:
```json
{
  "send": "web",
  "data": { "type": "file", "data": "<objectId>" },
  "adultonly": 0 | 1,
  "auth": 0 | 1
}
```

---

## Internal Functions

### `sendWs(data, adultonly, auth)`

**Purpose**: Broadcast a message to **all** connected WebSocket clients via the `wsServer`. Computes a permission `level` on the data object before sending.

**Signature**:
```js
function sendWs(data: object, adultonly: any, auth: any): void
```

**Parameters**:

| Param | Type | Description |
|---|---|---|
| `data` | `object` | Payload object; mutated with a `level` property |
| `adultonly` | `any` | Truthy = adult content |
| `auth` | `any` | Truthy = authenticated/authorized user content |

**Returns**: `void`

**Side Effects**:
- **Mutates** `data` by adding `data.level`
- Sends stringified payload to every client in `wsServer.clients`

**Logic Flow**:

1. Guard: if `wsServer` is `null` → no-op (file-server WS not initialized in this process)
2. Compute `data.level`:
   - `auth && adultonly` → `2` (adult + auth required)
   - `adultonly` (but not auth) → `1` (adult content)
   - neither → `0` (general content)
3. `JSON.stringify(data)` → `sendData`
4. Iterate `wsServer.clients.forEach(client => client.send(sendData))`

**Level Computation Truth Table**:

| `auth` | `adultonly` | `data.level` |
|--------|-------------|-------------|
| falsy  | falsy       | `0`         |
| falsy  | truthy      | `1`         |
| truthy | falsy       | `0`         |
| truthy | truthy      | `2`         |

---

## Test Strategy

Per the project's QA Testing Blueprint (`doc/OUTLINE.md` §11), this module falls under:
- **Unit Tests** (§11.2): Pure logic isolation — level computation, branching, dispatch routing
- **Integration Tests** (§11.3, "WebSocket" row): Broadcast, security-level filtering, TCP forwarding

**Test File**: `src/back/util/__tests__/sendWs.test.js`

**Mocking Requirements**:

| Dependency | Mock Strategy |
|---|---|
| `ws` | Mock `Ws.Server` constructor; return object with `.clients` (Set of mock sockets), `.on()` |
| `net` | Mock `connect()` returning mock socket; mock `createServer()` returning mock server |
| `discord-tool.js` | Mock `sendDs` and `init` (named export) |
| `utility.js` | Mock `handleError` to assert error logging |
| `config.js` | Mock `COM_PORT` / `FILE_IP` to return test values |
| `ver.js` | Mock `ENV_TYPE` |

**General Approach**:
- Use Jest module mocking (`jest.mock()`) for all external dependencies
- Access module-level state indirectly through exported function behavior
- Test the default export as the primary public API
- Test `mainInit` and `init` for initialization side effects

---

## Test Scenarios by Function

### 1. `mainInit(server)`

#### 1.1 — Initialization & WS Server Setup

| # | Scenario | Assertions |
|---|----------|-----------|
| 1.1.1 | Creates WS server with correct options | `Ws.Server` called with `{ perMessageDeflate: false, server, path: '/f' }` |
| 1.1.2 | Registers `connection` handler on WS server | `wsServer.on` called with `'connection'` and a callback |
| 1.1.3 | Calls `initDs()` on startup | `initDs` (Discord init) called exactly once |

#### 1.2 — WS Message Handling (inside `connection` callback)

| # | Scenario | Assertions |
|---|----------|-----------|
| 1.2.1 | Valid JSON WS message received | `console.log` called with raw message AND parsed object; no error |
| 1.2.2 | Invalid JSON WS message received | `handleError` called with parse error and `'Web socket'` context string |
| 1.2.3 | WS client disconnects | `console.log` called with disconnect reason containing `reasonCode` and `description` |

#### 1.3 — TCP Server Setup

| # | Scenario | Assertions |
|---|----------|-----------|
| 1.3.1 | TCP server created and listens on correct port | `NetCreateServer` called; `.listen(COM_PORT(ENV_TYPE), '0.0.0.0')` |
| 1.3.2 | TCP client connection enables keepalive | `c.setKeepAlive(true, 10000)` called |

#### 1.4 — TCP Data Handling

| # | Scenario | Assertions |
|---|----------|-----------|
| 1.4.1 | Valid JSON TCP data with `{ send, data, adultonly, auth }` | Internal `sendWs()` called with `recvData.data`, `recvData.adultonly`, `recvData.auth` |
| 1.4.2 | Invalid JSON TCP data | `handleError` called with parse error and `'Client'` context; raw data logged |
| 1.4.3 | TCP data with `adultonly=1, auth=1` | `sendWs` called → `data.level` is `2` |
| 1.4.4 | TCP data with `adultonly=1, auth=0` | `sendWs` called → `data.level` is `1` |
| 1.4.5 | TCP data with `adultonly=0, auth=0` | `sendWs` called → `data.level` is `0` |

#### 1.5 — Edge Cases

| # | Scenario | Assertions |
|---|----------|-----------|
| 1.5.1 | `mainInit` called with `null` server | `Ws.Server` still instantiated (ws library handles the error) |
| 1.5.2 | TCP receives empty buffer | JSON.parse fails → `handleError` invoked |
| 1.5.3 | TCP receives partial/fragmented JSON | JSON.parse fails → `handleError` invoked, raw data logged |

---

### 2. `init()`

#### 2.1 — TCP Client Connection

| # | Scenario | Assertions |
|---|----------|-----------|
| 2.1.1 | Connects to correct host and port | `NetConnect` called with `COM_PORT(ENV_TYPE)`, `FILE_IP(ENV_TYPE)` |
| 2.1.2 | Sets keepalive on successful connection | `client.setKeepAlive(true, 10000)` called in connect callback |
| 2.1.3 | Logs connection success | `console.log('connected to server!')` called |

#### 2.2 — Disconnect & Reconnect

| # | Scenario | Assertions |
|---|----------|-----------|
| 2.2.1 | `end` event fires | `console.log('disconnected from server')` called |
| 2.2.2 | `close` event fires → auto-reconnect | `setTimeout` called with 10000ms delay; `init()` called recursively |
| 2.2.3 | Multiple close events → each triggers reconnect | Each `close` schedules a new `setTimeout`; no stack overflow (async) |

#### 2.3 — Edge Cases

| # | Scenario | Assertions |
|---|----------|-----------|
| 2.3.1 | Connection refused (file server down) | `close` event fires → reconnect loop engages |
| 2.3.2 | `init()` called multiple times | Each call overwrites `client`; previous socket reference is lost |

---

### 3. Default Export (sendWs Dispatcher)

#### 3.1 — Discord Routing (`ds=true`)

| # | Scenario | Assertions |
|---|----------|-----------|
| 3.1.1 | `ds=true` with string data | `sendDs` called with `data.toString()`; internal `sendWs` NOT called; `client.write` NOT called |
| 3.1.2 | `ds=true` with object data | `sendDs` called with `data.toString()` (yields `[object Object]`); early return |
| 3.1.3 | `ds=true`, ignores `adultonly` and `auth` | `sendDs` called regardless of `adultonly`/`auth` values |

#### 3.2 — WebSocket + TCP Routing (`ds=false` / default)

| # | Scenario | Assertions |
|---|----------|-----------|
| 3.2.1 | `ds=false` (default), `client` is connected | Both `sendWs()` and `client.write()` called |
| 3.2.2 | `ds=false`, `client` is `null` | `sendWs()` called; `client.write()` NOT called (no TCP relay) |
| 3.2.3 | `ds` parameter omitted | Defaults to `false`; routes to WS+TCP path |

#### 3.3 — TCP Payload Serialization

| # | Scenario | Assertions |
|---|----------|-----------|
| 3.3.1 | `adultonly` truthy → serialized as `1` | `client.write` payload includes `adultonly: 1` |
| 3.3.2 | `adultonly` falsy → serialized as `0` | `client.write` payload includes `adultonly: 0` |
| 3.3.3 | `auth` truthy → serialized as `1` | `client.write` payload includes `auth: 1` |
| 3.3.4 | `auth` falsy → serialized as `0` | `client.write` payload includes `auth: 0` |
| 3.3.5 | Payload includes `send: 'web'` | `client.write` JSON always contains `send: 'web'` |
| 3.3.6 | `data` object passed by reference | Same `data` ref appears in payload `data` field |

#### 3.4 — Edge Cases & Error Handling

| # | Scenario | Assertions |
|---|----------|-----------|
| 3.4.1 | `data` is `undefined` | `sendWs()` receives `undefined`; `JSON.stringify` produces valid output; no crash |
| 3.4.2 | `data` is `null` | `sendWs()` receives `null`; `data.level` assignment throws → test expected behavior |
| 3.4.3 | `data` contains circular reference | `JSON.stringify` throws in `client.write` path |
| 3.4.4 | `client.write` throws (broken pipe) | Error propagates (no try/catch in default export) |
| 3.4.5 | Very large `data` payload | Serialization succeeds; WS and TCP both receive full payload |

---

### 4. Internal `sendWs(data, adultonly, auth)`

#### 4.1 — Guard Clause

| # | Scenario | Assertions |
|---|----------|-----------|
| 4.1.1 | `wsServer` is `null` (main server process) | Function is a no-op; no error thrown |
| 4.1.2 | `wsServer` is initialized (file server process) | Proceeds to broadcast |

#### 4.2 — Level Computation

| # | Scenario | Assertions |
|---|----------|-----------|
| 4.2.1 | `auth=true, adultonly=true` | `data.level === 2` |
| 4.2.2 | `auth=false, adultonly=true` | `data.level === 1` |
| 4.2.3 | `auth=true, adultonly=false` | `data.level === 0` |
| 4.2.4 | `auth=false, adultonly=false` | `data.level === 0` |
| 4.2.5 | `auth=1, adultonly=1` (truthy integers) | `data.level === 2` |
| 4.2.6 | `auth=0, adultonly=0` (falsy integers) | `data.level === 0` |
| 4.2.7 | `auth=undefined, adultonly=undefined` | `data.level === 0` |
| 4.2.8 | `auth=null, adultonly=1` | `data.level === 1` |

#### 4.3 — Broadcasting

| # | Scenario | Assertions |
|---|----------|-----------|
| 4.3.1 | 0 connected WS clients | `forEach` iterates zero times; no error |
| 4.3.2 | 1 connected WS client | `client.send` called once with stringified data |
| 4.3.3 | N connected WS clients | `client.send` called N times; all receive identical `sendData` string |
| 4.3.4 | Data mutation: `level` added before stringify | `data.level` property exists on original object after call |

#### 4.4 — Edge Cases

| # | Scenario | Assertions |
|---|----------|-----------|
| 4.4.1 | One client's `.send()` throws | Other clients still receive message (forEach continues) — **verify actual behavior** (may throw and abort) |
| 4.4.2 | `wsServer.clients` is empty Set | No calls to `.send()`; no error |
| 4.4.3 | `data` already has a `level` property | Overwritten by computed level |

---

## Summary: Coverage Matrix

| Function | Branches | Scenarios | Notes |
|---|---|---|---|
| `mainInit` | 4 (2× JSON parse success/fail) | 13 | Covers WS + TCP server init, message parsing |
| `init` | 2 (close → reconnect) | 5 | Covers connect, disconnect, reconnect loop |
| Default export | 4 (`ds`, `client` null checks) | 12 | Covers Discord routing, TCP serialization |
| Internal `sendWs` | 4 (`wsServer` guard + 3-way ternary) | 12 | Covers level computation, broadcast |
| **Total** | **14** | **42** | — |
