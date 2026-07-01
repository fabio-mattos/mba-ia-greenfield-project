import * as Minio from 'minio';

export const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'minio',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.MINIO_SECRET_KEY || '',
});

export const BUCKET_VIDEOS = process.env.MINIO_BUCKET_VIDEOS || 'videos';
export const BUCKET_THUMBNAILS =
  process.env.MINIO_BUCKET_THUMBNAILS || 'thumbnails';

export async function getPresignedGetUrl(
  bucket: string,
  key: string,
  ttl = 3600,
): Promise<string> {
  return minioClient.presignedGetObject(bucket, key, ttl);
}

export async function uploadBuffer(
  bucket: string,
  key: string,
  buffer: Buffer,
  mimeType: string,
): Promise<void> {
  await minioClient.putObject(bucket, key, buffer, buffer.length, {
    'Content-Type': mimeType,
  });
}
