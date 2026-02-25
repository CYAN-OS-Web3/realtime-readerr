import React, { useState, useEffect, useRef } from 'react';
import { Wifi, WifiOff, Globe, Mic, Settings, Minimize2, X, Check, ChevronRight, ChevronDown } from 'lucide-react';

// ==========================================
  // HELPER: Audio Capture & Processing
  // ==========================================
  const downsampleBuffer = (buffer, inputSampleRate, targetSampleRate) => {
      if (targetSampleRate === inputSampleRate) return buffer;
      if (targetSampleRate > inputSampleRate) return buffer;
      const sampleRateRatio = inputSampleRate / targetSampleRate;
      const newLength = Math.round(buffer.length / sampleRateRatio);
      const result = new Float32Array(newLength);
      let offsetResult = 0;
      let offsetBuffer = 0;
      while (offsetResult < result.length) {
          const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
          let accum = 0, count = 0;
          for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
              accum += buffer[i];
              count++;
          }
          result[offsetResult] = count > 0 ? accum / count : 0;
          offsetResult++;
          offsetBuffer = nextOffsetBuffer;
      }
      return result;
  };

  const convertFloat32ToInt16 = (buffer) => {
    let l = buffer.length;
    let buf = new Int16Array(l);
    while (l--) {
      let s = Math.max(-1, Math.min(1, buffer[l]));
      buf[l] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return buf.buffer; // Returns ArrayBuffer
  };

const ControlHub = () => {
  // UI State
  const [isConnected, setIsConnected] = useState(true);
  const [isTranslating, setIsTranslating] = useState(false);
  const [sourceLang, setSourceLang] = useState('en-US');
  const [targetLang, setTargetLang] = useState('vi-VN'); // UI uses full code, we might need to map for backend
  const [latency, setLatency] = useState(0);
  const [showOverlay, setShowOverlay] = useState(false);
  const [micVolume, setMicVolume] = useState(0);
  const [sensitivity, setSensitivity] = useState(50);
  const [ttsEngine, setTtsEngine] = useState('google');
  const [backendUrl, setBackendUrl] = useState('');
  const [installId, setInstallId] = useState('');
  const [voiceOrderId, setVoiceOrderId] = useState('');
  const [voiceApprovalUrl, setVoiceApprovalUrl] = useState('');
  const [voiceSample, setVoiceSample] = useState(null);
  const [voiceUiStatus, setVoiceUiStatus] = useState('');
  const voiceFileInputRef = useRef(null);
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configStep, setConfigStep] = useState(0);
  const [isConfiguring, setIsConfiguring] = useState(false);
  
  // Data State
  const [previewText, setPreviewText] = useState([]); // Stores { source, target } pairs
  const [logs, setLogs] = useState([]);

  // Audio Refs
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const gainNodeRef = useRef(null);
  const noiseGateRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingRef = useRef(false);
  const ttsPlaybackCtxRef = useRef(null);
  const ttsLastScheduledRef = useRef(0);
  const ttsOutputDestRef = useRef(null);
  const keepAliveAudioRef = useRef(null);
  const activeAudioElementsRef = useRef(new Set());
  const workletLoadedRef = useRef(false);
  const [audioInputs, setAudioInputs] = useState([]);
  const [inputDeviceId, setInputDeviceId] = useState('');
  const [audioOutputs, setAudioOutputs] = useState([]);
  const [outputDeviceId, setOutputDeviceId] = useState('default');
  const [noiseReduction, setNoiseReduction] = useState(true);
  const [noiseGateMode, setNoiseGateMode] = useState('adaptive'); // adaptive, manual, off
  const [ambientNoiseLevel, setAmbientNoiseLevel] = useState(0);


  const [authUserId, setAuthUserId] = useState('');

  useEffect(() => {
    // Listener: Deep Link Auth Sync
    const cleanupAuth = window.electronAPI?.onAuthSync?.((data) => {
      if (data && data.userId) {
        setAuthUserId(data.userId);
        setInstallId(data.userId);
        localStorage.setItem('installId', data.userId);
      }
    });
    return () => {
      if(cleanupAuth) cleanupAuth();
    };
  }, []);

  const handleLogout = () => {
    setAuthUserId('');
    setInstallId('');
    localStorage.removeItem('installId');
    // Sinh lại ID ngẫu nhiên để dùng tiếp chế độ Guest
    const newId = `guest-${Date.now()}`;
    setInstallId(newId);
    localStorage.setItem('installId', newId);
  };

  const isTranslatingRef = useRef(false);
  const sensitivityRef = useRef(50);
  const ambientNoiseRef = useRef(0);
  const noiseHistoryRef = useRef([]);
  const adaptiveThresholdRef = useRef(25);

  useEffect(() => { isTranslatingRef.current = isTranslating; }, [isTranslating]);
  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);
  const languages = [
    { code: 'vi-VN', name: 'Vietnamese', flag: '🇻🇳' },
    { code: 'en-US', name: 'English', flag: '🇺🇸' },
    { code: 'es-ES', name: 'Spanish', flag: '🇪🇸' },
    { code: 'fr-FR', name: 'French', flag: '🇫🇷' },
    { code: 'de-DE', name: 'German', flag: '🇩🇪' },
    { code: 'it-IT', name: 'Italian', flag: '🇮🇹' },
    { code: 'pt-PT', name: 'Portuguese', flag: '🇵🇹' },
    { code: 'ru-RU', name: 'Russian', flag: '🇷🇺' },
    { code: 'ja-JP', name: 'Japanese', flag: '🇯🇵' },
    { code: 'ko-KR', name: 'Korean', flag: '🇰🇷' },
    { code: 'zh-CN', name: 'Mandarin', flag: '🇨🇳' },
    { code: 'hi-IN', name: 'Hindi', flag: '🇮🇳' },
    { code: 'ar-SA', name: 'Arabic', flag: '🇸🇦' },
    { code: 'bn-BD', name: 'Bengali', flag: '🇧🇩' },
    { code: 'ms-MY', name: 'Malay', flag: '🇲🇾' },
    { code: 'id-ID', name: 'Indonesian', flag: '🇮🇩' },
    { code: 'th-TH', name: 'Thai', flag: '🇹🇭' },
    { code: 'tr-TR', name: 'Turkish', flag: '🇹🇷' },
    { code: 'pl-PL', name: 'Polish', flag: '🇵🇱' },
    { code: 'uk-UA', name: 'Ukrainian', flag: '🇺🇦' },
    { code: 'nl-NL', name: 'Dutch', flag: '🇳🇱' },
    { code: 'sv-SE', name: 'Swedish', flag: '🇸🇪' },
    { code: 'fi-FI', name: 'Finnish', flag: '🇫🇮' },
    { code: 'da-DK', name: 'Danish', flag: '🇩🇰' },
    { code: 'no-NO', name: 'Norwegian', flag: '🇳🇴' },
    { code: 'cs-CZ', name: 'Czech', flag: '🇨🇿' },
    { code: 'el-GR', name: 'Greek', flag: '🇬🇷' },
    { code: 'he-IL', name: 'Hebrew', flag: '🇮🇱' },
    { code: 'ro-RO', name: 'Romanian', flag: '🇷🇴' },
    { code: 'hu-HU', name: 'Hungarian', flag: '🇭🇺' },
    { code: 'sk-SK', name: 'Slovak', flag: '🇸🇰' },
    { code: 'bg-BG', name: 'Bulgarian', flag: '🇧🇬' },
    { code: 'ca-ES', name: 'Catalan', flag: '🇦🇩' },
    { code: 'hr-HR', name: 'Croatian', flag: '🇭🇷' },
    { code: 'sr-RS', name: 'Serbian', flag: '🇷🇸' },
    { code: 'sl-SI', name: 'Slovenian', flag: '🇸🇮' },
    { code: 'et-EE', name: 'Estonian', flag: '🇪🇪' },
    { code: 'lv-LV', name: 'Latvian', flag: '🇱🇻' },
    { code: 'lt-LT', name: 'Lithuanian', flag: '🇱🇹' },
    { code: 'fil-PH', name: 'Filipino', flag: '🇵🇭' }
  ];

  // ==========================================
  // EFFECT: IPC Listeners
  // ==========================================
  useEffect(() => {
    const restoreVoiceOrder = () => {
      const stored = localStorage.getItem('voiceChangeOrder');
      if (stored) {
        try {
          const j = JSON.parse(stored);
          if (j && j.order_id) setVoiceOrderId(String(j.order_id));
          if (j && j.approval_url) setVoiceApprovalUrl(String(j.approval_url));
        } catch {}
      }
    }

    const initWebMode = () => {
      const storedBackend = (localStorage.getItem('backendUrl') || 'https://translator-backend-pi.vercel.app').toString().trim()
      setBackendUrl(storedBackend)
      let id = (localStorage.getItem('installId') || '').toString().trim()
      if (!id) {
        try {
          id = (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function')
            ? globalThis.crypto.randomUUID()
            : `web-${Math.random().toString(36).slice(2)}${Date.now()}`
        } catch {
          id = `web-${Math.random().toString(36).slice(2)}${Date.now()}`
        }
        localStorage.setItem('installId', id)
      }
      setInstallId(id)
      restoreVoiceOrder()

      const start = performance.now()
      fetch(`${storedBackend}/api/health`, { method: 'GET' })
        .then(r => {
          setIsConnected(Boolean(r && r.ok))
          setLatency(Math.round(performance.now() - start))
        })
        .catch(() => setIsConnected(false))
    }

    const hasElectron = Boolean(window.electronAPI && typeof window.electronAPI.onServerStatus === 'function')
    if (!hasElectron) {
      initWebMode()
      return
    }

    Promise.all([
      window.electronAPI.getBackendUrl?.(),
      window.electronAPI.getInstallId?.(),
    ]).then(([b, id]) => {
      if (typeof b === 'string') setBackendUrl(b);
      if (typeof id === 'string') setInstallId(id);
      restoreVoiceOrder()
    }).catch(() => {});

    const cleanupServerStatus = window.electronAPI.onServerStatus((status) => {
      setIsConnected(status.connected);
      if (status.latency) setLatency(status.latency);
    });

    // Translation Update (Translation result)
    const cleanupTranslation = window.electronAPI.onTranslationUpdate((data) => {
        // data: { sourceText, translatedText }
        setPreviewText(prev => {
            const newEntry = { source: data.sourceText, target: data.translatedText };
            // Keep last 3 entries
            return [newEntry, ...prev].slice(0, 3);
        });
    });

    // STT Transcript (Partial/Final)
    const cleanupSTT = window.electronAPI.onSTTTranscript((data) => {
        // data: { transcript, isFinal }
        // We can show partial results if we want, or just wait for final.
        // For this UI, let's update the "current" source text if it's partial?
        // The current UI design shows a list of completed sentences.
        // Let's just log partials or update a "current speaking" indicator if we had one.
        // For now, we rely on 'onTranslationUpdate' to populate the list.
          // Log source text to console for debugging
          console.log('[App] Received STT Transcript:', data);
          
          if (!data.isFinal) {
               // Optional: Show "Typing..." effect or live preview
          } else {
               // Update preview with final transcript immediately if needed
               // setPreviewText(prev => {
               //     const newEntry = { source: data.transcript, target: '...' }; 
               //     return [newEntry, ...prev].slice(0, 3);
               // });
          }
    });

    // Audio TTS Ready (non-stream)
    const cleanupAudio = window.electronAPI.onAudioReady((audioBuffer) => {
        playAudioBuffer(audioBuffer);
    });
    // Audio TTS Streaming (Azure)
    if (!ttsPlaybackCtxRef.current) {
        ttsPlaybackCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        ttsOutputDestRef.current = ttsPlaybackCtxRef.current.createMediaStreamDestination();
        
        // Keep-alive silent audio to prevent AudioContext suspension
        const el = new Audio();
        el.autoplay = true;
        el.muted = false; // Intentionally unmuted but silent stream
        el.srcObject = ttsOutputDestRef.current.stream;
        keepAliveAudioRef.current = el;
        
        const tryPlay = () => el.play().catch(() => {});
        tryPlay();
    }
    const toFloat32 = (int16) => {
        const out = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
            out[i] = int16[i] / 0x8000;
        }
        return out;
    };
    const schedulePcm = (chunk) => {
        const ctx = ttsPlaybackCtxRef.current;
        const u8 = (chunk instanceof Uint8Array) ? chunk : new Uint8Array(chunk);
        const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
        const int16 = new Int16Array(ab);
        const float = toFloat32(int16);
        const buf = ctx.createBuffer(1, float.length, 16000);
        buf.copyToChannel(float, 0);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const startAt = Math.max(ctx.currentTime, ttsLastScheduledRef.current);
        if (ttsOutputDestRef.current) {
            src.connect(ttsOutputDestRef.current);
        } else {
            src.connect(ctx.destination);
        }
        src.start(startAt);
        ttsLastScheduledRef.current = startAt + buf.duration;
    };
    const cleanupChunk = window.electronAPI.onAudioChunk((chunk) => {
        try { schedulePcm(chunk); } catch (e) { console.error('Playback chunk error:', e); }
    });
    const cleanupDone = window.electronAPI.onAudioDone(() => {
        ttsLastScheduledRef.current = Math.max(ttsPlaybackCtxRef.current.currentTime, ttsLastScheduledRef.current);
    });

    // Logs
    const cleanupLogs = window.electronAPI.onLogMessage((msg, type) => {
        console.log(`[${type}] ${msg}`);
        setLogs(prev => [...prev, { msg, type, time: new Date().toLocaleTimeString() }].slice(-50));
    });

    // Enumerate audio output devices and pick Bluetooth/headset by default
    navigator.mediaDevices.enumerateDevices().then(devs => {
        const ins = devs.filter(d => d.kind === 'audioinput');
        setAudioInputs(ins);
        const savedIn = localStorage.getItem('inputDeviceId');
        if (savedIn) {
            setInputDeviceId(savedIn);
        } else {
            const preferIn = ins.find(o => /Microphone|Mic|Realtek|Array|USB|Laptop/i.test(o.label));
            if (preferIn) setInputDeviceId(preferIn.deviceId);
            else setInputDeviceId('');
        }
        const outs = devs.filter(d => d.kind === 'audiooutput');
        setAudioOutputs(outs);
        const saved = localStorage.getItem('outputDeviceId');
        if (saved) {
            setOutputDeviceId(saved);
        } else {
            const prefer = outs.find(o => /Bluetooth|Headset|耳机|Tai nghe|Audio|Speaker/i.test(o.label));
            if (prefer) setOutputDeviceId(prefer.deviceId);
            else setOutputDeviceId('default');
        }
    }).catch(e => console.error('Enumerate audio outputs error:', e));
    // Persist selection
    const onBeforeUnload = () => {
        if (outputDeviceId) localStorage.setItem('outputDeviceId', outputDeviceId);
        if (inputDeviceId !== undefined) localStorage.setItem('inputDeviceId', inputDeviceId);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
        window.removeEventListener('beforeunload', onBeforeUnload);
        cleanupServerStatus();
        cleanupTranslation();
        cleanupSTT();
        cleanupAudio();
        cleanupLogs();
        cleanupChunk();
        cleanupDone();
        if (ttsPlaybackCtxRef.current) {
            try { ttsPlaybackCtxRef.current.close(); } catch {}
            ttsPlaybackCtxRef.current = null;
            ttsLastScheduledRef.current = 0;
            ttsOutputDestRef.current = null;
            keepAliveAudioRef.current = null;
        }
    };
  }, []);

  const createVoiceChangeOrder = async () => {
    try {
      setVoiceUiStatus('Creating $5 payment…');
      const base = backendUrl || (await window.electronAPI?.getBackendUrl?.()) || '';
      const uid = installId || (await window.electronAPI?.getInstallId?.()) || '';
      if (!base || !uid) { setVoiceUiStatus('Missing backend URL or user ID'); return; }
      const token = localStorage.getItem('cyan_token') || '';
      const r = await fetch(`${base}/api/payment/voice-change/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'x-cyan-token': token } : {})
        },
        body: JSON.stringify({ user_id: uid, device_id: uid })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j || !j.order_id || !j.approval_url) {
        setVoiceUiStatus(j && j.error ? String(j.error) : `Payment creation failed (${r.status})`);
        return;
      }
      setVoiceOrderId(String(j.order_id));
      setVoiceApprovalUrl(String(j.approval_url));
      localStorage.setItem('voiceChangeOrder', JSON.stringify({ order_id: j.order_id, approval_url: j.approval_url }));
      setVoiceUiStatus('Created. Opening PayPal…');
      const opened = await window.electronAPI?.openExternal?.(j.approval_url);
      if (!opened || opened.ok === false) {
        try { window.open(j.approval_url, '_blank', 'noopener,noreferrer') } catch {}
      }
    } catch (e) {
      setVoiceUiStatus('Payment creation failed');
    }
  };

  const completeVoiceChange = async () => {
    try {
      setVoiceUiStatus('Updating voice…');
      const base = backendUrl || (await window.electronAPI?.getBackendUrl?.()) || '';
      const uid = installId || (await window.electronAPI?.getInstallId?.()) || '';
      if (!base || !uid) { setVoiceUiStatus('Missing backend URL or user ID'); return; }
      if (!voiceOrderId) { setVoiceUiStatus('Missing order_id'); return; }
      if (!voiceSample) { setVoiceUiStatus('Missing MP3 file'); return; }
      const token = localStorage.getItem('cyan_token') || '';
      const fd = new FormData();
      fd.append('sample', voiceSample, voiceSample.name || 'sample.mp3');
      fd.append('user_id', uid);
      fd.append('device_id', uid);
      fd.append('order_id', voiceOrderId);
      const r = await fetch(`${base}/api/voice/update/complete`, {
        method: 'POST',
        headers: token ? { 'x-cyan-token': token } : {},
        body: fd
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j || !j.ok) {
        setVoiceUiStatus(j && j.error ? String(j.error) : `Voice update failed (${r.status})`);
        return;
      }
      localStorage.removeItem('voiceChangeOrder');
      setVoiceOrderId('');
      setVoiceApprovalUrl('');
      setVoiceSample(null);
      setVoiceUiStatus('Voice updated successfully');
    } catch (e) {
      setVoiceUiStatus('Voice update failed');
    }
  };

  useEffect(() => {
    const el = keepAliveAudioRef.current;
    if (!el) return;
    const sink = (isTranslating ? ((outputDeviceId || 'default') === 'default' ? 'communications' : outputDeviceId) : (outputDeviceId || 'default'));
    if (typeof el.setSinkId === 'function') {
      el.setSinkId(sink).catch(() => {});
    }
  }, [outputDeviceId, audioOutputs]);

  // ==========================================
  // AUDIO CAPTURE LOGIC
  // ==========================================
  const startMicrophone = async () => {
    try {
        if (mediaStreamRef.current) return;

        // Debug: List devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        console.log("Available Audio Devices:", audioInputs);
        console.log("Selected input device ID:", inputDeviceId || 'default');
        console.log("Mic permissions:", navigator.permissions ? 'API available' : 'API not available');

        // Force disable audio processing features (echoCancellation, etc.)
        // This is CRITICAL to prevent the browser/OS from muting output when mic is active
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                channelCount: 1
            } 
        });
        mediaStreamRef.current = stream;
        
        // Check if stream is active
        console.log("Stream active:", stream.active);
        console.log("Stream tracks:", stream.getAudioTracks().length);
        stream.getAudioTracks().forEach(track => {
            console.log("Track:", track.label, "Enabled:", track.enabled, "Muted:", track.muted);
        });

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        // Share AudioContext if possible to prevent exclusive mode issues
        let audioCtx = ttsPlaybackCtxRef.current;
        if (!audioCtx || audioCtx.state === 'closed') {
             audioCtx = new AudioContext();
             ttsPlaybackCtxRef.current = audioCtx;
        }
        await audioCtx.resume();
        audioContextRef.current = audioCtx;
        
        // Try to set Sink ID for the entire context if supported (Chrome/Edge)
        // This ensures the shared context outputs to the correct device (Hands-Free)
        if (typeof audioCtx.setSinkId === 'function') {
            try {
                const desired = (isTranslatingRef.current && ((outputDeviceId || 'default') === 'default')) ? 'communications' : (outputDeviceId || 'default');
                if (desired !== 'default') {
                    await audioCtx.setSinkId(desired);
                }
            } catch {}
        }

        console.log(`Audio Context Started. Rate: ${audioCtx.sampleRate}Hz`);

        const source = audioCtx.createMediaStreamSource(stream);
        sourceRef.current = source;

        const gainNode = audioCtx.createGain();
        gainNode.gain.setValueAtTime(10.0, audioCtx.currentTime); // Tăng gain lên 10x
        gainNodeRef.current = gainNode;
        console.log("Gain node created with gain:", gainNode.gain.value);

        // Optional dynamics compressor to auto-level quiet Bluetooth mics
        const compressor = audioCtx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-50, audioCtx.currentTime);
        compressor.knee.setValueAtTime(40, audioCtx.currentTime);
        compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
        compressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
        compressor.release.setValueAtTime(0.25, audioCtx.currentTime);

        // AudioWorklet: more stable than deprecated ScriptProcessorNode
        // Check if we need to add module (only if we created a new context or haven't added it yet)
        // There is no easy way to check if module is loaded, but re-adding same blob URL usually is fine or throws harmless error.
        // To be safe, we wrap in try-catch or just rely on the fact that we reuse context.
        
        if (!workletLoadedRef.current) {
            try {
                const workletCode = `class MicProcessor extends AudioWorkletProcessor { process(inputs) { const input = inputs[0]; if (input && input[0]) { this.port.postMessage(input[0]); } return true; } } try { registerProcessor('mic-processor', MicProcessor); } catch(e) {}`;
                const workletUrl = URL.createObjectURL(new Blob([workletCode], { type: 'application/javascript' }));
                await audioCtx.audioWorklet.addModule(workletUrl);
                workletLoadedRef.current = true;
            } catch (e) {}
        }

        const workletNode = new AudioWorkletNode(audioCtx, 'mic-processor');
        processorRef.current = workletNode;

        if (noiseReduction) { // Enable lại noise reduction
            // Advanced noise reduction chain
            const hp = audioCtx.createBiquadFilter();
            hp.type = 'highpass';
            hp.frequency.setValueAtTime(80, audioCtx.currentTime); // Lower cutoff for better voice
            
            const lp = audioCtx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.setValueAtTime(8000, audioCtx.currentTime);
            
            // Add noise gate for coffee shop environments
            const noiseGate = audioCtx.createGain();
            noiseGate.gain.setValueAtTime(0, audioCtx.currentTime);
            
            // Add expander for better dynamics
            const expander = audioCtx.createDynamicsCompressor();
            expander.threshold.setValueAtTime(-30, audioCtx.currentTime);
            expander.ratio.setValueAtTime(12, audioCtx.currentTime); // Fixed: ratio must be 1-20
            expander.attack.setValueAtTime(0.001, audioCtx.currentTime);
            expander.release.setValueAtTime(0.1, audioCtx.currentTime);
            
            source.connect(compressor);
            compressor.connect(hp);
            hp.connect(lp);
            lp.connect(expander);
            expander.connect(noiseGate);
            noiseGate.connect(gainNode);
            
            // Store noise gate reference for adaptive control
            noiseGateRef.current = noiseGate;
        } else {
            source.connect(compressor);
            compressor.connect(gainNode);
        }
        gainNode.connect(workletNode);

        const lastVoiceAtRef = { t: Date.now() };
        const lastFinalizeTsRef = { t: 0 };
        const hasSentDataRef = { current: false };

        workletNode.port.onmessage = (e) => {
            if (!isTranslatingRef.current) return;
            const inputData = e.data;
            
            // Audio data is flowing correctly - no need for debug logs
            
            let sum = 0;
            for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
            }
            const rms = Math.sqrt(sum / inputData.length);
            const vol = Math.min(100, Math.round(rms * 1000));
            setMicVolume(vol);

            // Advanced adaptive noise detection
            noiseHistoryRef.current.push(vol);
            if (noiseHistoryRef.current.length > 60) { // Keep 1 second of history
                noiseHistoryRef.current.shift();
            }
            
            // Calculate ambient noise level (minimum of last 60 frames)
            const recentNoise = noiseHistoryRef.current.slice(-60);
            const currentAmbient = Math.min(...recentNoise);
            ambientNoiseRef.current = currentAmbient;
            setAmbientNoiseLevel(currentAmbient);
            
            // Adaptive threshold calculation
            let effectiveThreshold;
            if (noiseGateMode === 'adaptive') {
                // Dynamic threshold based on ambient noise
                const noiseMultiplier = 1.5; // Voice should be 50% above ambient
                const baseThreshold = currentAmbient * noiseMultiplier;
                const userThreshold = sensitivityRef.current / 2;
                effectiveThreshold = Math.max(baseThreshold, userThreshold);
                adaptiveThresholdRef.current = effectiveThreshold;
            } else {
                effectiveThreshold = sensitivityRef.current / 2;
            }
            
            // Noise gate control
            if (noiseGateRef.current) {
                const gateGain = vol > effectiveThreshold ? 1 : 0;
                noiseGateRef.current.gain.setValueAtTime(gateGain, audioCtx.currentTime);
            }
            
            // LOG DEBUG: Enhanced logging for noise cancellation
            if (!window.lastLogTime || Date.now() - window.lastLogTime > 1000) {
                 window.lastLogTime = Date.now();
                 console.log(`[Mic] Vol: ${vol} | Ambient: ${currentAmbient.toFixed(1)} | Threshold: ${effectiveThreshold.toFixed(1)} | Gate: ${vol > effectiveThreshold ? 'OPEN' : 'CLOSED'} | Mode: ${noiseGateMode}`);
            }

            if (vol > effectiveThreshold) {
                lastVoiceAtRef.t = Date.now();
                hasSentDataRef.current = true;
                const int16Data = convertFloat32ToInt16(inputData);
                if (window.electronAPI) {
                    window.electronAPI.sendAudioChunk(new Uint8Array(int16Data));
                }
            } else {
                const now = Date.now();
                const silenceMs = now - lastVoiceAtRef.t;
                if (silenceMs > 700) {
                    if (now - lastFinalizeTsRef.t > 2000) { // Tăng debounce lên 2s
                        if (hasSentDataRef.current) {
                            console.log('[App] Silence detected (>700ms). Sending finalizeUtterance...');
                            lastFinalizeTsRef.t = now;
                            hasSentDataRef.current = false;
                            if (window.electronAPI) {
                                window.electronAPI.finalizeUtterance();
                            }
                        }
                    }
                }
            }
        };

    } catch (err) {
        console.error("Error accessing microphone:", err);
        alert(`Could not access microphone: ${err.message}. Please check system permissions.`);
    }
  };

  const stopMicrophone = () => {
      if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(track => track.stop());
          mediaStreamRef.current = null;
      }
      
      // Clean up Audio Nodes to prevent memory leaks or processing on dead stream
      if (sourceRef.current) {
          try { sourceRef.current.disconnect(); } catch {}
          sourceRef.current = null;
      }
      if (processorRef.current) {
          try { processorRef.current.disconnect(); } catch {}
          processorRef.current = null;
      }
      if (gainNodeRef.current) {
          try { gainNodeRef.current.disconnect(); } catch {}
          gainNodeRef.current = null;
      }

      // DO NOT close audioContextRef here if we want to keep playing pending audio
      setMicVolume(0);
  };

  // ==========================================
  // AUDIO PLAYBACK LOGIC (TTS)
  // ==========================================
  const detectAudioMime = (u8) => {
      if (!u8 || u8.length < 4) return 'application/octet-stream';
      const a = u8[0], b = u8[1], c = u8[2], d = u8[3];
      if (a === 0x52 && b === 0x49 && c === 0x46 && d === 0x46) return 'audio/wav';
      if (a === 0x4f && b === 0x67 && c === 0x67 && d === 0x53) return 'audio/ogg';
      if (a === 0x49 && b === 0x44 && c === 0x33) return 'audio/mpeg';
      if (a === 0xff && (b & 0xe0) === 0xe0) return 'audio/mpeg';
      return 'application/octet-stream';
  };

  const playAudioBuffer = async (buffer) => {
      try {
          const u8 = (buffer instanceof Uint8Array) ? buffer : new Uint8Array(buffer?.buffer ? buffer.buffer : buffer);
          const blob = new Blob([u8], { type: detectAudioMime(u8) });
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          activeAudioElementsRef.current.add(audio);

          // Route to device: prefer explicit output, else communications when streaming
          const desiredSink = (isTranslatingRef.current && ((outputDeviceId || 'default') === 'default'))
              ? 'communications'
              : (outputDeviceId || 'default');
          if (typeof audio.setSinkId === 'function') {
              try {
                  if (desiredSink !== 'default') {
                      await audio.setSinkId(desiredSink);
                  }
              } catch {}
          }

          audio.volume = 1.0;
          audio.muted = false;
          audio.onended = () => {
              URL.revokeObjectURL(url);
              activeAudioElementsRef.current.delete(audio);
          };
          audio.onerror = () => {
              URL.revokeObjectURL(url);
              activeAudioElementsRef.current.delete(audio);
          };

          await audio.play();
      } catch {}
  };

  const testOutput = async () => {
    try {
      const ctx = ttsPlaybackCtxRef.current || new (window.AudioContext || window.webkitAudioContext)();
      if (!ttsPlaybackCtxRef.current) {
        ttsPlaybackCtxRef.current = ctx;
        ttsOutputDestRef.current = ctx.createMediaStreamDestination();
        const el = new Audio();
        el.autoplay = true;
        el.muted = false;
        el.srcObject = ttsOutputDestRef.current.stream;
        keepAliveAudioRef.current = el;
        if (typeof el.setSinkId === 'function') {
          await el.setSinkId(outputDeviceId || 'default').catch(() => {});
        }
        try { await el.play(); } catch {}
      }
      await ctx.resume();
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      osc.connect(gain);
      if (ttsOutputDestRef.current) {
        gain.connect(ttsOutputDestRef.current);
      } else {
        gain.connect(ctx.destination);
      }
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
      console.log('[audio] test tone played to sink:', outputDeviceId || 'default');
    } catch (e) {
      console.warn('Test output error:', e);
    }
  };

  // ==========================================
  // HANDLERS
  // ==========================================
  const handleStartTranslation = async () => {
    const newState = !isTranslating;
    setIsTranslating(newState);

    if (newState) {
        // Start
        await startMicrophone();
        if (ttsPlaybackCtxRef.current) {
            try { await ttsPlaybackCtxRef.current.resume(); } catch {}
        }
        
        // Map targetLang to short code if needed
        const targetShort = targetLang.split('-')[0];
        
        const currentSampleRate = audioContextRef.current?.sampleRate || 16000;
        console.log(`[App] Starting translation with Sample Rate: ${currentSampleRate}Hz`);

        if (window.electronAPI) {
            window.electronAPI.toggleTranslation({
                isTranslating: true,
                sourceLang: sourceLang, // e.g. 'en-US'
                targetLang: targetShort, // e.g. 'vi'
                ttsEngine: ttsEngine,
                sensitivity: sensitivity,
                sampleRate: currentSampleRate // Send sample rate to main process
            });
        }
        
        // Show overlay
        setShowOverlay(true);
        if (window.electronAPI) {
            window.electronAPI.showOverlay();
        } 
    } else {
        // Stop
        stopMicrophone();
        setShowOverlay(false);
        if (window.electronAPI) {
            window.electronAPI.toggleTranslation({ isTranslating: false });
            window.electronAPI.hideOverlay();
        }
    }
  };

  const handleAutoConfig = () => {
    setShowConfigModal(true);
    setConfigStep(0);
    setIsConfiguring(false);
  };

  const startAutoConfigProcess = async () => {
    setIsConfiguring(true);
    if (window.electronAPI) window.electronAPI.autoconfigureAudio();

    // Mock visual progress
    setConfigStep(1);
    await new Promise(r => setTimeout(r, 1000));
    setConfigStep(2);
    await new Promise(r => setTimeout(r, 1000));
    setConfigStep(3);
    await new Promise(r => setTimeout(r, 1000));
    setConfigStep(4); // Finished
    setIsConfiguring(false);
  };

  const closeConfigModal = () => {
    setShowConfigModal(false);
    setConfigStep(0);
    setIsConfiguring(false);
  };

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <div className="flex gap-4 p-4 bg-gray-900 min-h-screen font-sans text-gray-200">
      {/* Main Control Hub */}
      <div className="w-[400px] bg-black rounded-lg shadow-2xl border border-cyan-500/30 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-600 to-cyan-700 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-white" />
            <span className="text-white font-semibold text-sm">Cyan ULTRA-LOW LATENCY AI TRANSLATOR</span>
          </div>
          
          {/* User Profile / Login Icon */}
          <div className="flex items-center gap-3">
             {authUserId ? (
               <div className="flex items-center gap-2 bg-black/20 rounded-full pl-2 pr-1 py-0.5">
                 <div className="w-5 h-5 bg-cyan-800 rounded-full flex items-center justify-center text-[9px] font-bold text-white border border-cyan-400">
                   {authUserId.slice(0,2).toUpperCase()}
                 </div>
                 <button onClick={handleLogout} className="p-1 hover:bg-red-500/20 rounded-full group" title="Logout">
                   <X className="w-3 h-3 text-cyan-100 group-hover:text-red-300" />
                 </button>
               </div>
            ) : (
              <button
                onClick={(e) => {
                  if (e.altKey) {
                    const manualId = '102870395312994795443'
                    setAuthUserId(manualId)
                    setInstallId(manualId)
                    localStorage.setItem('installId', manualId)
                    return
                  }

                  window.electronAPI?.openExternal?.('https://cyan-os-landingpage.vercel.app/login?autoOpenApp=1')
                }}
                className="flex items-center gap-1.5 px-2 py-1 bg-black/20 hover:bg-black/40 rounded-full transition-all text-xs text-white font-medium"
                title="Login (Alt+Click for Dev)"
              >
                <span>Login</span>
              </button>
            )}

            <div className="h-4 w-px bg-cyan-500/50 mx-1"></div>

            <button onClick={() => window.electronAPI?.minimizeWindow()}>
                <Minimize2 className="w-4 h-4 text-white cursor-pointer hover:text-cyan-200" />
            </button>
            <button onClick={() => window.electronAPI?.closeWindow()}>
                <X className="w-4 h-4 text-white cursor-pointer hover:text-cyan-200" />
            </button>
          </div>
        </div>

        {/* Server Status */}
        <div className="px-4 py-3 bg-gray-900 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isConnected ? (
                <Wifi className="w-4 h-4 text-cyan-400" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-400" />
              )}
              <span className="text-sm text-gray-300">Server Status</span>
            </div>
            
            <div className="flex items-center gap-3">
              <div className={`px-2 py-1 rounded text-xs font-medium ${isConnected ? 'bg-cyan-500/20 text-cyan-400' : 'bg-red-500/20 text-red-400'}`}>
                {isConnected ? 'ONLINE' : 'OFFLINE'}
              </div>
              {isConnected && (
                <span className="text-xs text-gray-400">{latency}ms</span>
              )}
            </div>
          </div>
        </div>

        {/* Language Selection */}
        <div className="px-4 py-4 space-y-3 flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-2 block">MIC INPUT</label>
              <select
                value={inputDeviceId}
                onChange={(e) => {
                  setInputDeviceId(e.target.value);
                  localStorage.setItem('inputDeviceId', e.target.value);
                }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 cursor-pointer hover:border-gray-600 disabled:opacity-50"
              >
                <option value="">System Default Mic</option>
                {audioInputs.map(o => (
                  <option key={o.deviceId} value={o.deviceId}>{o.label || `Mic ${o.deviceId}`}</option>
                ))}
              </select>
            </div>
            {/* Audio Output Selection */}
            <div>
              <label className="text-xs text-gray-400 mb-2 block">AUDIO OUTPUT</label>
              <select
                value={outputDeviceId}
                onChange={(e) => {
                  setOutputDeviceId(e.target.value);
                  localStorage.setItem('outputDeviceId', e.target.value);
                }}
                disabled={false}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 cursor-pointer hover:border-gray-600 disabled:opacity-50"
              >
                <option value="default">System Default Output</option>
                <option value="communications">Communications Default Output</option>
                {audioOutputs.map(o => (
                  <option key={o.deviceId} value={o.deviceId}>{o.label || `Device ${o.deviceId}`}</option>
                ))}
              </select>
              <button
                onClick={testOutput}
                className="mt-2 w-full py-2 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-cyan-500/50 rounded-lg text-gray-300 text-xs font-medium transition-all"
              >
                TEST OUTPUT
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {/* Source Language */}
            <div>
              <label className="text-xs text-gray-400 mb-2 block">SOURCE</label>
              <select
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-3 text-white text-sm focus:outline-none focus:border-cyan-500 cursor-pointer hover:border-gray-600 disabled:opacity-50"
              >
                {languages.map(lang => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Target Language */}
            <div>
              <label className="text-xs text-gray-400 mb-2 block">TARGET</label>
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-3 text-white text-sm focus:outline-none focus:border-cyan-500 cursor-pointer hover:border-gray-600 disabled:opacity-50"
              >
                {languages.map(lang => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
           {/* TTS Engine Selection */}
           <div>
              <label className="text-xs text-gray-400 mb-2 block">TTS ENGINE</label>
              <select
                value={ttsEngine}
                onChange={(e) => setTtsEngine(e.target.value)}
                disabled={isTranslating}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 cursor-pointer hover:border-gray-600 disabled:opacity-50"
              >
                 <option value="elevenlabs">ElevenLabs (High Quality)</option>
                 <option value="azure">Azure Neural (Fast)</option>
                 <option value="google">Google WaveNet (Standard)</option>
              </select>
           </div>

           {ttsEngine === 'elevenlabs' && (
             <div className="bg-gray-900 border border-gray-800 rounded-lg p-2.5 space-y-2.5">
               <button
                 onClick={() => setVoicePanelOpen((v) => !v)}
                 className="w-full flex items-center justify-between"
                 disabled={isTranslating}
               >
                 <div className="flex items-center gap-2">
                   {voicePanelOpen ? (
                     <ChevronDown className="w-4 h-4 text-gray-500" />
                   ) : (
                     <ChevronRight className="w-4 h-4 text-gray-500" />
                   )}
                   <span className="text-xs text-gray-400 font-medium">VOICE UPDATE ($5)</span>
                 </div>
                 <span className="text-[10px] text-gray-500 font-mono">{installId || '—'}</span>
               </button>



               {voicePanelOpen && (
                 <>
                   <div className="text-xs text-gray-500 italic mb-2 px-1">
                     Upload a clear voice sample (30s-1m) to clone your voice. 
                     First time is free. Subsequent updates require $5 payment.
                   </div>

                   <div className="grid grid-cols-2 gap-2 mb-2">
                     <button
                       onClick={createVoiceChangeOrder}
                       disabled={isTranslating}
                       className="w-full py-2 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-cyan-500/50 rounded-lg text-gray-300 text-xs font-medium transition-all disabled:opacity-50"
                     >
                       Create $5 payment
                     </button>
                   </div>

                   <input
                     ref={voiceFileInputRef}
                     type="file"
                     accept="audio/mpeg,audio/mp3,audio/wav,audio/x-m4a,audio/m4a"
                     disabled={isTranslating}
                     onChange={(e) => {
                       const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                       if (file && file.size > 4 * 1024 * 1024) { // 4MB
                         setVoiceUiStatus('File too large (max 4MB). Use shorter clip.');
                         setVoiceSample(null);
                         if (voiceFileInputRef.current) voiceFileInputRef.current.value = '';
                         return;
                       }
                       setVoiceSample(file);
                       if (file) setVoiceUiStatus('');
                     }}
                     className="hidden"
                   />
                   <div className="grid grid-cols-2 gap-2">
                     <button
                       onClick={() => voiceFileInputRef.current && voiceFileInputRef.current.click()}
                       disabled={isTranslating}
                       className="w-full py-2 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-cyan-500/50 rounded-lg text-gray-300 text-xs font-medium transition-all disabled:opacity-50"
                     >
                       {voiceSample ? 'Change File' : 'Choose File (MP3/M4A/WAV)'}
                     </button>
                     <div className="flex items-center text-xs text-gray-400 truncate pl-1">
                       {voiceSample ? voiceSample.name : 'No file chosen'}
                     </div>
                   </div>
                   
                   {/* Initial Free Assign Button (only shows if no payment created yet) */}
                   {!voiceApprovalUrl && !voiceOrderId && (
                     <button
                       onClick={async () => {
                          if (!voiceSample) { setVoiceUiStatus('Missing file'); return; }
                          setVoiceUiStatus('Assigning voice (Free/Initial)...');
                          try {
                            const base = backendUrl || (await window.electronAPI?.getBackendUrl?.()) || '';
                            const uid = installId || (await window.electronAPI?.getInstallId?.()) || '';
                            if (!base || !uid) { setVoiceUiStatus('Missing info'); return; }
                            
                            const fd = new FormData();
                            fd.append('sample', voiceSample); // Changed 'file' -> 'sample' to match backend
                            fd.append('user_id', uid);
                            fd.append('device_id', uid);
                            
                            const r = await fetch(`${base}/api/voice/assign`, { method: 'POST', body: fd });
                            const j = await r.json().catch(() => ({}));
                            
                            if (r.status === 402) {
                              setVoiceUiStatus('Free update used. Please pay $5 to change again.');
                            } else if (r.ok && j.ok) {
                              setVoiceUiStatus('Voice assigned successfully!');
                              setVoiceSample(null);
                            } else {
                              setVoiceUiStatus(j.error || 'Assign failed');
                            }

                          } catch (e) {
                            console.error(e)
                            setVoiceUiStatus('Network error: ' + e.message);
                          }
                       }}
                       disabled={isTranslating || !voiceSample}
                       className="w-full mt-2 py-2 bg-cyan-900/30 hover:bg-cyan-900/50 border border-cyan-800 hover:border-cyan-500 rounded-lg text-cyan-200 text-xs font-medium transition-all disabled:opacity-50"
                     >
                       Assign Voice (Free Initial)
                     </button>
                   )}

                  {voiceApprovalUrl && (
                    <button
                      onClick={completeVoiceChange}
                      disabled={isTranslating || !voiceSample}
                      className="w-full mt-2 py-2 bg-cyan-900/30 hover:bg-cyan-900/50 border border-cyan-800 hover:border-cyan-500 rounded-lg text-cyan-200 text-xs font-medium transition-all disabled:opacity-50"
                    >
                      Complete Voice Update
                    </button>
                  )}

                   {voiceUiStatus && (
                     <div className="text-xs text-gray-400 mt-1">{voiceUiStatus}</div>
                   )}
                 </>
               )}
             </div>
           )}

           {/* Advanced Noise Control */}
           <div className="space-y-3">
             <div className="flex items-center justify-between">
               <label className="text-xs text-gray-400">Noise Reduction</label>
               <div className="flex items-center gap-2">
                 <span className="text-xs text-gray-400">{noiseReduction ? 'On' : 'Off'}</span>
                 <button
                   onClick={() => setNoiseReduction(v => !v)}
                   className={`w-10 h-5 rounded-full ${noiseReduction ? 'bg-cyan-600' : 'bg-gray-700'} relative`}
                 >
                   <span className={`absolute top-0.5 ${noiseReduction ? 'right-0.5' : 'left-0.5'} w-4 h-4 bg-white rounded-full transition-all`} />
                 </button>
               </div>
             </div>
             
             {noiseReduction && (
               <>
                 <div className="flex items-center justify-between">
                   <label className="text-xs text-gray-400">Noise Gate Mode</label>
                   <select
                     value={noiseGateMode}
                     onChange={(e) => setNoiseGateMode(e.target.value)}
                     className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded border border-gray-700"
                   >
                     <option value="adaptive">Adaptive ☕</option>
                     <option value="manual">Manual</option>
                     <option value="off">Off</option>
                   </select>
                 </div>
                 
                 {noiseGateMode === 'adaptive' && (
                   <div className="bg-gray-800 rounded p-2">
                     <div className="flex items-center justify-between text-xs">
                       <span className="text-gray-400">Ambient Noise</span>
                       <span className="text-cyan-400 font-mono">{ambientNoiseLevel.toFixed(1)}%</span>
                     </div>
                     <div className="flex items-center justify-between text-xs mt-1">
                       <span className="text-gray-400">Auto Threshold</span>
                       <span className="text-green-400 font-mono">{adaptiveThresholdRef.current?.toFixed(1) || '0.0'}%</span>
                     </div>
                     <div className="text-xs text-gray-500 mt-1">
                       ☕ Perfect for coffee shops
                     </div>
                   </div>
                 )}
               </>
             )}
           </div>

          {/* Start Button */}
          <button
            onClick={handleStartTranslation}
            className={`w-full py-3.5 rounded-lg font-semibold text-sm transition-all duration-300 ${
              isTranslating
                ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/50'
                : 'bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 text-white shadow-lg shadow-cyan-500/50'
            }`}
          >
            {isTranslating ? '⏹ STOP STREAMING' : '▶ START LIVE TRANSLATION'}
          </button>

          {/* Auto-configure Button */}
          <button
            onClick={handleAutoConfig}
            className="w-full py-2.5 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-cyan-500/50 rounded-lg text-gray-300 text-xs font-medium flex items-center justify-center gap-2 transition-all"
          >
            <Settings className="w-3.5 h-3.5" />
            Auto-configure Audio & Mic (VAC)
          </button>

          {/* Microphone Volume & Sensitivity */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-2.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className={`w-4 h-4 ${isTranslating && micVolume > (sensitivity/2) ? 'text-cyan-400' : 'text-gray-600'}`} />
                <span className="text-xs text-gray-400 font-medium">MICROPHONE INPUT</span>
              </div>
              {isTranslating && micVolume > (sensitivity/2) && (
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-red-400">ACTIVE</span>
                </div>
              )}
            </div>

            {/* Volume Meter */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-500">Volume Level</span>
                <span className="text-xs text-cyan-400 font-mono">{micVolume}%</span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-150 ${
                    micVolume > 80 ? 'bg-red-500' : 
                    micVolume > (sensitivity/2) ? 'bg-cyan-500' : 
                    'bg-gray-700'
                  }`}
                  style={{ width: `${micVolume}%` }}
                />
              </div>
            </div>

            {/* Sensitivity Slider */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-gray-500">Sensitivity Threshold</span>
                <span className="text-xs text-gray-400 font-mono">{sensitivity}%</span>
              </div>
              <div className="relative">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sensitivity}
                  onChange={(e) => setSensitivity(Number(e.target.value))}
                  className="w-full h-2 bg-gray-800 rounded-full appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, rgb(6 182 212) 0%, rgb(6 182 212) ${sensitivity}%, rgb(31 41 55) ${sensitivity}%, rgb(31 41 55) 100%)`
                  }}
                />
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-gray-600">Low</span>
                <span className="text-xs text-gray-600">High</span>
              </div>
            </div>
          </div>

          {/* Translation Preview */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-2.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400 font-medium">TRANSLATION PREVIEW</span>
              {isTranslating && (
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse"></div>
                  <span className="text-xs text-cyan-400">LIVE</span>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              {/* Source Language Column */}
              <div>
                <div className="text-xs text-gray-500 mb-1 font-medium">
                  {languages.find(l => l.code === sourceLang)?.flag} SOURCE
                </div>
                <div className="space-y-1">
                  {previewText.length === 0 ? (
                      <div className="text-xs py-1 px-1.5 rounded border border-gray-800 text-gray-600">—</div>
                  ) : (
                      previewText.map((item, idx) => (
                        <div
                          key={`source-${idx}`}
                          className="text-xs py-1 px-1.5 rounded border text-gray-300 bg-gray-800/50 border-gray-700"
                        >
                          {item.source}
                        </div>
                      ))
                  )}
                </div>
              </div>

              {/* Target Language Column */}
              <div>
                <div className="text-xs text-cyan-400 mb-1 font-medium">
                  {languages.find(l => l.code === targetLang)?.flag} TRANSLATED
                </div>
                <div className="space-y-1">
                   {previewText.length === 0 ? (
                      <div className="text-xs py-1 px-1.5 rounded border border-gray-800 text-gray-600">—</div>
                  ) : (
                      previewText.map((item, idx) => (
                        <div
                          key={`target-${idx}`}
                          className="text-xs py-1 px-1.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-100"
                        >
                          {item.target}
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-gray-900 border-t border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic className={`w-3.5 h-3.5 ${isTranslating ? 'text-cyan-400' : 'text-gray-600'}`} />
            <span className="text-xs text-gray-500">
              {isTranslating ? 'Listening...' : 'Ready'}
            </span>
          </div>
          <span className="text-xs text-gray-600">v2.1.0</span>
        </div>
      </div>

      {/* Overlay Widget (Floating) */}
      {showOverlay && (
        <div className="fixed top-10 right-10 w-[400px] bg-black/90 backdrop-blur-sm rounded-lg border border-cyan-500/30 p-4 shadow-2xl z-50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
              <span className="text-xs text-cyan-400 font-medium">LIVE TRANSLATION</span>
            </div>
            <button
              onClick={() => setShowOverlay(false)}
              className="text-gray-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-3">
             {previewText.map((item, idx) => (
                <div key={idx} className="bg-gradient-to-r from-cyan-500/10 to-transparent border-l-2 border-cyan-500 pl-3 py-2">
                    <p className="text-white text-sm leading-relaxed">{item.target}</p>
                </div>
             ))}
          </div>

          <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between">
            <span className="text-xs text-gray-500">
                {languages.find(l => l.code === sourceLang)?.flag} → {languages.find(l => l.code === targetLang)?.flag}
            </span>
            <span className="text-xs text-cyan-400">{latency}ms</span>
          </div>
        </div>
      )}

      {/* Configuration Modal */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-[400px]">
                <h3 className="text-white font-semibold mb-4">Auto Configuration</h3>
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${configStep >= 1 ? 'bg-cyan-500 text-white' : 'bg-gray-800 text-gray-500'}`}>1</div>
                        <span className="text-sm text-gray-300">Checking Microphone...</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${configStep >= 2 ? 'bg-cyan-500 text-white' : 'bg-gray-800 text-gray-500'}`}>2</div>
                        <span className="text-sm text-gray-300">Configuring Virtual Audio Cable...</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${configStep >= 3 ? 'bg-cyan-500 text-white' : 'bg-gray-800 text-gray-500'}`}>3</div>
                        <span className="text-sm text-gray-300">Testing Audio Output...</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${configStep >= 4 ? 'bg-green-500 text-white' : 'bg-gray-800 text-gray-500'}`}>
                            <Check className="w-5 h-5" />
                        </div>
                        <span className="text-sm text-gray-300">Complete!</span>
                    </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                    {!isConfiguring && configStep === 0 && (
                        <button onClick={startAutoConfigProcess} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded text-sm">Start</button>
                    )}
                    <button onClick={closeConfigModal} className="px-4 py-2 border border-gray-600 hover:bg-gray-800 text-gray-300 rounded text-sm">Close</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default ControlHub;
