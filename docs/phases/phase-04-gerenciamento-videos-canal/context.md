---
kind: phase
name: phase-04-gerenciamento-videos-canal
sources_mtime:
  docs/project-plan.md: "2026-04-08T14:58:57-03:00"
  docs/decisions/technical-decisions-phase-04-gerenciamento-videos-canal.md: "2026-07-01T00:00:00-03:00"
  docs/phases/phase-03-upload-processamento/context.md: "2026-07-01T00:00:00-03:00"
note: "Retroactive — written after the code already existed. See the note in the decisions document for why."
---

# phase-04-gerenciamento-videos-canal — Context

## Scope

**Phase name:** Fase 04 — Gerenciamento de Vídeos e Canal

**Capabilities**

- Categorias de vídeo disponíveis na plataforma
- Edição das informações do vídeo: título, descrição, categoria e thumbnail customizada
- Visibilidade do vídeo: público (aparece para todos) ou unlisted (somente via link)
- Fluxo de rascunho → publicação
- Painel de gerenciamento de vídeos do canal (thumbnail, título, visualizações, likes, comentários, tempo de publicação e status)
- Edição de vídeos a partir do painel
- Edição das informações do canal: nickname, nome e descrição
- Página pública do canal com informações e listagem de vídeos

**Out of scope:** Player de vídeo e sugestões (Fase 05); likes/comentários/inscrições (Fase 06); home/busca/deploy (Fase 07). Upload/processamento (`initiateUpload`/`confirmUpload`) is Fase 03 and not re-tested here.

**Deliverables:** edição completa de vídeos, rascunho/publicação, painel de gerenciamento, edição de canal, página pública do canal.

**Affected subprojects:** `nestjs-project/` (this close-out: `categories`, `videos` management endpoints, `channels` update/public-page endpoints — tests + docs only, no implementation changes)

**Deferred subprojects:** `next-frontend/` — `studio/videos/[id]/edit`, `studio/channel`, `channels/[nickname]` already exist and call the real API, but have zero automated tests (no vitest component/route tests, no Playwright e2e). Left for a future frontend-testing pass.

**Sequencing notes:** Depends on Fase 02 (channel ownership) e Fase 03 (a video must exist/be processed before it can be managed/published).

**Neighbors (for boundary detection only):** Fase 03 (prior), Fase 05 — Página de Visualização do Vídeo (next).

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision | Libraries |
|-----|--------|-------|-------|--------|----------|-----------|
| phase-04-gerenciamento-videos-canal/TD-01 | technical-decisions-phase-04-gerenciamento-videos-canal.md | Backend | Category Management Strategy | decided | B (fixed taxonomy, read-only) | — |
| phase-04-gerenciamento-videos-canal/TD-02 | technical-decisions-phase-04-gerenciamento-videos-canal.md | Backend | Video Edit/Publish Authorization Model | decided | B (inline service check) | — |
| phase-04-gerenciamento-videos-canal/TD-03 | technical-decisions-phase-04-gerenciamento-videos-canal.md | Backend | Draft → Publish State Machine | decided | B (require status=READY) | — |
| phase-04-gerenciamento-videos-canal/TD-04 | technical-decisions-phase-04-gerenciamento-videos-canal.md | Backend | Channel Nickname Update Collision Handling | decided | B (pre-check + domain exception) | — |

_Source files:_

- `docs/decisions/technical-decisions-phase-04-gerenciamento-videos-canal.md`

## Capability Coverage

| Capability | Covered by |
|------------|------------|
| Categorias de vídeo disponíveis na plataforma | phase-04-gerenciamento-videos-canal/TD-01 |
| Edição das informações do vídeo | phase-04-gerenciamento-videos-canal/TD-02 |
| Visibilidade do vídeo (público/unlisted) | phase-04-gerenciamento-videos-canal/TD-03 (set at publish time); enforcement of unlisted-exclusion-from-listings is a Fase 05 concern (see Validation → advisories) |
| Fluxo de rascunho → publicação | phase-04-gerenciamento-videos-canal/TD-03 |
| Painel de gerenciamento de vídeos do canal | _Implemented via `GET /videos/channel/me`; no dedicated TD (straightforward paginated query, no alternatives considered). **Gap**: response does not include likes/comments counts (see Validation → advisories)._ |
| Edição de vídeos a partir do painel | phase-04-gerenciamento-videos-canal/TD-02 |
| Edição das informações do canal | phase-04-gerenciamento-videos-canal/TD-04 |
| Página pública do canal | _Implemented via `GET /channels/:nickname`; no dedicated TD. **Gap**: does not surface subscriber count (see Validation → advisories)._ |

## Decisions Detail

See `docs/decisions/technical-decisions-phase-04-gerenciamento-videos-canal.md` for full Options/Recommendation/Decision text for TD-01 through TD-04.

## Inherited Conventions

- Services throw domain exceptions (`common/exceptions/domain.exception.ts`); controllers stay thin; `DomainExceptionFilter` maps to `{ statusCode, error, message }`. _(from phase 02)_
- Every endpoint is protected by the global JWT guard by default; public routes opt out via `@Public()`. _(from phase 02)_
- Object storage access goes through `StorageService` (MinIO SDK); presigned URLs for client-facing file operations. _(from phase 03)_
- Integration tests use `createTestDataSource([...entities])` + `cleanAllTables(dataSource)`, never `DROP TABLE`, against the shared dev database. _(from phase 02, reinforced by the phase-02 SI-02.19 fix this session)_
- E2E tests use `Test.createTestingModule({ imports: [AppModule] })` + manually-applied global `ValidationPipe`/exception filters + a local `registerConfirmAndLogin()` helper (register → capture confirmation token via `mailService` spy → confirm → login) to obtain an authenticated user/channel. _(from phase 02's `auth.e2e-spec.ts`)_

## Non-UI / Deferred Capabilities

| Capability | Status | Rationale | TD refs |
|------------|--------|-----------|---------|
| Telas de edição de vídeo/canal, painel de gerenciamento, página pública (frontend) | deferred (untested) | `next-frontend` routes exist and call the real API but have zero automated test coverage; out of scope for this backend-only close-out. | — |

## Testing Requirements

Refer to the `testing-guide-nestjs-project` skill. This close-out added the first integration/e2e coverage for `categories` (previously had zero tests of any kind) and the Fase-04-specific `videos` management endpoints and `channels` endpoints (previously unit/integration at the service layer only, no e2e). Specific test files and results are recorded in `progress.md`.
