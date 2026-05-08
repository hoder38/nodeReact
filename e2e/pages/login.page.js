/**
 * Page Object Model: Login page
 * The app uses React refs (no name attrs on inputs).
 * Selectors use placeholder text and button text.
 */
export class LoginPage {
  constructor(page) {
    this.page = page;
    this.usernameInput = page.locator('input[placeholder="Username"]');
    this.passwordInput = page.locator('input[placeholder="Password"]');
    this.submitButton = page.locator('button:has-text("Sign In")');
  }

  async goto() {
    await this.page.goto('/Login', { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('networkidle');
    await this.usernameInput.waitFor({ state: 'visible', timeout: 10000 });
  }

  async login(username, password) {
    await this.usernameInput.waitFor({ state: 'visible', timeout: 10000 });
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
    // Wait for cascading login API calls to complete
    await this.page.waitForLoadState('networkidle');
    // Small delay for React history.goBack() to settle
    await this.page.waitForTimeout(500);
    // Navigate to root explicitly (history.goBack() may not have history to go back to)
    await this.page.goto('/', { waitUntil: 'networkidle' });
  }

  async expectVisible() {
    await this.page.locator('h1:has-text("Login")').waitFor({ state: 'visible' });
  }
}


