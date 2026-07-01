import { NextResponse } from "next/server";

import { upstream } from "@/lib/api/upstream";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const { data, error, response } = await upstream.GET(
    "/videos/{slug}/download",
    { params: { path: { slug } } },
  );

  if (error) return NextResponse.json(error, { status: response.status });

  const { url } = data as { url: string };
  return NextResponse.redirect(url, 302);
}
