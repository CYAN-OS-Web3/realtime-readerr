// main.js - Cấu hình Electron và Xử lý Google STT/Translation Streaming (VER MỚI NHẤT)

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const url = require('url');

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

// Check for development mode
const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

// Ensure autoplay works without user gesture during streaming
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// const { SpeechClient } = require('@google-cloud/speech'); // No longer needed - using backend API
const { Translate } = require('@google-cloud/translate').v2;
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
const translateClient = projectId ? new Translate({ projectId: projectId }) : new Translate();
const ttsClient = new TextToSpeechClient(); 

let recognizeStream = null;
let mainWindow = null;
let overlayWindow = null;
let currentSettings = {
    sourceLang: 'en-US', 
    targetLang: 'vi', 
    ttsEngine: 'google',
    sensitivity: 50
};
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
    const userId = CYAN_USER_ID || `install-${app.getPath('userData').split(path.sep).pop()}`;
    const languageCode = normalizeLang(targetLang);
    try {
        const u = new URL(`${BACKEND_URL}/api/tts/speak-pcm-stream`);
        const body = JSON.stringify({ user_id: userId, device_id: userId, text, language: languageCode, gender: 'female' });
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
                    sendToRenderer('log-message', `Backend PCM stream lỗi (HTTP ${status}): ${txt}`, 'error');
                });
                return;
            }
            res.on('data', (c) => {
                const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
                pending = pending.length ? Buffer.concat([pending, buf]) : buf;
                const even = pending.length - (pending.length % 2);
                if (even <= 0) return;
                const out = pending.subarray(0, even);
                pending = pending.subarray(even);
                sendToRenderer('tts-audio-chunk', new Uint8Array(out));
            });
            res.on('end', () => {
                sendToRenderer('tts-audio-done');
            });
        });
        req.on('error', (e) => sendToRenderer('log-message', `Lỗi gọi Backend stream: ${e.message}`, 'error'));
        req.write(body);
        req.end();
    } catch (e) {
        sendToRenderer('log-message', `Lỗi gọi Backend TTS: ${e && e.message ? e.message : 'unknown'}`, 'error');
    }
}

async function callAzureTTSService(text, targetLang) {
    if (!azureKey || !azureRegion || azureKey.length < 50) { 
        sendToRenderer('log-message', 'Lỗi Azure TTS: Azure Key hoặc Region chưa được cấu hình (hoặc key quá ngắn) trong main.js.', 'error');
        return;
    }
    const speechConfig = sdk.SpeechConfig.fromSubscription(azureKey, azureRegion);
    speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.MP3;

    const voiceName = getAzureVoiceName(targetLang);
    speechConfig.speechSynthesisVoiceName = voiceName;

    const synthesizer = new sdk.SpeechSynthesizer(speechConfig);

    try {
        const result = await new Promise((resolve, reject) => {
            synthesizer.speakTextAsync(text, resolve, reject);
        });

        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            const audioData = result.audioData;
            const audioBuffer = Buffer.from(audioData);
            sendToRenderer('tts-audio-ready', new Uint8Array(audioBuffer));
            sendToRenderer('log-message', `Azure TTS: Phát thành công bằng giọng ${voiceName}.`, 'success');
        } else if (result.reason === sdk.ResultReason.Canceled) {
             const cancellation = sdk.CancellationDetails.fromResult(result);
             let reason = cancellation.reason;
             let errorMsg = `Azure TTS CANCELED. Reason: ${reason}. Details: ${cancellation.errorDetails}`;
             
             if (reason === sdk.CancellationReason.Error) {
                 errorMsg += "\n*** HƯỚNG DẪN: Kiểm tra lại Azure Key và Region trong main.js! ***";
             }
             sendToRenderer('log-message', errorMsg, 'error');
             console.error('Azure TTS Cancellation Details:', cancellation);

        } else {
            sendToRenderer('log-message', `Azure TTS: Lỗi tổng hợp giọng nói. Lý do: ${result.reason}`, 'error');
            console.error('Azure TTS Error:', result.errorDetails);
        }
    } catch (e) {
        sendToRenderer('log-message', `Lỗi Azure TTS (Exception): ${e.message}`, 'error');
    } finally {
        synthesizer.close();
    }
}

async function callGoogleWaveNetTTSService(text, targetLang) {
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
        
        const response = await fetch(`${BACKEND_URL}/api/tts/speak`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text,
                language: languageCode,
                gender: 'female',
                user_id: 'electron-user-123'
            })
        });

        if (!response.ok) {
            throw new Error(`Backend TTS error: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.audio) {
            const audioBuffer = Buffer.from(result.audio, 'base64');
            sendToRenderer('tts-audio-ready', new Uint8Array(audioBuffer));
            sendToRenderer('log-message', `Backend TTS: Phát thành công (${languageCode}).`, 'success');
        } else {
            sendToRenderer('log-message', 'Lỗi Backend TTS: Không nhận được nội dung âm thanh.', 'error');
        }

    } catch (e) {
        sendToRenderer('log-message', `Lỗi kết nối/gọi Backend TTS: ${e.message}`, 'error');
        console.error('Backend TTS Error:', e);
    }
}


// =========================================================
// 6. XỬ LÝ DỊCH THUẬT VÀ TTS (GIỮ NGUYÊN)
// =========================================================
async function translateAndSpeak(text, targetLang, ttsEngine) {
    try {
        const [translation] = await translateClient.translate(text, targetLang);
        const translatedText = translation;

        sendToRenderer('translation:update', { 
            sourceText: text, 
            translatedText: translatedText 
        });

        try {
            if (overlayAlive && overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.webContents && !overlayWindow.webContents.isDestroyed()) {
                overlayWindow.webContents.send('translation-result', translatedText);
            }
        } catch (e) {}

        if (ttsEngine === 'elevenlabs') {
            console.log(`🔊 Using ElevenLabs TTS engine`);
            await callElevenLabsTTSService(translatedText, targetLang);
        } else if (ttsEngine === 'azure') {
            console.log(`🔊 Using Azure TTS engine`);
            await callAzureTTSService(translatedText, targetLang);
        } else if (ttsEngine === 'google') {
            console.log(`🔊 Using Google TTS engine`);
            callGoogleWaveNetTTSService(translatedText, targetLang);
        } else {
            console.log(`🔊 Unknown TTS engine: ${ttsEngine}`);
        }

    } catch (e) {
        sendToRenderer('log-message', `Lỗi Dịch thuật/TTS: ${e.message}`, 'error');
        console.error('Translation/TTS Error:', e);
    }
}


// =========================================================
// 7. XỬ LÝ GOOGLE SPEECH-TO-TEXT STREAMING (GIỮ NGUYÊN)
// =========================================================

function startStream(sourceLangCode, sampleRate = 16000) { 
    if (recognizeStream) {
        stopStream();
    }
    
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
}

// Backend STT streaming functions
let backendStreamResponse = null;
let audioBuffer = [];

function sendAudioChunkToBackend(chunk, language, sampleRate) {
    // Collect audio chunks
    audioBuffer.push(chunk);
    console.log(`🎤 Collected audio chunk: ${chunk.length} bytes, total chunks: ${audioBuffer.length}`);
    
    // Send to backend for batch processing every 3 seconds (increased from 2)
    if (!backendStreamResponse) {
        backendStreamResponse = setTimeout(() => {
            console.log(`🎤 Triggering batch processing after 3 seconds`);
            processAudioBatch(language, sampleRate);
        }, 3000); // Increased to 3 seconds
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
            translateAndSpeak(transcript, currentSettings.targetLang, currentSettings.ttsEngine);
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
}

function stopStream() {
    if (recognizeStream) {
        recognizeStream.end();
        recognizeStream = null;
        isStreaming = false;
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

    const startUrl = isDev
        ? 'http://localhost:5173'
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

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
