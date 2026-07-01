"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { ThumbUpIcon } from "@/components/icons/thumb-up-icon";
import { ThumbDownIcon } from "@/components/icons/thumb-down-icon";
import type { LikeResponse, LikeType } from "@/lib/api/contracts";

interface LikeDislikeBarProps {
  slug: string;
  initialData: LikeResponse;
  isLoggedIn: boolean;
}

export function LikeDislikeBar({ slug, initialData, isLoggedIn }: LikeDislikeBarProps) {
  const [data, setData] = React.useState<LikeResponse>(initialData);
  const [loading, setLoading] = React.useState(false);

  async function handleVote(type: LikeType) {
    if (!isLoggedIn || loading) return;
    setLoading(true);

    try {
      if (data.userLike === type) {
        const res = await fetch(`/api/videos/${slug}/like`, { method: "DELETE" });
        if (res.ok) {
          setData((prev) => ({
            ...prev,
            userLike: null,
            likes: type === "like" ? prev.likes - 1 : prev.likes,
            dislikes: type === "dislike" ? prev.dislikes - 1 : prev.dislikes,
          }));
        }
      } else {
        const res = await fetch(`/api/videos/${slug}/${type}`, { method: "POST" });
        if (res.ok) {
          const updated = (await res.json()) as LikeResponse;
          setData(updated);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => handleVote("like")}
        disabled={!isLoggedIn || loading}
        aria-label="Gostei"
        aria-pressed={data.userLike === "like"}
        className={cn(
          "flex items-center gap-2 px-3 h-9 rounded-l-[var(--radius-full)] border border-border",
          "text-label-md transition-colors",
          data.userLike === "like"
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-background text-foreground hover:bg-muted",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        <ThumbUpIcon className="size-4" />
        <span>{data.likes.toLocaleString("pt-BR")}</span>
      </button>

      <div className="w-px h-9 bg-border" />

      <button
        onClick={() => handleVote("dislike")}
        disabled={!isLoggedIn || loading}
        aria-label="Não gostei"
        aria-pressed={data.userLike === "dislike"}
        className={cn(
          "flex items-center gap-2 px-3 h-9 rounded-r-[var(--radius-full)] border border-border border-l-0",
          "text-label-md transition-colors",
          data.userLike === "dislike"
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-background text-foreground hover:bg-muted",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        <ThumbDownIcon className="size-4" />
      </button>
    </div>
  );
}
