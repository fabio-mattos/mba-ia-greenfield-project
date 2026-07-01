import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChannelNotFoundException } from '../common/exceptions/domain.exception';
import { Channel } from '../channels/entities/channel.entity';
import { Subscription } from './entities/subscription.entity';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
  ) {}

  async subscribe(
    subscriberId: string,
    channelNickname: string,
  ): Promise<{ isSubscribed: boolean; subscriberCount: number }> {
    const channel = await this.channelRepository.findOne({
      where: { nickname: channelNickname },
    });
    if (!channel) {
      throw new ChannelNotFoundException();
    }

    await this.subscriptionRepository
      .createQueryBuilder()
      .insert()
      .into(Subscription)
      .values({ subscriber_id: subscriberId, channel_id: channel.id })
      .orIgnore()
      .execute();

    const subscriberCount = await this.subscriptionRepository.count({
      where: { channel_id: channel.id },
    });

    return { isSubscribed: true, subscriberCount };
  }

  async unsubscribe(
    subscriberId: string,
    channelNickname: string,
  ): Promise<{ isSubscribed: boolean; subscriberCount: number }> {
    const channel = await this.channelRepository.findOne({
      where: { nickname: channelNickname },
    });
    if (!channel) {
      throw new ChannelNotFoundException();
    }

    await this.subscriptionRepository.delete({
      subscriber_id: subscriberId,
      channel_id: channel.id,
    });

    const subscriberCount = await this.subscriptionRepository.count({
      where: { channel_id: channel.id },
    });

    return { isSubscribed: false, subscriberCount };
  }

  async getSubscriptionStatus(
    subscriberId: string | null,
    channelNickname: string,
  ): Promise<{ isSubscribed: boolean; subscriberCount: number }> {
    const channel = await this.channelRepository.findOne({
      where: { nickname: channelNickname },
    });
    if (!channel) {
      throw new ChannelNotFoundException();
    }

    const subscriberCount = await this.subscriptionRepository.count({
      where: { channel_id: channel.id },
    });

    if (!subscriberId) {
      return { isSubscribed: false, subscriberCount };
    }

    const sub = await this.subscriptionRepository.findOne({
      where: { subscriber_id: subscriberId, channel_id: channel.id },
    });

    return { isSubscribed: sub !== null, subscriberCount };
  }

  async isSubscribed(
    subscriberId: string,
    channelId: string,
  ): Promise<boolean> {
    const sub = await this.subscriptionRepository.findOne({
      where: { subscriber_id: subscriberId, channel_id: channelId },
    });
    return sub !== null;
  }

  async countSubscribers(channelId: string): Promise<number> {
    return this.subscriptionRepository.count({
      where: { channel_id: channelId },
    });
  }

  async listSubscribedChannels(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ data: Channel[]; total: number }> {
    const [subs, total] = await this.subscriptionRepository.findAndCount({
      where: { subscriber_id: userId },
      relations: ['channel'],
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data: subs.map((s) => s.channel), total };
  }
}
