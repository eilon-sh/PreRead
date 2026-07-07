(() => {
  const html = document.documentElement;
  const themeBtn = document.getElementById('themeToggle');
  themeBtn?.addEventListener('click', () => {
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    html.setAttribute('data-bs-theme', next);
    localStorage.setItem('preread-theme', next);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = next === 'dark' ? '#141820' : '#4f46e5';
  });
})();
