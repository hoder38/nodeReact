// @ts-check
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page.js';

/**
 * Logout E2E tests
 * Verifies that logging out invalidates both server sessions
 */

test.describe('Logout', () => {
  test('logout invalidates main server session', async ({ page }) => {
    // Login
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('hoder', 'test123');
    await page.waitForLoadState('networkidle');

    // Verify authenticated
    const authResp = await page.request.get('/api/testLogin', {
      ignoreHTTPSErrors: true,
    });
    expect(authResp.ok()).toBeTruthy();

    // Logout via API (cascading)
    const logoutResp = await page.request.get('/api/logout', {
      ignoreHTTPSErrors: true,
    });
    expect(logoutResp.ok()).toBeTruthy();
    const logoutData = await logoutResp.json();
    expect(logoutData).toHaveProperty('apiOK', true);
    // If cascading, the response has a url field for the file server logout
    if (logoutData.url) {
      // In Docker, the cascading URL may reference host port (8080) but nginx
      // listens on 443 internally — normalize to match PLAYWRIGHT_BASE_URL
      let fileLogoutUrl = `${logoutData.url}/api/logout`;
      const baseURL = process.env.PLAYWRIGHT_BASE_URL;
      if (baseURL && baseURL.includes(':443')) {
        fileLogoutUrl = fileLogoutUrl.replace(':8080', ':443');
      }
      const fileLogoutResp = await page.request.get(fileLogoutUrl, {
        ignoreHTTPSErrors: true,
      });
      expect(fileLogoutResp.ok()).toBeTruthy();
    }

    // Verify no longer authenticated
    const unauthResp = await page.request.get('/api/testLogin', {
      ignoreHTTPSErrors: true,
    });
    expect(unauthResp.status()).toBe(401);
  });

  test('after logout, page redirects to login', async ({ page }) => {
    // Login
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('hoder', 'test123');
    await page.waitForLoadState('networkidle');

    // Logout
    await page.request.get('/api/logout', { ignoreHTTPSErrors: true });

    // Navigate to a protected page
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Should show login (testLogin fails → componentDidMount redirects)
    // The React app's testLogin check may redirect to /Login
    await page.waitForTimeout(2000);
    const loginHeader = page.locator('h1:has-text("Login")');
    await expect(loginHeader).toBeVisible({ timeout: 5000 });
  });
});
