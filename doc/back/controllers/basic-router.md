# Technical Documentation: Basic Router (`src/back/controllers/basic-router.js`)

## 1. Overview
The `basic-router.js` serves as the core utility router for the application. It provides essential metadata for the frontend, including user session details, application URLs (WebSocket/HTTPS), and navigation permissions. It acts as the initial handshake point after a user logs in.

**Testing Reference:** This documentation adheres to the `doc/OUTLINE.md` standards for Integration and Functional testing.

---

## 2. Module: `GET /getuser`

### Purpose
To provide the frontend with the current user's profile, permission levels, dynamic navigation links, and service connection URLs (API/WS).

### Logic Flow
1. **Middleware Check:** Invokes `checkLogin` to verify the request's authentication status.
2. **Permission Assessment:**
   - Calls `checkAdmin(1, user)` to determine if the user is a **Super Admin**.
   - If not, calls `checkAdmin(2, user)` to determine if the user is a **Standard Admin**.
3. **Dynamic Response Construction:**
   - **Level Mapping:**
     - Level 2: Super Admin (perm 1).
     - Level 1: Standard Admin (perm 2).
     - Level 0: Regular User.
   - **Navigation:** Only Super Admins receive the "Stock" navigation item.
   - **Edit Rights:** Only Super Admins have `isEdit` set to `true`.
   - **URL Injection:** Injects `EXTENT_FILE_IP`, `WS_PORT`, and `EXTENT_FILE_PORT` based on the environment (`ENV_TYPE`).
4. **Finalization:** Returns a JSON object with the constructed state.

### Invocation & Authentication
- **Endpoint:** `GET /api/getuser` (Assumes mounting at `/api` in `server.js`)
- **Authentication:** Required (Handled via `Passport` session and `checkLogin` utility).
- **Required Data:** `req.user` object must be populated by the authentication middleware.

### Returns & Side Effects
- **Returns:** JSON object containing `id`, `ws_url`, `level`, `isEdit`, `nav`, and `main_url`.
- **Side Effects:** None.

### Snapshot Testing Data
```json
{
  "id": "test_user_admin",
  "ws_url": "wss://127.0.0.1:8081/f",
  "level": 2,
  "isEdit": true,
  "nav": [
    {
      "title": "Stock",
      "hash": "/Stock",
      "css": "glyphicon glyphicon-signal",
      "key": 3
    }
  ],
  "main_url": "https://127.0.0.1:8080/f"
}
```

### Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches
- **Branch: Super Admin (perm 1):**
  - Verify `level === 2`.
  - Verify `isEdit === true`.
  - Verify `nav` contains the "Stock" object.
- **Branch: Standard Admin (perm 2):**
  - Verify `level === 1`.
  - Verify `isEdit === false`.
  - Verify `nav` is an empty array `[]`.
- **Branch: Regular User:**
  - Verify `level === 0`.
  - Verify `isEdit === false`.
  - Verify `nav` is an empty array `[]`.

#### Edge Cases
- **Malformed User Object:** Test behavior when `req.user` exists but lacks a `username` (should handle gracefully or return undefined).
- **Network Config Failures:** Mock `EXTENT_FILE_IP` or `WS_PORT` returning null/undefined to ensure the server doesn't crash during string interpolation.

#### Error Handling
- **Internal Error:** If `checkAdmin` throws an exception, verify it is caught by the global Express error handler.

#### Auth/Login Scenarios
- **Unauthenticated:** Request without a session. Expected: `401 Unauthorized` or redirect (depending on `checkLogin` implementation).
- **Unauthorized:** Valid session but `req.user` is missing. Expected: Failure handled by `checkLogin`.

---

## 3. Module: `GET /testLogin`

### Purpose
A lightweight "ping" endpoint for the frontend to verify if the current session is still valid.

### Logic Flow
1. **Middleware Check:** Invokes `checkLogin`.
2. **Success Path:** If authenticated, returns `{ "apiOK": true }`.

### Invocation & Authentication
- **Endpoint:** `GET /api/testLogin`
- **Authentication:** Required.

### Returns & Side Effects
- **Returns:** `{ "apiOK": true }`

### Snapshot Testing Data
```json
{
  "apiOK": true
}
```

### Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches
- **Branch: Authenticated:** Verify `200 OK` with `apiOK: true`.

#### Auth/Login Scenarios
- **Unauthenticated:** Verify `checkLogin` prevents execution and returns the appropriate error status.

---

## 4. Module: `GET /getPath`

### Purpose
To retrieve the current navigation or search path stored in the user's session metadata via `TagTool`.

### Logic Flow
1. **Middleware Check:** Invokes `checkLogin`.
2. **Data Retrieval:** Calls `StorageTagTool.searchTags(req.session)`.
3. **Array Extraction:** Calls `.getArray().cur` on the result.
4. **Response:** Returns the current path array.

### Invocation & Authentication
- **Endpoint:** `GET /api/getPath`
- **Authentication:** Required.
- **Dependencies:** Relies on `STORAGEDB` and `TagTool` initialization.

### Returns & Side Effects
- **Returns:** `{ "path": Array }` (e.g., `["root", "folder1"]`).

### Snapshot Testing Data
```json
{
  "path": ["Media", "Movies", "2024"]
}
```

### Comprehensive Test Scenarios (100% Coverage)

#### Logical Branches
- **Branch: Path Exists:** Verify the array returned by `TagTool` is correctly mapped to the `path` key.
- **Branch: Empty Path:** Verify behavior when `TagTool` returns an empty array `[]`.

#### Edge Cases
- **Session Desynchronization:** Verify behavior if `req.session` is present but the `TagTool` specific metadata is missing or corrupted.

#### Auth/Login Scenarios
- **Unauthenticated:** Verify `401/Unauthorized` behavior.
- **Unauthorized:** Verify that even if the session exists, if `checkLogin` fails, no path data is leaked.
