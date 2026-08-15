// renderer/src/services/webAudioService.js
// Browser-native audio streaming service for MiniPay / web context.
// Replaces the IPC → Electron → WebSocket path used in the desktop app.
// In Electron, ipcService.js handles this via window.electronAPI.

import { ipcService } from './ipcService';

const BACKEND_URL =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_BACKEND_URL)
    ? import.meta.env.VITE_BACKEND_URL
    : 'https://translator-gateway.fly.dev';

let ws = null;
let onTranslationCallback = null;
let onSTTCallback = null;
let onStatusCallback = null;

// Reconnect state
let reconnectTimer = null;
let reconnectAttempts = 0;
let isIntentionallyClosed = false;
let savedToken = null;
let savedSettings = null;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_MS = 1500;

function scheduleReconnect() {
  if (isIntentionallyClosed || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[webAudioService] Max reconnect attempts reached.');
      onStatusCallback?.('error');
    }
    return;
  }

  const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts), 15000);
  reconnectAttempts++;
  console.log(`[webAudioService] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`);
  onStatusCallback?.('reconnecting');

  reconnectTimer = setTimeout(() => {
    if (!isIntentionallyClosed && savedToken && savedSettings) {
      webAudioService._openSocket();
    }
  }, delay);
}

export const webAudioService = {
  // Only active in browser (non-Electron) environments
  get isWeb() {
    return typeof window !== 'undefined' && typeof window.electronAPI === 'undefined';
  },

  connect(token, settings, { onTranslation, onSTT, onStatus } = {}) {
    if (!this.isWeb) return;

    onTranslationCallback = onTranslation;
    onSTTCallback = onSTT;
    onStatusCallback = onStatus;
    savedToken = token;
    savedSettings = settings;
    isIntentionallyClosed = false;
    reconnectAttempts = 0;

    this._openSocket();
  },

  _openSocket() {
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      try { ws.close(); } catch { /* ignore */ }
      ws = null;
    }

    const wsUrl = BACKEND_URL
      .replace(/^https:\/\//, 'wss://')
      .replace(/^http:\/\//, 'ws://');

    // Retrieve userId safely
    const userId = (typeof window !== 'undefined' && window.localStorage) 
      ? (window.localStorage.getItem('cyan_user_id') || 'guest') 
      : 'guest';

    // Build URL mirroring main.js logic
    const sanitizedTargetLang = savedSettings.targetLang.split('-')[0]; // Simple normalization
    const tokenPart = savedToken ? `&token=${encodeURIComponent(savedToken)}` : '';
    const userIdPart = `&user_id=${encodeURIComponent(userId)}`;
    
    const url = `${wsUrl}/api/v1/stt?source_lang=${encodeURIComponent(savedSettings.sourceLang)}&target_lang=${encodeURIComponent(sanitizedTargetLang)}&sample_rate=${savedSettings.sampleRate || 16000}${userIdPart}${tokenPart}`;
    
    console.log('[webAudioService] Connecting to', url.replace(savedToken || 'NOTOKEN', 'REDACTED'));

    ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log('[webAudioService] WebSocket connected');
      reconnectAttempts = 0;
      ws.send(JSON.stringify({
        type: 'stt_start',
        payload: {
          language: savedSettings.sourceLang,
          lang: savedSettings.sourceLang,
          target_language: sanitizedTargetLang,
          target_lang: sanitizedTargetLang,
          tts_engine: savedSettings.ttsEngine,
          sample_rate: savedSettings.sampleRate || 16000,
          sampleRate: savedSettings.sampleRate || 16000,
          sensitivity: savedSettings.sensitivity,
        }
      }));
      onStatusCallback?.('connected');
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        if (ipcService.emit) {
          ipcService.emit('onAudioChunk', {
            chunk: new Uint8Array(event.data)
          });
        }
        return;
      }

      try {
        const data = JSON.parse(event.data);
        if (data.type === 'stt_result') {
          const payload = data.payload || data.data || {};
          const transcript = payload.transcript || payload.text || '';
          const translation = payload.translation || payload.translated_text || '';
          const isFinal = (payload.isFinal !== undefined) ? payload.isFinal : (payload.is_final || false);

          if (transcript) {
            onSTTCallback?.({ transcript, isFinal });
            if (ipcService.emit) {
              ipcService.emit('onSTTTranscript', { transcript, isFinal });
            }
          }

          if (translation) {
            onTranslationCallback?.({ source: transcript, target: translation });
            if (ipcService.emit) {
              ipcService.emit('onTranslationUpdate', {
                sourceText: transcript,
                translatedText: translation,
                isFinal
              });
            }

            // Fetch Cloud TTS directly on Web since there's no main.js
            if (isFinal) {
              webAudioService.fetchCloudTTS(translation, savedSettings, savedToken);
            }
          }
        } else if (data.type === 'error') {
          console.error('[webAudioService] Server Error:', data);
        }
      } catch (e) {
        console.warn('[webAudioService] Failed to parse message', e);
      }
    };

    ws.onclose = (event) => {
      console.log('[webAudioService] WebSocket closed', event.code, event.reason);
      ws = null;
      if (!isIntentionallyClosed) {
        scheduleReconnect();
      } else {
        onStatusCallback?.('disconnected');
      }
    };

    ws.onerror = () => {
      // onclose will fire right after — reconnect is handled there
      console.warn('[webAudioService] WebSocket error — will attempt reconnect on close');
    };
  },

  sendChunk(buffer) {
    if (!this.isWeb || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(buffer);
  },

  flush() {
    if (!this.isWeb || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'flush' }));
  },

  disconnect() {
    if (!this.isWeb) return;
    isIntentionallyClosed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
    onTranslationCallback = null;
    onSTTCallback = null;
    onStatusCallback = null;
    savedToken = null;
    savedSettings = null;
  },

  async fetchCloudTTS(text, settings, token) {
    try {
      const requestBody = {
        text: text,
        language: settings.targetLang,
        tts_engine: settings.ttsEngine || 'google',
        provider: settings.ttsEngine || 'google',
        sample_rate_hertz: 16000,
        gender: 'female'
      };

      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      console.log('[webAudioService] Fetching Cloud TTS for:', text);
      const response = await fetch(`${BACKEND_URL}/api/v1/tts/speak-stream`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        console.error('[webAudioService] Cloud TTS failed:', response.status);
        return;
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('audio/')) {
        const arrayBuffer = await response.arrayBuffer();
        if (ipcService.emit) {
          ipcService.emit('onAudioChunk', new Uint8Array(arrayBuffer));
          ipcService.emit('onAudioDone');
        }
        return;
      }

      // JSON lines streaming fallback
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              if (data.audio) {
                const binaryString = atob(data.audio);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                if (ipcService.emit) {
                  ipcService.emit('onAudioChunk', bytes);
                }
              }
            } catch  {
              // ignore malformed JSON lines
            }
          }
        }
      }
      
      if (ipcService.emit) {
        ipcService.emit('onAudioDone');
      }
    } catch (error) {
      console.error('[webAudioService] Error fetching Cloud TTS:', error);
    }
  }
};

