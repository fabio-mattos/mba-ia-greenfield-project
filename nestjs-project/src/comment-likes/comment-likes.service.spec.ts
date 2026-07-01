import { CommentNotFoundException } from '../common/exceptions/domain.exception';
import { CommentLikeType } from './entities/comment-like.entity';
import { CommentLikesService } from './comment-likes.service';

function makeCommentLikeRepo(overrides: Record<string, jest.Mock> = {}) {
  const qb = {
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orUpdate: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({}),
  };
  return {
    findOne: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    delete: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    ...overrides,
  };
}

function makeCommentRepo(overrides: Record<string, jest.Mock> = {}) {
  return { findOne: jest.fn(), ...overrides };
}

function makeComment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'comment-id',
    body: 'Test comment',
    author_id: 'user-id',
    video_id: 'video-id',
    parent_id: null,
    deleted: false,
    ...overrides,
  };
}

function makeService(
  options: {
    commentLikeRepo?: Record<string, jest.Mock>;
    commentRepo?: Record<string, jest.Mock>;
  } = {},
) {
  const likeRepo = makeCommentLikeRepo(options.commentLikeRepo);
  const commentRepo = makeCommentRepo(options.commentRepo);
  const service = new CommentLikesService(likeRepo as any, commentRepo as any);
  return { service, likeRepo, commentRepo };
}

describe('CommentLikesService', () => {
  describe('upsertLike', () => {
    it('throws CommentNotFoundException when comment does not exist', async () => {
      const { service } = makeService({
        commentRepo: { findOne: jest.fn().mockResolvedValue(null) },
      });

      await expect(
        service.upsertLike('user-id', 'nope', CommentLikeType.LIKE),
      ).rejects.toThrow(CommentNotFoundException);
    });

    it('inserts or updates a like and returns counts', async () => {
      const comment = makeComment();
      const qb = {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orUpdate: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      };
      const { service } = makeService({
        commentRepo: { findOne: jest.fn().mockResolvedValue(comment) },
        commentLikeRepo: {
          count: jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(0),
          findOne: jest.fn().mockResolvedValue({ type: CommentLikeType.LIKE }),
          createQueryBuilder: jest.fn().mockReturnValue(qb),
        },
      });

      const result = await service.upsertLike(
        'user-id',
        'comment-id',
        CommentLikeType.LIKE,
      );

      expect(result.likes).toBe(2);
      expect(result.dislikes).toBe(0);
      expect(result.userLike).toBe(CommentLikeType.LIKE);
    });
  });

  describe('removeLike', () => {
    it('throws CommentNotFoundException when comment does not exist', async () => {
      const { service } = makeService({
        commentRepo: { findOne: jest.fn().mockResolvedValue(null) },
      });

      await expect(service.removeLike('user-id', 'nope')).rejects.toThrow(
        CommentNotFoundException,
      );
    });

    it('deletes the like and returns userLike null', async () => {
      const comment = makeComment();
      const { service, likeRepo } = makeService({
        commentRepo: { findOne: jest.fn().mockResolvedValue(comment) },
        commentLikeRepo: {
          delete: jest.fn(),
          count: jest.fn().mockResolvedValue(0),
          findOne: jest.fn().mockResolvedValue(null),
        },
      });

      const result = await service.removeLike('user-id', 'comment-id');

      expect(likeRepo.delete).toHaveBeenCalledWith({
        comment_id: 'comment-id',
        user_id: 'user-id',
      });
      expect(result.userLike).toBeNull();
    });
  });

  describe('getLikeStatus', () => {
    it('throws CommentNotFoundException when comment does not exist', async () => {
      const { service } = makeService({
        commentRepo: { findOne: jest.fn().mockResolvedValue(null) },
      });

      await expect(service.getLikeStatus('nope', null)).rejects.toThrow(
        CommentNotFoundException,
      );
    });

    it('returns counts with userLike null when userId is null', async () => {
      const comment = makeComment();
      const { service } = makeService({
        commentRepo: { findOne: jest.fn().mockResolvedValue(comment) },
        commentLikeRepo: {
          count: jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(1),
          findOne: jest.fn(),
        },
      });

      const result = await service.getLikeStatus('comment-id', null);

      expect(result.likes).toBe(3);
      expect(result.dislikes).toBe(1);
      expect(result.userLike).toBeNull();
    });

    it('returns userLike when user has reacted', async () => {
      const comment = makeComment();
      const { service } = makeService({
        commentRepo: { findOne: jest.fn().mockResolvedValue(comment) },
        commentLikeRepo: {
          count: jest.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(2),
          findOne: jest
            .fn()
            .mockResolvedValue({ type: CommentLikeType.DISLIKE }),
        },
      });

      const result = await service.getLikeStatus('comment-id', 'user-id');

      expect(result.userLike).toBe(CommentLikeType.DISLIKE);
    });
  });
});
