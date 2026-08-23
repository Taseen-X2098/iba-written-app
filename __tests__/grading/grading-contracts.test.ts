import { adminGradingJobSchema, manualGradeSchema } from "@/lib/exams/contracts";

const examId = "10000000-0000-4000-8000-000000000001";
const submissionId = "20000000-0000-4000-8000-000000000002";

describe("official grading contracts", () => {
  it("rejects every request to AI-regrade an existing final grade", () => {
    expect(adminGradingJobSchema.safeParse({
      examId,
      submissionIds: [submissionId],
      scope: "selected",
      allowRegrade: true,
    }).success).toBe(false);
  });

  it("accepts separate manual feedback sections while reserving personalization for AI", () => {
    const parsed = manualGradeSchema.parse({
      submissionId,
      score: 7.5,
      remarks: "The central claim is relevant and clear.",
      waysToImprove: "Support the second paragraph with a concrete example.",
      highlights: [],
    });

    expect(parsed).toMatchObject({
      remarks: "The central claim is relevant and clear.",
      waysToImprove: "Support the second paragraph with a concrete example.",
    });
    expect(parsed).not.toHaveProperty("personalizedFeedback");
  });
});
