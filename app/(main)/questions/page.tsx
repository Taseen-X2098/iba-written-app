import { BookOpen, Search } from "lucide-react";

export default function QuestionsPage() {
  return (
    <div className="px-4 py-6 lg:px-8 max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center">
          <BookOpen size={20} className="text-brand-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Question Bank</h2>
          <p className="text-sm text-muted-foreground">
            Practice questions by different topics and difficulty levels.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          placeholder="Search questions..."
          className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2.5 text-sm
                     placeholder:text-muted-foreground
                     focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
        />
      </div>

      {/* Placeholder */}
      <div className="text-center py-16 text-muted-foreground">
        <BookOpen size={48} className="mx-auto mb-4 opacity-30" />
        <p className="text-sm">Question bank will be implemented in Phase 2.</p>
        <p className="text-xs mt-1">
          Connect your Supabase project and seed questions to get started.
        </p>
      </div>
    </div>
  );
}
