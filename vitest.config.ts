import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import react from '@vitejs/plugin-react';

const currentDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(currentDir, 'src'),
      '@server': resolve(currentDir, 'server'),
    },
  },
  esbuild: {
    target: 'es2021',
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setupMinimal.ts'],

    // 🔥 Maximum stability for integration tests - prevents crashes and memory leaks
    pool: 'forks',  // Use fork pool instead of threads for better stability
    poolOptions: {
      forks: {
        singleFork: true,  // ⭐ Single process prevents server port conflicts and memory leaks
      },
    },
    fileParallelism: false,  // ⭐ Sequential file execution prevents resource conflicts
    maxConcurrency: 1,       // ⭐ 1 test at a time per file

    testTimeout: 30000,      // 30 seconds timeout for integration tests
    hookTimeout: 30000,      // 30 seconds for setup/teardown hooks

    include: [
      'server/**/*.{test,spec}.{js,ts}',
      'tests/integration/**/*.{test,spec}.{js,ts,tsx}',
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'src/**/*.{test,spec}.{js,ts,jsx,tsx}', // Exclude React tests for now
      'tests/e2e/**', // Exclude E2E tests
    ],
    server: {
      deps: {
        external: [
          '@modelcontextprotocol/server-filesystem',
          '@modelcontextprotocol/server-github',
        ],
      },
    },
  },
});
