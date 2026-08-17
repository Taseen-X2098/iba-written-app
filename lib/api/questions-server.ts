import { createClient as createServerClient } from "@/lib/supabase/server";
import type { FetchQuestionsParams, FetchQuestionsResponse } from "./questions-shared";

export async function fetchQuestionsServer(
  params: FetchQuestionsParams
): Promise<FetchQuestionsResponse> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("get_question_bank_page", {
    p_page: params.page,
    p_page_size: params.limit,
    p_search: params.search || null,
    p_category: params.category || "all",
    p_difficulty: params.difficulty || "all",
    p_sort: params.sortBy || "newest",
    p_status: params.status || "all",
  });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const count = Number(rows[0]?.total_count ?? 0);
  const questions = rows.map(({ total_count: _count, ...question }: any) => question);
  const nextPage = params.page * params.limit < count ? params.page + 1 : null;
  return { data: questions, count, nextPage } as FetchQuestionsResponse;
}
