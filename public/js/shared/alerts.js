// הצגת התראות למשתמש

const ALERT_TIMER_MS = 5000;

// מציג אזהרת הגבלת קצב
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

// טוסט סטטוס קצר בתחתית
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

// דיאלוג אישור או ביטול
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
