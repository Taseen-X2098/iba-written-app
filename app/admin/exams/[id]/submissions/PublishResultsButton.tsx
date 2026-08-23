"use client";

import { useState } from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";

export default function PublishResultsButton({
  examId,
  allGraded,
  examEnded = true,
  hasSubmissions = true,
  isRepublish,
}: {
  examId: string;
  allGraded: boolean;
  examEnded?: boolean;
  hasSubmissions?: boolean;
  isRepublish?: boolean;
}) {
  const [publishing, setPublishing] = useState(false);
  const router = useRouter();
  const disabledReason = !hasSubmissions
    ? "At least one official submission is required before results can be published."
    : !allGraded
      ? "Publication is blocked until every answer has a final grade."
      : !examEnded
        ? "Results cannot be published before the exam ends."
        : null;

  const handlePublish = async () => {
    if (disabledReason) {
      alert(disabledReason);
      return;
    }
    if (!confirm(isRepublish ? "Recalculate and republish results? Rankings will be rebuilt from the latest final grades." : "Publish final results and notify students?")) {
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
      className={`${isRepublish ? 'bg-brand-100 text-brand-700 hover:bg-brand-200 border-brand-300' : 'bg-brand-600 text-white hover:bg-brand-700'} border px-5 py-2.5 rounded-xl font-bold shadow transition-colors flex items-center gap-2 disabled:opacity-50`}
    >
      {publishing ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
      {publishing ? (isRepublish ? "Republishing..." : "Publishing...") : (isRepublish ? "Recalculate & Republish" : "Publish Results")}
    </button>
  );
}
