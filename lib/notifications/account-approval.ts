import { sendPlanActivatedEmail } from "@/lib/email/brevo";
import { deliverPushNotification, type PushDeliveryResult } from "@/lib/notifications/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLAN_CONFIG, type PlanType } from "@/lib/types";

type AccountApprovalInput = {
  userId: string;
  planType: PlanType;
  expiresAt: string;
  subscriptionId: string;
};

const emptyPushResult = (): PushDeliveryResult => ({
  tokens: 0,
  delivered: 0,
  failed: 0,
  transientFailures: 0,
  skipped: true,
});

async function ensureAccountApprovalNotification(input: AccountApprovalInput) {
  const admin = createAdminClient();
  const plan = PLAN_CONFIG[input.planType];
  const dedupeKey = `account-approved:${input.subscriptionId}`;
  const record = {
    user_id: input.userId,
    exam_id: null,
    type: "account_approved" as const,
    title: "Your plan is active",
    message: `Your ${plan.name} has been approved and activated. You can start using it now.`,
    details: null,
    action_url: "/subscription",
    dedupe_key: dedupeKey,
  };
  const { data, error } = await admin
    .from("notifications")
    .upsert(record, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
    .select("id, user_id, exam_id, type, title, message, action_url")
    .maybeSingle();
  if (error) throw error;
  if (data) return { admin, notification: data };

  const { data: existing, error: existingError } = await admin
    .from("notifications")
    .select("id, user_id, exam_id, type, title, message, action_url")
    .eq("user_id", input.userId)
    .eq("dedupe_key", dedupeKey)
    .single();
  if (existingError) throw existingError;
  return { admin, notification: existing };
}

/**
 * Account activation is one user-visible event, so email, in-app, and browser
 * delivery start together. Provider failures stay isolated from fulfillment:
 * a paid/approved subscription must never be rolled back by a notification.
 */
export async function deliverAccountApprovalNotifications(input: AccountApprovalInput) {
  const emailPromise = sendPlanActivatedEmail(input.userId, input.planType, input.expiresAt);
  let push = emptyPushResult();

  try {
    const { admin, notification } = await ensureAccountApprovalNotification(input);
    push = await deliverPushNotification(notification, admin);
    if (push.skipped || push.transientFailures > 0) {
      console.error("Account-approval push was not fully delivered", {
        userId: input.userId,
        subscriptionId: input.subscriptionId,
        push,
      });
    }
  } catch (error) {
    console.error("Unable to create or send account-approval push", {
      userId: input.userId,
      subscriptionId: input.subscriptionId,
      error,
    });
  }

  const email = await emailPromise;
  return { push, email };
}
