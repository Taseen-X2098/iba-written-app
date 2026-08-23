"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, CheckCircle, Loader2, Save, Sparkles } from "lucide-react";
import type { GradingResultJSON, QuestionCategory } from "@/lib/types";

export type GradingSubmission = {
  id: string;
  edited_text: string | null;
  grading_result: GradingResultJSON | null;
  graded_by: "ai" | "admin" | null;
  exam_questions: {
    marks: number;
    questions: {
      category: QuestionCategory;
      prompt: string;
    };
  };
};

type GradeState = {
  score: string | number;
  remarks: string;
  personalizedFeedback: string;
  waysToImprove: string;
  grammarErrors: Array<{
    quote: string;
    errorType: string;
    explanation: string;
    corrections: string[];
  }>;
  highlights: Array<{ quote: string; comment: string; type: "strength" | "improvement" }>;
  saving: boolean;
  saved: boolean;
  serverGradeSignature: string;
};

function gradeStateFromSubmission(submission: Pick<GradingSubmission, "grading_result">): GradeState {
  const result = submission.grading_result ?? null;
  const feedback = result?.studentFeedback;
  return {
    score: result?.internal?.total ?? "",
    remarks: feedback?.remarks ?? feedback?.summary ?? "",
    personalizedFeedback: feedback?.personalizedFeedback ?? "",
    waysToImprove: feedback?.waysToImprove ?? "",
    grammarErrors: feedback?.grammarErrors ?? [],
    highlights: feedback?.highlights ?? [],
    saving: false,
    saved: Boolean(result),
    serverGradeSignature: JSON.stringify(result),
  };
}

function gradeStateFromResult(result: GradingResultJSON): GradeState {
  return gradeStateFromSubmission({ grading_result: result });
}

function submissionGradesSignature(submissions: GradingSubmission[]): string {
  return JSON.stringify(submissions.map((submission) => [submission.id, submission.grading_result ?? null]));
}

export default function GradingClient({ examId, submissions }: { examId: string; submissions: GradingSubmission[] }) {
  const router = useRouter();
  const [grades, setGrades] = useState<Record<string, GradeState>>(() =>
    Object.fromEntries(submissions.map((submission) => [submission.id, gradeStateFromSubmission(submission)])),
  );
  const currentServerGradesSignature = submissionGradesSignature(submissions);
  const [loadedServerGradesSignature, setLoadedServerGradesSignature] = useState(currentServerGradesSignature);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState({ completed: 0, total: 0, failed: 0 });
  const [jobError, setJobError] = useState<string | null>(null);

  const aiEligibleIds = useMemo(() => submissions
    .filter((submission) => (
      submission.exam_questions?.questions?.category !== "translation"
      && !submission.grading_result
      && Boolean(submission.edited_text?.trim())
    ))
    .map((submission) => submission.id), [submissions]);

  if (loadedServerGradesSignature !== currentServerGradesSignature) {
    setLoadedServerGradesSignature(currentServerGradesSignature);
    setGrades((current) => Object.fromEntries(submissions.map((submission) => {
      const refreshed = gradeStateFromSubmission(submission);
      const existing = current[submission.id];
      // router.refresh() preserves Client Component state. Replace a row only
      // when its durable server grade changed, so completed AI jobs appear in
      // the boxes without erasing unsaved edits in other rows.
      return [
        submission.id,
        !existing || existing.serverGradeSignature !== refreshed.serverGradeSignature
          ? refreshed
          : existing,
      ];
    })));
  }

  async function startJob(body: { submissionIds?: string[]; scope: "selected" | "missing" }) {
    setJobError(null);
    const response = await fetch("/api/admin/grading-jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ examId, ...body, allowRegrade: false }),
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
    await startJob({ submissionIds: [...selected], scope: "selected" });
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
        if (data.job.status === "failed") {
          setJobError(data.job.last_error ?? "One or more answers could not be graded");
        }
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

  async function saveManual(submission: GradingSubmission) {
    const state = grades[submission.id];
    const score = Number(state.score);
    if (!Number.isFinite(score) || !state.remarks.trim() || !state.waysToImprove.trim()) {
      setJobError("A valid score, remarks, and ways to improve are required.");
      return;
    }
    setGrades((current) => ({ ...current, [submission.id]: { ...current[submission.id], saving: true } }));
    const response = await fetch("/api/admin/save-grade", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        submissionId: submission.id,
        score,
        remarks: state.remarks,
        waysToImprove: state.waysToImprove,
        highlights: state.highlights,
      }),
    });
    const data = await response.json();
    if (response.ok) {
      setGrades((current) => ({
        ...current,
        [submission.id]: { ...gradeStateFromResult(data.gradingResult), saving: false, saved: true },
      }));
      router.refresh();
    } else {
      setGrades((current) => ({
        ...current,
        [submission.id]: { ...current[submission.id], saving: false, saved: false },
      }));
      setJobError(data.error ?? "Unable to save grade");
    }
  }

  const jobRunning = Boolean(jobId && !["completed", "failed", "cancelled"].includes(jobStatus ?? ""));

  return (
    <div className="space-y-8 pb-24">
      <div className="sticky top-4 z-30 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-md sm:flex-row sm:items-center">
        <button type="button" disabled={!selected.size || jobRunning} onClick={gradeSelected} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          <Bot size={16} /> Grade Selected ({selected.size})
        </button>
        <button type="button" disabled={!aiEligibleIds.length || jobRunning} onClick={() => startJob({ scope: "missing" })} className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-bold text-brand-700 disabled:opacity-50">
          <Sparkles size={16} /> Grade All Missing ({aiEligibleIds.length})
        </button>
        <p className="text-xs text-muted-foreground sm:ml-auto">Existing grades and translation answers are never sent to AI grading.</p>
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
        const alreadyGraded = Boolean(submission.grading_result);
        return (
          <article key={submission.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <header className="flex items-start gap-3 border-b border-border bg-muted/40 p-6">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.has(submission.id)}
                aria-label={`Select question ${index + 1} for AI grading`}
                disabled={translation || alreadyGraded || !submission.edited_text?.trim() || jobRunning}
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
                  <input aria-label={`Score for question ${index + 1}`} type="number" min={0} max={examQuestion.marks} step={0.5} value={state.score} onChange={(event) => setGrades((current) => ({ ...current, [submission.id]: { ...current[submission.id], score: event.target.value, saved: false } }))} className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-center text-lg font-bold" />
                  <span className="font-bold text-muted-foreground">/ {examQuestion.marks}</span>
                </div>
                <div className="space-y-4">
                  <section className="rounded-xl border border-border bg-background p-4">
                    <label htmlFor={`remarks-${submission.id}`} className="text-sm font-bold text-foreground">1. Remarks on this submission</label>
                    <textarea
                      id={`remarks-${submission.id}`}
                      value={state.remarks}
                      onChange={(event) => setGrades((current) => ({ ...current, [submission.id]: { ...current[submission.id], remarks: event.target.value, saved: false } }))}
                      className="mt-2 h-28 w-full resize-y rounded-lg border border-border bg-background p-3 text-sm"
                      placeholder="Required remarks shown to the student"
                    />
                    {state.grammarErrors.length > 0 && (
                      <div className="mt-3 border-t border-border pt-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-amber-800">AI grammar audit</p>
                        <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                          {state.grammarErrors.map((error, errorIndex) => (
                            <li key={`${error.quote}-${errorIndex}`} className="rounded-lg bg-amber-50 p-2">
                              <span className="font-bold text-amber-900">“{error.quote}”</span>
                              {error.corrections[0] ? ` → ${error.corrections[0]}` : ` — ${error.explanation}`}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </section>

                  <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label htmlFor={`personal-${submission.id}`} className="text-sm font-bold text-foreground">2. Personalized feedback</label>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-violet-700">AI generated</span>
                    </div>
                    <textarea
                      id={`personal-${submission.id}`}
                      value={state.personalizedFeedback}
                      readOnly
                      className="mt-2 h-28 w-full resize-y rounded-lg border border-violet-200 bg-white/70 p-3 text-sm text-muted-foreground"
                      placeholder="AI will fill this when the grade is saved. The score remains controlled by the administrator."
                    />
                  </section>

                  <section className="rounded-xl border border-sky-200 bg-sky-50/40 p-4">
                    <label htmlFor={`improve-${submission.id}`} className="text-sm font-bold text-foreground">3. Ways to improve next time</label>
                    <textarea
                      id={`improve-${submission.id}`}
                      value={state.waysToImprove}
                      onChange={(event) => setGrades((current) => ({ ...current, [submission.id]: { ...current[submission.id], waysToImprove: event.target.value, saved: false } }))}
                      className="mt-2 h-28 w-full resize-y rounded-lg border border-sky-200 bg-white/70 p-3 text-sm"
                      placeholder="Required, specific next steps for the student"
                    />
                  </section>
                </div>
                <button type="button" disabled={state.saving} onClick={() => saveManual(submission)} className={`mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold ${state.saved ? "bg-green-100 text-green-700" : "bg-brand-600 text-white"}`}>
                  {state.saving ? <Loader2 className="animate-spin" size={16} /> : state.saved ? <CheckCircle size={16} /> : <Save size={16} />}
                  {state.saving ? "Saving grade and AI feedback…" : state.saved ? "Saved" : "Save Manual Grade"}
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
