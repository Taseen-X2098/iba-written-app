import { createClient, createAdminClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import GradingClient from "./GradingClient";

export default async function AdminGradeSubmissionPage({
  params,
}: {
  params: Promise<{ id: string; userId: string }>;
}) {
  const { id, userId } = await params;
  const supabase = await createClient();

  // 1. Fetch Exam
  const { data: exam } = await supabase.from("exams").select("*").eq("id", id).single();
  
  // 2. Fetch User Profile
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).single();

  // 3. Fetch all submissions for this user & exam, joining questions (bypass RLS)
  const adminClient = await createAdminClient();
  const { data: submissions } = await adminClient
    .from("exam_submissions")
    .select(`
      id,
      question_id,
      ocr_text,
      edited_text,
      grading_result,
      graded_by,
      exam_questions (
        marks,
        questions (
          id,
          title,
          category,
          passage
        )
      )
    `)
    .eq("exam_id", id)
    .eq("user_id", userId);

  if (!exam || !profile || !submissions) {
    return <div>Data not found</div>;
  }

  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      <div className="flex items-center gap-2 mb-6">
        <Link href={`/admin/exams/${id}/submissions`} className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm font-medium">
          <ArrowLeft size={16} /> Back to Submissions
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Grade Submission: {profile.name || "Unknown"}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Exam: {exam.title}
        </p>
      </div>

      <GradingClient submissions={submissions} />
    </div>
  );
}
