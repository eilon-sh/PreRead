import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { parseIntOr } from '#utils/parseIntUtils.js';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

export default {
  port: parseIntOr(process.env.PORT, 3000),
  isProduction,
  trustProxy: process.env.TRUST_PROXY === 'true',
  awsRegion: process.env.AWS_REGION || 'us-east-1',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    get enabled() {
      return !!(this.clientId && this.clientSecret);
    },
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY || '',
    fromEmail: process.env.RESEND_FROM_EMAIL || '',
  },
  s3UploadBucket: process.env.S3_UPLOAD_BUCKET || '',
  betterAuthSecret:
    process.env.BETTER_AUTH_SECRET || 'dev-secret-key-for-local-testing-only-32chars',
  betterAuthUrl: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  csrfSecret:
    process.env.CSRF_SECRET ||
    process.env.BETTER_AUTH_SECRET ||
    crypto.randomBytes(32).toString('hex'),
  rateLimit: {
    windowMs: parseIntOr(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: parseIntOr(process.env.RATE_LIMIT_MAX, 300),
    authMax: parseIntOr(process.env.RATE_LIMIT_AUTH_MAX, 20),
    uploadMax: parseIntOr(process.env.RATE_LIMIT_UPLOAD_MAX, 5),
    extractMax: parseIntOr(process.env.RATE_LIMIT_EXTRACT_MAX, 60),
    passwordResetEmailMax: parseIntOr(process.env.RATE_LIMIT_PASSWORD_RESET_EMAIL_MAX, 3),
    passwordResetEmailWindowMs: parseIntOr(
      process.env.RATE_LIMIT_PASSWORD_RESET_EMAIL_WINDOW_MS,
      60 * 60 * 1000,
    ),
  },
  bodyLimit: process.env.BODY_LIMIT || '100kb',
};
