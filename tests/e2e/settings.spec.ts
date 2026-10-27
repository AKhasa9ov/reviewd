import { expect, test } from '@playwright/test';
import { login } from './fixture.js';

test('saves a repository and starts branch and commit-set reviews', async ({ page }) => {
  const fx = await login(page);

  await page.goto(`${fx.baseUrl}/settings`);
  await expect(page.getByRole('heading', { name: 'Repositories', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add repository' }).click();
  await page.getByLabel('Repository name').fill('E2E checkout');
  await page.getByLabel('Path on daemon').fill(fx.repoRoot);
  await page.getByLabel('Default target branch').fill('base');
  await page.getByRole('button', { name: 'Save repositories' }).click();
  await expect(page.getByText('Repository settings saved.')).toBeVisible();

  await page.goto(`${fx.baseUrl}/new`);
  await expect(page.getByLabel('Repository path')).toHaveValue(fx.repoRoot);
  await expect(page.getByLabel('Target branch', { exact: true })).toHaveValue('base');
  await page.getByLabel('Title').fill('E2E merge request');
  await page.getByLabel('Source branch', { exact: true }).fill('feature');
  await page.getByRole('button', { name: 'Create review' }).click();

  await expect(page.getByRole('heading', { name: 'E2E merge request' })).toBeVisible();
  await expect(page.getByText('base...feature')).toBeVisible();

  await page.goto(`${fx.baseUrl}/new`);
  await page.getByLabel('Title').fill('E2E selected commits');
  await page.getByLabel('Source branch', { exact: true }).fill('feature');
  await page.getByRole('radio', { name: /Choose commits/ }).click();
  const commits = page.locator('.cr-commit-option');
  await expect(commits).toHaveCount(3);
  await commits.first().locator('input').check();
  await commits.last().locator('input').check();
  await expect(page.getByText('3 commits will be reviewed.')).toBeVisible();
  await page.getByRole('button', { name: 'Create review' }).click();

  await expect(page.getByRole('heading', { name: 'E2E selected commits' })).toBeVisible();
  await expect(page.getByText(/3 commits:/)).toBeVisible();
});
