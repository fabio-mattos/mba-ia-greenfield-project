import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { Job } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { Channel } from '../channels/entities/channel.entity';
import storageConfig from '../config/storage.config';
import { PROCESS_VIDEO_JOB } from '../queue/queue.constants';
import { StorageService } from '../storage/storage.service';
import { videoObjectKey } from '../storage/storage.constants';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { Video, VideoStatus } from '../videos/entities/video.entity';
import { FfmpegService } from './ffmpeg.service';
import {
  ProcessVideoJobData,
  VideoProcessingConsumer,
} from './video-processing.consumer';

const execFileAsync = promisify(execFile);

const ALL_ENTITIES = [User, Channel, Video];

describe('VideoProcessingConsumer (integration)', () => {
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;
  let videoRepository: Repository<Video>;
  let storageService: StorageService;
  let consumer: VideoProcessingConsumer;
  let tmpDir: string;
  let fixtureVideoPath: string;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    videoRepository = dataSource.getRepository(Video);
    storageService = new StorageService(storageConfig());
    await storageService.ensureBucketExists();
    consumer = new VideoProcessingConsumer(
      videoRepository,
      storageService,
      new FfmpegService(),
    );

    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'consumer-int-'));
    fixtureVideoPath = path.join(tmpDir, 'fixture.mp4');
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=2:size=320x240:rate=10',
      '-pix_fmt',
      'yuv420p',
      fixtureVideoPath,
    ]);
  }, 40000);

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    storageService.destroy();
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  let counter = 0;
  async function createDraftVideo(): Promise<Video> {
    const suffix = ++counter;
    const user = await userRepository.save(
      userRepository.create({
        email: `consumer_int_${suffix}@example.com`,
        password: 'hashed',
      }),
    );
    const channel = await channelRepository.save(
      channelRepository.create({
        name: `Channel ${suffix}`,
        nickname: `cchan${suffix}`,
        user_id: user.id,
      }),
    );
    const key = videoObjectKey(`fixture-${suffix}`, '.mp4');
    const fileBuffer = await fs.readFile(fixtureVideoPath);
    await storageService.putObject(key, fileBuffer, 'video/mp4');

    return videoRepository.save(
      videoRepository.create({
        channel_id: channel.id,
        title: 'Consumer integration test video',
        status: VideoStatus.PROCESSING,
        original_file_key: key,
        original_file_name: 'fixture.mp4',
        file_size_bytes: String(fileBuffer.length),
      }),
    );
  }

  function makeJob(videoId: string): Job<ProcessVideoJobData> {
    return {
      name: PROCESS_VIDEO_JOB,
      data: { videoId },
      attemptsMade: 1,
      opts: { attempts: 3 },
    } as unknown as Job<ProcessVideoJobData>;
  }

  it('processes a real video end-to-end: metadata, thumbnail, status ready', async () => {
    const video = await createDraftVideo();

    await consumer.process(makeJob(video.id));

    const persisted = await videoRepository.findOneByOrFail({ id: video.id });
    expect(persisted.status).toBe(VideoStatus.READY);
    expect(persisted.duration_in_seconds).toBeGreaterThan(1);
    expect(persisted.width).toBe(320);
    expect(persisted.height).toBe(240);
    expect(persisted.codec).toBeTruthy();
    expect(persisted.thumbnail_key).toBe(`videos/${video.id}/thumbnail.jpg`);

    const thumbnailStream = await storageService.getObjectStream(
      persisted.thumbnail_key!,
    );
    expect(thumbnailStream).toBeDefined();
  }, 30000);
});
