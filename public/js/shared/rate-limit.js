function formatRetryAfter(seconds) {
  const n = parseInt(seconds, 10);
  if (!n || Number.isNaN(n)) return null;
  if (n < 60) return `נסה שוב בעוד ${n} שניות`;
  const minutes = Math.ceil(n / 60);
  return `נסה שוב בעוד ${minutes} דקות`;
}

function showRateLimitBanner(message, retryAfter) {
  const retryText = formatRetryAfter(retryAfter);
  const text = retryText ? `${message} ${retryText}.` : message;
  showRateLimitAlert(text);
}

function isRateLimited(res) {
  return res.status === 429;
}

function rateLimitPlaceholder() {
  return '<p class="muted rate-limit-placeholder">לא ניתן לטעון נתונים כרגע - יותר מדי בקשות. נסה שוב בעוד כמה רגעים.</p>';
}

async function parseRateLimitResponse(res) {
  if (res.status !== 429) return null;
  try {
    const data = await res.clone().json();
    return {
      message: data.error || 'יותר מדי בקשות. נסה שוב מאוחר יותר.',
      retryAfter: data.retryAfter || res.headers.get('Retry-After'),
    };
  } catch {
    return {
      message: 'יותר מדי בקשות. נסה שוב מאוחר יותר.',
      retryAfter: res.headers.get('Retry-After'),
    };
  }
}
