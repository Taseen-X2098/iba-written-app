import { createClient, createAdminClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ArrowLeft, CheckCircle, Trophy } from "lucide-react";
import PublishResultsButton from "./PublishResultsButton";
import { ForceGradeButton } from "../../ForceGradeButton";
import { listExpiredOfficialAttempts } from "@/lib/exams/finalize";
import BulkSubmissionGradingClient, { type BulkSubmissionStudent } from "./BulkSubmissionGradingClient";
import { examHasEnded } from "@/lib/grading/admin-queue";

export const dynamic = "force-dynamic";

function joinedRecord(value: unknown): Record<string, unknown> | null {
  const record = Array.isArray(value) ? value[0] : value;
  return record && typeof record === "object" ? record as Record<string, unknown> : null;
}

export default async function AdminExamSubmissionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // 1. Fetch Exam
  const { data: exam } = await supabase.from("exams").select("*").eq("id", id).single();
  if (!exam) return <div>Exam not found</div>;

  // 2. Fetch all submissions for this exam (bypass RLS for admin)
  const adminClient = await createAdminClient();
  const [{ data: submissions }, pendingAttempts] = await Promise.all([
    adminClient
      .from("exam_submissions")
      .select(`
        id,
        user_id,
        edited_text,
        grading_result,
        graded_by,
        submitted_at,
        profiles(name, institute),
        exam_questions(questions(category))
      `)
      .eq("exam_id", id),
    listExpiredOfficialAttempts(id),
  ]);

  const pendingUserIds = [...new Set(pendingAttempts.map((attempt) => attempt.user_id))];
  const { data: pendingProfiles } = pendingUserIds.length
    ? await adminClient.from("profiles").select("id, name, institute").in("id", pendingUserIds)
    : { data: [] };
  const pendingProfilesById = new Map((pendingProfiles ?? []).map((profile) => [profile.id, profile]));

  // Group by user
  const userSubmissions = (submissions || []).reduce((acc: Record<string, BulkSubmissionStudent>, sub) => {
    const profile = joinedRecord(sub.profiles);
    const examQuestion = joinedRecord(sub.exam_questions);
    const question = joinedRecord(examQuestion?.questions);
    const name = typeof profile?.name === "string" ? profile.name.trim() : "";
    const institute = typeof profile?.institute === "string" ? profile.institute.trim() : "";
    if (!acc[sub.user_id]) {
      acc[sub.user_id] = {
        userId: sub.user_id,
        name: name || "Unknown User",
        institute: institute || null,
        totalQuestions: 0,
        gradedQuestions: 0,
        isSubmitted: !!sub.submitted_at,
        canFinalize: false,
        aiEligibleSubmissionIds: [],
        manualOnlyAnswers: 0,
      };
    }
    acc[sub.user_id].totalQuestions += 1;
    if (sub.grading_result) {
      acc[sub.user_id].gradedQuestions += 1;
    } else if (question?.category === "translation") {
      acc[sub.user_id].manualOnlyAnswers += 1;
    } else if (sub.edited_text?.trim()) {
      acc[sub.user_id].aiEligibleSubmissionIds.push(sub.id);
    }
    return acc;
  }, {});

  for (const attempt of pendingAttempts) {
    if (!userSubmissions[attempt.user_id]) {
      userSubmissions[attempt.user_id] = {
        userId: attempt.user_id,
        name: pendingProfilesById.get(attempt.user_id)?.name?.trim() || "Unknown User",
        institute: pendingProfilesById.get(attempt.user_id)?.institute?.trim() || null,
        totalQuestions: 0,
        gradedQuestions: 0,
        isSubmitted: false,
        canFinalize: false,
        aiEligibleSubmissionIds: [],
        manualOnlyAnswers: 0,
      };
    }
    userSubmissions[attempt.user_id].canFinalize = true;
  }

  const students = Object.values(userSubmissions) as BulkSubmissionStudent[];
  const totalGraded = students.filter((student) => student.totalQuestions > 0 && student.gradedQuestions === student.totalQuestions).length;
  const allGraded = students.length > 0 && totalGraded === students.length;

  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/admin/exams" className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm font-medium">
          <ArrowLeft size={16} /> Back to Exams
        </Link>
      </div>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Submissions: {exam.title}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {students.length} students have attempted this exam.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <ForceGradeButton examId={id} />
          {exam.results_published && (
            <>
              <div className="bg-green-100 text-green-700 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
                <CheckCircle size={16} /> Results Published
              </div>
              <Link
                href={`/admin/exams/${id}/leaderboard`}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-100 px-4 py-2 text-sm font-bold text-amber-800 transition-colors hover:bg-amber-200"
              >
                <Trophy size={16} /> View Leaderboard
              </Link>
            </>
          )}
          <PublishResultsButton
            examId={id}
            allGraded={allGraded}
            examEnded={examHasEnded(exam.ends_at)}
            endsAt={exam.ends_at}
            hasSubmissions={students.length > 0}
            isPublished={exam.results_published}
          />
        </div>
      </div>

      <BulkSubmissionGradingClient examId={id} students={students} />
    </div>
  );
}
