const SESSION_CACHE_TTL_MS = 60_000;
const cache = new Map();

/**
 * Return a cached session for `key`, or null if missing/expired.
 * @param {string | null | undefined} key
 * @returns {unknown | null}
 */
export function getCachedSession(key) {
  if (!key) return null;

  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.session;
}

/**
 * Store a session under `key` with a short TTL. No-op if key or session is falsy.
 * @param {string | null | undefined} key
 * @param {unknown} session
 * @returns {void}
 */
export function setCachedSession(key, session) {
  if (!key || !session) return;

  cache.set(key, {
    session,
    expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
  });
}

/**
 * Extract the better-auth session token from a Cookie header for use as a cache key.
 * @param {string | null | undefined} cookieHeader
 * @returns {string | null}
 */
export function extractSessionCacheKey(cookieHeader) {
  if (!cookieHeader) return null;

  const match = cookieHeader.match(
    /(?:^|;\s*)(?:__Secure-|__Host-)?better-auth\.session_token=([^;]+)/,
  );
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Remove a cached session. No-op if key is missing.
 * @param {string | null | undefined} key
 * @returns {void}
 */
export function deleteCachedSession(key) {
  if (!key) return;
  cache.delete(key);
}
