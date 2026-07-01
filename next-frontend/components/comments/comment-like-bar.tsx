"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { ThumbUpIcon } from "@/components/icons/thumb-up-icon";
import { ThumbDownIcon } from "@/components/icons/thumb-down-icon";
import type { LikeResponse, LikeType } from "@/lib/api/contracts";

interface CommentLikeBarProps {
  commentId: string;
  isLoggedIn: boolean;
}

export function CommentLikeBar({ commentId, isLoggedIn }: CommentLikeBarProps) {
  const [data, setData] = React.useState<LikeResponse>({
    likes: 0,
    dislikes: 0,
    userLike: null,
  });
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    fetch(`/api/comments/${commentId}/like-status`)
      .then((r) => r.json())
      .then((d: LikeResponse) => setData(d))
      .catch(() => {});
  }, [commentId]);

  async function handleReact(type: LikeType) {
    if (!isLoggedIn || loading) return;

    const isRemoving = data.userLike === type;

    setLoading(true);
    try {
      if (isRemoving) {
        await fetch(`/api/comments/${commentId}/like`, { method: "DELETE" });
        setData((prev) => ({
          ...prev,
          userLike: null,
          likes: type === "like" ? prev.likes - 1 : prev.likes,
          dislikes: type === "dislike" ? prev.dislikes - 1 : prev.dislikes,
        }));
      } else {
        const endpoint = type === "like" ? "like" : "dislike";
        const res = await fetch(`/api/comments/${commentId}/${endpoint}`, { method: "POST" });
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
    <div className="flex items-center gap-2">
      <button
        onClick={() => handleReact("like")}
        disabled={!isLoggedIn || loading}
        className={cn(
          "flex items-center gap-1 text-caption transition-colors",
          data.userLike === "like"
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground",
          (!isLoggedIn || loading) && "cursor-default opacity-60",
        )}
        aria-label="Curtir comentário"
      >
        <ThumbUpIcon className="size-3.5" />
        {data.likes > 0 && <span>{data.likes}</span>}
      </button>

      <button
        onClick={() => handleReact("dislike")}
        disabled={!isLoggedIn || loading}
        className={cn(
          "flex items-center gap-1 text-caption transition-colors",
          data.userLike === "dislike"
            ? "text-primary"
            : "text-muted-foreground hover:text-foreground",
          (!isLoggedIn || loading) && "cursor-default opacity-60",
        )}
        aria-label="Não curtir comentário"
      >
        <ThumbDownIcon className="size-3.5" />
        {data.dislikes > 0 && <span>{data.dislikes}</span>}
      </button>
    </div>
  );
}
