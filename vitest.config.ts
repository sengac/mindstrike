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
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setupMinimal.ts'],
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
