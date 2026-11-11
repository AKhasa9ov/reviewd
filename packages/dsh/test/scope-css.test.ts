import { describe, expect, it } from 'vitest';
import { scopeReviewCss, scopeSelector } from '../../../scripts/scope-review-css.mjs';

describe('scopeReviewCss', () => {
  it('maps root and document selectors onto the scope', () => {
    expect(scopeSelector(':root')).toBe('.cr-native-scope');
    expect(scopeSelector(":root[data-theme='light']")).toBe(".cr-native-scope[data-theme='light']");
    expect(scopeSelector('html')).toBe('.cr-native-scope');
    expect(scopeSelector('body.cr-selecting-lines')).toBe('.cr-native-scope.cr-selecting-lines');
    expect(scopeSelector('#root')).toBe('.cr-native-scope');
  });

  it('prefixes ordinary selectors and leaves already-scoped ones alone', () => {
    expect(scopeSelector('.cr-button')).toBe('.cr-native-scope .cr-button');
    expect(scopeSelector('button, a')).toBe('.cr-native-scope button, .cr-native-scope a');
    expect(scopeSelector('.cr-native-scope .cr-native-bar')).toBe(
      '.cr-native-scope .cr-native-bar',
    );
  });

  it('scopes nested media rules but not keyframe steps', () => {
    const output = scopeReviewCss(
      '@media (max-width: 600px){body{margin:0}.cr-card{padding:1px}}@keyframes cr-spin{from{opacity:0}to{opacity:1}}',
    );
    expect(output).toContain('@media (max-width: 600px)');
    expect(output).toContain('.cr-native-scope .cr-card');
    expect(output).toContain('@keyframes cr-spin');
    expect(output).toContain('from{opacity:0}');
    expect(output).not.toMatch(/(^|\n)\s*(html|body|:root|#root)\s*[{,]/);
  });
});
