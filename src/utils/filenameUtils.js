import path from 'node:path';

const DISPLAY_MAX_LENGTH = 80;
const DISPLAY_FALLBACK = 'document.pdf';
const HTML_DANGEROUS_CHARS = /[<>"'`&]/g;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
const DISALLOWED_DISPLAY_CHARS = /[^\p{L}\p{N} .\-_]/gu;

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

/**
 * Sanitize a user-facing document filename without ASCII-folding Unicode.
 * Strips path segments, control chars, and HTML-dangerous characters.
 * @param {unknown} name
 * @returns {string}
 */
export function sanitizeDisplayFilename(name) {
  let filename = path.basename(decodeUploadedFilename(name));
  filename = filename.replace(CONTROL_CHARS, '').replace(HTML_DANGEROUS_CHARS, '');
  filename = filename.replace(DISALLOWED_DISPLAY_CHARS, '_').replace(/_+/g, '_');
  filename = filename.replace(/^[_\s.]+|[_\s.]+$/g, '').trim();

  if (!filename) return DISPLAY_FALLBACK;

  if (filename.length > DISPLAY_MAX_LENGTH) {
    const ext = path.extname(filename);
    const stemBudget = Math.max(1, DISPLAY_MAX_LENGTH - ext.length);
    filename = `${filename.slice(0, stemBudget)}${ext}`.slice(0, DISPLAY_MAX_LENGTH);
  }

  return filename || DISPLAY_FALLBACK;
}

/**
 * Build a path-safe ASCII S3 object key from the decoded original name.
 * @param {number|string} userId
 * @param {unknown} filename
 * @returns {string}
 */
export function buildDocumentS3Key(userId, filename) {
  const decoded = decodeUploadedFilename(filename);
  const base = path.basename(decoded ?? 'document', '.pdf');
  const normalized = base.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80) || 'document';
  return `${userId}-${Date.now()}-${normalized}.pdf`;
}
