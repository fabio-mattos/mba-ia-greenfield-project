/**
 * BFF ↔ Components contracts barrel.
 *
 * This file is the **only** module in the project authorized to import `paths`
 * from `./types.gen`. Every Route Handler and every Component consumes BFF
 * shapes via named aliases exported from here — never by indexing `paths`
 * directly elsewhere.
 *
 * Two alias forms by convention:
 *
 * 1. **Pass-through alias** — BFF returns the upstream NestJS shape as-is.
 *    The alias indexes `paths` for the route's success-content type:
 *
 *      export type Video =
 *        paths["/videos/{id}"]["get"]["responses"][200]["content"]["application/json"];
 *
 * 2. **Reshape alias** — BFF projects a subset or composed shape. The alias
 *    name is named-only (does NOT index `paths`), making reshapes greppable
 *    against the wire shape:
 *
 *      export type VideoCard = Pick<Video, "id" | "title" | "thumbnailUrl">;
 *
 * Feature SIs append aliases here as endpoints are wired through the BFF.
 * The barrel starts empty by design.
 */
import type { paths } from "./types.gen";

// ─── Auth ─────────────────────────────────────────────────────────────────────

// Request bodies (fields are empty in the current openapi.json — will expand as the upstream spec grows)
export type RegisterDto =
  paths["/auth/register"]["post"]["requestBody"]["content"]["application/json"];

export type LoginDto =
  paths["/auth/login"]["post"]["requestBody"]["content"]["application/json"];

export type ForgotPasswordDto =
  paths["/auth/forgot-password"]["post"]["requestBody"]["content"]["application/json"];

export type RefreshTokenDto =
  paths["/auth/refresh"]["post"]["requestBody"]["content"]["application/json"];

// Upstream success response bodies
export type RegisterResponse =
  paths["/auth/register"]["post"]["responses"][201]["content"]["application/json"];

// LoginTokenPair: upstream 200 body — BFF reads it to seal into the iron-session cookie;
// tokens never cross to the browser (per phase-02-auth-frontend/TD-02).
export type LoginTokenPair =
  paths["/auth/login"]["post"]["responses"][200]["content"]["application/json"];

export type RefreshTokenPair =
  paths["/auth/refresh"]["post"]["responses"][200]["content"]["application/json"];

// Shared error envelope (all auth 4xx responses)
export type ApiErrorEnvelope =
  paths["/auth/register"]["post"]["responses"][400]["content"]["application/json"];

// ─── Videos (Fases 03-07) — shapes defined directly until openapi.json is regenerated ──

export type VideoStatus = "draft" | "processing" | "ready" | "failed";
export type VideoVisibility = "public" | "unlisted";
export type LikeType = "like" | "dislike";

export interface ChannelSummary {
  id: string;
  nickname: string;
  name: string;
  thumbnail_url: string | null;
}

export interface CategorySummary {
  id: string;
  name: string;
  slug: string;
}

export interface VideoResponse {
  id: string;
  slug: string;
  title: string | null;
  description: string | null;
  status: VideoStatus;
  visibility: VideoVisibility | null;
  duration_seconds: number | null;
  view_count: number;
  thumbnail_url: string | null;
  channel: ChannelSummary;
  category: CategorySummary | null;
  published_at: string | null;
  created_at: string;
}

export interface VideoCard {
  id: string;
  slug: string;
  title: string;
  status: VideoStatus;
  visibility: VideoVisibility | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  view_count: number;
  published_at: string | null;
  channel: ChannelSummary;
  category: CategorySummary | null;
}

export interface PaginatedVideos {
  data: VideoCard[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

// Channel management panel listing (Fase 04) — full VideoResponse per item, no pagination metadata.
export interface ChannelVideos {
  data: VideoResponse[];
  total: number;
}

export interface InitiateUploadResponse {
  videoId: string;
  slug: string;
  uploadUrl: string;
}

export interface Channel {
  id: string;
  name: string;
  nickname: string;
  description: string | null;
  thumbnail_key: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface LikeResponse {
  likes: number;
  dislikes: number;
  userLike: LikeType | null;
}

export interface CommentAuthor {
  id: string;
  email: string;
}

export interface Comment {
  id: string;
  body: string;
  author: CommentAuthor;
  parent_id: string | null;
  deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface PaginatedComments {
  data: Comment[];
  total: number;
}

export interface SubscriptionStatus {
  isSubscribed: boolean;
  subscriberCount: number;
}

export interface PaginatedChannels {
  data: Channel[];
  total: number;
}

export type CommentLikeStatus = LikeResponse;
