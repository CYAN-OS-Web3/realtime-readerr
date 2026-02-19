const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const url = require('url');

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-http-cache');

const { SpeechClient } = require('@google-cloud/speech');
const { Translate } = require('@google-cloud/translate').v2;
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
const https = require('https');
const sdk = require('microsoft-cognitiveservices-speech-sdk');

process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS || '';

const BACKEND_URL = (process.env.BACKEND_URL || 'https://translator-backend-pi.vercel.app').toString().trim();
const CYAN_USER_ID = (process.env.CYAN_USER_ID || '').toString().trim();

const projectId = process.env.GCP_PROJECT_ID || '';
const azureKey = process.env.AZURE_SPEECH_KEY || '';
const azureRegion = process.env.AZURE_SPEECH_REGION || '';
const AZURE_PREFERRED_GENDER = 'male';

const speechClient = new SpeechClient({ projectId: projectId });
const translateClient = new Translate({ projectId: projectId });
const ttsClient = new TextToSpeechClient();

let recognizeStream = null;
let mainWindow = null;
let overlayWindow = null;
let currentSettings = { sourceLang: 'en-US', targetLang: 'vi', ttsEngine: 'elevenlabs', sensitivity: 50 };
let isStreaming = false;
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

function getAzureVoiceName(targetLang) {
  const maleVoiceMap = { 'en': 'en-US-GuyNeural', 'vi': 'vi-VN-NamMinhNeural' };
  const femaleVoiceMap = { 'en': 'en-US-JennyNeural', 'vi': 'vi-VN-HoaiMyNeural' };
  const selectedMap = (AZURE_PREFERRED_GENDER === 'male') ? maleVoiceMap : femaleVoiceMap;
  if (AZURE_PREFERRED_GENDER === 'male') return selectedMap[targetLang] || 'en-US-RyanNeural';
  return selectedMap[targetLang] || 'en-US-AvaMultilingualNeural';
}

function sendToRenderer(channel, data, type = 'info') {
  try {
    if (rendererAlive && !suppressRendererIpc && mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed() && !mainWindow.webContents.isLoadingMainFrame()) {
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 1000, minHeight: 700, backgroundColor: '#1a202c', show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, enableRemoteModule: false, webSecurity: !isDev, backgroundThrottling: false, webviewTag: true, preload: path.join(__dirname, 'preload.js') },
    title: 'Cyan ULTRA-LOW LATENCY AI TRANSLATOR', icon: path.join(__dirname, 'assets/icon.png')
  });
  const startUrl = isDev ? 'http://localhost:5173' : `file://${path.resolve(__dirname, '../renderer/dist/index.html')}`;
  mainWindow.loadURL(startUrl);
  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  mainWindow.webContents.on('did-finish-load', () => { rendererAlive = true; suppressRendererIpc = false; });
  mainWindow.webContents.on('render-process-gone', (event, details) => { rendererAlive = false; suppressRendererIpc = true; });
  mainWindow.webContents.on('destroyed', () => { rendererAlive = false; });
  mainWindow.once('ready-to-show', () => { mainWindow.show(); });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({ width: 800, height: 200, x: 100, y: 100, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, resizable: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false, enableRemoteModule: true }, title: 'Translation Overlay', show: false });
  const overlayPath = path.join(__dirname, '../../overlay.html'); overlayWindow.loadFile(overlayPath);
}

ipcMain.handle('cyan:getBackendUrl', async () => BACKEND_URL);
ipcMain.handle('cyan:getInstallId', async () => getInstallId());
ipcMain.handle('cyan:openExternal', async (_event, url) => {
  const u = (url || '').toString().trim();
  if (!u) return { ok: false };
  try { await shell.openExternal(u); return { ok: true }; } catch { return { ok: false }; }
});

app.whenReady().then(() => {
  try { const { session } = require('electron'); session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https:; font-src 'self' https:; script-src 'self'; connect-src 'self' https://*.googleapis.com http://localhost:* https://localhost:*; media-src 'self' blob: data:; frame-ancestors 'none'";
    const headers = Object.assign({}, details.responseHeaders || {}); headers['Content-Security-Policy'] = [csp]; callback({ responseHeaders: headers }); }); } catch (e) {}
  createWindow(); createOverlayWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) { createWindow(); createOverlayWindow(); } });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') { app.quit(); } });
