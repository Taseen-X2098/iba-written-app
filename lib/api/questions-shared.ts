import type { Question, QuestionCategory, Difficulty } from "@/lib/types";

export interface FetchQuestionsParams {
  page: number;
  limit: number;
  search?: string;
  category?: QuestionCategory | "all";
  difficulty?: Difficulty | "all";
  sortBy?: "newest" | "oldest" | "difficulty";
}

export interface FetchQuestionsResponse {
  data: Question[];
  count: number;
  nextPage: number | null;
}

export async function fetchQuestionsQuery(
  supabase: any,
  { page, limit, search, category, difficulty, sortBy }: FetchQuestionsParams
): Promise<FetchQuestionsResponse> {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("questions")
    .select("*", { count: "exact" })
    .eq("is_active", true);

  if (search) {
    query = query.ilike("prompt", `%${search}%`);
  }

  if (category && category !== "all") {
    query = query.eq("category", category);
  }

  if (difficulty && difficulty !== "all") {
    query = query.eq("difficulty", difficulty);
  }

  if (sortBy === "newest") {
    query = query.order("created_at", { ascending: false });
  } else if (sortBy === "oldest") {
    query = query.order("created_at", { ascending: true });
  } else if (sortBy === "difficulty") {
    query = query.order("difficulty", { ascending: true });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  query = query.range(from, to);

  const { data, count, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const hasNextPage = count !== null && to < count - 1;

  return {
    data: data as Question[],
    count: count ?? 0,
    nextPage: hasNextPage ? page + 1 : null,
  };
}
