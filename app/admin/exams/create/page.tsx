import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import ExamBuilderClient from "@/components/admin/exam-builder-client";

export default async function AdminCreateExamPage() {
  const supabase = await createClient();

  // Fetch all active questions to build an exam
  const { data: questions, error } = await supabase
    .from("questions")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load questions:", error);
  }

  return (
    <div className="animate-fade-in max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Create Weekly Exam</h1>
        <p className="text-muted-foreground text-sm">Select questions, set a time limit, and schedule the exam.</p>
      </div>

      <ExamBuilderClient availableQuestions={questions || []} />
    </div>
  );
}
