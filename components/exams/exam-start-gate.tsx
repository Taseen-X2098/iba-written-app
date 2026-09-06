"use client";

import { useState } from "react";
import { AlertTriangle, Clock, Loader2, Play, RefreshCw } from "lucide-react";
import ExamTakerClient from "@/components/exams/exam-taker-client";
import type { AttemptStartResponse, Exam, ExamAttemptMode } from "@/lib/types";

function sessionKey(userId: string, examId: string, mode: ExamAttemptMode) {
  return `exam-attempt-session:${userId}:${examId}:${mode}`;
}

export default function ExamStartGate({
  exam,
  userId,
  mode,
  hasResumableAttempt = false,
}: {
  exam: Exam;
  userId: string;
  mode: ExamAttemptMode;
  hasResumableAttempt?: boolean;
}) {
  const [started, setStarted] = useState<AttemptStartResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAttemptId, setActiveAttemptId] = useState<string | null>(null);

  async function begin(takeover = false) {
    setLoading(true);
    setError(null);
    try {
      let stored: { attemptId: string; writerToken: string } | null = null;
      try {
        stored = JSON.parse(sessionStorage.getItem(sessionKey(userId, exam.id, mode)) ?? "null");
      } catch {
        stored = null;
      }

      if (takeover) {
        if (!activeAttemptId) throw new Error("No active attempt was found");
        const takeoverResponse = await fetch(`/api/exam-attempts/${activeAttemptId}/takeover`, { method: "POST" });
        const takeoverData = await takeoverResponse.json();
        if (!takeoverResponse.ok) throw new Error(takeoverData.error ?? "Takeover failed");
        stored = { attemptId: activeAttemptId, writerToken: takeoverData.writerToken };
        sessionStorage.setItem(sessionKey(userId, exam.id, mode), JSON.stringify(stored));
      }

      const response = await fetch(`/api/exams/${exam.id}/attempts/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, attemptId: stored?.attemptId, writerToken: stored?.writerToken }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.code === "ATTEMPT_ACTIVE" && data.details?.attemptId) {
          setActiveAttemptId(data.details.attemptId);
        }
        throw new Error(data.error ?? "Unable to start exam");
      }

      sessionStorage.setItem(
        sessionKey(userId, exam.id, mode),
        JSON.stringify({ attemptId: data.attempt.id, writerToken: data.writerToken }),
      );
      setStarted(data as AttemptStartResponse);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start exam");
    } finally {
      setLoading(false);
    }
  }

  if (started) {
    return (
      <ExamTakerClient
        exam={started.exam}
        examQuestions={started.questions}
        attempt={started.attempt}
        writerToken={started.writerToken}
        initialDrafts={started.drafts}
        initialAnswerImages={started.answerImages ?? {}}
        isPractice={mode === "practice"}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl items-center px-4 py-12">
      <div className="w-full rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-brand-100 text-brand-700">
          {mode === "practice" ? <RefreshCw size={30} /> : <Clock size={30} />}
        </div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-brand-600">
          {mode === "practice" ? "Practice attempt" : "Official exam"}
        </p>
        <h1 className="mb-3 text-2xl font-black text-foreground">{exam.title}</h1>
        <p className="mb-6 text-sm leading-6 text-muted-foreground">
          {hasResumableAttempt
            ? mode === "practice"
              ? "Your practice exam is still active. If time has ended, your answers stay safe while you choose grading or wait for grading to finish."
              : "Your exam is already in progress. Resuming it will not reset the timer."
            : `The ${exam.time_limit_minutes}-minute timer starts only after you press the button below. Questions remain hidden until then. Leaving the page will not pause the timer.`}
        </p>
        {mode === "official" && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} />
            <span>Use one device at a time. You can explicitly take over an active session without resetting its timer.</span>
          </div>
        )}
        {error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {activeAttemptId ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => begin(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-6 py-3 font-bold text-white disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
            Take Over Active Attempt
          </button>
        ) : (
          <button
            type="button"
            disabled={loading}
            onClick={() => begin(false)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 font-bold text-white disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : hasResumableAttempt ? <RefreshCw size={18} /> : <Play size={18} />}
            {loading
              ? hasResumableAttempt ? "Resuming..." : "Starting..."
              : hasResumableAttempt ? mode === "practice" ? "Resume Practice" : "Resume Exam" : mode === "practice" ? "Start Practice" : "Start Official Exam"}
          </button>
        )}
      </div>
    </div>
  );
}
