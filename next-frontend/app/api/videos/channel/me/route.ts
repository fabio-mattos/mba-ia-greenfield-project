import { NextResponse } from "next/server";
import type { ChannelVideos } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";
import { getSession } from "@/lib/auth/session";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  const { data, error, response } = await upstream.GET(
    "/videos/channel/me",
    {
      params: {
        query: {
          page: Number(searchParams.get("page") ?? "1"),
          limit: Number(searchParams.get("limit") ?? "20"),
        },
      },
      headers: { Authorization: `Bearer ${session.accessToken}` },
    },
  );

  if (error) {
    return NextResponse.json(error, { status: (response as Response).status });
  }

  return NextResponse.json<ChannelVideos>(data as ChannelVideos);
}
