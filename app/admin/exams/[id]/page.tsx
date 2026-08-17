import { notFound } from "next/navigation";
import ExamBuilderClient from "@/components/admin/exam-builder-client";
import { createAdminClient } from "@/lib/supabase/server";
import type { Question } from "@/lib/types";

export default async function AdminEditExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await createAdminClient();
  const [{ data: exam }, { data: examQuestions }, { data: questions }, { count: attemptCount }] = await Promise.all([
    admin.from("exams").select("*").eq("id", id).single(),
    admin
      .from("exam_questions")
      .select("marks, order_index, questions(*)")
      .eq("exam_id", id)
      .order("order_index"),
    admin.from("questions").select("*").eq("is_active", true).order("created_at", { ascending: false }),
    admin
      .from("exam_attempts")
      .select("id", { count: "exact", head: true })
      .eq("exam_id", id)
      .eq("mode", "official"),
  ]);
  if (!exam) notFound();

  const selected = (examQuestions ?? [])
    .filter((row: any) => row.questions)
    .map((row: any) => ({ q: row.questions as Question, marks: row.marks }));
  return (
    <div className="mx-auto max-w-5xl animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Edit Weekly Exam</h1>
        <p className="text-sm text-muted-foreground">Changes are permitted only before the first official attempt starts.</p>
      </div>
      <ExamBuilderClient
        availableQuestions={(questions ?? []) as Question[]}
        locked={(attemptCount ?? 0) > 0}
        initialExam={{
          id: exam.id,
          title: exam.title,
          description: exam.description,
          timeLimitMinutes: exam.time_limit_minutes,
          startsAt: exam.starts_at,
          endsAt: exam.ends_at,
          isPublished: exam.is_published,
          questions: selected,
        }}
      />
    </div>
  );
}

