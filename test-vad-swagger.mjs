#!/usr/bin/env node

/**
 * Test script to verify VAD API with file upload is working
 */

console.log('🔍 Testing VAD API with File Upload Support\n');

async function checkServer() {
  try {
    // First check if server is running
    const statusResponse = await fetch('http://localhost:3002/api/v1/vad/status');
    
    if (statusResponse.ok) {
      const status = await statusResponse.json();
      console.log('✅ Server is running');
      console.log(`   VAD Status: ${status.status}`);
      console.log(`   VAD Version: ${status.version}`);
      console.log(`   Sample Rate: ${status.sampleRate}Hz`);
      return true;
    } else {
      console.log('❌ Server not responding');
      return false;
    }
  } catch (error) {
    console.log('❌ Cannot connect to server:', error.message);
    return false;
  }
}

async function checkSwagger() {
  try {
    const swaggerResponse = await fetch('http://localhost:3002/doc');
    
    if (swaggerResponse.ok) {
      const swaggerDoc = await swaggerResponse.json();
      console.log('✅ Swagger documentation available');
      
      // Check if VAD test endpoint is documented
      if (swaggerDoc.paths && swaggerDoc.paths['/api/v1/vad/test']) {
        console.log('✅ VAD test endpoint documented');
        
        const testEndpoint = swaggerDoc.paths['/api/v1/vad/test'].post;
        if (testEndpoint.requestBody && testEndpoint.requestBody.content['multipart/form-data']) {
          console.log('✅ File upload support configured');
          
          const schema = testEndpoint.requestBody.content['multipart/form-data'].schema;
          if (schema.properties && schema.properties.audio && schema.properties.audio.format === 'binary') {
            console.log('✅ Binary file upload schema correct');
          } else {
            console.log('⚠️  File upload schema might not be optimal');
          }
        } else {
          console.log('❌ File upload not configured');
        }
      } else {
        console.log('❌ VAD test endpoint not found in documentation');
      }
      
      return true;
    } else {
      console.log('❌ Swagger documentation not available');
      return false;
    }
  } catch (error) {
    console.log('❌ Cannot fetch Swagger documentation:', error.message);
    return false;
  }
}

async function testAPI() {
  console.log('1. Checking server status...');
  const serverOk = await checkServer();
  
  console.log();
  
  if (serverOk) {
    console.log('2. Checking Swagger documentation...');
    await checkSwagger();
    
    console.log();
    console.log('🎉 Setup completed! You can now:');
    console.log('   1. Open Swagger UI: http://localhost:3002/ui');
    console.log('   2. Test the VAD endpoint by uploading a WAV file');
    console.log('   3. View API documentation: http://localhost:3002/doc');
    
    console.log('\n📋 API Endpoints:');
    console.log('   GET  /api/v1/vad/status - Check VAD service status');
    console.log('   POST /api/v1/vad/test   - Upload WAV file for voice detection');
    
    console.log('\n💡 Tips for testing:');
    console.log('   - Use WAV files (16-bit PCM)');
    console.log('   - 16kHz sample rate recommended');
    console.log('   - Mono audio preferred');
    console.log('   - Files with speech will return hasSpeech: true');
    
  } else {
    console.log('❌ Server is not running. Please start it with: bun run dev');
  }
}

await testAPI();