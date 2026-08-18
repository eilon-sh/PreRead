// מחליף בין מצב בהיר לכהה

(() => {
  // מעדכן תווית נגישות לפי המצב הנוכחי
  function syncToggleA11y(theme) {
    const isDark = theme === 'dark';
    const label = isDark ? 'מצב לילה' : 'מצב יום';
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
      btn.setAttribute('aria-label', label);
      const text = btn.querySelector('[data-theme-label]');
      if (text) text.textContent = label;
    });
  }

  // מחיל ערכת נושא ושומר
  function applyTheme(theme) {
    const html = document.documentElement;
    html.setAttribute('data-theme', theme);
    html.setAttribute('data-bs-theme', theme);
    localStorage.setItem('preread-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#141820' : '#4f46e5';
    syncToggleA11y(theme);
  }

  // מחבר כפתור החלפת נושא
  function initThemeToggle(btn) {
    if (!btn || btn.dataset.themeBound === 'true') return;
    btn.dataset.themeBound = 'true';
    btn.addEventListener('click', () => {
      const html = document.documentElement;
      const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });
  }

  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  syncToggleA11y(current);
  document.querySelectorAll('[data-theme-toggle]').forEach(initThemeToggle);
})();
