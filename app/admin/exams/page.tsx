import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Plus, Clock, FileText, BadgeCheck, Trophy } from "lucide-react";
import type { Exam } from "@/lib/types";
import { ForceGradeButton } from "./ForceGradeButton";
import { ExtendTimerButton } from "./ExtendTimerButton";

export default async function AdminExamsPage() {
  const supabase = await createClient();
  
  const { data: exams, error } = await supabase
    .from("exams")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching exams:", error);
  }

  const safeExams = exams || [];

  return (
    <div className="animate-fade-in max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Manage Exams</h1>
          <p className="text-muted-foreground text-sm">Create, publish, and track weekly exams.</p>
        </div>
        <Link 
          href="/admin/exams/create"
          className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors flex items-center gap-2"
        >
          <Plus size={16} /> New Exam
        </Link>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {safeExams.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <FileText size={32} className="mx-auto mb-3 opacity-50" />
            <p>No exams created yet.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-3 font-medium text-muted-foreground">Title</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Duration</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Dates</th>
                <th className="px-6 py-3 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {safeExams.map((exam: Exam) => (
                <tr key={exam.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      <span>{exam.title}</span>
                      {exam.is_magnus_only && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700">
                          <BadgeCheck size={12} /> Magnus
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col items-start gap-1.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                        exam.is_published ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {exam.is_published ? 'Exam Published' : 'Exam Draft'}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        exam.results_published ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {exam.results_published ? 'Results Published' : 'Results Not Published'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground flex items-center gap-1.5">
                    <Clock size={14} /> {exam.time_limit_minutes} mins
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    <div className="text-xs">
                      Starts: {new Date(exam.starts_at).toLocaleDateString()}
                      <br/>
                      Ends: {new Date(exam.ends_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex flex-col items-end gap-2">
                      <Link href={`/admin/exams/${exam.id}`} className="text-brand-600 font-medium hover:underline text-sm">
                        Edit
                      </Link>
                      <Link href={`/admin/exams/${exam.id}/submissions`} className="text-brand-600 font-medium hover:underline text-sm">
                        Submissions
                      </Link>
                      {exam.results_published && (
                        <Link
                          href={`/admin/exams/${exam.id}/leaderboard`}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1.5 text-sm font-bold text-amber-800 transition-colors hover:bg-amber-200"
                        >
                          <Trophy size={14} /> Leaderboard
                        </Link>
                      )}
                      <div className="flex justify-end gap-2 mt-1">
                        <ExtendTimerButton examId={exam.id} />
                        <ForceGradeButton examId={exam.id} />
                      </div>
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
