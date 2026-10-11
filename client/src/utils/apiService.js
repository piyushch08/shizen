/**
 * Centralized API helper with automatic fallback and friendly error messages.
 */

// Primary URL uses the Vite dev server proxy (/api/process -> http://localhost:3001/api/process)
// Fallback URL directly targets http://localhost:3001 if the proxy is bypassed
const PRIMARY_API = '/api/process';
const FALLBACK_API = 'http://localhost:3001/api/process';

/**
 * Sends a POST request with formData to the processing backend.
 * Automatically tries the Vite proxy first, and falls back to localhost:3001.
 * 
 * @param {string} endpoint - e.g. '/audio', '/image', '/video', '/document', '/merge', '/convert'
 * @param {FormData} formData - The payload to send
 * @param {RequestInit} [options] - Additional fetch options
 * @returns {Promise<Response>} The successful Response object
 */
export async function apiProcess(endpoint, formData, options = {}) {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // Attempt 1: Via relative path (uses Vite proxy or production reverse proxy)
  try {
    const res = await fetch(`${PRIMARY_API}${cleanEndpoint}`, {
      method: 'POST',
      body: formData,
      ...options,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Server error (${res.status}): ${res.statusText}`);
    }

    return res;
  } catch (err) {
    // If it's an application error (not a network connection error), don't retry, rethrow immediately
    if (err.message && !err.message.includes('Failed to fetch') && !err.message.includes('NetworkError') && !err.message.includes('Load failed')) {
      throw err;
    }

    console.warn(`[apiService] Primary request to ${PRIMARY_API}${cleanEndpoint} failed. Trying direct backend fallback...`, err);

    // Attempt 2: Direct localhost:3001 fallback
    try {
      const fallbackRes = await fetch(`${FALLBACK_API}${cleanEndpoint}`, {
        method: 'POST',
        body: formData,
        ...options,
      });

      if (!fallbackRes.ok) {
        const errData = await fallbackRes.json().catch(() => ({}));
        throw new Error(errData.error || `Server error (${fallbackRes.status}): ${fallbackRes.statusText}`);
      }

      return fallbackRes;
    } catch (fallbackErr) {
      // If direct request also failed due to network error, the server is genuinely offline
      if (
        fallbackErr.message && 
        (fallbackErr.message.includes('Failed to fetch') || fallbackErr.message.includes('NetworkError') || fallbackErr.message.includes('Load failed'))
      ) {
        throw new Error(
          'Processing server is unreachable! Please start the backend server by running "node index.js" inside the server folder.'
        );
      }
      throw fallbackErr;
    }
  }
}

/**
 * Checks if the backend server is reachable.
 * @returns {Promise<boolean>}
 */
export async function checkServerHealth() {
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(3000) });
    if (res.ok) return true;
  } catch (e) {
    // try direct
  }

  try {
    const res = await fetch('http://localhost:3001/api/health', { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch (e) {
    return false;
  }
}
