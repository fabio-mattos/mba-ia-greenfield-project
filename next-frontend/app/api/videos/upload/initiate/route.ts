import { NextResponse } from "next/server";
import type { ApiErrorEnvelope, InitiateUploadResponse } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";
import { getSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const { data, error, response } = await upstream.POST(
    "/videos/upload/initiate",
    {
      body,
      headers: { Authorization: `Bearer ${session.accessToken}` },
    },
  );

  if (error) {
    return NextResponse.json<ApiErrorEnvelope>(error as ApiErrorEnvelope, {
      status: response.status,
    });
  }

  return NextResponse.json<InitiateUploadResponse>(
    data as InitiateUploadResponse,
    { status: 201 },
  );
}
