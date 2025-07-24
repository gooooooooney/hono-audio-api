# VAD + Speech-to-Text API

This API combines Voice Activity Detection (VAD) with OpenAI Whisper to provide cost-efficient speech-to-text transcription.

## Features

- **Voice Activity Detection**: Uses TEN-VAD WebAssembly to detect and extract speech segments
- **Silence Removal**: Automatically removes non-speech audio to reduce costs
- **OpenAI Whisper Integration**: High-quality speech-to-text transcription
- **Base64 Audio Support**: No file uploads needed - works with base64 encoded audio
- **Cloud-Ready**: No temporary file dependencies, works in serverless environments

## Configuration

Set your OpenAI API key in the `.env` file:

```env
OPENAI_API_KEY=your_openai_api_key_here
```

## API Endpoints

### 1. Check Service Status

```bash
GET /api/v1/stt/status
```

Returns the status of VAD and Whisper services.

### 2. Transcribe Audio

```bash
POST /api/v1/stt/transcribe
```

Request body:
```json
{
  "audio": "base64_encoded_wav_audio",
  "language": "zh",  // Optional: ISO 639-1 language code
  "minDurationMs": 200,  // Optional: Min speech segment duration
  "minProbability": 0.4,  // Optional: Min VAD confidence
  "includeSegments": true  // Optional: Include detailed segments
}
```

Response:
```json
{
  "success": true,
  "text": "Transcribed text here",
  "language": "zh",
  "confidence": 0.95,
  "vadStats": {
    "totalFrames": 1000,
    "speechFrames": 800,
    "speechPercentage": 80.0,
    "segmentsFound": 5,
    "segmentsKept": 4,
    "processingTimeMs": 150
  },
  "audioStats": {
    "originalDurationMs": 10000,
    "processedDurationMs": 8000,
    "compressionRatio": 0.8,
    "originalSizeBytes": 320000,
    "processedSizeBytes": 256000
  },
  "processingTimeMs": 2500
}
```

## Testing

Run the test script:
```bash
bun run test-stt-api.ts
```

## Swagger Documentation

Access the interactive API documentation at:
- Swagger UI: http://localhost:3002/ui
- OpenAPI JSON: http://localhost:3002/doc