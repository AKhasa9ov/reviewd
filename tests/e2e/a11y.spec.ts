import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { fixture, login, openReview } from './fixture.js';

async function expectNoSeriousAxe(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(
    serious.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => node.target).slice(0, 5),
    })),
    `serious/critical axe findings on ${label}`,
  ).toEqual([]);
}

test.describe('@a11y accessibility', () => {
  test('auth page has no serious or critical axe findings in dark, light and mobile', async ({
    page,
  }) => {
    const fx = await fixture();
    await page.goto(`${fx.baseUrl}/auth`);
    await expect(page.getByRole('heading', { name: 'Sign in to reviewd' })).toBeVisible();
    await expectNoSeriousAxe(page, 'auth dark');

    await page.getByTestId('theme-toggle').first().click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expectNoSeriousAxe(page, 'auth light');

    await page.setViewportSize({ width: 320, height: 800 });
    await expectNoSeriousAxe(page, 'auth 320');
  });

  test('review list and detail have no serious axe findings in dark and light themes', async ({
    page,
  }) => {
    const fx = await login(page);
    await page.goto(`${fx.baseUrl}/`);
    await expect(page.getByRole('heading', { name: 'Reviews', exact: true })).toBeVisible();
    await expectNoSeriousAxe(page, 'list dark');

    await page.getByTestId('theme-toggle').first().click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expectNoSeriousAxe(page, 'list light');

    await page.goto(`${fx.baseUrl}/review/${encodeURIComponent(fx.reviewId)}`);
    await expect(page.getByTestId('review-detail')).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(244, 246, 248)');
    await expectNoSeriousAxe(page, 'detail light');

    await page.getByTestId('theme-toggle').first().click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expectNoSeriousAxe(page, 'detail dark');

    await page.getByRole('button', { name: 'View full file for src/app.ts' }).click();
    const fileDialog = page.getByRole('dialog', { name: 'src/app.ts' });
    await expect(fileDialog).toBeVisible();
    await expect(fileDialog).toHaveCSS('opacity', '1');
    await expectNoSeriousAxe(page, 'full file dialog dark');
    await fileDialog.getByRole('button', { name: 'Close dialog' }).click();
    await expect(fileDialog).toBeHidden();

    await page.getByTestId('theme-toggle').first().click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: 'View full file for src/app.ts' }).click();
    await expect(fileDialog).toBeVisible();
    await expect(fileDialog).toHaveCSS('opacity', '1');
    await expectNoSeriousAxe(page, 'full file dialog light');
    await fileDialog.getByRole('button', { name: 'Close dialog' }).click();
  });

  test('submit dialog has no serious axe findings in dark, light and mobile', async ({ page }) => {
    await openReview(page);
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Submit review' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('opacity', '1');
    await expectNoSeriousAxe(page, 'submit dialog dark');
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await page.getByTestId('theme-toggle').first().click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('opacity', '1');
    await expectNoSeriousAxe(page, 'submit dialog light');

    await page.setViewportSize({ width: 320, height: 800 });
    await expect(dialog).toHaveCSS('opacity', '1');
    await expectNoSeriousAxe(page, 'submit dialog 320');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
  });

  test('settings and new review have no serious axe findings in dark, light and mobile', async ({
    page,
  }) => {
    const fx = await login(page);
    await page.goto(`${fx.baseUrl}/settings`);
    await expect(page.getByRole('heading', { name: 'Repositories', exact: true })).toBeVisible();
    await expectNoSeriousAxe(page, 'settings dark');

    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await expectNoSeriousAxe(page, 'settings collapsed sidebar');
    await page.getByRole('button', { name: 'Expand sidebar' }).click();

    await page.getByRole('button', { name: 'Add repository' }).click();
    await page.getByRole('button', { name: 'Browse folders for repository 1' }).click();
    const folderDialog = page.getByRole('dialog', { name: 'Choose a repository folder' });
    await expect(folderDialog).toBeVisible();
    await expectNoSeriousAxe(page, 'folder picker dark');
    await folderDialog.getByRole('button', { name: 'Cancel' }).click();

    await page.goto(`${fx.baseUrl}/new`);
    await expect(page.getByRole('heading', { name: 'Set the boundary' })).toBeVisible();
    await expectNoSeriousAxe(page, 'new review dark');

    await page.getByTestId('theme-toggle').first().click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expectNoSeriousAxe(page, 'new review light');

    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`${fx.baseUrl}/settings`);
    await expect(page.getByRole('heading', { name: 'Repositories', exact: true })).toBeVisible();
    await expectNoSeriousAxe(page, 'settings 320');
    await page.goto(`${fx.baseUrl}/new`);
    await expect(page.getByRole('heading', { name: 'Set the boundary' })).toBeVisible();
    await expectNoSeriousAxe(page, 'new review 320');
  });

  test('mobile 320 list and detail have no serious axe findings', async ({ page }) => {
    const fx = await login(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`${fx.baseUrl}/`);
    await expect(page.getByRole('heading', { name: 'Reviews', exact: true })).toBeVisible();
    await expectNoSeriousAxe(page, 'list 320');

    await page.goto(`${fx.baseUrl}/review/${encodeURIComponent(fx.reviewId)}`);
    await expect(page.getByTestId('review-detail')).toBeVisible();
    await expectNoSeriousAxe(page, 'detail 320');

    await page.getByRole('button', { name: 'View full file for src/app.ts' }).click();
    const fileDialog = page.getByRole('dialog', { name: 'src/app.ts' });
    await expect(fileDialog).toBeVisible();
    await expect(fileDialog).toHaveCSS('opacity', '1');
    await expectNoSeriousAxe(page, 'full file dialog 320');
  });
});
