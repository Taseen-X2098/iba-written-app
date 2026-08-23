export const STANDALONE_SESSION_KEY = "in_progress_test";
export const STANDALONE_SESSION_UPDATED_EVENT = "in_progress_test_updated";
export const STANDALONE_SESSION_TTL_MS = 60 * 60 * 1_000;

export type StandaloneSessionState = "running" | "paused" | "editing";

export interface StandaloneSessionRecord {
  sessionId: string | null;
  questionId: string;
  prompt: string;
  category: string;
  marks: number;
  secondsElapsed: number;
  state: StandaloneSessionState;
  lastUpdatedAt: number;
}

const SESSION_STATES: ReadonlySet<string> = new Set(["running", "paused", "editing"]);

export function parseStandaloneSession(
  raw: string | null,
  now = Date.now(),
): StandaloneSessionRecord | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const lastUpdatedAt = Number(value.lastUpdatedAt);
    const secondsElapsed = Number(value.secondsElapsed);
    const marks = Number(value.marks);
    const age = now - lastUpdatedAt;
    if (
      typeof value.questionId !== "string"
      || !value.questionId
      || typeof value.prompt !== "string"
      || typeof value.category !== "string"
      || !SESSION_STATES.has(String(value.state))
      || !Number.isFinite(lastUpdatedAt)
      || !Number.isFinite(secondsElapsed)
      || secondsElapsed < 0
      || !Number.isFinite(marks)
      || age < -60_000
      || age > STANDALONE_SESSION_TTL_MS
    ) {
      return null;
    }
    return {
      sessionId: typeof value.sessionId === "string" && value.sessionId
        ? value.sessionId
        : null,
      questionId: value.questionId,
      prompt: value.prompt,
      category: value.category,
      marks,
      secondsElapsed: Math.floor(secondsElapsed),
      state: value.state as StandaloneSessionState,
      lastUpdatedAt,
    };
  } catch {
    return null;
  }
}

export function isOwnedStandaloneSession(
  record: StandaloneSessionRecord,
  questionId: string,
  sessionId: string | null,
) {
  return record.questionId === questionId
    && (!record.sessionId || !sessionId || record.sessionId === sessionId);
}

export function removeStandaloneSession(storage: Pick<Storage, "removeItem">) {
  storage.removeItem(STANDALONE_SESSION_KEY);
}
