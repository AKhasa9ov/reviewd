import { expect, test } from '@playwright/test';
import { expectNoPageOverflow, login, screenshotPath } from './fixture.js';

test('shows unresolved merge conflicts in a worktree review', async ({ page }) => {
  const fx = await login(page);
  await page.goto(`${fx.baseUrl}/review/${encodeURIComponent(fx.conflictReviewId)}`);
  await expect(page.getByTestId('review-detail')).toBeVisible();
  await page.getByRole('tab', { name: /Files changed/ }).click();

  const banner = page.getByRole('alert').filter({ hasText: 'Merge conflicts' });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('1 unresolved file');
  await expect(banner).toContainText('a.txt');
  await expect(page.getByText('conflict', { exact: true }).first()).toBeVisible();
  await expectNoPageOverflow(page);

  await page.screenshot({ path: screenshotPath(fx, 'conflict-banner'), fullPage: true });
});
