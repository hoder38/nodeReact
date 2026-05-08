/**
 * Page Object Model: Dashboard / Storage page (post-login)
 */
export class DashboardPage {
  constructor(page) {
    this.page = page;
  }

  async waitForReady() {
    // After login, the app should show the main content area
    await this.page.waitForLoadState('networkidle');
  }

  /** Navigate to storage section */
  async gotoStorage() {
    await this.page.goto('/Storage');
    await this.page.waitForLoadState('networkidle');
  }

  /** Navigate to password section */
  async gotoPassword() {
    await this.page.goto('/Password');
    await this.page.waitForLoadState('networkidle');
  }

  /** Navigate to stock section */
  async gotoStock() {
    await this.page.goto('/Stock');
    await this.page.waitForLoadState('networkidle');
  }

  /** Navigate to bitfinex section */
  async gotoBitfinex() {
    await this.page.goto('/Bitfinex');
    await this.page.waitForLoadState('networkidle');
  }

  /** Get navigation links */
  get navLinks() {
    return this.page.locator('nav a, .nav-link, [class*="nav"]');
  }
}

