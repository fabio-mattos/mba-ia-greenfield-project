import { Injectable } from '@nestjs/common';
import * as path from 'node:path';
import ffmpeg from 'fluent-ffmpeg';

export interface VideoMetadata {
  durationInSeconds: number;
  width: number;
  height: number;
  codec: string;
  container: string;
  bitrateKbps: number;
}

@Injectable()
export class FfmpegService {
  async extractMetadata(filePath: string): Promise<VideoMetadata> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, data) => {
        if (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }

        const videoStream = data.streams.find(
          (stream) => stream.codec_type === 'video',
        );
        if (!videoStream) {
          reject(new Error(`No video stream found in ${filePath}`));
          return;
        }

        resolve({
          durationInSeconds: Number(data.format.duration ?? 0),
          width: videoStream.width ?? 0,
          height: videoStream.height ?? 0,
          codec: videoStream.codec_name ?? 'unknown',
          container: data.format.format_name ?? 'unknown',
          bitrateKbps: Math.round(Number(data.format.bit_rate ?? 0) / 1000),
        });
      });
    });
  }

  async generateThumbnail(
    filePath: string,
    outputDir: string,
    filename = 'thumbnail.jpg',
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .on('end', () => resolve(path.join(outputDir, filename)))
        .on('error', (err: Error) => reject(err))
        .screenshots({
          count: 1,
          timemarks: ['10%'],
          filename,
          folder: outputDir,
        });
    });
  }
}
