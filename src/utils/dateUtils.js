/**
 * Calendar date (YYYY-MM-DD) in the process local timezone.
 * @param {Date} [date]
 * @returns {string}
 */
export function calendarDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Today's calendar date (YYYY-MM-DD) in the process local timezone.
 * @returns {string}
 */
export function today() {
  return calendarDate();
}

/**
 * Add calendar days to an ISO date string (YYYY-MM-DD) without timezone shifts.
 * @param {string} dateStr
 * @param {number} days
 * @returns {string}
 */
export function addDays(dateStr, days) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
