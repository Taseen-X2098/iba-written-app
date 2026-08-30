jest.mock("server-only", () => ({}));

import { canAccessExamAudience } from "./access";

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
