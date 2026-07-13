---
kind: phase
name: phase-03-upload-processamento
sources_mtime:
  docs/project-plan.md: "2026-06-29T18:30:43-03:00"
  docs/decisions/technical-decisions-phase-03-upload-processamento.md: "2026-07-13T18:15:24-03:00"
  docs/phases/phase-01-configuracao-base/context.md: "2026-06-29T18:30:43-03:00"
  docs/phases/phase-02-auth/context.md: "2026-06-29T18:30:43-03:00"
  docs/phases/phase-02-auth-frontend/context.md: "2026-06-29T18:30:43-03:00"
  .claude/skills/testing-guide-nestjs-project/SKILL.md: "2026-06-29T18:30:43-03:00"
  docs/phases/phase-03-upload-processamento/library-refs.md: "2026-07-13T18:21:03-03:00"
---

# phase-03-upload-processamento — Context

## Scope

**Phase name:** Fase 03 — Upload e Processamento de Vídeos

**Capabilities** (literal, `docs/project-plan.md`):

- Serviço de armazenamento de arquivos (vídeos e thumbnails)
- Serviço de processamento em segundo plano (filas)
- Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance
- Pré-cadastro automático do vídeo como rascunho ao iniciar o upload
- Processamento automático do vídeo após upload (extração de duração e metadados)
- Geração automática de thumbnail a partir de um frame do vídeo
- URL única por vídeo, sem conflito com outros vídeos
- Reprodução via streaming (sem necessidade de download completo)
- Download do vídeo pelo usuário

**Out of scope:** _Not specified._

**Deliverables:** upload de até 10GB funcional, processamento automático do vídeo, streaming funcionando, URLs únicas geradas.

**Affected subprojects:**

- `nestjs-project` — upload endpoints (`initiate`/`confirm`), draft video lifecycle, storage/queue infrastructure.
- `video-worker` — standalone Node.js service that consumes processing jobs and performs metadata/thumbnail extraction (per `phase-03-upload-processamento/TD-01`).

**Deferred subprojects:** `next-frontend` — upload/studio screens exist under `app/(studio)/upload` but were built outside this tracked planning process; not covered by this document.

**Sequencing notes:** Depende de: Fase 01, Fase 02.

**Neighbors (for boundary detection only):**

- **Phase 02:** Fase 02 — Cadastro, Login e Gerenciamento de Conta (Depende de: Fase 01)
- **Phase 04:** Fase 04 — Gerenciamento de Vídeos e Canal (Depende de: Fase 02, Fase 03)

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision | Libraries |
|-----|--------|-------|-------|--------|----------|-----------|
| phase-03-upload-processamento/TD-01 | phase | Cross-layer (backend + infra) | Video Processing Worker Architecture | decided | B (implemented as `video-worker/`) | `bullmq@^5.x`, `fluent-ffmpeg@^2.1.x`, `minio@^8.x`, `pg@^8.x` |
| phase-03-upload-processamento/TD-02 | phase | Backend | Object Storage Client | decided | B (`minio` SDK) | `minio@^8.0.x` |
| phase-03-upload-processamento/TD-03 | phase | Backend | Metadata/Thumbnail Extraction Tool | decided | B (`fluent-ffmpeg` + native `ffmpeg`) | `fluent-ffmpeg@^2.1.x` |
| phase-03-upload-processamento/TD-04 | phase | Cross-layer (backend + storage) | Direct-to-Storage Upload Strategy | decided | B (presigned PUT via initiate/confirm endpoints) | — |
| phase-03-upload-processamento/TD-05 | phase | Backend | Worker Database Access | decided | B (`pg.Pool` hand-written SQL in `database.ts`) | `pg@^8.20.x` |
| phase-03-upload-processamento/TD-06 | phase | `nestjs-project/` (queue configuration) | Job Retry Policy | decided | B (`attempts: 3`, exponential backoff 5000ms) | — |
| phase-03-upload-processamento/TD-07 | phase | Backend | Thumbnail Seek Offset for Short Videos | decided | B (`seekSeconds` formula in `processor.ts`) | — |
| phase-03-upload-processamento/TD-08 | phase | Backend | Video URL Uniqueness Strategy | decided | B (`slug` column, `varchar(12) unique`) | — |

_Source files:_

- phase-03-upload-processamento — `docs/decisions/technical-decisions-phase-03-upload-processamento.md` (scope_type: phase)

## Capability Coverage

| Capability (from project-plan.md) | Covered by |
|-----------------------------------|------------|
| Serviço de armazenamento de arquivos (vídeos e thumbnails) | phase-03-upload-processamento/TD-02 |
| Serviço de processamento em segundo plano (filas) | phase-03-upload-processamento/TD-01 |
| Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance | phase-03-upload-processamento/TD-04 |
| Pré-cadastro automático do vídeo como rascunho ao iniciar o upload | phase-03-upload-processamento/TD-04 |
| Processamento automático do vídeo após upload (extração de duração e metadados) | phase-03-upload-processamento/TD-01, phase-03-upload-processamento/TD-03, phase-03-upload-processamento/TD-06, phase-03-upload-processamento/TD-05 |
| Geração automática de thumbnail a partir de um frame do vídeo | phase-03-upload-processamento/TD-01, phase-03-upload-processamento/TD-03, phase-03-upload-processamento/TD-07, phase-03-upload-processamento/TD-05 |
| URL única por vídeo, sem conflito com outros vídeos | phase-03-upload-processamento/TD-08 |
| Reprodução via streaming (sem necessidade de download completo) | phase-03-upload-processamento/TD-04 |
| Download do vídeo pelo usuário | phase-03-upload-processamento/TD-04 |

## Decisions Detail

### phase-03-upload-processamento/TD-01

**Recommendation:** the architecture diagram already specifies a separate Video Worker container, and isolating FFmpeg's CPU/memory profile from the request-serving API is the right default for a video platform.
**Libraries:** `bullmq@^5.x`, `fluent-ffmpeg@^2.1.x`, `minio@^8.x`, `pg@^8.x`

### phase-03-upload-processamento/TD-02

**Recommendation:** lighter dependency footprint for the operations this project actually performs, and MinIO is the object storage already running in `compose.yaml`.
**Libraries:** `minio@^8.0.x`

### phase-03-upload-processamento/TD-03

**Recommendation:** native performance matters for large video files, and the binary dependency is fully contained to the `video-worker` image.
**Libraries:** `fluent-ffmpeg@^2.1.x`

### phase-03-upload-processamento/TD-04

**Recommendation:** required to satisfy the 10GB/no-performance-impact requirement; the two-step flow is a standard, well-understood trade-off for large-file uploads.
**Libraries:** —

### phase-03-upload-processamento/TD-05

**Recommendation:** the worker's data-access surface is intentionally tiny; a full ORM is disproportionate machinery for 3 fixed queries, and keeping it dependency-light is consistent with TD-01's isolation rationale.
**Libraries:** `pg@^8.20.x`

### phase-03-upload-processamento/TD-06

**Recommendation:** bounded retry with backoff is the standard mitigation for exactly the transient-infra-failure case described above, and costs nothing for the common (single-attempt-success) path.
**Libraries:** —

### phase-03-upload-processamento/TD-07

**Recommendation:** every video should get a thumbnail; the fix is a small, local calculation with no new dependencies.
**Libraries:** —

### phase-03-upload-processamento/TD-08

**Recommendation:** matches the project's existing pattern of using generated random handles for public-facing identifiers (see `phase-02-auth/TD-10`'s channel nickname generation), and keeps public URLs decoupled from any internal ID scheme.
**Libraries:** —

## Inherited Decisions Detail

### phase-01-configuracao-base/TD-01

**Recommendation:** Option A (@nestjs/config) — Official, core-team-maintained, guaranteed NestJS 11 compatibility. The `registerAs()` factory pattern solves the TypeORM CLI sharing problem: the factory function can be imported as a plain function by `data-source.ts` while also serving as a DI injection token inside NestJS. Building a custom module recreates solved functionality; third-party packages carry maintenance risk.
**Libraries:** `@nestjs/config@^4.x`

### phase-01-configuracao-base/TD-02

**Recommendation:** Option A (Joi) — First-class integration with `@nestjs/config` via `validationSchema`, requiring zero custom wiring. Handles string-to-number coercion natively.
**Libraries:** `joi@^17.x`

### phase-01-configuracao-base/TD-03

**Recommendation:** Option B (Namespaced/grouped with registerAs) — Namespaced configs provide clear file boundaries per domain, typed injection via `ConfigType<typeof databaseConfig>`, and natural scalability.
**Libraries:** —

### phase-01-configuracao-base/TD-04

**Recommendation:** Option A (Shared registerAs factory) — Natural outcome of choosing `@nestjs/config` with `registerAs`. Zero duplication, minimal code, no extra abstraction.
**Libraries:** `dotenv` (transitive via `@nestjs/config`)

### phase-02-auth/TD-01

**Recommendation:** Argon2id — For a greenfield project in 2026, Argon2id is the OWASP-recommended choice. The native build dependency is a one-time Docker setup cost.
**Libraries:** `argon2@^0.41.x`

### phase-02-auth/TD-02

**Recommendation:** Option A (@nestjs/passport) — Aligns with official NestJS docs, making onboarding and maintenance easier.
**Libraries:** `@nestjs/jwt@^11.0.0`

### phase-02-auth/TD-03

**Recommendation:** Option A (Refresh Token Rotation) — Provides the strongest security model with automatic theft detection. PostgreSQL is already in the stack, so no new infrastructure needed.
**Libraries:** —

### phase-02-auth/TD-04

**Recommendation:** Option B (Random Opaque Tokens in DB) — Revocability is important; the tokens table can also serve future needs. Keeps email tokens decoupled from the JWT auth system.
**Libraries:** —

### phase-02-auth/TD-05

**Recommendation:** Option A (@nestjs-modules/mailer) — Best NestJS integration with minimal boilerplate, works with MailHog/Mailpit for local development.
**Libraries:** `@nestjs-modules/mailer@^2.x`, `handlebars@^4.x`

### phase-02-auth/TD-06

**Recommendation:** Option A (class-validator + class-transformer) — This is a backend-only project (no shared schemas with frontend); class-validator is the documented NestJS approach.
**Libraries:** `class-validator@^0.14.x`, `class-transformer@^0.5.x`

### phase-02-auth/TD-07

**Recommendation:** Option A (Custom Domain Exception Filter) — Provides machine-readable error codes for the frontend without the overhead of RFC 9457's URI-based type system.
**Libraries:** —

### phase-02-auth/TD-08

**Recommendation:** Option A (@nestjs/throttler) — Native NestJS integration is decisive: guard scoping to `AuthModule` via module-level `APP_GUARD`, with `@SkipThrottle()` for exemptions.
**Libraries:** `@nestjs/throttler@^6.x`

### phase-02-auth/TD-09

**Recommendation:** Option B (Opaque) — Since DB lookup is mandatory (TD-03), JWT signature adds no security value.
**Libraries:** `@nestjs/jwt@^11.0.0`

### phase-02-auth/TD-10

**Recommendation:** Option A — A strict `[a-z0-9_]` allowlist is the simplest and most portable choice; the `user_<random>` fallback provides a valid handle even for extreme email prefixes.
**Libraries:** —

## Inherited Conventions

- Backend config uses `@nestjs/config` with namespaced `registerAs(name, () => ({...}))` factories — one file per domain in `src/config/`. _(from phase 01)_
- Env variables are validated by a Joi schema in `src/config/env.validation.ts`, passed to `ConfigModule.forRoot({ validationSchema, validationOptions: { allowUnknown: true, abortEarly: false } })`. _(from phase 01)_
- Config is injected into modules via `ConfigType<typeof xxxConfig>` and `@Inject(xxxConfig.KEY)`; the same factory is importable as a plain function for non-DI contexts (e.g., TypeORM CLI). _(from phase 01)_
- `data-source.ts` loads `.env` via `import 'dotenv/config'` at the top, then imports `databaseConfig` and calls it as a plain function. _(from phase 01)_
- Database connection parameters (host, port, etc.) are sourced from a single `databaseConfig` factory — never duplicated between `AppModule` and `data-source.ts`. _(from phase 01)_
- `TypeOrmModule.forRootAsync` is used (not `forRoot`), with `imports: [ConfigModule]`, `inject: [databaseConfig.KEY]`, `useFactory` returning options including `autoLoadEntities: true`, `synchronize: false`. _(from phase 01)_

## Inherited Deferred Capabilities

| Capability | Status | Origin phase | Rationale |
|-----------|--------|--------------|-----------|
| Telas de frontend | deferred | phase-01-configuracao-base | `next-frontend/` is not initialized in this phase; UI surfaces start in a later phase. |
| Telas de cadastro, login, confirmação de conta e recuperação de senha | deferred | phase-02-auth | `next-frontend/` is not initialized in this phase; UI surfaces start in a later phase. |
| "Confirmação de conta via e-mail com link de ativação" | deferred | phase-02-auth-frontend | UI landing screen de-scoped 2026-05-14; FE confirmation flow (TD-07) picked up by a future phase. |
| "Logout" | deferred | phase-02-auth-frontend | Logout button lives inside authenticated chrome (typically Phase 04). Phase 02 already implements `POST /api/auth/logout`. |
| "Recuperação de senha (destination screen / set-new-password)" | deferred | phase-02-auth-frontend | `/forgot-password` ships in phase 02; the reset-password destination screen is absent from Figma and deferred to a later phase. |

## Non-UI / Deferred Capabilities

| Capability | Status | Rationale | TD refs |
|-----------|--------|-----------|---------|
| _None._ | | | |

## Testing Requirements

### nestjs-project

| Artifact created | Required tests |
|---|---|
| Entity (`*.entity.ts`) | Integration: constraints, defaults, `select: false` |
| Service with branching + DB | Unit: branch logic (mock repo) + Integration: DB contract |
| Service with DB only (no branching) | Integration: DB contract |
| Service with configured lib (JWT, cache) | Unit: real lib with test config |
| Service with side-effect dep (email, storage) | Integration: real capture service (Mailpit) or local adapter |
| Module with configured imports | Unit: compilation test |
| Controller | E2E only — do NOT write unit tests |
| DTO | E2E: one validation wiring test per endpoint |
| Guard (delegates to service for business logic) | E2E + Unit if complex internal logic |
| Guard (simple, delegates to Passport) | E2E only |
| Strategy (Passport) | E2E via guard |
| Pipe (custom transformation/validation) | Unit |
| Interceptor (response transform, logging) | Unit and/or E2E |
| Exception Filter | Unit + E2E |
| Middleware | E2E |

### video-worker

_No testing guide available — layer requirements deferred to implementation. `video-worker/` is a separate, non-NestJS subproject; by convention (already applied in its existing test suite) it mirrors `nestjs-project`'s suffix convention (`*.spec.ts` unit — all I/O mocked; `*.integration-spec.ts` — real Postgres/MinIO/ffmpeg) using Jest + `ts-jest`._
