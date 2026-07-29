import type { Question, QuestionCategory, Difficulty } from "@/lib/types";

export interface FetchQuestionsParams {
  page: number;
  limit: number;
  search?: string;
  category?: QuestionCategory | "all";
  difficulty?: Difficulty | "all";
  sortBy?: "newest" | "oldest" | "difficulty";
  excludeTranslation?: boolean;
  status?: "all" | "done" | "not_done";
}

export interface FetchQuestionsResponse {
  data: Question[];
  count: number;
  nextPage: number | null;
}

export async function fetchQuestionsQuery(
  supabase: any,
  { page, limit, search, category, difficulty, sortBy, excludeTranslation, status = "all" }: FetchQuestionsParams
): Promise<FetchQuestionsResponse> {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from("questions")
    .select("*", { count: "exact" })
    .eq("is_active", true);

  if (excludeTranslation) {
    query = query.neq("category", "translation");
  }

  if (search) {
    query = query.ilike("prompt", `%${search}%`);
  }

  if (category && category !== "all") {
    query = query.eq("category", category);
  }

  if (difficulty && difficulty !== "all") {
    query = query.eq("difficulty", difficulty);
  }

  if (status !== "all") {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: subs } = await supabase.from("submissions").select("question_id").eq("user_id", user.id);
      const submittedIds = subs?.map((s: any) => s.question_id) || [];
      if (status === "done") {
        if (submittedIds.length > 0) {
          query = query.in("id", submittedIds);
        } else {
          query = query.eq("id", "00000000-0000-0000-0000-000000000000"); // impossible condition
        }
      } else if (status === "not_done") {
        if (submittedIds.length > 0) {
          query = query.not("id", "in", `(${submittedIds.join(",")})`);
        }
      }
    }
  }


  if (sortBy === "newest") {
    query = query.order("created_at", { ascending: false }).order("id");
  } else if (sortBy === "oldest") {
    query = query.order("created_at", { ascending: true }).order("id");
  } else if (sortBy === "difficulty") {
    query = query.order("difficulty", { ascending: true }).order("id");
  } else {
    query = query.order("created_at", { ascending: false }).order("id");
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
