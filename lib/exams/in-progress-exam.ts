export const IN_PROGRESS_EXAM_KEY = "in_progress_exam";
export const IN_PROGRESS_EXAM_UPDATED_EVENT = "in_progress_exam_updated";
const EXAM_SESSION_PREFIX = "exam-attempt-session:";
const EXAM_RECOVERY_DATA_PREFIX = "attempt-recovery-data:";
const EXAM_RECOVERY_KEY_PREFIX = "attempt-recovery-key:";

export type InProgressExamRecord = {
  userId: string;
  examId: string;
  attemptId: string;
  title: string;
  isPractice: boolean;
  expiresAt: string;
  lastUpdatedAt: number;
};

export function parseOwnedInProgressExam(
  raw: string | null,
  userId: string,
  now = Date.now(),
): InProgressExamRecord | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<InProgressExamRecord>;
    const expiresAt = typeof value.expiresAt === "string" ? Date.parse(value.expiresAt) : Number.NaN;
    const lastUpdatedAt = Number(value.lastUpdatedAt);
    const isActive = Number.isFinite(expiresAt)
      ? now <= expiresAt + 3 * 60_000
      : Number.isFinite(lastUpdatedAt) && now - lastUpdatedAt <= 60 * 60_000;
    if (
      value.userId !== userId
      || typeof value.examId !== "string"
      || !value.examId
      || typeof value.attemptId !== "string"
      || !value.attemptId
      || typeof value.title !== "string"
      || typeof value.isPractice !== "boolean"
      || !isActive
    ) {
      return null;
    }
    return {
      userId,
      examId: value.examId,
      attemptId: value.attemptId,
      title: value.title,
      isPractice: value.isPractice,
      expiresAt: value.expiresAt ?? "",
      lastUpdatedAt,
    };
  } catch {
    return null;
  }
}

function removeMatchingStorageKeys(storage: Pick<Storage, "key" | "length" | "removeItem">, prefixes: string[]) {
  const matches: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && prefixes.some((prefix) => key.startsWith(prefix))) matches.push(key);
  }
  matches.forEach((key) => storage.removeItem(key));
}

export function clearExamBrowserStateOnSignOut(
  local: Pick<Storage, "key" | "length" | "removeItem">,
  session: Pick<Storage, "key" | "length" | "removeItem">,
) {
  local.removeItem(IN_PROGRESS_EXAM_KEY);
  removeMatchingStorageKeys(local, [EXAM_RECOVERY_DATA_PREFIX]);
  removeMatchingStorageKeys(session, [EXAM_SESSION_PREFIX, EXAM_RECOVERY_KEY_PREFIX]);
}
