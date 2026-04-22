# Full-Stack Testing Strategy & Roadmap

> Where the codebase stands today, and what is still required to reach
> production-grade end-to-end test confidence across **Frontend, Backend,
> MongoDB, Redis, WebSocket, File Storage, External APIs and Two-Server
> Container Orchestration**.

---

## 0. Current Baseline (2026-04-22)

| Layer | What we have | What we don't have |
|---|---|---|
| Backend unit tests | **37 suites / 4 109 tests / 12 snapshots**, ~90-100% line coverage on most `models/*` and `controllers/*` | Coverage is uneven — `bitfinex-tool.js` ~56%, parts of file-server flow uncovered |
| Backend mocking | ESM `jest.unstable_mockModule()` everywhere, lots of seam exports (`_setState`, factories) | No contract tests against real `bfx-api-node-rest`, MongoDB, Redis |
| Frontend | (none in repo so far) | No Jest/Vitest, no React Testing Library, no Storybook, no visual regression |
| Integration (single container) | Implicit through controller tests with mocked deps | No real Express boot + supertest, no real Mongo/Redis through Docker |
| End-to-end (browser) | (none) | No Playwright/Cypress, no auth-cascade test (main → file server) |
| Performance / load | (none) | No k6 / autocannon, no WebSocket load harness |
| Security | (none automated) | No SAST, no dependency-vuln scan in CI, no DAST |
| CI/CD | (none committed) | No GitHub Actions / pipeline, no coverage gating |

The next sections describe **what to build next, in priority order**, with
concrete tools, file locations and acceptance criteria.

---

## 1. Backend — close the remaining unit-test gaps

### 1.1 `bitfinex-tool.js` — push from 56% → 90%
After Phases B/C/A, the realistic remaining work is:

| Region (lines) | Why it's uncovered | What to do |
|---|---|---|
| `singleLoan` body inside `setWsOffer` | Lives in 2000-line closure with `userRest` captured | **Phase A-2**: extract as `export const singleLoanFn(id, current, userRest, deps)` and route the closure call through it. Then unit-test each branch (rate range, MR/DR pushers, calKeepCash with seeded `available[id][type]`). |
| `singleTrade.getAM` deep money flows | Same closure issue + 3 `real_delete` for-loops | Same pattern: extract `getAMFn(id, current, userRest, deps)`. Inject a tiny `userRestFake` with deterministic `cancelOrder/transfer/submitOrder` returning crafted IDs. |
| `recur_status` (~250 lines) | Heaviest branch tree (web/buy/sell × `ing` states × profit deltas) | Property-test friendly: extract, then write **table-driven tests** — one row per `(side, ing, web-position, profit, mid)` quadruple. |
| `recur_NewOrder` (~190 lines) | Order side-flag dispatch | Same — table-driven extract. |
| `setBitfinex` / `deleteBot` / `query` | Currently exercised via `defaultExport` happy path only | Add explicit error paths (`Mongo` rejects, missing user, dup symbol). |

> **Pre-existing bug to fix in a separate PR**: `real_delete` at the original
> L1696 has `for (let j = ...; i++)` — should be `j++`. Not behaviour-breaking
> in normal flow because the loop body `break`s on match, but the iteration
> never advances when no match. Add a regression test before fixing.

### 1.2 Other backend modules below 95%
Run a coverage pass and target the long tail:

```bash
docker exec -w /app -e NODE_OPTIONS=--experimental-vm-modules reactnode-server \
  npx jest --forceExit --coverage 2>&1 | tail -80
```

Then for each file under threshold:
1. Identify uncovered branches with `--collectCoverageFrom='<file>'`.
2. Decide: **dead code → delete**, **integration-only → mark in this doc**, **add unit test**.

---

## 2. Backend Integration tests (single-process, real deps)

Goal: catch wiring bugs that pure mocks miss — Express middleware order, real
Mongo aggregation pipelines, Redis session round-trip, multipart upload.

### 2.1 Stack
- **supertest** (already a dev dep candidate) for in-process HTTP.
- **mongodb-memory-server** for ephemeral Mongo per-suite.
- **ioredis-mock** *or* a Dockerised Redis via `testcontainers-node` for real
  Redis pub/sub semantics (we use sessions + WebSocket fan-out).
- **ws** test client for WebSocket assertions.

### 2.2 What to write
| Suite | Boots | Asserts |
|---|---|---|
| `controllers/server.integration.test.js` | Real Express main server with `Mongo` pointing at memory-server, real `Redis` mock | `POST /api/login` returns 200 + sets cookie; `GET /api/user/me` returns 401 without cookie, 200 with |
| `controllers/file-server.integration.test.js` | Real file-server with TCP and WS sockets bound to ephemeral ports | Upload a 1KB fake file via multipart; assert it lands in `/tmp/test-uploads/`; assert WebSocket `'progress'` event fires |
| `flows/cascading-login.integration.test.js` | Both servers concurrently | `POST /api/login` then `POST /f/api/login` reusing the access token; assert second call returns 200 |
| `flows/background-job.integration.test.js` | Run `cmd/background.js` once with seeded data | Assert TCP-pushed WS events arrive at file server → forwarded to test WS client |

### 2.3 Acceptance
- Suite can run via `npm run test:integration` inside Docker.
- 30-second budget per suite.
- Skipped automatically (with `console.warn`) if `mongodb-memory-server` cannot
  download (offline CI).

---

## 3. Real-DB / Real-Redis Smoke Tests (compose-driven)

The integration suite above mocks Mongo/Redis. We **also** need a thin smoke
layer that runs against the actual `mongo` and `redis` containers from
`docker-compose.yml` to catch:
- Mongo index conflicts (we have a `mongoIndex` directory of seed indexes)
- Redis ACL / TLS misconfig
- Network/DNS in compose

### 3.1 Layout
```
test/
  smoke/
    docker-compose.smoke.yml     # mongo + redis + reactnode-server only
    setup.sh                     # waits for healthchecks, seeds fixtures
    mongo.smoke.test.js          # CRUD a doc through the running model
    redis.smoke.test.js          # session set/get/expire round-trip
    bitfinex-publish.smoke.test.js  # publish dummy bitfinex event, assert WS forwards
```

### 3.2 Run
```bash
docker compose -f test/smoke/docker-compose.smoke.yml up -d --wait
test/smoke/setup.sh
docker exec reactnode-server npx jest --config jest.smoke.cjs --forceExit
docker compose -f test/smoke/docker-compose.smoke.yml down -v
```

### 3.3 Acceptance
- Runs in CI nightly (NOT per-PR — too slow).
- Failures block release tags.

---

## 4. Frontend — the missing 50% of the picture

### 4.1 Pick a test stack
Recommended (Tier 1):
- **Vitest** + **@testing-library/react** for component / hook unit tests
  (faster than Jest, native ESM, same API).
- **MSW (Mock Service Worker)** to mock `/api/*` and `/f/api/*` calls at the
  network layer — keeps tests realistic without a backend.
- **Storybook 7+** for component catalog + `@storybook/test-runner` for
  interaction tests + `@chromatic-com` (or Loki) for visual regression.

### 4.2 Coverage targets
| Area | Tests to write |
|---|---|
| Pure utility files in `src/front/util/` | 100% line via Vitest |
| React components in `src/front/component/` | RTL: render, user-event, accessibility (`@axe-core/react`) snapshot |
| Custom hooks (`useXxx.js`) | `@testing-library/react-hooks`, exercise loading/error/data states |
| Redux/Context stores | Action creators + reducers as pure unit; selectors with snapshot fixtures |
| Page-level routes (`src/front/page/`) | RTL with MSW serving canned `/api/...` responses; assert title, error toasts, redirect on 401 |

### 4.3 Folder layout
```
src/front/
  component/
    UserCard/
      UserCard.jsx
      UserCard.test.jsx          ← Vitest + RTL
      UserCard.stories.jsx       ← Storybook
```

### 4.4 Acceptance
- `npm run test:front` runs Vitest in `--coverage` mode, fails below 80%
  lines on `src/front/**`.
- `npm run storybook` boots locally.
- `npm run chromatic` (or `npm run loki test`) gates visual diffs.

---

## 5. End-to-End (browser-driven, both servers + Mongo + Redis + Nginx)

### 5.1 Stack
- **Playwright** (Tier 1 — multi-browser, trace viewer, network mocking).
  Cypress is acceptable but slower in CI and worse at multi-tab/multi-origin
  scenarios.
- **docker-compose.e2e.yml** — full stack: `reactnode-server`, `reactnode-file-server`,
  `mongo`, `redis`, `nginx-proxy` (port 8080), all with `NODE_ENV=test`.
- **Playwright sharding** (`--shard=i/N`) for CI parallelism.

### 5.2 Critical user journeys to cover
| Journey | Why it matters |
|---|---|
| Sign-up → email-verify (mock SMTP) → login → access dashboard | Auth foundation |
| Login on main → `/f/api/login` cascade succeeds → upload file → see it in storage list | Two-server contract |
| Bookmark CRUD (create / list / delete) | Most-used feature |
| Stock query (mocked Yahoo response) | External-API integration glue |
| Bitfinex bot CRUD + start (mock WS) → see live order on dashboard | WebSocket UX |
| Password vault: set master pw, store secret, reveal, copy to clipboard | Crypto + clipboard API |
| File upload progress (≥10MB) → WebSocket progress events update UI | Real-time path |
| Logout invalidates **both** server sessions | Security |

### 5.3 Layout
```
e2e/
  fixtures/        seed scripts that talk to in-cluster Mongo
  pages/           page object models
  tests/
    auth.spec.ts
    upload.spec.ts
    bitfinex.spec.ts
    ...
  playwright.config.ts
```

### 5.4 Acceptance
- Runs nightly + on `main` push.
- Trace + screenshot uploaded as artifact on failure.
- Total wall-time < 15 min when sharded across 4 workers.

---

## 6. WebSocket / Real-time test harness

The file server has a `/f` WebSocket endpoint **and** a TCP comm channel from
the background process. These are easy to break and currently untested.

### 6.1 Build a `WsHarness`
```js
// test/util/ws-harness.js
export const WsHarness = {
  connect: async (url) => { /* return { send, expect, close } */ },
  expectMessage: (matcher, timeout=2000) => { /* race against timeout */ },
};
```

### 6.2 Test cases
- `progress` event during upload (already partially in integration layer).
- `bitfinex` push after order event (use `_setState` to seed, call
  `makeOnFundingOfferNew` directly, expect WS push within 100ms).
- Reconnect after server restart — client receives full state replay.
- Backpressure: 10 000 msgs in 1 s; assert no message dropped, server RSS
  doesn't blow past `WS_BACKPRESSURE_LIMIT`.

---

## 7. Performance & Load

### 7.1 Tools
- **k6** for HTTP — scripted in JS, easy CI integration, prometheus exporter.
- **autocannon** for quick local benchmarks.
- **Artillery** with the `artillery-engine-socketio` for WebSocket load.

### 7.2 Scenarios
| Scenario | Target |
|---|---|
| `GET /api/user/me` p95 | < 50 ms at 200 RPS |
| `POST /f/api/upload` 1MB file | 100 concurrent uploads, no 5xx |
| 5 000 idle WS connections | RSS < 500MB, CPU < 30% |
| Bitfinex bot tick (sim 50 users) | event loop lag p99 < 30 ms |

### 7.3 Output
Trend graphs in Grafana (k6 → InfluxDB → Grafana stack runs in compose). Baseline
checked into `perf/baseline.json`; CI fails if regression > 15%.

---

## 8. Security testing

### 8.1 Static
| Tool | What |
|---|---|
| **`npm audit --production`** + **Snyk** or **Socket.dev** | Dependency CVEs |
| **`eslint-plugin-security`** | Common Node anti-patterns |
| **Semgrep** with the `nodejs` ruleset | Custom rules (e.g., shell injection, prototype pollution, JWT-misuse) |
| **`gitleaks`** in pre-commit + CI | Secret scanning (esp. since `release-ver.js` hardcodes prod creds) |

### 8.2 Dynamic
- **OWASP ZAP** baseline scan against the e2e compose stack — fail on Medium+
  alerts.
- **`@playwright/experimental-ct-react`** axe scans for accessibility (counts as
  a security-adjacent control for keyboard users).

### 8.3 Auth-specific
- Brute-force test: 50 failed logins → 6th rejected with 429.
- Cookie flags: `Secure`, `HttpOnly`, `SameSite=Lax/Strict`.
- CSRF token presence on state-changing routes (currently unclear — audit).
- Cascading-login session expiry: main-server token revoked → file-server
  next request returns 401.

---

## 9. Contract tests against external APIs

We wrap many third-party services: Bitfinex REST/WS, Yahoo Finance,
TD Ameritrade, OpenSubtitles, Google APIs, Discord, TWSE, Shioaji.
Their schemas drift; mocks must be kept honest.

### 9.1 Pattern
1. Record a **golden response** with a real call (one-shot, manual).
2. Commit it under `test/fixtures/<vendor>/<endpoint>.json`.
3. Provide a **Jest matcher** (`toMatchSchema`) using `ajv` against a
   committed JSON schema.
4. Add a **nightly check** (`test:contract`) that hits the real API
   (with secrets from CI Vault) and re-validates the schema. Failures open
   an issue, do **not** block PRs.

### 9.2 Files
```
test/
  contract/
    bitfinex.contract.test.js
    yahoo.contract.test.js
    tdameritrade.contract.test.js
    schemas/
      bitfinex-funding-offers.schema.json
```

---

## 10. Database & Cache test infrastructure

### 10.1 Mongo
- Use the existing `mongoIndex/` seed scripts as the source of truth — wrap
  them in `test/util/mongo-fixtures.js`.
- Snapshot index lists in tests (`db.collection.indexes()`) — fail when an
  index disappears.
- Migration tests: when a `migrations/` folder is added, each migration must
  ship with an up + down + idempotency test.

### 10.2 Redis
- Pub/sub round-trip test (publisher in main, subscriber in file server).
- TTL test on session keys (`SESSION_TTL` = ?, set in `node-*-config.js`).
- Memory-pressure: fill Redis to `maxmemory`, assert eviction policy is
  `allkeys-lru` (or what the config says).

---

## 11. CI/CD pipeline (the missing glue)

Recommended stage layout in `.github/workflows/ci.yml`:

```
stage 0  install + cache
stage 1  lint            (eslint)        ← currently absent? add it
stage 2  unit-back       jest --forceExit, coverage gate ≥ 90% on changed files
stage 3  unit-front      vitest          (after frontend tests exist)
stage 4  integration     supertest + memory-server
stage 5  smoke           docker compose up -d → smoke jest → down
stage 6  e2e             playwright (matrix: chromium/firefox/webkit)
stage 7  perf-baseline   k6 (only on main)
stage 8  security        npm audit + semgrep + zap baseline (only on main)
stage 9  publish         build images, push to registry
```

Coverage is enforced via **codecov** with `target: auto`, `threshold: 1%`.

### Branch rules
- `main` requires stages 1-4 + 6 green.
- Tags require all stages 1-9.

---

## 12. Test-data & Fixture management

Today fixtures live inline. As the suite grows we need:
- `test/fixtures/users/`, `test/fixtures/bitfinex/`, ... — one JSON per case.
- `test/factories/` — `userFactory({ overrides })` style builders (use
  **`fishery`** library — TypeScript-native, ESM-friendly).
- A single `seed.js` callable from any layer to produce a known starting state.

---

## 13. Coverage philosophy & gates

| Layer | Line target | Branch target |
|---|---|---|
| Pure utilities (`util/*`, `front/util/*`) | 100 | 95 |
| Models (`back/models/*`) | 95 | 85 |
| Controllers / routers | 90 | 80 |
| React components | 80 | 70 |
| `bitfinex-tool.js` (special-cased) | 90 *after Phase A-2* | 70 |
| Bootstrapping files (`server.js`, `file-server.js`) | 60 (entry-point — covered by integration) | n/a |

Coverage **must not regress** by more than 1pp on any PR. Use Codecov's
`patch` and `project` checks.

---

## 14. Observability in tests

Tests should fail loudly, not silently. Adopt:
- `--detectOpenHandles` in CI (currently we use `--forceExit` which masks
  leaks). Track and close every leak.
- A custom Jest reporter that prints **slowest 10 tests** per run.
- Trace-on-failure for Playwright (`trace: 'retain-on-failure'`).
- `console.error` interceptor that fails the test if anything is logged
  outside an `expect.fn().toHaveBeenCalledWith(...)`.

---

## 15. People & Process

- **Definition of Done** (add to PR template): "Touched code has unit tests,
  coverage delta is ≥ 0, integration test added if external boundary changed."
- **Bug → test first**: every prod bug ticket starts with a failing test in
  the PR description.
- **Quarterly chaos day**: kill mongo / redis / file-server mid-test-run;
  assert graceful degradation.
- **Two-week mutation testing experiment**: try **Stryker** on
  `back/models/utility.js` first. Surfaces tests that don't actually assert.

---

## 16. Suggested execution order (next 4 quarters of work)

1. **Q1** — Backend gap-fill: bitfinex Phase A-2 + 95% on every model file +
   add `npm run lint` + Codecov + GitHub Actions stages 0-2.
2. **Q2** — Integration layer: supertest + memory-server suites; smoke
   compose suite; CI stage 4 + 5.
3. **Q3** — Frontend + Storybook + visual regression; CI stage 3.
4. **Q4** — E2E with Playwright; perf baselines; security scans; CI stages
   6-8. Tag the first **release-with-confidence** version.

---

## Quick wins you can ship next week

1. Add `eslint` + a `lint` npm script (we don't even have one yet).
2. Add `test:coverage` script that runs Jest with `--coverage` and pipes JSON
   to `coverage-summary.json`.
3. Add a GitHub Actions YAML that runs unit tests in the existing Docker
   image — even without integration/e2e, this stops broken PRs.
4. Apply Phase A-2 (extract `singleLoanFn` / `getAMFn`) to lift bitfinex
   coverage past 80% in a single PR — biggest ROI on existing scope.
5. Delete the `process.on('unhandledRejection')` swallow in
   `bitfinex-tool.test.js` and re-enable the stub-skipped "low rate path"
   test — Phase B/C made this possible.

---

## Appendix: Section 1 Execution Status (2026-04-22)

### 1.2 — Triage of files below 95% line coverage (full repo baseline)

After Phase C+A landed (210 bitfinex tests), running `--coverage` against `src/back/**/*.js`:

| File | Lines % | Status / Action |
|---|---|---|
| `back/cmd/googledrive.js` | 0% | **DEAD** (no inbound imports). Recommend deletion in a separate cleanup PR. |
| `back/cmd/tdameritrade.js` | 0% | **DEAD** (cmd wrapper not imported). Recommend deletion. |
| `back/controllers/fitness-router.js` | 0% | **DEAD** — `server.js` import is commented out. |
| `back/controllers/rank-router.js` | 0% | **DEAD** — `server.js` import is commented out. |
| `back/models/fitness-tool.js` | 0% | **DEAD** — only consumer is the dead `fitness-router.js`. |
| `back/models/rank-tool.js` | 0% | **DEAD** — only consumer is the dead `rank-router.js`. |
| `back/util/kubo.js` | 0% | **DEAD** — only commented import in `external-tool.js`. |
| `back/controllers/lottery-router.js` | 0% | **ACTIVE** but untested (server.js + file-other-router.js import it). Add tests in next PR. |
| `back/models/lottery-tool.js` | 0% | **ACTIVE** but untested. Add tests in next PR. |
| `back/models/bitfinex-tool.js` | 56.33% | Needs **Phase A-2** (see 1.1 below). |
| `back/controllers/bookmark-router.js` | 90.47% | Edge cases left (`isDefaultTag` channel branch, search-tags adultonly flag, error catches). |
| `back/models/mongo-tool.js` | 90.62% | Uncovered = connect-time error branches (require ESM re-import gymnastics). |
| `back/controllers/login-router.js` | 92.85% | Uncovered = `req.logIn()` callback. |
| `back/controllers/parent-router.js` | 93.18% → **~98%** ✅ | Added 4 catch-error tests (2026-04-22). |

### 1.2 — Quick wins shipped this PR
- `parent-router.test.js`: +4 tests covering `.catch(err => handleError(err, next))` paths for `password/stock/fitness/rank /query` endpoints. Lifts parent-router from 93.18% → ~98%.

### 1.2 — Recommended follow-up PR (small)
1. **Delete dead modules** (≈ 7 files, ~1100 lines): `cmd/googledrive.js`, `cmd/tdameritrade.js`, `controllers/fitness-router.js`, `controllers/rank-router.js`, `models/fitness-tool.js`, `models/rank-tool.js`, `util/kubo.js`. Verify the commented imports in `server.js` and `external-tool.js` are intentional, then strip them. Will lift overall coverage by mechanical denominator reduction.
2. **Test lottery-tool + lottery-router** (the only active 0% modules). Lottery is small (~482 lines combined) and has clear pure logic — straightforward unit tests.
3. **bookmark-router edge tests**: cover `isDefaultTag.index === 30 / [1] === 'ch'` channel-bookmark path, and the `searchTags()` adultonly branch.
4. **mongo-tool connect-error tests**: requires resetting `jest.resetModules()` between tests with different mock conditions for `MongoClient.connect` and `db.collection`.

### 1.1 — `bitfinex-tool.js` 56% → 90%

**What's done** (from previous PRs):
- Phases B / C / A landed: 9 nested-promise → async/await conversions, 13 WS handler factories extracted as `makeOnXxx(id, ...)`, `initialBookFn(id, userRest)` extracted to module level.
- 18 direct unit tests added against the extracted factories.
- Coverage 54% → **56.33%**, tests 192 → **210**.

**What's NOT done** (remaining ~34pp lift):
- **Phase A-2** — extract `singleLoanFn(id, current, userRest, uid, deps)` (408 lines from inside `setWsOffer`) and `singleTradeFn(id, current, userRest, uid, deps)` (902 lines, includes `getAM`, `recur_status`, `recur_NewOrder`).

**Why Phase A-2 is its own focused PR (not bundled here)**:
- Each function depends on captured closure variables: `id`, `userRest`, `uid`, `curArr`, `_processOrderRest`, plus 5+ module-state references.
- `singleTrade.getAM` has the pre-existing `i++`-instead-of-`j++` bug that should be fixed *with* a regression test in the same PR.
- `recur_status`/`recur_NewOrder` need to be flattened to async/await *before* extraction or the table-driven tests won't be deterministic.
- Risk profile justifies a single dedicated PR with focused review — not a multi-track change inside a coverage push.

**Recommended Phase A-2 PR plan** (one engineer, ~2 days):
1. Convert `recur_status` and `recur_NewOrder` to async/await for-loops (mirrors Phase B pattern). Run 4 113 tests — must stay green.
2. Extract `singleLoanFn` to module level. Replace `singleLoan = current => singleLoanFn(id, current, userRest, deps)` inside `setWsOffer`. Run tests.
3. Extract `singleTradeFn` similarly. Fix the `i++`/`j++` bug as a labelled commit with a new test that asserts cancel iterates through all candidates.
4. Add table-driven tests:
   - `singleLoanFn`: 12 cases parameterised over `(rate, MR, MR2, KAM, dynamicRate1/2)`.
   - `singleTradeFn.getAM`: 8 cases over `(needTrans sign, availableMargin sign, current.clear, real_id has PARTIALLY)`.
   - `recur_status`: 20+ cases over `(side, ing, web-position, profit delta, mid sign)`.
   - `recur_NewOrder`: 10+ cases over `(orderType, sideFlag, current.allow, deletePending)`.
5. Re-enable the stub-skipped "low rate path → MR>0 and rate < MR" test once fire-and-forget chains are gone.
6. Remove `process.on('unhandledRejection', ()=>{})` swallow from `beforeEach`.

**Projected outcome of Phase A-2**: lines 56% → **80-85%**; the remaining 5-10pp requires recorded-fixture replay against the real Bitfinex sandbox (out of scope for unit tests).

### Final state after this PR
- Full repo: **37 suites / 4 113 tests** all passing.
- Repo-wide line coverage: **87.96%** (statements 86.65%, branches 79.13%, functions 81.98%).
- See `doc/back/models/BITFINEX-TOOL-TESTABILITY.md` for the bitfinex-specific roadmap.
