import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { Pool } from 'pg';
import * as Minio from 'minio';
import { processVideo } from './processor';
import { closePool } from './database';

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USERNAME || 'streamtube',
  password: process.env.DB_PASSWORD || 'streamtube',
  database: process.env.DB_NAME || 'streamtube',
});

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'minio',
  port: parseInt(process.env.MINIO_PORT || '9000', 10),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || '',
  secretKey: process.env.MINIO_SECRET_KEY || '',
});

const BUCKET_VIDEOS = process.env.MINIO_BUCKET_VIDEOS || 'videos';
const BUCKET_THUMBNAILS = process.env.MINIO_BUCKET_THUMBNAILS || 'thumbnails';

function generateSyntheticVideo(destPath: string, durationSeconds: number): void {
  execFileSync('ffmpeg', [
    '-f',
    'lavfi',
    '-i',
    `testsrc=duration=${durationSeconds}:size=320x240:rate=15`,
    '-pix_fmt',
    'yuv420p',
    '-y',
    destPath,
  ]);
}

async function insertVideoFixture(fileKey: string | null): Promise<{
  userId: string;
  channelId: string;
  videoId: string;
}> {
  const userId = crypto.randomUUID();
  const channelId = crypto.randomUUID();
  const videoId = crypto.randomUUID();

  await pool.query(
    `INSERT INTO users (id, email, password, is_confirmed) VALUES ($1, $2, 'x', true)`,
    [userId, `worker-integration-${userId}@example.com`],
  );
  await pool.query(
    `INSERT INTO channels (id, name, nickname, user_id) VALUES ($1, 'Worker Integration', $2, $3)`,
    [channelId, `wi-${channelId.slice(0, 8)}`, userId],
  );
  await pool.query(
    `INSERT INTO videos (id, slug, status, file_key, channel_id) VALUES ($1, $2, 'processing', $3, $4)`,
    [videoId, videoId.slice(0, 12), fileKey, channelId],
  );

  return { userId, channelId, videoId };
}

async function cleanupFixture(
  fixture: { userId: string; channelId: string; videoId: string },
  extraObjectKeys: string[] = [],
): Promise<void> {
  await pool.query(`DELETE FROM videos WHERE id = $1`, [fixture.videoId]);
  await pool.query(`DELETE FROM channels WHERE id = $1`, [fixture.channelId]);
  await pool.query(`DELETE FROM users WHERE id = $1`, [fixture.userId]);

  for (const key of extraObjectKeys) {
    await minioClient.removeObject(BUCKET_VIDEOS, key).catch(() => undefined);
    await minioClient
      .removeObject(BUCKET_THUMBNAILS, key)
      .catch(() => undefined);
  }
}

async function uploadSyntheticVideoFixture(durationSeconds: number): Promise<{
  fixture: { userId: string; channelId: string; videoId: string };
  fileKey: string;
}> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'processor-it-'));
  const localVideoPath = path.join(tmpDir, 'fixture.mp4');
  generateSyntheticVideo(localVideoPath, durationSeconds);

  const fileKey = `integration-test/${crypto.randomUUID()}.mp4`;
  await minioClient.fPutObject(BUCKET_VIDEOS, fileKey, localVideoPath);
  fs.rmSync(tmpDir, { recursive: true, force: true });

  const fixture = await insertVideoFixture(fileKey);
  return { fixture, fileKey };
}

async function getVideoRow(videoId: string) {
  const result = await pool.query(
    `SELECT status, duration_seconds, thumbnail_key FROM videos WHERE id = $1`,
    [videoId],
  );
  return result.rows[0];
}

async function objectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await minioClient.statObject(bucket, key);
    return true;
  } catch {
    return false;
  }
}

describe('processVideo (integration)', () => {
  afterAll(async () => {
    await pool.end();
    await closePool();
  });

  it('processes a real video end-to-end: downloads, extracts duration/thumbnail, marks it ready', async () => {
    const { fixture, fileKey } = await uploadSyntheticVideoFixture(8);

    try {
      await processVideo(fixture.videoId);

      const row = await getVideoRow(fixture.videoId);
      expect(row.status).toBe('ready');
      expect(row.duration_seconds).toBeGreaterThanOrEqual(6);
      expect(row.duration_seconds).toBeLessThanOrEqual(10);
      expect(row.thumbnail_key).toBe(`thumbnails/${fixture.videoId}.jpg`);

      const thumbnailExists = await objectExists(
        BUCKET_THUMBNAILS,
        row.thumbnail_key,
      );
      expect(thumbnailExists).toBe(true);
    } finally {
      await cleanupFixture(fixture, [fileKey, `thumbnails/${fixture.videoId}.jpg`]);
    }
  }, 30000);

  it('generates a thumbnail for a video shorter than the fixed 5s seek offset', async () => {
    const { fixture, fileKey } = await uploadSyntheticVideoFixture(3);

    try {
      await processVideo(fixture.videoId);

      const row = await getVideoRow(fixture.videoId);
      expect(row.status).toBe('ready');
      expect(row.duration_seconds).toBeGreaterThanOrEqual(2);
      expect(row.duration_seconds).toBeLessThanOrEqual(4);

      const thumbnailExists = await objectExists(
        BUCKET_THUMBNAILS,
        row.thumbnail_key,
      );
      expect(thumbnailExists).toBe(true);
    } finally {
      await cleanupFixture(fixture, [fileKey, `thumbnails/${fixture.videoId}.jpg`]);
    }
  }, 30000);

  it('marks the video as failed when the source file does not exist in storage', async () => {
    const fixture = await insertVideoFixture(
      `integration-test/does-not-exist-${crypto.randomUUID()}.mp4`,
    );

    try {
      await expect(processVideo(fixture.videoId)).rejects.toThrow();

      const row = await getVideoRow(fixture.videoId);
      expect(row.status).toBe('failed');
    } finally {
      await cleanupFixture(fixture);
    }
  }, 30000);
});
