import config from '#config.js';

// מחזיר 404 לפי סוג הנתיב
export function notFoundHandler(req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.status(404).send('Not found');
}

// ממפה שגיאות נפוצות לקוד HTTP
export function errorHandler(err, req, res, _next) {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large' });
  }

  console.error(`[${req.method} ${req.originalUrl}]`, err);

  const status = err.status || err.statusCode || 500;
  // מסתיר פרטי שגיאה בפרודקשן
  const message =
    status < 500 || !config.isProduction
      ? err.message || 'Internal server error'
      : 'Internal server error';

  if (req.path.startsWith('/api/')) {
    return res.status(status).json({ error: message });
  }

  res.status(status).send(message);
}
