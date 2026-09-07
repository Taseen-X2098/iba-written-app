import { createAdminClient } from "@/lib/supabase/admin";
import { getRedis, CacheKeys } from "@/lib/redis";
import { ApiError } from "@/lib/api/api-error";
import {
  assertAttemptDraftWordLimits,
  getAttempt,
  getAttemptDrafts,
  getAvailableTestSlots,
  hashWriterToken,
  requireAttemptWriter,
} from "@/lib/exams/attempts";

async function getFinalizationDrafts(attemptId: string, examId: string) {
  let cachedDrafts: Awaited<ReturnType<typeof getAttemptDrafts>> = {};
  try {
    cachedDrafts = await getAttemptDrafts(attemptId);
  } catch (error) {
    // Postgres drafts and completed OCR operations are authoritative. A cache
    // outage must not strand an otherwise finalizable timed attempt.
    console.error("Unable to read the exam draft resume cache during finalization:", error);
  }
  return assertAttemptDraftWordLimits(attemptId, examId, cachedDrafts);
}

async function clearFinalizedDraftCache(attemptId: string) {
  try {
    await getRedis().del(CacheKeys.attemptDrafts(attemptId));
  } catch (error) {
    // Finalization is already committed. Cache cleanup is best-effort and a
    // retry will observe the idempotent finalized attempt.
    console.error("Unable to clear the finalized exam draft cache:", error);
  }
}

export async function finalizeOfficialAttempt(input: {
  attemptId: string;
  userId?: string;
  writerToken?: string;
  requireExpired?: boolean;
}) {
  const attempt = input.userId && input.writerToken
    ? await requireAttemptWriter(input.attemptId, input.userId, input.writerToken)
    : await getAttempt(input.attemptId, input.userId);

  if (attempt.mode !== "official") {
    throw new ApiError("VALIDATION_ERROR", "This is not an official attempt", 400);
  }
  if (attempt.status === "finalized") {
    return { alreadyFinalized: true, attempt };
  }
  if (input.requireExpired && Date.now() < new Date(attempt.expires_at).getTime()) {
    throw new ApiError("ATTEMPT_NOT_ACTIVE", "The attempt has not expired", 409);
  }

  const admin = await createAdminClient();
  const drafts = await getFinalizationDrafts(attempt.id, attempt.exam_id);
  const { data: finalizedData, error: finalizeError } = await admin.rpc("finalize_exam_attempt_durable", {
    p_attempt_id: attempt.id,
    p_user_id: input.userId ?? null,
    p_writer_token_hash: input.writerToken ? hashWriterToken(input.writerToken) : null,
    p_cached_drafts: drafts,
  });
  if (finalizeError) {
    if (finalizeError.message.includes("WRITER_REVOKED")) throw new ApiError("WRITER_REVOKED", "This writer was revoked", 409);
    if (finalizeError.message.includes("ATTEMPT_EXPIRED")) throw new ApiError("ATTEMPT_EXPIRED", "The final network grace period has ended", 409);
    if (finalizeError.message.includes("OCR_PENDING")) {
      throw new ApiError(
        "OCR_PENDING",
        "A page photo is still being scanned. Finalization will continue automatically when it finishes.",
        409,
      );
    }
    throw finalizeError;
  }
  const finalized = Array.isArray(finalizedData) ? finalizedData[0] : finalizedData;

  await clearFinalizedDraftCache(attempt.id);
  return { alreadyFinalized: false, attempt: finalized };
}

/**
 * Reconcile an expired official attempt for its authenticated owner.
 *
 * This intentionally accepts neither a writer token nor browser answer data.
 * The database rechecks ownership and expiry while holding the attempt row
 * lock, then snapshots only drafts already acknowledged by the server and
 * durable OCR results. Answer mutation endpoints keep their existing grace
 * deadline.
 */
export async function finalizeExpiredOfficialAttempt(input: {
  attemptId: string;
  userId: string;
}) {
  const attempt = await getAttempt(input.attemptId, input.userId);
  if (attempt.mode !== "official") {
    throw new ApiError("VALIDATION_ERROR", "This is not an official attempt", 400);
  }
  if (attempt.status === "finalized") {
    return { alreadyFinalized: true, attempt };
  }
  if (!["active", "locked"].includes(attempt.status)) {
    throw new ApiError("ATTEMPT_NOT_ACTIVE", "The attempt can no longer be finalized", 409);
  }
  if (Date.now() < new Date(attempt.expires_at).getTime()) {
    throw new ApiError("ATTEMPT_NOT_EXPIRED", "The exam timer has not ended", 409);
  }

  const admin = createAdminClient();
  const drafts = await getFinalizationDrafts(attempt.id, attempt.exam_id);
  const { data: finalizedData, error: finalizeError } = await admin.rpc(
    "finalize_expired_exam_attempt",
    {
      p_attempt_id: attempt.id,
      p_user_id: input.userId,
      p_drafts: drafts,
    },
  );
  if (finalizeError) {
    if (finalizeError.message.includes("ATTEMPT_NOT_EXPIRED")) {
      throw new ApiError("ATTEMPT_NOT_EXPIRED", "The exam timer has not ended", 409);
    }
    if (finalizeError.message.includes("OCR_PENDING")) {
      throw new ApiError(
        "OCR_PENDING",
        "A page photo is still being scanned. Finalization will continue automatically when it finishes.",
        409,
      );
    }
    if (
      finalizeError.message.includes("ATTEMPT_NOT_ACTIVE")
      || finalizeError.message.includes("INVALID_ATTEMPT_MODE")
    ) {
      throw new ApiError("ATTEMPT_NOT_ACTIVE", "The attempt can no longer be finalized", 409);
    }
    throw finalizeError;
  }
  const finalized = Array.isArray(finalizedData) ? finalizedData[0] : finalizedData;

  await clearFinalizedDraftCache(attempt.id);
  return { alreadyFinalized: false, attempt: finalized };
}

export async function lockPracticeAttempt(input: {
  attemptId: string;
  userId: string;
  writerToken: string;
}) {
  const writableAttempt = await requireAttemptWriter(input.attemptId, input.userId, input.writerToken);
  if (
    writableAttempt.mode !== "practice"
    || !["active", "awaiting_selection", "grading"].includes(writableAttempt.status)
  ) {
    throw new ApiError("ATTEMPT_NOT_ACTIVE", "Practice attempt is no longer active", 409);
  }
  if (writableAttempt.status === "active") {
    await assertAttemptDraftWordLimits(writableAttempt.id, writableAttempt.exam_id);
  }

  const admin = await createAdminClient();
  const { data: attemptData, error: lockError } = await admin.rpc("lock_practice_attempt", {
    p_attempt_id: input.attemptId,
    p_user_id: input.userId,
    p_writer_token_hash: hashWriterToken(input.writerToken),
  });
  if (lockError) {
    if (lockError.message.includes("WRITER_REVOKED")) throw new ApiError("WRITER_REVOKED", "This writer was revoked", 409);
    if (lockError.message.includes("OCR_PENDING")) {
      throw new ApiError(
        "OCR_PENDING",
        "A page photo is still being scanned. Completion will continue automatically when it finishes.",
        409,
      );
    }
    throw new ApiError("ATTEMPT_NOT_ACTIVE", "Practice attempt is no longer active", 409);
  }
  const attempt = (Array.isArray(attemptData) ? attemptData[0] : attemptData) as Awaited<ReturnType<typeof getAttempt>>;

  const drafts = await getAttemptDrafts(attempt.id);
  const { data: questions, error } = await admin
    .from("exam_questions")
    .select("id, marks, order_index, questions(category, prompt)")
    .eq("exam_id", attempt.exam_id)
    .order("order_index");
  if (error) throw error;
  const { data: jobs } = await admin
    .from("grading_jobs")
    .select("id, status")
    .eq("attempt_id", attempt.id)
    .order("created_at", { ascending: false })
    .limit(1);

  const selectable = (questions ?? [])
    .filter((row: any) => row.questions?.category !== "translation" && drafts[row.id]?.editedText?.trim())
    .map((row: any) => ({
      examQuestionId: row.id,
      marks: row.marks,
      prompt: row.questions?.prompt ?? "Question",
      selected: false,
    }));

  return {
    attemptId: attempt.id,
    availableSlots: await getAvailableTestSlots(input.userId),
    selectable,
    excludedTranslationIds: (questions ?? [])
      .filter((row: any) => row.questions?.category === "translation")
      .map((row: any) => row.id),
    currentJob: jobs?.[0] ? { jobId: jobs[0].id, status: jobs[0].status } : null,
  };
}

export async function listExpiredOfficialAttempts(examId: string) {
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("exam_attempts")
    .select("user_id, status, expires_at")
    .eq("exam_id", examId)
    .eq("mode", "official")
    .in("status", ["active", "locked"])
    .lte("expires_at", new Date().toISOString());
  if (error) throw error;
  return data ?? [];
}
