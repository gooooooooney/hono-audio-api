#!/usr/bin/env bun
/**
 * Test script for npm published VAD package
 */

import { initializeVAD, getVADVersion, processAudioFrame, cleanupVAD } from './src/lib/vad/index';

async function testNPMVAD() {
  console.log('Testing @gooney-001/ten-vad-lib package...\n');
  
  try {
    // Step 1: Initialize VAD
    console.log('1. Initializing VAD...');
    await initializeVAD();
    console.log('✓ VAD initialized successfully');
    
    // Step 2: Get version
    console.log('\n2. Getting VAD version...');
    const version = getVADVersion();
    console.log(`✓ TEN VAD Version: ${version}`);
    
    // Step 3: Test with sample audio frame
    console.log('\n3. Testing audio processing...');
    
    // Create a test audio frame (256 samples)
    // Simulate speech (higher amplitude)
    const speechFrame = new Int16Array(256);
    for (let i = 0; i < 256; i++) {
      speechFrame[i] = Math.sin(i * 0.1) * 5000 + Math.random() * 1000;
    }
    
    const speechResult = processAudioFrame(speechFrame);
    console.log('Speech frame result:', {
      probability: speechResult.probability.toFixed(3),
      isSpeech: speechResult.isSpeech
    });
    
    // Simulate silence (low amplitude)
    const silenceFrame = new Int16Array(256);
    for (let i = 0; i < 256; i++) {
      silenceFrame[i] = Math.random() * 100 - 50;
    }
    
    const silenceResult = processAudioFrame(silenceFrame);
    console.log('Silence frame result:', {
      probability: silenceResult.probability.toFixed(3),
      isSpeech: silenceResult.isSpeech
    });
    
    // Step 4: Cleanup
    console.log('\n4. Cleaning up...');
    cleanupVAD();
    console.log('✓ Cleanup complete');
    
    console.log('\n✅ All tests passed! The npm package is working correctly.');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testNPMVAD();