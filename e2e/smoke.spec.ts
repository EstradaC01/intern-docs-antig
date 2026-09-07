import { test, expect } from '@playwright/test';

// First real Playwright coverage (audit gap #14). Scoped to what's honestly testable
// without seeded test-user infrastructure: unauthenticated pages and the auth redirect
// chain every request goes through first. Authenticated-role flows (intern/approver/
// admin/system_admin dashboards) are a further step -- see docs/09-project-audit.md.

test.describe('Unauthenticated routing', () => {
  test('login page renders the sign-in form', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/Sign In/i);
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('visiting the root page while signed out redirects to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('visiting a protected role route while signed out redirects to /login', async ({ page }) => {
    for (const path of ['/intern', '/approver', '/admin', '/system-admin']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test('an incorrect login shows a generic error, never confirming whether the email exists', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"], input[name="email"]', 'nonexistent@example.test');
    await page.fill('input[type="password"]', 'wrong-password-at-least-12-chars');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  });

  test('accept-invite page never shows a password form without a valid invitation token', async ({ page }) => {
    // The full-name-at-signup feature this test originally covered was deliberately
    // reverted (docs/16-post-launch-changes.md, 2026-08-28) -- accept-invite never
    // collects a name. The invariant worth guarding here is the security-relevant one:
    // src/app/(auth)/accept-invite/page.tsx only renders the password-setting form once
    // `userEmail` is set from a verified session, which requires a token/code/hash in the
    // URL. With none supplied, the form must never appear, at any point -- checked without
    // waiting on the page's supabase.auth.getUser() session probe to resolve, since that's
    // a real network round trip to the configured Supabase project and not this smoke
    // test's concern.
    await page.goto('/accept-invite');
    await expect(page.getByText(/welcome to interndocs/i)).toBeVisible();
    await expect(page.locator('#password')).toHaveCount(0);
  });
});
