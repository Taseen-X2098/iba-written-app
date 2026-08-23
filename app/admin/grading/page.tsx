import Link from "next/link";
import { AlertCircle, FileText } from "lucide-react";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import {
  buildAdminGradingQueue,
  type AdminQueueAttemptRecord,
  type AdminQueueExamRecord,
  type AdminQueueProfile,
  type AdminQueueSubmissionRecord,
} from "@/lib/grading/admin-queue";
import GradingQueueClient from "./GradingQueueClient";

export const dynamic = "force-dynamic";

function joinedRecord(value: unknown): Record<string, unknown> | null {
  const record = Array.isArray(value) ? value[0] : value;
  return record && typeof record === "object" ? record as Record<string, unknown> : null;
}

function joinedProfile(value: unknown): AdminQueueProfile | null {
  const profile = joinedRecord(value);
  if (!profile) return null;
  return {
    name: typeof profile.name === "string" ? profile.name : null,
    institute: typeof profile.institute === "string" ? profile.institute : null,
  };
}

export default async function AdminGradingPage() {
  await requireAdminUser();
  const admin = await createAdminClient();
  const { data: examRows, error: examError } = await admin
    .from("exams")
    .select("id, title, ends_at, is_published, results_published, results_version")
    .order("ends_at", { ascending: false })
    .limit(100);

  if (examError) {
    console.error("Unable to load exams for the grading queue", examError);
    return <QueueLoadError />;
  }

  const exams: AdminQueueExamRecord[] = (examRows ?? []).map((exam) => ({
    id: exam.id,
    title: exam.title,
    endsAt: exam.ends_at,
    isPublished: exam.is_published,
    resultsPublished: exam.results_published,
    resultsVersion: exam.results_version ?? 0,
  }));
  const examIds = exams.map((exam) => exam.id);

  if (!examIds.length) {
    return <QueuePage exams={[]} />;
  }

  const [questionResponse, attemptResponse, submissionResponse] = await Promise.all([
    admin
      .from("exam_questions")
      .select("id, exam_id")
      .in("exam_id", examIds)
      .range(0, 4_999),
    admin
      .from("exam_attempts")
      .select("id, exam_id, user_id, status, submitted_at, profiles(name, institute)")
      .in("exam_id", examIds)
      .eq("mode", "official")
      .range(0, 4_999),
    admin
      .from("exam_submissions")
      .select(`
        id,
        exam_id,
        user_id,
        attempt_id,
        question_id,
        edited_text,
        grading_result,
        graded_by,
        submitted_at,
        profiles(name, institute),
        exam_questions(marks, questions(category))
      `)
      .in("exam_id", examIds)
      .range(0, 4_999),
  ]);

  const loadError = questionResponse.error ?? attemptResponse.error ?? submissionResponse.error;
  if (loadError) {
    console.error("Unable to load the grading queue", loadError);
    return <QueueLoadError />;
  }

  const attempts: AdminQueueAttemptRecord[] = (attemptResponse.data ?? []).map((attempt) => ({
    id: attempt.id,
    examId: attempt.exam_id,
    userId: attempt.user_id,
    status: attempt.status,
    submittedAt: attempt.submitted_at,
    profile: joinedProfile(attempt.profiles),
  }));
  const submissions: AdminQueueSubmissionRecord[] = (submissionResponse.data ?? []).map((submission) => {
    const examQuestion = joinedRecord(submission.exam_questions);
    const question = joinedRecord(examQuestion?.questions);
    return {
      id: submission.id,
      examId: submission.exam_id,
      userId: submission.user_id,
      attemptId: submission.attempt_id,
      questionId: submission.question_id,
      editedText: submission.edited_text,
      gradingResult: submission.grading_result,
      gradedBy: submission.graded_by,
      submittedAt: submission.submitted_at,
      category: typeof question?.category === "string" ? question.category : null,
      profile: joinedProfile(submission.profiles),
    };
  });
  const queue = buildAdminGradingQueue({
    exams,
    questions: (questionResponse.data ?? []).map((question) => ({
      id: question.id,
      examId: question.exam_id,
    })),
    attempts,
    submissions,
  });

  return <QueuePage exams={queue} />;
}

function QueuePage({ exams }: { exams: ReturnType<typeof buildAdminGradingQueue> }) {
  const pendingAnswers = exams.reduce((total, exam) => total + exam.ungradedAnswers, 0);
  const readyToPublish = exams.filter((exam) =>
    exam.studentCount > 0 && exam.allGraded && exam.examEnded && !exam.resultsPublished,
  ).length;

  return (
    <div className="mx-auto max-w-7xl animate-fade-in">
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Grading Queue</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Official exam submissions are grouped by exam. Grade one student, select several students, or send every eligible missing answer to AI grading.
          </p>
        </div>
        <Link
          href="/admin/exams"
          className="inline-flex items-center gap-2 self-start rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground hover:bg-muted"
        >
          <FileText size={16} /> Manage exams
        </Link>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Exams</p>
          <p className="mt-1 text-2xl font-bold">{exams.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Answers remaining</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{pendingAnswers}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Ready to publish</p>
          <p className="mt-1 text-2xl font-bold text-green-700">{readyToPublish}</p>
        </div>
      </div>

      <GradingQueueClient exams={exams} />
    </div>
  );
}

function QueueLoadError() {
  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 shrink-0" size={20} />
        <div>
          <h1 className="font-bold">The grading queue could not be loaded</h1>
          <p className="mt-1 text-sm">No grading data was changed. Refresh the page, and check the server logs if the problem continues.</p>
        </div>
      </div>
    </div>
  );
}
