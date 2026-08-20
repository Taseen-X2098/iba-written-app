"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sendPlanActivatedEmail, sendSlotsAddedEmail } from "@/lib/email/brevo";
import type { PlanType } from "@/lib/types";
import { z } from "zod";

const userIdSchema = z.string().uuid();
const planTypeSchema = z.enum(["plan_1", "plan_2", "plan_3"]);
const addSlotsSchema = z.object({
  userId: userIdSchema,
  amount: z.number().int().min(1).max(10_000),
  slotType: z.enum(["free", "extra"]),
});

function validationError(error: z.ZodError) {
  return error.issues[0]?.message || "Invalid request";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "An unexpected error occurred";
}

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
    const parsed = z.object({ userId: userIdSchema, planType: planTypeSchema }).safeParse({ userId, planType });
    if (!parsed.success) throw new Error(validationError(parsed.error));
    const input = parsed.data;
    // 1. Fetch existing extra tests to carry over
    const { data: oldSub } = await supabaseAdmin.from("subscriptions").select("extra_tests_purchased").eq("user_id", input.userId).eq("is_active", true).single();
    const carriedOverExtra = oldSub ? (oldSub.extra_tests_purchased || 0) : 0;

    // 2. Deactivate existing plans
    await supabaseAdmin
      .from("subscriptions")
      .update({ is_active: false })
      .eq("user_id", input.userId)
      .eq("is_active", true);

    // 3. Determine default tests based on plan
    let testsRemaining = 300;
    if (input.planType === "plan_3") testsRemaining = 0;

    // 4. Create new subscription
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabaseAdmin.from("subscriptions").insert({
      user_id: input.userId,
      plan_type: input.planType,
      tests_remaining: testsRemaining,
      extra_tests_purchased: carriedOverExtra,
      is_active: true,
      expires_at: expiresAt, // 30 days
    });

    if (error) throw error;
    await sendPlanActivatedEmail(input.userId, input.planType as PlanType, expiresAt);
    revalidatePath("/admin/users");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function adminDeactivateSubscription(userId: string) {
  try {
    await verifyAdmin();
    const parsedUserId = userIdSchema.safeParse(userId);
    if (!parsedUserId.success) throw new Error(validationError(parsedUserId.error));
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({ is_active: false })
      .eq("user_id", parsedUserId.data)
      .eq("is_active", true);

    if (error) throw error;
    revalidatePath("/admin/users");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function adminAddSlots(userId: string, amount: number, slotType: "free" | "extra") {
  try {
    await verifyAdmin();
    const parsed = addSlotsSchema.safeParse({ userId, amount, slotType });
    if (!parsed.success) throw new Error(validationError(parsed.error));
    const input = parsed.data;
    if (input.slotType === "free") {
      // Get current profile
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("free_tests_remaining")
        .eq("id", input.userId)
        .single();
        
      if (!profile) throw new Error("Profile not found");

      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ free_tests_remaining: (profile.free_tests_remaining || 0) + input.amount })
        .eq("id", input.userId);

      if (error) throw error;
    } else {
      // Get active subscription
      const { data: sub } = await supabaseAdmin
        .from("subscriptions")
        .select("id, extra_tests_purchased")
        .eq("user_id", input.userId)
        .eq("is_active", true)
        .single();

      if (!sub) throw new Error("No active subscription found to add extra slots");

      const { error } = await supabaseAdmin
        .from("subscriptions")
        .update({ extra_tests_purchased: (sub.extra_tests_purchased || 0) + input.amount })
        .eq("id", sub.id);

      if (error) throw error;
    }
    
    await sendSlotsAddedEmail(input.userId, input.amount, input.slotType);
    revalidatePath("/admin/users");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: errorMessage(error) };
  }
}
