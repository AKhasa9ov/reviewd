import Prism from '../prism-setup.js';
import type { TokenStream } from 'prismjs';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-scss';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-docker';
import 'prismjs/components/prism-toml';

export interface SyntaxSegment {
  text: string;
  token: string | null;
}

export interface SyntaxLine {
  segments: SyntaxSegment[];
}

const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  json: 'json',
  jsonc: 'json',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  html: 'markup',
  htm: 'markup',
  xml: 'markup',
  svg: 'markup',
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  shell: 'bash',
  py: 'python',
  go: 'go',
  rs: 'rust',
  sql: 'sql',
  toml: 'toml',
};

const IDENTIFIER_LANGUAGES = new Set(['javascript', 'typescript', 'python', 'go', 'rust']);

const TOKEN_CLASS: Readonly<Record<string, string>> = {
  keyword: 'keyword',
  important: 'keyword',
  atrule: 'keyword',
  builtin: 'type',
  'class-name': 'type',
  'maybe-class-name': 'type',
  'known-class-name': 'type',
  namespace: 'type',
  type: 'type',
  function: 'function',
  'function-variable': 'function',
  method: 'function',
  property: 'property',
  'attr-name': 'property',
  'literal-property': 'property',
  parameter: 'variable',
  variable: 'variable',
  string: 'string',
  char: 'string',
  'template-string': 'string',
  regex: 'string',
  'attr-value': 'string',
  url: 'string',
  comment: 'comment',
  'block-comment': 'comment',
  prolog: 'comment',
  doctype: 'comment',
  cdata: 'comment',
  number: 'number',
  boolean: 'constant',
  constant: 'constant',
  symbol: 'constant',
  operator: 'operator',
  punctuation: 'punctuation',
  tag: 'tag',
  selector: 'tag',
};

function languageForBasename(basename: string): string | null {
  const lower = basename.toLowerCase();
  if (lower === 'dockerfile' || lower.startsWith('dockerfile.')) return 'docker';
  const dot = lower.lastIndexOf('.');
  if (dot < 0 || dot === lower.length - 1) return null;
  return LANGUAGE_BY_EXTENSION[lower.slice(dot + 1)] ?? null;
}

export function languageForPath(path: string): string | null {
  const basename = path.slice(path.lastIndexOf('/') + 1);
  return languageForBasename(basename);
}

function classForToken(type: string): string | null {
  if (type.startsWith('language-')) return null;
  if (type.endsWith('class-name')) return 'type';
  return TOKEN_CLASS[type] ?? null;
}

function classForStack(types: readonly string[]): string | null {
  for (let index = types.length - 1; index >= 0; index -= 1) {
    const tokenClass = classForToken(types[index]!);
    if (tokenClass !== null) return tokenClass;
  }
  return null;
}

function pushSegment(line: SyntaxSegment[], text: string, token: string | null): void {
  if (text === '') return;
  const previous = line[line.length - 1];
  if (previous !== undefined && previous.token === token) {
    previous.text += text;
    return;
  }
  line.push({ text, token });
}

function appendText(
  lines: SyntaxLine[],
  text: string,
  types: readonly string[],
  highlightIdentifiers: boolean,
): void {
  const token = classForStack(types);
  const parts = text.split('\n');
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]!;
    if (part !== '') {
      const line = lines[lines.length - 1]!.segments;
      if (highlightIdentifiers && token === null && types.length === 0) {
        let offset = 0;
        for (const match of part.matchAll(/[A-Za-z_$][\w$]*/g)) {
          const start = match.index ?? 0;
          pushSegment(line, part.slice(offset, start), null);
          pushSegment(line, match[0], 'variable');
          offset = start + match[0].length;
        }
        pushSegment(line, part.slice(offset), null);
      } else {
        pushSegment(line, part, token);
      }
    }
    if (index < parts.length - 1) lines.push({ segments: [] });
  }
}

function appendStream(
  lines: SyntaxLine[],
  stream: TokenStream,
  types: readonly string[],
  highlightIdentifiers: boolean,
): void {
  for (const item of Array.isArray(stream) ? stream : [stream]) {
    if (typeof item === 'string') {
      appendText(lines, item, types, highlightIdentifiers);
      continue;
    }
    const aliases =
      item.alias === undefined ? [] : Array.isArray(item.alias) ? item.alias : [item.alias];
    appendStream(
      lines,
      item.content as TokenStream,
      [...types, item.type, ...aliases],
      highlightIdentifiers,
    );
  }
}

export function highlightLines(text: string, language: string | null): SyntaxLine[] {
  const plainLines = text.split('\n').map((line) => ({
    segments: line === '' ? [] : [{ text: line, token: null }],
  }));
  if (language === null) return plainLines;
  const grammar = Prism.languages[language];
  if (grammar === undefined) return plainLines;
  try {
    const lines: SyntaxLine[] = [{ segments: [] }];
    appendStream(lines, Prism.tokenize(text, grammar), [], IDENTIFIER_LANGUAGES.has(language));
    return lines;
  } catch {
    return plainLines;
  }
}

export function highlightHunk(
  lines: readonly { oldNo: number | null; newNo: number | null; text: string }[],
  language: string | null,
): Map<string, SyntaxLine> {
  const highlighted = new Map<string, SyntaxLine>();
  for (const side of ['old', 'new'] as const) {
    const numbered = lines
      .map((line) => ({ no: side === 'old' ? line.oldNo : line.newNo, text: line.text }))
      .filter((line): line is { no: number; text: string } => line.no !== null);
    const syntax = highlightLines(numbered.map((line) => line.text).join('\n'), language);
    numbered.forEach((line, index) => {
      highlighted.set(`${side}:${line.no}`, syntax[index] ?? { segments: [] });
    });
  }
  return highlighted;
}
