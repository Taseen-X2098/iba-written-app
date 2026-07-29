"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchHistoryClient } from "@/lib/api/history-client";
import { Search, Filter, Loader2, BookOpen, ChevronDown } from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/types";
import { HistoryClientCard } from "./history-client-card";
import Link from "next/link";

interface Props {
  initialSearch?: string;
  initialCategory: string;
}

export function HistoryListClient({
  initialSearch = "",
  initialCategory,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Local state for immediate UI feedback before URL sync
  const [search, setSearch] = useState(initialSearch);
  const [category, setCategory] = useState(initialCategory);

  // Sync state to URL without infinite loops
  const syncToUrl = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    let changed = false;

    if (search.trim() !== (params.get("search") || "")) {
      if (search.trim()) params.set("search", search.trim());
      else params.delete("search");
      changed = true;
    }
    if (category !== (params.get("category") || "all")) {
      if (category !== "all") params.set("category", category);
      else params.delete("category");
      changed = true;
    }

    if (changed) {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [search, category, pathname, router, searchParams]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      syncToUrl();
    }
  };

  // When filters change, sync to URL immediately
  useEffect(() => {
    syncToUrl();
  }, [category, syncToUrl]);

  // Query uses URL params to match hydration key
  const activeSearch = searchParams.get("search") || undefined;
  const activeCategory = searchParams.get("category") || "all";

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status,
  } = useInfiniteQuery({
    queryKey: [
      "history",
      {
        search: activeSearch,
        category: activeCategory,
      },
    ],
    queryFn: ({ pageParam = 1 }) =>
      fetchHistoryClient({
        page: pageParam as number,
        limit: 10,
        search: activeSearch,
        category: activeCategory as any,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    staleTime: 60 * 1000,
  });

  // Intersection Observer for Infinite Scroll
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.5 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const submissions = data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div>
      {/* Filters and Search */}
      <div className="space-y-3 mb-6">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              onBlur={syncToUrl}
              placeholder="Search past questions..."
              className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={syncToUrl}
            className="rounded-lg bg-brand-600 px-4 py-2.5 sm:py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors w-full sm:w-auto"
          >
            Search
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap gap-2">
          <div className="relative w-full lg:w-auto">
            <Filter size={14} className="text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-card border border-border rounded-lg pl-9 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 text-foreground cursor-pointer appearance-none w-full"
            >
              <option value="all">All Topics</option>
              {Object.entries(CATEGORY_LABELS)
                .filter(([key]) => key !== "translation")
                .map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="space-y-4">
        {status === "pending" ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 text-brand-500 animate-spin" />
          </div>
        ) : status === "error" ? (
          <div className="text-center py-12 text-destructive">
            Error loading history.
          </div>
        ) : submissions.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-2xl bg-card/50">
            <BookOpen size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-sm">No tests found matching your criteria.</p>
            <Link 
              href="/questions" 
              className="inline-block mt-4 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Go to Question Bank →
            </Link>
          </div>
        ) : (
          submissions.map((sub: any) => (
            <HistoryClientCard key={sub.id} sub={sub} />
          ))
        )}
      </div>

      {/* Infinite Scroll Trigger */}
      <div ref={observerTarget} className="py-6 flex justify-center">
        {isFetchingNextPage && <Loader2 className="h-5 w-5 text-brand-500 animate-spin" />}
      </div>
    </div>
  );
}
