document.getElementById('forgotForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;

  const res = await fetch('/api/auth/request-password-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      email: document.getElementById('email').value,
      redirectTo: '/reset-password',
    }),
  });
  const data = await res.json();
  btn.disabled = false;

  if (res.status === 429) {
    showRateLimitBanner(
      data.error || 'יותר מדי בקשות. נסה שוב מאוחר יותר.',
      data.retryAfter || res.headers.get('Retry-After'),
    );
    return;
  }
  if (!res.ok) {
    showStatusAlert(data.message || data.error || 'שגיאה בשליחת האימייל', 'error');
    return;
  }

  showStatusAlert(
    'אם האימייל קיים במערכת, נשלח אליך קישור לאיפוס סיסמה. בדוק את תיבת הדואר.',
    'success',
  );
  e.target.reset();
});
