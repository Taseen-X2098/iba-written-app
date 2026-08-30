import { getAdminMessaging } from "@/lib/firebase-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export type PushNotificationRecord = {
  id?: string;
  user_id: string;
  exam_id?: string | null;
  type?: string;
  title: string;
  message: string;
  action_url?: string | null;
};

export type PushDeliveryResult = {
  tokens: number;
  delivered: number;
  failed: number;
  transientFailures: number;
  skipped: boolean;
};

const PERMANENT_FCM_ERRORS = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

function targetUrl(notification: PushNotificationRecord) {
  if (notification.action_url) return notification.action_url;
  if (
    notification.exam_id
    && (notification.type === "exam_available" || notification.type === "exam_reminder")
  ) {
    return `/exams/${notification.exam_id}`;
  }
  if (notification.exam_id && notification.type === "results_published") {
    return `/exams/${notification.exam_id}/results`;
  }
  return "/notifications";
}

export async function deliverPushNotification(
  notification: PushNotificationRecord,
  supabaseAdmin = createAdminClient(),
): Promise<PushDeliveryResult> {
  const firebaseMessaging = getAdminMessaging();
  if (!firebaseMessaging) {
    return { tokens: 0, delivered: 0, failed: 0, transientFailures: 0, skipped: true };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("fcm_tokens")
    .eq("id", notification.user_id)
    .single();
  if (profileError) throw profileError;

  const tokens = Array.isArray(profile?.fcm_tokens)
    ? profile.fcm_tokens
        .filter((token): token is string => (
          typeof token === "string" && token.length > 0 && token.length <= 4_096
        ))
        .slice(0, 500)
    : [];

  if (tokens.length === 0) {
    return { tokens: 0, delivered: 0, failed: 0, transientFailures: 0, skipped: false };
  }

  const response = await firebaseMessaging.sendEachForMulticast({
    // A data-only payload is displayed exactly once by our service worker in
    // the background and by MainShell in the foreground.
    data: {
      title: notification.title || "IBA Written App",
      body: notification.message.slice(0, 500),
      url: targetUrl(notification),
      tag: notification.id
        ? `notification:${notification.id}`
        : `notification:${notification.type ?? "general"}`,
    },
    webpush: {
      headers: { Urgency: "high" },
    },
    tokens,
  });

  const permanentlyInvalidTokens: string[] = [];
  let transientFailures = 0;
  response.responses.forEach((result, index) => {
    if (result.success) return;
    const code = result.error?.code ?? "";
    if (PERMANENT_FCM_ERRORS.has(code)) {
      permanentlyInvalidTokens.push(tokens[index]);
    } else {
      transientFailures += 1;
    }
  });

  if (permanentlyInvalidTokens.length > 0) {
    const validTokens = tokens.filter((token) => !permanentlyInvalidTokens.includes(token));
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ fcm_tokens: validTokens })
      .eq("id", notification.user_id);
    if (error) console.error("Unable to remove invalid FCM tokens", error);
  }

  return {
    tokens: tokens.length,
    delivered: response.successCount,
    failed: response.failureCount,
    transientFailures,
    skipped: false,
  };
}
