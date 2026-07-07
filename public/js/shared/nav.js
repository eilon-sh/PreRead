(() => {
  const html = document.documentElement;
  const themeBtn = document.getElementById('themeToggle');
  const navLinks = document.getElementById('navLinks');

  function applyTheme(theme) {
    html.setAttribute('data-theme', theme);
    html.setAttribute('data-bs-theme', theme);
    localStorage.setItem('preread-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#141820' : '#4f46e5';
  }

  themeBtn?.addEventListener('click', () => {
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });

  navLinks?.querySelectorAll('.nav-link').forEach((link) => {
    const href = link.getAttribute('href');
    const path = window.location.pathname;
    const isActive = path === href || path.startsWith(`${href}/`);
    if (isActive) link.classList.add('active');
  });

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await fetch('/api/auth/sign-out', {
      method: 'POST',
      credentials: 'include',
    });
    window.location.href = '/login';
  });
})();
