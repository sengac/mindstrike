#!/usr/bin/env node
/* eslint-env node */

// Set environment variables before importing server
process.env.NODE_ENV = 'development';
process.env.GENERATE_OPENAPI = 'true';

console.log('🚀 Starting OpenAPI documentation generator...');
console.log('⏳ Loading server routes...');

// Import the server which will set up express-oas-generator
import('./index')
  .then(() => {
    console.log('✅ Server loaded successfully');
    console.log('📄 OpenAPI spec will be generated at: ./openapi.json');
    console.log('⏳ Waiting for spec generation...');

    // Give express-oas-generator time to initialize and generate spec
    setTimeout(() => {
      console.log('✅ OpenAPI documentation should be generated!');
      console.log('📍 Check ./openapi.json for the generated specification');
      process.exit(0);
    }, 2000);
  })
  .catch(error => {
    console.error('❌ Error generating OpenAPI documentation:', error);
    process.exit(1);
  });
