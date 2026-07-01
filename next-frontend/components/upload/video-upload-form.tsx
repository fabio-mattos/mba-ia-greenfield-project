"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { UploadIcon } from "@/components/icons/upload-icon";
import { UploadProgress } from "@/components/upload/upload-progress";

type UploadState =
  | { phase: "idle" }
  | { phase: "uploading"; file: File; progress: number }
  | { phase: "processing"; videoId: string }
  | { phase: "done"; videoId: string }
  | { phase: "error"; message: string };

export function VideoUploadForm() {
  const router = useRouter();
  const [state, setState] = React.useState<UploadState>({ phase: "idle" });
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setState({ phase: "uploading", file, progress: 0 });

    try {
      const initiateRes = await fetch("/api/videos/upload/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalFilename: file.name }),
      });

      if (!initiateRes.ok) {
        const err = await initiateRes.json();
        setState({ phase: "error", message: err.message ?? "Falha ao iniciar upload." });
        return;
      }

      const { videoId, uploadUrl } = (await initiateRes.json()) as {
        videoId: string;
        uploadUrl: string;
      };

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type || "video/mp4");

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const progress = Math.round((ev.loaded / ev.total) * 100);
            setState({ phase: "uploading", file, progress });
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload falhou: ${xhr.status}`));
        };

        xhr.onerror = () => reject(new Error("Erro de rede no upload."));
        xhr.send(file);
      });

      setState({ phase: "processing", videoId });

      const confirmRes = await fetch(`/api/videos/${videoId}/upload/confirm`, {
        method: "POST",
      });

      if (!confirmRes.ok) {
        const err = await confirmRes.json();
        setState({ phase: "error", message: err.message ?? "Falha ao confirmar upload." });
        return;
      }

      setState({ phase: "done", videoId });

      setTimeout(() => {
        router.push(`/studio`);
      }, 1500);
    } catch (err) {
      setState({
        phase: "error",
        message: err instanceof Error ? err.message : "Erro desconhecido.",
      });
    }
  }

  if (state.phase === "idle") {
    return (
      <div
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex flex-col items-center justify-center gap-4",
          "border-2 border-dashed border-border rounded-[var(--radius-3)]",
          "p-16 cursor-pointer hover:border-ring hover:bg-muted/50 transition-colors",
        )}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      >
        <UploadIcon className="size-12 text-muted-foreground" />
        <div className="text-center">
          <p className="text-h3 text-foreground">Selecione um arquivo de vídeo</p>
          <p className="text-body-md text-muted-foreground mt-1">
            MP4, WebM, MOV · até 10 GB
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="sr-only"
          onChange={handleFileChange}
        />
      </div>
    );
  }

  if (state.phase === "uploading") {
    return (
      <div className="flex flex-col gap-6 p-8 border border-border rounded-[var(--radius-3)]">
        <p className="text-h3 text-foreground">Enviando vídeo...</p>
        <UploadProgress progress={state.progress} filename={state.file.name} />
      </div>
    );
  }

  if (state.phase === "processing") {
    return (
      <div className="flex flex-col items-center gap-4 p-8 border border-border rounded-[var(--radius-3)]">
        <div className="size-12 rounded-full border-4 border-border border-t-primary animate-spin" />
        <p className="text-body-lg text-foreground">Processando vídeo...</p>
        <p className="text-body-md text-muted-foreground">
          O vídeo está sendo analisado. Você pode fechar esta janela.
        </p>
      </div>
    );
  }

  if (state.phase === "done") {
    return (
      <div className="flex flex-col items-center gap-4 p-8 border border-border rounded-[var(--radius-3)]">
        <div className="size-12 rounded-full bg-success flex items-center justify-center">
          <span className="text-white text-xl">✓</span>
        </div>
        <p className="text-body-lg text-foreground">Upload concluído!</p>
        <p className="text-body-md text-muted-foreground">Redirecionando para o Studio...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 p-8 border border-destructive rounded-[var(--radius-3)]">
      <p className="text-body-lg text-destructive">Erro ao enviar</p>
      <p className="text-body-md text-muted-foreground">{state.message}</p>
      <button
        onClick={() => setState({ phase: "idle" })}
        className={cn(
          "px-4 h-9 rounded-[var(--radius-full)] bg-primary text-primary-foreground",
          "text-label-md hover:opacity-90 transition-opacity",
        )}
      >
        Tentar novamente
      </button>
    </div>
  );
}
