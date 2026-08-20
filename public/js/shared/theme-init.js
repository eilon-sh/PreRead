// קובע ערכת נושא מוקדמת

(() => {
  const saved = localStorage.getItem('preread-theme');
  // const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  // (prefersDark ? 'dark' : 'light')
  document.documentElement.setAttribute('data-theme', saved || 'light');
  document.documentElement.setAttribute('data-bs-theme', saved || 'light');
})();
