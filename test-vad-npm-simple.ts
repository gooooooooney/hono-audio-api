#!/usr/bin/env bun
/**
 * Simple test for npm-published VAD package functionality
 */

import { initializeVAD, getVADVersion, processAudioFrame, cleanupVAD } from './src/lib/vad/index';

async function simpleVADTest() {
  console.log('Simple VAD Test - @gooney-001/ten-vad-lib\n');
  
  try {
    // Initialize VAD
    console.log('Initializing VAD...');
    await initializeVAD();
    console.log('✓ VAD initialized');
    
    // Get version
    const version = getVADVersion();
    console.log(`✓ VAD Version: ${version}`);
    
    // Test speech detection
    console.log('\nTesting speech detection:');
    
    // Create speech-like signal
    const speechFrame = new Int16Array(256);
    for (let i = 0; i < 256; i++) {
      speechFrame[i] = Math.sin(i * 0.1) * 5000;
    }
    
    const speechResult = processAudioFrame(speechFrame);
    console.log(`Speech frame: probability=${speechResult.probability.toFixed(3)}, isSpeech=${speechResult.isSpeech}`);
    
    // Create silence
    const silenceFrame = new Int16Array(256);
    silenceFrame.fill(0);
    
    const silenceResult = processAudioFrame(silenceFrame);
    console.log(`Silence frame: probability=${silenceResult.probability.toFixed(3)}, isSpeech=${silenceResult.isSpeech}`);
    
    // Cleanup
    cleanupVAD();
    console.log('\n✓ Test completed successfully!');
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

simpleVADTest();