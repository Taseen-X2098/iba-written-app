import { createAdminClient } from "@/lib/supabase/admin";
import { createOfficialGradingJob } from "./jobs";

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(),
}));

describe("official grading job creation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("marks the job failed when its item batch cannot be inserted", async () => {
    const itemError = {
      code: "23505",
      message: "duplicate key value violates unique constraint",
      details: "",
      hint: "",
    };
    const submissions = [
      {
        id: "submission-1",
        question_id: "exam-question-1",
        edited_text: "First answer",
        grading_result: null,
        graded_by: null,
        questions: { questions: { category: "essay" } },
      },
      {
        id: "submission-2",
        question_id: "exam-question-1",
        edited_text: "Second answer",
        grading_result: null,
        graded_by: null,
        questions: { questions: { category: "essay" } },
      },
    ];

    const submissionQuery: Record<string, jest.Mock> = {};
    submissionQuery.select = jest.fn(() => submissionQuery);
    submissionQuery.eq = jest.fn(() => submissionQuery);
    submissionQuery.in = jest.fn(async () => ({ data: submissions, error: null }));

    const jobSingle = jest.fn(async () => ({
      data: { id: "job-1", status: "queued", total_items: 2 },
      error: null,
    }));
    const jobSelect = jest.fn(() => ({ single: jobSingle }));
    const jobInsert = jest.fn(() => ({ select: jobSelect }));
    const failedJobEq = jest.fn(async () => ({ error: null }));
    const jobUpdate = jest.fn(() => ({ eq: failedJobEq }));
    const itemInsert = jest.fn(async () => ({ data: null, error: itemError }));
    const from = jest.fn((table: string) => {
      if (table === "exam_submissions") return submissionQuery;
      if (table === "grading_jobs") {
        return { insert: jobInsert, update: jobUpdate };
      }
      if (table === "grading_job_items") return { insert: itemInsert };
      throw new Error(`Unexpected table: ${table}`);
    });
    jest.mocked(createAdminClient).mockResolvedValue({ from } as never);

    await expect(createOfficialGradingJob({
      examId: "exam-1",
      requestedBy: "admin-1",
      submissionIds: ["submission-1", "submission-2"],
      scope: "selected",
      allowRegrade: false,
    })).rejects.toBe(itemError);

    expect(itemInsert).toHaveBeenCalledWith([
      {
        job_id: "job-1",
        exam_question_id: "exam-question-1",
        exam_submission_id: "submission-1",
      },
      {
        job_id: "job-1",
        exam_question_id: "exam-question-1",
        exam_submission_id: "submission-2",
      },
    ]);
    expect(jobUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: "failed",
      failed_items: 2,
      last_error: itemError.message,
    }));
    expect(failedJobEq).toHaveBeenCalledWith("id", "job-1");
  });
});
