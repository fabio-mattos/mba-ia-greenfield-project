---
kind: phase
name: phase-05-pagina-visualizacao-video
sources_mtime:
  docs/project-plan.md: "2026-04-08T14:58:57-03:00"
  docs/decisions/technical-decisions-phase-05-pagina-visualizacao-video.md: "2026-07-01T00:00:00-03:00"
  docs/phases/phase-04-gerenciamento-videos-canal/context.md: "2026-07-01T00:00:00-03:00"
note: "Retroactive — written after the code already existed. See the note in the decisions document for why."
---

# phase-05-pagina-visualizacao-video — Context

## Scope

**Phase name:** Fase 05 — Página de Visualização do Vídeo

**Capabilities**

- Player de vídeo com controles: play/pause, volume e barra de progresso
- Layout da página: vídeo principal + informações + sidebar com sugestões
- Descrição do vídeo com expansão/recolhimento
- Contagem de visualizações
- Sugestões de vídeos da mesma categoria na sidebar
- Acesso anônimo à visualização de vídeos
- Botão de download do vídeo
- Vídeos unlisted acessíveis apenas via link direto (sem aparecer em listagens)

**Out of scope:** Likes/comentários/inscrições (Fase 06 — the watch page already renders `LikeDislikeBar`/`CommentSection`/`SubscribeButton`, but those components' own endpoints are Fase 06's, not re-tested here). Home/busca (Fase 07).

**Deliverables:** página de visualização com player funcional, sidebar de sugestões, download e acesso anônimo — backend access-control gate corrected; player/layout/description-expander are frontend components (`next-frontend/components/video/`), already implemented, untested (deferred).

**Affected subprojects:** `nestjs-project/` (`videos.service.ts`/`videos.controller.ts`, `auth/guards/jwt-auth.guard.ts` — the guard is Phase 02 infrastructure, fixed here as a prerequisite, documented retroactively in `docs/phases/phase-02-auth/progress.md` SI-02.20)

**Deferred subprojects:** `next-frontend/` — `watch/[slug]/page.tsx`, `video-player.tsx`, `description-expander.tsx`, `suggestion-card.tsx` already exist and call the real API but have zero automated tests.

**Sequencing notes:** Depends on Fase 03 (vídeo precisa existir/processado) e Fase 04 (rascunho→publicação define quando um vídeo se torna visível).

**Neighbors (for boundary detection only):** Fase 04 (prior), Fase 06 — Interações Sociais (next).

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision | Libraries |
|-----|--------|-------|-------|--------|----------|-----------|
| phase-05-pagina-visualizacao-video/TD-01 | technical-decisions-phase-05-pagina-visualizacao-video.md | Backend | Access Control on Video Detail/Stream/Download Endpoints | decided | B (same endpoint, owner-aware gate) | — |
| phase-05-pagina-visualizacao-video/TD-02 | technical-decisions-phase-05-pagina-visualizacao-video.md | Backend | 404 vs. 403 for Inaccessible Videos | decided | B (404) | — |
| phase-05-pagina-visualizacao-video/TD-03 | technical-decisions-phase-05-pagina-visualizacao-video.md | Backend (cross-cutting) | JwtAuthGuard Optional Authentication on @Public() Routes | decided | B (guard fails open, populates req.user when a valid token is present) | — |

_Source files:_

- `docs/decisions/technical-decisions-phase-05-pagina-visualizacao-video.md`

## Capability Coverage

| Capability | Covered by |
|------------|------------|
| Acesso anônimo à visualização de vídeos | phase-05-pagina-visualizacao-video/TD-01, TD-02, TD-03 |
| Vídeos unlisted acessíveis apenas via link direto | phase-05-pagina-visualizacao-video/TD-01 |
| Contagem de visualizações | _Implemented via `POST /videos/:slug/view` (atomic `view_count + 1`); no dedicated TD — straightforward, no alternatives considered. Not gated by `assertViewable` (see Validation → advisories)._ |
| Sugestões de vídeos da mesma categoria | _Implemented via `GET /videos/:slug/suggestions`, already filters `status=READY AND visibility=PUBLIC` internally for the suggested list; the source video's own visibility is not checked (see Validation → advisories)._ |
| Player de vídeo, layout, descrição expansível | _Frontend components (`video-player.tsx`, `description-expander.tsx`); no backend TD, deferred test coverage (see Non-UI section)._ |
| Botão de download | phase-05-pagina-visualizacao-video/TD-01 (same gate as streaming) |

## Decisions Detail

See `docs/decisions/technical-decisions-phase-05-pagina-visualizacao-video.md` for full Options/Recommendation/Decision text for TD-01 through TD-03.

## Inherited Conventions

- Services throw domain exceptions; `DomainExceptionFilter` maps to `{ statusCode, error, message }`. _(from phase 02)_
- Ownership checks live in the service, next to the operation they guard (Phase 04's `NotVideoOwnerException` pattern) — TD-01 reuses the same shape but resolves to 404 instead of 403 for the reason in TD-02. _(from phase 04)_
- Object storage access goes through `StorageService`; presigned URLs for stream/download. _(from phase 03)_
- E2E tests use `registerConfirmAndLogin()` (local per-file helper) + direct repository fixture inserts, bypassing the real upload/processing flow. _(from phase 04)_

## Non-UI / Deferred Capabilities

| Capability | Status | Rationale | TD refs |
|------------|--------|-----------|---------|
| Player/layout/description-expander (frontend) | deferred (untested) | `next-frontend` components exist and call the real API but have zero automated test coverage; out of scope for this backend-only close-out. | — |

## Testing Requirements

Refer to the `testing-guide-nestjs-project` skill. This close-out added: guard-level unit tests for optional authentication (`jwt-auth.guard.spec.ts`); unit + integration + e2e coverage for the owner/anonymous/stranger × draft/ready-public/ready-unlisted access matrix on `findBySlug`/`getStreamUrl`/`getDownloadUrl`; and first-ever coverage (integration + e2e) for `incrementViewCount`/`getSuggestionsBySlug`, which previously had none. Specific test files and results are recorded in `progress.md`.
