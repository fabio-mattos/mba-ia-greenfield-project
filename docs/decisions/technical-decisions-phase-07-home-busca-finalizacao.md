---
scope_type: phase
related_phases: [7]
status: decided
date: 2026-07-01
scope_description: "Home page/search backend test coverage, plus the project's first production deployment artifacts: multi-stage Dockerfiles for nestjs-project and next-frontend, and a docker-compose.prod.yml joining all services."
note: "GET /videos (search/category/pagination) already existed before this document was written — only its test coverage is new. The production deploy artifacts (Dockerfiles, compose file) are genuinely new work created in this close-out, together with two bugs found and fixed while building/validating them."
---

# Technical Decisions — Phase 07: Página Inicial, Busca e Finalização

_Subprojects in scope:_

- `nestjs-project/` — `GET /videos` test coverage; production `Dockerfile`; `data-source.ts` fix.
- `next-frontend/` — production `Dockerfile`, `output: 'standalone'`, health check route; a real routing bug fix.
- Repo root — `docker-compose.prod.yml`, `.env.production.example`.

---

## TD-01: Production Deployment Target

**Scope:** Cross-layer (infra)

**Capability:** Ambiente de produção e deploy

**Context:** Before this phase, only `Dockerfile.dev` existed for `nestjs-project`/`next-frontend` (`video-worker` already had a real production `Dockerfile`, used as the reference pattern here). No cloud provider, hosting target, or CI/CD pipeline is defined anywhere in the project.

**Options:**

### Option A: Target a specific cloud provider (AWS/GCP/Vercel/Railway) with provider-specific IaC
- **Pros:** Closer to a "real" production deployment; could include managed Postgres/Redis/object storage.
- **Cons:** No provider was specified or available for this course project; committing to one would bake in credentials/config decisions (region, instance sizing, managed-service equivalents for MinIO) that are out of scope and untestable here.

### Option B: Self-contained local production Docker Compose stack
- Multi-stage production `Dockerfile` for each app service (matching the existing `video-worker/Dockerfile` pattern), joined by a `docker-compose.prod.yml` that runs the entire platform (API, frontend, worker, Postgres, Redis, MinIO, a placeholder SMTP) on a single Docker host, with no cloud dependency.
- **Pros:** Fully testable end-to-end within this repo/environment; demonstrates the actual "build for production, not dev bind-mounts" concern (optimized multi-stage images, no live source mounting, `NODE_ENV=production`); can be pointed at a real cloud VM later by just deploying the same compose file, if ever needed.
- **Cons:** Not literally "in the cloud"; secrets are still developer-supplied via a local `.env.production` file rather than a secrets manager.

**Recommendation:** Option B — the only option that can actually be built and verified in this environment, and it produces genuinely production-shaped artifacts (optimized images, no dev tooling) rather than a paper decision that can't be exercised.

**Decision:** B (`nestjs-project/Dockerfile`, `next-frontend/Dockerfile`, `docker-compose.prod.yml`)

**Libraries:** —

---

## TD-02: Transactional Email in the Production Compose

**Scope:** Infra

**Capability:** (supports Fase 02's transactional email, reused here since it's part of the production topology)

**Context:** `mailpit` is a fake local SMTP server, fine for dev. No real SMTP provider (SendGrid, SES, etc.) is configured anywhere in the project.

**Options:**

### Option A: Omit email entirely from the production compose
- **Pros:** Doesn't imply a real email capability that doesn't exist.
- **Cons:** Account confirmation and password reset (Fase 02 deliverables) would be silently broken in this "production" stack — worse than being explicit about the gap.

### Option B: Keep `mailpit` in the production compose, explicitly documented as a placeholder
- **Pros:** The full account lifecycle (register → confirm → login → reset) remains demonstrable end-to-end in this environment; the docker-compose file and `.env.production.example` both carry a comment making clear this must be replaced with a real SMTP provider before genuine production use.
- **Cons:** Emails don't actually leave the Docker network — acceptable given no real provider was ever in scope for this project.

**Recommendation:** Option B — keeps the deployable stack fully functional for demonstration purposes, with the limitation clearly documented rather than silently shipped.

**Decision:** B (`mailpit` retained in `docker-compose.prod.yml`, `MAIL_HOST=mailpit`)

**Libraries:** —

---

## TD-03: `next-frontend` Production Build Strategy

**Scope:** `next-frontend/`

**Capability:** Ambiente de produção e deploy

**Context:** Next.js needs to be built into a minimal, containerizable artifact — the framework's own guidance (see the `next-best-practices` skill's self-hosting reference) is `output: 'standalone'`.

**Decision:** `output: 'standalone'` added to `next.config.ts`; the production `Dockerfile` follows the documented 3-stage pattern (`deps` → `builder` → `runner`, copying only `.next/standalone` + `.next/static` + `public/` into the final image, running as a non-root `nextjs` user). Build-time `API_URL`/`SESSION_PASSWORD` placeholders are passed as Docker `ARG`s only to satisfy `lib/env.ts`'s eager Zod validation during `next build`'s page-data collection — the real values are supplied at container runtime via `docker-compose.prod.yml`, not baked into the image.

**Libraries:** —

---

## TD-04: `GET /videos` (Home/Search) Test Coverage

**Scope:** Backend

**Capability:** Página inicial com grid de vídeos, Filtro de vídeos por categoria, Barra de busca

**Context:** `listPublicVideos` (search by title/channel `ILIKE`, category-slug filter, channel-nickname filter, pagination, `status=READY AND visibility=PUBLIC` only) already existed with zero tests of any kind.

**Decision:** Extended the existing `videos.service.integration-spec.ts` and `test/videos.e2e-spec.ts` (created in Fase 04) with a `listPublicVideos`/`GET /videos` suite, following the same pattern as every other phase this session — no new TD needed for the query logic itself (already covered by TD-01 of the original, unwritten implementation); this is purely closing a test-coverage gap.

**Libraries:** —

---

## TD-05 (bug fix): `data-source.ts` Migration Path Resolution

**Scope:** Backend (`nestjs-project/src/database/data-source.ts`)

**Context:** Found while validating the new production Dockerfile: `AppDataSource`'s `migrations` option was `['src/database/migrations/*.ts']` — a path relative to the **current working directory**, not to the file itself. In dev (`ts-node`, `CWD` = project root with `src/` present) this glob resolves fine. In the compiled production image (`node dist/main`, only `dist/` exists, no `src/`), the glob matches zero files — the TypeORM CLI doesn't error, it just silently reports "No migrations are pending" against an empty, unmigrated database.

**Options:**

### Option A: Ship `src/` (or a TypeORM-CLI-specific toolchain) into the production image just to run migrations
- **Pros:** No code change needed.
- **Cons:** Defeats the point of a minimal compiled runtime image; adds `ts-node`/TypeScript back into "production."

### Option B: Make the glob `__dirname`-relative instead of CWD-relative
- `migrations: [__dirname + '/migrations/*{.ts,.js}']` — resolves against the directory of `data-source.ts` itself (`src/database/` in dev under `ts-node`, `dist/database/` in the compiled build), matching either `.ts` or `.js` migration files depending on which tree is actually running.
- **Pros:** Works identically in both dev and production with zero extra tooling shipped; standard, documented TypeORM pattern for exactly this dev/prod split; doesn't change dev behavior at all (verified: full test suite + `npm run migration:run` re-checked green after the change).
- **Cons:** None.

**Decision:** B — this is the standard fix, and the only one that doesn't compromise the production image's minimalism.

**Libraries:** —

---

## TD-06 (bug fix): Conflicting Next.js Dynamic Route Segments

**Scope:** `next-frontend/app/api/videos/`

**Context:** Found while smoke-testing the production build: `next start` (via the standalone server) failed every request with `Error: You cannot use different slug names for the same dynamic path ('id' !== 'slug')`. `app/api/videos/[id]/upload/confirm/route.ts` and 12 sibling routes under `app/api/videos/[slug]/` used two different dynamic-segment names at the same directory level — a Next.js routing-tree constraint violated only surfaces at server-start/first-request in the compiled build, never during `next dev` (dev mode is lazier about validating the full route manifest), which is why it went unnoticed until this phase's production smoke test.

**Decision:** Renamed the folder to `app/api/videos/[slug]/upload/confirm/route.ts` to match every sibling route's naming, keeping the destructured value's real meaning explicit in code (`const { slug: videoId } = await params`, with a comment) since the value is genuinely a video id, not a slug — the upstream OpenAPI path (`/videos/{id}/upload/confirm`) and its param name are unaffected; only the Next.js-internal route-segment name changed. No caller needed updating since callers just interpolate the id into a URL string.

**Libraries:** —

---

## TD-07: No Host Port Exposure for `db`/`redis`/`minio` in Production

**Scope:** Infra (`docker-compose.prod.yml`)

**Context:** The dev compose files publish `db`/`redis`/`minio` ports to the host (for local psql/redis-cli/MinIO-console access during development). A production stack has no such need — only the user-facing services (`nestjs-api`, `next-frontend`) and the observability convenience of `mailpit`'s web UI need to be reachable from outside the Docker network.

**Decision:** `db`, `redis`, and `minio` have no `ports:` mapping in `docker-compose.prod.yml` — reachable only by other containers on the compose network. This is a small, free hardening step appropriate for "production," distinct from the dev compose files (which are unchanged).

**Libraries:** —
