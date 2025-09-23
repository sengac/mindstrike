#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

// Files to skip
const SKIP_FILES = [
  'src/utils/logger.ts',
  'scripts/**',
  'electron/**',
  'server/**', // Server uses Winston directly
  'tests/**',
  '**/*.test.*',
  '**/*.spec.*',
];

// Check if a file should be skipped
function shouldSkipFile(filePath) {
  return SKIP_FILES.some(pattern => {
    if (pattern.includes('**')) {
      const regex = new RegExp(
        pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
      );
      return regex.test(filePath);
    }
    return filePath.includes(pattern);
  });
}

// Check if file already imports logger
function hasLoggerImport(content) {
  return (
    content.includes("from './utils/logger'") ||
    content.includes('from "../utils/logger"') ||
    content.includes("from '../../utils/logger'") ||
    content.includes("from '../../../utils/logger'") ||
    content.includes("from '@/utils/logger'")
  );
}

// Calculate relative import path from file to logger
function getRelativeImportPath(fromFile) {
  const fromDir = path.dirname(fromFile);
  const toFile = 'src/utils/logger';

  // Calculate relative path
  let relativePath = path.relative(fromDir, toFile);

  // Convert to forward slashes and ensure it starts with ./
  relativePath = relativePath.replace(/\\/g, '/');
  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath;
  }

  return relativePath;
}

// Add logger import to the file
function addLoggerImport(content, filePath) {
  if (hasLoggerImport(content)) {
    return content;
  }

  const importPath = getRelativeImportPath(filePath);
  const loggerImport = `import { logger } from '${importPath}';`;

  // Find the last import statement
  const importRegex = /^import\s+.*?;$/gm;
  const imports = content.match(importRegex);

  if (imports && imports.length > 0) {
    const lastImport = imports[imports.length - 1];
    const lastImportIndex = content.lastIndexOf(lastImport);

    // Insert after the last import
    return (
      content.slice(0, lastImportIndex + lastImport.length) +
      '\n' +
      loggerImport +
      content.slice(lastImportIndex + lastImport.length)
    );
  } else {
    // No imports found, add at the beginning
    return loggerImport + '\n\n' + content;
  }
}

// Replace console calls with logger calls
function replaceConsoleCalls(content) {
  let modified = content;
  let hasChanges = false;

  // Replace console.log with logger.info
  if (modified.includes('console.log')) {
    modified = modified.replace(/console\.log\(/g, 'logger.info(');
    hasChanges = true;
  }

  // Replace console.error with logger.error
  if (modified.includes('console.error')) {
    modified = modified.replace(/console\.error\(/g, 'logger.error(');
    hasChanges = true;
  }

  // Replace console.warn with logger.warn
  if (modified.includes('console.warn')) {
    modified = modified.replace(/console\.warn\(/g, 'logger.warn(');
    hasChanges = true;
  }

  // Replace console.info with logger.info
  if (modified.includes('console.info')) {
    modified = modified.replace(/console\.info\(/g, 'logger.info(');
    hasChanges = true;
  }

  // Replace console.debug with logger.debug
  if (modified.includes('console.debug')) {
    modified = modified.replace(/console\.debug\(/g, 'logger.debug(');
    hasChanges = true;
  }

  return { content: modified, hasChanges };
}

// Process a single file
function processFile(filePath) {
  if (shouldSkipFile(filePath)) {
    return false;
  }

  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;

    // Replace console calls
    const { content: modifiedContent, hasChanges } =
      replaceConsoleCalls(content);

    if (hasChanges) {
      // Add logger import if needed
      content = addLoggerImport(modifiedContent, filePath);

      // Write back to file only if there were changes
      if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        // Using process.stdout.write to avoid console usage in this script
        process.stdout.write(`✅ Updated: ${filePath}\n`);
        return true;
      }
    }
  } catch (error) {
    process.stderr.write(`❌ Error processing ${filePath}: ${error.message}\n`);
  }

  return false;
}

// Main function
async function main() {
  process.stdout.write('🔍 Finding TypeScript and TypeScript React files...\n');

  const files = await glob('src/**/*.{ts,tsx}', {
    ignore: ['node_modules/**', 'dist/**', 'build/**'],
  });

  process.stdout.write(`📁 Found ${files.length} files to check\n`);

  let updatedCount = 0;

  for (const file of files) {
    if (processFile(file)) {
      updatedCount++;
    }
  }

  process.stdout.write(`\n✨ Done! Updated ${updatedCount} files\n`);
}

// Run the script
main().catch(error => {
  process.stderr.write(`Script failed: ${error}\n`);
  process.exit(1);
});
