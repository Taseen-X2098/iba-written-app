import { clearExamBrowserStateOnSignOut, parseOwnedInProgressExam } from "./in-progress-exam";

const NOW = Date.parse("2026-08-29T12:00:00.000Z");

function record(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    userId: "user-1",
    examId: "exam-1",
    attemptId: "attempt-1",
    title: "Magnus Standard Exam",
    isPractice: false,
    expiresAt: "2026-08-29T12:10:00.000Z",
    lastUpdatedAt: NOW,
    ...overrides,
  });
}

describe("owned in-progress exam records", () => {
  it("returns an active record only to its owner", () => {
    expect(parseOwnedInProgressExam(record(), "user-1", NOW)?.title).toBe("Magnus Standard Exam");
    expect(parseOwnedInProgressExam(record(), "user-2", NOW)).toBeNull();
  });

  it("rejects legacy unscoped and expired records", () => {
    expect(parseOwnedInProgressExam(record({ userId: undefined }), "user-1", NOW)).toBeNull();
    expect(parseOwnedInProgressExam(record({ expiresAt: "2026-08-29T11:50:00.000Z" }), "user-1", NOW)).toBeNull();
  });
});

function memoryStorage(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    removeItem(key: string) { values.delete(key); },
    has(key: string) { return values.has(key); },
  };
}

it("clears exam metadata, writer sessions, and recovery material on sign-out", () => {
  const local = memoryStorage({
    in_progress_exam: record(),
    "attempt-recovery-data:attempt-1": "ciphertext",
    unrelated: "keep",
  });
  const session = memoryStorage({
    "exam-attempt-session:user-1:exam-1:official": "secret",
    "attempt-recovery-key:attempt-1": "key",
    unrelated: "keep",
  });
  clearExamBrowserStateOnSignOut(local, session);
  expect(local.has("in_progress_exam")).toBe(false);
  expect(local.has("attempt-recovery-data:attempt-1")).toBe(false);
  expect(session.has("exam-attempt-session:user-1:exam-1:official")).toBe(false);
  expect(session.has("attempt-recovery-key:attempt-1")).toBe(false);
  expect(local.has("unrelated")).toBe(true);
  expect(session.has("unrelated")).toBe(true);
});
