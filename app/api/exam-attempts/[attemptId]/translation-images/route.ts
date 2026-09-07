import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { validateAnswerImageEntries } from "@/lib/answers/image-validation";
import { parseRequestValue } from "@/lib/api/request";
import { ApiError, apiErrorResponse } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth";
import { uuidSchema } from "@/lib/exams/contracts";
import { requireAttemptWriter } from "@/lib/exams/attempts";
import { isAttemptWithinNetworkGrace } from "@/lib/exams/timing";
import {
  beginTranslationImageOperation,
  getTranslationAnswerImagePreviews,
  replaceTranslationAnswerImages,
  TRANSLATION_IMAGE_BUCKET,
} from "@/lib/exams/translation-images";
import { createAdminClient } from "@/lib/supabase/admin";
import { finishExamOcrOperation } from "@/lib/ocr/exam-operations";

const writerTokenSchema = z.string().min(32).max(256);

function joinedRecord(value: unknown): Record<string, unknown> | null {
  const record = Array.isArray(value) ? value[0] : value;
  return record && typeof record === "object" ? record as Record<string, unknown> : null;
}

async function removeUploadedObjects(paths: string[]) {
  if (!paths.length) return;
  const admin = createAdminClient();
  await admin.storage.from(TRANSLATION_IMAGE_BUCKET).remove(paths).catch(() => undefined);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ attemptId: string }> },
) {
  const uploadedPaths: string[] = [];
  let databaseCommitted = false;
  let operation: { id: string; userId: string } | null = null;
  let operationPending = false;
  let replacementStarted = false;
  let uploadsSafeToRemove = true;
  try {
    const user = await requireApiUser();
    const { attemptId: rawAttemptId } = await context.params;
    const attemptId = parseRequestValue(uuidSchema, rawAttemptId, "A valid attempt id is required");
    const formData = await request.formData();
    const writerToken = parseRequestValue(
      writerTokenSchema,
      formData.get("writerToken"),
      "A valid writer token is required",
    );
    const examQuestionId = parseRequestValue(
      uuidSchema,
      formData.get("examQuestionId"),
      "A valid exam question id is required",
    );
    const images = await validateAnswerImageEntries(formData.getAll("image"));
    const attempt = await requireAttemptWriter(attemptId, user.id, writerToken);

    if (attempt.status !== "active") {
      throw new ApiError("ATTEMPT_NOT_ACTIVE", "The exam attempt is locked", 409);
    }
    // Match draft/finalization grace: a request that was started just before
    // time ran out must still have enough time to finish transferring up to
    // two page photos. The attempt must remain active, so this does not permit
    // changing an answer after it has been finalized.
    if (!isAttemptWithinNetworkGrace(attempt.expires_at)) {
      throw new ApiError("ATTEMPT_EXPIRED", "The final network grace period has ended", 409);
    }

    const admin = createAdminClient();
    const { data: examQuestion, error: questionError } = await admin
      .from("exam_questions")
      .select("id, questions(category)")
      .eq("id", examQuestionId)
      .eq("exam_id", attempt.exam_id)
      .single();
    const question = joinedRecord(examQuestion?.questions);
    if (questionError || !examQuestion || question?.category !== "translation") {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Only translation-answer photos can use this human-grading upload route.",
        400,
      );
    }

    operation = { id: randomUUID(), userId: user.id };
    await beginTranslationImageOperation({
      operationId: operation.id,
      attemptId: attempt.id,
      examQuestionId: examQuestion.id,
      userId: user.id,
      writerToken,
    });
    operationPending = true;

    const replacementRows = [];
    for (const [index, image] of images.entries()) {
      const extension = image.type === "image/png" ? "png" : "jpg";
      const storagePath = `${user.id}/${attempt.id}/${examQuestion.id}/${index + 1}-${randomUUID()}.${extension}`;
      const { error: uploadError } = await admin.storage
        .from(TRANSLATION_IMAGE_BUCKET)
        .upload(storagePath, await image.arrayBuffer(), {
          cacheControl: "3600",
          contentType: image.type,
          upsert: false,
        });
      if (uploadError) throw uploadError;
      uploadedPaths.push(storagePath);
      replacementRows.push({
        attempt_id: attempt.id,
        exam_question_id: examQuestion.id,
        user_id: user.id,
        page_index: index + 1,
        storage_path: storagePath,
      });
    }

    replacementStarted = true;
    const oldPaths = await replaceTranslationAnswerImages({
      operationId: operation.id,
      attemptId: attempt.id,
      examQuestionId: examQuestion.id,
      userId: user.id,
      writerToken,
      rows: replacementRows.map((row) => ({
        pageIndex: row.page_index,
        storagePath: row.storage_path,
      })),
    });
    databaseCommitted = true;
    operationPending = false;
    await removeUploadedObjects(oldPaths.filter((path) => !uploadedPaths.includes(path)));

    const previews = await getTranslationAnswerImagePreviews(attempt.id);
    return NextResponse.json({
      manualReviewOnly: true,
      images: previews[examQuestion.id] ?? [],
    });
  } catch (error) {
    if (operation && operationPending) {
      if (replacementStarted) {
        try {
          const admin = createAdminClient();
          const { data: operationState, error: stateError } = await admin
            .from("exam_ocr_operations")
            .select("status")
            .eq("id", operation.id)
            .eq("user_id", operation.userId)
            .maybeSingle();
          if (stateError) {
            uploadsSafeToRemove = false;
          } else if (operationState?.status === "succeeded") {
            databaseCommitted = true;
            operationPending = false;
          }
        } catch {
          // A lost RPC response has an uncertain commit outcome. Preserve the
          // private objects rather than deleting files a committed row may use.
          uploadsSafeToRemove = false;
        }
      }
      if (operationPending && uploadsSafeToRemove) {
        await finishExamOcrOperation({
          operationId: operation.id,
          userId: operation.userId,
          success: false,
        }).catch(() => undefined);
      }
    }
    // If storage succeeded but the database replacement did not, avoid
    // leaving private orphan objects behind.
    if (uploadedPaths.length && !databaseCommitted && uploadsSafeToRemove) {
      await removeUploadedObjects(uploadedPaths);
    }
    return apiErrorResponse(error);
  }
}
