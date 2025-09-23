#!/usr/bin/env node

import { spawn } from 'child_process';

// Get the test file from command line arguments
const testFile = process.argv[2];

if (!testFile) {
  console.error('Please provide a test file path');
  process.exit(1);
}

// Set environment variable for the test file
process.env.VITEST_E2E_FILE = testFile;

// Determine which test mode to use
const testMode = process.argv.includes('--show')
  ? 'test:e2e:show:run'
  : 'test:e2e:ui:run';

// Run start-server-and-test
const child = spawn(
  'npx',
  ['start-server-and-test', 'dev', 'http://localhost:5173', testMode],
  {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env },
  }
);

child.on('exit', code => {
  process.exit(code);
});
