"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, PlayCircle, ArrowRight } from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/types";

export function InProgressPin() {
  const [inProgress, setInProgress] = useState<any>(null);

  const checkLocalStorage = () => {
    try {
      const saved = localStorage.getItem("in_progress_test");
      console.log("InProgressPin mounted. Found in localStorage:", saved);
      
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!parsed || !parsed.lastUpdatedAt || Date.now() - parsed.lastUpdatedAt > 3600000) {
          console.log("Timer expired or invalid. Removing.");
          localStorage.removeItem("in_progress_test");
          setInProgress(null);
        } else {
          setInProgress(parsed);
        }
      } else {
        setInProgress(null);
      }
    } catch (e) {
      console.error("Error reading from localStorage:", e);
      setInProgress(null);
    }
  };

  useEffect(() => {
    checkLocalStorage();

    // Listen for cross-tab changes
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "in_progress_test") {
        checkLocalStorage();
      }
    };
    
    // Also set up a custom interval to update the elapsed time live if running
    const interval = setInterval(() => {
      if (inProgress?.state === "running") {
        setInProgress({ ...inProgress }); // trigger re-render for timer
      }
    }, 1000);

    window.addEventListener("storage", handleStorage);
    window.addEventListener("in_progress_test_updated", checkLocalStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("in_progress_test_updated", checkLocalStorage);
      clearInterval(interval);
    };
  }, [inProgress?.state]);

  if (!inProgress) return null;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Calculate current elapsed time if it was running
  const currentElapsed = (inProgress.state === "running" && inProgress.lastUpdatedAt)
    ? (inProgress.secondsElapsed || 0) + Math.floor((Date.now() - inProgress.lastUpdatedAt) / 1000)
    : (inProgress.secondsElapsed || 0);

  return (
    <div className="mb-6 relative group">
      <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-400 to-brand-600 rounded-lg blur opacity-30 group-hover:opacity-50 transition duration-500"></div>
      <Link 
        href={`/test/${inProgress.questionId}`}
        prefetch={false}
        className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border-2 border-brand-500/20 rounded-lg p-6 shadow-sm"
      >
        <div>
          <div className="flex items-center gap-3 mb-3 overflow-hidden">
            <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-brand-100 text-brand-800 text-[10px] font-bold uppercase tracking-wider animate-pulse">
              <PlayCircle size={12} className="shrink-0" /> IN PROGRESS
            </span>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">
              {inProgress.category ? (CATEGORY_LABELS[inProgress.category as keyof typeof CATEGORY_LABELS] || inProgress.category) : "TEST"}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-relaxed">
            {inProgress.prompt || "Resume your test"}
          </h3>
        </div>

        <div className="shrink-0 flex flex-row sm:flex-col items-center sm:items-end gap-3 sm:gap-2 mt-2 sm:mt-0">
          <div className="shrink-0 whitespace-nowrap flex items-center gap-1.5 text-sm font-bold text-brand-700 bg-brand-50 px-3 py-1.5 rounded-lg border border-brand-200">
            <Clock size={16} className="shrink-0" />
            {formatTime(currentElapsed)}
          </div>
          <div className="shrink-0 whitespace-nowrap text-xs font-semibold text-brand-600 flex items-center group-hover:translate-x-1 transition-transform">
            Resume <ArrowRight size={14} className="ml-1 shrink-0" />
          </div>
        </div>
      </Link>
    </div>
  );
}
