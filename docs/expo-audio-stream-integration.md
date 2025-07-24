# Expo Audio Stream/Studio 与 Speech-to-Text API 集成方案

## 概述

本文档描述了如何将 Expo React Native 应用中的音频处理库（`expo-audio-stream` 或 `@siteed/expo-audio-studio`）与后端 VAD + Speech-to-Text API 集成，实现实时语音转文字功能。

## 库选择对比

### 1. expo-audio-stream
- 开源的简单音频流库
- 功能相对基础
- 适合简单的录音和流式传输需求

### 2. @siteed/expo-audio-studio（推荐）
- 功能更全面的音频处理库
- 支持双流录音（同时录制 PCM 和压缩格式）
- 内置音频分析功能
- 零延迟录音（通过 prepareRecording）
- 更好的跨平台支持

## 最佳方案：使用 Expo Audio Studio 进行分段录音 + 批量处理

基于 `@siteed/expo-audio-studio` 的强大功能和我们的 API 设计，推荐以下集成方案：

### 1. 安装和配置

```bash
# 使用 expo-audio-studio
npm install @siteed/expo-audio-studio
# 或
yarn add @siteed/expo-audio-studio
```

在 `app.json` 中配置：

```json
{
  "expo": {
    "plugins": [
      ["@siteed/expo-audio-studio", {
        "enableBackgroundAudio": true,
        "enableNotifications": true,
        "enableDeviceDetection": true,
        "microphoneUsageDescription": "用于录制语音并转换为文字"
      }]
    ]
  }
}
```

### 2. 录音配置

```typescript
import { 
  useAudioRecorder, 
  useSharedAudioRecorder,
  RecordingConfig,
  AudioDataEvent
} from '@siteed/expo-audio-studio';

// 推荐配置
const RECORDING_CONFIG: RecordingConfig = {
  sampleRate: 16000,     // 16kHz - VAD 最佳性能
  channels: 1,           // 单声道
  encoding: 'pcm_16bit', // 16位 PCM
  interval: 1000,        // 每秒发送一次数据流
  bufferDurationSeconds: 0.1, // 100ms 缓冲区
  
  // 启用处理功能
  enableProcessing: true,
  features: {
    energy: true,
    rms: true,
    zcr: true
  },
  
  // 输出配置 - 流式传输时关闭文件保存
  output: {
    primary: { enabled: false },  // 不保存WAV文件
    compressed: { enabled: false } // 不保存压缩文件
  }
};
```

### 3. 前端实现策略

#### 3.1 使用 Expo Audio Studio 的高级录音功能

```typescript
import { 
  useAudioRecorder,
  AudioDataEvent,
  AudioRecording,
  ExpoAudioStreamModule
} from '@siteed/expo-audio-studio';

class AdvancedAudioRecorder {
  private audioChunks: ArrayBuffer[] = [];
  private recorder: ReturnType<typeof useAudioRecorder>;
  private processInterval: NodeJS.Timeout | null = null;
  private lastProcessTime: number = 0;

  constructor() {
    this.recorder = useAudioRecorder();
  }

  async startRecording() {
    // 请求权限
    const { status } = await ExpoAudioStreamModule.requestPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('麦克风权限未授予');
    }

    // 使用零延迟准备
    await this.recorder.prepareRecording(RECORDING_CONFIG);

    // 开始录音
    await this.recorder.startRecording({
      ...RECORDING_CONFIG,
      onAudioStream: async (event: AudioDataEvent) => {
        // 处理音频流数据
        await this.handleAudioStream(event);
      },
      onAudioAnalysis: async (analysis) => {
        // 利用音频分析数据进行智能分段
        if (analysis.energy < 0.01) {
          // 检测到静音，可以触发处理
          this.processIfNeeded();
        }
      }
    });

    // 定期处理音频（作为兜底）
    this.processInterval = setInterval(() => {
      this.processAccumulatedAudio();
    }, 10000);
  }

  private async handleAudioStream(event: AudioDataEvent) {
    // 将 base64 转换为 ArrayBuffer
    const audioData = this.base64ToArrayBuffer(event.data as string);
    this.audioChunks.push(audioData);

    // 基于时间的智能处理
    const currentTime = Date.now();
    if (currentTime - this.lastProcessTime > 5000 && this.audioChunks.length > 0) {
      this.processAccumulatedAudio();
    }
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private async processAccumulatedAudio() {
    if (this.audioChunks.length === 0) return;

    // 合并音频块为完整的 WAV
    const wavBuffer = this.createWAVFromChunks(this.audioChunks);
    const wavBase64 = btoa(String.fromCharCode(...new Uint8Array(wavBuffer)));
    
    // 发送到后端
    await this.sendToBackend(wavBase64);
    
    // 清空已处理的块
    this.audioChunks = [];
    this.lastProcessTime = Date.now();
  }

  private createWAVFromChunks(chunks: ArrayBuffer[]): ArrayBuffer {
    // 计算总长度
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    
    // 创建 WAV 文件
    const wavBuffer = new ArrayBuffer(44 + totalLength);
    const view = new DataView(wavBuffer);
    
    // WAV 文件头
    const setString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };
    
    setString(0, 'RIFF');
    view.setUint32(4, 36 + totalLength, true);
    setString(8, 'WAVE');
    setString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, 16000, true); // Sample rate
    view.setUint32(28, 16000 * 2, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample
    setString(36, 'data');
    view.setUint32(40, totalLength, true);
    
    // 合并 PCM 数据
    let offset = 44;
    chunks.forEach(chunk => {
      new Uint8Array(wavBuffer).set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    });
    
    return wavBuffer;
  }

  async sendToBackend(wavBase64: string) {
    try {
      const response = await fetch('http://your-backend/api/v1/stt/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audio: wavBase64,
          language: 'zh',
          minDurationMs: 200,
          minProbability: 0.4
        })
      });

      const result = await response.json();
      
      if (result.success) {
        // 处理转录结果
        console.log('转录文本:', result.text);
        // 可以触发事件或更新状态
      }
    } catch (error) {
      console.error('发送音频失败:', error);
    }
  }

  async stopRecording(): Promise<AudioRecording | null> {
    // 停止定时处理
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
    
    // 处理剩余的音频
    await this.processAccumulatedAudio();
    
    // 停止录音
    return await this.recorder.stopRecording();
  }

  private processIfNeeded() {
    const currentTime = Date.now();
    if (currentTime - this.lastProcessTime > 1500 && this.audioChunks.length > 0) {
      this.processAccumulatedAudio();
    }
  }
}
```

### 4. 优化策略

#### 4.1 使用音频分析进行智能分段

利用 Expo Audio Studio 的内置音频分析功能：

```typescript
interface SmartSegmentConfig {
  silenceThreshold: number;
  minSpeechDuration: number;
  maxSilenceDuration: number;
}

class SmartSegmentRecorder extends AdvancedAudioRecorder {
  private config: SmartSegmentConfig = {
    silenceThreshold: 0.01,
    minSpeechDuration: 500, // 最小语音持续时间
    maxSilenceDuration: 1500 // 最大静音持续时间
  };
  
  private silenceStartTime: number = 0;
  private speechStartTime: number = 0;
  private isSpeaking: boolean = false;

  async startSmartRecording() {
    await this.recorder.startRecording({
      ...RECORDING_CONFIG,
      enableProcessing: true,
      intervalAnalysis: 100, // 每100ms分析一次
      features: {
        energy: true,
        rms: true,
        zcr: true,
        spectralCentroid: true
      },
      onAudioAnalysis: async (analysis) => {
        await this.handleAudioAnalysis(analysis);
      },
      onAudioStream: async (event) => {
        await this.handleAudioStream(event);
      }
    });
  }

  private async handleAudioAnalysis(analysis: any) {
    const energy = analysis.features?.energy || 0;
    const currentTime = Date.now();

    if (energy > this.config.silenceThreshold) {
      // 检测到语音
      if (!this.isSpeaking) {
        this.isSpeaking = true;
        this.speechStartTime = currentTime;
      }
      this.silenceStartTime = 0;
    } else {
      // 检测到静音
      if (this.isSpeaking) {
        if (this.silenceStartTime === 0) {
          this.silenceStartTime = currentTime;
        } else if (currentTime - this.silenceStartTime > this.config.maxSilenceDuration) {
          // 静音超过阈值，结束当前语音段
          const speechDuration = currentTime - this.speechStartTime;
          if (speechDuration > this.config.minSpeechDuration) {
            // 语音段足够长，进行处理
            await this.processAccumulatedAudio();
          }
          this.isSpeaking = false;
        }
      }
    }
  }
}
```

#### 4.2 实时流式处理模式

使用 WebSocket 或 Server-Sent Events 实现真正的实时处理：

```typescript
class RealtimeStreamRecorder {
  private websocket: WebSocket | null = null;
  private recorder: ReturnType<typeof useAudioRecorder>;

  constructor() {
    this.recorder = useAudioRecorder();
  }

  async connectWebSocket() {
    this.websocket = new WebSocket('wss://your-backend/api/v1/stt/stream');
    
    this.websocket.onopen = () => {
      console.log('WebSocket 连接已建立');
    };

    this.websocket.onmessage = (event) => {
      const result = JSON.parse(event.data);
      if (result.type === 'transcription') {
        this.handleTranscriptionResult(result);
      }
    };

    this.websocket.onerror = (error) => {
      console.error('WebSocket 错误:', error);
    };
  }

  async startRealtimeStreaming() {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      await this.connectWebSocket();
    }

    await this.recorder.startRecording({
      sampleRate: 16000,
      channels: 1,
      encoding: 'pcm_16bit',
      bufferDurationSeconds: 0.1, // 100ms 低延迟
      interval: 100, // 每100ms发送一次
      output: {
        primary: { enabled: false } // 纯流式，不保存文件
      },
      onAudioStream: async (event: AudioDataEvent) => {
        // 直接发送音频流到 WebSocket
        if (this.websocket?.readyState === WebSocket.OPEN) {
          this.websocket.send(JSON.stringify({
            type: 'audio',
            data: event.data,
            timestamp: Date.now()
          }));
        }
      }
    });
  }

  private handleTranscriptionResult(result: any) {
    // 处理实时转录结果
    console.log('实时转录:', result.text);
    // 更新 UI 或触发其他操作
  }

  async stopStreaming() {
    const recording = await this.recorder.stopRecording();
    
    if (this.websocket) {
      this.websocket.send(JSON.stringify({ type: 'end' }));
      this.websocket.close();
      this.websocket = null;
    }
    
    return recording;
  }
}

```

### 5. React Native 组件示例

#### 5.1 完整的录音组件实现

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView
} from 'react-native';
import {
  AudioRecorderProvider,
  useSharedAudioRecorder,
  ExpoAudioStreamModule
} from '@siteed/expo-audio-studio';

// 录音按钮组件
const RecordButton: React.FC = () => {
  const {
    prepareRecording,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    isRecording,
    isPaused,
    durationMs,
    analysisData
  } = useSharedAudioRecorder();

  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // 组件挂载时准备录音资源
    prepareRecording({
      sampleRate: 16000,
      channels: 1,
      encoding: 'pcm_16bit',
      enableProcessing: true
    });
  }, []);

  const handleStartRecording = async () => {
    try {
      const { status } = await ExpoAudioStreamModule.requestPermissionsAsync();
      if (status !== 'granted') {
        alert('需要麦克风权限才能录音');
        return;
      }

      await startRecording({
        sampleRate: 16000,
        channels: 1,
        encoding: 'pcm_16bit',
        output: { primary: { enabled: false } },
        onAudioStream: async (event) => {
          // 这里可以实时处理音频流
          console.log('音频流数据大小:', event.eventDataSize);
        }
      });
    } catch (error) {
      console.error('开始录音失败:', error);
    }
  };

  const handleStopRecording = async () => {
    setIsProcessing(true);
    try {
      const recording = await stopRecording();
      // 处理录音结果
      if (recording) {
        console.log('录音完成:', {
          duration: recording.durationMs,
          size: recording.size
        });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      {isRecording && (
        <View style={styles.statusContainer}>
          <Text style={styles.duration}>{formatDuration(durationMs)}</Text>
          {analysisData && (
            <View style={styles.levelMeter}>
              <View 
                style={[
                  styles.levelBar,
                  { width: `${Math.min(analysisData.energy * 100, 100)}%` }
                ]}
              />
            </View>
          )}
        </View>
      )}

      <Pressable
        style={({ pressed }) => [
          styles.recordButton,
          isRecording && styles.recordingButton,
          pressed && styles.pressedButton
        ]}
        onPress={isRecording ? handleStopRecording : handleStartRecording}
        disabled={isProcessing}
      >
        {isProcessing ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.buttonText}>
            {isRecording ? '停止' : '录音'}
          </Text>
        )}
      </Pressable>

      {isRecording && !isPaused && (
        <Pressable style={styles.pauseButton} onPress={pauseRecording}>
          <Text style={styles.buttonText}>暂停</Text>
        </Pressable>
      )}

      {isPaused && (
        <Pressable style={styles.pauseButton} onPress={resumeRecording}>
          <Text style={styles.buttonText}>继续</Text>
        </Pressable>
      )}
    </View>
  );
};

// 转录结果显示组件
const TranscriptionDisplay: React.FC<{ text: string }> = ({ text }) => {
  return (
    <ScrollView style={styles.transcriptionContainer}>
      <Text style={styles.transcriptionText}>{text || '转录结果将显示在这里...'}</Text>
    </ScrollView>
  );
};

// 主应用组件
export const VoiceToTextApp: React.FC = () => {
  const [transcriptionText, setTranscriptionText] = useState('');

  return (
    <AudioRecorderProvider>
      <View style={styles.appContainer}>
        <Text style={styles.title}>语音转文字</Text>
        <RecordButton />
        <TranscriptionDisplay text={transcriptionText} />
      </View>
    </AudioRecorderProvider>
  );
};

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
  },
  container: {
    alignItems: 'center',
    marginBottom: 20,
  },
  statusContainer: {
    marginBottom: 20,
    alignItems: 'center',
  },
  duration: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
  },
  levelMeter: {
    width: 200,
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  levelBar: {
    height: '100%',
    backgroundColor: '#4CAF50',
    transition: 'width 0.1s',
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  recordingButton: {
    backgroundColor: '#f44336',
  },
  pressedButton: {
    transform: [{ scale: 0.95 }],
  },
  pauseButton: {
    marginTop: 15,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#FF9800',
    borderRadius: 20,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  transcriptionContainer: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    marginTop: 20,
  },
  transcriptionText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#333',
  },
});

```

### 6. 性能优化建议

#### 6.1 使用 Expo Audio Studio 的压缩功能

```typescript
// 启用内置压缩功能
const COMPRESSED_CONFIG: RecordingConfig = {
  sampleRate: 16000,
  channels: 1,
  encoding: 'pcm_16bit',
  
  // 同时启用压缩流
  output: {
    primary: { enabled: false },
    compressed: {
      enabled: true,
      format: 'opus', // 或 'aac'
      bitrate: 32000  // 32kbps 对语音足够
    }
  },
  
  onAudioStream: async (event) => {
    // 使用压缩后的数据
    if (event.compression?.data) {
      // 发送压缩数据而非原始 PCM
      await sendCompressedAudio(event.compression.data);
    }
  }
};
```

#### 6.2 音频分析优化

```typescript
// 使用音频特征进行智能处理
const ANALYSIS_CONFIG: RecordingConfig = {
  sampleRate: 16000,
  channels: 1,
  enableProcessing: true,
  intervalAnalysis: 200, // 每200ms分析一次
  features: {
    energy: true,
    rms: true,
    zcr: true,
    mfcc: true,
    spectralCentroid: true
  },
  
  onAudioAnalysis: async (analysis) => {
    const features = analysis.features;
    
    // 基于特征进行决策
    if (features.energy < 0.005 && features.zcr < 0.1) {
      // 极低能量和过零率，可能是静音
      // 跳过发送到后端
      return;
    }
    
    if (features.spectralCentroid > 2000) {
      // 高频内容，可能是噪音
      // 可以降低优先级或过滤
    }
  }
};
```

### 7. 平台特定优化

#### 7.1 iOS 优化配置

```json
{
  "expo": {
    "plugins": [
      ["@siteed/expo-audio-studio", {
        "ios": {
          "allowBackgroundAudioControls": true,
          "backgroundProcessingTitle": "正在转录语音"
        },
        "iosBackgroundModes": {
          "useProcessing": true,
          "useVoIP": false,
          "useAudio": false
        }
      }]
    ]
  }
}
```

#### 7.2 Android 优化配置

```typescript
const ANDROID_CONFIG: RecordingConfig = {
  // Android 特定配置
  android: {
    audioSource: 'VOICE_RECOGNITION', // 优化语音识别
    channelConfig: 'CHANNEL_IN_MONO',
    audioFormat: 'ENCODING_PCM_16BIT'
  },
  
  // 音频焦点策略
  audioFocusStrategy: 'communication', // 适合语音通话场景
  
  // 显示通知
  showNotification: true,
  showWaveformInNotification: true,
  notification: {
    title: '正在录制语音',
    text: '点击返回应用',
    color: '#2196F3'
  }
};
```

### 8. 集成服务封装

```typescript
import {
  useAudioRecorder,
  AudioRecorderProvider,
  ExpoAudioStreamModule,
  RecordingConfig,
  AudioDataEvent,
  AudioAnalysisEvent
} from '@siteed/expo-audio-studio';

interface STTServiceConfig {
  apiUrl: string;
  apiKey?: string;
  language?: string;
  realtimeMode?: boolean;
}

export class ExpoSTTService {
  private config: STTServiceConfig;
  private audioBuffer: ArrayBuffer[] = [];
  private processTimer: NodeJS.Timeout | null = null;
  
  constructor(config: STTServiceConfig) {
    this.config = config;
  }

  createRecordingConfig(): RecordingConfig {
    return {
      sampleRate: 16000,
      channels: 1,
      encoding: 'pcm_16bit',
      bufferDurationSeconds: 0.1,
      interval: this.config.realtimeMode ? 100 : 1000,
      enableProcessing: true,
      features: {
        energy: true,
        rms: true,
        zcr: true
      },
      output: {
        primary: { enabled: false },
        compressed: {
          enabled: true,
          format: 'opus',
          bitrate: 32000
        }
      },
      onAudioStream: this.handleAudioStream.bind(this),
      onAudioAnalysis: this.handleAudioAnalysis.bind(this)
    };
  }

  private async handleAudioStream(event: AudioDataEvent) {
    if (this.config.realtimeMode && event.compression?.data) {
      // 实时模式：立即发送
      await this.sendToAPI(event.compression.data);
    } else {
      // 批量模式：缓存数据
      const buffer = this.base64ToArrayBuffer(event.data as string);
      this.audioBuffer.push(buffer);
      
      // 定时处理
      if (!this.processTimer) {
        this.processTimer = setTimeout(() => {
          this.processBatchAudio();
          this.processTimer = null;
        }, 5000);
      }
    }
  }

  private async handleAudioAnalysis(analysis: AudioAnalysisEvent) {
    // 基于分析结果优化处理
    if (analysis.features?.energy < 0.001) {
      // 静音检测
      if (this.audioBuffer.length > 0) {
        await this.processBatchAudio();
      }
    }
  }

  private async processBatchAudio() {
    if (this.audioBuffer.length === 0) return;
    
    const wavBuffer = this.mergeAudioBuffers(this.audioBuffer);
    const base64Audio = this.arrayBufferToBase64(wavBuffer);
    
    await this.sendToAPI(base64Audio);
    this.audioBuffer = [];
  }

  private async sendToAPI(audioData: string | ArrayBuffer) {
    try {
      const response = await fetch(`${this.config.apiUrl}/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` })
        },
        body: JSON.stringify({
          audio: typeof audioData === 'string' ? audioData : this.arrayBufferToBase64(audioData),
          language: this.config.language || 'zh',
          minDurationMs: 200,
          minProbability: 0.4
        })
      });

      const result = await response.json();
      
      if (result.success) {
        return result.text;
      } else {
        throw new Error(result.error || '转录失败');
      }
    } catch (error) {
      console.error('API 调用失败:', error);
      throw error;
    }
  }

  // 工具方法
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  }

  private mergeAudioBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
    // WAV 文件头 + 合并的 PCM 数据
    const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
    const result = new ArrayBuffer(44 + totalLength);
    const view = new DataView(result);
    
    // 写入 WAV 头部...（省略具体实现）
    
    // 合并音频数据
    let offset = 44;
    buffers.forEach(buffer => {
      new Uint8Array(result).set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    });
    
    return result;
  }
}
```

## 总结

### 推荐使用 @siteed/expo-audio-studio 的原因：

1. **功能更全面**：
   - 零延迟录音（prepareRecording）
   - 内置音频分析
   - 双流录音（原始 + 压缩）
   - 更好的错误处理

2. **性能优化**：
   - 支持低延迟配置（bufferDurationSeconds）
   - 内置压缩减少网络传输
   - 智能静音检测

3. **开发体验**：
   - TypeScript 完整支持
   - React Hooks API
   - 跨平台一致性

### 关键配置建议：

- **采样率**：16000 Hz（VAD 最佳性能）
- **编码**：pcm_16bit
- **通道数**：1（单声道）
- **缓冲区**：100ms（实时）或 1s（批量）
- **压缩**：启用 Opus 32kbps

### 集成步骤：

1. 安装 `@siteed/expo-audio-studio`
2. 配置 `app.json` 插件选项
3. 使用 `prepareRecording` 预初始化
4. 通过 `onAudioStream` 处理音频流
5. 发送 base64 WAV 到后端 API

这种方案能够充分利用前端音频处理能力，同时与后端 VAD + Speech-to-Text API 完美配合，实现高效的语音转文字功能。