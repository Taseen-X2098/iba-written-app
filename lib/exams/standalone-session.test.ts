import {
  clearStandaloneSessions,
  isOwnedStandaloneSession,
  listStandaloneSessions,
  parseStandaloneSession,
  readStandaloneSession,
  removeStandaloneSession,
  STANDALONE_SESSION_KEY,
  STANDALONE_SESSION_TTL_MS,
  standaloneSessionStorageKey,
  writeStandaloneSession,
} from "./standalone-session";

const now = 1_787_491_589_862;

function record(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    sessionId: "session-a",
    questionId: "question-a",
    prompt: "Should apps be easier to use?",
    category: "argumentative_essay",
    marks: 10,
    secondsElapsed: 663,
    state: "running",
    lastUpdatedAt: now - 15_000,
    ...overrides,
  });
}

describe("standalone session persistence", () => {
  it("accepts a current session and rejects expired or malformed records", () => {
    expect(parseStandaloneSession(record(), now)?.questionId).toBe("question-a");
    expect(parseStandaloneSession(record(), now)?.resumeState).toBe("running");
    expect(parseStandaloneSession(record({ state: "paused", resumeState: "editing" }), now)?.resumeState).toBe("editing");
    expect(parseStandaloneSession(record({ lastUpdatedAt: now - STANDALONE_SESSION_TTL_MS - 1 }), now)).toBeNull();
    expect(parseStandaloneSession(record({ state: "feedback" }), now)).toBeNull();
    expect(parseStandaloneSession("not-json", now)).toBeNull();
  });

  it("prevents an old mounted page from owning a replacement session", () => {
    const active = parseStandaloneSession(record(), now)!;
    expect(isOwnedStandaloneSession(active, "question-a", "session-a")).toBe(true);
    expect(isOwnedStandaloneSession(active, "question-a", "session-b")).toBe(false);
    expect(isOwnedStandaloneSession(active, "question-b", "session-a")).toBe(false);
  });

  it("keeps old records without an id recoverable for one migration write", () => {
    const legacy = parseStandaloneSession(record({ sessionId: undefined }), now)!;
    expect(legacy.sessionId).toBeNull();
    expect(isOwnedStandaloneSession(legacy, "question-a", "new-session-id")).toBe(true);
  });

  it("migrates the legacy singleton into a scoped session key when listed", () => {
    const values = new Map([[STANDALONE_SESSION_KEY, record()]]);
    const storage = {
      get length() { return values.size; },
      key(index: number) { return [...values.keys()][index] ?? null; },
      getItem(key: string) { return values.get(key) ?? null; },
      setItem(key: string, value: string) { values.set(key, value); },
      removeItem(key: string) { values.delete(key); },
    };

    expect(listStandaloneSessions(storage, now)).toHaveLength(1);
    expect(values.has(standaloneSessionStorageKey("question-a"))).toBe(true);
  });

  it("hard-deletes the active record for both cancellation and completed submission", () => {
    const values = new Map([[STANDALONE_SESSION_KEY, record()]]);
  const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
    };

    // Both terminal UI paths call this same idempotent primitive.
    removeStandaloneSession(storage, "question-a");
    removeStandaloneSession(storage, "question-a");

    expect(values.has(STANDALONE_SESSION_KEY)).toBe(false);
  });

  it("stores, lists, resumes, and removes multiple question sessions independently", () => {
    const values = new Map<string, string>();
    const storage = {
      get length() { return values.size; },
      key(index: number) { return [...values.keys()][index] ?? null; },
      getItem(key: string) { return values.get(key) ?? null; },
      setItem(key: string, value: string) { values.set(key, value); },
      removeItem(key: string) { values.delete(key); },
    };
    const first = parseStandaloneSession(record({ questionId: "question-a", lastUpdatedAt: now - 1_000 }), now)!;
    const second = parseStandaloneSession(record({
      questionId: "question-b",
      sessionId: "session-b",
      lastUpdatedAt: now,
    }), now)!;

    writeStandaloneSession(storage, first);
    writeStandaloneSession(storage, second);

    expect(listStandaloneSessions(storage, now).map((session) => session.questionId)).toEqual([
      "question-b",
      "question-a",
    ]);
    expect(readStandaloneSession(storage, "question-a", now)?.sessionId).toBe("session-a");
    expect(values.has(standaloneSessionStorageKey("question-a"))).toBe(true);
    expect(values.has(standaloneSessionStorageKey("question-b"))).toBe(true);

    removeStandaloneSession(storage, "question-a");
    expect(readStandaloneSession(storage, "question-a", now)).toBeNull();
    expect(readStandaloneSession(storage, "question-b", now)?.sessionId).toBe("session-b");

    clearStandaloneSessions(storage);
    expect(listStandaloneSessions(storage, now)).toEqual([]);
  });
});
