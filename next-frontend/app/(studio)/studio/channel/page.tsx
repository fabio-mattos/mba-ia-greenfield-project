import type { Metadata } from "next";

import { upstream } from "@/lib/api/upstream";
import { getSession } from "@/lib/auth/session";
import type { Channel } from "@/lib/api/contracts";
import { ChannelEditForm } from "@/components/studio/channel-edit-form";

export const metadata: Metadata = {
  title: "Meu canal — StreamTube",
};

export default async function ChannelStudioPage() {
  const session = await getSession();

  const { data, error } = await upstream.GET("/channels/me", {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-body-lg text-muted-foreground">Canal não encontrado.</p>
      </div>
    );
  }

  const channel = data as Channel;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1 text-foreground">Meu canal</h1>
        <p className="text-body-md text-muted-foreground mt-1">@{channel.nickname}</p>
      </div>
      <ChannelEditForm channel={channel} />
    </div>
  );
}
