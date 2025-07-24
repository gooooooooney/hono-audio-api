#!/usr/bin/env bun
/**
 * Test script for Speech-to-Text API with VAD preprocessing
 */

import fs from 'fs/promises';
import path from 'path';

const API_URL = 'http://localhost:3002';

async function testSpeechToText() {
  try {
    // Read test audio file
    const audioPath = path.join(process.cwd(), 'test_audio.wav');
    const audioBuffer = await fs.readFile(audioPath);
    const base64Audio = audioBuffer.toString('base64');
    
    console.log('Testing Speech-to-Text API...');
    console.log(`Audio file size: ${(audioBuffer.length / 1024).toFixed(1)} KB`);
    
    // Test the status endpoint first
    console.log('\n1. Testing service status...');
    const statusResponse = await fetch(`${API_URL}/api/v1/stt/status`);
    const status = await statusResponse.json();
    console.log('Service status:', JSON.stringify(status, null, 2));
    
    // Test the transcription endpoint
    console.log('\n2. Testing transcription with VAD...');
    const startTime = Date.now();
    
    const response = await fetch(`${API_URL}/api/v1/stt/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio: base64Audio,
        language: 'zh', // Chinese
        minDurationMs: 200,
        minProbability: 0.4,
        includeSegments: true
      }),
    });
    
    const result = await response.json();
    const processingTime = Date.now() - startTime;
    
    if (response.ok) {
      console.log('\n✅ Transcription successful!');
      console.log(`Total processing time: ${processingTime}ms`);
      console.log('\nTranscribed text:', result.text);
      console.log('\nVAD Statistics:');
      console.log(`- Total frames: ${result.vadStats.totalFrames}`);
      console.log(`- Speech frames: ${result.vadStats.speechFrames}`);
      console.log(`- Speech percentage: ${result.vadStats.speechPercentage.toFixed(1)}%`);
      console.log(`- Segments found: ${result.vadStats.segmentsFound}`);
      console.log(`- Segments kept: ${result.vadStats.segmentsKept}`);
      console.log(`- VAD processing time: ${result.vadStats.processingTimeMs}ms`);
      
      console.log('\nAudio Statistics:');
      console.log(`- Original duration: ${(result.audioStats.originalDurationMs / 1000).toFixed(2)}s`);
      console.log(`- Processed duration: ${(result.audioStats.processedDurationMs / 1000).toFixed(2)}s`);
      console.log(`- Compression ratio: ${(result.audioStats.compressionRatio * 100).toFixed(1)}%`);
      console.log(`- Size reduction: ${((1 - result.audioStats.processedSizeBytes / result.audioStats.originalSizeBytes) * 100).toFixed(1)}%`);
      
      if (result.segments && result.segments.length > 0) {
        console.log('\nTranscription segments:');
        result.segments.forEach((seg: any, idx: number) => {
          console.log(`  ${idx + 1}. [${seg.start.toFixed(2)}s - ${seg.end.toFixed(2)}s]: ${seg.text}`);
        });
      }
    } else {
      console.error('\n❌ Transcription failed!');
      console.error('Status:', response.status);
      console.error('Error:', result);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Check if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testSpeechToText();
}