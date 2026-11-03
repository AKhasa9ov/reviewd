import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';

export interface E2EFixture {
  baseUrl: string;
  token: string;
  repoRoot: string;
  reviewId: string;
  conflictRepo: string;
  conflictReviewId: string;
  screensDir: string;
}

let cached: E2EFixture | null = null;

export async function fixture(): Promise<E2EFixture> {
  if (cached !== null) return cached;
  const path = resolve(import.meta.dirname, '..', '..', 'test-results', 'e2e-fixture.json');
  cached = JSON.parse(await readFile(path, 'utf8')) as E2EFixture;
  return cached;
}

export async function login(page: Page): Promise<E2EFixture> {
  const fx = await fixture();
  const response = await page.request.post(`${fx.baseUrl}/api/auth`, {
    data: { token: fx.token },
    headers: { 'content-type': 'application/json' },
  });
  expect(response.status()).toBe(200);
  return fx;
}

export async function openReview(page: Page): Promise<E2EFixture> {
  const fx = await login(page);
  await page.goto(`${fx.baseUrl}/review/${encodeURIComponent(fx.reviewId)}`);
  await expect(page.getByTestId('review-detail')).toBeVisible();
  return fx;
}

export function screenshotPath(fx: E2EFixture, name: string): string {
  return join(fx.screensDir, `${name}.png`);
}

export async function expectNoPageOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, 'page horizontal scroll').toBeLessThanOrEqual(1);
}
