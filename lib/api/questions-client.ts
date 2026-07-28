import { createClient } from "@/lib/supabase/client";
import { fetchQuestionsQuery, type FetchQuestionsParams, type FetchQuestionsResponse } from "./questions-shared";

export async function fetchQuestionsClient(
  params: FetchQuestionsParams
): Promise<FetchQuestionsResponse> {
  const supabase = createClient();
  return fetchQuestionsQuery(supabase, params);
}
