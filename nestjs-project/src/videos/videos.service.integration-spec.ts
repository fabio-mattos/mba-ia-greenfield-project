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
});
