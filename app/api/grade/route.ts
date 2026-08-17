import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import OpenAI from "openai";
import { requireApiUser } from "@/lib/auth";
import { ApiError, apiErrorResponse } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/server";
import { grade, type ResponsesClient } from "@/lib/grading/grade";
import { createMockClient } from "@/lib/grading/mockClient";

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
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Invalid grading submission", 400, parsed.error.flatten());
    const input = parsed.data;
    const admin = await createAdminClient();
    const { data: question, error: questionError } = await admin
      .from("questions")
      .select("id, category, marks, is_active")
      .eq("id", input.questionId)
      .eq("is_active", true)
      .single();
    if (questionError || !question) throw new ApiError("VALIDATION_ERROR", "Question not found", 404);
    if (question.category === "translation") throw new ApiError("VALIDATION_ERROR", "Translation requires manual review", 409);

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
      return NextResponse.json({ gradingResult: existing?.grading_result, idempotent: true });
    }
    if (charge.status !== "reserved") {
      throw new ApiError("VALIDATION_ERROR", "This failed grading request must be retried as a new attempt", 409);
    }

    const client: ResponsesClient = process.env.USE_MOCK_GRADER === "true"
      ? createMockClient({ taskType: question.category, marks: question.marks, submission: input.submissionText })
      : (new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) as unknown as ResponsesClient);
    const result = await grade(client, input.submissionText, question.category, question.marks);
    const { error: completeError } = await admin.rpc("complete_standalone_grade", {
      p_charge_id: chargeId,
      p_user_id: user.id,
      p_question_id: question.id,
      p_ocr_text: input.ocrText,
      p_edited_text: input.submissionText,
      p_time_taken_seconds: input.timeTakenSeconds,
      p_grading_result: result,
    });
    if (completeError) throw completeError;

    revalidatePath("/history");
    revalidatePath("/progress");
    return NextResponse.json({ gradingResult: result });
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

