"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bot, CheckCircle, Clock, Loader2, Sparkles } from "lucide-react";
import { ForceGradeButton } from "../../ForceGradeButton";

export type BulkSubmissionStudent = {
  userId: string;
  name: string;
  institute: string | null;
  totalQuestions: number;
  gradedQuestions: number;
  isSubmitted: boolean;
  canFinalize: boolean;
  aiEligibleSubmissionIds: string[];
  manualOnlyAnswers: number;
};

export default function BulkSubmissionGradingClient({
  examId,
  students,
}: {
  examId: string;
  students: BulkSubmissionStudent[];
}) {
  const router = useRouter();
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0, failed: 0 });
  const [error, setError] = useState<string | null>(null);

  const selectableStudents = useMemo(
    () => students.filter((student) => student.aiEligibleSubmissionIds.length > 0),
    [students],
  );
  const selectedSubmissionIds = useMemo(
    () => students
      .filter((student) => selectedUsers.has(student.userId))
      .flatMap((student) => student.aiEligibleSubmissionIds),
    [selectedUsers, students],
  );
  const allEligibleSubmissionIds = useMemo(
    () => selectableStudents.flatMap((student) => student.aiEligibleSubmissionIds),
    [selectableStudents],
  );
  const allSelected = selectableStudents.length > 0
    && selectableStudents.every((student) => selectedUsers.has(student.userId));
  const jobRunning = Boolean(jobId && !["completed", "failed", "cancelled"].includes(jobStatus ?? ""));

  async function startJob(options: { submissionIds?: string[]; scope: "selected" | "missing" }) {
    if (options.scope === "selected" && !options.submissionIds?.length) return;
    setError(null);
    try {
      const response = await fetch("/api/admin/grading-jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ examId, ...options, allowRegrade: false }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Unable to start AI grading");
      setJobId(data.job.id);
      setJobStatus(data.job.status);
      setProgress({
        completed: data.job.completed_items ?? 0,
        total: data.job.total_items ?? 0,
        failed: data.job.failed_items ?? 0,
      });
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
        setProgress({
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
    setSelectedUsers(allSelected
      ? new Set()
      : new Set(selectableStudents.map((student) => student.userId)));
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border bg-muted/20 p-4 lg:flex-row lg:items-center">
        <button
          type="button"
          disabled={!selectedSubmissionIds.length || jobRunning}
          onClick={() => startJob({ submissionIds: selectedSubmissionIds, scope: "selected" })}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          <Bot size={16} /> AI grade selected submissions ({selectedUsers.size})
        </button>
        <button
          type="button"
          disabled={!allEligibleSubmissionIds.length || jobRunning}
          onClick={() => startJob({ scope: "missing" })}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-bold text-brand-700 disabled:opacity-50"
        >
          <Sparkles size={16} /> AI grade all ungraded ({allEligibleSubmissionIds.length})
        </button>
        {jobRunning && (
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="animate-spin" size={16} />
            {progress.completed}/{progress.total} complete{progress.failed ? ` · ${progress.failed} failed` : ""}
          </span>
        )}
        <p className="text-xs text-muted-foreground lg:ml-auto">
          A selected student sends every eligible answer. Existing grades and translations remain untouched.
        </p>
      </div>

      {error && <p className="border-b border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

      {students.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground">
          <p>No submissions yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="w-12 px-5 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all AI-ready student submissions"
                    checked={allSelected}
                    disabled={!selectableStudents.length || jobRunning}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Student</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Progress</th>
                <th className="px-5 py-3 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {students.map((student) => {
                const selectable = student.aiEligibleSubmissionIds.length > 0;
                const complete = student.totalQuestions > 0 && student.gradedQuestions === student.totalQuestions;
                return (
                  <tr key={student.userId} className="hover:bg-muted/30">
                    <td className="px-5 py-4">
                      <input
                        type="checkbox"
                        aria-label={`Select the whole submission from ${student.name}`}
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
                      {student.canFinalize ? (
                        <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">Expired — finalize</span>
                      ) : complete ? (
                        <span className="inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700">Graded</span>
                      ) : student.isSubmitted ? (
                        <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">Submitted</span>
                      ) : (
                        <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">Ongoing</span>
                      )}
                      {student.manualOnlyAnswers > 0 && (
                        <p className="mt-1 text-xs text-amber-800">
                          {student.manualOnlyAnswers} translation answer{student.manualOnlyAnswers === 1 ? "" : "s"} need manual grading
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        {complete ? <CheckCircle size={16} className="text-green-500" /> : <Clock size={16} className="text-amber-500" />}
                        <div>
                          <p className="font-medium">{student.gradedQuestions} / {student.totalQuestions} graded</p>
                          <p className="text-xs text-muted-foreground">{student.aiEligibleSubmissionIds.length} AI-ready</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        {student.canFinalize && <ForceGradeButton examId={examId} targetUserId={student.userId} />}
                        {student.totalQuestions > 0 && (
                          <Link
                            href={`/admin/exams/${examId}/submissions/${student.userId}`}
                            className="rounded-lg bg-brand-50 px-4 py-2 text-sm font-bold text-brand-700 hover:bg-brand-100"
                          >
                            {complete ? "Review Grades" : "Grade Submission"}
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
      )}
    </div>
  );
}
