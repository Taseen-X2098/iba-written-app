"use client";

import { useState } from "react";
import { Crown, Check, AlertCircle, Plus, Loader2, Sparkles, TrendingUp, ChevronDown } from "lucide-react";
import type { Subscription } from "@/lib/types";
import { useRouter } from "next/navigation";

interface Props {
  activeSubscription: Subscription | null;
  freeTestsRemaining: number;
  success?: boolean;
  error?: string;
  planPaymentFormUrl: string;
  slotsPaymentFormUrl: string;
}

const PLANS = [
  {
    id: "plan_1",
    name: "Basic Practice",
    price: 499,
    description: "Perfect for regular practice",
    features: [
      "300 AI-graded tests per month",
      "Detailed highlighting feedback",
      "Topic-wise analytics",
      "No weekly exams",
    ],
  },
  {
    id: "plan_2",
    name: "Complete Prep",
    price: 699,
    description: "Everything you need to ace the exam",
    isPopular: true,
    features: [
      "300 AI-graded tests per month",
      "Access to all Weekly Exams",
      "Detailed highlighting feedback",
      "Topic-wise analytics",
      "Priority grading speed",
    ],
  },
  {
    id: "plan_3",
    name: "Exams Only",
    price: 299,
    description: "For testing your limits",
    features: [
      "Access to all Weekly Exams",
      "0 practice tests included",
      "Detailed highlighting feedback",
      "Topic-wise analytics",
    ],
  },
];

export default function SubscriptionClient({
  activeSubscription,
  freeTestsRemaining,
  success,
  error,
  planPaymentFormUrl,
  slotsPaymentFormUrl,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [extraSlots, setExtraSlots] = useState<number>(10);

  const totalRemaining = 
    (activeSubscription?.tests_remaining || 0) + 
    (activeSubscription?.extra_tests_purchased || 0) + 
    freeTestsRemaining;

  const handleCheckout = async (purchaseType: "plan" | "extra_slots", planId?: string) => {
    setLoading(purchaseType === "plan" ? (planId as string) : "extra");
    
    try {
      const res = await fetch("/api/bkash/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseType,
          planId,
          slots: purchaseType === "extra_slots" ? extraSlots : undefined,
        }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to initialize checkout");
      
      // Redirect to bKash portal
      window.location.href = data.bkashURL;
    } catch (err: any) {
      alert(`Checkout Error: ${err.message}`);
      setLoading(null);
    }
  };

  const calculateUpgradeCost = (newPlanPrice: number) => {
    if (!activeSubscription || activeSubscription.plan_type === "plan_3") return newPlanPrice; // not upgrading from 1->2
    const oldPrice = activeSubscription.plan_type === "plan_1" ? 499 : (activeSubscription.plan_type === "plan_2" ? 699 : 299);
    if (newPlanPrice <= oldPrice) return newPlanPrice; // downgrade/same plan handled by backend (prevented)
    
    // Quick frontend estimation (backend does exact calc based on current date)
    const diff = newPlanPrice - oldPrice;
    return `~${Math.ceil(diff * 0.5)} (prorated)`; // Very rough visual estimate
  };

  const canBuySlots = activeSubscription && (activeSubscription.plan_type === "plan_1" || activeSubscription.plan_type === "plan_2");

  return (
    <div className="px-4 py-6 lg:px-8 max-w-6xl mx-auto animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Crown className="text-brand-600" /> Subscription & Limits
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your plans and buy extra test slots.
          </p>
        </div>
      </div>

      {success && (
        <div className="mb-8 rounded-xl bg-green-50 border border-green-200 p-4 text-green-700 flex items-start gap-3">
          <Check className="shrink-0 mt-0.5" size={20} />
          <div>
            <h4 className="font-bold">Payment Successful!</h4>
            <p className="text-sm mt-1">Your account has been updated with your new plan or slots.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-8 rounded-xl bg-destructive/10 border border-destructive/20 p-4 text-destructive flex items-start gap-3">
          <AlertCircle className="shrink-0 mt-0.5" size={20} />
          <div>
            <h4 className="font-bold">Payment Failed</h4>
            <p className="text-sm mt-1">{decodeURIComponent(error)}</p>
          </div>
        </div>
      )}

      {/* Current Usage Bar */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-12 shadow-sm">
        <h3 className="text-lg font-bold text-foreground mb-4">Current Usage</h3>
        <div className="flex flex-col md:flex-row gap-8 items-start md:items-center">
          <div className="flex-1 w-full">
            <div className="flex justify-between text-sm font-medium mb-2">
              <span className="text-muted-foreground">Tests Remaining</span>
              <span className="text-foreground text-lg">{totalRemaining} <span className="text-sm font-normal text-muted-foreground">tests</span></span>
            </div>
            
            {/* Visual gradient bar for limits */}
            <div className="h-4 w-full bg-muted rounded-full overflow-hidden flex">
              <div 
                className={`h-full transition-all duration-1000 ${
                  totalRemaining > 50 ? 'bg-green-500' : totalRemaining > 20 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${Math.min((totalRemaining / 300) * 100, 100)}%` }}
              />
            </div>
            
            <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
              {activeSubscription && (
                <span>Plan: {PLANS.find(p => p.id === activeSubscription.plan_type)?.name || activeSubscription.plan_type}</span>
              )}
              {freeTestsRemaining > 0 && <span>Free: {freeTestsRemaining}</span>}
              {(activeSubscription?.extra_tests_purchased || 0) > 0 && <span>Extra: {activeSubscription?.extra_tests_purchased}</span>}
            </div>
          </div>

          <div className="shrink-0 bg-brand-50 border border-brand-100 rounded-xl p-5 w-full md:w-auto md:min-w-[280px]">
            <h4 className="text-sm font-bold text-brand-900 mb-1 flex items-center gap-1.5">
              <Plus size={16} /> Need more slots?
            </h4>
            <p className="text-xs text-brand-700 mb-3">Buy extra tests for 5 ৳ each.</p>
            {canBuySlots ? (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative w-full sm:w-auto">
                  <select 
                    value={extraSlots}
                    onChange={(e) => setExtraSlots(Number(e.target.value))}
                    className="bg-white border border-brand-200 text-brand-900 rounded-lg pl-3 pr-10 py-2.5 sm:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none relative z-10 w-full"
                  >
                    <option value={10}>10 Tests (50 ৳)</option>
                    <option value={20}>20 Tests (100 ৳)</option>
                    <option value={50}>50 Tests (250 ৳)</option>
                    <option value={100}>100 Tests (500 ৳)</option>
                  </select>
                  <ChevronDown size={16} className="text-brand-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none z-0" />
                </div>
                <button
                  onClick={() => window.open(slotsPaymentFormUrl, "_blank")}
                  className="bg-brand-600 text-white rounded-lg px-4 py-2.5 sm:py-2 text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50 w-full sm:w-auto"
                >
                  Buy Now
                </button>
              </div>
            ) : (
              <div className="bg-white/60 border border-brand-200 text-brand-800 rounded-lg px-3 py-2 text-xs font-medium text-center">
                Requires Basic Practice or Complete Prep plan to purchase extra slots.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Plans */}
      <h3 className="text-xl font-bold text-foreground mb-6">Choose a Plan</h3>
      <div className="grid md:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const isCurrentPlan = activeSubscription?.plan_type === plan.id;
          const isDowngrade = activeSubscription?.plan_type === "plan_2" && (plan.id === "plan_1" || plan.id === "plan_3");
          const isUpgrade = activeSubscription?.plan_type === "plan_1" && plan.id === "plan_2";
          
          return (
            <div 
              key={plan.id}
              className={`relative bg-card border rounded-2xl p-6 flex flex-col ${
                plan.isPopular ? 'border-brand-500 shadow-md shadow-brand-100/50' : 'border-border'
              } ${isCurrentPlan ? 'ring-2 ring-brand-500/20 bg-brand-50/10' : ''}`}
            >
              {plan.isPopular && (
                <div className="absolute top-0 right-6 -translate-y-1/2">
                  <span className="bg-brand-500 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full flex items-center gap-1">
                    <Sparkles size={12} /> Most Popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-foreground">{plan.price} ৳</span>
                  <span className="text-sm text-muted-foreground font-medium">/mo</span>
                </div>
              </div>

              <div className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                    <Check size={16} className="text-brand-500 shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => window.open(planPaymentFormUrl, "_blank")}
                disabled={isCurrentPlan || isDowngrade}
                className={`w-full py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  isCurrentPlan 
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : isDowngrade
                    ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                    : plan.isPopular
                    ? 'bg-brand-600 text-white hover:bg-brand-700 shadow-md shadow-brand-200'
                    : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                }`}
              >
                {isCurrentPlan ? (
                  "Current Plan"
                ) : isDowngrade ? (
                  "Downgrade not allowed"
                ) : isUpgrade ? (
                  <>Upgrade ({calculateUpgradeCost(plan.price)} ৳) <TrendingUp size={16}/></>
                ) : (
                  "Subscribe"
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
