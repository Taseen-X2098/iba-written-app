import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api/errors";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const user = await requireApiUser();
    const supabase = await createClient();
    const [{ count }, { data: profile }] = await Promise.all([
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false),
      supabase.from("profiles").select("last_active_at").eq("id", user.id).single(),
    ]);

    const lastActive = profile?.last_active_at ? new Date(profile.last_active_at).getTime() : 0;
    if (Date.now() - lastActive > 15 * 60 * 1000) {
      await supabase.from("profiles").update({ last_active_at: new Date().toISOString() }).eq("id", user.id);
    }
    return NextResponse.json({ count: count ?? 0 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

