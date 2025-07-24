/**
 * VAD + Whisper 语音转文字 API
 * 处理 base64 音频数据，使用 VAD 去除静音，然后通过 OpenAI Whisper 进行转录
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { VADService } from '../../services/vad-service';
import { WhisperService } from '../../services/whisper-service';
import { AudioService } from '../../lib/audio/audio-service';

const app = new OpenAPIHono();
// 请求/响应 数据结构
const SpeechToTextRequestSchema = z.object({
  audio: z.string().describe('Base64 编码的 WAV 音频数据'),
  language: z.string().optional().describe('目标语言（ISO 639-1 代码，例如："en", "zh"）'),
  prompt: z.string().optional().describe('可选的文本提示，用于指导转录过程'),
  minDurationMs: z.number().optional().default(200).describe('最小语音段持续时间（毫秒）'),
  minProbability: z.number().optional().default(0.4).describe('VAD 最小置信度阈值（0.0-1.0）'),
  includeSegments: z.boolean().optional().default(false).describe('是否在响应中包含详细的分段信息')
}).openapi('SpeechToTextRequest');

const VADStatsSchema = z.object({
  totalFrames: z.number().describe('总音频帧数'),
  speechFrames: z.number().describe('语音帧数'),
  speechPercentage: z.number().describe('语音百分比'),
  segmentsFound: z.number().describe('发现的音频段数'),
  segmentsKept: z.number().describe('保留的音频段数'),
  processingTimeMs: z.number().describe('VAD 处理时间（毫秒）')
}).openapi('VADStats');

const AudioStatsSchema = z.object({
  originalDurationMs: z.number().describe('原始音频时长（毫秒）'),
  processedDurationMs: z.number().describe('处理后音频时长（毫秒）'),
  compressionRatio: z.number().describe('处理后与原始时长的比率（0.0-1.0）'),
  originalSizeBytes: z.number().describe('原始音频大小（字节）'),
  processedSizeBytes: z.number().describe('处理后音频大小（字节）')
}).openapi('AudioStats');

const TranscriptionSegmentSchema = z.object({
  id: z.number().describe('段落 ID'),
  start: z.number().describe('开始时间（秒）'),
  end: z.number().describe('结束时间（秒）'),
  text: z.string().describe('转录文本'),
  temperature: z.number().describe('生成温度值'),
  avg_logprob: z.number().describe('平均对数概率'),
  compression_ratio: z.number().describe('压缩比率'),
  no_speech_prob: z.number().describe('无语音概率')
}).openapi('TranscriptionSegment');

const SpeechToTextResponseSchema = z.object({
  success: z.boolean().describe('请求是否成功'),
  text: z.string().describe('从语音段转录的文本'),
  language: z.string().optional().describe('检测到的语言'),
  confidence: z.number().optional().describe('整体转录置信度'),
  vadStats: VADStatsSchema.describe('VAD 统计信息'),
  audioStats: AudioStatsSchema.describe('音频统计信息'),
  processingTimeMs: z.number().describe('总处理时间（毫秒）'),
  segments: z.array(TranscriptionSegmentSchema).optional().describe('详细的转录分段（如果请求）')
}).openapi('SpeechToTextResponse');

const ErrorResponseSchema = z.object({
  success: z.boolean().default(false).describe('请求是否成功'),
  error: z.string().describe('错误信息'),
  details: z.string().optional().describe('详细错误描述'),
  code: z.string().optional().describe('错误代码')
}).openapi('STTErrorResponse');

const ServiceStatusSchema = z.object({
  vad: z.object({
    available: z.boolean().describe('VAD 服务是否可用'),
    version: z.string().describe('VAD 版本'),
    config: z.object({
      hopSize: z.number().describe('帧跳跃大小'),
      sampleRate: z.number().describe('采样率'),
      threshold: z.number().describe('检测阈值')
    }).describe('VAD 配置')
  }).describe('VAD 服务状态'),
  whisper: z.object({
    configured: z.boolean().describe('Whisper 是否已配置'),
    accessible: z.boolean().describe('Whisper 是否可访问'),
    model: z.string().describe('使用的模型'),
    error: z.string().optional().describe('错误信息')
  }).describe('Whisper 服务状态')
}).openapi('ServiceStatus');

// 主要的语音转文字路由
const speechToTextRoute = createRoute({
  method: 'post',
  path: '/transcribe',
  tags: ['语音转文字'],
  summary: '使用 VAD 预处理进行音频转录',
  description: `
  通过语音活动检测 (VAD) 处理 base64 编码的 WAV 音频以去除静音，
  然后使用 OpenAI Whisper 对过滤后的语音进行转录。
  
  **处理流程：**
  1. 解码 base64 音频数据
  2. 应用 VAD 检测语音段
  3. 过滤和合并语音段
  4. 使用 Whisper 转录处理后的音频
  5. 返回文本和处理统计信息
  
  **要求：**
  - 音频格式：WAV（推荐 16-bit PCM）
  - 采样率：任意（推荐 16kHz 以获得最佳 VAD 性能）
  - 必须配置 OpenAI API 密钥
  
  **优势：**
  - 降低转录成本（音频更短）
  - 提高准确性（无静音/噪音）
  - 加快处理速度（处理音频更少）
  `,
  request: {
    body: {
      content: {
        'application/json': {
          schema: SpeechToTextRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: SpeechToTextResponseSchema,
        },
      },
      description: '转录成功完成',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: '错误请求 - 无效的音频数据或参数',
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: '未授权 - OpenAI API 密钥未配置或无效',
    },
    429: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: '请求过多 - OpenAI API 配额超限',
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: '服务器内部错误',
    },
  },
});

app.openapi(speechToTextRoute, (async (c) => {
  const startTime = Date.now();

  try {
    const requestData = c.req.valid('json');
    const {
      audio,
      language,
      prompt,
      minDurationMs = 200,
      minProbability = 0.4,
      includeSegments = false
    } = requestData;

    console.log('Starting speech-to-text processing with VAD filtering');

    // Step 1: VAD Processing
    console.log('Step 1: Processing audio with VAD...');
    const vadStartTime = Date.now();

    const vadResult = await VADService.extractSpeechSegments(
      audio,
      minDurationMs,
      minProbability
    );

    const vadProcessingTime = Date.now() - vadStartTime;

    if (!vadResult.speechFound) {
      return c.json({
        success: false,
        error: 'No speech detected',
        details: 'VAD analysis found no valid speech segments in the audio',
        code: 'NO_SPEECH_DETECTED'
      }, 400);
    }

    // Calculate audio statistics
    const originalDurationMs = AudioService.calculateDuration(
      AudioService.extractMonoAudio(
        vadResult.originalBuffer,
        AudioService.parseWAVHeader(vadResult.originalBuffer)
      ),
      AudioService.parseWAVHeader(vadResult.originalBuffer).sampleRate
    ) * 1000;

    const processedDurationMs = AudioService.calculateDuration(
      AudioService.extractMonoAudio(
        vadResult.processedBuffer,
        AudioService.parseWAVHeader(vadResult.processedBuffer)
      ),
      AudioService.parseWAVHeader(vadResult.processedBuffer).sampleRate
    ) * 1000;

    const audioStats = {
      originalDurationMs,
      processedDurationMs,
      compressionRatio: processedDurationMs / originalDurationMs,
      originalSizeBytes: vadResult.originalBuffer.byteLength,
      processedSizeBytes: vadResult.processedBuffer.byteLength
    };

    console.log(`VAD processing complete: ${audioStats.compressionRatio.toFixed(1)}x compression`);

    // Step 2: Whisper Transcription
    console.log('Step 2: Transcribing with OpenAI Whisper...');
    const whisperStartTime = Date.now();

    const transcriptionResult = await WhisperService.transcribeAudio(
      vadResult.processedBuffer,
      {
        language,
        prompt,
        response_format: includeSegments ? 'verbose_json' : 'json',
        temperature: 0
      }
    );

    const whisperProcessingTime = Date.now() - whisperStartTime;
    const totalProcessingTime = Date.now() - startTime;

    console.log(`Transcription complete: "${transcriptionResult.text.substring(0, 100)}..."`);

    // Prepare response
    const response = {
      success: true,
      text: transcriptionResult.text,
      language: transcriptionResult.language,
      confidence: transcriptionResult.segments?.length ?
        transcriptionResult.segments.reduce((avg, seg) => avg + (1 - seg.no_speech_prob), 0) / transcriptionResult.segments.length :
        undefined,
      vadStats: {
        totalFrames: vadResult.vadResult.totalFrames,
        speechFrames: vadResult.vadResult.speechFrames,
        speechPercentage: vadResult.vadResult.speechPercentage,
        segmentsFound: vadResult.vadResult.segments.length,
        segmentsKept: vadResult.vadResult.segments.filter(s => s.isSpeech).length,
        processingTimeMs: vadProcessingTime
      },
      audioStats,
      processingTimeMs: totalProcessingTime,
      ...(includeSegments && transcriptionResult.segments && {
        segments: transcriptionResult.segments
      })
    };

    console.log(`Total processing time: ${totalProcessingTime}ms (VAD: ${vadProcessingTime}ms, Whisper: ${whisperProcessingTime}ms)`);

    return c.json(response, 200);

  } catch (error) {
    console.error('Speech-to-text processing error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    let statusCode: 500 | 400 | 401 | 429 | 503 = 500;
    let errorCode = 'PROCESSING_ERROR';

    // Handle specific error types
    if (errorMessage.includes('Invalid audio format') || errorMessage.includes('Invalid WAV file')) {
      statusCode = 400;
      errorCode = 'INVALID_AUDIO_FORMAT';
    } else if (errorMessage.includes('OPENAI_API_KEY')) {
      statusCode = 401;
      errorCode = 'API_KEY_MISSING';
    } else if (errorMessage.includes('quota exceeded') || errorMessage.includes('rate limit')) {
      statusCode = 429;
      errorCode = 'QUOTA_EXCEEDED';
    } else if (errorMessage.includes('model_not_found')) {
      statusCode = 503;
      errorCode = 'SERVICE_UNAVAILABLE';
    }

    return c.json({
      success: false,
      error: 'Processing failed',
      details: errorMessage,
      code: errorCode
    }, statusCode as any);
  }
}));

// 服务状态路由
const statusRoute = createRoute({
  method: 'get',
  path: '/status',
  tags: ['语音转文字'],
  summary: '检查语音转文字服务状态',
  description: '检查 VAD 和 Whisper 服务的可用性和配置状态',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: ServiceStatusSchema,
        },
      },
      description: '服务状态信息',
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: '服务检查失败',
    },
  },
});

app.openapi(statusRoute, (async (c) => {
  try {
    // Check VAD service
    const vadInfo = await VADService.getServiceInfo();

    // Check Whisper service
    const whisperStatus = await WhisperService.checkService();
    const whisperInfo = WhisperService.getServiceInfo();

    const status = {
      vad: {
        available: true,
        version: vadInfo.version,
        config: vadInfo.config
      },
      whisper: {
        configured: whisperStatus.configured,
        accessible: whisperStatus.accessible,
        model: whisperInfo.model,
        ...(whisperStatus.error && { error: whisperStatus.error })
      }
    };

    return c.json(status, 200);

  } catch (error) {
    console.error('Service status check error:', error);
    return c.json({
      success: false,
      error: 'Service status check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
}));

export default app;