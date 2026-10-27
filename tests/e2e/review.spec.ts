import { expect, test } from '@playwright/test';
import { expectNoPageOverflow, login, openReview } from './fixture.js';

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

test('opens the full file and switches between current and base versions', async ({ page }) => {
  await openReview(page);
  await page.getByRole('tab', { name: /Files changed/ }).click();
  await page.getByRole('button', { name: /^r2 / }).click();
  await expect(page.getByRole('button', { name: /^r2 / })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'View full file for src/app.ts' }).click();
  const dialog = page.getByRole('dialog', { name: 'src/app.ts' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('row', { name: /Line 2, added: return 3;/ })).toBeVisible();
  await expect(dialog.getByText('Should this value be configurable?').first()).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Current' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await dialog.getByRole('button', { name: 'Base' }).click();
  await expect(dialog.getByRole('row', { name: /Line 2, removed: return 1;/ })).toBeVisible();
  await expect(dialog.getByRole('row', { name: /Line 2, added: return 3;/ })).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(dialog).toBeHidden();
});

test('comments on base lines outside the diff and shows the thread in the full file', async ({
  page,
}) => {
  await openReview(page);
  await page.getByRole('tab', { name: /Files changed/ }).click();
  await page
    .getByRole('group', { name: 'Review rounds' })
    .getByRole('button', { name: /^r\d+ / })
    .last()
    .click();
  await page.getByRole('button', { name: 'Full diff to base' }).click();
  await expect(
    page.getByRole('tabpanel', { name: 'Files changed' }).getByText('base → head'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'View full file for src/config.ts' }).click();
  const dialog = page.getByRole('dialog', { name: 'src/config.ts' });
  await dialog.getByRole('button', { name: 'Base' }).click();
  await expect(
    dialog.getByRole('row', { name: /Line 6, unchanged: tracing: false,/ }),
  ).toBeVisible();

  await dialog.getByRole('row', { name: /Line 6, unchanged:/ }).click();
  await dialog.getByRole('row', { name: /Line 8, unchanged:/ }).click({ modifiers: ['Shift'] });
  await dialog.getByRole('button', { name: 'Comment on lines 6–8' }).click();
  const composer = dialog.getByRole('form', { name: 'Comment on lines 6–8' });
  await expect(composer).toBeVisible();
  const body = 'E2E: the base fallback lines need a comment.';
  await composer.getByRole('textbox', { name: 'Comment', exact: true }).fill(body);
  await composer.getByRole('button', { name: 'Post comment' }).click();

  await expect(page.getByText('Comment posted')).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(body)).toBeVisible();
  await expect(composer).not.toBeVisible();
});

test('keeps the full file dialog inside a 320px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openReview(page);
  await page.getByRole('tab', { name: /Files changed/ }).click();
  await page.getByRole('button', { name: 'View full file for src/app.ts' }).click();
  const dialog = page.getByRole('dialog', { name: 'src/app.ts' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS('opacity', '1');
  const geometry = await dialog.evaluate((element) => ({
    left: element.getBoundingClientRect().left,
    right: element.getBoundingClientRect().right,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(320);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  await expectNoPageOverflow(page);
});

test('contains wheel scroll chaining inside the full file dialog body', async ({ page }) => {
  await openReview(page);
  await page.getByRole('tab', { name: /Files changed/ }).click();
  await page.getByRole('button', { name: 'Full diff to base' }).click();
  await expect(
    page.getByRole('tabpanel', { name: 'Files changed' }).getByText('base → head'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'View full file for src/long.ts' }).click();
  const dialog = page.getByRole('dialog', { name: 'src/long.ts' });
  const body = dialog.locator('.cr-dialog-body');
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => body.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeGreaterThan(0);

  const pageOverflow = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  expect(
    pageOverflow,
    'the page needs room to scroll for chaining to be observable',
  ).toBeGreaterThan(200);

  await page.evaluate(() => window.scrollTo(0, 120));
  const pageScroll = await page.evaluate(() => window.scrollY);
  expect(pageScroll).toBeGreaterThan(0);
  expect(pageScroll).toBeLessThan(pageOverflow);

  const box = await body.boundingBox();
  if (box === null) throw new Error('the dialog body has no bounding box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  await body.evaluate((element) => {
    element.scrollTop = 0;
  });

  // A wheel at the body's top belongs to the dialog, not to the page behind it.
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() => window.scrollY),
    'wheel up at the dialog body top scrolled the page',
  ).toBe(pageScroll);

  // The dialog body itself still scrolls.
  await page.mouse.wheel(0, 600);
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(() =>
      body.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight),
    )
    .toBeLessThanOrEqual(1);

  // A wheel at the body's bottom belongs to the dialog too.
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() => window.scrollY),
    'wheel down at the dialog body bottom scrolled the page',
  ).toBe(pageScroll);
  await expect
    .poll(() =>
      body.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight),
    )
    .toBeLessThanOrEqual(1);
});

test('full-file line action and c open one composer inside the dialog', async ({ page }) => {
  await openReview(page);
  await page.getByRole('tab', { name: /Files changed/ }).click();
  await page.getByRole('button', { name: 'Full diff to base' }).click();
  await expect(
    page.getByRole('tabpanel', { name: 'Files changed' }).getByText('base → head'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'View full file for src/config.ts' }).click();
  const dialog = page.getByRole('dialog', { name: 'src/config.ts' });
  await expect(dialog).toBeVisible();

  const line7 = dialog.getByRole('row', { name: /Line 7, unchanged: cache: true,/ });
  await line7.click();
  await line7.getByRole('button', { name: 'Comment on line 7' }).click();
  const composer = dialog.getByRole('form', { name: 'Comment on line 7' });
  await expect(composer).toBeVisible();
  const body = 'E2E: comment from the full-file line action.';
  await composer.getByRole('textbox', { name: 'Comment', exact: true }).fill(body);
  await composer.getByRole('button', { name: 'Post comment' }).click();

  await expect(page.getByText('Comment posted')).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(body)).toBeVisible();

  const line8 = dialog.getByRole('row', { name: /Line 8, unchanged: fallback: 'none',/ });
  await line8.click();
  await page.keyboard.press('c');
  await expect(dialog.getByRole('form', { name: 'Comment on line 8' })).toBeVisible();
  await expect(page.locator('.cr-inline-composer')).toHaveCount(0);
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
  // The long fixture dominates the viewport at the page bottom, so it is the file in view there.
  await expect(current).toContainText('long.ts');

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

test('edits and deletes its own review and comment from the browser', async ({ page }) => {
  const fx = await login(page);
  const headers = {
    authorization: `Bearer ${fx.token}`,
    'content-type': 'application/json',
  };

  const createdResponse = await page.request.post(`${fx.baseUrl}/api/reviews`, {
    headers,
    data: {
      repoRoot: fx.repoRoot,
      title: 'E2E editable review',
      scope: { kind: 'range', baseRef: 'main', headRef: 'feature' },
      reviewer: { backend: 'none' },
    },
  });
  // The daemon answers 201 Created for a new review, not 200.
  expect(createdResponse.status()).toBe(201);
  const created = (await createdResponse.json()) as { review: { review: { id: string } } };
  const reviewId = created.review.review.id;

  await page.goto(`${fx.baseUrl}/review/${encodeURIComponent(reviewId)}`);
  await expect(page.getByTestId('review-detail')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'E2E editable review' })).toBeVisible();

  const actions = page.locator('.cr-detail-actions');
  await actions.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit the request' })).toBeVisible();
  await page.getByLabel('Title').fill('E2E edited review');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Review updated')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'E2E edited review' })).toBeVisible();

  const commentResponse = await page.request.post(
    `${fx.baseUrl}/api/reviews/${encodeURIComponent(reviewId)}/comments`,
    { headers, data: { path: 'src/app.ts', lineStart: 2, body: 'E2E edit me' } },
  );
  expect(commentResponse.status()).toBe(201);
  const comment = (await commentResponse.json()) as { comment: { id: string } };
  const commentId = comment.comment.id;
  // A deleted comment keeps its tombstone only while it has replies.
  const replyResponse = await page.request.post(
    `${fx.baseUrl}/api/reviews/${encodeURIComponent(reviewId)}/comments/${encodeURIComponent(
      commentId,
    )}/replies`,
    { headers, data: { body: 'E2E reply kept under the tombstone' } },
  );
  expect(replyResponse.status()).toBe(201);

  await actions.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit the request' })).toBeVisible();
  await page.getByLabel('Source branch').fill('base');
  await expect(page.getByTestId('scope-warning')).toContainText('round 2');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'E2E edited review' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^r2 / })).toBeVisible();

  await page.getByRole('tab', { name: /Conversation/ }).click();
  const thread = page.getByTestId(`comment-${commentId}`);
  await expect(thread).toContainText('E2E edit me');
  await thread.getByRole('button', { name: 'Edit', exact: true }).click();
  await thread.getByRole('textbox', { name: 'Edit comment' }).fill('E2E edited comment');
  await thread.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(thread.getByText('E2E edited comment')).toBeVisible();
  await expect(thread.locator('.cr-thread-head').getByText(/edited /)).toBeVisible();

  await thread.getByRole('button', { name: 'Delete', exact: true }).click();
  await thread.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(thread.getByText('Comment deleted')).toBeVisible();
  await expect(thread.getByText('E2E edited comment')).toHaveCount(0);

  await actions.getByRole('button', { name: 'Delete', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete this review?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete review' }).click();
  await expect(page).toHaveURL(`${fx.baseUrl}/`);
  await expect(page.getByRole('heading', { name: 'Reviews', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /E2E edited review/ })).toHaveCount(0);
  await expect(page.getByText('E2E edited review')).toHaveCount(0);
});
