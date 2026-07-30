"use client";

import { useState } from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";

export default function PublishResultsButton({ examId, allGraded, isRepublish }: { examId: string, allGraded: boolean, isRepublish?: boolean }) {
  const [publishing, setPublishing] = useState(false);
  const router = useRouter();

  const handlePublish = async () => {
    if (!allGraded) {
      if (!confirm("Not all submissions are fully graded. Are you sure you want to publish results now? Ungraded answers will count as 0.")) {
        return;
      }
    } else {
      if (!confirm(isRepublish ? "Republish results and update the leaderboard? This will overwrite previous rankings." : "Publish results for this exam? This will build the leaderboard and notify students.")) {
        return;
      }
    }

    setPublishing(true);
    try {
      const res = await fetch(`/api/admin/exams/publish-results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId }),
      });
      if (!res.ok) throw new Error("Failed to publish results");
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <button
      onClick={handlePublish}
      disabled={publishing}
      className={`${isRepublish ? 'bg-brand-100 text-brand-700 hover:bg-brand-200 border-brand-300' : 'bg-brand-600 text-white hover:bg-brand-700'} border px-5 py-2.5 rounded-xl font-bold shadow transition-colors flex items-center gap-2 disabled:opacity-50`}
    >
      {publishing ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
      {publishing ? (isRepublish ? "Republishing..." : "Publishing...") : (isRepublish ? "Recalculate & Republish" : "Publish Results")}
    </button>
  );
}
