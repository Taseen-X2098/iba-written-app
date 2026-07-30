import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ExamTakerClient from "@/components/exams/exam-taker-client";
import AutoFinalizer from "@/components/exams/auto-finalizer";
import { getRedis, CacheKeys } from "@/lib/redis";

export default async function TakeExamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ practice?: string }>;
}) {
  const { id } = await params;
  const { practice } = await searchParams;
  const isPractice = practice === "true";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 1. Fetch Exam
  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("*")
    .eq("id", id)
    .single();

  if (examError || !exam) {
    redirect("/exams");
  }

  // 2. Security Check: Is Exam Active?
  const now = new Date().getTime();
  const startsAt = new Date(exam.starts_at).getTime();
  const endsAt = new Date(exam.ends_at).getTime();

  if (!isPractice && (now < startsAt || now > endsAt)) {
    redirect("/exams"); // Not active
  }

  // Anti-Cheat: Practice mode is ONLY allowed after the official results have been published.
  // This prevents students from bypassing time-locks to view questions early or use AI grading to leak the rubric before official results are out.
  if (isPractice && !exam.results_published) {
    redirect("/exams");
  }

  // 3. Fetch Exam Questions
  const { data: examQuestions, error: eqError } = await supabase
    .from("exam_questions")
    .select(`
      id,
      order_index,
      marks,
      questions (*)
    `)
    .eq("exam_id", id)
    .order("order_index", { ascending: true });

  if (eqError || !examQuestions) {
    console.error("Failed to load questions:", eqError);
    redirect("/exams");
  }

  // 4. Check if student already submitted this exam
  if (!isPractice) {
    const { data: existingSubmissions } = await supabase
      .from("exam_submissions")
      .select("id")
      .eq("exam_id", id)
      .eq("user_id", user.id)
      .not("submitted_at", "is", null)
      .limit(1);

    if (existingSubmissions && existingSubmissions.length > 0) {
      redirect(`/exams/${id}/results`);
    }
  }

  // 5. Server-Enforced Timer & Draft Hydration
  const redis = getRedis();
  const startTimeKey = isPractice ? `practice:exam:start:${id}:${user.id}` : `exam:start:${id}:${user.id}`;
  let serverStartTime = await redis.get<number>(startTimeKey);
  
  if (!serverStartTime) {
    serverStartTime = Date.now();
    // Cache the start time for 48 hours so Admins can still find and force-grade abandoned sessions.
    // If a student bypasses the client timer, the math below (and in the API) still rejects them.
    const ttlSeconds = 48 * 60 * 60; // 48 hours
    await redis.set(startTimeKey, serverStartTime, { ex: ttlSeconds });
  } else {
    // Check if expired
    const durationMs = (exam.time_limit_minutes * 60 * 1000) + (3 * 60 * 1000); // 3 min grace
    if (Date.now() - serverStartTime > durationMs) {
      return (
        <div className="min-h-[calc(100vh-64px)] bg-background flex items-center justify-center p-4">
          <AutoFinalizer examId={id} isPractice={isPractice} />
        </div>
      );
    }
  }

  // Fetch all existing drafts for this exam
  const initialDrafts: Record<string, { ocrText: string; editedText: string }> = {};
  for (const eq of examQuestions) {
    const draftKey = isPractice 
      ? CacheKeys.practiceExamDraft(id, user.id, eq.id) 
      : CacheKeys.examDraft(id, user.id, eq.id);
    const draft = await redis.get<{ ocrText: string; editedText: string }>(draftKey);
    if (draft) {
      initialDrafts[eq.id] = draft;
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background">
      <ExamTakerClient 
        exam={exam} 
        examQuestions={examQuestions} 
        userId={user.id}
        serverStartTime={serverStartTime}
        initialDrafts={initialDrafts}
        isPractice={isPractice}
      />
    </div>
  );
}
