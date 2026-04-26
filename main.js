// main.js - Cấu hình Electron Forge và Xử lý Google STT/Translation Streaming

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { Buffer } = require('buffer');
const { validateIPC } = require('./validation/ipc-schema');
const logger = require('./utils/logger');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { Piper, PiperCache } = require('./piper-handler');
const piperCache = new PiperCache(2); // Keep max 2 models in memory

const config = require('./config');
const { state, resetSTTState, updateSettings, getSettings } = require('./state-manager');

// FORCED DEV MODE FOR DIAGNOSTICS
const isDev = true; 

const defaultUserData = app.getPath('userData');
const customUserData = path.join(defaultUserData, 'CyanDev');
try {
  fs.mkdirSync(customUserData, { recursive: true });
} catch (e) {
  logger.error('FileSystem', `Failed to create custom user data directory: ${customUserData}`, e);
}

// Local ONNX TTS (Piper) for instant snippet
async function loadPiper(langCode) {
    const lc = (langCode || '').toLowerCase();
    let modelName = 'en_US-lessac-medium.onnx';
    
    if (lc.startsWith('vi')) {
        modelName = 'vi_VN-vivos-x_low.onnx';
    }
    
    const modelPath = path.join(__dirname, 'assets', 'models', modelName);
    const configPath = `${modelPath}.json`;
    
    return await piperCache.getModel(modelPath, configPath);
}

function resample22050To16000(int16){
    // simple linear resample
    const ratio = 16000/22050;
    const outLen = Math.floor(int16.length * ratio);
    const out = new Int16Array(outLen);
    for(let i=0;i<outLen;i++){
        const src = i/ratio;
        const s0 = Math.floor(src);
        const s1 = Math.min(s0+1, int16.length-1);
        const t = src - s0;
        out[i] = (1-t)*int16[s0] + t*int16[s1];
    }
    return out;
}

async function synthLocalSnippet(text, targetLang){
    // Disabled to avoid 'strange' voice blending with high-quality backend voice
    return;
}
app.setPath('userData', customUserData);
app.commandLine.appendSwitch('disk-cache-dir', path.join(customUserData, 'Cache'));
app.commandLine.appendSwitch('media-cache-dir', path.join(customUserData, 'MediaCache'));
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// Deep Link Setup
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('cyanos', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('cyanos');
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    // Handle Deep Link on Windows
    const deepLinkUrl = commandLine.find(arg => arg.startsWith('cyanos://'));
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl);
    }
  });
  
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });
}

function handleDeepLink(urlStr) {
  console.log('[MAIN] Received Deep Link:', urlStr);
  try {
    const u = new URL(urlStr);
    const userId = u.searchParams.get('userId');
    if (userId) {
      console.log('[MAIN] Extracted userId from deep link:', userId);
      config.CYAN_USER_ID = userId; 
      if (mainWindow) {
        mainWindow.webContents.send('auth-sync', { userId });
        console.log('[MAIN] Sent auth-sync event to renderer');
      } else {
        console.warn('[MAIN] Deep link received but mainWindow is null');
      }
    } else {
      console.warn('[MAIN] No userId found in deep link');
    }
  } catch (e) {
    console.error('[MAIN] Deep link parsing error:', e);
  }
}

// Ensure autoplay works without user gesture during streaming
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// const { SpeechClient } = require('@google-cloud/speech'); // No longer needed - using backend API
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
const https = require('https'); 
const sdk = require('microsoft-cognitiveservices-speech-sdk'); 
const fetch = require('node-fetch'); 
const WebSocket = require('ws');

// =====================================================================
// !!! CONFIGURATION & CONSTANTS !!!
// =====================================================================
const BACKEND_URL = config.BACKEND_URL;
const MIN_TTS_CHARS = config.MIN_TTS_CHARS || 3;
const TTS_DEBOUNCE_MS = 500;
const MIN_TTS_GAP_MS = 50; // Reduced from 500 to 50 for ultra-fast flow

// --- Helper: Normalize language codes ---
function normalizeLang(lang) {
    const v = String(lang || '').toLowerCase().trim();
    if (!v) return 'vi-VN';
    if (v === 'vi' || v === 'vn' || v === 'vi-vn') return 'vi-VN';
    if (v === 'en' || v === 'us' || v === 'en-us') return 'en-US';
    
    // Default map for other common codes
    const map = {
        ja: 'ja-JP',
        ko: 'ko-KR',
        zh: 'zh-CN',
        fr: 'fr-FR',
        de: 'de-DE',
        es: 'es-ES',
        it: 'it-IT',
        pt: 'pt-BR',
        ru: 'ru-RU'
    };
    return map[v] || lang;
}

const GOOGLE_TRANSLATE_API_KEY = config.GOOGLE_TRANSLATE_API_KEY;
const azureKey = config.AZURE_SPEECH_KEY;
const azureRegion = config.AZURE_SPEECH_REGION;



let mainWindow = null;
let overlayWindow = null;
let piperEn = null;
let piperVi = null;

function getInstallId(){
    return config.CYAN_USER_ID || `install-${app.getPath('userData').split(path.sep).pop()}`;
}

// =========================================================
// 4. HÀM ÁNH XẠ GIỌNG NÓI AZURE (GIỮ NGUYÊN)
// =========================================================
function getAzureVoiceName(targetLang) {
    const maleVoiceMap = {
        'en': 'en-US-GuyNeural',         
        'vi': 'vi-VN-NamMinhNeural',    
        'es': 'es-ES-AlvaroNeural',      
        'fr': 'fr-FR-HenriNeural',       
        'de': 'de-DE-ConradNeural',      
        'it': 'it-IT-CalimeroNeural',    
        'pt': 'pt-BR-AntonioNeural',     
        'ru': 'ru-RU-DmitryNeural',      
        'ja': 'ja-JP-KeitaNeural',       
        'ko': 'ko-KR-InJoonNeural',      
        'zh': 'zh-CN-YunxiNeural',
        'hi': 'hi-IN-MadhurNeural',
        'ar': 'ar-SA-HamedNeural',
        'bn': 'bn-BD-PradeepNeural',
        'ms': 'ms-MY-OsmanNeural',
        'id': 'id-ID-ArdiNeural',
        'th': 'th-TH-NiwatNeural',
        'tr': 'tr-TR-AhmetNeural',
        'pl': 'pl-PL-MarekNeural',
        'uk': 'uk-UA-OstapNeural',
        'nl': 'nl-NL-MaartenNeural',
        'sv': 'sv-SE-MattiasNeural',
        'fi': 'fi-FI-HarriNeural',
        'da': 'da-DK-JeppeNeural',
        'no': 'no-NO-FinnNeural',
        'cs': 'cs-CZ-AntoninNeural',
        'el': 'el-GR-NestorasNeural',
        'he': 'he-IL-AvriNeural',
        'ro': 'ro-RO-EmilNeural',
        'hu': 'hu-HU-TamasNeural',
        'sk': 'sk-SK-LukasNeural',
        'bg': 'bg-BG-BorislavNeural',
        'ca': 'ca-ES-EnricNeural',
        'hr': 'hr-HR-SreckoNeural',
        'sr': 'sr-RS-NicholasNeural',
        'sl': 'sl-SI-RokNeural',
        'et': 'et-EE-KertNeural',
        'lv': 'lv-LV-NilsNeural',
        'lt': 'lt-LT-LeonasNeural',
        'fil': 'fil-PH-AngeloNeural'
    };
    
    const femaleVoiceMap = {
        'en': 'en-US-JennyNeural',       
        'vi': 'vi-VN-HoaiMyNeural',      
        'es': 'es-ES-ElviraNeural',      
        'fr': 'fr-FR-DeniseNeural',      
        'de': 'de-DE-KatjaNeural',       
        'it': 'it-IT-ElsaNeural',        
        'pt': 'pt-BR-FranciscaNeural',   
        'ru': 'ru-RU-SvetlanaNeural',    
        'ja': 'ja-JP-NanamiNeural',      
        'ko': 'ko-KR-SunHiNeural',       
        'zh': 'zh-CN-XiaoxiaoNeural',
        'hi': 'hi-IN-SwaraNeural',
        'ar': 'ar-SA-ZariyahNeural',
        'bn': 'bn-BD-NabanitaNeural',
        'ms': 'ms-MY-YasminNeural',
        'id': 'id-ID-GadisNeural',
        'th': 'th-TH-PremwadeeNeural',
        'tr': 'tr-TR-EmelNeural',
        'pl': 'pl-PL-ZofiaNeural',
        'uk': 'uk-UA-PolinaNeural',
        'nl': 'nl-NL-FennaNeural',
        'sv': 'sv-SE-SofieNeural',
        'fi': 'fi-FI-NooraNeural',
        'da': 'da-DK-ChristelNeural',
        'no': 'no-NO-PernilleNeural',
        'cs': 'cs-CZ-VlastaNeural',
        'el': 'el-GR-AthinaNeural',
        'he': 'he-IL-HilaNeural',
        'ro': 'ro-RO-AlinaNeural',
        'hu': 'hu-HU-NoemiNeural',
        'sk': 'sk-SK-ViktoriaNeural',
        'bg': 'bg-BG-KalinaNeural',
        'ca': 'ca-ES-JoanaNeural',
        'hr': 'hr-HR-GabrijelaNeural',
        'sr': 'sr-RS-SophieNeural',
        'sl': 'sl-SI-PetraNeural',
        'et': 'et-EE-AnuNeural',
        'lv': 'lv-LV-EveritaNeural',
        'lt': 'lt-LT-OnaNeural',
        'fil': 'fil-PH-BlessicaNeural'
    };

    const selectedMap = (config.AZURE_PREFERRED_GENDER === 'male') ? maleVoiceMap : femaleVoiceMap;
    
    if (config.AZURE_PREFERRED_GENDER === 'male') {
         return selectedMap[targetLang] || 'en-US-RyanNeural'; 
    } else {
         return selectedMap[targetLang] || 'en-US-AvaMultilingualNeural'; 
    }
}

function getGoogleVoiceName(targetLang) {
    const lang = (targetLang || 'en-US').toLowerCase();
    
    // Default Wavenet voices for primary languages
    const map = {
        'en-us': 'en-US-Wavenet-D',
        'vi-vn': 'vi-VN-Wavenet-A',
        'hi-in': 'hi-IN-Wavenet-A',
        'ja-jp': 'ja-JP-Wavenet-A',
        'ko-kr': 'ko-KR-Wavenet-A',
        'fr-fr': 'fr-FR-Wavenet-C',
        'de-de': 'de-DE-Wavenet-B',
        'es-es': 'es-ES-Wavenet-B',
        'it-it': 'it-IT-Wavenet-A',
        'pt-br': 'pt-BR-Wavenet-A',
        'ru-ru': 'ru-RU-Wavenet-A'
    };
    
    // Try full code first, then prefix (e.g. 'hi')
    return map[lang] || map[lang.split('-')[0]] || 'en-US-Wavenet-D';
}


// =========================================================
// 5. CÁC HÀM GỌI DỊCH VỤ TTS (TEXT-TO-SPEECH) (GIỮ NGUYÊN)
// =========================================================

function sendToRenderer(channel, data, type = 'info') {
    try {
        if (
            state.rendererAlive &&
            !state.suppressRendererIpc &&
            mainWindow &&
            !mainWindow.isDestroyed() &&
            mainWindow.webContents &&
            !mainWindow.webContents.isDestroyed() &&
            !mainWindow.webContents.isLoadingMainFrame()
        ) {
            mainWindow.webContents.send(channel, data, type);
        }
    } catch (e) {
        logger.error('IPC', `Failed to send message to renderer on channel: ${channel}`, e);
    }
}

// normalizeLang consolidated at the top of file

function httpsJsonPost(urlStr, payload) {
    return new Promise((resolve, reject) => {
        const u = new URL(urlStr);
        const body = JSON.stringify(payload || {});
        const req = https.request({
            hostname: u.hostname,
            port: u.port ? Number(u.port) : 443,
            path: u.pathname + (u.search || ''),
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let json = null;
                try { json = JSON.parse(text); } catch (_) { json = { raw: text }; }
                resolve({ status: res.statusCode || 0, json });
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function callElevenLabsTTSService(text, targetLang) {
    const userId = getInstallId();
    const languageCode = normalizeLang(targetLang);
    const token = state.currentSettings?.token || '';
    
    return new Promise((resolve, reject) => {
        try {
            // Use speak-stream for lower latency (MP3 streaming)
            const u = new URL(`${config.BACKEND_URL}/api/v1/tts/speak-stream`);
            const body = JSON.stringify({ 
                user_id: userId, 
                device_id: userId, 
                text, 
                language: languageCode, 
                gender: 'female', 
                tts_engine: 'elevenlabs',
                provider: 'elevenlabs' 
            });

            const headers = {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            };

            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const req = https.request({
                hostname: u.hostname,
                port: u.port ? Number(u.port) : 443,
                path: u.pathname + (u.search || ''),
                method: 'POST',
                headers: headers,
                timeout: 30000 
            }, (res) => {
                const status = res.statusCode || 0;
                
                if (status === 401 || status === 403) {
                    sendToRenderer('log-message', `Phiên làm việc hết hạn (401). Vui lòng đăng nhập lại ứng dụng Cyan để tiếp tục.`, 'error');
                    resolve(); // Resolve to unblock queue but don't play
                    return;
                }

                if (status !== 200) {
                    const err = [];
                    res.on('data', (c) => err.push(c));
                    res.on('end', () => {
                        const txt = Buffer.concat(err).toString('utf8');
                        sendToRenderer('log-message', `Backend ElevenLabs stream lỗi (HTTP ${status}): ${txt}`, 'error');
                        resolve();
                    });
                    return;
                }
                
                // Handle streaming JSON lines
                let buffer = '';
                res.on('data', (c) => {
                    buffer += c.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    
                    for (const line of lines) {
                        if (line.trim()) {
                            try {
                                const data = JSON.parse(line);
                                if (data.audio) {
                                    const audioBuffer = Buffer.from(data.audio, 'base64');
                                    sendToRenderer('tts-audio-chunk', new Uint8Array(audioBuffer));
                                }
                            } catch (e) {
                                // Ignore malformed JSON lines
                            }
                        }
                    }
                });
                
                res.on('end', () => {
                    sendToRenderer('tts-audio-done');
                    sendToRenderer('log-message', `ElevenLabs TTS streaming: Phát thành công (${languageCode}).`, 'success');
                    resolve();
                });
            });

            req.on('error', (e) => {
                sendToRenderer('log-message', `Lỗi gọi Backend ElevenLabs stream: ${e.message}`, 'error');
                resolve(); // Resolve to allow next queue item
            });
            
            req.write(body);
            req.end();
        } catch (e) {
            sendToRenderer('log-message', `Lỗi gọi Backend ElevenLabs TTS: ${e && e.message ? e.message : 'unknown'}`, 'error');
            resolve();
        }
    });
}

async function callAzureTTSService(text, targetLang) {
    const languageCode = normalizeLang(targetLang);
    if (!azureKey || !azureRegion) {
        // fallback to backend streaming if no key
        return streamWaveNetOnce(text, targetLang, true);
    }
    let synthesizer = null;
    try {
        const speechConfig = sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
        speechConfig.speechSynthesisLanguage = languageCode;
        speechConfig.speechSynthesisVoiceName = getAzureVoiceName(targetLang);
        speechConfig.setProperty(
            sdk.PropertyId.SpeechServiceConnection_SynthOutputFormat,
            sdk.SpeechSynthesisOutputFormat.Raw16Khz16BitMonoPcm
        );

        const pullStream = sdk.AudioOutputStream.createPullStream();
        const audioConfig = sdk.AudioConfig.fromStreamOutput(pullStream);
        synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

        const readChunks = async () => {
            while (true) {
                const chunk = pullStream.read();
                if (!chunk || chunk.length === 0) break;
                sendToRenderer('tts-audio-chunk', new Uint8Array(chunk));
            }
        };

        const donePromise = new Promise((resolve, reject) => {
            synthesizer.synthesisCompleted = () => resolve();
            synthesizer.canceled = (_s, e) => reject(new Error(e.errorDetails || 'azure_synthesis_canceled'));
        });

        synthesizer.startSpeakingTextAsync(text);
        await donePromise;
        await readChunks();
        sendToRenderer('tts-audio-done');
        sendToRenderer('log-message', `Azure TTS streaming: Phát thành công (${languageCode}).`, 'success');
    } catch (e) {
        sendToRenderer('log-message', `Lỗi Azure TTS streaming: ${e.message}`, 'error');
    } finally {
        try { synthesizer?.close(); } catch (e) {
            logger.error('AzureTTS', 'Failed to close Azure synthesizer', e);
        }
    }
}

async function callGoogleWaveNetTTSService(text, targetLang) {
    return callGoogleWaveNetChunkedTTSService(text, targetLang);
}

function splitIntoSegments(text, maxChars = 100) {
    if (!text || text.length <= maxChars) return [text];
    
    // Split by common sentence terminators (., !, ?, ।, etc.) and commas
    // We use a regex that keeps the punctuation with the preceding text
    const parts = text.match(/[^.!?।,]+[.!?।,]*\s*/g) || [text];
    const segments = [];
    let currentSegment = "";

    for (const part of parts) {
        if ((currentSegment + part).length > maxChars && currentSegment.length > 0) {
            segments.push(currentSegment.trim());
            currentSegment = part;
        } else {
            currentSegment += part;
        }
    }
    
    if (currentSegment.trim()) {
        segments.push(currentSegment.trim());
    }
    
    return segments;
}

async function streamWaveNetOnce(text, targetLang, sendDone, retryCount = 0){
    try {
        const languageCode = normalizeLang(targetLang);
        const token = state.currentSettings?.token || '';
        
        // Validate input
        if (!text || text.trim().length === 0) {
            console.warn('[TTS] Empty text, skipping TTS call');
            if (sendDone !== false) sendToRenderer('tts-audio-done');
            return;
        }

        console.log(`🔊 Calling Backend TTS API: "${text.substring(0, 30)}..." -> ${languageCode}${retryCount > 0 ? ` (Retry #${retryCount})` : ''}`);
        
        const headers = {
            'Content-Type': 'application/json'
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const requestBody = {
            text: text,
            language: languageCode,
            gender: 'female',
            user_id: getInstallId(),
            device_id: getInstallId(),
            tts_engine: 'google',
            provider: 'google',
            voice_id: getGoogleVoiceName(targetLang),
            sample_rate_hertz: 16000
        };

        // Log request details for debugging
        console.log('[TTS] Request payload:', {
            textLength: text.length,
            language: languageCode,
            userId: getInstallId(),
            engine: 'google'
        });

        const response = await fetch(`${config.BACKEND_URL}/api/v1/tts/speak-stream`, {
            method: 'POST',
            signal: AbortSignal.timeout(30000),
            headers: headers,
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            let errorDetail = '';
            try {
                const errorBody = await response.text();
                errorDetail = errorBody.substring(0, 200); // Limit error message length
                console.error(`[TTS] Backend error response (${response.status}):`, errorDetail);
            } catch (e) {
                console.error(`[TTS] Could not read error body: ${e.message}`);
            }

            if (response.status === 401 || response.status === 403) {
                sendToRenderer('log-message', `Phiên làm việc hết hạn (401). Vui lòng đăng nhập lại ứng dụng Cyan để tiếp tục.`, 'error');
                return;
            }

            // Retry on 5xx errors up to 3 times with exponential backoff
            if (response.status >= 500 && retryCount < 3) {
                const delayMs = Math.min(1000 * Math.pow(2, retryCount), 10000);
                console.log(`[TTS] Retrying in ${delayMs}ms...`);
                await new Promise(r => setTimeout(r, delayMs));
                return streamWaveNetOnce(text, targetLang, sendDone, retryCount + 1);
            }

            throw new Error(`Backend TTS error ${response.status}${errorDetail ? ': ' + errorDetail : ''}`);
        }

        const contentType = response.headers.get('content-type') || '';
        console.log(`[TTS] Response received. Status: ${response.status}, Content-Type: ${contentType}`);

        // If it's a raw audio stream (like audio/mpeg or audio/wav), handle it as binary
        if (contentType.includes('audio/')) {
            console.log('[TTS] Handling raw binary audio stream');
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            console.log(`[TTS] Received total binary audio: ${buffer.length} bytes`);
            sendToRenderer('tts-audio-chunk', new Uint8Array(buffer));
            if (sendDone !== false) sendToRenderer('tts-audio-done');
            return;
        }

        // Otherwise, handle as streaming JSON lines
        let buffer = '';
        let chunkCount = 0;
        for await (const value of response.body) {
            chunkCount++;
            if (chunkCount === 1) {
                console.log(`[TTS] First data chunk arrived (${value.length} bytes)`);
            }

            buffer += value.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const data = JSON.parse(line);
                        if (data.audio) {
                            const audioBuffer = Buffer.from(data.audio, 'base64');
                            sendToRenderer('tts-audio-chunk', new Uint8Array(audioBuffer));
                        }
                    } catch (e) {
                        // If parsing fails but we have audio content-type, it might be raw data after all
                        console.warn('[TTS] Failed to parse JSON line from stream. Data might be raw binary.');
                    }
                }
            }
        }
        
        if (sendDone !== false){
            sendToRenderer('tts-audio-done');
        }
        sendToRenderer('log-message', `Backend TTS streaming: Phát thành công (${languageCode}).`, 'success');

    } catch (e) {
        const errorMsg = e.message.includes('500') 
            ? `Backend TTS service error. Please check backend status and logs.`
            : `Lỗi kết nối/gọi Backend TTS: ${e.message}`;
        sendToRenderer('log-message', errorMsg, 'error');
        console.error('[TTS] Error streaming audio:', {
            text: text.substring(0, 50),
            language: targetLang,
            error: e.message,
            stack: e.stack
        });
    }
}

async function callGoogleWaveNetChunkedTTSService(text, targetLang) {
    const segments = splitIntoSegments(text || '', 100); 
    console.log(`[TTS] Text split into ${segments.length} natural segments for sequential playback.`);
    
    for (let idx = 0; idx < segments.length; idx++) {
        const isLast = idx === segments.length - 1;
        // Await each segment to ensure sequential order
        await streamWaveNetOnce(segments[idx], targetLang, isLast);
    }
}
// 6. XỬ LÝ DỊCH THUẬT VÀ TTS (GIỮ NGUYÊN)
// =========================================================
async function translateAndSpeak(text, targetLang, ttsEngine, preTranslatedText = null) {
    try {
        console.log(`🔄 Starting translation/TTS flow for: "${text}" -> ${targetLang}`);
        
        // Helper to unescape HTML entities if they accidentally sneak in
        const unescapeHtml = (str) => {
            return str.replace(/&#([\d]+);/g, (match, dec) => String.fromCharCode(dec))
                      .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
                      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                      .replace(/&apos;/g, "'");
        };

        let translatedText = preTranslatedText || text;
        console.log(`[TTS] Input Text: "${text}", Pre-translated: "${preTranslatedText || 'none'}"`);
        
        // Only translate if not already translated by backend and key exists
        if (!preTranslatedText && GOOGLE_TRANSLATE_API_KEY && text.length > 0) {
            console.log(`📡 Local translation via Google REST API...`);
            const normalizedTag = normalizeLang(targetLang).split('-')[0];
            try {
                const resp = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_TRANSLATE_API_KEY}`, {
                    method: 'POST',
                    signal: AbortSignal.timeout(10000), // 10s for translation
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ q: text, target: normalizedTag, format: 'text' })
                });
                if (resp.ok) {
                    const data = await resp.json();
                    translatedText = data?.data?.translations?.[0]?.translatedText || text;
                    // Force unescape just in case Google API ignores 'format: text' (it happens)
                    translatedText = unescapeHtml(translatedText);
                    console.log(`✅ Local translation complete: "${translatedText}"`);
                } else {
                    console.error('Translate REST failed:', resp.status, await resp.text());
                }
            } catch (e) {
                console.error('Translate REST error:', e);
            }
        } else if (preTranslatedText) {
            translatedText = unescapeHtml(preTranslatedText);
            console.log(`✅ Using pre-translated text from backend: "${translatedText}"`);
        }

        sendToRenderer('translation:update', { 
            sourceText: text, 
            translatedText: translatedText 
        });

        // Fire-and-forget local snippet using ONNX (best effort)
        synthLocalSnippet(translatedText, targetLang).catch((e)=>{
            console.warn('Local snippet synth error', e.message);
        });

        try {
            if (state.overlayAlive && overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.webContents && !overlayWindow.webContents.isDestroyed()) {
                overlayWindow.webContents.send('translation-result', translatedText);
            }
        } catch (e) {
            logger.error('Overlay', 'Failed to send translation to overlay', e);
        }

        // Start TTS immediately
        console.log(`🔊 Starting TTS with engine: ${ttsEngine}`);
        if (ttsEngine === 'elevenlabs') {
            await callElevenLabsTTSService(translatedText, targetLang);
        } else if (ttsEngine === 'azure') {
            await callAzureTTSService(translatedText, targetLang);
        } else if (ttsEngine === 'google') {
            await callGoogleWaveNetTTSService(translatedText, targetLang);
        }

    } catch (e) {
        sendToRenderer('log-message', `Lỗi Dịch thuật/TTS: ${e.message}`, 'error');
        console.error('Translation/TTS Error:', e);
    }
}

// Sequential Queue Processor for TTS
async function processTtsQueue() {
    if (state.ttsInFlight || state.ttsQueue.length === 0) return;
    
    state.ttsInFlight = true;
    const item = state.ttsQueue.shift();
    
    try {
        console.log(`[QUEUE] Processing TTS: "${item.text.substring(0, 30)}..." (Queue left: ${state.ttsQueue.length})`);
        await translateAndSpeak(item.text, item.targetLang, item.ttsEngine, item.preTranslatedText);
        
        // Wait a small gap between sentences
        if (state.ttsQueue.length > 0) {
            await new Promise(r => setTimeout(r, MIN_TTS_GAP_MS));
        }
    } catch (e) {
        console.error('[QUEUE] TTS Error:', e);
    } finally {
        state.ttsInFlight = false;
        // Schedule next item
        setImmediate(processTtsQueue);
    }
}

async function tryTranslateAndSpeak(text, targetLang, ttsEngine, preTranslatedText = null) {
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    
    // Add to queue instead of skipping
    state.ttsQueue.push({
        text: trimmed,
        targetLang: normalizeLang(targetLang),
        ttsEngine,
        preTranslatedText
    });
    
    processTtsQueue();
}

function enqueueTts(text, targetLang, ttsEngine, preTranslatedText = null) {
    const trimmed = (text || '').trim();
    const charCount = trimmed.length;
    
    if (charCount < MIN_TTS_CHARS) {
        console.log(`⏩ [TTS] Skipping enqueue: "${trimmed}" (Length: ${charCount} < MIN: ${MIN_TTS_CHARS})`);
        return;
    }
    
    console.log(`🔊 [TTS] Enqueueing for processing: "${trimmed}" (Engine: ${ttsEngine}, Target: ${targetLang})`);
    // For "Final" results from STT, we trigger immediately (but it goes into our sequential queue)
    tryTranslateAndSpeak(trimmed, targetLang, ttsEngine, preTranslatedText);
}


// =========================================================
// 7. XỬ LÝ GOOGLE SPEECH-TO-TEXT STREAMING (GIỮ NGUYÊN)
// =========================================================

function startStream(sourceLangCode, sampleRate = 16000, token = '') { 
    if (state.recognizeStream) {
        stopStream();
    }

    // Reset realtime buffer/timing state for a clean new session
    audioBuffer = [];
    lastProcessTime = 0;
    audioChunkLogCounter = 0;
    
    sendToRenderer('log-message', `Chuẩn bị khởi tạo STT Stream. Code: ${sourceLangCode}, Rate: ${sampleRate}Hz`, 'info');
    sendToRenderer('log-message', `Khởi tạo Backend STT Stream cho ngôn ngữ: ${sourceLangCode}`, 'info');

    // Backend and WebSocket state
    state.isStreaming = true;
    sendToRenderer('log-message', 'STT Stream đã BẮT ĐẦU (WebSocket Mode). Đang chờ âm thanh...', 'success');
    
    // Initialize WebSocket connection
    const targetLangCode = state.currentSettings.targetLang;
    initWebSocketSTT(sourceLangCode, targetLangCode, sampleRate, token);

    // Schedule periodic recreation for long sessions
    scheduleStreamRecreation();
}

function initWebSocketSTT(sourceLangCode, targetLangCode, sampleRate, token) {
    if (state.wsSTT) {
        try { state.wsSTT.close(); } catch (e) {}
    }

    // Sanitize target language code (e.g. 'vn' -> 'vi', 'vi-VN' -> 'vi')
    const sanitizedTargetLang = normalizeLang(targetLangCode);
    
    const tokenPart = token ? `&token=${token}` : '';
    const url = `${config.BACKEND_URL.replace('http', 'ws')}/api/v1/stt?source_lang=${sourceLangCode}&target_lang=${sanitizedTargetLang}&sample_rate=${sampleRate}&user_id=${config.CYAN_USER_ID || 'guest'}${tokenPart}`;
    
    console.log(`[STT] Connecting to WebSocket: ${url.replace(token, 'REDACTED')}`);
    console.log(`[STT] Handshake Params: source=${sourceLangCode}, target=${sanitizedTargetLang}, rate=${sampleRate}`);
    state.wsSTT = new WebSocket(url);

    // Heartbeat mechanism to prevent idle timeouts
    let heartbeatTimer = null;
    const startHeartbeat = () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
            if (state.wsSTT && state.wsSTT.readyState === WebSocket.OPEN) {
                state.wsSTT.send(JSON.stringify({ type: 'ping' }));
            }
        }, 5000); // Every 5 seconds
    };

    const stopHeartbeat = () => {
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
    };

    state.wsSTT.on('open', () => {
        console.log("WS OPEN");
        state.wsReconnectAttempts = 0;
        sendToRenderer('log-message', `WebSocket STT: Đã kết nối. Target: ${sanitizedTargetLang}`, 'success');
        
        startHeartbeat();

        state.wsSTT.send(JSON.stringify({
            type: 'stt_start',
            payload: {
                language: sourceLangCode,
                lang: sourceLangCode,
                target_language: sanitizedTargetLang,
                target_lang: sanitizedTargetLang,
                sample_rate: sampleRate,
                sampleRate: sampleRate
            }
        }));
    });

    state.wsSTT.on('message', (data) => {
        try {
            const messageString = data.toString();
            const response = JSON.parse(messageString);
            
            // Check for STT results
            if (response.type === 'stt_result') {
                const payload = response.payload || response.data || {};
                const transcript = payload.transcript || payload.text || '';
                const translation = payload.translation || payload.translated_text || '';
                const isFinal = (payload.isFinal !== undefined) ? payload.isFinal : (payload.is_final || false);
                
                // --- UUID Normalization ---
                // If backend sends an internal UUID, promote it to our primary ID
                if (payload.user_id && payload.user_id.includes('-') && payload.user_id.length > 20) {
                    if (config.CYAN_USER_ID !== payload.user_id) {
                        console.log(`[MAIN] Normalizing ID: Promoting Google ID to internal UUID: ${payload.user_id}`);
                        config.CYAN_USER_ID = payload.user_id;
                    }
                }
                
                if (transcript) {
                    console.log(`[STT WS] Transcript: "${transcript}" (${isFinal ? 'Final' : 'Partial'})`);
                    
                    // Renderer expects 'stt-transcript' NOT 'stt-result'
                    sendToRenderer('stt-transcript', { transcript, isFinal });
                    
                    // Add a log that the user can see in the UI
                    if (isFinal) {
                        sendToRenderer('log-message', `[STT] Sentence Finalized: "${transcript}"`, 'success');
                    }

                    // Update UI translation feed if translation is present (even for partials)
                    if (translation) {
                        sendToRenderer('translation:update', { 
                            sourceText: transcript, 
                            translatedText: translation 
                        });
                    }

                    // Xử lý TTS khi có kết quả FINAL
                    if (isFinal && !state.isRecreatingStream) {
                        const engine = state.currentSettings.ttsEngine;
                        const targetLang = state.currentSettings.targetLang;

                        if (translation) {
                            console.log(`[STT WS] Translation final: "${translation}"`);
                            sendToRenderer('log-message', `[Cloud TTS] Triggering for: "${translation.substring(0, 30)}..." using ${engine}`, 'info');
                            
                            // Trigger TTS with pre-translated text
                            enqueueTts(transcript, targetLang, engine, translation);
                        } else {
                            // Fallback if no translation returned - local translate will be triggered
                            console.log(`[STT WS] Final transcript received (no translation): "${transcript}"`);
                            sendToRenderer('log-message', `[Cloud TTS] Triggering (no pre-translation) for: "${transcript.substring(0, 30)}..."`, 'warning');
                            enqueueTts(transcript, targetLang, engine);
                        }
                    }
                }
            } else if (response.type === 'error') {
                const payload = response.payload || response.data || {};
                const errorMsg = payload.message || response.message || response.error || response.err || "Unknown server error";
                console.error('[STT WS] Server Error:', errorMsg);
                console.dir(response, { depth: null }); // Detailed log
                sendToRenderer('log-message', `Lỗi STT Server: ${errorMsg}`, 'error');
            } else {
                // Log other message types for debugging
                console.log(`[STT WS] Received message: ${response.type || 'undefined-type'}`, response);
                if (response.event === 'error') { // Backend sometimes uses 'event'
                    const errorMsg = response.message || "Unauthorized or unknown error";
                    console.error('[STT WS] Connection/Auth Error:', errorMsg);
                    sendToRenderer('log-message', `Lỗi kết nối/authen: ${errorMsg}`, 'error');
                }
            }
        } catch (err) {
            console.error('[STT WS] Error parsing message:', err);
            const raw = data.toString();
            if (raw.length > 0) {
                console.log('[STT WS] Raw non-JSON response:', raw);
                sendToRenderer('log-message', `Server response (non-JSON): ${raw.substring(0, 50)}...`, 'warning');
            }
        }
    });

    state.wsSTT.on('error', (err) => {
        console.error('[STT] WebSocket Error:', err.message);
        if (err.code) console.error('[STT] Error Code:', err.code);
        sendToRenderer('log-message', `Lỗi kết nối WebSocket: ${err.message}`, 'error');
    });

    state.wsSTT.on('close', (code, reason) => {
        console.log("WS CLOSE", code);
        stopHeartbeat();

        if (state.isStreaming && state.wsReconnectAttempts < config.MAX_WS_RECONNECT_ATTEMPTS) {
            const delay = Math.min(1000 * Math.pow(2, state.wsReconnectAttempts), 10000);
            const targetLang = state.currentSettings.targetLang;
            console.log(`[STT] Reconnecting in ${delay}ms... (Attempt ${state.wsReconnectAttempts + 1}/${config.MAX_WS_RECONNECT_ATTEMPTS})`);
            console.log(`[STT] Reconnect params: source=${sourceLangCode}, target=${targetLang}`);
            
            if (state.wsReconnectTimer) clearTimeout(state.wsReconnectTimer);
            state.wsReconnectTimer = setTimeout(() => {
                state.wsReconnectAttempts++;
                initWebSocketSTT(sourceLangCode, targetLang, sampleRate, token);
            }, delay);
        } else if (state.wsReconnectAttempts >= config.MAX_WS_RECONNECT_ATTEMPTS) {
            sendToRenderer('log-message', 'Không thể kết nối lại WebSocket sau nhiều lần thử. Vui lòng kiểm tra mạng.', 'error');
        }
    });
}

// Backend STT streaming functions
let backendStreamResponse = null;
let audioBuffer = [];
let lastProcessTime = 0;
let audioChunkLogCounter = 0;
let streamRecreationTimer = null;
// NOTE:
// Fixed thresholds caused regressions when sample rate changed (48k -> 16k).
// Use dynamic chunk sizing so backend STT always gets a sufficient window.
// Increase window to give STT enough context (reduce empty transcripts)
const TARGET_REALTIME_WINDOW_MS = 800; // Reduced from 2000ms for faster initial transcript

// Recreate stream every 5 minutes to prevent long-running issues
function scheduleStreamRecreation() {
    if (streamRecreationTimer) clearTimeout(streamRecreationTimer);
    streamRecreationTimer = setTimeout(() => {
        console.log('[STT] Recreating stream for long-running stability...');
        if (state.isStreaming && state.currentSettings.sourceLang) {
            stopStream();
            setTimeout(() => {
                startStream(state.currentSettings.sourceLang, state.currentSettings.sampleRate);
                console.log('[STT] Stream recreated successfully');
            }, 100);
        }
        scheduleStreamRecreation(); // Schedule next recreation
    }, 5 * 60 * 1000); // 5 minutes
}


function handleSTTData(data) {
    if (data.done) {
        return;
    }

    if (data.error) {
        sendToRenderer('log-message', `STT Stream ERROR: ${data.error}`, 'error');
        return;
    }

    const transcript = data.transcript || '';
    const translation = data.translation || '';
    const isFinal = data.isFinal || false;

    if (isFinal) {
        const charCount = transcript.trim().length;
        console.log(`[STT] FINAL TRANSCRIPT: "${transcript}" (Length: ${charCount})`);
        
        state.lastFinalTranscript = transcript;
        sendToRenderer('stt-transcript', { transcript, isFinal: true });
        
        if (translation) {
            console.log(`[STT] Found pre-translation: ${translation}`);
            sendToRenderer('log-message', `Nhận được bản dịch từ backend: ${transcript} -> ${translation}`, 'success');
            if (!state.didTranslateForUtterance) {
                enqueueTts(transcript, state.currentSettings.targetLang, state.currentSettings.ttsEngine, translation);
                state.didTranslateForUtterance = true;
            }
        } else {
            sendToRenderer('log-message', `Nhận được transcript (final): ${transcript}`, 'info');
            if (!state.didTranslateForUtterance) {
                console.log(`[STT] No pre-translation, triggering normal translation/TTS flow`);
                enqueueTts(transcript, state.currentSettings.targetLang, state.currentSettings.ttsEngine);
                state.didTranslateForUtterance = true;
            }
        }
        // IMPORTANT: Reset the translation flag for the next utterance
        state.didTranslateForUtterance = false;
        state.sttFinalizing = false; // Reset finalizing flag after we get the final result
    } else {
        state.lastPartialTranscript = transcript;
        sendToRenderer('stt-transcript', { transcript, isFinal: false });
        if (transcript.trim().length > 0) {
            // Only log meaningful partials to console
            if (isDev) console.log(`[STT] partial: ${transcript}`);
            sendToRenderer('log-message', `Nhận được transcript (partial): ${transcript}`, 'info');
        }
    }

    if (state.recognizeStream && state.recognizeStream.dataCallback) {
        state.recognizeStream.dataCallback({
            results: [{
                alternatives: [{ transcript }],
                isFinal
            }]
        });
    }
}

function endBackendStream() {
    if (backendStreamResponse) {
        clearTimeout(backendStreamResponse);
        backendStreamResponse = null;
    }
    audioBuffer = [];
    lastProcessTime = 0;
    audioChunkLogCounter = 0;
}

function stopStream(reason = 'unknown') {
    console.log(`[STT] Stopping stream. Reason: ${reason}`);
    if (state.wsSTT) {
        try { 
            state.wsSTT.send(JSON.stringify({ type: 'stt_stop' })); 
        } catch (e) {
            logger.debug('WebSocket', 'Failed to send stt_stop on closed socket');
        }
        try { 
            state.wsSTT.close(); 
        } catch (e) {
            logger.error('WebSocket', 'Failed to close WebSocket', e);
        }
        state.wsSTT = null;
    }
    if (state.recognizeStream) {
        state.recognizeStream.end();
        state.recognizeStream = null;
    }
    state.isStreaming = false;
    
    // Clear stream recreation timer
    if (state.streamRecreationTimer) {
        clearTimeout(state.streamRecreationTimer);
        state.streamRecreationTimer = null;
    }

    if (state.wsReconnectTimer) {
        clearTimeout(state.wsReconnectTimer);
        state.wsReconnectTimer = null;
    }
    state.wsReconnectAttempts = 0;
    
    endBackendStream();
    resetSTTState();
}

ipcMain.on('audio-chunk', (event, chunk) => {
    if (!validateIPC('audio-chunk', chunk)) return;
    if (state.isStreaming) {
        let buf = null;
        if (Buffer.isBuffer(chunk)) {
            buf = chunk;
        } else if (chunk instanceof Uint8Array) {
            buf = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        } else if (chunk && chunk.buffer) {
            buf = Buffer.from(chunk.buffer);
        }

        if (buf && buf.length > 0) {
            // Enhanced logging for first chunk arrival
            if (!state.audioArrivalLogged) {
                console.log(`[MAIN] First audio chunk arrived: ${buf.length} bytes`);
                state.audioArrivalLogged = true;
            }

            // Send to WebSocket ONLY — no HTTP fallback to avoid 500 spam during reconnect
            if (state.wsSTT && state.wsSTT.readyState === WebSocket.OPEN) {
                state.wsSTT.send(buf);
                state.chunkCounter++;
                
                // Log progress every 100 chunks (~5-10 seconds of audio)
                if (state.chunkCounter % 100 === 0) {
                    console.log(`[STT WS] Sent ${state.chunkCounter} chunks (${buf.length} bytes each)`);
                }
            } else if (state.wsSTT && state.wsSTT.readyState === WebSocket.CONNECTING) {
                // Silently drop or queue? Dropping for now to avoid congestion
            }
            // Chunk is silently dropped while WS is reconnecting
        }
    }
});


// =========================================================
// 8. XỬ LÝ SỰ KIỆN GIAO DIỆN VÀ CẤU HÌNH (IPC HANDLERS) (GIỮ NGUYÊN)
// =========================================================
ipcMain.on('translation:toggle', (event, data) => {
    if (!validateIPC('translation:toggle', data)) return;
    try {
        const { isTranslating, sourceLang, targetLang, ttsEngine, sensitivity, sampleRate, token } = data;
        if (isTranslating) {
            state.chunkCounter = 0;
            state.audioArrivalLogged = false;
            updateSettings({
                sourceLang,
                targetLang,
                ttsEngine,
                sensitivity: sensitivity || 15,
                sampleRate: sampleRate || 16000,
                token: token || ''
            });
            sendToRenderer('log-message', `[MAIN PROCESS] Đã nhận lệnh START. Source: ${sourceLang}`, 'info'); 
            startStream(sourceLang, state.currentSettings.sampleRate, state.currentSettings.token); 
        } else {
            if (!state.isStreaming) {
                return;
            }
            sendToRenderer('log-message', `[MAIN PROCESS] Đã nhận lệnh STOP.`, 'info'); 
            stopStream('UI_TOGGLE_OFF');
        }
    } catch (error) {
        console.error(`[FATAL IPC ERROR IN translation:toggle]`, error);
        sendToRenderer('log-message', `LỖI CẤP CAO (IPC): Không thể xử lý luồng dịch thuật.`, 'error'); 
        stopStream('FATAL_IPC_ERROR');
    }
});

ipcMain.on('overlay:show', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.showInactive();
    }
});

ipcMain.on('overlay:hide', () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.hide();
    }
});

ipcMain.on('stt:finalize', () => {
    try {
        if (state.isStreaming) {
            state.sttFinalizing = true;
            // Send finalize message to backend if using WebSocket
            if (state.wsSTT && state.wsSTT.readyState === WebSocket.OPEN) {
                state.wsSTT.send(JSON.stringify({ type: 'finalize' }));
                console.log('[STT] Sent finalize to backend');
            }
            console.log('[STT] Finalize requested (hint sent to backend)');
        }
    } catch (e) {
        logger.error('STT', 'Failed during STT finalize', e);
    }
});

ipcMain.on('audio:autoconfigure', (event) => {
    console.log('[MAIN PROCESS] IPC: Kích hoạt cấu hình Audio tự động...');
    sendToRenderer('log-message', 'Tính năng cấu hình Audio tự động đang được phát triển...', 'info');
    
    setTimeout(() => {
        event.reply('audio:status', { success: false, message: 'Tính năng đang phát triển. Vui lòng cài đặt Virtual Audio Cable thủ công.' }); 
    }, 1000); 
});

ipcMain.on('window:close', () => {
    if (mainWindow) mainWindow.close();
});

ipcMain.on('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('cyan:getBackendUrl', async () => config.BACKEND_URL);
ipcMain.handle('cyan:getInstallId', async () => getInstallId());
ipcMain.handle('cyan:openExternal', async (_event, url) => {
    console.log('[MAIN] IPC: Received cyan:openExternal request for:', url);
    if (!validateIPC('cyan:openExternal', url)) {
        console.error('[MAIN] IPC: Validation failed for cyan:openExternal:', url);
        return { ok: false };
    }
    const u = (url || '').toString().trim();
    if (!u) return { ok: false };
    // Security: Only allow http and https protocols
    if (!u.startsWith('http://') && !u.startsWith('https://')) {
        console.warn('[MAIN] Blocked non-http(s) external URL:', u);
        return { ok: false };
    }
    try { 
        console.log('[MAIN] Opening external URL via shell:', u);
        await shell.openExternal(u); 
        return { ok: true }; 
    } catch (e) { 
        logger.error('Shell', `Failed to open external URL: ${u}`, e);
        return { ok: false }; 
    }
});

// 9. CẤU HÌNH VÀ TẠO CỬA SỔ
// =========================================================

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 1000,
        minHeight: 700,
        backgroundColor: '#01060a',
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            webSecurity: !config.IS_DEV,
            backgroundThrottling: false,
            webviewTag: true,
            preload: path.join(__dirname, 'preload.js')
        },
        title: 'Cyan ULTRA-LOW LATENCY AI TRANSLATOR',
        icon: path.join(__dirname, 'assets/icon.png')
    });

    // Check environment variable for port or default to 5173
    // Use 5421 as a secondary fallback if Vite switched ports
    const port = process.env.PORT || 5173;
    const startUrl = isDev
        ? `http://localhost:${port}`
        : `file://${path.join(__dirname, 'renderer/dist/index.html')}`;

    console.log(`[MAIN] Loading UI from: ${startUrl} (Dev Mode: ${isDev})`);
    mainWindow.loadURL(startUrl).catch(async (err) => {
        if (isDev && port === 5173) {
            console.warn('[MAIN] Port 5173 failed, trying secondary 5421...');
            return mainWindow.loadURL('http://localhost:5421');
        }
        throw err;
    });

    if (isDev) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    mainWindow.webContents.on('did-finish-load', () => {
        state.rendererAlive = true;
        state.suppressRendererIpc = false;
    });
    mainWindow.webContents.on('render-process-gone', (event, details) => {
        state.rendererAlive = false;
        try { 
            stopStream(); 
        } catch (e) {
            logger.error('Lifecycle', 'Failed to stop stream after renderer gone', e);
        }
        try { 
            if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide(); 
        } catch (e) {
            logger.debug('Lifecycle', 'Failed to hide overlay after renderer gone');
        }
        state.suppressRendererIpc = true;
        try { 
            logger.error('Lifecycle', 'Main renderer process gone', details); 
        } catch (e) {
            console.error('[Renderer Gone]', details && details.reason ? details.reason : 'unknown'); 
        }
    });
    mainWindow.webContents.on('destroyed', () => { state.rendererAlive = false; });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    console.log('Main window created');
}

function createOverlayWindow() {
    overlayWindow = new BrowserWindow({
        width: 800,
        height: 200,
        x: 100,
        y: 100,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload-overlay.js')
        },
        title: 'Translation Overlay',
        show: false // Hide initially
    });

    const overlayPath = path.join(__dirname, 'overlay.html');
    overlayWindow.loadFile(overlayPath);

    if (config.IS_DEV) {
        overlayWindow.webContents.openDevTools({ mode: 'detach' });
    }
    overlayWindow.webContents.on('did-finish-load', () => { state.overlayAlive = true; });
    overlayWindow.webContents.on('render-process-gone', () => { state.overlayAlive = false; });
    overlayWindow.webContents.on('destroyed', () => { state.overlayAlive = false; });

    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    console.log('Overlay window created');
}

app.whenReady().then(() => {
    createWindow(); 
    createOverlayWindow(); 
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
            createOverlayWindow();
        }
    });
});

// Periodic backend health check
let lastHealthStatus = null;
let healthCheckInterval = null;

function startHealthCheck() {
    if (healthCheckInterval) clearInterval(healthCheckInterval);
    
    const performCheck = async () => {
        try {
            const startTime = Date.now();
            const response = await fetch(`${config.BACKEND_URL}/health`, {
                signal: AbortSignal.timeout(5000)
            });
            const latency = Date.now() - startTime;
            
            const currentStatus = response.ok ? `OK (${response.status})` : `ERROR (${response.status})`;
            if (currentStatus !== lastHealthStatus) {
                console.log(`[Health Check] Backend status: ${currentStatus}, Latency: ${latency}ms`);
                lastHealthStatus = currentStatus;
            }
            
            sendToRenderer('server:status', { 
                connected: response.ok, 
                latency: latency 
            });
        } catch (error) {
            const currentStatus = `ERROR: ${error.message}`;
            if (currentStatus !== lastHealthStatus) {
                console.log('[Health Check] Backend connection failed:', error.message);
                lastHealthStatus = currentStatus;
            }
            sendToRenderer('server:status', { 
                connected: false, 
                error: error.message 
            });
        }
    };

    // Perform check immediately
    performCheck();

    // Then repeat every 10 seconds
    healthCheckInterval = setInterval(performCheck, 10000); 
}

// Start health check after app is ready
setTimeout(startHealthCheck, 500);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
