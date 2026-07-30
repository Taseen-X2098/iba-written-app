export function calculateStreak(dates: Date[]): number {
  if (!dates || dates.length === 0) return 0;

  // Get unique dates in local timezone
  const uniqueDates = Array.from(new Set(dates.map((d) => {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }))).sort((a, b) => b - a);

  if (uniqueDates.length === 0) return 0;

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const yesterdayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1).getTime();

  // Check if active today or yesterday
  if (uniqueDates[0] !== todayStart && uniqueDates[0] !== yesterdayStart) {
    return 0; // Streak broken
  }

  let streak = 1;
  let currentDateObj = new Date(uniqueDates[0]);

  for (let i = 1; i < uniqueDates.length; i++) {
    const expectedPrevDay = new Date(currentDateObj.getFullYear(), currentDateObj.getMonth(), currentDateObj.getDate() - 1).getTime();
    if (uniqueDates[i] === expectedPrevDay) {
      streak++;
      currentDateObj = new Date(expectedPrevDay);
    } else {
      break;
    }
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
