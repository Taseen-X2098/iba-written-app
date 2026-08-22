import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { FileText, Clock, Calendar, ArrowLeft } from "lucide-react";
import { HighlightedText } from "@/components/ui/highlighted-text";
import { CATEGORY_LABELS } from "@/lib/types";
import { formatStoredScore } from "@/lib/grading/marks";
import { SubmissionFeedback } from "@/components/feedback/submission-feedback";
import { PersonalProgressionCard } from "@/components/progress/personal-progression-card";
import { getPersonalProgressionCard } from "@/lib/learning/progression";
import Link from "next/link";

export default async function HistoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const { data: sub, error } = await supabase
    .from("submissions")
    .select(`
      id,
      created_at,
      time_taken_seconds,
      grading_result,
      edited_text,
      ocr_text,
      questions (
        id,
        prompt,
        category,
        marks
      )
    `)
    .eq("id", resolvedParams.id)
    .eq("user_id", user.id)
    .single();

  if (error || !sub) {
    console.error("Submission not found or error:", error);
    notFound();
  }

  const result = sub.grading_result;
  const question = Array.isArray(sub.questions) ? sub.questions[0] : sub.questions;
  const studentFeedback = result?.studentFeedback || result?.student_feedback;
  const scoreStr = studentFeedback?.score || (result?.marks ? `${result.marks}/${question.marks || 10}` : undefined);
  const scoreParts = formatStoredScore(scoreStr, question.marks || 10)?.split("/") || ["?", "?"];
  const personalProgressionReport = await getPersonalProgressionCard({
    userId: user.id,
    submissionType: question.category,
  });

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="px-4 py-6 lg:px-8 max-w-3xl mx-auto animate-fade-in">
      <Link 
        href="/history"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft size={16} /> Back to History
      </Link>

      <div className="bg-card border border-border rounded-2xl shadow-sm p-4 sm:p-6 sm:p-8 space-y-6 sm:space-y-8">
        {/* Header section with question info */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-[10px] font-bold uppercase tracking-wider">
              {CATEGORY_LABELS[question.category as keyof typeof CATEGORY_LABELS] || question.category}
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar size={12} />
              {new Date(sub.created_at).toLocaleDateString("en-US", {
                month: "short", day: "numeric", year: "numeric"
              })}
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock size={12} />
              {formatTime(sub.time_taken_seconds)}
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-foreground leading-relaxed">
            {question.prompt}
          </h2>
        </div>

        {/* Score Banner */}
        <div className="flex flex-col md:flex-row gap-4 sm:gap-6 bg-brand-50 border border-brand-100 rounded-2xl p-5 sm:p-6">
          <div className="shrink-0 flex flex-col items-center md:items-start justify-center border-b md:border-b-0 md:border-r border-brand-200 pb-4 md:pb-0 md:pr-6">
            <span className="text-[10px] sm:text-xs font-bold text-brand-500 mb-1 uppercase tracking-wider">
              FINAL SCORE
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl sm:text-4xl font-extrabold text-brand-700 leading-none">
                {scoreParts[0]}
              </span>
              <span className="text-sm sm:text-base font-bold text-brand-500">
                /{scoreParts[1]}
              </span>
            </div>
          </div>
          <div className="flex-1 text-center md:text-left">
            <h3 className="text-base sm:text-lg font-bold text-brand-900 mb-1.5 sm:mb-2">Your evaluated submission</h3>
            <p className="text-sm text-brand-800 leading-relaxed">
              Review the three feedback sections, then use the personal progression report to focus your next practice session.
            </p>
          </div>
        </div>

        {studentFeedback ? <SubmissionFeedback feedback={studentFeedback} /> : null}

        <PersonalProgressionCard report={personalProgressionReport} />

        {/* Highlights Interactive Text */}
        {studentFeedback?.highlights ? (
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <FileText size={16} /> Your Annotated Submission
            </h4>
            <div className="bg-muted/30 border border-border rounded-xl p-4 sm:p-5 text-sm leading-loose overflow-x-hidden">
              <HighlightedText 
                text={sub.edited_text || sub.ocr_text || "No submission text available."} 
                highlights={studentFeedback.highlights} 
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-[var(--color-highlight-strength)] border border-[var(--color-highlight-strength-border)]" />
                <span className="text-muted-foreground">Strengths</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-[var(--color-highlight-improvement)] border border-[var(--color-highlight-improvement-border)]" />
                <span className="text-muted-foreground">Areas for Improvement</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-muted/30 border border-border rounded-xl p-5 text-sm text-muted-foreground text-center">
            No detailed highlights available for this submission.
          </div>
        )}
      </div>
    </div>
  );
}
