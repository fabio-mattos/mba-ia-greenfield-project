import { NextResponse } from "next/server";

import { upstream } from "@/lib/api/upstream";
import { getSession } from "@/lib/auth/session";
import type { LikeResponse } from "@/lib/api/contracts";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();

  const { data, error, response } = await upstream.POST(
    "/comments/{commentId}/like",
    {
      params: { path: { commentId: id } },
      headers: { Authorization: `Bearer ${session.accessToken}` },
    },
  );

  if (error) return NextResponse.json(error, { status: response.status });
  return NextResponse.json<LikeResponse>(data as LikeResponse, { status: 201 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();

  const { error, response } = await upstream.DELETE(
    "/comments/{commentId}/like",
    {
      params: { path: { commentId: id } },
      headers: { Authorization: `Bearer ${session.accessToken}` },
    },
  );

  if (error) return NextResponse.json(error, { status: response.status });
  return new Response(null, { status: 204 });
}
