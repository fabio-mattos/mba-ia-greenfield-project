import { http, HttpResponse } from "msw";

import type {
  VideoCard,
  VideoResponse,
  LikeResponse,
  PaginatedVideos,
  PaginatedComments,
  Comment,
  SubscriptionStatus,
  InitiateUploadResponse,
} from "@/lib/api/contracts";
import { env } from "@/lib/env";

const MISSING_SLUG = "not-found-video";

const baseChannel = {
  id: "channel-1",
  nickname: "testchannel",
  name: "Test Channel",
  thumbnail_url: null,
};

const baseCategory = {
  id: "cat-1",
  name: "Tecnologia",
  slug: "tecnologia",
};

export const buildVideoCard = (overrides: Partial<VideoCard> = {}): VideoCard => ({
  id: "video-1",
  slug: "abc123def45",
  title: "Test Video",
  status: "ready",
  visibility: "public",
  thumbnail_url: null,
  duration_seconds: 120,
  view_count: 42,
  published_at: "2025-01-01T00:00:00.000Z",
  channel: baseChannel,
  category: baseCategory,
  ...overrides,
});

export const buildVideoResponse = (overrides: Partial<VideoResponse> = {}): VideoResponse => ({
  id: "video-1",
  slug: "abc123def45",
  title: "Test Video",
  description: "A test video description.",
  status: "ready",
  visibility: "public",
  duration_seconds: 120,
  view_count: 42,
  thumbnail_url: null,
  channel: baseChannel,
  category: baseCategory,
  published_at: "2025-01-01T00:00:00.000Z",
  created_at: "2025-01-01T00:00:00.000Z",
  ...overrides,
});

export const buildLikeResponse = (overrides: Partial<LikeResponse> = {}): LikeResponse => ({
  likes: 5,
  dislikes: 1,
  userLike: null,
  ...overrides,
});

export const buildComment = (overrides: Partial<Comment> = {}): Comment => ({
  id: "comment-1",
  body: "Great video!",
  author: { id: "user-1", email: "alice@example.com" },
  parent_id: null,
  deleted: false,
  created_at: "2025-01-01T00:00:00.000Z",
  updated_at: "2025-01-01T00:00:00.000Z",
  ...overrides,
});

export const handlers = [
  // GET /videos
  http.get(`${env.API_URL}/videos`, () =>
    HttpResponse.json<PaginatedVideos>({
      data: [buildVideoCard()],
      total: 1,
      page: 1,
      limit: 12,
      total_pages: 1,
    }),
  ),

  // GET /videos/:slug
  http.get(`${env.API_URL}/videos/:slug`, ({ params }) => {
    if (params.slug === MISSING_SLUG) {
      return HttpResponse.json({ message: "Not found" }, { status: 404 });
    }
    return HttpResponse.json<VideoResponse>(buildVideoResponse({ slug: params.slug as string }));
  }),

  // GET /videos/:slug/stream
  http.get(`${env.API_URL}/videos/:slug/stream`, ({ params }) => {
    if (params.slug === MISSING_SLUG) {
      return HttpResponse.json({ message: "Not found" }, { status: 404 });
    }
    return HttpResponse.json<{ url: string }>({
      url: "https://minio.local/videos/test.mp4?presigned=true",
    });
  }),

  // GET /videos/:slug/download
  http.get(`${env.API_URL}/videos/:slug/download`, ({ params }) => {
    if (params.slug === MISSING_SLUG) {
      return HttpResponse.json({ message: "Not found" }, { status: 404 });
    }
    return HttpResponse.json<{ url: string }>({
      url: "https://minio.local/videos/test.mp4?disposition=attachment&presigned=true",
    });
  }),

  // GET /videos/:slug/like-status
  http.get(`${env.API_URL}/videos/:slug/like-status`, () =>
    HttpResponse.json<LikeResponse>(buildLikeResponse()),
  ),

  // POST /videos/:slug/view
  http.post(`${env.API_URL}/videos/:slug/view`, () => new HttpResponse(null, { status: 204 })),

  // GET /videos/:slug/suggestions
  http.get(`${env.API_URL}/videos/:slug/suggestions`, () =>
    HttpResponse.json<VideoCard[]>([buildVideoCard({ id: "video-2", slug: "sug000abc11" })]),
  ),

  // GET /videos/:slug/comments
  http.get(`${env.API_URL}/videos/:slug/comments`, () =>
    HttpResponse.json<PaginatedComments>({
      data: [buildComment()],
      total: 1,
    }),
  ),

  // POST /videos/:slug/comments
  http.post(`${env.API_URL}/videos/:slug/comments`, () =>
    HttpResponse.json<Comment>(buildComment({ id: "comment-new" }), { status: 201 }),
  ),

  // POST /videos/upload/initiate
  http.post(`${env.API_URL}/videos/upload/initiate`, () =>
    HttpResponse.json<InitiateUploadResponse>(
      { videoId: "video-draft-1", slug: "draftabc123", uploadUrl: "https://minio.local/upload" },
      { status: 201 },
    ),
  ),

  // GET /videos/channel/me
  http.get(`${env.API_URL}/videos/channel/me`, () =>
    HttpResponse.json<{ data: VideoResponse[]; total: number }>({
      data: [buildVideoResponse()],
      total: 1,
    }),
  ),

  // GET /categories
  http.get(`${env.API_URL}/categories`, () =>
    HttpResponse.json([baseCategory]),
  ),

  // GET /channels/:nickname
  http.get(`${env.API_URL}/channels/:nickname`, ({ params }) =>
    HttpResponse.json({
      id: "channel-1",
      name: "Test Channel",
      nickname: params.nickname,
      description: null,
      thumbnail_key: null,
      user_id: "user-1",
      created_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-01-01T00:00:00.000Z",
    }),
  ),

  // GET /channels/:nickname/subscribe
  http.get(`${env.API_URL}/channels/:nickname/subscribe`, () =>
    HttpResponse.json<SubscriptionStatus>({ isSubscribed: false, subscriberCount: 10 }),
  ),

  // POST /channels/:nickname/subscribe
  http.post(`${env.API_URL}/channels/:nickname/subscribe`, () =>
    HttpResponse.json<SubscriptionStatus>({ isSubscribed: true, subscriberCount: 11 }, { status: 201 }),
  ),

  // DELETE /channels/:nickname/subscribe
  http.delete(`${env.API_URL}/channels/:nickname/subscribe`, () =>
    HttpResponse.json<SubscriptionStatus>({ isSubscribed: false, subscriberCount: 10 }),
  ),
];
