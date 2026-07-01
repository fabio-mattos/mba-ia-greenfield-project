import { NextResponse } from "next/server";
import type { ApiErrorEnvelope } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";
import { getSession } from "@/lib/auth/session";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { error, response } = await upstream.POST(
    "/videos/{id}/upload/confirm",
    {
      params: { path: { id } },
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
