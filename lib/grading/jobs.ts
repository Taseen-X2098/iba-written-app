import { randomUUID } from "node:crypto";
import { OpenAI } from "openai";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRedis, CacheKeys } from "@/lib/redis";
import { ApiError } from "@/lib/api/api-error";
import {
  assertAttemptDraftWordLimits,
  getAttemptDrafts,
  requireAttemptWriter,
} from "@/lib/exams/attempts";
import { grade, type ResponsesClient } from "@/lib/grading/grade";
import { createMockClient } from "@/lib/grading/mockClient";
import { rubricSourceForGrader } from "@/lib/grading/config";
import { prepareLearnerProfilePlan, recordLearnerProfileUpdate } from "@/lib/learning/profile";

type ClaimedItem = {
  id: string;
  job_id: string;
  exam_question_id: string;
  exam_submission_id: string | null;
  attempt_count: number;
};

type OfficialSubmissionCandidate = {
  id: string;
  question_id: string;
  edited_text: string | null;
  grading_result: unknown | null;
  questions: unknown;
};

function joinedRecord(value: unknown): Record<string, unknown> | null {
  const record = Array.isArray(value) ? value[0] : value;
  return record && typeof record === "object" ? record as Record<string, unknown> : null;
}

export async function wakeGradingWorker() {
  const url = process.env.GRADING_WORKER_URL;
  const secret = process.env.GRADING_WORKER_SECRET;
  if (!url || !secret) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/wake`, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: controller.signal,
      cache: "no-store",
    });
    return response.ok;
  } catch (error) {
    console.error("Failed to wake grading worker", error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createPracticeGradingJob(input: {
  attemptId: string;
  userId: string;
  writerToken: string;
  examQuestionIds: string[];
}) {
  const attempt = await requireAttemptWriter(input.attemptId, input.userId, input.writerToken);
  if (attempt.mode !== "practice" || attempt.status !== "awaiting_selection") {
    throw new ApiError("ATTEMPT_NOT_ACTIVE", "Practice answers are not awaiting selection", 409);
  }

  const selectedIds = [...new Set(input.examQuestionIds)];
  const admin = await createAdminClient();
  const redis = getRedis();
  const { data: liveJobs } = await admin
    .from("grading_jobs")
    .select("*")
    .eq("attempt_id", attempt.id)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (liveJobs?.[0]) return { jobId: liveJobs[0].id, status: liveJobs[0].status };

  const drafts = await getAttemptDrafts(attempt.id);
  await assertAttemptDraftWordLimits(attempt.id, attempt.exam_id, drafts);
  const { data: questions, error: questionError } = await admin
    .from("exam_questions")
    .select("id, questions(category)")
    .eq("exam_id", attempt.exam_id)
    .in("id", selectedIds.length ? selectedIds : ["00000000-0000-0000-0000-000000000000"]);
  if (questionError) throw questionError;

  const validIds = (questions ?? [])
    .filter((row) => joinedRecord(row.questions)?.category !== "translation" && drafts[row.id]?.editedText?.trim())
    .map((row) => row.id);
  if (validIds.length !== selectedIds.length) {
    throw new ApiError("VALIDATION_ERROR", "Only non-empty, non-translation answers can be graded", 400);
  }

  if (validIds.length === 0) {
    await admin
      .from("exam_attempts")
      .update({ status: "finalized", finalized_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", attempt.id);
    await redis.del(CacheKeys.attemptDrafts(attempt.id));
    return { jobId: null, status: "completed" as const };
  }

  const { error: reserveError } = await admin.rpc("reserve_practice_usage", {
    p_user_id: input.userId,
    p_attempt_id: attempt.id,
    p_exam_question_ids: validIds,
  });
  if (reserveError) {
    if (reserveError.message.includes("INSUFFICIENT_SLOTS")) {
      throw new ApiError("INSUFFICIENT_SLOTS", "Not enough test slots remain for this selection", 409);
    }
    throw reserveError;
  }

  const { data: job, error: jobError } = await admin
    .from("grading_jobs")
    .insert({
      kind: "practice_exam",
      exam_id: attempt.exam_id,
      attempt_id: attempt.id,
      requested_by: input.userId,
      total_items: validIds.length,
    })
    .select("*")
    .single();
  if (jobError) {
    if (jobError.code === "23505") {
      const { data: concurrent } = await admin
        .from("grading_jobs")
        .select("id, status")
        .eq("attempt_id", attempt.id)
        .in("status", ["queued", "running"])
        .order("created_at", { ascending: false })
        .limit(1);
      if (concurrent?.[0]) return { jobId: concurrent[0].id, status: concurrent[0].status };
    }
    await Promise.all(validIds.map((id) => admin.rpc("finish_usage_charge", {
      p_attempt_id: attempt.id,
      p_exam_question_id: id,
      p_success: false,
    })));
    throw jobError;
  }

  const { error: itemError } = await admin.from("grading_job_items").insert(
    validIds.map((examQuestionId) => ({ job_id: job.id, exam_question_id: examQuestionId })),
  );
  if (itemError) {
    await admin.from("grading_jobs").update({ status: "failed", last_error: itemError.message }).eq("id", job.id);
    await Promise.all(validIds.map((id) => admin.rpc("finish_usage_charge", {
      p_attempt_id: attempt.id,
      p_exam_question_id: id,
      p_success: false,
    })));
    throw itemError;
  }

  await admin.from("exam_attempts").update({ status: "grading", updated_at: new Date().toISOString() }).eq("id", attempt.id);
  const woke = await wakeGradingWorker();
  if (!woke && process.env.NODE_ENV !== "production") {
    void drainGradingQueue({ workerId: `inline-${randomUUID()}`, batchSize: 4 });
  }
  return { jobId: job.id, status: job.status };
}

export async function createOfficialGradingJob(input: {
  examId: string;
  requestedBy: string;
  submissionIds?: string[];
  scope: "selected" | "missing";
  allowRegrade: boolean;
}) {
  if (input.allowRegrade) {
    throw new ApiError("VALIDATION_ERROR", "Existing grades cannot be AI-graded again", 400);
  }
  const admin = await createAdminClient();
  let query = admin
    .from("exam_submissions")
    .select("id, question_id, edited_text, grading_result, graded_by, questions:exam_questions(questions(category))")
    .eq("exam_id", input.examId);
  if (input.scope === "missing") query = query.is("grading_result", null);
  if (input.submissionIds?.length) query = query.in("id", [...new Set(input.submissionIds)]);

  const { data: submissions, error } = await query;
  if (error) throw error;
  const eligible = ((submissions ?? []) as OfficialSubmissionCandidate[]).filter((submission) => {
    const category = joinedRecord(joinedRecord(submission.questions)?.questions)?.category;
    if (category === "translation") return false;
    if (submission.grading_result != null) return false;
    return Boolean(submission.edited_text?.trim());
  });
  if (!eligible.length) {
    throw new ApiError(
      "GRADING_INCOMPLETE",
      "No ungraded, non-translation answers with student text were selected",
      409,
    );
  }

  const { data: job, error: jobError } = await admin
    .from("grading_jobs")
    .insert({
      kind: "official_exam",
      exam_id: input.examId,
      requested_by: input.requestedBy,
      allow_regrade: input.allowRegrade,
      total_items: eligible.length,
    })
    .select("*")
    .single();
  if (jobError) throw jobError;

  const { error: itemError } = await admin.from("grading_job_items").insert(
    eligible.map((submission) => ({
      job_id: job.id,
      exam_question_id: submission.question_id,
      exam_submission_id: submission.id,
    })),
  );
  if (itemError) throw itemError;

  const woke = await wakeGradingWorker();
  if (!woke && process.env.NODE_ENV !== "production") {
    void drainGradingQueue({ workerId: `inline-${randomUUID()}`, batchSize: 4 });
  }
  return job;
}

async function markItemFailure(item: ClaimedItem, error: unknown, practiceAttemptId?: string) {
  const admin = await createAdminClient();
  const message = error instanceof Error ? error.message : "Unknown grading failure";
  const terminal = item.attempt_count >= 3;
  await admin
    .from("grading_job_items")
    .update({
      status: terminal ? "failed" : "queued",
      last_error: message.slice(0, 4_000),
      next_attempt_at: new Date(Date.now() + Math.min(60_000, 2 ** item.attempt_count * 2_000)).toISOString(),
      claimed_by: null,
      claimed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", item.id);

  if (terminal && practiceAttemptId) {
    await admin.rpc("finish_usage_charge", {
      p_attempt_id: practiceAttemptId,
      p_exam_question_id: item.exam_question_id,
      p_success: false,
    });
  }
  const { data: refreshedData } = await admin.rpc("refresh_grading_job", { p_job_id: item.job_id });
  const refreshed = Array.isArray(refreshedData) ? refreshedData[0] : refreshedData;
  if (practiceAttemptId && refreshed?.status === "failed") {
    // Failed reservations have been released; retain the snapshot and let the
    // student retry only the failed answers as a fresh idempotent job.
    await admin
      .from("exam_attempts")
      .update({ status: "awaiting_selection", updated_at: new Date().toISOString() })
      .eq("id", practiceAttemptId)
      .eq("status", "grading");
  }
}

async function processItem(item: ClaimedItem) {
  const admin = await createAdminClient();
  const { data: job, error: jobError } = await admin.from("grading_jobs").select("*").eq("id", item.job_id).single();
  if (jobError || !job) throw jobError ?? new Error("Grading job not found");

  const attemptId: string | undefined = job.attempt_id ?? undefined;
  try {
    const { data: eq, error: eqError } = await admin
      .from("exam_questions")
      .select("id, marks, questions(category, prompt)")
      .eq("id", item.exam_question_id)
      .single();
    if (eqError || !eq) throw eqError ?? new Error("Question not found");
    const question = joinedRecord(eq.questions);
    const category = question?.category;
    const questionPrompt = typeof question?.prompt === "string" ? question.prompt : undefined;
    if (typeof category !== "string") throw new Error("Question category is missing");

    if (category === "translation") {
      if (attemptId) {
        await admin.rpc("finish_usage_charge", {
          p_attempt_id: attemptId,
          p_exam_question_id: item.exam_question_id,
          p_success: false,
        });
      }
      await admin.from("grading_job_items").update({ status: "skipped", last_error: "Translation requires manual grading" }).eq("id", item.id);
      await admin.rpc("refresh_grading_job", { p_job_id: item.job_id });
      return;
    }

    let submissionText = "";
    let studentUserId = job.requested_by as string;
    if (job.kind === "practice_exam") {
      if (!attemptId) throw new Error("Practice job has no attempt");
      const drafts = await getAttemptDrafts(attemptId);
      submissionText = drafts[item.exam_question_id]?.editedText?.trim() ?? "";
    } else {
      if (!item.exam_submission_id) throw new Error("Official grading item has no submission");
      const { data: submission, error: submissionError } = await admin
        .from("exam_submissions")
        .select("user_id, edited_text, grading_result, graded_by")
        .eq("id", item.exam_submission_id)
        .single();
      if (submissionError || !submission) throw submissionError ?? new Error("Submission not found");
      if (submission.grading_result != null) {
        await admin.from("grading_job_items").update({ status: "skipped", last_error: "Existing grade protected" }).eq("id", item.id);
        await admin.rpc("refresh_grading_job", { p_job_id: item.job_id });
        return;
      }
      studentUserId = submission.user_id;
      submissionText = submission.edited_text?.trim() ?? "";
    }

    if (!submissionText) throw new Error("Cannot AI-grade a blank answer");
    const isMock = process.env.USE_MOCK_GRADER === "true";
    const rubricSource = rubricSourceForGrader(isMock);
    const client: ResponsesClient = isMock
      ? createMockClient({ taskType: category, marks: eq.marks, submission: submissionText })
      : (new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) as unknown as ResponsesClient);
    const rawResult = await grade(client, submissionText, category, eq.marks, {
      rubricSource,
      questionPrompt,
    });
    const profilePlan = await prepareLearnerProfilePlan({
      client,
      useMock: isMock,
      requireAiPersonalization: true,
      userId: studentUserId,
      category,
      submission: submissionText,
      result: rawResult,
    });
    const result = profilePlan.result;

    if (job.kind === "practice_exam") {
      await admin.rpc("finish_usage_charge", {
        p_attempt_id: attemptId,
        p_exam_question_id: item.exam_question_id,
        p_success: true,
      });
    } else {
      const { data: savedSubmission, error: saveError } = await admin
        .from("exam_submissions")
        .update({ grading_result: result, graded_by: "ai" })
        .eq("id", item.exam_submission_id!)
        .is("grading_result", null)
        .select("id")
        .maybeSingle();
      if (saveError) throw saveError;
      if (!savedSubmission) {
        await admin.from("grading_job_items").update({ status: "skipped", last_error: "Existing grade protected" }).eq("id", item.id);
        await admin.rpc("refresh_grading_job", { p_job_id: item.job_id });
        return;
      }
    }

    await admin
      .from("grading_job_items")
      .update({ status: "completed", result, last_error: null, updated_at: new Date().toISOString() })
      .eq("id", item.id);
    try {
      await recordLearnerProfileUpdate({
        userId: studentUserId,
        sourceKind: job.kind === "practice_exam" ? "practice_exam" : "official_exam",
        sourceId: job.kind === "practice_exam" ? item.id : item.exam_submission_id!,
        category,
        plan: profilePlan,
      });
    } catch (profileError) {
      console.error("Unable to record learner profile after exam grade", profileError);
    }
    const { data: refreshed } = await admin.rpc("refresh_grading_job", { p_job_id: item.job_id });
    const refreshedJob = Array.isArray(refreshed) ? refreshed[0] : refreshed;
    if (job.kind === "practice_exam" && refreshedJob?.status === "completed") {
      await admin
        .from("exam_attempts")
        .update({ status: "finalized", finalized_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", attemptId!);
      await getRedis().del(CacheKeys.attemptDrafts(attemptId!));
    } else if (job.kind === "practice_exam" && refreshedJob?.status === "failed") {
      await admin
        .from("exam_attempts")
        .update({ status: "awaiting_selection", updated_at: new Date().toISOString() })
        .eq("id", attemptId!)
        .eq("status", "grading");
    }
  } catch (error) {
    await markItemFailure(item, error, attemptId);
  }
}

export async function drainGradingQueue(options?: { workerId?: string; batchSize?: number }) {
  const workerId = options?.workerId ?? `worker-${randomUUID()}`;
  const batchSize = options?.batchSize ?? 4;
  const admin = await createAdminClient();
  let processed = 0;

  while (true) {
    const { data, error } = await admin.rpc("claim_grading_items", {
      p_worker_id: workerId,
      p_limit: batchSize,
    });
    if (error) throw error;
    const items = (data ?? []) as ClaimedItem[];
    if (!items.length) break;
    await Promise.all(items.map(processItem));
    processed += items.length;
  }
  return processed;
}
