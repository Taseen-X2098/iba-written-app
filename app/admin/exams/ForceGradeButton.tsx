"use client";

import { useState } from "react";
import { Play } from "lucide-react";

export function ForceGradeButton({ examId }: { examId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleForceGrade = async () => {
    if (!confirm("This will scan and force-grade all expired drafts for this exam. Proceed?")) return;
    
    setLoading(true);
    setResult(null);
    try {
      // In a real implementation, this would hit an API that scans Redis for all active sessions
      // for this exam, checks if they are expired, and calls /api/exam/finalize for each.
      const res = await fetch(`/api/admin/exams/force-grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(`Success: ${data.processed} finalized.`);
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
        <Play size={12} /> {loading ? "Grading..." : "Force Grade Expired"}
      </button>
      {result && <span className="text-[10px] text-muted-foreground">{result}</span>}
    </div>
  );
}
