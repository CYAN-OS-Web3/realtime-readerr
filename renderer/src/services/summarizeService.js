/**
 * Go Backend Service
 * Handles communication with Go backend for session transcript summarization
 * Go Backend URL: http://localhost:8080
 */

const DEFAULT_PYTHON_BACKEND_URL = 'http://localhost:8000';
const DEFAULT_GO_BACKEND_URL = 'https://translator-gateway.fly.dev/';

export const goBackendService = {
  /**
   * Get the Go backend URL
   */
  getBackendUrl: () => {
    return DEFAULT_GO_BACKEND_URL;
  },

  /**
   * Get the Python backend URL
   */
  getPythonBackendUrl: () => {
    return import.meta.env.VITE_PYTHON_BACKEND_URL || localStorage.getItem('python_backend_url') || DEFAULT_PYTHON_BACKEND_URL;
  },

  /**
   * Set the Go backend URL
   */
  setBackendUrl: (url) => {
    localStorage.setItem('go_backend_url', url);
  },

  /**
   * Set the Python backend URL
   */
  setPythonBackendUrl: (url) => {
    localStorage.setItem('python_backend_url', url);
  },

  /**
   * Send session transcripts array to backend for summarization
   * Endpoint: POST /api/summarize-session (Python)
   * 
   * @param {Object} sessionData - { sessionId, userId, transcripts, sourceLang, targetLang, token }
   * @returns {Promise<Object>} - { sessionId, summary, keyTopics, sentiment, status }
   */
  requestSummarization: async (sessionData) => {
    try {
      // Route summarization requests through Go proxy endpoint (do NOT call Python directly)
      const backendUrl = goBackendService.getBackendUrl();
      const endpoint = `https://translator-gateway.fly.dev/api/v1/summarization/request`;

      // Transform transcripts to match expected schema (camelCase)
      const transformedTranscripts = sessionData.transcripts.map(t => {
        // Ensure capturedAt is a number (int64 in Go)
        let timestamp = t.capturedAt || t.timestamp;
        if (typeof timestamp === 'string') {
          timestamp = new Date(timestamp).getTime();
        }
        if (!timestamp || isNaN(timestamp)) {
          timestamp = Date.now();
        }

        return {
          source: t.source || t.text,
          target: t.target || t.translated_text,
          isFinal: t.isFinal ?? true,
          capturedAt: Math.floor(timestamp),
          sessionId: sessionData.sessionId
        };
      });

      // Construct payload with metadata as expected by the backend
      const payload = {
        sessionId: sessionData.sessionId,
        transcripts: transformedTranscripts,
        metadata: {
          count: transformedTranscripts.length,
          timestamp: new Date().toISOString(),
          sourceLang: sessionData.sourceLang || 'en-US',
          targetLang: sessionData.targetLang || 'vi-VN',
          userId: sessionData.userId
        }
      };

      console.log('[Summarizer] Sending request via Go proxy:', {
        endpoint,
        sessionId: sessionData.sessionId,
        transcriptCount: payload.transcripts.length
      });

      // Get JWT token for authorization
      const token = sessionData.token || localStorage.getItem('cyan_token') || '';
      console.log('[Summarizer] Token Debug:', {
        hasToken: !!token,
        tokenLength: token.length,
        tokenPreview: token ? token.substring(0, 30) + '...' : 'NONE',
        fromSessionData: !!sessionData.token,
        fromLocalStorage: !!localStorage.getItem('cyan_token')
      });
      console.log('[Summarizer] Network Details:', {
        url: endpoint,
        authHeader: token ? `Bearer ${token.substring(0, 10)}...` : 'None (UNAUTHORIZED RISK)',
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload),
        timeout: 60000
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error details');
        throw new Error(`Backend returned ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log('[Summarizer] Success:', result);

      return result;
    } catch (error) {
      console.error('[Summarizer] Error:', error);
      throw error;
    }
  },

  /**
   * Health check for Go backend
   */
  healthCheck: async () => {
    try {
      const backendUrl = goBackendService.getBackendUrl();
      const response = await fetch(`https://translator-gateway.fly.dev/health`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      return response.ok;
    } catch (error) {
      console.error('[Go Backend] Health check failed:', error);
      return false;
    }
  },

  /**
   * Fetch a stored summary from the database
   * Endpoint: GET /api/v1/summarization/summary/:session_id (Go Backend)
   * 
   * @param {string} sessionId 
   * @param {string} token
   * @returns {Promise<Object>}
   */
  getStoredSummary: async (sessionId, token = '') => {
    try {
      const backendUrl = goBackendService.getBackendUrl();
      const endpoint = `https://translator-gateway.fly.dev/api/v1/summarization/summary/${sessionId}`;

      console.log(`[Summarizer] Fetching stored summary for: ${sessionId}`);

      console.log(`🔑 Token present: ${!!token}`, token ? 'success' : 'warning');
      if (!token) {
        console.warn('⚠️ Warning: No auth token found. Backend may return 401 Unauthorized.');
        console.info('💡 Try "Connect Account" or use Alt+Click on login for Dev Bypass.');
      }

      const authToken = token || localStorage.getItem('cyan_token') || '';
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          ...(authToken && { 'Authorization': `Bearer ${authToken}` })
        }
      });

      if (!response.ok) {
        if (response.status === 404 || response.status === 401) return null; // No stored summary or not authorized to read it
        throw new Error(`Failed to fetch summary: ${response.status}`);
      }

      const result = await response.json();
      console.log('[Summarizer] Stored summary retrieved:', result);
      return result;
    } catch (error) {
      console.error('[Summarizer] Error fetching stored summary:', error);
      throw error;
    }
  }
};

// Keep fastAPIService alias for backward compatibility
export const fastAPIService = goBackendService;


