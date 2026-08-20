import { PLAN_CONFIG, type PlanType } from "@/lib/types";
import { createAdminClient } from "@/lib/supabase/server";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_SITE_URL = "https://ibawritten.com";

type Recipient = {
  email: string;
  name: string;
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
