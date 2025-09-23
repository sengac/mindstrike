#!/usr/bin/env node

import { glob } from 'glob';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

async function findFilesWithTests() {
  // Find all test files with multiple patterns
  const patterns = [
    '**/__tests__/**/*.test.{ts,tsx,js,jsx}',
    '**/*.test.{ts,tsx,js,jsx}',
    '**/*.spec.{ts,tsx,js,jsx}',
  ];

  const allTestFiles = new Set();

  for (const pattern of patterns) {
    const testFiles = await glob(pattern, {
      ignore: [
        'node_modules/**',
        'dist/**',
        'coverage/**',
        'build/**',
        '.next/**',
      ],
    });
    testFiles.forEach(file => allTestFiles.add(file));
  }

  // Extract the source files that have tests
  const sourceFiles = new Set();
  const testFilesArray = Array.from(allTestFiles);

  for (const testFile of testFilesArray) {
    // Extract the base filename without .test/.spec extension
    const testFileName = path.basename(testFile);
    const baseFileName = testFileName.replace(
      /\.(test|spec)\.(ts|tsx|js|jsx)$/,
      ''
    );

    // Look for the corresponding source file
    const testDir = path.dirname(testFile);

    // Strategy 1: If in __tests__ directory, check parent directory
    if (testDir.includes('__tests__')) {
      const parentDir = testDir.replace('/__tests__', '');
      const extensions = ['.ts', '.tsx', '.js', '.jsx'];
      for (const ext of extensions) {
        const possibleSourceFile = path.join(parentDir, baseFileName + ext);
        if (fs.existsSync(possibleSourceFile)) {
          sourceFiles.add(possibleSourceFile);
          break;
        }
      }
    }

    // Strategy 2: Check same directory (for co-located tests)
    const extensions = ['.ts', '.tsx', '.js', '.jsx'];
    for (const ext of extensions) {
      const possibleSourceFile = path.join(testDir, baseFileName + ext);
      if (
        fs.existsSync(possibleSourceFile) &&
        !possibleSourceFile.includes('.test.') &&
        !possibleSourceFile.includes('.spec.')
      ) {
        sourceFiles.add(possibleSourceFile);
        break;
      }
    }

    // Strategy 3: For specific patterns (like server/llm tests)
    if (testFile.includes('server/llm/__tests__')) {
      const possibleSourceFile = testFile
        .replace('/__tests__', '')
        .replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, '.ts');
      if (fs.existsSync(possibleSourceFile)) {
        sourceFiles.add(possibleSourceFile);
      }
    }
  }

  return {
    sourceFiles: Array.from(sourceFiles),
    testFiles: testFilesArray,
  };
}

async function main() {
  try {
    console.log('Finding files with associated tests...');
    const { sourceFiles, testFiles } = await findFilesWithTests();

    if (sourceFiles.length === 0 && testFiles.length === 0) {
      console.log('No files with tests found.');
      return;
    }

    console.log(`Found ${sourceFiles.length} source files with tests:`);
    sourceFiles.forEach(file => console.log(`  - ${file}`));

    console.log(`\nFound ${testFiles.length} test files:`);
    testFiles.forEach(file => console.log(`  - ${file}`));

    // Combine all files to lint
    const allFilesToLint = [...sourceFiles, ...testFiles];

    // Run ESLint on these files
    console.log(`\nRunning ESLint on ${allFilesToLint.length} files...`);
    const eslintCommand = `eslint ${allFilesToLint.join(' ')} --ext .ts,.tsx,.js,.jsx`;

    try {
      execSync(eslintCommand, { stdio: 'inherit' });
      console.log('\nLinting completed successfully!');
    } catch (error) {
      // ESLint returns non-zero exit code when there are linting errors
      // This is expected behavior, so we don't throw
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
