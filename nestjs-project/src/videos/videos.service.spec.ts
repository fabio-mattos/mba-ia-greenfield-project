import type { Queue } from 'bullmq';
import type { Repository } from 'typeorm';
import type { ChannelsService } from '../channels/channels.service';
import type { Channel } from '../channels/entities/channel.entity';
import type { StorageService } from '../storage/storage.service';
import {
  VideoFileTooLargeException,
  VideoNotFoundException,
} from '../common/exceptions/domain.exception';
import { Video, VideoStatus } from './entities/video.entity';
import { MAX_VIDEO_FILE_SIZE_BYTES } from './videos.constants';
import { VideosService } from './videos.service';

function makeRepo(): jest.Mocked<
  Pick<Repository<Video>, 'create' | 'save' | 'findOne'>
> {
  return {
    create: jest.fn((data) => data as Video),
    save: jest.fn().mockResolvedValue(undefined),
    findOne: jest.fn(),
  } as unknown as jest.Mocked<
    Pick<Repository<Video>, 'create' | 'save' | 'findOne'>
  >;
}

function makeChannelsService(
  channel: Partial<Channel> | null = { id: 'channel-1' },
): jest.Mocked<Pick<ChannelsService, 'findByUserId'>> {
  return { findByUserId: jest.fn().mockResolvedValue(channel) };
}

function makeStorageService(
  uploadId = 'upload-123',
): jest.Mocked<Pick<StorageService, 'createMultipartUpload'>> {
  return { createMultipartUpload: jest.fn().mockResolvedValue(uploadId) };
}

function makeQueue(): jest.Mocked<Pick<Queue, 'add'>> {
  return { add: jest.fn().mockResolvedValue(undefined) };
}

describe('VideosService', () => {
  describe('initiateUpload', () => {
    const baseDto = {
      title: 'My video',
      originalFileName: 'movie.mp4',
      fileSizeBytes: 1000,
      mimeType: 'video/mp4',
    };

    it('throws VideoFileTooLargeException when fileSizeBytes exceeds 10GB', async () => {
      const repo = makeRepo();
      const service = new VideosService(
        repo as unknown as Repository<Video>,
        makeChannelsService() as unknown as ChannelsService,
        makeStorageService() as unknown as StorageService,
        makeQueue() as unknown as Queue,
      );

      await expect(
        service.initiateUpload('user-1', {
          ...baseDto,
          fileSizeBytes: MAX_VIDEO_FILE_SIZE_BYTES + 1,
        }),
      ).rejects.toThrow(VideoFileTooLargeException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('creates a multipart upload and persists a draft video row', async () => {
      const repo = makeRepo();
      const channelsService = makeChannelsService({ id: 'channel-42' });
      const storageService = makeStorageService('upload-abc');
      const service = new VideosService(
        repo as unknown as Repository<Video>,
        channelsService as unknown as ChannelsService,
        storageService as unknown as StorageService,
        makeQueue() as unknown as Queue,
      );

      const result = await service.initiateUpload('user-1', baseDto);

      expect(channelsService.findByUserId).toHaveBeenCalledWith('user-1');
      expect(storageService.createMultipartUpload).toHaveBeenCalledWith(
        expect.stringMatching(/^videos\/.+\/original\.mp4$/),
      );
      expect(repo.save).toHaveBeenCalledTimes(1);
      const savedArg = repo.save.mock.calls[0][0] as Video;
      expect(savedArg.channel_id).toBe('channel-42');
      expect(savedArg.upload_id).toBe('upload-abc');
      expect(savedArg.file_size_bytes).toBe('1000');
      expect(result.uploadId).toBe('upload-abc');
      expect(result.videoId).toBe(savedArg.id);
    });

    it('throws when the user has no channel', async () => {
      const repo = makeRepo();
      const service = new VideosService(
        repo as unknown as Repository<Video>,
        makeChannelsService(null) as unknown as ChannelsService,
        makeStorageService() as unknown as StorageService,
        makeQueue() as unknown as Queue,
      );

      await expect(
        service.initiateUpload('user-without-channel', baseDto),
      ).rejects.toThrow('has no channel');
    });
  });

  describe('findForViewer', () => {
    function makeVideo(overrides: Partial<Video> = {}): Video {
      return {
        id: 'video-1',
        title: 'My video',
        status: VideoStatus.READY,
        duration_in_seconds: 12.5,
        width: 1920,
        height: 1080,
        codec: 'h264',
        container: 'mp4',
        bitrate_kbps: 1200,
        created_at: new Date('2026-01-01T00:00:00Z'),
        channel: { user_id: 'owner-1' },
        ...overrides,
      } as Video;
    }

    it('throws VideoNotFoundException when the video does not exist', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(null);
      const service = new VideosService(
        repo as unknown as Repository<Video>,
        makeChannelsService() as unknown as ChannelsService,
        makeStorageService() as unknown as StorageService,
        makeQueue() as unknown as Queue,
      );

      await expect(service.findForViewer('missing', undefined)).rejects.toThrow(
        VideoNotFoundException,
      );
    });

    it('returns the video for any viewer when status is ready', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(makeVideo());
      const service = new VideosService(
        repo as unknown as Repository<Video>,
        makeChannelsService() as unknown as ChannelsService,
        makeStorageService() as unknown as StorageService,
        makeQueue() as unknown as Queue,
      );

      const result = await service.findForViewer('video-1', undefined);

      expect(result.id).toBe('video-1');
      expect(result.status).toBe(VideoStatus.READY);
    });

    it('returns the video for the owner even when not ready', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(
        makeVideo({ status: VideoStatus.PROCESSING }),
      );
      const service = new VideosService(
        repo as unknown as Repository<Video>,
        makeChannelsService() as unknown as ChannelsService,
        makeStorageService() as unknown as StorageService,
        makeQueue() as unknown as Queue,
      );

      const result = await service.findForViewer('video-1', 'owner-1');

      expect(result.status).toBe(VideoStatus.PROCESSING);
    });

    it('throws VideoNotFoundException for a non-owner when not ready', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(
        makeVideo({ status: VideoStatus.PROCESSING }),
      );
      const service = new VideosService(
        repo as unknown as Repository<Video>,
        makeChannelsService() as unknown as ChannelsService,
        makeStorageService() as unknown as StorageService,
        makeQueue() as unknown as Queue,
      );

      await expect(
        service.findForViewer('video-1', 'someone-else'),
      ).rejects.toThrow(VideoNotFoundException);
    });

    it('throws VideoNotFoundException for an anonymous viewer when not ready', async () => {
      const repo = makeRepo();
      repo.findOne.mockResolvedValue(makeVideo({ status: VideoStatus.DRAFT }));
      const service = new VideosService(
        repo as unknown as Repository<Video>,
        makeChannelsService() as unknown as ChannelsService,
        makeStorageService() as unknown as StorageService,
        makeQueue() as unknown as Queue,
      );

      await expect(service.findForViewer('video-1', undefined)).rejects.toThrow(
        VideoNotFoundException,
      );
    });
  });
});
