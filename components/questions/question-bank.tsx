"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchQuestionsClient } from "@/lib/api/questions-client";
import { BookOpen, Search, Filter, Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { CATEGORY_LABELS, DIFFICULTY_LABELS } from "@/lib/types";

interface Props {
  initialSearch?: string;
  initialCategory: string;
  initialDifficulty: string;
  initialSortBy: string;
}

export default function QuestionBankClient({
  initialSearch = "",
  initialCategory,
  initialDifficulty,
  initialSortBy,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Local state for immediate UI feedback before URL sync
  const [search, setSearch] = useState(initialSearch);
  const [category, setCategory] = useState(initialCategory);
  const [difficulty, setDifficulty] = useState(initialDifficulty);
  const [sortBy, setSortBy] = useState(initialSortBy);

  // Sync state to URL without infinite loops (following URL syncing KI)
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
    if (difficulty !== (params.get("difficulty") || "all")) {
      if (difficulty !== "all") params.set("difficulty", difficulty);
      else params.delete("difficulty");
      changed = true;
    }
    if (sortBy !== (params.get("sortBy") || "newest")) {
      if (sortBy !== "newest") params.set("sortBy", sortBy);
      else params.delete("sortBy");
      changed = true;
    }

    if (changed) {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [search, category, difficulty, sortBy, pathname, router, searchParams]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      syncToUrl();
    }
  };

  // When filters change, sync to URL immediately
  useEffect(() => {
    syncToUrl();
  }, [category, difficulty, sortBy, syncToUrl]);

  // Query uses URL params to match hydration key
  const activeSearch = searchParams.get("search") || undefined;
  const activeCategory = searchParams.get("category") || "all";
  const activeDifficulty = searchParams.get("difficulty") || "all";
  const activeSortBy = searchParams.get("sortBy") || "newest";

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status,
  } = useInfiniteQuery({
    queryKey: [
      "questions",
      {
        search: activeSearch,
        category: activeCategory,
        difficulty: activeDifficulty,
        sortBy: activeSortBy,
      },
    ],
    queryFn: ({ pageParam = 1 }) =>
      fetchQuestionsClient({
        page: pageParam as number,
        limit: 10,
        search: activeSearch,
        category: activeCategory as any,
        difficulty: activeDifficulty as any,
        sortBy: activeSortBy as any,
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

  const questions = data?.pages.flatMap((page) => page.data) ?? [];
  const totalCount = data?.pages[0]?.count ?? 0;

  return (
    <div className="px-4 py-6 lg:px-8 max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center">
          <BookOpen size={20} className="text-brand-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Question Bank</h2>
          <p className="text-sm text-muted-foreground">
            Practice over {totalCount > 0 ? totalCount : "many"} questions by topic.
          </p>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="space-y-3 mb-6">
        <div className="flex gap-2">
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
              placeholder="Search prompts..."
              className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={syncToUrl}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
          >
            Search
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative flex items-center border border-border rounded-lg bg-card px-3">
            <Filter size={14} className="text-muted-foreground mr-2 shrink-0" />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-transparent py-2 text-sm focus:outline-none text-foreground cursor-pointer pr-4 appearance-none"
            >
              <option value="all">All Topics</option>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="relative flex items-center border border-border rounded-lg bg-card px-3">
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className="bg-transparent py-2 text-sm focus:outline-none text-foreground cursor-pointer pr-4 appearance-none"
            >
              <option value="all">All Difficulties</option>
              {Object.entries(DIFFICULTY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="relative flex items-center border border-border rounded-lg bg-card px-3 ml-auto">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent py-2 text-sm focus:outline-none text-foreground cursor-pointer pr-4 appearance-none"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="difficulty">By Difficulty</option>
            </select>
          </div>
        </div>
      </div>

      {/* List */}
      {status === "pending" ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 text-brand-500 animate-spin" />
        </div>
      ) : status === "error" ? (
        <div className="text-center py-12 text-destructive">
          Error loading questions.
        </div>
      ) : questions.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-2xl">
          <BookOpen size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-sm">No questions found matching your criteria.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {questions.map((q) => (
            <Link
              href={`/test/${q.id}`}
              key={q.id}
              className="block group rounded-xl border border-border bg-card p-5 hover:border-brand-300 hover:shadow-md hover:shadow-brand-100 transition-all"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-xs font-medium">
                    {CATEGORY_LABELS[q.category] || q.category}
                  </span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                      ${
                        q.difficulty === "easy"
                          ? "bg-green-50 text-green-700"
                          : q.difficulty === "medium"
                          ? "bg-yellow-50 text-yellow-700"
                          : "bg-red-50 text-red-700"
                      }`}
                  >
                    {DIFFICULTY_LABELS[q.difficulty] || q.difficulty}
                  </span>
                </div>
                <div className="text-sm font-semibold text-foreground shrink-0 bg-muted px-2 py-1 rounded-md">
                  {q.marks} Marks
                </div>
              </div>

              <p className="text-sm text-foreground line-clamp-3 leading-relaxed mb-4">
                {q.prompt}
              </p>

              {q.source && (
                <p className="text-xs text-muted-foreground mb-4 font-mono">
                  Source: {q.source}
                </p>
              )}

              <div className="flex items-center text-xs font-medium text-brand-600 group-hover:text-brand-700 transition-colors">
                Start Practice <ArrowRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Infinite Scroll Trigger */}
      <div ref={observerTarget} className="py-6 flex justify-center">
        {isFetchingNextPage && <Loader2 className="h-5 w-5 text-brand-500 animate-spin" />}
      </div>
    </div>
  );
}
