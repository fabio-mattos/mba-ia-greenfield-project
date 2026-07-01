import { NextResponse } from "next/server";
import type { ApiErrorEnvelope, Channel } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { data, error, response } = await upstream.GET("/channels/me", {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });

  if (error) {
    return NextResponse.json<ApiErrorEnvelope>(error as unknown as ApiErrorEnvelope, {
      status: (response as Response).status,
    });
  }

  return NextResponse.json<Channel>(data as unknown as Channel);
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const { data, error, response } = await upstream.PATCH("/channels/me", {
    body,
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });

  if (error) {
    return NextResponse.json<ApiErrorEnvelope>(error as unknown as ApiErrorEnvelope, {
      status: (response as Response).status,
    });
  }

  return NextResponse.json<Channel>(data as unknown as Channel);
}
