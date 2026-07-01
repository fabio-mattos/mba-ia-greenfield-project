"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

import { cn } from "@/lib/utils";
import type { VideoResponse, Category } from "@/lib/api/contracts";

interface VideoEditFormProps {
  video: VideoResponse;
  categories: Category[];
}

export function VideoEditForm({ video, categories }: VideoEditFormProps) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = React.useState<string | null>(
    video.thumbnail_url,
  );

  const [form, setForm] = React.useState({
    title: video.title ?? "",
    description: video.description ?? "",
    category_id: video.category?.id ?? "",
    visibility: video.visibility ?? "public",
  });

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/videos/${video.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title || undefined,
        description: form.description || undefined,
        category_id: form.category_id || undefined,
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const err = await res.json();
      setError(err.message ?? "Erro ao salvar.");
    } else {
      router.refresh();
    }
  }

  async function handlePublish() {
    setPublishing(true);
    setError(null);

    const res = await fetch(`/api/videos/${video.id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility: form.visibility }),
    });

    setPublishing(false);

    if (!res.ok) {
      const err = await res.json();
      setError(err.message ?? "Erro ao publicar.");
    } else {
      router.push("/studio");
    }
  }

  async function handleThumbnailChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const fd = new FormData();
    fd.append("thumbnail", file);

    const res = await fetch(`/api/videos/${video.id}/thumbnail`, {
      method: "POST",
      body: fd,
    });

    if (res.ok) {
      setThumbnailPreview(URL.createObjectURL(file));
    }
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6">
      {error && (
        <p className="text-body-md text-destructive">{error}</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="title" className="text-label-md text-foreground">
              Título
            </label>
            <input
              id="title"
              name="title"
              value={form.title}
              onChange={handleChange}
              maxLength={200}
              className={cn(
                "h-10 px-3 rounded-[var(--radius-2)] border border-border",
                "bg-background text-foreground text-body-md",
                "focus:outline-none focus:border-ring",
              )}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="description" className="text-label-md text-foreground">
              Descrição
            </label>
            <textarea
              id="description"
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={5}
              className={cn(
                "px-3 py-2 rounded-[var(--radius-2)] border border-border",
                "bg-background text-foreground text-body-md resize-none",
                "focus:outline-none focus:border-ring",
              )}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="category_id" className="text-label-md text-foreground">
              Categoria
            </label>
            <select
              id="category_id"
              name="category_id"
              value={form.category_id}
              onChange={handleChange}
              className={cn(
                "h-10 px-3 rounded-[var(--radius-2)] border border-border",
                "bg-background text-foreground text-body-md",
                "focus:outline-none focus:border-ring",
              )}
            >
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-label-md text-foreground">Thumbnail</p>
            <div className="relative aspect-video rounded-[var(--radius-2)] overflow-hidden bg-muted">
              {thumbnailPreview ? (
                <Image
                  src={thumbnailPreview}
                  alt="Thumbnail"
                  fill
                  className="object-cover"
                  sizes="256px"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-caption text-muted-foreground">Sem thumbnail</span>
                </div>
              )}
            </div>
            <label
              className={cn(
                "cursor-pointer px-3 h-8 flex items-center justify-center rounded-[var(--radius-1)]",
                "border border-border text-label-md text-foreground hover:bg-muted transition-colors",
              )}
            >
              Alterar thumbnail
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleThumbnailChange}
              />
            </label>
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-label-md text-foreground">Status</p>
            <span className="text-body-md text-muted-foreground capitalize">{video.status}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-4 border-t border-border">
        <button
          type="submit"
          disabled={saving}
          className={cn(
            "px-4 h-9 rounded-[var(--radius-full)] bg-primary text-primary-foreground",
            "text-label-md hover:opacity-90 transition-opacity disabled:opacity-50",
          )}
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>

        {video.status === "ready" && !video.published_at && (
          <div className="flex items-center gap-2">
            <select
              name="visibility"
              value={form.visibility}
              onChange={handleChange}
              className={cn(
                "h-9 px-3 rounded-[var(--radius-full)] border border-border",
                "bg-background text-foreground text-body-md",
                "focus:outline-none focus:border-ring",
              )}
            >
              <option value="public">Público</option>
              <option value="unlisted">Não listado</option>
            </select>
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishing}
              className={cn(
                "px-4 h-9 rounded-[var(--radius-full)] bg-primary text-primary-foreground",
                "text-label-md hover:opacity-90 transition-opacity disabled:opacity-50",
              )}
            >
              {publishing ? "Publicando..." : "Publicar"}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}
