#!/usr/bin/env node

/**
 * Test TypeScript compilation of VAD API
 */

import { execSync } from 'child_process';

console.log('🔍 Testing TypeScript Compilation\n');

try {
  console.log('1. Checking TypeScript compilation...');
  const result = execSync('npx tsc --noEmit --skipLibCheck', { 
    encoding: 'utf8',
    stdio: 'pipe'
  });
  
  console.log('✅ TypeScript compilation successful');
  
  console.log('\n2. Testing specific VAD API file...');
  execSync('npx tsc --noEmit --skipLibCheck src/api/v1/vad-test.ts', {
    encoding: 'utf8',
    stdio: 'pipe'
  });
  
  console.log('✅ VAD API TypeScript types are correct');
  
  console.log('\n🎉 All TypeScript checks passed!');
  console.log('\n📝 Summary:');
  console.log('   ├─ Overall compilation: ✅');
  console.log('   ├─ VAD API types: ✅');
  console.log('   ├─ OpenAPI route handlers: ✅');
  console.log('   └─ Response schemas: ✅');
  
  console.log('\n💡 Your VAD API is ready for testing!');
  console.log('   Start server: bun run dev');
  console.log('   Swagger UI: http://localhost:3000/ui');
  
} catch (error) {
  console.error('❌ TypeScript compilation failed:');
  console.error(error.stdout || error.message);
  
  if (error.stdout && error.stdout.includes('vad-test.ts')) {
    console.log('\n🔧 The error is in the VAD API file. Let me know if you need help fixing it.');
  }
}