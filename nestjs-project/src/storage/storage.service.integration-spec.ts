import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import storageConfig from '../config/storage.config';
import { StorageModule } from './storage.module';
import { StorageService } from './storage.service';

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as Buffer));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

describe('StorageService (integration)', () => {
  let storageService: StorageService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [storageConfig] }),
        StorageModule,
      ],
    }).compile();

    await moduleRef.init();
    storageService = moduleRef.get(StorageService);
  }, 30000);

  it('creates the bucket automatically on module init', async () => {
    await expect(storageService.ensureBucketExists()).resolves.not.toThrow();
  });

  it('completes a single-part multipart upload against real MinIO', async () => {
    const key = `videos/test-${Date.now()}/original.txt`;
    const content = 'hello streamtube';

    const uploadId = await storageService.createMultipartUpload(key);
    expect(uploadId).toBeTruthy();

    const partUrl = await storageService.getUploadPartUrl(key, uploadId, 1);
    const putResponse = await fetch(partUrl, {
      method: 'PUT',
      body: content,
    });
    expect(putResponse.ok).toBe(true);
    const etag = putResponse.headers.get('etag');
    expect(etag).toBeTruthy();

    await storageService.completeMultipartUpload(key, uploadId, [
      { partNumber: 1, etag: etag! },
    ]);

    const stream = await storageService.getObjectStream(key);
    const downloaded = await streamToString(
      stream as unknown as NodeJS.ReadableStream,
    );
    expect(downloaded).toBe(content);
  }, 30000);

  it('aborts a multipart upload', async () => {
    const key = `videos/test-abort-${Date.now()}/original.txt`;
    const uploadId = await storageService.createMultipartUpload(key);

    await expect(
      storageService.abortMultipartUpload(key, uploadId),
    ).resolves.not.toThrow();
  });

  it('returns a working presigned download URL', async () => {
    const key = `videos/test-download-${Date.now()}/original.txt`;
    const content = 'download me';
    const uploadId = await storageService.createMultipartUpload(key);
    const partUrl = await storageService.getUploadPartUrl(key, uploadId, 1);
    const putResponse = await fetch(partUrl, { method: 'PUT', body: content });
    const etag = putResponse.headers.get('etag')!;
    await storageService.completeMultipartUpload(key, uploadId, [
      { partNumber: 1, etag },
    ]);

    const downloadUrl = await storageService.getDownloadUrl(key);
    const getResponse = await fetch(downloadUrl);
    expect(getResponse.ok).toBe(true);
    expect(await getResponse.text()).toBe(content);
  }, 30000);

  it('sets Content-Disposition attachment when requested', async () => {
    const key = `videos/test-attachment-${Date.now()}/original.txt`;
    const uploadId = await storageService.createMultipartUpload(key);
    const partUrl = await storageService.getUploadPartUrl(key, uploadId, 1);
    const putResponse = await fetch(partUrl, { method: 'PUT', body: 'x' });
    const etag = putResponse.headers.get('etag')!;
    await storageService.completeMultipartUpload(key, uploadId, [
      { partNumber: 1, etag },
    ]);

    const downloadUrl = await storageService.getDownloadUrl(key, {
      attachment: true,
      filename: 'my-video.mp4',
    });
    const getResponse = await fetch(downloadUrl);
    expect(getResponse.headers.get('content-disposition')).toContain(
      'attachment',
    );
    expect(getResponse.headers.get('content-disposition')).toContain(
      'my-video.mp4',
    );
  }, 30000);
});
