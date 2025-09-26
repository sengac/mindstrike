import { defineConfig } from 'vite';
import swc from 'unplugin-swc';
import { VitePluginNode } from 'vite-plugin-node';

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
    ...VitePluginNode({
      adapter: 'nest',
      appPath: './server/main.ts',
      exportName: 'viteNodeApp',
      tsCompiler: 'swc',
    }),
  ],
  esbuild: false,
  server: {
    port: 3001,
  },
  resolve: {
    conditions: ['node'],
    mainFields: ['module', 'main'],
  },
});
