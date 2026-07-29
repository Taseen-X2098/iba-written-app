import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { CheckCircle, Clock } from "lucide-react";

export default async function AdminGradingPage() {
  const supabase = await createClient();

  // Fetch pending submissions
  const { data: submissions, error } = await supabase
    .from("submissions")
    .select(`
      id,
      created_at,
      time_taken_seconds,
      grading_result,
      profiles ( name, institute ),
      questions ( prompt, marks )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching submissions:", error);
  }

  const safeSubmissions = submissions || [];

  return (
    <div className="animate-fade-in max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Grading Queue</h1>
        <p className="text-muted-foreground text-sm">Review AI grading or manually grade student exams.</p>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {safeSubmissions.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <CheckCircle size={32} className="mx-auto mb-3 opacity-50 text-green-500" />
            <p>All caught up! No submissions pending review.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-3 font-medium text-muted-foreground">Student</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Exam / Question</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Submitted</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Score</th>
                <th className="px-6 py-3 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {safeSubmissions.map((sub: any) => (
                <tr key={sub.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-medium text-foreground">{sub.profiles.name}</p>
                    <p className="text-xs text-muted-foreground">{sub.profiles.institute}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-foreground line-clamp-1">Practice Test</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">{sub.questions?.prompt || "Unknown Question"}</p>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Clock size={14} /> 
                      {sub.created_at ? new Date(sub.created_at).toLocaleDateString() : "In progress"}
                    </div>
                  </td>
                  <td className="px-6 py-4 font-bold text-brand-700">
                    {sub.grading_result ? sub.grading_result.studentFeedback.score : "Pending"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link href={`/admin/grading/${sub.id}`} className="text-brand-600 font-medium hover:underline text-sm">
                      Review
                    </Link>
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
