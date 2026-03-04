# Unit Test Cases for Node.js Backend

## Execution Environment

**Constraint:** All unit tests must be able to execute within a `node:14-alpine` Docker container. This ensures that the tests are run in a consistent and lightweight environment, matching a potential production or CI/CD setup.

---

This document outlines the suggested unit tests for the backend functionalities, based on the application's architecture. The focus is on testing business logic in isolation, often by mocking database connections and external APIs.

## 1. Core & User Management

Covers `login-router.js`, `user-router.js`, `session-tool.js`, and `passport` integration.

### User Authentication (`login-router.js`, `session-tool.js`)

-   **[TC-AUTH-01]** Should successfully log in a user with correct credentials.
-   **[TC-AUTH-02]** Should fail to log in a user with an incorrect password.
-   **[TC-AUTH-03]** Should fail to log in a user that does not exist.
-   **[TC-AUTH-04]** Should create a valid session upon successful login.
-   **[TC-AUTH-05]** Should successfully log out a user and destroy their session.
-   **[TC-AUTH-06]** Should prevent access to protected routes if a user is not authenticated.
-   **[TC-AUTH-07]** Should allow access to protected routes if a user is authenticated.

### User Management (`user-router.js`)

-   **[TC-USER-01]** Should allow a new user to be created with valid data.
-   **[TC-USER-02]** Should prevent user creation if required fields (e.g., username, password) are missing.
-   **[TC-USER-03]** Should prevent creation of a user if the username already exists.
-   **[TC-USER-04]** Should retrieve a user's profile information.
-   **[TC-USER-05]** Should not expose sensitive information (e.g., password hash) in the user profile.
-   **[TC-USER-06]** Should allow a user to update their profile information.

## 2. File & Storage Management

Covers `file-*.js` routers and `storage-router.js`. These tests would likely require mocking the filesystem (`fs`) or storage service.

-   **[TC-FILE-01]** Should successfully upload a file to the designated storage.
-   **[TC-FILE-02]** Should reject file uploads that exceed a predefined size limit.
-   **[TC-FILE-03]** Should reject file uploads of a non-permitted file type.
-   **[TC-FILE-04]** Should successfully download an existing file.
-   **[TC-FILE-05]** Should return a "Not Found" error when trying to download a non-existent file.
-   **[TC-FILE-06]** Should successfully delete an existing file.
-   **[TC-FILE-07]** Should list all files and directories for a given path.

## 3. Financial Services

Covers `stock-router.js`, `bitfinex-router.js`, and their corresponding "tool" files in `src/back/models`. All external API calls must be mocked.

### Stock Data (`stock-tool.js`)

-   **[TC-FIN-01]** Should fetch and correctly parse stock data from the Yahoo Finance API.
-   **[TC-FIN-02]** Should handle API errors gracefully (e.g., invalid stock symbol, API down).
-   **[TC-FIN-03]** Should format the retrieved stock data into the application's standard format.

### Crypto Exchange (`bitfinex-tool.js`)

-   **[TC-FIN-04]** Should fetch account balance from the Bitfinex API.
-   **[TC-FIN-05]** Should correctly mock and simulate placing a 'buy' order.
-   **[TC-FIN-06]** Should correctly mock and simulate placing a 'sell' order.
-   **[TC-FIN-07]** Should handle authentication errors with the Bitfinex API.
-   **[TC-FIN-08]** Should handle and log errors returned from the Bitfinex API during a failed trade.

## 4. Utilities & Tools

Covers routers and tools for various utilities.

### Password Manager (`password-router.js`, `password-tool.js`)

-   **[TC-UTIL-01]** Should generate a new password that meets specified criteria (length, complexity).
-   **[TC-UTIL-02]** Should securely encrypt a password before storing it.
-   **[TC-UTIL-03]** Should correctly decrypt and retrieve a stored password.
-   **[TC-UTIL-04]** Should successfully create, read, update, and delete a password entry for a user.

### Bookmark Manager (`bookmark-router.js`)

-   **[TC-UTIL-05]** Should create a new bookmark with a valid URL and title.
-   **[TC-UTIL-06]** Should retrieve all bookmarks for a specific user.
-   **[TC-UTIL-07]** Should allow a bookmark to be deleted.


## 5. Database and Core Services

Covers the generic "tool" files that provide underlying services.

### Mongo Tool (`mongo-tool.js`)

-   **[TC-DB-01]** Unit test any complex data aggregation or query-building helper functions.
-   **[TC-DB-02]** Ensure that database connection errors are caught and handled.

### Redis Tool (`redis-tool.js`)

-   **[TC-DB-03]** Test functions that set and get data from Redis.
-   **[TC-DB-04]** Test functions that use Redis for caching, ensuring cache invalidation logic works as expected.
-   **[TC-DB-05]** Test session creation and retrieval functions.
