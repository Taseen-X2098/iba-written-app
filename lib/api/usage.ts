import { createClient } from "@/lib/supabase/server";

export async function checkTestLimit(userId: string): Promise<boolean> {
  const supabase = await createClient();

  // 1. Check if user has an active subscription with tests remaining
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (sub && (sub.tests_remaining > 0 || sub.extra_tests_purchased > 0)) {
    return true;
  }

  // 2. Fallback to free tests
  const { data: profile } = await supabase
    .from("profiles")
    .select("free_tests_remaining")
    .eq("id", userId)
    .single();

  if (profile && profile.free_tests_remaining > 0) {
    return true;
  }

  return false;
}

export async function consumeTestSlot(userId: string): Promise<boolean> {
  const supabase = await createClient();

  // 1. Try to consume from active subscription (extra tests first, then plan tests)
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (sub) {
    if (sub.extra_tests_purchased > 0) {
      const { error } = await supabase
        .from("subscriptions")
        .update({ extra_tests_purchased: sub.extra_tests_purchased - 1 })
        .eq("id", sub.id);
      if (!error) return true;
    } else if (sub.tests_remaining > 0) {
      const { error } = await supabase
        .from("subscriptions")
        .update({ tests_remaining: sub.tests_remaining - 1 })
        .eq("id", sub.id);
      if (!error) return true;
    }
  }

  // 2. Try to consume free tests
  const { data: profile } = await supabase
    .from("profiles")
    .select("free_tests_remaining")
    .eq("id", userId)
    .single();

  if (profile && profile.free_tests_remaining > 0) {
    const { error } = await supabase
      .from("profiles")
      .update({ free_tests_remaining: profile.free_tests_remaining - 1 })
      .eq("id", userId);
    if (!error) return true;
  }

  return false;
}
