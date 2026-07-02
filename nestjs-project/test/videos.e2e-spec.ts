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
import { Category } from '../src/categories/entities/category.entity';
import {
  Video,
  VideoStatus,
  VideoVisibility,
} from '../src/videos/entities/video.entity';

describe('Videos management (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;
  let videoRepository: Repository<Video>;
  let categoryRepository: Repository<Category>;
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
    categoryRepository = dataSource.getRepository(Category);
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

  describe('GET /videos/:slug (visibility access control)', () => {
    it('returns 200 for an anonymous request to a published public video', async () => {
      const { channelId } = await registerConfirmAndLogin(
        'watch-public@example.com',
      );
      const video = await createVideo(channelId, {
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
      });

      await request(app.getHttpServer())
        .get(`/videos/${video.slug}`)
        .expect(200);
    });

    it('returns 200 for an anonymous request to a published unlisted video', async () => {
      const { channelId } = await registerConfirmAndLogin(
        'watch-unlisted@example.com',
      );
      const video = await createVideo(channelId, {
        status: VideoStatus.READY,
        visibility: VideoVisibility.UNLISTED,
      });

      await request(app.getHttpServer())
        .get(`/videos/${video.slug}`)
        .expect(200);
    });

    it('returns 404 with VIDEO_NOT_FOUND for an anonymous request to a draft video', async () => {
      const { channelId } = await registerConfirmAndLogin(
        'watch-draft-anon@example.com',
      );
      const video = await createVideo(channelId, {
        status: VideoStatus.DRAFT,
      });

      const res = await request(app.getHttpServer())
        .get(`/videos/${video.slug}`)
        .expect(404);

      expect(res.body.error).toBe('VIDEO_NOT_FOUND');
    });

    it('returns 200 for the owner requesting their own draft video', async () => {
      const { accessToken, channelId } = await registerConfirmAndLogin(
        'watch-draft-owner@example.com',
      );
      const video = await createVideo(channelId, {
        status: VideoStatus.DRAFT,
      });

      await request(app.getHttpServer())
        .get(`/videos/${video.slug}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('returns 404 for a different authenticated user requesting a draft video', async () => {
      const owner = await registerConfirmAndLogin('watch-draft-a@example.com');
      const stranger = await registerConfirmAndLogin(
        'watch-draft-b@example.com',
      );
      const video = await createVideo(owner.channelId, {
        status: VideoStatus.DRAFT,
      });

      const res = await request(app.getHttpServer())
        .get(`/videos/${video.slug}`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .expect(404);

      expect(res.body.error).toBe('VIDEO_NOT_FOUND');
    });
  });

  describe('GET /videos/:slug/stream and /download (visibility access control)', () => {
    it('returns 404 for an anonymous request to a draft video stream url', async () => {
      const { channelId } = await registerConfirmAndLogin(
        'stream-draft@example.com',
      );
      const video = await createVideo(channelId, {
        status: VideoStatus.DRAFT,
      });

      await request(app.getHttpServer())
        .get(`/videos/${video.slug}/stream`)
        .expect(404);
    });

    it('returns 404 for an anonymous request to a draft video download url', async () => {
      const { channelId } = await registerConfirmAndLogin(
        'download-draft@example.com',
      );
      const video = await createVideo(channelId, {
        status: VideoStatus.DRAFT,
      });

      await request(app.getHttpServer())
        .get(`/videos/${video.slug}/download`)
        .expect(404);
    });
  });

  describe('POST /videos/:slug/view', () => {
    it('returns 204 and increments the view count for a published video', async () => {
      const { channelId } = await registerConfirmAndLogin('viewer@example.com');
      const video = await createVideo(channelId, {
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
      });

      await request(app.getHttpServer())
        .post(`/videos/${video.slug}/view`)
        .expect(204);

      const updated = await videoRepository.findOne({
        where: { id: video.id },
      });
      expect(updated?.view_count).toBe(1);
    });
  });

  describe('GET /videos/:slug/suggestions', () => {
    it('returns 200 with an array of suggested videos', async () => {
      const { channelId } = await registerConfirmAndLogin(
        'suggestions@example.com',
      );
      const video = await createVideo(channelId, {
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
      });

      const res = await request(app.getHttpServer())
        .get(`/videos/${video.slug}/suggestions`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /videos (home/search)', () => {
    it('returns only published public/unlisted-excluded videos matching a search term', async () => {
      const { channelId } = await registerConfirmAndLogin(
        'search-home@example.com',
      );
      const match = await createVideo(channelId, {
        title: 'Learning NestJS',
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
        published_at: new Date(),
      });
      await createVideo(channelId, {
        title: 'Unrelated',
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
        published_at: new Date(),
      });
      await createVideo(channelId, {
        title: 'Learning NestJS draft',
        status: VideoStatus.DRAFT,
      });

      const res = await request(app.getHttpServer())
        .get('/videos')
        .query({ search: 'nestjs' })
        .expect(200);

      expect(res.body.data.map((v: { id: string }) => v.id)).toEqual([
        match.id,
      ]);
      expect(res.body.total).toBe(1);
    });

    it('filters by category slug', async () => {
      const { channelId } = await registerConfirmAndLogin(
        'search-category@example.com',
      );
      const category = await categoryRepository.save(
        categoryRepository.create({ name: 'Música', slug: 'musica-home' }),
      );
      const inCategory = await createVideo(channelId, {
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
        category_id: category.id,
        published_at: new Date(),
      });
      await createVideo(channelId, {
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
        published_at: new Date(),
      });

      const res = await request(app.getHttpServer())
        .get('/videos')
        .query({ category: 'musica-home' })
        .expect(200);

      expect(res.body.data.map((v: { id: string }) => v.id)).toEqual([
        inCategory.id,
      ]);
    });

    it('paginates results honoring page and limit', async () => {
      const { channelId } = await registerConfirmAndLogin(
        'search-page@example.com',
      );
      for (let i = 0; i < 3; i++) {
        await createVideo(channelId, {
          status: VideoStatus.READY,
          visibility: VideoVisibility.PUBLIC,
          published_at: new Date(),
        });
      }

      const res = await request(app.getHttpServer())
        .get('/videos')
        .query({ page: 1, limit: 2 })
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.total).toBe(3);
      expect(res.body.total_pages).toBe(2);
    });

    it('never includes draft or unpublished videos', async () => {
      const { channelId } = await registerConfirmAndLogin(
        'search-hidden@example.com',
      );
      await createVideo(channelId, { status: VideoStatus.DRAFT });
      await createVideo(channelId, { status: VideoStatus.PROCESSING });

      const res = await request(app.getHttpServer()).get('/videos').expect(200);

      expect(res.body.data).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });
  });
});
