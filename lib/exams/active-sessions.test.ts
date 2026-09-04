import { listActiveSessionLinks } from "./active-sessions";
import { parseOwnedInProgressExam, writeInProgressExam } from "./in-progress-exam";
import { parseStandaloneSession, writeStandaloneSession } from "./standalone-session";

const NOW = Date.parse("2026-09-05T12:00:00.000Z");

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
  };
}

it("combines every active standalone test and exam into one newest-first list", () => {
  const storage = memoryStorage();
  const testRecord = (questionId: string, lastUpdatedAt: number) => parseStandaloneSession(JSON.stringify({
    sessionId: `session-${questionId}`,
    questionId,
    prompt: `Prompt ${questionId}`,
    category: "argumentative_essay",
    marks: 10,
    secondsElapsed: 30,
    state: "running",
    lastUpdatedAt,
  }), NOW)!;
  const examRecord = parseOwnedInProgressExam(JSON.stringify({
    userId: "student-1",
    examId: "exam-1",
    attemptId: "attempt-1",
    title: "Weekly Exam",
    isPractice: false,
    expiresAt: new Date(NOW + 60_000).toISOString(),
    lastUpdatedAt: NOW - 1_000,
  }), "student-1", NOW)!;

  writeStandaloneSession(storage, testRecord("question-1", NOW - 3_000));
  writeStandaloneSession(storage, testRecord("question-2", NOW - 2_000));
  writeInProgressExam(storage, examRecord);

  const sessions = listActiveSessionLinks(storage, "student-1", NOW);

  expect(sessions).toHaveLength(3);
  expect(sessions.map((session) => session.key)).toEqual([
    "exam:attempt-1",
    "test:question-2",
    "test:question-1",
  ]);
});
