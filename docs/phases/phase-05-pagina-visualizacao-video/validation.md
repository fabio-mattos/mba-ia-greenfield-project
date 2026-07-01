---
kind: phase
name: phase-05-pagina-visualizacao-video
status: clean
issue_count: 0
sources_mtime:
  docs/phases/phase-05-pagina-visualizacao-video/context.md: "2026-07-01T00:00:00-03:00"
  docs/decisions/technical-decisions-phase-05-pagina-visualizacao-video.md: "2026-07-01T00:00:00-03:00"
issues: []
advisories:
  - "This phase's context/decisions documents were written retroactively for TD-01/TD-02 (the underlying endpoints already existed); TD-03 (the JwtAuthGuard fix) and the access-control gate itself are genuinely new work done in this close-out."
  - "getSuggestionsBySlug and incrementViewCount do not call assertViewable on the source video (identified by slug) — a stranger who already knows a draft video's slug can still increment its view count or request 'suggestions similar to this draft.' The draft itself remains inaccessible via findBySlug/stream/download, so this is a minor, low-severity gap, not fixed in this close-out."
  - "Frontend (next-frontend) has zero automated tests for the watch page and its components — deferred, consistent with the Fase 03/04 close-outs."
  - "The JwtAuthGuard fix (SI-05.1 / phase-02-auth SI-02.20) also corrects previously-broken 'is the current user reacting to this' behavior on already-implemented Fase 06 endpoints (video like-status, comment like-status, channel subscribe-status). This is a beneficial side effect, not independently re-tested here — Fase 06's own close-out should re-verify those endpoints' e2e behavior now that the guard populates req.user correctly."
---

# phase-05-pagina-visualizacao-video — Validation

## Findings

### Inconsistencies

_None._

### Ambiguities

_None._

### Missing Decisions

_None._

### Dependency Gaps

- TD-03 (JwtAuthGuard fix) is documented here because it was discovered and fixed as a prerequisite for TD-01, but the guard itself is Phase 02 infrastructure — the authoritative retroactive record is `docs/phases/phase-02-auth/progress.md` SI-02.20.

### Inherited Constraint Conflicts

_None._

### Unresolved Open Questions

_None._

### UI Coverage Gaps

- `next-frontend/` Fase 05 screen (`watch/[slug]`) exists and is wired to the real API but has zero automated tests (see advisories).

## Resolved Issues

- Video visibility/status access control bug (found during the Fase 04 backend audit, registered in `docs/phases/phase-04-gerenciamento-videos-canal/validation.md` as an advisory) — fixed in SI-05.2.
- `JwtAuthGuard` never populating `request.user` on `@Public()` routes — fixed in SI-05.1.
- `incrementViewCount`/`getSuggestionsBySlug` had zero test coverage — added in SI-05.3.
