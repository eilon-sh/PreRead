/**
 * Today's date as an ISO calendar string (YYYY-MM-DD) in UTC.
 * @returns {string}
 */
export function today() {
  return new Date().toISOString().slice(0, 10);
}
