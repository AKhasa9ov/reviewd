import { expect, test } from '@playwright/test';
import { login } from './fixture.js';

test('lays an inline question across its full diff row', async ({ page }) => {
  const fx = await login(page);
  await page.goto(fx.baseUrl);
  await page.evaluate(() => document.fonts.ready);

  const geometry = await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'question-layout-probe';
    host.style.width = '900px';
    host.innerHTML = `
      <div class="cr-inline-question-row">
        <article class="cr-inline-question cr-inline-question-collapsed">
          <div class="cr-inline-question-row">
            <button type="button" class="cr-inline-question-header">
              <span class="cr-inline-question-toggle">▸</span>
              <span class="cr-inline-question-mark">?</span>
              <span class="cr-inline-question-main">
                <span class="cr-inline-question-head">
                  <span class="cr-badge">question</span>
                  <span class="cr-meta">line 17</span>
                </span>
              </span>
            </button>
            <button type="button" class="cr-inline-question-cta">Answer</button>
          </div>
        </article>
      </div>
    `;
    document.body.append(host);

    const row = host.firstElementChild as HTMLElement;
    const card = host.querySelector('.cr-inline-question') as HTMLElement;
    const cta = host.querySelector('.cr-inline-question-cta') as HTMLElement;
    const rowBox = row.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    const ctaBox = cta.getBoundingClientRect();
    return {
      rowWidth: rowBox.width,
      rowRight: rowBox.right,
      cardWidth: cardBox.width,
      ctaRight: ctaBox.right,
    };
  });

  expect(geometry.rowWidth).toBeGreaterThan(800);
  expect(geometry.cardWidth).toBeCloseTo(geometry.rowWidth, 1);
  expect(geometry.ctaRight).toBeGreaterThan(geometry.rowRight - 20);
});
