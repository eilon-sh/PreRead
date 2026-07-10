import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toNodeHandler } from 'better-auth/node';
import cookieParser from 'cookie-parser';
import express from 'express';
import morgan from 'morgan';
import { auth } from '#auth.js';
import config from '#config.js';
import prisma, { seedAchievements } from '#db/prisma.js';
import { loadSession, requireAuth } from '#middleware/auth.js';
import { errorHandler, notFoundHandler } from '#middleware/errorHandler.js';
import {
  apiLimiter,
  attachCsrfToken,
  authLimiter,
  compressionMiddleware,
  csrfProtection,
  helmetMiddleware,
  hppMiddleware,
  passwordResetEmailLimiter,
} from '#middleware/security.js';
import { failStuckProcessingDocuments } from '#services/documentService.js';
import v1Router from '#v1/routes/index.js';
import { validateProductionConfig } from '#validateConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

validateProductionConfig(config);

await seedAchievements();
await failStuckProcessingDocuments();

const app = express();

if (config.trustProxy) {
  app.set('trust proxy', 1);
}

app.use(morgan(config.isProduction ? 'combined' : 'dev'));
app.use(helmetMiddleware());
app.use(compressionMiddleware);
app.use(cookieParser());
app.use(hppMiddleware);

// Better Auth must be mounted before express.json()
app.post('/api/auth/request-password-reset', passwordResetEmailLimiter, toNodeHandler(auth));
app.all('/api/auth/{*splat}', authLimiter, toNodeHandler(auth));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.locals.googleEnabled = config.google.enabled;
app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    maxAge: config.isProduction ? '1d' : 0,
    etag: true,
  }),
);

app.use(loadSession);
app.use(attachCsrfToken);

app.get('/', (req, res) => {
  if (req.user) return res.redirect('/upload');
  res.render('home');
});
app.get('/login', (req, res) => {
  if (req.user) return res.redirect('/upload');
  res.render('login');
});
app.get('/register', (req, res) => {
  if (req.user) return res.redirect('/upload');
  res.render('register');
});
app.get('/forgot-password', (req, res) => {
  if (req.user) return res.redirect('/upload');
  res.render('forgot-password');
});
app.get('/reset-password', (req, res) => {
  if (req.user) return res.redirect('/upload');
  res.render('reset-password');
});

app.use(requireAuth);

app.get('/upload', (_req, res) => res.render('upload'));
app.get('/words', (req, res) => {
  if (!req.query.documentId) return res.redirect('/upload');
  res.render('words');
});
app.get('/study', (_req, res) => res.render('study'));
app.get('/games', (req, res) => {
  if (!req.query.documentId) return res.redirect('/upload');
  res.render('games');
});
app.get('/profile', (_req, res) => res.render('profile'));
app.get('/achievements', (_req, res) => res.render('achievements'));

app.use(express.json({ limit: config.bodyLimit }));
app.use(express.urlencoded({ extended: false, limit: config.bodyLimit }));

app.use('/api', csrfProtection);
app.use('/api', apiLimiter);

app.use('/api/v1', v1Router);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(config.port, (error) => {
  if (error) throw error;
  console.log(`Preread running at http://localhost:${config.port}`);
  console.log(`Environment: ${config.isProduction ? 'production' : 'development'}`);
});

async function shutdown() {
  await prisma.$disconnect();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
