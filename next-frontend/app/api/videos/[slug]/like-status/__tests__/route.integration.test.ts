import { describe, expect, it, vi } from "vitest";
import { server } from "@/mocks/server";
import { http, HttpResponse } from "msw";
import { env } from "@/lib/env";
import { GET } from "../route";
import type { LikeResponse } from "@/lib/api/contracts";

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn().mockResolvedValue({ isLoggedIn: false }),
}));

describe("GET /api/videos/[slug]/like-status", () => {
  it("returns like counts for a video", async () => {
    const request = new Request("http://localhost/api/videos/abc123/like-status");
    const response = await GET(request, {
      params: Promise.resolve({ slug: "abc123" }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as LikeResponse;
    expect(typeof body.likes).toBe("number");
    expect(typeof body.dislikes).toBe("number");
  });

  it("forwards 404 from upstream", async () => {
    server.use(
      http.get(`${env.API_URL}/videos/:slug/like-status`, () =>
        HttpResponse.json({ message: "Not found" }, { status: 404 }),
      ),
    );

    const request = new Request("http://localhost/api/videos/not-found-video/like-status");
    const response = await GET(request, {
      params: Promise.resolve({ slug: "not-found-video" }),
    });

    expect(response.status).toBe(404);
  });
});
