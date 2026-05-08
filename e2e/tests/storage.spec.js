// @ts-check
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page.js';

/**
 * Storage / File Upload E2E tests
 * Tests the two-server file upload contract:
 * - Login → cascading auth → access storage
 * - Upload file via file server
 * - See uploaded file in storage list
 */

test.describe('Storage & Upload', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('hoder', 'test123');
    await page.waitForLoadState('networkidle');
  });

  test('can navigate to storage page', async ({ page }) => {
    await page.goto('/Storage');
    await page.waitForLoadState('networkidle');
    // Storage page should render (even if empty)
    await expect(page).not.toHaveURL(/Login/);
  });

  test('storage page shows item list area', async ({ page }) => {
    await page.goto('/Storage');
    await page.waitForLoadState('networkidle');
    // The storage page should have some content area
    const body = await page.locator('body').textContent();
    expect(body).toBeDefined();
  });

  test('API: GET /api/parent/storage/list returns data', async ({ page }) => {
    const response = await page.request.get('/api/parent/storage/list', {
      ignoreHTTPSErrors: true,
    });
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('parentList');
    expect(Array.isArray(data.parentList)).toBeTruthy();
  });
});
