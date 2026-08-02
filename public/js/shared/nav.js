// ניווט פעיל והתנתקות

(() => {
  const navLinks = document.getElementById('navLinks');

  // מסמן קישור ניווט פעיל
  navLinks?.querySelectorAll('.nav-link').forEach((link) => {
    const href = link.getAttribute('href');
    const path = window.location.pathname;
    const isActive = path === href || path.startsWith(`${href}/`);
    if (isActive) link.classList.add('active');
  });

  // מתנתק ומעביר להתחברות
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await fetch('/api/auth/sign-out', {
      method: 'POST',
      credentials: 'include',
    });
    window.location.href = '/login';
  });
})();
