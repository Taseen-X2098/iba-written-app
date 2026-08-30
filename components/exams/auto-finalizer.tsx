"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { IN_PROGRESS_EXAM_KEY, IN_PROGRESS_EXAM_UPDATED_EVENT } from "@/lib/exams/in-progress-exam";

export default function AutoFinalizer({ examId, isPractice }: { examId: string, isPractice?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const finalize = async () => {
      try {
        if (isPractice) {
          localStorage.removeItem(IN_PROGRESS_EXAM_KEY);
          window.dispatchEvent(new Event(IN_PROGRESS_EXAM_UPDATED_EVENT));
          router.push(`/exams`);
          router.refresh();
          return;
        }

        const res = await fetch("/api/exam/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ examId }),
        });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error || "Failed to finalize");
        
        // Clear from localStorage since we submitted
        localStorage.removeItem(IN_PROGRESS_EXAM_KEY);
        window.dispatchEvent(new Event(IN_PROGRESS_EXAM_UPDATED_EVENT));

        // Redirect to results page after finalizing
        router.push(`/exams/${examId}/results`);
        router.refresh();
      } catch (err: any) {
        setError(err.message);
      }
    };

    finalize();
  }, [examId, isPractice, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] animate-pulse">
      <Loader2 size={48} className="animate-spin text-brand-600 mb-6" />
      <h2 className="text-xl font-bold text-foreground mb-2">Time's Up!</h2>
      <p className="text-muted-foreground text-center max-w-md">
        Your timer expired. We are automatically finalizing your saved drafts and grading your exam...
      </p>
      {error && (
        <div className="mt-6 bg-red-50 text-red-700 p-4 rounded-xl border border-red-200">
          <p className="font-bold mb-1">Error</p>
          <p className="text-sm">{error}</p>
          <button 
            onClick={() => router.push("/exams")} 
            className="mt-3 text-sm underline hover:text-red-900"
          >
            Go back to exams
          </button>
        </div>
      )}
    </div>
  );
}
