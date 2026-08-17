import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getRedis, CacheKeys, CacheTTL } from "@/lib/redis";
import { ApiError } from "@/lib/api/errors";
import type { Highlight } from "@/lib/types";

export type LeaderboardRow = {
  user_id: string;
  student_name: string;
  institute: string;
  total_score: number;
  max_score: number;
  rank: number;
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
  let cached = await redis.get<{ rows: LeaderboardRow[]; totalCount: number }>(cacheKey);
  if (!cached) {
    const { data, error } = await supabase.rpc("get_published_leaderboard", {
      p_exam_id: examId,
      p_page: safePage,
      p_page_size: 100,
    });
    if (error) throw error;
    const raw = data ?? [];
    cached = {
      rows: raw.map((row: any) => ({
        user_id: row.user_id,
        student_name: row.student_name,
        institute: row.institute,
        total_score: Number(row.total_score),
        max_score: Number(row.max_score),
        rank: Number(row.rank),
      })),
      totalCount: Number(raw[0]?.total_count ?? 0),
    };
    await redis.set(cacheKey, cached, { ex: CacheTTL.LEADERBOARD });
  }

  const totalPages = Math.max(1, Math.ceil(cached.totalCount / 100));
  if (cached.totalCount > 0 && safePage > totalPages) {
    throw new ApiError("VALIDATION_ERROR", "Leaderboard page is out of range", 404);
  }

  const [{ data: myResult }, { data: details, error: detailsError }] = await Promise.all([
    supabase
      .from("exam_results")
      .select("total_score, max_score, rank")
      .eq("exam_id", examId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("exam_submissions")
      .select("id, edited_text, grading_result, question_id, exam_questions(marks, order_index, questions(prompt, category))")
      .eq("exam_id", examId)
      .eq("user_id", userId),
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
        highlights,
      };
    })
    .sort((a, b) => a.orderIndex - b.orderIndex);

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
  };
}

