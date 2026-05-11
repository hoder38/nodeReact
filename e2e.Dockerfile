FROM node:14-bullseye-slim

WORKDIR /app

# Install Chromium system dependencies for Playwright 1.29.2
RUN apt-get update && apt-get install -y --no-install-recommends \
    libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    libnspr4 libnss3 libcups2 libdrm2 libxkbcommon0 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Install only @playwright/test (no full npm ci needed)
COPY package.json ./
RUN npm install @playwright/test@1.29.2 --legacy-peer-deps 2>/dev/null; exit 0

# Download Chromium browser
RUN npx playwright install chromium

# Copy E2E test files
COPY e2e/ ./e2e/

# baseURL is overridden via env var at runtime
ENV PLAYWRIGHT_BASE_URL=https://nginx-proxy:443

CMD ["npx", "playwright", "test", "--config", "e2e/playwright.config.js"]
