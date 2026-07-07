import assert from 'node:assert/strict';
import { parseIntOr, parseIntSafe } from '../src/utils/parseIntUtils.js';

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

console.log('parseIntUtils tests passed');
