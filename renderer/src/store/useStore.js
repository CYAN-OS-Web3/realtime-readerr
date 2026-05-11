import { create } from 'zustand';

const savedTtsEngine = localStorage.getItem('cyan_tts_engine') || 'google';
const savedNoiseReduction = localStorage.getItem('cyan_noise_reduction') !== null 
  ? JSON.parse(localStorage.getItem('cyan_noise_reduction')) 
  : true;
const savedSourceLang = localStorage.getItem('cyan_source_lang') || 'en-US';
const savedTargetLang = localStorage.getItem('cyan_target_lang') || 'vi-VN';

export const languages = [
  { code: 'vi-VN', name: 'Vietnamese', flag: '🇻🇳' },
  { code: 'en-US', name: 'English', flag: '🇺🇸' },
  { code: 'es-ES', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr-FR', name: 'French', flag: '🇫🇷' },
  { code: 'de-DE', name: 'German', flag: '🇩🇪' },
  { code: 'it-IT', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt-PT', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'ru-RU', name: 'Russian', flag: '🇷🇺' },
  { code: 'ja-JP', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko-KR', name: 'Korean', flag: '🇰🇷' },
  { code: 'zh-CN', name: 'Mandarin', flag: '🇨🇳' },
  { code: 'hi-IN', name: 'Hindi', flag: '🇮🇳' },
  { code: 'ar-SA', name: 'Arabic', flag: '🇸🇦' },
  { code: 'bn-BD', name: 'Bengali', flag: '🇧🇩' },
  { code: 'ms-MY', name: 'Malay', flag: '🇲🇾' },
  { code: 'id-ID', name: 'Indonesian', flag: '🇮🇩' },
  { code: 'th-TH', name: 'Thai', flag: '🇹🇭' },
  { code: 'tr-TR', name: 'Turkish', flag: '🇹🇷' },
  { code: 'pl-PL', name: 'Polish', flag: '🇵🇱' },
  { code: 'uk-UA', name: 'Ukrainian', flag: '🇺🇦' },
  { code: 'nl-NL', name: 'Dutch', flag: '🇳🇱' },
  { code: 'sv-SE', name: 'Swedish', flag: '🇸🇪' },
  { code: 'fi-FI', name: 'Finnish', flag: '🇫🇮' },
  { code: 'da-DK', name: 'Danish', flag: '🇩🇰' },
  { code: 'no-NO', name: 'Norwegian', flag: '🇳🇴' },
  { code: 'cs-CZ', name: 'Czech', flag: '🇨🇿' },
  { code: 'el-GR', name: 'Greek', flag: '🇬🇷' },
  { code: 'he-IL', name: 'Hebrew', flag: '🇮🇱' },
  { code: 'ro-RO', name: 'Romanian', flag: '🇷🇴' },
  { code: 'hu-HU', name: 'Hungarian', flag: '🇭🇺' },
  { code: 'sk-SK', name: 'Slovak', flag: '🇸🇰' },
  { code: 'bg-BG', name: 'Bulgarian', flag: '🇧🇬' },
  { code: 'ca-ES', name: 'Catalan', flag: '🇪🇸' },
  { code: 'hr-HR', name: 'Croatian', flag: '🇭🇷' },
  { code: 'sr-RS', name: 'Serbian', flag: '🇷🇸' },
  { code: 'sl-SI', name: 'Slovenian', flag: '🇸🇮' },
  { code: 'et-EE', name: 'Estonian', flag: '🇪🇪' },
  { code: 'lv-LV', name: 'Latvian', flag: '🇱🇻' },
  { code: 'lt-LT', name: 'Lithuanian', flag: '🇱🇹' },
  { code: 'fil-PH', name: 'Filipino', flag: '🇵🇭' }
];

export const useStore = create((set) => ({
  // --- Connection & Status ---
  isConnected: false,
  latency: 0,
  backendUrl: '',
  wsConnectionState: 'disconnected', // 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'failed'
  setConnection: (connected, latency) => set({ isConnected: connected, latency }),
  setBackendUrl: (url) => set({ backendUrl: url }),
  setWSConnectionState: (state) => set({ wsConnectionState: state }),
  
  // --- Devices ---
  audioInputs: [],
  audioOutputs: [],
  setAudioInputs: (inputs) => set({ audioInputs: inputs }),
  setAudioOutputs: (outputs) => set({ audioOutputs: outputs }),

  // --- Auth & Identity ---
  authUserId: '',
  installId: localStorage.getItem('installId') || '',
  setAuthUserId: (id) => set({ authUserId: id }),
  setInstallId: (id) => {
    localStorage.setItem('installId', id);
    set({ installId: id });
  },

  // --- App Control ---
  isTranslating: false,
  setIsTranslating: (val) => set({ isTranslating: val }),
  micVolume: 0,
  setMicVolume: (vol) => set({ micVolume: vol }),
  
  // --- UI States ---
  activeTab: 'translation', // 'translation' | 'voice' | 'logs' | 'summaries'
  setActiveTab: (tab) => set({ activeTab: tab }),
  showOverlay: true,
  showConfigModal: false,
  configStep: 0,
  isConfiguring: false,
  setShowOverlay: (val) => set({ showOverlay: val }),
  setShowConfigModal: (val) => set({ showConfigModal: val }),
  setConfigStep: (val) => set({ configStep: val }),
  setIsConfiguring: (val) => set({ isConfiguring: val }),

  // --- Toast Notifications ---
  toast: {
    show: false,
    status: 'idle', // 'idle' | 'generating' | 'complete'
    title: '',
    message: ''
  },
  setToast: (toastUpdate) => set((state) => ({ 
    toast: { ...state.toast, ...toastUpdate } 
  })),
  hideToast: () => set((state) => ({ 
    toast: { ...state.toast, show: false } 
  })),

  // --- Voice Management ---
  voiceOrderId: '',
  voiceApprovalUrl: '',
  voiceUiStatus: '',
  voiceSample: null,
  setVoiceState: (newState) => set(newState),

  // --- Audio Engine State ---
  ambientNoiseLevel: 0,
  setAmbientNoiseLevel: (level) => set({ ambientNoiseLevel: level }),

  // --- Settings ---
  settings: {
    sourceLang: savedSourceLang,
    targetLang: savedTargetLang,
    ttsEngine: savedTtsEngine,
    sensitivity: 30,
    sampleRate: 16000,
    noiseReduction: savedNoiseReduction,
    noiseGateMode: 'adaptive',
    inputDeviceId: localStorage.getItem('inputDeviceId') || '',
    outputDeviceId: localStorage.getItem('outputDeviceId') || 'default',
    languages: languages,
  },
  
  updateSettings: (newSettings) => set((state) => {
    const updated = { ...state.settings, ...newSettings };
    if (newSettings.ttsEngine) localStorage.setItem('cyan_tts_engine', newSettings.ttsEngine);
    if (newSettings.noiseReduction !== undefined) localStorage.setItem('cyan_noise_reduction', JSON.stringify(newSettings.noiseReduction));
    if (newSettings.sourceLang) localStorage.setItem('cyan_source_lang', newSettings.sourceLang);
    if (newSettings.targetLang) localStorage.setItem('cyan_target_lang', newSettings.targetLang);
    if (newSettings.inputDeviceId) localStorage.setItem('inputDeviceId', newSettings.inputDeviceId);
    if (newSettings.outputDeviceId) localStorage.setItem('outputDeviceId', newSettings.outputDeviceId);
    
    return { settings: updated };
  }),

  // --- Transcripts ---
  transcripts: [], 
  addTranscript: (entry) => set((state) => ({
    transcripts: [{ ...entry, timestamp: Date.now() }, ...state.transcripts].slice(0, 50)
  })),
  updateLastTranscript: (entry) => set((state) => {
    const newTranscripts = [...state.transcripts];
    if (newTranscripts.length > 0) {
      newTranscripts[0] = { ...newTranscripts[0], ...entry };
    } else {
      newTranscripts.push({ ...entry, timestamp: Date.now() });
    }
    return { transcripts: newTranscripts };
  }),
  clearTranscripts: () => set({ transcripts: [] }),

  // --- Session Transcripts (Final only) ---
  sessionTranscripts: [],
  sessionId: null,
  startSession: (id) => set({ 
    sessionId: id || `session_${Date.now()}`,
    sessionTranscripts: []
  }),
  addFinalTranscript: (finalTranscript) => set((state) => ({
    sessionTranscripts: [...state.sessionTranscripts, {
      source: finalTranscript.source,
      target: finalTranscript.target,
      isFinal: finalTranscript.isFinal || true,
      timestamp: finalTranscript.timestamp || new Date().toISOString(),
      sessionId: state.sessionId,
      capturedAt: Date.now()
    }]
  })),
  getSessionTranscripts: () => {
    const state = useStore.getState();
    return {
      sessionId: state.sessionId,
      transcripts: state.sessionTranscripts,
      count: state.sessionTranscripts.length,
      startedAt: state.sessionId ? parseInt(state.sessionId.split('_')[1]) : null
    };
  },
  clearSessionTranscripts: () => set({ sessionTranscripts: [], sessionId: null }),

  // --- Logs ---
  logs: [],
  addLog: (msg, type) => set((state) => ({
    logs: [{ msg, type, time: new Date().toLocaleTimeString() }, ...state.logs].slice(0, 50)
  })),
  clearLogs: () => set({ logs: [] }),
}));
