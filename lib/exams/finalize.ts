import { createAdminClient } from "@/lib/supabase/server";
import { getRedis, CacheKeys } from "@/lib/redis";
import { ApiError } from "@/lib/api/errors";
import {
  getAttempt,
  getAttemptDrafts,
  getAvailableTestSlots,
  hashWriterToken,
  requireAttemptWriter,
} from "@/lib/exams/attempts";

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
  const redis = getRedis();
  const drafts = await getAttemptDrafts(attempt.id);
  const { data: finalizedData, error: finalizeError } = await admin.rpc("finalize_exam_attempt", {
    p_attempt_id: attempt.id,
    p_user_id: input.userId ?? null,
    p_writer_token_hash: input.writerToken ? hashWriterToken(input.writerToken) : null,
    p_drafts: drafts,
  });
  if (finalizeError) {
    if (finalizeError.message.includes("WRITER_REVOKED")) throw new ApiError("WRITER_REVOKED", "This writer was revoked", 409);
    if (finalizeError.message.includes("ATTEMPT_EXPIRED")) throw new ApiError("ATTEMPT_EXPIRED", "The final network grace period has ended", 409);
    throw finalizeError;
  }
  const finalized = Array.isArray(finalizedData) ? finalizedData[0] : finalizedData;

  await redis.del(CacheKeys.attemptDrafts(attempt.id));
  return { alreadyFinalized: false, attempt: finalized };
}

export async function lockPracticeAttempt(input: {
  attemptId: string;
  userId: string;
  writerToken: string;
}) {
  const admin = await createAdminClient();
  const { data: attemptData, error: lockError } = await admin.rpc("lock_practice_attempt", {
    p_attempt_id: input.attemptId,
    p_user_id: input.userId,
    p_writer_token_hash: hashWriterToken(input.writerToken),
  });
  if (lockError) {
    if (lockError.message.includes("WRITER_REVOKED")) throw new ApiError("WRITER_REVOKED", "This writer was revoked", 409);
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
