import { createClient } from "@/lib/supabase/server";
import { calculateStreak, generateTrendData, type TrendDataPoint } from "@/lib/utils/analytics";
import DashboardClient from "@/components/dashboard/dashboard-client";
import { headers } from "next/headers";
import type { Profile, Tip } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  // Fetch Profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Stats — count submissions
  const { count: evalCount } = await supabase
    .from("submissions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  // Average score and trend from recent submissions
  const { data: submissions } = await supabase
    .from("submissions")
    .select("created_at, grading_result")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  // Fetch dates for streak
  const { data: dateRows } = await supabase
    .from("submissions")
    .select("created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(365);

  const stats = {
    evaluations: evalCount ?? 0,
    dayStreak: dateRows ? calculateStreak(dateRows.map(r => new Date(r.created_at))) : 0,
  };

  let trend: TrendDataPoint[] = [];
  if (submissions) {
    trend = generateTrendData(submissions);
  }

  // Random tip via relative API call (or we can just fetch it directly from DB, but keeping the original logic using fetch)
  // To use fetch in a server component with relative URL, we need the origin
  let tip: Tip | null = null;
  if (profile?.tips_enabled) {
    try {
      // In server components, fetch requires absolute URLs. 
      // It's cleaner to query the database directly since we are on the server.
      const { data: tipData } = await supabase
        .from("tips")
        .select("*")
        .eq("is_active", true);

      if (tipData && tipData.length > 0) {
        tip = tipData[Math.floor(Math.random() * tipData.length)];
      }
    } catch (err) {
      console.error("Failed to load tip", err);
    }
  }

  return (
    <DashboardClient 
      profile={profile}
      tip={tip}
      stats={stats}
      trend={trend}
    />
  );
}
