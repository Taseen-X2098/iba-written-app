import { buildPracticeHistorySubmission } from "./practice-history";
import type { GradingResultJSON } from "@/lib/types";

const result: GradingResultJSON = {
  internal: { total: 8, max: 10, criteria: [] },
  studentFeedback: {
    score: "8/10",
    summary: "Clear answer.",
    remarks: "Clear answer.",
    personalizedFeedback: "Keep building on this structure.",
    waysToImprove: "Add a more specific example.",
    grammarErrors: [],
    highlights: [],
  },
};

it("builds a durable history entry from a graded practice-exam answer", () => {
  expect(buildPracticeHistorySubmission({
    gradingItemId: "item-1",
    userId: "student-1",
    questionId: "question-1",
    draft: { ocrText: "OCR answer", editedText: "Edited answer" },
    result,
    attempt: {
      started_at: "2026-09-06T10:00:00.000Z",
      submitted_at: "2026-09-06T10:12:34.000Z",
      expires_at: "2026-09-06T10:30:00.000Z",
    },
  })).toEqual(expect.objectContaining({
    user_id: "student-1",
    question_id: "question-1",
    edited_text: "Edited answer",
    time_taken_seconds: 754,
    grading_result: result,
    is_exam_submission: true,
    practice_grading_item_id: "item-1",
  }));
});
