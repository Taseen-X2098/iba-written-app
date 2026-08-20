export const MARK_NORMALIZATION_VERSION = 2;

export const AI_MARK_CALIBRATION_FACTOR = 0.9;
export const AI_MARK_CALIBRATION_EXEMPT_MAXIMUM = 6;

export function floorMarkToHalf(value: number, maximum = Number.POSITIVE_INFINITY): number {
  if (!Number.isFinite(value)) return 0;
  const bounded = Math.min(Math.max(0, value), maximum);
  return Math.floor((bounded + Number.EPSILON) * 2) / 2;
}

export function calibrateAiFinalMark(modelMark: number, maximum: number): number {
  const factor = maximum <= AI_MARK_CALIBRATION_EXEMPT_MAXIMUM
    ? 1
    : AI_MARK_CALIBRATION_FACTOR;
  return floorMarkToHalf(modelMark * factor, maximum);
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
