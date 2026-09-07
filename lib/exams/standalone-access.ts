import "server-only";

import { ApiError } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * A question assigned to any exam stays out of standalone OCR and grading
 * until that exam's results are published. This protects unpublished drafts
 * from direct-ID probing too. Official attempts use the attempt-bound OCR
 * path, so this cannot be bypassed with an id copied from an exam payload.
 */
export async function requireStandaloneQuestionNotEmbargoed(questionId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("exam_questions")
    .select("id, exams!inner(results_published)")
    .eq("question_id", questionId)
    .eq("exams.results_published", false)
    .limit(1);
  if (error) throw error;
  if (data?.length) {
    throw new ApiError(
      "RESULTS_EMBARGOED",
      "This question is part of an unreleased official exam and is not available for standalone OCR or grading yet.",
      403,
    );
  }
}
