// main.js - Cấu hình Electron Forge và Xử lý Google STT/Translation Streaming

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { Piper } = require('./piper-handler');

// Manual dev detection to avoid ESM require issues
const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev') || !app.isPackaged;

const defaultUserData = app.getPath('userData');
const customUserData = path.join(defaultUserData, 'CyanDev');
try {
  fs.mkdirSync(customUserData, { recursive: true });
} catch {}

// Local ONNX TTS (Piper) for instant snippet
async function loadPiper(langCode){
    const lc = (langCode || '').toLowerCase();
    if (lc.startsWith('vi')){
        if (!piperVi){
            piperVi = new Piper(
                path.join(__dirname, 'assets', 'models', 'vi_VN-vivos-x_low.onnx'),
                path.join(__dirname, 'assets', 'models', 'vi_VN-vivos-x_low.onnx.json')
            );
            await piperVi.load();
        }
        return piperVi;
    }
    // default en
    if (!piperEn){
        piperEn = new Piper(
            path.join(__dirname, 'assets', 'models', 'en_US-lessac-medium.onnx'),
            path.join(__dirname, 'assets', 'models', 'en_US-lessac-medium.onnx.json')
        );
        await piperEn.load();
    }
    return piperEn;
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
    try{
        const snippet = (text||'').split(/\s+/).slice(0,5).join(' ');
        if (!snippet || snippet.length < MIN_TTS_CHARS) return;
        const p = await loadPiper(targetLang);
        if (!p) return;
        const audio = await p.synthesize(snippet, { lengthScale: 1.0, noise: 0.667, noiseW: 0.8 });
        const pcm16 = new Int16Array(audio.samples.buffer);
        const pcm16k = resample22050To16000(pcm16);
        sendToRenderer('tts-audio-chunk-local', new Uint8Array(pcm16k.buffer));
        sendToRenderer('tts-audio-done-local');
    }catch(e){
        console.warn('synthLocalSnippet failed', e.message);
    }
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
  try {
    const u = new URL(urlStr);
    const userId = u.searchParams.get('userId');
    if (userId && mainWindow) {
      mainWindow.webContents.send('auth-sync', { userId });
    }
  } catch (e) {
    console.error('Deep link error:', e);
  }
}

// Ensure autoplay works without user gesture during streaming
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// const { SpeechClient } = require('@google-cloud/speech'); // No longer needed - using backend API
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
const https = require('https'); 
const sdk = require('microsoft-cognitiveservices-speech-sdk'); 
const fetch = require('node-fetch'); 

// =====================================================================
// !!! GOOGLE CREDENTIALS - NO LONGER NEEDED IN ELECTRON !!!
// =====================================================================
// process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'google-credentials.json');


// =========================================================
// 1. BẢO MẬT API KEYS (CHỈ TỒN TẠI TRONG MAIN PROCESS)
// =========================================================
// *********************************************************
// THAY THẾ KEY VÀ VOICE ID THỰC TẾ CỦA BẠN VÀO ĐÂY
// *********************************************************
const BACKEND_URL = (process.env.BACKEND_URL || 'https://translator-backend-pi.vercel.app').toString().trim();
const CYAN_USER_ID = (process.env.CYAN_USER_ID || '').toString().trim();
const projectId = (process.env.GCP_PROJECT_ID || '').toString().trim();

// --- AZURE TTS CREDENTIALS ---
const azureKey = (process.env.AZURE_SPEECH_KEY || '').toString().trim();
const azureRegion = (process.env.AZURE_SPEECH_REGION || '').toString().trim();

// =========================================================
// 2. CẤU HÌNH GIỚI TÍNH ƯU TIÊN CHO AZURE TTS
// =========================================================
const AZURE_PREFERRED_GENDER = 'male'; 

// =========================================================
// 3. KHỞI TẠO CLIENT VÀ BIẾN TOÀN CỤC
// =========================================================
// const speechClient = projectId ? new SpeechClient({ projectId: projectId }) : new SpeechClient(); // No longer needed
const GOOGLE_TRANSLATE_API_KEY = (process.env.GOOGLE_TRANSLATE_API_KEY || process.env.TRANSLATE_API_KEY || '').trim();
const ttsClient = new TextToSpeechClient(); 

let recognizeStream = null;
let mainWindow = null;
let overlayWindow = null;
let piperEn = null;
let piperVi = null;
const MIN_TTS_CHARS = 8;
let currentSettings = {
    sourceLang: 'en-US', 
    targetLang: 'vi', 
    ttsEngine: 'google',
    sensitivity: 50
};
// TTS throttle state to avoid spamming provider (429)
let lastTtsAt = 0;
let ttsInFlight = false;
let ttsPendingTimer = null;
let ttsPendingText = '';
const MIN_TTS_GAP_MS = 400; // shorter gap when using debounce queue
const TTS_DEBOUNCE_MS = 400; // wait a short window to aggregate text
let isStreaming = false;
// STT partial aggregation for low-latency TTS without cutting too small
let sttLastSentIdx = 0;
let sttLastSendTs = 0;
let lastPartialTranscript = '';
let lastFinalTranscript = '';
let didTranslateForUtterance = false;
let sttFinalizing = false;
let rendererAlive = false;
let overlayAlive = false;
let suppressRendererIpc = false;

function getInstallId(){
    return CYAN_USER_ID || `install-${app.getPath('userData').split(path.sep).pop()}`;
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

    const selectedMap = (AZURE_PREFERRED_GENDER === 'male') ? maleVoiceMap : femaleVoiceMap;
    
    if (AZURE_PREFERRED_GENDER === 'male') {
         return selectedMap[targetLang] || 'en-US-RyanNeural'; 
    } else {
         return selectedMap[targetLang] || 'en-US-AvaMultilingualNeural'; 
    }
}


// =========================================================
// 5. CÁC HÀM GỌI DỊCH VỤ TTS (TEXT-TO-SPEECH) (GIỮ NGUYÊN)
// =========================================================

function sendToRenderer(channel, data, type = 'info') {
    try {
        if (
            rendererAlive &&
            !suppressRendererIpc &&
            mainWindow &&
            !mainWindow.isDestroyed() &&
            mainWindow.webContents &&
            !mainWindow.webContents.isDestroyed() &&
            !mainWindow.webContents.isLoadingMainFrame()
        ) {
            mainWindow.webContents.send(channel, data, type);
        }
    } catch (e) {}
}

function normalizeLang(code) {
    const v = String(code || '').trim();
    if (!v) return 'en-US';
    if (v.includes('-')) return v;
    const map = {
        en: 'en-US',
        vi: 'vi-VN',
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
    return map[v] || 'en-US';
}

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
    try {
        // Use speak-stream for lower latency (MP3 streaming)
        const u = new URL(`${BACKEND_URL}/api/tts/speak-stream`);
        const body = JSON.stringify({ 
            user_id: userId, 
            device_id: userId, 
            text, 
            language: languageCode, 
            gender: 'female', 
            tts_engine: 'elevenlabs' 
        });
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
            let pending = Buffer.alloc(0);
            const status = res.statusCode || 0;
            if (status !== 200) {
                const err = [];
                res.on('data', (c) => err.push(c));
                res.on('end', () => {
                    const txt = Buffer.concat(err).toString('utf8');
                    sendToRenderer('log-message', `Backend ElevenLabs stream lỗi (HTTP ${status}): ${txt}`, 'error');
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
            });
        });
        req.on('error', (e) => sendToRenderer('log-message', `Lỗi gọi Backend ElevenLabs stream: ${e.message}`, 'error'));
        req.write(body);
        req.end();
    } catch (e) {
        sendToRenderer('log-message', `Lỗi gọi Backend ElevenLabs TTS: ${e && e.message ? e.message : 'unknown'}`, 'error');
    }
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
        try { synthesizer?.close(); } catch {}
    }
}

async function callGoogleWaveNetTTSService(text, targetLang) {
    return callGoogleWaveNetChunkedTTSService(text, targetLang);
}

function splitIntoSegments(text){
    const words = (text || '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    if (words.length <= 8) return [text];
    const segments = [];
    let i = 0;
    while (i < words.length){
        const remain = words.length - i;
        const sz = Math.min(Math.max(6, Math.min(8, remain)), remain);
        const chunkWords = words.slice(i, i + sz);
        segments.push(chunkWords.join(' '));
        i += sz;
    }
    return segments;
}

async function streamWaveNetOnce(text, targetLang, sendDone){
    try {
        const langCodeMap = {
            'en': 'en-US', 'vi': 'vi-VN', 'es': 'es-ES', 'fr': 'fr-FR', 'de': 'de-DE',
            'it': 'it-IT', 'pt': 'pt-PT', 'ru': 'ru-RU', 'ja': 'ja-JP', 'ko': 'ko-KR',
            'zh': 'cmn-CN', 'hi': 'hi-IN', 'ar': 'ar-XA', 'bn': 'bn-IN', 'ms': 'ms-MY',
            'id': 'id-ID', 'th': 'th-TH', 'tr': 'tr-TR', 'pl': 'pl-PL', 'uk': 'uk-UA',
            'nl': 'nl-NL', 'sv': 'sv-SE', 'fi': 'fi-FI', 'da': 'da-DK', 'no': 'nb-NO',
            'cs': 'cs-CZ', 'el': 'el-GR', 'he': 'he-IL', 'ro': 'ro-RO', 'hu': 'hu-HU',
            'sk': 'sk-SK', 'bg': 'bg-BG', 'ca': 'ca-ES', 'hr': 'hr-HR', 'sr': 'sr-RS',
            'sl': 'sl-SI', 'et': 'et-EE', 'lv': 'lv-LV', 'lt': 'lt-LT', 'fil': 'fil-PH'
        };

        const languageCode = langCodeMap[targetLang] || 'en-US';
        
        console.log(`🔊 Calling Backend TTS API: "${text}" -> ${languageCode}`);
        
        const response = await fetch(`${BACKEND_URL}/api/tts/speak-stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text,
                language: languageCode,
                gender: 'female',
                user_id: getInstallId(),
                device_id: getInstallId(),
                tts_engine: 'google'
            })
        });

        if (!response.ok) {
            throw new Error(`Backend TTS stream error: ${response.status}`);
        }

        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
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
        }
        
        if (sendDone !== false){
            sendToRenderer('tts-audio-done');
        }
        sendToRenderer('log-message', `Backend TTS streaming: Phát thành công (${languageCode}).`, 'success');

    } catch (e) {
        sendToRenderer('log-message', `Lỗi kết nối/gọi Backend TTS: ${e.message}`, 'error');
        console.error('Backend TTS Error:', e);
    }
}

async function callGoogleWaveNetChunkedTTSService(text, targetLang){
    const segments = splitIntoSegments(text || '');
    if (segments.length === 0) return;
    for (let idx = 0; idx < segments.length; idx++){
        const isLast = idx === segments.length - 1;
        // do not await each; start next quickly to reduce perceived gap
        // eslint-disable-next-line no-await-in-loop
        await streamWaveNetOnce(segments[idx], targetLang, isLast);
    }
}
// 6. XỬ LÝ DỊCH THUẬT VÀ TTS (GIỮ NGUYÊN)
// =========================================================
async function translateAndSpeak(text, targetLang, ttsEngine) {
    try {
        console.log(`🔄 Starting translation: "${text}" -> ${targetLang}`);
        
        // Translate via REST API (API key)
        let translatedText = text;
        if (GOOGLE_TRANSLATE_API_KEY) {
            try {
                const resp = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_TRANSLATE_API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ q: text, target: targetLang.split('-')[0] || targetLang })
                });
                if (resp.ok) {
                    const data = await resp.json();
                    translatedText = data?.data?.translations?.[0]?.translatedText || text;
                } else {
                    console.error('Translate REST failed:', resp.status, await resp.text());
                }
            } catch (e) {
                console.error('Translate REST error:', e);
            }
        }

        console.log(`✅ Translation complete: "${translatedText}"`);
        sendToRenderer('translation:update', { 
            sourceText: text, 
            translatedText: translatedText 
        });

        // Fire-and-forget local snippet using ONNX (best effort)
        synthLocalSnippet(translatedText, targetLang).catch((e)=>{
            console.warn('Local snippet synth error', e.message);
        });

        try {
            if (overlayAlive && overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.webContents && !overlayWindow.webContents.isDestroyed()) {
                overlayWindow.webContents.send('translation-result', translatedText);
            }
        } catch (e) {}

        // Start TTS immediately after translation
        console.log(`🔊 Starting TTS with engine: ${ttsEngine}`);
        if (ttsEngine === 'elevenlabs') {
            console.log(`🔊 Using ElevenLabs TTS engine`);
            await callElevenLabsTTSService(translatedText, targetLang);
        } else if (ttsEngine === 'azure') {
            console.log(`🔊 Using Azure TTS engine`);
            await callAzureTTSService(translatedText, targetLang);
        } else if (ttsEngine === 'google') {
            console.log(`🔊 Using Google TTS engine`);
            await callGoogleWaveNetTTSService(translatedText, targetLang);
        } else {
            console.log(`🔊 Unknown TTS engine: ${ttsEngine}`);
        }

    } catch (e) {
        sendToRenderer('log-message', `Lỗi Dịch thuật/TTS: ${e.message}`, 'error');
        console.error('Translation/TTS Error:', e);
    }
}

// Simple throttle to avoid spamming TTS provider (429)
async function tryTranslateAndSpeak(text, targetLang, ttsEngine) {
    const now = Date.now();
    const trimmed = (text || '').trim();
    if (trimmed.length < MIN_TTS_CHARS) {
        console.log(`⏩ Skip TTS: text too short (${trimmed.length} chars)`);
        return;
    }
    if (now - lastTtsAt < MIN_TTS_GAP_MS) {
        console.log(`⏩ Skip TTS: gap too short (${now - lastTtsAt}ms < ${MIN_TTS_GAP_MS}ms)`);
        return;
    }
    if (ttsInFlight) {
        console.log('⏩ Skip TTS: another TTS in flight');
        return;
    }
    lastTtsAt = now;
    ttsInFlight = true;
    try {
        await translateAndSpeak(trimmed, targetLang, ttsEngine);
    } finally {
        ttsInFlight = false;
    }
}

function enqueueTts(text, targetLang, ttsEngine) {
    const trimmed = (text || '').trim();
    if (trimmed.length < MIN_TTS_CHARS) {
        console.log(`⏩ Skip enqueue: text too short (${trimmed.length} chars)`);
        return;
    }
    ttsPendingText = trimmed;
    if (ttsPendingTimer) clearTimeout(ttsPendingTimer);
    ttsPendingTimer = setTimeout(() => {
        ttsPendingTimer = null;
        tryTranslateAndSpeak(ttsPendingText, targetLang, ttsEngine);
    }, TTS_DEBOUNCE_MS);
}


// =========================================================
// 7. XỬ LÝ GOOGLE SPEECH-TO-TEXT STREAMING (GIỮ NGUYÊN)
// =========================================================

function startStream(sourceLangCode, sampleRate = 16000) { 
    if (recognizeStream) {
        stopStream();
    }

    // Reset realtime buffer/timing state for a clean new session
    audioBuffer = [];
    lastProcessTime = 0;
    audioChunkLogCounter = 0;
    
    sendToRenderer('log-message', `Chuẩn bị khởi tạo STT Stream. Code: ${sourceLangCode}, Rate: ${sampleRate}Hz`, 'info');
    sendToRenderer('log-message', `Khởi tạo Backend STT Stream cho ngôn ngữ: ${sourceLangCode}`, 'info');

    // Create backend streaming connection
    recognizeStream = {
        write: (chunk) => {
            // Send audio chunk to backend
            sendAudioChunkToBackend(chunk, sourceLangCode, sampleRate);
        },
        end: () => {
            // End streaming
            endBackendStream();
        },
        on: (event, callback) => {
            // Handle events
            if (event === 'error') {
                recognizeStream.errorCallback = callback;
            } else if (event === 'data') {
                recognizeStream.dataCallback = callback;
            } else if (event === 'end') {
                recognizeStream.endCallback = callback;
            }
        },
        writable: true,
        destroy: () => {
            recognizeStream = null;
        }
    };

    isStreaming = true;
    sendToRenderer('log-message', 'STT Stream đã BẮT ĐẦU. Đang chờ âm thanh...', 'success');
    
    // Schedule periodic recreation for long sessions
    scheduleStreamRecreation();
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
const TARGET_REALTIME_WINDOW_MS = 2000;

// Recreate stream every 5 minutes to prevent long-running issues
function scheduleStreamRecreation() {
    if (streamRecreationTimer) clearTimeout(streamRecreationTimer);
    streamRecreationTimer = setTimeout(() => {
        console.log('[STT] Recreating stream for long-running stability...');
        if (isStreaming && currentSettings.sourceLang) {
            stopStream();
            setTimeout(() => {
                startStream(currentSettings.sourceLang, currentSettings.sampleRate);
                console.log('[STT] Stream recreated successfully');
            }, 100);
        }
        scheduleStreamRecreation(); // Schedule next recreation
    }, 5 * 60 * 1000); // 5 minutes
}

function getRealtimeChunkThresholds(sampleRate) {
    const safeRate = Number(sampleRate) > 0 ? Number(sampleRate) : 16000;
    // Target ~1.6s of audio to improve STT accuracy; allow fallback at max interval
    const minChunkSizeBytes = Math.round((safeRate * 2) * 1.6);
    const maxIntervalMs = 4500;
    return {
        minChunkIntervalMs: TARGET_REALTIME_WINDOW_MS,
        minChunkSizeBytes,
        maxIntervalMs
    };
}

function sendAudioChunkToBackend(chunk, language, sampleRate) {
    // Add to buffer for smart processing
    audioBuffer.push(chunk);
    const now = Date.now();

    if (!lastProcessTime) {
        lastProcessTime = now;
    }
    
    audioChunkLogCounter++;
    if (audioChunkLogCounter % 40 === 0) {
        console.log(`🎤 Audio chunk received: ${chunk.length} bytes, buffer: ${audioBuffer.length} chunks`);
    }
    
    // Process immediately if buffer is large enough or enough time passed
    const totalSize = audioBuffer.reduce((sum, buf) => sum + buf.length, 0);
    const timeSinceLastProcess = now - lastProcessTime;
    const approxAudioMs = Math.round((totalSize / (sampleRate * 2)) * 1000);
    const { minChunkIntervalMs, minChunkSizeBytes, maxIntervalMs } = getRealtimeChunkThresholds(sampleRate);
    
    // Require at least minChunkSizeBytes unless we've waited too long (maxIntervalMs)
    if (totalSize < minChunkSizeBytes && timeSinceLastProcess < maxIntervalMs) {
        return;
    }
    
    if (totalSize >= minChunkSizeBytes || timeSinceLastProcess >= maxIntervalMs) {
        // Log less frequently to reduce noise
        if (audioChunkLogCounter % 20 === 0) {
            console.log(`🎤 Triggering real-time processing (${totalSize} bytes, ~${approxAudioMs}ms audio, ${timeSinceLastProcess}ms since last, minBytes=${minChunkSizeBytes}, minMs=${minChunkIntervalMs})`);
        }
        const combinedChunk = Buffer.concat(audioBuffer);
        processAudioChunk(combinedChunk, language, sampleRate);
        audioBuffer = [];
        lastProcessTime = now;
    }
}

async function processAudioChunk(chunk, language, sampleRate) {
    try {
        // Convert chunk to base64 immediately
        const audioBase64 = chunk.toString('base64');
        
        console.log(`🎤 Processing real-time chunk: ${chunk.length} bytes`);
        
        // Send to backend for immediate recognition
        const response = await fetch(`${BACKEND_URL}/api/stt/recognize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                audio: audioBase64,
                language: language,
                sampleRate: sampleRate
            })
        });

        console.log(`🎤 Real-time backend response: ${response.status}`);

        if (response.ok) {
            const result = await response.json();
            console.log(`🎤 Real-time result:`, result);
            
            if (result.transcript && result.transcript.trim().length > 0) {
                handleSTTData({
                    transcript: result.transcript,
                    isFinal: true,
                    confidence: result.confidence || 0
                });
            }
        }
    } catch (error) {
        console.error('🎤 Real-time processing error:', error);
        // Don't show error to user for real-time chunks to avoid spam
    }
}

async function processAudioBatch(language, sampleRate) {
    if (audioBuffer.length === 0) return;
    
    try {
        // Combine all audio chunks
        const combinedAudio = Buffer.concat(audioBuffer);
        const audioBase64 = combinedAudio.toString('base64');
        
        console.log(`🎤 Processing audio batch: ${audioBuffer.length} chunks, ${combinedAudio.length} bytes`);
        
        // Only process if we have enough audio (at least 1 second)
        if (combinedAudio.length < 48000) { // 1 second at 48kHz
            console.log(`🎤 Audio too short (${combinedAudio.length} bytes), skipping processing`);
            return;
        }
        
        // Send to backend for recognition
        const response = await fetch(`${BACKEND_URL}/api/stt/recognize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                audio: audioBase64,
                language: language,
                sampleRate: sampleRate
            })
        });

        console.log(`🎤 Backend response status: ${response.status}`);

        if (!response.ok) {
            throw new Error(`Backend STT error: ${response.status}`);
        }

        const result = await response.json();
        
        console.log(`🎤 Backend result:`, result);
        
        if (result.transcript && result.transcript.trim().length > 0) {
            handleSTTData({
                transcript: result.transcript,
                isFinal: true,
                confidence: result.confidence || 0
            });
        } else {
            console.log(`🎤 No speech detected in audio batch`);
        }

        if (result.error) {
            handleSTTData({ error: result.error });
        }

    } catch (error) {
        console.error('Backend STT batch error:', error);
        sendToRenderer('log-message', `STT ERROR: ${error.message}`, 'error');
        if (recognizeStream && recognizeStream.errorCallback) {
            recognizeStream.errorCallback(error);
        }
    } finally {
        // Clear buffer and reset timer
        audioBuffer = [];
        backendStreamResponse = null;
        console.log(`🎤 Audio buffer cleared, ready for next batch`);
        
        // Continue processing if still streaming
        if (isStreaming) {
            console.log(`🎤 Still streaming, setting up next batch processing`);
            backendStreamResponse = setTimeout(() => {
                processAudioBatch(language, sampleRate);
            }, 3000); // Use 3 seconds
        }
    }
}

function handleSTTData(data) {
    if (data.done) {
        if (recognizeStream && recognizeStream.endCallback) {
            recognizeStream.endCallback();
        }
        return;
    }

    if (data.error) {
        sendToRenderer('log-message', `STT Stream ERROR: ${data.error}`, 'error');
        if (recognizeStream && recognizeStream.errorCallback) {
            recognizeStream.errorCallback(new Error(data.error));
        }
        return;
    }

    const transcript = data.transcript || '';
    const isFinal = data.isFinal || false;

    if (isFinal) {
        lastFinalTranscript = transcript;
        sendToRenderer('stt-final', transcript);
        sendToRenderer('log-message', `Nhận được transcript (final): ${transcript}`, 'info');
        if (!didTranslateForUtterance) {
            enqueueTts(transcript, currentSettings.targetLang, currentSettings.ttsEngine);
            didTranslateForUtterance = true;
        }
    } else {
        lastPartialTranscript = transcript;
        sendToRenderer('stt-partial', transcript);
        if (transcript.trim().length > 0) {
            sendToRenderer('log-message', `Nhận được transcript (partial): ${transcript}`, 'info');
        }
    }

    if (recognizeStream && recognizeStream.dataCallback) {
        recognizeStream.dataCallback({
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

function stopStream() {
    if (recognizeStream) {
        recognizeStream.end();
        recognizeStream = null;
        isStreaming = false;
    }
    
    // Clear stream recreation timer
    if (streamRecreationTimer) {
        clearTimeout(streamRecreationTimer);
        streamRecreationTimer = null;
    }
    
    endBackendStream();
    sttFinalizing = false;
    lastPartialTranscript = '';
    lastFinalTranscript = '';
    didTranslateForUtterance = false;
}

ipcMain.on('audio-chunk', (event, chunk) => {
    if (recognizeStream && isStreaming && !sttFinalizing) {
        let buf = null;
        if (Buffer.isBuffer(chunk)) {
            buf = chunk;
        } else if (chunk instanceof Uint8Array) {
            buf = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        } else if (chunk && chunk.buffer) {
            buf = Buffer.from(chunk.buffer);
        }
        if (buf && buf.length > 0) {
            recognizeStream.write(buf);
        }
    }
});


// =========================================================
// 8. XỬ LÝ SỰ KIỆN GIAO DIỆN VÀ CẤU HÌNH (IPC HANDLERS) (GIỮ NGUYÊN)
// =========================================================
ipcMain.on('translation:toggle', (event, { isTranslating, sourceLang, targetLang, ttsEngine, sensitivity, sampleRate }) => {
    try { 
        console.log(`[MAIN PROCESS CHECK] IPC TOGGLE RECEIVED. isTranslating: ${isTranslating}, sampleRate: ${sampleRate}`);
        event.reply('server:status', { connected: true, latency: 50 });

        if (isTranslating) {
            if (isStreaming && recognizeStream && currentSettings.sourceLang === sourceLang && currentSettings.targetLang === targetLang && currentSettings.ttsEngine === ttsEngine && currentSettings.sampleRate === (sampleRate || currentSettings.sampleRate)) {
                return;
            }
            currentSettings.sourceLang = sourceLang;
            currentSettings.targetLang = targetLang;
            currentSettings.ttsEngine = ttsEngine;
            currentSettings.sensitivity = sensitivity || 50; 
            currentSettings.sampleRate = sampleRate || 16000;
            sendToRenderer('log-message', `[MAIN PROCESS] Đã nhận lệnh START. Source: ${sourceLang}`, 'info'); 
            startStream(sourceLang, currentSettings.sampleRate); // Pass sampleRate
        } else {
            if (!isStreaming) {
                return;
            }
            sendToRenderer('log-message', `[MAIN PROCESS] Đã nhận lệnh STOP.`, 'info'); 
            stopStream();
        }
    } catch (error) {
        console.error(`[FATAL IPC ERROR IN translation:toggle]`, error);
        sendToRenderer('log-message', `LỖI CẤP CAO (IPC): Không thể xử lý luồng dịch thuật.`, 'error'); 
        stopStream();
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
        if (recognizeStream && isStreaming) {
            sttFinalizing = true;
            recognizeStream.end();
        }
    } catch {}
});

ipcMain.on('audio:autoconfigure', (event) => {
    console.log('[MAIN PROCESS] IPC: Kích hoạt cấu hình Audio tự động...');
    sendToRenderer('log-message', 'Bắt đầu cấu hình VAC/Audio Driver...', 'info');
    
    setTimeout(() => {
        event.reply('audio:status', { success: true, message: 'Cấu hình Audio hoàn tất.' }); 
        sendToRenderer('log-message', 'Cấu hình Audio (Giả lập) hoàn tất.', 'success');
    }, 3000); 
});

ipcMain.on('window:close', () => {
    if (mainWindow) mainWindow.close();
});

ipcMain.on('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('cyan:getBackendUrl', async () => BACKEND_URL);
ipcMain.handle('cyan:getInstallId', async () => getInstallId());
ipcMain.handle('cyan:openExternal', async (_event, url) => {
    const u = (url || '').toString().trim();
    if (!u) return { ok: false };
    try { await shell.openExternal(u); return { ok: true }; } catch { return { ok: false }; }
});

// 9. CẤU HÌNH VÀ TẠO CỬA SỔ
// =========================================================

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 1000,
        minHeight: 700,
        backgroundColor: '#1a202c',
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            webSecurity: !isDev,
            backgroundThrottling: false,
            webviewTag: true,
            preload: path.join(__dirname, 'preload.js')
        },
        title: 'Cyan ULTRA-LOW LATENCY AI TRANSLATOR',
        icon: path.join(__dirname, 'assets/icon.png')
    });

    // Check environment variable for port or default to 5173
    const port = process.env.PORT || 5173;
    const startUrl = isDev
        ? `http://localhost:${port}`
        : `file://${path.join(__dirname, 'renderer/dist/index.html')}`;

    mainWindow.loadURL(startUrl);

    if (isDev) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    mainWindow.webContents.on('did-finish-load', () => {
        rendererAlive = true;
        suppressRendererIpc = false;
    });
    mainWindow.webContents.on('render-process-gone', (event, details) => {
        rendererAlive = false;
        try { stopStream(); } catch {}
        try { if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide(); } catch {}
        suppressRendererIpc = true;
        try { console.error('[Renderer Gone]', details && details.reason ? details.reason : 'unknown'); } catch {}
    });
    mainWindow.webContents.on('destroyed', () => { rendererAlive = false; });

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
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        title: 'Translation Overlay',
        show: false // Hide initially
    });

    const overlayPath = path.join(__dirname, 'overlay.html');
    overlayWindow.loadFile(overlayPath);

    if (isDev) {
        overlayWindow.webContents.openDevTools({ mode: 'detach' });
    }
    overlayWindow.webContents.on('did-finish-load', () => { overlayAlive = true; });
    overlayWindow.webContents.on('render-process-gone', () => { overlayAlive = false; });
    overlayWindow.webContents.on('destroyed', () => { overlayAlive = false; });

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
    
    healthCheckInterval = setInterval(async () => {
        try {
            const startTime = Date.now();
            const response = await fetch(`${BACKEND_URL}/api/health`);
            const status = response.ok ? 'OK' : 'ERROR';
            const latency = Date.now() - startTime;
            
            // Only log when status changes
            const currentStatus = `${status} (${response.status})`;
            if (currentStatus !== lastHealthStatus) {
                console.log(`[Health Check] Backend status: ${currentStatus}, Latency: ${latency}ms`);
                lastHealthStatus = currentStatus;
            }
            
            sendToRenderer('server-status', { 
                connected: response.ok, 
                latency: latency 
            });
        } catch (error) {
            const currentStatus = `ERROR: ${error.message}`;
            if (currentStatus !== lastHealthStatus) {
                console.log('[Health Check] Backend error:', error.message);
                lastHealthStatus = currentStatus;
            }
            sendToRenderer('server-status', { 
                connected: false, 
                error: error.message 
            });
        }
    }, 60000); // Check every 60 seconds (reduced noise)
}

// Start health check after app is ready
setTimeout(startHealthCheck, 2000);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
