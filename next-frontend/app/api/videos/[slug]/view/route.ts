import { NextResponse } from "next/server";
import { upstream } from "@/lib/api/upstream";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  await upstream.POST("/videos/{slug}/view", {
    params: { path: { slug } },
  });

  return new NextResponse(null, { status: 204 });
}
