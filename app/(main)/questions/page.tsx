import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { fetchQuestionsServer } from "@/lib/api/questions-server";
import QuestionBankClient from "@/components/questions/question-bank";

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  
  const search = typeof params.search === "string" ? params.search : undefined;
  const category = (typeof params.category === "string" ? params.category : "all") as any;
  const difficulty = (typeof params.difficulty === "string" ? params.difficulty : "all") as any;
  const sortBy = (typeof params.sortBy === "string" ? params.sortBy : "newest") as any;
  const completionStatus = (typeof params.completionStatus === "string" ? params.completionStatus : "not_done") as any;

  const queryClient = new QueryClient();

  await queryClient.prefetchInfiniteQuery({
    queryKey: ["questions", { search, category, difficulty, sortBy, status: completionStatus }],
    queryFn: ({ pageParam = 1 }) =>
      fetchQuestionsServer({
        page: pageParam as number,
        limit: 10,
        search,
        category,
        difficulty,
        sortBy,
        status: completionStatus,
        excludeTranslation: true,
      }),
    initialPageParam: 1,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <QuestionBankClient
        initialSearch={search}
        initialCategory={category}
        initialDifficulty={difficulty}
        initialSortBy={sortBy}
        initialCompletionStatus={completionStatus}
      />
    </HydrationBoundary>
  );
}
