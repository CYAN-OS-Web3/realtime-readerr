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
        settings
    } = useStore();

    // TTS Playback Refs
    const ttsCtxRef = useRef(null);
    const ttsOutputDestRef = useRef(null);
    const ttsLocalGainRef = useRef(null);
    const ttsCloudGainRef = useRef(null);
    const ttsLastScheduledRef = useRef(0);
    const ttsCloudFadeInDoneRef = useRef(false);
    const ttsFadeMs = 350;

    // --- Helpers ---
    
    const initAudioContext = () => {
        if (!ttsCtxRef.current) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioContext();
            ttsCtxRef.current = ctx;
            ttsOutputDestRef.current = ctx.createMediaStreamDestination();
            ttsLocalGainRef.current = ctx.createGain();
            ttsLocalGainRef.current.gain.value = 1.0;
            ttsCloudGainRef.current = ctx.createGain();
            ttsCloudGainRef.current.gain.value = 1.0;

            // Keep-alive silent audio
            const el = new Audio();
            el.autoplay = true;
            el.srcObject = ttsOutputDestRef.current.stream;
            el.play().catch(() => {});
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

    const schedulePcm = (chunk, isLocal = false) => {
        const ctx = initAudioContext();
        if (ctx.state === 'suspended') {
            ctx.resume().catch(console.warn);
        }
        const u8 = (chunk instanceof Uint8Array) ? chunk : new Uint8Array(chunk);
        const int16 = new Int16Array(u8.buffer, u8.byteOffset, u8.byteLength / 2);
        const float = toFloat32(int16);
        
        const buf = ctx.createBuffer(1, float.length, 16000);
        buf.copyToChannel(float, 0);
        
        const src = ctx.createBufferSource();
        src.buffer = buf;
        
        const startAt = Math.max(ctx.currentTime, ttsLastScheduledRef.current);
        const gainNode = isLocal ? ttsLocalGainRef.current : ttsCloudGainRef.current;
        
        src.connect(gainNode);
        gainNode.connect(ttsOutputDestRef.current || ctx.destination);
        
        src.start(startAt);
        ttsLastScheduledRef.current = startAt + buf.duration;
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
        const utterance = new SpeechSynthesisUtterance(text.split(' ').slice(0, 5).join(' '));
        utterance.lang = langCode;
        utterance.volume = 1.0;
        utterance.rate = 1.0;
        
        // SpeechSynthesis doesn't easily support setSinkId, it uses system default.
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
                speakLocal(data.translatedText);
            }
        });

        const unsubAudioChunk = ipcService.onAudioChunk((chunk) => {
            // Cancel local speech when professional cloud audio starts arriving
            window.speechSynthesis.cancel();
            
            schedulePcm(chunk, false);
            
            // Fade out local when cloud arrives
            const ctx = ttsCtxRef.current;
            if (ctx && ttsLocalGainRef.current) {
                const now = ctx.currentTime;
                ttsLocalGainRef.current.gain.cancelScheduledValues(now);
                ttsLocalGainRef.current.gain.setValueAtTime(ttsLocalGainRef.current.gain.value, now);
                ttsLocalGainRef.current.gain.linearRampToValueAtTime(0.0, now + ttsFadeMs / 1000);
            }
            
            // Fade in cloud
            if (ctx && ttsCloudGainRef.current && !ttsCloudFadeInDoneRef.current) {
                const now = ctx.currentTime;
                ttsCloudGainRef.current.gain.cancelScheduledValues(now);
                ttsCloudGainRef.current.gain.setValueAtTime(0.0, now);
                ttsCloudGainRef.current.gain.linearRampToValueAtTime(1.0, now + ttsFadeMs / 1000);
                ttsCloudFadeInDoneRef.current = true;
            }
        });

        const unsubAudioChunkLocal = ipcService.onAudioChunkLocal?.((chunk) => {
            schedulePcm(chunk, true);
        });

        const unsubAudioDone = ipcService.onAudioDone(() => {
            if (ttsCtxRef.current) {
                ttsLastScheduledRef.current = Math.max(ttsCtxRef.current.currentTime, ttsLastScheduledRef.current);
            }
            ttsCloudFadeInDoneRef.current = false;
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
        };
    }, []);

    return {
        ttsCtx: ttsCtxRef.current
    };
};
