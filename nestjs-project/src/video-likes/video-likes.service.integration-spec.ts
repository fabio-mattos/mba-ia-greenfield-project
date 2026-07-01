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
import { LikeType, VideoLike } from './entities/video-like.entity';
import { VideoLikesService } from './video-likes.service';

const ALL_ENTITIES = [User, Channel, Category, Video, VideoLike];

describe('VideoLikesService (integration)', () => {
  let dataSource: DataSource;
  let service: VideoLikesService;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;
  let videoRepository: Repository<Video>;
  let likeRepository: Repository<VideoLike>;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    videoRepository = dataSource.getRepository(Video);
    likeRepository = dataSource.getRepository(VideoLike);
    service = new VideoLikesService(likeRepository, videoRepository);
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
        email: `video_likes_${counter}@example.com`,
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

  describe('upsertLike', () => {
    it('creates a like and reflects it in the counts', async () => {
      const video = await createVideo();
      const user = await createUser();

      const result = await service.upsertLike(
        user.id,
        video.slug,
        LikeType.LIKE,
      );

      expect(result).toEqual({
        likes: 1,
        dislikes: 0,
        userLike: LikeType.LIKE,
      });
    });

    it('switches like to dislike on a second call (upsert, not duplicate)', async () => {
      const video = await createVideo();
      const user = await createUser();

      await service.upsertLike(user.id, video.slug, LikeType.LIKE);
      const result = await service.upsertLike(
        user.id,
        video.slug,
        LikeType.DISLIKE,
      );

      expect(result).toEqual({
        likes: 0,
        dislikes: 1,
        userLike: LikeType.DISLIKE,
      });
      const rows = await likeRepository.find({
        where: { video_id: video.id, user_id: user.id },
      });
      expect(rows).toHaveLength(1);
    });

    it('throws VideoNotFoundException for an unknown slug', async () => {
      const user = await createUser();

      await expect(
        service.upsertLike(user.id, 'does-not-exist', LikeType.LIKE),
      ).rejects.toThrow('Video not found');
    });
  });

  describe('getLikeStatus', () => {
    it('returns aggregate counts and null userLike for an anonymous requester', async () => {
      const video = await createVideo();
      const liker = await createUser();
      await service.upsertLike(liker.id, video.slug, LikeType.LIKE);

      const status = await service.getLikeStatus(video.slug, null);

      expect(status).toEqual({ likes: 1, dislikes: 0, userLike: null });
    });

    it("returns the requesting user's own reaction", async () => {
      const video = await createVideo();
      const liker = await createUser();
      await service.upsertLike(liker.id, video.slug, LikeType.DISLIKE);

      const status = await service.getLikeStatus(video.slug, liker.id);

      expect(status.userLike).toBe(LikeType.DISLIKE);
    });
  });

  describe('removeLike', () => {
    it('removes the reaction and the counts drop', async () => {
      const video = await createVideo();
      const user = await createUser();
      await service.upsertLike(user.id, video.slug, LikeType.LIKE);

      const result = await service.removeLike(user.id, video.slug);

      expect(result).toEqual({ likes: 0, dislikes: 0, userLike: null });
      const rows = await likeRepository.find({
        where: { video_id: video.id, user_id: user.id },
      });
      expect(rows).toHaveLength(0);
    });
  });
});
