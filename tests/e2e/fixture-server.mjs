import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const TOKEN = 'e2e-token-0123456789abcdef0123456789abcdef';
const repoRoot = resolve(import.meta.dirname, '..', '..');
const fixturePath = resolve(repoRoot, 'test-results', 'e2e-fixture.json');
const screensDir = resolve(repoRoot, 'test-results', 'screens');

let root = '';
let repo = '';
let child;
let stopping = false;

async function git(...args) {
  const result = await run('git', ['-C', repo, ...args]);
  return result.stdout;
}

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (child !== undefined && child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 3000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  if (root !== '') await rm(root, { recursive: true, force: true }).catch(() => undefined);
  process.exit(code);
}

async function main() {
  root = await mkdtemp(join(tmpdir(), 'reviewd-e2e-'));
  repo = join(root, 'repo');
  const store = join(root, 'store');
  await mkdir(join(repo, 'src'), { recursive: true });
  await mkdir(store, { recursive: true });
  await mkdir(screensDir, { recursive: true });

  await run('git', ['init', '-b', 'main', repo]);
  await git('config', 'user.email', 'e2e@example.test');
  await git('config', 'user.name', 'E2E');
  await writeFile(
    join(repo, 'src', 'app.ts'),
    'export function answer(): number {\n  return 1;\n}\n',
  );
  await writeFile(
    join(repo, 'src', 'util.ts'),
    'export function label(value: string): string {\n  return value.trim();\n}\n',
  );
  await writeFile(
    join(repo, 'src', 'config.ts'),
    "export const config = {\n  retries: 2,\n  timeoutMs: 500,\n  label: 'config',\n  region: 'eu',\n  tracing: false,\n  cache: true,\n  fallback: 'none',\n  queue: 10,\n  batch: 25,\n};\n",
  );
  await git('add', '-A');
  await git('commit', '-m', 'base');
  await git('branch', 'base');
  await git('checkout', '-b', 'feature');
  await writeFile(
    join(repo, 'src', 'app.ts'),
    'export function answer(): number {\n  return 2;\n}\n',
  );
  await writeFile(
    join(repo, 'src', 'util.ts'),
    'export function label(value: string): string {\n  return value.trim().toLowerCase();\n}\n',
  );
  await writeFile(
    join(repo, 'src', 'config.ts'),
    "export const config = {\n  retries: 3,\n  timeoutMs: 500,\n  label: 'config',\n  region: 'eu',\n  tracing: false,\n  cache: true,\n  fallback: 'none',\n  queue: 10,\n  batch: 25,\n};\n",
  );
  await writeFile(join(repo, 'src', 'feature.ts'), "export const feature = 'ready';\n");
  // A long, deterministic file so the full-file dialog body overflows its scroll container.
  const longLines = Array.from({ length: 140 }, (_, index) => {
    const no = String(index + 1).padStart(3, '0');
    return `export const row${no} = 'line ${no}';`;
  });
  await writeFile(join(repo, 'src', 'long.ts'), `${longLines.join('\n')}\n`);
  await git('add', '-A');
  await git('commit', '-m', 'feature work');

  const env = {
    ...process.env,
    CODE_REVIEW_TOKEN: TOKEN,
    CODE_REVIEW_STORE: store,
    CODE_REVIEW_HOST: '127.0.0.1',
    CODE_REVIEW_PORT: '0',
  };
  child = (await import('node:child_process')).spawn(
    process.execPath,
    [join(repoRoot, 'packages', 'server', 'dist', 'reviewd.js')],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  let baseUrl = '';
  let buffer = '';
  const ready = new Promise((resolveReady, rejectReady) => {
    const timer = setTimeout(
      () => rejectReady(new Error(`reviewd did not start: ${buffer}`)),
      60_000,
    );
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      buffer += text;
      process.stdout.write(text);
      const match = /reviewd listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(buffer);
      if (match !== null && baseUrl === '') {
        baseUrl = match[1];
        clearTimeout(timer);
        resolveReady();
      }
    });
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.once('exit', (code) => {
      if (baseUrl === '') {
        clearTimeout(timer);
        rejectReady(new Error(`reviewd exited with ${code}: ${buffer}`));
      }
    });
  });
  await ready;

  const headers = {
    authorization: `Bearer ${TOKEN}`,
    'content-type': 'application/json',
  };
  const created = await fetch(`${baseUrl}/api/reviews`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      repoRoot: repo,
      title: 'E2E feature review',
      scope: { kind: 'range', baseRef: 'base', headRef: 'feature' },
      reviewer: { backend: 'none' },
    }),
  });
  const createdBody = await created.json();
  if (!created.ok) {
    throw new Error(`review creation failed: ${JSON.stringify(createdBody)}`);
  }
  const reviewId = createdBody.review.review.id;

  // A second commit plus refresh gives the UI two rounds and a real delta.
  await writeFile(
    join(repo, 'src', 'app.ts'),
    'export function answer(): number {\n  return 3;\n}\n',
  );
  await writeFile(join(repo, 'src', 'extra.ts'), 'export const extra = true;\n');
  await git('add', '-A');
  await git('commit', '-m', 'second feature commit');
  const refreshed = await fetch(`${baseUrl}/api/reviews/${reviewId}/refresh`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ scope: { kind: 'range', baseRef: 'base', headRef: 'feature' } }),
  });
  if (!refreshed.ok) {
    throw new Error(`refresh seed failed: ${JSON.stringify(await refreshed.json())}`);
  }

  const comment = await fetch(`${baseUrl}/api/reviews/${reviewId}/comments`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      body: 'Should this value be configurable?',
      path: 'src/app.ts',
      side: 'new',
      lineStart: 2,
    }),
  });
  if (!comment.ok) throw new Error(`comment seed failed: ${JSON.stringify(await comment.json())}`);

  // Leave one un-reviewed commit so the UI refresh flow creates a real round 3.
  await writeFile(
    join(repo, 'src', 'app.ts'),
    'export function answer(): number {\n  return 4;\n}\n',
  );
  await git('add', '-A');
  await git('commit', '-m', 'third feature commit');

  await writeFile(
    fixturePath,
    `${JSON.stringify({ baseUrl, token: TOKEN, repoRoot: repo, reviewId, screensDir }, null, 2)}\n`,
  );
  process.stdout.write(`E2E_READY url=${baseUrl}\n`);

  await new Promise((resolveReady) => {
    process.once('SIGTERM', () => resolveReady(undefined));
    process.once('SIGINT', () => resolveReady(undefined));
  });
  await stop();
}

process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());

main().catch(async (error) => {
  process.stderr.write(`e2e fixture failed: ${error.stack ?? error}\n`);
  await stop(1);
});
