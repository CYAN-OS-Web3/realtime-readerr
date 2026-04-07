# CYAN Real-Time Translator - Architecture Overview

## System Structure

### Multi-Process Architecture
- **Main Process** (`main.js`, 1,346 lines): Core Electron app, API clients, WebSocket management
- **Renderer Process** (`renderer/src/App.jsx`, 1,566 lines): React UI, state management, audio capture
- **Preload Script** (`preload.js`): IPC bridge with context isolation

### Core Pipeline
Audio Capture → STT (WebSocket) → Translation (REST) → TTS (Streaming) → Playback

### Technology Stack
- **Audio**: Web Audio API, AudioWorklet, ONNX Runtime (local TTS)
- **IPC**: Electron IPC (event/handler based)
- **APIs**: Deepgram, Azure Speech, ElevenLabs, Google Cloud TTS/Translation
- **Build**: Electron Forge, Vite, Tailwind CSS
- **Dependencies**: 60+ npm packages (heavy)

---

## Critical Issues Identified

### CRITICAL SECURITY (Blocking Production)
1. **Hardcoded Credentials** in `mcp-config.json`
   - GitHub Personal Access Token exposed (line 19)
   - Supabase secret token exposed (line 27)
   - Risk: Credential compromise, unauthorized API access

2. **No Input Validation on IPC Handlers**
   - `translation:toggle` (line 1114): Parameters not validated
   - `audio-chunk` (line 1087): Buffer type coerced without validation
   - Risk: Type confusion attacks, malformed data crashes

3. **Unencrypted Credential Storage**
   - API keys passed via environment variables (no encryption)
   - No secure credential management system
   - Risk: Keys exposed in process memory, logs, crash dumps

### HIGH PRIORITY (Must Fix Before Launch)
1. **No Unit or Integration Tests**
   - `package.json` test script: `echo "Error: no test specified"`
   - No test infrastructure (no Jest, Vitest, Mocha setup)
   - No integration tests for IPC, WebSocket, or API pipelines
   - Risk: Regressions, silent failures, untested error paths

2. **Inconsistent Error Handling**
   - Silent error swallowing: `catch {}` (lines 16, 319, 483, 635)
   - Scattered try-catch blocks with minimal context
   - Some endpoints log to renderer, others to console
   - Risk: Difficult debugging, lost error context, user confusion

3. **Global State Overload**
   - 30+ top-level variables (lines 163-196): `wsSTT`, `piperEn`, `currentSettings`, etc.
   - 28+ useState/useRef in renderer (lines 43-96): UI state scattered
   - No state management system (Redux, Zustand, Context API)
   - Risk: State mutations, race conditions, difficult refactoring

4. **Memory Leak Risks**
   - AudioContext creation without cleanup (lines 73-89 in renderer)
   - WebSocket reconnection timers (line 165): `wsReconnectTimer` not always cleared
   - Piper instances cached globally (lines 170-171): No memory bounds
   - Active audio elements set (line 89): Never pruned
   - Risk: Out-of-memory crashes on long-running sessions

### MEDIUM PRIORITY (Before Release 2.0)
1. **WebSocket Reconnection Logic**
   - Hard limit: MAX_WS_RECONNECT_ATTEMPTS = 5 (line 167)
   - No exponential backoff (constant interval)
   - Risk: Slow recovery, connection storms

2. **Callback Hell / Async Management**
   - Nested callbacks in IPC handlers
   - No async/await standardization
   - Promise chains without error handling
   - Risk: Maintainability issues, hard to trace async flows

3. **Magic Numbers & Configuration**
   - MIN_TTS_CHARS = 8 (line 172)
   - MIN_TTS_GAP_MS = 1000 (line 184)
   - TTS_DEBOUNCE_MS = 800 (line 185)
   - STT_TARGET_SAMPLE_RATE = 48000 (renderer line 39)
   - No configuration system, hardcoded throughout
   - Risk: Difficult to tune for different environments

4. **Deprecated Web Audio API**
   - `navigator.mediaDevices.getUserMedia()` (standard, ok)
   - But potential usage of deprecated properties (needs verification)
   - Risk: Future compatibility issues

### LOW PRIORITY (Code Quality, Nice-to-Have)
1. **Missing Documentation**
   - No JSDoc comments
   - No API contract documentation
   - No deployment runbook
   - Risk: Onboarding overhead

2. **No Observability/Monitoring**
   - Minimal logging (ad-hoc console.log and IPC messages)
   - No metrics collection
   - No error tracking (Sentry, etc.)
   - Risk: Blind in production

3. **Build Configuration**
   - Certificate signing (lines 18-20 in forge.config.js) uses env variables
   - No validation of required environment variables
   - Risk: Silent build failures

---

## Dependency Analysis

### Heavy Direct Dependencies
- @deepgram/sdk (3.8.0): Speech-to-text
- @google-cloud/text-to-speech (6.4.0): TTS
- microsoft-cognitiveservices-speech-sdk (1.47.0): Azure TTS
- elevenlabs (1.59.0): ElevenLabs TTS
- @supabase/supabase-js (1.35.7): Database (possibly unused)
- onnxruntime-node (1.18.0): Local ONNX inference
- ws (8.20.0): WebSocket client

### Total Bundle
- Main: ~100KB (before compression)
- Renderer: ~72KB (App.jsx + deps)
- node_modules: ~600+ MB

### Security Audit Required
- Check for known CVEs in 60+ dependencies
- License compliance (ISC is permissive)
- Supply chain risk (all from npm, some unmaintained)

---

## Performance Critical Paths

1. **Audio Streaming Pipeline**
   - Capture → Downsampling → STT WebSocket send
   - Latency target: <200ms
   - Current: No SLA defined, no metrics

2. **Translation Loop**
   - STT result → Translation API → TTS synthesis
   - Bottleneck: Translation REST API (100-300ms)
   - Current: Single sequential pipeline

3. **TTS Playback**
   - Streaming response → Audio buffer → Web Audio playback
   - Current: No buffer management, potential underruns

4. **IPC Overhead**
   - Renderer sends audio chunks via IPC → Main process
   - Chunk size: Not specified, default ~4KB
   - Current: No optimization, potential bottleneck

---

## Deployment Readiness

### Current Gaps
- No staging environment
- No CI/CD pipeline
- No automated testing
- No version management strategy
- No crash reporting
- No update mechanism (Squirrel for Windows, but not integrated)

### Distribution
- NSIS installer for Windows (forge.config.js)
- ZIP for macOS
- DEB/RPM for Linux
- Code signing: Optional (uses env certs if available)

---

## Data Flows (Security Review)

### Audio Data
- Source: Microphone → Renderer process (Web Audio API)
- Transport: IPC to Main process (unencrypted memory copy)
- Destination: WebSocket to Backend → Deepgram (TLS)
- Risk: In-process audio not encrypted, potential memory exposure

### Translated Text
- Source: Backend translation API (TLS)
- Transport: IPC to Renderer (unencrypted memory copy)
- Destination: UI display + TTS synthesis (TLS)
- Risk: Plaintext in memory, accessible via debugger

### API Keys/Credentials
- Source: Environment variables at startup
- Storage: Main process global variables (lines 143-149)
- Risk: Exposed in memory, not cleared on shutdown, visible in crash dumps

---

## Success Criteria for Production

### MUST HAVE (Blocking)
- [ ] No hardcoded credentials
- [ ] Input validation on all IPC handlers
- [ ] Secure credential storage (OS keychain)
- [ ] Unit test coverage ≥60% for core paths
- [ ] Error handling with proper logging
- [ ] Memory leak fixes (AudioContext, WebSocket cleanup)
- [ ] No silent errors

### SHOULD HAVE (Target 2.0)
- [ ] Integration tests for pipelines
- [ ] E2E tests for happy paths
- [ ] Centralized state management
- [ ] Configuration system (dotenv or config file)
- [ ] Exponential backoff for reconnections
- [ ] Performance profiling & SLAs
- [ ] Monitoring/error tracking

### NICE TO HAVE
- [ ] Full API documentation
- [ ] User guide
- [ ] Contribution guidelines
- [ ] Analytics/usage metrics
- [ ] Crash reporting (Sentry integration)

