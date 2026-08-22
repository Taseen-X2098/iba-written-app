export const ANALYTICS_TIME_ZONE = "Asia/Dhaka";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function calendarDayNumber(date: Date, timeZone: string): number | null {
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return Math.floor(Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
  ) / DAY_IN_MS);
}

export function calculateStreak(
  dates: Date[],
  now = new Date(),
  timeZone = ANALYTICS_TIME_ZONE,
): number {
  if (!dates?.length) return 0;

  const today = calendarDayNumber(now, timeZone);
  if (today === null) return 0;

  const uniqueDays = Array.from(new Set(
    dates
      .map((date) => calendarDayNumber(date, timeZone))
      .filter((day): day is number => day !== null),
  )).sort((a, b) => b - a);

  if (uniqueDays.length === 0) return 0;

  // Practising today or yesterday keeps the streak alive.
  if (uniqueDays[0] !== today && uniqueDays[0] !== today - 1) return 0;

  let streak = 1;
  for (let index = 1; index < uniqueDays.length; index++) {
    if (uniqueDays[index] !== uniqueDays[index - 1] - 1) break;
    streak++;
  }

  return streak;
}

export interface TrendDataPoint {
  date: string;
  score: number;
  details?: { count: number; topics: string[] };
}

export function generateTrendData(submissions: any[]): TrendDataPoint[] {
  if (!submissions || submissions.length === 0) return [];

  // Group by date string (YYYY-MM-DD)
  const grouped: Record<string, { total: number; count: number; topics: Set<string> }> = {};

  submissions.forEach((sub) => {
    const date = new Date(sub.created_at);
    // Use local date string
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    
    const result = sub.grading_result;
    let percentage = 0;
    
    const studentFeedback = result?.studentFeedback || result?.student_feedback;
    const scoreStr = studentFeedback?.score || (result?.marks !== undefined ? `${result.marks}/${sub.questions?.marks || 10}` : undefined);
    
    if (result?.internal && result.internal.max > 0) {
      percentage = (result.internal.total / result.internal.max) * 100;
    } else if (scoreStr) {
      const [earned, max] = scoreStr.split("/").map(Number);
      if (max > 0 && !isNaN(earned)) {
        percentage = (earned / max) * 100;
      }
    }

    if (!grouped[dateStr]) {
      grouped[dateStr] = { total: 0, count: 0, topics: new Set() };
    }
    grouped[dateStr].total += percentage;
    grouped[dateStr].count += 1;
    if (sub.questions?.category) {
      grouped[dateStr].topics.add(sub.questions.category);
    }
  });

  // Convert to array and sort chronologically
  return Object.entries(grouped)
    .map(([date, data]) => ({
      date,
      score: Math.round(data.total / data.count),
      details: {
        count: data.count,
        topics: Array.from(data.topics)
      }
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
