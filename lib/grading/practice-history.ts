import type { GradingResultJSON } from "@/lib/types";

type PracticeHistoryAttempt = {
  started_at: string;
  submitted_at: string | null;
  expires_at: string;
};

export function buildPracticeHistorySubmission(input: {
  gradingItemId: string;
  userId: string;
  questionId: string;
  draft: { ocrText?: string; editedText?: string };
  result: GradingResultJSON;
  attempt: PracticeHistoryAttempt;
}) {
  const startedAt = Date.parse(input.attempt.started_at);
  const endedAt = Date.parse(input.attempt.submitted_at ?? input.attempt.expires_at);
  const timeTakenSeconds = Number.isFinite(startedAt) && Number.isFinite(endedAt)
    ? Math.max(0, Math.round((endedAt - startedAt) / 1_000))
    : 0;

  return {
    user_id: input.userId,
    question_id: input.questionId,
    ocr_text: input.draft.ocrText ?? "",
    edited_text: input.draft.editedText ?? "",
    time_taken_seconds: timeTakenSeconds,
    grading_result: input.result,
    graded_by: "ai" as const,
    is_exam_submission: true,
    practice_grading_item_id: input.gradingItemId,
    created_at: input.attempt.submitted_at ?? new Date().toISOString(),
  };
}
