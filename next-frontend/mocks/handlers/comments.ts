import { http, HttpResponse } from "msw";

import type { LikeResponse, Comment } from "@/lib/api/contracts";
import { env } from "@/lib/env";

export const buildCommentLikeResponse = (
  overrides: Partial<LikeResponse> = {},
): LikeResponse => ({
  likes: 3,
  dislikes: 0,
  userLike: null,
  ...overrides,
});

export const handlers = [
  // GET /comments/:id/replies
  http.get(`${env.API_URL}/comments/:id/replies`, () =>
    HttpResponse.json<{ data: Comment[] }>({ data: [] }),
  ),

  // DELETE /comments/:id
  http.delete(`${env.API_URL}/comments/:id`, () => new HttpResponse(null, { status: 204 })),

  // GET /comments/:id/like-status
  http.get(`${env.API_URL}/comments/:id/like-status`, () =>
    HttpResponse.json<LikeResponse>(buildCommentLikeResponse()),
  ),

  // POST /comments/:id/like
  http.post(`${env.API_URL}/comments/:id/like`, () =>
    HttpResponse.json<LikeResponse>(
      buildCommentLikeResponse({ likes: 4, userLike: "like" }),
      { status: 201 },
    ),
  ),

  // POST /comments/:id/dislike
  http.post(`${env.API_URL}/comments/:id/dislike`, () =>
    HttpResponse.json<LikeResponse>(
      buildCommentLikeResponse({ dislikes: 1, userLike: "dislike" }),
      { status: 201 },
    ),
  ),

  // DELETE /comments/:id/like (remove reaction)
  http.delete(`${env.API_URL}/comments/:id/like`, () => new HttpResponse(null, { status: 204 })),
];
