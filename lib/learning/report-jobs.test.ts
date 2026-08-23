import { buildDeterministicProgressionReport } from "./report-jobs";
import { sanitizeProgressionReport } from "./progression";

describe("type-scoped progression reports", () => {
  it("recognizes recurring weaknesses and positively demonstrated fixes", () => {
    const report = buildDeterministicProgressionReport({
      submissionType: "argumentative_essay",
      updates: [
        { id: "1", score: "5/10", createdAt: "2026-08-01" },
        { id: "2", score: "6/10", createdAt: "2026-08-02" },
        { id: "3", score: "7/10", createdAt: "2026-08-03" },
      ],
      events: [
        { update_id: "1", skill_key: "grammar_accuracy", signal: "weakness", severity: 2, description: "Agreement errors reduce clarity.", evidence: "People is", created_at: "2026-08-01" },
        { update_id: "2", skill_key: "grammar_accuracy", signal: "weakness", severity: 2, description: "Agreement errors recur.", evidence: "They was", created_at: "2026-08-02" },
        { update_id: "1", skill_key: "thesis_clarity", signal: "weakness", severity: 2, description: "The thesis was implicit.", evidence: "There are reasons", created_at: "2026-08-01" },
        { update_id: "3", skill_key: "thesis_clarity", signal: "strength", severity: 3, description: "The position is now explicit.", evidence: "The policy should change", created_at: "2026-08-03" },
      ],
    });

    expect(report.title).toContain("Argumentative Essay");
    expect(report.growthAreas.some((item) => item.skill === "grammar accuracy")).toBe(true);
    expect(report.resolvedWins.some((item) => item.skill === "thesis clarity")).toBe(true);
    expect(report.resolvedWins[0].insight).toContain("Congratulations");
    expect(report.overview.split("\n\n")).toHaveLength(2);
    expect(report.trajectory).toBe("improving");
    expect(report.title).toBe("Argumentative Essay Progress Report");
    expect(report.nextSteps[0].action).toContain("future Argumentative Essay responses");
    expect(report.nextSteps[0].action).not.toContain("Check agreement");
  });

  it("replaces submission-specific actions in reports generated before category scoping", () => {
    const report = sanitizeProgressionReport({
      title: "Personal Progression Report",
      overview: "Evidence integration is a recurring issue across recent responses.",
      trajectory: "steady",
      strengths: [],
      growth_areas: [{
        skill: "evidence integration",
        insight: "Support remains too general across responses.",
        evidence: "",
      }],
      resolved_wins: [],
      next_steps: [{
        action: "Revise the three marked errors and add an example to this essay.",
        reason: "The latest answer needs more detail.",
        example_line: "",
      }],
    }, {
      submissionTypeLabel: "Argumentative Essay",
      promptVersion: "type-scoped-v1",
    });

    expect(report?.title).toBe("Argumentative Essay Progress Report");
    expect(report?.nextSteps[0].action).toContain("future Argumentative Essay responses");
    expect(report?.nextSteps[0].action).not.toContain("marked errors");
    expect(report?.nextSteps[0].action).not.toContain("this essay");
  });
});
