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
  await requirePageUser();

  // This GET is deliberately read-only and fetches metadata only. Questions and
  // attempt state are returned exclusively by the explicit start POST.
  const supabase = await createClient();
  const { data: exam, error } = await supabase
    .from("exams")
    .select("id, title, description, time_limit_minutes, starts_at, ends_at, is_published, results_published, results_version, created_by, created_at, updated_at")
    .eq("id", id)
    .eq("is_published", true)
    .single();
  if (error || !exam) redirect("/exams");

  const now = Date.now();
  if (mode === "official") {
    const startsAt = new Date(exam.starts_at).getTime();
    const endsAt = new Date(exam.ends_at).getTime();
    if (now < startsAt || now >= endsAt) redirect("/exams");
  } else if (!exam.results_published) {
    redirect("/exams");
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background">
      <ExamStartGate exam={exam as Exam} mode={mode} />
    </div>
  );
}

