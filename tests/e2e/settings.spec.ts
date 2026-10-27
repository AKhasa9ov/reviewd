import { expect, test } from '@playwright/test';
import { login } from './fixture.js';

test('saves a repository and starts branch and commit-set reviews', async ({ page }) => {
  const fx = await login(page);

  await page.goto(`${fx.baseUrl}/settings`);
  await expect(page.getByRole('heading', { name: 'Repositories', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add repository' }).click();
  await page.getByLabel('Repository name').fill('E2E checkout');
  await page.getByRole('button', { name: 'Browse folders for repository E2E checkout' }).click();
  const folderDialog = page.getByRole('dialog', { name: 'Choose a repository folder' });
  await folderDialog.getByLabel('Folder path').fill(fx.repoRoot);
  await folderDialog.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(folderDialog.getByText('git repo')).toBeVisible();
  await folderDialog.getByRole('button', { name: 'Use this folder' }).click();
  await expect(page.getByLabel('Path on daemon')).toHaveValue(fx.repoRoot);
  const target = page.getByLabel('Default target branch');
  await expect(target).toBeEnabled();
  await target.selectOption('base');
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

test('keeps repository actions aligned with their fields', async ({ page }) => {
  const fx = await login(page);
  await page.goto(`${fx.baseUrl}/settings`);
  await page.getByRole('button', { name: 'Add repository' }).click();

  const row = page.locator('.cr-repo-row').last();
  const pathField = row.getByLabel('Path on daemon');
  const browse = row.getByRole('button', { name: /Browse folders for repository/ });
  await expect(browse.locator('svg')).toHaveCount(1);
  const pathBox = await pathField.boundingBox();
  const browseBox = await browse.boundingBox();
  const removeBox = await row.getByRole('button', { name: /Remove repository/ }).boundingBox();
  expect(pathBox).not.toBeNull();
  expect(browseBox).not.toBeNull();
  expect(removeBox).not.toBeNull();
  expect(Math.abs(pathBox!.y - browseBox!.y)).toBeLessThan(2);
  expect(Math.abs(pathBox!.y - removeBox!.y)).toBeLessThan(2);
});

test('collapses the global sidebar to an icon rail and remembers it', async ({ page }) => {
  const fx = await login(page);
  await page.goto(`${fx.baseUrl}/settings`);
  const shell = page.locator('.cr-shell');
  const sidebar = page.locator('.cr-sidebar');

  await expect(shell).toHaveAttribute('data-sidebar', 'expanded');
  await expect(sidebar).toHaveCSS('width', '280px');
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await expect(shell).toHaveAttribute('data-sidebar', 'collapsed');
  await expect(sidebar).toHaveCSS('width', '76px');
  await expect(page.getByRole('link', { name: 'Reviews' })).toBeVisible();

  await expect(page.getByRole('button', { name: 'Expand sidebar' })).toHaveAttribute(
    'title',
    'Expand sidebar',
  );

  await page.reload();
  await expect(shell).toHaveAttribute('data-sidebar', 'collapsed');
  await expect(sidebar).toHaveCSS('width', '76px');
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  await expect(shell).toHaveAttribute('data-sidebar', 'expanded');
  await expect(sidebar).toHaveCSS('width', '280px');
});
