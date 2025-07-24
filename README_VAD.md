# VAD API Service

Voice Activity Detection API service built with Hono and TEN-VAD WebAssembly.

## Features

- Real-time voice activity detection
- Batch processing of audio segments
- Full audio file analysis with speech segments extraction
- WebAssembly-based processing for high performance
- Swagger UI for API documentation

## API Endpoints

### Base URL
```
http://localhost:3000/api/v1/vad
```

### Available Endpoints

#### 1. Detect Voice Activity
```
POST /api/v1/vad/detect
```
Detect voice activity in audio data.

**Request Body:**
```json
{
  "audioData": [0.1, -0.2, 0.3, ...], // Audio samples
  "sampleRate": 16000,                 // Sample rate in Hz
  "format": "float32"                  // "float32" or "int16"
}
```

**Response:**
```json
{
  "isSpeaking": true,
  "probability": 0.8765,
  "processingTimeMs": 15,
  "metadata": {
    "sampleRate": 16000,
    "audioLength": 16000,
    "durationSeconds": 1.0,
    "threshold": 0.5,
    "hopSize": 256
  }
}
```

#### 2. Process Multiple Segments
```
POST /api/v1/vad/process-segments
```
Process multiple audio segments in batch.

**Request Body:**
```json
{
  "segments": [[...], [...], ...],     // Array of audio segments
  "sampleRate": 16000,
  "format": "float32",
  "resetBetweenSegments": false
}
```

#### 3. Analyze Audio File
```
POST /api/v1/vad/analyze-file
```
Analyze complete audio file and extract speech segments.

**Request Body:**
```json
{
  "audioData": [...],          // Complete audio data
  "sampleRate": 16000,
  "format": "float32",
  "windowDuration": 0.5,       // Window size in seconds
  "overlap": 0.1               // Overlap in seconds
}
```

**Response:**
```json
{
  "speechSegments": [
    {
      "start": 1.5,
      "end": 3.2,
      "duration": 1.7
    }
  ],
  "statistics": {
    "totalDuration": 10.0,
    "totalSpeechDuration": 6.5,
    "speechRatio": 0.65
  }
}
```

#### 4. Get Status
```
GET /api/v1/vad/status
```
Get VAD processor status and configuration.

#### 5. Reset VAD
```
POST /api/v1/vad/reset
```
Reset VAD processor state.

## Swagger Documentation

- Swagger UI: http://localhost:3000/ui
- OpenAPI Spec: http://localhost:3000/doc

## Audio Data Formats

### Float32 Format
- Values range from -1.0 to 1.0
- Standard web audio format

### Int16 Format
- Values range from -32768 to 32767
- Common in audio file formats

## Requirements

- Sample rate: 16000 Hz (recommended)
- Minimum audio length: 256 samples (16ms at 16kHz)
- Supported sample rates: 8000, 16000, 22050, 44100, 48000 Hz

## Development

```bash
# Install dependencies
bun install

# Run development server
bun run dev

# Build for production
bun run build
```

## Environment Variables

```env
PORT=3000
CORS_ORIGIN=*
API_URL=http://localhost:3000
```