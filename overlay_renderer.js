// overlay_renderer.js - Logic for Overlay Window (Subtitles)
// Uses window.electronAPI exposed via preload-overlay.js

const CHANNEL_NAME = 'translation-result';

if (window.electronAPI && window.electronAPI.onTranslationResult) {
    window.electronAPI.onTranslationResult((translatedText) => {
        const outputElement = document.getElementById('translation-output');
        if (!outputElement) return;

        // 1. Update translated text
        outputElement.textContent = translatedText;
        
        // 2. Clear text after 10s
        setTimeout(() => {
            outputElement.textContent = '';
        }, 10000);
    });
}

if (window.electronAPI && window.electronAPI.onLogMessage) {
    window.electronAPI.onLogMessage((message, type) => {
        console.log(`[Overlay Log] ${type}: ${message}`);
    });
}