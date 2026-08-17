import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import { getRedis, CacheKeys } from "@/lib/redis";
import { ApiError } from "@/lib/api/errors";
import { getAttempt, requireAttemptWriter, getAvailableTestSlots } from "@/lib/exams/attempts";
import type { AttemptDrafts, GradingResultJSON } from "@/lib/types";

function blankGrade(marks: number): GradingResultJSON {
  return {
    internal: { total: 0, max: marks, criteria: [] },
    studentFeedback: {
      score: `0/${marks}`,
      summary: "No answer was submitted for this question.",
      highlights: [],
    },
  };
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
  await admin
    .from("exam_attempts")
    .update({ status: "locked", submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", attempt.id)
    .in("status", ["active", "locked"]);

  const redis = getRedis();
  const drafts = (await redis.get<AttemptDrafts>(CacheKeys.attemptDrafts(attempt.id))) ?? {};
  const { data: questions, error: questionsError } = await admin
    .from("exam_questions")
    .select("id, marks")
    .eq("exam_id", attempt.exam_id)
    .order("order_index");
  if (questionsError) throw questionsError;
  if (!questions?.length) throw new ApiError("EXAM_NOT_FOUND", "Exam questions were not found", 404);

  const submittedAt = new Date().toISOString();
  const rows = questions.map((question) => {
    const draft = drafts[question.id];
    const editedText = draft?.editedText ?? "";
    const isBlank = editedText.trim().length === 0;
    return {
      exam_id: attempt.exam_id,
      user_id: attempt.user_id,
      question_id: question.id,
      attempt_id: attempt.id,
      ocr_text: draft?.ocrText ?? "",
      edited_text: editedText,
      started_at: attempt.started_at,
      submitted_at: submittedAt,
      grading_result: isBlank ? blankGrade(question.marks) : null,
      graded_by: isBlank ? "admin" : null,
    };
  });

  const { error: submissionError } = await admin
    .from("exam_submissions")
    .upsert(rows, { onConflict: "exam_id,user_id,question_id" });
  if (submissionError) throw submissionError;

  const { data: finalized, error: finalizeError } = await admin
    .from("exam_attempts")
    .update({
      status: "finalized",
      submitted_at: submittedAt,
      finalized_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", attempt.id)
    .select("*")
    .single();
  if (finalizeError) throw finalizeError;

  await redis.del(CacheKeys.attemptDrafts(attempt.id));
  return { alreadyFinalized: false, attempt: finalized };
}

export async function lockPracticeAttempt(input: {
  attemptId: string;
  userId: string;
  writerToken: string;
}) {
  const attempt = await requireAttemptWriter(input.attemptId, input.userId, input.writerToken);
  if (attempt.mode !== "practice") {
    throw new ApiError("VALIDATION_ERROR", "This is not a practice attempt", 400);
  }
  if (!["active", "awaiting_selection", "grading"].includes(attempt.status)) {
    throw new ApiError("ATTEMPT_NOT_ACTIVE", "Practice attempt is no longer active", 409);
  }

  const admin = await createAdminClient();
  if (attempt.status === "active") {
    const { error } = await admin
      .from("exam_attempts")
      .update({ status: "awaiting_selection", submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", attempt.id)
      .eq("status", "active");
    if (error) throw error;
  }

  const redis = getRedis();
  const drafts = (await redis.get<AttemptDrafts>(CacheKeys.attemptDrafts(attempt.id))) ?? {};
  const { data: questions, error } = await admin
    .from("exam_questions")
    .select("id, marks, order_index, questions(category, prompt)")
    .eq("exam_id", attempt.exam_id)
    .order("order_index");
  if (error) throw error;

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
  };
}

export async function finalizeDueAttempts(limit = 50) {
  const admin = await createAdminClient();
  const { data: attempts, error } = await admin
    .from("exam_attempts")
    .select("id")
    .eq("mode", "official")
    .in("status", ["active", "locked"])
    .lte("expires_at", new Date().toISOString())
    .order("expires_at")
    .limit(limit);
  if (error) throw error;

  let finalized = 0;
  for (const attempt of attempts ?? []) {
    try {
      await finalizeOfficialAttempt({ attemptId: attempt.id, requireExpired: true });
      finalized += 1;
    } catch (error) {
      console.error(`Failed to finalize due attempt ${attempt.id}`, error);
    }
  }
  return finalized;
}

