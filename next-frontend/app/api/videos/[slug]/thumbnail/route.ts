import { NextResponse } from "next/server";
import type { ApiErrorEnvelope } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";
import { getSession } from "@/lib/auth/session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const formData = await request.formData();

  const { data, error, response } = await upstream.POST(
    "/videos/{id}/thumbnail",
    {
      params: { path: { id: slug } },
      // openapi-typescript can't model a binary multipart field; FormData is the real wire body.
      body: formData as unknown as { file?: string },
      headers: { Authorization: `Bearer ${session.accessToken}` },
    },
  );

  if (error) {
    return NextResponse.json<ApiErrorEnvelope>(error as ApiErrorEnvelope, {
      status: response.status,
    });
  }

  return NextResponse.json(data);
}
