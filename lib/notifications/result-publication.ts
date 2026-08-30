import { sendExamResultsPublishedEmails } from "@/lib/email/brevo";
import {
  deliverPushNotification,
  type PushDeliveryResult,
  type PushNotificationRecord,
} from "@/lib/notifications/push";
import { createAdminClient } from "@/lib/supabase/admin";

const NOTIFICATION_PAGE_SIZE = 1_000;
const PUSH_BATCH_SIZE = 20;

type ResultNotification = PushNotificationRecord & {
  id: string;
  exam_id: string;
  type: "results_published";
};

type PushSummary = {
  delivered: number;
  failed: number;
  transientFailures: number;
  recipientsWithoutTokens: number;
  skipped: number;
};

const emptyPushSummary = (): PushSummary => ({
  delivered: 0,
  failed: 0,
  transientFailures: 0,
  recipientsWithoutTokens: 0,
  skipped: 0,
});

const emptyEmailSummary = () => ({
  recipients: 0,
  delivered: 0,
  failed: 0,
  skipped: false,
});

async function loadResultNotifications(
  admin: ReturnType<typeof createAdminClient>,
  examId: string,
  resultsVersion: number,
) {
  const notifications: ResultNotification[] = [];
  const dedupeKey = `exam-results:${examId}:v${resultsVersion}`;

  for (let start = 0; ; start += NOTIFICATION_PAGE_SIZE) {
    const { data, error } = await admin
      .from("notifications")
      .select("id, user_id, exam_id, type, title, message, action_url")
      .eq("exam_id", examId)
      .eq("dedupe_key", dedupeKey)
      .order("created_at", { ascending: true })
      .range(start, start + NOTIFICATION_PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data ?? []) as ResultNotification[];
    notifications.push(...page);
    if (page.length < NOTIFICATION_PAGE_SIZE) break;
  }

  return notifications;
}

async function deliverResultPushes(
  notifications: ResultNotification[],
  admin: ReturnType<typeof createAdminClient>,
) {
  const summary = emptyPushSummary();

  for (let index = 0; index < notifications.length; index += PUSH_BATCH_SIZE) {
    const batch = notifications.slice(index, index + PUSH_BATCH_SIZE);
    const outcomes = await Promise.all(batch.map(async (notification) => {
      try {
        return await deliverPushNotification(notification, admin);
      } catch (error) {
        console.error("Unable to send result-publication push", {
          notificationId: notification.id,
          error,
        });
        return null;
      }
    }));

    for (const outcome of outcomes) {
      if (!outcome) {
        summary.failed += 1;
        continue;
      }
      const result: PushDeliveryResult = outcome;
      summary.delivered += result.delivered;
      summary.failed += result.failed;
      summary.transientFailures += result.transientFailures;
      if (result.skipped) summary.skipped += 1;
      else if (result.tokens === 0) summary.recipientsWithoutTokens += 1;
    }
  }

  return summary;
}

/**
 * Result publication is the authoritative delivery point. The database RPC
 * has already created durable in-app rows; this function sends the matching
 * system pushes and emails without allowing an external provider failure to
 * roll back (or make an administrator retry) the committed publication.
 */
export async function deliverResultPublicationNotifications(input: {
  examId: string;
  resultsVersion: number;
}) {
  const admin = createAdminClient();

  try {
    const [{ data: exam, error: examError }, notifications] = await Promise.all([
      admin.from("exams").select("id, title").eq("id", input.examId).single(),
      loadResultNotifications(admin, input.examId, input.resultsVersion),
    ]);
    if (examError || !exam) throw examError ?? new Error("Published exam not found");

    const userIds = [...new Set(notifications.map((notification) => notification.user_id))];
    const [push, email] = await Promise.all([
      deliverResultPushes(notifications, admin),
      sendExamResultsPublishedEmails(
        { id: exam.id, title: exam.title },
        userIds,
      ),
    ]);

    return {
      recipients: userIds.length,
      push,
      email,
      preparationFailed: false,
    };
  } catch (error) {
    console.error("Unable to prepare result-publication notifications", error);
    return {
      recipients: 0,
      push: emptyPushSummary(),
      email: emptyEmailSummary(),
      preparationFailed: true,
    };
  }
}
