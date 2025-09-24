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
    // Use a function to determine environment based on file path
    environmentMatchGlobs: [
      ['src/**', 'jsdom'],
      ['server/**', 'node'],
      ['tests/integration/**/*.ts', 'node'],
      ['tests/integration/**/*.tsx', 'jsdom'], // tsx files need jsdom for React components
    ],
    setupFiles: ['./tests/setupCoverage.ts'],
    include: [
      'server/**/*.{test,spec}.{js,ts}',
      'tests/integration/**/*.{test,spec}.{js,ts,tsx}',
      'src/**/*.{test,spec}.{js,ts,jsx,tsx}',
    ],
    exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**'],
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
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
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
