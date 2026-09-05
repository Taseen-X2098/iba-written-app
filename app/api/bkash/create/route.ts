import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBkashClient } from "@/lib/bkash/client";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  PlanTransitionError,
  quotePlanPurchase,
  type ActivePlanForTransition,
} from "@/lib/subscriptions/transitions";
import { EXTRA_TEST_PRICE } from "@/lib/types";

const purchaseSchema = z.discriminatedUnion("purchaseType", [
  z.object({
    purchaseType: z.literal("plan"),
    planId: z.enum(["plan_1", "plan_2", "plan_3"]),
  }).strict(),
  z.object({
    purchaseType: z.literal("extra_slots"),
    slots: z.number().int().min(1).max(10_000),
  }).strict(),
]);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown payment error";
}

export async function POST(req: NextRequest) {
  const sessionClient = await createClient();
  const { data: { user } } = await sessionClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = purchaseSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid purchase request" },
      { status: 400 }
    );
  }

  // Authentication is verified with the cookie-bound client. The service-role
  // client performs payment writes because end users intentionally have no RLS
  // policy that permits inserting or updating their own payment records.
  const supabase = await createAdminClient();
  const now = new Date();
  const { data: activeSub, error: subscriptionError } = await supabase
    .from("subscriptions")
    .select("id, plan_type, expires_at")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .gt("expires_at", now.toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subscriptionError) {
    return NextResponse.json({ error: "Could not verify the active plan" }, { status: 500 });
  }

  let amount: number;
  let paymentType: "subscription" | "upgrade" | "extra_tests";
  let planType: "plan_1" | "plan_2" | "plan_3" | null = null;
  let metadata: Record<string, unknown>;

  if (parsed.data.purchaseType === "extra_slots") {
    if (!activeSub || (activeSub.plan_type !== "plan_1" && activeSub.plan_type !== "plan_2")) {
      return NextResponse.json(
        { error: "You must have an active Basic Practice or Complete Prep plan to buy extra slots." },
        { status: 403 }
      );
    }
    amount = parsed.data.slots * EXTRA_TEST_PRICE;
    paymentType = "extra_tests";
    metadata = {
      slots: parsed.data.slots,
      sourceSubscriptionId: activeSub.id,
    };
  } else {
    planType = parsed.data.planId;
    try {
      const quote = quotePlanPurchase(
        activeSub as ActivePlanForTransition | null,
        planType,
        now
      );
      amount = quote.amount;
      paymentType = quote.paymentType;
      metadata = { sourceSubscriptionId: quote.sourceSubscriptionId };
    } catch (error: unknown) {
      if (error instanceof PlanTransitionError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
  }

  const invoiceId = `INV-${Date.now().toString().slice(-6)}-${randomUUID().slice(0, 4)}`;
  metadata.invoiceId = invoiceId;

  const { data: paymentRecord, error: dbError } = await supabase
    .from("payments")
    .insert({
      user_id: user.id,
      amount,
      payment_type: paymentType,
      plan_type: planType,
      status: "pending",
      metadata,
    })
    .select("id")
    .single();

  if (dbError || !paymentRecord) {
    return NextResponse.json({ error: "Failed to create payment record" }, { status: 500 });
  }

  try {
    const bkash = getBkashClient();
    const origin = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
    const callbackURL = `${origin.replace(/\/$/, "")}/api/bkash/callback?payment_id=${paymentRecord.id}`;
    const payerReference = user.phone || user.id.slice(0, 20);

    const bkashRes = await bkash.createPayment({
      amount: amount.toString(),
      payerReference,
      callbackURL,
      merchantInvoiceNumber: invoiceId,
    });

    if (bkashRes.statusCode !== "0000" || !bkashRes.paymentID || !bkashRes.bkashURL) {
      throw new Error(bkashRes.statusMessage || "bKash returned an invalid payment response");
    }

    const { data: linkedPayment, error: paymentIdError } = await supabase
      .from("payments")
      .update({ bkash_payment_id: bkashRes.paymentID })
      .eq("id", paymentRecord.id)
      .eq("status", "pending")
      .select("id")
      .single();
    if (paymentIdError || !linkedPayment) {
      throw paymentIdError || new Error("Payment record changed before bKash was linked");
    }

    return NextResponse.json({ bkashURL: bkashRes.bkashURL });
  } catch (error: unknown) {
    console.error("bKash Create Payment Error:", error);
    await supabase
      .from("payments")
      .update({ status: "failed", metadata: { ...metadata, createError: errorMessage(error) } })
      .eq("id", paymentRecord.id)
      .eq("status", "pending");

    return NextResponse.json({ error: "Payment gateway error" }, { status: 502 });
  }
}
