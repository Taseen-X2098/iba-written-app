/**
 * Comprehensive test suite for the usage/quota system.
 * Tests plan configurations, type definitions, and constants.
 */
import { PLAN_CONFIG, EXTRA_TEST_PRICE, FREE_TESTS_ON_SIGNUP, CATEGORY_LABELS, DIFFICULTY_LABELS } from "@/lib/types";
import type { PlanType, QuestionCategory, Difficulty, Subscription, Profile, Question, Exam, ExamResult } from "@/lib/types";

// ─── Plan Configuration Tests ────────────────────────────────────────────────

describe("PLAN_CONFIG", () => {
  it("has exactly 3 plans", () => {
    expect(Object.keys(PLAN_CONFIG)).toHaveLength(3);
    expect(PLAN_CONFIG).toHaveProperty("plan_1");
    expect(PLAN_CONFIG).toHaveProperty("plan_2");
    expect(PLAN_CONFIG).toHaveProperty("plan_3");
  });

  it("Plan 1 (Practice) has correct pricing and features", () => {
    const plan = PLAN_CONFIG.plan_1;
    expect(plan.name).toBe("Practice Plan");
    expect(plan.price).toBe(499);
    expect(plan.testsPerMonth).toBe(300);
    expect(plan.weeklyExams).toBe(false);
  });

  it("Plan 2 (Complete) has correct pricing and features", () => {
    const plan = PLAN_CONFIG.plan_2;
    expect(plan.name).toBe("Complete Plan");
    expect(plan.price).toBe(699);
    expect(plan.testsPerMonth).toBe(300);
    expect(plan.weeklyExams).toBe(true);
  });

  it("Plan 3 (Exam Only) has correct pricing and features", () => {
    const plan = PLAN_CONFIG.plan_3;
    expect(plan.name).toBe("Exam Plan");
    expect(plan.price).toBe(299);
    expect(plan.testsPerMonth).toBe(0);
    expect(plan.weeklyExams).toBe(true);
  });

  it("upgrade from Plan 1 to Plan 2 costs 200tk more per month", () => {
    const diff = PLAN_CONFIG.plan_2.price - PLAN_CONFIG.plan_1.price;
    expect(diff).toBe(200);
  });

  it("Plan 3 is cheaper than Plan 1 (exam-only is budget option)", () => {
    expect(PLAN_CONFIG.plan_3.price).toBeLessThan(PLAN_CONFIG.plan_1.price);
  });

  it("extra test price is 5 taka", () => {
    expect(EXTRA_TEST_PRICE).toBe(5);
  });

  it("free tests on signup is 3", () => {
    expect(FREE_TESTS_ON_SIGNUP).toBe(3);
  });
});

// ─── Category & Difficulty Labels ────────────────────────────────────────────

describe("CATEGORY_LABELS", () => {
  it("covers all question categories", () => {
    const categories: QuestionCategory[] = [
      "quote_analysis", "creative_writing", "personal_reflection",
      "story_completion", "translation", "basic_paragraph"
    ];
    categories.forEach(cat => {
      expect(CATEGORY_LABELS[cat]).toBeTruthy();
      expect(typeof CATEGORY_LABELS[cat]).toBe("string");
    });
  });

  it("uses the approved writing-category display names", () => {
    expect(CATEGORY_LABELS.creative_writing).toBe("Story Writting");
    expect(CATEGORY_LABELS.story_completion).toBe("Story Completion");
  });
});

describe("DIFFICULTY_LABELS", () => {
  it("covers all difficulty levels", () => {
    const difficulties: Difficulty[] = ["easy", "medium", "hard", "very_hard"];
    difficulties.forEach(d => {
      expect(DIFFICULTY_LABELS[d]).toBeTruthy();
    });
  });
});

// ─── Type Shape Tests (compile-time + runtime) ───────────────────────────────

describe("Type shape validation", () => {
  it("Subscription type has required fields", () => {
    const sub: Subscription = {
      id: "test-id",
      user_id: "user-123",
      plan_type: "plan_1",
      tests_remaining: 300,
      extra_tests_purchased: 0,
      starts_at: new Date().toISOString(),
      expires_at: new Date().toISOString(),
      is_active: true,
      created_at: new Date().toISOString(),
    };
    expect(sub.tests_remaining).toBe(300);
    expect(sub.is_active).toBe(true);
  });

  it("Exam type has time_limit_minutes field (admin-set)", () => {
    const exam: Exam = {
      id: "exam-1",
      title: "Weekly Exam 1",
      description: null,
      time_limit_minutes: 45,
      starts_at: new Date().toISOString(),
      ends_at: new Date().toISOString(),
      is_published: true,
      results_published: false,
      results_version: 0,
      is_magnus_only: false,
      is_free: false,
      created_by: "admin-id",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(exam.time_limit_minutes).toBe(45);
    expect(exam.is_published).toBe(true);
    expect(exam.results_published).toBe(false);
  });

  it("Profile type has free_tests_remaining and is_admin", () => {
    const profile: Profile = {
      id: "user-1",
      name: "Test Student",
      institute: "IBA DU",
      phone: null,
      free_tests_remaining: 3,
      tips_enabled: true,
      is_admin: false,
      last_active_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(profile.free_tests_remaining).toBe(3);
    expect(profile.is_admin).toBe(false);
  });

  it("Question type has marks and max_images fields", () => {
    const q: Question = {
      id: "q-1",
      category: "argumentative_essay" as any,
      marks: 15,
      difficulty: "hard",
      source: null,
      prompt: "Should AI replace teachers?",
      space_hint: "2 pages",
      max_images: 2,
      is_active: true,
      created_at: new Date().toISOString(),
      created_by: null,
    };
    expect(q.marks).toBe(15);
    expect(q.max_images).toBe(2);
  });
});
