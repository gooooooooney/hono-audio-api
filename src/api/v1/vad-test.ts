/**
 * 增强的 VAD API，支持 Swagger 文件上传功能
 */

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { initializeVAD, processAudioFrame, getVADVersion, VAD_CONFIG } from '../../lib/vad/index';

const app = new OpenAPIHono();

// const route = createRoute({
//   method: 'get',
//   path: '/users/{id}',
//   request: {
//     params: z.object({
//       id: z.string(),
//     }),
//   },
//   responses: {
//     200: {
//       content: {
//         'application/json': {
//           schema: z.object({
//             id: z.string(),
//             age: z.number(),
//             name: z.string(),
//           }),
//         },
//       },
//       description: 'Retrieve the user',
//     },
//   },
// })

// app.openapi(route, (c) => {
//   const { id } = c.req.valid('param')
//   return c.json(
//     {
//       id,
//       age: 20,
//       name: 'Ultra-man',
//     },
//     200 // You should specify the status code even if it is 200.
//   )
// })
// 响应数据结构
const VADTestResponseSchema = z.object({
  success: z.boolean().describe('请求是否成功'),
  version: z.string().describe('VAD 版本'),
  filename: z.string().describe('音频文件名'),
  duration: z.number().describe('音频时长（秒）'),
  sampleRate: z.number().describe('采样率'),
  totalFrames: z.number().describe('总音频帧数'),
  speechFrames: z.number().describe('语音帧数'),
  speechPercentage: z.number().describe('语音帧百分比'),
  hasSpeech: z.boolean().describe('是否检测到语音'),
  avgProbability: z.number().describe('平均语音概率'),
  processingTime: z.number().describe('处理时间（毫秒）'),
}).openapi('VADTestResponse');

const ErrorResponseSchema = z.object({
  success: z.boolean().default(false).describe('请求是否成功'),
  error: z.string().describe('错误信息'),
  details: z.string().optional().describe('详细错误描述'),
}).openapi('ErrorResponse');

// Helper functions
function parseWAVHeader(buffer: ArrayBuffer) {
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

async function processAudioWithVAD(audioData: Int16Array, sampleRate: number, filename: string) {
  const startTime = Date.now();

  // Ensure VAD is initialized
  await initializeVAD();

  const HOP_SIZE = VAD_CONFIG.HOP_SIZE;
  const frameCount = Math.floor(audioData.length / HOP_SIZE);

  let speechFrames = 0;
  let totalProbability = 0;

  console.log(`Processing ${frameCount} frames for ${filename}`);

  // Process each frame
  for (let i = 0; i < frameCount; i++) {
    const frameStart = i * HOP_SIZE;
    const frameEnd = frameStart + HOP_SIZE;
    const frameData = audioData.slice(frameStart, frameEnd);

    try {
      const result = processAudioFrame(frameData);
      totalProbability += result.probability;

      if (result.isSpeech) {
        speechFrames++;
      }
    } catch (error) {
      console.warn(`Frame ${i} processing failed:`, error);
    }
  }

  const processingTime = Date.now() - startTime;
  const speechPercentage = frameCount > 0 ? (speechFrames / frameCount) * 100 : 0;
  const avgProbability = frameCount > 0 ? totalProbability / frameCount : 0;
  const duration = audioData.length / sampleRate;

  return {
    duration,
    sampleRate,
    totalFrames: frameCount,
    speechFrames,
    speechPercentage,
    hasSpeech: speechFrames > 0,
    avgProbability,
    processingTime,
  };
}

// 增强的 VAD 测试路由，支持 OpenAPI 3.0 文件上传
const vadTestRoute = createRoute({
  method: 'post',
  path: '/test',
  tags: ['VAD 语音活动检测'],
  summary: '测试音频文件的语音活动',
  description: `
  上传 WAV 音频文件进行语音活动检测测试。
  
  **要求：**
  - 文件格式：WAV (RIFF/WAVE)
  - 音频格式：16-bit PCM
  - 推荐采样率：16kHz（支持其他采样率但可能影响准确性）
  - 声道：优先使用单声道（立体声将仅使用第一声道）
  
  **返回信息：**
  - 是否检测到语音
  - 语音百分比和概率
  - 处理统计信息
  `,
  requestBody: {
    content: {
      'multipart/form-data': {
        schema: {
          type: 'object',
          properties: {
            audio: {
              type: 'string',
              format: 'binary',
              description: 'WAV 音频文件 (16-bit PCM，优先 16kHz 单声道)'
            }
          },
          required: ['audio']
        }
      }
    },
    required: true
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: VADTestResponseSchema,
        },
      },
      description: 'VAD 测试结果',
    },
    400: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: '错误请求 - 无效文件或格式',
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



app.openapi(vadTestRoute, (async (c) => {
  try {
    const body = await c.req.parseBody();
    const audioFile = body.audio as File;

    if (!audioFile) {
      return c.json({
        success: false,
        error: 'No audio file provided',
        details: 'Please upload a WAV audio file'
      }, 400);
    }

    if (!audioFile.name.toLowerCase().endsWith('.wav')) {
      return c.json({
        success: false,
        error: 'Invalid file format',
        details: 'Only WAV files are supported'
      }, 400);
    }

    console.log(`Processing audio file: ${audioFile.name}, size: ${audioFile.size} bytes`);

    // Read file buffer
    const arrayBuffer = await audioFile.arrayBuffer();

    // Parse WAV header
    const wavInfo = parseWAVHeader(arrayBuffer);
    console.log(`WAV Info:`, wavInfo);

    // Validate format requirements
    if (wavInfo.sampleRate !== 16000) {
      console.warn(`Sample rate is ${wavInfo.sampleRate}Hz, VAD is optimized for 16000Hz`);
    }

    if (wavInfo.channels !== 1) {
      console.warn(`${wavInfo.channels} channels detected, will use first channel only`);
    }

    // Extract audio data
    const audioBuffer = arrayBuffer.slice(wavInfo.dataOffset, wavInfo.dataOffset + wavInfo.dataSize);
    const rawAudioData = new Int16Array(audioBuffer);

    // If stereo, extract only the first channel
    let monoAudioData: Int16Array;
    if (wavInfo.channels > 1) {
      const samplesPerChannel = Math.floor(rawAudioData.length / wavInfo.channels);
      monoAudioData = new Int16Array(samplesPerChannel);
      for (let i = 0; i < samplesPerChannel; i++) {
        monoAudioData[i] = rawAudioData[i * wavInfo.channels]; // Take first channel
      }
    } else {
      monoAudioData = rawAudioData;
    }

    // Process with VAD
    const vadResults = await processAudioWithVAD(monoAudioData, wavInfo.sampleRate, audioFile.name);

    const response = {
      success: true,
      version: getVADVersion(),
      filename: audioFile.name,
      ...vadResults,
    };

    console.log(`VAD Results for ${audioFile.name}:`, {
      hasSpeech: response.hasSpeech,
      speechPercentage: response.speechPercentage.toFixed(2) + '%',
      avgProbability: response.avgProbability.toFixed(4),
      processingTime: response.processingTime + 'ms'
    });

    return c.json(response, 200);

  } catch (error) {
    console.error('VAD test error:', error);
    return c.json({
      success: false,
      error: 'Processing failed',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
}));

// 状态路由数据结构
const StatusResponseSchema = z.object({
  status: z.string().describe('服务状态'),
  version: z.string().describe('VAD 版本'),
  hopSize: z.number().describe('帧跳跃大小'),
  threshold: z.number().describe('检测阈值'),
  sampleRate: z.number().describe('采样率'),
}).openapi('StatusResponse');

// 状态路由
const statusRoute = createRoute({
  method: 'get',
  path: '/status',
  tags: ['VAD 语音活动检测'],
  summary: '获取 VAD 服务状态',
  description: '检查 VAD 服务是否运行并获取版本信息',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: StatusResponseSchema,
        },
      },
      description: 'VAD 服务状态',
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: '服务初始化错误',
    },
  },
});

app.openapi(statusRoute, (async (c) => {
  try {
    await initializeVAD();

    return c.json({
      status: 'ready',
      version: getVADVersion(),
      hopSize: VAD_CONFIG.HOP_SIZE,
      threshold: VAD_CONFIG.VOICE_THRESHOLD,
      sampleRate: VAD_CONFIG.SAMPLE_RATE,
    }, 200);
  } catch (error) {
    return c.json({
      success: false,
      error: 'Failed to initialize VAD service',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
}));

export default app;