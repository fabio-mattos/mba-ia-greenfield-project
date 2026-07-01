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
import { Comment } from '../comments/entities/comment.entity';
import { CommentLike, CommentLikeType } from './entities/comment-like.entity';
import { CommentLikesService } from './comment-likes.service';

const ALL_ENTITIES = [User, Channel, Category, Video, Comment, CommentLike];

describe('CommentLikesService (integration)', () => {
  let dataSource: DataSource;
  let service: CommentLikesService;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;
  let videoRepository: Repository<Video>;
  let commentRepository: Repository<Comment>;
  let commentLikeRepository: Repository<CommentLike>;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    videoRepository = dataSource.getRepository(Video);
    commentRepository = dataSource.getRepository(Comment);
    commentLikeRepository = dataSource.getRepository(CommentLike);
    service = new CommentLikesService(commentLikeRepository, commentRepository);
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
        email: `comment_likes_${counter}@example.com`,
        password: 'hashed',
      }),
    );
  }

  async function createComment(): Promise<Comment> {
    counter += 1;
    const author = await createUser();
    const channel = await channelRepository.save(
      channelRepository.create({
        name: `Channel ${counter}`,
        nickname: `chan${counter}`,
        user_id: author.id,
      }),
    );
    const video = await videoRepository.save(
      videoRepository.create({
        slug: `slug${counter}`,
        channel_id: channel.id,
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
      }),
    );
    return commentRepository.save(
      commentRepository.create({
        body: 'A comment',
        video_id: video.id,
        author_id: author.id,
      }),
    );
  }

  describe('upsertLike', () => {
    it('creates a like and reflects it in the counts', async () => {
      const comment = await createComment();
      const user = await createUser();

      const result = await service.upsertLike(
        user.id,
        comment.id,
        CommentLikeType.LIKE,
      );

      expect(result).toEqual({
        likes: 1,
        dislikes: 0,
        userLike: CommentLikeType.LIKE,
      });
    });

    it('switches like to dislike on a second call', async () => {
      const comment = await createComment();
      const user = await createUser();
      await service.upsertLike(user.id, comment.id, CommentLikeType.LIKE);

      const result = await service.upsertLike(
        user.id,
        comment.id,
        CommentLikeType.DISLIKE,
      );

      expect(result).toEqual({
        likes: 0,
        dislikes: 1,
        userLike: CommentLikeType.DISLIKE,
      });
    });

    it('throws CommentNotFoundException for an unknown comment id', async () => {
      const user = await createUser();

      await expect(
        service.upsertLike(
          user.id,
          '00000000-0000-0000-0000-000000000000',
          CommentLikeType.LIKE,
        ),
      ).rejects.toThrow('Comment not found');
    });
  });

  describe('getLikeStatus', () => {
    it("returns the requesting user's own reaction", async () => {
      const comment = await createComment();
      const liker = await createUser();
      await service.upsertLike(liker.id, comment.id, CommentLikeType.LIKE);

      const status = await service.getLikeStatus(comment.id, liker.id);

      expect(status.userLike).toBe(CommentLikeType.LIKE);
    });

    it('returns null userLike for an anonymous requester', async () => {
      const comment = await createComment();
      const liker = await createUser();
      await service.upsertLike(liker.id, comment.id, CommentLikeType.LIKE);

      const status = await service.getLikeStatus(comment.id, null);

      expect(status).toEqual({ likes: 1, dislikes: 0, userLike: null });
    });
  });

  describe('removeLike', () => {
    it('removes the reaction and the counts drop', async () => {
      const comment = await createComment();
      const user = await createUser();
      await service.upsertLike(user.id, comment.id, CommentLikeType.LIKE);

      const result = await service.removeLike(user.id, comment.id);

      expect(result).toEqual({ likes: 0, dislikes: 0, userLike: null });
    });
  });
});
