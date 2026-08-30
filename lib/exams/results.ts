import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getRedis, CacheKeys, CacheTTL } from "@/lib/redis";
import { ApiError } from "@/lib/api/errors";
import type { Highlight } from "@/lib/types";
import type { PersonalProgressionCardDTO } from "@/lib/types";
import { getPersonalProgressionCard, hasPersonalProgressionAccess } from "@/lib/learning/progression";

export type LeaderboardRow = {
  user_id: string;
  student_name: string;
  institute: string;
  total_score: number;
  max_score: number;
  rank: number;
  percentage: number;
};

export async function getPublishedExamResults(examId: string, userId: string, page: number) {
  const supabase = await createClient();
  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id, title, ends_at, results_published, results_version")
    .eq("id", examId)
    .single();
  if (examError || !exam) throw new ApiError("EXAM_NOT_FOUND", "Exam not found", 404);
  if (!exam.results_published) throw new ApiError("RESULTS_EMBARGOED", "Results have not been published", 403, { endsAt: exam.ends_at });

  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const redis = getRedis();
  const cacheKey = CacheKeys.leaderboard(examId, exam.results_version, safePage);
  let cached = await redis.get<{ rows: LeaderboardRow[]; totalCount: number; resultsVersion?: number }>(cacheKey);
  if (cached && safePage > 1 && cached.totalCount === 0) cached = null;
  if (!cached) {
    const { data, error } = await supabase.rpc("get_published_leaderboard_page", {
      p_exam_id: examId,
      p_page: safePage,
      p_page_size: 100,
    });
    if (error) {
      if (error.message.includes("INVALID_PAGE")) {
        throw new ApiError("VALIDATION_ERROR", "Leaderboard page is out of range", 404);
      }
      if (error.message.includes("EXAM_NOT_FOUND")) {
        throw new ApiError("EXAM_NOT_FOUND", "Exam not found", 404);
      }
      throw error;
    }
    const pageData = (data ?? {}) as {
      rows?: Array<Record<string, unknown>>;
      total_count?: number | string;
      results_version?: number | string;
    };
    const raw = pageData.rows ?? [];
    cached = {
      rows: raw.map((row) => ({
        user_id: String(row.user_id),
        student_name: String(row.student_name ?? "Student"),
        institute: String(row.institute ?? ""),
        total_score: Number(row.total_score),
        max_score: Number(row.max_score),
        rank: Number(row.rank),
        percentage: Number(row.percentage ?? (Number(row.max_score) > 0 ? Number(row.total_score) * 100 / Number(row.max_score) : 0)),
      })),
      totalCount: Number(pageData.total_count ?? 0),
      resultsVersion: Number(pageData.results_version ?? exam.results_version),
    };
    await redis.set(
      CacheKeys.leaderboard(examId, cached.resultsVersion ?? exam.results_version, safePage),
      cached,
      { ex: CacheTTL.LEADERBOARD },
    );
  }

  const totalPages = Math.max(1, Math.ceil(cached.totalCount / 100));
  if (cached.totalCount > 0 && safePage > totalPages) {
    throw new ApiError("VALIDATION_ERROR", "Leaderboard page is out of range", 404);
  }

  const { data: officialAttempt } = await supabase
    .from("exam_attempts")
    .select("id")
    .eq("exam_id", examId)
    .eq("user_id", userId)
    .eq("mode", "official")
    .eq("status", "finalized")
    .maybeSingle();
  let detailsQuery = supabase
    .from("exam_submissions")
    .select("id, edited_text, grading_result, question_id, exam_questions(marks, order_index, questions(prompt, category))")
    .eq("exam_id", examId)
    .eq("user_id", userId);
  detailsQuery = officialAttempt
    ? detailsQuery.eq("attempt_id", officialAttempt.id)
    : detailsQuery.is("attempt_id", null);

  const [{ data: myResult }, { data: details, error: detailsError }] = await Promise.all([
    supabase
      .from("exam_results")
      .select("total_score, max_score, rank")
      .eq("exam_id", examId)
      .eq("user_id", userId)
      .maybeSingle(),
    detailsQuery,
  ]);
  if (detailsError) throw detailsError;

  const safeDetails = (details ?? [])
    .map((submission: any) => {
      const feedback = submission.grading_result?.studentFeedback;
      const text = submission.edited_text ?? "";
      const highlights = ((feedback?.highlights ?? []) as Highlight[]).filter(
        (highlight) => highlight.quote && text.includes(highlight.quote),
      );
      return {
        id: submission.id,
        orderIndex: submission.exam_questions?.order_index ?? 0,
        prompt: submission.exam_questions?.questions?.prompt ?? "Question",
        category: submission.exam_questions?.questions?.category,
        marks: submission.exam_questions?.marks ?? 0,
        answer: text,
        score: feedback?.score ?? `0/${submission.exam_questions?.marks ?? 0}`,
        summary: feedback?.summary ?? "No feedback available.",
        feedback: feedback ?? null,
        highlights,
      };
    })
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const personalProgressionReports: Record<string, PersonalProgressionCardDTO> = {};
  const reportTypes = [...new Set(safeDetails
    .map((detail) => detail.category)
    .filter((category): category is string => Boolean(category) && category !== "translation"))];
  const progressionAccess = await hasPersonalProgressionAccess(userId);
  await Promise.all(reportTypes.map(async (submissionType) => {
    personalProgressionReports[submissionType] = await getPersonalProgressionCard({
      userId,
      submissionType,
      access: progressionAccess,
    });
  }));

  return {
    exam,
    leaderboard: cached.rows,
    totalCount: cached.totalCount,
    page: safePage,
    totalPages,
    myResult: myResult
      ? { totalScore: Number(myResult.total_score), maxScore: Number(myResult.max_score), rank: myResult.rank }
      : null,
    details: safeDetails,
    personalProgressionReports,
  };
}
