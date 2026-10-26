import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@dsh-code-review/core': fileURLToPath(
        new URL('./packages/core/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['packages/**/test/**/*.test.ts'],
    passWithNoTests: true,
    testTimeout: 20_000,
  },
});
