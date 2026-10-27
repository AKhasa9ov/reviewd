import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');

function section(name: 'dark' | 'light'): string {
  if (name === 'dark') {
    const end = css.indexOf(":root[data-theme='light']");
    expect(end).toBeGreaterThan(0);
    return css.slice(0, end);
  }
  return css.slice(css.indexOf(":root[data-theme='light']"));
}

function token(theme: 'dark' | 'light', name: string): string {
  const match = new RegExp(`--cr-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(section(theme));
  if (match?.[1] === undefined) throw new Error(`missing --cr-${name} in ${theme}`);
  return match[1];
}

function luminance(hex: string): number {
  const channels = hex
    .replace('#', '')
    .match(/../g)
    ?.map((part) => Number.parseInt(part, 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  if (channels === undefined || channels.length !== 3) throw new Error(`bad hex ${hex}`);
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function ratio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('design tokens', () => {
  for (const theme of ['dark', 'light'] as const) {
    it(`${theme} text pairs meet WCAG AA`, () => {
      expect(ratio(token(theme, 'text'), token(theme, 'bg'))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(token(theme, 'text'), token(theme, 'surface'))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(token(theme, 'text-muted'), token(theme, 'surface'))).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(ratio(token(theme, 'text-muted'), token(theme, 'bg'))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(token(theme, 'primary'), token(theme, 'bg'))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(token(theme, 'danger'), token(theme, 'surface'))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(token(theme, 'warning'), token(theme, 'surface'))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(token(theme, 'info'), token(theme, 'surface'))).toBeGreaterThanOrEqual(4.5);
    });

    it(`${theme} keeps diff and selection surfaces readable`, () => {
      for (const surface of [
        'added-bg',
        'removed-bg',
        'selection-bg',
        'word-added-bg',
        'word-removed-bg',
      ]) {
        expect(ratio(token(theme, 'text'), token(theme, surface))).toBeGreaterThanOrEqual(4.5);
      }
      expect(ratio(token(theme, 'on-selection'), token(theme, 'selection'))).toBeGreaterThanOrEqual(
        4.5,
      );
    });

    it(`${theme} control pairs meet WCAG non-text contrast`, () => {
      expect(ratio(token(theme, 'border'), token(theme, 'bg'))).toBeGreaterThanOrEqual(3);
      expect(ratio(token(theme, 'on-primary'), token(theme, 'primary'))).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(ratio(token(theme, 'on-danger'), token(theme, 'danger'))).toBeGreaterThanOrEqual(4.5);
    });

    it(`${theme} exposes the required type scale and motion tokens`, () => {
      expect(css).toContain('--cr-text-body: 16px');
      expect(css).toContain('--cr-text-code: 12.5px');
      expect(css).toContain('--cr-leading-code: 20px');
      expect(css).toContain('--cr-motion-dialog: 240ms');
    });
  }

  it('keeps the design dark palette exact and derives a matching light theme', () => {
    expect(token('dark', 'bg')).toBe('#101817');
    expect(token('dark', 'surface')).toBe('#1b2825');
    expect(token('dark', 'surface-raised')).toBe('#273532');
    expect(token('dark', 'text')).toBe('#f3f7f6');
    expect(token('dark', 'text-muted')).toBe('#a8bdb9');
    expect(token('dark', 'border')).toBe('#536a65');
    expect(token('dark', 'primary')).toBe('#6ae7ce');
    expect(token('dark', 'on-primary')).toBe('#0f2420');
    expect(token('dark', 'danger')).toBe('#e5685d');
    expect(token('dark', 'on-danger')).toBe('#2f110e');
    expect(token('dark', 'warning')).toBe('#e5a85d');
    expect(token('dark', 'info')).toBe('#7c9cff');

    expect(token('light', 'bg')).toBe('#ffffff');
    expect(token('light', 'surface')).toBe('#f6f8f7');
    expect(token('light', 'text')).toBe('#0f1a18');
    expect(token('light', 'text-muted')).toBe('#4e625d');
    expect(token('light', 'primary')).toBe('#0b7a67');
    expect(token('light', 'danger')).toBe('#b23a2f');
  });

  it('defaults to the dark palette and honors reduced motion', () => {
    expect(css).toContain(":root,\n:root[data-theme='dark']");
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
