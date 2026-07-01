import { NextResponse } from "next/server";
import type { ApiErrorEnvelope, Channel } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ nickname: string }> },
) {
  const { nickname } = await params;

  const { data, error, response } = await upstream.GET("/channels/{nickname}", {
    params: { path: { nickname } },
  });

  if (error) {
    return NextResponse.json<ApiErrorEnvelope>(error as unknown as ApiErrorEnvelope, {
      status: (response as Response).status,
    });
  }

  return NextResponse.json<Channel>(data as unknown as Channel);
}
