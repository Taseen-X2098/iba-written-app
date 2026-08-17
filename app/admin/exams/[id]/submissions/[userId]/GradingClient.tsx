"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, CheckCircle, Loader2, Save, Sparkles } from "lucide-react";

type GradeState = {
  score: string | number;
  feedback: string;
  highlights: Array<{ quote: string; comment: string; type: "strength" | "improvement" }>;
  saving: boolean;
  saved: boolean;
};

export default function GradingClient({ examId, submissions }: { examId: string; submissions: any[] }) {
  const router = useRouter();
  const [grades, setGrades] = useState<Record<string, GradeState>>(() =>
    Object.fromEntries(submissions.map((submission) => [submission.id, {
      score: submission.grading_result?.internal?.total ?? "",
      feedback: submission.grading_result?.studentFeedback?.summary ?? "",
      highlights: submission.grading_result?.studentFeedback?.highlights ?? [],
      saving: false,
      saved: Boolean(submission.grading_result),
    }])),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState({ completed: 0, total: 0, failed: 0 });
  const [jobError, setJobError] = useState<string | null>(null);

  async function startJob(body: { submissionIds?: string[]; scope: "selected" | "missing"; allowRegrade: boolean }) {
    setJobError(null);
    const response = await fetch("/api/admin/grading-jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ examId, ...body }),
    });
    const data = await response.json();
    if (!response.ok) {
      setJobError(data.error ?? "Unable to create grading job");
      return;
    }
    setJobId(data.job.id);
    setJobStatus(data.job.status);
    setJobProgress({ completed: 0, total: data.job.total_items, failed: 0 });
  }

  async function gradeSelected() {
    if (!selected.size) return;
    const selectedRows = submissions.filter((submission) => selected.has(submission.id));
    const regrading = selectedRows.some((submission) => submission.grading_result);
    if (regrading && !window.confirm("Regrade the selected answers with AI? Existing grades will be replaced, including explicitly selected admin grades.")) return;
    await startJob({ submissionIds: [...selected], scope: "selected", allowRegrade: regrading });
  }

  useEffect(() => {
    if (!jobId || ["completed", "failed", "cancelled"].includes(jobStatus ?? "")) return;
    let cancelled = false;
    const poll = async () => {
      const response = await fetch(`/api/grading-jobs/${jobId}`, { cache: "no-store" });
      const data = await response.json();
      if (cancelled || !response.ok) return;
      setJobStatus(data.job.status);
      setJobProgress({
        completed: data.job.completed_items,
        total: data.job.total_items,
        failed: data.job.failed_items,
      });
      if (["completed", "failed", "cancelled"].includes(data.job.status)) {
        setSelected(new Set());
        router.refresh();
      }
    };
    void poll();
    const timer = window.setInterval(poll, 2_500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [jobId, jobStatus, router]);

  async function saveManual(submission: any) {
    const state = grades[submission.id];
    const score = Number(state.score);
    if (!Number.isFinite(score) || !state.feedback.trim()) {
      setJobError("A valid score and student-facing feedback are required.");
      return;
    }
    setGrades((current) => ({ ...current, [submission.id]: { ...current[submission.id], saving: true } }));
    const response = await fetch("/api/admin/save-grade", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        submissionId: submission.id,
        score,
        summary: state.feedback,
        highlights: state.highlights,
      }),
    });
    const data = await response.json();
    setGrades((current) => ({
      ...current,
      [submission.id]: { ...current[submission.id], saving: false, saved: response.ok },
    }));
    if (!response.ok) setJobError(data.error ?? "Unable to save grade");
  }

  const jobRunning = Boolean(jobId && !["completed", "failed", "cancelled"].includes(jobStatus ?? ""));

  return (
    <div className="space-y-8 pb-24">
      <div className="sticky top-4 z-30 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-md sm:flex-row sm:items-center">
        <button type="button" disabled={!selected.size || jobRunning} onClick={gradeSelected} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          <Bot size={16} /> Grade Selected ({selected.size})
        </button>
        <button type="button" disabled={jobRunning} onClick={() => startJob({ scope: "missing", allowRegrade: false })} className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-bold text-brand-700 disabled:opacity-50">
          <Sparkles size={16} /> Grade All Missing
        </button>
        {jobRunning && (
          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="animate-spin" size={16} /> {jobProgress.completed}/{jobProgress.total} complete{jobProgress.failed ? ` · ${jobProgress.failed} failed` : ""}
          </span>
        )}
      </div>
      {jobError && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{jobError}</p>}

      {submissions.map((submission, index) => {
        const examQuestion = submission.exam_questions;
        const question = examQuestion.questions;
        const state = grades[submission.id];
        const translation = question.category === "translation";
        return (
          <article key={submission.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <header className="flex items-start gap-3 border-b border-border bg-muted/40 p-6">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.has(submission.id)}
                disabled={translation || !submission.edited_text || jobRunning}
                onChange={() => setSelected((current) => {
                  const next = new Set(current);
                  if (next.has(submission.id)) next.delete(submission.id); else next.add(submission.id);
                  return next;
                })}
              />
              <div className="flex-1">
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-brand-600">Question {index + 1} · {examQuestion.marks} marks</p>
                <p className="whitespace-pre-wrap font-medium">{question.prompt}</p>
              </div>
              <span className="rounded-md bg-brand-100 px-2 py-1 text-xs font-bold uppercase text-brand-700">{question.category.replaceAll("_", " ")}</span>
            </header>
            <div className="grid gap-8 p-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Student answer</h3>
                <div className="min-h-40 whitespace-pre-wrap rounded-xl border border-brand-100 bg-brand-50/40 p-4 text-sm">
                  {submission.edited_text || <span className="italic text-muted-foreground">No answer provided.</span>}
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider">Final grade</h3>
                  <span className="text-xs text-muted-foreground">{submission.graded_by ? `Saved by ${submission.graded_by}` : "Pending"}</span>
                </div>
                {translation && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Translation answers require manual grading.</p>}
                <div className="mb-4 flex items-center gap-3">
                  <input type="number" min={0} max={examQuestion.marks} step={0.5} value={state.score} onChange={(event) => setGrades((current) => ({ ...current, [submission.id]: { ...current[submission.id], score: event.target.value, saved: false } }))} className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-center text-lg font-bold" />
                  <span className="font-bold text-muted-foreground">/ {examQuestion.marks}</span>
                </div>
                <textarea value={state.feedback} onChange={(event) => setGrades((current) => ({ ...current, [submission.id]: { ...current[submission.id], feedback: event.target.value, saved: false } }))} className="h-28 w-full resize-none rounded-lg border border-border bg-background p-3 text-sm" placeholder="Required feedback shown to the student" />
                <button type="button" disabled={state.saving} onClick={() => saveManual(submission)} className={`mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold ${state.saved ? "bg-green-100 text-green-700" : "bg-brand-600 text-white"}`}>
                  {state.saving ? <Loader2 className="animate-spin" size={16} /> : state.saved ? <CheckCircle size={16} /> : <Save size={16} />}
                  {state.saving ? "Saving…" : state.saved ? "Saved" : "Save Manual Grade"}
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

