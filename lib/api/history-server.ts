import { createClient } from "@/lib/supabase/server";
import { fetchHistoryQuery, type FetchHistoryParams } from "./history-shared";

export async function fetchHistoryServer(params: FetchHistoryParams) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  return fetchHistoryQuery(supabase, user.id, params);
}
