---
scope_type: phase
related_phases: [5]
status: decided
date: 2026-07-01
scope_description: "Video viewing page backend: anonymous/owner-aware access control on the video detail/stream/download endpoints, view counting, and category-based suggestions."
note: "Retroactive — findBySlug/getStreamUrl/getDownloadUrl/incrementViewCount/getSuggestionsBySlug already existed before this document was written. The access-control gate (TD-01, TD-02) is the actual fix made in this close-out; the rest of this phase's endpoints were already correct and are documented here for completeness."
---

# Technical Decisions — Phase 05: Página de Visualização do Vídeo

_Subprojects in scope:_

- `nestjs-project/` — `videos.controller.ts`/`videos.service.ts` (`findBySlug`, `getStreamUrl`, `getDownloadUrl`, `incrementViewCount`, `getSuggestionsBySlug`), `auth/guards/jwt-auth.guard.ts` (prerequisite fix, see TD-03).
- `next-frontend/` — Deferred: `watch/[slug]` already calls these endpoints and conditionally sends an `Authorization` header, but has zero automated tests.

---

## TD-01: Access Control on Video Detail/Stream/Download Endpoints

**Scope:** Backend

**Capability:** Acesso anônimo à visualização de vídeos, Vídeos unlisted acessíveis apenas via link direto

**Context:** `GET /videos/:slug`, `GET /videos/:slug/stream`, and `GET /videos/:slug/download` are `@Public()` (anonymous viewing is a plan requirement) and, before this fix, returned the video regardless of `status`/`visibility` — meaning any `DRAFT`/`PROCESSING` video, from any channel, was fully viewable/streamable/downloadable by anyone who obtained the slug (e.g., by observing network requests from the studio's own edit page, which uses this same endpoint).

**Options:**

### Option A: Separate endpoints for public viewing vs. owner preview
- A new `GET /videos/:id/preview` (authenticated, owner-only) alongside the existing public `GET /videos/:slug` (now strictly `status=READY && visibility!=null`).
- **Pros:** Clean separation of concerns — the public endpoint's contract becomes unconditionally simple ("always a published video").
- **Cons:** Breaking change — the studio's video edit page (`app/(studio)/studio/videos/[id]/edit/page.tsx`) already calls `GET /videos/{slug}` (passing the video's `slug` as the `id` route param) to load a video for editing, including drafts; it would need a second endpoint and a second OpenAPI-generated client call. No functional benefit over Option B for the actual access-control guarantee.

### Option B: Same endpoint, owner-aware gate (current code, requires the guard fix in TD-03)
- `findBySlug`/`getStreamUrl`/`getDownloadUrl` accept an optional `requestingUserId`. If the requester owns the video's channel, any status/visibility is allowed (supports the studio edit/preview use case for free); otherwise, only `status=READY && visibility!=null` (published) is allowed. Not found → `VideoNotFoundException` (404), not a 403 — a stranger should not learn that a slug corresponds to a real (but unpublished) video.
- **Pros:** No new endpoint, no frontend contract change (the frontend already sends the `Authorization` header conditionally on exactly these calls); reuses the exact `NotVideoOwnerException`-style ownership pattern already established in Phase 04 (`updateVideo`, `publishVideo`, etc.) for consistency, though here the outcome is 404 rather than 403 since existence itself must not leak to non-owners.
- **Cons:** Requires the requester's identity to be available on a `@Public()` route, which depended on fixing `JwtAuthGuard` (TD-03) — previously `req.user` was never populated on public routes at all, even with a valid token.

**Recommendation:** Option B — zero frontend/contract impact and reuses the existing single-endpoint shape the studio UI already depends on.

**Decision:** B (`assertViewable(video, requestingUserId)` in `VideosService`, owner bypass + `status=READY && visibility!=null` gate, `VideoNotFoundException` on failure)

**Libraries:** —

---

## TD-02: 404 vs. 403 for Inaccessible Videos

**Scope:** Backend

**Capability:** Vídeos unlisted acessíveis apenas via link direto (implicitly: draft videos must not be discoverable)

**Context:** When a non-owner requests a video they cannot see, the response could either confirm the video's existence (403 Forbidden) or deny it outright (404 Not Found).

**Options:**

### Option A: 403 Forbidden
- **Pros:** Technically more precise ("you can't do this," as used for `NotVideoOwnerException` on the Phase 04 management endpoints, which require auth to reach at all).
- **Cons:** Confirms to an anonymous or non-owner caller that a video with that slug exists and is simply hidden — an information leak for content that is supposed to not be discoverable pre-publication.

### Option B: 404 Not Found
- **Pros:** Matches the semantics of "this resource does not exist for you," which is the correct posture for a `@Public()`, no-auth-required endpoint where the caller could be anyone; consistent with how unknown slugs already behave (`VideoNotFoundException`) — a stranger cannot distinguish "wrong slug" from "real but unpublished video."
- **Cons:** None significant.

**Recommendation:** Option B — Phase 04's management endpoints can safely use 403 because reaching them requires authentication in the first place (the caller already proved some identity); Phase 05's viewing endpoints are anonymous-reachable, so hiding existence is the safer default.

**Decision:** B (`VideoNotFoundException`, reusing the same exception as the "slug doesn't exist" case — same status code and error code either way)

**Libraries:** —

---

## TD-03 (prerequisite, Phase 02 infrastructure): `JwtAuthGuard` Optional Authentication on `@Public()` Routes

**Scope:** Backend (cross-cutting — global guard)

**Capability:** Prerequisite for TD-01; also fixes latent behavior in already-implemented Phase 06 endpoints (`GET /videos/:slug/like-status`, `GET /comments/:id/like-status`, `GET /channels/:nickname/subscribe`) that read `req.user?.sub` to show "does the current user already like/subscribe to this."

**Context:** `JwtAuthGuard.canActivate` returned `true` immediately when a route is `@Public()`, without ever attempting to read/verify the `Authorization` header — so `request.user` was never populated on public routes, even when the caller sent a valid Bearer token. This silently broke every "optional auth" endpoint in the codebase, and blocked TD-01's owner-aware gate (which needs to know who's asking even on a public route).

**Options:**

### Option A: A separate, explicit "optional auth" guard/decorator applied only where needed
- **Pros:** Keeps `JwtAuthGuard`'s current behavior for `@Public()` untouched; opt-in per route.
- **Cons:** Two guards to reason about instead of one; every current and future "optional auth" route would need to remember to add the second decorator, and the existing (already broken) Phase 06 endpoints would each need updating individually instead of being fixed by one change.

### Option B: Make `JwtAuthGuard` itself attempt verification on `@Public()` routes, failing open
- If a token is present and valid, populate `request.user` regardless of `isPublic`. If no token, or the token is invalid/expired: on `@Public()` routes, proceed anonymously (as today); on protected routes, `401` (unchanged).
- **Pros:** One guard, one mental model; fixes every existing and future optional-auth endpoint uniformly; zero behavior change for protected routes (the `isPublic` branch is strictly additive — it only changes what happens when `isPublic` is true).
- **Cons:** Slightly more branching in a security-sensitive, high-blast-radius file (every endpoint in the app goes through this guard) — mitigated by keeping protected-route behavior byte-for-byte identical and adding thorough test coverage (guard unit tests + the full existing e2e suite re-verified green).

**Recommendation:** Option B — fixes the root cause once instead of patching each affected endpoint, and the protected-route path is untouched.

**Decision:** B (`jwt-auth.guard.ts`: on missing/invalid token, `@Public()` routes return `true` without setting `request.user`; on a valid token, `request.user` is set regardless of `isPublic`)

**Libraries:** —
