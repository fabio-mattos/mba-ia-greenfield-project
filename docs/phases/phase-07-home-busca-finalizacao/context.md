---
kind: phase
name: phase-07-home-busca-finalizacao
sources_mtime:
  docs/project-plan.md: "2026-04-08T14:58:57-03:00"
  docs/decisions/technical-decisions-phase-07-home-busca-finalizacao.md: "2026-07-01T00:00:00-03:00"
  docs/phases/phase-06-interacoes-sociais/context.md: "2026-07-01T00:00:00-03:00"
note: "Partially retroactive — GET /videos (search/pagination) already existed; the production deploy artifacts and the two bugs found while validating them are new work from this close-out. See the note in the decisions document."
---

# phase-07-home-busca-finalizacao — Context

## Scope

**Phase name:** Fase 07 — Página Inicial, Busca e Finalização

**Capabilities**

- Página inicial com grid de vídeos (thumbnail, título, canal, visualizações e tempo de publicação)
- Filtro de vídeos por categoria na home
- Barra de busca (pesquisa por título e canal)
- Header/navbar com logo, barra de busca, botão de login/avatar e navegação
- Paginação ou scroll infinito nas listagens de vídeos
- Layout responsivo para dispositivos móveis
- Testes dos fluxos principais da plataforma
- Ambiente de produção e deploy

**Out of scope:** Cloud hosting, CI/CD pipeline (deliberately not built — see TD-01), automated frontend test suite for the home/search UI (deferred, consistent with Fases 03-06).

**Deliverables:** home page, busca, navegação, responsividade (already implemented pre-phase); `GET /videos` test coverage (new); production Docker images + `docker-compose.prod.yml` for the whole platform (new); two real bugs found and fixed while building/validating the production stack (new).

**Affected subprojects:** `nestjs-project/` (tests + `data-source.ts` fix + `Dockerfile`), `next-frontend/` (routing fix + `Dockerfile` + standalone output + health route), repo root (`docker-compose.prod.yml`, `.env.production.example`).

**Deferred subprojects:** Automated frontend tests for `app/page.tsx`, `components/layout/{header,search-bar,category-filter-bar}.tsx` — none exist; deferred as in every prior phase this session.

**Sequencing notes:** Depends on all previous phases (per the plan's own "Depende de: todas as fases anteriores").

**Neighbors (for boundary detection only):** Fase 06 (prior); no next phase — this is the last phase in the plan.

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision |
|-----|--------|-------|-------|--------|----------|
| phase-07-home-busca-finalizacao/TD-01 | technical-decisions-phase-07-home-busca-finalizacao.md | Infra | Production Deployment Target | decided | B (self-contained local Docker Compose) |
| phase-07-home-busca-finalizacao/TD-02 | technical-decisions-phase-07-home-busca-finalizacao.md | Infra | Transactional Email in Production Compose | decided | B (mailpit, documented placeholder) |
| phase-07-home-busca-finalizacao/TD-03 | technical-decisions-phase-07-home-busca-finalizacao.md | next-frontend | Production Build Strategy | decided | `output: 'standalone'` + 3-stage Dockerfile |
| phase-07-home-busca-finalizacao/TD-04 | technical-decisions-phase-07-home-busca-finalizacao.md | Backend | GET /videos Test Coverage | decided | Extend existing integration/e2e files |
| phase-07-home-busca-finalizacao/TD-05 | technical-decisions-phase-07-home-busca-finalizacao.md | Backend | data-source.ts Migration Path (bug fix) | decided | `__dirname`-relative glob |
| phase-07-home-busca-finalizacao/TD-06 | technical-decisions-phase-07-home-busca-finalizacao.md | next-frontend | Conflicting Dynamic Route Segments (bug fix) | decided | Rename `[id]` → `[slug]` |
| phase-07-home-busca-finalizacao/TD-07 | technical-decisions-phase-07-home-busca-finalizacao.md | Infra | No Host Ports for db/redis/minio in Prod | decided | No `ports:` mapping |

_Source files:_

- `docs/decisions/technical-decisions-phase-07-home-busca-finalizacao.md`

## Capability Coverage

| Capability | Covered by |
|------------|------------|
| Home page grid, category filter, search bar | phase-07-home-busca-finalizacao/TD-04 (test coverage only; feature pre-existing) |
| Header/navbar | _Pre-existing (`components/layout/header.tsx` + `search-bar.tsx` + `user-avatar-menu.tsx`); no TD — no alternatives considered, not touched this phase._ |
| Paginação | phase-07-home-busca-finalizacao/TD-04 |
| Layout responsivo | _Pre-existing (Tailwind responsive classes); not verified visually this phase — see Validation → advisories._ |
| Testes dos fluxos principais | _Backend: covered across all phases' integration/e2e suites this session. Frontend: still not covered — see Validation → advisories._ |
| Ambiente de produção e deploy | phase-07-home-busca-finalizacao/TD-01, TD-02, TD-03, TD-05, TD-06, TD-07 |

## Decisions Detail

See `docs/decisions/technical-decisions-phase-07-home-busca-finalizacao.md` for full Options/Recommendation/Decision text for TD-01 through TD-07.

## Inherited Conventions

- Integration/e2e test patterns from Fases 03-06 (`createTestDataSource`/`cleanAllTables`, `registerConfirmAndLogin()` per e2e file).
- `video-worker/Dockerfile` (Fase 03) is the reference pattern the two new production Dockerfiles follow (multi-stage, non-root user, minimal runtime deps).

## Non-UI / Deferred Capabilities

| Capability | Status | Rationale | TD refs |
|------------|--------|-----------|---------|
| Frontend automated tests (home/search/navbar) | deferred (untested) | Consistent with Fases 03-06; out of scope for this backend/infra-focused close-out. | — |
| Cloud hosting / CI/CD | deliberately out of scope | User-selected scope: local Docker Compose only, no provider, no pipeline. | phase-07-home-busca-finalizacao/TD-01 |
| Visual responsive-layout verification | not done | No browser-based visual check was performed this phase; Tailwind responsive classes exist in the markup but weren't validated against real viewports. | — |

## Testing Requirements

Refer to `testing-guide-nestjs-project`. This close-out added integration + e2e coverage for `GET /videos` (home/search). The production stack itself was verified via a manual smoke test (not an automated test): build both new Dockerfiles, run migrations against a fresh database inside the compiled image, and confirm `nestjs-api` (`GET /` → 200) and `next-frontend` (`GET /api/health` → 200, `GET /` → 200 rendering the real home page) both serve correctly end-to-end on an isolated Docker Compose project. Full results in `progress.md`.
