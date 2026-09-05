import type { Subscription } from "@/lib/types";
import { getUsageInfo } from "./subscription";

function subscription(overrides: Partial<Subscription>): Subscription {
  return {
    id: "subscription-id",
    user_id: "user-id",
    plan_type: "plan_1",
    tests_remaining: 300,
    extra_tests_purchased: 0,
    starts_at: "2026-09-01T00:00:00.000Z",
    expires_at: "2026-10-01T00:00:00.000Z",
    is_active: true,
    created_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("subscription usage display", () => {
  it("reports one 300-test allowance without multiplying it", () => {
    const usage = getUsageInfo(
      { free_tests_remaining: 3 },
      subscription({ plan_type: "plan_2", tests_remaining: 300, extra_tests_purchased: 7 })
    );

    expect(usage.planRemaining).toBe(300);
    expect(usage.extraRemaining).toBe(7);
    expect(usage.remaining).toBe(310);
    expect(usage.total).toBe(310);
  });

  it("keeps purchased extras visible after switching to Exams Only", () => {
    const usage = getUsageInfo(
      { free_tests_remaining: 2 },
      subscription({ plan_type: "plan_3", tests_remaining: 0, extra_tests_purchased: 11 })
    );

    expect(usage.planRemaining).toBe(0);
    expect(usage.extraRemaining).toBe(11);
    expect(usage.remaining).toBe(13);
    expect(usage.total).toBe(14);
    expect(usage.showUpgrade).toBe(true);
  });
});
