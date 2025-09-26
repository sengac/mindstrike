import { defineConfig } from 'vite';
import swc from 'unplugin-swc';

export default defineConfig({
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
  ],
  esbuild: false, // Disable esbuild since we're using SWC
  build: {
    target: 'node18',
    lib: {
      entry: './server/main.ts',
      formats: ['es'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      external: [
        // Node.js built-ins
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
        // Keep node_modules external
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
      },
    },
    outDir: 'dist/server-nest',
  },
  resolve: {
    conditions: ['node'],
    mainFields: ['module', 'main'],
  },
});
