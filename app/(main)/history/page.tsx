import { createClient } from "@/lib/supabase/server";
import { BookOpen, Calendar, Clock, Trophy } from "lucide-react";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { fetchHistoryServer } from "@/lib/api/history-server";
import Link from "next/link";
import { CATEGORY_LABELS } from "@/lib/types";
import { InProgressPin } from "@/components/history/in-progress-pin";
import { HistoryListClient } from "@/components/history/history-list-client";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedParams = await searchParams;
  const initialSearch = typeof resolvedParams.search === "string" ? resolvedParams.search : "";
  const initialCategory = typeof resolvedParams.category === "string" ? resolvedParams.category : "all";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const queryClient = new QueryClient();

  const activeSearch = initialSearch || undefined;
  const activeCategory = initialCategory || "all";

  await queryClient.prefetchInfiniteQuery({
    queryKey: [
      "history",
      {
        search: activeSearch,
        category: activeCategory,
      },
    ],
    queryFn: ({ pageParam = 1 }) =>
      fetchHistoryServer({
        page: pageParam as number,
        limit: 10,
        search: activeSearch,
        category: activeCategory as any,
      }),
    initialPageParam: 1,
  });
  return (
    <div className="px-4 py-6 lg:px-8 max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-8">
        <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center">
          <BookOpen size={20} className="text-brand-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Test History</h2>
          <p className="text-sm text-muted-foreground">
            Review your past submissions and AI feedback.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <InProgressPin />

        <HydrationBoundary state={dehydrate(queryClient)}>
          <HistoryListClient 
            initialSearch={initialSearch} 
            initialCategory={initialCategory} 
          />
        </HydrationBoundary>
      </div>
    </div>
  );
}
