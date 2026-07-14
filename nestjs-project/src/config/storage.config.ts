import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  host: process.env.STORAGE_HOST || 'minio',
  port: parseInt(process.env.STORAGE_PORT || '9000', 10),
  useSsl: process.env.STORAGE_USE_SSL === 'true',
  accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || 'streamtube',
  secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || 'streamtube123',
  bucket: process.env.STORAGE_BUCKET || 'streamtube',
  region: process.env.STORAGE_REGION || 'us-east-1',
}));
