import { z } from 'zod';

// Request schemas
export const MobileAudioRequestSchema = z.object({
  audioBase64: z.string().describe('Base64 encoded audio data'),
  format: z.string().describe('Audio format: wav, m4a, mp3, webm, flac, etc'),
  sampleRate: z.number().int().positive().default(16000).describe('Sample rate in Hz'),
  
  // VAD parameters
  enableVad: z.boolean().default(true).describe('Enable VAD detection'),
  vadWindowDuration: z.number().positive().default(0.5).describe('VAD window duration in seconds'),
  vadOverlap: z.number().min(0).default(0.1).describe('VAD window overlap in seconds'),
  
  // Processing options
  returnFormat: z.enum(['segments', 'merged', 'base64']).default('segments').describe('Return format'),
  compressOutput: z.boolean().default(false).describe('Compress output audio')
});

export const QuickVadRequestSchema = z.object({
  audioBase64: z.string().describe('Base64 encoded audio data'),
  format: z.string().describe('Audio format'),
  sampleRate: z.number().int().positive().default(16000).describe('Sample rate in Hz')
});

export const EfficientAudioRequestSchema = z.object({
  sampleRate: z.number().int().positive().default(16000).describe('Sample rate in Hz'),
  enableVad: z.boolean().default(true).describe('Enable VAD detection'),
  returnAudio: z.boolean().default(false).describe('Return processed audio'),
  outputFormat: z.enum(['json', 'binary']).default('json').describe('Output format')
});

// Response schemas
export const SpeechSegmentSchema = z.object({
  start: z.number().describe('Start time in seconds'),
  end: z.number().describe('End time in seconds'),
  duration: z.number().describe('Duration in seconds')
});

export const MobileAudioResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  
  // VAD results
  hasSpeech: z.boolean().describe('Whether speech was detected'),
  speechSegments: z.array(SpeechSegmentSchema).describe('List of speech segments'),
  speechRatio: z.number().describe('Ratio of speech to total duration'),
  totalDuration: z.number().describe('Total duration in seconds'),
  
  // Audio data
  audioData: z.array(z.number()).optional().describe('Processed audio data (PCM)'),
  audioBase64: z.string().optional().describe('Base64 encoded audio'),
  audioFormat: z.string().optional().describe('Audio format'),
  
  // Performance metrics
  processingTimeMs: z.number().describe('Processing time in milliseconds'),
  audioSizeBytes: z.number().optional().describe('Audio size in bytes')
});

export const QuickVadResponseSchema = z.object({
  hasSpeech: z.boolean(),
  rms: z.number(),
  duration: z.number(),
  processingTimeMs: z.number(),
  filename: z.string().optional(),
  format: z.string().optional(),
  fileSize: z.number().optional()
});

export const BatchProcessResultSchema = z.object({
  index: z.number(),
  filename: z.string(),
  success: z.boolean(),
  duration: z.number().optional(),
  hasSpeech: z.boolean().optional(),
  speechSegments: z.array(SpeechSegmentSchema).optional(),
  error: z.string().optional()
});

export const BatchProcessResponseSchema = z.object({
  results: z.array(BatchProcessResultSchema),
  totalFiles: z.number(),
  successful: z.number(),
  processingTimeMs: z.number(),
  mergedAudio: z.object({
    audioBase64: z.string(),
    format: z.string(),
    duration: z.number(),
    sizeBytes: z.number()
  }).optional()
});

export const MobileHealthResponseSchema = z.object({
  status: z.literal('healthy'),
  features: z.object({
    audioConversion: z.boolean(),
    vadDetection: z.boolean(),
    batchProcessing: z.boolean(),
    fileUpload: z.boolean(),
    ffmpegAvailable: z.boolean(),
    supportedFormats: z.array(z.string())
  }),
  formatSupport: z.object({
    native: z.array(z.string()),
    extended: z.array(z.string()),
    total: z.number()
  }),
  vadConfig: z.object({
    threshold: z.number(),
    silenceDuration: z.number()
  }),
  endpoints: z.object({
    processAudio: z.string(),
    processAudioFile: z.string(),
    quickVad: z.string(),
    quickVadFile: z.string(),
    batchProcess: z.string()
  }),
  recommendations: z.object({
    installFfmpeg: z.boolean(),
    preferredFormats: z.array(z.string())
  }),
  timestamp: z.number()
});

// Efficient audio response
export const EfficientAudioResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  hasSpeech: z.boolean(),
  speechSegments: z.array(SpeechSegmentSchema),
  speechRatio: z.number(),
  totalDuration: z.number(),
  processingTimeMs: z.number(),
  efficiencyNote: z.string(),
  audioSamples: z.number().optional(),
  audioDuration: z.number().optional()
});

// Type exports
export type MobileAudioRequest = z.infer<typeof MobileAudioRequestSchema>;
export type QuickVadRequest = z.infer<typeof QuickVadRequestSchema>;
export type EfficientAudioRequest = z.infer<typeof EfficientAudioRequestSchema>;
export type MobileAudioResponse = z.infer<typeof MobileAudioResponseSchema>;
export type QuickVadResponse = z.infer<typeof QuickVadResponseSchema>;
export type BatchProcessResponse = z.infer<typeof BatchProcessResponseSchema>;
export type MobileHealthResponse = z.infer<typeof MobileHealthResponseSchema>;
export type EfficientAudioResponse = z.infer<typeof EfficientAudioResponseSchema>;