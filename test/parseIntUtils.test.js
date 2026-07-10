import assert from 'node:assert/strict';
import { parseMinCefr } from '../src/utils/cefrUtils.js';
import {
  parseBoundedLimit,
  parseIntOr,
  parseIntSafe,
  parseOptionalPositiveInt,
} from '../src/utils/parseIntUtils.js';

assert.equal(parseIntSafe('12'), 12);
assert.equal(parseIntSafe('  42  '), 42);
assert.equal(parseIntSafe('-3'), -3);
assert.equal(parseIntSafe('12abc'), null);
assert.equal(parseIntSafe('abc'), null);
assert.equal(parseIntSafe(''), null);
assert.equal(parseIntSafe(null), null);
assert.equal(parseIntSafe(undefined), null);
assert.equal(parseIntSafe('12.5'), null);
assert.equal(parseIntSafe(Number.MAX_SAFE_INTEGER + 1), null);

assert.equal(parseIntOr('12', 0), 12);
assert.equal(parseIntOr('12abc', 99), 99);

assert.equal(parseOptionalPositiveInt(undefined), undefined);
assert.equal(parseOptionalPositiveInt(''), undefined);
assert.equal(parseOptionalPositiveInt('12'), 12);
assert.equal(parseOptionalPositiveInt('abc'), false);
assert.equal(parseOptionalPositiveInt('0'), false);
assert.equal(parseOptionalPositiveInt('-1'), false);

assert.equal(parseBoundedLimit(undefined, { defaultValue: 50, min: 1, max: 200 }), 50);
assert.equal(parseBoundedLimit('20', { defaultValue: 50, min: 1, max: 200 }), 20);
assert.equal(parseBoundedLimit('0', { defaultValue: 50, min: 1, max: 200 }), false);
assert.equal(parseBoundedLimit('201', { defaultValue: 50, min: 1, max: 200 }), false);
assert.equal(parseBoundedLimit('abc', { defaultValue: 50, min: 1, max: 200 }), false);

assert.equal(parseMinCefr(undefined), null);
assert.equal(parseMinCefr(''), null);
assert.equal(parseMinCefr('b1'), 'B1');
assert.equal(parseMinCefr('C2'), 'C2');
assert.equal(parseMinCefr('A1'), false);
assert.equal(parseMinCefr('hack'), false);

console.log('parseIntUtils tests passed');
