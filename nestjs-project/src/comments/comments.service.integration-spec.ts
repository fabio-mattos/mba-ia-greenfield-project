import { DataSource, Repository } from 'typeorm';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { Channel } from '../channels/entities/channel.entity';
import { Category } from '../categories/entities/category.entity';
import {
  Video,
  VideoStatus,
  VideoVisibility,
} from '../videos/entities/video.entity';
import { Comment } from './entities/comment.entity';
import { CommentsService } from './comments.service';

const ALL_ENTITIES = [User, Channel, Category, Video, Comment];

describe('CommentsService (integration)', () => {
  let dataSource: DataSource;
  let service: CommentsService;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;
  let videoRepository: Repository<Video>;
  let commentRepository: Repository<Comment>;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    videoRepository = dataSource.getRepository(Video);
    commentRepository = dataSource.getRepository(Comment);
    service = new CommentsService(commentRepository, videoRepository);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  let counter = 0;

  async function createUser(): Promise<User> {
    counter += 1;
    return userRepository.save(
      userRepository.create({
        email: `comments_${counter}@example.com`,
        password: 'hashed',
      }),
    );
  }

  async function createVideo(): Promise<Video> {
    counter += 1;
    const user = await createUser();
    const channel = await channelRepository.save(
      channelRepository.create({
        name: `Channel ${counter}`,
        nickname: `chan${counter}`,
        user_id: user.id,
      }),
    );
    return videoRepository.save(
      videoRepository.create({
        slug: `slug${counter}`,
        channel_id: channel.id,
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
      }),
    );
  }

  describe('createComment', () => {
    it('creates a top-level comment', async () => {
      const video = await createVideo();
      const author = await createUser();

      const result = await service.createComment(
        author.id,
        video.slug,
        'Great video!',
      );

      expect(result.body).toBe('Great video!');
      expect(result.parent_id).toBeNull();
      expect(result.author.id).toBe(author.id);
    });

    it('creates a reply to a top-level comment', async () => {
      const video = await createVideo();
      const author = await createUser();
      const replier = await createUser();
      const parent = await service.createComment(
        author.id,
        video.slug,
        'Top level',
      );

      const reply = await service.createComment(
        replier.id,
        video.slug,
        'A reply',
        parent.id,
      );

      expect(reply.parent_id).toBe(parent.id);
    });

    it('throws CommentNestingNotAllowedException when replying to a reply', async () => {
      const video = await createVideo();
      const author = await createUser();
      const parent = await service.createComment(
        author.id,
        video.slug,
        'Top level',
      );
      const reply = await service.createComment(
        author.id,
        video.slug,
        'A reply',
        parent.id,
      );

      await expect(
        service.createComment(
          author.id,
          video.slug,
          'Reply to reply',
          reply.id,
        ),
      ).rejects.toThrow('Replies to replies are not allowed');
    });

    it('throws CommentNotFoundException for an unknown parent id', async () => {
      const video = await createVideo();
      const author = await createUser();

      await expect(
        service.createComment(
          author.id,
          video.slug,
          'x',
          '00000000-0000-0000-0000-000000000000',
        ),
      ).rejects.toThrow('Comment not found');
    });

    it('throws VideoNotFoundException for an unknown video slug', async () => {
      const author = await createUser();

      await expect(
        service.createComment(author.id, 'does-not-exist', 'x'),
      ).rejects.toThrow('Video not found');
    });
  });

  describe('listComments', () => {
    it('returns only top-level, non-deleted comments ordered newest first', async () => {
      const video = await createVideo();
      const author = await createUser();
      const first = await service.createComment(author.id, video.slug, 'First');
      const second = await service.createComment(
        author.id,
        video.slug,
        'Second',
      );
      await service.createComment(author.id, video.slug, 'A reply', first.id);
      await service.deleteComment(author.id, second.id);
      const third = await service.createComment(author.id, video.slug, 'Third');

      const result = await service.listComments(video.slug, 1, 10);

      expect(result.data.map((c) => c.id)).toEqual([third.id, first.id]);
    });
  });

  describe('listReplies', () => {
    it('returns replies ordered oldest first', async () => {
      const video = await createVideo();
      const author = await createUser();
      const parent = await service.createComment(
        author.id,
        video.slug,
        'Parent',
      );
      const reply1 = await service.createComment(
        author.id,
        video.slug,
        'Reply 1',
        parent.id,
      );
      const reply2 = await service.createComment(
        author.id,
        video.slug,
        'Reply 2',
        parent.id,
      );

      const result = await service.listReplies(parent.id, 1, 10);

      expect(result.data.map((c) => c.id)).toEqual([reply1.id, reply2.id]);
    });
  });

  describe('deleteComment', () => {
    it('soft-deletes the comment (marks deleted, replaces body)', async () => {
      const video = await createVideo();
      const author = await createUser();
      const comment = await service.createComment(
        author.id,
        video.slug,
        'To be removed',
      );

      await service.deleteComment(author.id, comment.id);

      const updated = await commentRepository.findOne({
        where: { id: comment.id },
      });
      expect(updated?.deleted).toBe(true);
      expect(updated?.body).toBe('[comentário removido]');
    });

    it('throws NotCommentAuthorException when the requester did not write the comment', async () => {
      const video = await createVideo();
      const author = await createUser();
      const stranger = await createUser();
      const comment = await service.createComment(
        author.id,
        video.slug,
        'Mine',
      );

      await expect(
        service.deleteComment(stranger.id, comment.id),
      ).rejects.toThrow('You did not write this comment');
    });
  });
});
