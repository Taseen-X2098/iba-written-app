import {
  buildAdminGradingQueue,
  type AdminQueueAttemptRecord,
  type AdminQueueExamRecord,
  type AdminQueueSubmissionRecord,
} from "@/lib/grading/admin-queue";

const exam: AdminQueueExamRecord = {
  id: "exam-1",
  title: "Weekly Exam",
  endsAt: "2026-08-20T12:00:00.000Z",
  isPublished: true,
  resultsPublished: false,
  resultsVersion: 0,
};

const attempt: AdminQueueAttemptRecord = {
  id: "attempt-1",
  examId: exam.id,
  userId: "user-1",
  status: "finalized",
  submittedAt: "2026-08-20T11:00:00.000Z",
  profile: { name: "Student One", institute: "IBA" },
};

function submission(overrides: Partial<AdminQueueSubmissionRecord>): AdminQueueSubmissionRecord {
  return {
    id: "submission-1",
    examId: exam.id,
    userId: attempt.userId,
    attemptId: attempt.id,
    questionId: "question-1",
    editedText: "A complete answer",
    gradingResult: null,
    gradedBy: null,
    submittedAt: attempt.submittedAt,
    category: "essay",
    profile: attempt.profile,
    ...overrides,
  };
}

describe("buildAdminGradingQueue", () => {
  it("separates AI-ready and manual-only answers inside an exam queue", () => {
    const queue = buildAdminGradingQueue({
      exams: [exam],
      questions: [
        { id: "question-1", examId: exam.id },
        { id: "question-2", examId: exam.id },
      ],
      attempts: [attempt],
      submissions: [
        submission({}),
        submission({ id: "submission-2", questionId: "question-2", category: "translation" }),
      ],
      now: new Date("2026-08-24T00:00:00.000Z"),
    });

    expect(queue[0]).toMatchObject({
      ungradedAnswers: 2,
      aiEligibleAnswers: 1,
      allGraded: false,
      unfinalizedAttempts: 0,
    });
    expect(queue[0].pendingStudents[0]).toMatchObject({
      name: "Student One",
      manualOnlyAnswers: 1,
      aiEligibleSubmissionIds: ["submission-1"],
    });
  });

  it("marks an ended exam ready only when every official answer has a final grade", () => {
    const grade = { internal: { total: 8, max: 10 } };
    const queue = buildAdminGradingQueue({
      exams: [exam],
      questions: [
        { id: "question-1", examId: exam.id },
        { id: "question-2", examId: exam.id },
      ],
      attempts: [attempt],
      submissions: [
        submission({ gradingResult: grade, gradedBy: "ai" }),
        submission({ id: "submission-2", questionId: "question-2", gradingResult: grade, gradedBy: "admin" }),
      ],
      now: new Date("2026-08-24T00:00:00.000Z"),
    });

    expect(queue[0]).toMatchObject({
      allGraded: true,
      examEnded: true,
      ungradedAnswers: 0,
      gradedAnswers: 2,
      pendingStudents: [],
    });
  });

  it("keeps an unfinished official attempt visible even before answer rows exist", () => {
    const queue = buildAdminGradingQueue({
      exams: [exam],
      questions: [{ id: "question-1", examId: exam.id }],
      attempts: [{ ...attempt, status: "active", submittedAt: null }],
      submissions: [],
      now: new Date("2026-08-24T00:00:00.000Z"),
    });

    expect(queue[0]).toMatchObject({
      allGraded: false,
      unfinalizedAttempts: 1,
      ungradedAnswers: 1,
    });
    expect(queue[0].pendingStudents[0]).toMatchObject({
      attemptStatus: "active",
      expectedAnswers: 1,
      answerRecords: 0,
    });
  });

  it("never offers existing grades or blank answers to whole-submission AI grading", () => {
    const grade = { internal: { total: 8, max: 10 } };
    const queue = buildAdminGradingQueue({
      exams: [exam],
      questions: [
        { id: "question-1", examId: exam.id },
        { id: "question-2", examId: exam.id },
      ],
      attempts: [attempt],
      submissions: [
        submission({ gradingResult: grade, gradedBy: "ai" }),
        submission({ id: "submission-2", questionId: "question-2", editedText: "   " }),
      ],
      now: new Date("2026-08-24T00:00:00.000Z"),
    });

    expect(queue[0].pendingStudents[0].aiEligibleSubmissionIds).toEqual([]);
  });
});
