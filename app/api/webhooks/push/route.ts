import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonRequest, parseRequestValue } from "@/lib/api/request";
import { ApiError, apiErrorResponse } from "@/lib/api/errors";
import { deliverPushNotification } from "@/lib/notifications/push";

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
    "account_approved",
    "magnus_approved",
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
      const notification = parseRequestValue(
        notificationRecordSchema,
        payload.record,
        "Invalid notification record",
      );

      // These notifications are delivered by the same application/worker path
      // that creates them. A webhook for the inserted row must not send the
      // same browser message a second time.
      if (notification.type && new Set([
        "account_approved",
        "exam_available",
        "exam_reminder",
        "magnus_approved",
        "practice_reminder",
        "results_published",
        "subscription_expiring",
        "subscription_lapsed",
      ]).has(notification.type)) {
        return NextResponse.json({ success: true, delegated: true });
      }

      const delivery = await deliverPushNotification(notification);
      console.log(`[FCM Webhook] Successfully sent ${delivery.delivered} messages; ${delivery.failed} failed.`);
      if (delivery.transientFailures > 0) {
        return NextResponse.json(
          { error: "FCM temporarily failed", transientFailures: delivery.transientFailures },
          { status: 502 },
        );
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
