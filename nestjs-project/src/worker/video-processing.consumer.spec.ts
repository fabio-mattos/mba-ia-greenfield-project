import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { Job } from 'bullmq';
import type { Repository } from 'typeorm';
import type { StorageService } from '../storage/storage.service';
import { Video, VideoStatus } from '../videos/entities/video.entity';
import type { FfmpegService, VideoMetadata } from './ffmpeg.service';
import {
  ProcessVideoJobData,
  VideoProcessingConsumer,
} from './video-processing.consumer';

function makeRepo(): jest.Mocked<
  Pick<Repository<Video>, 'findOneByOrFail' | 'update'>
> {
  return {
    findOneByOrFail: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
  };
}

function makeStorageService(): jest.Mocked<
  Pick<StorageService, 'getObjectStream' | 'putObject'>
> {
  return {
    getObjectStream: jest
      .fn()
      .mockResolvedValue(Readable.from(Buffer.from('fake-video-bytes'))),
    putObject: jest.fn().mockResolvedValue(undefined),
  };
}

describe('VideoProcessingConsumer', () => {
  let tmpDir: string;
  let thumbnailPath: string;
  const metadata: VideoMetadata = {
    durationInSeconds: 12.5,
    width: 1920,
    height: 1080,
    codec: 'h264',
    container: 'mov,mp4,m4a,3gp,3g2,mj2',
    bitrateKbps: 1200,
  };

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'consumer-test-'));
    thumbnailPath = path.join(tmpDir, 'thumbnail.jpg');
    await fs.writeFile(thumbnailPath, Buffer.from('fake-thumbnail'));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function makeFfmpegService(): jest.Mocked<
    Pick<FfmpegService, 'extractMetadata' | 'generateThumbnail'>
  > {
    return {
      extractMetadata: jest.fn().mockResolvedValue(metadata),
      generateThumbnail: jest.fn().mockResolvedValue(thumbnailPath),
    };
  }

  function makeJob(videoId: string): Job<ProcessVideoJobData> {
    return {
      name: 'process-video',
      data: { videoId },
      attemptsMade: 1,
      opts: { attempts: 3 },
      failedReason: 'boom',
    } as unknown as Job<ProcessVideoJobData>;
  }

  it('downloads the original, extracts metadata, uploads thumbnail, and marks the video ready', async () => {
    const repo = makeRepo();
    repo.findOneByOrFail.mockResolvedValue({
      id: 'video-1',
      original_file_key: 'videos/video-1/original.mp4',
    } as Video);
    const storageService = makeStorageService();
    const ffmpegService = makeFfmpegService();
    const consumer = new VideoProcessingConsumer(
      repo as unknown as Repository<Video>,
      storageService as unknown as StorageService,
      ffmpegService as unknown as FfmpegService,
    );

    await consumer.process(makeJob('video-1'));

    expect(storageService.getObjectStream).toHaveBeenCalledWith(
      'videos/video-1/original.mp4',
    );
    expect(ffmpegService.extractMetadata).toHaveBeenCalled();
    expect(ffmpegService.generateThumbnail).toHaveBeenCalled();
    expect(storageService.putObject).toHaveBeenCalledWith(
      'videos/video-1/thumbnail.jpg',
      expect.any(Buffer),
      'image/jpeg',
    );
    expect(repo.update).toHaveBeenCalledWith(
      'video-1',
      expect.objectContaining({
        status: VideoStatus.READY,
        duration_in_seconds: metadata.durationInSeconds,
        width: metadata.width,
        height: metadata.height,
        codec: metadata.codec,
        container: metadata.container,
        bitrate_kbps: metadata.bitrateKbps,
        thumbnail_key: 'videos/video-1/thumbnail.jpg',
      }),
    );
  });

  it('skips jobs whose name does not match process-video', async () => {
    const repo = makeRepo();
    const storageService = makeStorageService();
    const ffmpegService = makeFfmpegService();
    const consumer = new VideoProcessingConsumer(
      repo as unknown as Repository<Video>,
      storageService as unknown as StorageService,
      ffmpegService as unknown as FfmpegService,
    );

    const job = makeJob('video-1');
    (job as { name: string }).name = 'other-job';

    await consumer.process(job);

    expect(repo.findOneByOrFail).not.toHaveBeenCalled();
  });

  describe('onFailed', () => {
    it('marks the video as failed once all attempts are exhausted', async () => {
      const repo = makeRepo();
      const storageService = makeStorageService();
      const ffmpegService = makeFfmpegService();
      const consumer = new VideoProcessingConsumer(
        repo as unknown as Repository<Video>,
        storageService as unknown as StorageService,
        ffmpegService as unknown as FfmpegService,
      );

      const job = makeJob('video-1');
      (job as { attemptsMade: number }).attemptsMade = 3;

      await consumer.onFailed(job);

      expect(repo.update).toHaveBeenCalledWith('video-1', {
        status: VideoStatus.FAILED,
        failure_reason: 'boom',
      });
    });

    it('does not mark as failed while attempts remain', async () => {
      const repo = makeRepo();
      const storageService = makeStorageService();
      const ffmpegService = makeFfmpegService();
      const consumer = new VideoProcessingConsumer(
        repo as unknown as Repository<Video>,
        storageService as unknown as StorageService,
        ffmpegService as unknown as FfmpegService,
      );

      await consumer.onFailed(makeJob('video-1'));

      expect(repo.update).not.toHaveBeenCalled();
    });
  });
});
