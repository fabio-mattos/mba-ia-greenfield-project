import { NextResponse } from "next/server";
import { upstream } from "@/lib/api/upstream";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const { data, error, response } = await upstream.GET(
    "/videos/{slug}/stream",
    { params: { path: { slug } } },
  );

  if (error) {
    return NextResponse.json(error, { status: response.status });
  }

  return NextResponse.json(data);
}
