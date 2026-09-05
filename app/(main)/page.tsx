import { createClient } from "@/lib/supabase/server";
import { calculateStreak, generateTrendData, type TrendDataPoint } from "@/lib/utils/analytics";
import DashboardClient from "@/components/dashboard/dashboard-client";
import type { Profile, Tip } from "@/lib/types";
import { getMainUserContext } from "@/lib/main-user-context";

export default async function DashboardPage() {
  const supabase = await createClient();
  const context = await getMainUserContext();
  if (!context) return null;
  const { data, error } = await supabase.rpc("get_dashboard_data");
  if (error) throw error;
  const submissions = (data?.submissions ?? []) as Array<{ created_at: string; grading_result: any }>;

  const stats = {
    evaluations: Number(data?.evaluations ?? 0),
    dayStreak: calculateStreak(submissions.map((row) => new Date(row.created_at))),
  };

  let trend: TrendDataPoint[] = [];
  trend = generateTrendData(submissions.slice(0, 100));

  // Tips are available to every authenticated user, including the free tier.
  const tip: Tip | null = (data?.tip as Tip | null) ?? null;

  return (
    <DashboardClient 
      profile={context.profile as Profile}
      tip={tip}
      stats={stats}
      trend={trend}
    />
  );
}
