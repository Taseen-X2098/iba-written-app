"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { type TrendDataPoint } from "@/lib/utils/analytics";

interface Props {
  data: TrendDataPoint[];
}

import { CATEGORY_LABELS } from "@/lib/types";

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-md max-w-xs">
        <p className="font-semibold text-foreground mb-1">{data.displayDate}</p>
        <p className="text-brand-600 font-bold mb-2">Avg Score: {data.score}%</p>
        {data.details && (
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Tests Taken: <span className="font-medium text-foreground">{data.details.count}</span></p>
            {data.details.topics && data.details.topics.length > 0 && (
              <p>
                Topics: <span className="font-medium text-foreground">
                  {data.details.topics.map((t: string) => CATEGORY_LABELS[t as keyof typeof CATEGORY_LABELS] || t).join(", ")}
                </span>
              </p>
            )}
          </div>
        )}
      </div>
    );
  }
  return null;
};

export function ProgressChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground text-sm border border-dashed rounded-xl">
        Not enough data to display trend
      </div>
    );
  }

  // Ensure dates look nice (e.g. "Jul 12")
  const formattedData = data.map(d => {
    const date = new Date(d.date);
    return {
      ...d,
      displayDate: date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    };
  });

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={formattedData}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--brand-500))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--brand-500))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis 
            dataKey="displayDate" 
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
            dy={10}
          />
          <YAxis 
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
            domain={[0, 100]}
            tickCount={5}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="score"
            stroke="hsl(var(--brand-500))"
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#colorScore)"
            activeDot={{ r: 6, fill: "hsl(var(--brand-600))", stroke: "white", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
