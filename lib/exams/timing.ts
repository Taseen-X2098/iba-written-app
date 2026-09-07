export const EXAM_NETWORK_GRACE_MS = 3 * 60_000;
export const EXPIRED_OFFICIAL_ATTEMPT_RECOVERY_MS = 72 * 60 * 60_000;

export function isExamWindowOpen(
  startsAt: string,
  endsAt: string,
  now = Date.now(),
) {
  return now >= new Date(startsAt).getTime() && now < new Date(endsAt).getTime();
}

export function isAttemptWithinNetworkGrace(
  expiresAt: string,
  now = Date.now(),
) {
  return now <= new Date(expiresAt).getTime() + EXAM_NETWORK_GRACE_MS;
}
