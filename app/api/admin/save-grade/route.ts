import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { manualGradeSchema } from "@/lib/exams/contracts";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser();
    const parsed = manualGradeSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Invalid manual grade", 400, parsed.error.flatten());
    const { submissionId, score, summary, highlights } = parsed.data;
    const admin = await createAdminClient();
    const { data: submission, error } = await admin
      .from("exam_submissions")
      .select("edited_text, exam_questions(marks)")
      .eq("id", submissionId)
      .single();
    if (error || !submission) throw new ApiError("VALIDATION_ERROR", "Submission not found", 404);
    const marks = (submission.exam_questions as any)?.marks;
    if (typeof marks !== "number" || score > marks) {
      throw new ApiError("VALIDATION_ERROR", `Score must be between 0 and ${marks ?? 0}`, 400);
    }
    const text = submission.edited_text ?? "";
    const safeHighlights = highlights.filter((highlight) => highlight.quote && text.includes(highlight.quote));
    const gradingResult = {
      internal: { total: score, max: marks, criteria: [] },
      studentFeedback: { score: `${score}/${marks}`, summary, highlights: safeHighlights },
    };
    const { error: saveError } = await admin
      .from("exam_submissions")
      .update({ grading_result: gradingResult, graded_by: "admin" })
      .eq("id", submissionId);
    if (saveError) throw saveError;
    return NextResponse.json({ success: true, gradingResult });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

