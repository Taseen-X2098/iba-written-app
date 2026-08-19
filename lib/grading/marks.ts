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
