import Link from "next/link";
import Image from "next/image";

import { cn } from "@/lib/utils";
import type { VideoCard as VideoCardType } from "@/lib/api/contracts";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function timeAgo(dateString: string | null): string {
  if (!dateString) return "";
  const diff = Date.now() - new Date(dateString).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  const months = Math.floor(days / 30);
  if (months < 12) return `há ${months} ${months === 1 ? "mês" : "meses"}`;
  const years = Math.floor(months / 12);
  return `há ${years} ${years === 1 ? "ano" : "anos"}`;
}

export function VideoCard({ video }: { video: VideoCardType }) {
  return (
    <Link
      href={`/watch/${video.slug}`}
      className={cn(
        "flex flex-col gap-3 group rounded-[var(--radius-2)] overflow-hidden",
        "hover:bg-muted/30 transition-colors",
      )}
    >
      <div className="relative aspect-video rounded-[var(--radius-2)] overflow-hidden bg-muted">
        {video.thumbnail_url ? (
          <Image
            src={video.thumbnail_url}
            alt={video.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="w-full h-full bg-muted-foreground/20" />
        )}
        {video.duration_seconds && (
          <span className="absolute bottom-2 right-2 bg-black/80 text-white text-caption px-1.5 py-0.5 rounded">
            {formatDuration(video.duration_seconds)}
          </span>
        )}
      </div>

      <div className="flex gap-3 px-1 pb-3">
        <div className="size-9 rounded-full bg-muted overflow-hidden shrink-0">
          {video.channel.thumbnail_url ? (
            <Image
              src={video.channel.thumbnail_url}
              alt={video.channel.name}
              width={36}
              height={36}
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

        <div className="flex flex-col gap-1 min-w-0">
          <h3 className="text-label-md text-foreground line-clamp-2">{video.title}</h3>
          <p className="text-caption text-muted-foreground">{video.channel.name}</p>
          <p className="text-caption text-muted-foreground">
            {video.view_count.toLocaleString("pt-BR")} visualizações
            {video.published_at && ` · ${timeAgo(video.published_at)}`}
          </p>
        </div>
      </div>
    </Link>
  );
}
