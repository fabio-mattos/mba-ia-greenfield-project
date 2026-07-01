import { NextResponse } from "next/server";
import type { VideoCard } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const { data, error, response } = await upstream.GET(
    "/videos/{slug}/suggestions",
    { params: { path: { slug } } },
  );

  if (error) {
    return NextResponse.json(error, { status: response.status });
  }

  return NextResponse.json<VideoCard[]>(data as VideoCard[]);
}
