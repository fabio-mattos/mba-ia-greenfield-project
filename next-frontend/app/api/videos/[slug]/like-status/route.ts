import { NextResponse } from "next/server";
import type { LikeResponse } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";
import { getSession } from "@/lib/auth/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const session = await getSession();

  const headers: Record<string, string> = {};
  if (session.isLoggedIn) {
    headers["Authorization"] = `Bearer ${session.accessToken}`;
  }

  const { data, error, response } = await upstream.GET(
    "/videos/{slug}/like-status",
    { params: { path: { slug } }, headers },
  );

  if (error) {
    return NextResponse.json(error, { status: response.status });
  }

  return NextResponse.json<LikeResponse>(data as LikeResponse);
}
