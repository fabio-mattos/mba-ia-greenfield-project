import { describe, expect, it, vi } from "vitest";
import { server } from "@/mocks/server";
import { http, HttpResponse } from "msw";
import { env } from "@/lib/env";
import { GET } from "../route";
import type { LikeResponse } from "@/lib/api/contracts";

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn().mockResolvedValue({ isLoggedIn: false }),
}));

describe("GET /api/comments/[id]/like-status", () => {
  it("returns like/dislike counts for a comment", async () => {
    const request = new Request("http://localhost/api/comments/comment-1/like-status");
    const response = await GET(request, {
      params: Promise.resolve({ id: "comment-1" }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as LikeResponse;
    expect(typeof body.likes).toBe("number");
    expect(typeof body.dislikes).toBe("number");
    expect(body.userLike).toBeNull();
  });

  it("returns 404 when comment does not exist", async () => {
    server.use(
      http.get(`${env.API_URL}/comments/:id/like-status`, () =>
        HttpResponse.json({ message: "Not found" }, { status: 404 }),
      ),
    );

    const request = new Request("http://localhost/api/comments/nope/like-status");
    const response = await GET(request, {
      params: Promise.resolve({ id: "nope" }),
    });

    expect(response.status).toBe(404);
  });
});
