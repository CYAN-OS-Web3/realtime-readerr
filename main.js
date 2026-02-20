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

const { SpeechClient } = require('@google-cloud/speech');
const { Translate } = require('@google-cloud/translate').v2;
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
const https = require('https'); 
const sdk = require('microsoft-cognitiveservices-speech-sdk'); 

// =====================================================================
// !!! FIX BẮT BUỘC LỖI XÁC THỰC GOOGLE !!!
// =====================================================================
process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS || '';


// =========================================================
// 1. BẢO MẬT API KEYS (CHỈ TỒN TẠI TRONG MAIN PROCESS)
// =========================================================
// *********************************************************
// THAY THẾ KEY VÀ VOICE ID THỰC TẾ CỦA BẠN VÀO ĐÂY
// *********************************************************
const BACKEND_URL = (process.env.BACKEND_URL || (isDev ? 'http://localhost:3000' : 'https://translator-backend-pi.vercel.app')).toString().trim();
// const BACKEND_URL = 'http://localhost:3000'; // FORCE LOCALHOST FOR TESTING
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
const speechClient = projectId ? new SpeechClient({ projectId: projectId }) : new SpeechClient();
const translateClient = projectId ? new Translate({ projectId: projectId }) : new Translate();
const ttsClient = new TextToSpeechClient(); 

let recognizeStream = null;
let mainWindow = null;
let overlayWindow = null;
let currentSettings = {
    sourceLang: 'en-US', 
    targetLang: 'vi', 
    ttsEngine: 'elevenlabs',
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
        // Ánh xạ mã ngôn ngữ đầy đủ cho Google TTS
        // Mặc định là [lang]-[REGION]
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
        
        // CHỌN GIỌNG WAVENET CAO CẤP
        // Nếu không có trong map cụ thể, thử tạo tên giọng theo quy tắc chuẩn
        const voiceMap = {
            'en': 'en-US-Wavenet-D', 
            'vi': 'vi-VN-Wavenet-A', 
            'es': 'es-ES-Wavenet-D', 
            // Các ngôn ngữ khác sẽ tự động dùng Wavenet-A hoặc Standard-A
        };

        let voiceName = voiceMap[targetLang];
        
        if (!voiceName) {
            // Thử tạo tên giọng mặc định: [LanguageCode]-Wavenet-A
            // Lưu ý: Một số ngôn ngữ có thể không có Wavenet, fallback về Standard
            voiceName = `${languageCode}-Wavenet-A`;
        }

        const request = {
            input: { text: text },
            voice: { languageCode: languageCode, name: voiceName },
            audioConfig: { audioEncoding: 'MP3' },
        };

        const [response] = await ttsClient.synthesizeSpeech(request);
        
        if (response.audioContent) {
            const audioBuffer = Buffer.from(response.audioContent);
            sendToRenderer('tts-audio-ready', new Uint8Array(audioBuffer));
            sendToRenderer('log-message', `Google WaveNet TTS: Phát thành công bằng giọng ${voiceName}.`, 'success');
        } else {
            sendToRenderer('log-message', 'Lỗi WaveNet TTS: Không nhận được nội dung âm thanh.', 'error');
        }

    } catch (e) {
        sendToRenderer('log-message', `Lỗi kết nối/gọi WaveNet TTS: ${e.message}`, 'error');
        console.error('WaveNet TTS Error:', e);
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
            await callElevenLabsTTSService(translatedText, targetLang);
        } else if (ttsEngine === 'azure') {
            await callAzureTTSService(translatedText, targetLang);
        } else if (ttsEngine === 'google') {
            callGoogleWaveNetTTSService(translatedText, targetLang);
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
    sendToRenderer('log-message', `Khởi tạo Google STT Stream cho ngôn ngữ: ${sourceLangCode}`, 'info');

    const request = {
        config: {
            encoding: 'LINEAR16',
            sampleRateHertz: sampleRate,
            languageCode: sourceLangCode,
            model: 'latest_long',
            maxAlternatives: 1,
            useEnhanced: true,
            enableAutomaticPunctuation: true,
            enableWordTimeOffsets: false
        },
        interimResults: true,
        singleUtterance: true
    };

    recognizeStream = speechClient
        .streamingRecognize(request)
        .on('error', (err) => {
             const detail = (err && (err.details || err.message)) ? (err.details || err.message) : JSON.stringify(err);
             if (typeof detail === 'string' && /write after end/i.test(detail)) {
                 sendToRenderer('log-message', `STT Stream WARNING: ${detail}`, 'info');
                 return;
             }
             sendToRenderer('log-message', `STT Stream ERROR: ${detail}`, 'error');
             stopStream(); 
             isStreaming = false;
        })
        .on('end', () => {
            if (!didTranslateForUtterance) {
                const textToTranslate = lastFinalTranscript || lastPartialTranscript;
                if (textToTranslate && textToTranslate.trim().length > 0) {
                    translateAndSpeak(textToTranslate, currentSettings.targetLang, currentSettings.ttsEngine);
                }
            }
            lastPartialTranscript = '';
            lastFinalTranscript = '';
            didTranslateForUtterance = false;
            sttFinalizing = false;
            if (isStreaming) {
                startStream(currentSettings.sourceLang, currentSettings.sampleRate);
            }
        })
        .on('data', (data) => {
            const result = data.results[0];
            
            if (result && result.alternatives && result.alternatives[0]) {
                const transcript = result.alternatives[0].transcript;
                const isFinal = result.isFinal;
                
                sendToRenderer('stt-transcript', {
                    transcript: transcript,
                    isFinal: isFinal
                });

                if (isFinal) {
                    translateAndSpeak(transcript, currentSettings.targetLang, currentSettings.ttsEngine);
                    sttLastSentIdx = 0;
                    sttLastSendTs = Date.now();
                    lastFinalTranscript = transcript;
                    lastPartialTranscript = '';
                    didTranslateForUtterance = true;
                } else {
                    lastPartialTranscript = transcript;
                }
            }
            if (data && data.speechEventType === 'END_OF_SINGLE_UTTERANCE') {
                if (!didTranslateForUtterance) {
                    const textToTranslate = lastFinalTranscript || lastPartialTranscript;
                    if (textToTranslate && textToTranslate.trim().length > 0) {
                        translateAndSpeak(textToTranslate, currentSettings.targetLang, currentSettings.ttsEngine);
                        didTranslateForUtterance = true;
                    }
                }
            }
        });
        
    isStreaming = true;
    sendToRenderer('log-message', 'STT Stream đã BẮT ĐẦU. Đang chờ âm thanh...', 'success');
}

function stopStream() {
    if (recognizeStream) {
        recognizeStream.end();
        recognizeStream = null;
        isStreaming = false;
    }
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
