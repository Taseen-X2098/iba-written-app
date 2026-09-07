import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ExamStartGate from "@/components/exams/exam-start-gate";
import AutoFinalizer from "@/components/exams/auto-finalizer";
import type { Exam, ExamAttemptMode } from "@/lib/types";
import { getMainUserContext } from "@/lib/main-user-context";
import { isExamPlan } from "@/lib/exams/access";
import { isAttemptWithinNetworkGrace, isExamWindowOpen } from "@/lib/exams/timing";

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
  const context = await getMainUserContext();
  if (!context) redirect("/login");
  if (mode === "practice" && !isExamPlan(context.subscription?.plan_type)) {
    redirect("/exams");
  }
  const { user } = context;

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

  const now = new Date().getTime();
  let hasResumableAttempt = false;
  if (mode === "official") {
    const { data: officialAttempt } = await supabase
      .from("exam_attempts")
      .select("id, status, expires_at")
      .eq("exam_id", id)
      .eq("user_id", user.id)
      .eq("mode", "official")
      .maybeSingle();

    if (officialAttempt?.status === "finalized") {
      redirect(`/exams/${id}/results#my-response`);
    }

    const isOngoing = officialAttempt
      && ["active", "locked"].includes(officialAttempt.status);
    if (officialAttempt && !isOngoing) redirect("/exams");

    if (isOngoing) {
      hasResumableAttempt = isAttemptWithinNetworkGrace(officialAttempt.expires_at, now);
      if (!hasResumableAttempt) {
        return (
          <div className="min-h-[calc(100vh-64px)] bg-background">
            <AutoFinalizer
              attemptId={officialAttempt.id}
              examId={exam.id}
              userId={user.id}
            />
          </div>
        );
      }
    } else if (!isExamWindowOpen(exam.starts_at, exam.ends_at, now)) {
      redirect("/exams");
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
