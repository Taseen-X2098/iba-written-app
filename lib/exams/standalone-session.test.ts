import {
  isOwnedStandaloneSession,
  parseStandaloneSession,
  removeStandaloneSession,
  STANDALONE_SESSION_KEY,
  STANDALONE_SESSION_TTL_MS,
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

  it("hard-deletes the active record for both cancellation and completed submission", () => {
    const values = new Map([[STANDALONE_SESSION_KEY, record()]]);
    const storage = {
      removeItem: (key: string) => values.delete(key),
    };

    // Both terminal UI paths call this same idempotent primitive.
    removeStandaloneSession(storage);
    removeStandaloneSession(storage);

    expect(values.has(STANDALONE_SESSION_KEY)).toBe(false);
  });
});
