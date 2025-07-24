import loadTENVAD from '@gooney-001/ten-vad-lib';
import type { ExtendedVADModule } from '@gooney-001/ten-vad-lib';

// Configuration
export const VAD_CONFIG = {
  HOP_SIZE: 256,           // 16ms per frame at 16kHz
  VOICE_THRESHOLD: 0.5,    // Voice detection threshold
  SAMPLE_RATE: 16000,      // 16kHz sample rate
};

// Global state
let vadModule: ExtendedVADModule | null = null;
let vadHandle: number | null = null;
let vadHandlePtr: number | null = null;
let isInitialized = false;

// Load WASM module
export async function loadVADModule(): Promise<void> {
  if (isInitialized) return;

  try {
    // Load the VAD module using the npm package
    vadModule = await loadTENVAD();
    
    isInitialized = true;
    console.log(`TEN VAD module loaded successfully. Version: ${getVADVersion()}`);
  } catch (error) {
    console.error('Failed to load VAD module:', error);
    throw error;
  }
}

// Get VAD version
export function getVADVersion(): string {
  if (!vadModule) return 'unknown';
  try {
    const versionPtr = vadModule._ten_vad_get_version();
    return vadModule.UTF8ToString(versionPtr);
  } catch (error) {
    return 'unknown';
  }
}

// Create VAD instance
export function createVADInstance(hopSize: number = VAD_CONFIG.HOP_SIZE, threshold: number = VAD_CONFIG.VOICE_THRESHOLD): boolean {
  if (!vadModule) throw new Error('VAD module not loaded');
  
  try {
    vadHandlePtr = vadModule._malloc(4);
    const result = vadModule._ten_vad_create(vadHandlePtr, hopSize, threshold);
    
    if (result === 0) {
      vadHandle = vadModule.getValue(vadHandlePtr, 'i32');
      return true;
    } else {
      console.error(`VAD creation failed with code: ${result}`);
      vadModule._free(vadHandlePtr);
      return false;
    }
  } catch (error) {
    console.error('Error creating VAD instance:', error);
    return false;
  }
}

// Destroy VAD instance
export function destroyVADInstance(): void {
  if (vadHandlePtr && vadModule) {
    vadModule._ten_vad_destroy(vadHandlePtr);
    vadModule._free(vadHandlePtr);
    vadHandlePtr = null;
    vadHandle = null;
  }
}

// Process audio frame
export interface VADResult {
  probability: number;
  isSpeech: boolean;
}

export function processAudioFrame(audioData: Int16Array): VADResult {
  if (!vadModule || !vadHandle) {
    throw new Error('VAD not initialized');
  }
  
  const audioPtr = vadModule._malloc(audioData.length * 2);
  const probPtr = vadModule._malloc(4);
  const flagPtr = vadModule._malloc(4);
  
  try {
    vadModule.HEAP16.set(audioData, audioPtr / 2);
    
    const result = vadModule._ten_vad_process(
      vadHandle, audioPtr, audioData.length, probPtr, flagPtr
    );
    
    if (result === 0) {
      const probability = vadModule.getValue(probPtr, 'float');
      const flag = vadModule.getValue(flagPtr, 'i32');
      
      return {
        probability: probability,
        isSpeech: flag === 1
      };
    } else {
      throw new Error(`VAD processing failed with code: ${result}`);
    }
  } finally {
    vadModule._free(audioPtr);
    vadModule._free(probPtr);
    vadModule._free(flagPtr);
  }
}

// Process entire audio buffer
export async function processAudioBuffer(
  audioData: Float32Array | Int16Array,
  sampleRate: number = VAD_CONFIG.SAMPLE_RATE
): Promise<{
  frames: VADResult[];
  speechSegments: { start: number; end: number; duration: number }[];
  statistics: {
    totalDuration: number;
    speechDuration: number;
    speechRatio: number;
  };
}> {
  // Convert Float32Array to Int16Array if needed
  let int16Data: Int16Array;
  if (audioData instanceof Float32Array) {
    int16Data = new Int16Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      int16Data[i] = Math.max(-32768, Math.min(32767, Math.floor(audioData[i] * 32768)));
    }
  } else {
    int16Data = audioData;
  }
  
  const frames: VADResult[] = [];
  const speechSegments: { start: number; end: number; duration: number }[] = [];
  let currentSpeechStart: number | null = null;
  
  const frameCount = Math.floor(int16Data.length / VAD_CONFIG.HOP_SIZE);
  
  for (let i = 0; i < frameCount; i++) {
    const frameStart = i * VAD_CONFIG.HOP_SIZE;
    const frameEnd = frameStart + VAD_CONFIG.HOP_SIZE;
    const frameData = int16Data.slice(frameStart, frameEnd);
    
    const result = processAudioFrame(frameData);
    frames.push(result);
    
    const timestamp = frameStart / sampleRate;
    
    if (result.isSpeech && currentSpeechStart === null) {
      currentSpeechStart = timestamp;
    } else if (!result.isSpeech && currentSpeechStart !== null) {
      speechSegments.push({
        start: currentSpeechStart,
        end: timestamp,
        duration: timestamp - currentSpeechStart
      });
      currentSpeechStart = null;
    }
  }
  
  // Handle last speech segment
  if (currentSpeechStart !== null) {
    const endTime = int16Data.length / sampleRate;
    speechSegments.push({
      start: currentSpeechStart,
      end: endTime,
      duration: endTime - currentSpeechStart
    });
  }
  
  const totalDuration = int16Data.length / sampleRate;
  const speechDuration = speechSegments.reduce((sum, seg) => sum + seg.duration, 0);
  
  return {
    frames,
    speechSegments,
    statistics: {
      totalDuration,
      speechDuration,
      speechRatio: totalDuration > 0 ? speechDuration / totalDuration : 0
    }
  };
}

// Initialize VAD on module load
export async function initializeVAD(): Promise<void> {
  await loadVADModule();
  if (!createVADInstance()) {
    throw new Error('Failed to create VAD instance');
  }
}

// Cleanup function
export function cleanupVAD(): void {
  destroyVADInstance();
}