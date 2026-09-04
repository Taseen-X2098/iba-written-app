"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock, PlayCircle, ArrowRight } from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/types";
import {
  listStandaloneSessions,
  type StandaloneSessionRecord,
  isStandaloneSessionStorageKey,
  STANDALONE_SESSION_UPDATED_EVENT,
} from "@/lib/exams/standalone-session";

export function InProgressPin() {
  const [inProgress, setInProgress] = useState<StandaloneSessionRecord[]>([]);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const checkLocalStorage = () => {
      setInProgress(listStandaloneSessions(localStorage));
      setNow(Date.now());
    };
    checkLocalStorage();

    // Listen for cross-tab changes
    const handleStorage = (e: StorageEvent) => {
      if (isStandaloneSessionStorageKey(e.key)) {
        checkLocalStorage();
      }
    };
    const interval = setInterval(checkLocalStorage, 1000);

    window.addEventListener("storage", handleStorage);
    window.addEventListener(STANDALONE_SESSION_UPDATED_EVENT, checkLocalStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(STANDALONE_SESSION_UPDATED_EVENT, checkLocalStorage);
      clearInterval(interval);
    };
  }, []);

  if (!inProgress.length) return null;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="mb-6 space-y-4">
      {inProgress.map((session) => {
        const timerRuns = session.state === "running" || session.state === "editing";
        const currentElapsed = timerRuns && session.lastUpdatedAt
          ? (session.secondsElapsed || 0) + Math.floor((now - session.lastUpdatedAt) / 1000)
          : (session.secondsElapsed || 0);
        return (
          <div key={session.questionId} className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-brand-400 to-brand-600 rounded-lg blur opacity-30 group-hover:opacity-50 transition duration-500"></div>
            <Link
              href={`/test/${session.questionId}`}
              prefetch={false}
              className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border-2 border-brand-500/20 rounded-lg p-6 shadow-sm"
            >
              <div>
                <div className="flex items-center gap-3 mb-3 overflow-hidden">
                  <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-brand-100 text-brand-800 text-[10px] font-bold uppercase tracking-wider animate-pulse">
                    <PlayCircle size={12} className="shrink-0" /> IN PROGRESS
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide truncate">
                    {session.category ? (CATEGORY_LABELS[session.category as keyof typeof CATEGORY_LABELS] || session.category) : "TEST"}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-relaxed">
                  {session.prompt || "Resume your test"}
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
      })}
    </div>
  );
}
