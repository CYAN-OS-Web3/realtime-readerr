const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onTranslationResult: (callback) => {
        const handler = (event, text) => callback(text);
        ipcRenderer.on('translation-result', handler);
        return () => ipcRenderer.removeListener('translation-result', handler);
    },
    onLogMessage: (callback) => {
        const handler = (event, message, type) => callback(message, type);
        ipcRenderer.on('log-message', handler);
        return () => ipcRenderer.removeListener('log-message', handler);
    }
});
