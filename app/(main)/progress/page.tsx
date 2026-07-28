import { BarChart3 } from "lucide-react";

export default function ProgressPage() {
  return (
    <div className="px-4 py-6 lg:px-8 max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center">
          <BarChart3 size={20} className="text-brand-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Your Progress</h2>
          <p className="text-sm text-muted-foreground">
            Track your performance and improvement over time.
          </p>
        </div>
      </div>

      <div className="text-center py-16 text-muted-foreground">
        <BarChart3 size={48} className="mx-auto mb-4 opacity-30" />
        <p className="text-sm">Progress charts will be implemented in Phase 2.</p>
        <p className="text-xs mt-1">Start practicing to see your progress!</p>
      </div>
    </div>
  );
}
