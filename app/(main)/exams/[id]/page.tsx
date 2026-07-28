import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ExamTakerClient from "@/components/exams/exam-taker-client";

export default async function TakeExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  if (now < startsAt || now > endsAt) {
    redirect("/exams"); // Not active
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
  const { data: existingResult } = await supabase
    .from("exam_results")
    .select("id")
    .eq("exam_id", id)
    .eq("user_id", user.id)
    .single();

  if (existingResult) {
    redirect(`/exams/${id}/results`);
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background">
      <ExamTakerClient 
        exam={exam} 
        examQuestions={examQuestions} 
        userId={user.id} 
      />
    </div>
  );
}
