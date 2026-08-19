import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { manualGradeSchema } from "@/lib/exams/contracts";
import { createAdminClient } from "@/lib/supabase/server";
import { floorMarkToHalf, formatScore, MARK_NORMALIZATION_VERSION } from "@/lib/grading/marks";
import type { GradingResult } from "@/lib/grading/grade";
import { prepareManualLearnerProfilePlan, recordLearnerProfileUpdate } from "@/lib/learning/profile";

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser();
    const parsed = manualGradeSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Invalid manual grade", 400, parsed.error.flatten());
    const { submissionId, summary, highlights } = parsed.data;
    const admin = await createAdminClient();
    const { data: submission, error } = await admin
      .from("exam_submissions")
      .select("user_id, edited_text, exam_questions(marks, questions(category))")
      .eq("id", submissionId)
      .single();
    if (error || !submission) throw new ApiError("VALIDATION_ERROR", "Submission not found", 404);
    const marks = (submission.exam_questions as any)?.marks;
    if (typeof marks !== "number" || parsed.data.score > marks) {
      throw new ApiError("VALIDATION_ERROR", `Score must be between 0 and ${marks ?? 0}`, 400);
    }
    const score = floorMarkToHalf(parsed.data.score, marks);
    const text = submission.edited_text ?? "";
    const safeHighlights = highlights.filter((highlight) => highlight.quote && text.includes(highlight.quote));
    const gradingResult: GradingResult = {
      internal: {
        total: score,
        max: marks,
        normalizationVersion: MARK_NORMALIZATION_VERSION,
        criteria: [],
      },
      studentFeedback: { score: formatScore(score, marks), summary, highlights: safeHighlights },
    };
    const { error: saveError } = await admin.rpc("save_manual_exam_grade", {
      p_submission_id: submissionId,
      p_grading_result: gradingResult,
    });
    if (saveError) {
      if (saveError.message.includes("INVALID_GRADE")) {
        throw new ApiError("VALIDATION_ERROR", `Score must be between 0 and ${marks}`, 400);
      }
      throw saveError;
    }
    const category = (submission.exam_questions as any)?.questions?.category;
    if (submission.user_id && typeof category === "string") {
      try {
        const profilePlan = await prepareManualLearnerProfilePlan({
          userId: submission.user_id,
          category,
          submission: text,
          result: gradingResult,
        });
        await recordLearnerProfileUpdate({
          userId: submission.user_id,
          sourceKind: "official_exam",
          sourceId: submissionId,
          category,
          plan: profilePlan,
        });
      } catch (profileError) {
        console.error("Unable to record learner profile after manual grade", profileError);
      }
    }
    return NextResponse.json({ success: true, gradingResult });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
