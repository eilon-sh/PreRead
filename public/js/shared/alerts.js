const ALERT_TIMER_MS = 5000;

function getSwalThemeOptions() {
  const isDark = document.documentElement.dataset.theme === 'dark';
  if (!isDark) return {};
  return {
    colorScheme: 'dark',
    customClass: {
      popup: 'swal-dark-popup',
      title: 'swal-dark-title',
      htmlContainer: 'swal-dark-text',
    },
  };
}

function showRateLimitAlert(text) {
  Swal.fire({
    icon: 'warning',
    title: 'יותר מדי בקשות',
    text,
    confirmButtonText: 'הבנתי',
    position: 'bottom',
    timer: ALERT_TIMER_MS,
    timerProgressBar: true,
    showCloseButton: true,
    ...getSwalThemeOptions(),
  });
}

function showStatusAlert(message, type = 'info') {
  const icon = type === 'error' ? 'error' : type === 'success' ? 'success' : 'info';

  Swal.fire({
    toast: true,
    position: 'bottom',
    icon,
    title: message,
    showConfirmButton: false,
    timer: ALERT_TIMER_MS,
    timerProgressBar: true,
    ...getSwalThemeOptions(),
  });
}
