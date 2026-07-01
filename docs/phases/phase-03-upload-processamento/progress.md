# phase-03-upload-processamento — Progress

**Status:** completed
**SIs:** 8/8 completed

_SIs 03.1–03.3 record work that already existed in the repository before this phase-tracking document was written (see `note` in `context.md`). SIs 03.4–03.8 were implemented during this close-out task._

### SI-03.1 — Object Storage & Queue Infrastructure
- **Status:** completed (pre-existing)
- **Tests:** none at the time; covered retroactively by SI-03.4/03.6 (`minio-client.spec.ts`)
- **Observations:** MinIO (`minio` service) and Redis (`redis` service) added to `nestjs-project/compose.yaml`; `StorageModule`/`StorageService` (presigned PUT/GET, upload, delete) and `QueueModule`/`VideoProcessingProducer` (BullMQ) added to `nestjs-project/src/`.

### SI-03.2 — Upload Initiate/Confirm Endpoints & Draft Video Lifecycle
- **Status:** completed (pre-existing)
- **Tests:** `videos.service.spec.ts` (unit, mocked repository/storage/producer)
- **Observations:** `VideosController`/`VideosService` implement `POST /videos/upload/initiate` (creates a `DRAFT` video, returns a presigned PUT URL) and `POST /videos/:id/upload/confirm` (marks `PROCESSING`, enqueues the job). `Video` entity/migrations (`CreateVideos`, `AddThumbnailToChannels`) add `status`, `duration_seconds`, `file_key`, `thumbnail_key`.

### SI-03.3 — Standalone Video Processing Worker
- **Status:** completed (pre-existing)
- **Tests:** none at the time; covered by SI-03.4
- **Observations:** `video-worker/` (standalone Node.js + BullMQ `Worker`, `fluent-ffmpeg`, `minio`, `pg`) consumes the `video-processing` queue: downloads the uploaded file via presigned URL, extracts duration (`ffprobe`) and a thumbnail frame, uploads the thumbnail, and updates `videos.status`/`duration_seconds`/`thumbnail_key`. Already wired into `nestjs-project/compose.yaml` as the `video-worker` service.

### SI-03.4 — Video Worker Automated Test Suite
- **Status:** completed
- **Tests:** 16/16 passing (`minio-client.spec.ts`, `database.spec.ts`, `processor.spec.ts` — unit; `processor.integration-spec.ts` — real Postgres/MinIO/ffmpeg)
- **Observations:** Added Jest+ts-jest to `video-worker/package.json` (previously had no test script at all). Added `video-worker/Dockerfile.dev` + bind-mounted the service in `compose.yaml` (mirroring `nestjs-api`'s dev pattern) so `docker compose exec video-worker npm test` works. Integration test generates synthetic video fixtures via `ffmpeg`'s `lavfi` test source (no committed binary fixtures) and cleans up its own DB rows/MinIO objects.

### SI-03.5 — End-to-End Manual Validation
- **Status:** completed
- **Tests:** no automated test (manual smoke test) — registered/confirmed a real user, ran `initiate → PUT → confirm` against the real API, observed the worker transition the video to `ready` with `duration_seconds`/`thumbnail_key` populated within ~2s, confirmed the thumbnail object in MinIO
- **Observations:** validates the producer (`nestjs-project`) and consumer (`video-worker`) actually agree on queue name/payload shape end-to-end, which unit/integration tests alone don't cover (they exercise each side in isolation). Manual test data cleaned up afterward.

### SI-03.6 — Worker Robustness Fixes (TD-06, TD-07)
- **Status:** completed
- **Tests:** `processor.spec.ts` (+3 cases: non-2xx download status, short-video seek, download error) and `processor.integration-spec.ts` (+1 case: <5s video still gets a thumbnail)
- **Observations:** (1) `queue.module.ts` — added `defaultJobOptions: { attempts: 3, backoff: exponential 5s }` (TD-06); (2) `processor.ts` — thumbnail seek is now `min(5, duration/2)` instead of a fixed `5` (TD-07), fixing videos shorter than 5s always failing; (3) `downloadFile` now checks `res.statusCode` before writing to disk and rejects with a clear `Download failed with status N` error instead of silently writing an error-page body and failing confusingly later in `ffprobe`; also added a `request.on('error', ...)` handler for connection-level failures (DNS, ECONNREFUSED), which were previously unhandled.

### SI-03.7 — Git Hygiene for `video-worker/`
- **Status:** completed
- **Tests:** none (not applicable)
- **Observations:** `video-worker/node_modules` and `dist/` had been committed (≈3500 files, no `.gitignore`). Added `video-worker/.gitignore` and ran `git rm -r --cached video-worker/node_modules video-worker/dist`. Left staged, uncommitted — commit is the user's call.

### SI-03.8 — Unrelated Pre-Existing Bug Found and Fixed: Migrations Test DB Corruption
- **Status:** completed
- **Tests:** full suite re-verified after the fix (177/177 unit+integration, 52/52 e2e, `video-worker` 16/16)
- **Observations:** Discovered while re-running the full suite as part of this task's Definition-of-Done check — unrelated to Phase 03 itself, but blocking. Full account recorded in `docs/phases/phase-02-auth/progress.md` under SI-02.19 (the affected test belongs to Phase 02's migration infrastructure). Summary: `migrations.integration-spec.ts` cascade-dropped shared `channels`/`users`-referencing FKs and the `channels.thumbnail_key` column on every run, breaking `POST /auth/forgot-password` with a 500. Fixed by giving that test its own disposable Postgres database instead of operating on the shared dev DB.
