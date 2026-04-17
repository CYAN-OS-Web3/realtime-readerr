/**
 * IPC Input Validation Schema
 * Provides type guards for IPC messages to prevent type confusion, crashes, and buffer overruns.
 * 
 * SEC-002 Fix: Every IPC handler should validate incoming data before processing.
 */

const IPC_SCHEMES = {
  // Upward (Renderer -> Main)
  'audio-chunk': (data) => {
    return Buffer.isBuffer(data) || data instanceof Uint8Array || (data && data.buffer instanceof ArrayBuffer);
  },
  'translation:toggle': (data) => {
    return typeof data === 'object' && data !== null && typeof data.isTranslating === 'boolean';
  },
  'settings:update': (data) => {
    return typeof data === 'object' && data !== null;
  },
  'language:change': (data) => {
    return typeof data === 'string' && data.length >= 2 && data.length <= 15;
  },
  'mic:toggle': (data) => {
    return typeof data === 'boolean';
  },
  'overlay:show': () => true,
  'overlay:hide': () => true,
  'stt:finalize': () => true,
  'audio:autoconfigure': () => true,
  'window:minimize': () => true,
  'window:maximize': () => true,
  'window:close': () => true,
  'cyan:getBackendUrl': () => true,
  'cyan:getInstallId': () => true,
  'cyan:openExternal': (data) => {
    if (typeof data !== 'string') return false;
    const trimmed = data.trim();
    return trimmed.length > 0 && trimmed.length < 2048 && 
           (trimmed.startsWith('http://') || trimmed.startsWith('https://'));
  },
  
  // Downward (Main -> Renderer) - for reply validation
  'server-status': (data) => typeof data === 'object' && data !== null,
  'tts-audio-chunk': (data) => data instanceof Uint8Array || Buffer.isBuffer(data),
  'tts-audio-done': () => true,
  'stt-final': (data) => typeof data === 'string',
  'stt-partial': (data) => typeof data === 'string',
  'stt-transcript': (data) => {
    return typeof data === 'object' && data !== null && 
           typeof data.transcript === 'string' && 
           typeof data.isFinal === 'boolean';
  },
  'log-message': (data) => typeof data === 'string',
  'translation:update': (data) => {
    return typeof data === 'object' && data !== null &&
           typeof data.sourceText === 'string' &&
           typeof data.translatedText === 'string';
  },
};

/**
 * Validates IPC data against a schema.
 * @param {string} channel IPC channel name
 * @param {any} data Data to validate
 * @param {boolean} verbose Log validation failures (default: false)
 * @returns {boolean} True if valid
 */
function validateIPC(channel, data, verbose = false) {
  const validator = IPC_SCHEMES[channel];
  
  if (!validator) {
    if (verbose) {
      console.warn(`[IPC Validation] No validator registered for channel: ${channel}`);
    }
    return true; // Default to true if no validator defined (be permissive)
  }
  
  try {
    const isValid = validator(data);
    if (!isValid && verbose) {
      console.warn(`[IPC Validation] Invalid data for channel "${channel}":`, {
        channel,
        dataType: typeof data,
        dataLength: Array.isArray(data) ? data.length : Buffer.isBuffer(data) ? data.length : 'N/A',
        sample: String(data).substring(0, 100)
      });
    }
    return isValid;
  } catch (err) {
    console.error(`[IPC Validation] Validator threw error for channel "${channel}":`, err);
    return false;
  }
}

/**
 * Creates a safe IPC handler wrapper that validates input before calling the handler.
 * @param {Function} handler The IPC handler function
 * @param {string} channel The IPC channel name (for validation)
 * @param {string} handlerName Human-readable handler name (for logging)
 * @returns {Function} Wrapped handler function
 */
function createSafeIPCHandler(handler, channel, handlerName = channel) {
  return (event, data) => {
    try {
      if (!validateIPC(channel, data, true)) {
        console.error(`[IPC Security] Rejected invalid data on channel "${channel}"`);
        return;
      }
      return handler(event, data);
    } catch (err) {
      console.error(`[IPC Error] Unhandled exception in ${handlerName}:`, err);
      // Re-throw if it's a critical error (for debugging)
      if (process.env.NODE_ENV === 'development') {
        throw err;
      }
    }
  };
}

module.exports = { 
  validateIPC, 
  IPC_SCHEMES,
  createSafeIPCHandler
};
