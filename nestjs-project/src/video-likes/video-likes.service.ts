import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VideoNotFoundException } from '../common/exceptions/domain.exception';
import { Video } from '../videos/entities/video.entity';
import { LikeType, VideoLike } from './entities/video-like.entity';

@Injectable()
export class VideoLikesService {
  constructor(
    @InjectRepository(VideoLike)
    private readonly likeRepository: Repository<VideoLike>,
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
  ) {}

  async upsertLike(
    userId: string,
    videoSlug: string,
    type: LikeType,
  ): Promise<{ likes: number; dislikes: number; userLike: LikeType | null }> {
    const video = await this.videoRepository.findOne({
      where: { slug: videoSlug },
    });
    if (!video) {
      throw new VideoNotFoundException();
    }

    await this.likeRepository
      .createQueryBuilder()
      .insert()
      .into(VideoLike)
      .values({ video_id: video.id, user_id: userId, type })
      .orUpdate(['type'], ['video_id', 'user_id'])
      .execute();

    return this.getCounts(video.id, userId);
  }

  async getLikeStatus(
    videoSlug: string,
    userId: string | null,
  ): Promise<{ likes: number; dislikes: number; userLike: LikeType | null }> {
    const video = await this.videoRepository.findOne({
      where: { slug: videoSlug },
    });
    if (!video) {
      throw new VideoNotFoundException();
    }

    return this.getCounts(video.id, userId);
  }

  async removeLike(
    userId: string,
    videoSlug: string,
  ): Promise<{ likes: number; dislikes: number; userLike: null }> {
    const video = await this.videoRepository.findOne({
      where: { slug: videoSlug },
    });
    if (!video) {
      throw new VideoNotFoundException();
    }

    await this.likeRepository.delete({ video_id: video.id, user_id: userId });

    const counts = await this.getCounts(video.id, null);
    return { ...counts, userLike: null };
  }

  private async getCounts(
    videoId: string,
    userId: string | null,
  ): Promise<{ likes: number; dislikes: number; userLike: LikeType | null }> {
    const [likes, dislikes, userLike] = await Promise.all([
      this.likeRepository.count({
        where: { video_id: videoId, type: LikeType.LIKE },
      }),
      this.likeRepository.count({
        where: { video_id: videoId, type: LikeType.DISLIKE },
      }),
      userId
        ? this.likeRepository.findOne({
            where: { video_id: videoId, user_id: userId },
          })
        : null,
    ]);

    return { likes, dislikes, userLike: userLike?.type ?? null };
  }
}
