const { contextBridge, ipcRenderer } = require('electron');

const LANGUAGE_LIST = [
  { code: 'vi-VN', name: 'Vietnamese', flag: '🇻🇳' },
  { code: 'en-US', name: 'English', flag: '🇺🇸' },
  { code: 'es-ES', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr-FR', name: 'French', flag: '🇫🇷' },
  { code: 'de-DE', name: 'German', flag: '🇩🇪' },
];

contextBridge.exposeInMainWorld('electronAPI', {
  toggleTranslation: (settings) => ipcRenderer.send('translation:toggle', settings),
  autoconfigureAudio: () => ipcRenderer.send('audio:autoconfigure'),
  closeWindow: () => ipcRenderer.send('window:close'),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  sendAudioChunk: (chunk) => ipcRenderer.send('audio-chunk', chunk),
  finalizeUtterance: () => ipcRenderer.send('stt:finalize'),
  showOverlay: () => ipcRenderer.send('overlay:show'),
  hideOverlay: () => ipcRenderer.send('overlay:hide'),
  onTranslationUpdate: (callback) => { const handler = (event, data) => callback(data); ipcRenderer.on('translation:update', handler); return () => ipcRenderer.removeListener('translation:update', handler); },
  onAudioStatus: (callback) => { const handler = (event, status) => callback(status); ipcRenderer.on('audio:status', handler); return () => ipcRenderer.removeListener('audio:status', handler); },
  onServerStatus: (callback) => { const handler = (event, status) => callback(status); ipcRenderer.on('server:status', handler); return () => ipcRenderer.removeListener('server:status', handler); },
  onSTTTranscript: (callback) => { const handler = (event, data) => callback(data); ipcRenderer.on('stt-transcript', handler); return () => ipcRenderer.removeListener('stt-transcript', handler); },
  onLogMessage: (callback) => { const handler = (event, message, type) => callback(message, type); ipcRenderer.on('log-message', handler); return () => ipcRenderer.removeListener('log-message', handler); },
  onAudioReady: (callback) => { const handler = (event, audioBuffer) => callback(audioBuffer); ipcRenderer.on('tts-audio-ready', handler); return () => ipcRenderer.removeListener('tts-audio-ready', handler); },
  onAudioChunk: (callback) => { const handler = (event, chunk) => callback(chunk); ipcRenderer.on('tts-audio-chunk', handler); return () => ipcRenderer.removeListener('tts-audio-chunk', handler); },
  onAudioDone: (callback) => { const handler = () => callback(); ipcRenderer.on('tts-audio-done', handler); return () => ipcRenderer.removeListener('tts-audio-done', handler); },
  getBackendUrl: () => ipcRenderer.invoke('cyan:getBackendUrl'),
  getInstallId: () => ipcRenderer.invoke('cyan:getInstallId'),
  openExternal: (url) => ipcRenderer.invoke('cyan:openExternal', url),
  getLanguageList: () => LANGUAGE_LIST,
});
