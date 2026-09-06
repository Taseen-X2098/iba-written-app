import { NextRequest } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { deliverExamPublicationNotifications } from "@/lib/notifications/exam-publication";
import { POST } from "./route";

jest.mock("@/lib/auth", () => ({ requireAdminUser: jest.fn() }));
jest.mock("@/lib/supabase/server", () => ({ createAdminClient: jest.fn() }));
jest.mock("@/lib/notifications/exam-publication", () => ({
  deliverExamPublicationNotifications: jest.fn(),
}));

describe("admin exam creation", () => {
  it("persists the free-for-all flag in the atomic definition RPC", async () => {
    const examId = "45000000-0000-4000-8000-000000000001";
    const rpc = jest.fn().mockResolvedValue({ data: examId, error: null });
    jest.mocked(requireAdminUser).mockResolvedValue({ id: "admin-1" } as never);
    jest.mocked(createAdminClient).mockResolvedValue({ rpc } as never);
    jest.mocked(deliverExamPublicationNotifications).mockResolvedValue({} as never);

    const response = await POST(new NextRequest("http://localhost/api/admin/exams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Open Assessment",
        description: "Available to every signed-in student.",
        timeLimitMinutes: 30,
        startsAt: "2026-09-06T10:00:00.000Z",
        endsAt: "2026-09-06T11:00:00.000Z",
        isPublished: true,
        isMagnusOnly: false,
        isFree: true,
        questions: [{
          questionId: "44000000-0000-4000-8000-000000000001",
          orderIndex: 0,
          marks: 10,
        }],
      }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, examId });
    expect(rpc).toHaveBeenCalledWith("create_exam_definition", expect.objectContaining({
      p_created_by: "admin-1",
      p_is_published: true,
      p_is_magnus_only: false,
      p_is_free: true,
    }));
    expect(deliverExamPublicationNotifications).toHaveBeenCalledTimes(1);
  });
});
