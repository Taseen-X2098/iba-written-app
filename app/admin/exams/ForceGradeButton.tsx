"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { useRouter } from "next/navigation";

export function ForceGradeButton({ examId, targetUserId }: { examId: string; targetUserId?: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const router = useRouter();

  const handleForceGrade = async () => {
    const scope = targetUserId ? "this expired attempt" : "all expired attempts";
    if (!confirm(`Finalize ${scope} from the latest acknowledged drafts? This does not AI-grade answers.`)) return;
    
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/exams/force-grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId, ...(targetUserId ? { targetUserId } : {}) }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.failures?.length) {
          setResult(`Failed: ${data.failures[0].error}`);
        } else {
          setResult(`Success: ${data.processed} finalized.`);
          router.refresh();
        }
      } else {
        setResult(`Error: ${data.error}`);
      }
    } catch (err: any) {
      setResult(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button 
        onClick={handleForceGrade}
        disabled={loading}
        className="text-xs flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-1 rounded hover:bg-amber-200 transition-colors disabled:opacity-50"
      >
        <Play size={12} /> {loading ? "Finalizing..." : targetUserId ? "Finalize" : "Finalize Expired"}
      </button>
      {result && <span className="text-[10px] text-muted-foreground">{result}</span>}
    </div>
  );
}
