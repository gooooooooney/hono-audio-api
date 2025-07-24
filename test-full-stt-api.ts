#!/usr/bin/env bun
/**
 * Complete test script for VAD + Speech-to-Text API
 * Generates a test WAV file and tests the full pipeline
 */

import { AudioService } from './src/lib/audio/audio-service';

// Generate a test WAV file with speech-like and silence segments
function generateTestWAV(): ArrayBuffer {
  const sampleRate = 16000;
  const duration = 5; // 5 seconds
  const numSamples = sampleRate * duration;
  const audioData = new Int16Array(numSamples);
  
  // Create alternating speech and silence segments
  // 0-1s: silence
  // 1-2s: speech-like signal
  // 2-2.5s: silence
  // 2.5-4s: speech-like signal
  // 4-5s: silence
  
  for (let i = 0; i < numSamples; i++) {
    const time = i / sampleRate;
    
    if ((time >= 1 && time < 2) || (time >= 2.5 && time < 4)) {
      // Speech-like signal: combination of frequencies typical in human speech
      const freq1 = 200 + Math.sin(time * 2) * 50; // Fundamental frequency
      const freq2 = 800 + Math.sin(time * 3) * 100; // Formant
      const freq3 = 2500 + Math.sin(time * 5) * 200; // Higher formant
      
      const signal = 
        Math.sin(2 * Math.PI * freq1 * time) * 0.5 +
        Math.sin(2 * Math.PI * freq2 * time) * 0.3 +
        Math.sin(2 * Math.PI * freq3 * time) * 0.2;
      
      // Add some variation and noise
      const noise = (Math.random() - 0.5) * 0.1;
      audioData[i] = Math.floor((signal + noise) * 10000); // Scale to 16-bit range
    } else {
      // Silence with minimal noise
      audioData[i] = Math.floor((Math.random() - 0.5) * 100); // Very low amplitude noise
    }
  }
  
  // Create WAV file
  return AudioService.createWAVBuffer(audioData, sampleRate);
}

// Convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function testAPI() {
  console.log('Testing VAD + Speech-to-Text API with generated audio...\n');
  
  try {
    // Step 1: Generate test WAV
    console.log('1. Generating test WAV file...');
    const wavBuffer = generateTestWAV();
    const wavBase64 = arrayBufferToBase64(wavBuffer);
    console.log(`✓ Generated ${wavBuffer.byteLength} byte WAV file (5 seconds, 16kHz)`);
    
    // Parse WAV to verify
    const wavInfo = AudioService.parseWAVHeader(wavBuffer);
    console.log(`✓ WAV info: ${wavInfo.sampleRate}Hz, ${wavInfo.channels} channel(s), ${wavInfo.bitsPerSample} bits`);
    
    // Step 2: Check service status
    console.log('\n2. Checking API service status...');
    const statusResponse = await fetch('http://localhost:3002/api/v1/stt/status');
    const status = await statusResponse.json();
    
    if (statusResponse.ok) {
      console.log('✓ Service status:');
      console.log(`  - VAD: ${status.vad.available ? 'Available' : 'Not available'} (v${status.vad.version})`);
      console.log(`  - Whisper: ${status.whisper.configured ? 'Configured' : 'Not configured'}`);
      
      if (!status.whisper.configured) {
        console.warn('\n⚠️  Warning: OpenAI API key not configured!');
        console.warn('Set OPENAI_API_KEY environment variable to enable transcription.');
      }
    } else {
      console.error('✗ Service status check failed:', status);
    }
    
    // Step 3: Test VAD processing (without Whisper)
    console.log('\n3. Testing VAD processing...');
    const vadTestResponse = await fetch('http://localhost:3002/api/v1/stt/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio: wavBase64,
        minDurationMs: 200,
        minProbability: 0.4,
        includeSegments: true
      })
    });
    
    console.log('API Response Status:', vadTestResponse.status);
    console.log('API Response Headers:', vadTestResponse.headers);
    
    let vadResult;
    try {
      const responseText = await vadTestResponse.text();
      console.log('Raw Response:', responseText);
      vadResult = JSON.parse(responseText);
    } catch (error) {
      console.error('Failed to parse response:', error);
      return;
    }
    
    if (vadResult.vadStats) {
      console.log('✓ VAD processing results:');
      console.log(`  - Total frames: ${vadResult.vadStats.totalFrames}`);
      console.log(`  - Speech frames: ${vadResult.vadStats.speechFrames} (${vadResult.vadStats.speechPercentage.toFixed(1)}%)`);
      console.log(`  - Segments found: ${vadResult.vadStats.segmentsFound}`);
      console.log(`  - Segments kept: ${vadResult.vadStats.segmentsKept}`);
      console.log(`  - Processing time: ${vadResult.vadStats.processingTimeMs}ms`);
      
      if (vadResult.audioStats) {
        console.log('\n✓ Audio compression stats:');
        console.log(`  - Original duration: ${(vadResult.audioStats.originalDurationMs / 1000).toFixed(2)}s`);
        console.log(`  - Processed duration: ${(vadResult.audioStats.processedDurationMs / 1000).toFixed(2)}s`);
        console.log(`  - Compression ratio: ${(vadResult.audioStats.compressionRatio * 100).toFixed(1)}%`);
        console.log(`  - Size reduction: ${((1 - vadResult.audioStats.processedSizeBytes / vadResult.audioStats.originalSizeBytes) * 100).toFixed(1)}%`);
      }
    }
    
    if (vadResult.success === false && vadResult.code === 'NO_SPEECH_DETECTED') {
      console.log('\n⚠️  No speech detected in the generated audio.');
      console.log('This is expected for synthetic audio without real speech.');
    } else if (vadResult.success === false && vadResult.code === 'API_KEY_MISSING') {
      console.log('\n⚠️  OpenAI API key not configured.');
      console.log('The VAD processing worked correctly, but transcription requires an API key.');
    } else if (vadResult.success) {
      console.log('\n✓ Transcription result:');
      console.log(`  Text: "${vadResult.text}"`);
      console.log(`  Language: ${vadResult.language || 'Not detected'}`);
      if (vadResult.confidence) {
        console.log(`  Confidence: ${(vadResult.confidence * 100).toFixed(1)}%`);
      }
    } else {
      console.log('\n✗ API request failed:', vadResult);
    }
    
    // Step 4: Test with real audio file if exists
    const fs = await import('fs');
    const path = await import('path');
    const realAudioPath = path.join(process.cwd(), 'test_audio.wav');
    
    if (fs.existsSync(realAudioPath)) {
      console.log('\n4. Testing with real audio file...');
      const realAudioBuffer = fs.readFileSync(realAudioPath);
      const realAudioBase64 = realAudioBuffer.toString('base64');
      
      const realTestResponse = await fetch('http://localhost:3002/api/v1/stt/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audio: realAudioBase64,
          language: 'zh', // Assuming Chinese for test
          minDurationMs: 200,
          minProbability: 0.4
        })
      });
      
      const realResult = await realTestResponse.json();
      
      if (realResult.success) {
        console.log('✓ Real audio transcription:');
        console.log(`  Text: "${realResult.text}"`);
        console.log(`  Processing time: ${realResult.processingTimeMs}ms`);
      } else {
        console.log('✗ Real audio test failed:', realResult.error);
      }
    } else {
      console.log('\n4. No real audio file found at test_audio.wav');
      console.log('   Place a WAV file there to test with real speech.');
    }
    
    console.log('\n✅ API test completed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('\nMake sure the API server is running:');
    console.error('  bun run dev');
    process.exit(1);
  }
}

// Check if API server is running
async function checkServer(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:3002/api/v1/stt/status');
    return response.status === 200;
  } catch (error) {
    console.error('Server check error:', error);
    return false;
  }
}

// Main execution
(async () => {
  console.log('VAD + Speech-to-Text API Test\n');
  console.log('Using npm package: @gooney-001/ten-vad-lib');
  console.log('====================================\n');
  
  // Run tests directly
  await testAPI();
})();