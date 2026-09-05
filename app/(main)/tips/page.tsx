import { Lightbulb } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { Tip } from "@/lib/types";

export default async function TipsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tips")
    .select("id, content, is_active, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const tips = (data ?? []) as Tip[];

  return (
    <div className="px-4 py-6 lg:px-8 max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center">
          <Lightbulb size={20} className="text-brand-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Tips</h2>
          <p className="text-sm text-muted-foreground">
            Writing tips to improve your IBA exam performance.
          </p>
        </div>
      </div>

      {tips.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Lightbulb size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-sm">No tips are available yet. Please check back soon.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {tips.map((tip, index) => (
            <article
              key={tip.id}
              className="rounded-xl border border-brand-100 bg-card p-5 shadow-sm"
            >
              <div className="mb-3 flex items-center gap-2 text-brand-700">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50">
                  <Lightbulb size={16} />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wide">
                  Tip {index + 1}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-foreground">{tip.content}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
