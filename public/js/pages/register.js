document.getElementById('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await fetch('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      name: document.getElementById('name').value,
      email: document.getElementById('email').value,
      password: document.getElementById('password').value,
    }),
  });
  const data = await res.json();
  if (res.status === 429) {
    showRateLimitBanner(
      data.error || 'יותר מדי בקשות. נסה שוב מאוחר יותר.',
      data.retryAfter || res.headers.get('Retry-After'),
    );
    return;
  }
  if (!res.ok) {
    showStatusAlert(data.message || data.error || 'שגיאה בהרשמה', 'error');
    return;
  }
  window.location.href = '/upload';
});
bindGoogleSignIn('googleSignInBtn');
