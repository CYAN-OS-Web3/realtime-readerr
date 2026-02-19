const { contextBridge, ipcRenderer } = require('electron');

// Danh sách các ngôn ngữ (Đồng bộ với logic của bạn)
const LANGUAGE_LIST = [
    { code: 'vi-VN', name: 'Vietnamese', flag: '🇻🇳' },
    { code: 'en-US', name: 'English', flag: '🇺🇸' },
    { code: 'es-ES', name: 'Spanish', flag: '🇪🇸' },
    { code: 'fr-FR', name: 'French', flag: '🇫🇷' },
    { code: 'de-DE', name: 'German', flag: '🇩🇪' },
];

// Định nghĩa API an toàn được expose sang Renderer Process (React)
contextBridge.exposeInMainWorld('electronAPI', {
    
    // =========================================================
    // HÀM GỌI (Renderer -> Main)
    // =========================================================
    
    // Gọi: Start/Stop Translation Stream
    toggleTranslation: (settings) => ipcRenderer.send('translation:toggle', settings),
    
    // Gọi: Audio Auto-Configuration
    autoconfigureAudio: () => ipcRenderer.send('audio:autoconfigure'),
    
    // Gọi: Điều khiển cửa sổ
    closeWindow: () => ipcRenderer.send('window:close'),
    minimizeWindow: () => ipcRenderer.send('window:minimize'),
    
    // Gọi: Gửi Audio chunk (sẽ được tích hợp sau)
    sendAudioChunk: (chunk) => ipcRenderer.send('audio-chunk', chunk),
    finalizeUtterance: () => ipcRenderer.send('stt:finalize'),

    // Gọi: Show/Hide Overlay
    showOverlay: () => ipcRenderer.send('overlay:show'),
    hideOverlay: () => ipcRenderer.send('overlay:hide'),


    // =========================================================
    // LISTENERS (Main -> Renderer)
    // =========================================================

    // Nghe: Cập nhật bản dịch cuối cùng
    onTranslationUpdate: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('translation:update', handler);
        return () => ipcRenderer.removeListener('translation:update', handler);
    },
    
    // Nghe: Cập nhật trạng thái Audio Config
    onAudioStatus: (callback) => {
        const handler = (event, status) => callback(status);
        ipcRenderer.on('audio:status', handler);
        return () => ipcRenderer.removeListener('audio:status', handler);
    },
    
    // Nghe: Cập nhật trạng thái Server (Độ trễ/Kết nối)
    onServerStatus: (callback) => {
        const handler = (event, status) => callback(status);
        ipcRenderer.on('server:status', handler);
        return () => ipcRenderer.removeListener('server:status', handler);
    },
    
    // *** FIX LỖI 1: Thay thế window.ipcRenderer.on('stt-transcript', ...) ***
    onSTTTranscript: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('stt-transcript', handler);
        return () => ipcRenderer.removeListener('stt-transcript', handler);
    },
    
    // *** FIX LỖI 2: Thay thế window.ipcRenderer.on('log-message', ...) ***
    onLogMessage: (callback) => {
        const handler = (event, message, type) => callback(message, type);
        ipcRenderer.on('log-message', handler);
        return () => ipcRenderer.removeListener('log-message', handler);
    },
    
    // Nghe: Audio TTS đã sẵn sàng (Đã được định nghĩa trong main.js)
    onAudioReady: (callback) => {
        const handler = (event, audioBuffer) => callback(audioBuffer);
        ipcRenderer.on('tts-audio-ready', handler);
        return () => ipcRenderer.removeListener('tts-audio-ready', handler);
    },
    // Nghe: Audio TTS streaming chunk (Azure)
    onAudioChunk: (callback) => {
        const handler = (event, chunk) => callback(chunk);
        ipcRenderer.on('tts-audio-chunk', handler);
        return () => ipcRenderer.removeListener('tts-audio-chunk', handler);
    },
    // Nghe: Audio TTS streaming complete
    onAudioDone: (callback) => {
        const handler = () => callback();
        ipcRenderer.on('tts-audio-done', handler);
        return () => ipcRenderer.removeListener('tts-audio-done', handler);
    },

    // Nghe: Deep Link Auth Sync
    onAuthSync: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('auth-sync', handler);
        return () => ipcRenderer.removeListener('auth-sync', handler);
    },

    getBackendUrl: () => ipcRenderer.invoke('cyan:getBackendUrl'),
    getInstallId: () => ipcRenderer.invoke('cyan:getInstallId'),
    openExternal: (url) => ipcRenderer.invoke('cyan:openExternal', url),

    // =========================================================
    // DỮ LIỆU ĐỒNG BỘ
    // =========================================================
    
    // Lấy danh sách ngôn ngữ (Đồng bộ)
    getLanguageList: () => LANGUAGE_LIST,
});

// Giữ lại ipcRenderer cho mục đích cũ (nếu cần, nhưng không nên dùng)
// contextBridge.exposeInMainWorld('ipcRenderer', ipcRenderer);
