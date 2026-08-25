import assert from 'node:assert/strict';
import {
  deleteCachedSession,
  extractSessionCacheKey,
  getCachedSession,
  setCachedSession,
} from '../src/utils/sessionCache.js';

const token = 'abc.def';
assert.equal(
  extractSessionCacheKey('better-auth.session_token=abc.def'),
  token,
);
assert.equal(
  extractSessionCacheKey('__Secure-better-auth.session_token=abc.def'),
  token,
);
assert.equal(
  extractSessionCacheKey('theme=dark; __Secure-better-auth.session_token=abc.def; other=1'),
  token,
);
assert.equal(extractSessionCacheKey('theme=dark'), null);

setCachedSession(token, { user: { id: '1' } });
assert.equal(getCachedSession(token).user.id, '1');
deleteCachedSession(token);
assert.equal(getCachedSession(token), null);

console.log('sessionCache tests passed');
