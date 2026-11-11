// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { highlightHunk, highlightLines, languageForPath } from '../src/review/syntax.js';

function tokens(text: string, language = 'typescript'): string[][] {
  return highlightLines(text, language).map((line) =>
    line.segments.filter((segment) => segment.token !== null).map((segment) => segment.token!),
  );
}

describe('syntax highlighting', () => {
  it('maps common file extensions and Dockerfile to Prism languages', () => {
    expect(languageForPath('src/app.ts')).toBe('typescript');
    expect(languageForPath('src/App.tsx')).toBe('tsx');
    expect(languageForPath('src/App.jsx')).toBe('jsx');
    expect(languageForPath('src/app.mjs')).toBe('javascript');
    expect(languageForPath('styles/app.scss')).toBe('scss');
    expect(languageForPath('docs/readme.md')).toBe('markdown');
    expect(languageForPath('Dockerfile')).toBe('docker');
    expect(languageForPath('assets/logo.bin')).toBeNull();
  });

  it('distinguishes keywords, types, variables and numbers', () => {
    const [line] = highlightLines('const answer: number = 42;', 'typescript');
    const byText = (text: string) => line!.segments.filter((segment) => segment.text === text);
    expect(byText('const')[0]?.token).toBe('keyword');
    expect(byText('answer')[0]?.token).toBe('variable');
    expect(byText('number')[0]?.token).toBe('type');
    expect(byText('42')[0]?.token).toBe('number');
  });

  it('keeps a multi-line comment highlighted on every line', () => {
    const lines = tokens('/* first\n * second\n */\nconst value = 1;');
    expect(lines[0]).toContain('comment');
    expect(lines[1]).toContain('comment');
    expect(lines[2]).toContain('comment');
    expect(lines[3]).toContain('keyword');
  });

  it('highlights JSX tags, attributes and strings', () => {
    const lines = tokens('const view = <Panel title="hello" />;', 'tsx');
    expect(lines[0]).toContain('keyword');
    expect(lines[0]).toContain('tag');
    expect(lines[0]).toContain('property');
    expect(lines[0]).toContain('string');
  });

  it('preserves blank lines and plain text for unknown languages', () => {
    const lines = highlightLines('alpha\n\nbeta', null);
    expect(lines).toHaveLength(3);
    expect(lines.map((line) => line.segments.map((segment) => segment.text).join(''))).toEqual([
      'alpha',
      '',
      'beta',
    ]);
    expect(lines.every((line) => line.segments.every((segment) => segment.token === null))).toBe(
      true,
    );
  });

  it('does not interpret source text as HTML', () => {
    const lines = highlightLines('const html = "<img src=x onerror=alert(1)>";', 'typescript');
    const text = lines.flatMap((line) => line.segments.map((segment) => segment.text)).join('');
    expect(text).toBe('const html = "<img src=x onerror=alert(1)>";');
  });

  it('covers every configured language', () => {
    const samples: [string, string][] = [
      ['app.py', 'def run():\n  return 1'],
      ['main.go', 'package main'],
      ['lib.rs', 'fn main() {}'],
      ['script.sh', 'echo hello'],
      ['data.yml', 'key: value'],
      ['data.json', '{"key": 1}'],
      ['styles.css', '.item { color: red; }'],
      ['styles.scss', '$accent: red;'],
      ['index.html', '<div>hello</div>'],
      ['README.md', '# Title'],
      ['query.sql', 'SELECT 1;'],
      ['Dockerfile', 'FROM node:22'],
      ['config.toml', 'key = 1'],
    ];
    for (const [path, code] of samples) {
      const lines = highlightLines(code, languageForPath(path));
      expect(
        lines.some((line) => line.segments.some((segment) => segment.token !== null)),
        path,
      ).toBe(true);
    }
  });

  it('does not colour prose inside JSX text as variables', () => {
    const line = highlightLines('<div>Hello world</div>', 'jsx')[0]!;
    expect(line.segments.filter((segment) => segment.text === 'Hello')[0]?.token).not.toBe(
      'variable',
    );
  });

  it('keeps multiline comments consistent across both sides of a hunk', () => {
    const highlighted = highlightHunk(
      [
        { oldNo: 1, newNo: 1, text: '/*' },
        { oldNo: 2, newNo: 2, text: ' * keep this note' },
        { oldNo: 3, newNo: 3, text: ' */' },
      ],
      'typescript',
    );
    for (const side of ['old', 'new'] as const) {
      for (const no of [1, 2, 3]) {
        const line = highlighted.get(`${side}:${no}`);
        expect(line?.segments.map((segment) => segment.text).join('')).toMatch(
          /keep this note|\/\*|\*\//,
        );
        expect(line?.segments.some((segment) => segment.token === 'comment')).toBe(true);
      }
    }
  });
});
