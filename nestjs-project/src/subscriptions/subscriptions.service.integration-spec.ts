import { DataSource, Repository } from 'typeorm';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { Channel } from '../channels/entities/channel.entity';
import { Subscription } from './entities/subscription.entity';
import { SubscriptionsService } from './subscriptions.service';

const ALL_ENTITIES = [User, Channel, Subscription];

describe('SubscriptionsService (integration)', () => {
  let dataSource: DataSource;
  let service: SubscriptionsService;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;
  let subscriptionRepository: Repository<Subscription>;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    subscriptionRepository = dataSource.getRepository(Subscription);
    service = new SubscriptionsService(
      subscriptionRepository,
      channelRepository,
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  let counter = 0;

  async function createUser(): Promise<User> {
    counter += 1;
    return userRepository.save(
      userRepository.create({
        email: `subs_${counter}@example.com`,
        password: 'hashed',
      }),
    );
  }

  async function createChannel(): Promise<Channel> {
    counter += 1;
    const owner = await createUser();
    return channelRepository.save(
      channelRepository.create({
        name: `Channel ${counter}`,
        nickname: `chan${counter}`,
        user_id: owner.id,
      }),
    );
  }

  describe('subscribe', () => {
    it('creates a subscription and increments the subscriber count', async () => {
      const channel = await createChannel();
      const subscriber = await createUser();

      const result = await service.subscribe(subscriber.id, channel.nickname);

      expect(result).toEqual({ isSubscribed: true, subscriberCount: 1 });
    });

    it('is idempotent — subscribing twice does not duplicate or fail', async () => {
      const channel = await createChannel();
      const subscriber = await createUser();

      await service.subscribe(subscriber.id, channel.nickname);
      const result = await service.subscribe(subscriber.id, channel.nickname);

      expect(result.subscriberCount).toBe(1);
      const rows = await subscriptionRepository.find({
        where: { subscriber_id: subscriber.id, channel_id: channel.id },
      });
      expect(rows).toHaveLength(1);
    });

    it('throws ChannelNotFoundException for an unknown nickname', async () => {
      const subscriber = await createUser();

      await expect(
        service.subscribe(subscriber.id, 'does-not-exist'),
      ).rejects.toThrow('Channel not found');
    });
  });

  describe('unsubscribe', () => {
    it('removes the subscription and decrements the count', async () => {
      const channel = await createChannel();
      const subscriber = await createUser();
      await service.subscribe(subscriber.id, channel.nickname);

      const result = await service.unsubscribe(subscriber.id, channel.nickname);

      expect(result).toEqual({ isSubscribed: false, subscriberCount: 0 });
    });
  });

  describe('getSubscriptionStatus', () => {
    it('returns isSubscribed=false and the count for an anonymous requester', async () => {
      const channel = await createChannel();
      const subscriber = await createUser();
      await service.subscribe(subscriber.id, channel.nickname);

      const status = await service.getSubscriptionStatus(
        null,
        channel.nickname,
      );

      expect(status).toEqual({ isSubscribed: false, subscriberCount: 1 });
    });

    it('returns isSubscribed=true for the subscribed user', async () => {
      const channel = await createChannel();
      const subscriber = await createUser();
      await service.subscribe(subscriber.id, channel.nickname);

      const status = await service.getSubscriptionStatus(
        subscriber.id,
        channel.nickname,
      );

      expect(status.isSubscribed).toBe(true);
    });
  });

  describe('listSubscribedChannels', () => {
    it('paginates the channels the user is subscribed to', async () => {
      const channelA = await createChannel();
      const channelB = await createChannel();
      const unrelated = await createChannel();
      const subscriber = await createUser();
      await service.subscribe(subscriber.id, channelA.nickname);
      await service.subscribe(subscriber.id, channelB.nickname);

      const result = await service.listSubscribedChannels(subscriber.id, 1, 10);

      expect(result.total).toBe(2);
      expect(result.data.map((c) => c.id).sort()).toEqual(
        [channelA.id, channelB.id].sort(),
      );
      expect(result.data.some((c) => c.id === unrelated.id)).toBe(false);
    });
  });
});
