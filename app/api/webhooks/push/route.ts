import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminMessaging } from "@/lib/firebase-admin";
import { createClient } from "@supabase/supabase-js"; // Use pure supabase-js to bypass auth context for webhooks
import { z } from "zod";
import { parseJsonRequest, parseRequestValue } from "@/lib/api/request";
import { ApiError, apiErrorResponse } from "@/lib/api/errors";

const webhookEnvelopeSchema = z.object({
  type: z.string().max(30),
  table: z.string().max(100),
  schema: z.string().max(100).optional(),
  record: z.unknown().optional(),
});

const notificationRecordSchema = z.object({
  id: z.string().uuid().optional(),
  user_id: z.string().uuid(),
  exam_id: z.string().uuid().nullable().optional(),
  type: z.enum([
    "exam_available",
    "exam_reminder",
    "results_published",
    "subscription_expiring",
    "subscription_lapsed",
    "inactivity_reminder",
    "practice_reminder",
  ]).optional(),
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(4_000),
  action_url: z.string().trim().max(500).regex(/^\/(?!\/)/).nullable().optional(),
});

const PERMANENT_FCM_ERRORS = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

function hasValidWebhookSecret(request: NextRequest, expectedSecret: string) {
  const suppliedSecret = request.headers.get("x-supabase-signature");
  if (!suppliedSecret) return false;

  const supplied = Buffer.from(suppliedSecret, "utf8");
  const expected = Buffer.from(expectedSecret, "utf8");

  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("SUPABASE_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  }

  if (!hasValidWebhookSecret(req, webhookSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await parseJsonRequest(req, webhookEnvelopeSchema, {
      maxBytes: 64_000,
      message: "Invalid webhook payload",
    });
    
    // Payload from Supabase Webhook (INSERT on notifications table)
    if (payload.type === "INSERT" && payload.table === "notifications") {
      const { id, user_id, exam_id, type, title, message, action_url } = parseRequestValue(
        notificationRecordSchema,
        payload.record,
        "Invalid notification record",
      );

      // 2. Fetch the user's FCM tokens
      // We use the service_role key to bypass RLS since this is a server-to-server request
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("fcm_tokens")
        .eq("id", user_id)
        .single();
      if (profileError) throw profileError;

      const tokens = Array.isArray(profile?.fcm_tokens)
        ? profile.fcm_tokens
            .filter((token): token is string => typeof token === "string" && token.length > 0 && token.length <= 4_096)
            .slice(0, 500)
        : [];

      // 3. Send Push Notification via Firebase Admin
      if (tokens.length > 0) {
        const targetUrl = action_url
          ?? (exam_id && (type === "exam_available" || type === "exam_reminder")
            ? `/exams/${exam_id}`
            : exam_id && type === "results_published"
              ? `/exams/${exam_id}/results`
              : "/notifications");
        const messagePayload = {
          // A data-only payload is displayed exactly once by our service
          // worker in the background and by MainShell in the foreground.
          data: {
            title: title || "IBA Written App",
            body: message.slice(0, 500),
            url: targetUrl,
            tag: id ? `notification:${id}` : `notification:${type ?? "general"}`,
          },
          webpush: {
            headers: { Urgency: "high" },
          },
          tokens: tokens,
        };

        const response = await adminMessaging.sendEachForMulticast(messagePayload);
        console.log(`[FCM Webhook] Successfully sent ${response.successCount} messages; ${response.failureCount} failed.`);
        
        // Remove only permanently invalid tokens. Transient FCM failures must
        // not silently disable notifications on a healthy browser.
        if (response.failureCount > 0) {
          const failedTokens: string[] = [];
          response.responses.forEach((resp, idx: number) => {
            if (!resp.success && PERMANENT_FCM_ERRORS.has(resp.error?.code ?? "")) {
              failedTokens.push(tokens[idx]);
            }
          });
          
          if (failedTokens.length > 0) {
            const validTokens = tokens.filter((t: string) => !failedTokens.includes(t));
            await supabaseAdmin
              .from("profiles")
              .update({ fcm_tokens: validTokens })
              .eq("id", user_id);
          }

          const transientFailures = response.responses.filter((result) => (
            !result.success && !PERMANENT_FCM_ERRORS.has(result.error?.code ?? "")
          )).length;
          if (transientFailures > 0) {
            return NextResponse.json(
              { error: "FCM temporarily failed", transientFailures },
              { status: 502 },
            );
          }
        }
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Ignored payload type" }, { status: 400 });
  } catch (error: unknown) {
    if (error instanceof ApiError) return apiErrorResponse(error);
    console.error("Webhook processing error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
