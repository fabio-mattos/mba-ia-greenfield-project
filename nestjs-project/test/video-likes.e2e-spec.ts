import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { cleanAllTables } from '../src/test/create-test-data-source';
import { User } from '../src/users/entities/user.entity';
import { Channel } from '../src/channels/entities/channel.entity';
import {
  Video,
  VideoStatus,
  VideoVisibility,
} from '../src/videos/entities/video.entity';

describe('Video likes (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;
  let videoRepository: Repository<Video>;
  let throttlerStorage: ThrottlerStorageService;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(
      new DomainExceptionFilter(),
      new ValidationExceptionFilter(),
    );
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    videoRepository = dataSource.getRepository(Video);
    throttlerStorage =
      moduleFixture.get<ThrottlerStorageService>(ThrottlerStorage);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    throttlerStorage.storage.clear();
  });

  async function captureConfirmationToken(
    email: string,
    password = 'password123',
  ): Promise<string> {
    const authService = app.get(AuthService);
    const mailServiceInstance = (authService as any).mailService;
    let capturedToken = '';
    jest
      .spyOn(mailServiceInstance, 'sendConfirmationEmail')
      .mockImplementationOnce(async (_e: string, _n: string, t: string) => {
        capturedToken = t;
      });
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password });
    return capturedToken;
  }

  async function registerConfirmAndLogin(
    email: string,
    password = 'password123',
  ): Promise<{ accessToken: string; channelId: string }> {
    const token = await captureConfirmationToken(email, password);
    await request(app.getHttpServer())
      .get('/auth/confirm-email')
      .query({ token });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });

    const user = await userRepository.findOneOrFail({ where: { email } });
    const channel = await channelRepository.findOneOrFail({
      where: { user_id: user.id },
    });

    return { accessToken: loginRes.body.access_token, channelId: channel.id };
  }

  async function createVideo(channelId: string): Promise<Video> {
    return videoRepository.save(
      videoRepository.create({
        slug: `lvid${Math.random().toString(36).slice(2, 8)}`,
        channel_id: channelId,
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
      }),
    );
  }

  describe('GET /videos/:slug/like-status', () => {
    it('returns counts with userLike null for an anonymous requester', async () => {
      const { channelId } = await registerConfirmAndLogin(
        'likes-anon@example.com',
      );
      const video = await createVideo(channelId);

      const res = await request(app.getHttpServer())
        .get(`/videos/${video.slug}/like-status`)
        .expect(200);

      expect(res.body).toEqual({ likes: 0, dislikes: 0, userLike: null });
    });

    it("reflects the authenticated user's own reaction (guard optional-auth fix)", async () => {
      const { accessToken } = await registerConfirmAndLogin(
        'likes-liker@example.com',
      );
      const owner = await registerConfirmAndLogin('likes-owner@example.com');
      const video = await createVideo(owner.channelId);

      await request(app.getHttpServer())
        .post(`/videos/${video.slug}/like`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/videos/${video.slug}/like-status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toEqual({ likes: 1, dislikes: 0, userLike: 'like' });
    });
  });

  describe('POST /videos/:slug/like and /dislike', () => {
    it('returns 401 without an Authorization header', async () => {
      const { channelId } = await registerConfirmAndLogin(
        'likes-401@example.com',
      );
      const video = await createVideo(channelId);

      await request(app.getHttpServer())
        .post(`/videos/${video.slug}/like`)
        .expect(401);
    });

    it('replaces a like with a dislike on the same video', async () => {
      const { accessToken } = await registerConfirmAndLogin(
        'likes-switch@example.com',
      );
      const owner = await registerConfirmAndLogin(
        'likes-switch-owner@example.com',
      );
      const video = await createVideo(owner.channelId);

      await request(app.getHttpServer())
        .post(`/videos/${video.slug}/like`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);
      const res = await request(app.getHttpServer())
        .post(`/videos/${video.slug}/dislike`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      expect(res.body).toEqual({
        likes: 0,
        dislikes: 1,
        userLike: 'dislike',
      });
    });
  });

  describe('DELETE /videos/:slug/like', () => {
    it('returns 204 and removes the reaction', async () => {
      const { accessToken } = await registerConfirmAndLogin(
        'likes-remove@example.com',
      );
      const owner = await registerConfirmAndLogin(
        'likes-remove-owner@example.com',
      );
      const video = await createVideo(owner.channelId);
      await request(app.getHttpServer())
        .post(`/videos/${video.slug}/like`)
        .set('Authorization', `Bearer ${accessToken}`);

      await request(app.getHttpServer())
        .delete(`/videos/${video.slug}/like`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      const res = await request(app.getHttpServer()).get(
        `/videos/${video.slug}/like-status`,
      );
      expect(res.body.likes).toBe(0);
    });
  });
});
