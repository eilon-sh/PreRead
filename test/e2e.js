import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createLongSamplePdf } from './createLongSamplePdf.js';
import { createSamplePdf } from './createSamplePdf.js';

const BASE = 'http://localhost:3000';
const DEFAULT_HEADERS = { Origin: BASE };

let sessionCookie = '';
let csrfToken = '';

function mergeCookies(setCookieHeaders) {
  if (!setCookieHeaders) return;
  const incoming = (Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders]).map(
    (c) => c.split(';')[0],
  );
  const jar = Object.fromEntries(
    sessionCookie
      .split('; ')
      .filter(Boolean)
      .map((c) => c.split('=')),
  );
  for (const c of incoming) {
    const [k, v] = c.split('=');
    jar[k] = v;
  }
  sessionCookie = Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function request(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const reqHeaders = {
      ...DEFAULT_HEADERS,
      ...headers,
      Cookie: sessionCookie,
    };
    if (csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      reqHeaders['x-csrf-token'] = csrfToken;
    }
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: reqHeaders,
    };
    const req = http.request(opts, (res) => {
      mergeCookies(res.headers['set-cookie']);
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function refreshCsrf() {
  const res = await request('GET', '/api/v1/csrf-token');
  if (res.status !== 200 || !res.body.csrfToken) {
    throw new Error('Failed to get CSRF token');
  }
  csrfToken = res.body.csrfToken;
}

function multipartUpload(filePath) {
  const boundary = `----FormBoundary${Date.now()}`;
  const fileContent = fs.readFileSync(filePath);
  const filename = path.basename(filePath);

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="pdf"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`,
    ),
    fileContent,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  return request('POST', '/api/v1/documents', body, {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': body.length,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMissingCloudUploadPrereq(errorText) {
  if (!errorText) return false;
  return [
    'Could not load credentials from any providers',
    'Missing required key "Bucket"',
    'No value provided for input HTTP label: Bucket',
    'Resolved credential object is not valid',
  ].some((snippet) => errorText.includes(snippet));
}

async function run() {
  const testEmail = `test${Date.now()}@example.com`;
  const testPassword = 'testpassword123';

  console.log('0. Register test user...');
  const signupBody = JSON.stringify({
    name: 'Test User',
    email: testEmail,
    password: testPassword,
  });
  const signup = await request('POST', '/api/auth/sign-up/email', signupBody, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(signupBody),
  });
  if (signup.status !== 200) throw new Error(`Signup failed: ${JSON.stringify(signup.body)}`);
  console.log('   OK');

  await refreshCsrf();
  console.log('   CSRF token acquired');

  const pdfPath = await createSamplePdf();

  console.log('1. Upload PDF...');
  const upload = await multipartUpload(pdfPath);
  if (upload.status !== 202) {
    const uploadErrorText =
      typeof upload.body === 'string'
        ? upload.body
        : upload.body?.error || JSON.stringify(upload.body);
    if (isMissingCloudUploadPrereq(uploadErrorText)) {
      console.log('SKIPPED: e2e upload flow requires AWS credentials and S3 bucket configuration.');
      console.log(
        'Set AWS credentials + S3_UPLOAD_BUCKET to run full e2e upload/processing tests.',
      );
      return;
    }
    throw new Error(`Upload failed: ${JSON.stringify(upload.body)}`);
  }
  console.log('   OK - document id:', upload.body.id);

  console.log('2. Wait for background processing...');
  let processed = null;
  for (let i = 0; i < 40; i++) {
    const docs = await request('GET', '/api/v1/documents');
    const doc = docs.body.find((d) => d.id === upload.body.id);
    if (!doc) throw new Error('Uploaded doc missing from documents list');
    if (doc.processing_status === 'ready') {
      processed = doc;
      break;
    }
    if (doc.processing_status === 'failed') {
      throw new Error('Document processing failed');
    }
    await sleep(500);
  }
  if (!processed) throw new Error('Document stayed in processing too long');
  console.log('   OK - processing completed');

  console.log('1b. Upload long PDF (chunked extraction)...');
  const longPdfPath = await createLongSamplePdf();
  const longUpload = await multipartUpload(longPdfPath);
  if (longUpload.status !== 202) {
    throw new Error(`Long PDF upload failed: ${JSON.stringify(longUpload.body)}`);
  }
  console.log('   OK - long document id:', longUpload.body.id);

  let longProcessed = null;
  for (let i = 0; i < 60; i++) {
    const docs = await request('GET', '/api/v1/documents');
    const doc = docs.body.find((d) => d.id === longUpload.body.id);
    if (!doc) throw new Error('Long uploaded doc missing from documents list');
    if (doc.processing_status === 'ready') {
      longProcessed = doc;
      break;
    }
    if (doc.processing_status === 'failed') {
      throw new Error('Long document processing failed');
    }
    await sleep(500);
  }
  if (!longProcessed) throw new Error('Long document stayed in processing too long');
  console.log('   OK - long document processing completed');

  const longWords = await request('GET', `/api/v1/words?documentId=${longUpload.body.id}`);
  if (longWords.status !== 200 || longWords.body.words.length === 0) {
    throw new Error('No words found for long document');
  }
  const longWordSet = new Set(longWords.body.words.map((w) => w.word.toLowerCase()));
  if (!longWordSet.has('ubiquitous') || !longWordSet.has('ephemeral')) {
    throw new Error('Long document missing vocabulary from tail section');
  }
  console.log('   OK -', longWords.body.words.length, 'words from long document');

  console.log('3. List words...');
  const words = await request('GET', '/api/v1/words');
  if (words.status !== 200 || words.body.words.length === 0) throw new Error('No words found');
  console.log('   OK -', words.body.words.length, 'words total');

  console.log('4. Get due flashcards...');
  const due = await request('GET', '/api/v1/reviews/due');
  if (due.status !== 200 || due.body.count === 0) throw new Error('No due cards');
  console.log('   OK -', due.body.count, 'cards due');

  const cardId = due.body.cards[0].flashcard_id;
  console.log('5. Review card', cardId, 'with quality 4...');
  const reviewBody = JSON.stringify({ quality: 4 });
  const review = await request('POST', `/api/v1/reviews/${cardId}`, reviewBody, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(reviewBody),
  });
  if (review.status !== 200) throw new Error(`Review failed: ${JSON.stringify(review.body)}`);
  console.log('   OK - XP gained:', review.body.game?.xpGained);

  console.log('6. Game profile...');
  const profile = await request('GET', '/api/v1/game/profile');
  if (profile.status !== 200) throw new Error('Profile failed');
  console.log('   OK - level:', profile.body.stats.level, 'xp:', profile.body.stats.xp);

  console.log('7. Achievements...');
  const achievements = await request('GET', '/api/v1/game/achievements');
  const unlocked = achievements.body.filter((a) => a.unlocked).length;
  console.log('   OK -', unlocked, 'achievements unlocked');

  console.log('\nAll e2e tests passed!');
}

run().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
