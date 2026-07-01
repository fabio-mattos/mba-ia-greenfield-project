---
kind: phase
name: phase-03-upload-processamento
sources_mtime:
  docs/project-plan.md: "2026-04-08T14:58:57-03:00"
  docs/decisions/technical-decisions-phase-03-upload-processamento.md: "2026-07-01T00:00:00-03:00"
  docs/phases/phase-02-auth/phase-02-auth.md: "2026-04-08T14:58:57-03:00"
note: "Retroactive — written after the code already existed. See the note in the decisions document for why."
---

# phase-03-upload-processamento — Context

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

**Out of scope:** Edição de informações do vídeo, rascunho→publicação, painel de gerenciamento, página pública do canal (Fase 04); player de vídeo e sugestões (Fase 05); likes/comentários/inscrições (Fase 06); home/busca/deploy (Fase 07).

**Deliverables:** upload de até 10GB funcional, processamento automático do vídeo, streaming funcionando, URLs únicas geradas.

**Affected subprojects:** `nestjs-project/`, `video-worker/` (new standalone subproject)

**Deferred subprojects:** `next-frontend/` — screens under `app/(studio)/upload` exist in the repository but were built outside this tracked process; not covered by this document.

**Sequencing notes:** Depends on Fase 01 — Configuração Base do Projeto, Fase 02 — Cadastro, Login e Gerenciamento de Conta (a video belongs to a channel, which belongs to a user).

**Neighbors (for boundary detection only):** Fase 02 (prior), Fase 04 — Gerenciamento de Vídeos e Canal (next).

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision | Libraries |
|-----|--------|-------|-------|--------|----------|-----------|
| phase-03-upload-processamento/TD-01 | technical-decisions-phase-03-upload-processamento.md | Cross-layer | Video Processing Worker Architecture | decided | B (Standalone Node.js service) | bullmq@^5.x, fluent-ffmpeg@^2.1.x, minio@^8.x, pg@^8.x |
| phase-03-upload-processamento/TD-02 | technical-decisions-phase-03-upload-processamento.md | Backend | Object Storage Client | decided | B (minio SDK) | minio@^8.0.x |
| phase-03-upload-processamento/TD-03 | technical-decisions-phase-03-upload-processamento.md | video-worker | Metadata/Thumbnail Extraction Tool | decided | B (fluent-ffmpeg + native ffmpeg) | fluent-ffmpeg@^2.1.x |
| phase-03-upload-processamento/TD-04 | technical-decisions-phase-03-upload-processamento.md | Cross-layer | Direct-to-Storage Upload Strategy | decided | B (Presigned PUT URL) | — |
| phase-03-upload-processamento/TD-05 | technical-decisions-phase-03-upload-processamento.md | video-worker | Worker Database Access | decided | B (raw pg) | pg@^8.20.x |
| phase-03-upload-processamento/TD-06 | technical-decisions-phase-03-upload-processamento.md | Backend | Job Retry Policy | decided | B (BullMQ exponential backoff) | — |
| phase-03-upload-processamento/TD-07 | technical-decisions-phase-03-upload-processamento.md | video-worker | Thumbnail Seek Offset for Short Videos | decided | B (proportional seek, capped at 5s) | — |

_Source files:_

- `docs/decisions/technical-decisions-phase-03-upload-processamento.md`

## Capability Coverage

| Capability | Covered by |
|------------|------------|
| Serviço de armazenamento de arquivos (vídeos e thumbnails) | phase-03-upload-processamento/TD-02 |
| Serviço de processamento em segundo plano (filas) | phase-03-upload-processamento/TD-01, phase-03-upload-processamento/TD-06 |
| Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance | phase-03-upload-processamento/TD-04 |
| Pré-cadastro automático do vídeo como rascunho ao iniciar o upload | _Implemented in `VideosService.initiateUpload`; no dedicated TD (straightforward DB insert, no alternatives considered)._ |
| Processamento automático do vídeo após upload (extração de duração e metadados) | phase-03-upload-processamento/TD-01, phase-03-upload-processamento/TD-03, phase-03-upload-processamento/TD-05, phase-03-upload-processamento/TD-06 |
| Geração automática de thumbnail a partir de um frame do vídeo | phase-03-upload-processamento/TD-03, phase-03-upload-processamento/TD-07 |
| URL única por vídeo, sem conflito com outros vídeos | _Implemented via `slug.util.ts` (random slug, unique DB constraint); no dedicated TD._ |
| Reprodução via streaming (sem necessidade de download completo) | _Implemented via presigned GET URL (`getStreamUrl`), same mechanism as TD-04's upload URL; no separate TD._ |
| Download do vídeo pelo usuário | _Implemented via presigned GET URL with `Content-Disposition: attachment` (`getDownloadUrl`); no separate TD._ |

## Decisions Detail

See `docs/decisions/technical-decisions-phase-03-upload-processamento.md` for full Options/Recommendation/Decision text for TD-01 through TD-07.

## Inherited Conventions

- Backend config uses `@nestjs/config` with namespaced `registerAs(name, () => ({...}))` factories — one file per domain in `src/config/`. _(from phase 01)_
- Config is injected into modules via `ConfigType<typeof xxxConfig>` and `@Inject(xxxConfig.KEY)`. _(from phase 01)_
- Migrations are immutable once executed; changes require a new migration. _(from phase 01/typeorm-migrations rule)_
- Services throw domain exceptions; controllers stay thin and never `try/catch`; exception filters map to HTTP responses. _(from phase 02)_
- Every controller endpoint is protected by the global JWT guard by default; public routes opt out via `@Public()`. _(from phase 02)_

## Non-UI / Deferred Capabilities

| Capability | Status | Rationale | TD refs |
|------------|--------|-----------|---------|
| Telas de upload/estúdio | deferred (untracked) | `next-frontend/(studio)/upload` exists in the repo but was built outside this phase-tracking process; not audited here. | — |

## Testing Requirements

Refer to the `testing-guide-nestjs-project` skill for `nestjs-project/` layer conventions. `video-worker/` is a separate, non-NestJS subproject; its test suffix convention mirrors `nestjs-project`'s (`*.spec.ts` unit — all I/O mocked; `*.integration-spec.ts` — real Postgres/MinIO/ffmpeg) using Jest + `ts-jest`, added as part of SI-03.4 below. `video-worker/src/processor.integration-spec.ts` generates its own synthetic video fixtures via `ffmpeg`'s `lavfi` test source rather than committing binary fixtures.
