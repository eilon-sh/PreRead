import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '#auth.js';
import { extractSessionCacheKey, getCachedSession, setCachedSession } from '#utils/sessionCache.js';

const PUBLIC_PATHS = ['/', '/login', '/register', '/forgot-password', '/reset-password'];
const PUBLIC_API_PREFIXES = ['/api/auth'];

// מצרף משתמש לבקשה
function applySession(req, session) {
  req.user = session.user;
  req.session = session.session;
}

// טוען סשן משתמש מהקוקי
export async function loadSession(req, _res, next) {
  try {
    const cacheKey = extractSessionCacheKey(req.headers.cookie);
    const cachedSession = getCachedSession(cacheKey);
    if (cachedSession) {
      applySession(req, cachedSession);
      return next();
    }

    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (session) {
      applySession(req, session);
      if (cacheKey) {
        setCachedSession(cacheKey, session);
      }
    }
  } catch {
    // אין סשן פעיל
  }
  next();
}

// מונע גישה לנתיבים פרטיים
export async function requireAuth(req, res, next) {
  // אם זה נמצא ברשימות של הנתיבים הפתוחים מדלגים
  // זה נועד בשביל למנוע מצב שאנחנו צריכים להגדיר בכל נתיב האם צריך

  if (PUBLIC_PATHS.includes(req.path)) return next();
  if (PUBLIC_API_PREFIXES.some((p) => req.path.startsWith(p))) return next();

  if (!req.user) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect('/login');
  }
  next();
}
