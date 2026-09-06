jest.mock("server-only", () => ({}));

import { canAccessExamAudience, canStartOfficialExam, isExamPlan } from "./access";

describe("exam plan access", () => {
  it.each([
    [null, false],
    ["plan_1", false],
    ["plan_2", true],
    ["plan_3", true],
  ] as const)("maps %s to %s", (planType, expected) => {
    expect(isExamPlan(planType)).toBe(expected);
  });
});

describe("exam audience access", () => {
  it("preserves normal exam access", () => {
    expect(canAccessExamAudience({
      isMagnusOnly: false,
      isAdmin: false,
      isApprovedMagnus: false,
    })).toBe(true);
  });

  it("hides Magnus exams from unapproved students", () => {
    expect(canAccessExamAudience({
      isMagnusOnly: true,
      isAdmin: false,
      isApprovedMagnus: false,
    })).toBe(false);
  });

  it("allows approved Magnus students and admins", () => {
    expect(canAccessExamAudience({
      isMagnusOnly: true,
      isAdmin: false,
      isApprovedMagnus: true,
    })).toBe(true);
    expect(canAccessExamAudience({
      isMagnusOnly: true,
      isAdmin: true,
      isApprovedMagnus: false,
    })).toBe(true);
  });
});

describe("official exam plan access", () => {
  it("lets every signed-in student start a free exam", () => {
    expect(canStartOfficialExam({ isFree: true, hasActiveExamPlan: false })).toBe(true);
  });

  it("preserves the active-plan requirement for regular exams", () => {
    expect(canStartOfficialExam({ isFree: false, hasActiveExamPlan: true })).toBe(true);
    expect(canStartOfficialExam({ isFree: false, hasActiveExamPlan: false })).toBe(false);
  });
});
