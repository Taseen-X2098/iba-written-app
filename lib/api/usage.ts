import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getRedis } from "@/lib/redis";

export async function checkTestLimit(userId: string): Promise<boolean> {
  const supabase = await createAdminClient();

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
  const redis = getRedis();
  const lockKey = `lock:consumeTestSlot:${userId}`;
  
  // Acquire distributed lock (expire in 10s to prevent deadlocks)
  const lockAcquired = await redis.set(lockKey, "1", { nx: true, ex: 10 });
  if (!lockAcquired) {
    // If lock is held, it means another grading request for this user is processing right now.
    // Instead of waiting, we can either throw or retry. Throwing is safer for preventing abuse.
    console.warn(`Concurrent test slot consumption blocked for user ${userId}`);
    throw new Error("Please wait for your previous grading request to finish before submitting another.");
  }

  try {
    const supabase = await createAdminClient();

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
  } finally {
    // Release the lock
    await redis.del(lockKey);
  }
}
