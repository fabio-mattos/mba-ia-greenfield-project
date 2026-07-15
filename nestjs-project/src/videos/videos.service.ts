import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ChannelsService } from '../channels/channels.service';
import { StorageService } from '../storage/storage.service';
import {
  VideoFileTooLargeException,
  VideoNotFoundException,
  VideoNotReadyException,
  VideoUploadAlreadyCompletedException,
  VideoUploadNotInProgressException,
} from '../common/exceptions/domain.exception';
import { Video, VideoStatus } from './entities/video.entity';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { UploadedPartDto } from './dto/complete-upload.dto';
import { VideoResponseDto } from './dto/video-response.dto';
import {
  MAX_VIDEO_FILE_SIZE_BYTES,
  getFileExtension,
} from './videos.constants';
import { videoObjectKey } from '../storage/storage.constants';
import {
  PROCESS_VIDEO_JOB,
  VIDEO_PROCESSING_JOB_OPTIONS,
  VIDEO_PROCESSING_QUEUE,
} from '../queue/queue.constants';

export interface InitiateUploadResult {
  videoId: string;
  uploadId: string;
}

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    private readonly channelsService: ChannelsService,
    private readonly storageService: StorageService,
    @InjectQueue(VIDEO_PROCESSING_QUEUE)
    private readonly videoProcessingQueue: Queue,
  ) {}

  private async findOwnedVideoOrThrow(
    videoId: string,
    userId: string,
  ): Promise<Video> {
    const video = await this.videoRepository.findOne({
      where: { id: videoId },
      relations: ['channel'],
    });
    if (!video || video.channel.user_id !== userId) {
      throw new VideoNotFoundException();
    }
    return video;
  }

  private async findVisibleVideoOrThrow(
    id: string,
    viewerUserId: string | undefined,
  ): Promise<Video> {
    const video = await this.videoRepository.findOne({
      where: { id },
      relations: ['channel'],
    });

    const isOwner =
      viewerUserId !== undefined && video?.channel.user_id === viewerUserId;
    if (!video || (video.status !== VideoStatus.READY && !isOwner)) {
      throw new VideoNotFoundException();
    }
    return video;
  }

  async initiateUpload(
    userId: string,
    dto: InitiateUploadDto,
  ): Promise<InitiateUploadResult> {
    if (dto.fileSizeBytes > MAX_VIDEO_FILE_SIZE_BYTES) {
      throw new VideoFileTooLargeException();
    }

    const channel = await this.channelsService.findByUserId(userId);
    if (!channel) {
      throw new Error(`User ${userId} has no channel`);
    }

    const videoId = randomUUID();
    const extension = getFileExtension(dto.originalFileName);
    const originalFileKey = videoObjectKey(videoId, extension);

    const uploadId =
      await this.storageService.createMultipartUpload(originalFileKey);

    await this.videoRepository.save(
      this.videoRepository.create({
        id: videoId,
        channel_id: channel.id,
        title: dto.title,
        original_file_key: originalFileKey,
        original_file_name: dto.originalFileName,
        file_size_bytes: String(dto.fileSizeBytes),
        upload_id: uploadId,
      }),
    );

    return { videoId, uploadId };
  }

  async getUploadPartUrl(
    userId: string,
    videoId: string,
    partNumber: number,
  ): Promise<string> {
    const video = await this.findOwnedVideoOrThrow(videoId, userId);

    if (video.status !== VideoStatus.DRAFT || !video.upload_id) {
      throw new VideoUploadNotInProgressException();
    }

    return this.storageService.getUploadPartUrl(
      video.original_file_key,
      video.upload_id,
      partNumber,
    );
  }

  async completeUpload(
    userId: string,
    videoId: string,
    parts: UploadedPartDto[],
  ): Promise<void> {
    const video = await this.findOwnedVideoOrThrow(videoId, userId);

    if (video.status !== VideoStatus.DRAFT || !video.upload_id) {
      throw new VideoUploadAlreadyCompletedException();
    }

    await this.storageService.completeMultipartUpload(
      video.original_file_key,
      video.upload_id,
      parts,
    );

    await this.videoRepository.update(video.id, {
      status: VideoStatus.PROCESSING,
    });

    await this.videoProcessingQueue.add(
      PROCESS_VIDEO_JOB,
      { videoId: video.id },
      VIDEO_PROCESSING_JOB_OPTIONS,
    );
  }

  async findForViewer(
    id: string,
    viewerUserId: string | undefined,
  ): Promise<VideoResponseDto> {
    const video = await this.findVisibleVideoOrThrow(id, viewerUserId);

    return {
      id: video.id,
      title: video.title,
      status: video.status,
      durationInSeconds: video.duration_in_seconds,
      width: video.width,
      height: video.height,
      codec: video.codec,
      container: video.container,
      bitrateKbps: video.bitrate_kbps,
      createdAt: video.created_at,
    };
  }

  async getStreamUrl(
    id: string,
    viewerUserId: string | undefined,
  ): Promise<string> {
    const video = await this.findVisibleVideoOrThrow(id, viewerUserId);
    if (video.status !== VideoStatus.READY) {
      throw new VideoNotReadyException();
    }
    return this.storageService.getDownloadUrl(video.original_file_key);
  }

  async getDownloadUrl(
    id: string,
    viewerUserId: string | undefined,
  ): Promise<string> {
    const video = await this.findVisibleVideoOrThrow(id, viewerUserId);
    if (video.status !== VideoStatus.READY) {
      throw new VideoNotReadyException();
    }
    return this.storageService.getDownloadUrl(video.original_file_key, {
      attachment: true,
      filename: video.original_file_name,
    });
  }
}
