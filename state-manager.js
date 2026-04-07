// state-manager.js - Centralized state management for Realtime-Readerr

const state = {
    // STT & Streams
    recognizeStream: null,
    wsSTT: null,
    wsReconnectTimer: null,
    wsReconnectAttempts: 0,
    isStreaming: false,
    chunkCounter: 0,
    audioArrivalLogged: false,

    // Settings
    currentSettings: {
        sourceLang: 'en-US',
        targetLang: 'vi',
        ttsEngine: 'google',
        sensitivity: 50
    },

    // TTS Control
    lastTtsAt: 0,
    ttsInFlight: false,
    ttsPendingTimer: null,
    ttsPendingText: '',

    // Translation Tracking
    sttLastSentIdx: 0,
    sttLastSendTs: 0,
    lastPartialTranscript: '',
    lastFinalTranscript: '',
    didTranslateForUtterance: false,
    sttFinalizing: false,

    // UI & IPC Visibility
    rendererAlive: false,
    overlayAlive: false,
    suppressRendererIpc: false,
    ttsQueue: []
};

module.exports = {
    state,
    resetSTTState: () => {
        state.sttLastSentIdx = 0;
        state.sttLastSendTs = 0;
        state.lastPartialTranscript = '';
        state.lastFinalTranscript = '';
        state.didTranslateForUtterance = false;
        state.sttFinalizing = false;
        state.ttsQueue = [];
    },
    updateSettings: (newSettings) => {
        state.currentSettings = { ...state.currentSettings, ...newSettings };
    },
    getSettings: () => state.currentSettings
};
