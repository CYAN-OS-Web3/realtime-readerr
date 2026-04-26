# Real-Time Speech Translation with Virtual Microphone

This project provides a real-time speech translation system that captures audio from your microphone, transcribes it to text, translates the text into another language, and outputs the translated speech through a virtual microphone. The virtual microphone (e.g., [BlackHole](https://github.com/ExistentialAudio/BlackHole) or [VB-Audio Cable](https://vb-audio.com/Cable/)) can be used in applications like Google Meet, Zoom, or Microsoft Teams for live translated speech.

## Requirements
- **Node.js**
- **Deepgram API** (for speech-to-text transcription)
- **Google Cloud Translation API** (for translating text)
- **Virtual Audio Cable** or **BlackHole** (for routing translated audio into other apps)

## How It Works

1. **Audio Capture:**
   - The app captures audio from the user's microphone using the Web Audio API.
   - This audio is processed and streamed to Deepgram for real-time transcription.

2. **Transcription:**
   - Transcriptions are received via a WebSocket from Deepgram's API.
   - The transcribed text is displayed and processed for translation.

3. **Translation:**
   - Transcriptions are sent to the Google Cloud Translation API for real-time translation into a specified target language.

4. **Text-to-Speech (TTS):**
   - The translated text is converted to speech using Deepgram's TTS WebSocket service.

5. **Virtual Microphone Output:**
   - The translated audio is routed to a virtual microphone (e.g., BlackHole or VB-Audio Cable), which can then be used as the input in video conferencing applications.

## Data Flow (Piping):
1. **Input from Microphone:**
   - Audio is captured from the user’s microphone (excluding virtual mics to prevent feedback loops).

2. **Transcription and Translation:**
   - Audio is sent to the Deepgram API for transcription.
   - The transcribed text is sent to Google’s Translation API for translation.

3. **Queueing and Playback:**
   - Translated text is sent to the Deepgram TTS service for speech synthesis.
   - The synthesized speech is queued for playback.

4. **Virtual Audio Output:**
   - The output is routed to the virtual microphone, making it available for apps like Zoom, Teams, or Google Meet.

## Virtual Microphone Setup

To use the translated speech in video conferencing apps, you'll need to set up a virtual audio device:
- **[BlackHole](https://github.com/ExistentialAudio/BlackHole)** (for macOS)
- **[VB-Audio Cable](https://vb-audio.com/Cable/)** (for Windows)

Once the virtual microphone is installed:
1. Select the virtual microphone as the input in your video conferencing app to stream the translated speech live.

## How to Run

### 1. Installation

Clone the repository and install dependencies:

```bash
npm install
cd backend && npm install
```

### 2. Environment Configuration (⚠️ IMPORTANT)

**NEVER commit real API keys to git. See [SECURITY.md](./SECURITY.md) for details.**

Create your local `.env` file from the template:

```bash
# Root directory
cp .env.example .env

# Backend directory
cd backend
cp .env.example .env
```

Then add your real API credentials to the `.env` files. See available services:
- **Google Cloud APIs** (TTS & STT)
- **Azure Cognitive Services** (optional TTS)
- **Supabase** (backend database)
- **PayPal** (subscription management)
- **ElevenLabs** (optional TTS)

### 3. Start the Application

```bash
npm run start
```

Or for development with hot reload:

```bash
npm run dev
```

### 4. Security Checks

To verify your environment is properly configured:

```bash
npm run doctor:check
```

---

**Security Reminders:**
- ✅ `.env` is in `.gitignore` (never committed)
- ✅ `.env.example` contains only empty placeholders
- ✅ Real credentials should be stored in OS Keychain/Credential Manager (Windows/macOS/Linux)
- ✅ Rotate leaked credentials immediately




