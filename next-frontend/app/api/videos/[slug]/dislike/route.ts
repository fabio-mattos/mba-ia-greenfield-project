import { NextResponse } from "next/server";
import type { ApiErrorEnvelope, LikeResponse } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";
import { getSession } from "@/lib/auth/session";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;

  const { data, error, response } = await upstream.POST(
    "/videos/{slug}/dislike",
    {
      params: { path: { slug } },
      headers: { Authorization: `Bearer ${session.accessToken}` },
    },
  );

  if (error) {
    return NextResponse.json<ApiErrorEnvelope>(error as ApiErrorEnvelope, {
      status: response.status,
    });
  }

  return NextResponse.json<LikeResponse>(data as LikeResponse, { status: 201 });
}
