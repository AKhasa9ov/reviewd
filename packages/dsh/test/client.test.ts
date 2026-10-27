import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

function primaryButtonRule(): string {
  const match = /\.cr-button\.primary\{([^}]*)\}/.exec(client);
  if (match?.[1] === undefined) throw new Error('missing .cr-button.primary rule');
  return match[1];
}

describe('DSH Code Review client styles', () => {
  it('keeps primary button text readable in both DSH themes', () => {
    const rule = primaryButtonRule();
    expect(rule).toContain('color:var(--dsw-alias-label-primary-foreground)');
    expect(rule).not.toContain('color:#fff');
  });
});
