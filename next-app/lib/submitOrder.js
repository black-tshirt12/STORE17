/**
 * Unified order submission for PC and mobile.
 * Use this from any page so all devices hit the same API with application/json.
 *
 * Usage with fetch (default):
 *   import { submitOrder } from '../lib/submitOrder';
 *   const result = await submitOrder(orderData);
 *
 * Usage with axios (same endpoint and payload):
 *   import axios from 'axios';
 *   import { getOrderPayload, getOrderConfig } from '../lib/submitOrder';
 *   const { body, baseUrl } = getOrderPayload(orderData);
 *   const res = await axios.post(`${baseUrl}/api/orders`, body, getOrderConfig(baseUrl));
 */

const DEFAULT_TIMEOUT_MS = 20000;

/**
 * Detect if the client is likely mobile (for temporary debug).
 * Safe to call in browser only.
 */
export function getClientDevice() {
  if (typeof window === 'undefined' || !window.navigator) return 'unknown';
  const ua = window.navigator.userAgent || '';
  return /mobile|android|iphone|ipad|webos|blackberry/i.test(ua) ? 'mobile' : 'desktop';
}

/**
 * Build the request base URL (same origin in browser, or pass API_BASE for absolute URL).
 * @param {string} [apiBase] - Optional base URL (e.g. 'https://yoursite.com') when calling from another origin.
 * @returns {string}
 */
export function getOrderEndpoint(apiBase) {
  if (apiBase) {
    const base = apiBase.replace(/\/$/, '');
    return `${base}/api/orders`;
  }
  if (typeof window !== 'undefined') return '/api/orders';
  return '/api/orders';
}

/**
 * Build the JSON body for the order, optionally with debug device hint.
 * @param {object} orderData - { fullName, phone, city?, notes?, items, total, date? }
 * @param {{ includeDebug?: boolean }} [options]
 */
export function getOrderPayload(orderData, options = {}) {
  const includeDebug = options.includeDebug === true;
  const body = { ...orderData };
  if (includeDebug) body._debugDevice = getClientDevice();
  return {
    body,
    baseUrl: options.apiBase || '',
  };
}

/**
 * Fetch-style options for the order request (Content-Type, timeout, etc.).
 * Use with axios: getOrderConfig(baseUrl) returns { headers, timeout }.
 */
export function getOrderConfig(apiBase, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  return { headers, timeout: timeoutMs };
}

/**
 * Submit an order using fetch. Same endpoint for PC and mobile; CORS is handled by the API.
 *
 * @param {object} orderData - Order payload (fullName, phone, city?, notes?, items, total, date?)
 * @param {{ apiBase?: string, timeout?: number, includeDebug?: boolean }} [options]
 * @returns {Promise<{ success: boolean, id?: string, error?: string, detail?: string, _debug?: object }>}
 */
export async function submitOrder(orderData, options = {}) {
  const timeout = options.timeout != null ? options.timeout : DEFAULT_TIMEOUT_MS;
  const { body, baseUrl } = getOrderPayload(orderData, {
    includeDebug: options.includeDebug,
    apiBase: options.apiBase,
  });
  const url = getOrderEndpoint(options.apiBase || baseUrl);

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeout) : null;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: getOrderConfig(url, timeout).headers,
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined,
      credentials: 'same-origin',
    });

    const data = await res.json().catch(() => ({}));

    if (timeoutId) clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        success: false,
        error: data.error || data.detail || `Request failed (${res.status})`,
        detail: data.detail,
        _debug: data._debug,
      };
    }

    if (data.success && data.id) {
      return {
        success: true,
        id: data.id,
        _debug: data._debug,
      };
    }

    return {
      success: false,
      error: data.error || 'Order could not be saved.',
      _debug: data._debug,
    };
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    const isTimeout = err && (err.name === 'AbortError' || (err.message && String(err.message).indexOf('abort') !== -1));
    return {
      success: false,
      error: isTimeout ? 'Request timed out. Check your connection and try again.' : (err.message || 'Network error. Please try again.'),
    };
  }
}

export default submitOrder;
