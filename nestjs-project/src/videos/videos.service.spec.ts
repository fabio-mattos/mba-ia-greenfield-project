import type { Queue } from 'bullmq';
import type { Repository } from 'typeorm';
import type { ChannelsService } from '../channels/channels.service';
import type { Channel } from '../channels/entities/channel.entity';
import type { StorageService } from '../storage/storage.service';
import { VideoFileTooLargeException } from '../common/exceptions/domain.exception';
import { Video } from './entities/video.entity';
import { MAX_VIDEO_FILE_SIZE_BYTES } from './videos.constants';
import { VideosService } from './videos.service';

function makeRepo(): jest.Mocked<Pick<Repository<Video>, 'create' | 'save'>> {
  return {
    create: jest.fn((data) => data as Video),
    save: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<Pick<Repository<Video>, 'create' | 'save'>>;
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
});
