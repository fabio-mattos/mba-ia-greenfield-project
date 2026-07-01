import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { upstream } from "@/lib/api/upstream";
import { getSession } from "@/lib/auth/session";
import type { VideoResponse, Category } from "@/lib/api/contracts";
import { VideoEditForm } from "@/components/studio/video-edit-form";

export const metadata: Metadata = {
  title: "Editar vídeo — StreamTube",
};

export default async function EditVideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();

  const [videoRes, catRes] = await Promise.all([
    upstream.GET("/videos/{slug}", {
      params: { path: { slug: id } },
      headers: { Authorization: `Bearer ${session.accessToken}` },
    }),
    upstream.GET("/categories", {}),
  ]);

  if (videoRes.error) notFound();

  const video = videoRes.data as VideoResponse;
  const categories = (catRes.data as Category[]) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1 text-foreground">Editar vídeo</h1>
        <p className="text-body-md text-muted-foreground mt-1 truncate">
          {video.title ?? "(Sem título)"}
        </p>
      </div>
      <VideoEditForm video={video} categories={categories} />
    </div>
  );
}
