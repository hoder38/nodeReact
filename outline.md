# Node.js Application Architecture Outline

This document outlines the architecture and key functions of the node application.

## 1. High-Level Architecture

The project is a monolithic web application comprised of two main parts:

-   A **React-based single-page application (SPA)** for the frontend.
-   A **Node.js server** using the Express.js framework for the backend.

The application is designed to be run using **Docker**, with separate containers for the Node.js server, a file server, and dependent services like MongoDB and Redis. An Nginx container is likely used as a reverse proxy in production.

## 2. Technology Stack

-   **Backend:** Node.js, Express.js
-   **Frontend:** React, Redux (for state management)
-   **Database:** MongoDB (primary data store), Redis (for sessions and caching)
-   **Authentication:** Passport.js for user authentication.
-   **Build Tools:** Webpack and Babel.
-   **Containerization:** Docker, Docker Compose.
-   **External API Integrations:**
    -   Google APIs
    -   Bitfinex (Cryptocurrency Exchange)
    -   TD Ameritrade (Financial Brokerage)
    -   Shioaji (likely another financial API)
    -   Discord (Chat/Community)
    -   OpenSubtitles (Subtitle service)
    -   Yahoo Finance
    -   YouTube-DL

## 3. Project Structure

-   `src/front`: Contains the React/Redux frontend source code.
-   `src/back`: Contains the Node.js backend source code.
-   `config`: Configuration files for Webpack, Nginx, Node.js environment, etc.
-   `build`: Likely the output directory for compiled/transpiled code, though `src` is used for development.
-   `public`: Static assets for the frontend (HTML, CSS, images).
-   `docker-compose.yml`, `*.Dockerfile`: Definitions for building and running the application containers.
-   `package.json`: Project dependencies and scripts.
-   `init`: Service initialization scripts.

## 4. Backend Architecture

The backend is built around Express.js, with a clear separation of concerns into controllers (routers) and models (business logic/data access).

### API Routes & Key Functionalities

The application's features can be inferred from the router files in `src/back/controllers`:

-   **Core & User Management:**
    -   `server.js`: Main server entry point.
    -   `login-router.js`: Handles user authentication.
    -   `user-router.js`: Manages user-related operations.
    -   `home-router.js`: Likely serves the main application page or dashboard.
-   **File & Storage Management:**
    -   `file-router.js`, `file-basic-router.js`, `file-other-router.js`: A comprehensive file management system.
    -   `storage-router.js`: Operations related to storage management.
    -   `file-server.js`: A dedicated server component for handling file downloads/uploads.
-   **Financial Services:**
    -   `stock-router.js`: Stock tracking and management.
    -   `bitfinex-router.js`: Integration with the Bitfinex crypto exchange.
-   **Media & Entertainment:**
    -   `playlist-router.js`: Playlist management (likely for media).
    -   `external-router.js`: Handles interactions with various external APIs.
-   **Utilities & Tools:**
    -   `password-router.js`: A password management tool.
    -   `bookmark-router.js`: Manages bookmarks.
    -   `rank-router.js`: A ranking system.



### Models & Services (`src/back/models`)

The business logic is encapsulated in "tool" files, which act as services for the controllers:

-   **Database Abstractions:** `mongo-tool.js`, `redis-tool.js`.
-   **External API Clients:** `api-tool-google.js`, `bitfinex-tool.js`, `discord-tool.js`, `tdameritrade-tool.js`, `shioaji-tool.js`.
-   **Feature Logic:** `stock-tool.js`, `password-tool.js`, `mediaHandle-tool.js`.
-   **Core Services:** `session-tool.js`, `tag-tool.js`.

## 5. Frontend Architecture

The frontend is a standard React application using Redux for state management.

-   **Entry Point:** `src/front/index.js`
-   **Structure:** The code is organized into `actions`, `reducers`, `components`, and `containers`, which is a common pattern for React/Redux applications.
-   **Routing:** `connected-react-router` is used to sync the router state with the Redux store.

## 6. Deployment and Operations

The application is designed to be deployed using Docker. The `package.json` contains scripts for:
-   **Development:** Starting the application with `docker compose` and hot-reloading for the frontend (`dev-back`, `dev-front`).
-   **Building:** Creating a production build with Webpack (`build` script).
-   **Release:** A `release` script that pulls from git and restarts services, suggesting a direct deployment model to a server running systemd or similar.
