---
scope_type: phase
related_phases: [6]
status: decided
date: 2026-07-01
scope_description: "Social interactions backend: video like/dislike, threaded comments (one level), comment like/dislike, and channel subscriptions."
note: "Retroactive — the code described here already existed before this document was written (controllers/services/entities/DTOs for all four modules). This close-out task added the missing integration/e2e test coverage and this documentation; it did not change the implementation."
---

# Technical Decisions — Phase 06: Interações Sociais

_Subprojects in scope:_

- `nestjs-project/` — `video-likes`, `comments`, `comment-likes`, `subscriptions`.
- `next-frontend/` — Deferred: `like-dislike-bar.tsx`, `comment-section.tsx`/`comment-item.tsx`/`comment-form.tsx`, `comment-like-bar.tsx`, `subscribe-button.tsx`, `subscriptions/page.tsx` already exist and call the real API, but have zero automated tests.

---

## TD-01: Like/Dislike Persistence Strategy

**Scope:** Backend (`video-likes`, `comment-likes`)

**Capability:** Like e dislike em vídeos, Like e dislike em comentários

**Context:** A user can react to a video/comment with either `like` or `dislike`, and can change their mind (switch reaction) or remove it. The `video_likes`/`comment_likes` tables have a `UNIQUE(video_id/comment_id, user_id)` constraint, so at most one reaction row exists per user per target.

**Options:**

### Option A: Read-check-then-write (find existing reaction, `UPDATE` if present, `INSERT` if not)
- **Pros:** Explicit, easy to follow step by step.
- **Cons:** Two round trips instead of one; a race between concurrent requests from the same user (double-click) could attempt two `INSERT`s and collide on the unique constraint, requiring extra retry logic — solving a problem the database can solve for free.

### Option B: Single upsert statement (`INSERT ... ON CONFLICT (video_id, user_id) DO UPDATE SET type`, via TypeORM's `orUpdate`)
- **Pros:** One round trip, atomic, and the DB-level unique constraint makes concurrent double-clicks resolve correctly without extra application code; same pattern usable for both `video_likes` and `comment_likes` since both have the same shape.
- **Cons:** None significant — this is the standard way to implement "at most one reaction per user" with Postgres.

**Recommendation:** Option B — atomic, race-free, and reuses the same shape across both like modules.

**Decision:** B (`repository.createQueryBuilder().insert().into(...).values(...).orUpdate(['type'], ['video_id'|'comment_id', 'user_id']).execute()`)

**Libraries:** —

---

## TD-02: Comment Deletion Strategy

**Scope:** Backend (`comments`)

**Capability:** Comentários em vídeos (usuários autenticados), Respostas a comentários

**Context:** A comment can have replies (one level, see TD-03). Deleting a comment that has replies needs a defined behavior — replies referencing it should not silently disappear or orphan.

**Options:**

### Option A: Hard delete (`DELETE FROM comments WHERE id = ...`)
- **Pros:** Simplest; no extra `deleted` column.
- **Cons:** The `parent_id` FK on `comments` is `ON DELETE CASCADE` — hard-deleting a parent comment would cascade-delete all its replies too, destroying a conversation thread just because the top-level comment was removed. This is a worse UX than most comment systems (Reddit/YouTube-style "[deleted]" placeholders).

### Option B: Soft delete (`deleted: true`, `body` replaced with a placeholder, row kept)
- **Pros:** Replies survive even if the parent is deleted (matches how most comment threads behave); `listComments`/`listReplies` already filter `deleted: false` for the *listing* endpoints, but the row still exists so replies referencing it via `parent_id` are never orphaned; simple to implement (one `UPDATE`).
- **Cons:** Deleted comments remain in the table indefinitely (no cleanup job) — acceptable for this project's scope.

**Recommendation:** Option B — necessary given replies exist and must survive parent deletion.

**Decision:** B (`deleteComment` sets `deleted: true` and `body: '[comentário removido]'`)

**Libraries:** —

---

## TD-03: Comment Nesting Depth Limit

**Scope:** Backend (`comments`)

**Capability:** Respostas a comentários (comentários aninhados)

**Context:** `docs/project-plan.md`'s "Pontos de Atenção" section explicitly flags this as an open question: "Comentários aninhados: definir até quantos níveis de resposta serão permitidos para manter a interface organizada."

**Options:**

### Option A: Unlimited nesting depth (reply-to-reply-to-reply...)
- **Pros:** Maximum flexibility for conversations.
- **Cons:** Requires recursive queries or materialized-path/closure-table modeling to list an arbitrarily deep thread; the plan's own concern about UI organization applies more, not less, as depth grows unbounded.

### Option B: One level of nesting (top-level comments + replies; replying to a reply is rejected)
- **Pros:** Simple data model (`parent_id` pointing directly at a top-level comment, checked via `parent.parent_id !== null` — no recursion needed anywhere); matches how many mainstream video platforms actually present comments (flat "reply" threads, not deep nesting); directly resolves the plan's stated open question with the simplest option that satisfies "comentários com respostas."
- **Cons:** A user cannot reply to a specific reply — replies to a thread are flattened under the original top-level comment. Considered an acceptable trade-off given the plan's own concern about UI complexity from deep nesting.

**Recommendation:** Option B — the plan itself frames deep nesting as a UI-organization risk to avoid, and one level is the simplest structure that still delivers "comments with replies."

**Decision:** B (`CommentNestingNotAllowedException` thrown when `parent.parent_id !== null`)

**Libraries:** —

---

## TD-04: Subscription Idempotency

**Scope:** Backend (`subscriptions`)

**Capability:** Inscrição em canais (seguir/deixar de seguir)

**Context:** A user clicking "subscribe" on a channel they already follow (e.g., a double-submit from a slow network) must not error or create duplicate rows — `subscriptions` has `UNIQUE(subscriber_id, channel_id)`.

**Options:**

### Option A: Pre-check for an existing subscription, skip the insert if found
- **Pros:** Explicit.
- **Cons:** Extra round trip; same TOCTOU race as TD-01's Option A.

### Option B: `INSERT ... ON CONFLICT DO NOTHING` (TypeORM's `orIgnore`)
- **Pros:** One statement, naturally idempotent — subscribing twice is a no-op instead of an error, exactly the UX a "subscribe" button needs (no visible failure on a duplicate click); reuses the same DB-level uniqueness guarantee as TD-01, just without needing to update anything on conflict (unlike likes, a subscription has no mutable field to change).
- **Cons:** None significant.

**Recommendation:** Option B — matches the "subscribe" button's expected behavior (idempotent action, not a create-or-fail operation) with minimal code.

**Decision:** B (`subscriptionRepository.createQueryBuilder().insert()....orIgnore().execute()`)

**Libraries:** —
