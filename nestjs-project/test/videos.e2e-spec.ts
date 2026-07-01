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
import { Video, VideoStatus } from '../src/videos/entities/video.entity';

describe('Videos management (e2e)', () => {
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

    return {
      accessToken: loginRes.body.access_token,
      channelId: channel.id,
    };
  }

  async function createVideo(
    channelId: string,
    overrides: Partial<Video> = {},
  ): Promise<Video> {
    return videoRepository.save(
      videoRepository.create({
        slug: `e2evid${Math.random().toString(36).slice(2, 8)}`,
        channel_id: channelId,
        status: VideoStatus.DRAFT,
        ...overrides,
      }),
    );
  }

  describe('PATCH /videos/:id', () => {
    it('returns 200 and updates title/description for the owner', async () => {
      const { accessToken, channelId } = await registerConfirmAndLogin(
        'owner-update@example.com',
      );
      const video = await createVideo(channelId);

      const res = await request(app.getHttpServer())
        .patch(`/videos/${video.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: 'Updated title' })
        .expect(200);

      expect(res.body.title).toBe('Updated title');
    });

    it('returns 401 without an Authorization header', async () => {
      const { channelId } = await registerConfirmAndLogin(
        'owner-401@example.com',
      );
      const video = await createVideo(channelId);

      await request(app.getHttpServer())
        .patch(`/videos/${video.id}`)
        .send({ title: 'x' })
        .expect(401);
    });

    it('returns 403 with NOT_VIDEO_OWNER for a different channel', async () => {
      const owner = await registerConfirmAndLogin('owner-403a@example.com');
      const other = await registerConfirmAndLogin('owner-403b@example.com');
      const video = await createVideo(owner.channelId);

      const res = await request(app.getHttpServer())
        .patch(`/videos/${video.id}`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .send({ title: 'Hijacked' })
        .expect(403);

      expect(res.body.error).toBe('NOT_VIDEO_OWNER');
    });
  });

  describe('POST /videos/:id/publish', () => {
    it('returns 200 and publishes a READY video', async () => {
      const { accessToken, channelId } = await registerConfirmAndLogin(
        'publisher@example.com',
      );
      const video = await createVideo(channelId, {
        status: VideoStatus.READY,
      });

      const res = await request(app.getHttpServer())
        .post(`/videos/${video.id}/publish`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ visibility: 'public' })
        .expect(201);

      expect(res.body.visibility).toBe('public');
      expect(res.body.published_at).not.toBeNull();
    });

    it('returns 422 with VIDEO_NOT_READY for a draft video', async () => {
      const { accessToken, channelId } = await registerConfirmAndLogin(
        'publisher-422@example.com',
      );
      const video = await createVideo(channelId, {
        status: VideoStatus.DRAFT,
      });

      const res = await request(app.getHttpServer())
        .post(`/videos/${video.id}/publish`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ visibility: 'public' })
        .expect(422);

      expect(res.body.error).toBe('VIDEO_NOT_READY');
    });
  });

  describe('DELETE /videos/:id', () => {
    it('returns 204 and removes the video for the owner', async () => {
      const { accessToken, channelId } = await registerConfirmAndLogin(
        'deleter@example.com',
      );
      const video = await createVideo(channelId);

      await request(app.getHttpServer())
        .delete(`/videos/${video.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      const found = await videoRepository.findOne({ where: { id: video.id } });
      expect(found).toBeNull();
    });

    it('returns 404 with VIDEO_NOT_FOUND for an unknown id', async () => {
      const { accessToken } = await registerConfirmAndLogin(
        'deleter-404@example.com',
      );

      const res = await request(app.getHttpServer())
        .delete('/videos/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      expect(res.body.error).toBe('VIDEO_NOT_FOUND');
    });
  });

  describe('GET /videos/channel/me', () => {
    it("returns 200 with only the authenticated channel's videos", async () => {
      const mine = await registerConfirmAndLogin('panel-mine@example.com');
      const other = await registerConfirmAndLogin('panel-other@example.com');
      await createVideo(mine.channelId, { title: 'Mine 1' });
      await createVideo(mine.channelId, { title: 'Mine 2' });
      await createVideo(other.channelId, { title: 'Not mine' });

      const res = await request(app.getHttpServer())
        .get('/videos/channel/me')
        .set('Authorization', `Bearer ${mine.accessToken}`)
        .expect(200);

      expect(res.body.total).toBe(2);
      expect(
        res.body.data.every((v: { title: string }) => v.title !== 'Not mine'),
      ).toBe(true);
    });
  });
});
