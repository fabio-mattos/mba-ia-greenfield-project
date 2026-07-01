import type { Metadata } from "next";
import Link from "next/link";

import { upstream } from "@/lib/api/upstream";
import type { PaginatedVideos, Category } from "@/lib/api/contracts";
import { Header } from "@/components/layout/header";
import { CategoryFilterBar } from "@/components/home/category-filter-bar";
import { VideoGrid } from "@/components/home/video-grid";

export const metadata: Metadata = {
  title: "StreamTube — Compartilhe seus vídeos",
};

interface HomePageProps {
  searchParams: Promise<{ search?: string; category?: string; page?: string }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const { search, category, page } = await searchParams;
  const currentPage = parseInt(page ?? "1", 10);

  const query: Record<string, string> = { page: String(currentPage), limit: "24" };
  if (search) query.search = search;
  if (category) query.category = category;

  const [videosRes, categoriesRes] = await Promise.all([
    upstream.GET("/videos", { params: { query } }),
    upstream.GET("/categories", {}),
  ]);

  const paginated = (videosRes.data as PaginatedVideos) ?? {
    data: [],
    total: 0,
    page: 1,
    limit: 24,
    total_pages: 0,
  };
  const categories = (categoriesRes.data as Category[]) ?? [];

  function buildPageUrl(p: number) {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (category) params.set("category", category);
    params.set("page", String(p));
    return `/?${params.toString()}`;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 container mx-auto max-w-7xl px-4 py-6 flex flex-col gap-6">
        {search && (
          <p className="text-body-md text-muted-foreground">
            Resultados para: <strong className="text-foreground">&quot;{search}&quot;</strong>
            {" "}— {paginated.total.toLocaleString("pt-BR")} vídeos
          </p>
        )}

        <CategoryFilterBar categories={categories} />

        <VideoGrid videos={paginated.data} />

        {paginated.total_pages > 1 && (
          <nav className="flex items-center justify-center gap-2 pt-4">
            {currentPage > 1 && (
              <Link
                href={buildPageUrl(currentPage - 1)}
                className="px-4 h-9 flex items-center rounded-[var(--radius-full)] border border-border text-label-md text-foreground hover:bg-muted transition-colors"
              >
                Anterior
              </Link>
            )}
            <span className="text-body-md text-muted-foreground">
              {currentPage} / {paginated.total_pages}
            </span>
            {currentPage < paginated.total_pages && (
              <Link
                href={buildPageUrl(currentPage + 1)}
                className="px-4 h-9 flex items-center rounded-[var(--radius-full)] border border-border text-label-md text-foreground hover:bg-muted transition-colors"
              >
                Próxima
              </Link>
            )}
          </nav>
        )}
      </main>
    </div>
  );
}
