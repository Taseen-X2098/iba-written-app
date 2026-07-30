"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function verifyAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) throw new Error("Forbidden: Admin access required");
}

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function adminActivateSubscription(userId: string, planType: string) {
  try {
    await verifyAdmin();
    // 1. Fetch existing extra tests to carry over
    const { data: oldSub } = await supabaseAdmin.from("subscriptions").select("extra_tests_purchased").eq("user_id", userId).eq("is_active", true).single();
    const carriedOverExtra = oldSub ? (oldSub.extra_tests_purchased || 0) : 0;

    // 2. Deactivate existing plans
    await supabaseAdmin
      .from("subscriptions")
      .update({ is_active: false })
      .eq("user_id", userId)
      .eq("is_active", true);

    // 3. Determine default tests based on plan
    let testsRemaining = 300;
    if (planType === "plan_3") testsRemaining = 0;

    // 4. Create new subscription
    const { error } = await supabaseAdmin.from("subscriptions").insert({
      user_id: userId,
      plan_type: planType,
      tests_remaining: testsRemaining,
      extra_tests_purchased: carriedOverExtra,
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
    await verifyAdmin();
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
    await verifyAdmin();
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
