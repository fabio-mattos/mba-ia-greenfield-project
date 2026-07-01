"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { Comment } from "@/lib/api/contracts";
import { CommentForm } from "@/components/comments/comment-form";
import { CommentLikeBar } from "@/components/comments/comment-like-bar";

interface CommentItemProps {
  comment: Comment;
  slug: string;
  userId: string;
  isReply?: boolean;
}

export function CommentItem({ comment, slug, userId, isReply = false }: CommentItemProps) {
  const [showReplyForm, setShowReplyForm] = React.useState(false);
  const [replies, setReplies] = React.useState<Comment[]>([]);
  const [repliesLoaded, setRepliesLoaded] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  async function loadReplies() {
    if (repliesLoaded) return;
    const res = await fetch(`/api/comments/${comment.id}/replies`);
    if (res.ok) {
      const data = (await res.json()) as { data: Comment[] };
      setReplies(data.data);
      setRepliesLoaded(true);
    }
  }

  async function handleDelete() {
    if (!confirm("Excluir este comentário?")) return;
    setDeleting(true);
    await fetch(`/api/comments/${comment.id}`, { method: "DELETE" });
    setDeleting(false);
  }

  function handleReplyAdded(reply: Comment) {
    setReplies((prev) => [reply, ...prev]);
    setRepliesLoaded(true);
    setShowReplyForm(false);
  }

  const isDeleted = comment.deleted;
  const isOwn = userId === comment.author.id;

  return (
    <div className={cn("flex flex-col gap-2", isReply && "ml-8")}>
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
            <span className="text-caption text-muted-foreground uppercase">
              {comment.author.email[0]}
            </span>
          </div>
          <span className="text-caption text-muted-foreground">{comment.author.email}</span>
          <span className="text-caption text-muted-foreground">
            {new Date(comment.created_at).toLocaleDateString("pt-BR")}
          </span>
          {isOwn && !isDeleted && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="ml-auto text-caption text-destructive hover:underline"
            >
              Excluir
            </button>
          )}
        </div>
        <p
          className={cn(
            "text-body-md pl-10",
            isDeleted ? "text-muted-foreground italic" : "text-foreground",
          )}
        >
          {comment.body}
        </p>
      </div>

      {!isDeleted && (
        <div className="pl-10">
          <CommentLikeBar commentId={comment.id} isLoggedIn={!!userId} />
        </div>
      )}

      {!isReply && !isDeleted && userId && (
        <div className="pl-10 flex items-center gap-3">
          <button
            onClick={() => {
              setShowReplyForm((v) => !v);
              if (!repliesLoaded) loadReplies();
            }}
            className="text-caption text-muted-foreground hover:text-foreground transition-colors"
          >
            Responder
          </button>
          {repliesLoaded && replies.length > 0 && (
            <span className="text-caption text-muted-foreground">
              {replies.length} {replies.length === 1 ? "resposta" : "respostas"}
            </span>
          )}
        </div>
      )}

      {showReplyForm && (
        <div className="pl-10">
          <CommentForm
            slug={slug}
            parentId={comment.id}
            onCommentAdded={handleReplyAdded}
            onCancel={() => setShowReplyForm(false)}
            placeholder="Adicione uma resposta..."
          />
        </div>
      )}

      {repliesLoaded && replies.length > 0 && (
        <div className="flex flex-col gap-4">
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              slug={slug}
              userId={userId}
              isReply
            />
          ))}
        </div>
      )}
    </div>
  );
}
