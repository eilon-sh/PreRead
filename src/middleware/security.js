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
    secure: config.isProduction,
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
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
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

export const extractLimiter = rateLimit({
  windowMs: 60 * secend,
  max: config.rateLimit.extractMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res, _next, options) => {
    res.status(options.statusCode).json({
      error: 'הגעת למגבלת חילוץ המילים לשעה. נסה שוב מאוחר יותר.',
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
