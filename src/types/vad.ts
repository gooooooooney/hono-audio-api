import { z } from 'zod';

// Request schemas
export const DetectVoiceActivitySchema = z.object({
  audioData: z.array(z.number()).min(1).describe('Audio samples as array of numbers (-1.0 to 1.0 for float, -32768 to 32767 for int16)'),
  sampleRate: z.number().int().positive().default(16000).describe('Sample rate in Hz'),
  format: z.enum(['float32', 'int16']).default('float32').describe('Audio data format')
});

export const ProcessSegmentsSchema = z.object({
  segments: z.array(z.array(z.number())).min(1).describe('Array of audio segments'),
  sampleRate: z.number().int().positive().default(16000).describe('Sample rate in Hz'),
  format: z.enum(['float32', 'int16']).default('float32').describe('Audio data format'),
  resetBetweenSegments: z.boolean().default(false).describe('Reset VAD state between segments')
});

export const AnalyzeFileSchema = z.object({
  audioData: z.array(z.number()).min(1).describe('Complete audio file data'),
  sampleRate: z.number().int().positive().default(16000).describe('Sample rate in Hz'),
  format: z.enum(['float32', 'int16']).default('float32').describe('Audio data format'),
  windowDuration: z.number().positive().default(0.5).describe('Analysis window duration in seconds'),
  overlap: z.number().min(0).default(0.1).describe('Window overlap in seconds')
});

// Response schemas
export const VADFrameResultSchema = z.object({
  probability: z.number().min(0).max(1),
  isSpeech: z.boolean()
});

export const SpeechSegmentSchema = z.object({
  start: z.number().describe('Start time in seconds'),
  end: z.number().describe('End time in seconds'),
  duration: z.number().describe('Duration in seconds')
});

export const VADDetectionResponseSchema = z.object({
  isSpeaking: z.boolean(),
  probability: z.number(),
  processingTimeMs: z.number(),
  metadata: z.object({
    sampleRate: z.number(),
    audioLength: z.number(),
    durationSeconds: z.number(),
    threshold: z.number(),
    hopSize: z.number()
  })
});

export const VADSegmentResultSchema = z.object({
  segmentIndex: z.number(),
  isSpeaking: z.boolean().nullable(),
  probability: z.number().nullable(),
  error: z.string().optional(),
  durationSeconds: z.number()
});

export const VADSegmentsResponseSchema = z.object({
  segments: z.array(VADSegmentResultSchema),
  summary: z.object({
    totalSegments: z.number(),
    speechSegments: z.number(),
    silenceSegments: z.number(),
    errorSegments: z.number(),
    speechRatio: z.number()
  }),
  processingTimeMs: z.number(),
  metadata: z.object({
    sampleRate: z.number(),
    resetBetweenSegments: z.boolean(),
    vadThreshold: z.number()
  })
});

export const VADAnalysisResponseSchema = z.object({
  speechSegments: z.array(SpeechSegmentSchema),
  statistics: z.object({
    totalDuration: z.number(),
    totalSpeechDuration: z.number(),
    totalSilenceDuration: z.number(),
    speechRatio: z.number(),
    segmentCount: z.number(),
    averageSegmentDuration: z.number()
  }),
  processingTimeMs: z.number(),
  metadata: z.object({
    sampleRate: z.number(),
    windowDuration: z.number(),
    overlap: z.number(),
    totalWindows: z.number()
  })
});

export const VADStatusResponseSchema = z.object({
  status: z.literal('operational'),
  currentState: z.object({
    isSpeaking: z.boolean(),
    vadType: z.string()
  }),
  configuration: z.object({
    threshold: z.number(),
    hopSize: z.number(),
    sampleRate: z.number()
  }),
  capabilities: z.object({
    supportedSampleRates: z.array(z.number()),
    minAudioLength: z.number(),
    version: z.string()
  })
});

export const ResetResponseSchema = z.object({
  status: z.literal('success'),
  message: z.string(),
  timestamp: z.number()
});

// Type exports
export type DetectVoiceActivity = z.infer<typeof DetectVoiceActivitySchema>;
export type ProcessSegments = z.infer<typeof ProcessSegmentsSchema>;
export type AnalyzeFile = z.infer<typeof AnalyzeFileSchema>;
export type VADDetectionResponse = z.infer<typeof VADDetectionResponseSchema>;
export type VADSegmentsResponse = z.infer<typeof VADSegmentsResponseSchema>;
export type VADAnalysisResponse = z.infer<typeof VADAnalysisResponseSchema>;
export type VADStatusResponse = z.infer<typeof VADStatusResponseSchema>;
export type ResetResponse = z.infer<typeof ResetResponseSchema>;