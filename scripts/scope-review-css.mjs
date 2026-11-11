import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postcss from 'postcss';

function scopeSingleSelector(selector, scope) {
  const value = selector.trim();
  if (value === '') return value;
  if (
    value.startsWith(`${scope} `) ||
    value === scope ||
    value.startsWith(`${scope}[`) ||
    value.startsWith(`${scope}.`)
  ) {
    return value;
  }
  if (value === ':root') return scope;
  if (value.startsWith(':root[')) return `${scope}${value.slice(':root'.length)}`;
  if (value === 'html' || value === 'body' || value === '#root') return scope;
  if (value.startsWith('html')) return `${scope}${value.slice('html'.length)}`;
  if (value.startsWith('body')) return `${scope}${value.slice('body'.length)}`;
  if (value.startsWith('#root')) return `${scope}${value.slice('#root'.length)}`;
  return `${scope} ${value}`;
}

export function scopeSelector(selector, scope = '.cr-native-scope') {
  return postcss.list
    .comma(selector)
    .map((part) => scopeSingleSelector(part, scope))
    .filter(Boolean)
    .join(', ');
}

export function scopeReviewCss(css, scope = '.cr-native-scope') {
  const root = postcss.parse(css);
  root.walkAtRules('import', (rule) => rule.remove());
  root.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes/i.test(rule.parent.name)) return;
    const selectors = rule.selectors
      .map((selector) => scopeSelector(selector, scope))
      .filter(Boolean);
    rule.selectors = [...new Set(selectors)];
  });
  return root.toString();
}

export async function buildReviewCss({ uiDir, nativeCssPath, scope = '.cr-native-scope' }) {
  const tokens = await readFile(join(uiDir, 'tokens.css'), 'utf8');
  const styles = await readFile(join(uiDir, 'styles.css'), 'utf8');
  const native = await readFile(nativeCssPath, 'utf8');
  return scopeReviewCss(`${tokens}\n${styles.replace(/^@import[^;]+;\s*/m, '')}\n${native}`, scope);
}
