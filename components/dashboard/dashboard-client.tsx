"use client";

import Link from "next/link";
import {
  Upload,
  Clock,
  BookOpen,
  ArrowRight,
  Lightbulb,
  FileText,
  Flame,
} from "lucide-react";
import type { Profile, Tip } from "@/lib/types";
import type { TrendDataPoint } from "@/lib/utils/analytics";
import dynamic from "next/dynamic";

const AreaChart = dynamic(() => import("recharts").then((mod) => mod.AreaChart), { ssr: false });
const Area = dynamic(() => import("recharts").then((mod) => mod.Area), { ssr: false });
const ResponsiveContainer = dynamic(() => import("recharts").then((mod) => mod.ResponsiveContainer), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((mod) => mod.YAxis), { ssr: false });

interface DashboardClientProps {
  profile: Profile | null;
  tip: Tip | null;
  stats: {
    evaluations: number;
    dayStreak: number;
  };
  trend: TrendDataPoint[];
}

export default function DashboardClient({ profile, tip, stats, trend }: DashboardClientProps) {
  return (
    <div className="px-4 py-6 lg:px-8 max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-bold text-foreground">
          {getGreeting()}, {profile?.name?.split(" ")[0] ?? "there"}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Ready to sharpen your writing skills today?
        </p>
      </div>

      {/* Hero Card — AI Evaluation */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-50 via-brand-50/50 to-white border border-brand-100 p-6">
        {/* Decorative dots */}
        <div className="absolute top-4 right-4 grid grid-cols-3 gap-1.5 opacity-20">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-brand-500" />
          ))}
        </div>

        <h3 className="text-xl font-bold text-foreground mb-1">
          Detailed Evaluation
        </h3>
        <p className="text-sm text-muted-foreground mb-5 max-w-xs relative z-10">
          Upload your handwritten answer and get feedback instantly.
        </p>

        <Link
          href="/questions"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white
                     hover:bg-brand-700 transition-all active:scale-[0.97] shadow-md shadow-brand-200 relative z-10"
        >
          <Upload size={16} />
          Upload Answer
        </Link>

        {/* Sparkline Graph */}
        <div className="absolute -bottom-2 right-0 w-1/2 h-28 opacity-20 pointer-events-none">
          {trend.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--brand-600))" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="hsl(var(--brand-600))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <YAxis domain={['auto', 'auto']} hide />
                <Area type="monotone" dataKey="score" stroke="hsl(var(--brand-600))" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <FileText size={112} className="text-brand-600 absolute -bottom-2 -right-2 opacity-50" />
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href="/exams"
            className="group rounded-xl border border-border bg-card p-4 hover:border-brand-200 hover:shadow-sm transition-all"
          >
            <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center mb-3">
              <Clock size={20} className="text-brand-600" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              Weekly Exam
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Timed • Ranked
            </p>
            <ArrowRight
              size={14}
              className="text-brand-500 mt-2 group-hover:translate-x-1 transition-transform"
            />
          </Link>

          <Link
            href="/questions"
            className="group rounded-xl border border-border bg-card p-4 hover:border-brand-200 hover:shadow-sm transition-all"
          >
            <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center mb-3">
              <BookOpen size={20} className="text-brand-600" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              Browse Question Bank
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Practice by topic & difficulty
            </p>
            <ArrowRight
              size={14}
              className="text-brand-500 mt-2 group-hover:translate-x-1 transition-transform"
            />
          </Link>
        </div>
      </div>

      {/* Daily Tip */}
      {tip && (
        <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb size={16} className="text-brand-600" />
            <span className="text-xs font-semibold text-brand-700 uppercase tracking-wide">
              Daily Tip
            </span>
          </div>
          <p className="text-sm text-foreground leading-relaxed italic">
            &ldquo;{tip.content}&rdquo;
          </p>
        </div>
      )}

      {/* Your Overview */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Your Overview
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={FileText}
            value={stats.evaluations.toString()}
            label="Evaluations"
            color="text-brand-600"
            bgColor="bg-brand-50"
          />
          <StatCard
            icon={Flame}
            value={stats.dayStreak.toString()}
            label="Day Streak"
            color="text-orange-600"
            bgColor="bg-orange-50"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function StatCard({
  icon: Icon,
  value,
  label,
  color,
  bgColor,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  value: string;
  label: string;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-center">
      <div
        className={`h-9 w-9 rounded-lg ${bgColor} flex items-center justify-center mx-auto mb-2`}
      >
        <Icon size={18} className={color} />
      </div>
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mt-0.5">
        {label}
      </p>
    </div>
  );
}
