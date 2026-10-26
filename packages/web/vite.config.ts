import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@dsh-code-review/ui/styles.css',
        replacement: fileURLToPath(new URL('../ui/src/styles.css', import.meta.url)),
      },
      {
        find: '@dsh-code-review/ui/tokens.css',
        replacement: fileURLToPath(new URL('../ui/src/tokens.css', import.meta.url)),
      },
      {
        find: '@dsh-code-review/ui',
        replacement: fileURLToPath(new URL('../ui/src/index.ts', import.meta.url)),
      },
    ],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
  },
});
