/**
 * IPC Input Validation Schema
 * Provides simple type guards for IPC messages to prevent type confusion and crashes.
 */

const IPC_SCHEMES = {
  'audio-chunk': (data) => {
    return Buffer.isBuffer(data) || data instanceof Uint8Array || (data && data.buffer);
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
  'cyan:openExternal': (data) => typeof data === 'string' && data.startsWith('http'),
  // Downward (Main -> Renderer)
  'server-status': (data) => typeof data === 'object' && data !== null,
  'tts-audio-chunk': (data) => data instanceof Uint8Array || Buffer.isBuffer(data),
  'tts-audio-done': () => true,
  'stt-final': (data) => typeof data === 'string',
  'stt-partial': (data) => typeof data === 'string',
  'log-message': (data, msg, type) => typeof data === 'string',
  'translation:update': (data) => typeof data === 'object' && data !== null,
};

/**
 * Validates IPC data against a schema.
 * @param {string} channel IPC channel name
 * @param {any} data Data to validate
 * @returns {boolean} True if valid
 */
function validateIPC(channel, data) {
  const validator = IPC_SCHEMES[channel];
  if (!validator) {
    console.warn(`[Validation] No validator for channel: ${channel}`);
    return true; // Default to true if no validator defined yet
  }
  return validator(data);
}

module.exports = { validateIPC, IPC_SCHEMES };
