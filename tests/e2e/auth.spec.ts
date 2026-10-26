import { expect, test } from '@playwright/test';
import { fixture } from './fixture.js';

test('redirects an unauthenticated list request to /auth and signs in with the shared token', async ({
  page,
}) => {
  const fx = await fixture();
  await page.goto(`${fx.baseUrl}/`);
  await expect(page).toHaveURL(/\/auth\?next=%2F$/);
  await expect(page.getByRole('heading', { name: 'Sign in to reviewd' })).toBeVisible();

  await page.getByLabel('Access token').fill(fx.token);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(`${fx.baseUrl}/`);
  await expect(page.getByRole('heading', { name: 'Reviews', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /E2E feature review/ })).toBeVisible();
});

test('rejects a wrong token without setting a session cookie', async ({ page }) => {
  const fx = await fixture();
  await page.goto(`${fx.baseUrl}/auth`);
  await page.getByLabel('Access token').fill('definitely-not-the-token');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('Authentication required');
  await expect(page).toHaveURL(/\/auth/);
  const cookies = await page.context().cookies();
  expect(cookies.some((cookie) => cookie.name === 'cr_session')).toBe(false);
});
