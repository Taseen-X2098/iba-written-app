import { renderToStaticMarkup } from "react-dom/server";
import { PersonalProgressionCard } from "./personal-progression-card";
import type { PersonalProgressionCardDTO } from "@/lib/types";

describe("PersonalProgressionCard", () => {
  it("renders aggregate category patterns instead of a latest-submission snapshot", () => {
    const report: PersonalProgressionCardDTO = {
      locked: false,
      submissionType: "argumentative_essay",
      submissionTypeLabel: "Argumentative Essay",
      totalGraded: 3,
      latestReport: {
        title: "Argumentative Essay Progress Report",
        overview: "Across recent argumentative essays, the position is consistently clear while supporting evidence remains uneven.",
        trajectory: "steady",
        strengths: [{
          skill: "thesis clarity",
          insight: "Clear positions recur across the category.",
          evidence: "",
        }],
        growthAreas: [{
          skill: "evidence integration",
          insight: "Concrete support is the recurring priority across responses.",
          evidence: "",
        }],
        resolvedWins: [],
        nextSteps: [{
          action: "Plan one concrete example for each main reason on future questions.",
          reason: "This strengthens support across the category.",
          exampleLine: "[Example] demonstrates [effect].",
        }],
      },
    };

    const html = renderToStaticMarkup(<PersonalProgressionCard report={report} />);

    expect(html).toContain("Argumentative Essay Progress Report");
    expect(html).toContain("Patterns across this question category");
    expect(html).toContain("Clear positions recur across the category.");
    expect(html).not.toContain("Recent win");
    expect(html).not.toContain("Current focus");
  });

  it("shows report readiness instead of presenting one answer as a category pattern", () => {
    const report: PersonalProgressionCardDTO = {
      locked: false,
      submissionType: "argumentative_essay",
      submissionTypeLabel: "Argumentative Essay",
      totalGraded: 1,
      latestReport: null,
    };

    const html = renderToStaticMarkup(<PersonalProgressionCard report={report} />);

    expect(html).toContain("needs 3 graded Argumentative Essay responses");
    expect(html).toContain("submit 2 more");
    expect(html).not.toContain("Recent win");
  });
});
