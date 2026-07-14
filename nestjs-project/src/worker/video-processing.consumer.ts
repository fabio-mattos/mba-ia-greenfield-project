import * as fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { StorageService } from '../storage/storage.service';
import { thumbnailObjectKey } from '../storage/storage.constants';
import { Video, VideoStatus } from '../videos/entities/video.entity';
import { FfmpegService } from './ffmpeg.service';
import {
  PROCESS_VIDEO_JOB,
  VIDEO_PROCESSING_QUEUE,
} from '../queue/queue.constants';

export interface ProcessVideoJobData {
  videoId: string;
}

@Processor(VIDEO_PROCESSING_QUEUE)
export class VideoProcessingConsumer extends WorkerHost {
  private readonly logger = new Logger(VideoProcessingConsumer.name);

  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    private readonly storageService: StorageService,
    private readonly ffmpegService: FfmpegService,
  ) {
    super();
  }

  async process(job: Job<ProcessVideoJobData>): Promise<void> {
    if (job.name !== PROCESS_VIDEO_JOB) {
      return;
    }

    const { videoId } = job.data;
    const video = await this.videoRepository.findOneByOrFail({ id: videoId });

    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), `video-${videoId}-`),
    );
    try {
      const localFilePath = path.join(tmpDir, 'original');
      const objectStream = await this.storageService.getObjectStream(
        video.original_file_key,
      );
      await pipeline(objectStream, createWriteStream(localFilePath));

      const metadata = await this.ffmpegService.extractMetadata(localFilePath);
      const thumbnailPath = await this.ffmpegService.generateThumbnail(
        localFilePath,
        tmpDir,
      );
      const thumbnailBuffer = await fs.readFile(thumbnailPath);
      const thumbnailKey = thumbnailObjectKey(videoId);
      await this.storageService.putObject(
        thumbnailKey,
        thumbnailBuffer,
        'image/jpeg',
      );

      await this.videoRepository.update(videoId, {
        status: VideoStatus.READY,
        duration_in_seconds: metadata.durationInSeconds,
        width: metadata.width,
        height: metadata.height,
        codec: metadata.codec,
        container: metadata.container,
        bitrate_kbps: metadata.bitrateKbps,
        thumbnail_key: thumbnailKey,
      });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ProcessVideoJobData>): Promise<void> {
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < attempts) {
      return;
    }

    this.logger.error(
      `Video ${job.data.videoId} failed processing after ${job.attemptsMade} attempts: ${job.failedReason}`,
    );
    await this.videoRepository.update(job.data.videoId, {
      status: VideoStatus.FAILED,
      failure_reason: job.failedReason ?? 'Unknown processing error',
    });
  }
}
