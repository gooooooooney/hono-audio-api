/**
 * Whisper Service for OpenAI Speech-to-Text transcription
 */

import OpenAI from 'openai';
import { AudioService } from '../lib/audio/audio-service';

export interface TranscriptionOptions {
  language?: string;
  prompt?: string;
  response_format?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
  temperature?: number;
}

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
  segments?: Array<{
    id: number;
    seek: number;
    start: number;
    end: number;
    text: string;
    tokens: number[];
    temperature: number;
    avg_logprob: number;
    compression_ratio: number;
    no_speech_prob: number;
  }>;
}

export class WhisperService {
  private static client: OpenAI | null = null;

  /**
   * Initialize OpenAI client
   */
  private static getClient(): OpenAI {
    if (!this.client) {
      const apiKey = process.env.OPENAI_API_KEY;
      const baseUrl = process.env.OPENAI_BASE_URL;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is required');
      }

      this.client = new OpenAI({
        apiKey: apiKey,
        baseURL: baseUrl,
      });
    }
    return this.client;
  }

  /**
   * Transcribe audio buffer using OpenAI Whisper
   */
  static async transcribeAudio(
    audioBuffer: ArrayBuffer,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    const client = this.getClient();

    try {
      // Create a File object from ArrayBuffer for OpenAI API
      const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' });
      const audioFile = new File([audioBlob], 'audio.wav', { type: 'audio/wav' });

      console.log(`Transcribing audio: ${audioBuffer.byteLength} bytes`);

      // Call OpenAI Whisper API
      const startTime = Date.now();
      // Groq uses different model names for Whisper
      const modelName = process.env.OPENAI_BASE_URL?.includes('groq.com') 
        ? 'whisper-large-v3-turbo' 
        : 'whisper-1';
      
      console.log(`Using model: ${modelName}`);
      console.log(`API Base URL: ${process.env.OPENAI_BASE_URL}`);
      console.log(`API Key prefix: ${process.env.OPENAI_API_KEY?.substring(0, 10)}...`);
      
      const transcription = await client.audio.transcriptions.create({
        file: audioFile,
        model: modelName,
        language: options.language,
        prompt: options.prompt,
        response_format: options.response_format || 'verbose_json',
        temperature: options.temperature ?? 0,
      });
      const processingTime = Date.now() - startTime;

      console.log(`Whisper transcription completed in ${processingTime}ms`);

      // Handle different response formats
      if (typeof transcription === 'string') {
        return {
          text: transcription,
        };
      }

      // For verbose_json format
      const result: TranscriptionResult = {
        text: transcription.text,
        language: (transcription as any).language,
        duration: (transcription as any).duration,
      };

      // Add segments if available (verbose_json format)
      if ('segments' in transcription && (transcription as any).segments) {
        result.segments = (transcription as any).segments;
      }

      return result;

    } catch (error) {
      console.error('Whisper transcription error:', error);

      if (error instanceof Error) {
        // Handle specific OpenAI API errors
        if (error.message.includes('model_not_found')) {
          throw new Error('Whisper model not available. Please check your OpenAI plan.');
        } else if (error.message.includes('insufficient_quota')) {
          throw new Error('OpenAI API quota exceeded. Please check your billing.');
        } else if (error.message.includes('invalid_request_error')) {
          throw new Error('Invalid audio format or request parameters.');
        }
      }

      throw new Error(`Transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Transcribe base64 audio data
   */
  static async transcribeBase64Audio(
    base64Audio: string,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    // Convert base64 to ArrayBuffer
    const audioBuffer = AudioService.base64ToArrayBuffer(base64Audio);

    // Validate it's a WAV file
    try {
      const wavInfo = AudioService.parseWAVHeader(audioBuffer);
      console.log(`Transcribing WAV audio: ${wavInfo.sampleRate}Hz, ${wavInfo.channels}ch, ${(audioBuffer.byteLength / 1024).toFixed(1)}KB`);
    } catch (error) {
      throw new Error(`Invalid audio format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return this.transcribeAudio(audioBuffer, options);
  }

  /**
   * Check if OpenAI API is configured and accessible
   */
  static async checkService(): Promise<{
    configured: boolean;
    accessible: boolean;
    error?: string;
  }> {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return {
          configured: false,
          accessible: false,
          error: 'OPENAI_API_KEY not configured'
        };
      }

      // Try to access the client
      const client = this.getClient();

      // For Groq, skip the models.list() test as it may not be supported
      // Just verify the client can be created with valid config
      if (process.env.OPENAI_BASE_URL?.includes('groq.com')) {
        // For Groq, we'll trust that if the client is created successfully, it's accessible
        console.log('Using Groq API - skipping models.list() test');
      } else {
        // Test with a minimal request (list models is usually lightweight)
        await client.models.list();
      }

      return {
        configured: true,
        accessible: true
      };
    } catch (error) {
      return {
        configured: true,
        accessible: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get service information
   */
  static getServiceInfo() {
    const apiKey = process.env.OPENAI_API_KEY;
    return {
      configured: !!apiKey,
      model: 'whisper-1',
      supportedFormats: ['wav', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'wav', 'webm'],
      maxFileSize: '25MB',
      apiKeyPresent: !!apiKey,
      apiKeyPreview: apiKey ? `${apiKey.substring(0, 8)}...` : null
    };
  }
}