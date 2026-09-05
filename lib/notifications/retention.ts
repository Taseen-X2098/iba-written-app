import { randomUUID } from "node:crypto";
import { sendMagnusApprovedEmail, sendSubscriptionRetentionEmail } from "@/lib/email/brevo";
import { deliverPushNotification } from "@/lib/notifications/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { CATEGORY_LABELS, type NotificationType, type QuestionCategory } from "@/lib/types";

const MAX_ATTEMPTS = 8;

type RetentionJobKind = Extract<
  NotificationType,
  "practice_reminder" | "exam_reminder" | "subscription_expiring" | "subscription_lapsed"
> | "magnus_approved";

type RetentionJob = {
  id: string;
  user_id: string;
  kind: RetentionJobKind;
  event_key: string;
  exam_id: string | null;
  subscription_id: string | null;
  requires_email: boolean;
  notification_id: string | null;
  email_sent_at: string | null;
  push_sent_at: string | null;
  attempt_count: number;
};

type ProgressionSnapshot = {
  recentWin?: unknown;
  recent_win?: unknown;
  focusArea?: unknown;
  focus_area?: unknown;
  nextStep?: unknown;
  next_step?: unknown;
};

type RetentionCopy = {
  title: string;
  message: string;
  details: string | null;
  actionUrl: string;
};

export type PersonalizedRetentionInput = {
  name: string;
  phase: "expiring" | "lapsed";
  days: number;
  totalGraded: number;
  category: string | null;
  snapshot: ProgressionSnapshot | null;
};

function cleanText(value: unknown, maxLength = 1_000) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function firstName(name: string) {
  return cleanText(name, 100).split(/\s+/)[0] || "there";
}

function categoryLabel(category: string | null) {
  if (!category) return "recent writing";
  return CATEGORY_LABELS[category as QuestionCategory]
    ?? category.split("_").filter(Boolean).map((word) => (
      word.charAt(0).toUpperCase() + word.slice(1)
    )).join(" ");
}

function snapshotField(snapshot: ProgressionSnapshot | null, camel: keyof ProgressionSnapshot, snake: keyof ProgressionSnapshot) {
  return cleanText(snapshot?.[camel] ?? snapshot?.[snake], 800);
}

export function buildPersonalizedRetentionCopy(input: PersonalizedRetentionInput): RetentionCopy {
  const name = firstName(input.name);
  const category = categoryLabel(input.category);
  const win = snapshotField(input.snapshot, "recentWin", "recent_win");
  const focus = snapshotField(input.snapshot, "focusArea", "focus_area");
  const nextStep = snapshotField(input.snapshot, "nextStep", "next_step");
  const hasHistory = input.totalGraded > 0 && Boolean(win || focus || nextStep);
  const answerLabel = input.totalGraded === 1 ? "graded answer" : "graded answers";

  if (!hasHistory) {
    const timing = input.phase === "expiring"
      ? `Your plan ends in ${input.days} days.`
      : `Your plan ended ${input.days} days ago.`;
    return {
      title: input.phase === "expiring" ? `Your plan ends in ${input.days} days` : "Your practice plan is waiting",
      message: `${name}, ${timing} There is not enough answer history for a fair skill diagnosis yet—one focused practice can create your first clear next step.`,
      details: `${timing}\n\nYou have not completed enough graded practice for us to make a fair claim about a specific strength or weakness. We would rather be honest than give you generic praise.\n\nYour best next step\nComplete one timed answer and use the feedback to choose one skill to practise next.\n\n${input.phase === "expiring"
        ? "Renew before your plan ends to keep building a useful learning history and continue without a break."
        : "Renew when you are ready to restart. Your next graded answer will begin a learning history that becomes more useful with every practice."}`,
      actionUrl: "/subscription",
    };
  }

  const timing = input.phase === "expiring"
    ? `Your plan ends in ${input.days} days.`
    : `Your plan ended ${input.days} days ago.`;
  const pushInsight = focus
    ? `Your ${category} history shows this next focus: ${focus}`
    : nextStep
      ? `Your next ${category} step is: ${nextStep}`
      : `Your ${category} history already shows useful progress.`;
  const sections = [
    timing,
    `You completed ${input.totalGraded} ${answerLabel}. Here is an honest summary based on that work.`,
    win ? `What is going well\n${win}` : "",
    focus ? `What still needs work\n${focus}` : "",
    nextStep ? `Your next best step\n${nextStep}` : "",
    input.phase === "expiring"
      ? "Renew before the end date to keep your practice history, feedback, and momentum working together without a break."
      : "Your history is still here. Renew when you are ready to continue from this exact next step instead of starting without direction.",
  ].filter(Boolean);

  return {
    title: input.phase === "expiring" ? `Your plan ends in ${input.days} days` : "Your personal progress plan is waiting",
    message: `${name}, ${timing} ${pushInsight}`.slice(0, 500),
    details: sections.join("\n\n").slice(0, 12_000),
    actionUrl: "/subscription",
  };
}

function stableIndex(value: string, length: number) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % length;
}

export function choosePracticeHook<T>(hooks: T[], seed: string): T | null {
  if (!hooks.length) return null;
  return hooks[stableIndex(seed, hooks.length)];
}

async function hasLivePlan(userId: string, plans?: Array<"plan_1" | "plan_2" | "plan_3">) {
  const admin = createAdminClient();
  let query = admin
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString());
  if (plans) query = query.in("plan_type", plans);
  const { data, error } = await query.limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

async function loadPersonalizedInput(job: RetentionJob, name: string, days: number) {
  const admin = createAdminClient();
  const [profilesResult, eventsResult, totalResult] = await Promise.all([
    admin
      .from("student_category_profiles")
      .select("submission_type, total_graded, latest_snapshot, updated_at")
      .eq("user_id", job.user_id)
      .order("updated_at", { ascending: false }),
    admin
      .from("student_learning_events")
      .select("category, signal, description, created_at")
      .eq("user_id", job.user_id)
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("student_profile_summaries")
      .select("total_graded")
      .eq("user_id", job.user_id)
      .maybeSingle(),
  ]);
  for (const result of [profilesResult, eventsResult, totalResult]) {
    if (result.error) throw result.error;
  }
  const profiles = profilesResult.data ?? [];
  const events = eventsResult.data ?? [];
  const snapshotProfile = profiles.find((profile) => {
    if (!profile.latest_snapshot || typeof profile.latest_snapshot !== "object") return false;
    const snapshot = profile.latest_snapshot as ProgressionSnapshot;
    return Boolean(
      snapshotField(snapshot, "recentWin", "recent_win")
      || snapshotField(snapshot, "focusArea", "focus_area")
      || snapshotField(snapshot, "nextStep", "next_step"),
    );
  });
  const latestEvent = events[0];
  const eventCategory = latestEvent?.category ?? null;
  const sameCategoryEvents = eventCategory
    ? events.filter((event) => event.category === eventCategory)
    : events;
  const latestStrength = sameCategoryEvents.find((event) => event.signal === "strength");
  const latestWeakness = sameCategoryEvents.find((event) => event.signal === "weakness");
  const fallbackSnapshot: ProgressionSnapshot | null = latestStrength || latestWeakness
    ? {
        recentWin: latestStrength?.description,
        focusArea: latestWeakness?.description,
        nextStep: latestWeakness
          ? `In your next ${categoryLabel(eventCategory)} answer, focus on this: ${latestWeakness.description}`
          : `Use this strength again in your next ${categoryLabel(eventCategory)} answer.`,
      }
    : null;
  const categoryTotal = profiles.reduce(
    (total, profile) => total + Number(profile.total_graded ?? 0),
    0,
  );
  return {
    name,
    phase: job.kind === "subscription_lapsed" ? "lapsed" as const : "expiring" as const,
    days,
    totalGraded: Math.max(categoryTotal, Number(totalResult.data?.total_graded ?? 0)),
    category: snapshotProfile?.submission_type ?? eventCategory ?? profiles[0]?.submission_type ?? null,
    snapshot: snapshotProfile?.latest_snapshot && typeof snapshotProfile.latest_snapshot === "object"
      ? snapshotProfile.latest_snapshot as ProgressionSnapshot
      : fallbackSnapshot,
  };
}

async function buildJobCopy(job: RetentionJob): Promise<RetentionCopy | null> {
  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("name")
    .eq("id", job.user_id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) return null;

  if (job.kind === "magnus_approved") {
    const { data: membership, error: membershipError } = await admin
      .from("magnus_memberships")
      .select("status")
      .eq("user_id", job.user_id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (membership?.status !== "approved") return null;
    return {
      title: "Welcome to IBA Written",
      message: "You have been approved as magnus student with our Full Preparation plan.",
      details: null,
      actionUrl: "/exams",
    };
  }

  if (job.kind === "practice_reminder") {
    if (!await hasLivePlan(job.user_id, ["plan_1", "plan_2"])) return null;
    const { data: hooks, error } = await admin
      .from("practice_notification_hooks")
      .select("id, content")
      .eq("is_active", true)
      .order("created_at");
    if (error) throw error;
    const selected = choosePracticeHook(hooks ?? [], `${job.event_key}:${job.user_id}`);
    const hook = selected?.content
      ?? "One focused answer today can make your next exam answer clearer and faster.";
    return {
      title: "Keep your writing momentum",
      message: `${firstName(profile.name)}, ${hook}`.slice(0, 500),
      details: null,
      actionUrl: "/questions",
    };
  }

  if (job.kind === "exam_reminder") {
    if (!job.exam_id || !await hasLivePlan(job.user_id, ["plan_2", "plan_3"])) return null;
    const { data: exam, error } = await admin
      .from("exams")
      .select("title, starts_at, ends_at, time_limit_minutes, is_published, is_magnus_only")
      .eq("id", job.exam_id)
      .maybeSingle();
    if (error) throw error;
    if (!exam?.is_published || new Date(exam.ends_at).getTime() <= Date.now()) return null;
    if (exam.is_magnus_only) {
      const { data: membership, error: membershipError } = await admin
        .from("magnus_memberships")
        .select("user_id")
        .eq("user_id", job.user_id)
        .eq("status", "approved")
        .maybeSingle();
      if (membershipError) throw membershipError;
      if (!membership) return null;
    }
    const startTime = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Dhaka",
      timeZoneName: "short",
    }).format(new Date(exam.starts_at));
    return {
      title: `Exam reminder: ${exam.title}`.slice(0, 200),
      message: `Your exam starts ${startTime}. Set aside ${exam.time_limit_minutes} minutes and open the instructions before it begins.`,
      details: null,
      actionUrl: `/exams/${job.exam_id}`,
    };
  }

  if (!job.subscription_id) return null;
  const { data: subscription, error } = await admin
    .from("subscriptions")
    .select("id, is_active, expires_at")
    .eq("id", job.subscription_id)
    .eq("user_id", job.user_id)
    .maybeSingle();
  if (error) throw error;
  if (!subscription) return null;

  const { data: settings, error: settingsError } = await admin
    .from("retention_notification_settings")
    .select("subscription_expiry_days_before, subscription_lapsed_days_after")
    .eq("id", 1)
    .single();
  if (settingsError) throw settingsError;

  if (job.kind === "subscription_expiring") {
    if (!subscription.is_active || new Date(subscription.expires_at).getTime() <= Date.now()) return null;
    return buildPersonalizedRetentionCopy(await loadPersonalizedInput(
      job,
      profile.name,
      settings.subscription_expiry_days_before,
    ));
  }

  if (await hasLivePlan(job.user_id)) return null;
  return buildPersonalizedRetentionCopy(await loadPersonalizedInput(
    job,
    profile.name,
    settings.subscription_lapsed_days_after,
  ));
}

async function cancelJob(job: RetentionJob, reason: string) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("retention_notification_jobs")
    .update({
      status: "cancelled",
      claimed_by: null,
      claimed_at: null,
      last_error: reason,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  if (error) throw error;
}

async function markFailure(job: RetentionJob, error: unknown) {
  const admin = createAdminClient();
  const terminal = job.attempt_count >= MAX_ATTEMPTS;
  const delayMinutes = Math.min(360, 2 ** Math.max(0, job.attempt_count - 1));
  const message = error instanceof Error ? error.message : "Unknown retention notification error";
  const { error: updateError } = await admin
    .from("retention_notification_jobs")
    .update({
      status: terminal ? "failed" : "queued",
      claimed_by: null,
      claimed_at: null,
      next_attempt_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
      last_error: message.slice(0, 4_000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  if (updateError) console.error("Unable to record retention job failure", updateError);
}

async function ensureNotification(job: RetentionJob, copy: RetentionCopy) {
  const admin = createAdminClient();
  const record = {
    user_id: job.user_id,
    exam_id: job.exam_id,
    type: job.kind,
    title: copy.title,
    message: copy.message,
    details: copy.details,
    action_url: copy.actionUrl,
    dedupe_key: job.event_key,
  };
  const { data, error } = await admin
    .from("notifications")
    .upsert(record, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (data?.id) return data.id;
  const { data: existing, error: existingError } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", job.user_id)
    .eq("dedupe_key", job.event_key)
    .single();
  if (existingError) throw existingError;
  return existing.id;
}

async function processJob(job: RetentionJob) {
  try {
    const copy = await buildJobCopy(job);
    if (!copy) {
      await cancelJob(job, "Recipient is no longer eligible");
      return "cancelled" as const;
    }

    const admin = createAdminClient();
    const notificationId = job.notification_id ?? await ensureNotification(job, copy);
    if (!job.notification_id) {
      const { error: linkError } = await admin
        .from("retention_notification_jobs")
        .update({ notification_id: notificationId, updated_at: new Date().toISOString() })
        .eq("id", job.id);
      if (linkError) throw linkError;
    }

    let emailSentAt = job.email_sent_at;
    let deliveryError: Error | null = null;
    if (job.requires_email && !emailSentAt) {
      const outcome = job.kind === "magnus_approved"
        ? await sendMagnusApprovedEmail(job.user_id)
        : await sendSubscriptionRetentionEmail(job.user_id, {
            subject: "Your personal IBA Written progress plan is waiting",
            title: copy.title,
            message: copy.message,
            details: copy.details ?? copy.message,
          });
      if (!outcome.delivered) {
        deliveryError = new Error(outcome.skipped
          ? "Brevo retention email is not configured"
          : "Brevo retention email was not delivered");
      } else {
        emailSentAt = new Date().toISOString();
        const { error: emailStateError } = await admin
          .from("retention_notification_jobs")
          .update({ email_sent_at: emailSentAt, updated_at: emailSentAt })
          .eq("id", job.id);
        if (emailStateError) throw emailStateError;
      }
    }

    let pushSentAt = job.push_sent_at;
    if (!pushSentAt) {
      try {
        const push = await deliverPushNotification({
          id: notificationId,
          user_id: job.user_id,
          exam_id: job.exam_id,
          type: job.kind,
          title: copy.title,
          message: copy.message,
          action_url: copy.actionUrl,
        }, admin);
        if (push.skipped) {
          throw new Error("Firebase push is not configured");
        }
        if (push.transientFailures > 0) {
          const codes = push.errorCodes?.length
            ? ` (${push.errorCodes.join(", ")})`
            : "";
          throw new Error(`Firebase push failed${codes} for ${push.transientFailures} device token(s)`);
        }
        pushSentAt = new Date().toISOString();
        const { error: pushStateError } = await admin
          .from("retention_notification_jobs")
          .update({ push_sent_at: pushSentAt, updated_at: pushSentAt })
          .eq("id", job.id);
        if (pushStateError) throw pushStateError;
      } catch (error) {
        deliveryError ??= error instanceof Error ? error : new Error("Browser push delivery failed");
      }
    }

    if (deliveryError) throw deliveryError;

    const completedAt = new Date().toISOString();
    const { error: completeError } = await admin
      .from("retention_notification_jobs")
      .update({
        status: "completed",
        email_sent_at: emailSentAt,
        push_sent_at: pushSentAt,
        completed_at: completedAt,
        claimed_by: null,
        claimed_at: null,
        last_error: null,
        updated_at: completedAt,
      })
      .eq("id", job.id);
    if (completeError) throw completeError;
    return "completed" as const;
  } catch (error) {
    await markFailure(job, error);
    return "failed" as const;
  }
}

export async function runRetentionNotificationCycle(options?: {
  workerId?: string;
  batchSize?: number;
}) {
  const workerId = options?.workerId ?? `retention-${randomUUID()}`;
  const requestedBatchSize = Number(options?.batchSize ?? 20);
  const batchSize = Number.isFinite(requestedBatchSize)
    ? Math.max(1, Math.min(Math.trunc(requestedBatchSize), 100))
    : 20;
  const admin = createAdminClient();
  const { data: enqueued, error: enqueueError } = await admin.rpc(
    "enqueue_due_retention_notification_jobs",
    { p_now: new Date().toISOString() },
  );
  if (enqueueError) throw enqueueError;

  const totals = { enqueued: Number(enqueued ?? 0), completed: 0, failed: 0, cancelled: 0 };
  while (true) {
    const { data, error } = await admin.rpc("claim_retention_notification_jobs", {
      p_worker_id: workerId,
      p_limit: batchSize,
    });
    if (error) throw error;
    const jobs = (data ?? []) as RetentionJob[];
    if (!jobs.length) break;
    const outcomes = await Promise.all(jobs.map(processJob));
    for (const outcome of outcomes) totals[outcome] += 1;
  }
  return totals;
}
