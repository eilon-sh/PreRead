const DEV_AUTH_SECRET = 'dev-secret-key-for-local-testing-only-32chars';

export function validateProductionConfig(config) {
  if (!config.isProduction) return;

  const errors = [];

  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is required in production');
  }

  if (!process.env.BETTER_AUTH_SECRET || config.betterAuthSecret === DEV_AUTH_SECRET) {
    errors.push('BETTER_AUTH_SECRET must be set to a secure value in production');
  }

  if (config.betterAuthUrl.includes('localhost')) {
    errors.push('BETTER_AUTH_URL must not point to localhost in production');
  }

  if (!config.s3UploadBucket) {
    errors.push('S3_UPLOAD_BUCKET is required in production');
  }

  if (!config.awsRegion) {
    errors.push('AWS_REGION is required in production');
  }

  // AWS SDK uses the default credential chain (env keys, ECS, EC2 instance profile via IMDS).

  if (errors.length > 0) {
    throw new Error(`Production configuration errors:\n- ${errors.join('\n- ')}`);
  }
}
