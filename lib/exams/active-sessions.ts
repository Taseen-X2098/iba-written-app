import {
  isInProgressExamStorageKey,
  listOwnedInProgressExams,
  type InProgressExamPhase,
} from "./in-progress-exam";
import {
  isStandaloneSessionStorageKey,
  listStandaloneSessions,
} from "./standalone-session";

export type ActiveSessionLink = {
  key: string;
  type: "test" | "exam";
  id: string;
  title: string;
  isPractice?: boolean;
  phase?: InProgressExamPhase;
  gradingJobId?: string;
  timedOut?: boolean;
  lastUpdatedAt: number;
};

type ActiveSessionStorage = Pick<Storage, "getItem" | "setItem" | "key" | "length" | "removeItem">;

export function listActiveSessionLinks(
  storage: ActiveSessionStorage,
  userId: string,
  now = Date.now(),
): ActiveSessionLink[] {
  const exams: ActiveSessionLink[] = listOwnedInProgressExams(storage, userId, now).map((record) => ({
    key: `exam:${record.attemptId}`,
    type: "exam",
    id: record.examId,
    title: record.title,
    isPractice: record.isPractice,
    phase: record.phase,
    gradingJobId: record.gradingJobId,
    timedOut: record.isPractice && Date.parse(record.expiresAt) <= now,
    lastUpdatedAt: record.lastUpdatedAt,
  }));
  const tests: ActiveSessionLink[] = listStandaloneSessions(storage, now).map((record) => ({
    key: `test:${record.questionId}`,
    type: "test",
    id: record.questionId,
    title: record.prompt,
    lastUpdatedAt: record.lastUpdatedAt,
  }));
  return [...exams, ...tests].sort((left, right) => right.lastUpdatedAt - left.lastUpdatedAt);
}

export function isActiveSessionStorageKey(key: string | null) {
  return isStandaloneSessionStorageKey(key) || isInProgressExamStorageKey(key);
}
