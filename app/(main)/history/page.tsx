import { createClient } from "@/lib/supabase/server";
import { BookOpen, Calendar, Clock, Trophy } from "lucide-react";
import Link from "next/link";
import { CATEGORY_LABELS } from "@/lib/types";

export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  // Fetch submissions with related question data
  const { data: submissions, error } = await supabase
    .from("submissions")
    .select(`
      id,
      created_at,
      time_taken_seconds,
      grading_result,
      questions (
        id,
        prompt,
        category,
        marks
      )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching history:", error);
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const safeSubmissions = submissions || [];

  return (
    <div className="px-4 py-6 lg:px-8 max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-8">
        <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center">
          <BookOpen size={20} className="text-brand-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Test History</h2>
          <p className="text-sm text-muted-foreground">
            Review your past submissions and AI feedback.
          </p>
        </div>
      </div>

      {safeSubmissions.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-2xl bg-card/50">
          <BookOpen size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-sm">You haven&apos;t taken any tests yet.</p>
          <Link 
            href="/questions" 
            className="inline-block mt-4 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            Go to Question Bank →
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {safeSubmissions.map((sub: any) => {
            const result = sub.grading_result;
            const scoreParts = result?.studentFeedback?.score?.split("/") || ["?", "?"];
            const question = sub.questions;

            return (
              <div 
                key={sub.id}
                className="bg-card border border-border rounded-xl p-5 hover:border-brand-300 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-[10px] font-bold uppercase tracking-wider">
                        {CATEGORY_LABELS[question.category as keyof typeof CATEGORY_LABELS] || question.category}
                      </span>
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
                  <div className="shrink-0 flex items-center gap-3 bg-muted/50 rounded-lg p-2 border border-border/50">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Clock size={14} />
                      {formatTime(sub.time_taken_seconds)}
                    </div>
                    <div className="h-4 w-px bg-border"></div>
                    <div className="flex flex-col items-center justify-center px-2">
                      <span className="text-lg font-bold text-brand-700 leading-none">
                        {scoreParts[0]}
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground">
                        / {scoreParts[1] || question.marks}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-brand-50/50 rounded-lg p-3 text-sm text-foreground/80 leading-relaxed line-clamp-2 mb-4">
                  {result?.studentFeedback?.summary || "No summary available."}
                </div>

                <div className="flex justify-end">
                  <button
                    className="text-sm font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1 transition-colors"
                  >
                    View Full Feedback
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
