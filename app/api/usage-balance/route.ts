import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/api/errors";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const user = await requireApiUser();
    const supabase = await createClient();
    const now = new Date().toISOString();
    const [{ data: profile, error: profileError }, { data: subscriptions, error: subscriptionError }] = await Promise.all([
      supabase
        .from("profiles")
        .select("free_tests_remaining")
        .eq("id", user.id)
        .single(),
      supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .gt("expires_at", now)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
    if (profileError) throw profileError;
    if (subscriptionError) throw subscriptionError;

    return NextResponse.json(
      {
        profile: { free_tests_remaining: profile.free_tests_remaining },
        subscription: subscriptions?.[0] ?? null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
