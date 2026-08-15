import { useEffect } from 'react';
import { useStore } from '../store/useStore';

/**
 * Hook to listen for OAuth token from backend callback
 * Backend sends: window.postMessage({type: 'CYAN_AUTH_SUCCESS', token: '...', user: {...}})
 */
export function useAuthListener() {
  const { addLog, setAuthUserId } = useStore();

  useEffect(() => {
    const handlePostMessage = (event) => {
      // Only handle CYAN auth messages
      if (typeof event.data?.type !== 'string' || !event.data.type.startsWith('CYAN_')) {
        return;
      }

      console.log(`[AuthListener] Received message from origin: ${event.origin}`, {
        type: event.data?.type,
        hasToken: !!event.data?.token,
        fullData: event.data
      });

      // Handle successful auth from backend
      if (event.data?.type === 'CYAN_AUTH_SUCCESS') {
        const { token, user } = event.data;
        
        if (!token) {
          console.error('[AuthListener] CYAN_AUTH_SUCCESS received but token is missing!');
          addLog('❌ Auth error: Token missing in response', 'error');
          return;
        }

        try {
          console.log('✅ OAuth callback received with token. Saving to storage...');
          
          // Store the valid JWT token
          localStorage.setItem('cyan_token', token);
          
          // Store user info if provided
          if (user) {
            localStorage.setItem('cyan_user', JSON.stringify(user));
            setAuthUserId(user.id || user.email || 'authenticated-user');
            console.log('✅ User stored:', user.email || user.username || user.id);
          }
          
          addLog('✅ Account connected successfully', 'success');
          console.log('✅ Token stored successfully:', token.substring(0, 15) + '...');
          
          // Final verification
          const savedToken = localStorage.getItem('cyan_token');
          if (savedToken === token) {
             console.log('✅ Storage verification PASSED');
          } else {
             console.error('❌ Storage verification FAILED! LocalStorage did not persist the token.');
             addLog('❌ Storage Error: Token failed to persist', 'error');
          }
        } catch (e) {
          console.error('[AuthListener] Failed to save auth data to localStorage:', e);
          addLog(`❌ Storage Error: ${e.message}`, 'error');
        }
      }
      
      // Handle auth errors
      if (event.data?.type === 'CYAN_AUTH_ERROR') {
        console.error('❌ OAuth error received from backend:', event.data.message);
        addLog(`❌ Auth error: ${event.data.message}`, 'error');
      }
    };

    // Add listener for postMessage from backend
    window.addEventListener('message', handlePostMessage);

    return () => {
      window.removeEventListener('message', handlePostMessage);
    };
  }, [addLog, setAuthUserId]);
}
