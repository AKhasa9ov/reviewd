import { expect, test } from '@playwright/test';
import { login, openReview } from './fixture.js';

test('lists reviews and completes comment, reply, resolve and submit from the real daemon', async ({
  page,
}) => {
  const fx = await login(page);
  await page.goto(`${fx.baseUrl}/`);
  await expect(page.getByRole('heading', { name: 'Reviews', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /E2E feature review/ })).toBeVisible();

  await page.getByRole('link', { name: /E2E feature review/ }).click();
  await expect(page.getByTestId('review-detail')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'E2E feature review' })).toBeVisible();

  await page.getByRole('tab', { name: /Files changed/ }).click();
  const addedLine = page.getByRole('row', { name: /line 2, added/ }).first();
  await expect(addedLine).toBeVisible();
  await addedLine.click();
  await expect(addedLine).toBeFocused();
  await page.keyboard.press('c');
  const composer = page.getByRole('form', { name: /Comment on line 2/ });
  await expect(composer).toBeVisible();
  const body = 'E2E: this value should be configurable.';
  await composer.getByRole('textbox', { name: 'Comment', exact: true }).fill(body);
  await composer.getByRole('button', { name: 'Post comment' }).click();
  await expect(page.getByText('Comment posted')).toBeVisible();

  await page.getByRole('tab', { name: /Conversation/ }).click();
  const thread = page.locator('.cr-thread').filter({ hasText: body }).first();
  await expect(thread).toBeVisible();
  await thread.getByRole('button', { name: 'Reply' }).click();
  await thread.getByRole('textbox', { name: /Reply to/ }).fill('E2E reply from the browser.');
  await thread.getByRole('button', { name: 'Send reply' }).click();
  await expect(thread.getByText('E2E reply from the browser.')).toBeVisible();

  await thread.getByRole('button', { name: 'Resolve' }).click();
  await expect(thread.getByText('resolved', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Submit review' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Pending comments' })).toBeVisible();
  await expect(dialog.locator('.cr-submit-pending-item').first()).toBeVisible();
  await dialog.getByLabel('Comment only').check();
  await dialog.getByRole('textbox', { name: 'Summary' }).fill('E2E browser feedback.');
  await dialog.getByRole('button', { name: 'Submit feedback' }).click();
  await expect(page.getByText(/Feedback submitted for round 2/)).toBeVisible();

  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  const refreshDialog = page.getByRole('dialog', { name: 'Re-review this branch' });
  await expect(refreshDialog).toBeVisible();
  await refreshDialog.getByRole('button', { name: 'Create round' }).click();
  await expect(page.getByText(/Round 3 created/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^r3 / })).toBeVisible();
});

test('switches immutable rounds, toggles delta, and honors deep links', async ({ page }) => {
  const fx = await openReview(page);
  await page.getByRole('tab', { name: /Files changed/ }).click();

  await page.getByRole('button', { name: /^r1 / }).click();
  await expect(page.getByRole('button', { name: /^r1 / })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Delta' })).toBeDisabled();

  await page.getByRole('button', { name: /^r2 / }).click();
  await expect(
    page.getByRole('tabpanel', { name: 'Files changed' }).getByText('r2 vs r1'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Full diff to base' }).click();
  await expect(
    page.getByRole('tabpanel', { name: 'Files changed' }).getByText('base → head'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Delta' }).click();
  await expect(
    page.getByRole('tabpanel', { name: 'Files changed' }).getByText('r2 vs r1'),
  ).toBeVisible();

  await page.goto(
    `${fx.baseUrl}/review/${encodeURIComponent(fx.reviewId)}?round=2#file=src%2Fapp.ts&line=2`,
  );
  await expect(page.getByRole('tab', { name: /Files changed/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('.cr-diff-file[data-file="src/app.ts"]')).toBeVisible();
  await expect(page.locator('.cr-diff-line-selected').first()).toBeVisible();
});

test('tracks the file in view while the diff scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 520 });
  await openReview(page);
  await expect(page.getByRole('tab', { name: /Files changed/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await page.getByRole('button', { name: 'Full diff to base' }).click();
  await expect(page.locator('.cr-diff-file[data-file="src/util.ts"]')).toBeVisible();
  const current = page.locator('.cr-tree-file[aria-current="true"]');
  await expect(current).toContainText('app.ts');

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(current).toContainText('util.ts');

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(current).toContainText('app.ts');
});

test('supports c, ?, and g l keyboard shortcuts outside form fields', async ({ page }) => {
  const fx = await openReview(page);
  await page.goto(
    `${fx.baseUrl}/review/${encodeURIComponent(fx.reviewId)}?round=2#file=src%2Fapp.ts&line=2`,
  );
  await expect(page.locator('.cr-diff-file[data-file="src/app.ts"]')).toBeVisible();

  await page.keyboard.press('c');
  await expect(page.getByRole('form', { name: /Comment on line 2/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('form', { name: /Comment on line 2/ })).not.toBeVisible();

  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(help).toBeVisible();
  await help.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(help).not.toBeVisible();

  await page.keyboard.press('g');
  await page.keyboard.press('l');
  await expect(page).toHaveURL(`${fx.baseUrl}/`);
  await expect(page.getByRole('heading', { name: 'Reviews', exact: true })).toBeVisible();
});

test('restores an unsent comment draft after a browser reload', async ({ page }) => {
  await openReview(page);
  await page.getByRole('tab', { name: /Files changed/ }).click();
  const line = page.getByRole('row', { name: /line 3, context/ }).first();
  await expect(line).toBeVisible();
  await line.click();
  await page.keyboard.press('c');
  const composer = page.getByRole('form', { name: /Comment on line 3/ });
  await expect(composer).toBeVisible();
  const body = 'Draft survives a refresh.';
  await composer.getByRole('textbox', { name: 'Comment', exact: true }).fill(body);

  await page.reload();
  await expect(page.getByRole('tab', { name: /Files changed/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  const restored = page.getByRole('form', { name: /Comment on line 3/ });
  await expect(restored).toBeVisible();
  await expect(restored.getByRole('textbox', { name: 'Comment', exact: true })).toHaveValue(body);
  await expect(restored.getByRole('status')).toContainText('Draft restored');

  await restored.getByRole('button', { name: 'Cancel' }).click();
  await expect(restored).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('form', { name: /Comment on line 3/ })).not.toBeVisible();
});

test('selects a comment range by dragging across diff lines', async ({ page }) => {
  await openReview(page);
  await page.getByRole('tab', { name: /Files changed/ }).click();
  const start = page.getByRole('row', { name: /line 1, context/ }).first();
  const end = page.getByRole('row', { name: /line 2, added/ }).first();
  await expect(start).toBeVisible();
  await expect(end).toBeVisible();
  const startBox = await start.boundingBox();
  const endBox = await end.boundingBox();
  if (startBox === null || endBox === null) throw new Error('diff rows have no box');
  await page.mouse.move(startBox.x + 60, startBox.y + startBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(endBox.x + 60, endBox.y + endBox.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole('form', { name: /Comment on lines 1–2/ })).toBeVisible();
});
