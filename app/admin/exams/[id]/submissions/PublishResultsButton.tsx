"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Loader2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";

export default function PublishResultsButton({
  examId,
  allGraded,
  examEnded = true,
  endsAt,
  hasSubmissions = true,
  isPublished = false,
}: {
  examId: string;
  allGraded: boolean;
  examEnded?: boolean;
  endsAt?: string;
  hasSubmissions?: boolean;
  isPublished?: boolean;
}) {
  const [publishing, setPublishing] = useState(false);
  const [elapsedDeadline, setElapsedDeadline] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!endsAt) return;

    const deadline = new Date(endsAt).getTime();
    if (!Number.isFinite(deadline)) return;

    const timer = window.setTimeout(
      () => setElapsedDeadline(endsAt),
      Math.max(0, Math.min(deadline - Date.now(), 2_147_483_647)),
    );
    return () => window.clearTimeout(timer);
  }, [endsAt]);

  const deadlinePassed = examEnded || (Boolean(endsAt) && elapsedDeadline === endsAt);

  const disabledReason = isPublished
    ? "Results have already been published. Extend the deadline to reopen publication."
    : !hasSubmissions
    ? "At least one official submission is required before results can be published."
    : !allGraded
      ? "Publication is blocked until every answer has a final grade."
      : !deadlinePassed
        ? "Results cannot be published before the exam ends."
        : null;

  const handlePublish = async () => {
    if (disabledReason) {
      alert(disabledReason);
      return;
    }
    if (!confirm("Publish final results and notify students?")) {
      return;
    }

    setPublishing(true);
    try {
      const res = await fetch(`/api/admin/exams/publish-results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to publish results");
      router.refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to publish results");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <button
      onClick={handlePublish}
      disabled={publishing || Boolean(disabledReason)}
      title={disabledReason ?? undefined}
      className={`${isPublished ? 'bg-green-100 text-green-700 border-green-300' : 'bg-brand-600 text-white hover:bg-brand-700'} border px-5 py-2.5 rounded-xl font-bold shadow transition-colors flex items-center gap-2 disabled:opacity-50`}
    >
      {publishing
        ? <Loader2 size={16} className="animate-spin" />
        : isPublished
          ? <CheckCircle size={16} />
          : <UploadCloud size={16} />}
      {publishing ? "Publishing..." : isPublished ? "Results Published" : "Publish Results"}
    </button>
  );
}
