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

describe('Comments (e2e)', () => {
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
        slug: `cvid${Math.random().toString(36).slice(2, 8)}`,
        channel_id: channelId,
        status: VideoStatus.READY,
        visibility: VideoVisibility.PUBLIC,
      }),
    );
  }

  describe('POST /videos/:slug/comments', () => {
    it('returns 201 and creates a top-level comment', async () => {
      const { accessToken, channelId } = await registerConfirmAndLogin(
        'commenter@example.com',
      );
      const video = await createVideo(channelId);

      const res = await request(app.getHttpServer())
        .post(`/videos/${video.slug}/comments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ body: 'Nice video!' })
        .expect(201);

      expect(res.body.body).toBe('Nice video!');
      expect(res.body.parent_id).toBeNull();
    });

    it('returns 201 and creates a reply', async () => {
      const { accessToken, channelId } = await registerConfirmAndLogin(
        'replier@example.com',
      );
      const video = await createVideo(channelId);
      const parentRes = await request(app.getHttpServer())
        .post(`/videos/${video.slug}/comments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ body: 'Parent' });

      const res = await request(app.getHttpServer())
        .post(`/videos/${video.slug}/comments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ body: 'A reply', parent_id: parentRes.body.id })
        .expect(201);

      expect(res.body.parent_id).toBe(parentRes.body.id);
    });

    it('returns 422 with COMMENT_NESTING_NOT_ALLOWED when replying to a reply', async () => {
      const { accessToken, channelId } =
        await registerConfirmAndLogin('nested@example.com');
      const video = await createVideo(channelId);
      const parentRes = await request(app.getHttpServer())
        .post(`/videos/${video.slug}/comments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ body: 'Parent' });
      const replyRes = await request(app.getHttpServer())
        .post(`/videos/${video.slug}/comments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ body: 'Reply', parent_id: parentRes.body.id });

      const res = await request(app.getHttpServer())
        .post(`/videos/${video.slug}/comments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ body: 'Reply to reply', parent_id: replyRes.body.id })
        .expect(422);

      expect(res.body.error).toBe('COMMENT_NESTING_NOT_ALLOWED');
    });

    it('returns 401 without an Authorization header', async () => {
      const { channelId } = await registerConfirmAndLogin(
        'comment-401@example.com',
      );
      const video = await createVideo(channelId);

      await request(app.getHttpServer())
        .post(`/videos/${video.slug}/comments`)
        .send({ body: 'x' })
        .expect(401);
    });
  });

  describe('GET /videos/:slug/comments and /comments/:id/replies', () => {
    it('returns 200 with paginated top-level comments', async () => {
      const { accessToken, channelId } =
        await registerConfirmAndLogin('lister@example.com');
      const video = await createVideo(channelId);
      await request(app.getHttpServer())
        .post(`/videos/${video.slug}/comments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ body: 'One' });

      const res = await request(app.getHttpServer())
        .get(`/videos/${video.slug}/comments`)
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(res.body.data).toHaveLength(1);
    });

    it('returns 200 with paginated replies', async () => {
      const { accessToken, channelId } = await registerConfirmAndLogin(
        'replylister@example.com',
      );
      const video = await createVideo(channelId);
      const parentRes = await request(app.getHttpServer())
        .post(`/videos/${video.slug}/comments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ body: 'Parent' });
      await request(app.getHttpServer())
        .post(`/videos/${video.slug}/comments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ body: 'Reply', parent_id: parentRes.body.id });

      const res = await request(app.getHttpServer())
        .get(`/comments/${parentRes.body.id}/replies`)
        .expect(200);

      expect(res.body.total).toBe(1);
    });
  });

  describe('DELETE /comments/:commentId', () => {
    it('returns 204 for the comment author', async () => {
      const { accessToken, channelId } = await registerConfirmAndLogin(
        'deleter@example.com',
      );
      const video = await createVideo(channelId);
      const commentRes = await request(app.getHttpServer())
        .post(`/videos/${video.slug}/comments`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ body: 'Delete me' });

      await request(app.getHttpServer())
        .delete(`/comments/${commentRes.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });

    it('returns 403 with NOT_COMMENT_AUTHOR for a different user', async () => {
      const author = await registerConfirmAndLogin('author@example.com');
      const stranger = await registerConfirmAndLogin('stranger@example.com');
      const video = await createVideo(author.channelId);
      const commentRes = await request(app.getHttpServer())
        .post(`/videos/${video.slug}/comments`)
        .set('Authorization', `Bearer ${author.accessToken}`)
        .send({ body: 'Mine' });

      const res = await request(app.getHttpServer())
        .delete(`/comments/${commentRes.body.id}`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .expect(403);

      expect(res.body.error).toBe('NOT_COMMENT_AUTHOR');
    });
  });
});
