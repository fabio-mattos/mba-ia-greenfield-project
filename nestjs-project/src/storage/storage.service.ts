import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import * as Minio from 'minio';
import storageConfig from '../config/storage.config';

@Injectable()
export class StorageService implements OnApplicationBootstrap {
  private readonly client: Minio.Client;

  constructor(
    @Inject(storageConfig.KEY)
    private readonly config: ConfigType<typeof storageConfig>,
  ) {
    this.client = new Minio.Client({
      endPoint: config.endpoint,
      port: config.port,
      useSSL: config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureBucketExists(this.config.bucketVideos);
    await this.ensureBucketExists(this.config.bucketThumbnails);
  }

  private async ensureBucketExists(bucket: string): Promise<void> {
    const exists = await this.client.bucketExists(bucket);
    if (!exists) {
      await this.client.makeBucket(bucket);
    }
  }

  async getPresignedPutUrl(
    bucket: string,
    key: string,
    ttlSeconds: number,
  ): Promise<string> {
    return this.client.presignedPutObject(bucket, key, ttlSeconds);
  }

  async getPresignedGetUrl(
    bucket: string,
    key: string,
    ttlSeconds: number,
  ): Promise<string> {
    return this.client.presignedGetObject(bucket, key, ttlSeconds);
  }

  async getPresignedGetUrlWithDisposition(
    bucket: string,
    key: string,
    ttlSeconds: number,
    filename: string,
  ): Promise<string> {
    return this.client.presignedGetObject(bucket, key, ttlSeconds, {
      'response-content-disposition': `attachment; filename="${filename}"`,
    });
  }

  async putObject(
    bucket: string,
    key: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<void> {
    await this.client.putObject(bucket, key, buffer, buffer.length, {
      'Content-Type': mimeType,
    });
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    await this.client.removeObject(bucket, key);
  }
}
