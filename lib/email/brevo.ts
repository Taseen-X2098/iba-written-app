import { PLAN_CONFIG, type PlanType } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/admin";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_SITE_URL = "https://ibawritten.com";

type Recipient = {
  email: string;
  name: string;
};

export type PublishedExamEmailDetails = {
  id: string;
  title: string;
  instructions: string | null;
  totalMarks: number;
  deadline: string;
  durationMinutes: number;
};

export type SubscriptionRetentionEmailDetails = {
  subject: string;
  title: string;
  message: string;
  details: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]!);
}

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, "");
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Dhaka",
  }).format(new Date(date));
}

function formatDateTime(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Dhaka",
    timeZoneName: "short",
  }).format(new Date(date));
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} ${hours === 1 ? "hour" : "hours"}${remainingMinutes ? ` ${remainingMinutes} minutes` : ""}`;
}

function emailLayout({ preview, title, body, ctaLabel, ctaUrl }: {
  preview: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f8fafc;color:#0f172a;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${preview}</span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">
          <tr><td style="padding:0 0 20px;text-align:center;">
            <span style="display:inline-block;background:#16a34a;border-radius:10px;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-.4px;padding:11px 18px;">IBA Written</span>
          </td></tr>
          <tr><td style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:36px 32px;box-shadow:0 1px 2px rgba(15,23,42,.04);">
            <h1 style="color:#0f172a;font-size:26px;line-height:1.25;letter-spacing:-.4px;margin:0 0 16px;">${title}</h1>
            ${body}
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 4px;"><tr><td style="border-radius:8px;background:#16a34a;">
              <a href="${ctaUrl}" style="display:inline-block;border-radius:8px;color:#ffffff;font-size:15px;font-weight:700;padding:13px 20px;text-decoration:none;">${ctaLabel}</a>
            </td></tr></table>
          </td></tr>
          <tr><td style="color:#64748b;font-size:12px;line-height:1.5;padding:20px 16px 0;text-align:center;">
            You received this account update because you have an IBA Written account.<br>
            © ${new Date().getFullYear()} IBA Written
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

async function getRecipient(userId: string): Promise<Recipient> {
  const supabase = await createAdminClient();
  const [{ data: authUser, error: authError }, { data: profile }] = await Promise.all([
    supabase.auth.admin.getUserById(userId),
    supabase.from("profiles").select("name").eq("id", userId).maybeSingle(),
  ]);

  if (authError || !authUser.user?.email) {
    throw new Error("Could not find an email address for this student");
  }

  return {
    email: authUser.user.email,
    name: profile?.name || authUser.user.user_metadata?.full_name || "there",
  };
}

async function sendBrevoEmail(recipient: Recipient, subject: string, htmlContent: string) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;

  if (!apiKey || !senderEmail) {
    console.warn("Brevo email skipped: set BREVO_API_KEY and BREVO_SENDER_EMAIL to enable account-update emails.");
    return { delivered: false, skipped: true };
  }

  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: process.env.BREVO_SENDER_NAME || "IBA Written" },
      to: [{ email: recipient.email, name: recipient.name }],
      subject,
      htmlContent,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Brevo rejected the email (${response.status}): ${detail.slice(0, 500)}`);
  }

  return { delivered: true, skipped: false };
}

async function deliverAccountUpdate(recipientLoader: () => Promise<Recipient>, subject: string, htmlContent: (recipient: Recipient) => string) {
  try {
    const recipient = await recipientLoader();
    return await sendBrevoEmail(recipient, subject, htmlContent(recipient));
  } catch (error) {
    // A notification failure must never undo a paid purchase or an admin-granted entitlement.
    console.error("Unable to send account-update email:", error);
    return { delivered: false, skipped: false };
  }
}

function profileName(profile: unknown) {
  if (profile && typeof profile === "object" && "name" in profile && typeof profile.name === "string") {
    return profile.name;
  }
  if (Array.isArray(profile)) {
    const first = profile[0];
    if (first && typeof first === "object" && "name" in first && typeof first.name === "string") {
      return first.name;
    }
  }
  return "there";
}

async function getEligibleExamRecipients() {
  const supabase = await createAdminClient();
  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("subscriptions")
    .select("user_id, profiles(name)")
    .eq("is_active", true)
    .in("plan_type", ["plan_2", "plan_3"])
    .gt("expires_at", new Date().toISOString());

  if (subscriptionsError) throw subscriptionsError;

  const namesByUserId = new Map<string, string>();
  for (const subscription of subscriptions ?? []) {
    namesByUserId.set(subscription.user_id, profileName(subscription.profiles));
  }
  if (namesByUserId.size === 0) return [] as Recipient[];

  const recipients: Recipient[] = [];
  const pageSize = 1_000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: pageSize });
    if (error) throw error;

    const users = data.users ?? [];
    for (const user of users) {
      const name = namesByUserId.get(user.id);
      if (name && user.email) recipients.push({ email: user.email, name });
    }
    if (users.length < pageSize) break;
  }
  return recipients;
}

export async function sendExamPublishedEmails(exam: PublishedExamEmailDetails) {
  if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) {
    console.warn("Brevo exam-publication email skipped: set BREVO_API_KEY and BREVO_SENDER_EMAIL to enable email notifications.");
    return { recipients: 0, delivered: 0, failed: 0, skipped: true };
  }

  try {
    const recipients = await getEligibleExamRecipients();
    const subject = `Exam started: ${exam.title}`;
    const instructions = escapeHtml(exam.instructions?.trim() || "Please read each question carefully before submitting.")
      .replace(/\r?\n/g, "<br>");
    const htmlContent = (recipient: Recipient) => emailLayout({
      preview: `${exam.title} has started. Complete it before the deadline.`,
      title: "Your exam has started",
      body: `<p style="color:#334155;font-size:16px;line-height:1.65;margin:0 0 16px;">Hi ${escapeHtml(recipient.name)},</p>
<p style="color:#334155;font-size:16px;line-height:1.65;margin:0 0 16px;"><strong style="color:#15803d;">${escapeHtml(exam.title)}</strong> is now available.</p>
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;color:#166534;font-size:14px;line-height:1.7;margin:20px 0 0;padding:14px 16px;">
  <strong>Instructions:</strong><br>${instructions}<br><br>
  <strong>Total marks:</strong> ${exam.totalMarks}<br>
  <strong>Deadline:</strong> ${formatDateTime(exam.deadline)}<br>
  <strong>Duration:</strong> ${formatDuration(exam.durationMinutes)}
</div>`,
      ctaLabel: "Start exam",
      ctaUrl: `${getSiteUrl()}/exams/${exam.id}`,
    });

    let delivered = 0;
    let failed = 0;
    const batchSize = 10;
    for (let index = 0; index < recipients.length; index += batchSize) {
      const outcomes = await Promise.all(recipients.slice(index, index + batchSize).map(async (recipient) => {
        try {
          await sendBrevoEmail(recipient, subject, htmlContent(recipient));
          return true;
        } catch (error) {
          console.error("Unable to send exam-publication email:", error);
          return false;
        }
      }));
      delivered += outcomes.filter(Boolean).length;
      failed += outcomes.filter((outcome) => !outcome).length;
    }
    return { recipients: recipients.length, delivered, failed, skipped: false };
  } catch (error) {
    console.error("Unable to prepare exam-publication emails:", error);
    return { recipients: 0, delivered: 0, failed: 0, skipped: false };
  }
}

export async function sendPlanActivatedEmail(userId: string, planType: PlanType, expiresAt: string) {
  const plan = PLAN_CONFIG[planType];
  const subject = `Your ${plan.name} is now active`;

  return deliverAccountUpdate(
    () => getRecipient(userId),
    subject,
    (recipient) => emailLayout({
      preview: `${plan.name} is active and ready to use.`,
      title: "Your plan is active",
      body: `<p style="color:#334155;font-size:16px;line-height:1.65;margin:0 0 16px;">Hi ${escapeHtml(recipient.name)},</p>
<p style="color:#334155;font-size:16px;line-height:1.65;margin:0 0 16px;">Your <strong style="color:#15803d;">${plan.name}</strong> has been activated. ${escapeHtml(plan.description)}.</p>
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;color:#166534;font-size:14px;line-height:1.5;margin:20px 0 0;padding:14px 16px;"><strong>Plan valid until:</strong> ${formatDate(expiresAt)}</div>`,
      ctaLabel: "View my plan",
      ctaUrl: `${getSiteUrl()}/subscription`,
    }),
  );
}

export async function sendSlotsAddedEmail(userId: string, amount: number, slotType: "free" | "extra") {
  const slotLabel = slotType === "free" ? "free practice test" : "extra practice test";
  const pluralSlotLabel = amount === 1 ? slotLabel : `${slotLabel}s`;
  const subject = `${amount} ${pluralSlotLabel} added to your account`;

  return deliverAccountUpdate(
    () => getRecipient(userId),
    subject,
    (recipient) => emailLayout({
      preview: `${amount} ${pluralSlotLabel} were added to your IBA Written account.`,
      title: "New test slots added",
      body: `<p style="color:#334155;font-size:16px;line-height:1.65;margin:0 0 16px;">Hi ${escapeHtml(recipient.name)},</p>
<p style="color:#334155;font-size:16px;line-height:1.65;margin:0 0 16px;">Good news — <strong style="color:#15803d;">${amount} ${escapeHtml(pluralSlotLabel)}</strong> ${amount === 1 ? "has" : "have"} been added to your account.</p>
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;color:#166534;font-size:14px;line-height:1.5;margin:20px 0 0;padding:14px 16px;"><strong>Ready when you are:</strong> start a practice test and get AI-powered feedback.</div>`,
      ctaLabel: "Start practicing",
      ctaUrl: `${getSiteUrl()}/test`,
    }),
  );
}

export async function sendSubscriptionRetentionEmail(
  userId: string,
  content: SubscriptionRetentionEmailDetails,
) {
  return deliverAccountUpdate(
    () => getRecipient(userId),
    content.subject,
    (recipient) => emailLayout({
      preview: content.message,
      title: content.title,
      body: `<p style="color:#334155;font-size:16px;line-height:1.65;margin:0 0 16px;">Hi ${escapeHtml(recipient.name)},</p>
<p style="color:#334155;font-size:16px;line-height:1.7;margin:0;">${escapeHtml(content.details)
        .replace(/\r?\n\r?\n/g, "</p><p style=\"color:#334155;font-size:16px;line-height:1.7;margin:16px 0 0;\">")
        .replace(/\r?\n/g, "<br>")}</p>`,
      ctaLabel: "Continue my progress",
      ctaUrl: `${getSiteUrl()}/subscription`,
    }),
  );
}
