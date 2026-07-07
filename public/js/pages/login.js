document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await fetch('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
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
    showStatusAlert(data.message || data.error || 'שגיאה בהתחברות', 'error');
    return;
  }
  window.location.href = '/upload';
});
bindGoogleSignIn('googleSignInBtn');
