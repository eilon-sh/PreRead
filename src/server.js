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
import v1Router from '#v1/routes/index.js';
import { validateProductionConfig } from '#validateConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

validateProductionConfig(config);

// מאתחל נתונים
await seedAchievements();

const app = express();

if (config.trustProxy) {
  app.set('trust proxy', 1);
}

app.use(morgan(config.isProduction ? 'combined' : 'dev'));
app.use(helmetMiddleware());
app.use(compressionMiddleware);
app.use(cookieParser());
app.use(hppMiddleware);

// Better Auth חייב להופיע לפני express.json כי הוא ממש את זה בעצמו
app.post('/api/auth/request-password-reset', passwordResetEmailLimiter, toNodeHandler(auth));
app.all('/api/auth/{*splat}', authLimiter, toNodeHandler(auth));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.locals.googleEnabled = config.google.enabled;
app.locals.isProduction = config.isProduction;
app.locals.siteUrl = config.betterAuthUrl.replace(/\/$/, '');

const siteUrl = app.locals.siteUrl;
const noIndexRobots = 'noindex,nofollow';

function pageSeo({ title, description, path: seoPath, robots, image }) {
  return {
    seoTitle: title,
    seoDescription: description,
    seoPath,
    ...(robots ? { seoRobots: robots } : {}),
    ...(image ? { seoImage: image } : {}),
  };
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    maxAge: config.isProduction ? '30d' : 0,
    etag: true,
  }),
);

// קבצי סריקה ציבוריים — לפני אימות כדי שמנועי חיפוש יגיעו אליהם
app.get('/robots.txt', (_req, res) => {
  res
    .type('text/plain; charset=UTF-8')
    .send(
      [
        'User-agent: *',
        'Allow: /',
        'Allow: /login',
        'Allow: /register',
        'Disallow: /upload',
        'Disallow: /words',
        'Disallow: /study',
        'Disallow: /games',
        'Disallow: /profile',
        'Disallow: /achievements',
        'Disallow: /forgot-password',
        'Disallow: /reset-password',
        'Disallow: /api/',
        '',
        `Sitemap: ${siteUrl}/sitemap.xml`,
        '',
      ].join('\n'),
    );
});

app.get('/sitemap.xml', (_req, res) => {
  const urls = [
    { loc: '/', priority: '1.0' },
    { loc: '/login', priority: '0.7' },
    { loc: '/register', priority: '0.8' },
  ];
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.flatMap(({ loc, priority }) => [
      '  <url>',
      `    <loc>${escapeXml(`${siteUrl}${loc}`)}</loc>`,
      '    <changefreq>weekly</changefreq>',
      `    <priority>${priority}</priority>`,
      '  </url>',
    ]),
    '</urlset>',
    '',
  ].join('\n');
  res.type('application/xml; charset=UTF-8').send(body);
});

app.use(loadSession);
app.use(attachCsrfToken);

// דפי אורח — מפנים מחוברים
app.get('/', (req, res) => {
  if (req.user) return res.redirect('/upload');
  res.render(
    'home',
    pageSeo({
      title: 'Preread - למדו אנגלית אקדמית מהקורסים שלכם',
      description:
        'Preread - כלי לסטודנטים: הפכו מאמרים וחומרי קורס לכרטיסיות לימוד עם חילוץ מילים אקדמיות לפי CEFR.',
      path: '/',
    }),
  );
});
app.get('/login', (req, res) => {
  if (req.user) return res.redirect('/upload');
  res.render(
    'login',
    pageSeo({
      title: 'התחברות - Preread',
      description: 'התחברו ל-Preread כדי להפוך מאמרי PDF לכרטיסיות לימוד באנגלית אקדמית.',
      path: '/login',
    }),
  );
});
app.get('/register', (req, res) => {
  if (req.user) return res.redirect('/upload');
  res.render(
    'register',
    pageSeo({
      title: 'הרשמה - Preread',
      description: 'הירשמו בחינם ל-Preread וחלצו מילים אקדמיות מחומרי הקורס לפי רמת CEFR.',
      path: '/register',
    }),
  );
});
app.get('/forgot-password', (req, res) => {
  if (req.user) return res.redirect('/upload');
  res.render(
    'forgot-password',
    pageSeo({
      title: 'שכחתי סיסמה - Preread',
      description: 'איפוס סיסמה לחשבון Preread.',
      path: '/forgot-password',
      robots: noIndexRobots,
    }),
  );
});
app.get('/reset-password', (req, res) => {
  if (req.user) return res.redirect('/upload');
  res.render(
    'reset-password',
    pageSeo({
      title: 'איפוס סיסמה - Preread',
      description: 'בחירת סיסמה חדשה לחשבון Preread.',
      path: '/reset-password',
      robots: noIndexRobots,
    }),
  );
});

app.use(requireAuth);

// דפים פרטיים אחרי אימות
app.get('/upload', (_req, res) =>
  res.render(
    'upload',
    pageSeo({
      title: 'העלאה - Preread',
      description: 'העלאת מסמכים ל-Preread.',
      path: '/upload',
      robots: noIndexRobots,
    }),
  ),
);
app.get('/words', (req, res) => {
  if (!req.query.documentId) return res.redirect('/upload');
  res.render(
    'words',
    pageSeo({
      title: 'מילים - Preread',
      description: 'רשימת מילים ללימוד ב-Preread.',
      path: '/words',
      robots: noIndexRobots,
    }),
  );
});
app.get('/study', (_req, res) =>
  res.render(
    'study',
    pageSeo({
      title: 'לימוד - Preread',
      description: 'לימוד מרווח ב-Preread.',
      path: '/study',
      robots: noIndexRobots,
    }),
  ),
);
app.get('/games', (req, res) => {
  if (!req.query.documentId) return res.redirect('/upload');
  res.render(
    'games',
    pageSeo({
      title: 'משחקים - Preread',
      description: 'משחקי מילים ב-Preread.',
      path: '/games',
      robots: noIndexRobots,
    }),
  );
});
app.get('/profile', (_req, res) =>
  res.render(
    'profile',
    pageSeo({
      title: 'פרופיל - Preread',
      description: 'פרופיל המשתמש ב-Preread.',
      path: '/profile',
      robots: noIndexRobots,
    }),
  ),
);
app.get('/achievements', (_req, res) =>
  res.render(
    'achievements',
    pageSeo({
      title: 'הישגים - Preread',
      description: 'הישגים ב-Preread.',
      path: '/achievements',
      robots: noIndexRobots,
    }),
  ),
);

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

// סוגר DB ושרת בנקיון
async function shutdown() {
  await prisma.$disconnect();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
