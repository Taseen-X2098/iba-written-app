import type { QuestionCategory } from "@/lib/types";

export interface FetchHistoryParams {
  page: number;
  limit: number;
  search?: string;
  category?: QuestionCategory | "all";
}

export interface FetchHistoryResponse {
  data: any[];
  count: number;
  nextPage: number | null;
}

export async function fetchHistoryQuery(
  supabase: any,
  userId: string,
  { page, limit, search, category }: FetchHistoryParams
): Promise<FetchHistoryResponse> {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("submissions")
    .select(`
      id,
      created_at,
      time_taken_seconds,
      grading_result,
      edited_text,
      ocr_text,
      questions!inner (
        id,
        prompt,
        category,
        marks
      )
    `, { count: "exact" })
    .eq("user_id", userId);

  if (search) {
    query = query.ilike("questions.prompt", `%${search}%`);
  }

  if (category && category !== "all") {
    query = query.eq("questions.category", category);
  }

  query = query.order("created_at", { ascending: false }).order("id");
  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const hasNextPage = count !== null && to < count - 1;

  return {
    data: data || [],
    count: count ?? 0,
    nextPage: hasNextPage ? page + 1 : null,
  };
}
