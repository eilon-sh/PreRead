// קובע ערכת נושא מוקדמת

(() => {
  const saved = localStorage.getItem('preread-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', saved || (prefersDark ? 'dark' : 'light'));
  document.documentElement.setAttribute('data-bs-theme', saved || (prefersDark ? 'dark' : 'light'));
})();
