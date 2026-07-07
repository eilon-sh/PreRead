/**
 * Strict integer parse - rejects partial matches like "12abc" and non-integers.
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseIntSafe(str) {
  if (str === null || str === undefined) return null;
  const trimmed = String(str).trim();
  if (!/^-?\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * Like parseIntSafe, but returns fallback when input is invalid.
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
export function parseIntOr(value, fallback) {
  const parsed = parseIntSafe(value);
  return parsed === null ? fallback : parsed;
}
