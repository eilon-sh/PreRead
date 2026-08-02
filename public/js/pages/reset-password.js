(() => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const error = params.get('error');
  const form = document.getElementById('resetForm');

  // בודק תוקף טוקן מהקישור
  if (error === 'INVALID_TOKEN' || !token) {
    showStatusAlert(
      error
        ? 'הקישור לאיפוס הסיסמה אינו תקף או שפג תוקפו. בקש קישור חדש.'
        : 'קישור לאיפוס סיסמה חסר. בקש קישור חדש מדף שכחתי סיסמה.',
      'error',
    );
    return;
  }

  form.classList.remove('hidden');

  // שולח סיסמה חדשה לשרת
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('password').value;
    const passwordConfirm = document.getElementById('passwordConfirm').value;
    if (password !== passwordConfirm) {
      showStatusAlert('הסיסמאות אינן תואמות', 'error');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ newPassword: password, token }),
    });
    const data = await res.json();
    if (!res.ok) {
      showStatusAlert(data.message || data.error || 'שגיאה בעדכון הסיסמה', 'error');
      btn.disabled = false;
      return;
    }

    showStatusAlert('הסיסמה עודכנה בהצלחה! מעביר להתחברות...', 'success');
    form.classList.add('hidden');
    setTimeout(() => {
      window.location.href = '/login';
    }, 1500);
  });
})();
