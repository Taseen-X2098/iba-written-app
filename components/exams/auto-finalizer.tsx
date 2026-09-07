"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import {
  clearExamAttemptSession,
  IN_PROGRESS_EXAM_UPDATED_EVENT,
  removeInProgressExam,
} from "@/lib/exams/in-progress-exam";
import { clearEncryptedRecovery } from "@/lib/exams/recovery-client";

const OCR_RETRY_DELAY_MS = 1_500;

export default function AutoFinalizer({
  attemptId,
  examId,
  userId,
}: {
  attemptId: string;
  examId: string;
  userId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [waitingForOcr, setWaitingForOcr] = useState(false);
  const stopped = useRef(false);
  const inFlight = useRef(false);

  const finalize = useCallback(async () => {
    if (stopped.current || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setWaitingForOcr(false);
    try {
      while (!stopped.current) {
        const response = await fetch(`/api/exam-attempts/${attemptId}/finalize-expired`, {
          method: "POST",
        });
        const data = await response.json();
        if (stopped.current) return;

        if (response.ok) {
          removeInProgressExam(localStorage, { attemptId });
          clearEncryptedRecovery(attemptId);
          clearExamAttemptSession(sessionStorage, userId, examId, "official");
          window.dispatchEvent(new Event(IN_PROGRESS_EXAM_UPDATED_EVENT));
          router.replace(`/exams/${examId}/results#my-response`);
          router.refresh();
          return;
        }
        if (data.code !== "OCR_PENDING") {
          throw new Error(data.error || "Failed to finalize the exam");
        }

        setWaitingForOcr(true);
        await new Promise((resolve) => window.setTimeout(resolve, OCR_RETRY_DELAY_MS));
      }
    } catch (cause) {
      if (!stopped.current) {
        setWaitingForOcr(false);
        setError(cause instanceof Error ? cause.message : "Failed to finalize the exam");
      }
    } finally {
      inFlight.current = false;
    }
  }, [attemptId, examId, router, userId]);

  useEffect(() => {
    stopped.current = false;
    void Promise.resolve().then(finalize);
    return () => {
      stopped.current = true;
    };
  }, [finalize]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 text-center">
      {error
        ? <AlertCircle size={48} className="mb-6 text-red-600" />
        : <Loader2 size={48} className="mb-6 animate-spin text-brand-600" />}
      <h2 className="text-xl font-bold text-foreground mb-2">Time&apos;s Up!</h2>
      <p className="text-muted-foreground text-center max-w-md">
        {waitingForOcr
          ? "Your last page photo is still being scanned. We will finalize automatically as soon as it is ready."
          : error
            ? "Your acknowledged answers are still safe. Retry finalization when your connection is available."
            : "Your timer expired. We are finalizing your acknowledged answers for review."}
      </p>
      {error && (
        <div className="mt-6 bg-red-50 text-red-700 p-4 rounded-xl border border-red-200">
          <p className="font-bold mb-1">Error</p>
          <p className="text-sm">{error}</p>
          <div className="mt-4 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => void finalize()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800"
            >
              <RefreshCw size={16} /> Retry Finalization
            </button>
            <button
              type="button"
              onClick={() => router.replace("/exams")}
              className="rounded-lg px-4 py-2 text-sm font-bold underline hover:text-red-900"
            >
              Go back to exams
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
