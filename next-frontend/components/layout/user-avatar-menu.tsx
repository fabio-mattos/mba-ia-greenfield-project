"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { UserIcon } from "@/components/icons/user-icon";
import { UploadIcon } from "@/components/icons/upload-icon";

interface UserAvatarMenuProps {
  isLoggedIn: boolean;
  email: string;
}

export function UserAvatarMenu({ isLoggedIn, email }: UserAvatarMenuProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (!isLoggedIn) {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/login"
          className={cn(
            "px-4 h-9 flex items-center rounded-[var(--radius-full)] border border-border",
            "text-label-md text-foreground hover:bg-muted transition-colors",
          )}
        >
          Entrar
        </Link>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "size-9 rounded-full bg-primary text-primary-foreground",
          "flex items-center justify-center",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        aria-label="Menu do usuário"
        aria-expanded={open}
      >
        <UserIcon className="size-5" />
      </button>

      {open && (
        <div
          className={cn(
            "absolute right-0 top-11 z-50 w-56 rounded-[var(--radius-2)] border border-border",
            "bg-card shadow-card py-1",
          )}
        >
          <div className="px-4 py-2 border-b border-border">
            <p className="text-label-md text-foreground truncate">{email}</p>
          </div>
          <Link
            href="/studio"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2 text-body-md text-foreground hover:bg-muted transition-colors"
          >
            Studio
          </Link>
          <Link
            href="/upload"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2 text-body-md text-foreground hover:bg-muted transition-colors"
          >
            <UploadIcon className="size-4" />
            Enviar vídeo
          </Link>
          <Link
            href="/subscriptions"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2 text-body-md text-foreground hover:bg-muted transition-colors"
          >
            Inscrições
          </Link>
          <div className="border-t border-border mt-1">
            <button
              onClick={handleLogout}
              className="w-full text-left px-4 py-2 text-body-md text-foreground hover:bg-muted transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
