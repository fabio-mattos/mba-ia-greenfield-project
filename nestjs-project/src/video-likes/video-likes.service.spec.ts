import { VideoNotFoundException } from '../common/exceptions/domain.exception';
import { LikeType } from './entities/video-like.entity';
import { VideoLikesService } from './video-likes.service';

function makeVideo(id = 'video-id') {
  return {
    id,
    slug: 'abc123',
    title: 'Test',
    channel_id: 'chan',
    status: 'ready',
  };
}

function makeLikeRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    findOne: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    delete: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orUpdate: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    }),
    ...overrides,
  };
}

function makeVideoRepo(overrides: Record<string, jest.Mock> = {}) {
  return { findOne: jest.fn(), ...overrides };
}

function makeService(
  options: {
    likeRepo?: Record<string, jest.Mock>;
    videoRepo?: Record<string, jest.Mock>;
  } = {},
) {
  const likeRepo = makeLikeRepo(options.likeRepo);
  const videoRepo = makeVideoRepo(options.videoRepo);
  const service = new VideoLikesService(likeRepo as any, videoRepo as any);
  return { service, likeRepo, videoRepo };
}

describe('VideoLikesService', () => {
  describe('upsertLike', () => {
    it('throws VideoNotFoundException when video does not exist', async () => {
      const { service } = makeService({
        videoRepo: { findOne: jest.fn().mockResolvedValue(null) },
      });

      await expect(
        service.upsertLike('user-id', 'nope', LikeType.LIKE),
      ).rejects.toThrow(VideoNotFoundException);
    });

    it('inserts or updates a like and returns counts', async () => {
      const video = makeVideo();
      const qb = {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orUpdate: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      };
      const { service } = makeService({
        videoRepo: { findOne: jest.fn().mockResolvedValue(video) },
        likeRepo: {
          count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0),
          findOne: jest.fn().mockResolvedValue({ type: LikeType.LIKE }),
          createQueryBuilder: jest.fn().mockReturnValue(qb),
        },
      });

      const result = await service.upsertLike(
        'user-id',
        'abc123',
        LikeType.LIKE,
      );

      expect(result.likes).toBe(1);
      expect(result.dislikes).toBe(0);
      expect(result.userLike).toBe(LikeType.LIKE);
    });
  });

  describe('removeLike', () => {
    it('throws VideoNotFoundException when video does not exist', async () => {
      const { service } = makeService({
        videoRepo: { findOne: jest.fn().mockResolvedValue(null) },
      });

      await expect(service.removeLike('user-id', 'nope')).rejects.toThrow(
        VideoNotFoundException,
      );
    });

    it('deletes the like and returns updated counts with userLike null', async () => {
      const video = makeVideo();
      const { service, likeRepo } = makeService({
        videoRepo: { findOne: jest.fn().mockResolvedValue(video) },
        likeRepo: {
          delete: jest.fn(),
          count: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0),
          findOne: jest.fn().mockResolvedValue(null),
        },
      });

      const result = await service.removeLike('user-id', 'abc123');

      expect(likeRepo.delete).toHaveBeenCalledWith({
        video_id: 'video-id',
        user_id: 'user-id',
      });
      expect(result.userLike).toBeNull();
    });
  });

  describe('getLikeStatus', () => {
    it('returns counts with isSubscribed false when userId is null', async () => {
      const video = makeVideo();
      const { service } = makeService({
        videoRepo: { findOne: jest.fn().mockResolvedValue(video) },
        likeRepo: {
          count: jest.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(2),
          findOne: jest.fn(),
        },
      });

      const result = await service.getLikeStatus('abc123', null);

      expect(result.likes).toBe(5);
      expect(result.dislikes).toBe(2);
      expect(result.userLike).toBeNull();
    });
  });
});
