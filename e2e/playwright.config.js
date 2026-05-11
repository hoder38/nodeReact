// @ts-check
import { devices } from '@playwright/test';

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: process.env.CI ? 'html' : 'list',
  timeout: 30000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://www.anomopi.com:8080',
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
};

export default config;
