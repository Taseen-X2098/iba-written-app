import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import OpenAI from "openai";
import { requireApiUser, requireQuestionAccess } from "@/lib/auth";
import { ApiError, apiErrorResponse } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/server";
import { grade, type ResponsesClient } from "@/lib/grading/grade";
import { createMockClient } from "@/lib/grading/mockClient";
import { rubricSourceForGrader } from "@/lib/grading/config";
import { prepareLearnerProfilePlan, recordLearnerProfileUpdate } from "@/lib/learning/profile";
import { getPersonalProgressionCard } from "@/lib/learning/progression";
import { drainProgressionReportQueue } from "@/lib/learning/report-jobs";
import { wakeGradingWorker } from "@/lib/grading/jobs";
import { getWordLimitViolation } from "@/lib/answers/word-limit";
import { parseJsonRequest } from "@/lib/api/request";
import { enforceRateLimit } from "@/lib/api/rate-limit";

const schema = z.object({
  questionId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  submissionText: z.string().trim().min(1).max(100_000),
  ocrText: z.string().max(100_000).default(""),
  timeTakenSeconds: z.number().int().min(0).max(86_400).default(0),
});

export async function POST(request: NextRequest) {
  let chargeId: string | null = null;
  try {
    const user = await requireApiUser();
    const input = await parseJsonRequest(request, schema, {
      maxBytes: 250_000,
      message: "Invalid grading submission",
    });
    await enforceRateLimit({
      key: `grade:${user.id}`,
      limit: 12,
      windowSeconds: 60,
      message: "Too many grading requests. Wait a minute before trying again.",
    });
    await requireQuestionAccess(input.questionId);
    const admin = await createAdminClient();
    const { data: question, error: questionError } = await admin
      .from("questions")
      .select("id, category, marks, prompt, is_active")
      .eq("id", input.questionId)
      .eq("is_active", true)
      .single();
    if (questionError || !question) throw new ApiError("VALIDATION_ERROR", "Question not found", 404);
    if (question.category === "translation") throw new ApiError("VALIDATION_ERROR", "Translation requires manual review", 409);
    const wordLimitViolation = getWordLimitViolation(input.submissionText, question.marks);
    if (wordLimitViolation) {
      throw new ApiError(
        "VALIDATION_ERROR",
        `Answer exceeds the ${wordLimitViolation.wordLimit}-word limit (${wordLimitViolation.wordCount} words). Shorten it before submitting.`,
        400,
        wordLimitViolation,
      );
    }
    const useMockGrader = process.env.USE_MOCK_GRADER === "true";
    const rubricSource = rubricSourceForGrader(useMockGrader);

    const { data: rawCharge, error: reserveError } = await admin.rpc("reserve_standalone_usage", {
      p_user_id: user.id,
      p_question_id: question.id,
      p_idempotency_key: input.idempotencyKey,
    });
    if (reserveError) {
      if (reserveError.message.includes("INSUFFICIENT_SLOTS")) throw new ApiError("INSUFFICIENT_SLOTS", "No test slots remain", 403);
      throw reserveError;
    }
    const charge = (Array.isArray(rawCharge) ? rawCharge[0] : rawCharge) as any;
    chargeId = charge.id;
    if (charge.status === "consumed" && charge.submission_id) {
      const { data: existing } = await admin.from("submissions").select("grading_result").eq("id", charge.submission_id).single();
      let personalProgressionReport = null;
      try {
        personalProgressionReport = await getPersonalProgressionCard({
          userId: user.id,
          submissionType: question.category,
        });
      } catch (progressionError) {
        console.error("Unable to load progression card for idempotent grade", progressionError);
      }
      return NextResponse.json({
        gradingResult: existing?.grading_result,
        personalProgressionReport,
        idempotent: true,
      });
    }
    if (charge.status !== "reserved") {
      throw new ApiError("VALIDATION_ERROR", "This failed grading request must be retried as a new attempt", 409);
    }

    const client: ResponsesClient = useMockGrader
      ? createMockClient({ taskType: question.category, marks: question.marks, submission: input.submissionText })
      : (new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) as unknown as ResponsesClient);
    const rawResult = await grade(client, input.submissionText, question.category, question.marks, {
      rubricSource,
      questionPrompt: question.prompt,
    });
    const profilePlan = await prepareLearnerProfilePlan({
      client,
      useMock: useMockGrader,
      userId: user.id,
      category: question.category,
      submission: input.submissionText,
      result: rawResult,
    });
    const result = profilePlan.result;
    const { data: submissionId, error: completeError } = await admin.rpc("complete_standalone_grade", {
      p_charge_id: chargeId,
      p_user_id: user.id,
      p_question_id: question.id,
      p_ocr_text: input.ocrText,
      p_edited_text: input.submissionText,
      p_time_taken_seconds: input.timeTakenSeconds,
      p_grading_result: result,
    });
    if (completeError) throw completeError;

    let reportEnqueued = false;
    try {
      const profileRecord = await recordLearnerProfileUpdate({
        userId: user.id,
        sourceKind: "standalone",
        sourceId: String(submissionId),
        category: question.category,
        plan: profilePlan,
      });
      reportEnqueued = profileRecord.reportEnqueued;
    } catch (profileError) {
      // The grade is already durable and the slot is consumed. Profile
      // enrichment is deliberately best-effort and must not refund it.
      console.error("Unable to record learner profile after standalone grade", profileError);
    }

    if (reportEnqueued) {
      const woke = await wakeGradingWorker();
      if (!woke && process.env.NODE_ENV !== "production") {
        void drainProgressionReportQueue({ batchSize: 2 });
      }
    }

    let personalProgressionReport = null;
    try {
      personalProgressionReport = await getPersonalProgressionCard({
        userId: user.id,
        submissionType: question.category,
        currentSnapshot: profilePlan.progressionSnapshot,
      });
    } catch (progressionError) {
      console.error("Unable to load progression card after grade", progressionError);
    }

    revalidatePath("/history");
    revalidatePath("/progress");
    revalidatePath("/personal-report");
    return NextResponse.json({ gradingResult: result, personalProgressionReport });
  } catch (error) {
    if (chargeId) {
      try {
        const admin = await createAdminClient();
        await admin.rpc("release_standalone_usage", { p_charge_id: chargeId });
      } catch (releaseError) {
        console.error("Failed to release grading reservation", releaseError);
      }
    }
    return apiErrorResponse(error);
  }
}
