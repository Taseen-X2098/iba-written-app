export const STANDALONE_SESSION_KEY = "in_progress_test";
export const STANDALONE_SESSION_KEY_PREFIX = `${STANDALONE_SESSION_KEY}:`;
export const STANDALONE_SESSION_UPDATED_EVENT = "in_progress_test_updated";
export const STANDALONE_SESSION_TTL_MS = 60 * 60 * 1_000;

export type StandaloneSessionState = "running" | "paused" | "editing";
export type StandaloneResumeState = "running" | "editing";

export interface StandaloneSessionRecord {
  sessionId: string | null;
  questionId: string;
  prompt: string;
  category: string;
  marks: number;
  secondsElapsed: number;
  state: StandaloneSessionState;
  resumeState: StandaloneResumeState;
  lastUpdatedAt: number;
}

const SESSION_STATES: ReadonlySet<string> = new Set(["running", "paused", "editing"]);

type EnumerableSessionStorage = Pick<Storage, "getItem" | "setItem" | "key" | "length" | "removeItem">;

export function standaloneSessionStorageKey(questionId: string) {
  return `${STANDALONE_SESSION_KEY_PREFIX}${encodeURIComponent(questionId)}`;
}

export function isStandaloneSessionStorageKey(key: string | null) {
  return key === null
    || key === STANDALONE_SESSION_KEY
    || key.startsWith(STANDALONE_SESSION_KEY_PREFIX);
}

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
      resumeState: value.resumeState === "editing" ? "editing" : "running",
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

/** Reads the scoped record first and falls back to the pre-migration singleton. */
export function readStandaloneSession(
  storage: Pick<Storage, "getItem">,
  questionId: string,
  now = Date.now(),
) {
  const scoped = parseStandaloneSession(storage.getItem(standaloneSessionStorageKey(questionId)), now);
  if (scoped?.questionId === questionId) return scoped;
  const legacy = parseStandaloneSession(storage.getItem(STANDALONE_SESSION_KEY), now);
  return legacy?.questionId === questionId ? legacy : null;
}

/**
 * Store a session under its own question key. The legacy key remains a
 * temporary last-active mirror so older browser bundles can still resume it.
 */
export function writeStandaloneSession(
  storage: Pick<Storage, "setItem">,
  record: StandaloneSessionRecord,
) {
  const serialized = JSON.stringify(record);
  storage.setItem(standaloneSessionStorageKey(record.questionId), serialized);
  storage.setItem(STANDALONE_SESSION_KEY, serialized);
}

/** Returns every valid session and removes expired or malformed index entries. */
export function listStandaloneSessions(
  storage: EnumerableSessionStorage,
  now = Date.now(),
) {
  const records = new Map<string, StandaloneSessionRecord>();
  const keys: string[] = [STANDALONE_SESSION_KEY];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(STANDALONE_SESSION_KEY_PREFIX)) keys.push(key);
  }

  for (const key of new Set(keys)) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    const parsed = parseStandaloneSession(raw, now);
    if (!parsed) {
      storage.removeItem(key);
      continue;
    }
    if (key === STANDALONE_SESSION_KEY) {
      const scopedKey = standaloneSessionStorageKey(parsed.questionId);
      if (!storage.getItem(scopedKey)) storage.setItem(scopedKey, raw);
    }
    const current = records.get(parsed.questionId);
    if (!current || parsed.lastUpdatedAt > current.lastUpdatedAt) {
      records.set(parsed.questionId, parsed);
    }
  }

  return [...records.values()].sort((left, right) => right.lastUpdatedAt - left.lastUpdatedAt);
}

export function removeStandaloneSession(
  storage: Pick<Storage, "getItem" | "removeItem">,
  questionId: string,
) {
  storage.removeItem(standaloneSessionStorageKey(questionId));
  const legacy = parseStandaloneSession(storage.getItem(STANDALONE_SESSION_KEY));
  if (!legacy || legacy.questionId === questionId) storage.removeItem(STANDALONE_SESSION_KEY);
}

export function clearStandaloneSessions(
  storage: Pick<Storage, "key" | "length" | "removeItem">,
) {
  const keys: string[] = [STANDALONE_SESSION_KEY];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(STANDALONE_SESSION_KEY_PREFIX)) keys.push(key);
  }
  for (const key of new Set(keys)) storage.removeItem(key);
}
