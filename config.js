// config.js - Centralized configuration for Realtime-Readerr
const path = require('path');
require('dotenv').config();

module.exports = {
    // Backend & Identity
    BACKEND_URL: 'https://translator-gateway.fly.dev/',
    CYAN_USER_ID: (process.env.CYAN_USER_ID || '').toString().trim(),
    GCP_PROJECT_ID: (process.env.GCP_PROJECT_ID || '').toString().trim(),

    // Azure TTS Credentials
    AZURE_SPEECH_KEY: (process.env.AZURE_SPEECH_KEY || '').toString().trim(),
    AZURE_SPEECH_REGION: (process.env.AZURE_SPEECH_REGION || '').toString().trim(),
    AZURE_PREFERRED_GENDER: 'male',

    // Google Translate API Key
    GOOGLE_TRANSLATE_API_KEY: (process.env.GOOGLE_TRANSLATE_API_KEY || process.env.TRANSLATE_API_KEY || '').trim(),

    // TTS & Performance Settings
    MIN_TTS_CHARS: 4,
    MIN_TTS_GAP_MS: 200,
    TTS_DEBOUNCE_MS: 200,
    MAX_WS_RECONNECT_ATTEMPTS: 5,

    // File Paths
    MODELS_DIR: path.join(__dirname, 'assets', 'models'),

    // Internal Flags
    IS_DEV: process.env.NODE_ENV === 'development' || process.argv.includes('--dev'),

    // Aliases to prevent casing errors in main.js
    get isDev() { return this.IS_DEV; },
    get isProduction() { return !this.IS_DEV; },
    get userId() { return this.CYAN_USER_ID; }
};
