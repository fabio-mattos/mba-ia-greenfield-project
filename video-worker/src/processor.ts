import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as http from 'node:http';
import * as https from 'node:https';
import ffmpeg from 'fluent-ffmpeg';
import {
  BUCKET_THUMBNAILS,
  BUCKET_VIDEOS,
  getPresignedGetUrl,
  uploadBuffer,
} from './minio-client';
import {
  getVideoById,
  updateVideoFailed,
  updateVideoProcessed,
} from './database';

async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    client.get(url, (res) => {
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', reject);
    });
  });
}

function getDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(Math.round(metadata.format.duration ?? 0));
    });
  });
}

function extractThumbnail(
  filePath: string,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(filePath)
      .seekInput(5)
      .frames(1)
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });
}

export async function processVideo(videoId: string): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `video-${videoId}-`));
  const videoPath = path.join(tmpDir, 'input.mp4');
  const thumbnailPath = path.join(tmpDir, 'thumbnail.jpg');

  try {
    const video = await getVideoById(videoId);
    if (!video) {
      throw new Error(`Video ${videoId} not found in database`);
    }

    const presignedUrl = await getPresignedGetUrl(
      BUCKET_VIDEOS,
      video.file_key,
      7200,
    );

    await downloadFile(presignedUrl, videoPath);

    const durationSeconds = await getDuration(videoPath);
    await extractThumbnail(videoPath, thumbnailPath);

    const thumbnailBuffer = fs.readFileSync(thumbnailPath);
    const thumbnailKey = `thumbnails/${videoId}.jpg`;
    await uploadBuffer(
      BUCKET_THUMBNAILS,
      thumbnailKey,
      thumbnailBuffer,
      'image/jpeg',
    );

    await updateVideoProcessed(videoId, durationSeconds, thumbnailKey);
  } catch (err) {
    console.error(`[processor] Failed to process video ${videoId}:`, err);
    await updateVideoFailed(videoId);
    throw err;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
