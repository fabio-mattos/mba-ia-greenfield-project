"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { Comment } from "@/lib/api/contracts";

interface CommentFormProps {
  slug: string;
  parentId?: string;
  onCommentAdded: (comment: Comment) => void;
  onCancel?: () => void;
  placeholder?: string;
}

export function CommentForm({
  slug,
  parentId,
  onCommentAdded,
  onCancel,
  placeholder = "Adicione um comentário...",
}: CommentFormProps) {
  const [body, setBody] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);

    const res = await fetch(`/api/videos/${slug}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: body.trim(), parent_id: parentId }),
    });

    setSubmitting(false);

    if (res.ok) {
      const comment = (await res.json()) as Comment;
      onCommentAdded(comment);
      setBody("");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className={cn(
          "w-full px-3 py-2 rounded-[var(--radius-2)] border border-border",
          "bg-background text-foreground text-body-md resize-none",
          "focus:outline-none focus:border-ring",
          "placeholder:text-muted-foreground",
        )}
      />
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 h-8 rounded-[var(--radius-full)] text-label-md text-foreground hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={submitting || !body.trim()}
          className={cn(
            "px-3 h-8 rounded-[var(--radius-full)] bg-primary text-primary-foreground",
            "text-label-md hover:opacity-90 transition-opacity",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          {submitting ? "Enviando..." : "Comentar"}
        </button>
      </div>
    </form>
  );
}
