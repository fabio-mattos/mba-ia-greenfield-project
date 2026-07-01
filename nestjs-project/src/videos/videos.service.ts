import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import storageConfig from '../config/storage.config';
import {
  NotVideoOwnerException,
  VideoAlreadyProcessingException,
  VideoNotFoundException,
  VideoNotReadyException,
} from '../common/exceptions/domain.exception';
import { VideoProcessingProducer } from '../queue/video-processing.producer';
import { StorageService } from '../storage/storage.service';
import type { UpdateVideoDto } from './dto/update-video.dto';
import type { PublishVideoDto } from './dto/update-video.dto';
import type {
  ChannelSummaryDto,
  VideoCardDto,
  VideoResponseDto,
} from './dto/video-response.dto';
import { Video, VideoStatus, VideoVisibility } from './entities/video.entity';
import { generateVideoSlug } from './slug.util';

const MAX_SLUG_RETRIES = 5;

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    private readonly storageService: StorageService,
    private readonly videoProcessingProducer: VideoProcessingProducer,
    @Inject(storageConfig.KEY)
    private readonly sConfig: ConfigType<typeof storageConfig>,
  ) {}

  async initiateUpload(
    channelId: string,
    originalFilename: string,
  ): Promise<{ videoId: string; slug: string; uploadUrl: string }> {
    const slug = await this.generateUniqueSlug();
    const fileKey = `uploads/${slug}/${originalFilename}`;

    const video = await this.videoRepository.save(
      this.videoRepository.create({
        slug,
        file_key: fileKey,
        channel_id: channelId,
        status: VideoStatus.DRAFT,
      }),
    );

    const uploadUrl = await this.storageService.getPresignedPutUrl(
      this.sConfig.bucketVideos,
      fileKey,
      this.sConfig.presignedUploadTtl,
    );

    return { videoId: video.id, slug: video.slug, uploadUrl };
  }

  async confirmUpload(videoId: string, channelId: string): Promise<void> {
    const video = await this.videoRepository.findOne({
      where: { id: videoId, channel_id: channelId },
    });

    if (!video) {
      throw new VideoNotFoundException();
    }

    if (video.status !== VideoStatus.DRAFT) {
      throw new VideoAlreadyProcessingException();
    }

    await this.videoRepository.update(video.id, {
      status: VideoStatus.PROCESSING,
    });
    await this.videoProcessingProducer.enqueue(video.id);
  }

  async findBySlug(slug: string): Promise<VideoResponseDto> {
    const video = await this.videoRepository.findOne({
      where: { slug },
      relations: ['channel', 'category'],
    });

    if (!video) {
      throw new VideoNotFoundException();
    }

    return this.toResponseDto(video);
  }

  async updateVideo(
    videoId: string,
    channelId: string,
    dto: UpdateVideoDto,
  ): Promise<VideoResponseDto> {
    const video = await this.videoRepository.findOne({
      where: { id: videoId },
      relations: ['channel', 'category'],
    });

    if (!video) {
      throw new VideoNotFoundException();
    }

    if (video.channel_id !== channelId) {
      throw new NotVideoOwnerException();
    }

    await this.videoRepository.update(videoId, {
      ...(dto.title !== undefined && { title: dto.title }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.category_id !== undefined && { category_id: dto.category_id }),
    });

    const updated = await this.videoRepository.findOne({
      where: { id: videoId },
      relations: ['channel', 'category'],
    });

    return this.toResponseDto(updated!);
  }

  async publishVideo(
    videoId: string,
    channelId: string,
    dto: PublishVideoDto,
  ): Promise<VideoResponseDto> {
    const video = await this.videoRepository.findOne({
      where: { id: videoId },
      relations: ['channel', 'category'],
    });

    if (!video) {
      throw new VideoNotFoundException();
    }

    if (video.channel_id !== channelId) {
      throw new NotVideoOwnerException();
    }

    if (video.status !== VideoStatus.READY) {
      throw new VideoNotReadyException();
    }

    await this.videoRepository.update(videoId, {
      visibility: dto.visibility,
      published_at: new Date(),
    });

    const updated = await this.videoRepository.findOne({
      where: { id: videoId },
      relations: ['channel', 'category'],
    });

    return this.toResponseDto(updated!);
  }

  async uploadCustomThumbnail(
    videoId: string,
    channelId: string,
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<void> {
    const video = await this.videoRepository.findOne({
      where: { id: videoId },
    });

    if (!video) {
      throw new VideoNotFoundException();
    }

    if (video.channel_id !== channelId) {
      throw new NotVideoOwnerException();
    }

    const thumbnailKey = `thumbnails/${videoId}.jpg`;
    await this.storageService.putObject(
      this.sConfig.bucketThumbnails,
      thumbnailKey,
      fileBuffer,
      mimeType,
    );

    await this.videoRepository.update(videoId, { thumbnail_key: thumbnailKey });
  }

  async deleteVideo(videoId: string, channelId: string): Promise<void> {
    const video = await this.videoRepository.findOne({
      where: { id: videoId },
    });

    if (!video) {
      throw new VideoNotFoundException();
    }

    if (video.channel_id !== channelId) {
      throw new NotVideoOwnerException();
    }

    if (video.file_key) {
      await this.storageService
        .deleteObject(this.sConfig.bucketVideos, video.file_key)
        .catch(() => {});
    }
    if (video.thumbnail_key) {
      await this.storageService
        .deleteObject(this.sConfig.bucketThumbnails, video.thumbnail_key)
        .catch(() => {});
    }

    await this.videoRepository.delete(videoId);
  }

  async getStreamUrl(slug: string): Promise<string> {
    const video = await this.videoRepository.findOne({ where: { slug } });

    if (!video) {
      throw new VideoNotFoundException();
    }

    if (!video.file_key) {
      throw new VideoNotReadyException();
    }

    return this.storageService.getPresignedGetUrl(
      this.sConfig.bucketVideos,
      video.file_key,
      this.sConfig.presignedStreamTtl,
    );
  }

  async getDownloadUrl(slug: string): Promise<string> {
    const video = await this.videoRepository.findOne({ where: { slug } });

    if (!video) {
      throw new VideoNotFoundException();
    }

    if (!video.file_key) {
      throw new VideoNotReadyException();
    }

    const filename = video.title ?? slug;
    return this.storageService.getPresignedGetUrlWithDisposition(
      this.sConfig.bucketVideos,
      video.file_key,
      3600,
      `${filename}.mp4`,
    );
  }

  async incrementViewCount(slug: string): Promise<void> {
    await this.videoRepository
      .createQueryBuilder()
      .update(Video)
      .set({ view_count: () => 'view_count + 1' })
      .where('slug = :slug', { slug })
      .execute();
  }

  async getSuggestionsBySlug(
    slug: string,
    limit = 10,
  ): Promise<VideoCardDto[]> {
    const video = await this.videoRepository.findOne({ where: { slug } });
    if (!video) {
      throw new VideoNotFoundException();
    }
    return this.getSuggestions(video.id, video.category_id, limit);
  }

  async getSuggestions(
    videoId: string,
    categoryId: string | null,
    limit = 10,
  ): Promise<VideoCardDto[]> {
    const qb = this.videoRepository
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.channel', 'channel')
      .leftJoinAndSelect('v.category', 'category')
      .where('v.id != :videoId', { videoId })
      .andWhere('v.status = :status', { status: VideoStatus.READY })
      .andWhere('v.visibility = :visibility', {
        visibility: VideoVisibility.PUBLIC,
      })
      .orderBy('v.view_count', 'DESC')
      .limit(limit);

    if (categoryId) {
      qb.andWhere('v.category_id = :categoryId', { categoryId });
    }

    const videos = await qb.getMany();
    return videos.map((v) => this.toCardDto(v));
  }

  async listPublicVideos(options: {
    categorySlug?: string;
    search?: string;
    channelNickname?: string;
    page: number;
    limit: number;
  }): Promise<{
    data: VideoCardDto[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  }> {
    const { categorySlug, search, channelNickname, page, limit } = options;
    const skip = (page - 1) * limit;

    const qb = this.videoRepository
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.channel', 'channel')
      .leftJoinAndSelect('v.category', 'category')
      .where('v.status = :status', { status: VideoStatus.READY })
      .andWhere('v.visibility = :visibility', {
        visibility: VideoVisibility.PUBLIC,
      })
      .orderBy('v.published_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (categorySlug) {
      qb.andWhere('category.slug = :categorySlug', { categorySlug });
    }

    if (search) {
      qb.andWhere('(v.title ILIKE :search OR channel.nickname ILIKE :search)', {
        search: `%${search}%`,
      });
    }

    if (channelNickname) {
      qb.andWhere('channel.nickname = :channelNickname', { channelNickname });
    }

    const [videos, total] = await qb.getManyAndCount();

    return {
      data: videos.map((v) => this.toCardDto(v)),
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    };
  }

  async listChannelVideos(
    channelId: string,
    page: number,
    limit: number,
  ): Promise<{ data: VideoResponseDto[]; total: number }> {
    const [videos, total] = await this.videoRepository.findAndCount({
      where: { channel_id: channelId },
      relations: ['channel', 'category'],
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: videos.map((v) => this.toResponseDto(v)),
      total,
    };
  }

  private toResponseDto(video: Video): VideoResponseDto {
    return {
      id: video.id,
      slug: video.slug,
      title: video.title,
      description: video.description,
      status: video.status,
      visibility: video.visibility,
      duration_seconds: video.duration_seconds,
      view_count: video.view_count,
      thumbnail_url: video.thumbnail_key
        ? this.buildPublicUrl(
            this.sConfig.bucketThumbnails,
            video.thumbnail_key,
          )
        : null,
      channel: this.toChannelSummary(video.channel),
      category: video.category
        ? {
            id: video.category.id,
            name: video.category.name,
            slug: video.category.slug,
          }
        : null,
      published_at: video.published_at,
      created_at: video.created_at,
    };
  }

  private toCardDto(video: Video): VideoCardDto {
    return {
      id: video.id,
      slug: video.slug,
      title: video.title ?? '',
      thumbnail_url: video.thumbnail_key
        ? this.buildPublicUrl(
            this.sConfig.bucketThumbnails,
            video.thumbnail_key,
          )
        : null,
      duration_seconds: video.duration_seconds,
      view_count: video.view_count,
      published_at: video.published_at!,
      channel: this.toChannelSummary(video.channel),
      category: video.category
        ? {
            id: video.category.id,
            name: video.category.name,
            slug: video.category.slug,
          }
        : null,
    };
  }

  private toChannelSummary(channel: Video['channel']): ChannelSummaryDto {
    return {
      id: channel.id,
      nickname: channel.nickname,
      name: channel.name,
      thumbnail_url: channel.thumbnail_key
        ? this.buildPublicUrl(
            this.sConfig.bucketThumbnails,
            channel.thumbnail_key,
          )
        : null,
    };
  }

  private buildPublicUrl(bucket: string, key: string): string {
    const protocol = this.sConfig.useSSL ? 'https' : 'http';
    return `${protocol}://${this.sConfig.endpoint}:${this.sConfig.port}/${bucket}/${key}`;
  }

  private async generateUniqueSlug(): Promise<string> {
    for (let attempt = 0; attempt < MAX_SLUG_RETRIES; attempt++) {
      const slug = generateVideoSlug();
      const existing = await this.videoRepository.findOne({ where: { slug } });
      if (!existing) return slug;
    }
    throw new Error('Could not generate a unique video slug after max retries');
  }
}
