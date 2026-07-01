import { NextResponse } from "next/server";
import type { PaginatedComments } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { data, error, response } = await upstream.GET(
    "/comments/{commentId}/replies",
    { params: { path: { commentId: id } } },
  );

  if (error) {
    return NextResponse.json(error, { status: (response as Response).status });
  }

  return NextResponse.json<PaginatedComments>(data as PaginatedComments);
}
