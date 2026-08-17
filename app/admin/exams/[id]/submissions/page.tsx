import { createClient, createAdminClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ArrowLeft, Users, CheckCircle, Clock } from "lucide-react";
import PublishResultsButton from "./PublishResultsButton";

export default async function AdminExamSubmissionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // 1. Fetch Exam
  const { data: exam } = await supabase.from("exams").select("*").eq("id", id).single();
  if (!exam) return <div>Exam not found</div>;

  // 2. Fetch all submissions for this exam (bypass RLS for admin)
  const adminClient = await createAdminClient();
  const { data: submissions } = await adminClient
    .from("exam_submissions")
    .select(`
      user_id,
      grading_result,
      graded_by,
      submitted_at,
      profiles(name, institute)
    `)
    .eq("exam_id", id);

  // Group by user
  const userSubmissions = (submissions || []).reduce((acc: any, sub: any) => {
    if (!acc[sub.user_id]) {
      acc[sub.user_id] = {
        userId: sub.user_id,
        profile: sub.profiles,
        totalQuestions: 0,
        gradedQuestions: 0,
        isSubmitted: !!sub.submitted_at,
      };
    }
    acc[sub.user_id].totalQuestions += 1;
    if (sub.grading_result) {
      acc[sub.user_id].gradedQuestions += 1;
    }
    return acc;
  }, {});

  const students = Object.values(userSubmissions);
  const totalGraded = students.filter((s: any) => s.gradedQuestions === s.totalQuestions).length;
  const allGraded = students.length > 0 && totalGraded === students.length;

  return (
    <div className="max-w-6xl mx-auto animate-fade-in">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/admin/exams" className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm font-medium">
          <ArrowLeft size={16} /> Back to Exams
        </Link>
      </div>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Submissions: {exam.title}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {students.length} students have attempted this exam.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {exam.results_published && (
            <div className="bg-green-100 text-green-700 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
              <CheckCircle size={16} /> Published
            </div>
          )}
          <PublishResultsButton examId={id} allGraded={allGraded} isRepublish={exam.results_published} />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {students.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Users size={32} className="mx-auto mb-3 opacity-50" />
            <p>No submissions yet.</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-6 py-3 font-medium text-muted-foreground">Student</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Status</th>
                <th className="px-6 py-3 font-medium text-muted-foreground">Progress</th>
                <th className="px-6 py-3 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {students.map((student: any) => (
                <tr key={student.userId} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-bold text-foreground">{student.profile?.name || "Unknown User"}</p>
                    <p className="text-muted-foreground text-xs">{student.profile?.institute}</p>
                  </td>
                  <td className="px-6 py-4">
                    {student.isSubmitted ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-green-100 text-green-700">
                        Submitted
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-700">
                        Ongoing
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {student.gradedQuestions === student.totalQuestions ? (
                        <CheckCircle size={16} className="text-green-500" />
                      ) : (
                        <Clock size={16} className="text-amber-500" />
                      )}
                      <span className="font-medium">
                        {student.gradedQuestions} / {student.totalQuestions} Graded
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link 
                      href={`/admin/exams/${id}/submissions/${student.userId}`}
                      className="bg-brand-50 text-brand-700 hover:bg-brand-100 px-4 py-2 rounded-lg text-sm font-bold transition-colors inline-block"
                    >
                      {student.gradedQuestions === student.totalQuestions ? "Review Grades" : "Grade Submission"}
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
