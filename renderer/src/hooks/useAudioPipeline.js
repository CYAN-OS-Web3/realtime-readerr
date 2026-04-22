import { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { ipcService } from '../services/ipcService';

// Inline AudioWorklet to avoid path issues and ensure atomic loading
const WORKLET_CODE = `
class MicProcessor extends AudioWorkletProcessor {
    process(inputs) {
        const input = inputs[0];
        if (input && input[0]) {
            // Send the first channel of audio data
            this.port.postMessage(input[0]);
        }
        return true;
    }
}
try {
    registerProcessor('mic-processor', MicProcessor);
} catch (e) {
    // Already registered in this context
}
`;

/**
 * useAudioPipeline
 * Manages audio capture (microphone), resampling, and sending chunks to the main process.
 */
export const useAudioPipeline = () => {
    const { 
        isTranslating, 
        settings, 
        setMicVolume, 
        addLog 
    } = useStore();

    const audioContextRef = useRef(null);
    const mediaStreamRef = useRef(null);
    const processorRef = useRef(null);
    const sourceRef = useRef(null);
    const gainNodeRef = useRef(null);
    const workletLoadedRef = useRef(false);
    const detectedAudioRef = useRef(false);
    const isRunningRef = useRef(false);

    // Accumulation for reducing IPC frequency (100ms chunks)
    const chunkBufferRef = useRef([]);
    const lastVoiceAtRef = useRef({ t: Date.now() });
    const hasSentDataRef = useRef(false);
    const preRollBufferRef = useRef([]); // Last 300ms of audio
    const isVoiceActiveRef = useRef(false);
    const lastVolumeUpdateTimeRef = useRef(0);

    // Helpers
    const downsampleBuffer = (buffer, inputSampleRate, targetSampleRate) => {
        if (targetSampleRate >= inputSampleRate) return buffer;
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

    const stopMicrophone = () => {
        if (!isRunningRef.current) return;
        isRunningRef.current = false;

        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }
        if (sourceRef.current) {
            sourceRef.current.disconnect();
            sourceRef.current = null;
        }
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            // Instead of closing, we suspend to preserve the context if needed,
            // or let the useEffect cleanup handle it.
        }
        setMicVolume(0);
        detectedAudioRef.current = false;
        workletLoadedRef.current = false;
        console.log("Microphone stopped");
    };

    const startMicrophone = async () => {
        if (isRunningRef.current) return;
        isRunningRef.current = true;

        try {
            if (mediaStreamRef.current) return;

            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: settings.noiseReduction,
                    noiseSuppression: settings.noiseReduction,
                    autoGainControl: settings.noiseReduction,
                    channelCount: 1,
                    deviceId: settings.inputDeviceId ? { exact: settings.inputDeviceId } : undefined
                } 
            });
            console.log("Microphone stream started");
            mediaStreamRef.current = stream;

            if (!audioContextRef.current) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                audioContextRef.current = new AudioContext();
            }
            const audioCtx = audioContextRef.current;
            await audioCtx.resume();

            const source = audioCtx.createMediaStreamSource(stream);
            sourceRef.current = source;

            const compressor = audioCtx.createDynamicsCompressor();
            compressor.threshold.setValueAtTime(-50, audioCtx.currentTime);
            compressor.knee.setValueAtTime(40, audioCtx.currentTime);
            compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
            compressor.attack.setValueAtTime(0, audioCtx.currentTime);
            compressor.release.setValueAtTime(0.25, audioCtx.currentTime);

            const gainNode = audioCtx.createGain();
            gainNodeRef.current = gainNode;
            gainNode.gain.setValueAtTime(settings.micGain || 1.0, audioCtx.currentTime);

            // Load AudioWorklet from Blob (Robust approach)
            try {
                const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
                const workletUrl = URL.createObjectURL(blob);
                await audioCtx.audioWorklet.addModule(workletUrl);
                URL.revokeObjectURL(workletUrl);
                workletLoadedRef.current = true;
            } catch (err) {
                if (err.name === 'AbortError' || err.message.includes('aborted')) {
                    console.warn('[AudioPipeline] AudioWorklet loading was aborted. Likely a component remount.');
                    return; // Silent exit if just a remount
                }
                console.error('[AudioPipeline] Failed to load AudioWorklet module:', err);
                throw new Error(`Không thể nạp trình xử lý âm thanh: ${err.message}`);
            }

            const workletNode = new AudioWorkletNode(audioCtx, 'mic-processor');
            processorRef.current = workletNode;

            // Audio Chain
            source.connect(compressor);
            compressor.connect(gainNode);
            gainNode.connect(workletNode);

            // Calculation for buffering
            const BUFFER_SIZE_MS = 100; // Accumulate for 100ms
            const samplesPerMs = settings.sampleRate / 1000;
            const thresholdSamples = Math.floor(BUFFER_SIZE_MS * samplesPerMs);

            workletNode.port.onmessage = (e) => {
                if (!isTranslating) return;
                const inputData = e.data;
                
                // Volume Meter
                let sq = 0;
                for (let i = 0; i < inputData.length; i++) {
                    const v = inputData[i];
                    sq += v * v;
                }
                const rms = Math.sqrt(sq / inputData.length);
                const db = 20 * Math.log10(rms + 1e-9);
                const vol = Math.min(100, Math.max(0, Math.round(((db + 60) / 60) * 100)));
                
                // Throttle volume updates to 20fps to prevent React re-render storm
                const now = Date.now();
                if (now - lastVolumeUpdateTimeRef.current > 50) {
                    setMicVolume(vol);
                    lastVolumeUpdateTimeRef.current = now;
                }

                // Prepare downsampled Int16 chunk for either pre-roll or active stream
                const downsampled = downsampleBuffer(inputData, audioCtx.sampleRate, settings.sampleRate);
                const int16 = new Int16Array(downsampled.length);
                for (let i = 0; i < downsampled.length; i++) {
                    let s = Math.max(-1, Math.min(1, downsampled[i]));
                    int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }

                // Update Pre-roll (approx. 300ms = 3 chunks of 100ms)
                preRollBufferRef.current.push(int16);
                if (preRollBufferRef.current.length > 3) {
                    preRollBufferRef.current.shift();
                }

                if (vol > 0 && !detectedAudioRef.current) {
                    console.log(`[AudioPipeline] Signal alive. Vol: ${vol}%`);
                    detectedAudioRef.current = true;
                }

                // Noise Gate
                const threshold = settings.sensitivity; 
                if (vol > threshold) {
                    if (!isVoiceActiveRef.current) {
                        // Start of phrase: Prepend pre-roll
                        console.log('[AudioPipeline] Voice triggered - prepending pre-roll');
                        if (preRollBufferRef.current.length > 0) {
                            // Don't duplicate current chunk which is already in preRoll
                            const preRoll = preRollBufferRef.current.slice(0, -1);
                            chunkBufferRef.current.push(...preRoll);
                        }
                        isVoiceActiveRef.current = true;
                    }

                    chunkBufferRef.current.push(int16);
                    lastVoiceAtRef.current.t = Date.now();
                    hasSentDataRef.current = true;
                    
                    let totalSamples = 0;
                    for (const chunk of chunkBufferRef.current) totalSamples += chunk.length;
                    
                    if (totalSamples >= thresholdSamples) {
                        const merged = new Int16Array(totalSamples);
                        let offset = 0;
                        for (const chunk of chunkBufferRef.current) {
                            merged.set(chunk, offset);
                            offset += chunk.length;
                        }
                        ipcService.sendAudioChunk(new Uint8Array(merged.buffer));
                        chunkBufferRef.current = [];
                    }
                } else {
                    const now = Date.now();
                    
                    // Periodically send silence to keep the backend connection alive
                    // even when below threshold (every 3 seconds of silence)
                    if (!isVoiceActiveRef.current && (now - lastVoiceAtRef.current.t > 3000)) {
                        const silence = new Int16Array(1600); // ~100ms of silence at 16kHz
                        ipcService.sendAudioChunk(new Uint8Array(silence.buffer));
                        lastVoiceAtRef.current.t = now; // Reset timer for next silence chunk
                    }

                    if (hasSentDataRef.current && (now - lastVoiceAtRef.current.t > 1200)) {
                        console.log('[AudioPipeline] Threshold flush (>1.2s)');
                        isVoiceActiveRef.current = false;
                        if (chunkBufferRef.current.length > 0) {
                            let totalSamples = 0;
                            for (const chunk of chunkBufferRef.current) totalSamples += chunk.length;
                            const merged = new Int16Array(totalSamples);
                            let offset = 0;
                            for (const chunk of chunkBufferRef.current) {
                                merged.set(chunk, offset);
                                offset += chunk.length;
                            }
                            ipcService.sendAudioChunk(new Uint8Array(merged.buffer));
                            chunkBufferRef.current = [];
                        }
                        ipcService.flushAudio(); // Phrase ended, hint backend but KEEP stream alive
                        hasSentDataRef.current = false;
                    }
                }
            };

            addLog('Phòng thu âm thanh đã sẵn sàng.', 'success');

        } catch (e) {
            if (e.message !== 'The user aborted a request.') {
                console.error('Microphone init error:', e);
                addLog(`Lỗi micro: ${e.message}`, 'error');
            }
        }
    };

    useEffect(() => {
        if (isTranslating) {
            startMicrophone();
        } else {
            stopMicrophone();
        }
        return () => {
            if (isRunningRef.current) {
                stopMicrophone();
            }
        };
    }, [isTranslating]);

    return {
        stopMicrophone,
        startMicrophone
    };
};
