// העלאת קבצים ל-S3
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import config from '#config.js';

const s3 = new S3Client({ region: config.awsRegion });

// מעלה PDF לדלי העלאות
// מעלה ונמחק אוטומטית אחרי 14 יום עם
// https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html
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
