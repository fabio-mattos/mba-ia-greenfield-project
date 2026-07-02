import { DataSource, Repository } from 'typeorm';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { Channel } from '../channels/entities/channel.entity';
import { Category } from '../categories/entities/category.entity';
import { Video, VideoStatus, VideoVisibility } from './entities/video.entity';
import { VideosService } from './videos.service';

const ALL_ENTITIES = [User, Channel, Category, Video];

function makeStorageService() {
  return {
    getPresignedPutUrl: jest.fn(),
    getPresignedGetUrl: jest.fn(),
    getPresignedGetUrlWithDisposition: jest.fn(),
    putObject: jest.fn().mockResolvedValue(undefined),
    deleteObject: jest.fn().mockResolvedValue(undefined),
  };
}

function makeStorageConfig() {
  return {
    endpoint: 'minio',
    port: 9000,
    accessKey: 'x',
    secretKey: 'x',
    useSSL: false,
    bucketVideos: 'videos',
    bucketThumbnails: 'thumbnails',
    presignedUploadTtl: 7200,
    presignedStreamTtl: 21600,
  };
}

describe('VideosService (integration) — management endpoints', () => {
  let dataSource: DataSource;
  let videosService: VideosService;
  let videoRepository: Repository<Video>;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;
  let categoryRepository: Repository<Category>;
  let storageService: ReturnType<typeof makeStorageService>;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    videoRepository = dataSource.getRepository(Video);
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    categoryRepository = dataSource.getRepository(Category);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    storageService = makeStorageService();
    videosService = new VideosService(
      videoRepository,
      storageService as any,
      { enqueue: jest.fn() } as any,
      makeStorageConfig() as any,
    );
  });

  let counter = 0;

  async function createChannelWithUser(): Promise<Channel> {
    counter += 1;
    const user = await userRepository.save(
      userRepository.create({
        email: `videos_svc_${counter}@example.com`,
        password: 'hashed',
      }),
    );
    return channelRepository.save(
      channelRepository.create({
        name: `Channel ${counter}`,
        nickname: `channel${counter}`,
        user_id: user.id,
      }),
    );
  }

  async function createVideo(
    channelId: string,
    overrides: Partial<Video> = {},
  ): Promise<Video> {
    return videoRepository.save(
      videoRepository.create({
        slug: `slug${counter}${Math.random().toString(36).slice(2, 6)}`,
        channel_id: channelId,
        status: VideoStatus.DRAFT,
        ...overrides,
      }),
    );
  }

  describe('updateVideo', () => {
    it('updates title, description and category for the owning channel', async () => {
      const channel = await createChannelWithUser();
      const category = await categoryRepository.save(
        categoryRepository.create({ name: 'Tecnologia', slug: 'tecnologia' }),
      );
      const video = await createVideo(channel.id);

      const result = await videosService.updateVideo(video.id, channel.id, {
        title: 'New title',
        description: 'New description',
        category_id: category.id,
      });

      expect(result.title).toBe('New title');
      expect(result.description).toBe('New description');
      expect(result.category?.id).toBe(category.id);
    });

    it('throws NotVideoOwnerException when the channel does not own the video', async () => {
      const owner = await createChannelWithUser();
      const otherChannel = await createChannelWithUser();
      const video = await createVideo(owner.id);

      await expect(
        videosService.updateVideo(video.id, otherChannel.id, {
          title: 'Hijacked',
        }),
      ).rejects.toThrow('You do not own this video');
    });

    it('throws VideoNotFoundException for an unknown video id', async () => {
      const channel = await createChannelWithUser();

      await expect(
        videosService.updateVideo(
          '00000000-0000-0000-0000-000000000000',
          channel.id,
          { title: 'x' },
        ),
      ).rejects.toThrow('Video not found');
    });
  });

  describe('publishVideo', () => {
    it('sets visibility and published_at when the video is READY', async () => {
      const channel = await createChannelWithUser();
      const video = await createVideo(channel.id, {
        status: VideoStatus.READY,
      });

      const result = await videosService.publishVideo(video.id, channel.id, {
        visibility: VideoVisibility.PUBLIC,
      });

      expect(result.visibility).toBe(VideoVisibility.PUBLIC);
      expect(result.published_at).not.toBeNull();
    });

    it('throws VideoNotReadyException when the video is not READY', async () => {
      const channel = await createChannelWithUser();
      const video = await createVideo(channel.id, {
        status: VideoStatus.PROCESSING,
      });

      await expect(
        videosService.publishVideo(video.id, channel.id, {
          visibility: VideoVisibility.PUBLIC,
        }),
      ).rejects.toThrow('Video is not ready for streaming');
    });

    it('throws NotVideoOwnerException when the channel does not own the video', async () => {
      const owner = await createChannelWithUser();
      const otherChannel = await createChannelWithUser();
      const video = await createVideo(owner.id, { status: VideoStatus.READY });

      await expect(
        videosService.publishVideo(video.id, otherChannel.id, {
          visibility: VideoVisibility.PUBLIC,
        }),
      ).rejects.toThrow('You do not own this video');
    });
  });

  describe('deleteVideo', () => {
    it('removes the video row and deletes its storage objects', async () => {
      const channel = await createChannelWithUser();
      const video = await createVideo(channel.id, {
        file_key: 'uploads/x.mp4',
        thumbnail_key: 'thumbnails/x.jpg',
      });

      await videosService.deleteVideo(video.id, channel.id);

      const found = await videoRepository.findOne({ where: { id: video.id } });
      expect(found).toBeNull();
      expect(storageService.deleteObject).toHaveBeenCalledWith(
        'videos',
        'uploads/x.mp4',
      );
      expect(storageService.deleteObject).toHaveBeenCalledWith(
        'thumbnails',
        'thumbnails/x.jpg',
      );
    });

    it('throws NotVideoOwnerException when the channel does not own the video', async () => {
      const owner = await createChannelWithUser();
      const otherChannel = await createChannelWithUser();
      const video = await createVideo(owner.id);

      await expect(
        videosService.deleteVideo(video.id, otherChannel.id),
      ).rejects.toThrow('You do not own this video');

      const stillThere = await videoRepository.findOne({
        where: { id: video.id },
      });
      expect(stillThere).not.toBeNull();
    });
  });

  describe('listChannelVideos', () => {
    it('paginates videos for the given channel ordered by newest first', async () => {
      const channel = await createChannelWithUser();
      const other = await createChannelWithUser();
      await createVideo(channel.id, { title: 'First' });
      await createVideo(channel.id, { title: 'Second' });
      await createVideo(other.id, { title: 'Not mine' });

      const result = await videosService.listChannelVideos(channel.id, 1, 10);

      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.data.every((v) => v.title !== 'Not mine')).toBe(true);
    });
  });

  describe('visibility access control (findBySlug / getStreamUrl / getDownloadUrl)', () => {
    it('findBySlug returns a published public video for an anonymous requester', async () => {
      const channel = await createChannelWithUser();
      const video = await createVideo(channel.id, {
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
      });

      const result = await videosService.findBySlug(video.slug, null);

      expect(result.id).toBe(video.id);
    });

    it('findBySlug returns a published unlisted video for an anonymous requester', async () => {
      const channel = await createChannelWithUser();
      const video = await createVideo(channel.id, {
        status: VideoStatus.READY,
        visibility: VideoVisibility.UNLISTED,
      });

      const result = await videosService.findBySlug(video.slug, null);

      expect(result.id).toBe(video.id);
    });

    it('findBySlug returns a draft video to its owner', async () => {
      const channel = await createChannelWithUser();
      const video = await createVideo(channel.id, {
        status: VideoStatus.DRAFT,
      });

      const result = await videosService.findBySlug(
        video.slug,
        channel.user_id,
      );

      expect(result.id).toBe(video.id);
    });

    it('findBySlug throws VideoNotFoundException for an anonymous requester when the video is a draft', async () => {
      const channel = await createChannelWithUser();
      const video = await createVideo(channel.id, {
        status: VideoStatus.DRAFT,
      });

      await expect(videosService.findBySlug(video.slug, null)).rejects.toThrow(
        'Video not found',
      );
    });

    it('findBySlug throws VideoNotFoundException for a different authenticated user', async () => {
      const owner = await createChannelWithUser();
      const stranger = await createChannelWithUser();
      const video = await createVideo(owner.id, { status: VideoStatus.DRAFT });

      await expect(
        videosService.findBySlug(video.slug, stranger.user_id),
      ).rejects.toThrow('Video not found');
    });

    it('getStreamUrl throws VideoNotFoundException for an anonymous requester when the video is a draft', async () => {
      const channel = await createChannelWithUser();
      const video = await createVideo(channel.id, {
        status: VideoStatus.DRAFT,
      });

      await expect(
        videosService.getStreamUrl(video.slug, null),
      ).rejects.toThrow('Video not found');
    });

    it('getStreamUrl returns a presigned url for the owner even when the video is a draft', async () => {
      const channel = await createChannelWithUser();
      const video = await createVideo(channel.id, {
        status: VideoStatus.DRAFT,
        file_key: 'uploads/x.mp4',
      });
      storageService.getPresignedGetUrl.mockResolvedValue(
        'https://minio/stream',
      );

      const url = await videosService.getStreamUrl(video.slug, channel.user_id);

      expect(url).toBe('https://minio/stream');
    });

    it('getDownloadUrl throws VideoNotFoundException for a different authenticated user', async () => {
      const owner = await createChannelWithUser();
      const stranger = await createChannelWithUser();
      const video = await createVideo(owner.id, { status: VideoStatus.DRAFT });

      await expect(
        videosService.getDownloadUrl(video.slug, stranger.user_id),
      ).rejects.toThrow('Video not found');
    });
  });

  describe('incrementViewCount', () => {
    it('atomically increments the view count for the video matching the slug', async () => {
      const channel = await createChannelWithUser();
      const video = await createVideo(channel.id, {
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
      });

      await videosService.incrementViewCount(video.slug);
      await videosService.incrementViewCount(video.slug);

      const updated = await videoRepository.findOne({
        where: { id: video.id },
      });
      expect(updated?.view_count).toBe(2);
    });
  });

  describe('getSuggestionsBySlug', () => {
    it('returns other READY/PUBLIC videos from the same category, excluding itself', async () => {
      const channel = await createChannelWithUser();
      const category = await categoryRepository.save(
        categoryRepository.create({ name: 'Música', slug: 'musica' }),
      );
      const source = await createVideo(channel.id, {
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
        category_id: category.id,
      });
      const sameCategory = await createVideo(channel.id, {
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
        category_id: category.id,
        published_at: new Date(),
      });
      await createVideo(channel.id, {
        status: VideoStatus.DRAFT,
        category_id: category.id,
      });

      const result = await videosService.getSuggestionsBySlug(source.slug, 10);

      expect(result.map((v) => v.id)).toEqual([sameCategory.id]);
    });
  });

  describe('listPublicVideos', () => {
    it('only returns READY/PUBLIC videos, ordered by published_at desc', async () => {
      const channel = await createChannelWithUser();
      const older = await createVideo(channel.id, {
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
        published_at: new Date('2026-01-01'),
      });
      const newer = await createVideo(channel.id, {
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
        published_at: new Date('2026-02-01'),
      });
      await createVideo(channel.id, { status: VideoStatus.DRAFT });
      await createVideo(channel.id, {
        status: VideoStatus.READY,
        visibility: VideoVisibility.UNLISTED,
        published_at: new Date('2026-03-01'),
      });

      const result = await videosService.listPublicVideos({
        page: 1,
        limit: 10,
      });

      expect(result.data.map((v) => v.id)).toEqual([newer.id, older.id]);
      expect(result.total).toBe(2);
    });

    it('filters by search term matching title or channel nickname', async () => {
      const channel = await createChannelWithUser();
      const match = await createVideo(channel.id, {
        title: 'Learning TypeScript',
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
        published_at: new Date(),
      });
      await createVideo(channel.id, {
        title: 'Unrelated topic',
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
        published_at: new Date(),
      });

      const result = await videosService.listPublicVideos({
        search: 'typescript',
        page: 1,
        limit: 10,
      });

      expect(result.data.map((v) => v.id)).toEqual([match.id]);
    });

    it('filters by category slug', async () => {
      const channel = await createChannelWithUser();
      const category = await categoryRepository.save(
        categoryRepository.create({ name: 'Educação', slug: 'educacao' }),
      );
      const inCategory = await createVideo(channel.id, {
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
        category_id: category.id,
        published_at: new Date(),
      });
      await createVideo(channel.id, {
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
        published_at: new Date(),
      });

      const result = await videosService.listPublicVideos({
        categorySlug: 'educacao',
        page: 1,
        limit: 10,
      });

      expect(result.data.map((v) => v.id)).toEqual([inCategory.id]);
    });

    it('filters by channel nickname', async () => {
      const channelA = await createChannelWithUser();
      const channelB = await createChannelWithUser();
      const fromA = await createVideo(channelA.id, {
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
        published_at: new Date(),
      });
      await createVideo(channelB.id, {
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
        published_at: new Date(),
      });

      const result = await videosService.listPublicVideos({
        channelNickname: channelA.nickname,
        page: 1,
        limit: 10,
      });

      expect(result.data.map((v) => v.id)).toEqual([fromA.id]);
    });

    it('paginates results and computes total_pages', async () => {
      const channel = await createChannelWithUser();
      for (let i = 0; i < 3; i++) {
        await createVideo(channel.id, {
          status: VideoStatus.READY,
          visibility: VideoVisibility.PUBLIC,
          published_at: new Date(),
        });
      }

      const result = await videosService.listPublicVideos({
        page: 1,
        limit: 2,
      });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(3);
      expect(result.total_pages).toBe(2);
    });
  });
});
