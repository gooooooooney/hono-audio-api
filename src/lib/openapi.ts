import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import vadApi from '../api/v1/vad-test';
import speechToTextApi from '../api/v1/speech-to-text';

export function createOpenAPIApp() {
  const app = new OpenAPIHono();

  // API documentation
  app.doc('/doc', {
    openapi: '3.0.0',
    info: {
      version: '1.0.0',
      title: 'VAD & 语音转文字 API 服务',
      description: `
      语音活动检测和语音转文字 API 服务。
      
      **功能特性：**
      - 使用 TEN-VAD WebAssembly 进行 VAD 测试和分析
      - 使用 OpenAI Whisper 进行智能语音转文字
      - 自动去除静音以优化成本
      - 支持 Base64 音频处理
      
      **服务端点：**
      - \`/api/v1/vad/*\` - 语音活动检测端点
      - \`/api/v1/stt/*\` - 带 VAD 预处理的语音转文字端点
      `,
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3002',
        description: '开发服务器',
      },
    ],
    tags: [
      {
        name: 'VAD 语音活动检测',
        description: '语音活动检测操作'
      },
      {
        name: '语音转文字',
        description: '带 VAD 预处理的语音转文字服务'
      }
    ]
  });

  // Swagger UI
  app.get('/ui', swaggerUI({ url: '/doc' }));

  // Mount API routes
  app.route('/api/v1/vad', vadApi);
  app.route('/api/v1/stt', speechToTextApi);

  return app;
}