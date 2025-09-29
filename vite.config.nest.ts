import { defineConfig } from 'vite';
import swc from 'unplugin-swc';
import { swaggerAssetsPlugin } from './scripts/vite-plugin-swagger-assets';

// Check if we're building for production/Electron
const isElectronBuild =
  process.env.ELECTRON_BUILD === 'true' || process.argv.includes('--electron');

export default defineConfig({
  define: {
    __dirname: '"."',
  },
  plugins: [
    swc.vite({
      jsc: {
        parser: {
          syntax: 'typescript',
          decorators: true,
        },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
        target: 'es2020',
        keepClassNames: true,
      },
    }),
    swaggerAssetsPlugin(),
  ],
  esbuild: false, // Disable esbuild since we're using SWC
  ssr: isElectronBuild
    ? {
        // For Electron builds, bundle everything except Node built-ins
        noExternal: true,
        external: [
          // Only externalize Node.js built-ins and native modules
          'fs',
          'path',
          'os',
          'crypto',
          'util',
          'events',
          'stream',
          'buffer',
          'child_process',
          'cluster',
          'dgram',
          'dns',
          'http',
          'https',
          'net',
          'readline',
          'repl',
          'tls',
          'tty',
          'url',
          'v8',
          'vm',
          'worker_threads',
          'zlib',
          'fs/promises',
          'perf_hooks',
          'querystring',
          'async_hooks',
          'module',
          'constants',
          'assert',
          'timers',
          'console',
          'process',
          'node-llama-cpp',
        ],
      }
    : undefined,
  build: {
    target: 'node18',
    ssr: true, // Important: Build for Node.js, not browser
    emptyOutDir: false, // Don't clean the output directory
    lib: {
      entry: {
        server: './server/main.ts',
        llmWorker: './server/llmWorker.ts',
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: isElectronBuild
        ? [
            // For Electron build, only externalize Node.js built-ins and native modules
            /^node:/,
            'fs',
            'path',
            'os',
            'crypto',
            'util',
            'events',
            'stream',
            'buffer',
            'child_process',
            'cluster',
            'dgram',
            'dns',
            'http',
            'https',
            'net',
            'readline',
            'repl',
            'tls',
            'tty',
            'url',
            'v8',
            'vm',
            'worker_threads',
            'zlib',
            'fs/promises',
            'perf_hooks',
            'querystring',
            'async_hooks',
            'module',
            'constants',
            'assert',
            'timers',
            'console',
            'process',
            // Only externalize native modules that can't be bundled
            /^node-llama-cpp/,
          ]
        : [
            // For development, externalize everything for faster builds
            /^node:/,
            'fs',
            'path',
            'os',
            'crypto',
            'util',
            'events',
            'stream',
            'buffer',
            'child_process',
            'cluster',
            'dgram',
            'dns',
            'http',
            'https',
            'net',
            'readline',
            'repl',
            'tls',
            'tty',
            'url',
            'v8',
            'vm',
            'worker_threads',
            'zlib',
            'fs/promises',
            // Keep node_modules external for dev
            /^@nestjs\//,
            /^express/,
            /^reflect-metadata/,
            /^class-transformer/,
            /^class-validator/,
            /^rxjs/,
            /^swagger/,
            /^music-metadata/,
            /^winston/,
            /^node-llama-cpp/,
          ],
      output: {
        format: 'es',
        preserveModules: false,
        entryFileNames: chunkInfo => {
          // Handle multiple entry points
          if (chunkInfo.name === 'llmWorker') {
            return 'llmWorker.js';
          }
          return 'server.js';
        },
      },
    },
    outDir: 'dist',
  },
  resolve: {
    conditions: ['node'],
    mainFields: ['module', 'main'],
    alias: isElectronBuild
      ? {
          'class-transformer/storage': 'class-transformer/cjs/storage.js',
        }
      : {},
  },
});
