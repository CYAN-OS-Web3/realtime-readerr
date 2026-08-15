import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { ipcService } from '../services/ipcService';
import { webAudioService } from '../services/webAudioService';
import { IS_WEB } from '../web3/config';

/**
 * AudioWorklet code runs on an isolated audio rendering thread.
 * We do downsampling HERE so the main JS thread is NEVER blocked.
 *
 * The worklet receives { sampleRate: number, targetRate: number } on first
 * message (via port.postMessage) and thereafter sends back Int16Array buffers
 * that are already resampled and ready for IPC.
 */
const WORKLET_CODE = `
class MicProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);
        this._targetRate   = 16000;   // default, updated via message
        this._sourceRate   = sampleRate; // global AudioWorkletGlobalScope value
        this._ratio        = this._sourceRate / this._targetRate;
        this._accumSamples = 0;
        this._accumSum     = 0;
        this._outBuf       = [];      // accumulate output samples

        // Target: send ~60ms chunks to balance latency vs IPC overhead
        this._chunkSamples = 0;

        this.port.onmessage = (e) => {
            if (e.data && e.data.targetRate) {
                this._targetRate   = e.data.targetRate;
                this._ratio        = this._sourceRate / this._targetRate;
                // 60ms of output samples
                this._chunkSamples = Math.floor(this._targetRate * 0.060);
            }
        };
    }

    process(inputs) {
        const ch = inputs[0] && inputs[0][0];
        if (!ch) return true;

        // --- Downsample via integer averaging (fast, no malloc) ---
        let rms = 0;
        for (let i = 0; i < ch.length; i++) {
            const s = ch[i];
            rms += s * s;

            this._accumSum     += s;
            this._accumSamples += 1;

            if (this._accumSamples >= this._ratio) {
                const avg = this._accumSum / this._accumSamples;
                const clamped = avg < -1 ? -1 : avg > 1 ? 1 : avg;
                // Convert to Int16
                this._outBuf.push(clamped < 0 ? (clamped * 0x8000) | 0 : (clamped * 0x7FFF) | 0);
                this._accumSum     = 0;
                this._accumSamples = 0;
            }
        }

        // RMS for volume (fast, no sqrt yet — done in receiver)
        const rmsMean = rms / ch.length;

        // When we have a chunk ready, send it
        if (this._outBuf.length >= this._chunkSamples) {
            const int16 = new Int16Array(this._outBuf);
            this._outBuf = [];
            this.port.postMessage({ pcm: int16, rmsMean }, [int16.buffer]);
        }

        return true;
    }
}
try {
    registerProcessor('mic-processor', MicProcessor);
} catch (_) {}
`;

/**
 * useAudioPipeline
 * Manages audio capture, downsampling (on worklet thread), VAD, and IPC sending.
 */
export const useAudioPipeline = () => {
    const {
        isTranslating,
        settings,
        setMicVolume,
        addLog
    } = useStore();

    // ---- Refs -----------------------------------------------------------
    const audioContextRef        = useRef(null);
    const mediaStreamRef         = useRef(null);
    const processorRef           = useRef(null);
    const sourceRef              = useRef(null);
    const gainNodeRef            = useRef(null);

    // isRunningRef = single source of truth for "pipeline is live"
    // Used inside worklet callbacks to avoid stale closure on isTranslating
    const isRunningRef           = useRef(false);

    // Voice-activity detection state
    const isVoiceActiveRef       = useRef(false);
    const lastVoiceAtRef         = useRef(Date.now());
    const hasSentDataRef         = useRef(false);
    const detectedAudioRef       = useRef(false);

    // Chunk accumulation (already-downsampled Int16 arrays)
    const chunkBufferRef         = useRef([]); // Int16Array[]
    const chunkSamplesRef        = useRef(0);  // total samples buffered

    // Pre-roll: keep ~300ms of history to prepend when voice starts
    // Each entry is a downsampled Int16Array (~60ms)
    const preRollBufferRef       = useRef([]); // max 5 entries × 60ms = 300ms

    // Volume throttle
    const lastVolUpdateRef       = useRef(0);

    // Sensitivity threshold (default 30, 0-100 scale)
    const sensitivityRef         = useRef(settings.sensitivity);

    // ---- Helpers --------------------------------------------------------

    /** Concatenate Int16Arrays into one flat Int16Array */
    const mergeChunks = (chunks) => {
        let total = 0;
        for (const c of chunks) total += c.length;
        const out = new Int16Array(total);
        let offset = 0;
        for (const c of chunks) {
            out.set(c, offset);
            offset += c.length;
        }
        return out;
    };

    const flushPendingChunks = () => {
        if (chunkBufferRef.current.length === 0) return;
        const merged = mergeChunks(chunkBufferRef.current);
        chunkBufferRef.current = [];
        chunkSamplesRef.current = 0;
        const payload = new Uint8Array(merged.buffer);
        if (IS_WEB) {
            webAudioService.sendChunk(payload);
        } else {
            ipcService.sendAudioChunk(payload);
        }
    };

    // ---- Lifecycle ------------------------------------------------------

    const stopMicrophone = () => {
        if (!isRunningRef.current) return;
        isRunningRef.current = false;

        // Detach worklet first so no more messages come in
        if (processorRef.current) {
            processorRef.current.port.onmessage = null;
            processorRef.current.disconnect();
            processorRef.current = null;
        }
        if (sourceRef.current) {
            sourceRef.current.disconnect();
            sourceRef.current = null;
        }
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(t => t.stop());
            mediaStreamRef.current = null;
        }
        // Close the AudioContext completely so next start gets a clean one
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(() => {});
            audioContextRef.current = null;
        }

        // Reset VAD state
        isVoiceActiveRef.current = false;
        hasSentDataRef.current   = false;
        detectedAudioRef.current = false;
        chunkBufferRef.current   = [];
        chunkSamplesRef.current  = 0;
        preRollBufferRef.current = [];

        setMicVolume(0);
        console.log('[AudioPipeline] Microphone stopped.');
    };

    const startMicrophone = async () => {
        if (isRunningRef.current) return;
        isRunningRef.current = true;

        try {
            let stream;

            if (settings.inputDeviceId === 'system-audio') {
                try {
                    const sources = await window.electronAPI.getDesktopSources();
                    const desktopSource = sources.find(s => s.id.startsWith('screen')) || sources[0];
                    if (!desktopSource) {
                        throw new Error("No screen source found for system audio capture.");
                    }

                    stream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            mandatory: {
                                chromeMediaSource: 'desktop',
                                chromeMediaSourceId: desktopSource.id
                            }
                        },
                        video: {
                            mandatory: {
                                chromeMediaSource: 'desktop',
                                chromeMediaSourceId: desktopSource.id,
                                minWidth: 128,
                                minHeight: 128,
                                maxWidth: 128,
                                maxHeight: 128
                            }
                        }
                    });
                    
                    // We only want the audio track, stop the video track immediately
                    stream.getVideoTracks().forEach(t => t.stop());
                    
                    if (stream.getAudioTracks().length === 0) {
                        throw new Error("No audio track was captured from the system.");
                    }
                } catch (e) {
                    console.error("Failed to capture system audio:", e);
                    throw e;
                }
            } else {
                let audioConstraints = {
                    echoCancellation: settings.noiseReduction,
                    noiseSuppression: settings.noiseReduction,
                    autoGainControl:  settings.noiseReduction,
                    channelCount: 1,
                    sampleRate: { ideal: 48000 }
                };

                if (settings.inputDeviceId) {
                    audioConstraints.deviceId = { exact: settings.inputDeviceId };
                }

                stream = await navigator.mediaDevices.getUserMedia({
                    audio: audioConstraints
                });
            }

            if (!isRunningRef.current) {
                // Stopped before stream arrived
                stream.getTracks().forEach(t => t.stop());
                return;
            }

            mediaStreamRef.current = stream;
            console.log('[AudioPipeline] Microphone stream acquired.');

            // ---- 2. Create fresh AudioContext -----------------------
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const audioCtx = new AudioContext({ latencyHint: 'interactive' });
            audioContextRef.current = audioCtx;
            await audioCtx.resume();

            sensitivityRef.current = settings.sensitivity;

            // ---- 3. Audio graph: source → compressor → gain → worklet ---
            const source = audioCtx.createMediaStreamSource(stream);
            sourceRef.current = source;

            const compressor = audioCtx.createDynamicsCompressor();
            compressor.threshold.value = -50;
            compressor.knee.value      = 40;
            compressor.ratio.value     = 12;
            compressor.attack.value    = 0;
            compressor.release.value   = 0.25;

            const gainNode = audioCtx.createGain();
            gainNodeRef.current = gainNode;
            gainNode.gain.value = settings.micGain || 1.0;

            // ---- 4. Load AudioWorklet from Blob ---------------------
            const blob       = new Blob([WORKLET_CODE], { type: 'application/javascript' });
            const workletUrl = URL.createObjectURL(blob);
            try {
                await audioCtx.audioWorklet.addModule(workletUrl);
            } catch (err) {
                URL.revokeObjectURL(workletUrl);
                if (!isRunningRef.current) return; // stopped during load
                throw err;
            }
            URL.revokeObjectURL(workletUrl);

            if (!isRunningRef.current) return; // stopped during addModule await

            // ---- 5. Create worklet node and connect -----------------
            const workletNode = new AudioWorkletNode(audioCtx, 'mic-processor');
            processorRef.current = workletNode;

            // Send config to worklet
            workletNode.port.postMessage({ targetRate: settings.sampleRate });

            // Chain: source → compressor → gain → workletNode → destination
            source.connect(compressor);
            compressor.connect(gainNode);
            gainNode.connect(workletNode);
            workletNode.connect(audioCtx.destination); // required for processing to run

            // ---- 6. Pre-roll / VAD / IPC message handler -----------
            // PRE-ROLL: 5 × 60ms = 300ms history
            const MAX_PREROLL_CHUNKS = 5;
            // SEND_THRESHOLD: flush when we have ≥ 60ms of voice buffered
            const SEND_THRESHOLD_MS = 60;

            // Adaptive silence flush constants
            const SILENCE_FLUSH_MIN_MS          = 300;
            const SILENCE_FLUSH_DEFAULT_MS      = 800;
            const SILENCE_FLUSH_MAX_MS          = 1400;
            const SILENCE_FLUSH_HARD_CEILING_MS = 2800;
            const DEBOUNCE_MS                   = 250;
            const ADAPTIVE_SILENCE_ENABLED      = true;

            // Mutable timer handles scoped to this startMicrophone() invocation
            const adaptiveTimerRef    = { current: null };
            const hardCeilingTimerRef = { current: null };
            const lastVerdictCacheRef = { current: null };

            // Clears both timers atomically
            const clearFlushTimers = () => {
                if (adaptiveTimerRef.current) {
                    clearTimeout(adaptiveTimerRef.current);
                    adaptiveTimerRef.current = null;
                }
                if (hardCeilingTimerRef.current) {
                    clearTimeout(hardCeilingTimerRef.current);
                    hardCeilingTimerRef.current = null;
                }
            };

            // Returns the flush delay in ms based on the turn-detector verdict
            const getAdaptiveSilenceThreshold = async () => {
                if (!ADAPTIVE_SILENCE_ENABLED) return SILENCE_FLUSH_DEFAULT_MS;
                if (IS_WEB) return SILENCE_FLUSH_DEFAULT_MS; // No turn completeness on web yet

                const cache = lastVerdictCacheRef.current;
                if (cache && (Date.now() - cache.ts) < DEBOUNCE_MS) {
                    return cache.threshold;
                }

                try {
                    const text = useStore.getState().latestPartialTranscript || '';
                    const lang = (useStore.getState().settings.sourceLang || 'en').split('-')[0];
                    const result = await ipcService.checkTurnCompleteness(text, lang);

                    let threshold = SILENCE_FLUSH_DEFAULT_MS;
                    if (result.verdict === 'complete')   threshold = SILENCE_FLUSH_MIN_MS;
                    if (result.verdict === 'incomplete') threshold = SILENCE_FLUSH_MAX_MS;

                    console.log(`[AudioPipeline] TurnDetector verdict=${result.verdict} score=${result.score} threshold=${threshold}ms`);

                    lastVerdictCacheRef.current = { verdict: result.verdict, threshold, ts: Date.now() };
                    return threshold;
                } catch {
                    return SILENCE_FLUSH_DEFAULT_MS;
                }
            };

            // Arms both the adaptive and hard-ceiling flush timers.
            const armFlushTimers = async () => {
                clearFlushTimers();

                hardCeilingTimerRef.current = setTimeout(() => {
                    hardCeilingTimerRef.current = null;
                    adaptiveTimerRef.current = null;
                    console.log('[AudioPipeline] Hard ceiling timer fired — flushing');
                    flushPendingChunks();
                    if (IS_WEB) {
                        webAudioService.flush();
                    } else {
                        ipcService.flushAudio();
                    }
                    isVoiceActiveRef.current = false;
                    hasSentDataRef.current   = false;
                }, SILENCE_FLUSH_HARD_CEILING_MS);

                const delay = await getAdaptiveSilenceThreshold();
                
                // If the hardCeilingTimer was cleared while we were awaiting, speech resumed.
                if (hardCeilingTimerRef.current === null) {
                    return;
                }

                adaptiveTimerRef.current = setTimeout(() => {
                    adaptiveTimerRef.current = null;
                    if (hardCeilingTimerRef.current) {
                        clearTimeout(hardCeilingTimerRef.current);
                        hardCeilingTimerRef.current = null;
                    }
                    console.log(`[AudioPipeline] Adaptive silence timer fired (${delay}ms) — flushing`);
                    flushPendingChunks();
                    if (IS_WEB) {
                        webAudioService.flush();
                    } else {
                        ipcService.flushAudio();
                    }
                    isVoiceActiveRef.current = false;
                    hasSentDataRef.current   = false;
                }, delay);
            };

            workletNode.port.onmessage = (e) => {
                // Guard: if pipeline stopped, ignore any in-flight messages
                if (!isRunningRef.current) return;

                const { pcm, rmsMean } = e.data;
                if (!pcm || pcm.length === 0) return;

                // ---- Volume meter (throttled to 20fps) ----
                const vol = Math.min(100, Math.max(0,
                    Math.round(((20 * Math.log10(Math.sqrt(rmsMean) + 1e-9) + 60) / 60) * 100)
                ));
                const now = Date.now();
                if (now - lastVolUpdateRef.current > 50) {
                    setMicVolume(vol);
                    lastVolUpdateRef.current = now;
                }

                if (!detectedAudioRef.current && vol > 0) {
                    console.log(`[AudioPipeline] Signal alive. Vol: ${vol}%`);
                    detectedAudioRef.current = true;
                }

                // ---- Pre-roll maintenance ----
                preRollBufferRef.current.push(pcm);
                if (preRollBufferRef.current.length > MAX_PREROLL_CHUNKS) {
                    preRollBufferRef.current.shift();
                }

                const threshold = sensitivityRef.current;

                if (vol > threshold) {
                    // ---- Voice ACTIVE ----
                    if (!isVoiceActiveRef.current) {
                        // First frame of new phrase: prepend pre-roll (exclude current chunk
                        // which is already in preRoll at last position)
                        console.log(`[AudioPipeline] VOICE DETECTED vol=${vol}% thr=${threshold}%`);
                        const preRoll = preRollBufferRef.current.slice(0, -1);
                        for (const pr of preRoll) {
                            chunkBufferRef.current.push(pr);
                            chunkSamplesRef.current += pr.length;
                        }
                        isVoiceActiveRef.current = true;
                    }

                    // Voice resumed — cancel any pending flush timers
                    clearFlushTimers();
                    lastVerdictCacheRef.current = null; // invalidate debounce cache on new speech

                    chunkBufferRef.current.push(pcm);
                    chunkSamplesRef.current += pcm.length;
                    lastVoiceAtRef.current  = now;
                    hasSentDataRef.current  = true;

                    // Flush as soon as we have SEND_THRESHOLD_MS of audio
                    const thresholdSamples = Math.floor(settings.sampleRate * (SEND_THRESHOLD_MS / 1000));
                    if (chunkSamplesRef.current >= thresholdSamples) {
                        flushPendingChunks();
                    }

                } else {
                    // ---- Silence ----

                    if (isVoiceActiveRef.current) {
                        // Hangover period: keep sending silence chunks to the STT for natural pauses
                        chunkBufferRef.current.push(pcm);
                        chunkSamplesRef.current += pcm.length;

                        const thresholdSamples = Math.floor(settings.sampleRate * (SEND_THRESHOLD_MS / 1000));
                        if (chunkSamplesRef.current >= thresholdSamples) {
                            flushPendingChunks();
                        }

                        // Arm timers once when silence starts
                        if (adaptiveTimerRef.current === null && hardCeilingTimerRef.current === null) {
                            console.log('[AudioPipeline] VOICE ENDED — arming adaptive silence timer');
                            armFlushTimers();
                        }
                    } else {
                        // Fully silent keepalive
                        const KEEPALIVE_INTERVAL_MS = 3000;
                        if (!hasSentDataRef.current &&
                            (now - lastVoiceAtRef.current > KEEPALIVE_INTERVAL_MS)) {
                            const silence = new Int16Array(Math.floor(settings.sampleRate * 0.060));
                            const payload = new Uint8Array(silence.buffer);
                            if (IS_WEB) {
                                webAudioService.sendChunk(payload);
                            } else {
                                ipcService.sendAudioChunk(payload);
                            }
                            lastVoiceAtRef.current = now;
                        }
                    }
                }
            };

            addLog('Phòng thu âm thanh đã sẵn sàng.', 'success');
            console.log(`[AudioPipeline] Ready. Source rate: ${audioCtx.sampleRate}Hz → ${settings.sampleRate}Hz`);

        } catch (err) {
            isRunningRef.current = false;
            if (err.name === 'AbortError' || err.message === 'The user aborted a request.') {
                console.warn('[AudioPipeline] Init aborted (likely component remount).');
                return;
            }
            console.error('[AudioPipeline] Init error:', err);
            addLog(`Lỗi micro: ${err.message}`, 'error');
        }
    };

    // ---- Effect ---------------------------------------------------------

    useEffect(() => {
        // Keep sensitivityRef in sync with settings without restarting the pipeline
        sensitivityRef.current = settings.sensitivity;
        // Sync gain if pipeline is running
        if (gainNodeRef.current) {
            gainNodeRef.current.gain.value = settings.micGain || 1.0;
        }
    }, [settings.sensitivity, settings.micGain]);

    useEffect(() => {
        if (isTranslating) {
            startMicrophone();
        } else {
            stopMicrophone();
        }
        return () => {
            stopMicrophone();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isTranslating]);

    return {
        stopMicrophone,
        startMicrophone
    };
};
