"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Bot,
  CheckCircle,
  Clock,
  ExternalLink,
  Loader2,
  Sparkles,
  Users,
} from "lucide-react";
import type { AdminQueueExam, AdminQueueStudent } from "@/lib/grading/admin-queue";
import PublishResultsButton from "../exams/[id]/submissions/PublishResultsButton";

const dateFormatter = new Intl.DateTimeFormat("en-BD", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Dhaka",
});

function formatDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not submitted";
  return dateFormatter.format(new Date(value));
}

function publicationMessage(exam: AdminQueueExam): string {
  if (!exam.studentCount) return "Results need at least one official submission before publication.";
  if (exam.unfinalizedAttempts) {
    return `${exam.unfinalizedAttempts} attempt${exam.unfinalizedAttempts === 1 ? "" : "s"} must be finalized first.`;
  }
  if (!exam.allGraded) {
    return `${exam.ungradedAnswers} answer${exam.ungradedAnswers === 1 ? "" : "s"} still need a final grade.`;
  }
  if (!exam.examEnded) return `Publishing unlocks after the exam ends on ${formatDate(exam.endsAt)}.`;
  return exam.resultsPublished
    ? `Results version ${exam.resultsVersion} is live. Republish after any grade changes.`
    : "Every answer has a final grade. Results are ready to publish.";
}

function studentStatus(student: AdminQueueStudent): { label: string; className: string } {
  if (student.attemptStatus !== "finalized") {
    return { label: "Needs finalization", className: "bg-red-100 text-red-700" };
  }
  if (student.manualOnlyAnswers > 0) {
    return { label: "Manual grading required", className: "bg-amber-100 text-amber-800" };
  }
  return { label: "AI grading ready", className: "bg-blue-100 text-blue-700" };
}

function ExamQueueCard({ exam }: { exam: AdminQueueExam }) {
  const router = useRouter();
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState({ completed: 0, total: 0, failed: 0 });
  const [error, setError] = useState<string | null>(null);

  const selectableStudents = useMemo(
    () => exam.pendingStudents.filter((student) => student.aiEligibleSubmissionIds.length > 0),
    [exam.pendingStudents],
  );
  const selectedSubmissionIds = useMemo(
    () => exam.pendingStudents
      .filter((student) => selectedUsers.has(student.userId))
      .flatMap((student) => student.aiEligibleSubmissionIds),
    [exam.pendingStudents, selectedUsers],
  );
  const jobRunning = Boolean(jobId && !["completed", "failed", "cancelled"].includes(jobStatus ?? ""));
  const allSelectableChecked = selectableStudents.length > 0 &&
    selectableStudents.every((student) => selectedUsers.has(student.userId));

  async function startJob(options: { submissionIds?: string[]; scope: "selected" | "missing" }) {
    if (options.scope === "selected" && !options.submissionIds?.length) return;
    setError(null);
    try {
      const response = await fetch("/api/admin/grading-jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          examId: exam.id,
          ...options,
          allowRegrade: false,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Unable to start AI grading");
      setJobId(data.job.id);
      setJobStatus(data.job.status);
      setJobProgress({ completed: data.job.completed_items ?? 0, total: data.job.total_items, failed: 0 });
    } catch (jobError) {
      setError(jobError instanceof Error ? jobError.message : "Unable to start AI grading");
    }
  }

  useEffect(() => {
    if (!jobId || ["completed", "failed", "cancelled"].includes(jobStatus ?? "")) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const response = await fetch(`/api/grading-jobs/${jobId}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) throw new Error(data.error ?? "Unable to refresh grading progress");
        setJobStatus(data.job.status);
        setJobProgress({
          completed: data.job.completed_items,
          total: data.job.total_items,
          failed: data.job.failed_items,
        });
        if (["completed", "failed", "cancelled"].includes(data.job.status)) {
          setSelectedUsers(new Set());
          if (data.job.status === "failed") {
            setError(data.job.last_error ?? "One or more answers could not be graded");
          }
          router.refresh();
        }
      } catch (pollError) {
        if (!cancelled) {
          setError(pollError instanceof Error ? pollError.message : "Unable to refresh grading progress");
        }
      }
    };

    void poll();
    const timer = window.setInterval(poll, 2_500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [jobId, jobStatus, router]);

  function toggleStudent(userId: string) {
    setSelectedUsers((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  }

  function toggleAll() {
    setSelectedUsers(allSelectableChecked
      ? new Set()
      : new Set(selectableStudents.map((student) => student.userId)));
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="border-b border-border bg-muted/30 p-5 md:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-foreground">{exam.title}</h2>
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${exam.isPublished ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                {exam.isPublished ? "Exam published" : "Draft"}
              </span>
              {exam.resultsPublished && (
                <span className="rounded-full bg-brand-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-700">
                  Results live · v{exam.resultsVersion}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {exam.questionCount} questions · {exam.studentCount} students · ends {formatDate(exam.endsAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/exams/${exam.id}/submissions`}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-bold text-foreground hover:bg-muted"
            >
              All submissions <ExternalLink size={15} />
            </Link>
            {exam.resultsPublished && (
              <Link
                href={`/exams/${exam.id}/results`}
                className="inline-flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-bold text-brand-700 hover:bg-brand-100"
              >
                View results <ExternalLink size={15} />
              </Link>
            )}
            <PublishResultsButton
              examId={exam.id}
              allGraded={exam.allGraded}
              examEnded={exam.examEnded}
              endsAt={exam.endsAt}
              hasSubmissions={exam.studentCount > 0}
              isPublished={exam.resultsPublished}
            />
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="text-xs font-medium text-muted-foreground">Final grades</p>
            <p className="mt-1 text-xl font-bold">{exam.gradedAnswers}</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="text-xs font-medium text-muted-foreground">Answers remaining</p>
            <p className="mt-1 text-xl font-bold text-amber-700">{exam.ungradedAnswers}</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="text-xs font-medium text-muted-foreground">AI-ready answers</p>
            <p className="mt-1 text-xl font-bold text-blue-700">{exam.aiEligibleAnswers}</p>
          </div>
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="text-xs font-medium text-muted-foreground">Attempts to finalize</p>
            <p className="mt-1 text-xl font-bold text-red-700">{exam.unfinalizedAttempts}</p>
          </div>
        </div>

        <div className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${exam.allGraded && exam.examEnded && exam.studentCount > 0 ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          {exam.allGraded && exam.examEnded && exam.studentCount > 0
            ? <CheckCircle className="mt-0.5 shrink-0" size={16} />
            : <AlertCircle className="mt-0.5 shrink-0" size={16} />}
          <div>
            <p className="font-bold">Result publication</p>
            <p>{publicationMessage(exam)}</p>
          </div>
        </div>
      </header>

      {exam.pendingStudents.length > 0 ? (
        <>
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={!selectedSubmissionIds.length || jobRunning}
              onClick={() => startJob({ submissionIds: selectedSubmissionIds, scope: "selected" })}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              <Bot size={16} /> AI grade selected ({selectedSubmissionIds.length})
            </button>
            <button
              type="button"
              disabled={!exam.aiEligibleAnswers || jobRunning}
              onClick={() => startJob({ scope: "missing" })}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-bold text-brand-700 disabled:opacity-50"
            >
              <Sparkles size={16} /> AI grade all missing ({exam.aiEligibleAnswers})
            </button>
            {jobRunning && (
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="animate-spin" size={16} />
                {jobProgress.completed}/{jobProgress.total} complete{jobProgress.failed ? ` · ${jobProgress.failed} failed` : ""}
              </span>
            )}
          </div>
          {error && <p className="border-b border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="border-b border-border bg-muted/20">
                <tr>
                  <th className="w-12 px-5 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select all AI-ready submissions for ${exam.title}`}
                      checked={allSelectableChecked}
                      disabled={!selectableStudents.length || jobRunning}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Student</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Progress</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Submitted</th>
                  <th className="px-5 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {exam.pendingStudents.map((student) => {
                  const status = studentStatus(student);
                  const selectable = student.aiEligibleSubmissionIds.length > 0;
                  return (
                    <tr key={student.userId} className="hover:bg-muted/20">
                      <td className="px-5 py-4">
                        <input
                          type="checkbox"
                          aria-label={`Select AI-ready answers from ${student.name}`}
                          checked={selectedUsers.has(student.userId)}
                          disabled={!selectable || jobRunning}
                          onChange={() => toggleStudent(student.userId)}
                        />
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-bold text-foreground">{student.name}</p>
                        {student.institute && <p className="text-xs text-muted-foreground">{student.institute}</p>}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${status.className}`}>
                          {status.label}
                        </span>
                        {student.manualOnlyAnswers > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {student.manualOnlyAnswers} translation answer{student.manualOnlyAnswers === 1 ? "" : "s"}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-bold">{student.gradedAnswers} / {student.expectedAnswers} graded</p>
                        <p className="text-xs text-muted-foreground">
                          {student.aiEligibleSubmissionIds.length} AI-ready · {student.ungradedAnswers} remaining
                        </p>
                      </td>
                      <td className="px-4 py-4 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5"><Clock size={14} /> {formatDate(student.submittedAt)}</span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={!selectable || jobRunning}
                            onClick={() => startJob({ submissionIds: student.aiEligibleSubmissionIds, scope: "selected" })}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700 disabled:opacity-50"
                          >
                            <Bot size={14} /> AI grade
                          </button>
                          {student.answerRecords > 0 ? (
                            <Link
                              href={`/admin/exams/${exam.id}/submissions/${student.userId}`}
                              className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700"
                            >
                              Review / grade manually
                            </Link>
                          ) : (
                            <Link
                              href={`/admin/exams/${exam.id}/submissions`}
                              className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-200"
                            >
                              Finalize attempt
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center p-10 text-center text-muted-foreground">
          {exam.studentCount > 0 ? <CheckCircle className="mb-3 text-green-500" size={30} /> : <Users className="mb-3 opacity-50" size={30} />}
          <p className="font-medium text-foreground">
            {exam.studentCount > 0 ? "All submitted answers have final grades." : "No official submissions yet."}
          </p>
          <p className="mt-1 text-sm">
            {exam.studentCount > 0 ? "You can review grades or publish the results above." : "Student attempts will appear here when they are submitted."}
          </p>
        </div>
      )}
    </section>
  );
}

export default function GradingQueueClient({ exams }: { exams: AdminQueueExam[] }) {
  if (!exams.length) {
    return (
      <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
        <Users className="mx-auto mb-3 opacity-50" size={32} />
        <p className="font-medium text-foreground">No exams have been created yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {exams.map((exam) => <ExamQueueCard key={exam.id} exam={exam} />)}
    </div>
  );
}
