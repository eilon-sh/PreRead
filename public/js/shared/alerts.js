const ALERT_TIMER_MS = 5000;

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
  });
}

async function showConfirmAlert({
  title,
  text,
  confirmButtonText = 'אישור',
  cancelButtonText = 'ביטול',
}) {
  const result = await Swal.fire({
    icon: 'warning',
    title,
    text,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
    reverseButtons: true,
  });
  return result.isConfirmed;
}
