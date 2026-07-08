import crypto from 'node:crypto';
import path from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import config from '#config.js';

const s3 = new S3Client({ region: config.awsRegion });

export function buildDocumentS3Key(userId, filename) {
  const base = path.basename(filename || 'document.pdf', '.pdf');
  const normalized = base.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80) || 'document';
  return `${userId}-${Date.now()}-${normalized}.pdf`;
}

export async function uploadPdfToS3({ key, buffer }) {
  if (!config.s3UploadBucket) {
    throw Object.assign(new Error('S3_UPLOAD_BUCKET is not configured'), { status: 500 });
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: config.s3UploadBucket,
      Key: key,
      Body: buffer,
      ContentType: 'application/pdf',
    }),
  );

  return { key, bucket: config.s3UploadBucket };
}
