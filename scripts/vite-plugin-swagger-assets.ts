import type { Plugin } from 'vite';
import * as fs from 'fs';
import * as path from 'path';

export function swaggerAssetsPlugin(): Plugin {
  return {
    name: 'vite-plugin-swagger-assets',
    apply: 'build',
    closeBundle() {
      const swaggerUiPath = path.resolve(
        process.cwd(),
        'node_modules/swagger-ui-dist'
      );
      const distPath = path.resolve(process.cwd(), 'dist/swagger-ui');

      if (!fs.existsSync(swaggerUiPath)) {
        console.warn('swagger-ui-dist not found in node_modules');
        return;
      }

      // Create swagger-ui directory in dist
      if (!fs.existsSync(distPath)) {
        fs.mkdirSync(distPath, { recursive: true });
      }

      // Files to copy
      const filesToCopy = [
        'swagger-ui.css',
        'swagger-ui-bundle.js',
        'swagger-ui-standalone-preset.js',
        'favicon-32x32.png',
        'favicon-16x16.png',
      ];

      // Copy each file
      filesToCopy.forEach(file => {
        const srcFile = path.join(swaggerUiPath, file);
        const destFile = path.join(distPath, file);

        if (fs.existsSync(srcFile)) {
          fs.copyFileSync(srcFile, destFile);
          console.log(`Copied ${file} to dist/swagger-ui/`);
        }
      });
    },
  };
}
