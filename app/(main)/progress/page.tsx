import { createClient } from "@/lib/supabase/server";
import { BarChart3, TrendingUp, Target, Award, Flame } from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/types";
import { calculateStreak, generateTrendData } from "@/lib/utils/analytics";
import { ProgressChart } from "@/components/progress/progress-chart";

export default async function ProgressPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  // Fetch all submissions for analytics
  const { data: submissions } = await supabase
    .from("submissions")
    .select(`
      created_at,
      grading_result,
      questions ( category, marks )
    `)
    .eq("user_id", user.id);

  const safeSubmissions = submissions || [];

  // Calculate stats
  const totalTests = safeSubmissions.length;
  
  let totalScore = 0;
  let totalMarks = 0;
  
  // Category stats
  const categoryStats: Record<string, { earned: number; total: number; count: number }> = {};
  
  safeSubmissions.forEach((sub: any) => {
    const result = sub.grading_result;
    const studentFeedback = result?.studentFeedback || result?.student_feedback;
    const scoreStr = studentFeedback?.score || (result?.marks ? `${result.marks}/${sub.questions?.marks || 10}` : undefined);
    const category = sub.questions.category;
    
    if (scoreStr) {
      const [earned, outOf] = scoreStr.split("/").map(Number);
      if (!isNaN(earned) && !isNaN(outOf)) {
        totalScore += earned;
        totalMarks += outOf;
        
        if (!categoryStats[category]) {
          categoryStats[category] = { earned: 0, total: 0, count: 0 };
        }
        categoryStats[category].earned += earned;
        categoryStats[category].total += outOf;
        categoryStats[category].count += 1;
      }
    }
  });

  const overallPercentage = totalMarks > 0 ? Math.round((totalScore / totalMarks) * 100) : 0;
  
  const streak = calculateStreak(safeSubmissions.map((s: any) => new Date(s.created_at)));
  const trendData = generateTrendData(safeSubmissions);

  return (
    <div className="px-4 py-6 lg:px-8 max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center gap-3 mb-8">
        <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center">
          <BarChart3 size={20} className="text-brand-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Your Progress</h2>
          <p className="text-sm text-muted-foreground">
            Track your performance and identify areas for improvement.
          </p>
        </div>
      </div>

      {totalTests === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-2xl bg-card/50">
          <TrendingUp size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-sm">Complete some tests to see your analytics.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                <Target size={16} />
                <span className="text-xs font-semibold uppercase tracking-wider">Overall Accuracy</span>
              </div>
              <div className="text-3xl font-bold text-foreground">
                {overallPercentage}%
              </div>
            </div>
            
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                <Award size={16} />
                <span className="text-xs font-semibold uppercase tracking-wider">Tests Completed</span>
              </div>
              <div className="text-3xl font-bold text-foreground">
                {totalTests}
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                <TrendingUp size={16} />
                <span className="text-xs font-semibold uppercase tracking-wider">Total Score</span>
              </div>
              <div className="text-3xl font-bold text-foreground">
                {totalScore} <span className="text-sm font-medium text-muted-foreground">/ {totalMarks}</span>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2 text-muted-foreground">
                <Flame size={16} className="text-orange-500" />
                <span className="text-xs font-semibold uppercase tracking-wider text-orange-600/80">Day Streak</span>
              </div>
              <div className="text-3xl font-bold text-orange-600">
                {streak}
              </div>
            </div>
          </div>

          {/* Trend Graph */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h3 className="text-lg font-bold text-foreground mb-6">Accuracy Trend</h3>
            <ProgressChart data={trendData} />
          </div>

          {/* Category Performance */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h3 className="text-lg font-bold text-foreground mb-6">Performance by Topic</h3>
            
            <div className="space-y-6">
              {Object.entries(categoryStats).map(([category, stats]) => {
                const percentage = Math.round((stats.earned / stats.total) * 100);
                const label = CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] || category;
                
                return (
                  <div key={category}>
                    <div className="flex justify-between text-sm font-medium mb-2">
                      <span className="text-foreground">{label} <span className="text-muted-foreground text-xs font-normal ml-1">({stats.count} tests)</span></span>
                      <span className="text-foreground">{percentage}%</span>
                    </div>
                    <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${
                          percentage >= 80 ? 'bg-green-500' : percentage >= 60 ? 'bg-brand-500' : percentage >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
