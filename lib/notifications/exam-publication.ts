import {
  sendExamPublishedEmails,
  type PublishedExamEmailDetails,
} from "@/lib/email/brevo";
import {
  deliverPushNotification,
  type PushDeliveryResult,
  type PushNotificationRecord,
} from "@/lib/notifications/push";
import { createAdminClient } from "@/lib/supabase/admin";

const NOTIFICATION_PAGE_SIZE = 1_000;
const PUSH_BATCH_SIZE = 20;

type ExamPublicationNotification = PushNotificationRecord & {
  id: string;
  exam_id: string;
  type: "exam_available";
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

async function loadExamPublicationNotifications(
  admin: ReturnType<typeof createAdminClient>,
  examId: string,
) {
  const notifications: ExamPublicationNotification[] = [];

  for (let start = 0; ; start += NOTIFICATION_PAGE_SIZE) {
    const { data, error } = await admin
      .from("notifications")
      .select("id, user_id, exam_id, type, title, message, action_url")
      .eq("exam_id", examId)
      .eq("dedupe_key", `exam-published:${examId}`)
      .order("created_at", { ascending: true })
      .range(start, start + NOTIFICATION_PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data ?? []) as ExamPublicationNotification[];
    notifications.push(...page);
    if (page.length < NOTIFICATION_PAGE_SIZE) break;
  }

  return notifications;
}

async function deliverExamPublicationPushes(
  notifications: ExamPublicationNotification[],
  admin: ReturnType<typeof createAdminClient>,
) {
  const summary = emptyPushSummary();

  for (let index = 0; index < notifications.length; index += PUSH_BATCH_SIZE) {
    const batch = notifications.slice(index, index + PUSH_BATCH_SIZE);
    const outcomes = await Promise.all(batch.map(async (notification) => {
      try {
        return await deliverPushNotification(notification, admin);
      } catch (error) {
        console.error("Unable to send exam-publication push", {
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

/** Deliver the publication email and browser push from one authoritative path. */
export async function deliverExamPublicationNotifications(exam: PublishedExamEmailDetails) {
  const admin = createAdminClient();
  const emailPromise = sendExamPublishedEmails(exam);
  let push = emptyPushSummary();
  let preparationFailed = false;

  try {
    const notifications = await loadExamPublicationNotifications(admin, exam.id);
    push = await deliverExamPublicationPushes(notifications, admin);
    if (push.skipped > 0 || push.transientFailures > 0) {
      console.error("Exam-publication push was not fully delivered", {
        examId: exam.id,
        push,
      });
    }
  } catch (error) {
    preparationFailed = true;
    console.error("Unable to prepare exam-publication pushes", error);
  }

  const email = await emailPromise;
  return { push, email, preparationFailed };
}
