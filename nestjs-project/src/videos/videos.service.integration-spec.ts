import { Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { Channel } from '../channels/entities/channel.entity';
import { ChannelsService } from '../channels/channels.service';
import queueConfig from '../config/queue.config';
import storageConfig from '../config/storage.config';
import {
  VideoNotFoundException,
  VideoNotReadyException,
  VideoUploadAlreadyCompletedException,
  VideoUploadNotInProgressException,
} from '../common/exceptions/domain.exception';
import { VIDEO_PROCESSING_QUEUE } from '../queue/queue.constants';
import { StorageService } from '../storage/storage.service';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { Video, VideoStatus } from './entities/video.entity';
import { VideosService } from './videos.service';

const ALL_ENTITIES = [User, Channel, Video];

describe('VideosService (integration)', () => {
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;
  let videoRepository: Repository<Video>;
  let videosService: VideosService;
  let channelsService: ChannelsService;
  let storageService: StorageService;
  let videoProcessingQueue: Queue;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    videoRepository = dataSource.getRepository(Video);
    channelsService = new ChannelsService(dataSource);
    storageService = new StorageService(storageConfig());
    await storageService.ensureBucketExists();
    const qConfig = queueConfig();
    videoProcessingQueue = new Queue(VIDEO_PROCESSING_QUEUE, {
      connection: { host: qConfig.host, port: qConfig.port },
    });
    videosService = new VideosService(
      videoRepository,
      channelsService,
      storageService,
      videoProcessingQueue,
    );
  }, 30000);

  afterAll(async () => {
    await videoProcessingQueue.obliterate({ force: true });
    await videoProcessingQueue.close();
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
        email: `videos_svc_${suffix}@example.com`,
        password: 'hashed',
      }),
    );
    return channelRepository.save(
      channelRepository.create({
        name: `Channel ${suffix}`,
        nickname: `vchan${suffix}`,
        user_id: user.id,
      }),
    );
  }

  describe('initiateUpload', () => {
    it('persists a draft video row with a real multipart uploadId', async () => {
      const channel = await createChannel();

      const result = await videosService.initiateUpload(channel.user_id, {
        title: 'Integration test video',
        originalFileName: 'clip.mp4',
        fileSizeBytes: 12345,
        mimeType: 'video/mp4',
      });

      expect(result.videoId).toBeDefined();
      expect(result.uploadId).toBeTruthy();

      const persisted = await videoRepository.findOneBy({
        id: result.videoId,
      });
      expect(persisted).not.toBeNull();
      expect(persisted!.status).toBe(VideoStatus.DRAFT);
      expect(persisted!.channel_id).toBe(channel.id);
      expect(persisted!.upload_id).toBe(result.uploadId);
      expect(persisted!.original_file_key).toBe(
        `videos/${result.videoId}/original.mp4`,
      );
    }, 15000);
  });

  describe('getUploadPartUrl + completeUpload', () => {
    async function initiate(channel: Channel) {
      return videosService.initiateUpload(channel.user_id, {
        title: 'Part upload test',
        originalFileName: 'clip.mp4',
        fileSizeBytes: 1000,
        mimeType: 'video/mp4',
      });
    }

    it('completes the upload, flips status to processing, and enqueues a job', async () => {
      const channel = await createChannel();
      const { videoId, uploadId } = await initiate(channel);

      const partUrl = await videosService.getUploadPartUrl(
        channel.user_id,
        videoId,
        1,
      );
      expect(partUrl).toContain(uploadId);

      const putResponse = await fetch(partUrl, {
        method: 'PUT',
        body: 'hello',
      });
      const etag = putResponse.headers.get('etag')!;

      await videosService.completeUpload(channel.user_id, videoId, [
        { partNumber: 1, etag },
      ]);

      const persisted = await videoRepository.findOneBy({ id: videoId });
      expect(persisted!.status).toBe(VideoStatus.PROCESSING);

      const jobs = await videoProcessingQueue.getJobs(['waiting', 'active']);
      expect(
        jobs.some((j) => (j.data as { videoId: string }).videoId === videoId),
      ).toBe(true);
    }, 20000);

    it('throws VideoUploadAlreadyCompletedException on a second complete call', async () => {
      const channel = await createChannel();
      const { videoId } = await initiate(channel);
      const partUrl = await videosService.getUploadPartUrl(
        channel.user_id,
        videoId,
        1,
      );
      const putResponse = await fetch(partUrl, { method: 'PUT', body: 'x' });
      const etag = putResponse.headers.get('etag')!;
      await videosService.completeUpload(channel.user_id, videoId, [
        { partNumber: 1, etag },
      ]);

      await expect(
        videosService.completeUpload(channel.user_id, videoId, [
          { partNumber: 1, etag },
        ]),
      ).rejects.toThrow(VideoUploadAlreadyCompletedException);
    }, 20000);

    it('throws VideoNotFoundException for a non-owner', async () => {
      const owner = await createChannel();
      const other = await createChannel();
      const { videoId } = await initiate(owner);

      await expect(
        videosService.getUploadPartUrl(other.user_id, videoId, 1),
      ).rejects.toThrow(VideoNotFoundException);
    }, 15000);

    it('throws VideoUploadNotInProgressException once processing has started', async () => {
      const channel = await createChannel();
      const { videoId } = await initiate(channel);
      const partUrl = await videosService.getUploadPartUrl(
        channel.user_id,
        videoId,
        1,
      );
      const putResponse = await fetch(partUrl, { method: 'PUT', body: 'x' });
      const etag = putResponse.headers.get('etag')!;
      await videosService.completeUpload(channel.user_id, videoId, [
        { partNumber: 1, etag },
      ]);

      await expect(
        videosService.getUploadPartUrl(channel.user_id, videoId, 2),
      ).rejects.toThrow(VideoUploadNotInProgressException);
    }, 20000);
  });

  describe('findForViewer', () => {
    it('lets the owner see a draft video', async () => {
      const channel = await createChannel();
      const { videoId } = await videosService.initiateUpload(channel.user_id, {
        title: 'Owner viewable',
        originalFileName: 'clip.mp4',
        fileSizeBytes: 1000,
        mimeType: 'video/mp4',
      });

      const result = await videosService.findForViewer(
        videoId,
        channel.user_id,
      );
      expect(result.status).toBe(VideoStatus.DRAFT);
    }, 15000);

    it('throws VideoNotFoundException for a non-owner viewing a draft video', async () => {
      const owner = await createChannel();
      const other = await createChannel();
      const { videoId } = await videosService.initiateUpload(owner.user_id, {
        title: 'Owner only',
        originalFileName: 'clip.mp4',
        fileSizeBytes: 1000,
        mimeType: 'video/mp4',
      });

      await expect(
        videosService.findForViewer(videoId, other.user_id),
      ).rejects.toThrow(VideoNotFoundException);
    }, 15000);

    it('lets an anonymous viewer see a ready video', async () => {
      const channel = await createChannel();
      const { videoId } = await videosService.initiateUpload(channel.user_id, {
        title: 'Public once ready',
        originalFileName: 'clip.mp4',
        fileSizeBytes: 1000,
        mimeType: 'video/mp4',
      });
      await videoRepository.update(videoId, { status: VideoStatus.READY });

      const result = await videosService.findForViewer(videoId, undefined);
      expect(result.status).toBe(VideoStatus.READY);
    }, 15000);
  });

  describe('getStreamUrl + getDownloadUrl', () => {
    async function createReadyVideo() {
      const channel = await createChannel();
      const { videoId } = await videosService.initiateUpload(channel.user_id, {
        title: 'Streamable video',
        originalFileName: 'clip.mp4',
        fileSizeBytes: 1000,
        mimeType: 'video/mp4',
      });
      await videoRepository.update(videoId, { status: VideoStatus.READY });
      return { channel, videoId };
    }

    it('returns a presigned inline URL for an anonymous viewer once ready', async () => {
      const { videoId } = await createReadyVideo();

      const url = await videosService.getStreamUrl(videoId, undefined);

      expect(url).toContain('http');
      expect(url).not.toContain('response-content-disposition');
    }, 15000);

    it('returns a presigned attachment URL for the download endpoint', async () => {
      const { videoId } = await createReadyVideo();

      const url = await videosService.getDownloadUrl(videoId, undefined);

      expect(url.toLowerCase()).toContain('response-content-disposition');
    }, 15000);

    it('throws VideoNotReadyException for the owner when the video is still processing', async () => {
      const channel = await createChannel();
      const { videoId } = await videosService.initiateUpload(channel.user_id, {
        title: 'Not ready yet',
        originalFileName: 'clip.mp4',
        fileSizeBytes: 1000,
        mimeType: 'video/mp4',
      });

      await expect(
        videosService.getStreamUrl(videoId, channel.user_id),
      ).rejects.toThrow(VideoNotReadyException);
      await expect(
        videosService.getDownloadUrl(videoId, channel.user_id),
      ).rejects.toThrow(VideoNotReadyException);
    }, 15000);

    it('throws VideoNotFoundException for a non-owner when the video is still processing', async () => {
      const owner = await createChannel();
      const other = await createChannel();
      const { videoId } = await videosService.initiateUpload(owner.user_id, {
        title: 'Owner only',
        originalFileName: 'clip.mp4',
        fileSizeBytes: 1000,
        mimeType: 'video/mp4',
      });

      await expect(
        videosService.getStreamUrl(videoId, other.user_id),
      ).rejects.toThrow(VideoNotFoundException);
    }, 15000);
  });
});
