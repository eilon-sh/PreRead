import assert from 'node:assert/strict';
import {
  buildDocumentS3Key,
  decodeUploadedFilename,
  sanitizeDisplayFilename,
} from '../src/utils/filenameUtils.js';

const hebrewName = 'מילים לתרגול.pdf';
const latin1Mojibake = Buffer.from(hebrewName, 'utf8').toString('latin1');

assert.equal(decodeUploadedFilename(latin1Mojibake), hebrewName);
assert.equal(decodeUploadedFilename(hebrewName), hebrewName);
assert.equal(decodeUploadedFilename('notes.pdf'), 'notes.pdf');

const xssName = '<script>alert(1)</script>.pdf';
const sanitizedXss = sanitizeDisplayFilename(xssName);
assert.equal(sanitizedXss.includes('<'), false);
assert.equal(sanitizedXss.includes('>'), false);
assert.equal(sanitizedXss.includes('"'), false);
assert.equal(sanitizedXss.includes("'"), false);
assert.equal(sanitizedXss.includes('`'), false);
assert.equal(sanitizedXss.includes('&'), false);
assert.match(sanitizedXss, /\.pdf$/i);

assert.equal(sanitizeDisplayFilename(hebrewName), hebrewName);
assert.equal(sanitizeDisplayFilename(latin1Mojibake), hebrewName);
assert.equal(sanitizeDisplayFilename('../etc/passwd.pdf'), 'passwd.pdf');

const s3Key = buildDocumentS3Key(42, hebrewName);
assert.match(s3Key, /^42-\d+-[A-Za-z0-9-_]+\.pdf$/);
assert.equal(/[^\x00-\x7F]/.test(s3Key), false);

const xssKey = buildDocumentS3Key(7, xssName);
assert.match(xssKey, /^7-\d+-[A-Za-z0-9-_]+\.pdf$/);
assert.equal(/[<>"'`&]/.test(xssKey), false);

console.log('filenameUtils tests passed');
