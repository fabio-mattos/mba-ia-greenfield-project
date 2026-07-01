---
scope_type: phase
related_phases: [4]
status: decided
date: 2026-07-01
scope_description: "Backend foundation for video/channel management: category listing, video editing/draft→publish/custom thumbnail/deletion, channel management dashboard data, and channel info editing/public page."
note: "Retroactive — the code described here (categories, videos management endpoints, channels update/public-page endpoints) already existed before this document was written. This close-out task added the missing integration/e2e test coverage and this documentation; it did not change the implementation. TDs record the decisions already embedded in the code."
---

# Technical Decisions — Phase 04: Gerenciamento de Vídeos e Canal

_Subprojects in scope:_

- `nestjs-project/` — `categories` (read endpoints), `videos` (management endpoints: update/publish/thumbnail/delete/channel-panel), `channels` (update/public-page/thumbnail endpoints).
- `next-frontend/` — Deferred: `studio/videos/[id]/edit`, `studio/channel`, `channels/[nickname]` exist and are wired to the real API, but were built and are being left untested outside this tracked process (see `context.md` → "Non-UI / Deferred Capabilities").

---

## TD-01: Category Management Strategy

**Scope:** Backend

**Capability:** Categorias de vídeo disponíveis na plataforma

**Context:** The plan calls for "categorias de vídeo disponíveis na plataforma" — a fixed taxonomy videos can be tagged with. The choice is between a full admin CRUD surface (create/edit/delete categories via API) or a fixed, pre-seeded list with read-only endpoints.

**Options:**

### Option A: Full admin CRUD (`POST`/`PATCH`/`DELETE /categories`)
- **Pros:** Categories could be managed without a deploy; supports a future admin panel.
- **Cons:** Nothing in the plan describes an admin role or an admin UI for managing the taxonomy; adding mutable categories also means handling category deletion when videos reference it (already handled at the DB level via `ON DELETE SET NULL`, but a CRUD surface would need its own validation/authorization story that doesn't exist anywhere else in the project).

### Option B: Fixed taxonomy, seeded via migration, read-only API
- **Pros:** Matches the plan's phrasing ("categorias disponíveis," not "categorias gerenciáveis"); zero authorization surface to design (both endpoints are `@Public()`); the 10 seeded categories (`CreateCategories1782000000001`) cover the platform's needs for the scope of this project.
- **Cons:** Adding a new category requires a new migration + deploy, not a runtime action.

**Recommendation:** Option B — the plan does not describe category management as a user-facing capability, only as a fixed list videos select from.

**Decision:** B (`GET /categories`, `GET /categories/:slug`, both `@Public()`, no write endpoints)

**Libraries:** —

---

## TD-02: Video Edit/Publish Authorization Model

**Scope:** Backend

**Capability:** Edição das informações do vídeo, Fluxo de rascunho → publicação

**Context:** `updateVideo`, `publishVideo`, `uploadCustomThumbnail`, and `deleteVideo` all need to ensure only the owning channel can act on a video.

**Options:**

### Option A: A dedicated `VideoOwnerGuard` (NestJS guard, checked before the handler runs)
- **Pros:** Declarative — `@UseGuards(VideoOwnerGuard)` on each route; ownership check is visible at the routing layer.
- **Cons:** Per `.claude/rules/nestjs-layer-separation.md`, a guard that needs a business decision must delegate to a service anyway — so this option still needs `VideosService`/`ChannelsService` injected into the guard, adding an extra layer for the same check the service already needs to make internally (e.g. `updateVideo` needs the video row loaded regardless, to know what to update).

### Option B: Ownership check inline in the service, before mutating (current code)
- **Pros:** The service already loads the video row to perform the operation; comparing `video.channel_id !== channelId` costs nothing extra and keeps the business rule ("you must own the video") next to the business logic ("what does publishing a video mean") in one place, consistent with `nestjs-layer-separation.md`'s "Controllers Are Thin" / "Services own business logic" rule. Reused identically across `updateVideo`, `publishVideo`, `uploadCustomThumbnail`, `deleteVideo`.
- **Cons:** The check is duplicated across four methods instead of centralized in one guard (acceptable — it's a one-line comparison, not complex logic).

**Recommendation:** Option B — matches the project's established layer-separation convention; a guard would just re-delegate to the same service logic with no real benefit.

**Decision:** B (`NotVideoOwnerException` thrown from `VideosService` when `video.channel_id !== channelId`)

**Libraries:** —

---

## TD-03: Draft → Publish State Machine

**Scope:** Backend

**Capability:** Fluxo de rascunho → publicação

**Context:** A video must not be publishable before its background processing (Fase 03) has produced a playable file.

**Options:**

### Option A: Allow publishing any video regardless of `status`
- **Pros:** Simpler — one less check.
- **Cons:** A `DRAFT` or `PROCESSING` video (no `file_key`/`duration_seconds` yet) could be marked `visibility: public`, appearing in listings before it's actually playable — a broken experience for viewers.

### Option B: Require `status === READY` before allowing publish
- **Pros:** Guarantees a published video is always actually playable (Fase 03's worker only flips a video to `READY` after successful processing); `VideoNotReadyException` (422) gives the frontend a specific, actionable error to show in the studio UI.
- **Cons:** None significant — this is the correct gate given the upload/processing pipeline.

**Recommendation:** Option B — required to keep the "published" state meaningful.

**Decision:** B (`publishVideo` throws `VideoNotReadyException` unless `video.status === VideoStatus.READY`)

**Libraries:** —

---

## TD-04: Channel Nickname Update Collision Handling

**Scope:** Backend

**Capability:** Edição das informações do canal (nickname, nome e descrição)

**Context:** Nicknames are globally unique (used for the public channel URL). Editing a channel's nickname needs to reject collisions with a clear error, not a raw DB constraint violation.

**Options:**

### Option A: Let the DB unique constraint fail and catch the raw Postgres error in the controller
- **Pros:** No pre-check query needed.
- **Cons:** Violates `.claude/rules/nestjs-controllers.md` (no `try/catch` in controllers) and `nestjs-services.md` (services must throw domain exceptions, not leak driver-level errors); the frontend would need to parse a Postgres error code instead of a clean domain error code.

### Option B: Pre-check for an existing nickname, throw `NicknameAlreadyTakenException` (409) before attempting the update
- **Pros:** Same domain-exception pattern already used everywhere else in the codebase (`DomainExceptionFilter` → `{ statusCode, error, message }`); simple `findOne` check before `save()`.
- **Cons:** Small TOCTOU race window between the check and the save (a concurrent request could still hit the DB constraint) — acceptable for a nickname change, which isn't a hot concurrent path, unlike channel creation at signup (TD-10 of Phase 02), which already has a proper retry-on-collision strategy for that reason.

**Recommendation:** Option B — consistent with the domain-exception convention used across the whole API.

**Decision:** B (`ChannelsService.updateChannel` throws `NicknameAlreadyTakenException` when the requested nickname is already taken by another channel)

**Libraries:** —
