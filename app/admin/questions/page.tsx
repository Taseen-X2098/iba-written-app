import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Plus, Database, Pencil } from "lucide-react";
import QuestionRowActions from "@/components/admin/question-row-actions";

export default async function AdminQuestionsPage() {
  const supabase = await createClient();

  const { data: questions, error } = await supabase
    .from("questions")
    .select("*")
    .eq("is_active", true)
    .neq("category", "translation")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching questions:", error);
  }

  const safeQuestions = questions || [];

  return (
    <div className="animate-fade-in max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Question Bank</h1>
          <p className="text-muted-foreground text-sm">Manage all questions for practice and exams.</p>
        </div>
        <Link 
          href="/admin/questions/create"
          className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors flex items-center gap-2"
        >
          <Plus size={16} /> New Question
        </Link>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {safeQuestions.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Database size={32} className="mx-auto mb-3 opacity-50 text-brand-500" />
            <p>No questions found in the database.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-3 font-medium text-muted-foreground">Prompt</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Category</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Difficulty</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Marks</th>
                <th className="px-6 py-3 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {safeQuestions.map((q: any) => (
                <tr key={q.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 font-medium text-foreground max-w-md truncate" title={q.prompt}>
                    {q.prompt}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-muted-foreground capitalize">
                      {q.category.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                      q.difficulty === 'easy' ? 'bg-green-100 text-green-700' :
                      q.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                      q.difficulty === 'hard' ? 'bg-red-100 text-red-700' :
                      'bg-purple-100 text-purple-700'
                    }`}>
                      {q.difficulty}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground font-bold">
                    {q.marks}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/admin/questions/${q.id}`} className="text-muted-foreground hover:text-brand-600 p-1 transition-colors">
                        <Pencil size={16} />
                      </Link>
                      <QuestionRowActions questionId={q.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
