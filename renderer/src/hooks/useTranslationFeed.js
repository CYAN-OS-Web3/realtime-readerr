import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { ipcService } from '../services/ipcService';

/**
 * useTranslationFeed
 * Handles translation updates, STT transcripts, and TTS playback/cross-fading.
 */
export const useTranslationFeed = () => {
    const { 
        isTranslating,
        addTranscript, 
        updateLastTranscript, 
        isConnected, 
        latency, 
        authUserId, 
        setAuthUserId, 
        setInstallId,
        addLog,
        setConnection,
        setBackendUrl,
        setWSConnectionState,
        settings
    } = useStore();

    // TTS Playback Refs
    const ttsCtxRef = useRef(null);
    const ttsOutputDestRef = useRef(null);
    const ttsLocalGainRef = useRef(null);
    const ttsCloudGainRef = useRef(null);
    const ttsLastScheduledRef = useRef(0);
    const ttsCloudFadeInDoneRef = useRef(false);
    const cloudAudioRef = useRef(new Audio());
    const ttsFadeMs = 350;

    // --- Helpers ---
    
    const initAudioContext = () => {
        if (!ttsCtxRef.current) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioContext();
            ttsCtxRef.current = ctx;
            console.log('[TTS] Audio context initialized, state:', ctx.state);
            
            // Create gain nodes for local and cloud TTS
            ttsLocalGainRef.current = ctx.createGain();
            ttsLocalGainRef.current.gain.value = 1.0;
            ttsCloudGainRef.current = ctx.createGain();
            ttsCloudGainRef.current.gain.value = 1.0;
            
            // Connect gain nodes directly to destination (speakers)
            ttsLocalGainRef.current.connect(ctx.destination);
            ttsCloudGainRef.current.connect(ctx.destination);
            
            console.log('[TTS] Gain nodes connected to speaker output');
        }
        return ttsCtxRef.current;
    };

    const toFloat32 = (int16) => {
        const out = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
            out[i] = int16[i] / 0x8000;
        }
        return out;
    };

    const schedulePcm = async (chunk, isLocal = false) => {
        try {
            const chunkSize = chunk?.byteLength || chunk?.length || 0;
            if (!chunk || chunkSize === 0) return;
            
            const ctx = initAudioContext();
            if (ctx.state === 'suspended') await ctx.resume();

            const u8 = (chunk instanceof Uint8Array) ? chunk : new Uint8Array(chunk);
            
            let audioBuffer;

            // Check if this looks like MP3/MPEG (starts with 0xFF or 'ID3')
            // or if it's high-quality cloud audio that might be compressed.
            const isCompressed = !isLocal && (u8[0] === 0xFF || (u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33));

            if (isCompressed) {
                try {
                    // Decode compressed audio (MP3/AAC/etc.)
                    audioBuffer = await ctx.decodeAudioData(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
                    console.log(`[TTS] Decoded compressed cloud audio: ${audioBuffer.duration.toFixed(2)}s`);
                } catch (e) {
                    console.warn('[TTS] Failed to decode as compressed audio, falling back to PCM logic');
                }
            }

            // Fallback: Handle as Raw 16kHz Int16 PCM
            if (!audioBuffer) {
                const int16 = new Int16Array(u8.buffer, u8.byteOffset, u8.byteLength / 2);
                const float = toFloat32(int16);
                audioBuffer = ctx.createBuffer(1, float.length, 16000);
                audioBuffer.copyToChannel(float, 0);
            }
            
            const src = ctx.createBufferSource();
            src.buffer = audioBuffer;
            
            const startAt = Math.max(ctx.currentTime, ttsLastScheduledRef.current);
            const gainNode = isLocal ? ttsLocalGainRef.current : ttsCloudGainRef.current;
            
            src.connect(gainNode);
            src.start(startAt);
            ttsLastScheduledRef.current = startAt + audioBuffer.duration;
        } catch (err) {
            console.error('[TTS] Error scheduling audio:', err);
        }
    };

    const isTranslatingRef = useRef(isTranslating);
    useEffect(() => {
        isTranslatingRef.current = isTranslating;
    }, [isTranslating]);

    const speakLocal = (text) => {
        if (!isTranslatingRef.current || !text) return;
        
        // Stop any current speech
        window.speechSynthesis.cancel();
        
        const langCode = settings.targetLang;
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Attempt to find a voice that matches the language
        const voices = window.speechSynthesis.getVoices();
        
        const target = langCode.toLowerCase().replace('_', '-');
        const targetPrefix = target.split('-')[0];

        // Priority 1: Exact match (case-insensitive, handles hi-IN vs hi_IN)
        // Priority 2: Language prefix match (e.g., hi)
        const voice = voices.find(v => v.lang.toLowerCase().replace('_', '-') === target) || 
                      voices.find(v => v.lang.toLowerCase().startsWith(targetPrefix));
        
        if (voice) {
            utterance.voice = voice;
            utterance.lang = voice.lang;
            console.log(`[TTS] Speaking locally using voice: ${voice.name} (${voice.lang})`);
        } else {
            utterance.lang = langCode;
            const availableLangs = [...new Set(voices.map(v => v.lang))].join(', ');
            console.warn(`[TTS] No matching system voice found for ${langCode}. Available languages: [${availableLangs}]. Using browser default.`);
        }
        
        utterance.volume = 1.0;
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
    };

    // --- Audio Output Routing ---
    useEffect(() => {
        if (!ttsOutputDestRef.current) return;
        
        const el = document.getElementById('keep-alive-audio');
        if (el && typeof el.setSinkId === 'function') {
            const desiredSink = (isTranslating && (settings.outputDeviceId === 'default'))
                ? 'communications'
                : settings.outputDeviceId;
            
            el.setSinkId(desiredSink).catch(err => {
                console.warn('[TTS] Failed to set sink ID:', err);
            });
        }
    }, [settings.outputDeviceId, isTranslating]);

    // --- Effects ---
    
    // Warm up the voices list (some browsers load it asynchronously)
    useEffect(() => {
        const warmUp = () => {
            const voices = window.speechSynthesis.getVoices();
            if (voices.length > 0) {
                console.log(`[TTS] System voices loaded: ${voices.length} voices available.`);
            }
        };
        warmUp();
        window.speechSynthesis.onvoiceschanged = warmUp;
        return () => {
            window.speechSynthesis.onvoiceschanged = null;
        };
    }, []);

    useEffect(() => {
        // --- 1. Initial Data Fetch ---
        ipcService.getBackendUrl().then(setBackendUrl).catch(console.error);
        ipcService.getInstallId().then(setInstallId).catch(console.error);

        // --- 2. Listeners ---

        const unsubAuth = ipcService.onAuthSync((data) => {
            if (data?.userId) {
                setAuthUserId(data.userId);
                setInstallId(data.userId);
            }
        });

        const unsubStatus = ipcService.onServerStatus((status) => {
            setConnection(status.connected, status.latency);
        });

        const unsubLog = ipcService.onLogMessage((msg, type) => {
            addLog(msg, type);
        });

        const unsubSTT = ipcService.onSTTTranscript((data) => {
            // Updated: Only add or update transcripts
            if (data.isFinal) {
                updateLastTranscript({ source: data.transcript, isFinal: true });
            } else {
                // For partials, we look at the last entry. If it's not final, update it.
                // Or if it's the first partial of a new utterance, add it.
                updateLastTranscript({ source: data.transcript, isFinal: false });
            }
        });

        const unsubTranslation = ipcService.onTranslationUpdate((data) => {
            updateLastTranscript({ source: data.sourceText, target: data.translatedText, isFinal: true });
            
            // Trigger Local TTS for instant feedback
            if (data.translatedText) {
                console.log(`[TTS] Incoming translation: "${data.translatedText}". Starting local TTS fallback.`);
                addLog(`Starting local TTS for: "${data.translatedText.substring(0, 30)}..."`, 'info');
                speakLocal(data.translatedText);
            }
        });

        const unsubAudioChunk = ipcService.onAudioChunk((chunk) => {
            const chunkSize = chunk?.byteLength || chunk?.length || 0;
            const dataType = chunk?.constructor?.name || typeof chunk;
            console.log(`[TTS] Cloud audio chunk received (${dataType}, ${chunkSize} bytes). Promoting to high-quality cloud voice and cancelling local fallback.`);
            addLog(`Cloud audio received: ${chunkSize} bytes of ${dataType}`, 'success');
            
            // Cancel local speech when professional cloud audio starts arriving
            window.speechSynthesis.cancel();
            
            // Stable Playback: Use a Blob URL for the MP3 data
            try {
                const blob = new Blob([chunk], { type: 'audio/mpeg' });
                const url = URL.createObjectURL(blob);
                
                const audio = cloudAudioRef.current;
                audio.src = url;
                
                // Handle routing
                if (typeof audio.setSinkId === 'function' && settings.outputDeviceId !== 'default') {
                    audio.setSinkId(settings.outputDeviceId).catch(() => {});
                }
                
                audio.play().catch(e => console.error('[TTS] Audio element play failed:', e));
                
                // Cleanup URL after playing
                audio.onended = () => URL.revokeObjectURL(url);
            } catch (e) {
                console.error('[TTS] Failed to play cloud audio via element:', e);
                // Fallback to PCM scheduler if blob fails
                schedulePcm(chunk, false);
            }
            
            // Fade out local when cloud arrives
            const ctx = ttsCtxRef.current;
            if (ctx && ttsLocalGainRef.current) {
                const now = ctx.currentTime;
                ttsLocalGainRef.current.gain.cancelScheduledValues(now);
                ttsLocalGainRef.current.gain.setValueAtTime(ttsLocalGainRef.current.gain.value, now);
                ttsLocalGainRef.current.gain.linearRampToValueAtTime(0.0, now + ttsFadeMs / 1000);
                console.log('[TTS] Local TTS fade-out scheduled');
            }
            
            // Fade in cloud
            if (ctx && ttsCloudGainRef.current && !ttsCloudFadeInDoneRef.current) {
                const now = ctx.currentTime;
                ttsCloudGainRef.current.gain.cancelScheduledValues(now);
                ttsCloudGainRef.current.gain.setValueAtTime(0.0, now);
                ttsCloudGainRef.current.gain.linearRampToValueAtTime(1.0, now + ttsFadeMs / 1000);
                ttsCloudFadeInDoneRef.current = true;
                console.log('[TTS] Cloud TTS fade-in scheduled');
            }
        });

        const unsubAudioChunkLocal = ipcService.onAudioChunkLocal?.((chunk) => {
            console.log('[TTS] Local PCM audio chunk received');
            schedulePcm(chunk, true);
        });

        const unsubAudioDone = ipcService.onAudioDone(() => {
            console.log('[TTS] Audio playback done');
            if (ttsCtxRef.current) {
                ttsLastScheduledRef.current = Math.max(ttsCtxRef.current.currentTime, ttsLastScheduledRef.current);
            }
            ttsCloudFadeInDoneRef.current = false;
        });

        const unsubWSState = ipcService.onWSConnectionState?.((data) => {
            if (data?.state) {
                setWSConnectionState(data.state);
            }
        });

        return () => {
            if (typeof unsubAuth === 'function') unsubAuth();
            if (typeof unsubStatus === 'function') unsubStatus();
            if (typeof unsubLog === 'function') unsubLog();
            if (typeof unsubSTT === 'function') unsubSTT();
            if (typeof unsubTranslation === 'function') unsubTranslation();
            if (typeof unsubAudioChunk === 'function') unsubAudioChunk();
            if (typeof unsubAudioDone === 'function') unsubAudioDone();
            if (typeof unsubAudioChunkLocal === 'function') unsubAudioChunkLocal();
            if (typeof unsubWSState === 'function') unsubWSState();
        };
    }, []);

    return {
        ttsCtx: ttsCtxRef.current
    };
};
