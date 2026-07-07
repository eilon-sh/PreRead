async function signInWithGoogle(callbackURL = '/upload') {
  const res = await fetch('/api/auth/sign-in/social', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ provider: 'google', callbackURL }),
  });
  const data = await res.json();
  if (res.status === 429) {
    showRateLimitBanner?.(
      data.error || 'יותר מדי בקשות. נסה שוב מאוחר יותר.',
      data.retryAfter || res.headers.get('Retry-After'),
    );
    return;
  }
  if (!res.ok) {
    throw new Error(data.message || data.error || 'שגיאה בהתחברות עם Google');
  }
  if (data.url) {
    window.location.href = data.url;
    return;
  }
  window.location.href = callbackURL;
}

function bindGoogleSignIn(buttonId, callbackURL = '/upload') {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await signInWithGoogle(callbackURL);
    } catch (err) {
      showStatusAlert(err.message, 'error');
      btn.disabled = false;
    }
  });
}
