import { DataSource, Repository } from 'typeorm';
import { Channel } from '../../channels/entities/channel.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../../test/create-test-data-source';
import { User } from '../../users/entities/user.entity';
import { Video, VideoStatus } from './video.entity';

const ALL_ENTITIES = [User, Channel, Video];

describe('Video entity (integration)', () => {
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;
  let videoRepository: Repository<Video>;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    videoRepository = dataSource.getRepository(Video);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  let counter = 0;
  async function createChannel(): Promise<Channel> {
    const suffix = ++counter;
    const user = await userRepository.save(
      userRepository.create({
        email: `video_user_${suffix}@example.com`,
        password: 'hashed',
      }),
    );
    return channelRepository.save(
      channelRepository.create({
        name: `Channel ${suffix}`,
        nickname: `chan${suffix}`,
        user_id: user.id,
      }),
    );
  }

  function baseVideoData(channelId: string) {
    return {
      channel_id: channelId,
      title: 'My video',
      original_file_key: 'videos/abc/original.mp4',
      original_file_name: 'my-video.mp4',
      file_size_bytes: '1000000',
    };
  }

  it('requires a channel_id (foreign key to channels)', async () => {
    await expect(
      videoRepository.save(
        videoRepository.create({
          title: 'No channel',
          original_file_key: 'videos/x/original.mp4',
          original_file_name: 'x.mp4',
          file_size_bytes: '100',
        } as Partial<Video>),
      ),
    ).rejects.toThrow();
  });

  it('rejects a channel_id that does not reference an existing channel', async () => {
    await expect(
      videoRepository.save(
        videoRepository.create({
          ...baseVideoData('00000000-0000-0000-0000-000000000000'),
        }),
      ),
    ).rejects.toThrow();
  });

  it('defaults status to draft', async () => {
    const channel = await createChannel();
    const video = await videoRepository.save(
      videoRepository.create(baseVideoData(channel.id)),
    );

    expect(video.status).toBe(VideoStatus.DRAFT);
  });

  it('rejects an invalid status value', async () => {
    const channel = await createChannel();

    await expect(
      dataSource.query(
        `INSERT INTO "videos" ("channel_id", "title", "status", "original_file_key", "original_file_name", "file_size_bytes")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          channel.id,
          'Bad status',
          'not-a-real-status',
          'videos/x/o.mp4',
          'x.mp4',
          '100',
        ],
      ),
    ).rejects.toThrow();
  });

  it('allows metadata fields to be null until processed', async () => {
    const channel = await createChannel();
    const video = await videoRepository.save(
      videoRepository.create(baseVideoData(channel.id)),
    );

    expect(video.duration_in_seconds).toBeNull();
    expect(video.width).toBeNull();
    expect(video.height).toBeNull();
    expect(video.codec).toBeNull();
    expect(video.container).toBeNull();
    expect(video.bitrate_kbps).toBeNull();
    expect(video.thumbnail_key).toBeNull();
    expect(video.failure_reason).toBeNull();
  });

  it('cascades delete when the owning channel is removed', async () => {
    const channel = await createChannel();
    const video = await videoRepository.save(
      videoRepository.create(baseVideoData(channel.id)),
    );

    await channelRepository.delete({ id: channel.id });

    const found = await videoRepository.findOne({ where: { id: video.id } });
    expect(found).toBeNull();
  });

  it('loads the related channel via the ManyToOne relation', async () => {
    const channel = await createChannel();
    const video = await videoRepository.save(
      videoRepository.create(baseVideoData(channel.id)),
    );

    const found = await videoRepository.findOne({
      where: { id: video.id },
      relations: ['channel'],
    });

    expect(found?.channel.nickname).toBe(channel.nickname);
  });
});
