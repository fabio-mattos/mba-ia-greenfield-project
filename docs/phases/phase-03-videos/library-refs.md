---
libs:
  "@nestjs/bullmq":
    version: "^11.0.4"
    context7_id: "n/a — fetched via WebSearch (context7 MCP unavailable in this environment)"
    fetched_at: "2026-07-13T20:05:00-03:00"
  "bullmq":
    version: "^5.80.0"
    context7_id: "n/a — fetched via WebSearch"
    fetched_at: "2026-07-13T20:05:00-03:00"
  "ioredis":
    version: "^5.10.0"
    context7_id: "n/a — fetched via WebSearch"
    fetched_at: "2026-07-13T20:05:00-03:00"
  "@aws-sdk/client-s3":
    version: "^3.700.0"
    context7_id: "n/a — fetched via WebSearch"
    fetched_at: "2026-07-13T20:05:00-03:00"
  "@aws-sdk/s3-request-presigner":
    version: "^3.700.0"
    context7_id: "n/a — fetched via WebSearch"
    fetched_at: "2026-07-13T20:05:00-03:00"
  "fluent-ffmpeg":
    version: "^2.1.3"
    context7_id: "n/a — fetched via WebSearch"
    fetched_at: "2026-07-13T20:05:00-03:00"
sources_mtime:
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-07-13T19:57:10-03:00"
---

> **Note on sourcing:** the `context7` MCP server is not configured/available in this working environment (`.mcp.json` would need a Context7 API key). Per `CLAUDE.md`'s Library Documentation Lookup rule, this cache was built from official docs/changelogs via `WebSearch` instead, and the discrepancy is flagged here. Before running `npm install` in implementation, re-verify these version ranges against the registry (`npm view <pkg> versions`) since they may have moved.

## @nestjs/bullmq

NestJS-native wrapper around BullMQ. Latest `11.0.4` declares peer deps `@nestjs/common`/`@nestjs/core` `^10.0.0 || ^11.0.0` — compatible with this project's NestJS 11.

Usage relevant to this phase:

```ts
// queue.module.ts
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: (config: ConfigType<typeof queueConfig>) => ({
        connection: { host: config.host, port: config.port },
      }),
      inject: [queueConfig.KEY],
    }),
    BullModule.registerQueue({ name: 'video-processing' }),
  ],
})
export class QueueModule {}
```

```ts
// video-processing.producer.ts
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

constructor(@InjectQueue('video-processing') private queue: Queue) {}

await this.queue.add('process-video', { videoId }, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
});
```

```ts
// video-processing.consumer.ts (worker app)
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('video-processing')
export class VideoProcessingConsumer extends WorkerHost {
  async process(job: Job<{ videoId: string }>): Promise<void> {
    // extract metadata, generate thumbnail, update status
  }
}
```

`@Processor` classes must extend `WorkerHost` and implement `process()` in this BullMQ-based API (this differs from the older `@nestjs/bull` `@Process()` decorator style — do not mix the two packages).

## bullmq

Redis-backed queue library. Current major is v5. Default retry/backoff is configured per-job (`attempts`, `backoff`) as shown above. Job progress can be reported via `job.updateProgress()`, useful for reflecting `processing` sub-state if needed. Failed jobs (after all attempts) move to the `failed` state on the queue and can be inspected/retried via `queue.getJob(id)` — the video worker's failure handler (SI implementing TD-07) listens for this to flip the video row to `failed`.

## ioredis

Redis client used internally by BullMQ (`connection` option above accepts the same shape as the `ioredis` constructor options). No direct application code needed beyond the connection config — BullMQ owns the client lifecycle.

## @aws-sdk/client-s3

AWS SDK v3, modular S3 client. Fully compatible with MinIO (S3 API-compatible) by pointing `endpoint` at the MinIO service and setting `forcePathStyle: true` (MinIO/most S3-compatible providers require path-style addressing, unlike AWS S3's virtual-hosted style).

```ts
// storage.module — S3Client construction
new S3Client({
  region: 'us-east-1', // required by the SDK even though MinIO ignores it
  endpoint: `http://${minioConfig.host}:${minioConfig.port}`, // Compose service name, per CLAUDE.md Docker Networking rule
  forcePathStyle: true,
  credentials: { accessKeyId: minioConfig.accessKey, secretAccessKey: minioConfig.secretKey },
});
```

Multipart upload commands relevant to TD-02:

```ts
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';

// 1) API initiates:
const { UploadId } = await s3.send(new CreateMultipartUploadCommand({ Bucket, Key }));

// 2) API issues one presigned URL per part (client uploads parts directly to MinIO):
const url = await getSignedUrl(s3, new UploadPartCommand({ Bucket, Key, UploadId, PartNumber }), { expiresIn: 3600 });

// 3) After the client uploads all parts, API completes (client reports ETags per part):
await s3.send(new CompleteMultipartUploadCommand({
  Bucket, Key, UploadId,
  MultipartUpload: { Parts: parts.map(p => ({ ETag: p.etag, PartNumber: p.partNumber })) },
}));

// Abort path (upload cancelled/expired) — releases storage:
await s3.send(new AbortMultipartUploadCommand({ Bucket, Key, UploadId }));
```

`GetObjectCommand` is used by the worker to download the original file for FFmpeg processing (or FFmpeg can read directly via a presigned URL as input — the worker's SI decides which; downloading to a temp file is the simpler, more robust default for `fluent-ffmpeg` since it needs seekable input for `ffprobe`).

## @aws-sdk/s3-request-presigner

Provides `getSignedUrl(client, command, { expiresIn })`, used both for TD-02's per-part upload URLs and TD-06's streaming/download redirect URLs (`GetObjectCommand`, with `ResponseContentDisposition: 'attachment; filename="..."'` for the download variant).

## fluent-ffmpeg

Thin Node wrapper around the `ffmpeg`/`ffprobe` CLI binaries (installed via `apt-get install -y ffmpeg` in the worker's Dockerfile per TD-04 — this also provides `ffprobe`, bundled with the same package on Debian/Ubuntu).

```ts
import ffmpeg from 'fluent-ffmpeg';

// Metadata extraction (TD-04's Revision — concrete field list):
ffmpeg.ffprobe(localFilePath, (err, metadata) => {
  const stream = metadata.streams.find((s) => s.codec_type === 'video');
  const durationInSeconds = metadata.format.duration;
  const { width, height, codec_name: codec } = stream;
  const container = metadata.format.format_name;
  const bitrateKbps = Math.round(Number(metadata.format.bit_rate) / 1000);
});

// Thumbnail generation (single frame):
ffmpeg(localFilePath)
  .screenshots({ count: 1, timemarks: ['10%'], filename: 'thumbnail.jpg', folder: tmpDir });
```

`@types/fluent-ffmpeg` provides the TypeScript typings (the library itself ships without types).
