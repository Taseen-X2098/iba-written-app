import { PLAN_CONFIG } from "@/lib/types";
import type { PaymentType, PlanType } from "@/lib/types";

const SUBSCRIPTION_TERM_MS = 30 * 24 * 60 * 60 * 1_000;

export class PlanTransitionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "PlanTransitionError";
  }
}

export interface ActivePlanForTransition {
  id: string;
  plan_type: PlanType;
  expires_at: string;
}

export interface PlanPurchaseQuote {
  amount: number;
  paymentType: Extract<PaymentType, "subscription" | "upgrade">;
  sourceSubscriptionId: string | null;
}

export function quotePlanPurchase(
  activeSubscription: ActivePlanForTransition | null,
  targetPlan: PlanType,
  now = new Date()
): PlanPurchaseQuote {
  const targetPrice = PLAN_CONFIG[targetPlan].price;

  if (!activeSubscription) {
    return {
      amount: targetPrice,
      paymentType: "subscription",
      sourceSubscriptionId: null,
    };
  }

  if (activeSubscription.plan_type === targetPlan) {
    throw new PlanTransitionError("This plan is already active.", 409);
  }

  const isSupportedUpgrade =
    targetPlan === "plan_2" &&
    (activeSubscription.plan_type === "plan_1" || activeSubscription.plan_type === "plan_3");
  if (!isSupportedUpgrade) {
    throw new PlanTransitionError(
      "This plan switch is available after the current plan expires.",
      400
    );
  }

  const currentPrice = PLAN_CONFIG[activeSubscription.plan_type].price;
  const remainingMs = Math.max(
    0,
    new Date(activeSubscription.expires_at).getTime() - now.getTime()
  );
  const remainingFraction = Math.min(1, remainingMs / SUBSCRIPTION_TERM_MS);
  const amount = Math.max(1, Math.ceil((targetPrice - currentPrice) * remainingFraction));

  return {
    amount,
    paymentType: "upgrade",
    sourceSubscriptionId: activeSubscription.id,
  };
}
