import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@dsh-code-review/core/browser',
        replacement: fileURLToPath(new URL('./packages/core/src/browser.ts', import.meta.url)),
      },
      {
        find: '@dsh-code-review/core',
        replacement: fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      },
      {
        find: '@dsh-code-review/worker',
        replacement: fileURLToPath(new URL('./packages/worker/src/index.ts', import.meta.url)),
      },
      {
        find: '@dsh-code-review/ui',
        replacement: fileURLToPath(new URL('./packages/ui/src/index.ts', import.meta.url)),
      },
    ],
  },
  test: {
    include: ['packages/**/test/**/*.test.{ts,tsx}'],
    setupFiles: ['./packages/ui/test/setup.ts'],
    passWithNoTests: true,
    testTimeout: 20_000,
  },
});
