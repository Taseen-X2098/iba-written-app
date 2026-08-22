import { CheckCircle2, MessageSquareText, Route, Sparkles } from "lucide-react";
import type { GradingResultJSON } from "@/lib/types";

type StudentFeedback = GradingResultJSON["studentFeedback"];

export function SubmissionFeedback({ feedback }: { feedback: StudentFeedback }) {
  const remarks = feedback.remarks?.trim() || feedback.summary?.trim() || "No remarks are available.";
  const personalizedFeedback = feedback.personalizedFeedback?.trim()
    || "Personalized feedback was not stored for this earlier submission. New submissions will include same-type personal insights and progress comparisons.";
  const waysToImprove = feedback.waysToImprove?.trim()
    || "Use the remarks above to revise the highest-impact weakness first, then proofread the revised answer once more for grammar and clarity.";
  const hasGrammarAudit = Array.isArray(feedback.grammarErrors);
  const grammarErrors = feedback.grammarErrors ?? [];

  return (
    <section className="space-y-4" aria-label="Detailed submission feedback">
      <article className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <MessageSquareText size={17} aria-hidden="true" />
          </span>
          <h3 className="font-bold text-foreground">1. Remarks on this submission</h3>
        </div>
        <p className="text-sm leading-7 text-muted-foreground">{remarks}</p>

        <div className="mt-5 border-t border-border pt-4">
          <h4 className="text-sm font-bold text-foreground">Complete grammar corrections</h4>
          {!hasGrammarAudit ? (
            <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              A complete grammar audit was not stored for this earlier submission. New submissions include every detected occurrence with one or two corrections.
            </div>
          ) : grammarErrors.length === 0 ? (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <CheckCircle2 size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p>No grammar, spelling, or correctness-affecting punctuation errors were detected.</p>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {grammarErrors.map((error, index) => (
                <div key={`${error.quote}-${index}`} className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                      Error {index + 1}: {error.errorType}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-amber-950">“{error.quote}”</p>
                  <p className="mt-1 text-sm leading-6 text-amber-900">{error.explanation}</p>
                  <div className="mt-3 space-y-1.5">
                    {error.corrections.slice(0, 2).map((correction, correctionIndex) => (
                      <p key={correctionIndex} className="rounded-lg bg-white/80 px-3 py-2 text-sm text-foreground">
                        <span className="mr-1.5 font-bold text-emerald-700">
                          {error.corrections.length > 1 ? `Fix ${correctionIndex + 1}:` : "Fix:"}
                        </span>
                        {correction}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </article>

      <article className="rounded-2xl border border-violet-200 bg-violet-50/40 p-5 sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
            <Sparkles size={17} aria-hidden="true" />
          </span>
          <h3 className="font-bold text-foreground">2. Personalized feedback</h3>
        </div>
        <p className="text-sm leading-7 text-muted-foreground">{personalizedFeedback}</p>
      </article>

      <article className="rounded-2xl border border-sky-200 bg-sky-50/40 p-5 sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
            <Route size={17} aria-hidden="true" />
          </span>
          <h3 className="font-bold text-foreground">3. Ways to improve next time</h3>
        </div>
        <p className="text-sm leading-7 text-muted-foreground">{waysToImprove}</p>
      </article>
    </section>
  );
}
