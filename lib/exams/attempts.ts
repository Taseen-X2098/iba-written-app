import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRedis, CacheKeys, CacheTTL } from "@/lib/redis";
import { ApiError } from "@/lib/api/api-error";
import type {
  AttemptDrafts,
  AttemptQuestion,
  Exam,
  ExamAttempt,
  ExamAttemptMode,
} from "@/lib/types";

const WRITER_TOKEN_BYTES = 32;

export function createWriterToken() {
  return randomBytes(WRITER_TOKEN_BYTES).toString("base64url");
}

export function hashWriterToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function writerTokenMatches(token: string, expectedHash: string) {
  const actual = Buffer.from(hashWriterToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function getAttemptDrafts(attemptId: string) {
  return (await getRedis().hgetall<AttemptDrafts>(CacheKeys.attemptDrafts(attemptId))) ?? {};
}

function normalizeAttempt(data: unknown): ExamAttempt & { writer_token_hash: string } {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    throw new ApiError("INTERNAL_ERROR", "Failed to create exam attempt", 500);
  }
  return row as ExamAttempt & { writer_token_hash: string };
}

async function loadAttemptQuestions(examId: string) {
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("exam_questions")
    .select("id, order_index, marks, questions(id, category, marks, difficulty, source, prompt, space_hint, max_images, is_active, created_at, created_by)")
    .eq("exam_id", examId)
    .order("order_index", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as AttemptQuestion[];
}

async function hasOfficialExamPlan(userId: string) {
  const admin = await createAdminClient();
  const { data } = await admin
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .in("plan_type", ["plan_2", "plan_3"])
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  return Boolean(data?.length);
}

export async function getAttempt(attemptId: string, userId?: string) {
  const admin = await createAdminClient();
  let query = admin.from("exam_attempts").select("*").eq("id", attemptId);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw new ApiError("ATTEMPT_NOT_ACTIVE", "Exam attempt was not found", 404);
  return data as ExamAttempt & { writer_token_hash: string };
}

export async function requireAttemptWriter(attemptId: string, userId: string, token: string) {
  const attempt = await getAttempt(attemptId, userId);
  if (!writerTokenMatches(token, attempt.writer_token_hash)) {
    throw new ApiError(
      "WRITER_REVOKED",
      "This session is read-only because the exam was taken over on another device.",
      409,
    );
  }
  return attempt;
}

export async function startAttempt(input: {
  examId: string;
  userId: string;
  mode: ExamAttemptMode;
  attemptId?: string;
  writerToken?: string;
}) {
  const admin = await createAdminClient();
  const { data: examData, error: examError } = await admin
    .from("exams")
    .select("*")
    .eq("id", input.examId)
    .eq("is_published", true)
    .single();

  if (examError || !examData) throw new ApiError("EXAM_NOT_FOUND", "Exam not found", 404);
  const exam = examData as Exam;
  const now = Date.now();
  const startsAt = new Date(exam.starts_at).getTime();
  const endsAt = new Date(exam.ends_at).getTime();

  let existingQuery = admin
    .from("exam_attempts")
    .select("*")
    .eq("exam_id", input.examId)
    .eq("user_id", input.userId)
    .eq("mode", input.mode);
  if (input.mode === "practice") {
    existingQuery = existingQuery.in("status", ["active", "locked", "awaiting_selection", "grading"]);
  }
  const { data: existingRows } = await existingQuery.order("created_at", { ascending: false }).limit(1);
  const existing = existingRows?.[0] as (ExamAttempt & { writer_token_hash: string }) | undefined;

  if (existing) {
    if (existing.status === "finalized") {
      throw new ApiError("ATTEMPT_ALREADY_COMPLETED", "This official exam has already been completed", 409);
    }
    if (
      input.attemptId === existing.id &&
      input.writerToken &&
      writerTokenMatches(input.writerToken, existing.writer_token_hash)
    ) {
      if (Date.now() > new Date(existing.expires_at).getTime() + 3 * 60_000) {
        throw new ApiError("ATTEMPT_EXPIRED", "The final network grace period has ended", 409);
      }
      const drafts = await getAttemptDrafts(existing.id);
      return {
        attempt: existing,
        writerToken: input.writerToken,
        exam,
        questions: await loadAttemptQuestions(input.examId),
        drafts,
        resumed: true,
      };
    }
    throw new ApiError(
      "ATTEMPT_ACTIVE",
      "An active attempt already exists. Use Take Over to continue on this device.",
      409,
      { attemptId: existing.id, expiresAt: existing.expires_at, mode: existing.mode },
    );
  }

  if (input.mode === "official" && (now < startsAt || now >= endsAt)) {
    throw new ApiError("EXAM_NOT_AVAILABLE", "The official exam is not currently available", 403);
  }
  if (input.mode === "practice" && !exam.results_published) {
    throw new ApiError("RESULTS_EMBARGOED", "Practice opens after official results are published", 403);
  }

  if (input.mode === "official" && !(await hasOfficialExamPlan(input.userId))) {
    throw new ApiError("PLAN_REQUIRED", "An active Complete or Exam plan is required to start", 403);
  }

  const writerToken = createWriterToken();
  const personalExpiry = now + exam.time_limit_minutes * 60_000;
  const expiresAt = new Date(input.mode === "official" ? Math.min(personalExpiry, endsAt) : personalExpiry);
  const { data, error } = await admin.rpc("start_exam_attempt", {
    p_exam_id: input.examId,
    p_user_id: input.userId,
    p_mode: input.mode,
    p_expires_at: expiresAt.toISOString(),
    p_writer_token_hash: hashWriterToken(writerToken),
  });
  if (error) throw error;
  const attempt = normalizeAttempt(data);

  if (!writerTokenMatches(writerToken, attempt.writer_token_hash)) {
    throw new ApiError("ATTEMPT_ACTIVE", "An active attempt already exists", 409, {
      attemptId: attempt.id,
      expiresAt: attempt.expires_at,
    });
  }

  return {
    attempt,
    writerToken,
    exam,
    questions: await loadAttemptQuestions(input.examId),
    drafts: {},
    resumed: false,
  };
}

export async function takeOverAttempt(attemptId: string, userId: string) {
  const admin = await createAdminClient();
  const writerToken = createWriterToken();
  const { data, error } = await admin.rpc("take_over_exam_attempt", {
    p_attempt_id: attemptId,
    p_user_id: userId,
    p_writer_token_hash: hashWriterToken(writerToken),
  });
  if (error) throw new ApiError("ATTEMPT_NOT_ACTIVE", "The attempt can no longer be taken over", 409);
  return { attempt: normalizeAttempt(data), writerToken };
}

export async function saveAttemptDrafts(input: {
  attemptId: string;
  userId: string;
  writerToken: string;
  answers: Array<{ examQuestionId: string; ocrText: string; editedText: string }>;
}) {
  const attempt = await requireAttemptWriter(input.attemptId, input.userId, input.writerToken);
  if (attempt.status !== "active") {
    throw new ApiError("ATTEMPT_NOT_ACTIVE", "The attempt is locked", 409);
  }
  if (Date.now() > new Date(attempt.expires_at).getTime() + 3 * 60_000) {
    throw new ApiError("ATTEMPT_EXPIRED", "The final network grace period has ended", 409);
  }

  const admin = await createAdminClient();
  const ids = [...new Set(input.answers.map((answer) => answer.examQuestionId))];
  const { data: validRows, error } = await admin
    .from("exam_questions")
    .select("id")
    .eq("exam_id", attempt.exam_id)
    .in("id", ids);
  if (error) throw error;
  if ((validRows?.length ?? 0) !== ids.length) {
    throw new ApiError("VALIDATION_ERROR", "One or more questions do not belong to this exam", 400);
  }

  const redis = getRedis();
  const key = CacheKeys.attemptDrafts(attempt.id);
  const updatedAt = new Date().toISOString();
  const updates: AttemptDrafts = {};
  for (const answer of input.answers) {
    updates[answer.examQuestionId] = {
      ocrText: answer.ocrText,
      editedText: answer.editedText,
      updatedAt,
    };
  }
  // HSET merges all fields atomically under one attempt key, so overlapping
  // visibility/manual/interval saves cannot overwrite another acknowledged
  // answer with an older read-modify-write snapshot.
  await redis.hset(key, updates);
  await redis.expire(key, CacheTTL.ATTEMPT);
  return { savedQuestionIds: ids, updatedAt };
}

export async function getAvailableTestSlots(userId: string) {
  const admin = await createAdminClient();
  const now = new Date().toISOString();
  const [{ data: subscriptions }, { data: profile }] = await Promise.all([
    admin
      .from("subscriptions")
      .select("plan_type, tests_remaining, extra_tests_purchased")
      .eq("user_id", userId)
      .eq("is_active", true)
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(1),
    admin.from("profiles").select("free_tests_remaining").eq("id", userId).single(),
  ]);
  const sub = subscriptions?.[0];
  const plan = sub && ["plan_1", "plan_2"].includes(sub.plan_type) ? sub.tests_remaining : 0;
  return Math.max(0, (sub?.extra_tests_purchased ?? 0) + plan + (profile?.free_tests_remaining ?? 0));
}
