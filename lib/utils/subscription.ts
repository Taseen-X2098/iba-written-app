import type { Profile, Subscription } from "@/lib/types";

export interface UsageInfo {
  label: string;
  remaining: number;
  total: number;
  percentage: number;
  color: string;
  showUpgrade: boolean;
  expiresAt?: string;
  freeRemaining: number;
  extraRemaining: number;
  planRemaining: number;
}

export function getUsageColor(pct: number): string {
  if (pct > 60) return "bg-usage-green";
  if (pct > 40) return "bg-usage-yellow";
  if (pct > 20) return "bg-usage-orange";
  return "bg-usage-red";
}

export function getUsageInfo(
  profile: Pick<Profile, "free_tests_remaining"> | null,
  subscription: Subscription | null
): UsageInfo {
  const freeRemaining = profile?.free_tests_remaining ?? 3;
  
  // Free tier
  if (!subscription) {
    const total = 3;
    const remaining = freeRemaining;
    const pct = total > 0 ? (remaining / total) * 100 : 0;
    return {
      label: "Free Plan",
      remaining,
      total,
      percentage: pct,
      color: getUsageColor(pct),
      showUpgrade: remaining <= 1,
      freeRemaining,
      extraRemaining: 0,
      planRemaining: 0,
    };
  }

  // Plan with tests
  if (subscription.plan_type === "plan_1" || subscription.plan_type === "plan_2") {
    const planRemaining = subscription.tests_remaining;
    const extraRemaining = subscription.extra_tests_purchased;
    const remaining = planRemaining + extraRemaining + freeRemaining;
    
    // We consider the total as 300 base plan + extra + 3 base free tests
    const total = 300 + extraRemaining + 3; 
    
    const pct = total > 0 ? (remaining / total) * 100 : 0;
    return {
      label: subscription.plan_type === "plan_1" ? "Basic Practice" : "Complete Prep",
      remaining,
      total,
      percentage: pct,
      color: getUsageColor(pct),
      showUpgrade: pct <= 40,
      expiresAt: subscription.expires_at,
      freeRemaining,
      extraRemaining,
      planRemaining,
    };
  }

  // Plan 3 has no monthly practice allowance, but separately purchased tests
  // remain the student's property and are still consumable by the usage RPC.
  const extraRemaining = subscription.extra_tests_purchased;
  const total = extraRemaining + 3;
  const remaining = extraRemaining + freeRemaining;
  const pct = total > 0 ? (remaining / total) * 100 : 0;
  return {
    label: "Exams Only",
    remaining: remaining,
    total: total,
    percentage: pct,
    color: getUsageColor(pct),
    showUpgrade: true,
    expiresAt: subscription.expires_at,
    freeRemaining,
    extraRemaining,
    planRemaining: 0,
  };
}
