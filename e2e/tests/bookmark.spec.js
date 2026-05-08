// @ts-check
import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/login.page.js';

/**
 * Bookmark CRUD E2E tests
 * Routes: /api/bookmark/storage/getList/:sortName/:sortType/:page
 *         /api/bookmark/storage/get/:id/:sortName/:sortType (items in a bookmark)
 *         /api/bookmark/storage/del/:id (DELETE)
 */

test.describe('Bookmark CRUD', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('hoder', 'test123');
  });

  test('API: GET bookmark list returns bookmarks', async ({ page }) => {
    const response = await page.request.get('/api/bookmark/storage/getList/name/desc/0', {
      ignoreHTTPSErrors: true,
    });
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('bookmarkList');
    expect(Array.isArray(data.bookmarkList)).toBeTruthy();
    expect(data.bookmarkList.length).toBeGreaterThan(0);
    // Each bookmark has id and name
    expect(data.bookmarkList[0]).toHaveProperty('id');
    expect(data.bookmarkList[0]).toHaveProperty('name');
  });

  test('API: GET bookmark list sorted by mtime', async ({ page }) => {
    const response = await page.request.get('/api/bookmark/storage/getList/mtime/asc/0', {
      ignoreHTTPSErrors: true,
    });
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('bookmarkList');
    expect(Array.isArray(data.bookmarkList)).toBeTruthy();
  });

  test('API: GET bookmark items for existing bookmark', async ({ page }) => {
    // First get the list to find a bookmark id
    const listResp = await page.request.get('/api/bookmark/storage/getList/name/desc/0', {
      ignoreHTTPSErrors: true,
    });
    const listData = await listResp.json();
    if (listData.bookmarkList && listData.bookmarkList.length > 0) {
      const id = listData.bookmarkList[0].id;
      const itemResp = await page.request.get(`/api/bookmark/storage/get/${id}/name/desc`, {
        ignoreHTTPSErrors: true,
      });
      expect(itemResp.status()).toBe(200);
      const itemData = await itemResp.json();
      expect(itemData).toHaveProperty('itemList');
    }
  });
});
