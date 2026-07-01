import {
  VideoNotFoundException,
  VideoAlreadyProcessingException,
} from '../common/exceptions/domain.exception';
import { VideosService } from './videos.service';
import { VideoStatus, VideoVisibility } from './entities/video.entity';

function makeVideo(overrides: Partial<ReturnType<typeof defaultVideo>> = {}) {
  return { ...defaultVideo(), ...overrides };
}

function defaultVideo(): {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: VideoStatus;
  visibility: VideoVisibility | null;
  duration_seconds: number | null;
  view_count: number;
  file_key: string | null;
  thumbnail_key: string | null;
  channel_id: string;
  category_id: string | null;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
  channel: {
    id: string;
    nickname: string;
    name: string;
    thumbnail_key: string | null;
  };
  category: null;
} {
  return {
    id: 'video-id',
    slug: 'abc123def45',
    title: 'My Video',
    description: null,
    status: VideoStatus.DRAFT,
    visibility: null,
    duration_seconds: null,
    view_count: 0,
    file_key: 'uploads/abc123def45/test.mp4',
    thumbnail_key: null,
    channel_id: 'channel-id',
    category_id: null,
    published_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    channel: {
      id: 'channel-id',
      nickname: 'testchan',
      name: 'Test Channel',
      thumbnail_key: null,
    },
    category: null,
  };
}

function makeVideoRepository(overrides: Record<string, jest.Mock> = {}) {
  return {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn(),
      select: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    }),
    count: jest.fn(),
    findAndCount: jest.fn(),
    ...overrides,
  };
}

function makeStorageService(overrides: Record<string, jest.Mock> = {}) {
  return {
    getPresignedPutUrl: jest.fn().mockResolvedValue('https://minio/upload'),
    getPresignedGetUrl: jest.fn().mockResolvedValue('https://minio/stream'),
    getPresignedGetUrlWithDisposition: jest
      .fn()
      .mockResolvedValue('https://minio/download'),
    putObject: jest.fn().mockResolvedValue(undefined),
    deleteObject: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeProducer() {
  return { enqueue: jest.fn() };
}

function makeStorageConfig() {
  return {
    endpoint: 'minio',
    port: 9000,
    accessKey: 'key',
    secretKey: 'secret',
    useSSL: false,
    bucketVideos: 'videos',
    bucketThumbnails: 'thumbnails',
    presignedUploadTtl: 7200,
    presignedStreamTtl: 21600,
  };
}

function makeService(
  overrides: {
    videoRepository?: Record<string, jest.Mock>;
    storageService?: Record<string, jest.Mock>;
  } = {},
) {
  const videoRepo = makeVideoRepository(overrides.videoRepository);
  const storage = makeStorageService(overrides.storageService);
  const producer = makeProducer();
  const config = makeStorageConfig();

  const service = new VideosService(
    videoRepo as any,
    storage as any,
    producer as any,
    config as any,
  );

  return { service, videoRepo, storage, producer };
}

describe('VideosService', () => {
  describe('initiateUpload', () => {
    it('creates a DRAFT video and returns a presigned PUT URL', async () => {
      const video = makeVideo();
      const { service, videoRepo, storage } = makeService({
        videoRepository: {
          findOne: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockReturnValue(video),
          save: jest.fn().mockResolvedValue(video),
        },
      });

      const result = await service.initiateUpload('channel-id', 'test.mp4');

      expect(videoRepo.save).toHaveBeenCalledTimes(1);
      expect(storage.getPresignedPutUrl).toHaveBeenCalledTimes(1);
      expect(result.videoId).toBe(video.id);
      expect(result.uploadUrl).toBe('https://minio/upload');
    });
  });

  describe('confirmUpload', () => {
    it('sets status to PROCESSING and enqueues a job', async () => {
      const video = makeVideo({ status: VideoStatus.DRAFT });
      const { service, videoRepo, producer } = makeService({
        videoRepository: {
          findOne: jest.fn().mockResolvedValue(video),
          update: jest.fn().mockResolvedValue({ affected: 1 }),
        },
      });

      await service.confirmUpload('video-id', 'channel-id');

      expect(videoRepo.update).toHaveBeenCalledWith(
        'video-id',
        expect.objectContaining({ status: VideoStatus.PROCESSING }),
      );
      expect(producer.enqueue).toHaveBeenCalledWith('video-id');
    });

    it('throws VideoNotFoundException when video does not exist', async () => {
      const { service } = makeService({
        videoRepository: { findOne: jest.fn().mockResolvedValue(null) },
      });

      await expect(service.confirmUpload('nope', 'channel-id')).rejects.toThrow(
        VideoNotFoundException,
      );
    });

    it('throws VideoNotFoundException when channel does not own the video', async () => {
      const { service } = makeService({
        videoRepository: { findOne: jest.fn().mockResolvedValue(null) },
      });

      await expect(
        service.confirmUpload('video-id', 'other-channel'),
      ).rejects.toThrow(VideoNotFoundException);
    });

    it('throws VideoAlreadyProcessingException when already PROCESSING', async () => {
      const video = makeVideo({ status: VideoStatus.PROCESSING });
      const { service } = makeService({
        videoRepository: { findOne: jest.fn().mockResolvedValue(video) },
      });

      await expect(
        service.confirmUpload('video-id', 'channel-id'),
      ).rejects.toThrow(VideoAlreadyProcessingException);
    });
  });

  describe('findBySlug', () => {
    it('throws VideoNotFoundException when video does not exist', async () => {
      const { service } = makeService({
        videoRepository: { findOne: jest.fn().mockResolvedValue(null) },
      });

      await expect(service.findBySlug('nope')).rejects.toThrow(
        VideoNotFoundException,
      );
    });

    it('returns video response DTO when found', async () => {
      const video = makeVideo({
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
      });
      const { service } = makeService({
        videoRepository: { findOne: jest.fn().mockResolvedValue(video) },
      });

      const result = await service.findBySlug('abc123def45');

      expect(result.id).toBe('video-id');
      expect(result.slug).toBe('abc123def45');
    });
  });

  describe('deleteVideo', () => {
    it('deletes video files from storage and removes DB record', async () => {
      const video = makeVideo({
        file_key: 'uploads/abc/test.mp4',
        thumbnail_key: 'thumbnails/abc/thumb.jpg',
      });
      const { service, videoRepo, storage } = makeService({
        videoRepository: {
          findOne: jest.fn().mockResolvedValue(video),
        },
      });

      await service.deleteVideo('video-id', 'channel-id');

      expect(storage.deleteObject).toHaveBeenCalledTimes(2);
      expect(videoRepo.delete).toHaveBeenCalledWith('video-id');
    });
  });
});
