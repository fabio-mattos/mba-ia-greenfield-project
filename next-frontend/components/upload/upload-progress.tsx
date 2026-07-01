"use client";

import { cn } from "@/lib/utils";

interface UploadProgressProps {
  progress: number;
  filename: string;
}

export function UploadProgress({ progress, filename }: UploadProgressProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-body-md text-foreground truncate max-w-xs">{filename}</span>
        <span className="text-label-md text-muted-foreground shrink-0 ml-4">{progress}%</span>
      </div>
      <div className="w-full h-2 rounded-[var(--radius-full)] bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-[var(--radius-full)] bg-primary transition-all duration-200",
          )}
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
