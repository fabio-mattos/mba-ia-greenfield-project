---
scope_type: phase
related_phases: [3]
status: decided
date: 2026-07-13
scope_description: "Video upload and processing: object storage usage, background processing queue, a video worker (FFmpeg-based metadata extraction + thumbnail generation), unique video URLs, and range-request streaming/download. Storage engine itself (S3-compatible / MinIO) is fixed by the project plan — only its usage pattern is decided here."
---

# Technical Decisions — Phase 03: Upload e Processamento de Vídeos

_Subprojects in scope:_

- `nestjs-project/` — backend delivers the videos module (draft pre-registration, presigned-upload endpoints, status lifecycle, streaming/download endpoints) plus a new video worker process and new Docker infrastructure (object storage, queue).
- `next-frontend/` — out of scope for this phase per the challenge brief (backend-only delivery). No open decision in this document.

---

## TD-01: Background Processing Queue Technology

**Scope:** Backend

**Capability:** Serviço de processamento em segundo plano (filas)

**Context:** `docs/project-plan.md` and `CLAUDE.md`'s architecture diagram leave the Message Queue explicitly as "TBD". Video processing (metadata extraction + thumbnail generation) must run asynchronously after upload, decoupled from the request/response cycle, with retry semantics for transient failures (e.g., a storage hiccup) — since jobs run an external process (FFmpeg) against potentially large files. This is the single genuinely open stack decision of the phase (per the challenge brief).

**Options:**

### Option A: BullMQ + Redis (`@nestjs/bullmq`)
- Redis-backed job queue with first-class NestJS integration via `@nestjs/bullmq` (`@Processor` classes, DI, `BullModule.registerQueue()`). Built-in retry with exponential backoff, concurrency limits per worker, stalled-job detection, and job progress reporting.
- **Pros:** Most widely used Node.js queue for exactly this kind of workload (media processing pipelines). Official NestJS module — DI, decorators, guard-like lifecycle. Redis is a single lightweight container. Backoff/retry/concurrency are configuration, not hand-rolled code. Job progress reporting maps naturally onto the video's `processing` status.
- **Cons:** Adds Redis as new infrastructure (new Docker service). In-memory-backed (Redis) queue — jobs are lost if Redis data isn't persisted (mitigated with a Docker volume + AOF/RDB persistence).

### Option B: RabbitMQ + `@nestjs/microservices` (AMQP transport)
- Dedicated message broker; NestJS's official microservices module talks to it via the AMQP transport. Publisher/consumer decoupling is broker-native (exchanges, routing keys, dead-letter queues).
- **Pros:** Industry-standard broker, strong delivery guarantees, native dead-letter-queue support, decouples producer/consumer at the protocol level (useful if more services join later).
- **Cons:** Heavier operational footprint (its own management UI/plugins, exchange/queue topology to design). NestJS's microservices abstraction is architected for request/event patterns across services, not job-with-retry semantics — retry/backoff/progress must be hand-built on top of raw AMQP acks. Overkill for a single producer (API) / single consumer (worker) pipeline.

### Option C: pg-boss (PostgreSQL-backed queue)
- Queue implemented as tables in the existing PostgreSQL database (`SKIP LOCKED`-based polling), no new infrastructure service.
- **Pros:** Zero new infrastructure — reuses the already-provisioned `db` service. Transactional enqueue possible (same DB as the domain data).
- **Cons:** Couples job-queue I/O (polling, row locks) to the same database instance serving all OLTP traffic — video processing jobs are comparatively bursty/heavy (large-file metadata extraction), which is exactly the kind of load the architecture diagram already separates into its own "Message Queue" container. Smaller ecosystem/community than BullMQ for this specific use case; no built-in dashboard.

**Recommendation:** **Option A (BullMQ + Redis)** — matches the architecture diagram's separate "Message Queue" container, has the most direct NestJS integration for exactly this producer/consumer/retry shape, and keeps queue churn off the primary OLTP database. Redis is a single, well-understood container to add to Compose.

**Decision:** A (BullMQ + Redis)

**Libraries:** @nestjs/bullmq, bullmq, ioredis

---

## TD-02: Large File Upload Strategy (up to 10GB)

**Scope:** Backend

**Capability:** Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance

**Context:** The file must never be streamed through the NestJS API process — doing so would tie up an API connection/worker thread for the entire upload duration and risks memory pressure. The object storage (MinIO, S3-compatible) is already decided by the project; this TD decides *how* the client gets bytes into it.

**Options:**

### Option A: Single presigned PUT URL (whole file, one request)
- API issues one presigned `PutObject` URL; the client PUTs the entire file directly to MinIO in one HTTP request.
- **Pros:** Simplest possible client integration — one request, one presigned URL.
- **Cons:** **Disqualifying for this phase's 10GB requirement:** S3-compatible single-PUT objects are capped at 5GB — a 10GB file cannot be uploaded this way at all. Even below that cap, a single request has no resumability: any network interruption forces a full restart of a multi-gigabyte transfer.

### Option B: Presigned Multipart Upload (S3 Multipart Upload API)
- API creates a multipart upload (`CreateMultipartUpload`), issues one presigned `UploadPart` URL per chunk (client decides part size/count, e.g. 16-64MB parts), the client uploads parts directly to MinIO (in parallel or sequentially), then calls the API to `CompleteMultipartUpload`. Bytes never pass through the NestJS process at any point.
- **Pros:** Matches the 10GB requirement exactly — S3 Multipart supports up to 5TB across up to 10,000 parts. Fully supported by MinIO's S3-compatible API (`@aws-sdk/client-s3`'s multipart commands work unchanged against MinIO). Resumable: only failed parts need re-upload. Parallelizable from the client for throughput. The API's involvement is bounded to small control-plane calls (create/complete/abort) — no file bytes ever transit the API process.
- **Cons:** More moving parts than a single PUT: the API must track the upload's in-progress state (video row in `processing`-adjacent "uploading" sub-state, part ETags on complete), and the client needs multipart-aware upload logic (any modern S3 client SDK or a thin custom uploader handles this).

### Option C: tus resumable-upload protocol via a dedicated tus server
- Deploy a separate tus server (e.g., `tusd`) in front of storage; clients use the tus protocol (chunked, resumable) to upload, and the tus server persists the result to S3/MinIO.
- **Pros:** Purpose-built resumable-upload protocol with mature client libraries (`tus-js-client`).
- **Cons:** Requires standing up and operating an entirely new service (the tus server) beyond what the phase's infrastructure list calls for (storage + queue + worker) — no NestJS-native integration, and MinIO's own S3 Multipart API already provides resumability without extra infrastructure.

**Recommendation:** **Option B (Presigned Multipart Upload)** — the only option that actually satisfies the 10GB requirement (Option A is hard-capped below it), needs no infrastructure beyond the object storage already planned, and is natively supported by both MinIO and the same AWS SDK v3 client used for everything else storage-related in this phase.

**Decision:** B (Presigned Multipart Upload)

**Libraries:** @aws-sdk/client-s3, @aws-sdk/s3-request-presigner

---

## TD-03: Object Storage Bucket & Key Organization

**Scope:** Backend

**Capability:** Serviço de armazenamento de arquivos (vídeos e thumbnails)

**Context:** The storage engine itself is fixed (S3-compatible; MinIO locally). This decides how buckets and object keys are organized so that video files, thumbnails, and multipart uploads never collide and can be resolved back to a video row unambiguously.

**Options:**

### Option A: Single bucket, `videos/{videoId}/...` key prefix
- One bucket (e.g., `streamtube`), with keys `videos/{videoId}/original.<ext>` and `videos/{videoId}/thumbnail.jpg`. `{videoId}` is the video's own primary key (UUID), so keys are unique by construction — no separate uniqueness scheme needed for storage keys.
- **Pros:** Single bucket to provision (one `MINIO_DEFAULT_BUCKETS`/bootstrap step, one CORS policy). Prefix-per-video keeps all assets for one video co-located and trivially derivable from the video row (no extra columns needed beyond the video id itself, though the entity still stores the resolved keys explicitly per the project's Data Model conventions). Lifecycle/retention rules can still target the `videos/` prefix later if needed.
- **Cons:** All assets share one bucket's CORS/policy configuration (not a real constraint at this phase's scope — no per-asset-type policy is required).

### Option B: Separate buckets per asset type (`streamtube-videos`, `streamtube-thumbnails`)
- **Pros:** Clean separation for future differing lifecycle/CDN policies per asset type.
- **Cons:** Doubles bucket provisioning and CORS configuration for no requirement calling for differentiated policies in this phase.

### Option C: Bucket-per-channel
- **Pros:** Mirrors per-tenant isolation.
- **Cons:** Unbounded bucket count as channels grow (S3-compatible deployments typically soft-cap buckets per account/tenant); no requirement in this phase calls for per-channel storage isolation.

**Recommendation:** **Option A (single bucket, `videos/{videoId}/...` prefix)** — simplest to provision and reason about, and the video-id-scoped prefix already guarantees collision-free, video-attributable keys, which is exactly what this decision needs to produce.

**Decision:** A (single bucket, `videos/{videoId}/...` prefix)

---

## TD-04: Video Worker Architecture & FFmpeg Integration

**Scope:** Backend

**Capability:** Transversal — covers: "Processamento automático do vídeo após upload (extração de duração e metadados)", "Geração automática de thumbnail a partir de um frame do vídeo"

**Context:** A separate process/container must consume queue jobs, run FFmpeg/ffprobe against the uploaded file, extract duration/metadata, generate a thumbnail frame, upload the thumbnail to storage, and update the video row. Depends on TD-01 (queue technology).

**Options:**

### Option A: Dedicated NestJS worker app (own entrypoint, own Docker service) + `fluent-ffmpeg` + apt-installed `ffmpeg`/`ffprobe`
- A second entrypoint inside `nestjs-project` (e.g. `src/worker/main.ts`) bootstraps a minimal Nest application context (no HTTP listener) that registers the `@Processor` consuming the queue from TD-01. It reuses the project's existing TypeORM entities/repositories, config module, and DI conventions. FFmpeg/ffprobe are system binaries installed via `apt-get install ffmpeg` in the worker's Dockerfile; `fluent-ffmpeg` wraps them with a Promise/stream-friendly API.
- **Pros:** Reuses the Video entity, repository, and config module — no duplicated data-access code between API and worker (single source of truth for the schema). Runs as its own Compose service/container (matches the architecture diagram's separate "Video Worker" box) while staying inside the same codebase and CI/test pipeline. `@nestjs/bullmq`'s `@Processor` gives DI, structured error propagation, and retry hooks for free. `fluent-ffmpeg` is the standard, actively maintained wrapper with full access to FFmpeg's feature set via the system binary.
- **Cons:** The worker Docker image is heavier than a pure API image (FFmpeg binary + codecs, ~150-250MB). Two Dockerfiles/entrypoints to maintain within one project (mitigated: they share the same `node_modules`/source, only the bootstrap file and Docker target differ).

### Option B: Dedicated NestJS worker + npm-bundled static FFmpeg binaries (`@ffmpeg-installer/ffmpeg`, `@ffprobe-installer/ffprobe`)
- Same worker shape as Option A, but instead of an OS package, the FFmpeg/ffprobe binaries ship as npm packages bundling prebuilt static executables — no `apt-get` step in the Dockerfile.
- **Pros:** No OS package manager step; binary path is resolved from `node_modules` uniformly across environments.
- **Cons:** The npm-distributed static builds lag behind upstream FFmpeg releases and security patches, and bypass the OS's own update/patch path — worse long-term maintainability than an apt-installed binary pinned to a known Debian release.

### Option C: Standalone non-NestJS worker script (plain Node process, own `package.json`)
- A worker process built without the NestJS framework — just a BullMQ consumer, a raw `pg`/TypeORM connection, and `fluent-ffmpeg`.
- **Pros:** Smaller runtime footprint, no framework bootstrap overhead.
- **Cons:** Cannot reuse the API's TypeORM entities/repositories or config module without extracting them into a shared package first (added complexity for no clear benefit at this project's scale); diverges from the project's established NestJS-everywhere convention (CLAUDE.md's module-based architecture principle).

**Recommendation:** **Option A** — reuses the existing entities/config/DI conventions (no duplicated schema knowledge between API and worker), matches the architecture diagram's dedicated Video Worker container, and uses the standard, best-documented FFmpeg wrapper backed by a properly-updatable OS package.

**Decision:** A (NestJS worker + apt-installed FFmpeg)

**Libraries:** fluent-ffmpeg, @types/fluent-ffmpeg

---

## TD-05: Unique Public Video Identifier

**Scope:** Backend

**Capability:** URL única por vídeo, sem conflito com outros vídeos

**Context:** Every video needs a public identifier usable in a URL, guaranteed unique across the platform.

**Options:**

### Option A: Use the video's own primary key (UUID v4) directly in public routes
- Public routes are `GET /videos/:id/...` where `:id` is the same UUID used as the entity's primary key.
- **Pros:** Zero extra columns or generation logic — uniqueness is already guaranteed by the PK constraint. UUID v4 is not sequential/guessable.
- **Cons:** Couples the externally-shared identifier to the internal primary key (a future PK strategy change, e.g. switching to ULIDs for sortability, would break existing shared links) — a real but distant concern, not a near-term requirement.

### Option B: Separate short opaque public id (e.g., 10-12 char nanoid), unique-indexed column
- Generate a short random string (nanoid/similar) at video creation, store it in a unique-indexed `public_id` column, and use it (not the PK) in public URLs.
- **Pros:** Shorter URLs than a full UUID. Decouples the shared identifier from the internal PK.
- **Cons:** Extra column + uniqueness handling (collision retry, however negligible at nanoid's entropy) for a benefit (shorter/rotatable URLs) the phase's acceptance criteria don't call for — the requirement is uniqueness, not brevity or rotatability.

### Option C: Slug derived from video title (YouTube-style, e.g. `my-video-title-ab12`)
- **Pros:** Human-readable URLs.
- **Cons:** Requires slugify + collision-suffix logic (mirroring Phase 02's channel-handle work), and titles are editable in a later phase (Phase 04), which would either freeze the slug at creation (diverging from the title) or force URL changes on rename — unnecessary complexity for a requirement that only asks for uniqueness.

**Recommendation:** **Option A (use the primary key UUID directly)** — the requirement is strictly "unique URL, no conflicts," which a UUID v4 primary key already satisfies with zero additional mechanism. Simpler is better here; nothing in this phase's scope needs a separate public identifier.

**Decision:** A (use the primary key UUID directly)

---

## TD-06: Streaming & Download Delivery Mechanism

**Scope:** Backend

**Capability:** Transversal — covers: "Reprodução via streaming (sem necessidade de download completo)", "Download do vídeo pelo usuário"

**Context:** Depends on TD-03 (storage keys). Both playback (range-request streaming) and full download must be served without buffering the whole file in the API process.

**Options:**

### Option A: API proxies bytes — reads the requested `Range` from MinIO and pipes it through
- The controller reads the incoming `Range` header, issues a `GetObjectCommand` to MinIO with the matching `Range` parameter, and pipes the resulting stream back to the client with `206 Partial Content` / `Content-Range`. Download uses the same path without a `Range` header (200, full stream, `Content-Disposition: attachment`).
- **Pros:** Every byte passes through the API, so authorization (e.g., future unlisted/private visibility rules) is enforced per-request without any pre-issued token to manage.
- **Cons:** The API process mediates all video playback/download bandwidth — exactly the kind of load the upload strategy (TD-02) was designed to keep off the API. Range-parsing/piping logic must be hand-written and kept correct (partial-content edge cases: multi-range requests, `If-Range`, etc.).

### Option B: API redirects to a short-lived presigned GetObject URL
- The controller validates the request (video exists, is playable) and responds with a redirect to a presigned `GetObject` URL (download variant adds `response-content-disposition=attachment`). MinIO itself serves the actual bytes, natively handling `Range`/`206` — no proxying or manual range logic in the API.
- **Pros:** Consistent with TD-02's philosophy: file bytes never transit the API process for playback or download either, so bandwidth and connection lifetime scale with the storage layer, not the API. MinIO's native Range support is already correct and battle-tested — no hand-rolled partial-content logic. A single short expiry (e.g., a few minutes) bounds how long a shared link/redirect stays valid.
- **Cons:** Authorization is checked once, at redirect time, not per byte-range request — acceptable for this phase (public/anonymous playback is the stated requirement; no private-video visibility rule exists yet, that's Phase 04/05 scope) but must be revisited if a future phase adds access-restricted videos.

**Recommendation:** **Option B (presigned-redirect)** — consistent with the upload strategy's principle of keeping large-payload I/O off the API process, and delegates Range/206 correctness to MinIO's own, already-correct implementation instead of a hand-rolled proxy. The per-request auth checkpoint happening at redirect time (rather than per byte-range) matches this phase's scope, where video visibility rules don't exist yet.

**Decision:** B (Presigned-redirect)

---

## TD-07: Video Status Lifecycle & Processing Failure Handling

**Scope:** Backend

**Capability:** Transversal — covers: "Pré-cadastro automático do vídeo como rascunho ao iniciar o upload", "Processamento automático do vídeo após upload (extração de duração e metadados)"

**Context:** `docs/project-plan.md` (Fase 03 entregáveis) implies a draft → processing → ready/error cycle. This decides the exact enum and what happens when FFmpeg processing fails. Depends on TD-01 (queue technology, for retry semantics).

**Options:**

### Option A: 4-state enum (`draft`, `processing`, `ready`, `failed`) with automatic queue-level retry + manual re-trigger on terminal failure
- Video row is created as `draft` when the upload is initiated (before any bytes arrive). On `CompleteMultipartUpload`, the API enqueues a processing job and flips status to `processing`. BullMQ retries the job automatically (e.g., 3 attempts, exponential backoff) for transient failures. Only after all automatic attempts are exhausted does the video flip to `failed`. A `failed` video exposes a re-process action (re-enqueue) via the API for the user to retry manually.
- **Pros:** Matches the project plan's literal wording (rascunho → processando → pronto/erro) exactly — no invented states beyond what's specified. Automatic retry absorbs transient failures (a storage hiccup, a momentary worker restart) without ever bothering the user, while `failed` remains a real, actionable terminal state with a manual escape hatch for genuinely bad input (corrupt file, unsupported codec).
- **Cons:** None significant for this phase's scope.

### Option B: Extended state machine (`uploading`, `uploaded`, `queued`, `processing`, `ready`, `failed`)
- **Pros:** Finer-grained observability into exactly where a video is in the pipeline.
- **Cons:** This is a backend-only phase with no UI to visualize intermediate states (per the challenge brief) — the extra granularity has no consumer yet and isn't called for by the project plan's stated cycle.

### Option C: 4-state enum, no automatic retry
- Same states as Option A, but any processing exception flips the video straight to `failed` — no automatic retry attempts.
- **Pros:** Simpler worker logic (no retry configuration).
- **Cons:** A single transient failure (e.g., MinIO momentarily unreachable) permanently fails a perfectly valid upload, forcing the user to notice and manually retry for failures that had nothing to do with their file — worse UX for a failure mode the queue technology (TD-01) already solves for free.

**Recommendation:** **Option A** — matches the project plan's exact wording, and uses BullMQ's built-in retry/backoff (already the chosen queue tech) to absorb transient failures for free, while keeping `failed` a real, user-actionable terminal state.

**Decision:** A (4-state enum + automatic queue-level retry)

---

## Decisions Summary

| ID | Decision | Recommendation | Choice |
|----|----------|---------------|--------|
| TD-01 | Background Processing Queue Technology | BullMQ + Redis | A (BullMQ + Redis) |
| TD-02 | Large File Upload Strategy (10GB) | Presigned Multipart Upload | B (Presigned Multipart Upload) |
| TD-03 | Object Storage Bucket & Key Organization | Single bucket, `videos/{videoId}/...` prefix | A (Single bucket, `videos/{videoId}/...` prefix) |
| TD-04 | Video Worker Architecture & FFmpeg Integration | NestJS worker + apt-installed FFmpeg | A (NestJS worker + apt-installed FFmpeg) |
| TD-05 | Unique Public Video Identifier | Use PK UUID directly | A (Use PK UUID directly) |
| TD-06 | Streaming & Download Delivery Mechanism | Presigned-redirect (206 via MinIO) | B (Presigned-redirect) |
| TD-07 | Video Status Lifecycle & Failure Handling | 4-state enum + automatic retry | A (4-state enum + automatic retry) |
