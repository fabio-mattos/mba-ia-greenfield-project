import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { MailService } from '../src/mail/mail.service';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { cleanAllTables } from '../src/test/create-test-data-source';
import { Video, VideoStatus } from '../src/videos/entities/video.entity';

interface LoginResponseBody {
  access_token: string;
  refresh_token: string;
}

interface InitiateUploadResponseBody {
  videoId: string;
  uploadId: string;
}

interface ApiErrorResponseBody {
  error: string;
}

interface UploadPartUrlResponseBody {
  url: string;
}

interface VideoResponseBody {
  id: string;
  status: VideoStatus;
}

describe('Videos (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
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
    throttlerStorage =
      moduleFixture.get<ThrottlerStorageService>(ThrottlerStorage);
  }, 20000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    throttlerStorage.storage.clear();
  });

  async function registerConfirmAndLogin(
    email: string,
    password = 'password123',
  ): Promise<string> {
    const authService = app.get(AuthService);
    const mailServiceInstance = (
      authService as unknown as { mailService: MailService }
    ).mailService;
    let capturedToken = '';
    jest
      .spyOn(mailServiceInstance, 'sendConfirmationEmail')
      .mockImplementationOnce((_e: string, _n: string, t: string) => {
        capturedToken = t;
        return Promise.resolve();
      });
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password });
    await request(app.getHttpServer())
      .get('/auth/confirm-email')
      .query({ token: capturedToken });
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
    return (res.body as LoginResponseBody).access_token;
  }

  const validUploadBody = {
    title: 'My video',
    originalFileName: 'movie.mp4',
    fileSizeBytes: 12345,
    mimeType: 'video/mp4',
  };

  describe('POST /videos/upload/initiate', () => {
    it('returns 201 with videoId and uploadId on valid request', async () => {
      const token = await registerConfirmAndLogin('video1@example.com');

      const res = await request(app.getHttpServer())
        .post('/videos/upload/initiate')
        .set('Authorization', `Bearer ${token}`)
        .send(validUploadBody)
        .expect(201);

      const body = res.body as InitiateUploadResponseBody;
      expect(body.videoId).toBeDefined();
      expect(body.uploadId).toBeTruthy();
    });

    it('returns 400 with VIDEO_FILE_TOO_LARGE when file exceeds 10GB', async () => {
      const token = await registerConfirmAndLogin('video2@example.com');

      const res = await request(app.getHttpServer())
        .post('/videos/upload/initiate')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validUploadBody, fileSizeBytes: 10 * 1024 ** 3 + 1 })
        .expect(400);

      expect((res.body as ApiErrorResponseBody).error).toBe(
        'VIDEO_FILE_TOO_LARGE',
      );
    });

    it('returns 400 on validation error for an unsupported mimeType', async () => {
      const token = await registerConfirmAndLogin('video3@example.com');

      await request(app.getHttpServer())
        .post('/videos/upload/initiate')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validUploadBody, mimeType: 'application/pdf' })
        .expect(400);
    });

    it('returns 401 without an access token', async () => {
      await request(app.getHttpServer())
        .post('/videos/upload/initiate')
        .send(validUploadBody)
        .expect(401);
    });
  });

  describe('POST /videos/:id/upload/parts/:partNumber and /complete', () => {
    async function initiateAsNewUser(email: string): Promise<{
      token: string;
      videoId: string;
    }> {
      const token = await registerConfirmAndLogin(email);
      const res = await request(app.getHttpServer())
        .post('/videos/upload/initiate')
        .set('Authorization', `Bearer ${token}`)
        .send(validUploadBody)
        .expect(201);
      return {
        token,
        videoId: (res.body as InitiateUploadResponseBody).videoId,
      };
    }

    it('returns a presigned part URL for the owner', async () => {
      const { token, videoId } = await initiateAsNewUser('video4@example.com');

      const res = await request(app.getHttpServer())
        .post(`/videos/${videoId}/upload/parts/1`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      expect((res.body as UploadPartUrlResponseBody).url).toContain('http');
    });

    it('returns 404 for a non-owner requesting a part URL', async () => {
      const { videoId } = await initiateAsNewUser('video5@example.com');
      const otherToken = await registerConfirmAndLogin('video6@example.com');

      await request(app.getHttpServer())
        .post(`/videos/${videoId}/upload/parts/1`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
    });

    it('completes the upload and returns 204', async () => {
      const { token, videoId } = await initiateAsNewUser('video7@example.com');
      const partRes = await request(app.getHttpServer())
        .post(`/videos/${videoId}/upload/parts/1`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      const partUrl = (partRes.body as UploadPartUrlResponseBody).url;
      const putResponse = await fetch(partUrl, { method: 'PUT', body: 'x' });
      const etag = putResponse.headers.get('etag')!;

      await request(app.getHttpServer())
        .post(`/videos/${videoId}/upload/complete`)
        .set('Authorization', `Bearer ${token}`)
        .send({ parts: [{ partNumber: 1, etag }] })
        .expect(204);
    });

    it('returns 409 with VIDEO_UPLOAD_ALREADY_COMPLETED on a second complete call', async () => {
      const { token, videoId } = await initiateAsNewUser('video8@example.com');
      const partRes = await request(app.getHttpServer())
        .post(`/videos/${videoId}/upload/parts/1`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      const partUrl = (partRes.body as UploadPartUrlResponseBody).url;
      const putResponse = await fetch(partUrl, { method: 'PUT', body: 'x' });
      const etag = putResponse.headers.get('etag')!;
      await request(app.getHttpServer())
        .post(`/videos/${videoId}/upload/complete`)
        .set('Authorization', `Bearer ${token}`)
        .send({ parts: [{ partNumber: 1, etag }] })
        .expect(204);

      const res = await request(app.getHttpServer())
        .post(`/videos/${videoId}/upload/complete`)
        .set('Authorization', `Bearer ${token}`)
        .send({ parts: [{ partNumber: 1, etag }] })
        .expect(409);

      expect((res.body as ApiErrorResponseBody).error).toBe(
        'VIDEO_UPLOAD_ALREADY_COMPLETED',
      );
    });
  });

  describe('GET /videos/:id', () => {
    async function initiateAsNewUser(email: string): Promise<{
      token: string;
      videoId: string;
    }> {
      const token = await registerConfirmAndLogin(email);
      const res = await request(app.getHttpServer())
        .post('/videos/upload/initiate')
        .set('Authorization', `Bearer ${token}`)
        .send(validUploadBody)
        .expect(201);
      return {
        token,
        videoId: (res.body as InitiateUploadResponseBody).videoId,
      };
    }

    it('lets the owner see their own draft video', async () => {
      const { token, videoId } = await initiateAsNewUser('video9@example.com');

      const res = await request(app.getHttpServer())
        .get(`/videos/${videoId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect((res.body as VideoResponseBody).status).toBe(VideoStatus.DRAFT);
    });

    it('returns 404 for an anonymous viewer on a draft video', async () => {
      const { videoId } = await initiateAsNewUser('video10@example.com');

      await request(app.getHttpServer()).get(`/videos/${videoId}`).expect(404);
    });

    it('returns 404 for a non-owner on a draft video', async () => {
      const { videoId } = await initiateAsNewUser('video11@example.com');
      const otherToken = await registerConfirmAndLogin('video12@example.com');

      await request(app.getHttpServer())
        .get(`/videos/${videoId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
    });

    it('lets any anonymous viewer see a ready video', async () => {
      const { videoId } = await initiateAsNewUser('video13@example.com');
      await dataSource
        .getRepository(Video)
        .update(videoId, { status: VideoStatus.READY });

      const res = await request(app.getHttpServer())
        .get(`/videos/${videoId}`)
        .expect(200);

      expect((res.body as VideoResponseBody).status).toBe(VideoStatus.READY);
    });

    it('returns 404 for an unknown video id', async () => {
      await request(app.getHttpServer())
        .get('/videos/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });
});
