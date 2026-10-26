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
    await expectNoSeriousAxe(page, 'detail light');

    await page.getByTestId('theme-toggle').first().click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expectNoSeriousAxe(page, 'detail dark');
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

  test('mobile 320 list and detail have no serious axe findings', async ({ page }) => {
    const fx = await login(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`${fx.baseUrl}/`);
    await expect(page.getByRole('heading', { name: 'Reviews', exact: true })).toBeVisible();
    await expectNoSeriousAxe(page, 'list 320');

    await page.goto(`${fx.baseUrl}/review/${encodeURIComponent(fx.reviewId)}`);
    await expect(page.getByTestId('review-detail')).toBeVisible();
    await expectNoSeriousAxe(page, 'detail 320');
  });
});
