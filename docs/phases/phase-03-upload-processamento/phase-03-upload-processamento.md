---
kind: phase
name: phase-03-upload-processamento
sources_mtime:
  docs/phases/phase-03-upload-processamento/context.md: "2026-07-13T18:21:03-03:00"
  docs/decisions/technical-decisions-phase-03-upload-processamento.md: "2026-07-13T18:15:24-03:00"
  docs/phases/phase-02-auth/phase-02-auth.md: "2026-06-29T18:30:43-03:00"
  docs/phases/phase-03-upload-processamento/library-refs.md: "2026-07-13T18:21:03-03:00"
note: "Retroactive — this plan was written after the code already existed (see the `note` in context.md and technical-decisions-phase-03-upload-processamento.md). It closes the gap flagged in validation.md: context/validation/progress existed for Fase 03 but the plan artifact with Step Implementations and Technical Specifications did not, and the original work had been committed directly to main. Reconstructed from the actual implementation on branch `docs/phase-03-plano-retroativo` (branched from `dev`), following the same context → validate → build flow used for prospective phases. **2026-07-13 correction pass:** re-ran /plan-context → /plan-validate → /plan-resolve → /plan-validate → /plan-build end-to-end per code review feedback. /plan-validate found 6 real issues on the first pass (non-canonical `Scope: video-worker/` on 3 TDs; 5 capabilities with no TD explicitly citing them, only a vague blanket Transversal marker) — closed by narrowing/broadening existing TDs' `Capability:` fields and adding TD-08 (Video URL Uniqueness Strategy), then /plan-resolve materialized the previously-missing `library-refs.md`. This artifact's Technical Specifications were patched to cite TD-08; the Step Implementations below are unchanged (they already described the actual shipped code correctly)."
---

# Phase 03 — Upload e Processamento de Vídeos

## Objective

Deliver direct-to-storage video upload (files up to 10GB, without impacting API performance), automatic draft-video creation at upload start, standalone background processing (duration extraction + thumbnail generation), and unique-URL streaming/download — establishing the object storage and job-queue infrastructure that all subsequent video-management phases build on.

---

## Step Implementations

### SI-03.1 — Object Storage & Queue Infrastructure

**Description:** Add MinIO (S3-compatible object storage) and Redis (BullMQ backing store) to the Docker Compose environment, and create the `StorageModule`/`StorageService` (presigned PUT/GET) and `QueueModule`/`VideoProcessingProducer` (BullMQ) in `nestjs-project`.

**Technical actions:**

1. Add `minio` service to `nestjs-project/compose.yaml` — image `minio/minio:latest`, `command: server /data --console-address ":9001"`, ports `9000:9000`/`9001:9001`, env `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`, healthcheck `curl -f http://localhost:9000/minio/health/live`
2. Add `redis` service — image `redis:7-alpine`, port `6379:6379`, healthcheck `redis-cli ping`
3. Create `src/config/storage.config.ts` (`registerAs('storage', ...)`) reading `MINIO_ENDPOINT` (default `'minio'`), `MINIO_PORT` (default `9000`), `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_USE_SSL`, `MINIO_BUCKET_VIDEOS` (default `'videos'`), `MINIO_BUCKET_THUMBNAILS` (default `'thumbnails'`), `MINIO_PRESIGNED_UPLOAD_TTL` (default `7200`s), `MINIO_PRESIGNED_STREAM_TTL` (default `21600`s)
4. Create `src/storage/storage.service.ts` — `StorageService implements OnApplicationBootstrap`, wraps `minio.Client`; `onApplicationBootstrap()` ensures both buckets exist (`bucketExists` → `makeBucket` if missing); implements `getPresignedPutUrl`, `getPresignedGetUrl`, `getPresignedGetUrlWithDisposition`, `putObject`, `deleteObject` (per TD-02)
5. Create `src/config/queue.config.ts` (`registerAs('queue', ...)`, `REDIS_HOST`/`REDIS_PORT`), `src/queue/video-processing.constants.ts` (`VIDEO_PROCESSING_QUEUE = 'video-processing'`, `VIDEO_PROCESSING_JOB = 'process'`), `src/queue/queue.module.ts` (`BullModule.forRootAsync` + `BullModule.registerQueue`), and `src/queue/video-processing.producer.ts` (`VideoProcessingProducer.enqueue(videoId)`)

**Tests:** _(empty — no dedicated spec files existed for `StorageService`/`QueueModule` at the time; covered indirectly via `videos.service.spec.ts` mocks and, on the worker side, by SI-03.4)_

**Dependencies:** None

**Acceptance criteria:**

- `docker compose up` starts `minio` and `redis` as healthy services
- On NestJS bootstrap, the `videos` and `thumbnails` buckets exist in MinIO (auto-created if absent)
- `StorageService.getPresignedPutUrl` / `getPresignedGetUrl` return a valid presigned MinIO URL for a given bucket/key
- Calling `VideoProcessingProducer.enqueue(videoId)` creates a `process` job on the `video-processing` queue with payload `{ videoId }`

---

### SI-03.2 — Upload Initiate/Confirm Endpoints, Draft Video Lifecycle, and Streaming/Download URLs

**Description:** Add the `Video` entity and migration, and implement the upload initiate/confirm endpoints (TD-04's presigned-PUT strategy) plus the streaming/download presigned-GET endpoints that make an uploaded, processed video watchable and downloadable.

**Technical actions:**

1. Create `src/videos/entities/video.entity.ts` — `@Entity('videos')` `Video` with `id` (uuid PK), `slug` (varchar(12), unique), `status` (enum `VideoStatus`, default `draft`), `file_key` (varchar, nullable), `thumbnail_key` (varchar, nullable), `duration_seconds` (integer, nullable), `channel_id` (uuid FK → channels, `onDelete: CASCADE`), `category_id` (uuid FK → categories, nullable, `onDelete: SET NULL`), `created_at`/`updated_at`. `VideoStatus` (`draft | processing | ready | failed`) and `VideoVisibility` (`public | unlisted`) enums exported from the same file
2. Create `src/videos/slug.util.ts` — `generateVideoSlug()`: 11-character random slug from `[A-Za-z0-9]` via `crypto.randomBytes`
3. Generate migration `CreateVideos` — `videos` table + `video_status_enum`/`video_visibility_enum` Postgres enum types, indexes on `channel_id`/`status`/`visibility`, unique constraint on `slug`, FKs to `channels` (CASCADE) and `categories` (SET NULL)
4. Create `src/videos/dto/initiate-upload.dto.ts` (`InitiateUploadDto.original_filename: string`, `@IsString() @MinLength(1) @MaxLength(255)`)
5. Create `src/videos/videos.service.ts` — `initiateUpload(channelId, originalFilename)`: unique-slug generation retried up to `MAX_SLUG_RETRIES = 5`, `file_key = uploads/{slug}/{original_filename}`, creates a `DRAFT` video, requests a presigned PUT via `StorageService` (TD-04), returns `{ videoId, slug, uploadUrl }`; `confirmUpload(videoId, channelId)`: looks up by `{ id, channel_id }` (`VideoNotFoundException` if absent, `VideoAlreadyProcessingException` if `status !== DRAFT`), transitions to `PROCESSING`, calls `VideoProcessingProducer.enqueue`; `getStreamUrl`/`getDownloadUrl`: `assertViewable` gate + `file_key` presence check (`VideoNotReadyException` otherwise), presigned GET (download variant adds `Content-Disposition: attachment; filename="{title ?? slug}.mp4"`)
6. Create `src/videos/videos.controller.ts` (`@Controller('videos')`) — `POST upload/initiate` and `POST :id/upload/confirm` (both behind the global JWT guard, no `@Public()`), `GET :slug/stream` and `GET :slug/download` (both `@Public()`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService` | Unit: mocked repository/storage/producer — initiate/confirm/stream/download branch logic | `src/videos/videos.service.spec.ts` |

**Dependencies:** SI-03.1

**Acceptance criteria:**

- `POST /videos/upload/initiate` with a valid `original_filename` and a valid access token returns `201` with `{ videoId, slug, uploadUrl }`; a `DRAFT` video row is created with a unique `slug` and `file_key`
- `POST /videos/upload/initiate` without an access token returns `401`
- `POST /videos/:id/upload/confirm` for a `DRAFT` video owned by the caller's channel returns `202`, transitions the video to `PROCESSING`, and enqueues a `process` job on `video-processing`
- `POST /videos/:id/upload/confirm` for a non-existent video, or one not owned by the caller's channel, returns `404` with `VIDEO_NOT_FOUND`
- `POST /videos/:id/upload/confirm` for a video already past `DRAFT` (`processing`/`ready`/`failed`) returns `409` with `VIDEO_ALREADY_PROCESSING`
- `GET /videos/:slug/stream` for a video not yet `ready` returns `422` with `VIDEO_NOT_READY`; for a `ready` video with a `file_key`, returns `200` with `{ url }`
- `GET /videos/:slug/download` behaves like stream, but the returned URL forces `Content-Disposition: attachment`

---

### SI-03.3 — Standalone Video Processing Worker

**Description:** Build `video-worker/`, a standalone Node.js service (no NestJS/TypeORM, per TD-01/TD-05) that consumes the `video-processing` queue: downloads the uploaded file via a presigned URL, extracts duration and a thumbnail frame with `fluent-ffmpeg`, uploads the thumbnail, and updates the video's status.

**Technical actions:**

1. Create the `video-worker/` package (`bullmq`, `fluent-ffmpeg`, `minio`, `pg` as production dependencies) per TD-01
2. Create `video-worker/src/minio-client.ts` — `minioClient` (`Minio.Client`) + `BUCKET_VIDEOS`/`BUCKET_THUMBNAILS` from env; `getPresignedGetUrl(bucket, key, ttl=3600)`, `uploadBuffer(bucket, key, buffer, mimeType)`
3. Create `video-worker/src/database.ts` — raw `pg.Pool` (per TD-05); `getVideoById` (`SELECT file_key FROM videos WHERE id = $1`), `updateVideoProcessed` (`UPDATE videos SET status = 'ready', duration_seconds = $1, thumbnail_key = $2, updated_at = now() WHERE id = $3`), `updateVideoFailed` (`UPDATE videos SET status = 'failed', updated_at = now() WHERE id = $1`)
4. Create `video-worker/src/processor.ts` — `processVideo(videoId)`: creates a temp dir, gets a presigned GET URL (7200s TTL) and downloads the file, runs `ffmpeg.ffprobe` for duration (per TD-03), extracts a thumbnail frame via `ffmpeg(...).seekInput(seekSeconds).frames(1)`, uploads the thumbnail, calls `updateVideoProcessed`; on any error calls `updateVideoFailed` then re-throws (so BullMQ retry applies); always cleans up the temp dir in a `finally`
5. Create `video-worker/src/worker.ts` — BullMQ `Worker('video-processing', handler, { connection, concurrency: 2 })` wired to `processVideo`; add `video-worker` service (`Dockerfile`/`Dockerfile.dev`, `apk add --no-cache ffmpeg`) to `nestjs-project/compose.yaml`, depending on `db`, `redis`, `minio` (all healthy)

**Tests:** _(empty — no automated tests existed at the time this code was written; added retroactively in SI-03.4)_

**Dependencies:** SI-03.1, SI-03.2 (consumes the `file_key`/queue payload contract SI-03.2 produces)

**Acceptance criteria:**

- A `process` job with `{ videoId }` for a video with an uploaded file results in `videos.status = 'ready'`, `duration_seconds` populated, and `thumbnail_key` populated in Postgres
- The generated thumbnail object exists in the `thumbnails` MinIO bucket at `thumbnails/{videoId}.jpg`
- A job for a video whose file fails to download marks the video `failed` and the job errors (subject to retry — see SI-03.6)
- A job for a non-existent `videoId` throws `Video {id} not found in database` and the job fails

---

### SI-03.4 — Video Worker Automated Test Suite

**Description:** Add Jest + `ts-jest` to `video-worker` (it previously had no test script at all), wire a dev Docker container mirroring `nestjs-api`'s pattern, and write unit + integration tests for the MinIO client, database access, and processor.

**Technical actions:**

1. Add `jest`, `ts-jest`, `ts-node`, `typescript`, `@types/fluent-ffmpeg` as devDependencies to `video-worker/package.json`; configure Jest (`rootDir: 'src'`, `testRegex: '.*\.(spec|integration-spec)\.ts$'`) matching `nestjs-project`'s test-file convention
2. Create `video-worker/Dockerfile.dev` and bind-mount `video-worker/` in `nestjs-project/compose.yaml` (mirroring `nestjs-api`'s dev pattern) so `docker compose exec video-worker npm test` works
3. Create `video-worker/src/minio-client.spec.ts` (unit, mocked `Minio.Client`)
4. Create `video-worker/src/database.spec.ts` (unit, mocked `pg.Pool`)
5. Create `video-worker/src/processor.spec.ts` (unit, mocked ffmpeg/minio/database) and `video-worker/src/processor.integration-spec.ts` (integration — real Postgres/MinIO/ffmpeg; synthetic video fixtures generated via ffmpeg's `lavfi` test source, no committed binary fixtures)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `minio-client.ts` | Unit: mocked `Minio.Client` | `video-worker/src/minio-client.spec.ts` |
| `database.ts` | Unit: mocked `pg.Pool` | `video-worker/src/database.spec.ts` |
| `processor.ts` | Unit: mocked ffmpeg/minio/database | `video-worker/src/processor.spec.ts` |
| `processor.ts` | Integration: real Postgres/MinIO/ffmpeg, synthetic `lavfi` fixtures | `video-worker/src/processor.integration-spec.ts` |

**Dependencies:** SI-03.3

**Acceptance criteria:**

- `docker compose exec video-worker npm test` passes 16/16 tests across the four files above
- The integration test generates its own synthetic video fixture via ffmpeg's `lavfi` source and cleans up its own DB rows/MinIO objects afterward — no binary fixtures committed to the repository

---

### SI-03.5 — End-to-End Manual Validation

**Description:** Manually validate the full `initiate → PUT → confirm → process` pipeline against the real running stack — unit/integration tests exercise the NestJS producer and the worker consumer in isolation and do not confirm both sides agree on queue name/payload shape end-to-end.

**Technical actions:**

1. Register and confirm a real user against the running stack
2. Call `POST /videos/upload/initiate`, perform the presigned `PUT` upload against MinIO, then call `POST /videos/:id/upload/confirm`
3. Observe the `video-worker` logs and confirm the video reaches `status = 'ready'` with `duration_seconds`/`thumbnail_key` populated within ~2s
4. Confirm the thumbnail object exists in the `thumbnails` MinIO bucket
5. Clean up the manually-created test data afterward

**Tests:** _(empty — manual smoke test; not automated in this task's scope)_

**Dependencies:** SI-03.2, SI-03.3, SI-03.4

**Acceptance criteria:**

- The end-to-end `initiate → PUT → confirm` flow against the real stack results in the video transitioning to `ready` with populated `duration_seconds` and `thumbnail_key`
- The producer (`nestjs-project`) and consumer (`video-worker`) agree on queue name (`video-processing`) and payload shape (`{ videoId }`) in a real run, not just in isolated tests
- Manual test data is removed after validation — no leftover rows/objects

---

### SI-03.6 — Worker Robustness Fixes (TD-06, TD-07)

**Description:** Fix two robustness gaps found while closing out Fase 03: transient job failures had no retry, and the fixed 5-second thumbnail seek broke videos shorter than 5 seconds.

**Technical actions:**

1. `queue.module.ts` — add `defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }` to `BullModule.registerQueue` (per TD-06)
2. `processor.ts` — change the thumbnail seek to `seekSeconds = durationSeconds > 1 ? Math.min(5, durationSeconds / 2) : 0` instead of a fixed `5` (per TD-07), fixing videos shorter than 5s always failing
3. `processor.ts` `downloadFile` — check `res.statusCode` before writing to disk; reject with `Download failed with status {N}` instead of silently writing an error-page body and failing confusingly later in `ffprobe`; add a `request.on('error', ...)` handler for connection-level failures (DNS, `ECONNREFUSED`)
4. Extend `processor.spec.ts` with 3 cases (non-2xx download status, short-video seek, download error) and `processor.integration-spec.ts` with 1 case (a video shorter than 5s still gets a thumbnail)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `processor.ts` | Unit: +3 cases (non-2xx download, short-video seek, download error) | `video-worker/src/processor.spec.ts` |
| `processor.ts` | Integration: +1 case (<5s video still gets a thumbnail) | `video-worker/src/processor.integration-spec.ts` |

**Dependencies:** SI-03.3, SI-03.4

**Acceptance criteria:**

- A transient job failure (e.g. MinIO/Redis momentarily unreachable) is retried up to 3 times with exponential backoff (5s base delay) before the video is marked `failed`
- A video shorter than 5 seconds still receives a thumbnail — the seek offset scales down instead of making `ffmpeg` fail
- A non-2xx download response fails fast with an explicit `Download failed with status {N}` error instead of silently processing an error-page body

---

### SI-03.7 — Git Hygiene for `video-worker/`

**Description:** `video-worker/node_modules` and `dist/` (≈3500 files) had been committed with no `.gitignore`; remove them from version control.

**Technical actions:**

1. Create `video-worker/.gitignore` (`node_modules/`, `dist/`)
2. `git rm -r --cached video-worker/node_modules video-worker/dist`

**Tests:** _(empty — repository hygiene, not applicable)_

**Dependencies:** None

**Acceptance criteria:**

- `git status` no longer tracks `video-worker/node_modules` or `video-worker/dist`
- `video-worker/.gitignore` prevents them from being re-added accidentally

---

### SI-03.8 — Unrelated Pre-Existing Bug Found and Fixed: Migrations Test DB Corruption

**Description:** Discovered while re-running the full test suite as part of this close-out task's Definition-of-Done check. Unrelated to Fase 03 itself, but blocking: `migrations.integration-spec.ts` (Fase 02's migration infrastructure) was cascade-dropping shared `channels`/`users` foreign keys and the `channels.thumbnail_key` column on every run, breaking `POST /auth/forgot-password` with a 500. Full account in `docs/phases/phase-02-auth/progress.md` under SI-02.19.

**Technical actions:**

1. Give `migrations.integration-spec.ts` its own disposable Postgres database instead of operating on the shared dev database

**Tests:** full suite re-verified after the fix (177/177 unit+integration, 52/52 e2e, `video-worker` 16/16)

**Dependencies:** None (surfaced during this phase's close-out; the fix lives in Fase 02's migration infrastructure, not in Fase 03 code)

**Acceptance criteria:**

- `POST /auth/forgot-password` no longer 500s due to a missing `channels.thumbnail_key` column
- The full test suite (`nestjs-project` unit+integration+e2e, `video-worker` unit+integration) passes after the fix

---

## Technical Specifications

### Data Model

#### Video

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, generated | |
| slug | varchar(12) | unique, not null | 11-char random slug (`generateVideoSlug`) — guarantees a unique URL per video (per TD-08) |
| status | enum (`video_status_enum`) | not null, default `draft` | `draft \| processing \| ready \| failed` — drives the upload/processing lifecycle owned by this phase |
| file_key | varchar | nullable | Object key of the uploaded file in the `videos` MinIO bucket; set at `initiateUpload`, read by the worker and by `getStreamUrl`/`getDownloadUrl` |
| thumbnail_key | varchar | nullable | Object key of the generated thumbnail in the `thumbnails` MinIO bucket; set by the worker after processing |
| duration_seconds | integer | nullable | Set by the worker via `ffprobe` |
| channel_id | uuid | FK → channels.id, not null, `ON DELETE CASCADE` | Owning channel |
| category_id | uuid | FK → categories.id, nullable, `ON DELETE SET NULL` | Owned by Fase 04 (categories); present in the schema from the initial migration but out of scope here |
| title, description | varchar(255) / text | nullable | Owned by Fase 04 (edição de informações do vídeo) — out of scope here |
| visibility, published_at | enum (`video_visibility_enum`) / timestamp | nullable | Owned by Fase 04 (rascunho → publicação) — out of scope here |
| view_count | integer | not null, default 0 | Owned by later phases (Fase 05/07) — out of scope here |
| created_at, updated_at | timestamp | not null, auto-generated | |

**Relations:** Video → Channel (many-to-one, `ON DELETE CASCADE`), Video → Category (many-to-one, `ON DELETE SET NULL`)
**Indexes:** `(slug)` — unique, `(channel_id)`, `(status)`, `(visibility)`

_Note: the `videos` table and its migration (`CreateVideos`) were created as a single migration covering the full lifecycle used across Fases 03–07 (this is a byproduct of the code predating this planning document — see the retroactive note above). Only the columns this phase actually populates/reads (`slug`, `status`, `file_key`, `thumbnail_key`, `duration_seconds`, `channel_id`) are in scope for Fase 03; the rest are documented here for schema completeness and attributed to their owning phase._

---

### API Contracts

#### POST /videos/upload/initiate (SI-03.2, per TD-04)

**Authorization:** Requires a valid access token (global JWT guard; no `@Public()`)

**Request body:**
- original_filename: string, required — 1 to 255 characters

**Response 201:**
- videoId: string (uuid)
- slug: string
- uploadUrl: string — presigned MinIO PUT URL, valid for `storage.presignedUploadTtl` seconds (default 7200)

**Error responses:**
- 401: missing/invalid access token

---

#### POST /videos/:id/upload/confirm (SI-03.2, per TD-04)

**Authorization:** Requires a valid access token

**Response 202:** No content.

**Error responses:**
- 404 VIDEO_NOT_FOUND: video does not exist, or does not belong to the caller's channel
- 409 VIDEO_ALREADY_PROCESSING: video is no longer `DRAFT` (upload already confirmed)
- 401: missing/invalid access token

---

#### GET /videos/:slug/stream (SI-03.2, per TD-04)

**Authorization:** `@Public()`

**Response 200:**
- url: string — presigned MinIO GET URL, valid for `storage.presignedStreamTtl` seconds (default 21600)

**Error responses:**
- 404 VIDEO_NOT_FOUND: video does not exist, or is not viewable by the requester (owner-or-public-and-ready check — see `assertViewable` in SI-03.2)
- 422 VIDEO_NOT_READY: video exists and is viewable, but has no `file_key` / is not `ready`

---

#### GET /videos/:slug/download (SI-03.2, per TD-04)

**Authorization:** `@Public()`

**Response 200:**
- url: string — presigned MinIO GET URL (valid for 3600 seconds), with `Content-Disposition: attachment; filename="{title ?? slug}.mp4"`

**Error responses:**
- 404 VIDEO_NOT_FOUND
- 422 VIDEO_NOT_READY

---

### Error Catalog

**Error response format:** (inherited from Fase 02 — `{ statusCode, error, message }` via the global `DomainException` filter)

| Code | HTTP | Message | Trigger |
|------|------|---------|---------|
| VIDEO_NOT_FOUND | 404 | Video not found | `confirmUpload`/`getStreamUrl`/`getDownloadUrl` for a video that doesn't exist, doesn't belong to the caller's channel (confirm), or isn't viewable by the requester (stream/download) |
| VIDEO_ALREADY_PROCESSING | 409 | Video upload has already been confirmed | `POST /videos/:id/upload/confirm` on a video no longer in `DRAFT` |
| VIDEO_NOT_READY | 422 | Video is not ready for streaming | `GET /videos/:slug/stream` or `/download` on a video without a `file_key` / not yet `ready` |

_`NOT_VIDEO_OWNER` (403) also exists on `Video`-related exceptions but is only triggered by Fase 04 endpoints (update/publish/delete/custom-thumbnail) — out of scope here._

---

### Events/Messages

**Queue:** `video-processing` (BullMQ, Redis-backed) — constant `VIDEO_PROCESSING_QUEUE` in `nestjs-project`; the worker reads the same literal from `process.env.VIDEO_PROCESSING_QUEUE` or defaults to the same string (no shared constants module between the two subprojects — matching queue names is a runtime contract, not a compile-time one)

**Job name:** `process` (constant `VIDEO_PROCESSING_JOB`)

**Payload:** `{ videoId: string }`

**Producer:** `VideoProcessingProducer.enqueue(videoId)` (`nestjs-project`), called from `VideosService.confirmUpload`

**Consumer:** `video-worker`'s BullMQ `Worker`, `concurrency: 2`, handler `processVideo(videoId)` (SI-03.3)

**Retry policy (SI-03.6, per TD-06):** `defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }`, configured once at `BullModule.registerQueue` — applies uniformly to every job on this queue

**Side effects on completion:** `videos.status → 'ready'`, `duration_seconds`, `thumbnail_key` populated; thumbnail object written to the `thumbnails` MinIO bucket

**Side effects on exhausted retries:** `videos.status → 'failed'`

---

## Dependency Map

```
SI-03.1 (root)
└── SI-03.2 — depends on SI-03.1 (needs StorageService + VideoProcessingProducer)
    └── SI-03.3 — depends on SI-03.1 + SI-03.2 (consumes file_key / queue payload contract)
        └── SI-03.4 — depends on SI-03.3 (tests the worker built there)
            ├── SI-03.5 — depends on SI-03.2 + SI-03.3 + SI-03.4 (end-to-end validation)
            └── SI-03.6 — depends on SI-03.3 + SI-03.4 (robustness fixes + their tests)

SI-03.7 (root, independent — repository hygiene)
SI-03.8 (root, independent — found during this phase's close-out; fix lives in Fase 02)
```

Linearized implementation order: SI-03.1 → SI-03.2 → SI-03.3 → SI-03.4 → SI-03.5, SI-03.6 (parallel) → SI-03.7, SI-03.8 (anytime, independent)

## Deliverables

- [ ] SI-03.1 — Object Storage & Queue Infrastructure
- [ ] SI-03.2 — Upload Initiate/Confirm Endpoints, Draft Video Lifecycle, and Streaming/Download URLs
- [ ] SI-03.3 — Standalone Video Processing Worker
- [ ] SI-03.4 — Video Worker Automated Test Suite
- [ ] SI-03.5 — End-to-End Manual Validation
- [ ] SI-03.6 — Worker Robustness Fixes (TD-06, TD-07)
- [ ] SI-03.7 — Git Hygiene for `video-worker/`
- [ ] SI-03.8 — Unrelated Pre-Existing Bug Found and Fixed: Migrations Test DB Corruption

**Full test suites:**

- [ ] `nestjs-project` unit+integration tests pass (`docker compose exec nestjs-api npm test -- --runInBand`)
- [ ] `nestjs-project` E2E tests pass (`docker compose exec nestjs-api npm run test:e2e`)
- [ ] `nestjs-project` type/compilation check passes (`docker compose exec nestjs-api npx tsc --noEmit`)
- [ ] `video-worker` tests pass (`docker compose exec video-worker npm test`)
- [ ] Upload of a file up to 10GB completes without proxying through the API process (presigned PUT, per TD-04)
- [ ] A video's URL (`slug`) never conflicts with another video's
