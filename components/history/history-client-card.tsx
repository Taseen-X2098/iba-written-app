"use client";

import Link from "next/link";
import { Calendar, Clock } from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/types";
import { formatStoredScore } from "@/lib/grading/marks";

export function HistoryClientCard({ sub }: { sub: any }) {

  const result = sub.grading_result;
  const question = sub.questions;
  const studentFeedback = result?.studentFeedback || result?.student_feedback;
  const scoreStr = studentFeedback?.score || (result?.marks ? `${result.marks}/${question.marks || 10}` : undefined);
  const scoreParts = formatStoredScore(scoreStr, question.marks || 10)?.split("/") || ["?", "?"];
  const summaryText = studentFeedback?.summary || (result?.marks ? "This is a mock summary from test-db." : "No summary available.");

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <>
      <div 
        className="bg-card border border-border rounded-xl p-5 hover:border-brand-300 transition-colors"
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-[10px] font-bold uppercase tracking-wider">
                {CATEGORY_LABELS[question.category as keyof typeof CATEGORY_LABELS] || question.category}
              </span>
              {sub.is_exam_submission ? (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">
                  Practice Exam
                </span>
              ) : null}
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar size={12} />
                {new Date(sub.created_at).toLocaleDateString("en-US", {
                  month: "short", day: "numeric", year: "numeric"
                })}
              </span>
            </div>
            <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-relaxed">
              {question.prompt}
            </h3>
          </div>

          {/* Score Badge */}
          <div className="shrink-0 flex items-center justify-between sm:justify-start gap-4 sm:gap-3 bg-muted/50 rounded-lg p-3 sm:p-2 border border-border/50 w-full sm:w-auto">
            <div className="flex items-center gap-2 sm:gap-1.5 text-sm sm:text-xs font-medium text-muted-foreground">
              <Clock size={16} className="sm:w-3.5 sm:h-3.5" />
              {formatTime(sub.time_taken_seconds)}
            </div>
            <div className="h-5 sm:h-4 w-px bg-border hidden sm:block"></div>
            <div className="flex items-baseline justify-end">
              <span className="text-xl sm:text-lg font-bold text-brand-700 leading-none">
                {scoreParts[0]}
              </span>
              <span className="text-xs sm:text-[10px] font-bold text-muted-foreground ml-0.5">
                /{scoreParts[1] || question.marks}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-brand-50/50 rounded-lg p-3 text-sm text-foreground/80 truncate mb-4 inline-block max-w-full">
          {summaryText}
        </div>

        <div className="flex justify-end">
          <Link
            href={`/history/${sub.id}`}
            className="text-sm font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1 transition-colors"
          >
            View Full Feedback
          </Link>
        </div>
      </div>
    </>
  );
}
