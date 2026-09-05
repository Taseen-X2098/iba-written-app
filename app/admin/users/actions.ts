"use server";

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { sendSlotsAddedEmail } from "@/lib/email/brevo";
import { wakeGradingWorker } from "@/lib/grading/jobs";
import { deliverAccountApprovalNotifications } from "@/lib/notifications/account-approval";
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
  return { supabase, user };
}

const magnusApprovalInputSchema = z.array(userIdSchema).min(1).max(2_000);

async function wakeMagnusEmailWorker() {
  const woke = await wakeGradingWorker();
  if (!woke) {
    // The durable queue and periodic worker poll still guarantee retries, but
    // this warning makes a missing worker URL/secret visible in web logs.
    console.warn("Magnus welcome email queued, but the background worker could not be woken immediately.");
  }
}

export async function approveMagnusStudents(userIds: string[]) {
  try {
    const { supabase } = await verifyAdmin();
    const parsed = magnusApprovalInputSchema.safeParse(userIds);
    if (!parsed.success) throw new Error(validationError(parsed.error));
    const deduplicated = [...new Set(parsed.data)];
    if (deduplicated.length > 500) throw new Error("Select no more than 500 students at once");

    // Use the signed-in server client so the SECURITY DEFINER RPC can verify
    // auth.uid(); entitlement changes remain atomic inside the database.
    const { data, error } = await supabase.rpc("approve_magnus_students", {
      p_user_ids: deduplicated,
    });
    if (error) throw error;

    const newlyApproved = (data ?? []).map((row: { approved_user_id: string }) => row.approved_user_id);
    if (newlyApproved.length > 0) await wakeMagnusEmailWorker();
    revalidatePath("/admin/users");
    return {
      success: true as const,
      newlyApproved,
      alreadyApproved: deduplicated.filter((userId) => !newlyApproved.includes(userId)),
    };
  } catch (error: unknown) {
    return { success: false as const, error: errorMessage(error) };
  }
}

export async function disableMagnusStudent(userId: string) {
  try {
    const { supabase } = await verifyAdmin();
    const parsedUserId = userIdSchema.safeParse(userId);
    if (!parsedUserId.success) throw new Error(validationError(parsedUserId.error));

    const { data, error } = await supabase.rpc("disable_magnus_student", {
      p_user_id: parsedUserId.data,
    });
    if (error) throw error;
    if (!data) throw new Error("Student does not have an approved Magnus status");

    revalidatePath("/admin/users");
    return { success: true as const };
  } catch (error: unknown) {
    return { success: false as const, error: errorMessage(error) };
  }
}

export async function retryMagnusWelcomeEmail(userId: string) {
  try {
    await verifyAdmin();
    const supabaseAdmin = createAdminClient();
    const parsedUserId = userIdSchema.safeParse(userId);
    if (!parsedUserId.success) throw new Error(validationError(parsedUserId.error));

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("magnus_memberships")
      .select("status")
      .eq("user_id", parsedUserId.data)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (membership?.status !== "approved") throw new Error("Student is not an approved Magnus student");

    const { data: job, error: jobError } = await supabaseAdmin
      .from("retention_notification_jobs")
      .select("id, status, email_sent_at, push_sent_at")
      .eq("user_id", parsedUserId.data)
      .eq("kind", "magnus_approved")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (jobError) throw jobError;
    if (!job) {
      const { error: insertError } = await supabaseAdmin
        .from("retention_notification_jobs")
        .insert({
          user_id: parsedUserId.data,
          kind: "magnus_approved",
          event_key: `magnus-approved:${parsedUserId.data}`,
          scheduled_for: new Date().toISOString(),
          requires_email: true,
          next_attempt_at: new Date().toISOString(),
        });
      if (insertError) throw insertError;
      await wakeMagnusEmailWorker();
      revalidatePath("/admin/users");
      return { success: true as const };
    }
    if (job.email_sent_at && job.push_sent_at) {
      throw new Error("The Magnus welcome email and push were already delivered");
    }
    if (!["failed", "cancelled", "completed"].includes(job.status)) {
      throw new Error("The Magnus welcome delivery is already queued or running");
    }

    const { error } = await supabaseAdmin
      .from("retention_notification_jobs")
      .update({
        status: "queued",
        attempt_count: 0,
        claimed_by: null,
        claimed_at: null,
        next_attempt_at: new Date().toISOString(),
        last_error: null,
        completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    if (error) throw error;
    await wakeMagnusEmailWorker();
    revalidatePath("/admin/users");
    return { success: true as const };
  } catch (error: unknown) {
    return { success: false as const, error: errorMessage(error) };
  }
}

export async function adminActivateSubscription(userId: string, planType: string) {
  try {
    await verifyAdmin();
    const supabaseAdmin = createAdminClient();
    const parsed = z.object({ userId: userIdSchema, planType: planTypeSchema }).safeParse({ userId, planType });
    if (!parsed.success) throw new Error(validationError(parsed.error));
    const input = parsed.data;
    const { data, error } = await supabaseAdmin.rpc("activate_subscription_plan", {
      p_user_id: input.userId,
      p_plan_type: input.planType,
      p_transition: "replace",
      p_expected_subscription_id: null,
    });
    if (error) throw error;

    const subscription = (Array.isArray(data) ? data[0] : data) as {
      activated_subscription_id: string;
      activated_expires_at: string;
      activated_plan_type: PlanType;
    } | undefined;
    if (!subscription) throw new Error("Plan activation did not return a subscription");

    await deliverAccountApprovalNotifications({
      userId: input.userId,
      planType: subscription.activated_plan_type,
      expiresAt: subscription.activated_expires_at,
      subscriptionId: subscription.activated_subscription_id,
    });
    revalidatePath("/admin/users");
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function adminDeactivateSubscription(userId: string) {
  try {
    await verifyAdmin();
    const supabaseAdmin = createAdminClient();
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
    const supabaseAdmin = createAdminClient();
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
        .gt("expires_at", new Date().toISOString())
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
