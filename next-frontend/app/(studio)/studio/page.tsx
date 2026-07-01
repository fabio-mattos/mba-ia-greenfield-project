import type { Metadata } from "next";
import Link from "next/link";

import { upstream } from "@/lib/api/upstream";
import { getSession } from "@/lib/auth/session";
import type { ChannelVideos } from "@/lib/api/contracts";
import { VideoListTable } from "@/components/studio/video-list-table";

export const metadata: Metadata = {
  title: "Studio — StreamTube",
};

export default async function StudioPage() {
  const session = await getSession();

  const { data } = await upstream.GET("/videos/channel/me", {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });

  const paginated = (data as ChannelVideos) ?? { data: [], total: 0 };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 text-foreground">Seus vídeos</h1>
        <Link
          href="/upload"
          className="px-4 h-9 flex items-center rounded-[var(--radius-full)] bg-primary text-primary-foreground text-label-md hover:opacity-90 transition-opacity"
        >
          Enviar vídeo
        </Link>
      </div>

      <VideoListTable videos={paginated.data} />
    </div>
  );
}
