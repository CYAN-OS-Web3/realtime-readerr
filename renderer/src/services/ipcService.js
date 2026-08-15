/**
 * IPC Service
 * Encapsulates all Electron IPC communication for the React renderer.
 * Provides a clean interface and handles listener cleanup.
 */

// Defensive helper to prevent crashes in non-Electron environments (e.g. browser testing)
const getElectronAPI = () => {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return window.electronAPI;
  }
  const listeners = {};

  // Return a mock object that doesn't crash but logs warnings
  // All methods return a Promise to match Electron's ipcRenderer.invoke behavior
  return new Proxy({}, {
    get: (target, prop) => {
      if (prop.startsWith('on')) {
        return (callback) => {
          if (!listeners[prop]) listeners[prop] = [];
          listeners[prop].push(callback);
          return () => {
            listeners[prop] = listeners[prop].filter(cb => cb !== callback);
          };
        };
      }
      
      if (prop === 'emit') {
        return (event, ...args) => {
          const cbs = listeners[event] || [];
          cbs.forEach(cb => cb(...args));
        };
      }

      return (...args) => {
        if (prop === 'getBackendUrl') {
          return Promise.resolve(
            (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_BACKEND_URL)
              ? import.meta.env.VITE_BACKEND_URL
              : 'https://translator-gateway.fly.dev'
          );
        }
        if (prop === 'getInstallId') {
          return Promise.resolve('web-id');
        }
        console.warn(`[ipcService] Attempted to call Electron API "${prop}" in non-Electron environment.`, args);
        return Promise.resolve(null);
      };
    }
  });
};

const api = getElectronAPI();

export const ipcService = {
  // --- Senders (Renderer -> Main) ---
  
  toggleTranslation: (settings) => {
    return api.toggleTranslation(settings);
  },

  sendAudioChunk: (chunk) => {
    return api.sendAudioChunk(chunk);
  },

  finalizeUtterance: () => {
    return api.finalizeUtterance();
  },

  flushAudio: () => {
    return api.finalizeUtterance();
  },

  showOverlay: () => {
    return api.showOverlay();
  },

  hideOverlay: () => {
    return api.hideOverlay();
  },

  closeWindow: () => {
    return api.closeWindow();
  },

  minimizeWindow: () => {
    return api.minimizeWindow();
  },

  getBackendUrl: () => {
    return api.getBackendUrl() || Promise.resolve('http://localhost:8080');
  },

  getInstallId: () => {
    return api.getInstallId() || Promise.resolve('dev-id');
  },

  openExternal: (url) => {
    return api.openExternal(url);
  },

  // --- Listeners (Main -> Renderer) ---

  onAuthSync: (callback) => {
    return api.onAuthSync(callback);
  },

  onServerStatus: (callback) => {
    return api.onServerStatus(callback);
  },

  onTranslationUpdate: (callback) => {
    return api.onTranslationUpdate(callback);
  },

  onSTTTranscript: (callback) => {
    return api.onSTTTranscript(callback);
  },

  onLogMessage: (callback) => {
    return api.onLogMessage(callback);
  },

  onAudioReady: (callback) => {
    return api.onAudioReady(callback);
  },

  onAudioChunk: (callback) => {
    return api.onAudioChunk(callback);
  },

  onAudioChunkLocal: (callback) => {
    return api.onAudioChunkLocal(callback);
  },

  onAudioDone: (callback) => {
    return api.onAudioDone(callback);
  },

  onAudioDoneLocal: (callback) => {
    return api.onAudioDoneLocal(callback);
  },

  onAudioStatus: (callback) => {
    return api.onAudioStatus(callback);
  },

  onWSConnectionState: (callback) => {
    return api.onWSConnectionState(callback);
  },

  checkTurnCompleteness: (text, lang) => {
    return api.checkTurnCompleteness(text, lang);
  },

  emit: (event, ...args) => {
    if (api.emit) {
      return api.emit(event, ...args);
    }
  },
};
