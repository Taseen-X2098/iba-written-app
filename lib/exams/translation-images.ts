import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/api/errors";
import { hashWriterToken } from "@/lib/exams/attempts";
import type { TranslationAnswerImagePreview } from "@/lib/types";

export const TRANSLATION_IMAGE_BUCKET = "translation-answer-images";
const SIGNED_URL_LIFETIME_SECONDS = 4 * 60 * 60;

type TranslationAnswerImageRow = {
  id: string;
  exam_question_id: string;
  page_index: number;
  storage_path: string;
};

function translationOperationError(error: { message: string }) {
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
  if (error.message.includes("INVALID_TRANSLATION_QUESTION")) {
    return new ApiError(
      "VALIDATION_ERROR",
      "Only translation-answer photos can use this human-grading upload route.",
      400,
    );
  }
  if (error.message.includes("OCR_OPERATION_NOT_ACTIVE")) {
    return new ApiError(
      "CONFLICT",
      "This page-photo upload is no longer active. Please select the images again.",
      409,
    );
  }
  return error;
}

export async function beginTranslationImageOperation(input: {
  operationId: string;
  attemptId: string;
  examQuestionId: string;
  userId: string;
  writerToken: string;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("begin_translation_image_operation", {
    p_operation_id: input.operationId,
    p_attempt_id: input.attemptId,
    p_exam_question_id: input.examQuestionId,
    p_user_id: input.userId,
    p_writer_token_hash: hashWriterToken(input.writerToken),
  });
  if (error) throw translationOperationError(error);
  return Array.isArray(data) ? data[0] : data;
}

export async function replaceTranslationAnswerImages(input: {
  operationId: string;
  attemptId: string;
  examQuestionId: string;
  userId: string;
  writerToken: string;
  rows: Array<{ pageIndex: number; storagePath: string }>;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("replace_translation_answer_images", {
    p_operation_id: input.operationId,
    p_attempt_id: input.attemptId,
    p_exam_question_id: input.examQuestionId,
    p_user_id: input.userId,
    p_writer_token_hash: hashWriterToken(input.writerToken),
    p_rows: input.rows.map((row) => ({
      page_index: row.pageIndex,
      storage_path: row.storagePath,
    })),
  });
  if (error) throw translationOperationError(error);
  return Array.isArray(data)
    ? data.filter((path): path is string => typeof path === "string")
    : [];
}

export async function getTranslationAnswerImagePreviews(attemptId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("translation_answer_images")
    .select("id, exam_question_id, page_index, storage_path")
    .eq("attempt_id", attemptId)
    .order("page_index", { ascending: true });
  if (error) throw error;

  const signedRows = await Promise.all((data ?? []).map(async (row: TranslationAnswerImageRow) => {
    const { data: signed, error: signedError } = await admin.storage
      .from(TRANSLATION_IMAGE_BUCKET)
      .createSignedUrl(row.storage_path, SIGNED_URL_LIFETIME_SECONDS);
    if (signedError) throw signedError;
    return {
      examQuestionId: row.exam_question_id,
      image: {
        id: row.id,
        pageIndex: row.page_index,
        url: signed.signedUrl,
      } satisfies TranslationAnswerImagePreview,
    };
  }));

  return signedRows.reduce<Record<string, TranslationAnswerImagePreview[]>>((grouped, row) => {
    (grouped[row.examQuestionId] ??= []).push(row.image);
    return grouped;
  }, {});
}
