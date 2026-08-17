"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Camera,
  CheckCircle,
  Clock,
  Image as ImageIcon,
  Loader2,
  Lock,
  PenLine,
  Save,
  Upload,
} from "lucide-react";
import { WebcamCapture } from "@/components/ui/webcam-capture";
import { clearEncryptedRecovery, loadEncryptedRecovery, saveEncryptedRecovery } from "@/lib/exams/recovery-client";
import type {
  AttemptDrafts,
  AttemptQuestion,
  Exam,
  ExamAttempt,
  GradingResultJSON,
} from "@/lib/types";

type AnswerState = {
  ocrText: string;
  editedText: string;
  uploading: boolean;
  saving: boolean;
  isDirty: boolean;
  editorOpen: boolean;
  error?: string;
};

type PracticeSelection = {
  availableSlots: number;
  selectable: Array<{ examQuestionId: string; marks: number; prompt: string }>;
};

type JobItem = {
  exam_question_id: string;
  status: string;
  result: GradingResultJSON | null;
  last_error: string | null;
};

interface Props {
  exam: Exam;
  examQuestions: AttemptQuestion[];
  attempt: ExamAttempt;
  writerToken: string;
  initialDrafts: AttemptDrafts;
  isPractice?: boolean;
}

function emptyAnswer(draft?: { ocrText: string; editedText: string }): AnswerState {
  return {
    ocrText: draft?.ocrText ?? "",
    editedText: draft?.editedText ?? "",
    uploading: false,
    saving: false,
    isDirty: false,
    editorOpen: Boolean(draft?.editedText),
  };
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export default function ExamTakerClient({
  exam,
  examQuestions,
  attempt,
  writerToken,
  initialDrafts,
  isPractice = false,
}: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(() =>
    Object.fromEntries(examQuestions.map((question) => [question.id, emptyAnswer(initialDrafts[question.id])])),
  );
  const answersRef = useRef(answers);
  const [timeLeft, setTimeLeft] = useState(() =>
    Math.max(0, Math.ceil((new Date(attempt.expires_at).getTime() - Date.now()) / 1000)),
  );
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locked, setLocked] = useState(false);
  const [readOnlyReason, setReadOnlyReason] = useState<string | null>(null);
  const [selection, setSelection] = useState<PracticeSelection | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobItems, setJobItems] = useState<JobItem[] | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const expiryTriggered = useRef(false);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    let cancelled = false;
    void loadEncryptedRecovery(attempt.id).then((recovered) => {
      if (cancelled || !Object.keys(recovered).length) return;
      setAnswers((current) => {
        const next = { ...current };
        for (const [questionId, answer] of Object.entries(recovered)) {
          if (!next[questionId]) continue;
          next[questionId] = {
            ...next[questionId],
            ...answer,
            editorOpen: true,
            isDirty: true,
          };
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [attempt.id]);

  useEffect(() => {
    if (locked) return;
    const timeout = window.setTimeout(() => {
      const dirty = Object.fromEntries(
        Object.entries(answers)
          .filter(([, answer]) => answer.isDirty)
          .map(([id, answer]) => [id, { ocrText: answer.ocrText, editedText: answer.editedText }]),
      );
      void saveEncryptedRecovery(attempt.id, dirty);
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [answers, attempt.id, locked]);

  const persistEntries = useCallback(
    async (entries: Array<[string, Pick<AnswerState, "ocrText" | "editedText">]>) => {
      if (!entries.length) return true;
      const response = await fetch(`/api/exam-attempts/${attempt.id}/drafts`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          writerToken,
          answers: entries.map(([examQuestionId, answer]) => ({ examQuestionId, ...answer })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.code === "WRITER_REVOKED") {
          setLocked(true);
          setReadOnlyReason(data.error);
        }
        throw new Error(data.error ?? "Draft save failed");
      }

      setAnswers((current) => {
        const next = { ...current };
        for (const [questionId, sent] of entries) {
          const latest = next[questionId];
          if (!latest) continue;
          const unchanged = latest.ocrText === sent.ocrText && latest.editedText === sent.editedText;
          next[questionId] = { ...latest, saving: false, isDirty: unchanged ? false : latest.isDirty };
        }
        return next;
      });
      return true;
    },
    [attempt.id, writerToken],
  );

  const saveDrafts = useCallback(
    async (questionIds?: string[]) => {
      const allowed = questionIds ? new Set(questionIds) : null;
      const entries = Object.entries(answersRef.current)
        .filter(([id, answer]) => answer.isDirty && (!allowed || allowed.has(id)))
        .map(([id, answer]) => [id, { ocrText: answer.ocrText, editedText: answer.editedText }] as [string, Pick<AnswerState, "ocrText" | "editedText">]);
      if (!entries.length) return true;
      setIsSavingAll(true);
      setAnswers((current) => Object.fromEntries(
        Object.entries(current).map(([id, answer]) => [
          id,
          entries.some(([entryId]) => entryId === id) ? { ...answer, saving: true } : answer,
        ]),
      ));
      try {
        return await persistEntries(entries);
      } catch (error) {
        console.error(error);
        setAnswers((current) => Object.fromEntries(
          Object.entries(current).map(([id, answer]) => [id, { ...answer, saving: false }]),
        ));
        return false;
      } finally {
        setIsSavingAll(false);
      }
    },
    [persistEntries],
  );

  const saveRef = useRef(saveDrafts);
  useEffect(() => {
    saveRef.current = saveDrafts;
  }, [saveDrafts]);

  useEffect(() => {
    const timer = window.setInterval(() => void saveRef.current(), 30_000);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void saveRef.current();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const completeAttempt = useCallback(async () => {
    if (isSubmitting) return;
    setLocked(true);
    setIsSubmitting(true);
    try {
      await saveRef.current();
      const response = await fetch(`/api/exam-attempts/${attempt.id}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ writerToken }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Submission failed");

      localStorage.removeItem("in_progress_exam");
      window.dispatchEvent(new Event("in_progress_exam_updated"));
      if (isPractice) {
        setSelection(data as PracticeSelection);
        setSelectedIds(new Set());
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        clearEncryptedRecovery(attempt.id);
        router.push(`/exams/${exam.id}/results`);
      }
    } catch (error) {
      setReadOnlyReason(error instanceof Error ? error.message : "Submission failed");
      if (Date.now() < new Date(attempt.expires_at).getTime()) setLocked(false);
    } finally {
      setIsSubmitting(false);
    }
  }, [attempt.expires_at, attempt.id, exam.id, isPractice, isSubmitting, router, writerToken]);

  const completeRef = useRef(completeAttempt);
  useEffect(() => {
    completeRef.current = completeAttempt;
  }, [completeAttempt]);

  useEffect(() => {
    const expiresAt = new Date(attempt.expires_at).getTime();
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0 && !expiryTriggered.current) {
        expiryTriggered.current = true;
        setLocked(true);
        void completeRef.current();
      }
    };
    tick();
    const timer = window.setInterval(tick, 1_000);
    localStorage.setItem("in_progress_exam", JSON.stringify({
      examId: exam.id,
      attemptId: attempt.id,
      title: exam.title,
      isPractice,
      expiresAt: attempt.expires_at,
      lastUpdatedAt: Date.now(),
    }));
    window.dispatchEvent(new Event("in_progress_exam_updated"));
    return () => window.clearInterval(timer);
  }, [attempt.expires_at, attempt.id, exam.id, exam.title, isPractice]);

  async function handleFileUpload(questionId: string, files: FileList | File[]) {
    setAnswers((current) => ({
      ...current,
      [questionId]: { ...current[questionId], uploading: true, error: undefined },
    }));
    try {
      const extracted: string[] = [];
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("image", file);
        const response = await fetch("/api/ocr", { method: "POST", body: formData });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "OCR failed");
        extracted.push(data.text);
      }
      const editedText = extracted.join("\n\n");
      setAnswers((current) => ({
        ...current,
        [questionId]: {
          ...current[questionId],
          ocrText: editedText,
          editedText,
          uploading: false,
          editorOpen: true,
          isDirty: true,
        },
      }));
      await persistEntries([[questionId, { ocrText: editedText, editedText }]]);
    } catch (error) {
      setAnswers((current) => ({
        ...current,
        [questionId]: {
          ...current[questionId],
          uploading: false,
          error: error instanceof Error ? error.message : "OCR failed",
        },
      }));
    }
  }

  function updateText(questionId: string, text: string) {
    if (locked) return;
    setAnswers((current) => ({
      ...current,
      [questionId]: { ...current[questionId], editedText: text, isDirty: true },
    }));
  }

  async function submitPracticeSelection() {
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/exam-attempts/${attempt.id}/practice/grade`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ writerToken, examQuestionIds: [...selectedIds] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to start grading");
      if (!data.jobId) {
        setJobItems([]);
        setJobStatus("completed");
      } else {
        setJobId(data.jobId);
        setJobStatus(data.status);
      }
    } catch (error) {
      setReadOnlyReason(error instanceof Error ? error.message : "Unable to start grading");
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    if (!jobId || ["completed", "failed", "cancelled"].includes(jobStatus ?? "")) return;
    let cancelled = false;
    const poll = async () => {
      const response = await fetch(`/api/grading-jobs/${jobId}`, { cache: "no-store" });
      const data = await response.json();
      if (cancelled || !response.ok) return;
      setJobStatus(data.job.status);
      setJobItems(data.items);
      if (["completed", "failed", "cancelled"].includes(data.job.status)) {
        clearEncryptedRecovery(attempt.id);
      }
    };
    void poll();
    const timer = window.setInterval(poll, 2_500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [attempt.id, jobId, jobStatus]);

  if (selection && jobStatus && ["completed", "failed", "cancelled"].includes(jobStatus)) {
    const resultMap = new Map((jobItems ?? []).map((item) => [item.exam_question_id, item.result]));
    const scoredQuestions = examQuestions.filter((question) => question.questions.category !== "translation");
    const total = scoredQuestions.reduce((sum, question) => sum + (resultMap.get(question.id)?.internal.total ?? 0), 0);
    const maximum = scoredQuestions.reduce((sum, question) => sum + question.marks, 0);
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8 rounded-3xl border border-brand-200 bg-brand-50 p-8 text-center">
          <CheckCircle className="mx-auto mb-3 text-brand-600" size={42} />
          <h2 className="text-2xl font-black text-brand-900">Practice Complete</h2>
          <p className="mt-2 text-brand-800">You scored {total} out of {maximum}. Unselected answers count as zero; translations are excluded.</p>
          <Link href="/exams" prefetch={false} className="mt-6 inline-block rounded-xl bg-brand-600 px-6 py-2.5 font-bold text-white">
            Back to Exams
          </Link>
        </div>
        <div className="space-y-6">
          {examQuestions.map((question, index) => {
            const result = resultMap.get(question.id);
            const translation = question.questions.category === "translation";
            return (
              <article key={question.id} className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-4 flex items-center justify-between border-b border-border pb-4">
                  <h3 className="font-bold">Question {index + 1}</h3>
                  <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-bold text-brand-700">
                    {translation ? "Not AI graded" : `${result?.internal.total ?? 0}/${question.marks}`}
                  </span>
                </div>
                <p className="mb-4 whitespace-pre-wrap text-sm font-medium">{question.questions.prompt}</p>
                <div className="mb-4 rounded-xl bg-muted/30 p-4 text-sm whitespace-pre-wrap">
                  {answers[question.id]?.editedText || "No answer"}
                </div>
                <p className="text-sm text-muted-foreground">
                  {translation
                    ? "Translation is kept for self-study and excluded from quota and totals."
                    : result?.studentFeedback.summary ?? "This answer was not selected for AI grading and counts as zero."}
                </p>
                {result?.studentFeedback.highlights?.length ? (
                  <div className="mt-4 space-y-2">
                    {result.studentFeedback.highlights.map((highlight, highlightIndex) => (
                      <div key={highlightIndex} className="rounded-lg border border-border bg-muted/20 p-3 text-xs">
                        <strong className="block">“{highlight.quote}”</strong>
                        {highlight.comment}
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    );
  }

  if (selection) {
    const limit = Math.min(selection.availableSlots, selection.selectable.length);
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-3xl border border-border bg-card p-8">
          <Lock className="mb-4 text-brand-600" size={36} />
          <h2 className="text-2xl font-black">Choose answers to grade</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Each selected answer uses one test slot. You have {selection.availableSlots} slot{selection.availableSlots === 1 ? "" : "s"} available and may choose up to {limit}.
          </p>
          <div className="my-6 space-y-3">
            {selection.selectable.map((item) => {
              const selected = selectedIds.has(item.examQuestionId);
              return (
                <label key={item.examQuestionId} className="flex cursor-pointer gap-3 rounded-xl border border-border p-4">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={!selected && selectedIds.size >= limit}
                    onChange={() => setSelectedIds((current) => {
                      const next = new Set(current);
                      if (next.has(item.examQuestionId)) next.delete(item.examQuestionId);
                      else if (next.size < limit) next.add(item.examQuestionId);
                      return next;
                    })}
                  />
                  <span className="line-clamp-2 text-sm font-medium">{item.prompt}</span>
                  <span className="ml-auto whitespace-nowrap text-xs font-bold text-muted-foreground">{item.marks} marks</span>
                </label>
              );
            })}
          </div>
          {selection.availableSlots < selection.selectable.length && (
            <p className="mb-4 text-sm text-amber-700">
              Need every answer graded? <Link href="/subscription" prefetch={false} className="font-bold underline">Buy more test slots</Link>.
            </p>
          )}
          {jobId && !["completed", "failed"].includes(jobStatus ?? "") ? (
            <div className="flex items-center gap-3 rounded-xl bg-brand-50 p-4 text-brand-800">
              <Loader2 className="animate-spin" size={20} /> Grading {jobItems?.filter((item) => item.status === "completed").length ?? 0} of {selectedIds.size} answers…
            </div>
          ) : (
            <button
              type="button"
              onClick={submitPracticeSelection}
              disabled={isSubmitting || selectedIds.size > limit}
              className="w-full rounded-xl bg-brand-600 px-6 py-3 font-bold text-white disabled:opacity-50"
            >
              {isSubmitting ? "Starting grading…" : `Grade ${selectedIds.size} Selected Answer${selectedIds.size === 1 ? "" : "s"}`}
            </button>
          )}
          {readOnlyReason && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{readOnlyReason}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-32">
      <div className="sticky top-4 z-40 mb-8 flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-4 shadow-lg sm:flex-row sm:items-center">
        <div>
          <h1 className="font-bold">{isPractice ? `[Practice] ${exam.title}` : exam.title}</h1>
          <p className="text-xs text-muted-foreground">{examQuestions.length} questions · drafts save every 30 seconds when changed</p>
        </div>
        <div className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2 ${timeLeft < 300 ? "border-red-200 bg-red-50 text-red-700" : "border-brand-200 bg-brand-50 text-brand-700"}`}>
          <Clock size={19} /> <span className="font-mono text-xl font-bold">{formatTime(timeLeft)}</span>
        </div>
      </div>

      {readOnlyReason && (
        <div className="mb-6 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle className="shrink-0" size={20} /> {readOnlyReason}
        </div>
      )}

      <div className="space-y-8">
        {examQuestions.map((question, index) => {
          const answer = answers[question.id];
          if (!answer) return null;
          const maxWords = question.marks > 10 ? 250 : 150;
          const wordCount = answer.editedText.trim() ? answer.editedText.trim().split(/\s+/).length : 0;
          return (
            <section key={question.id} className="rounded-2xl border border-border bg-card p-6">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">{index + 1}</span>
                  <h2 className="font-bold">Question {index + 1}</h2>
                </div>
                <span className="text-sm font-bold text-muted-foreground">{question.marks} marks</span>
              </div>
              <p className="mb-5 whitespace-pre-wrap font-medium">{question.questions.prompt}</p>
              {isPractice && question.questions.category === "translation" && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Translation is available for self-study but is not AI graded and does not use a test slot.
                </div>
              )}

              {answer.uploading ? (
                <div className="flex flex-col items-center rounded-xl border border-border bg-muted/30 p-12">
                  <Loader2 className="mb-3 animate-spin text-brand-600" size={30} />
                  <p className="text-sm text-muted-foreground">Extracting text…</p>
                </div>
              ) : activeCameraId === question.id ? (
                <WebcamCapture
                  onCapture={(file) => {
                    setActiveCameraId(null);
                    void handleFileUpload(question.id, [file]);
                  }}
                  onCancel={() => setActiveCameraId(null)}
                />
              ) : !answer.editorOpen ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  <button type="button" disabled={locked} onClick={() => setAnswers((current) => ({ ...current, [question.id]: { ...current[question.id], editorOpen: true, isDirty: true } }))} className="rounded-xl border-2 border-dashed border-border p-6 disabled:opacity-50">
                    <PenLine className="mx-auto mb-2 text-brand-600" size={22} /><span className="text-sm font-bold">Type Answer</span>
                  </button>
                  <button type="button" disabled={locked} onClick={() => setActiveCameraId(question.id)} className="rounded-xl border-2 border-dashed border-border p-6 disabled:opacity-50">
                    <Camera className="mx-auto mb-2 text-brand-600" size={22} /><span className="text-sm font-bold">Take Photo</span>
                  </button>
                  <label className={`rounded-xl border-2 border-dashed border-border p-6 text-center ${locked ? "opacity-50" : "cursor-pointer"}`}>
                    <ImageIcon className="mx-auto mb-2 text-brand-600" size={22} /><span className="text-sm font-bold">Upload Image</span>
                    <input type="file" accept="image/*" multiple={question.questions.max_images > 1} disabled={locked} className="hidden" onChange={(event) => {
                      if (event.target.files?.length) void handleFileUpload(question.id, event.target.files);
                    }} />
                  </label>
                </div>
              ) : (
                <div>
                  <textarea
                    value={answer.editedText}
                    onChange={(event) => updateText(question.id, event.target.value)}
                    disabled={locked}
                    maxLength={maxWords * 8}
                    className="h-52 w-full resize-none rounded-xl border border-border bg-background p-4 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-70"
                    placeholder="Type or review your answer here…"
                  />
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>{answer.error ?? (answer.isDirty ? "Unsaved changes" : "Saved on server")}</span>
                    <span className={wordCount > maxWords ? "font-bold text-red-600" : ""}>{wordCount} / {maxWords} words</span>
                  </div>
                  <button type="button" disabled={locked || !answer.isDirty || answer.saving} onClick={() => void saveDrafts([question.id])} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs font-bold disabled:opacity-50">
                    {answer.saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                    {answer.saving ? "Saving…" : "Save this answer"}
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/90 p-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl flex-col justify-between gap-3 sm:flex-row">
          <button type="button" disabled={locked || isSavingAll || !Object.values(answers).some((answer) => answer.isDirty)} onClick={() => void saveDrafts()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-5 py-3 font-bold disabled:opacity-50">
            {isSavingAll ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} Save Changes
          </button>
          <button type="button" disabled={locked || isSubmitting} onClick={() => void completeAttempt()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-8 py-3 font-bold text-white disabled:opacity-50">
            {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : <Upload size={18} />}
            {isSubmitting ? "Finalizing…" : isPractice ? "Finish Practice" : "Submit Exam"}
          </button>
        </div>
      </div>
    </div>
  );
}
