import { createClient } from "@/lib/supabase/server";
import { Users, FileText, CheckCircle } from "lucide-react";
import Link from "next/link";

export default async function AdminDashboard() {
  const supabase = await createClient();
  
  // Basic stats
  const [
    { count: usersCount }, 
    { count: examsCount }, 
    { count: submissionsCount },
    { count: activeSubsCount },
    { data: revenueData }
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("is_admin", false),
    supabase.from("exams").select("*", { count: "exact", head: true }),
    supabase.from("exam_submissions").select("*", { count: "exact", head: true }),
    supabase.from("subscriptions").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("bkash_transactions").select("amount").eq("status", "Completed"),
  ]);

  const totalRevenue = revenueData?.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0) || 0;

  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl font-bold text-foreground mb-2">Admin Overview</h1>
      <p className="text-muted-foreground mb-8">Welcome to the IBA Written Admin Portal.</p>
      
      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <StatCard 
          title="Total Students" 
          value={usersCount || 0} 
          icon={<Users className="text-blue-500" />} 
          bg="bg-blue-50" 
        />
        <StatCard 
          title="Total Exams" 
          value={examsCount || 0} 
          icon={<FileText className="text-purple-500" />} 
          bg="bg-purple-50" 
        />
        <StatCard 
          title="Submissions" 
          value={submissionsCount || 0} 
          icon={<CheckCircle className="text-green-500" />} 
          bg="bg-green-50" 
        />
        <StatCard 
          title="Active Subs" 
          value={activeSubsCount || 0} 
          icon={<Users className="text-orange-500" />} 
          bg="bg-orange-50" 
        />
        <StatCard 
          title="Total Revenue" 
          value={`৳${totalRevenue.toLocaleString()}`} 
          icon={<FileText className="text-brand-500" />} 
          bg="bg-brand-50" 
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-bold mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link href="/admin/exams/create" className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors border border-border">
              <span className="font-medium text-sm">Create New Exam</span>
              <FileText size={16} className="text-muted-foreground" />
            </Link>
            <Link href="/admin/grading" className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors border border-border">
              <span className="font-medium text-sm">Review Pending Submissions</span>
              <CheckCircle size={16} className="text-muted-foreground" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, bg }: { title: string, value: number | string, icon: React.ReactNode, bg: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 flex items-center gap-4">
      <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${bg}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold text-foreground">{value}</p>
      </div>
    </div>
  );
}
