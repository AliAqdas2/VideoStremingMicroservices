#!/usr/bin/env node
// Test script to verify .env file loading

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const serviceDir = process.argv[2] || __dirname;
const envPath = path.join(serviceDir, '.env');

console.log(`Testing .env file loading for: ${serviceDir}`);
console.log(`Looking for .env at: ${envPath}\n`);

if (!fs.existsSync(envPath)) {
  console.error(`❌ ERROR: .env file not found at ${envPath}`);
  process.exit(1);
}

console.log(`✓ .env file exists`);

// Read raw file
const envContent = fs.readFileSync(envPath, 'utf8');
console.log(`✓ File readable (${envContent.length} bytes)`);

// Parse with dotenv
const result = dotenv.config({ path: envPath });

if (result.error) {
  console.error(`❌ ERROR parsing .env file:`);
  console.error(result.error);
  process.exit(1);
}

console.log(`✓ .env file parsed successfully\n`);

// Show loaded variables
if (result.parsed) {
  console.log(`Loaded ${Object.keys(result.parsed).length} environment variables:\n`);
  Object.keys(result.parsed).forEach(key => {
    const value = result.parsed[key];
    // Mask sensitive values
    const displayValue = (key.toLowerCase().includes('secret') || 
                         key.toLowerCase().includes('password') || 
                         key.toLowerCase().includes('key'))
      ? '***HIDDEN***'
      : value;
    console.log(`  ${key} = ${displayValue}`);
  });
} else {
  console.log(`⚠ WARNING: No variables were parsed (file might be empty or have syntax errors)`);
}

console.log(`\n=== Testing process.env access ===`);
const testVars = ['PORT', 'MONGODB_URI', 'JWT_SECRET'];
testVars.forEach(varName => {
  if (process.env[varName]) {
    const value = varName.includes('SECRET') || varName.includes('PASSWORD') 
      ? '***HIDDEN***' 
      : process.env[varName];
    console.log(`✓ process.env.${varName} = ${value}`);
  } else {
    console.log(`✗ process.env.${varName} = NOT SET`);
  }
});

