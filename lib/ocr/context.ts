import { z } from "zod";
import { requireQuestionAccess } from "@/lib/auth";
import { ApiError } from "@/lib/api/errors";
import { requireAttemptWriter } from "@/lib/exams/attempts";
import { createAdminClient } from "@/lib/supabase/server";
import type { ExamAttemptMode } from "@/lib/types";
import { requireStandaloneQuestionNotEmbargoed } from "@/lib/exams/standalone-access";

const uuid = z.string().uuid();

export interface OcrContext {
  contextKey: string;
  questionId: string | null;
  attemptId: string | null;
  examQuestionId: string | null;
  writerToken: string | null;
  attemptMode: ExamAttemptMode | null;
  attemptExpiresAt: string | null;
  questionMarks: number | null;
}

export async function resolveOcrContext(
  formData: FormData,
  userId: string,
  requestStartedAt = Date.now(),
  options: { allowReservedOperationAfterExpiry?: boolean } = {},
): Promise<OcrContext> {
  const questionId = formData.get("questionId");
  const attemptId = formData.get("attemptId");
  const examQuestionId = formData.get("examQuestionId");
  const writerToken = formData.get("writerToken");
  const hasExamContext = attemptId !== null || examQuestionId !== null || writerToken !== null;

  if (!hasExamContext) {
    const parsedQuestionId = uuid.safeParse(questionId);
    if (!parsedQuestionId.success) {
      throw new ApiError("VALIDATION_ERROR", "A valid question is required for OCR", 400);
    }
    await requireQuestionAccess(parsedQuestionId.data);
    await requireStandaloneQuestionNotEmbargoed(parsedQuestionId.data);
    const admin = await createAdminClient();
    const { data: question, error } = await admin
      .from("questions")
      .select("id, category, is_active")
      .eq("id", parsedQuestionId.data)
      .eq("is_active", true)
      .single();
    if (error || !question || question.category === "translation") {
      throw new ApiError("VALIDATION_ERROR", "Question is not available for OCR", 404);
    }
    return {
      contextKey: `standalone:${parsedQuestionId.data}`,
      questionId: parsedQuestionId.data,
      attemptId: null,
      examQuestionId: null,
      writerToken: null,
      attemptMode: null,
      attemptExpiresAt: null,
      questionMarks: null,
    };
  }

  const parsed = z.object({
    attemptId: uuid,
    examQuestionId: uuid,
    writerToken: z.string().min(16).max(512),
  }).safeParse({ attemptId, examQuestionId, writerToken });
  if (!parsed.success || questionId !== null) {
    throw new ApiError("VALIDATION_ERROR", "Invalid exam OCR context", 400);
  }

  const attempt = await requireAttemptWriter(
    parsed.data.attemptId,
    userId,
    parsed.data.writerToken,
  );
  if (attempt.status !== "active") {
    throw new ApiError("ATTEMPT_NOT_ACTIVE", "The exam attempt is locked", 409);
  }
  // Judge a last-second upload by when this server request began, not by how
  // long authentication or multipart parsing happened to take.
  if (
    !options.allowReservedOperationAfterExpiry
    && requestStartedAt > new Date(attempt.expires_at).getTime()
  ) {
    throw new ApiError("ATTEMPT_EXPIRED", "The exam time has ended", 409);
  }

  const admin = await createAdminClient();
  const { data: examQuestion, error } = await admin
    .from("exam_questions")
    .select("id, marks, questions(category)")
    .eq("id", parsed.data.examQuestionId)
    .eq("exam_id", attempt.exam_id)
    .single();
  if (error || !examQuestion) {
    throw new ApiError("VALIDATION_ERROR", "Question does not belong to this exam", 400);
  }
  const joinedQuestion = Array.isArray(examQuestion.questions)
    ? examQuestion.questions[0]
    : examQuestion.questions;
  if (joinedQuestion?.category === "translation") {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Translation answers are stored as images for human grading and are never sent to OCR.",
      409,
    );
  }
  return {
    contextKey: `exam:${attempt.id}:${examQuestion.id}`,
    questionId: null,
    attemptId: attempt.id,
    examQuestionId: examQuestion.id,
    writerToken: parsed.data.writerToken,
    attemptMode: attempt.mode,
    attemptExpiresAt: attempt.expires_at,
    questionMarks: examQuestion.marks,
  };
}
