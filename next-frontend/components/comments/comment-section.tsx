"use client";

import * as React from "react";

import type { Comment, PaginatedComments } from "@/lib/api/contracts";
import { CommentItem } from "@/components/comments/comment-item";
import { CommentForm } from "@/components/comments/comment-form";

interface CommentSectionProps {
  slug: string;
  initialData: PaginatedComments;
  isLoggedIn: boolean;
  userId: string;
}

export function CommentSection({
  slug,
  initialData,
  isLoggedIn,
  userId,
}: CommentSectionProps) {
  const [comments, setComments] = React.useState<Comment[]>(initialData.data);
  const [total, setTotal] = React.useState(initialData.total);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(false);

  function handleCommentAdded(comment: Comment) {
    setComments((prev) => [comment, ...prev]);
    setTotal((prev) => prev + 1);
  }

  async function loadMore() {
    setLoading(true);
    const nextPage = page + 1;

    const res = await fetch(`/api/videos/${slug}/comments?page=${nextPage}&limit=20`);
    if (res.ok) {
      const data = (await res.json()) as PaginatedComments;
      setComments((prev) => [...prev, ...data.data]);
      setPage(nextPage);
    }

    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-h3 text-foreground">{total.toLocaleString("pt-BR")} comentários</h2>

      {isLoggedIn && (
        <CommentForm slug={slug} onCommentAdded={handleCommentAdded} />
      )}

      <div className="flex flex-col gap-6">
        {comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            slug={slug}
            userId={userId}
          />
        ))}
      </div>

      {comments.length < total && (
        <button
          onClick={loadMore}
          disabled={loading}
          className="self-center text-label-md text-link hover:underline disabled:opacity-50"
        >
          {loading ? "Carregando..." : "Carregar mais comentários"}
        </button>
      )}
    </div>
  );
}
