/**
 * VAD Service for voice activity detection and audio segment processing
 */

import { initializeVAD, processAudioFrame, getVADVersion, VAD_CONFIG } from '../lib/vad/index';
import { AudioService } from '../lib/audio/audio-service';
import type { WAVInfo, AudioSegment, VADResult } from '../lib/audio/types';

export class VADService {
  /**
   * Process audio with VAD and extract speech segments
   */
  static async processAudioWithVAD(
    audioData: Int16Array, 
    sampleRate: number, 
    filename: string = 'audio'
  ): Promise<VADResult> {
    const startTime = Date.now();
    
    // Ensure VAD is initialized
    await initializeVAD();
    
    const HOP_SIZE = VAD_CONFIG.HOP_SIZE;
    const frameCount = Math.floor(audioData.length / HOP_SIZE);
    
    let speechFrames = 0;
    let totalProbability = 0;
    const segments: AudioSegment[] = [];
    
    console.log(`Processing ${frameCount} frames for ${filename}`);
    
    let currentSegment: AudioSegment | null = null;
    
    // Process each frame
    for (let i = 0; i < frameCount; i++) {
      const frameStart = i * HOP_SIZE;
      const frameEnd = Math.min(frameStart + HOP_SIZE, audioData.length);
      const frameData = audioData.slice(frameStart, frameEnd);
      
      // Pad frame if necessary
      if (frameData.length < HOP_SIZE) {
        const paddedFrame = new Int16Array(HOP_SIZE);
        paddedFrame.set(frameData);
        frameData.set(paddedFrame);
      }
      
      try {
        const result = processAudioFrame(frameData);
        totalProbability += result.probability;
        
        const frameTime = frameStart / sampleRate;
        
        if (result.isSpeech) {
          speechFrames++;
          
          if (!currentSegment) {
            // Start new speech segment
            currentSegment = {
              startFrame: frameStart,
              endFrame: frameEnd,
              startTime: frameTime,
              endTime: frameTime + (HOP_SIZE / sampleRate),
              data: new Int16Array(frameData),
              isSpeech: true,
              probability: result.probability
            };
          } else {
            // Extend current segment
            currentSegment.endFrame = frameEnd;
            currentSegment.endTime = frameTime + (HOP_SIZE / sampleRate);
            
            // Merge audio data
            const newData = new Int16Array(currentSegment.data.length + frameData.length);
            newData.set(currentSegment.data);
            newData.set(frameData, currentSegment.data.length);
            currentSegment.data = newData;
            
            // Update average probability
            currentSegment.probability = (currentSegment.probability + result.probability) / 2;
          }
        } else {
          // No speech detected
          if (currentSegment) {
            // End current segment and add to segments
            segments.push(currentSegment);
            currentSegment = null;
          }
        }
      } catch (error) {
        console.warn(`Frame ${i} processing failed:`, error);
      }
    }
    
    // Don't forget the last segment
    if (currentSegment) {
      segments.push(currentSegment);
    }
    
    const processingTime = Date.now() - startTime;
    const speechPercentage = frameCount > 0 ? (speechFrames / frameCount) * 100 : 0;
    const avgProbability = frameCount > 0 ? totalProbability / frameCount : 0;
    
    return {
      totalFrames: frameCount,
      speechFrames,
      speechPercentage,
      hasSpeech: speechFrames > 0,
      avgProbability,
      segments,
      processingTime,
    };
  }

  /**
   * Extract and merge speech segments from audio
   */
  static async extractSpeechSegments(
    base64Audio: string,
    minDurationMs: number = 200,
    minProbability: number = 0.4
  ): Promise<{
    originalBuffer: ArrayBuffer;
    processedBuffer: ArrayBuffer;
    vadResult: VADResult;
    speechFound: boolean;
  }> {
    // Convert base64 to ArrayBuffer
    const originalBuffer = AudioService.base64ToArrayBuffer(base64Audio);
    
    // Parse WAV header
    const wavInfo = AudioService.parseWAVHeader(originalBuffer);
    console.log('WAV Info:', {
      sampleRate: wavInfo.sampleRate,
      channels: wavInfo.channels,
      duration: wavInfo.samplesPerChannel / wavInfo.sampleRate
    });
    
    // Extract mono audio data
    const monoAudioData = AudioService.extractMonoAudio(originalBuffer, wavInfo);
    
    // Process with VAD
    const vadResult = await this.processAudioWithVAD(
      monoAudioData, 
      wavInfo.sampleRate, 
      'base64-audio'
    );
    
    // Filter speech segments
    console.log(`Filtering segments with minDurationMs=${minDurationMs}, minProbability=${minProbability}`);
    console.log(`Original segments:`, vadResult.segments.map(s => ({
      duration: ((s.endTime - s.startTime) * 1000).toFixed(1) + 'ms',
      probability: s.probability.toFixed(3),
      isSpeech: s.isSpeech
    })));
    
    const filteredSegments = AudioService.filterSpeechSegments(
      vadResult.segments,
      minDurationMs,
      minProbability
    );
    
    console.log(`Found ${filteredSegments.length} valid speech segments out of ${vadResult.segments.length} total segments`);
    
    if (filteredSegments.length === 0) {
      return {
        originalBuffer,
        processedBuffer: originalBuffer, // Return original if no speech found
        vadResult,
        speechFound: false
      };
    }
    
    // Merge filtered speech segments
    const mergedAudioData = AudioService.mergeAudioSegments(filteredSegments);
    
    // Create new WAV buffer with only speech segments
    const processedBuffer = AudioService.createWAVBuffer(
      mergedAudioData,
      wavInfo.sampleRate,
      1 // Always output mono
    );
    
    const originalDuration = AudioService.calculateDuration(monoAudioData, wavInfo.sampleRate);
    const processedDuration = AudioService.calculateDuration(mergedAudioData, wavInfo.sampleRate);
    
    console.log(`Audio processing complete:`, {
      originalDuration: `${originalDuration.toFixed(2)}s`,
      processedDuration: `${processedDuration.toFixed(2)}s`,
      compressionRatio: `${((processedDuration / originalDuration) * 100).toFixed(1)}%`,
      segmentsKept: filteredSegments.length
    });
    
    return {
      originalBuffer,
      processedBuffer,
      vadResult,
      speechFound: true
    };
  }

  /**
   * Get VAD service information
   */
  static async getServiceInfo() {
    await initializeVAD();
    return {
      version: getVADVersion(),
      config: {
        hopSize: VAD_CONFIG.HOP_SIZE,
        sampleRate: VAD_CONFIG.SAMPLE_RATE,
        threshold: VAD_CONFIG.VOICE_THRESHOLD
      }
    };
  }
}