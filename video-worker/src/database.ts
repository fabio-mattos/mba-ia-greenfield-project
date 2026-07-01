import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USERNAME || 'streamtube',
  password: process.env.DB_PASSWORD || 'streamtube',
  database: process.env.DB_NAME || 'streamtube',
});

export async function updateVideoProcessed(
  videoId: string,
  durationSeconds: number,
  thumbnailKey: string,
): Promise<void> {
  await pool.query(
    `UPDATE videos SET status = 'ready', duration_seconds = $1, thumbnail_key = $2, updated_at = now() WHERE id = $3`,
    [durationSeconds, thumbnailKey, videoId],
  );
}

export async function updateVideoFailed(videoId: string): Promise<void> {
  await pool.query(
    `UPDATE videos SET status = 'failed', updated_at = now() WHERE id = $1`,
    [videoId],
  );
}

export async function getVideoById(
  videoId: string,
): Promise<{ file_key: string } | null> {
  const result = await pool.query(
    `SELECT file_key FROM videos WHERE id = $1`,
    [videoId],
  );
  return result.rows[0] ?? null;
}
