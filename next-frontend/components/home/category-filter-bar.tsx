"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";
import type { Category } from "@/lib/api/contracts";

interface CategoryFilterBarProps {
  categories: Category[];
}

export function CategoryFilterBar({ categories }: CategoryFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = searchParams.get("category") ?? "";

  function handleSelect(slug: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (slug) params.set("category", slug);
    else params.delete("category");
    router.push(`/?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
      <button
        onClick={() => handleSelect("")}
        className={cn(
          "shrink-0 px-3 h-8 rounded-[var(--radius-full)] text-label-md transition-colors whitespace-nowrap",
          active === ""
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground hover:bg-accent",
        )}
      >
        Todos
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => handleSelect(cat.slug)}
          className={cn(
            "shrink-0 px-3 h-8 rounded-[var(--radius-full)] text-label-md transition-colors whitespace-nowrap",
            active === cat.slug
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground hover:bg-accent",
          )}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );
}
