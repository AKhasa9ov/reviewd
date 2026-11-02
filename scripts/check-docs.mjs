#!/usr/bin/env node
/**
 * Validate local Markdown links, image references and anchors.
 *
 * External URLs are intentionally not fetched: CI must stay deterministic and
 * offline-friendly. GitHub renders the same relative paths documented here.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SKIP_DIRS = new Set([
  '.git',
  '.superpowers',
  'node_modules',
  'dist',
  'coverage',
  'playwright-report',
  'test-results',
  'packages/dsh/web',
]);
const MARKDOWN_FILES = new Set([
  'README.md',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CHANGELOG.md',
]);

async function walk(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    const rel = relative(ROOT, path).split(sep).join('/');
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || SKIP_DIRS.has(rel) || rel.startsWith('.')) continue;
      await walk(path, out);
    } else if (entry.isFile() && extname(entry.name) === '.md') {
      if (MARKDOWN_FILES.has(rel) || rel.startsWith('docs/') || rel.startsWith('packages/'))
        out.push(rel);
    }
  }
  return out;
}

function stripCode(markdown) {
  return markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

async function anchorsFor(rel) {
  const text = await readFile(join(ROOT, rel), 'utf8');
  const ids = new Set();
  const counts = new Map();
  for (const line of text.split('\n')) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (!heading) continue;
    const base = slugify(heading[2]);
    const count = counts.get(base) ?? 0;
    ids.add(count === 0 ? base : `${base}-${count}`);
    counts.set(base, count + 1);
  }
  for (const match of text.matchAll(/<a\s+[^>]*(?:id|name)=["']([^"']+)["']/gi)) {
    ids.add(match[1]);
  }
  for (const match of text.matchAll(/<h[1-6]\s+[^>]*id=["']([^"']+)["']/gi)) {
    ids.add(match[1]);
  }
  return ids;
}

function extractLinks(markdown) {
  const clean = stripCode(markdown);
  const links = [];
  for (const match of clean.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    links.push(match[1]);
  }
  for (const match of clean.matchAll(/<(?:img|a)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)) {
    links.push(match[1]);
  }
  return links;
}

const errors = [];
const linkCount = { value: 0 };
const anchorCache = new Map();

async function checkLink(source, raw) {
  linkCount.value += 1;
  let target = raw.trim().replace(/^<+/, '').replace(/>+$/, '');
  if (target === '' || target.startsWith('#') || /^(?:https?|mailto|tel|data):/i.test(target)) {
    if (target.startsWith('#') && target.length > 1) {
      const ids = await getAnchors(source);
      if (!ids.has(decodeURIComponent(target.slice(1)))) {
        errors.push(`${source}: missing anchor ${target}`);
      }
    }
    return;
  }
  target = target.split('?')[0];
  const hash = target.includes('#') ? target.slice(target.indexOf('#') + 1) : '';
  const pathPart = hash ? target.slice(0, target.indexOf('#')) : target;
  if (pathPart === '') return;
  let decoded;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    errors.push(`${source}: malformed URL encoding in ${raw}`);
    return;
  }
  const absolute = resolve(dirname(join(ROOT, source)), decoded);
  if (!absolute.startsWith(ROOT + sep) && absolute !== ROOT) {
    errors.push(`${source}: link escapes repository: ${raw}`);
    return;
  }
  let info;
  try {
    info = await stat(absolute);
  } catch {
    errors.push(`${source}: missing target ${raw}`);
    return;
  }
  if (!info.isFile()) {
    errors.push(`${source}: target is not a file ${raw}`);
    return;
  }
  if (hash !== '') {
    const targetRel = relative(ROOT, absolute).split(sep).join('/');
    if (extname(targetRel) === '.md') {
      const ids = await getAnchors(targetRel);
      if (!ids.has(decodeURIComponent(hash))) {
        errors.push(`${source}: missing anchor ${raw}`);
      }
    }
  }
}

async function getAnchors(rel) {
  if (!anchorCache.has(rel)) anchorCache.set(rel, await anchorsFor(rel));
  return anchorCache.get(rel);
}

const files = await walk(ROOT);
for (const rel of files.sort()) {
  const text = await readFile(join(ROOT, rel), 'utf8');
  for (const link of extractLinks(text)) {
    await checkLink(rel, link);
  }
}

if (errors.length > 0) {
  console.error(`docs check failed: ${errors.length} problem(s) across ${linkCount.value} links`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `docs check: ${files.length} Markdown files, ${linkCount.value} local references, 0 broken`,
);
