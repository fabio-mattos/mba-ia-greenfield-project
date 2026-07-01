import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { upstream } from "@/lib/api/upstream";
import { getSession } from "@/lib/auth/session";
import type { Channel, PaginatedVideos, SubscriptionStatus } from "@/lib/api/contracts";
import { Header } from "@/components/layout/header";
import { SubscribeButton } from "@/components/channel/subscribe-button";
import { VideoGrid } from "@/components/home/video-grid";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ nickname: string }>;
}): Promise<Metadata> {
  const { nickname } = await params;
  const { data } = await upstream.GET("/channels/{nickname}", {
    params: { path: { nickname } },
  });

  const channel = data as Channel | undefined;
  return {
    title: channel?.name ? `${channel.name} — StreamTube` : "StreamTube",
  };
}

export default async function ChannelPage({
  params,
}: {
  params: Promise<{ nickname: string }>;
}) {
  const { nickname } = await params;
  const session = await getSession();
  const authHeader = session.isLoggedIn
    ? { Authorization: `Bearer ${session.accessToken}` }
    : {};

  const [channelRes, videosRes] = await Promise.all([
    upstream.GET("/channels/{nickname}", {
      params: { path: { nickname } },
    }),
    upstream.GET("/videos", {
      params: { query: { channel: nickname, limit: 24 } },
    }),
  ]);

  if (channelRes.error) notFound();

  const channel = channelRes.data as Channel;
  const paginated = (videosRes.data as PaginatedVideos) ?? { data: [] };

  let subscriptionData: SubscriptionStatus = { isSubscribed: false, subscriberCount: 0 };

  if (session.isLoggedIn) {
    const subRes = await upstream.GET(
      "/channels/{nickname}/subscribe",
      {
        params: { path: { nickname } },
        headers: authHeader,
      },
    );
    if (!subRes.error) {
      subscriptionData = subRes.data as SubscriptionStatus;
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto max-w-7xl px-4 py-6 flex flex-col gap-8">
        <div className="flex items-center gap-6">
          <div className="size-20 rounded-full overflow-hidden bg-muted shrink-0 flex items-center justify-center bg-muted-foreground/20">
            <span className="text-h2 text-muted-foreground uppercase">
              {channel.name[0]}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="text-h1 text-foreground">{channel.name}</h1>
            <p className="text-body-md text-muted-foreground">@{channel.nickname}</p>
            {channel.description && (
              <p className="text-body-md text-muted-foreground max-w-lg line-clamp-2">
                {channel.description}
              </p>
            )}
            <SubscribeButton
              nickname={channel.nickname}
              initialSubscribed={subscriptionData.isSubscribed}
              initialCount={subscriptionData.subscriberCount}
              isLoggedIn={session.isLoggedIn ?? false}
            />
          </div>
        </div>

        <div className="border-t border-border pt-6">
          <h2 className="text-h3 text-foreground mb-4">Vídeos</h2>
          <VideoGrid videos={paginated.data} />
        </div>
      </main>
    </div>
  );
}
