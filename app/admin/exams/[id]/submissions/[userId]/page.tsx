import { createAdminClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import GradingClient, { type GradingSubmission } from "./GradingClient";
import { CATEGORY_LABELS, type GradingResultJSON, type QuestionCategory } from "@/lib/types";

function joinedRecord(value: unknown): Record<string, unknown> | null {
  const record = Array.isArray(value) ? value[0] : value;
  return record && typeof record === "object" ? record as Record<string, unknown> : null;
}

function isQuestionCategory(value: unknown): value is QuestionCategory {
  return typeof value === "string" && value in CATEGORY_LABELS;
}

export default async function AdminGradeSubmissionPage({
  params,
}: {
  params: Promise<{ id: string; userId: string }>;
}) {
  const { id, userId } = await params;
  const adminClient = await createAdminClient();

  // 1. Fetch Exam
  const { data: exam } = await adminClient.from("exams").select("*").eq("id", id).single();
  
  // 2. Fetch User Profile
  const { data: profile } = await adminClient.from("profiles").select("name, institute").eq("id", userId).single();

  // 3. Fetch all submissions for this user & exam, joining questions (bypass RLS)
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
          category,
          prompt
        )
      )
    `)
    .eq("exam_id", id)
    .eq("user_id", userId);

  if (!exam || !profile || !submissions) {
    return <div>Data not found</div>;
  }

  const normalizedSubmissions = submissions.flatMap((submission): GradingSubmission[] => {
    const examQuestion = joinedRecord(submission.exam_questions);
    const question = joinedRecord(examQuestion?.questions);
    if (typeof examQuestion?.marks !== "number" || !isQuestionCategory(question?.category)) return [];
    return [{
      id: submission.id,
      edited_text: submission.edited_text,
      grading_result: submission.grading_result as GradingResultJSON | null,
      graded_by: submission.graded_by === "ai" || submission.graded_by === "admin" ? submission.graded_by : null,
      exam_questions: {
        marks: examQuestion.marks,
        questions: {
          category: question.category,
          prompt: typeof question.prompt === "string" ? question.prompt : "Question",
        },
      },
    }];
  });

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

      <GradingClient examId={id} submissions={normalizedSubmissions} />
    </div>
  );
}
