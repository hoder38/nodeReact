// @ts-check
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page.js';

/**
 * Auth E2E tests:
 * - Login cascade (main server → file server)
 * - Access protected routes after login
 * - Logout invalidates both sessions
 * - Unauthenticated access redirects to login
 */

test.describe('Authentication', () => {
  test('unauthenticated user sees login page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // testLogin fails → app redirects to /Login
    const loginPage = new LoginPage(page);
    await loginPage.expectVisible();
  });

  test('login with valid credentials shows dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.expectVisible();
    await loginPage.login('hoder', 'test123');

    // After successful login + navigation to /, login header should be gone
    await expect(page.locator('h1:has-text("Login")')).not.toBeVisible({ timeout: 5000 });
  });

  test('login with wrong password stays on login', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.expectVisible();

    // Use invalid password — fill and submit without the goto('/') in login helper
    await page.locator('input[placeholder="Username"]').fill('hoder');
    await page.locator('input[placeholder="Password"]').fill('wrongpassword');
    await page.locator('button:has-text("Sign In")').click();
    await page.waitForLoadState('networkidle');

    // Should stay on login page
    await loginPage.expectVisible();
  });

  test('authenticated user API returns OK', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('hoder', 'test123');

    // testLogin should succeed (session is valid)
    const response = await page.request.get('/api/testLogin', {
      ignoreHTTPSErrors: true,
    });
    expect(response.ok()).toBeTruthy();
  });

  test('logout invalidates session', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('hoder', 'test123');

    // Verify authed
    const authResp = await page.request.get('/api/testLogin', {
      ignoreHTTPSErrors: true,
    });
    expect(authResp.ok()).toBeTruthy();

    // Logout (cascading)
    const logoutResp = await page.request.get('/api/logout', {
      ignoreHTTPSErrors: true,
    });
    expect(logoutResp.ok()).toBeTruthy();

    // After logout, testLogin should fail
    const testResp = await page.request.get('/api/testLogin', {
      ignoreHTTPSErrors: true,
    });
    expect(testResp.status()).toBe(401);
  });

  test('cascading login reaches file server', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Track requests
    const loginUrls = [];
    page.on('request', request => {
      if (request.url().includes('/api/login')) {
        loginUrls.push(request.url());
      }
    });

    // Do login (fills form, clicks, waits for networkidle, then navigates to /)
    await loginPage.login('hoder', 'test123');
    
    // Verify we hit both /api/login (main) and /f/api/login (file server)
    expect(loginUrls.length).toBeGreaterThanOrEqual(2);
    expect(loginUrls.some(u => u.includes('/f/api/login'))).toBeTruthy();
  });
});
