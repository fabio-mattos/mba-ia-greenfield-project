"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import type { VideoResponse } from "@/lib/api/contracts";

export function VideoListTable({ videos }: { videos: VideoResponse[] }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Tem certeza que deseja excluir este vídeo?")) return;
    setDeletingId(id);

    const res = await fetch(`/api/videos/${id}`, { method: "DELETE" });

    setDeletingId(null);

    if (res.ok) {
      router.refresh();
    }
  }

  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-body-lg text-muted-foreground">Nenhum vídeo ainda.</p>
        <Link
          href="/upload"
          className={cn(
            "mt-4 px-4 h-9 flex items-center rounded-[var(--radius-full)]",
            "bg-primary text-primary-foreground text-label-md hover:opacity-90 transition-opacity",
          )}
        >
          Enviar vídeo
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-body-md">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-3 pr-4 text-label-md text-muted-foreground font-weight-600">Vídeo</th>
            <th className="py-3 pr-4 text-label-md text-muted-foreground font-weight-600">Status</th>
            <th className="py-3 pr-4 text-label-md text-muted-foreground font-weight-600">Visualizações</th>
            <th className="py-3 text-label-md text-muted-foreground font-weight-600">Ações</th>
          </tr>
        </thead>
        <tbody>
          {videos.map((video) => (
            <tr key={video.id} className="border-b border-border hover:bg-muted/30 transition-colors">
              <td className="py-3 pr-4">
                <div className="flex items-center gap-3">
                  <div className="relative w-24 aspect-video rounded-[var(--radius-1)] overflow-hidden bg-muted shrink-0">
                    {video.thumbnail_url ? (
                      <Image
                        src={video.thumbnail_url}
                        alt={video.title ?? ""}
                        fill
                        className="object-cover"
                        sizes="96px"
                      />
                    ) : (
                      <div className="w-full h-full bg-muted-foreground/20" />
                    )}
                  </div>
                  <span className="text-body-md text-foreground line-clamp-2 max-w-xs">
                    {video.title || "(Sem título)"}
                  </span>
                </div>
              </td>
              <td className="py-3 pr-4">
                <StatusBadge status={video.status} />
              </td>
              <td className="py-3 pr-4 text-muted-foreground">
                {video.view_count.toLocaleString("pt-BR")}
              </td>
              <td className="py-3">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/studio/videos/${video.id}/edit`}
                    className={cn(
                      "px-3 h-8 flex items-center rounded-[var(--radius-1)] border border-border",
                      "text-label-md text-foreground hover:bg-muted transition-colors",
                    )}
                  >
                    Editar
                  </Link>
                  <button
                    onClick={() => handleDelete(video.id)}
                    disabled={deletingId === video.id}
                    className={cn(
                      "px-3 h-8 flex items-center rounded-[var(--radius-1)]",
                      "text-label-md text-destructive border border-destructive",
                      "hover:bg-destructive hover:text-primary-foreground transition-colors",
                      "disabled:opacity-50",
                    )}
                  >
                    {deletingId === video.id ? "..." : "Excluir"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
    processing: { label: "Processando", className: "bg-warning-100 text-warning-dark" },
    ready: { label: "Pronto", className: "bg-success-alpha-10 text-success-dark" },
    failed: { label: "Erro", className: "bg-error-alpha-10 text-error-200" },
  };

  const info = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-[var(--radius-full)]",
        "text-caption",
        info.className,
      )}
    >
      {info.label}
    </span>
  );
}
