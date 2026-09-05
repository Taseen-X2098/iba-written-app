import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { requireAdminUser } from "@/lib/auth";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { manualGradeSchema } from "@/lib/exams/contracts";
import { createAdminClient } from "@/lib/supabase/server";
import { floorMarkToHalf, formatScore, MARK_NORMALIZATION_VERSION } from "@/lib/grading/marks";
import {
  composeStudentFeedbackSummary,
  type GradingResult,
  type ResponsesClient,
} from "@/lib/grading/grade";
import { createMockClient } from "@/lib/grading/mockClient";
import { prepareManualLearnerProfilePlan, recordLearnerProfileUpdate } from "@/lib/learning/profile";
import { wakeGradingWorker } from "@/lib/grading/jobs";
import { drainProgressionReportQueue } from "@/lib/learning/report-jobs";
import { parseJsonRequest } from "@/lib/api/request";

function joinedRecord(value: unknown): Record<string, unknown> | null {
  const record = Array.isArray(value) ? value[0] : value;
  return record && typeof record === "object" ? record as Record<string, unknown> : null;
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminUser();
    const input = await parseJsonRequest(request, manualGradeSchema, {
      maxBytes: 1_000_000,
      message: "Invalid manual grade",
    });
    const { submissionId, highlights } = input;
    const admin = await createAdminClient();
    const { data: submission, error } = await admin
      .from("exam_submissions")
      .select("user_id, edited_text, grading_result, exam_questions(marks, questions(category))")
      .eq("id", submissionId)
      .single();
    if (error || !submission) throw new ApiError("VALIDATION_ERROR", "Submission not found", 404);
    const examQuestion = joinedRecord(submission.exam_questions);
    const marks = examQuestion?.marks;
    if (typeof marks !== "number" || input.score > marks) {
      throw new ApiError("VALIDATION_ERROR", `Score must be between 0 and ${marks ?? 0}`, 400);
    }
    const score = floorMarkToHalf(input.score, marks);
    const text = submission.edited_text ?? "";
    const safeHighlights = highlights.filter((highlight) => highlight.quote && text.includes(highlight.quote));
    const remarks = input.remarks ?? input.summary!;
    const waysToImprove = input.waysToImprove
      ?? "Apply the administrator's remarks in the next response, then complete a focused sentence-level proofread.";
    const priorFeedback = (submission.grading_result as GradingResult | null)?.studentFeedback;
    const baseResult: GradingResult = {
      internal: {
        total: score,
        max: marks,
        normalizationVersion: MARK_NORMALIZATION_VERSION,
        criteria: [],
      },
      studentFeedback: {
        score: formatScore(score, marks),
        summary: composeStudentFeedbackSummary({
          remarks,
          personalizedFeedback: "",
          waysToImprove,
        }),
        remarks,
        waysToImprove,
        grammarErrors: priorFeedback?.grammarErrors,
        highlights: safeHighlights,
      },
    };
    const category = joinedRecord(examQuestion?.questions)?.category;
    if (!submission.user_id || typeof category !== "string") {
      throw new ApiError("VALIDATION_ERROR", "Submission learner data is incomplete", 409);
    }
    let profilePlan: Awaited<ReturnType<typeof prepareManualLearnerProfilePlan>> | null = null;
    if (category !== "translation") {
      const useMock = process.env.USE_MOCK_GRADER === "true";
      const client: ResponsesClient = useMock
        ? createMockClient({ taskType: category, marks, submission: text })
        : (new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) as unknown as ResponsesClient);
      profilePlan = await prepareManualLearnerProfilePlan({
        client,
        useMock,
        userId: submission.user_id,
        category,
        submission: text,
        result: baseResult,
      });
    }
    const gradingResult = profilePlan?.result ?? baseResult;
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
    let reportEnqueued = false;
    try {
      if (!profilePlan) {
        return NextResponse.json({ success: true, gradingResult });
      }
      const profileRecord = await recordLearnerProfileUpdate({
        userId: submission.user_id,
        sourceKind: "official_exam",
        sourceId: submissionId,
        category,
        plan: profilePlan,
      });
      reportEnqueued = profileRecord.reportEnqueued;
    } catch (profileError) {
      console.error("Unable to record learner profile after manual grade", profileError);
    }
    if (reportEnqueued) {
      const woke = await wakeGradingWorker();
      if (!woke && process.env.NODE_ENV !== "production") {
        void drainProgressionReportQueue({ batchSize: 2 });
      }
    }
    return NextResponse.json({ success: true, gradingResult });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
