import { expect, test } from '@playwright/test';
import { expectNoPageOverflow, fixture, login, screenshotPath } from './fixture.js';

test('captures auth, list, detail and submit screenshots at 1440 and 320 in both themes', async ({
  page,
}) => {
  const fx = await fixture();
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(`${fx.baseUrl}/auth`);
  await expect(page.getByRole('heading', { name: 'Sign in to reviewd' })).toBeVisible();
  await page.screenshot({ path: screenshotPath(fx, 'auth-dark-1440'), fullPage: true });

  await login(page);
  await page.goto(`${fx.baseUrl}/`);
  await expect(page.getByRole('heading', { name: 'Reviews', exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: screenshotPath(fx, 'list-dark-1440'), fullPage: true });

  await page.getByTestId('theme-toggle').first().click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: screenshotPath(fx, 'list-light-1440'), fullPage: true });

  await page.goto(`${fx.baseUrl}/review/${encodeURIComponent(fx.reviewId)}`);
  await expect(page.getByTestId('review-detail')).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: screenshotPath(fx, 'detail-light-1440'), fullPage: true });

  await page.getByTestId('theme-toggle').first().click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: screenshotPath(fx, 'detail-dark-1440'), fullPage: true });

  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Submit review' });
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: screenshotPath(fx, 'submit-dark-1440'), fullPage: true });
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`${fx.baseUrl}/`);
  await expect(page.getByRole('heading', { name: 'Reviews', exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: screenshotPath(fx, 'list-dark-320'), fullPage: true });

  await page.goto(`${fx.baseUrl}/review/${encodeURIComponent(fx.reviewId)}`);
  await expect(page.getByTestId('review-detail')).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: screenshotPath(fx, 'detail-dark-320'), fullPage: true });

  await page.locator('.cr-topbar [data-testid="theme-toggle"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: screenshotPath(fx, 'detail-light-320'), fullPage: true });

  await page.goto(`${fx.baseUrl}/`);
  await expect(page.getByRole('heading', { name: 'Reviews', exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: screenshotPath(fx, 'list-light-320'), fullPage: true });
});

test('captures the full file with inline comments in both themes', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cr-theme', 'light'));
  const fx = await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${fx.baseUrl}/review/${encodeURIComponent(fx.reviewId)}`);
  await expect(page.getByTestId('review-detail')).toBeVisible();
  await page.getByRole('tab', { name: /Files changed/ }).click();
  await page.getByRole('button', { name: 'View full file for src/app.ts' }).click();
  const dialog = page.getByRole('dialog', { name: 'src/app.ts' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('row', { name: /Line 2, added: return 3;/ }).click();
  await expect(dialog.getByText('Should this value be configurable?').first()).toBeVisible();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: screenshotPath(fx, 'full-file-light-1440') });

  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByTestId('theme-toggle').first().click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'View full file for src/app.ts' }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('row', { name: /Line 2, added: return 3;/ }).click();
  await page.screenshot({ path: screenshotPath(fx, 'full-file-dark-1440') });

  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.setViewportSize({ width: 320, height: 800 });
  await page.getByRole('button', { name: 'View full file for src/app.ts' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS('opacity', '1');
  await expectNoPageOverflow(page);
  await page.screenshot({ path: screenshotPath(fx, 'full-file-dark-320') });
});

test('creates a review through /new and opens it', async ({ page }) => {
  const fx = await login(page);
  await page.goto(`${fx.baseUrl}/new`);
  await page.getByLabel('Repository path').fill(fx.repoRoot);
  await page.getByLabel('Title').fill('E2E UI created review');
  await page.getByLabel('Target branch', { exact: true }).fill('base');
  await page.getByLabel('Source branch', { exact: true }).fill('feature');
  await page.getByRole('button', { name: 'Create review' }).click();

  await expect(page).toHaveURL(new RegExp(`/review/rev_`));
  await expect(page.getByRole('heading', { name: 'E2E UI created review' })).toBeVisible();
  await expect(page.getByTestId('review-detail')).toBeVisible();
});
