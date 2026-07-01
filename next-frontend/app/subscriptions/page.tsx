import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";

import { upstream } from "@/lib/api/upstream";
import { getSession } from "@/lib/auth/session";
import type { PaginatedChannels } from "@/lib/api/contracts";
import { Header } from "@/components/layout/header";

export const metadata: Metadata = {
  title: "Inscrições — StreamTube",
};

export default async function SubscriptionsPage() {
  const session = await getSession();
  if (!session.isLoggedIn) redirect("/login");

  const { data } = await upstream.GET("/channels/me/subscriptions", {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });

  const channels = (data as PaginatedChannels)?.data ?? [];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-h1 text-foreground mb-6">Inscrições</h1>

        {channels.length === 0 ? (
          <p className="text-body-lg text-muted-foreground">
            Você ainda não se inscreveu em nenhum canal.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {channels.map((channel) => (
              <Link
                key={channel.id}
                href={`/channels/${channel.nickname}`}
                className="flex items-center gap-3 p-4 rounded-[var(--radius-2)] border border-border hover:bg-muted/50 transition-colors"
              >
                <div className="size-12 rounded-full overflow-hidden bg-muted shrink-0">
                  <div className="w-full h-full flex items-center justify-center bg-muted-foreground/20">
                    <span className="text-h3 text-muted-foreground uppercase">
                      {channel.name[0]}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-label-md text-foreground">{channel.name}</p>
                  <p className="text-caption text-muted-foreground">@{channel.nickname}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
