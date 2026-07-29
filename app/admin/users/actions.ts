"use server";

import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function adminActivateSubscription(userId: string, planType: string) {
  try {
    // 1. Deactivate existing plans
    await supabaseAdmin
      .from("subscriptions")
      .update({ is_active: false })
      .eq("user_id", userId)
      .eq("is_active", true);

    // 2. Determine default tests based on plan
    let testsRemaining = 300;
    if (planType === "plan_3") testsRemaining = 0;

    // 3. Create new subscription
    const { error } = await supabaseAdmin.from("subscriptions").insert({
      user_id: userId,
      plan_type: planType,
      tests_remaining: testsRemaining,
      extra_tests_purchased: 0,
      is_active: true,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    });

    if (error) throw error;
    revalidatePath("/admin/users");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function adminDeactivateSubscription(userId: string) {
  try {
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({ is_active: false })
      .eq("user_id", userId)
      .eq("is_active", true);

    if (error) throw error;
    revalidatePath("/admin/users");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function adminAddSlots(userId: string, amount: number, slotType: "free" | "extra") {
  try {
    if (slotType === "free") {
      // Get current profile
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("free_tests_remaining")
        .eq("id", userId)
        .single();
        
      if (!profile) throw new Error("Profile not found");

      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ free_tests_remaining: (profile.free_tests_remaining || 0) + amount })
        .eq("id", userId);

      if (error) throw error;
    } else {
      // Get active subscription
      const { data: sub } = await supabaseAdmin
        .from("subscriptions")
        .select("id, extra_tests_purchased")
        .eq("user_id", userId)
        .eq("is_active", true)
        .single();

      if (!sub) throw new Error("No active subscription found to add extra slots");

      const { error } = await supabaseAdmin
        .from("subscriptions")
        .update({ extra_tests_purchased: (sub.extra_tests_purchased || 0) + amount })
        .eq("id", sub.id);

      if (error) throw error;
    }
    
    revalidatePath("/admin/users");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
