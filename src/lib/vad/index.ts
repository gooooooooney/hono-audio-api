/**
 * VAD Module re-export with proper types
 * This module re-exports all VAD functionality from vadLoader.ts
 */

export {
  // Configuration
  VAD_CONFIG,
  
  // Core functions
  loadVADModule,
  initializeVAD,
  getVADVersion,
  createVADInstance,
  destroyVADInstance,
  processAudioFrame,
  processAudioBuffer,
  cleanupVAD,
  
  // Types
  type VADResult
} from './vadLoader';