import { chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';
import { build as viteBuild } from 'vite';

const coreEntry = join(import.meta.dirname, '..', 'packages/core/src/index.ts');

await build({
  entryPoints: ['packages/core/src/index.ts'],
  outfile: 'packages/core/dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
});

await viteBuild({
  configFile: join(import.meta.dirname, '..', 'packages/web/vite.config.ts'),
});

await build({
  entryPoints: ['packages/server/src/cli.ts'],
  outfile: 'packages/server/dist/cli.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
  alias: { '@dsh-code-review/core': coreEntry },
});

await chmod('packages/server/dist/cli.js', 0o755);

await build({
  entryPoints: ['packages/server/src/reviewd.ts'],
  outfile: 'packages/server/dist/reviewd.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
  alias: { '@dsh-code-review/core': coreEntry },
});

await chmod('packages/server/dist/reviewd.js', 0o755);
await build({
  entryPoints: ['packages/dsh/src/index.ts'],
  outfile: 'packages/dsh/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  logLevel: 'info',
});
