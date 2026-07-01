import { NextResponse } from "next/server";
import type { ApiErrorEnvelope, SubscriptionStatus } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";
import { getSession } from "@/lib/auth/session";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ nickname: string }> },
) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { nickname } = await params;

  const { data, error, response } = await upstream.POST(
    "/channels/{nickname}/subscribe",
    {
      params: { path: { nickname } },
      headers: { Authorization: `Bearer ${session.accessToken}` },
    },
  );

  if (error) {
    return NextResponse.json<ApiErrorEnvelope>(error as unknown as ApiErrorEnvelope, {
      status: (response as Response).status,
    });
  }

  return NextResponse.json<SubscriptionStatus>(data as unknown as SubscriptionStatus);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ nickname: string }> },
) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { nickname } = await params;

  const { data, error, response } = await upstream.DELETE(
    "/channels/{nickname}/subscribe",
    {
      params: { path: { nickname } },
      headers: { Authorization: `Bearer ${session.accessToken}` },
    },
  );

  if (error) {
    return NextResponse.json<ApiErrorEnvelope>(error as unknown as ApiErrorEnvelope, {
      status: (response as Response).status,
    });
  }

  return NextResponse.json<SubscriptionStatus>(data as unknown as SubscriptionStatus);
}
