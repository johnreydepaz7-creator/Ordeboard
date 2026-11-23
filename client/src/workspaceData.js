/**
 * Fast workspace reads. This cache exists only in memory, never in browser storage.
 * - GET requests share in-flight responses and briefly reuse successful results.
 * - Any successful POST/PATCH/DELETE invalidates every cached read.
 * - Signing in/out clears data so one person's records cannot be reused by another.
 * - The server STILL checks session and permissions for every real HTTP request.
 */
const API = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:4000' : '');
const cache = new Map();
const CACHE_MS = 15_000; // Quickly revisit a page without another round trip.
const MAX_ENTRIES = 100;
let generation = 0;

export function clearWorkspaceCache() {
  generation += 1;
  cache.clear();
}

async function fetchFromServer(path, options) {
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
  } catch {
    throw new Error('Cannot connect to the server. Check your connection.');
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error('The server sent an invalid response. Please retry.'); }
  if (!response.ok) {
    // Don't keep showing a prior account's data if its session has expired.
    if (response.status === 401 && !path.startsWith('/api/auth/')) {
      clearWorkspaceCache();
      // A revoked Staff session must not keep showing cached customer records.
      window.dispatchEvent(new CustomEvent('orderboard:session-expired', {
        detail: { message: data.message || 'Session ended. Please sign in again.' },
      }));
    }
    throw new Error(data.message || 'Request failed');
  }
  return data;
}

export function request(path, options = {}) {
  // `refresh` means go to the server, even when we have an unexpired cache.
  // It is a local request option, not an HTTP fetch parameter.
  const { refresh = false, ...fetchOptions } = options;
  const method = (fetchOptions.method || 'GET').toUpperCase();
  // Never cache authentication responses; each session check must reach the server.
  const cacheable = method === 'GET' && !fetchOptions.signal && !path.startsWith('/api/auth/');
  if (!cacheable) {
    return fetchFromServer(path, fetchOptions).then(data => {
      if (method !== 'GET') clearWorkspaceCache();
      return data;
    });
  }
  const now = Date.now();
  const saved = cache.get(path);
  if (saved?.promise) return saved.promise; // Avoid duplicate concurrent requests.
  if (!refresh && saved && saved.expires > now) return Promise.resolve(saved.data);

  const currentGeneration = generation;
  const promise = fetchFromServer(path, fetchOptions).then(data => {
    // An old request finishing after logout or mutation must not repopulate cache.
    if (generation === currentGeneration) {
      cache.delete(path);
      cache.set(path, { data, expires: Date.now() + CACHE_MS });
      while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
    }
    return data;
  }).catch(error => {
    if (generation === currentGeneration) cache.delete(path);
    throw error;
  });
  cache.set(path, { promise });
  return promise;
}

// Pre-fetch only the FIRST page of each list (not every historical record).
// This makes switching screens fast without downloading unnecessary data.
export async function prepareWorkspace(user) {
  const date = new Date();
  const localDay = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const manilaDay = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const reportToday = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  const paths = [
    '/api/dashboard',
    '/api/orders?search=&status=All&page=1',
    '/api/reservations?search=&status=All&page=1',
    '/api/cake-jobs?search=&status=All&page=1',
    `/api/schedule?start=${localDay}&days=7`,
    '/api/schedule/reminders',
    '/api/inventory',
    '/api/security/history',
    '/api/security/sessions',
  ];
  if (user.role === 'owner') paths.push(
    '/api/staff',
    `/api/finance/summary?from=${manilaDay.slice(0, 7)}-01&to=${manilaDay}`,
    '/api/finance/expenses',
    `/api/reports/overview?from=${reportToday.slice(0, 7)}-01&to=${reportToday}`,
    '/api/forecast?days=7',
  );
  // Four requests at once: fast without flooding a small bakery server.
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < paths.length) {
      const path = paths[nextIndex++];
      // An unavailable report must never prevent taking orders.
      try { await request(path); } catch { /* The actual screen shows its error and retry. */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, paths.length) }, worker));
}
