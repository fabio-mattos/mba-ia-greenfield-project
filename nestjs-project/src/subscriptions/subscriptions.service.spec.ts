import { ChannelNotFoundException } from '../common/exceptions/domain.exception';
import { SubscriptionsService } from './subscriptions.service';

function makeChannel(id = 'channel-id', nickname = 'testchan') {
  return { id, nickname, name: 'Test Channel', user_id: 'user-id' };
}

function makeSubscriptionRepo(overrides: Record<string, jest.Mock> = {}) {
  const qb = {
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({}),
  };
  return {
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    delete: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
    ...overrides,
  };
}

function makeChannelRepo(overrides: Record<string, jest.Mock> = {}) {
  return { findOne: jest.fn(), ...overrides };
}

function makeService(
  options: {
    subRepo?: Record<string, jest.Mock>;
    chanRepo?: Record<string, jest.Mock>;
  } = {},
) {
  const subRepo = makeSubscriptionRepo(options.subRepo);
  const chanRepo = makeChannelRepo(options.chanRepo);
  const service = new SubscriptionsService(subRepo as any, chanRepo as any);
  return { service, subRepo, chanRepo };
}

describe('SubscriptionsService', () => {
  describe('subscribe', () => {
    it('throws ChannelNotFoundException when channel does not exist', async () => {
      const { service } = makeService({
        chanRepo: { findOne: jest.fn().mockResolvedValue(null) },
      });

      await expect(service.subscribe('user-id', 'nope')).rejects.toThrow(
        ChannelNotFoundException,
      );
    });

    it('inserts subscription idempotently and returns status', async () => {
      const channel = makeChannel();
      const qb = {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      };
      const { service } = makeService({
        chanRepo: { findOne: jest.fn().mockResolvedValue(channel) },
        subRepo: {
          count: jest.fn().mockResolvedValue(3),
          createQueryBuilder: jest.fn().mockReturnValue(qb),
        },
      });

      const result = await service.subscribe('user-id', 'testchan');

      expect(result.isSubscribed).toBe(true);
      expect(result.subscriberCount).toBe(3);
    });
  });

  describe('unsubscribe', () => {
    it('throws ChannelNotFoundException when channel does not exist', async () => {
      const { service } = makeService({
        chanRepo: { findOne: jest.fn().mockResolvedValue(null) },
      });

      await expect(service.unsubscribe('user-id', 'nope')).rejects.toThrow(
        ChannelNotFoundException,
      );
    });

    it('deletes subscription and returns isSubscribed false', async () => {
      const channel = makeChannel();
      const { service, subRepo } = makeService({
        chanRepo: { findOne: jest.fn().mockResolvedValue(channel) },
        subRepo: {
          delete: jest.fn(),
          count: jest.fn().mockResolvedValue(2),
        },
      });

      const result = await service.unsubscribe('user-id', 'testchan');

      expect(subRepo.delete).toHaveBeenCalledWith({
        subscriber_id: 'user-id',
        channel_id: 'channel-id',
      });
      expect(result.isSubscribed).toBe(false);
      expect(result.subscriberCount).toBe(2);
    });
  });

  describe('getSubscriptionStatus', () => {
    it('returns isSubscribed false and count when userId is null', async () => {
      const channel = makeChannel();
      const { service } = makeService({
        chanRepo: { findOne: jest.fn().mockResolvedValue(channel) },
        subRepo: {
          count: jest.fn().mockResolvedValue(10),
          findOne: jest.fn(),
        },
      });

      const result = await service.getSubscriptionStatus(null, 'testchan');

      expect(result.isSubscribed).toBe(false);
      expect(result.subscriberCount).toBe(10);
    });

    it('returns isSubscribed true when user is subscribed', async () => {
      const channel = makeChannel();
      const sub = {
        id: 'sub-id',
        subscriber_id: 'user-id',
        channel_id: 'channel-id',
      };
      const { service } = makeService({
        chanRepo: { findOne: jest.fn().mockResolvedValue(channel) },
        subRepo: {
          count: jest.fn().mockResolvedValue(5),
          findOne: jest.fn().mockResolvedValue(sub),
        },
      });

      const result = await service.getSubscriptionStatus('user-id', 'testchan');

      expect(result.isSubscribed).toBe(true);
      expect(result.subscriberCount).toBe(5);
    });
  });
});
