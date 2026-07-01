import { describe, expect, it, vi } from "vitest";
import { server } from "@/mocks/server";
import { http, HttpResponse } from "msw";
import { env } from "@/lib/env";
import { GET } from "../route";

vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn().mockResolvedValue({ isLoggedIn: false }),
}));

describe("GET /api/videos/[slug]/download", () => {
  it("redirects to the presigned download URL returned by upstream", async () => {
    const request = new Request("http://localhost/api/videos/abc123/download");
    const response = await GET(request, {
      params: Promise.resolve({ slug: "abc123" }),
    });

    expect(response.status).toBe(302);
    const location = response.headers.get("location");
    expect(location).toContain("disposition=attachment");
  });

  it("returns 404 when upstream returns not found", async () => {
    server.use(
      http.get(`${env.API_URL}/videos/:slug/download`, () =>
        HttpResponse.json({ message: "Not found" }, { status: 404 }),
      ),
    );

    const request = new Request("http://localhost/api/videos/not-found/download");
    const response = await GET(request, {
      params: Promise.resolve({ slug: "not-found" }),
    });

    expect(response.status).toBe(404);
  });
});
