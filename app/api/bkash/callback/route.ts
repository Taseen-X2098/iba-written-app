import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getBkashClient } from "@/lib/bkash/client";
import { sendPlanActivatedEmail, sendSlotsAddedEmail } from "@/lib/email/brevo";
import type { PlanType } from "@/lib/types";

export async function GET(req: NextRequest) {
  // We use the admin client because the callback might not have the user's cookies attached
  // (depending on how bKash redirects, e.g., in a different context). But typically it does.
  // Using admin client to safely update DB records regardless of session state.
  const supabase = await createAdminClient();
  
  const searchParams = req.nextUrl.searchParams;
  const status = searchParams.get("status");
  const bkashPaymentID = searchParams.get("paymentID");
  const internalPaymentId = searchParams.get("payment_id"); // our DB id

  if (!bkashPaymentID || !internalPaymentId) {
    return NextResponse.redirect(new URL("/subscription?error=missing_params", req.url));
  }

  // 1. Fetch our internal payment record
  const { data: paymentRecord, error: fetchError } = await supabase
    .from("payments")
    .select("*")
    .eq("id", internalPaymentId)
    .single();

  if (fetchError || !paymentRecord) {
    return NextResponse.redirect(new URL("/subscription?error=payment_not_found", req.url));
  }

  // 1b. Idempotency Check
  if (paymentRecord.status === "completed") {
    return NextResponse.redirect(new URL("/subscription?success=true", req.url));
  }

  // 2. Handle failure or cancel
  if (status !== "success") {
    await supabase
      .from("payments")
      .update({ status: status === "cancel" ? "failed" : "failed" })
      .eq("id", paymentRecord.id);
      
    return NextResponse.redirect(new URL(`/subscription?error=${status}`, req.url));
  }

  // 3. Status is success, execute the payment
  try {
    const bkash = getBkashClient();
    const executed = await bkash.executePayment(bkashPaymentID);

    if (executed.statusCode !== "0000") {
      // Payment execution failed
      await supabase
        .from("payments")
        .update({ status: "failed", metadata: { ...paymentRecord.metadata, executeError: executed.statusMessage } })
        .eq("id", paymentRecord.id);
        
      return NextResponse.redirect(new URL(`/subscription?error=${encodeURIComponent(executed.statusMessage || "execution_failed")}`, req.url));
    }

    // 4. Payment Executed Successfully!
    await supabase
      .from("payments")
      .update({ 
        status: "completed", 
        bkash_trx_id: executed.trxID 
      })
      .eq("id", paymentRecord.id);

    // 5. Fulfill the purchase (update subscription)
    if (paymentRecord.payment_type === "extra_slots") {
      const slotsToAdd = paymentRecord.metadata.slots || 0;
      
      // Get current active subscription if any
      const { data: activeSub } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", paymentRecord.user_id)
        .eq("is_active", true)
        .limit(1)
        .single();

      if (activeSub) {
        const { error: slotsUpdateError } = await supabase
          .from("subscriptions")
          .update({ extra_tests_purchased: activeSub.extra_tests_purchased + slotsToAdd })
          .eq("id", activeSub.id);
        if (slotsUpdateError) throw slotsUpdateError;
      } else {
        // No active subscription, we just create a dummy one for extra slots or update profile
        // But our schema expects subscriptions to hold extra tests.
        // Let's create an "extra_only" plan or just use plan3 without tests_remaining.
        const expiry = new Date();
        expiry.setFullYear(expiry.getFullYear() + 1); // 1 year expiry for extra slots without plan
        
        const { error: slotsInsertError } = await supabase
          .from("subscriptions")
          .insert({
            user_id: paymentRecord.user_id,
            plan_type: "plan_3", // arbitrary since it's just extra slots
            tests_remaining: 0,
            extra_tests_purchased: slotsToAdd,
            expires_at: expiry.toISOString(),
            is_active: true
          });
        if (slotsInsertError) throw slotsInsertError;
      }
      await sendSlotsAddedEmail(paymentRecord.user_id, slotsToAdd, "extra");
    } else if (paymentRecord.payment_type === "plan") {
      // It's a plan subscription
      // Get old sub to carry over extra tests
      const { data: oldSub } = await supabase.from("subscriptions").select("extra_tests_purchased").eq("user_id", paymentRecord.user_id).eq("is_active", true).single();
      const carriedOverExtra = oldSub ? (oldSub.extra_tests_purchased || 0) : 0;

      // Deactivate old subscription
      const { error: deactivateError } = await supabase
        .from("subscriptions")
        .update({ is_active: false })
        .eq("user_id", paymentRecord.user_id)
        .eq("is_active", true);
      if (deactivateError) throw deactivateError;

      // Create new one. 30 days from now.
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + 30);
      
      const isPlan1 = paymentRecord.plan_type === "plan_1";
      const isPlan2 = paymentRecord.plan_type === "plan_2";
      // plan1 = 300 tests, plan2 = 300 tests, plan3 = 0 tests (weekly only)
      const tests = (isPlan1 || isPlan2) ? 300 : 0;

      const { error: planInsertError } = await supabase
        .from("subscriptions")
        .insert({
          user_id: paymentRecord.user_id,
          plan_type: paymentRecord.plan_type,
          tests_remaining: tests,
          extra_tests_purchased: carriedOverExtra,
          expires_at: expiry.toISOString(),
          is_active: true
        });
      if (planInsertError) throw planInsertError;
      await sendPlanActivatedEmail(paymentRecord.user_id, paymentRecord.plan_type as PlanType, expiry.toISOString());
    }

    // Success redirect
    return NextResponse.redirect(new URL("/subscription?success=true", req.url));

  } catch (error: any) {
    console.error("bKash Execute Error:", error);
    // In case of a timeout during execute, we could queryPayment later, but for now we mark failed.
    return NextResponse.redirect(new URL("/subscription?error=internal_error", req.url));
  }
}
