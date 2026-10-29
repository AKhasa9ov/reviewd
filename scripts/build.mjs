import { chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';
import { build as viteBuild } from 'vite';

const root = join(import.meta.dirname, '..');
const coreEntry = join(root, 'packages/core/src/index.ts');
const coreOut = join(root, 'packages/core/dist/index.js');
const coreBrowserEntry = join(root, 'packages/core/src/browser.ts');
const coreBrowserOut = join(root, 'packages/core/dist/browser.js');
const workerEntry = join(root, 'packages/worker/src/index.ts');
const workerOut = join(root, 'packages/worker/dist/index.js');
const webConfig = join(root, 'packages/web/vite.config.ts');
const cliEntry = join(root, 'packages/server/src/cli.ts');
const cliOut = join(root, 'packages/server/dist/cli.js');
const reviewdEntry = join(root, 'packages/server/src/reviewd.ts');
const reviewdOut = join(root, 'packages/server/dist/reviewd.js');
const dshEntry = join(root, 'packages/dsh/src/index.ts');
const dshOut = join(root, 'packages/dsh/index.js');

/**
 * Builds the review SPA twice: once at `/` with token auth for the standalone
 * daemon origin, and once at `/code-review/` with DSH-session auth for the fat
 * package. The second output is generated and shipped inside `packages/dsh/web`.
 */
async function buildWeb(base, outDir, authMode) {
  process.env.VITE_AUTH_MODE = authMode;
  await viteBuild({
    configFile: webConfig,
    base,
    define: { 'import.meta.env.VITE_AUTH_MODE': JSON.stringify(authMode) },
    build: { outDir, emptyOutDir: true },
  });
}

await build({
  absWorkingDir: root,
  entryPoints: [coreEntry],
  outfile: coreOut,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
});

await build({
  absWorkingDir: root,
  entryPoints: [coreBrowserEntry],
  outfile: coreBrowserOut,
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  logLevel: 'info',
});

await build({
  absWorkingDir: root,
  entryPoints: [workerEntry],
  outfile: workerOut,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
});

await buildWeb('/', join(root, 'packages/web/dist'), 'token');
await buildWeb('/code-review/', join(root, 'packages/dsh/web'), 'dsh');

await build({
  absWorkingDir: root,
  entryPoints: [cliEntry],
  outfile: cliOut,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
  alias: { '@dsh-code-review/core': coreEntry },
});

await chmod(cliOut, 0o755);

await build({
  absWorkingDir: root,
  entryPoints: [reviewdEntry],
  outfile: reviewdOut,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
  alias: { '@dsh-code-review/core': coreEntry },
});

await chmod(reviewdOut, 0o755);
await build({
  absWorkingDir: root,
  entryPoints: [dshEntry],
  outfile: dshOut,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  logLevel: 'info',
  alias: { '@dsh-code-review/core': coreEntry },
});
