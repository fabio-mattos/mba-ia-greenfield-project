---
kind: phase
name: phase-06-interacoes-sociais
sources_mtime:
  docs/project-plan.md: "2026-04-08T14:58:57-03:00"
  docs/decisions/technical-decisions-phase-06-interacoes-sociais.md: "2026-07-01T00:00:00-03:00"
  docs/phases/phase-05-pagina-visualizacao-video/context.md: "2026-07-01T00:00:00-03:00"
note: "Retroactive — written after the code already existed. See the note in the decisions document for why."
---

# phase-06-interacoes-sociais — Context

## Scope

**Phase name:** Fase 06 — Interações Sociais (Likes, Comentários, Inscrições)

**Capabilities**

- Like e dislike em vídeos (usuários autenticados)
- Comentários em vídeos (usuários autenticados)
- Respostas a comentários (comentários aninhados)
- Like e dislike em comentários (usuários autenticados)
- Inscrição em canais (seguir/deixar de seguir)
- Área de canais seguidos com acesso rápido aos vídeos
- Contagem de inscritos na página do canal
- Interface completa de comentários, likes e inscrições

**Out of scope:** Home/busca/deploy (Fase 07).

**Deliverables:** likes/dislikes funcionando, comentários com respostas, inscrição em canais, listagem de canais seguidos — backend fully tested; frontend (`next-frontend/components/{video,comments,channel}/`) already implemented and wired to the real API, untested (deferred, consistent with Fases 03-05).

**Affected subprojects:** `nestjs-project/` (`video-likes`, `comments`, `comment-likes`, `subscriptions`)

**Deferred subprojects:** `next-frontend/` — `like-dislike-bar.tsx`, `comment-section.tsx`, `comment-item.tsx`, `comment-form.tsx`, `comment-like-bar.tsx`, `subscribe-button.tsx`, `app/subscriptions/page.tsx` already exist and call the real API; zero automated tests.

**Sequencing notes:** Depends on Fase 02 (autenticação/canal) e Fase 05 (o `JwtAuthGuard` optional-auth fix made in that phase's close-out is a direct prerequisite for `like-status`/`subscribe-status` to work correctly — see TD note below).

**Neighbors (for boundary detection only):** Fase 05 (prior), Fase 07 — Página Inicial, Busca e Finalização (next).

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision | Libraries |
|-----|--------|-------|-------|--------|----------|-----------|
| phase-06-interacoes-sociais/TD-01 | technical-decisions-phase-06-interacoes-sociais.md | Backend | Like/Dislike Persistence Strategy | decided | B (single upsert via `orUpdate`) | — |
| phase-06-interacoes-sociais/TD-02 | technical-decisions-phase-06-interacoes-sociais.md | Backend | Comment Deletion Strategy | decided | B (soft delete) | — |
| phase-06-interacoes-sociais/TD-03 | technical-decisions-phase-06-interacoes-sociais.md | Backend | Comment Nesting Depth Limit | decided | B (one level) | — |
| phase-06-interacoes-sociais/TD-04 | technical-decisions-phase-06-interacoes-sociais.md | Backend | Subscription Idempotency | decided | B (`orIgnore`) | — |

_Source files:_

- `docs/decisions/technical-decisions-phase-06-interacoes-sociais.md`

## Capability Coverage

| Capability | Covered by |
|------------|------------|
| Like e dislike em vídeos | phase-06-interacoes-sociais/TD-01 |
| Comentários em vídeos | phase-06-interacoes-sociais/TD-02 |
| Respostas a comentários (aninhados) | phase-06-interacoes-sociais/TD-03 |
| Like e dislike em comentários | phase-06-interacoes-sociais/TD-01 |
| Inscrição em canais | phase-06-interacoes-sociais/TD-04 |
| Área de canais seguidos | _Implemented via `GET /channels/me/subscriptions`; no dedicated TD (straightforward paginated query)._ |
| Contagem de inscritos na página do canal | _`SubscriptionsService.countSubscribers` exists but is not wired into `GET /channels/:nickname` — registered as a known gap in Fase 04's validation.md, not fixed here (out of this close-out's scope)._ |
| Interface completa (frontend) | _Implemented, untested — see Non-UI section._ |

## Decisions Detail

See `docs/decisions/technical-decisions-phase-06-interacoes-sociais.md` for full Options/Recommendation/Decision text for TD-01 through TD-04.

## Inherited Conventions

- Services throw domain exceptions; `DomainExceptionFilter` maps to `{ statusCode, error, message }`. _(from phase 02)_
- Optional-auth `@Public()` endpoints read `req.user?.sub ?? null` — only works correctly since the `JwtAuthGuard` fix in Fase 05 (previously `req.user` was never populated on public routes). _(from phase 05, SI-02.20)_
- E2E tests use `registerConfirmAndLogin()` (local per-file helper) + direct repository fixture inserts. _(from phase 04)_

## Non-UI / Deferred Capabilities

| Capability | Status | Rationale | TD refs |
|------------|--------|-----------|---------|
| Comment/like/subscribe UI components (frontend) | deferred (untested) | `next-frontend` components exist and call the real API but have zero automated test coverage; out of scope for this backend-only close-out. | — |

## Testing Requirements

Refer to the `testing-guide-nestjs-project` skill. This close-out added the first integration/e2e coverage for all four modules (previously unit-tested only, mocked repositories). The e2e suites also serve as the first real-HTTP confirmation that the Fase 05 `JwtAuthGuard` fix actually makes `like-status`/`subscribe-status` reflect the authenticated user's own reaction/subscription — previously untestable at the HTTP level since the bug made `req.user` always `undefined` on these `@Public()` routes. Specific test files and results are recorded in `progress.md`.
