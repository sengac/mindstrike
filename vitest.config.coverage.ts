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
      'monaco-editor': resolve(
        fileURLToPath(new URL('.', import.meta.url)),
        'src/__mocks__/monaco-editor.ts'
      ),
    },
  },
  test: {
    globals: true,
    setupFiles: ['./tests/setupCoverage.ts'],
    exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**'],

    // Use projects configuration for different environments
    projects: [
      {
        // Frontend tests with jsdom environment
        extends: true,
        test: {
          name: 'frontend',
          environment: 'jsdom',
          include: [
            'src/**/*.{test,spec}.{js,ts,jsx,tsx}',
            'tests/integration/**/*.{test,spec}.tsx',
          ],
        },
      },
      {
        // Backend tests with node environment
        extends: true,
        test: {
          name: 'backend',
          environment: 'node',
          include: [
            'server/**/*.{test,spec}.{js,ts}',
            'tests/integration/**/*.{test,spec}.ts',
          ],
        },
      },
    ],

    // Shared coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['server/**/*.{js,ts}', 'src/**/*.{js,ts,jsx,tsx}'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.d.ts',
        '**/__tests__/**',
        '**/*.test.*',
        '**/*.spec.*',
        '**/test/**',
        '**/tests/**',
        '**/__fixtures__/**',
        '**/vitest.config*.ts',
        'electron/**',
        'scripts/**',
        'playwrightCt.config.ts',
        'playwright.config.ts',
        'postcss.config.js',
        'tailwind.config.js',
      ],
    },

    // Use parallel execution for speed
    pool: 'threads',

    // Server deps configuration
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
