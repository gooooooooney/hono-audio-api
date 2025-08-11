# Expo Audio Stream 音频录制与上传方案

## 概述

本文档描述了使用 `expo-audio-stream` 录制音频并上传到后端 Speech-to-Text API 的最简单方案。

**关键特点：**
- 不做实时处理，只需录制完整音频段
- 录制完成后一次性上传
- 配置简单，代码易懂
- 中文注释完整

## 最佳方案：简单录制 + 文件上传

基于后端接口需求和简单性原则，推荐以下方案：

### 1. 安装配置

```bash
# 安装 expo-audio-stream
npm install @siteed/expo-audio-stream
# 或
yarn add @siteed/expo-audio-stream
```

在 `app.json` 中配置：

```json
{
  "expo": {
    "plugins": [
      [
        "@siteed/expo-audio-stream",
        {
          "microphonePermission": "允许应用录制语音进行转文字"
        }
      ]
    ]
  }
}
```

### 2. 核心录制配置

```typescript
import { useAudioRecorder } from '@siteed/expo-audio-stream';

// 最佳录制配置 - 匹配后端 API 要求
const RECORDING_CONFIG = {
  sampleRate: 16000,     // 16kHz - 后端推荐采样率
  channels: 1,           // 单声道 - 语音识别无需立体声
  encoding: 'pcm_16bit', // 16位 PCM - 后端支持的格式
  
  // 简单配置，不启用复杂功能
  enableProcessing: false,  // 不需要实时分析
  compression: {
    enabled: false         // 不启用压缩，保持原始质量
  }
};
```

### 3. React Native 组件实现

```typescript
import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator
} from 'react-native';
import { useAudioRecorder } from '@siteed/expo-audio-stream';
import * as FileSystem from 'expo-file-system';

interface TranscriptionResult {
  success: boolean;
  text: string;
  processingTimeMs: number;
}

export const SimpleVoiceRecorder: React.FC = () => {
  // 录制状态管理
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionText, setTranscriptionText] = useState('');
  
  // 使用 expo-audio-stream hook
  const {
    startRecording,
    stopRecording,
    isRecording,
    durationMs
  } = useAudioRecorder();

  /**
   * 开始录制音频
   */
  const handleStartRecording = async () => {
    try {
      console.log('开始录制音频...');
      
      await startRecording(RECORDING_CONFIG);
      
      // 清空之前的转录结果
      setTranscriptionText('');
      
    } catch (error) {
      console.error('录制失败:', error);
      Alert.alert('错误', '录制失败，请检查麦克风权限');
    }
  };

  /**
   * 停止录制并上传转录
   */
  const handleStopRecording = async () => {
    try {
      console.log('停止录制，开始处理...');
      setIsTranscribing(true);
      
      // 停止录制，获取录制结果
      const recordingResult = await stopRecording();
      
      if (!recordingResult || !recordingResult.fileUri) {
        throw new Error('录制结果无效');
      }

      console.log('录制完成:', {
        文件路径: recordingResult.fileUri,
        持续时间: recordingResult.durationMs + 'ms',
        文件大小: recordingResult.size + ' bytes'
      });

      // 读取音频文件并转换为 base64
      const audioBase64 = await convertAudioToBase64(recordingResult.fileUri);
      
      // 发送到后端进行转录
      const transcription = await sendToSpeechAPI(audioBase64);
      
      if (transcription.success) {
        setTranscriptionText(transcription.text);
        console.log('转录成功:', transcription.text);
      } else {
        throw new Error('转录失败');
      }
      
    } catch (error) {
      console.error('处理失败:', error);
      Alert.alert('错误', '音频处理失败: ' + error.message);
    } finally {
      setIsTranscribing(false);
    }
  };

  /**
   * 将音频文件转换为 base64 格式
   */
  const convertAudioToBase64 = async (fileUri: string): Promise<string> => {
    try {
      console.log('正在读取音频文件:', fileUri);
      
      // 使用 expo-file-system 读取文件为 base64
      const audioBase64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      console.log('文件转换完成，base64 长度:', audioBase64.length);
      return audioBase64;
      
    } catch (error) {
      console.error('文件读取失败:', error);
      throw new Error('音频文件读取失败');
    }
  };

  /**
   * 发送音频到后端 Speech-to-Text API
   */
  const sendToSpeechAPI = async (audioBase64: string): Promise<TranscriptionResult> => {
    try {
      console.log('发送音频到后端API...');
      
      // 构建请求数据
      const requestData = {
        audio: audioBase64,                    // base64 编码的音频数据
        language: 'zh',                       // 中文识别
        minDurationMs: 200,                   // 最小语音段时长
        minProbability: 0.4,                  // VAD 置信度阈值
        includeSegments: false                // 不需要详细分段信息
      };

      // 发送 POST 请求到后端
      const response = await fetch('http://your-backend-url/api/v1/speech-to-text/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      // 解析响应
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || '服务器错误');
      }

      console.log('转录完成:', {
        文本: result.text,
        语言: result.language,
        处理时间: result.processingTimeMs + 'ms',
        语音百分比: result.vadStats.speechPercentage + '%'
      });

      return {
        success: result.success,
        text: result.text,
        processingTimeMs: result.processingTimeMs
      };
      
    } catch (error) {
      console.error('API 请求失败:', error);
      throw new Error('网络请求失败: ' + error.message);
    }
  };

  /**
   * 格式化录制时长显示
   */
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // 渲染组件
  return (
    <View style={styles.container}>
      <Text style={styles.title}>语音转文字</Text>
      
      {/* 录制状态显示 */}
      {isRecording && (
        <View style={styles.recordingStatus}>
          <Text style={styles.duration}>
            录制中: {formatDuration(durationMs)}
          </Text>
          <View style={styles.recordingIndicator} />
        </View>
      )}

      {/* 录制控制按钮 */}
      <Pressable
        style={({ pressed }) => [
          styles.recordButton,
          isRecording && styles.recordingButton,
          pressed && styles.pressedButton,
          (isTranscribing) && styles.disabledButton
        ]}
        onPress={isRecording ? handleStopRecording : handleStartRecording}
        disabled={isTranscribing}
      >
        {isTranscribing ? (
          <ActivityIndicator size="large" color="white" />
        ) : (
          <Text style={styles.buttonText}>
            {isRecording ? '停止录制' : '开始录制'}
          </Text>
        )}
      </Pressable>

      {/* 处理状态提示 */}
      {isTranscribing && (
        <Text style={styles.processingText}>
          正在转录音频，请稍候...
        </Text>
      )}

      {/* 转录结果显示 */}
      {transcriptionText && (
        <View style={styles.resultContainer}>
          <Text style={styles.resultTitle}>转录结果:</Text>
          <Text style={styles.resultText}>{transcriptionText}</Text>
        </View>
      )}
    </View>
  );
};

// 样式定义
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 40,
    color: '#333',
  },
  recordingStatus: {
    alignItems: 'center',
    marginBottom: 30,
  },
  duration: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  recordingIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ff4444',
    opacity: 0.8,
  },
  recordButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  recordingButton: {
    backgroundColor: '#ff4444',
  },
  pressedButton: {
    transform: [{ scale: 0.95 }],
  },
  disabledButton: {
    backgroundColor: '#cccccc',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  processingText: {
    marginTop: 20,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  resultContainer: {
    marginTop: 30,
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 10,
    width: '100%',
    maxHeight: 200,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    color: '#333',
  },
  resultText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#666',
  },
});
```

### 4. 完整的应用使用示例

```typescript
// App.tsx
import React from 'react';
import { SafeAreaView, StatusBar } from 'react-native';
import { SimpleVoiceRecorder } from './SimpleVoiceRecorder';

export default function App() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
      <SimpleVoiceRecorder />
    </SafeAreaView>
  );
}
```

### 5. 权限处理

```typescript
// 在录制前检查权限的辅助函数
import * as Permissions from 'expo-permissions';

export const checkMicrophonePermission = async (): Promise<boolean> => {
  try {
    // 检查当前权限状态
    const { status: existingStatus } = await Permissions.getAsync(
      Permissions.AUDIO_RECORDING
    );

    let finalStatus = existingStatus;

    // 如果没有权限，则请求权限
    if (existingStatus !== 'granted') {
      const { status } = await Permissions.askAsync(Permissions.AUDIO_RECORDING);
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('麦克风权限被拒绝');
      return false;
    }

    return true;
  } catch (error) {
    console.error('权限检查失败:', error);
    return false;
  }
};

// 在组件中使用
const handleStartRecording = async () => {
  // 先检查权限
  const hasPermission = await checkMicrophonePermission();
  if (!hasPermission) {
    Alert.alert('需要权限', '请在设置中允许访问麦克风');
    return;
  }

  // 开始录制
  await startRecording(RECORDING_CONFIG);
};
```

### 6. 错误处理优化

```typescript
// 错误类型定义
interface RecordingError {
  code: string;
  message: string;
  details?: string;
}

// 错误处理函数
const handleRecordingError = (error: any): RecordingError => {
  console.error('录制错误详情:', error);

  // 根据错误类型返回用户友好的消息
  if (error.message?.includes('permission')) {
    return {
      code: 'PERMISSION_DENIED',
      message: '缺少麦克风权限，请在设置中允许访问麦克风',
    };
  }

  if (error.message?.includes('device')) {
    return {
      code: 'DEVICE_ERROR',
      message: '录音设备不可用，请检查设备状态',
    };
  }

  if (error.message?.includes('network') || error.message?.includes('fetch')) {
    return {
      code: 'NETWORK_ERROR',
      message: '网络连接失败，请检查网络设置',
    };
  }

  // 默认错误消息
  return {
    code: 'UNKNOWN_ERROR',
    message: '录制失败，请重试',
    details: error.message,
  };
};

// 在组件中使用错误处理
const handleStopRecording = async () => {
  try {
    setIsTranscribing(true);
    const recordingResult = await stopRecording();
    // ... 处理逻辑
  } catch (error) {
    const recordingError = handleRecordingError(error);
    Alert.alert('错误', recordingError.message);
  } finally {
    setIsTranscribing(false);
  }
};
```

## 总结

### 这个方案的优势：

1. **简单易懂**：
   - 直接的录制->上传流程
   - 清晰的中文注释
   - 最少的配置选项

2. **完美匹配后端**：
   - 16kHz 采样率（后端推荐）
   - PCM 16-bit 格式（后端支持）
   - Base64 编码（后端要求）

3. **用户体验好**：
   - 清晰的状态反馈
   - 友好的错误提示
   - 简单的操作界面

4. **性能优化**：
   - 单声道录制（减少数据量）
   - 不启用不必要的功能
   - 一次性上传（避免频繁网络请求）

### 关键技术要点：

- **录制配置**：16kHz, 单声道, PCM 16-bit
- **文件处理**：使用 expo-file-system 读取为 base64
- **API 调用**：POST JSON 格式到 /transcribe 端点
- **错误处理**：完整的错误分类和用户提示

这个方案避免了复杂的实时处理，专注于简单可靠的录制和上传功能，完全满足你的需求。