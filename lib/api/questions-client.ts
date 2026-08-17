import type { FetchQuestionsParams, FetchQuestionsResponse } from "./questions-shared";

export async function fetchQuestionsClient(
  params: FetchQuestionsParams
): Promise<FetchQuestionsResponse> {
  const search = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    category: params.category ?? "all",
    difficulty: params.difficulty ?? "all",
    sortBy: params.sortBy ?? "newest",
    status: params.status ?? "all",
  });
  if (params.search) search.set("search", params.search);
  const response = await fetch(`/api/questions?${search}`, { credentials: "same-origin" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Unable to load questions");
  return data as FetchQuestionsResponse;
}
