# Frontend Testing & Dead-Code Cleanup Plan

> Goal: 100% meaningful test coverage on active frontend code, remove all dead
> code, and establish the infrastructure for ongoing frontend quality.

---

## 0. Current State (Updated)

| Metric | Value |
|--------|-------|
| Total frontend files | **97** active `.js` files in `src/front/` (28 dead removed) |
| Test files | **8** test suites |
| Test count | **230** passing tests |
| Coverage (tested modules) | actions 100%, reducers 99%, utility 94%, constants 100% |
| Coverage (overall frontend) | ~15% (most components/containers untested) |
| Stack | React 17 (class components), Redux 4, React Router 5, Bootstrap 3, Chart.js 2 |
| Test framework | **Jest 27** + babel-jest + jsdom + @testing-library/react@12 |

### Completed phases

| Phase | Status |
|-------|--------|
| 1. Dead Code Removal | ✅ Done — 28 files deleted, all references cleaned |
| 2. Test Infrastructure | ✅ Done — Jest config, setup, helpers, file mocks |
| 3. Pure Logic Tests | ✅ Done — utility, actions, reducers, API functions |
| 4. Component Tests | 🔄 Started — AlertMsg, Alertlist, ToggleNav, WidgetButton, Dropdown, DropdownMenu, GlobalComfirm, UserInput, ReAlertlist |
| 5. Page-Level Tests | ⬜ Not started |
| 6. Integration Tests | ⬜ Not started |

### Node.js Constraint

Docker containers run **Node.js 14.21.3**. Vitest/MSW 2.x require Node 18+.
All frontend tests use Jest 27 + babel-jest + jest-environment-jsdom@27.

---

## 1. Dead Code Removal — ✅ DONE

### 1.1 Files to delete (28 files)

**Components** (10):
```
src/front/components/Fitness.js
src/front/components/FitnessInfo.js
src/front/components/FitnessStatis.js
src/front/components/ItemFitness.js
src/front/components/ItemRank.js
src/front/components/ItemLottery.js
src/front/components/Lottery.js
src/front/components/Rank.js
src/front/components/RankInfo.js
src/front/components/RankStatis.js
```

**Containers** (18):
```
src/front/containers/ReFitness.js
src/front/containers/ReFitnessCategorylist.js
src/front/containers/ReFitnessInfo.js
src/front/containers/ReFitnessItemHead.js
src/front/containers/ReFitnessItemPath.js
src/front/containers/ReFitnessItemlist.js
src/front/containers/ReFitnessStatis.js
src/front/containers/ReItemFitness.js
src/front/containers/ReItemLottery.js
src/front/containers/ReItemRank.js
src/front/containers/ReLottery.js
src/front/containers/ReLotteryItemlist.js
src/front/containers/ReRank.js
src/front/containers/ReRankCategorylist.js
src/front/containers/ReRankInfo.js
src/front/containers/ReRankItemHead.js
src/front/containers/ReRankItemPath.js
src/front/containers/ReRankItemlist.js
```

### 1.2 Code to clean in remaining files

| File | What to remove |
|------|----------------|
| `constants.js` | L65-87: commented-out FITNESS/RANK/LOTTERY constants |
| `actions/index.js` | All commented-out fitness/rank/lottery action creators and their imports |
| `reducers/index.js` | L21-36: commented-out reducers, L48-54: commented-out combineReducers entries |
| `components/App.js` | L20-28: commented imports and route comments, L43-45: commented navlist items |
| `components/Itemlist.js` | L5-6: commented ReItemFitness/ReItemRank imports |
| `components/Categorylist.js` | L5-6: commented ReFitnessInfo/ReRankInfo imports |

### 1.3 Validation

After deletion, run `npm run dev-build` inside Docker to confirm webpack still bundles
without errors. Dead files are unreferenced — removal is safe.

---

## 2. Test Infrastructure Setup — ✅ DONE

### Actual implementation (Node 14 compatible)

- **Config**: `jest.front.cjs` — jsdom env, babel-jest transform, identity-obj-proxy for CSS
- **Setup**: `src/front/__tests__/setup.js` — browser globals (Headers, WebSocket, scrollTo, CustomEvent, localStorage)
- **After-env setup**: `src/front/__tests__/setupAfterFramework.js` — @testing-library/jest-dom + cleanup
- **File mock**: `src/front/__tests__/fileMock.js` — for static assets
- **Helpers**: `src/front/__tests__/helpers.js` — renderWithProviders, createTestStore

### npm scripts

```json
{
  "test:front": "jest --config jest.front.cjs --forceExit",
  "test:front:watch": "jest --config jest.front.cjs --watch",
  "test:front:coverage": "jest --config jest.front.cjs --forceExit --coverage",
  "dev-test-front": "docker exec -w /app reactnode-file-server npx jest --config jest.front.cjs --forceExit --no-cache"
}
```

### Dependencies (devDependencies)

```
@testing-library/react@12 (React 17 compatible)
@testing-library/jest-dom@5 (Node 14 compatible)
@testing-library/dom@9
@testing-library/user-event@14
jest-environment-jsdom@27
identity-obj-proxy@3
```

---

## 3. Test Plan — Layer by Layer

### 3.1 Pure Utilities (`utility.js`) — Target: 100%

`utility.js` exports 14 functions, all are pure or trivially mockable.

| Function | Lines | Test strategy |
|----------|-------|---------------|
| `isValidString(str, type)` | 40-82 | Parameterized: all 10 types × valid/invalid |
| `killEvent(e, func)` | 84-88 | Mock event + callback |
| `randomFloor(min, max)` | 90-92 | Range assertion |
| `clearText(text)` | 94 | Character substitution |
| `checkInput(name, state, addalert, ...)` | 96-122 | All branches: confirm/no-confirm × valid/invalid |
| `errorHandle(response, relogin)` | 125-150 | Mock Response for each status code |
| `api(url, data, method, relogin)` | 152-169 | MSW or mock fetch; GET vs POST vs PUT |
| `doLogin(username, password, url)` | 172-183 | Mock cascading (info.url recursion) |
| `doLogout(url)` | 185-189 | Mock cascading logout |
| `testLogin()` | 191 | Simple mock |
| `arrayObject(action, myArray, term, ...)` | 194-205 | Map push/pop with arrays and singles |
| `arrayId(action, myArray, term, ...)` | 207-218 | Set push/pop |
| `arrayMerge(arrId, arrObj)` | 220-224 | Merge subset |
| `arrayObjectIndexOf(myArray, term, prop)` | 226-233 | Found/not-found |
| `getItemList(...)` | 238-255 | MSW; exercise all parameter combinations |
| `resetItemList(...)` | 257-262 | MSW |
| `dirItemList(...)` | 264-272 | MSW; multi vs single |
| `bookmarkItemList(...)` | 274-279 | MSW |
| `addCommas(nStr)` | 281-291 | Edge cases: negative, decimal, zero |
| `getRandomColor(opacity)` | 293-301 | With/without opacity |

**Estimated tests: ~80-100**

### 3.2 Constants (`constants.js`) — Target: 100%

No logic — only exported string/number constants.
One snapshot test to guard against accidental changes:

```js
import * as C from '../constants.js';
test('constants snapshot', () => expect(C).toMatchSnapshot());
```

### 3.3 Redux Layer — Target: 100%

#### Action Creators (`actions/index.js`, 453 lines)

All are pure `(args) → { type, ...payload }` functions. ~40 action creators.

```js
import { alertPush, alertPop, setBasic, ... } from '../actions/index.js';
test('alertPush', () => expect(alertPush('hi')).toEqual({ type: 'ALERT_PUSH', msg: 'hi' }));
```

**Estimated tests: ~40-50**

#### Reducers (10 active files, ~470 lines total)

| Reducer | Pattern | Strategy |
|---------|---------|----------|
| `alertHandle` | Custom push/pop | Test push adds, pop removes by key |
| `basicDataHandle` | SET_BASIC | Verify each field updates only when non-null |
| `uploadDataHandle` | SET_UPLOAD | Progress update |
| `simpleDataHandle(PUSH, POP)` | Factory → push/pop arrays | Test with fixture lists |
| `complexDataHandle(PUSH, POP, SET)` | Factory → complex state | Test SET_ITEM (list/path/pagination), PUSH (arrayObject), POP |
| `dirDataHandle(PUSH, POP, SET)` | Factory → dir trees | Test dir add/remove/set |
| `bookmarkDataHandle(PUSH, POP)` | Factory → bookmark lists | Test bookmark CRUD |
| `glbPwHandle` | Show/close modal | Toggle + callback |
| `glbCfHandle` | Show/close confirm | Toggle + callback + text |
| `glbInHandle` | Show/close input | Toggle + callback |

**Estimated tests: ~60-80**

#### Store (`configureStore.js`)

One integration test: create store, dispatch a few actions, verify shape.

### 3.4 Container Components (28 files) — Target: 100%

Containers are pure `connect(mapState, mapDispatch)(Component)`. Test strategy:

```js
import { renderWithProviders } from '../__tests__/helpers.js';
import ReLogin from '../containers/ReLogin.js';

test('ReLogin passes addalert to Login', () => {
  const { store } = renderWithProviders(<ReLogin />);
  // Verify Login receives addalert prop, dispatch works
});
```

Since containers are trivial wiring, one render test per container confirms
the Redux→props binding works. If a container has no `mapStateToProps`, just
verify it renders without crash.

**Estimated tests: ~28-35**

### 3.5 UI Components (40 active files, ~7500 lines) — Target: ≥90%

#### Tier 1: Small/Simple (render + basic interaction)

| Component | Lines | Strategy |
|-----------|-------|----------|
| `AlertMsg.js` | ~20 | Render, click dismiss |
| `Alertlist.js` | ~30 | Render list of alerts |
| `Homepage.js` | ~50 | Render static content |
| `Tooltip.js` | ~40 | Hover show/hide |
| `Navlist.js` | ~50 | Render nav items, active state |
| `ToggleNav.js` | ~30 | Click toggles |
| `Dropdown.js` | ~40 | Open/close, item click |
| `DropdownMenu.js` | ~30 | Render menu items |
| `GlobalPassword.js` | ~60 | Show modal, input, submit |
| `GlobalComfirm.js` | ~40 | Show modal, confirm/cancel |
| `UserInput.js` | ~60 | Input rendering, change events |

**Estimated tests: ~50-70**

#### Tier 2: Medium complexity (interaction + state + API calls)

| Component | Lines | Key behaviors to test |
|-----------|-------|-----------------------|
| `Login.js` | 80 | Submit form, validation, redirect on success, alert on failure |
| `Userlist.js` | ~100 | List users, click user shows info |
| `UserInfo.js` | 252 | Edit fields, save, permission display |
| `Storage.js` | ~100 | Category navigation, sort controls |
| `Password.js` | ~80 | List, search, category nav |
| `Stock.js` | ~80 | List, sort, category nav |
| `Bitfinex.js` | ~80 | List, filter, category nav |
| `ItemHead.js` | 143 | Sort click toggles asc/desc, labels |
| `ItemPath.js` | ~60 | Breadcrumb navigation |
| `Itemlist.js` | 204 | Pagination, empty state, loading |
| `Categorylist.js` | 251 | Tree expand/collapse, item click |
| `Dirlist.js` | ~60 | Directory tree rendering |
| `ItemPassword.js` | ~100 | Show/hide password, copy, edit |
| `ItemStock.js` | ~80 | Display data, bookmark toggle |
| `ItemBitfinex.js` | ~80 | Display trade data |

**Estimated tests: ~100-130**

#### Tier 3: Complex (media, charts, heavy state)

| Component | Lines | Key behaviors to test |
|-----------|-------|-----------------------|
| `MediaWidget.js` | 999 | Audio/video/image/PDF modes, playlist, controls, subtitle |
| `StockInfo.js` | 1494 | Chart rendering, data parsing, P/E calc, quarter selector |
| `BitfinexInfo.js` | 419 | Trade info display, WebSocket event handling |
| `PasswordInfo.js` | 372 | Decrypt display, field editing, master password |
| `ItemFile.js` | 317 | File preview, metadata, actions (move/copy/delete) |
| `FileUploader.js` | 174 | Drag-drop, progress, upload lifecycle |
| `FileFeedback.js` | 243 | Progress bars, completion states |
| `FileAdd.js` | 138 | URL/torrent/mega input, validation |
| `FileManage.js` | ~100 | Manage panel, batch operations |

Strategy for large components:
- Mock Chart.js canvas rendering
- Mock PDFJS
- Use MSW for API calls
- Test each lifecycle method / state transition independently
- Extract testable helpers where possible

**Estimated tests: ~150-200**

### 3.6 WebSocket Client (inside App.js)

The `App.js` component manages the WebSocket connection. Test:
- Connection lifecycle (open, message, close, reconnect)
- Message dispatch to Redux store
- Level-based filtering

**Estimated tests: ~10-15**

---

## 4. Coverage Breakdown & Targets

| Layer | Files | Lines | Target | Priority |
|-------|-------|-------|--------|----------|
| `utility.js` | 1 | 316 | 100% | P0 — pure logic |
| `constants.js` | 1 | 117 | 100% | P0 — snapshot |
| `actions/index.js` | 1 | 453 | 100% | P0 — pure functions |
| Reducers | 10 | 470 | 100% | P0 — pure functions |
| `configureStore.js` | 1 | 24 | 100% | P1 |
| Containers | 28 | 650 | 100% | P1 — trivial wiring |
| Components (Tier 1) | 11 | ~500 | 100% | P1 |
| Components (Tier 2) | 15 | ~1700 | ≥95% | P2 |
| Components (Tier 3) | 9 | ~4000 | ≥85% | P3 |
| **Total** | **77** | **~8230** | **≥90%** | — |

---

## 5. Implementation Order

### Phase 1: Dead code removal + infra setup
1. Delete 28 dead files (Fitness/Rank/Lottery)
2. Clean commented code from constants, actions, reducers, App, Itemlist, Categorylist
3. Verify webpack build still succeeds
4. Install Vitest + RTL + MSW + jsdom
5. Create vitest.config.js, setup file, MSW handlers
6. Add npm scripts

### Phase 2: Pure logic (utility + actions + reducers)
7. `utility.test.js` — all 19 exported functions
8. `constants.test.js` — snapshot
9. `actions/index.test.js` — all action creators
10. `reducers/*.test.js` — each reducer factory + specific reducers
11. Run coverage, should reach ~100% on these layers

### Phase 3: Container + simple component tests
12. `containers/*.test.js` — one render test per container
13. Tier 1 component tests (AlertMsg, Tooltip, Navlist, etc.)
14. Login component full test (form submit, validation, redirect)

### Phase 4: Medium components
15. Itemlist, ItemHead, Categorylist, Dirlist
16. Feature page components (Storage, Password, Stock, Bitfinex)
17. Item renderers (ItemPassword, ItemStock, ItemBitfinex, ItemFile)

### Phase 5: Complex components
18. MediaWidget (split by media type: audio, video, image, PDF)
19. StockInfo (chart mocking, data parsing)
20. BitfinexInfo, PasswordInfo
21. FileUploader, FileFeedback, FileAdd

### Phase 6: Integration & polish
22. App.js integration test (routing, WebSocket, auth flow)
23. Full `npm run test:front` with coverage enforcement
24. Fix any remaining gaps below threshold

---

## 6. Refactoring Opportunities (discovered during testing)

These are optional but improve testability and maintainability:

| Opportunity | Benefit | Risk |
|-------------|---------|------|
| Extract `MediaWidget` into sub-components (AudioPlayer, VideoPlayer, ImageViewer, PdfViewer) | Each < 200 lines, independently testable | Medium — complex state sharing |
| Extract `StockInfo` chart logic into a `useStockChart` hook or helper | Pure data → chart config is unit-testable | Low — isolated |
| Convert `UserInput.Input` class to a hook (`useFormInputs`) | Standard React pattern, easier to test | Low — localized |
| Move `errorHandle` out of utility.js into its own module | Cleaner separation of API vs data utils | Trivial |
| Extract WebSocket logic from App.js into `useWebSocket` hook | Independently testable reconnect/message logic | Medium |
| Convert class components to function components (long-term) | Hooks, better DX, smaller bundle | High — 40 files |

---

## 7. File Layout After Implementation

```
src/front/
  __tests__/
    setup.js                    ← Vitest/RTL setup
    helpers.js                  ← renderWithProviders, createMockStore
    mocks/
      handlers.js              ← MSW API handlers
      server.js                ← MSW setupServer
  actions/
    index.js
    index.test.js
  components/
    App.js
    App.test.js
    Login.js
    Login.test.js
    MediaWidget.js
    MediaWidget.test.js
    ... (co-located tests)
  containers/
    ReLogin.js
    ReLogin.test.js
    ...
  reducers/
    index.js
    alertHandle.js
    alertHandle.test.js
    complexDataHandle.js
    complexDataHandle.test.js
    ...
  utility.js
  utility.test.js
  constants.js
  constants.test.js
  configureStore.js
  configureStore.test.js
```

---

## 8. Dependencies to Install

| Package | Purpose | Size |
|---------|---------|------|
| `vitest` | Test runner (native ESM, fast) | ~2MB |
| `@vitejs/plugin-react` | JSX transform for Vitest | ~1MB |
| `@testing-library/react` | Component rendering + queries | ~200KB |
| `@testing-library/jest-dom` | DOM matchers (toBeInTheDocument, etc.) | ~100KB |
| `@testing-library/user-event` | Realistic user interaction simulation | ~100KB |
| `jsdom` | Browser environment for Node | ~2MB |
| `msw` | Mock Service Worker (API mocking) | ~500KB |

Total: ~6MB devDependencies

---

## 9. CI Integration

```yaml
# .github/workflows/test-frontend.yml
name: Frontend Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 18 }
      - run: npm ci
      - run: npm run test:front
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: frontend-coverage
          path: coverage/
```

---

## 10. Estimated Effort Summary

| Phase | Tests | Effort |
|-------|-------|--------|
| 1. Dead code + infra | — | Small |
| 2. Pure logic | ~180 | Small |
| 3. Containers + simple | ~80 | Small-Medium |
| 4. Medium components | ~130 | Medium |
| 5. Complex components | ~180 | Large |
| 6. Integration + polish | ~30 | Medium |
| **Total** | **~600** | — |

After all phases: **≥90% line coverage** on active frontend code (77 files, ~8230 lines).
