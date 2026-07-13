---
libs:
  "bullmq":
    version: "^5.56.9"
    context7_id: "unavailable — Context7 MCP not connected in this session; compiled from installed package + actual usage in video-worker/src/worker.ts and nestjs-project/src/queue/"
    fetched_at: "2026-07-13T18:00:00-03:00"
  "minio":
    version: "^8.0.5"
    context7_id: "unavailable — Context7 MCP not connected in this session; compiled from installed package + actual usage in nestjs-project/src/storage/storage.service.ts and video-worker/src/minio-client.ts"
    fetched_at: "2026-07-13T18:00:00-03:00"
  "fluent-ffmpeg":
    version: "^2.1.3"
    context7_id: "unavailable — Context7 MCP not connected in this session; compiled from installed package + actual usage in video-worker/src/processor.ts"
    fetched_at: "2026-07-13T18:00:00-03:00"
  "pg":
    version: "^8.20.0"
    context7_id: "unavailable — Context7 MCP not connected in this session; compiled from installed package + actual usage in video-worker/src/database.ts"
    fetched_at: "2026-07-13T18:00:00-03:00"
sources_mtime:
  docs/decisions/technical-decisions-phase-03-upload-processamento.md: "2026-07-13T18:15:24-03:00"
---

# library-refs — phase-03-upload-processamento

> **Note:** the `context7` MCP tool required by `plan-resolve/SKILL.md` Step 5 is not connected in this session. Per project `CLAUDE.md`, library documentation must normally be looked up via `context7` before implementation; since this phase's code already exists, the excerpts below were compiled from the installed package versions (`package.json`) and the project's own usage of each API (cited per file) instead. **Flag for follow-up:** re-run this step with `context7` available to replace these excerpts with verified upstream docs and confirm no deprecated APIs are in use.

## bullmq (`^5.56.9`)

Used in two places:
- `nestjs-project/src/queue/video-processing.producer.ts` — producer side. `@InjectQueue(VIDEO_PROCESSING_QUEUE)` (via `@nestjs/bullmq@^11.0.2`) injects a `Queue` instance; `queue.add(jobName, payload)` enqueues a job with `{ videoId }`.
- `video-worker/src/worker.ts` — consumer side, plain `bullmq` (no NestJS). `new Worker(queueName, processorFn, { connection: { host, port }, concurrency })` — the processor function receives `job.data`, and BullMQ handles retry/backoff via `defaultJobOptions` (phase-03-upload-processamento/TD-06: `attempts: 3`, `backoff: { type: 'exponential', delay: 5000 }`) configured on the queue side, not the worker side.

Relevant surface for this phase: `Queue.add()`, `Worker` constructor options (`connection`, `concurrency`), `worker.on('failed' | 'error', ...)` event handlers, `defaultJobOptions.attempts` / `.backoff`. Both producer and consumer must point at the same Redis connection and queue name (`VIDEO_PROCESSING_QUEUE` constant, shared only by convention — the two subprojects do not share code).

## minio (`^8.0.5`)

Official MinIO JS SDK, used identically in both subprojects (each has its own client instantiation — no shared code):
- `nestjs-project/src/storage/storage.service.ts` — `new Minio.Client({ endPoint, port, useSSL, accessKey, secretKey })`; `bucketExists` / `makeBucket` (bootstrap); `presignedPutObject(bucket, key, ttlSeconds)` (upload — TD-04); `presignedGetObject(bucket, key, ttlSeconds, { 'response-content-disposition': ... })` (stream/download — the `response-content-disposition` request-param overrides make the same method serve both "watch" and "force download" per TD-04's Capability extension); `putObject(bucket, key, buffer, length, { 'Content-Type': mimeType })`; `removeObject(bucket, key)`.
- `video-worker/src/minio-client.ts` — consumer-side counterpart: reads via a presigned GET URL obtained from the API side (not a direct SDK call — the worker downloads over HTTP), uploads the generated thumbnail via `putObject`-equivalent (`uploadBuffer` wrapper).

Relevant surface for this phase: `presignedPutObject`, `presignedGetObject` (with response-header overrides), `putObject`, `removeObject`, `bucketExists`/`makeBucket`. No multipart/streaming SDK APIs are used — large files never pass through either Node process (TD-04, Option B).

## fluent-ffmpeg (`^2.1.3`)

`video-worker/src/processor.ts` only (not a `nestjs-project` dependency — isolated to the worker image per TD-01/TD-03):
- `ffmpeg.ffprobe(filePath, callback)` — metadata extraction; `metadata.format.duration` is the field read for `durationSeconds`.
- `ffmpeg(filePath).seekInput(seekSeconds).frames(1).output(outputPath).on('end', ...).on('error', ...).run()` — single-frame thumbnail extraction at a computed seek offset (TD-07's `seekSeconds = durationSeconds > 1 ? Math.min(5, durationSeconds / 2) : 0` formula).

Requires the native `ffmpeg`/`ffprobe` binaries on `PATH` inside the container (`apk add --no-cache ffmpeg` in `video-worker/Dockerfile{,.dev}`) — `fluent-ffmpeg` is a thin wrapper, not a WASM/bundled binary.

## pg (`^8.20.0`)

Two distinct usages:
- `nestjs-project` — transitive dependency of TypeORM's Postgres driver; not used directly (no raw `pg.Pool` in `nestjs-project/src`).
- `video-worker/src/database.ts` — direct usage (TD-05: raw `pg.Pool`, no ORM). `new Pool({ host, port, user, password, database })`; `pool.query(sql, params)` for all 3 fixed queries (`SELECT file_key FROM videos WHERE id = $1`; two `UPDATE videos SET ... WHERE id = $1`); `pool.end()` for graceful shutdown (`closePool`).

Relevant surface for this phase: `Pool` constructor, `pool.query(text, values)` parameterized queries, `pool.end()`. No transactions, no connection-per-request pattern — a single module-level `Pool` is shared across all job invocations in the worker process.
