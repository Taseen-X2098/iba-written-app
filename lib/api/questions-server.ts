import { createClient as createServerClient } from "@/lib/supabase/server";
import { fetchQuestionsQuery, type FetchQuestionsParams, type FetchQuestionsResponse } from "./questions-shared";

export async function fetchQuestionsServer(
  params: FetchQuestionsParams
): Promise<FetchQuestionsResponse> {
  const supabase = await createServerClient();
  return fetchQuestionsQuery(supabase, params);
}
