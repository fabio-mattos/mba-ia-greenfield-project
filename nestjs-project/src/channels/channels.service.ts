import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import {
  ChannelNotFoundException,
  NicknameAlreadyTakenException,
} from '../common/exceptions/domain.exception';
import { appendRandomSuffix, sanitizeNickname } from './nickname.util';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { Channel } from './entities/channel.entity';

const PG_UNIQUE_VIOLATION = '23505';
const NICKNAME_COLUMN = 'nickname';
const MAX_RETRIES = 5;

function isPgUniqueViolationOnColumn(err: unknown, column: string): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const e = err as unknown as { code: string; detail: string };
  return (
    e.code === PG_UNIQUE_VIOLATION &&
    typeof e.detail === 'string' &&
    e.detail.includes(column)
  );
}

@Injectable()
export class ChannelsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
  ) {}

  async createChannel(userId: string, email: string): Promise<Channel> {
    const baseNickname = sanitizeNickname(email.split('@')[0]);

    return this.dataSource.transaction(async (manager) => {
      let nickname = baseNickname;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const existing = await manager.findOne(Channel, {
          where: { nickname },
        });
        if (existing) {
          nickname = appendRandomSuffix(baseNickname);
          continue;
        }

        try {
          return await manager.save(
            manager.create(Channel, {
              name: baseNickname,
              nickname,
              user_id: userId,
            }),
          );
        } catch (err) {
          if (isPgUniqueViolationOnColumn(err, NICKNAME_COLUMN)) {
            // Concurrent insert between pre-check and save — retry with new suffix
            nickname = appendRandomSuffix(baseNickname);
          } else {
            throw err;
          }
        }
      }

      throw new Error(
        'Nickname conflict could not be resolved after max retries',
      );
    });
  }

  async findByUserId(userId: string): Promise<Channel> {
    const channel = await this.channelRepository.findOne({
      where: { user_id: userId },
    });
    if (!channel) {
      throw new ChannelNotFoundException();
    }
    return channel;
  }

  async findByNickname(nickname: string): Promise<Channel> {
    const channel = await this.channelRepository.findOne({
      where: { nickname },
    });
    if (!channel) {
      throw new ChannelNotFoundException();
    }
    return channel;
  }

  async updateChannel(
    channelId: string,
    userId: string,
    dto: UpdateChannelDto,
  ): Promise<Channel> {
    const channel = await this.channelRepository.findOne({
      where: { id: channelId, user_id: userId },
    });
    if (!channel) {
      throw new ChannelNotFoundException();
    }

    if (dto.nickname && dto.nickname !== channel.nickname) {
      const taken = await this.channelRepository.findOne({
        where: { nickname: dto.nickname },
      });
      if (taken) {
        throw new NicknameAlreadyTakenException();
      }
    }

    Object.assign(channel, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.nickname !== undefined && { nickname: dto.nickname }),
      ...(dto.description !== undefined && { description: dto.description }),
    });

    return this.channelRepository.save(channel);
  }

  async uploadThumbnail(
    channelId: string,
    userId: string,
    thumbnailKey: string,
  ): Promise<void> {
    const channel = await this.channelRepository.findOne({
      where: { id: channelId, user_id: userId },
    });
    if (!channel) {
      throw new ChannelNotFoundException();
    }
    await this.channelRepository.update(channelId, {
      thumbnail_key: thumbnailKey,
    } as any);
  }
}
