"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import { SearchIcon } from "@/components/icons/search-icon";

export function SearchBar({ className }: { className?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = React.useState(searchParams.get("search") ?? "");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (value.trim()) params.set("search", value.trim());
    router.push(`/?${params.toString()}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn("flex items-center gap-0 max-w-lg w-full", className)}
    >
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Pesquisar"
        className={cn(
          "flex-1 h-10 px-4 rounded-l-[var(--radius-full)] border border-border",
          "bg-background text-foreground text-body-md",
          "placeholder:text-muted-foreground",
          "focus:outline-none focus:border-ring",
        )}
      />
      <button
        type="submit"
        aria-label="Pesquisar"
        className={cn(
          "h-10 px-4 rounded-r-[var(--radius-full)] border border-l-0 border-border",
          "bg-muted hover:bg-accent transition-colors",
          "flex items-center justify-center",
        )}
      >
        <SearchIcon className="size-4 text-foreground" />
      </button>
    </form>
  );
}
