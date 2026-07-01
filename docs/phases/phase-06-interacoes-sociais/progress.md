# phase-06-interacoes-sociais — Progress

**Status:** completed
**SIs:** 5/5 completed

_SIs 06.1–06.4 record backend work that already existed before this phase-tracking document was written (see `note` in `context.md`). SI-06.5 (test coverage) is the actual work of this close-out._

### SI-06.1 — Video Likes/Dislikes
- **Status:** completed (pre-existing)
- **Tests:** `video-likes.service.spec.ts` (unit, mocked) at the time; covered by SI-06.5 (`video-likes.service.integration-spec.ts` 6/6, `test/video-likes.e2e-spec.ts` 5/5)
- **Observations:** `GET /videos/:slug/like-status` (public, optional auth), `POST /videos/:slug/like`/`dislike`, `DELETE /videos/:slug/like` — upsert via `orUpdate` (TD-01), unique constraint on `(video_id, user_id)`.

### SI-06.2 — Comments (with one level of replies)
- **Status:** completed (pre-existing)
- **Tests:** `comments.service.spec.ts` (unit) at the time; covered by SI-06.5 (`comments.service.integration-spec.ts` 9/9, `test/comments.e2e-spec.ts` 8/8)
- **Observations:** `GET /videos/:slug/comments`, `POST /videos/:slug/comments`, `GET /comments/:id/replies`, `DELETE /comments/:id` — soft delete (TD-02), one level of nesting enforced via `CommentNestingNotAllowedException` (TD-03).

### SI-06.3 — Comment Likes/Dislikes
- **Status:** completed (pre-existing)
- **Tests:** `comment-likes.service.spec.ts` (unit) at the time; covered by SI-06.5 (`comment-likes.service.integration-spec.ts` 6/6, `test/comment-likes.e2e-spec.ts` 4/4)
- **Observations:** Same upsert pattern as video-likes (TD-01), scoped to `comment_id` instead of `video_id`.

### SI-06.4 — Channel Subscriptions
- **Status:** completed (pre-existing)
- **Tests:** `subscriptions.service.spec.ts` (unit) at the time; covered by SI-06.5 (`subscriptions.service.integration-spec.ts` 7/7, `test/subscriptions.e2e-spec.ts` 7/7)
- **Observations:** `GET /channels/:nickname/subscribe` (status), `POST`/`DELETE .../subscribe`, `GET /channels/me/subscriptions` — idempotent subscribe via `orIgnore` (TD-04). `DELETE` returns `200` (not `204`) with the updated status body — confirmed and matched in tests.

### SI-06.5 — Integration/E2E Test Coverage (this close-out's actual work)
- **Status:** completed
- **Tests:** 47 new tests across 8 new files (4 integration + 4 e2e), all passing; full suite re-verified after adding these (see final numbers in this session's commit)
- **Observations:** All four modules went from unit-only (mocked repository) to full integration (real DB via `createTestDataSource`/`cleanAllTables`) + e2e (real HTTP via `Test.createTestingModule`) coverage, following the exact pattern established in Fases 03-05. The e2e suites for `video-likes`, `comment-likes`, and `subscriptions` each include a dedicated case proving the Fase 05 `JwtAuthGuard` fix works end-to-end: an authenticated user who likes/subscribes now sees their own reaction reflected in the corresponding public `-status` endpoint — previously always `null`/`false` regardless of authentication, closing the advisory left open in `docs/phases/phase-05-pagina-visualizacao-video/validation.md`.

## Known gaps registered, not fixed in this close-out

- Subscriber count not surfaced on `GET /channels/:nickname` (registered in Fase 04's `validation.md`; still not fixed — remains a Fase 04↔06 integration gap).
- Frontend test coverage for all Fase 06 UI components — none exists; deferred, consistent with Fases 03-05.
