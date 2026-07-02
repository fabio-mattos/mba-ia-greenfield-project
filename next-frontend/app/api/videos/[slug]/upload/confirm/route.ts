import { NextResponse } from "next/server";
import type { ApiErrorEnvelope } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";
import { getSession } from "@/lib/auth/session";

export async function POST(
  _request: Request,
  // Route segment is named [slug] only to satisfy Next.js's constraint that
  // sibling dynamic segments under app/api/videos/ share one param name
  // (every other route here is [slug]) — the value passed through is
  // actually the video id, matching the upstream path's {id} placeholder.
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { slug: videoId } = await params;

  const { error, response } = await upstream.POST(
    "/videos/{id}/upload/confirm",
    {
      params: { path: { id: videoId } },
      headers: { Authorization: `Bearer ${session.accessToken}` },
    },
  );

  if (error) {
    return NextResponse.json<ApiErrorEnvelope>(error as ApiErrorEnvelope, {
      status: response.status,
    });
  }

  return new NextResponse(null, { status: 202 });
}
