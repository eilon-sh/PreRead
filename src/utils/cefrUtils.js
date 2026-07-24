/** Allowed CEFR levels for a minimum-level filter. */
export const MIN_CEFR_LEVELS = Object.freeze(['B1', 'B2', 'C1', 'C2']);

/**
 * Normalize optional minCefr from upload form.
 * - missing / empty → null
 * - valid B1|B2|C1|C2 → uppercase level
 * - anything else → false (caller should 400)
 *
 * @param {unknown} value
 * @returns {string | null | false}
 */
export function parseMinCefr(value) {
  if (value === undefined || value === null || value === '') return null;
  const level = String(value).trim().toUpperCase();
  if (!MIN_CEFR_LEVELS.includes(level)) return false;
  return level;
}
