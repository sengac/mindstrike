import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(fileURLToPath(new URL('.', import.meta.url)), 'src'),
      '@server': resolve(
        fileURLToPath(new URL('.', import.meta.url)),
        'server'
      ),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'server/**/*.{test,spec}.{js,ts}',
      'tests/integration/**/*.{test,spec}.{js,ts}',
      'tests/e2e/**',
    ],
    css: true,
    testTimeout: 10000,
    mockReset: true,
    clearMocks: true,
    restoreMocks: true,
    isolate: true, // Enable test isolation
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true, // Run tests sequentially in a single thread
      },
    },
  },
});
