/**
 * Audio processing service for WAV file manipulation and processing
 */

import type { WAVInfo, AudioSegment } from './types';

export class AudioService {

  /**
   * Convert base64 audio data to ArrayBuffer
   */
  static base64ToArrayBuffer(base64Data: string): ArrayBuffer {
    // Remove data URL prefix if present (e.g., "data:audio/wav;base64,")
    const base64String = base64Data.includes(',') 
      ? base64Data.split(',')[1] 
      : base64Data;
    
    const binaryString = Buffer.from(base64String, 'base64');
    return binaryString.buffer.slice(
      binaryString.byteOffset, 
      binaryString.byteOffset + binaryString.byteLength
    );
  }

  /**
   * Convert ArrayBuffer to base64
   */
  static arrayBufferToBase64(buffer: ArrayBuffer): string {
    return Buffer.from(buffer).toString('base64');
  }

  /**
   * Parse WAV file header
   */
  static parseWAVHeader(buffer: ArrayBuffer): WAVInfo {
    const view = new DataView(buffer);
    
    // Check RIFF header
    const riffHeader = String.fromCharCode(
      view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)
    );
    if (riffHeader !== 'RIFF') {
      throw new Error('Invalid WAV file: missing RIFF header');
    }
    
    // Check WAVE format
    const waveHeader = String.fromCharCode(
      view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)
    );
    if (waveHeader !== 'WAVE') {
      throw new Error('Invalid WAV file: not WAVE format');
    }
    
    let offset = 12;
    let dataOffset = -1;
    let dataSize = 0;
    let sampleRate = 0;
    let channels = 0;
    let bitsPerSample = 0;
    
    // Parse chunks
    while (offset < buffer.byteLength - 8) {
      const chunkId = String.fromCharCode(
        view.getUint8(offset), view.getUint8(offset + 1),
        view.getUint8(offset + 2), view.getUint8(offset + 3)
      );
      const chunkSize = view.getUint32(offset + 4, true);
      
      if (chunkId === 'fmt ') {
        // Format chunk
        const audioFormat = view.getUint16(offset + 8, true);
        channels = view.getUint16(offset + 10, true);
        sampleRate = view.getUint32(offset + 12, true);
        bitsPerSample = view.getUint16(offset + 22, true);
        
        if (audioFormat !== 1) {
          throw new Error('Unsupported WAV format: only PCM is supported');
        }
        
        if (bitsPerSample !== 16) {
          throw new Error('Unsupported bit depth: only 16-bit is supported');
        }
      } else if (chunkId === 'data') {
        // Data chunk
        dataOffset = offset + 8;
        dataSize = chunkSize;
        break;
      }
      
      offset += 8 + chunkSize;
      // Align to even byte boundary
      if (chunkSize % 2 === 1) {
        offset++;
      }
    }
    
    if (dataOffset === -1) {
      throw new Error('Invalid WAV file: no data chunk found');
    }
    
    return {
      sampleRate,
      channels,
      bitsPerSample,
      dataOffset,
      dataSize,
      totalSamples: dataSize / (bitsPerSample / 8),
      samplesPerChannel: dataSize / (bitsPerSample / 8) / channels
    };
  }

  /**
   * Extract mono audio data from WAV buffer
   */
  static extractMonoAudio(buffer: ArrayBuffer, wavInfo: WAVInfo): Int16Array {
    const audioBuffer = buffer.slice(wavInfo.dataOffset, wavInfo.dataOffset + wavInfo.dataSize);
    const rawAudioData = new Int16Array(audioBuffer);
    
    // If stereo, extract only the first channel
    if (wavInfo.channels > 1) {
      const samplesPerChannel = Math.floor(rawAudioData.length / wavInfo.channels);
      const monoAudioData = new Int16Array(samplesPerChannel);
      for (let i = 0; i < samplesPerChannel; i++) {
        monoAudioData[i] = rawAudioData[i * wavInfo.channels]; // Take first channel
      }
      return monoAudioData;
    }
    
    return rawAudioData;
  }

  /**
   * Merge multiple audio segments into a single continuous audio buffer
   */
  static mergeAudioSegments(segments: AudioSegment[]): Int16Array {
    if (segments.length === 0) {
      return new Int16Array(0);
    }

    // Calculate total length
    const totalLength = segments.reduce((sum, segment) => sum + segment.data.length, 0);
    const mergedData = new Int16Array(totalLength);
    
    let offset = 0;
    for (const segment of segments) {
      mergedData.set(segment.data, offset);
      offset += segment.data.length;
    }
    
    return mergedData;
  }

  /**
   * Create WAV file buffer from audio data
   */
  static createWAVBuffer(audioData: Int16Array, sampleRate: number = 16000, channels: number = 1): ArrayBuffer {
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const dataSize = audioData.length * bytesPerSample;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;
    
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    
    // RIFF header
    view.setUint8(0, 0x52); // R
    view.setUint8(1, 0x49); // I
    view.setUint8(2, 0x46); // F
    view.setUint8(3, 0x46); // F
    view.setUint32(4, totalSize - 8, true); // File size - 8
    view.setUint8(8, 0x57);  // W
    view.setUint8(9, 0x41);  // A
    view.setUint8(10, 0x56); // V
    view.setUint8(11, 0x45); // E
    
    // fmt chunk
    view.setUint8(12, 0x66); // f
    view.setUint8(13, 0x6D); // m
    view.setUint8(14, 0x74); // t
    view.setUint8(15, 0x20); // (space)
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, channels, true); // channels
    view.setUint32(24, sampleRate, true); // sample rate
    view.setUint32(28, sampleRate * channels * bytesPerSample, true); // byte rate
    view.setUint16(32, channels * bytesPerSample, true); // block align
    view.setUint16(34, bitsPerSample, true); // bits per sample
    
    // data chunk
    view.setUint8(36, 0x64); // d
    view.setUint8(37, 0x61); // a
    view.setUint8(38, 0x74); // t
    view.setUint8(39, 0x61); // a
    view.setUint32(40, dataSize, true); // data size
    
    // Audio data
    const audioView = new Int16Array(buffer, headerSize);
    audioView.set(audioData);
    
    return buffer;
  }


  /**
   * Calculate audio duration in seconds
   */
  static calculateDuration(audioData: Int16Array, sampleRate: number): number {
    return audioData.length / sampleRate;
  }

  /**
   * Filter speech segments based on minimum duration and confidence
   */
  static filterSpeechSegments(
    segments: AudioSegment[], 
    minDurationMs: number = 100,
    minProbability: number = 0.3
  ): AudioSegment[] {
    return segments.filter(segment => {
      const durationMs = (segment.endTime - segment.startTime) * 1000;
      return segment.isSpeech && 
             durationMs >= minDurationMs && 
             segment.probability >= minProbability;
    });
  }
}