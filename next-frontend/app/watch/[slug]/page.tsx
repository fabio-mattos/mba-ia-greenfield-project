import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

import { upstream } from "@/lib/api/upstream";
import { getSession } from "@/lib/auth/session";
import type {
  VideoResponse,
  VideoCard,
  LikeResponse,
  PaginatedComments,
  SubscriptionStatus,
} from "@/lib/api/contracts";
import { Header } from "@/components/layout/header";
import { VideoPlayer } from "@/components/video/video-player";
import { DescriptionExpander } from "@/components/video/description-expander";
import { SuggestionCard } from "@/components/video/suggestion-card";
import { LikeDislikeBar } from "@/components/video/like-dislike-bar";
import { SubscribeButton } from "@/components/channel/subscribe-button";
import { CommentSection } from "@/components/comments/comment-section";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await upstream.GET("/videos/{slug}", {
    params: { path: { slug } },
  });

  const video = data as VideoResponse | undefined;
  return {
    title: video?.title ? `${video.title} — StreamTube` : "StreamTube",
    description: video?.description ?? undefined,
  };
}

export default async function WatchPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getSession();
  const authHeader = session.isLoggedIn
    ? { Authorization: `Bearer ${session.accessToken}` }
    : {};

  const [videoRes, suggestionsRes, commentsRes] = await Promise.all([
    upstream.GET("/videos/{slug}", {
      params: { path: { slug } },
      headers: authHeader,
    }),
    upstream.GET("/videos/{slug}/suggestions", {
      params: { path: { slug } },
    }),
    upstream.GET("/videos/{slug}/comments", {
      params: { path: { slug }, query: { page: 1, limit: 20 } },
    }),
  ]);

  if (videoRes.error) notFound();

  const video = videoRes.data as VideoResponse;
  const suggestions = (suggestionsRes.data as VideoCard[]) ?? [];
  const comments = (commentsRes.data as PaginatedComments) ?? { data: [], total: 0 };

  let likeData: LikeResponse = { likes: 0, dislikes: 0, userLike: null };
  let subscriptionData: SubscriptionStatus = { isSubscribed: false, subscriberCount: 0 };

  const likeRes = await upstream.GET("/videos/{slug}/like-status", {
    params: { path: { slug } },
    headers: authHeader,
  });

  if (!likeRes.error) likeData = likeRes.data as LikeResponse;

  if (session.isLoggedIn) {
    const subRes = await upstream.GET("/channels/{nickname}/subscribe", {
      params: { path: { nickname: video.channel.nickname } },
      headers: authHeader,
    });

    if (!subRes.error) subscriptionData = subRes.data as SubscriptionStatus;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto max-w-7xl px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-4">
            <VideoPlayer slug={slug} title={video.title ?? ""} />

            <div className="flex flex-col gap-3">
              <h1 className="text-h2 text-foreground">{video.title}</h1>

              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <Link
                    href={`/channels/${video.channel.nickname}`}
                    className="flex items-center gap-2 group"
                  >
                    <div className="size-10 rounded-full bg-muted overflow-hidden shrink-0">
                      {video.channel.thumbnail_url ? (
                        <Image
                          src={video.channel.thumbnail_url}
                          alt={video.channel.name}
                          width={40}
                          height={40}
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted-foreground/20">
                          <span className="text-caption text-muted-foreground uppercase">
                            {video.channel.name[0]}
                          </span>
                        </div>
                      )}
                    </div>
                    <span className="text-label-md text-foreground group-hover:underline">
                      {video.channel.name}
                    </span>
                  </Link>

                  <SubscribeButton
                    nickname={video.channel.nickname}
                    initialSubscribed={subscriptionData.isSubscribed}
                    initialCount={subscriptionData.subscriberCount}
                    isLoggedIn={session.isLoggedIn ?? false}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <LikeDislikeBar
                    slug={slug}
                    initialData={likeData}
                    isLoggedIn={session.isLoggedIn ?? false}
                  />
                  <a
                    href={`/api/videos/${slug}/download`}
                    className="text-caption text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
                    aria-label="Download do vídeo"
                  >
                    Download
                  </a>
                </div>
              </div>

              <div className="p-4 rounded-[var(--radius-2)] bg-muted/50">
                <div className="flex items-center gap-3 mb-2 text-caption text-muted-foreground">
                  <span>{video.view_count.toLocaleString("pt-BR")} visualizações</span>
                  {video.published_at && (
                    <span>
                      {new Date(video.published_at).toLocaleDateString("pt-BR")}
                    </span>
                  )}
                </div>
                {video.description && (
                  <DescriptionExpander text={video.description} />
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <CommentSection
                slug={slug}
                initialData={comments}
                isLoggedIn={session.isLoggedIn ?? false}
                userId={session.userId ?? ""}
              />
            </div>
          </div>

          <aside className="flex flex-col gap-2">
            <h2 className="text-label-lg text-muted-foreground mb-2">Sugeridos</h2>
            {suggestions.map((v) => (
              <SuggestionCard key={v.id} video={v} />
            ))}
          </aside>
        </div>
      </main>
    </div>
  );
}
