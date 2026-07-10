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

/**
 * Parse an optional positive integer query/body value.
 * - missing / empty → undefined (no filter)
 * - present but invalid or ≤ 0 → false (caller should 400)
 * - valid positive int → number
 *
 * @param {unknown} value
 * @returns {number | undefined | false}
 */
export function parseOptionalPositiveInt(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = parseIntSafe(value);
  if (parsed === null || parsed <= 0) return false;
  return parsed;
}

/**
 * Parse a required limit query with inclusive min/max bounds.
 * Missing → defaultValue. Invalid / out of range → false (caller should 400).
 *
 * @param {unknown} value
 * @param {{ defaultValue: number, min: number, max: number }} options
 * @returns {number | false}
 */
export function parseBoundedLimit(value, { defaultValue, min, max }) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const parsed = parseIntSafe(value);
  if (parsed === null || parsed < min || parsed > max) return false;
  return parsed;
}
