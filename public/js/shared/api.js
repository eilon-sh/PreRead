// קורא טוקן CSRF מהמטא
function getCsrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content || '';
}

// מרענן טוקן CSRF מהשרת
async function fetchCsrfToken() {
  const res = await fetch('/api/v1/csrf-token', { credentials: 'include' });
  if (!res.ok) return '';
  const data = await res.json();
  const meta = document.querySelector('meta[name="csrf-token"]');
  if (meta && data.csrfToken) meta.content = data.csrfToken;
  return data.csrfToken || '';
}

// מבצע fetch עם CSRF והגבלת קצב
async function apiFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    let token = getCsrfToken();
    if (!token) token = await fetchCsrfToken();
    if (token) headers['x-csrf-token'] = token;
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 429) {
    const limited = await parseRateLimitResponse(res);
    if (limited) showRateLimitBanner(limited.message, limited.retryAfter);
    return res;
  }

  if (res.status === 403 && !options._csrfRetried && !(options.body instanceof FormData)) {
    await fetchCsrfToken();
    return apiFetch(url, { ...options, _csrfRetried: true });
  }

  return res;
}
