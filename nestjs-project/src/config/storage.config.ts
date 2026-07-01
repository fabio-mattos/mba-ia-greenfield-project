import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  endpoint: process.env.MINIO_ENDPOINT || 'minio',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  accessKey: process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.MINIO_SECRET_KEY || '',
  useSSL: process.env.MINIO_USE_SSL === 'true',
  bucketVideos: process.env.MINIO_BUCKET_VIDEOS || 'videos',
  bucketThumbnails: process.env.MINIO_BUCKET_THUMBNAILS || 'thumbnails',
  presignedUploadTtl: parseInt(
    process.env.MINIO_PRESIGNED_UPLOAD_TTL || '7200',
    10,
  ),
  presignedStreamTtl: parseInt(
    process.env.MINIO_PRESIGNED_STREAM_TTL || '21600',
    10,
  ),
}));
