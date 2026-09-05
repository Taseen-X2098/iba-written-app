import { quotePlanPurchase, PlanTransitionError } from "./transitions";

const NOW = new Date("2026-09-06T00:00:00.000Z");

function activePlan(plan_type: "plan_1" | "plan_2" | "plan_3", daysLeft = 30) {
  return {
    id: `subscription-${plan_type}`,
    plan_type,
    expires_at: new Date(NOW.getTime() + daysLeft * 24 * 60 * 60 * 1_000).toISOString(),
  };
}

describe("plan purchase transitions", () => {
  it("charges the full plan price when there is no live subscription", () => {
    expect(quotePlanPurchase(null, "plan_1", NOW)).toEqual({
      amount: 499,
      paymentType: "subscription",
      sourceSubscriptionId: null,
    });
  });

  it("quotes a time-prorated Plan 1 to Plan 2 upgrade", () => {
    expect(quotePlanPurchase(activePlan("plan_1", 15), "plan_2", NOW)).toEqual({
      amount: 100,
      paymentType: "upgrade",
      sourceSubscriptionId: "subscription-plan_1",
    });
  });

  it("supports Exams Only to Complete Prep as a true feature upgrade", () => {
    expect(quotePlanPurchase(activePlan("plan_3", 30), "plan_2", NOW)).toEqual({
      amount: 400,
      paymentType: "upgrade",
      sourceSubscriptionId: "subscription-plan_3",
    });
  });

  it("rejects repurchasing the currently active plan", () => {
    expect(() => quotePlanPurchase(activePlan("plan_1"), "plan_1", NOW)).toThrow(
      new PlanTransitionError("This plan is already active.", 409)
    );
  });

  it.each([
    ["plan_2", "plan_1"],
    ["plan_2", "plan_3"],
    ["plan_1", "plan_3"],
    ["plan_3", "plan_1"],
  ] as const)("rejects unsupported %s to %s switching", (current, target) => {
    expect(() => quotePlanPurchase(activePlan(current), target, NOW)).toThrow(
      "This plan switch is available after the current plan expires."
    );
  });
});
