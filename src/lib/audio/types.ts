/**
 * Audio processing types and interfaces
 */

export interface WAVInfo {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataOffset: number;
  dataSize: number;
  totalSamples: number;
  samplesPerChannel: number;
}

export interface AudioSegment {
  startFrame: number;
  endFrame: number;
  startTime: number;
  endTime: number;
  data: Int16Array;
  isSpeech: boolean;
  probability: number;
}

export interface VADResult {
  totalFrames: number;
  speechFrames: number;
  speechPercentage: number;
  hasSpeech: boolean;
  avgProbability: number;
  segments: AudioSegment[];
  processingTime: number;
}

export interface ProcessedAudio {
  originalDuration: number;
  processedDuration: number;
  originalBuffer: ArrayBuffer;
  processedBuffer: ArrayBuffer;
  vadResult: VADResult;
  tempFilePath?: string;
}