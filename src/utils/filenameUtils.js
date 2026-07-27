/**
 * Fix filenames that multer/busboy decoded as latin1 instead of utf-8.
 * Leaves already-correct Unicode and plain ASCII names unchanged.
 * @param {unknown} name
 * @returns {string}
 */
export function decodeUploadedFilename(name) {
  if (typeof name !== 'string' || name.length === 0) return String(name ?? '');

  // Already contains multi-byte Unicode scripts - treat as correctly decoded UTF-8
  if (/[\u0100-\uFFFF]/.test(name)) return name;

  // No high latin1 bytes - nothing to reinterpret
  if (!/[\u0080-\u00FF]/.test(name)) return name;

  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  if (decoded.includes('\uFFFD')) return name;

  // Prefer decoded only when it yields real multi-byte Unicode (e.g. Hebrew, CJK)
  if (/[\u0100-\uFFFF]/.test(decoded)) return decoded;

  return name;
}
