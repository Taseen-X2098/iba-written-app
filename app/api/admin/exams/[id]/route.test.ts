import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { DELETE } from "./route";

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/auth", () => ({ requireAdminUser: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/notifications/exam-publication", () => ({
  deliverExamPublicationNotifications: jest.fn(),
}));

const examId = "40000000-0000-4000-8000-000000000004";

function deleteRequest() {
  return new NextRequest(`http://localhost/api/admin/exams/${examId}`, {
    method: "DELETE",
  });
}

describe("admin exam deletion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(requireAdminUser).mockResolvedValue({ id: "admin-id" } as never);
  });

  it("atomically deletes the exam and returns its results as a safe CSV", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        exam_id: examId,
        exam_title: "September Weekly Exam",
        storage_paths: ["attempt-1/question-1/page-1.jpg"],
        results: [{
          user_id: "41000000-0000-4000-8000-000000000005",
          student_name: "=HYPERLINK(\"https://example.test\")",
          institute: "College, \"North\"",
          total_score: 8.5,
          max_score: 10,
          rank: 1,
          created_at: "2026-09-06T12:00:00+00:00",
        }],
      },
      error: null,
    });
    const remove = jest.fn().mockResolvedValue({ error: null });
    const from = jest.fn().mockReturnValue({ remove });
    jest.mocked(createAdminClient).mockResolvedValue({ rpc, storage: { from } } as never);

    const response = await DELETE(deleteRequest(), { params: Promise.resolve({ id: examId }) });
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toContain("september-weekly-exam-results.csv");
    expect(csv).toContain("85.00%");
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('College, ""North""');
    expect(rpc).toHaveBeenCalledWith("delete_exam_with_results", { p_exam_id: examId });
    expect(from).toHaveBeenCalledWith("translation-answer-images");
    expect(remove).toHaveBeenCalledWith(["attempt-1/question-1/page-1.jpg"]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/exams");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/grading");
    expect(revalidatePath).toHaveBeenCalledWith("/exams");
  });

  it("returns not found when the exam no longer exists", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: "EXAM_NOT_FOUND" },
    });
    jest.mocked(createAdminClient).mockResolvedValue({ rpc } as never);

    const response = await DELETE(deleteRequest(), { params: Promise.resolve({ id: examId }) });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      code: "EXAM_NOT_FOUND",
      error: "Exam not found",
    });
  });
});
