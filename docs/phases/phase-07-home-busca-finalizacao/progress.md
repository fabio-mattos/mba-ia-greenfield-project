# phase-07-home-busca-finalizacao — Progress

**Status:** completed
**SIs:** 4/4 completed

### SI-07.1 — Home/Search (`GET /videos`) Test Coverage
- **Status:** completed
- **Tests:** `videos.service.integration-spec.ts` +5 (`listPublicVideos`), `test/videos.e2e-spec.ts` +4 (`GET /videos`) — all passing
- **Observations:** Covers search-by-title/channel (`ILIKE`), category-slug filter, channel-nickname filter, pagination/`total_pages`, and confirms `DRAFT`/`PROCESSING` videos never appear in listings. `GET /videos` had zero test coverage before this.

### SI-07.2 — Production Dockerfiles
- **Status:** completed
- **Tests:** manual build verification (`docker build` succeeded for both), not an automated test
- **Observations:** `nestjs-project/Dockerfile` (3-stage: deps/build/runner, `npm run build` already copies `.hbs` mail templates via `nest-cli.json` assets) and `next-frontend/Dockerfile` (3-stage, `output: 'standalone'`, non-root `nextjs` user). Added `.dockerignore` to both subprojects (missing before — first build attempt tried to send the full `node_modules` as build context and failed on a broken symlink). Added `next-frontend/app/api/health/route.ts` per the `next-best-practices` skill's self-hosting checklist.

### SI-07.3 — `docker-compose.prod.yml` + Smoke Test
- **Status:** completed
- **Tests:** manual end-to-end smoke test (not automated) — built and booted the full stack (`db`, `redis`, `minio`, `mailpit`, `nestjs-api`, `next-frontend`, `video-worker`) under an isolated Compose project (`-p streamtube-prod`), ran migrations against the fresh database from the compiled image, confirmed `nestjs-api` (`GET /` → 200) and `next-frontend` (`GET /api/health` → 200, `GET /` → 200 with the real home page title), then tore the stack down (`down -v`) and restored the dev containers.
- **Observations:** `.env.production.example` added (committed) documenting all required vars; the real `.env.production` is gitignored. `db`/`redis`/`minio` have no host port mapping in prod (internal network only). Two real bugs were found and fixed during this smoke test (SI-07.4).

### SI-07.4 — Bugs Found and Fixed While Validating the Production Stack
- **Status:** completed
- **Tests:** full suite re-verified after both fixes — `nestjs-project`: 251/251 unit+integration, 109/109 e2e, `tsc`/lint clean; `next-frontend`: `tsc`/lint clean (vitest suite showed environmental worker-timeout flakiness unrelated to either fix — different random test files failed on each of two re-runs, none touching the changed code)
- **Observations:**
  1. **`nestjs-project/src/database/data-source.ts`** — `migrations: ['src/database/migrations/*.ts']` is CWD-relative, not `__dirname`-relative; resolves fine under `ts-node` in dev but matches zero files against the compiled `dist/` tree, so `migration:run` against the production image silently reported "No migrations are pending" on a completely empty database. Fixed to `[__dirname + '/migrations/*{.ts,.js}']` (works in both trees). Re-verified dev's `npm run migration:run` and `migrations.integration-spec.ts` still pass unchanged.
  2. **`next-frontend/app/api/videos/[id]/upload/confirm/route.ts` vs. 12 sibling `[slug]` routes** — Next.js requires every dynamic segment at the same directory level (`app/api/videos/`) to share one param name; the mismatch only surfaces as a hard runtime error (`'id' !== 'slug'`) when the compiled standalone server starts serving requests — `next dev` never validates this eagerly, so it went undetected until this phase's production smoke test. Renamed the folder to `[slug]` to match the sibling convention; the destructured value is aliased to `videoId` with a comment, since it's genuinely a video id (matching the unchanged upstream OpenAPI path `/videos/{id}/upload/confirm`), not a slug — a Next.js-routing-only rename, no caller changes needed.

## Known gaps registered, not fixed in this close-out

- No cloud hosting or CI/CD (deliberately out of scope per TD-01).
- Frontend automated tests for home/search/navbar — none exist, deferred.
- Visual/responsive-layout verification not performed.
- Subscriber-count-on-channel-page gap (Fase 04↔06) still open.
