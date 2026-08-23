export type AdminQueueExamRecord = {
  id: string;
  title: string;
  endsAt: string;
  isPublished: boolean;
  resultsPublished: boolean;
  resultsVersion: number;
};

export type AdminQueueQuestionRecord = {
  id: string;
  examId: string;
};

export type AdminQueueAttemptRecord = {
  id: string;
  examId: string;
  userId: string;
  status: string;
  submittedAt: string | null;
  profile: AdminQueueProfile | null;
};

export type AdminQueueSubmissionRecord = {
  id: string;
  examId: string;
  userId: string;
  attemptId: string | null;
  questionId: string;
  editedText: string | null;
  gradingResult: unknown | null;
  gradedBy: "ai" | "admin" | null;
  submittedAt: string | null;
  category: string | null;
  profile: AdminQueueProfile | null;
};

export type AdminQueueProfile = {
  name: string | null;
  institute: string | null;
};

export type AdminQueueStudent = {
  userId: string;
  name: string;
  institute: string | null;
  attemptId: string | null;
  attemptStatus: string | null;
  submittedAt: string | null;
  expectedAnswers: number;
  answerRecords: number;
  gradedAnswers: number;
  ungradedAnswers: number;
  manualOnlyAnswers: number;
  aiEligibleSubmissionIds: string[];
};

export type AdminQueueExam = {
  id: string;
  title: string;
  endsAt: string;
  isPublished: boolean;
  resultsPublished: boolean;
  resultsVersion: number;
  examEnded: boolean;
  questionCount: number;
  studentCount: number;
  gradedAnswers: number;
  ungradedAnswers: number;
  aiEligibleAnswers: number;
  unfinalizedAttempts: number;
  allGraded: boolean;
  pendingStudents: AdminQueueStudent[];
};

type MutableStudent = {
  userId: string;
  profile: AdminQueueProfile | null;
  attemptId: string | null;
  attemptStatus: string | null;
  submittedAt: string | null;
  submissions: AdminQueueSubmissionRecord[];
};

function latestIso(left: string | null, right: string | null): string | null {
  if (!left) return right;
  if (!right) return left;
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function examPriority(exam: AdminQueueExam): number {
  if (exam.pendingStudents.length > 0) return 0;
  if (!exam.resultsPublished) return 1;
  return 2;
}

export function examHasEnded(endsAt: string, now = new Date()): boolean {
  const endsAtTime = Date.parse(endsAt);
  return Number.isFinite(endsAtTime) && endsAtTime <= now.getTime();
}

export function buildAdminGradingQueue(input: {
  exams: AdminQueueExamRecord[];
  questions: AdminQueueQuestionRecord[];
  attempts: AdminQueueAttemptRecord[];
  submissions: AdminQueueSubmissionRecord[];
  now?: Date;
}): AdminQueueExam[] {
  const now = input.now ?? new Date();
  const questionsByExam = new Map<string, AdminQueueQuestionRecord[]>();
  const attemptsByExam = new Map<string, AdminQueueAttemptRecord[]>();
  const submissionsByExam = new Map<string, AdminQueueSubmissionRecord[]>();

  for (const question of input.questions) {
    const records = questionsByExam.get(question.examId) ?? [];
    records.push(question);
    questionsByExam.set(question.examId, records);
  }
  for (const attempt of input.attempts) {
    const records = attemptsByExam.get(attempt.examId) ?? [];
    records.push(attempt);
    attemptsByExam.set(attempt.examId, records);
  }
  for (const submission of input.submissions) {
    const records = submissionsByExam.get(submission.examId) ?? [];
    records.push(submission);
    submissionsByExam.set(submission.examId, records);
  }

  return input.exams
    .map((exam): AdminQueueExam => {
      const questions = questionsByExam.get(exam.id) ?? [];
      const attempts = attemptsByExam.get(exam.id) ?? [];
      const submissions = submissionsByExam.get(exam.id) ?? [];
      const studentsByUser = new Map<string, MutableStudent>();

      for (const attempt of attempts) {
        studentsByUser.set(attempt.userId, {
          userId: attempt.userId,
          profile: attempt.profile,
          attemptId: attempt.id,
          attemptStatus: attempt.status,
          submittedAt: attempt.submittedAt,
          submissions: [],
        });
      }

      for (const submission of submissions) {
        const student = studentsByUser.get(submission.userId) ?? {
          userId: submission.userId,
          profile: submission.profile,
          attemptId: submission.attemptId,
          attemptStatus: submission.attemptId ? "finalized" : null,
          submittedAt: submission.submittedAt,
          submissions: [],
        };
        student.profile ??= submission.profile;
        student.attemptId ??= submission.attemptId;
        student.submittedAt = latestIso(student.submittedAt, submission.submittedAt);
        student.submissions.push(submission);
        studentsByUser.set(submission.userId, student);
      }

      const studentRows = [...studentsByUser.values()].map((student): AdminQueueStudent => {
        const gradedAnswers = student.submissions.filter((submission) => submission.gradingResult != null).length;
        const expectedAnswers = Math.max(questions.length, student.submissions.length);
        const aiEligibleSubmissionIds = student.submissions
          .filter((submission) =>
            submission.gradingResult == null &&
            submission.category !== "translation" &&
            Boolean(submission.editedText?.trim()),
          )
          .map((submission) => submission.id);
        const manualOnlyAnswers = student.submissions.filter((submission) =>
          submission.gradingResult == null && submission.category === "translation",
        ).length;

        return {
          userId: student.userId,
          name: student.profile?.name?.trim() || "Unknown student",
          institute: student.profile?.institute?.trim() || null,
          attemptId: student.attemptId,
          attemptStatus: student.attemptStatus,
          submittedAt: student.submittedAt,
          expectedAnswers,
          answerRecords: student.submissions.length,
          gradedAnswers,
          ungradedAnswers: Math.max(0, expectedAnswers - gradedAnswers),
          manualOnlyAnswers,
          aiEligibleSubmissionIds,
        };
      });

      const questionIds = new Set(questions.map((question) => question.id));
      const attemptsAreComplete = attempts.length > 0 && attempts.every((attempt) => {
        if (attempt.status !== "finalized") return false;
        const attemptSubmissions = submissions.filter((submission) => submission.attemptId === attempt.id);
        return questions.length > 0 && [...questionIds].every((questionId) =>
          attemptSubmissions.some((submission) =>
            submission.questionId === questionId && submission.gradingResult != null,
          ),
        );
      });
      const legacyRowsAreComplete = attempts.length === 0 && studentRows.length > 0 && questions.length > 0 &&
        studentRows.every((student) =>
          student.answerRecords >= questions.length && student.gradedAnswers >= questions.length,
        );
      const allGraded = (attemptsAreComplete || legacyRowsAreComplete) &&
        submissions.every((submission) => submission.gradingResult != null);
      const pendingStudents = studentRows
        .filter((student) => student.attemptStatus !== "finalized" || student.ungradedAnswers > 0)
        .sort((left, right) => {
          if (left.attemptStatus !== "finalized" && right.attemptStatus === "finalized") return -1;
          if (left.attemptStatus === "finalized" && right.attemptStatus !== "finalized") return 1;
          return Date.parse(right.submittedAt ?? "") - Date.parse(left.submittedAt ?? "");
        });
      const expectedTotal = studentRows.reduce((total, student) => total + student.expectedAnswers, 0);
      const gradedAnswers = studentRows.reduce((total, student) => total + student.gradedAnswers, 0);

      return {
        id: exam.id,
        title: exam.title,
        endsAt: exam.endsAt,
        isPublished: exam.isPublished,
        resultsPublished: exam.resultsPublished,
        resultsVersion: exam.resultsVersion,
        examEnded: examHasEnded(exam.endsAt, now),
        questionCount: questions.length,
        studentCount: studentRows.length,
        gradedAnswers,
        ungradedAnswers: Math.max(0, expectedTotal - gradedAnswers),
        aiEligibleAnswers: studentRows.reduce(
          (total, student) => total + student.aiEligibleSubmissionIds.length,
          0,
        ),
        unfinalizedAttempts: attempts.filter((attempt) => attempt.status !== "finalized").length,
        allGraded,
        pendingStudents,
      };
    })
    .sort((left, right) => {
      const priority = examPriority(left) - examPriority(right);
      if (priority !== 0) return priority;
      return Date.parse(right.endsAt) - Date.parse(left.endsAt);
    });
}
