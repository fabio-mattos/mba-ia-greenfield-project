"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

import { cn } from "@/lib/utils";
import type { Channel } from "@/lib/api/contracts";

export function ChannelEditForm({ channel }: { channel: Channel }) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [thumbnailPreview, setThumbnailPreview] = React.useState<string | null>(
    null,
  );

  const [form, setForm] = React.useState({
    name: channel.name ?? "",
    nickname: channel.nickname ?? "",
    description: channel.description ?? "",
  });

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    const res = await fetch("/api/channels/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name || undefined,
        nickname: form.nickname || undefined,
        description: form.description || undefined,
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const err = await res.json();
      setError(err.message ?? "Erro ao salvar.");
    } else {
      setSuccess(true);
      router.refresh();
    }
  }

  async function handleThumbnailChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const fd = new FormData();
    fd.append("thumbnail", file);

    const res = await fetch("/api/channels/me/thumbnail", {
      method: "POST",
      body: fd,
    });

    if (res.ok) {
      setThumbnailPreview(URL.createObjectURL(file));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-lg">
      {error && <p className="text-body-md text-destructive">{error}</p>}
      {success && (
        <p className="text-body-md text-success-200">Canal atualizado com sucesso!</p>
      )}

      <div className="flex items-center gap-4">
        <div className="relative size-20 rounded-full overflow-hidden bg-muted shrink-0">
          {thumbnailPreview ? (
            <Image src={thumbnailPreview} alt="Avatar" fill className="object-cover" sizes="80px" />
          ) : (
            <div className="w-full h-full bg-muted-foreground/20 flex items-center justify-center">
              <span className="text-h3 text-muted-foreground uppercase">
                {channel.name?.[0] ?? "?"}
              </span>
            </div>
          )}
        </div>
        <label
          className={cn(
            "cursor-pointer px-3 h-8 flex items-center rounded-[var(--radius-1)]",
            "border border-border text-label-md text-foreground hover:bg-muted transition-colors",
          )}
        >
          Alterar foto
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={handleThumbnailChange}
          />
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-label-md text-foreground">
          Nome do canal
        </label>
        <input
          id="name"
          name="name"
          value={form.name}
          onChange={handleChange}
          maxLength={100}
          className={cn(
            "h-10 px-3 rounded-[var(--radius-2)] border border-border",
            "bg-background text-foreground text-body-md",
            "focus:outline-none focus:border-ring",
          )}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="nickname" className="text-label-md text-foreground">
          @nickname
        </label>
        <div className="flex items-center">
          <span className="h-10 px-3 flex items-center border border-r-0 border-border rounded-l-[var(--radius-2)] bg-muted text-body-md text-muted-foreground">
            @
          </span>
          <input
            id="nickname"
            name="nickname"
            value={form.nickname}
            onChange={handleChange}
            minLength={3}
            maxLength={50}
            pattern="[a-z0-9_-]+"
            className={cn(
              "flex-1 h-10 px-3 rounded-r-[var(--radius-2)] border border-border",
              "bg-background text-foreground text-body-md",
              "focus:outline-none focus:border-ring",
            )}
          />
        </div>
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
          rows={4}
          className={cn(
            "px-3 py-2 rounded-[var(--radius-2)] border border-border",
            "bg-background text-foreground text-body-md resize-none",
            "focus:outline-none focus:border-ring",
          )}
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className={cn(
          "self-start px-4 h-9 rounded-[var(--radius-full)] bg-primary text-primary-foreground",
          "text-label-md hover:opacity-90 transition-opacity disabled:opacity-50",
        )}
      >
        {saving ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
