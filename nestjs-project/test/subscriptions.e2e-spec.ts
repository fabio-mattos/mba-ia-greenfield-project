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

describe('Subscriptions (e2e)', () => {
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

  describe('GET /channels/:nickname/subscribe', () => {
    it("reflects the authenticated user's own subscription (guard optional-auth fix)", async () => {
      const creator = await registerConfirmAndLogin('sub-creator@example.com');
      const { accessToken } = await registerConfirmAndLogin(
        'sub-subscriber@example.com',
      );

      await request(app.getHttpServer())
        .post(`/channels/${creator.channel.nickname}/subscribe`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/channels/${creator.channel.nickname}/subscribe`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toEqual({ isSubscribed: true, subscriberCount: 1 });
    });

    it('returns isSubscribed=false for an anonymous requester', async () => {
      const creator = await registerConfirmAndLogin('sub-creator2@example.com');

      const res = await request(app.getHttpServer())
        .get(`/channels/${creator.channel.nickname}/subscribe`)
        .expect(200);

      expect(res.body).toEqual({ isSubscribed: false, subscriberCount: 0 });
    });

    it('returns 404 with CHANNEL_NOT_FOUND for an unknown nickname', async () => {
      const res = await request(app.getHttpServer())
        .get('/channels/does-not-exist-nickname/subscribe')
        .expect(404);

      expect(res.body.error).toBe('CHANNEL_NOT_FOUND');
    });
  });

  describe('POST and DELETE /channels/:nickname/subscribe', () => {
    it('returns 401 without an Authorization header', async () => {
      const creator = await registerConfirmAndLogin('sub-401@example.com');

      await request(app.getHttpServer())
        .post(`/channels/${creator.channel.nickname}/subscribe`)
        .expect(401);
    });

    it('returns 200 and isSubscribed=false after unsubscribing', async () => {
      const creator = await registerConfirmAndLogin('sub-unsub@example.com');
      const { accessToken } = await registerConfirmAndLogin(
        'sub-unsub-user@example.com',
      );
      await request(app.getHttpServer())
        .post(`/channels/${creator.channel.nickname}/subscribe`)
        .set('Authorization', `Bearer ${accessToken}`);

      const res = await request(app.getHttpServer())
        .delete(`/channels/${creator.channel.nickname}/subscribe`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toEqual({ isSubscribed: false, subscriberCount: 0 });
    });
  });

  describe('GET /channels/me/subscriptions', () => {
    it('returns 200 with the paginated list of subscribed channels', async () => {
      const creatorA = await registerConfirmAndLogin('sub-a@example.com');
      const creatorB = await registerConfirmAndLogin('sub-b@example.com');
      const { accessToken } = await registerConfirmAndLogin(
        'sub-list@example.com',
      );
      await request(app.getHttpServer())
        .post(`/channels/${creatorA.channel.nickname}/subscribe`)
        .set('Authorization', `Bearer ${accessToken}`);
      await request(app.getHttpServer())
        .post(`/channels/${creatorB.channel.nickname}/subscribe`)
        .set('Authorization', `Bearer ${accessToken}`);

      const res = await request(app.getHttpServer())
        .get('/channels/me/subscriptions')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.total).toBe(2);
    });

    it('returns 401 without an Authorization header', async () => {
      await request(app.getHttpServer())
        .get('/channels/me/subscriptions')
        .expect(401);
    });
  });
});
