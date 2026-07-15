---
kind: phase
name: phase-03-videos
sources_mtime:
  docs/project-plan.md: "2026-04-08T14:58:32-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-07-13T19:57:10-03:00"
  docs/decisions/technical-decisions-openapi-docs-nestjs.md: "2026-05-12T16:17:25-03:00"
  docs/phases/phase-01-configuracao-base/context.md: "2026-05-12T14:06:13-03:00"
  docs/phases/phase-02-auth/context.md: "2026-05-12T14:06:13-03:00"
  .claude/skills/testing-guide-nestjs-project/SKILL.md: "2026-04-01T10:23:39-03:00"
  docs/phases/phase-03-videos/library-refs.md: "2026-07-13T20:01:07-03:00"
---

# phase-03-videos — Context

## Scope

**Phase name:** Fase 03 — Upload e Processamento de Vídeos

**Capabilities**

- Serviço de armazenamento de arquivos (vídeos e thumbnails)
- Serviço de processamento em segundo plano (filas)
- Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance
- Pré-cadastro automático do vídeo como rascunho ao iniciar o upload
- Processamento automático do vídeo após upload (extração de duração e metadados)
- Geração automática de thumbnail a partir de um frame do vídeo
- URL única por vídeo, sem conflito com outros vídeos
- Reprodução via streaming (sem necessidade de download completo)
- Download do vídeo pelo usuário

**Out of scope:** Edição de informações do vídeo, categorias, visibilidade pública/unlisted, painel de gerenciamento, página pública do canal (Fase 04); comentários, likes, inscrições (Fase 06); busca e home (Fase 07); qualquer tela/UI de upload ou player (frontend não está no escopo desta fase — desafio é backend-only).

**Deliverables:** upload de até 10GB funcional, processamento automático do vídeo, streaming funcionando, URLs únicas geradas.

**Affected subprojects:** `nestjs-project/` (API + novo processo worker)

**Deferred subprojects:** `next-frontend/` — telas de upload/player ficam para quando o frontend cobrir vídeos (fora do escopo desta fase, que é backend-only).

**Sequencing notes:** Depends on Fase 01 (infra base) e Fase 02 (cada vídeo pertence a um canal, criado no cadastro do usuário).

**Neighbors (for boundary detection only):**
- **Fase 02:** Cadastro, Login e Gerenciamento de Conta (prior) — fornece a entidade `Channel` (relação 1:1 com `User`) à qual os vídeos desta fase pertencem.
- **Fase 04:** Gerenciamento de Vídeos e Canal (next) — edição de metadados, categorias, visibilidade e painel de gerenciamento consomem a entidade `Video` criada aqui, mas não fazem parte desta fase.

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision | Libraries |
|-----|--------|-------|-------|--------|----------|-----------|
| videos/TD-01 | technical-decisions-phase-03-videos.md | Backend | Background Processing Queue Technology | decided | A (BullMQ + Redis) | @nestjs/bullmq, bullmq, ioredis |
| videos/TD-02 | technical-decisions-phase-03-videos.md | Backend | Large File Upload Strategy (10GB) | decided | B (Presigned Multipart Upload) | @aws-sdk/client-s3, @aws-sdk/s3-request-presigner |
| videos/TD-03 | technical-decisions-phase-03-videos.md | Backend | Object Storage Bucket & Key Organization | decided | A (Single bucket, `videos/{videoId}/...` prefix) | — |
| videos/TD-04 | technical-decisions-phase-03-videos.md | Backend | Video Worker Architecture & FFmpeg Integration | decided | A (NestJS worker + apt-installed FFmpeg) | fluent-ffmpeg, @types/fluent-ffmpeg |
| videos/TD-05 | technical-decisions-phase-03-videos.md | Backend | Unique Public Video Identifier | decided | A (Use PK UUID directly) | — |
| videos/TD-06 | technical-decisions-phase-03-videos.md | Backend | Streaming & Download Delivery Mechanism | decided | B (Presigned-redirect) | — |
| videos/TD-07 | technical-decisions-phase-03-videos.md | Backend | Video Status Lifecycle & Failure Handling | decided | A (4-state enum + automatic retry) | — |
| videos/TD-08 | technical-decisions-phase-03-videos.md | Backend | Access Control for Non-Ready Videos & Status Check Endpoint | decided | A (Owner-only until ready + minimal GET /videos/:id) | — |

_Source files:_

- `videos` — `docs/decisions/technical-decisions-phase-03-videos.md` (scope_type: phase)

## Capability Coverage

| Capability (from project-plan.md) | Covered by |
|-----------------------------------|------------|
| Serviço de armazenamento de arquivos (vídeos e thumbnails) | videos/TD-03 |
| Serviço de processamento em segundo plano (filas) | videos/TD-01 |
| Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance | videos/TD-02 |
| Pré-cadastro automático do vídeo como rascunho ao iniciar o upload | videos/TD-07, videos/TD-08 |
| Processamento automático do vídeo após upload (extração de duração e metadados) | videos/TD-04, videos/TD-07 |
| Geração automática de thumbnail a partir de um frame do vídeo | videos/TD-04 |
| URL única por vídeo, sem conflito com outros vídeos | videos/TD-05 |
| Reprodução via streaming (sem necessidade de download completo) | videos/TD-06, videos/TD-08 |
| Download do vídeo pelo usuário | videos/TD-06 |

## Decisions Detail

### videos/TD-01

**Recommendation:** Option A (BullMQ + Redis) — matches the architecture diagram's separate "Message Queue" container, has the most direct NestJS integration for exactly this producer/consumer/retry shape, and keeps queue churn off the primary OLTP database.

**Libraries:** `@nestjs/bullmq`, `bullmq`, `ioredis`

### videos/TD-02

**Recommendation:** Option B (Presigned Multipart Upload) — the only option that actually satisfies the 10GB requirement (single PUT is hard-capped at 5GB), needs no infrastructure beyond the object storage already planned, and is natively supported by both MinIO and the AWS SDK v3 client.

**Libraries:** `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`

### videos/TD-03

**Recommendation:** Option A (single bucket, `videos/{videoId}/...` prefix) — simplest to provision, and the video-id-scoped prefix already guarantees collision-free, video-attributable keys.

**Libraries:** —

### videos/TD-04

**Recommendation:** Option A (dedicated NestJS worker + apt-installed FFmpeg) — reuses the existing entities/config/DI conventions (no duplicated schema knowledge between API and worker), matches the architecture diagram's dedicated Video Worker container, and uses the standard, best-documented FFmpeg wrapper backed by a properly-updatable OS package.

**Libraries:** `fluent-ffmpeg`, `@types/fluent-ffmpeg`

**Revisions:**
- 2026-07-13 — Itemized the exact `ffprobe` metadata fields: `durationInSeconds`, `width`, `height`, `codec`, `container`/`format`, `bitrateKbps`, `fileSizeBytes`. Rationale: resolves plan-validate AMB-1 (project-plan.md's "metadados" wasn't itemized) so the Data Model has concrete columns.

### videos/TD-05

**Recommendation:** Option A (use the primary key UUID directly) — the requirement is strictly "unique URL, no conflicts," already satisfied by the UUID v4 primary key with zero additional mechanism.

**Libraries:** —

### videos/TD-06

**Recommendation:** Option B (presigned-redirect) — consistent with the upload strategy's principle of keeping large-payload I/O off the API process, delegating Range/206 correctness to MinIO's own implementation.

**Libraries:** —

### videos/TD-07

**Recommendation:** Option A (4-state enum + automatic queue-level retry) — matches the project plan's exact wording (rascunho → processando → pronto/erro), and uses BullMQ's built-in retry/backoff to absorb transient failures for free.

**Libraries:** —

### videos/TD-08

**Recommendation:** Option A (owner-only until `ready` + minimal `GET /videos/:id`) — the narrowest endpoint that keeps Phase 03 internally coherent and testable, without pulling in Phase 04's scope (editing, categories, listing, public/unlisted visibility).

**Libraries:** —

## Inherited Decisions Detail

### openapi-docs-nestjs/TD-01

**Recommendation:** Option A (`@nestjs/swagger` + CLI plugin) — preserves the `class-validator` decisions from phase-02-auth/TD-06 without re-platforming; the CLI plugin with `classValidatorShim: true` infers schemas from existing `class-validator` decorators.

**Libraries:** `@nestjs/swagger`

### openapi-docs-nestjs/TD-02

**Recommendation:** Option C (Runtime UI + exported `openapi.json`) — marginal cost over Option A is a single npm script; the benefit is a correct foundation for future FE codegen without losing the interactive UI used by dev/QA.

**Libraries:** —

### openapi-docs-nestjs/TD-03

**Recommendation:** Option B (Swagger UI only in dev/staging via env flag) — aligns with the defensive posture already established in phase 02; the committed `openapi.json` (TD-02) already serves as a consultable spec outside the UI.

**Libraries:** —

### phase-02-auth/TD-07

**Recommendation:** Option A (Custom Domain Exception Filter) — machine-readable error codes (`{ statusCode, error, message }`) the frontend can switch on; single-consumer project doesn't need RFC 9457's overhead.

**Libraries:** —

## Inherited Conventions

- Backend config uses `@nestjs/config` with namespaced `registerAs(name, () => ({...}))` factories — one file per domain in `src/config/`. _(from phase 01)_
- Env variables are validated by a Joi schema in `src/config/env.validation.ts`, passed to `ConfigModule.forRoot({ validationSchema, validationOptions: { allowUnknown: true, abortEarly: false } })`. _(from phase 01)_
- Config is injected into modules via `ConfigType<typeof xxxConfig>` and `@Inject(xxxConfig.KEY)`; the same factory is importable as a plain function for non-DI contexts (e.g., TypeORM CLI). _(from phase 01)_
- `TypeOrmModule.forRootAsync` is used (not `forRoot`), with `imports: [ConfigModule]`, `inject: [databaseConfig.KEY]`, `useFactory` returning options including `autoLoadEntities: true`, `synchronize: false`. _(from phase 01)_
- Error responses follow `{ statusCode, error, message }` with domain error codes in `SCREAMING_SNAKE_CASE`, enforced by a custom domain exception filter. _(from phase 02)_
- Request validation uses `class-validator` + `class-transformer` DTOs under the global `ValidationPipe`. _(from phase 02)_
- HTTP endpoints are documented via `@nestjs/swagger` decorators, reusing the `class-validator` CLI-plugin shim; the OpenAPI spec is exported to `openapi.json` and the interactive UI is disabled outside dev/staging. _(from openapi-docs-nestjs)_
- Global JWT guard (`APP_GUARD`) protects all routes by default; public routes are opted out explicitly (e.g., a `@Public()` decorator). _(from phase 02)_
- Every user has exactly one `Channel` (1:1), created at registration. _(from phase 02)_

## Inherited Deferred Capabilities

_No inherited deferred capabilities._

## Non-UI / Deferred Capabilities

| Capability | Status | Rationale | TD refs |
|------------|--------|-----------|---------|
| Upload/player UI | non-ui | Challenge brief scopes this phase as backend-only; `next-frontend/` video screens are out of scope entirely (not merely deferred to a later increment of this phase). | — |

## Testing Requirements

### nestjs-project

| Artifact type | Required layers |
|---------------|-----------------|
| Entity (`video.entity.ts`) | Integration: constraints, defaults, enum column |
| Service with branching + DB (`videos.service.ts`, presigned-upload logic) | Unit: branch logic (mock repo/storage) + Integration: DB contract |
| Service with side-effect dep (storage client, queue producer) | Integration: real capture (MinIO/Redis via Compose) |
| Module with configured imports (`videos.module.ts`, `queue.module.ts`, `storage.module.ts`) | Unit: compilation test |
| Controller (`videos.controller.ts`) | E2E only — do NOT write unit tests |
| DTO (initiate-upload, complete-upload, update-status) | E2E: one validation wiring test per endpoint |
| Queue Processor/Consumer (video processing worker) | Unit: business logic (mock deps) + Integration: real DB/storage via Compose |
| Migration (videos table) | Exercised via Integration tests against the real `db` service |

Refer to the `testing-guide-nestjs-project` Skill (§3 Feature Implementation Checklist, `artifacts/future-types.md` § "Queue Consumers / Processors") for the full recipe per artifact. Do not mock what can be exercised for real against the Compose infrastructure (MinIO, Redis, Postgres) — per `CLAUDE.md`'s Testing Policy and the challenge's explicit requirement that queue/worker/storage are real, not simulated.
