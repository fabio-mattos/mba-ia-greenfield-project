---
scope_type: phase
related_phases: [3]
status: decided
date: 2026-07-01
scope_description: "Backend foundation for video upload and background processing: object storage, job queue, standalone processing worker (metadata extraction, thumbnail generation), and direct-to-storage upload strategy."
note: "Retroactive — the code and infrastructure described here were already implemented (storage/queue/worker) before this document was written. These TDs record the decisions already embedded in that code, not an open choice being made now. TD-06 and TD-07 are the exception: they were decided and implemented as part of this same close-out task."
---

# Technical Decisions — Phase 03: Upload e Processamento de Vídeos

_Subprojects in scope:_

- `nestjs-project/` — upload endpoints (`initiate`/`confirm`), draft video lifecycle, storage/queue infrastructure.
- `video-worker/` — standalone Node.js service that consumes processing jobs and performs metadata/thumbnail extraction.
- `next-frontend/` — Deferred: upload/studio screens are out of scope for this document (frontend routes exist under `app/(studio)/upload` but were not planned/tracked through this process).

---

## TD-01: Video Processing Worker Architecture

**Scope:** Cross-layer (backend + infra)

**Capability:** Processamento automático do vídeo após upload (extração de duração e metadados), Geração automática de thumbnail, Serviço de processamento em segundo plano (filas)

**Context:** FFmpeg-based processing (metadata extraction + thumbnail generation) is CPU-heavy and must not block the API process. The choice is between running this inside the NestJS API (as a BullMQ `@Processor` in the same process/module) or as a fully separate service.

**Options:**

### Option A: In-process BullMQ Processor inside `nestjs-api`
- Add a `@Processor(VIDEO_PROCESSING_QUEUE)` class to the existing NestJS app, sharing its TypeORM connection and dependency injection container.
- **Pros:** Single codebase/deploy unit, reuses existing `VideosService`/`StorageService`, no duplicated DB access code.
- **Cons:** FFmpeg CPU spikes compete with the API's request-handling threads/event loop; scaling the worker independently of the API requires running multiple full API instances just to get more processing capacity; a worker crash (e.g., OOM from a large video) takes the API down with it.

### Option B: Standalone Node.js service (separate container)
- A dedicated lightweight Node.js process (own `package.json`, own `Dockerfile`) that only consumes the queue, using `bullmq`'s plain `Worker` (no NestJS), direct `pg` for the two DB writes it needs, and the `minio` SDK for storage.
- **Pros:** Isolated failure domain and independent scaling (matches the C4 diagram's separate "Video Worker" container); minimal dependency surface (no NestJS/TypeORM overhead for a process that only does 3 things: read one row, run ffmpeg, write one row); matches `docs/diagrams/software-arch.mermaid`.
- **Cons:** Small amount of duplicated logic (its own DB/storage client code, not reused from `nestjs-project`); two `package.json`/Docker images to maintain instead of one.

**Recommendation:** Option B — the architecture diagram already specifies a separate Video Worker container, and isolating FFmpeg's CPU/memory profile from the request-serving API is the right default for a video platform.

**Decision:** B (implemented as `video-worker/`)

**Libraries:** `bullmq@^5.x`, `fluent-ffmpeg@^2.1.x`, `minio@^8.x`, `pg@^8.x`

---

## TD-02: Object Storage Client

**Scope:** Backend

**Capability:** Serviço de armazenamento de arquivos (vídeos e thumbnails)

**Context:** The project runs MinIO locally (S3-compatible) per `docs/diagrams/software-arch.mermaid`. Both `nestjs-project` (presigned URL generation) and `video-worker` (download + thumbnail upload) need a storage client.

**Options:**

### Option A: AWS SDK v3 (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`)
- **Pros:** Same SDK works unmodified if the project ever migrates from MinIO to real S3; broad community usage; modular v3 packages.
- **Cons:** Heavier dependency surface (multiple `@aws-sdk/*` packages); more verbose API for simple presigned-URL/put/get operations.

### Option B: `minio` npm package (official MinIO JS SDK)
- **Pros:** Purpose-built for MinIO, simpler API surface for the operations actually needed (`presignedGetObject`, `presignedPutObject`, `putObject`, `removeObject`, `statObject`); one dependency instead of several `@aws-sdk/*` packages; works identically against MinIO in dev and MinIO/S3 in production since both are S3-API-compatible.
- **Cons:** If the project later moves off MinIO to a non-S3-compatible provider, the client would need to change (low risk — MinIO/S3 API is the de facto standard).

**Recommendation:** Option B — lighter dependency footprint for the operations this project actually performs, and MinIO is the object storage already running in `compose.yaml`.

**Decision:** B (`minio` SDK)

**Libraries:** `minio@^8.0.x`

---

## TD-03: Metadata/Thumbnail Extraction Tool

**Scope:** Backend

**Capability:** Processamento automático do vídeo (extração de duração e metadados), Geração automática de thumbnail

**Context:** Extracting video duration and a representative frame requires either a native FFmpeg binary or a WASM-based in-process alternative.

**Options:**

### Option A: `@ffmpeg/ffmpeg` (WASM, runs in-process)
- **Pros:** No native binary/OS dependency to install in the Docker image; identical behavior across platforms.
- **Cons:** WASM FFmpeg is significantly slower than native for CPU-bound video decoding, and large 10GB uploads are exactly the case where this matters most; smaller/less mature ecosystem for advanced operations (seek + frame extraction).

### Option B: `fluent-ffmpeg` wrapping the native `ffmpeg` binary
- **Pros:** Native performance (critical for the project's "upload up to 10GB without impacting performance" requirement); mature, widely-used wrapper with a simple promise-friendly-enough API for `ffprobe` (metadata) and frame extraction; the binary is a one-line `apk add ffmpeg` in the worker's own Alpine image (does not affect the `nestjs-api` image at all, since only `video-worker` needs it).
- **Cons:** Requires the native binary to be present in whatever container runs it (already handled: `video-worker/Dockerfile{,.dev}` install it via `apk add --no-cache ffmpeg`).

**Recommendation:** Option B — native performance matters for large video files, and the binary dependency is fully contained to the `video-worker` image.

**Decision:** B (`fluent-ffmpeg` + native `ffmpeg`)

**Libraries:** `fluent-ffmpeg@^2.1.x`

---

## TD-04: Direct-to-Storage Upload Strategy

**Scope:** Cross-layer (backend + storage)

**Capability:** Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance, Pré-cadastro automático do vídeo como rascunho ao iniciar o upload, Reprodução via streaming (sem necessidade de download completo), Download do vídeo pelo usuário

**Context:** Files up to 10GB must not be proxied through the NestJS API process (memory/bandwidth risk). The API needs to hand the client a way to upload directly to storage.

**Options:**

### Option A: Proxy upload through the API (`multipart/form-data` streamed to storage)
- **Pros:** Simpler client integration (one endpoint does everything); API can validate content as it streams.
- **Cons:** Every byte of a 10GB file passes through the API process — exactly the performance risk the plan's "Pontos de Atenção" section calls out; ties up an API request/connection for the whole upload duration.

### Option B: Presigned PUT URL (client uploads directly to MinIO)
- **Pros:** The API only generates a short-lived signed URL (`initiate` endpoint) and is otherwise uninvolved in the byte transfer; upload throughput is bounded only by the client-to-storage connection, not the API; matches how large-file uploads are handled against S3-compatible storage in general.
- **Cons:** Two round trips instead of one (`initiate` → direct PUT → `confirm`); the API cannot inspect file content during upload (validation happens after, during processing).

**Recommendation:** Option B — required to satisfy the 10GB/no-performance-impact requirement; the two-step flow is a standard, well-understood trade-off for large-file uploads.

**Decision:** B (implemented as `POST /videos/upload/initiate` → presigned PUT → `POST /videos/:id/upload/confirm`)

**Libraries:** —

---

## TD-05: Worker Database Access

**Scope:** Backend

**Capability:** Transversal — covers: Processamento automático do vídeo após upload (extração de duração e metadados), Geração automática de thumbnail a partir de um frame do vídeo (the worker reads `file_key`, writes `status`/`duration_seconds`/`thumbnail_key`)

**Context:** The worker needs to read one column and update three columns on the `videos` table. It could reuse TypeORM (matching `nestjs-project`) or talk to Postgres directly.

**Options:**

### Option A: TypeORM (mirroring `nestjs-project`'s entities)
- **Pros:** Reuses the same `Video` entity/repository patterns; consistent with the rest of the codebase's data-access convention.
- **Cons:** Pulls TypeORM, `reflect-metadata`, decorators, and either duplicated entity definitions or a cross-project import into a deliberately lightweight standalone service — for a worker that only ever runs 3 fixed queries (`SELECT file_key`, two `UPDATE`s), this is a lot of machinery for little benefit.

### Option B: Raw `pg` client with hand-written SQL
- **Pros:** Minimal dependency footprint matching the worker's minimal responsibility; the 3 queries it needs are simple and stable, so there's little value in an ORM/query-builder layer; keeps `video-worker` fully independent from `nestjs-project`'s internals (no risk of the worker breaking if an unrelated entity/migration changes).
- **Cons:** No compile-time schema safety — a future column rename in `nestjs-project` would need the same rename applied manually here.

**Recommendation:** Option B — the worker's data-access surface is intentionally tiny; a full ORM is disproportionate machinery for 3 fixed queries, and keeping it dependency-light is consistent with TD-01's isolation rationale.

**Decision:** B (`pg.Pool` with hand-written SQL in `video-worker/src/database.ts`)

**Libraries:** `pg@^8.20.x`

---

## TD-06: Job Retry Policy

**Scope:** `nestjs-project/` (queue configuration)

**Capability:** Processamento automático do vídeo após upload

**Context:** A transient failure (MinIO or Redis momentarily unreachable, a network blip during download) permanently marked the video `failed` with no retry — decided and fixed in this same close-out task, alongside the git-hygiene and documentation work.

**Options:**

### Option A: No retry (fail fast)
- **Pros:** Simplest; failures are immediately visible.
- **Cons:** Any transient infra hiccup permanently fails an otherwise-fine upload, forcing the user to re-upload the whole file.

### Option B: BullMQ `defaultJobOptions` with bounded exponential backoff
- **Pros:** Transient failures get a few automatic retries with increasing delay before giving up; configured once at the queue level (`BullModule.registerQueue`), so it applies uniformly without touching the producer call site; bounded (`attempts: 3`) so a genuinely broken video doesn't retry forever.
- **Cons:** A permanently-broken input (corrupt file) still takes 3 attempts (a few extra seconds/minutes) before surfacing as `failed`, instead of failing immediately.

**Recommendation:** Option B — bounded retry with backoff is the standard mitigation for exactly the transient-infra-failure case described above, and costs nothing for the common (single-attempt-success) path.

**Decision:** B (`attempts: 3`, `backoff: { type: 'exponential', delay: 5000 }` in `queue.module.ts`)

**Libraries:** —

---

## TD-07: Thumbnail Seek Offset for Short Videos

**Scope:** Backend

**Capability:** Geração automática de thumbnail a partir de um frame do vídeo

**Context:** The thumbnail extraction step seeked to a fixed 5-second offset; videos shorter than 5 seconds had no frame at that offset, so `ffmpeg` failed and the video was marked `failed` even though processing otherwise succeeded — decided and fixed in this same close-out task.

**Options:**

### Option A: Keep the fixed 5s offset, skip thumbnail generation for short videos
- **Pros:** No seek-time calculation needed.
- **Cons:** Short videos (a real, expected case — nothing in the plan requires a minimum video length) would ship with no thumbnail at all, a worse outcome than a slightly different frame.

### Option B: Seek proportionally to the already-extracted duration, capped at 5s
- **Pros:** Every successfully-downloaded video gets a thumbnail regardless of length; reuses the `durationSeconds` value already computed by the `ffprobe` step (`getDuration`), so no extra probing is needed; `Math.min(5, durationSeconds / 2)` keeps the "grab a frame partway in, not the first frame" intent for longer videos while staying safely inside short ones.
- **Cons:** For a video of exactly 0-1s, the seek is 0 (first frame) — an accepted trade-off, still produces a valid thumbnail.

**Recommendation:** Option B — every video should get a thumbnail; the fix is a small, local calculation with no new dependencies.

**Decision:** B (`seekSeconds = durationSeconds > 1 ? Math.min(5, durationSeconds / 2) : 0` in `processor.ts`)

**Libraries:** —

---

## TD-08: Video URL Uniqueness Strategy

**Scope:** Backend

**Capability:** URL única por vídeo, sem conflito com outros vídeos

**Context:** Every video needs a public identifier that is safe to expose in a URL, does not leak sequential/enumerable information (unlike an auto-increment `id`), and is guaranteed not to collide across videos.

**Options:**

### Option A: Sequential/UUID primary key exposed directly in the URL
- Reuse the row's own primary key (auto-increment integer or UUID) as the public URL segment.
- **Pros:** Zero extra code — uniqueness is already guaranteed by the primary key constraint.
- **Cons:** An auto-increment integer leaks the total video count and lets anyone enumerate `/videos/1`, `/videos/2`, ...; a UUID (v4) is unique but long and not URL-friendly (36 chars with hyphens).

### Option B: Dedicated random slug column with a unique DB constraint
- Generate a short random alphanumeric string (`generateVideoSlug()` — 11 chars from `crypto.randomBytes`, `[A-Za-z0-9]` charset) at video-creation time, store it in a dedicated `slug` column with `unique: true`, and use it (not the primary key) as the public URL segment.
- **Pros:** Short, URL-friendly, does not leak row count or creation order; decouples the public identifier from the internal primary key (the PK can change strategy later without breaking URLs); the DB `unique` constraint is the collision-safety net (an 11-char charset-62 slug has a collision probability low enough that the constraint is a backstop, not the primary defense).
- **Cons:** One extra column + one extra uniqueness check path (DB constraint violation must be handled, e.g., on the rare collision retry) versus reusing the PK for free.

**Recommendation:** Option B — matches the project's existing pattern of using generated random handles for public-facing identifiers (see `phase-02-auth/TD-10`'s channel nickname generation), and keeps public URLs decoupled from any internal ID scheme.

**Decision:** B (implemented as `videos.slug` — `varchar(12) unique`, generated by `generateVideoSlug()` in `nestjs-project/src/videos/slug.util.ts`)

**Libraries:** —
