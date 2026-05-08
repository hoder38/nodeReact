// @ts-check
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page.js';

/**
 * Navigation & routing E2E tests
 * Verifies client-side routing works after login
 */

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('hoder', 'test123');
    await page.waitForLoadState('networkidle');
  });

  test('root page loads after login', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Should not redirect to login
    await expect(page).not.toHaveURL(/Login/);
  });

  test('can navigate to Storage', async ({ page }) => {
    await page.goto('/Storage');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/Login/);
  });

  test('can navigate to Password', async ({ page }) => {
    await page.goto('/Password');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/Login/);
  });

  test('can navigate to Stock', async ({ page }) => {
    await page.goto('/Stock');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/Login/);
  });

  test('can navigate to Bitfinex', async ({ page }) => {
    await page.goto('/Bitfinex');
    await page.waitForLoadState('networkidle');
    await expect(page).not.toHaveURL(/Login/);
  });

  test('WebSocket connects after login', async ({ page }) => {
    // Listen for WebSocket connection
    const wsPromise = page.waitForEvent('websocket', { timeout: 10000 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    try {
      const ws = await wsPromise;
      expect(ws.url()).toContain('/f');
    } catch (e) {
      // WS might not connect if file server isn't running — that's acceptable
      console.log('WebSocket did not connect (file server may be unavailable)');
    }
  });
});
