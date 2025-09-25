// This setup file is used for coverage tests and conditionally loads
// the appropriate setup based on the test environment

// Check if we're in a browser-like environment (jsdom)
if (typeof window !== 'undefined') {
  // Load client setup for jsdom tests
  await import('../src/test/setup.ts');
} else {
  // Load minimal setup for node tests
  await import('./setupMinimal.js');
}
