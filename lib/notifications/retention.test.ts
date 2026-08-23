import { buildPersonalizedRetentionCopy, choosePracticeHook } from "./retention";

describe("retention notification personalization", () => {
  it("builds an honest, actionable reminder from the student's latest history", () => {
    const copy = buildPersonalizedRetentionCopy({
      name: "Ayesha Rahman",
      phase: "expiring",
      days: 5,
      totalGraded: 7,
      category: "argumentative_essay",
      snapshot: {
        recentWin: "Your main claim is clearer than it was in earlier answers.",
        focusArea: "Examples are still too general to prove the main point.",
        nextStep: "Add one exact example after each main reason.",
      },
    });

    expect(copy.title).toBe("Your plan ends in 5 days");
    expect(copy.message).toContain("Argumentative Essay history");
    expect(copy.details).toContain("You completed 7 graded answers");
    expect(copy.details).toContain("What is going well");
    expect(copy.details).toContain("What still needs work");
    expect(copy.details).toContain("Your next best step");
    expect(copy.actionUrl).toBe("/subscription");
  });

  it("does not invent a diagnosis when the student has no usable history", () => {
    const copy = buildPersonalizedRetentionCopy({
      name: "Nabil",
      phase: "lapsed",
      days: 5,
      totalGraded: 0,
      category: null,
      snapshot: null,
    });

    expect(copy.message).toContain("not enough answer history for a fair skill diagnosis");
    expect(copy.details).toContain("rather be honest than give you generic praise");
    expect(copy.details).not.toContain("What is going well");
  });

  it("selects hook lines deterministically for an event and student", () => {
    const hooks = ["First", "Second", "Third"];
    expect(choosePracticeHook(hooks, "practice:2026-08-24:user-1"))
      .toBe(choosePracticeHook(hooks, "practice:2026-08-24:user-1"));
    expect(choosePracticeHook([], "seed")).toBeNull();
  });
});
