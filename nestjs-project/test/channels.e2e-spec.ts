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

describe('Channels (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;
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
  ): Promise<{ accessToken: string; channel: Channel }> {
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

    return { accessToken: loginRes.body.access_token, channel };
  }

  describe('GET /channels/me', () => {
    it('returns 200 with the authenticated user channel', async () => {
      const { accessToken, channel } = await registerConfirmAndLogin(
        'channel-me@example.com',
      );

      const res = await request(app.getHttpServer())
        .get('/channels/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.id).toBe(channel.id);
      expect(res.body.nickname).toBe(channel.nickname);
    });

    it('returns 401 without an Authorization header', async () => {
      await request(app.getHttpServer()).get('/channels/me').expect(401);
    });
  });

  describe('GET /channels/:nickname', () => {
    it('returns 200 with the channel matching the nickname (public)', async () => {
      const { channel } = await registerConfirmAndLogin(
        'channel-public@example.com',
      );

      const res = await request(app.getHttpServer())
        .get(`/channels/${channel.nickname}`)
        .expect(200);

      expect(res.body.id).toBe(channel.id);
    });

    it('returns 404 with CHANNEL_NOT_FOUND for an unknown nickname', async () => {
      const res = await request(app.getHttpServer())
        .get('/channels/does-not-exist-nickname')
        .expect(404);

      expect(res.body.error).toBe('CHANNEL_NOT_FOUND');
    });
  });

  describe('PATCH /channels/me', () => {
    it('returns 200 and updates name/description', async () => {
      const { accessToken } = await registerConfirmAndLogin(
        'channel-update@example.com',
      );

      const res = await request(app.getHttpServer())
        .patch('/channels/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'New Name', description: 'New description' })
        .expect(200);

      expect(res.body.name).toBe('New Name');
      expect(res.body.description).toBe('New description');
    });

    it('returns 409 with NICKNAME_ALREADY_TAKEN when the nickname is in use', async () => {
      const first = await registerConfirmAndLogin(
        'channel-taken-a@example.com',
      );
      const { accessToken } = await registerConfirmAndLogin(
        'channel-taken-b@example.com',
      );

      const res = await request(app.getHttpServer())
        .patch('/channels/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ nickname: first.channel.nickname })
        .expect(409);

      expect(res.body.error).toBe('NICKNAME_ALREADY_TAKEN');
    });
  });

  describe('POST /channels/me/thumbnail', () => {
    it('returns 204 and stores the uploaded thumbnail key', async () => {
      const { accessToken, channel } = await registerConfirmAndLogin(
        'channel-thumb@example.com',
      );

      await request(app.getHttpServer())
        .post('/channels/me/thumbnail')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', Buffer.from('fake-image-bytes'), {
          filename: 'thumb.jpg',
          contentType: 'image/jpeg',
        })
        .expect(204);

      const updated = await channelRepository.findOneOrFail({
        where: { id: channel.id },
      });
      expect(updated.thumbnail_key).toBe(
        `channels/${channel.id}/thumbnail.jpg`,
      );
    });

    it('returns 401 without an Authorization header', async () => {
      await request(app.getHttpServer())
        .post('/channels/me/thumbnail')
        .attach('file', Buffer.from('fake-image-bytes'), {
          filename: 'thumb.jpg',
          contentType: 'image/jpeg',
        })
        .expect(401);
    });
  });
});
