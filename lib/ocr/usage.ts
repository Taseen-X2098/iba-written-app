import { createAdminClient } from "@/lib/supabase/server";

export interface OcrRequestReservation {
  id: string;
  request_token: string;
  status: "pending" | "succeeded" | "failed";
  extracted_text: string | null;
}

function normalizeReservation(data: unknown): OcrRequestReservation {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== "object") {
    throw new Error("OCR reservation did not return a row");
  }
  return value as OcrRequestReservation;
}

export async function reserveOcrRequest(input: {
  userId: string;
  contextKey: string;
  questionId: string | null;
  attemptId: string | null;
  examQuestionId: string | null;
  imageSha256: string;
  requestToken: string;
}) {
  const admin = await createAdminClient();
  const { data, error } = await admin.rpc("reserve_ocr_request", {
    p_user_id: input.userId,
    p_context_key: input.contextKey,
    p_question_id: input.questionId,
    p_attempt_id: input.attemptId,
    p_exam_question_id: input.examQuestionId,
    p_image_sha256: input.imageSha256,
    p_request_token: input.requestToken,
  });
  if (error) throw error;
  return normalizeReservation(data);
}

export async function completeOcrRequest(input: {
  requestId: string;
  userId: string;
  requestToken: string;
  success: boolean;
  extractedText?: string;
}) {
  const admin = await createAdminClient();
  const { error } = await admin.rpc("complete_ocr_request", {
    p_request_id: input.requestId,
    p_user_id: input.userId,
    p_request_token: input.requestToken,
    p_success: input.success,
    p_extracted_text: input.extractedText ?? null,
  });
  if (error) throw error;
}
