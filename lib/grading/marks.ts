export const MARK_NORMALIZATION_VERSION = 1;

export function floorMarkToHalf(value: number, maximum = Number.POSITIVE_INFINITY): number {
  if (!Number.isFinite(value)) return 0;
  const bounded = Math.min(Math.max(0, value), maximum);
  return Math.floor((bounded + Number.EPSILON) * 2) / 2;
}

export function calibrateAiFinalMark(modelMark: number, maximum: number): number {
  return floorMarkToHalf(modelMark * 0.85, maximum);
}

export function formatMark(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatScore(earned: number, maximum: number): string {
  return `${formatMark(earned)}/${formatMark(maximum)}`;
}

/** Formats score strings persisted by older grading results for display. */
export function formatStoredScore(score: unknown, fallbackMaximum?: number): string | undefined {
  if (typeof score !== "string" && typeof score !== "number") return undefined;

  const [earnedPart, maximumPart] = String(score).split("/", 2);
  const earned = Number(earnedPart.trim());
  const maximum = Number((maximumPart ?? "").trim() || fallbackMaximum);

  if (!Number.isFinite(earned) || !Number.isFinite(maximum)) {
    return String(score);
  }

  return formatScore(earned, maximum);
}
