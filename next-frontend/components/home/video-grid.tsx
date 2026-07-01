import { cn } from "@/lib/utils";
import type { VideoCard as VideoCardType } from "@/lib/api/contracts";
import { VideoCard } from "@/components/home/video-card";

interface VideoGridProps {
  videos: VideoCardType[];
  className?: string;
}

export function VideoGrid({ videos, className }: VideoGridProps) {
  if (videos.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-body-lg text-muted-foreground">Nenhum vídeo encontrado.</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4",
        className,
      )}
    >
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} />
      ))}
    </div>
  );
}
