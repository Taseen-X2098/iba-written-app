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

  // Random tip via relative API call (or we can just fetch it directly from DB, but keeping the original logic using fetch)
  // To use fetch in a server component with relative URL, we need the origin
  const tip: Tip | null = context.profile.tips_enabled ? (data?.tip as Tip | null) : null;

  return (
    <DashboardClient 
      profile={context.profile as Profile}
      tip={tip}
      stats={stats}
      trend={trend}
    />
  );
}
