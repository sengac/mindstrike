import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    target: 'node20',
    ssr: true,
    outDir: 'dist/server',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('./server/index.ts', import.meta.url)),
        llmWorker: fileURLToPath(
          new URL('./server/llmWorker.ts', import.meta.url)
        ),
      },
      output: {
        format: 'es',
        entryFileNames: '[name].js',
      },
      external: [
        // Only native modules that can't be bundled
        'node-llama-cpp',
        'sharp',
        'canvas',
        'bufferutil',
        'utf-8-validate',
        'fsevents',
      ],
    },
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
  },
  ssr: {
    noExternal: true, // Bundle all dependencies
    format: 'esm',
  },
});
