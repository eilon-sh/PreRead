import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import config from '#config.js';

const s3 = new S3Client({ region: config.awsRegion });

export async function uploadPdfToS3({ key, buffer }) {
  await s3.send(
    new PutObjectCommand({
      Bucket: config.s3UploadBucket,
      Key: key,
      Body: buffer,
      ContentType: 'application/pdf',
    }),
  );
}
