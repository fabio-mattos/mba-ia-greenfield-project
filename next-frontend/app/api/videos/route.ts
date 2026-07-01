import { NextResponse } from "next/server";
import type { PaginatedVideos } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const query: { search?: string; category?: string; page?: number; limit?: number } = {};
  if (searchParams.get("search")) query.search = searchParams.get("search")!;
  if (searchParams.get("category")) query.category = searchParams.get("category")!;
  if (searchParams.get("page")) query.page = Number(searchParams.get("page"));
  if (searchParams.get("limit")) query.limit = Number(searchParams.get("limit"));

  const { data, error, response } = await upstream.GET("/videos", {
    params: { query },
  });

  if (error) {
    return NextResponse.json(error, { status: (response as Response).status });
  }

  return NextResponse.json<PaginatedVideos>(data as PaginatedVideos);
}
