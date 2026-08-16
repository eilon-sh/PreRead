import compression from 'compression';
import { doubleCsrf } from 'csrf-csrf';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import hpp from 'hpp';
import config from '#config.js';

const ONE_MINUTE = 60 * 1000;

export const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => config.csrfSecret,
  cookieName: '__preread_csrf',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'strict',
    // Secure רק ב־HTTPS ציבורי
    secure: config.isHttps,
    path: '/',
  },
  getSessionIdentifier: (req) => req.user?.id ?? req.ip ?? 'anonymous',
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
});

// כותרי אבטחה ו־CSP
export function helmetMiddleware() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        formAction: ["'self'"],
        // משדרג בקשות HTTP ל HTTPS
        // בשרת הפיתוח זה מבוטל בשביל לאפשר בדיקה לוקלית
        ...(config.isHttps ? { upgradeInsecureRequests: [] } : { upgradeInsecureRequests: null }),
      },
    },
    // חוסם window.opener מאתרים חיצוניים
    crossOriginOpenerPolicy: config.isHttps ? { policy: 'same-origin' } : false,
    hsts: config.isHttps ? { maxAge: 15552000, includeSubDomains: true } : false,
  });
}

// דוחס תשובות מעל 1KB
export const compressionMiddleware = compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
});

export const hppMiddleware = hpp();

// מגביל קצב לבקשות API
export const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'יותר מדי בקשות. נסה שוב בעוד כמה דקות.',
    code: 'RATE_LIMITED',
  },
  handler: (_req, res, _next, options) => {
    res.status(options.statusCode).json({
      error: 'יותר מדי בקשות. נסה שוב בעוד כמה דקות.',
      code: 'RATE_LIMITED',
      retryAfter: res.getHeader('Retry-After') ?? null,
    });
  },
});

// מגביל ניסיונות התחברות
export const authLimiter = rateLimit({
  windowMs: 15 * ONE_MINUTE,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res, _next, options) => {
    res.status(options.statusCode).json({
      error: 'יותר מדי ניסיונות התחברות. נסה שוב מאוחר יותר.',
      code: 'RATE_LIMITED',
      retryAfter: res.getHeader('Retry-After') ?? null,
    });
  },
});

// מגביל העלאות קבצים
export const uploadLimiter = rateLimit({
  windowMs: 60 * ONE_MINUTE,
  max: config.rateLimit.uploadMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res, _next, options) => {
    res.status(options.statusCode).json({
      error: 'הגעת למגבלת ההעלאות לשעה. נסה שוב מאוחר יותר.',
      code: 'RATE_LIMITED',
      retryAfter: res.getHeader('Retry-After') ?? null,
    });
  },
});

// מגביל בקשות איפוס סיסמה
export const passwordResetEmailLimiter = rateLimit({
  windowMs: config.rateLimit.passwordResetEmailWindowMs,
  max: config.rateLimit.passwordResetEmailMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res, _next, options) => {
    res.status(options.statusCode).json({
      error: 'הגעת למגבלת בקשות איפוס הסיסמה. נסה שוב מאוחר יותר.',
      code: 'RATE_LIMITED',
      retryAfter: res.getHeader('Retry-After') ?? null,
    });
  },
});

// יוצר אסימון CSRF לדפים
export function createCsrfToken(req, res) {
  return generateCsrfToken(req, res, {
    overwrite: false,
    validateOnReuse: false,
  });
}

// מצמיד CSRF לתבניות EJS
export function attachCsrfToken(req, res, next) {
  if (req.path.startsWith('/api')) return next();
  try {
    res.locals.csrfToken = createCsrfToken(req, res);
  } catch {
    res.locals.csrfToken = '';
  }
  next();
}

// בודק CSRF בבקשות משנות
export function csrfProtection(req, res, next) {
  if (req.path.startsWith('/auth')) return next();
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  return doubleCsrfProtection(req, res, next);
}
