const SESSION_CACHE_TTL_MS = 60_000;
const cache = new Map();

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

export function setCachedSession(key, session) {
  if (!key || !session) return;

  cache.set(key, {
    session,
    expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
  });
}

export function extractSessionCacheKey(cookieHeader) {
  if (!cookieHeader) return null;

  const match = cookieHeader.match(/(?:^|;\s*)better-auth\.session_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
