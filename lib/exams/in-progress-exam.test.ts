import {
  clearExamBrowserStateOnSignOut,
  inProgressExamStorageKey,
  listOwnedInProgressExams,
  parseOwnedInProgressExam,
  removeInProgressExam,
  writeInProgressExam,
} from "./in-progress-exam";

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
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
    has(key: string) { return values.has(key); },
  };
}

it("migrates the legacy singleton into an attempt-scoped key when listed", () => {
  const storage = memoryStorage({ in_progress_exam: record() });

  expect(listOwnedInProgressExams(storage, "user-1", NOW)).toHaveLength(1);
  expect(storage.has(inProgressExamStorageKey("attempt-1"))).toBe(true);
});

it("clears exam metadata, writer sessions, and recovery material on sign-out", () => {
  const local = memoryStorage({
    in_progress_exam: record(),
    [inProgressExamStorageKey("attempt-1")]: record(),
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
  expect(local.has(inProgressExamStorageKey("attempt-1"))).toBe(false);
  expect(local.has("attempt-recovery-data:attempt-1")).toBe(false);
  expect(session.has("exam-attempt-session:user-1:exam-1:official")).toBe(false);
  expect(session.has("attempt-recovery-key:attempt-1")).toBe(false);
  expect(local.has("unrelated")).toBe(true);
  expect(session.has("unrelated")).toBe(true);
});

it("stores and removes multiple active exam attempts independently", () => {
  const storage = memoryStorage({});
  const first = parseOwnedInProgressExam(record(), "user-1", NOW)!;
  const second = parseOwnedInProgressExam(record({
    examId: "exam-2",
    attemptId: "attempt-2",
    title: "Weekly Exam",
    lastUpdatedAt: NOW + 1,
  }), "user-1", NOW)!;

  writeInProgressExam(storage, first);
  writeInProgressExam(storage, second);

  expect(listOwnedInProgressExams(storage, "user-1", NOW).map((exam) => exam.attemptId)).toEqual([
    "attempt-2",
    "attempt-1",
  ]);
  expect(storage.has(inProgressExamStorageKey("attempt-1"))).toBe(true);
  expect(storage.has(inProgressExamStorageKey("attempt-2"))).toBe(true);

  removeInProgressExam(storage, { attemptId: "attempt-1" });
  expect(listOwnedInProgressExams(storage, "user-1", NOW).map((exam) => exam.attemptId)).toEqual([
    "attempt-2",
  ]);
});
