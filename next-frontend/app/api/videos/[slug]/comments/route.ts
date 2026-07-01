import { NextResponse } from "next/server";
import type { ApiErrorEnvelope, Comment, PaginatedComments } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";
import { getSession } from "@/lib/auth/session";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);

  const { data, error, response } = await upstream.GET(
    "/videos/{slug}/comments",
    {
      params: {
        path: { slug },
        query: {
          page: Number(searchParams.get("page") ?? "1"),
          limit: Number(searchParams.get("limit") ?? "20"),
        },
      },
    },
  );

  if (error) {
    return NextResponse.json(error, { status: response.status });
  }

  return NextResponse.json<PaginatedComments>(data as PaginatedComments);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const body = await request.json();

  const { data, error, response } = await upstream.POST(
    "/videos/{slug}/comments",
    {
      params: { path: { slug } },
      body,
      headers: { Authorization: `Bearer ${session.accessToken}` },
    },
  );

  if (error) {
    return NextResponse.json<ApiErrorEnvelope>(error as ApiErrorEnvelope, {
      status: response.status,
    });
  }

  return NextResponse.json<Comment>(data as Comment, { status: 201 });
}
