# phase-05-pagina-visualizacao-video — Progress

**Status:** completed
**SIs:** 3/3 completed

### SI-05.1 — JwtAuthGuard Optional Authentication Fix (prerequisite)
- **Status:** completed
- **Tests:** `jwt-auth.guard.spec.ts` — 7/7 (3 new cases: public+valid token populates `request.user`, public+invalid token proceeds anonymously, public+expired token proceeds anonymously; 4 pre-existing cases unchanged)
- **Observations:** Root cause of both the Fase 05 access-control gap and a latent Fase 06 bug (see `docs/phases/phase-02-auth/progress.md` SI-02.20 for the full account — the guard is Phase 02 infrastructure). Protected-route behavior is byte-for-byte unchanged; verified by re-running the entire suite (see SI-05.3).

### SI-05.2 — Video Visibility/Status Access Control Fix
- **Status:** completed
- **Tests:** `videos.service.spec.ts` (+9 cases across `findBySlug`/`getStreamUrl`/`getDownloadUrl`), `videos.service.integration-spec.ts` (+8 cases, real DB), `test/videos.e2e-spec.ts` (+9 cases, real HTTP) — owner/anonymous/stranger × draft/ready-public/ready-unlisted matrix, all passing
- **Observations:** `findBySlug`, `getStreamUrl`, `getDownloadUrl` now accept `requestingUserId: string | null` and call a shared `assertViewable(video, requestingUserId)`: owner bypasses any status/visibility; anyone else requires `status=READY && visibility!=null` (published, public or unlisted); otherwise `VideoNotFoundException` (404, not 403 — see TD-02). Controller passes `req.user?.sub ?? null`, same pattern already used by `video-likes.controller.ts`'s `getLikeStatus`. No frontend contract change — `watch/[slug]` and the studio edit page already send the `Authorization` header conditionally on these exact calls.

### SI-05.3 — New Coverage: View Count and Suggestions
- **Status:** completed
- **Tests:** `videos.service.integration-spec.ts` (+2: atomic increment, category-filtered suggestions excluding self/non-published), `test/videos.e2e-spec.ts` (+2: `POST /videos/:slug/view` 204 + counter increments, `GET /videos/:slug/suggestions` 200 with array)
- **Observations:** `incrementViewCount`/`getSuggestionsBySlug` had zero test coverage before this close-out (`getSuggestionsBySlug` already internally filters candidates to `READY`+`PUBLIC`, independent of TD-01's gate on the source video — see `validation.md` advisories). Full suite re-verified after all Fase 05 changes: 215/215 unit+integration, 89/89 e2e, `tsc --noEmit` clean, lint 0 errors.

## Known gaps registered, not fixed in this close-out (see `validation.md`)

- `getSuggestionsBySlug`/`incrementViewCount` don't call `assertViewable` on the *source* video — a stranger who knows a draft's slug can still increment its view count or fetch "suggestions like this draft" (low severity; the draft itself remains inaccessible via `findBySlug`/stream/download).
- Frontend test coverage for the watch page (`video-player.tsx`, `description-expander.tsx`, `suggestion-card.tsx`) — none exists; deferred, consistent with Fases 03/04.
