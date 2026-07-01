"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

interface VideoPlayerProps {
  slug: string;
  title: string;
}

export function VideoPlayer({ slug, title }: VideoPlayerProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [streamUrl, setStreamUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch(`/api/videos/${slug}/stream`)
      .then((r) => r.json())
      .then((data: { url: string }) => {
        setStreamUrl(data.url);
        setLoading(false);
      })
      .catch(() => {
        setError("Não foi possível carregar o vídeo.");
        setLoading(false);
      });
  }, [slug]);

  React.useEffect(() => {
    fetch(`/api/videos/${slug}/view`, { method: "POST" }).catch(() => null);
  }, [slug]);

  if (loading) {
    return (
      <div className="aspect-video bg-black rounded-[var(--radius-2)] flex items-center justify-center">
        <div className="size-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !streamUrl) {
    return (
      <div className="aspect-video bg-black rounded-[var(--radius-2)] flex items-center justify-center">
        <p className="text-white text-body-md">{error ?? "Vídeo indisponível."}</p>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      src={streamUrl}
      controls
      className={cn(
        "w-full aspect-video rounded-[var(--radius-2)] bg-black",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
      aria-label={title}
    />
  );
}
