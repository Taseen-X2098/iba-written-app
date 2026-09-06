import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requirePageUser } from "@/lib/auth";
import ExamStartGate from "@/components/exams/exam-start-gate";
import type { Exam, ExamAttemptMode } from "@/lib/types";

export default async function TakeExamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ practice?: string }>;
}) {
  const { id } = await params;
  const { practice } = await searchParams;
  const mode: ExamAttemptMode = practice === "true" ? "practice" : "official";
  const user = await requirePageUser();

  // This GET is deliberately read-only. Questions and attempt content are
  // returned exclusively by the explicit start POST.
  const supabase = await createClient();
  const { data: exam, error } = await supabase
    .from("exams")
    .select("id, title, description, time_limit_minutes, starts_at, ends_at, is_published, results_published, results_version, is_magnus_only, is_free, created_by, created_at, updated_at")
    .eq("id", id)
    .eq("is_published", true)
    .single();
  if (error || !exam) redirect("/exams");

  const now = Date.now();
  let hasResumableAttempt = false;
  if (mode === "official") {
    const { data: resumable } = await supabase
      .from("exam_attempts")
      .select("id, status, expires_at")
      .eq("exam_id", id)
      .eq("user_id", user.id)
      .eq("mode", "official")
      .in("status", ["active", "locked"])
      .maybeSingle();
    hasResumableAttempt = Boolean(
      resumable && now <= new Date(resumable.expires_at).getTime() + 3 * 60_000,
    );

    const startsAt = new Date(exam.starts_at).getTime();
    const endsAt = new Date(exam.ends_at).getTime();
    if (now < startsAt || now >= endsAt) {
      if (!hasResumableAttempt) redirect("/exams");
    }
  } else {
    if (!exam.results_published) redirect("/exams");
    const { data: resumable } = await supabase
      .from("exam_attempts")
      .select("id")
      .eq("exam_id", id)
      .eq("user_id", user.id)
      .eq("mode", "practice")
      .in("status", ["active", "locked", "awaiting_selection", "grading"])
      .limit(1);
    hasResumableAttempt = Boolean(resumable?.length);
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background">
      <ExamStartGate exam={exam as Exam} userId={user.id} mode={mode} hasResumableAttempt={hasResumableAttempt} />
    </div>
  );
}
