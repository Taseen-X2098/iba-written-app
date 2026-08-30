import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { POST } from "./route";

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/auth", () => ({ requireAdminUser: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createAdminClient: jest.fn() }));

const examId = "40000000-0000-4000-8000-000000000004";

function request() {
  return new NextRequest("http://localhost/api/admin/exams/publish-results", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ examId }),
  });
}

describe("publish-results route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(requireAdminUser).mockResolvedValue({ id: "admin-id" } as never);
  });

  it("uses the atomic single-publication RPC", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: 1, error: null });
    jest.mocked(createAdminClient).mockResolvedValue({ rpc } as never);

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, resultsVersion: 1 });
    expect(rpc).toHaveBeenCalledWith("publish_exam_results_once", { p_exam_id: examId });
    expect(revalidatePath).toHaveBeenCalledWith(`/exams/${examId}/results`);
    expect(revalidatePath).toHaveBeenCalledWith("/exams");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/exams");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/grading");
  });

  it("returns a conflict when results are already published", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: null,
      error: { message: "RESULTS_ALREADY_PUBLISHED" },
    });
    jest.mocked(createAdminClient).mockResolvedValue({ rpc } as never);

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "CONFLICT",
      error: "Results have already been published. Extend the deadline to reopen publication.",
    });
  });
});
