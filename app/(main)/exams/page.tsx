import { Trophy } from "lucide-react";

export default function ExamsPage() {
  return (
    <div className="px-4 py-6 lg:px-8 max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center">
          <Trophy size={20} className="text-brand-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Weekly Exams</h2>
          <p className="text-sm text-muted-foreground">
            Compete with others in timed weekly exams.
          </p>
        </div>
      </div>

      <div className="text-center py-16 text-muted-foreground">
        <Trophy size={48} className="mx-auto mb-4 opacity-30" />
        <p className="text-sm">Weekly exams will be implemented in Phase 4.</p>
        <p className="text-xs mt-1">Check back soon!</p>
      </div>
    </div>
  );
}
