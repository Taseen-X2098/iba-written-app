"use client";

import { useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export function ExtendTimerButton({ examId }: { examId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleExtend = async () => {
    const minutesStr = window.prompt("How many extra minutes do you want to add to this exam? (e.g. 15)");
    if (!minutesStr) return;

    const extraMinutes = parseInt(minutesStr, 10);
    if (isNaN(extraMinutes) || extraMinutes <= 0) {
      alert("Please enter a valid positive number.");
      return;
    }

    if (!confirm(`This will extend the exam duration by ${extraMinutes} minutes and shift the deadline. Proceed?`)) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/exams/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId, extraMinutes }),
      });
      const data = await res.json();
      
      if (res.ok) {
        alert(`Success! Added ${extraMinutes} minutes.`);
        router.refresh();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={handleExtend}
      disabled={loading}
      className="text-xs flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition-colors disabled:opacity-50"
    >
      {loading ? <Loader2 size={12} className="animate-spin" /> : <Clock size={12} />} 
      {loading ? "Extending..." : "Extend Timer"}
    </button>
  );
}
