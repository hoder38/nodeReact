# System Outline: NodeReact Project

## 1. Architectural Overview
The project is a full-stack application composed of a React frontend and a dual-server Node.js/Express backend, containerized using Docker and orchestrated via Docker Compose.

### 1.1 Core Tech Stack
- **Frontend:** React (v17), Redux, React-Router (v5), Bootstrap.
- **Backend:** Node.js, Express (v4), Passport.js (Authentication).
- **Databases:** MongoDB (Data Persistence), Redis (Session Management).
- **Proxy/Web Server:** Nginx.
- **Containerization:** Docker, Docker Compose.

---

## 2. System Components

### 2.1 Backend Services
The backend is split into two primary services to separate concerns and handle long-running tasks:

#### A. Main API Server (`reactnode-server`)
- **Responsibility:** Handles user-facing API requests, authentication, and core business logic.
- **Key Modules:**
  - `UserRouter`: User management and profiles.
  - `StockRouter`: Stock market data and analysis.
  - `StorageRouter`: Metadata management for files.
  - `PasswordRouter`: Encrypted password storage.
  - `BookmarkRouter`: Web link management.

#### B. File & Background Server (`reactnode-file-server`)
- **Responsibility:** Handles file uploads/downloads, media processing, and automated background tasks.
- **Key Modules:**
  - `FileRouter`: Direct file system interactions.
  - `ExternalRouter`: Interactions with external media sites (Bilibili, DM5, YouTube).
  - `BitfinexRouter`: Automated trading and lending on Bitfinex.
  - `PlaylistRouter`: Torrent streaming and playlist management.
- **Background Tasks (`background.js`):**
  - Automated stock data updates (`updateStock`).
  - Bitfinex rate calculation and offer management (`rateCalculator`, `setUserOffer`).
  - Database backups (`dbBackup`).
  - Media checking and auto-downloading.

### 2.2 External Integrations
The system integrates with a wide array of third-party APIs:
- **Finance:** Bitfinex (Exchange), Yahoo Finance (Stock Data), Shioaji (Taiwan Stocks), TD Ameritrade/Schwab (US Stocks).
- **Media:** YouTube (via `youtube-dl-exec`), OpenSubtitles.
- **Storage/Cloud:** Google Drive API.
- **Communication:** Discord.js (Bot integration).
- **Protocols:** Torrent (DHT/Peer-to-peer streaming).

### 2.3 Frontend Application
A single-page application (SPA) organized by features:
- **State Management:** Redux with `connected-react-router`.
- **Containers:** Modular components for each functional area (e.g., `ReStock`, `ReBitfinex`, `RePassword`).
- **Styling:** Bootstrap-based responsive design.

---

## 3. Testing Scope & Quality Assurance

### 3.1 Unit Testing
- **Utility Functions:** Validating data transformations, date handling, and encryption logic in `src/back/util/`.
- **Model Tools:** Isolated testing of individual tool logic in `src/back/models/` (e.g., `tag-tool`, `stock-tool`).

### 3.2 Integration Testing
- **API Endpoints:** Testing Express routers using `Supertest` to ensure correct HTTP responses and database updates.
- **Database Layer:** Verifying MongoDB queries and Redis session persistence.
- **Cross-Service Communication:** Ensuring the main server and file server interact correctly where necessary.

### 3.3 Functional Testing
- **Authentication Flow:** End-to-end verification of login, logout, and session expiration.
- **Feature Workflows:**
  - File upload/download and media processing.
  - Stock portfolio tracking and automated filtering.
  - Bitfinex lending automation.
  - Search and retrieval from external APIs (Subtitles, YouTube).

### 3.4 Infrastructure & Security
- **Docker Environment:** Validating container health checks and volume persistence.
- **Security:** Testing HTTPS/TLS configurations, credential protection, and session security.

---

## 4. Development & Deployment
- **Dev Workflow:** Uses `docker-compose` for a local mirrored environment.
- **Production:** Managed via systemd services on a Linux host, with Nginx handling SSL/TLS.
