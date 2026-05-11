import { useStore } from '../store/useStore';
import { ipcService } from '../services/ipcService';

/**
 * useVoiceManagement
 * Handles voice cloning sample uploads, payment order creation, and completion.
 */
export const useVoiceManagement = () => {
    const { 
        backendUrl, 
        installId, 
        voiceOrderId, 
        voiceApprovalUrl, 
        voiceUiStatus, 
        voiceSample, 
        setVoiceState 
    } = useStore();

    const setStatus = (status) => setVoiceState({ voiceUiStatus: status });

    const createVoiceChangeOrder = async () => {
        try {
            setStatus('Creating $5 payment...');
            const base = backendUrl || (await ipcService.getBackendUrl()) || '';
            const uid = installId || (await ipcService.getInstallId()) || '';
            
            if (!base || !uid) {
                setStatus('Missing backend URL or user ID');
                return;
            }

            const token = localStorage.getItem('cyan_token') || '';
            const response = await fetch(`${base}/api/payment/voice-change/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ user_id: uid, device_id: uid })
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok || !data || !data.order_id || !data.approval_url) {
                setStatus(data && data.error ? String(data.error) : `Payment creation failed (${response.status})`);
                return;
            }

            setVoiceState({
                voiceOrderId: String(data.order_id),
                voiceApprovalUrl: String(data.approval_url)
            });

            localStorage.setItem('voiceChangeOrder', JSON.stringify({ 
                order_id: data.order_id, 
                approval_url: data.approval_url 
            }));

            setStatus('Created. Opening PayPal...');
            
            // Try to open via Electron API, fallback to window.open
            const opened = await ipcService.openExternal(data.approval_url);
            if (!opened) {
                window.open(data.approval_url, '_blank', 'noopener,noreferrer');
            }
        } catch (e) {
            console.error('Payment creation error:', e);
            setStatus('Payment creation failed');
        }
    };

    const completeVoiceChange = async () => {
        try {
            setStatus('Updating voice...');
            const base = backendUrl || (await ipcService.getBackendUrl()) || '';
            const uid = installId || (await ipcService.getInstallId()) || '';

            if (!base || !uid) {
                setStatus('Missing backend URL or user ID');
                return;
            }
            if (!voiceOrderId) {
                setStatus('Missing order_id');
                return;
            }
            if (!voiceSample) {
                setStatus('Missing audio file');
                return;
            }

            const token = localStorage.getItem('cyan_token') || '';
            const formData = new FormData();
            formData.append('sample', voiceSample, voiceSample.name || 'sample.mp3');
            formData.append('user_id', uid);
            formData.append('device_id', uid);
            formData.append('order_id', voiceOrderId);

            const response = await fetch(`${base}/api/voice/update/complete`, {
                method: 'POST',
                headers: {
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: formData
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok || !data || !data.ok) {
                setStatus(data && data.error ? String(data.error) : `Voice update failed (${response.status})`);
                return;
            }

            localStorage.removeItem('voiceChangeOrder');
            setVoiceState({
                voiceOrderId: '',
                voiceApprovalUrl: '',
                voiceSample: null,
                voiceUiStatus: 'Voice updated successfully'
            });
        } catch (e) {
            console.error('Voice update error:', e);
            setStatus('Voice update failed');
        }
    };

    const assignInitialVoice = async () => {
        if (!voiceSample) {
            setStatus('Missing file');
            return;
        }

        setStatus('Assigning voice (Free/Initial)...');
        try {
            const base = backendUrl || (await ipcService.getBackendUrl()) || '';
            const uid = installId || (await ipcService.getInstallId()) || '';
            
            if (!base || !uid) {
                setStatus('Missing info');
                return;
            }

            const formData = new FormData();
            formData.append('sample', voiceSample);
            formData.append('user_id', uid);
            formData.append('device_id', uid);

            const response = await fetch(`${base}/api/voice/assign`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json().catch(() => ({}));

            if (response.status === 402) {
                setStatus('Free update used. Please pay $5 to change again.');
            } else if (response.ok && data.ok) {
                setStatus('Voice assigned successfully!');
                setVoiceState({ voiceSample: null });
            } else {
                setStatus(data.error || 'Assign failed');
            }
        } catch (e) {
            console.error('Initial voice assignment error:', e);
            setStatus('Network error: ' + e.message);
        }
    };

    return {
        createVoiceChangeOrder,
        completeVoiceChange,
        assignInitialVoice
    };
};
