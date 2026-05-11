import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { ipcService } from '../services/ipcService';

/**
 * useTranslationFeed
 * Handles translation updates, STT transcripts, and TTS playback/cross-fading.
 */
export const useTranslationFeed = () => {
    const { 
        isTranslating,
        setIsTranslating,
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
    const isLocalSpeakingRef = useRef(false);
    const lastTranslationRef = useRef('');
    const localTtsTimerRef = useRef(null);
    const cloudAudioChunksRef = useRef([]); // Buffer for accumulating cloud audio chunks
    const cloudAudioPlayingRef = useRef(false);

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

    const schedulePcm = useCallback(async (chunk, isLocal = false) => {
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
                } catch {
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
    }, []);

    const isTranslatingRef = useRef(isTranslating);
    useEffect(() => {
        isTranslatingRef.current = isTranslating;
    }, [isTranslating]);

    const speakLocal = useCallback((text) => {
        if (!isTranslatingRef.current || !text) return;
        
        const langCode = useStore.getState().settings.targetLang;
        const addLog = useStore.getState().addLog;
        
        // Languages with complex scripts that local TTS doesn't handle well
        const complexScriptLangs = ['hi', 'ta', 'te', 'kn', 'ml', 'ar', 'th', 'km', 'lo'];
        const langPrefix = langCode.toLowerCase().split('-')[0];
        
        if (complexScriptLangs.includes(langPrefix)) {
            console.log(`[TTS] ⚠️  ${langCode} uses complex script (${langPrefix}). Skipping local TTS - waiting for cloud TTS only.`);
            addLog(`[TTS] Waiting for cloud TTS for ${langCode}...`, 'warn');
            return; // Skip local TTS for complex scripts
        }
        
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
        
        // Track speaking state
        utterance.onstart = () => {
            isLocalSpeakingRef.current = true;
            console.log('[TTS] Local speech started');
        };
        
        utterance.onend = () => {
            isLocalSpeakingRef.current = false;
            console.log('[TTS] Local speech ended');
        };
        
        utterance.onerror = (e) => {
            isLocalSpeakingRef.current = false;
            console.error('[TTS] Local speech error:', e.error);
        };
        
        window.speechSynthesis.speak(utterance);
    }, []);

    const clearLocalTtsTimer = useCallback(() => {
        if (localTtsTimerRef.current) {
            clearTimeout(localTtsTimerRef.current);
            localTtsTimerRef.current = null;
        }
    }, []);

    const stopTranslationFromVoiceCommand = useCallback(() => {
        clearLocalTtsTimer();
        window.speechSynthesis.cancel();
        cloudAudioRef.current.pause();
        cloudAudioRef.current.currentTime = 0;
        cloudAudioChunksRef.current = [];
        cloudAudioPlayingRef.current = false;
        isLocalSpeakingRef.current = false;
        lastTranslationRef.current = '';

        const addLog = useStore.getState().addLog;
        ipcService.toggleTranslation({ isTranslating: false });
        ipcService.hideOverlay();
        setIsTranslating(false);
        addLog('Voice command detected: cyan sleep. Stopping session.', 'info');
        console.log('[TTS] Voice command "cyan sleep" detected. Session stopped from renderer.');
    }, [clearLocalTtsTimer, setIsTranslating]);

    // --- Audio Output Routing ---
    useEffect(() => {
        if (!ttsOutputDestRef.current) return;
        
        const el = document.getElementById('keep-alive-audio');
        if (el && typeof el.setSinkId === 'function') {
            const outputDeviceId = useStore.getState().settings.outputDeviceId;
            const desiredSink = (isTranslating && (outputDeviceId === 'default'))
                ? 'communications'
                : outputDeviceId;
            
            el.setSinkId(desiredSink).catch(err => {
                console.warn('[TTS] Failed to set sink ID:', err);
            });
        }
    }, [isTranslating]);

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
        ipcService.getBackendUrl().then((url) => useStore.getState().setBackendUrl(url)).catch(console.error);
        ipcService.getInstallId().then((id) => useStore.getState().setInstallId(id)).catch(console.error);

        // --- 2. Listeners ---

        const unsubAuth = ipcService.onAuthSync((data) => {
            if (data?.userId) {
                useStore.getState().setAuthUserId(data.userId);
                useStore.getState().setInstallId(data.userId);
            }
        });

        const unsubStatus = ipcService.onServerStatus((status) => {
            useStore.getState().setConnection(status.connected, status.latency);
        });

        const unsubLog = ipcService.onLogMessage((msg, type) => {
            useStore.getState().addLog(msg, type);
        });

        const unsubSTT = ipcService.onSTTTranscript((data) => {
            // Updated: Only add or update transcripts
            if (data.isFinal) {
                useStore.getState().updateLastTranscript({ source: data.transcript, isFinal: true });

                const normalizedTranscript = String(data.transcript || '')
                    .toLowerCase()
                    .replace(/[^a-z0-9\s]/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                if (/\btranslation\s+sleep\b/.test(normalizedTranscript)) {
                    stopTranslationFromVoiceCommand();
                    return;
                }
            } else {
                // For partials, we look at the last entry. If it's not final, update it.
                // Or if it's the first partial of a new utterance, add it.
                useStore.getState().updateLastTranscript({ source: data.transcript, isFinal: false });
            }
        });

        const unsubTranslation = ipcService.onTranslationUpdate((data) => {
            useStore.getState().updateLastTranscript({ source: data.sourceText, target: data.translatedText, isFinal: true });
            
            // Capture final transcripts to session for later submission to Go Backend
            if (data.sourceText && data.translatedText) {
                useStore.getState().addFinalTranscript({
                    source: data.sourceText,
                    target: data.translatedText,
                    isFinal: true,
                    timestamp: new Date().toISOString() // ISO format for Go Backend
                });
                console.log('[Session] Captured final transcript:', {
                    source: data.sourceText.substring(0, 50),
                    target: data.translatedText.substring(0, 50),
                    timestamp: new Date().toISOString()
                });
            }
            
            // Delay local TTS for 1 second so cloud audio can arrive first.
            // If cloud audio starts within that window, the timer is cleared.
            if (data.translatedText && data.translatedText !== lastTranslationRef.current) {
                lastTranslationRef.current = data.translatedText;
                clearLocalTtsTimer();

                console.log(`[TTS] New translation received. Waiting 1s before local fallback: "${data.translatedText.substring(0, 50)}${data.translatedText.length > 50 ? '...' : ''}"`);

                localTtsTimerRef.current = setTimeout(() => {
                    localTtsTimerRef.current = null;

                    if (!isLocalSpeakingRef.current && !cloudAudioPlayingRef.current && cloudAudioChunksRef.current.length === 0) {
                        console.log('[TTS] No cloud audio arrived within 1s. Starting local TTS fallback.');
                        useStore.getState().addLog(`Starting local TTS for: "${data.translatedText.substring(0, 30)}..."`, 'info');
                        speakLocal(data.translatedText);
                    } else {
                        console.log('[TTS] Skipping local TTS because cloud audio arrived in time or is already playing.');
                    }
                }, 1200);
            }
        });

        const unsubAudioChunk = ipcService.onAudioChunk((chunk) => {
            clearLocalTtsTimer();

            // IMMEDIATE: Stop local TTS without delay (synchronous)
            if (isLocalSpeakingRef.current) {
                window.speechSynthesis.cancel();
                isLocalSpeakingRef.current = false;
                console.log('[TTS] Local TTS cancelled immediately on cloud audio arrival');
            }
            
            const chunkSize = chunk?.byteLength || chunk?.length || 0;
            const dataType = chunk?.constructor?.name || typeof chunk;
            
            // Buffer this chunk for later playback
            cloudAudioChunksRef.current.push(new Uint8Array(chunk));
            const totalSize = cloudAudioChunksRef.current.reduce((sum, c) => sum + c.length, 0);
            
            console.log(`[TTS] Cloud audio chunk ${cloudAudioChunksRef.current.length} received (${dataType}, ${chunkSize} bytes). Total buffered: ${totalSize} bytes`);
            useStore.getState().addLog(`Cloud audio buffering: ${chunkSize} bytes (chunk ${cloudAudioChunksRef.current.length})`, 'success');
            
            // Show first chunk visual indicator
            if (cloudAudioChunksRef.current.length === 1) {
                console.log('[TTS] 🎵 First cloud audio chunk arrived - waiting for all chunks...');
            }
            
            // Fade out local when cloud arrives (smooth transition)
            const ctx = ttsCtxRef.current;
            if (ctx && ttsLocalGainRef.current && !cloudAudioPlayingRef.current) {
                const now = ctx.currentTime;
                ttsLocalGainRef.current.gain.cancelScheduledValues(now);
                ttsLocalGainRef.current.gain.setValueAtTime(ttsLocalGainRef.current.gain.value, now);
                ttsLocalGainRef.current.gain.linearRampToValueAtTime(0.0, now + ttsFadeMs / 1000);
                console.log('[TTS] Local TTS fade-out scheduled');
            }
            
            // Fade in cloud (on first chunk)
            if (ctx && ttsCloudGainRef.current && !ttsCloudFadeInDoneRef.current && cloudAudioChunksRef.current.length === 1) {
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
            console.log(`[TTS] 🎉 Audio done signal received. Playing ${cloudAudioChunksRef.current.length} accumulated cloud audio chunks`);
            
            if (ttsCtxRef.current) {
                ttsLastScheduledRef.current = Math.max(ttsCtxRef.current.currentTime, ttsLastScheduledRef.current);
            }
            ttsCloudFadeInDoneRef.current = false;
            isLocalSpeakingRef.current = false;
            
            // Now play all accumulated chunks as a single audio blob
            if (cloudAudioChunksRef.current.length > 0) {
                try {
                    // Combine all chunks into a single buffer
                    const totalSize = cloudAudioChunksRef.current.reduce((sum, c) => sum + c.length, 0);
                    const combinedBuffer = new Uint8Array(totalSize);
                    let offset = 0;
                    for (const chunk of cloudAudioChunksRef.current) {
                        combinedBuffer.set(chunk, offset);
                        offset += chunk.length;
                    }
                    
                    console.log(`[TTS] 📦 Combined ${cloudAudioChunksRef.current.length} chunks into ${totalSize} bytes. Creating playable blob...`);
                    
                    // Create blob and play
                    const blob = new Blob([combinedBuffer], { type: 'audio/mpeg' });
                    const url = URL.createObjectURL(blob);
                    
                    const audio = cloudAudioRef.current;
                    audio.src = url;
                    
                    // Handle routing
                    const outputDeviceId = useStore.getState().settings.outputDeviceId;
                    if (typeof audio.setSinkId === 'function' && outputDeviceId !== 'default') {
                        audio.setSinkId(outputDeviceId).catch(() => {});
                    }
                    
                    cloudAudioPlayingRef.current = true;
                    audio.play().catch(e => console.error('[TTS] Audio element play failed:', e));
                    
                    // Cleanup URL after playing
                    audio.onended = () => {
                        console.log('[TTS] ✅ Cloud audio playback complete');
                        URL.revokeObjectURL(url);
                        cloudAudioPlayingRef.current = false;
                    };
                    
                    console.log('[TTS] ▶️  Playing combined cloud audio now...');
                } catch (e) {
                    console.error('[TTS] Failed to play combined cloud audio:', e);
                    cloudAudioPlayingRef.current = false;
                }
            }
            
            // Clear chunk buffer for next phrase
            cloudAudioChunksRef.current = [];
            // Reset so the next translation can be spoken
            lastTranslationRef.current = '';
        });

        const unsubWSState = ipcService.onWSConnectionState?.((data) => {
            if (data?.state) {
                useStore.getState().setWSConnectionState(data.state);
            }
        });

        return () => {
            clearLocalTtsTimer();
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
    }, [clearLocalTtsTimer, schedulePcm, speakLocal, stopTranslationFromVoiceCommand]);

};
