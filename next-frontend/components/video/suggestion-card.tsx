import Link from "next/link";
import Image from "next/image";

import { cn } from "@/lib/utils";
import type { VideoCard } from "@/lib/api/contracts";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function SuggestionCard({ video }: { video: VideoCard }) {
  return (
    <Link
      href={`/watch/${video.slug}`}
      className={cn(
        "flex gap-3 hover:bg-muted/50 rounded-[var(--radius-2)] p-2 transition-colors",
      )}
    >
      <div className="relative w-36 aspect-video rounded-[var(--radius-1)] overflow-hidden bg-muted shrink-0">
        {video.thumbnail_url ? (
          <Image
            src={video.thumbnail_url}
            alt={video.title}
            fill
            className="object-cover"
            sizes="144px"
          />
        ) : (
          <div className="w-full h-full bg-muted-foreground/20" />
        )}
        {video.duration_seconds && (
          <span className="absolute bottom-1 right-1 bg-black/80 text-white text-caption px-1 rounded">
            {formatDuration(video.duration_seconds)}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <p className="text-body-md text-foreground line-clamp-2">{video.title}</p>
        <p className="text-caption text-muted-foreground">{video.channel.name}</p>
        <p className="text-caption text-muted-foreground">
          {video.view_count.toLocaleString("pt-BR")} visualizações
        </p>
      </div>
    </Link>
  );
}
