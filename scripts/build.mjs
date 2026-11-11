import { chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import { buildReviewCss } from './scope-review-css.mjs';

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
const dshClientEntry = join(root, 'packages/dsh/src/client.tsx');
const dshClientOut = join(root, 'packages/dsh/client.js');
const dshClientNativeCss = join(root, 'packages/dsh/src/client/native.css');

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

// The DSH client half runs inside the harness web shell, so it reuses the review
// UI in a scoped native surface instead of shipping a second SPA document.
const reviewCss = await buildReviewCss({
  uiDir: join(root, 'packages/ui/src'),
  nativeCssPath: dshClientNativeCss,
});

await build({
  absWorkingDir: root,
  entryPoints: [dshClientEntry],
  outfile: dshClientOut,
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  jsx: 'automatic',
  define: {
    __REVIEW_CSS__: JSON.stringify(reviewCss),
    'process.env.NODE_ENV': '"production"',
    'import.meta.env.BASE_URL': JSON.stringify('/'),
    'import.meta.env.VITE_AUTH_MODE': JSON.stringify('dsh'),
  },
  external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
  alias: {
    '@sir_yami/reviewd-ui': join(root, 'packages/ui/src/index.ts'),
    '@sir_yami/reviewd-core/browser': join(root, 'packages/core/src/browser.ts'),
    '@sir_yami/reviewd-core': join(root, 'packages/core/src/index.ts'),
  },
  banner: {
    js: [
      'window.__ModuleLoader__.load({',
      "  id: '@sir_yami/reviewd',",
      '  factory(require) {',
      '    var module = { exports: {} };',
      '    var exports = module.exports;',
    ].join('\n'),
  },
  footer: {
    js: '    return module.exports;\n  }\n});',
  },
  logLevel: 'info',
});

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
  alias: { '@sir_yami/reviewd-core': coreEntry },
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
  alias: { '@sir_yami/reviewd-core': coreEntry },
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
  alias: { '@sir_yami/reviewd-core': coreEntry },
});
