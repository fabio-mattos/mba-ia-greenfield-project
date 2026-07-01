import {
  CommentNestingNotAllowedException,
  CommentNotFoundException,
  NotCommentAuthorException,
  VideoNotFoundException,
} from '../common/exceptions/domain.exception';
import { CommentsService } from './comments.service';

function makeCommentRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    ...overrides,
  };
}

function makeVideoRepo(overrides: Record<string, jest.Mock> = {}) {
  return {
    findOne: jest.fn(),
    ...overrides,
  };
}

function makeVideo(id = 'video-id') {
  return {
    id,
    slug: 'abc123',
    title: 'Test',
    channel_id: 'chan',
    status: 'ready',
  };
}

function makeComment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'comment-id',
    body: 'Test comment',
    author_id: 'user-id',
    video_id: 'video-id',
    parent_id: null,
    deleted: false,
    created_at: new Date(),
    updated_at: new Date(),
    author: { id: 'user-id', email: 'test@test.com' },
    ...overrides,
  };
}

function makeService(
  options: {
    commentRepo?: Record<string, jest.Mock>;
    videoRepo?: Record<string, jest.Mock>;
  } = {},
) {
  const commentRepo = makeCommentRepo(options.commentRepo);
  const videoRepo = makeVideoRepo(options.videoRepo);
  const service = new CommentsService(commentRepo as any, videoRepo as any);
  return { service, commentRepo, videoRepo };
}

describe('CommentsService', () => {
  describe('createComment', () => {
    it('creates top-level comment when video exists', async () => {
      const video = makeVideo();
      const comment = makeComment();
      const { service, commentRepo, videoRepo } = makeService({
        videoRepo: { findOne: jest.fn().mockResolvedValue(video) },
        commentRepo: {
          findOne: jest.fn().mockResolvedValue(comment),
          create: jest.fn().mockReturnValue(comment),
          save: jest.fn().mockResolvedValue(comment),
        },
      });

      const result = await service.createComment(
        'user-id',
        'abc123',
        'Test comment',
      );

      expect(videoRepo.findOne).toHaveBeenCalledWith({
        where: { slug: 'abc123' },
      });
      expect(commentRepo.save).toHaveBeenCalledTimes(1);
      expect(result.body).toBe('Test comment');
    });

    it('throws VideoNotFoundException when video does not exist', async () => {
      const { service } = makeService({
        videoRepo: { findOne: jest.fn().mockResolvedValue(null) },
      });

      await expect(
        service.createComment('user-id', 'nope', 'body'),
      ).rejects.toThrow(VideoNotFoundException);
    });

    it('throws CommentNestingNotAllowedException when parent already has a parent', async () => {
      const video = makeVideo();
      const parentComment = makeComment({ parent_id: 'grandparent-id' });
      const { service } = makeService({
        videoRepo: { findOne: jest.fn().mockResolvedValue(video) },
        commentRepo: { findOne: jest.fn().mockResolvedValue(parentComment) },
      });

      await expect(
        service.createComment('user-id', 'abc123', 'reply', 'parent-id'),
      ).rejects.toThrow(CommentNestingNotAllowedException);
    });

    it('throws CommentNotFoundException when parent does not exist', async () => {
      const video = makeVideo();
      const { service } = makeService({
        videoRepo: { findOne: jest.fn().mockResolvedValue(video) },
        commentRepo: { findOne: jest.fn().mockResolvedValue(null) },
      });

      await expect(
        service.createComment(
          'user-id',
          'abc123',
          'reply',
          'nonexistent-parent',
        ),
      ).rejects.toThrow(CommentNotFoundException);
    });
  });

  describe('deleteComment', () => {
    it('soft-deletes comment when user is author', async () => {
      const comment = makeComment();
      const { service, commentRepo } = makeService({
        commentRepo: {
          findOne: jest.fn().mockResolvedValue(comment),
          update: jest.fn(),
        },
      });

      await service.deleteComment('user-id', 'comment-id');

      expect(commentRepo.update).toHaveBeenCalledWith('comment-id', {
        deleted: true,
        body: '[comentário removido]',
      });
    });

    it('throws CommentNotFoundException when comment does not exist', async () => {
      const { service } = makeService({
        commentRepo: { findOne: jest.fn().mockResolvedValue(null) },
      });

      await expect(service.deleteComment('user-id', 'nope')).rejects.toThrow(
        CommentNotFoundException,
      );
    });

    it('throws NotCommentAuthorException when user is not the author', async () => {
      const comment = makeComment({ author_id: 'other-user' });
      const { service } = makeService({
        commentRepo: { findOne: jest.fn().mockResolvedValue(comment) },
      });

      await expect(
        service.deleteComment('user-id', 'comment-id'),
      ).rejects.toThrow(NotCommentAuthorException);
    });
  });
});
