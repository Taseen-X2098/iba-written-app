import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBkashClient } from "@/lib/bkash/client";
import { randomUUID } from "crypto";

const PLAN_PRICES = {
  plan_1: 499,
  plan_2: 699,
  plan_3: 299,
};

function getFridaysLeftInMonth(date = new Date()): number {
  let count = 0;
  const currentMonth = date.getMonth();
  const d = new Date(date);
  
  while (d.getMonth() === currentMonth) {
    if (d.getDay() === 5) { // Friday
      count++;
    }
    d.setDate(d.getDate() + 1);
  }
  return count;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { purchaseType, planId, slots } = await req.json();

  let amount = 0;
  let finalPlan = planId;
  
  // 1. Calculate amount
  if (purchaseType === "extra_slots") {
    if (!slots || slots <= 0) return NextResponse.json({ error: "Invalid slots" }, { status: 400 });
    amount = slots * 5; // 5tk per test
  } else if (purchaseType === "plan") {
    if (!PLAN_PRICES[planId as keyof typeof PLAN_PRICES]) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // Check if upgrading
    const { data: activeSub } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (activeSub && activeSub.plan_type !== planId) {
      // Upgrading logic
      const currentPrice = PLAN_PRICES[activeSub.plan_type as keyof typeof PLAN_PRICES];
      const newPrice = PLAN_PRICES[planId as keyof typeof PLAN_PRICES];
      
      if (newPrice > currentPrice) {
        const diff = newPrice - currentPrice;
        const fridaysLeft = getFridaysLeftInMonth(new Date());
        amount = Math.ceil(diff * (fridaysLeft / 4));
      } else {
         return NextResponse.json({ error: "Downgrades are not allowed." }, { status: 400 });
      }
    } else if (activeSub && activeSub.plan_type === planId) {
      // Renewing same plan (assuming it expires soon or they just want to buy again)
      amount = PLAN_PRICES[planId as keyof typeof PLAN_PRICES];
    } else {
      // New subscription
      amount = PLAN_PRICES[planId as keyof typeof PLAN_PRICES];
    }
  } else {
    return NextResponse.json({ error: "Invalid purchase type" }, { status: 400 });
  }

  // Ensure amount is valid
  if (amount <= 0) {
    return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
  }

  // 2. Create Payment Intent in DB
  const invoiceId = `INV-${Date.now().toString().slice(-6)}-${randomUUID().slice(0, 4)}`;
  
  const { data: paymentRecord, error: dbError } = await supabase
    .from("payments")
    .insert({
      user_id: user.id,
      amount: amount,
      payment_type: purchaseType,
      plan_type: purchaseType === "plan" ? finalPlan : null,
      status: "pending",
      metadata: { slots: purchaseType === "extra_slots" ? slots : null, invoiceId },
    })
    .select("id")
    .single();

  if (dbError || !paymentRecord) {
    return NextResponse.json({ error: "Failed to create payment record" }, { status: 500 });
  }

  // 3. Initiate bKash Payment
  try {
    const bkash = getBkashClient();
    const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const callbackURL = `${origin}/api/bkash/callback?payment_id=${paymentRecord.id}`;
    
    // We use the user's phone or email as payer reference. Payer ref can't be too long, uuid is 36 chars.
    const payerReference = user.phone || user.id.slice(0, 20);

    const bkashRes = await bkash.createPayment({
      amount: amount.toString(),
      payerReference: payerReference,
      callbackURL: callbackURL,
      merchantInvoiceNumber: invoiceId,
    });

    if (bkashRes.statusCode !== "0000") {
      throw new Error(bkashRes.statusMessage || "bKash returned an error");
    }

    // Update DB with bkash_payment_id
    await supabase
      .from("payments")
      .update({ bkash_payment_id: bkashRes.paymentID })
      .eq("id", paymentRecord.id);

    // Return the URL for the frontend to redirect to
    return NextResponse.json({ bkashURL: bkashRes.bkashURL });
  } catch (error: any) {
    console.error("bKash Create Payment Error:", error);
    
    // Mark payment as failed in DB
    await supabase
      .from("payments")
      .update({ status: "failed", metadata: { error: error.message } })
      .eq("id", paymentRecord.id);

    return NextResponse.json({ error: "Payment gateway error" }, { status: 502 });
  }
}
