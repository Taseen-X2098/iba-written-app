"use client";

import Link from "next/link";
import { Play } from "lucide-react";
import { NavigationLoadingOverlay } from "@/components/ui/navigation-loading-overlay";
import type { ActiveSessionLink } from "@/lib/exams/active-sessions";

export function ActiveSessionSidenavLinks({
  sessions,
  onNavigate,
}: {
  sessions: ActiveSessionLink[];
  onNavigate?: () => void;
}) {
  if (!sessions.length) return null;
  return (
    <section className="space-y-2 pt-3" aria-label="Active sessions">
      <div className="flex items-center justify-between px-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Active sessions
        </p>
        <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700">
          {sessions.length}
        </span>
      </div>
      {sessions.map((session) => (
        <Link
          key={session.key}
          onClick={onNavigate}
          href={session.type === "exam"
            ? `/exams/${session.id}${session.isPractice ? "?practice=true" : ""}`
            : `/test/${session.id}`}
          prefetch={false}
          className="group relative flex items-center gap-3 overflow-hidden rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-bold text-white shadow-md shadow-brand-200 transition-colors hover:bg-brand-700"
        >
          <span className="absolute inset-0 w-1/4 -translate-x-full skew-x-[45deg] bg-white/20 group-hover:animate-shine"></span>
          <Play size={18} className="shrink-0" />
          <div className="min-w-0">
            <span className="mb-0.5 block text-[10px] uppercase leading-none tracking-wider opacity-80">
              Active {session.type === "exam" ? session.isPractice ? "Practice Exam" : "Exam" : "Test"}
            </span>
            <span className="block truncate">{session.title}</span>
          </div>
          <NavigationLoadingOverlay />
        </Link>
      ))}
    </section>
  );
}
