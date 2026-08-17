import type { Difficulty, Question, QuestionCategory } from "@/lib/types";

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

