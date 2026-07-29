import { createClient } from "@/lib/supabase/client";
import { fetchHistoryQuery, type FetchHistoryParams, type FetchHistoryResponse } from "./history-shared";

export async function fetchHistoryClient(
  params: FetchHistoryParams
): Promise<FetchHistoryResponse> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  
  return fetchHistoryQuery(supabase, user.id, params);
}
