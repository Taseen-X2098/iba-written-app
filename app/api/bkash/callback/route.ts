import { NextRequest, NextResponse } from "next/server";
import { getBkashClient } from "@/lib/bkash/client";
import { sendSlotsAddedEmail } from "@/lib/email/brevo";
import { deliverAccountApprovalNotifications } from "@/lib/notifications/account-approval";
import { createAdminClient } from "@/lib/supabase/server";
import type { PaymentType, PlanType } from "@/lib/types";

interface FulfillmentResult {
  fulfilled_now: boolean;
  fulfilled_user_id: string;
  fulfilled_payment_type: PaymentType;
  fulfilled_plan_type: PlanType | null;
  fulfilled_subscription_id: string | null;
  fulfilled_expires_at: string | null;
  fulfilled_slots: number;
}

function redirect(req: NextRequest, query: string) {
  return NextResponse.redirect(new URL(`/subscription?${query}`, req.url));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown callback error";
}

export async function GET(req: NextRequest) {
  // bKash redirects may not include the student's session, so the internal
  // payment ID is verified against the stored provider payment ID before the
  // service-role client is allowed to fulfill anything.
  const supabase = await createAdminClient();
  const status = req.nextUrl.searchParams.get("status");
  const bkashPaymentId = req.nextUrl.searchParams.get("paymentID");
  const internalPaymentId = req.nextUrl.searchParams.get("payment_id");

  if (!bkashPaymentId || !internalPaymentId) {
    return redirect(req, "error=missing_params");
  }

  const { data: paymentRecord, error: fetchError } = await supabase
    .from("payments")
    .select("*")
    .eq("id", internalPaymentId)
    .single();

  if (fetchError || !paymentRecord) {
    return redirect(req, "error=payment_not_found");
  }
  if (paymentRecord.bkash_payment_id !== bkashPaymentId) {
    return redirect(req, "error=payment_mismatch");
  }
  if (paymentRecord.status === "completed") {
    return redirect(req, "success=true");
  }

  if (status !== "success") {
    await supabase
      .from("payments")
      .update({ status: "failed" })
      .eq("id", paymentRecord.id)
      .eq("status", "pending");
    return redirect(req, `error=${status === "cancel" ? "cancelled" : "payment_failed"}`);
  }

  try {
    const bkash = getBkashClient();
    let providerResult = await bkash.executePayment(bkashPaymentId);

    if (providerResult.statusCode !== "0000") {
      // A callback can be retried after bKash has already executed the payment.
      // Querying avoids charging/fulfilling twice and also handles a timeout
      // where the original execute response never reached this server.
      const queried = await bkash.queryPayment(bkashPaymentId);
      if (queried.statusCode === "0000" && queried.transactionStatus === "Completed") {
        providerResult = queried;
      } else {
        await supabase
          .from("payments")
          .update({
            metadata: {
              ...(paymentRecord.metadata ?? {}),
              executeError: providerResult.statusMessage || queried.statusMessage || "Payment verification pending",
            },
          })
          .eq("id", paymentRecord.id)
          .eq("status", "pending");
        return redirect(req, "error=payment_verification_pending");
      }
    }

    const transactionId = providerResult.trxID;
    const paidAmount = Number(providerResult.amount);
    const expectedAmount = Number(paymentRecord.amount);
    if (
      !transactionId ||
      !Number.isFinite(paidAmount) ||
      !Number.isFinite(expectedAmount) ||
      Math.abs(paidAmount - expectedAmount) > 0.001 ||
      (providerResult.currency && providerResult.currency !== "BDT")
    ) {
      console.error("bKash payment verification mismatch", {
        paymentId: paymentRecord.id,
        expectedAmount,
        paidAmount,
        currency: providerResult.currency,
      });
      return redirect(req, "error=payment_verification_pending");
    }

    // The RPC changes the subscription/slot balance and marks the payment
    // completed in one database transaction. Repeated callbacks return
    // fulfilled_now=false and cannot apply the purchase a second time.
    const { data, error: fulfillmentError } = await supabase.rpc("fulfill_bkash_payment", {
      p_payment_id: paymentRecord.id,
      p_bkash_trx_id: transactionId,
    });
    if (fulfillmentError) {
      console.error("bKash fulfillment failed:", fulfillmentError);
      await supabase
        .from("payments")
        .update({
          metadata: {
            ...(paymentRecord.metadata ?? {}),
            fulfillmentError: fulfillmentError.message,
          },
        })
        .eq("id", paymentRecord.id)
        .eq("status", "pending");
      return redirect(req, "error=fulfillment_pending");
    }

    const fulfillment = (Array.isArray(data) ? data[0] : data) as FulfillmentResult | undefined;
    if (!fulfillment) {
      return redirect(req, "error=fulfillment_pending");
    }

    if (fulfillment.fulfilled_now) {
      try {
        if (fulfillment.fulfilled_payment_type === "extra_tests") {
          await sendSlotsAddedEmail(
            fulfillment.fulfilled_user_id,
            fulfillment.fulfilled_slots,
            "extra"
          );
        } else if (
          fulfillment.fulfilled_plan_type &&
          fulfillment.fulfilled_subscription_id &&
          fulfillment.fulfilled_expires_at
        ) {
          await deliverAccountApprovalNotifications({
            userId: fulfillment.fulfilled_user_id,
            planType: fulfillment.fulfilled_plan_type,
            expiresAt: fulfillment.fulfilled_expires_at,
            subscriptionId: fulfillment.fulfilled_subscription_id,
          });
        }
      } catch (notificationError: unknown) {
        // Entitlement fulfillment has already committed. A notification outage
        // must not turn a successful paid plan into a failed callback.
        console.error("Paid plan notification failed:", notificationError);
      }
    }

    return redirect(req, "success=true");
  } catch (error: unknown) {
    console.error("bKash callback error:", errorMessage(error));
    // Keep the payment pending: bKash may have executed it even if the response
    // timed out, and a later callback can query and fulfill it safely.
    return redirect(req, "error=payment_verification_pending");
  }
}
