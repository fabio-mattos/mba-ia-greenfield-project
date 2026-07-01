import { NextResponse } from "next/server";

import { upstream } from "@/lib/api/upstream";
import { getSession } from "@/lib/auth/session";
import type { LikeResponse } from "@/lib/api/contracts";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  const headers = session.isLoggedIn
    ? { Authorization: `Bearer ${session.accessToken}` }
    : {};

  const { data, error, response } = await upstream.GET(
    "/comments/{commentId}/like-status",
    { params: { path: { commentId: id } }, headers },
  );

  if (error) return NextResponse.json(error, { status: response.status });
  return NextResponse.json<LikeResponse>(data as LikeResponse);
}
