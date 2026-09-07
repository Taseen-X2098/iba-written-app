import { ApiError } from "@/lib/api/api-error";
import { hashWriterToken } from "@/lib/exams/attempts";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ExamOcrOperation {
  id: string;
  attempt_id: string;
  exam_question_id: string;
  user_id: string;
  status: "pending" | "succeeded" | "failed";
  extracted_text: string | null;
  started_at: string;
  lease_expires_at: string;
  completed_at: string | null;
}

function normalizeOperation(data: unknown): ExamOcrOperation {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== "object") {
    throw new Error("Exam OCR operation did not return a row");
  }
  return value as ExamOcrOperation;
}

function operationError(error: { message: string }) {
  if (error.message.includes("WRITER_REVOKED")) {
    return new ApiError(
      "WRITER_REVOKED",
      "This session is read-only because the exam was taken over on another device.",
      409,
    );
  }
  if (error.message.includes("ATTEMPT_EXPIRED")) {
    return new ApiError("ATTEMPT_EXPIRED", "The final network grace period has ended", 409);
  }
  if (error.message.includes("ATTEMPT_NOT_ACTIVE")) {
    return new ApiError("ATTEMPT_NOT_ACTIVE", "The exam attempt is locked", 409);
  }
  if (error.message.includes("INVALID_OCR_QUESTION")) {
    return new ApiError("VALIDATION_ERROR", "Question is not available for OCR", 400);
  }
  if (error.message.includes("OCR_OPERATION_NOT_ACTIVE")) {
    return new ApiError(
      "CONFLICT",
      "This page scan is no longer active. Please select the image again.",
      409,
    );
  }
  return error;
}

export async function beginExamOcrOperation(input: {
  operationId: string;
  attemptId: string;
  examQuestionId: string;
  userId: string;
  writerToken: string;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("begin_exam_ocr_operation", {
    p_operation_id: input.operationId,
    p_attempt_id: input.attemptId,
    p_exam_question_id: input.examQuestionId,
    p_user_id: input.userId,
    p_writer_token_hash: hashWriterToken(input.writerToken),
  });
  if (error) throw operationError(error);
  return normalizeOperation(data);
}

export async function finishExamOcrOperation(input: {
  operationId: string;
  userId: string;
  success: boolean;
  extractedText?: string;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("finish_exam_ocr_operation", {
    p_operation_id: input.operationId,
    p_user_id: input.userId,
    p_success: input.success,
    p_extracted_text: input.extractedText ?? null,
  });
  if (error) throw operationError(error);
  return normalizeOperation(data);
}

export async function requirePendingExamOcrOperation(input: {
  operationId: string;
  attemptId: string;
  examQuestionId: string;
  userId: string;
  writerToken: string;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("exam_ocr_operations")
    .select("id, attempt_id, exam_question_id, user_id, status, extracted_text, started_at, lease_expires_at, completed_at")
    .eq("id", input.operationId)
    .eq("attempt_id", input.attemptId)
    .eq("exam_question_id", input.examQuestionId)
    .eq("user_id", input.userId)
    .eq("writer_token_hash", hashWriterToken(input.writerToken))
    .eq("status", "pending")
    .gt("lease_expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new ApiError(
      "CONFLICT",
      "This page scan is no longer active. Please select the image again.",
      409,
    );
  }
  return data as ExamOcrOperation;
}
