import { NextResponse } from "next/server";
import type { Channel } from "@/lib/api/contracts";
import { upstream } from "@/lib/api/upstream";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { data, error, response } = await upstream.GET("/channels/me/subscriptions", {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });

  if (error) {
    return NextResponse.json(error, { status: (response as Response).status });
  }

  return NextResponse.json<Channel[]>(data as unknown as Channel[]);
}
