import compression from 'compression';
import { doubleCsrf } from 'csrf-csrf';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import hpp from 'hpp';
import config from '#config.js';

const secend = 60 * 1000;

export const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => config.csrfSecret,
  cookieName: '__preread_csrf',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'strict',
    // Only mark cookies Secure when the public URL is HTTPS.
    // HSTS + Secure cookies on plain HTTP break asset loads and auth.
    secure: config.isHttps,
    path: '/',
  },
  getSessionIdentifier: (req) => req.user?.id ?? req.ip ?? 'anonymous',
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
});

export function helmetMiddleware() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        // Never upgrade HTTP→HTTPS unless the site is actually served over TLS.
        ...(config.isHttps ? { upgradeInsecureRequests: [] } : { upgradeInsecureRequests: null }),
      },
    },
    crossOriginEmbedderPolicy: false,
    // COOP / HSTS require a potentially trustworthy origin (HTTPS or localhost).
    crossOriginOpenerPolicy: config.isHttps ? { policy: 'same-origin' } : false,
    originAgentCluster: config.isHttps,
    hsts: config.isHttps
      ? { maxAge: 15552000, includeSubDomains: true }
      : false,
  });
}

export const compressionMiddleware = compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
});

export const hppMiddleware = hpp();

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

export const authLimiter = rateLimit({
  windowMs: 15 * secend,
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

export const uploadLimiter = rateLimit({
  windowMs: 60 * secend,
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

export function createCsrfToken(req, res) {
  return generateCsrfToken(req, res, {
    overwrite: false,
    validateOnReuse: false,
  });
}

export function attachCsrfToken(req, res, next) {
  if (req.path.startsWith('/api')) return next();
  try {
    res.locals.csrfToken = createCsrfToken(req, res);
  } catch {
    res.locals.csrfToken = '';
  }
  next();
}

export function csrfProtection(req, res, next) {
  if (req.path.startsWith('/auth')) return next();
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  return doubleCsrfProtection(req, res, next);
}
