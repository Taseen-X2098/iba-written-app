export const IN_PROGRESS_EXAM_KEY = "in_progress_exam";
export const IN_PROGRESS_EXAM_KEY_PREFIX = `${IN_PROGRESS_EXAM_KEY}:`;
export const IN_PROGRESS_EXAM_UPDATED_EVENT = "in_progress_exam_updated";
const EXAM_SESSION_PREFIX = "exam-attempt-session:";
const EXAM_RECOVERY_DATA_PREFIX = "attempt-recovery-data:";
const EXAM_RECOVERY_KEY_PREFIX = "attempt-recovery-key:";

export type InProgressExamPhase = "taking" | "awaiting_grading" | "grading";

export type InProgressExamRecord = {
  userId: string;
  examId: string;
  attemptId: string;
  title: string;
  isPractice: boolean;
  phase: InProgressExamPhase;
  gradingJobId?: string;
  expiresAt: string;
  lastUpdatedAt: number;
};

type EnumerableExamStorage = Pick<Storage, "getItem" | "setItem" | "key" | "length" | "removeItem">;

export function inProgressExamStorageKey(attemptId: string) {
  return `${IN_PROGRESS_EXAM_KEY_PREFIX}${encodeURIComponent(attemptId)}`;
}

export function isInProgressExamStorageKey(key: string | null) {
  return key === null
    || key === IN_PROGRESS_EXAM_KEY
    || key.startsWith(IN_PROGRESS_EXAM_KEY_PREFIX);
}

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
    const phase = value.phase === "awaiting_grading" || value.phase === "grading"
      ? value.phase
      : "taking";
    // Once a practice timer has ended, the attempt remains an active workflow
    // until grading reaches a terminal state. The exam page removes the record
    // when grading completes or is cancelled.
    const isPostTimerPractice = value.isPractice === true && phase !== "taking";
    const isActive = isPostTimerPractice || (Number.isFinite(expiresAt)
      ? now <= expiresAt + 3 * 60_000
      : Number.isFinite(lastUpdatedAt) && now - lastUpdatedAt <= 60 * 60_000);
    if (
      value.userId !== userId
      || typeof value.examId !== "string"
      || !value.examId
      || typeof value.attemptId !== "string"
      || !value.attemptId
      || typeof value.title !== "string"
      || typeof value.isPractice !== "boolean"
      || !Number.isFinite(lastUpdatedAt)
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
      phase,
      gradingJobId: typeof value.gradingJobId === "string" && value.gradingJobId
        ? value.gradingJobId
        : undefined,
      expiresAt: value.expiresAt ?? "",
      lastUpdatedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Store each attempt independently. The legacy key remains a temporary
 * last-active mirror for compatibility with older browser bundles.
 */
export function writeInProgressExam(
  storage: Pick<Storage, "setItem">,
  record: InProgressExamRecord,
) {
  const serialized = JSON.stringify(record);
  storage.setItem(inProgressExamStorageKey(record.attemptId), serialized);
  storage.setItem(IN_PROGRESS_EXAM_KEY, serialized);
}

/** Returns every active attempt owned by this user and prunes invalid entries. */
export function listOwnedInProgressExams(
  storage: EnumerableExamStorage,
  userId: string,
  now = Date.now(),
) {
  const records = new Map<string, InProgressExamRecord>();
  const keys: string[] = [IN_PROGRESS_EXAM_KEY];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(IN_PROGRESS_EXAM_KEY_PREFIX)) keys.push(key);
  }

  for (const key of new Set(keys)) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    const parsed = parseOwnedInProgressExam(raw, userId, now);
    if (!parsed) {
      storage.removeItem(key);
      continue;
    }
    if (key === IN_PROGRESS_EXAM_KEY) {
      const scopedKey = inProgressExamStorageKey(parsed.attemptId);
      if (!storage.getItem(scopedKey)) storage.setItem(scopedKey, raw);
    }
    const current = records.get(parsed.attemptId);
    if (!current || parsed.lastUpdatedAt > current.lastUpdatedAt) {
      records.set(parsed.attemptId, parsed);
    }
  }

  return [...records.values()].sort((left, right) => right.lastUpdatedAt - left.lastUpdatedAt);
}

export function removeInProgressExam(
  storage: Pick<Storage, "getItem" | "key" | "length" | "removeItem">,
  match: { attemptId?: string; examId?: string },
) {
  const keys: string[] = [IN_PROGRESS_EXAM_KEY];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(IN_PROGRESS_EXAM_KEY_PREFIX)) keys.push(key);
  }
  for (const key of new Set(keys)) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      const record = JSON.parse(raw) as Partial<InProgressExamRecord>;
      const matchesAttempt = match.attemptId && record.attemptId === match.attemptId;
      const matchesExam = match.examId && record.examId === match.examId;
      if (matchesAttempt || matchesExam) storage.removeItem(key);
    } catch {
      storage.removeItem(key);
    }
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
  removeMatchingStorageKeys(local, [IN_PROGRESS_EXAM_KEY_PREFIX, EXAM_RECOVERY_DATA_PREFIX]);
  removeMatchingStorageKeys(session, [EXAM_SESSION_PREFIX, EXAM_RECOVERY_KEY_PREFIX]);
}
