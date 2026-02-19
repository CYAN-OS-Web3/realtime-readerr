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

1. Clone the repository and install dependencies:
   ```bash
   npm install
    ```

2. Environment variables are already set up with testing values for demonstration purposes. These include temporary keys for Deepgram and Google Cloud APIs.

3. Start the app:

   ```bash
   npm run start
    ```

4. Open the app in a browser, select the language, and start transcription and translation using the UI.


## Demo video (this is what the other person in the meeting will hear):

https://github.com/user-attachments/assets/0e7a4baf-a684-440c-be93-24509547d4ba


